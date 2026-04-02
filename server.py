from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
import random
from core_engine import Battlefield

app = FastAPI()

def get_threat_near(arena, center, radius=3):
    cx, cy, cz = center
    threats = []
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            for dz in range(-2, 3): 
                nx, ny, nz = cx + dx, cy + dy, cz + dz
                if [nx, ny, nz] in arena.demons:
                    dist = abs(dx) + abs(dy) + abs(dz)
                    threats.append((dist, (nx, ny, nz)))
    if threats:
        threats.sort()
        return threats[0][1] 
    return None

@app.websocket("/radar")
async def radar_stream(websocket: WebSocket):
    await websocket.accept()
    
    arena = Battlefield(15, 15, 8)

    def setup_walls():
        arena.world_obstacles.clear()
        arena.known_obstacles.clear()
        
        city_blocks = [
            (2, 3, 2, 3, 6),    (11, 12, 11, 12, 6),
            (8, 9, 2, 3, 4),    (2, 3, 11, 12, 4),  
            (6, 7, 6, 7, 4),    (1, 1, 6, 6, 2),    
            (13, 13, 6, 6, 2),  (6, 6, 1, 1, 2),    
            (6, 6, 13, 13, 2)   
        ]
        for block in city_blocks:
            for x in range(block[0], block[1] + 1):
                for y in range(block[2], block[3] + 1):
                    for z in range(1, block[4] + 1):
                        arena.add_obstacle(x, y, z)

    setup_walls()

    vip_spawns = [(2,2,7), (11,11,7), (8,2,5), (2,11,5), (6,6,5), (5,5,1), (14,14,1), (0,14,1)]
    patrol_points = [(1,14,1), (14,1,1), (14,14,1), (7,7,5), (2,2,7), (11,11,7), (7,1,1), (1,7,1)]

    sim_state = {
        "alpha_pos": (0, 0, 1), "alpha_target": patrol_points[0], "alpha_battery": 100.0,
        "bravo_pos": (0, 14, 1), "bravo_battery": 100.0, "bravo_active": False, 
        "rtb_mode": False, "speed": 1.0, "is_running": False, "reset_flag": False,
        "vip_pos": random.choice(vip_spawns), "vip_found": False
    }

    async def listen_for_commands():
        try:
            while True:
                data = await websocket.receive_json()
                cmd = data.get("action")
                val = data.get("value")

                if data.get("type") == "obstacle": arena.add_obstacle(data["x"], data["y"], data["z"])
                elif data.get("type") == "drop_demon": arena.demons.append([data["x"], data["y"], data["z"]])
                elif data.get("type") == "command":
                    if cmd == "start_mission": 
                        sim_state["is_running"] = True
                        sim_state["rtb_mode"] = False 
                    elif cmd == "toggle_bravo": sim_state["bravo_active"] = not sim_state["bravo_active"]
                    elif cmd == "pause_mission": sim_state["is_running"] = False
                    elif cmd == "relocate_vip":
                        sim_state["vip_pos"] = random.choice(vip_spawns)
                        sim_state["vip_found"] = False
                        sim_state["alpha_target"] = random.choice(patrol_points)
                    elif cmd == "reset_drone": 
                        sim_state["reset_flag"] = True
                        arena.known_obstacles.clear()
                    elif cmd == "rtb":
                        sim_state["alpha_target"] = (0, 0, 1)
                        sim_state["rtb_mode"] = True 
                        sim_state["is_running"] = True 
                    elif cmd == "set_speed": sim_state["speed"] = float(val)
                    elif cmd == "clear_walls": 
                        setup_walls()
                        arena.demons.clear()
                    elif cmd == "manual_shoot":
                        d_name = val if val else "alpha"
                        enemies = [sim_state["bravo_pos"]] if d_name == "alpha" else [sim_state["alpha_pos"]]
                        target = sim_state["alpha_target"] if d_name == "alpha" else sim_state["alpha_pos"]
                        ovr = arena.tactical_override(sim_state[f"{d_name}_pos"], target, enemies)
                        if ovr and ovr["action"] == "shoot":
                            sim_state["pending_manual"] = {"destroyed_wall": ovr["wall"], "shooter": d_name}
                            sim_state[f"{d_name}_battery"] -= (4.0 if d_name == "alpha" else 2.0)
        except WebSocketDisconnect:
            pass

    listener_task = asyncio.create_task(listen_for_commands())

    try:
        while True:
            if sim_state["reset_flag"]:
                sim_state.update({
                    "alpha_pos": (0, 0, 1), "alpha_target": random.choice(patrol_points), "alpha_battery": 100.0,
                    "bravo_pos": (0, 14, 1), "bravo_battery": 100.0, "bravo_active": False,
                    "is_running": False, "reset_flag": False, "rtb_mode": False,
                    "vip_pos": random.choice(vip_spawns), "vip_found": False
                })
                await websocket.send_json({"status": "SWARM RESET.", "alpha_pos": (0,0,1), "bravo_pos": (0,14,1), "clear_memory": True, "bravo_active": False, "vip_pos": sim_state["vip_pos"]})
                await asyncio.sleep(0.5)
                continue

            if not sim_state["is_running"]:
                await websocket.send_json({
                    "status": "SYSTEM IDLE.", 
                    "alpha_battery": sim_state["alpha_battery"], "bravo_battery": sim_state["bravo_battery"],
                    "demons": arena.demons, "bravo_active": sim_state["bravo_active"], "vip_pos": sim_state["vip_pos"]
                })
                await asyncio.sleep(0.5)
                continue

            arena.move_demons([sim_state["alpha_pos"], sim_state["bravo_pos"]])
            k_mult = sim_state["speed"]
            discovered = []
            status_msg = "PATROLLING CITY SECTORS..."

            if sim_state["alpha_battery"] > 0:
                cx, cy, cz = sim_state["alpha_pos"]
                vx, vy, vz = sim_state["vip_pos"]

                if not sim_state["vip_found"] and abs(cx-vx) <= 3 and abs(cy-vy) <= 3 and abs(cz-vz) <= 3:
                    sim_state["vip_found"] = True
                    sim_state["alpha_target"] = sim_state["vip_pos"]
                
                if sim_state["vip_found"]:
                    status_msg = "VIP DETECTED! PURSUING..."

                if sim_state["alpha_pos"] == sim_state["alpha_target"] and not sim_state["vip_found"]:
                    sim_state["alpha_target"] = random.choice(patrol_points)

                if (cx, cy, cz) == (0,0,1) and sim_state["alpha_battery"] < 100.0:
                    sim_state["alpha_battery"] = min(100.0, sim_state["alpha_battery"] + 20.0)
                elif sim_state["alpha_battery"] < 40.0 and sim_state["alpha_target"] != (0,0,1):
                    sim_state["alpha_target"] = (0,0,1)
                else:
                    scanned = arena.scan_environment(sim_state["alpha_pos"])
                    if scanned:
                        discovered.extend(scanned)
                        sim_state["alpha_battery"] -= (0.1 * k_mult)
                    
                    if sim_state["alpha_pos"] != sim_state["alpha_target"]:
                        path = arena.find_path(sim_state["alpha_pos"], sim_state["alpha_target"], [sim_state["bravo_pos"]])
                        if path and len(path) > 1:
                            sim_state["alpha_pos"] = path[1]
                            sim_state["alpha_battery"] -= (0.8 * k_mult)
                        else:
                            ovr = arena.tactical_override(sim_state["alpha_pos"], sim_state["alpha_target"], [sim_state["bravo_pos"]])
                            if ovr:
                                if ovr["action"] == "shoot":
                                    # Bravo Bodyguard clears 1-block obstacles
                                    sim_state["bravo_battery"] -= (2.0 * k_mult)
                                    sim_state["pending_manual"] = {"destroyed_wall": ovr["wall"], "shooter": "bravo"}
                                    if ovr["wall"] in arena.world_obstacles: arena.remove_obstacle(*ovr["wall"])
                                    if list(ovr["wall"]) in arena.demons: arena.demons.remove(list(ovr["wall"]))
                                elif ovr["action"] == "vault":
                                    # Alpha climbs 2-block obstacles
                                    sim_state["alpha_pos"] = ovr["landing_zone"]
                                    sim_state["alpha_battery"] -= (4.0 * k_mult)
                                elif ovr["action"] == "turn_around":
                                    # 💥 NO HESITATION ESCAPE HATCH 💥
                                    # If path is impossible, instantly pick a new sector and turn around
                                    if not sim_state["vip_found"]:
                                        available_points = [p for p in patrol_points if p != sim_state["alpha_target"]]
                                        sim_state["alpha_target"] = random.choice(available_points)

            if sim_state["bravo_active"] and sim_state["bravo_battery"] > 0:
                cx, cy, cz = sim_state["bravo_pos"]
                if (cx, cy, cz) in [(0,0,1), (0,14,1)] and sim_state["bravo_battery"] < 100.0:
                    sim_state["bravo_battery"] = min(100.0, sim_state["bravo_battery"] + 20.0)
                elif sim_state["bravo_battery"] < 40.0:
                    bases = [(0,0,1), (0,14,1)]
                    closest_base = min(bases, key=lambda b: abs(cx - b[0]) + abs(cy - b[1]) + abs(cz - b[2]))
                    if (cx, cy, cz) != closest_base:
                        path = arena.find_path((cx, cy, cz), closest_base, [sim_state["alpha_pos"]])
                        if path and len(path) > 1:
                            sim_state["bravo_pos"] = path[1]
                            sim_state["bravo_battery"] -= (0.4 * k_mult) 
                else:
                    threat = get_threat_near(arena, sim_state["alpha_pos"], radius=3)
                    shot_fired = False
                    if threat:
                        dist_to_threat = abs(cx - threat[0]) + abs(cy - threat[1]) + abs(cz - threat[2])
                        if dist_to_threat <= 6:
                            arena.remove_obstacle(*threat)
                            if list(threat) in arena.demons: arena.demons.remove(list(threat))
                            sim_state["bravo_battery"] -= (2.0 * k_mult) 
                            sim_state["pending_manual"] = {"destroyed_wall": threat, "shooter": "bravo"}
                            shot_fired = True
                    
                    if not shot_fired:
                        dist_to_alpha = abs(cx - sim_state["alpha_pos"][0]) + abs(cy - sim_state["alpha_pos"][1]) + abs(cz - sim_state["alpha_pos"][2])
                        if dist_to_alpha > 1:
                            path = arena.find_path((cx, cy, cz), sim_state["alpha_pos"], [sim_state["alpha_pos"]])
                            if path and len(path) > 1:
                                sim_state["bravo_pos"] = path[1]
                                sim_state["bravo_battery"] -= (0.4 * k_mult) 

            payload = {
                "alpha_pos": sim_state["alpha_pos"], "alpha_battery": sim_state["alpha_battery"],
                "bravo_pos": sim_state["bravo_pos"], "bravo_battery": sim_state["bravo_battery"],
                "bravo_active": sim_state["bravo_active"], "vip_pos": sim_state["vip_pos"],
                "demons": arena.demons, "status": status_msg
            }

            if discovered: payload["discovered_walls"] = discovered
            if "pending_manual" in sim_state: payload.update(sim_state.pop("pending_manual"))
            
            if sim_state["alpha_pos"] == sim_state["vip_pos"]: 
                payload["status"] = "SUSPECT APPREHENDED."
                sim_state["is_running"] = False

            await websocket.send_json(payload)
            await asyncio.sleep(0.3 / k_mult)
            
    except Exception as e:
        pass
    finally:
        listener_task.cancel()