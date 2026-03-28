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
        "battery": 100.0
    }

    async def listen_for_commands():
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "obstacle": arena.add_obstacle(data["x"], data["y"])
                elif data.get("type") == "drop_demon": arena.demons.append([data["x"], data["y"]])
                elif data.get("type") == "command":
                    cmd = data["action"]
                    if cmd == "start_mission": 
                        sim_state["is_running"] = True
                        if sim_state["pos"] == (0,0): arena.target = (14,14); sim_state["target"] = (14,14)
                    elif cmd == "pause_mission": sim_state["is_running"] = False
                    elif cmd == "reset_drone": 
                        sim_state["reset_flag"] = True
                        arena.known_obstacles.clear()
                    elif cmd == "rtb":
                        sim_state["target"] = (0, 0)
                        arena.target = (0, 0)
                        sim_state["is_running"] = True 
                    elif cmd == "set_speed": sim_state["speed"] = float(data.get("value"))
                    elif cmd == "clear_walls": 
                        setup_walls()
                        arena.demons.clear()
        except WebSocketDisconnect:
            pass

    listener_task = asyncio.create_task(listen_for_commands())

    try:
        while True:
            if sim_state["reset_flag"]:
                sim_state["pos"] = (0, 0)
                sim_state["target"] = (14, 14)
                arena.target = (14, 14)
                sim_state["battery"] = 100.0 
                sim_state["is_running"] = False
                sim_state["reset_flag"] = False
                await websocket.send_json({"status": "DRONE RESET.", "drone_position": (0,0), "battery": 100.0, "clear_memory": True})
                await asyncio.sleep(0.5)
                continue

            if not sim_state["is_running"]:
                await websocket.send_json({"status": "SYSTEM IDLE. AWAITING COMMAND.", "battery": sim_state["battery"], "demons": arena.demons})
                await asyncio.sleep(0.5)
                continue

            if sim_state["battery"] <= 0:
                sim_state["battery"] = 0
                await websocket.send_json({"status": "FATAL: CORE DEPLETED. DRONE DOWN.", "battery": 0})
                sim_state["is_running"] = False
                continue

            if sim_state["pos"] == (0,0) and sim_state["battery"] < 100.0:
                sim_state["battery"] = min(100.0, sim_state["battery"] + 20.0) 
                await websocket.send_json({"status": "BASE DOCK: RECHARGING...", "battery": sim_state["battery"]})
                await asyncio.sleep(0.5 / sim_state["speed"])
                if sim_state["battery"] >= 100.0:
                    sim_state["is_running"] = False
                    await websocket.send_json({"status": "CORE FULL. AWAITING ORDERS.", "battery": sim_state["battery"]})
                continue

            if sim_state["pos"] == (7, 7):
                if sim_state["battery"] < 100.0:
                    sim_state["battery"] = min(100.0, sim_state["battery"] + 50.0)
                    await websocket.send_json({"status": "RELAY SIPHON: +50% POWER", "battery": sim_state["battery"]})
                    await asyncio.sleep(0.3 / sim_state["speed"])
                if arena.target == (7, 7):
                    arena.target = (14, 14)
                    sim_state["target"] = (14, 14)
                    await websocket.send_json({"status": "POWER SECURED. RESUMING MISSION.", "battery": sim_state["battery"]})
            
            # --- 40% BAILOUT UPGRADE ---
            if sim_state["battery"] < 40.0 and arena.target not in [(0,0), (7,7)]:
                cx, cy = sim_state["pos"]
                dist_to_base = cx + cy 
                dist_to_relay = abs(cx - 7) + abs(cy - 7)
                arena.target = (7, 7) if dist_to_relay < dist_to_base else (0, 0)
                sim_state["target"] = arena.target
                await websocket.send_json({"status": f"CRITICAL <40%. DIVERTING.", "battery": sim_state["battery"]})
                await asyncio.sleep(1.0 / sim_state["speed"])

            arena.start = sim_state["pos"]
            arena.move_demons()

            k_mult = sim_state["speed"] 
            
            newly_discovered = arena.scan_environment(sim_state["pos"])
            if newly_discovered:
                sim_state["battery"] -= (0.1 * k_mult)
                await websocket.send_json({
                    "status": f"LiDAR CONTACT. RECALCULATING...", 
                    "discovered_walls": newly_discovered,
                    "drone_position": sim_state["pos"], 
                    "battery": sim_state["battery"],
                    "demons": arena.demons
                })
                await asyncio.sleep(0.6 / sim_state["speed"])
                continue 
            
            if sim_state["pos"] == arena.target:
                await websocket.send_json({"status": "DESTINATION SECURED.", "drone_position": sim_state["pos"], "battery": sim_state["battery"]})
                if arena.target == (14,14): sim_state["is_running"] = False 
                await asyncio.sleep(0.5)
                continue

            arena.find_path() 
            
            if len(arena.path) > 1:
                sim_state["pos"] = arena.path[1] 
                sim_state["battery"] -= (0.8 * k_mult)
                await websocket.send_json({"drone_position": sim_state["pos"], "battery": sim_state["battery"], "demons": arena.demons})
            
            else:
                await websocket.send_json({"status": "TRAPPED. SCANNING DEPTH...", "battery": sim_state["battery"]})
                await asyncio.sleep(0.2 / sim_state["speed"])
                override = arena.tactical_override(sim_state["pos"])
                
                if override and override["action"] == "shoot":
                    sim_state["battery"] -= (4.0 * k_mult)
                    await websocket.send_json({"status": f"RAILGUN FIRED.", "destroyed_wall": override["wall"], "battery": sim_state["battery"], "demons": arena.demons})
                    await asyncio.sleep(0.2 / sim_state["speed"])
                    continue 

                elif override and override["action"] == "vault":
                    landing_zone = override["landing_zone"]
                    thickness = override.get("thickness", 2)
                    sim_state["battery"] -= (8.0 * k_mult)
                    await websocket.send_json({
                        "status": f"VAULTING ({thickness} BLOCKS)",
                        "drone_position": landing_zone,
                        "altitude": 2.0 + (thickness * 0.8),
                        "battery": sim_state["battery"],
                        "demons": arena.demons
                    })
                    sim_state["pos"] = landing_zone
                    await asyncio.sleep(0.4 / sim_state["speed"])
                    continue

                else:
                    await websocket.send_json({"status": "CRITICAL FAILURE. NO ESCAPE.", "battery": sim_state["battery"]})
                    sim_state["is_running"] = False 
            
            await asyncio.sleep(0.3 / sim_state["speed"])
            
    except Exception as e:
        pass
    finally:
        listener_task.cancel()