import heapq

class Battlefield:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.start = (0, 0)
        self.target = (14, 14)
        self.obstacles = set()
        self.path = []

    def add_obstacle(self, x, y):
        self.obstacles.add((x, y))

    def remove_obstacle(self, x, y):
        if (x, y) in self.obstacles:
            self.obstacles.remove((x, y))

    def heuristic(self, a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def get_neighbors(self, pos):
        x, y = pos
        neighbors = [(x, y-1), (x, y+1), (x-1, y), (x+1, y)]
        valid = []
        for nx, ny in neighbors:
            if 0 <= nx < self.width and 0 <= ny < self.height:
                if (nx, ny) not in self.obstacles:
                    valid.append((nx, ny))
        return valid

    def find_path(self):
        frontier = []
        heapq.heappush(frontier, (0, self.start))
        came_from = {self.start: None}
        cost_so_far = {self.start: 0}

        # PROXIMITY FIX: Track the closest node we can reach
        closest_node = self.start
        min_h = self.heuristic(self.start, self.target)

        while frontier:
            current = heapq.heappop(frontier)[1]

            if current == self.target:
                closest_node = current
                break

            current_h = self.heuristic(current, self.target)
            if current_h < min_h:
                min_h = current_h
                closest_node = current

            for next_pos in self.get_neighbors(current):
                new_cost = cost_so_far[current] + 1
                if next_pos not in cost_so_far or new_cost < cost_so_far[next_pos]:
                    cost_so_far[next_pos] = new_cost
                    priority = new_cost + self.heuristic(next_pos, self.target)
                    heapq.heappush(frontier, (priority, next_pos))
                    came_from[next_pos] = current

        # Always rebuild the path to the closest reachable point!
        current = closest_node
        path = []
        while current != self.start:
            path.append(current)
            current = came_from[current]
        path.append(self.start)
        path.reverse()
        self.path = path
        
        return closest_node == self.target

    def tactical_override(self, current_pos):
        cx, cy = current_pos
        tx, ty = self.target

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
            if (nx, ny) in self.obstacles:
                if thickness == 0: 
                    first_wall = (nx, ny)
                thickness += 1
            else:
                if thickness == 1:
                    self.remove_obstacle(*first_wall)
                    return {"action": "shoot", "wall": first_wall}
                elif thickness > 1:
                    return {"action": "vault", "landing_zone": (nx, ny), "thickness": thickness}
            nx += dx
            ny += dy

        if thickness > 0:
            self.remove_obstacle(*first_wall)
            return {"action": "shoot", "wall": first_wall}
            
        return None