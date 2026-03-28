import heapq
import random

class Battlefield:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.world_obstacles = set() 
        self.known_obstacles = set() 
        self.demons = [] 
        self.sensor_range = 2 

    def add_obstacle(self, x, y):
        self.world_obstacles.add((x, y))

    def remove_obstacle(self, x, y):
        if (x, y) in self.world_obstacles:
            self.world_obstacles.remove((x, y))
        if (x, y) in self.known_obstacles:
            self.known_obstacles.remove((x, y))

    def move_demons(self, drone_positions):
        for i, demon in enumerate(self.demons):
            cx, cy = demon
            neighbors = [(cx, cy-1), (cx, cy+1), (cx-1, cy), (cx+1, cy)]
            valid = []
            for nx, ny in neighbors:
                if 0 <= nx < self.width and 0 <= ny < self.height:
                    if [nx, ny] not in self.demons and (nx, ny) not in drone_positions and (nx, ny) not in [(0,0), (0,14), (7,7), (14,14), (14,0)]:
                        valid.append([nx, ny])
            if valid:
                if random.random() > 0.85: 
                    self.demons[i] = random.choice(valid)

    def scan_environment(self, current_pos):
        cx, cy = current_pos
        newly_discovered = []
        for dx in range(-self.sensor_range, self.sensor_range + 1):
            for dy in range(-self.sensor_range, self.sensor_range + 1):
                nx, ny = cx + dx, cy + dy
                if (nx, ny) in self.world_obstacles and (nx, ny) not in self.known_obstacles:
                    self.known_obstacles.add((nx, ny))
                    newly_discovered.append((nx, ny))
        return newly_discovered

    def heuristic(self, a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def get_neighbors(self, pos, other_drone):
        x, y = pos
        neighbors = [(x, y-1), (x, y+1), (x-1, y), (x+1, y)]
        valid = []
        for nx, ny in neighbors:
            if 0 <= nx < self.width and 0 <= ny < self.height:
                if (nx, ny) not in self.known_obstacles and [nx, ny] not in self.demons and (nx, ny) != other_drone:
                    valid.append((nx, ny))
        return valid

    def find_path(self, start, target, other_drone):
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

            for next_pos in self.get_neighbors(current, other_drone):
                new_cost = cost_so_far[current] + 1
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

    def tactical_override(self, current_pos, target, other_drone):
        cx, cy = current_pos
        tx, ty = target
        dx = 1 if tx > cx else (-1 if tx < cx else 0)
        dy = 1 if ty > cy else (-1 if ty < cy else 0)

        if dx != 0 and dy != 0:
            if abs(tx - cx) > abs(ty - cy): dy = 0
            else: dx = 0

        if dx == 0 and dy == 0: return None

        nx, ny = cx + dx, cy + dy
        thickness = 0
        first_wall = None

        while 0 <= nx < self.width and 0 <= ny < self.height:
            if (nx, ny) == other_drone:
                return None 
                
            if (nx, ny) in self.world_obstacles or [nx, ny] in self.demons:
                if thickness == 0: first_wall = (nx, ny)
                thickness += 1
            else:
                if thickness == 1:
                    if list(first_wall) in self.demons: self.demons.remove(list(first_wall))
                    if first_wall in self.world_obstacles: self.remove_obstacle(*first_wall)
                    return {"action": "shoot", "wall": first_wall}
                elif thickness > 1:
                    return {"action": "vault", "landing_zone": (nx, ny), "thickness": thickness}
            nx += dx
            ny += dy

        if thickness > 0:
            if list(first_wall) in self.demons: self.demons.remove(list(first_wall))
            if first_wall in self.world_obstacles: self.remove_obstacle(*first_wall)
            return {"action": "shoot", "wall": first_wall}
            
        return None