import heapq
import random

class Battlefield:
    def __init__(self, width, height, depth=8):
        self.width = width
        self.height = height
        self.depth = depth
        self.world_obstacles = set() 
        self.known_obstacles = set() 
        self.demons = [] 
        self.sensor_range = 2 

    def add_obstacle(self, x, y, z):
        self.world_obstacles.add((x, y, z))

    def remove_obstacle(self, x, y, z):
        if (x, y, z) in self.world_obstacles:
            self.world_obstacles.remove((x, y, z))
        if (x, y, z) in self.known_obstacles:
            self.known_obstacles.remove((x, y, z))

    def move_demons(self, drone_positions):
        for i, demon in enumerate(self.demons):
            cx, cy, cz = demon
            neighbors = [
                (cx, cy-1, cz), (cx, cy+1, cz), (cx-1, cy, cz), (cx+1, cy, cz),
                (cx, cy, cz-1), (cx, cy, cz+1)
            ]
            valid = []
            for nx, ny, nz in neighbors:
                if 0 <= nx < self.width and 0 <= ny < self.height and 1 <= nz < self.depth:
                    if [nx, ny, nz] not in self.demons and (nx, ny, nz) not in drone_positions:
                        if (nx, ny, nz) not in [(0,0,1), (0,14,1), (14,0,1), (7,7,1), (14,14,1)]:
                            valid.append([nx, ny, nz])
            if valid:
                if random.random() > 0.85: 
                    self.demons[i] = random.choice(valid)

    def scan_environment(self, current_pos):
        cx, cy, cz = current_pos
        newly_discovered = []
        for dx in range(-self.sensor_range, self.sensor_range + 1):
            for dy in range(-self.sensor_range, self.sensor_range + 1):
                for dz in range(-self.sensor_range, self.sensor_range + 1):
                    nx, ny, nz = cx + dx, cy + dy, cz + dz
                    if (nx, ny, nz) in self.world_obstacles and (nx, ny, nz) not in self.known_obstacles:
                        self.known_obstacles.add((nx, ny, nz))
                        newly_discovered.append((nx, ny, nz))
        return newly_discovered

    def heuristic(self, a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    def get_neighbors(self, pos, other_drones):
        x, y, z = pos
        neighbors = [
            (x, y-1, z), (x, y+1, z), (x-1, y, z), (x+1, y, z),
            (x, y, z-1), (x, y, z+1) 
        ]
        valid = []
        for nx, ny, nz in neighbors:
            if 0 <= nx < self.width and 0 <= ny < self.height and 1 <= nz < self.depth:
                if (nx, ny, nz) not in self.known_obstacles and [nx, ny, nz] not in self.demons and (nx, ny, nz) not in other_drones:
                    valid.append((nx, ny, nz))
        return valid

    def find_path(self, start, target, other_drones):
        if start == target: return [start]
        frontier = []
        heapq.heappush(frontier, (0, start))
        came_from = {start: None}
        cost_so_far = {start: 0}

        closest_node = start
        min_h = self.heuristic(start, target)

        while frontier:
            current = heapq.heappop(frontier)[1]
            if current == target:
                closest_node = current
                break

            current_h = self.heuristic(current, target)
            if current_h < min_h:
                min_h = current_h
                closest_node = current

            for next_pos in self.get_neighbors(current, other_drones):
                # 💥 GROUND-HUGGER ALGORITHM 💥
                step_cost = 1.0
                if next_pos[2] > current[2]: 
                    step_cost = 2.5 # Penalty for climbing
                elif next_pos[2] < current[2]: 
                    step_cost = 0.5 # Reward for descending to the street
                
                # Heavy penalty if flying high in empty air
                if next_pos[2] > 1 and (next_pos[0], next_pos[1], next_pos[2]-1) not in self.world_obstacles:
                    step_cost += 2.0 

                new_cost = cost_so_far[current] + step_cost
                if next_pos not in cost_so_far or new_cost < cost_so_far[next_pos]:
                    cost_so_far[next_pos] = new_cost
                    priority = new_cost + self.heuristic(next_pos, target)
                    heapq.heappush(frontier, (priority, next_pos))
                    came_from[next_pos] = current

        current = closest_node
        path = []
        while current is not None:
            path.append(current)
            current = came_from[current]
        path.reverse()
        return path

    def tactical_override(self, current_pos, target, other_drones):
        cx, cy, cz = current_pos
        tx, ty, tz = target
        
        # Calculate primary direction towards target
        dx = 1 if tx > cx else (-1 if tx < cx else 0)
        dy = 1 if ty > cy else (-1 if ty < cy else 0)
        
        if dx == 0 and dy == 0: 
            return {"action": "turn_around"}
        
        # Prefer the axis with the largest distance to cover
        if abs(tx - cx) > abs(ty - cy): dy = 0
        else: dx = 0
            
        nx, ny = cx + dx, cy + dy
        
        if not (0 <= nx < self.width and 0 <= ny < self.height):
            return {"action": "turn_around"}

        # 💥 1. Check for Demons in immediate path 💥
        if [nx, ny, cz] in self.demons:
            return {"action": "shoot", "wall": (nx, ny, cz), "shooter": "bravo"}
            
        is_blocked_at_level = (nx, ny, cz) in self.world_obstacles
        is_blocked_above = (nx, ny, cz + 1) in self.world_obstacles
        
        # 💥 2. The 1-Block vs 2-Block Rule 💥
        if is_blocked_at_level:
            if is_blocked_above:
                # 2+ blocks high -> Alpha Vaults
                top_z = cz + 1
                while (nx, ny, top_z) in self.world_obstacles and top_z < self.depth:
                    top_z += 1
                if top_z < self.depth:
                    return {"action": "vault", "landing_zone": (nx, ny, top_z)}
                else:
                    return {"action": "turn_around"} # Wall reaches the skybox
            else:
                # Exactly 1 block high -> Bravo Snipes
                return {"action": "shoot", "wall": (nx, ny, cz), "shooter": "bravo"}
        
        # 💥 3. The Escape Hatch (No hesitation) 💥
        # If we got here, there's no wall directly in front, but A* still failed. 
        # This means we are stuck in a dead-end alley. Instantly turn around.
        return {"action": "turn_around"}