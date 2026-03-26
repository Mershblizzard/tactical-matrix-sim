from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
from core_engine import Battlefield

app = FastAPI()

@app.websocket("/radar")
async def radar_stream(websocket: WebSocket):
    await websocket.accept()
    
    arena = Battlefield(15, 15)

    def setup_walls():
        arena.world_obstacles.clear()
        arena.known_obstacles.clear()
        for obs in [(3, 3), (3, 4), (3, 5), (4, 5), (5, 5), (10, 8), (10, 9), (10, 10), (11, 10), (12, 10)]:
            arena.add_obstacle(*obs)

    setup_walls()

    sim_state = {
        "pos": (0, 0),
        "target": (14, 14),
        "speed": 1.0,       
        "is_running": False, 
        "reset_flag": False,
        "manual_action": None,
        "battery": 100.0
    }

    async def listen_for_commands():
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "obstacle":
                    arena.add_obstacle(data["x"], data["y"])
                elif data.get("type") == "command":
                    cmd = data["action"]
                    val = data.get("value")
                    
                    if cmd == "start_mission": sim_state["is_running"] = True
                    elif cmd == "pause_mission": sim_state["is_running"] = False
                    elif cmd == "reset_drone": 
                        sim_state["reset_flag"] = True
                        arena.known_obstacles.clear()
                    elif cmd == "rtb":
                        sim_state["target"] = (0, 0)
                        arena.target = (0, 0)
                        sim_state["is_running"] = True 
                    elif cmd == "set_speed": sim_state["speed"] = float(val)
                    elif cmd == "clear_walls": setup_walls() 
                    elif cmd == "manual_shoot": sim_state["manual_action"] = "shoot"
                    elif cmd == "manual_jump": sim_state["manual_action"] = "jump"
        except WebSocketDisconnect:
            pass

    listener_task = asyncio.create_task(listen_for_commands())

    try:
        while True:
            # 1. RESET OVERRIDE
            if sim_state["reset_flag"]:
                sim_state["pos"] = (0, 0)
                sim_state["target"] = (14, 14)
                arena.target = (14, 14)
                sim_state["battery"] = 100.0 
                sim_state["is_running"] = False
                sim_state["reset_flag"] = False
                await websocket.send_json({"status": "DRONE RESET.", "drone_position": (0,0), "altitude": 0, "battery": 100.0, "clear_memory": True})
                await asyncio.sleep(0.5)
                continue

            if not sim_state["is_running"]:
                await websocket.send_json({"status": "SYSTEM IDLE. AWAITING COMMAND.", "battery": sim_state["battery"]})
                await asyncio.sleep(0.5)
                continue

            # 2. BATTERY DEAD
            if sim_state["battery"] <= 0:
                sim_state["battery"] = 0
                await websocket.send_json({"status": "FATAL: CORE DEPLETED. DRONE DOWN.", "battery": 0})
                sim_state["is_running"] = False
                continue

  # 3. RECHARGING AT BASE (0,0)
            if sim_state["pos"] == (0,0) and sim_state["battery"] < 100.0:
                sim_state["battery"] = min(100.0, sim_state["battery"] + 20.0) 
                await websocket.send_json({"status": "BASE DOCK: RECHARGING...", "battery": sim_state["battery"]})
                await asyncio.sleep(0.5 / sim_state["speed"])
                
                if sim_state["battery"] >= 100.0:
                    sim_state["is_running"] = False # Hard stop only at home base
                    await websocket.send_json({"status": "CORE FULL. AWAITING ORDERS.", "battery": sim_state["battery"]})
                continue

            # 3.5. MIDFIELD GOLD RELAY (7,7) - INSTANT HEAL & AUTO-RESUME
            if sim_state["pos"] == (7, 7):
                if sim_state["battery"] < 100.0:
                    sim_state["battery"] = min(100.0, sim_state["battery"] + 50.0)
                    await websocket.send_json({"status": "RELAY SIPHON: +50% POWER", "battery": sim_state["battery"]})
                    await asyncio.sleep(0.3 / sim_state["speed"]) # Tiny pause to visually show power grab
                
                # If it diverted here because of low battery, point it back to the Target immediately!
                if arena.target == (7, 7):
                    arena.target = (14, 14)
                    sim_state["target"] = (14, 14)
                    await websocket.send_json({"status": "POWER SECURED. RESUMING MISSION.", "battery": sim_state["battery"]})
                # Notice there is NO "continue" or "is_running = False" here, so it keeps flying instantly!
            
            # 4. AUTONOMOUS SURVIVAL (30% THRESHOLD -> CLOSEST PAD)
            if sim_state["battery"] < 30.0 and arena.target not in [(0,0), (7,7)]:
                cx, cy = sim_state["pos"]
                dist_to_base = cx + cy 
                dist_to_relay = abs(cx - 7) + abs(cy - 7)

                # Route to nearest charger
                if dist_to_relay < dist_to_base:
                    arena.target = (7, 7)
                    sim_state["target"] = (7, 7)
                    pad_target = "RELAY"
                else:
                    arena.target = (0, 0)
                    sim_state["target"] = (0, 0)
                    pad_target = "BASE"

                await websocket.send_json({"status": f"CRITICAL <30%. DIVERTING TO {pad_target}", "battery": sim_state["battery"]})
                await asyncio.sleep(1.0 / sim_state["speed"])

            arena.start = sim_state["pos"]

            # --- KINETIC BATTERY DRAIN MULTIPLIER ---
            # Driving the motors faster burns more battery. Driving slow conserves it.
            k_mult = sim_state["speed"] 
            cost_scan = 0.1 * k_mult
            cost_move = 0.8 * k_mult
            cost_shoot = 4.0 * k_mult
            cost_vault = 8.0 * k_mult

            # SLAM SENSOR PING 
            newly_discovered = arena.scan_environment(sim_state["pos"])
            if newly_discovered:
                sim_state["battery"] -= cost_scan
                await websocket.send_json({
                    "status": f"LiDAR CONTACT. RECALCULATING...", 
                    "discovered_walls": newly_discovered,
                    "drone_position": sim_state["pos"], 
                    "altitude": 0,
                    "battery": sim_state["battery"]
                })
                await asyncio.sleep(0.6 / sim_state["speed"])
                continue 
            
            # ARRIVAL CHECK
            if sim_state["pos"] == arena.target:
                if arena.target == (0,0): dest_name = "HOME BASE"
                elif arena.target == (7,7): dest_name = "MIDFIELD RELAY"
                else: dest_name = "TARGET"

                await websocket.send_json({"status": f"{dest_name} SECURED.", "drone_position": sim_state["pos"], "altitude": 0, "battery": sim_state["battery"]})
                
                # If it reached the red block, stop forever.
                if arena.target == (14,14):
                    sim_state["is_running"] = False 
                await asyncio.sleep(0.5)
                continue

            # PATHFINDING & MOVEMENT
            arena.find_path() 
            
            if len(arena.path) > 1:
                sim_state["pos"] = arena.path[1] 
                sim_state["battery"] -= cost_move
                await websocket.send_json({"drone_position": sim_state["pos"], "altitude": 0, "battery": sim_state["battery"]})
            
            else:
                await websocket.send_json({"status": "TRAPPED. SCANNING DEPTH...", "battery": sim_state["battery"]})
                await asyncio.sleep(0.2 / sim_state["speed"])
                
                override = arena.tactical_override(sim_state["pos"])
                
                # WEAPONS SYSTEM 
                if override and override["action"] == "shoot":
                    sim_state["battery"] -= cost_shoot
                    await websocket.send_json({"status": f"RAILGUN FIRED (-{cost_shoot:.1f}% PWR).", "destroyed_wall": override["wall"], "battery": sim_state["battery"]})
                    await asyncio.sleep(0.2 / sim_state["speed"])
                    continue 

                # VAULTING SYSTEM
                elif override and override["action"] == "vault":
                    landing_zone = override["landing_zone"]
                    thickness = override.get("thickness", 2)
                    dynamic_altitude = 2.0 + (thickness * 0.8) 
                    sim_state["battery"] -= cost_vault
                    
                    await websocket.send_json({
                        "status": f"VAULTING ({thickness} BLOCKS) (-{cost_vault:.1f}% PWR)",
                        "drone_position": landing_zone,
                        "altitude": dynamic_altitude,
                        "battery": sim_state["battery"]
                    })
                    sim_state["pos"] = landing_zone
                    await asyncio.sleep(0.4 / sim_state["speed"])
                    continue

                else:
                    await websocket.send_json({"status": "CRITICAL FAILURE. NO ESCAPE.", "battery": sim_state["battery"]})
                    sim_state["is_running"] = False 
            
            await asyncio.sleep(0.3 / sim_state["speed"])
            
    except Exception as e:
        print("Flight aborted.")
    finally:
        listener_task.cancel()