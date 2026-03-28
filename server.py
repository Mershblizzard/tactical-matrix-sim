from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
from core_engine import Battlefield

app = FastAPI()

def get_threat_near(arena, center, radius=2):
    cx, cy = center
    threats = []
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            nx, ny = cx + dx, cy + dy
            if (nx, ny) in arena.world_obstacles or [nx, ny] in arena.demons:
                dist = abs(dx) + abs(dy)
                threats.append((dist, (nx, ny)))
    if threats:
        threats.sort()
        return threats[0][1] 
    return None

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
        "alpha_pos": (0, 0), "alpha_target": (14, 14), "alpha_battery": 100.0,
        "bravo_pos": (0, 14), "bravo_battery": 100.0, "bravo_active": False, 
        "charlie_pos": (14, 0), "charlie_battery": 100.0, "charlie_active": False, 
        "rtb_mode": False, 
        "speed": 1.0, "is_running": False, "reset_flag": False
    }

    async def listen_for_commands():
        try:
            while True:
                data = await websocket.receive_json()
                cmd = data.get("action")
                val = data.get("value")

                if data.get("type") == "obstacle": arena.add_obstacle(data["x"], data["y"])
                elif data.get("type") == "drop_demon": arena.demons.append([data["x"], data["y"]])
                elif data.get("type") == "command":
                    if cmd == "start_mission": 
                        sim_state["is_running"] = True
                        sim_state["rtb_mode"] = False 
                        if sim_state["alpha_pos"] == (0,0): sim_state["alpha_target"] = (14,14)
                    elif cmd == "toggle_bravo": sim_state["bravo_active"] = not sim_state["bravo_active"]
                    elif cmd == "toggle_charlie": sim_state["charlie_active"] = not sim_state["charlie_active"]
                    elif cmd == "pause_mission": sim_state["is_running"] = False
                    elif cmd == "reset_drone": 
                        sim_state["reset_flag"] = True
                        arena.known_obstacles.clear()
                    elif cmd == "rtb":
                        sim_state["alpha_target"] = (0, 0)
                        sim_state["rtb_mode"] = True 
                        sim_state["is_running"] = True 
                    elif cmd == "set_speed": sim_state["speed"] = float(val)
                    elif cmd == "clear_walls": 
                        setup_walls()
                        arena.demons.clear()
                    elif cmd == "manual_shoot":
                        d_name = val if val else "alpha"
                        enemies = []
                        if d_name != "alpha": enemies.append(sim_state["alpha_pos"])
                        if d_name != "bravo": enemies.append(sim_state["bravo_pos"])
                        if d_name != "charlie": enemies.append(sim_state["charlie_pos"])
                        
                        target = sim_state["alpha_target"] if d_name == "alpha" else sim_state["alpha_pos"]
                        ovr = arena.tactical_override(sim_state[f"{d_name}_pos"], target, enemies)
                        if ovr and ovr["action"] == "shoot":
                            sim_state["pending_manual"] = {"destroyed_wall": ovr["wall"], "shooter": d_name}
                            drain = 4.0 if d_name == "alpha" else 2.0 
                            sim_state[f"{d_name}_battery"] -= drain
                    elif cmd == "manual_jump":
                        ovr = arena.tactical_override(sim_state["alpha_pos"], sim_state["alpha_target"], [sim_state["bravo_pos"], sim_state["charlie_pos"]])
                        if ovr and ovr["action"] == "vault":
                            sim_state["alpha_pos"] = ovr["landing_zone"]
                            sim_state["alpha_battery"] -= 8.0
                            sim_state["alpha_alt"] = 2.0 + (ovr.get("thickness", 2) * 0.8)
        except WebSocketDisconnect:
            pass

    listener_task = asyncio.create_task(listen_for_commands())

    try:
        while True:
            if sim_state["reset_flag"]:
                sim_state.update({
                    "alpha_pos": (0, 0), "alpha_target": (14, 14), "alpha_battery": 100.0,
                    "bravo_pos": (0, 14), "bravo_battery": 100.0, "bravo_active": False,
                    "charlie_pos": (14, 0), "charlie_battery": 100.0, "charlie_active": False,
                    "is_running": False, "reset_flag": False, "rtb_mode": False
                })
                await websocket.send_json({"status": "SWARM RESET.", "alpha_pos": (0,0), "bravo_pos": (0,14), "charlie_pos": (14,0), "clear_memory": True, "bravo_active": False, "charlie_active": False})
                await asyncio.sleep(0.5)
                continue

            if not sim_state["is_running"]:
                await websocket.send_json({
                    "status": "SYSTEM IDLE. AWAITING COMMAND.", 
                    "alpha_battery": sim_state["alpha_battery"], "bravo_battery": sim_state["bravo_battery"], "charlie_battery": sim_state["charlie_battery"],
                    "demons": arena.demons, "bravo_active": sim_state["bravo_active"], "charlie_active": sim_state["charlie_active"]
                })
                await asyncio.sleep(0.5)
                continue

            arena.move_demons([sim_state["alpha_pos"], sim_state["bravo_pos"], sim_state["charlie_pos"]])
            k_mult = sim_state["speed"]
            discovered = []
            status_msg = "SWARM ACTIVE."

            # --- ALPHA LOGIC ---
            if sim_state["alpha_battery"] > 0:
                if sim_state["alpha_pos"] == (0,0) and sim_state["alpha_battery"] < 100.0:
                    sim_state["alpha_battery"] = min(100.0, sim_state["alpha_battery"] + 20.0)
                elif sim_state["alpha_pos"] == (7,7) and sim_state["alpha_battery"] < 100.0:
                    sim_state["alpha_battery"] = min(100.0, sim_state["alpha_battery"] + 50.0)
                    if sim_state["alpha_battery"] >= 100.0 and sim_state["alpha_target"] == (7,7):
                        sim_state["alpha_target"] = (0,0) if sim_state["rtb_mode"] else (14,14)
                elif sim_state["alpha_battery"] < 40.0 and sim_state["alpha_target"] not in [(0,0), (7,7)]:
                    cx, cy = sim_state["alpha_pos"]
                    sim_state["alpha_target"] = (7,7) if (abs(cx - 7) + abs(cy - 7)) < (cx + cy) else (0,0)
                else:
                    scanned = arena.scan_environment(sim_state["alpha_pos"])
                    if scanned:
                        discovered.extend(scanned)
                        sim_state["alpha_battery"] -= (0.1 * k_mult)
                    elif sim_state["alpha_pos"] != sim_state["alpha_target"]:
                        path = arena.find_path(sim_state["alpha_pos"], sim_state["alpha_target"], [sim_state["bravo_pos"], sim_state["charlie_pos"]])
                        if path and len(path) > 1:
                            sim_state["alpha_pos"] = path[1]
                            sim_state["alpha_battery"] -= (0.8 * k_mult)
                        else:
                            ovr = arena.tactical_override(sim_state["alpha_pos"], sim_state["alpha_target"], [sim_state["bravo_pos"], sim_state["charlie_pos"]])
                            if ovr and ovr["action"] == "shoot":
                                sim_state["alpha_battery"] -= (4.0 * k_mult)
                                sim_state["pending_manual"] = {"destroyed_wall": ovr["wall"], "shooter": "alpha"}
                            elif ovr and ovr["action"] == "vault":
                                sim_state["alpha_pos"] = ovr["landing_zone"]
                                sim_state["alpha_battery"] -= (8.0 * k_mult)
                                sim_state["alpha_alt"] = 2.0 + (ovr.get("thickness", 2) * 0.8)

            # --- ESCORTS (BRAVO & CHARLIE) LOGIC ---
            for escort_name, home_base in [("bravo", (0,14)), ("charlie", (14,0))]:
                if sim_state[f"{escort_name}_active"] and sim_state[f"{escort_name}_battery"] > 0:
                    cx, cy = sim_state[f"{escort_name}_pos"]
                    
                    if (cx, cy) in [(0,0), (0,14), (14,0)] and sim_state[f"{escort_name}_battery"] < 100.0:
                        sim_state[f"{escort_name}_battery"] = min(100.0, sim_state[f"{escort_name}_battery"] + 20.0)
                        status_msg = f"{escort_name.upper()} DOCK: RECHARGING..."
                    elif (cx, cy) == (7,7) and sim_state[f"{escort_name}_battery"] < 100.0:
                        sim_state[f"{escort_name}_battery"] = min(100.0, sim_state[f"{escort_name}_battery"] + 50.0)
                        status_msg = f"{escort_name.upper()} RELAY: +50%"
                    elif sim_state[f"{escort_name}_battery"] < 40.0:
                        bases = [(0,0), (7,7), (0,14), (14,0)]
                        closest_base = min(bases, key=lambda b: abs(cx - b[0]) + abs(cy - b[1]))
                        if (cx, cy) != closest_base:
                            other_drone = sim_state["charlie_pos"] if escort_name == "bravo" else sim_state["bravo_pos"]
                            path = arena.find_path((cx, cy), closest_base, [sim_state["alpha_pos"], other_drone])
                            if path and len(path) > 1:
                                sim_state[f"{escort_name}_pos"] = path[1]
                                sim_state[f"{escort_name}_battery"] -= (0.4 * k_mult) 
                        status_msg = f"{escort_name.upper()} CRITICAL <40%. DIVERTING."
                    else:
                        threat = get_threat_near(arena, sim_state["alpha_pos"], radius=2)
                        shot_fired = False
                        if threat:
                            dist_to_threat = abs(cx - threat[0]) + abs(cy - threat[1])
                            if dist_to_threat <= 6:
                                arena.remove_obstacle(*threat)
                                if list(threat) in arena.demons: arena.demons.remove(list(threat))
                                sim_state[f"{escort_name}_battery"] -= (2.0 * k_mult) 
                                sim_state["pending_manual"] = {"destroyed_wall": threat, "shooter": escort_name}
                                status_msg = f"{escort_name.upper()}: THREAT NEUTRALIZED!"
                                shot_fired = True
                        
                        if not shot_fired:
                            dist_to_alpha = abs(cx - sim_state["alpha_pos"][0]) + abs(cy - sim_state["alpha_pos"][1])
                            if dist_to_alpha > 1:
                                other_drone = sim_state["charlie_pos"] if escort_name == "bravo" else sim_state["bravo_pos"]
                                path = arena.find_path((cx, cy), sim_state["alpha_pos"], [sim_state["alpha_pos"], other_drone])
                                if path and len(path) > 1:
                                    sim_state[f"{escort_name}_pos"] = path[1]
                                    sim_state[f"{escort_name}_battery"] -= (0.4 * k_mult) 

            payload = {
                "alpha_pos": sim_state["alpha_pos"], "alpha_battery": sim_state["alpha_battery"], "alpha_alt": sim_state.get("alpha_alt", 0),
                "bravo_pos": sim_state["bravo_pos"], "bravo_battery": sim_state["bravo_battery"], "bravo_alt": sim_state.get("bravo_alt", 0),
                "charlie_pos": sim_state["charlie_pos"], "charlie_battery": sim_state["charlie_battery"], "charlie_alt": sim_state.get("charlie_alt", 0),
                "bravo_active": sim_state["bravo_active"], "charlie_active": sim_state["charlie_active"],
                "demons": arena.demons, "status": status_msg
            }
            sim_state["alpha_alt"] = 0

            if discovered: payload["discovered_walls"] = discovered
            if "pending_manual" in sim_state: payload.update(sim_state.pop("pending_manual"))
            if sim_state["alpha_pos"] == (14,14): payload["status"] = "ALPHA SECURED."

            await websocket.send_json(payload)
            await asyncio.sleep(0.3 / k_mult)
            
    except Exception as e:
        pass
    finally:
        listener_task.cancel()