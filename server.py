from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
from core_engine import Battlefield

app = FastAPI()

@app.websocket("/radar")
async def radar_stream(websocket: WebSocket):
    await websocket.accept()
    
    arena = Battlefield(15, 15)

    def setup_walls():
        arena.obstacles.clear()
        for obs in [(3, 3), (3, 4), (3, 5), (4, 5), (5, 5), (10, 8), (10, 9), (10, 10), (11, 10), (12, 10)]:
            arena.add_obstacle(*obs)

    setup_walls()

    sim_state = {
        "pos": (0, 0),
        "target": (14, 14),
        "speed": 1.0,       
        "is_running": False, 
        "reset_flag": False,
        "manual_action": None # NEW: Tracks manual UI clicks
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
                    elif cmd == "reset_drone": sim_state["reset_flag"] = True
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
            if sim_state["reset_flag"]:
                sim_state["pos"] = (0, 0)
                sim_state["target"] = (14, 14)
                arena.target = (14, 14)
                sim_state["is_running"] = False
                sim_state["reset_flag"] = False
                # FIXED: It now ONLY teleports the drone and leaves the walls intact!
                await websocket.send_json({"status": "DRONE RESET TO BASE.", "drone_position": (0,0), "altitude": 0})
                await asyncio.sleep(0.5)
                continue

            if not sim_state["is_running"]:
                await websocket.send_json({"status": "SYSTEM IDLE. AWAITING COMMAND."})
                await asyncio.sleep(0.5)
                continue

            arena.start = sim_state["pos"]
            
            # CHECK ARRIVAL FIRST
            if sim_state["pos"] == arena.target:
                dest_name = "HOME BASE" if arena.target == (0,0) else "TARGET"
                await websocket.send_json({"status": f"{dest_name} SECURED.", "drone_position": sim_state["pos"], "altitude": 0})
                sim_state["is_running"] = False 
                await asyncio.sleep(0.5)
                continue

            # MANUAL OVERRIDE CHECK
            if sim_state.get("manual_action"):
                action = sim_state["manual_action"]
                sim_state["manual_action"] = None
                override = arena.tactical_override(sim_state["pos"])
                
                if action == "shoot" and override and override.get("wall"):
                    arena.remove_obstacle(*override["wall"])
                    await websocket.send_json({"status": "MANUAL OVERRIDE: RAILGUN.", "destroyed_wall": override["wall"]})
                    await asyncio.sleep(0.2 / sim_state["speed"])
                    continue
                elif action == "jump":
                    cx, cy = sim_state["pos"]
                    tx, ty = arena.target
                    dx = 1 if tx > cx else (-1 if tx < cx else 0)
                    dy = 1 if ty > cy else (-1 if ty < cy else 0)
                    if dx != 0 and dy != 0:
                        if abs(tx - cx) > abs(ty - cy): dy = 0
                        else: dx = 0
                    lz_x = min(14, max(0, cx + dx * 2))
                    lz_y = min(14, max(0, cy + dy * 2))
                    sim_state["pos"] = (lz_x, lz_y)
                    await websocket.send_json({"status": "MANUAL OVERRIDE: VAULT.", "drone_position": sim_state["pos"], "altitude": 3.0})
                    await asyncio.sleep(0.4 / sim_state["speed"])
                    continue

            # AUTOMATIC PATHFINDING
            arena.find_path() # Calculates closest path even if blocked
            
            if len(arena.path) > 1:
                # Still walking towards the target (or the wall blocking it)
                sim_state["pos"] = arena.path[1] 
                await websocket.send_json({"drone_position": sim_state["pos"], "altitude": 0})
            
            else:
                # Length <= 1 means we are PHYSICALLY TOUCHING the wall!
                await websocket.send_json({"status": "TRAPPED. SCANNING DEPTH..."})
                await asyncio.sleep(0.2 / sim_state["speed"])
                
                override = arena.tactical_override(sim_state["pos"])
                
                if override and override["action"] == "shoot":
                    await websocket.send_json({"status": "RAILGUN FIRED.", "destroyed_wall": override["wall"]})
                    await asyncio.sleep(0.2 / sim_state["speed"])
                    continue 

                elif override and override["action"] == "vault":
                    landing_zone = override["landing_zone"]
                    thickness = override.get("thickness", 2)
                    dynamic_altitude = 2.0 + (thickness * 0.8) 
                    
                    await websocket.send_json({
                        "status": f"VAULTING ({thickness} BLOCKS)",
                        "drone_position": landing_zone,
                        "altitude": dynamic_altitude
                    })
                    sim_state["pos"] = landing_zone
                    await asyncio.sleep(0.4 / sim_state["speed"])
                    continue

                else:
                    await websocket.send_json({"status": "CRITICAL FAILURE. NO ESCAPE."})
                    sim_state["is_running"] = False 
            
            await asyncio.sleep(0.3 / sim_state["speed"])
            
    except Exception as e:
        print("Flight aborted.")
    finally:
        listener_task.cancel()