<div align="center">
  
# 🚁 Tactical Matrix: Autonomous Drone Swarm Simulation
**Bi-Directional WebSockets • Real-Time SLAM • React Three Fiber**

[![Python](https://img.shields.io/badge/Backend-Python_FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/Frontend-React_Three_Fiber-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![WebSockets](https://img.shields.io/badge/Network-WebSockets_60FPS-000000?style=for-the-badge&logo=socket.io&logoColor=white)](#)
[![Status](https://img.shields.io/badge/Status-Mission_Ready-4CAF50?style=for-the-badge)](#)

*A decoupled, dual-engine 3D simulation of an autonomous VTOL drone navigating a dynamically changing, hostile environment using real-time A* pathfinding.*

---
</div>

## ⚙️ The Dual-Engine Architecture

Heavy pathfinding math causes browser frame drops. To solve this, I engineered a decoupled system:

1. **The Python Brain (Headless Server):** Processes the grid, calculates A* distances, manages moving enemy AI, and tracks kinetic battery burn.
2. **The React Hologram (Dumb Terminal):** Listens via WebSockets to smoothly render 65,000-polygon 3D GLTF models based purely on telemetry data.
<img width="1074" height="606" alt="1" src="https://github.com/user-attachments/assets/258096d8-3347-4f2d-9564-c832449f2c62" />
<img width="1078" height="611" alt="2" src="https://github.com/user-attachments/assets/76e6a9fd-e059-4e61-9c62-d4d5ad51c1fd" />
<img width="1076" height="600" alt="7" src="https://github.com/user-attachments/assets/0bb09506-552f-47b3-ae6a-34686e4c981b" />

## 📡 Core Systems & Algorithmic Logic

### 1. Blind Exploration & SLAM
The VTOL drone operates with **zero prior knowledge** of the map. Using a simulated 2-block radius LiDAR scanner, it utilizes Simultaneous Localization and Mapping (SLAM) to update its internal memory arrays on-the-fly and dodge newly discovered anomalies.
<img width="1073" height="603" alt="3" src="https://github.com/user-attachments/assets/0aa8fb1d-0f9c-474e-8489-26d86f5b8c8b" />

### 2. Kinetic Energy Logistics
Movement has a cost. The system prioritizes drone survival:
* **The 40% Bailout Protocol:** If core power drops below 40%, the drone automatically aborts the mission, calculating the safest route back to Home Base (0,0) or the Midfield Relay (7,7).<img width="1076" height="604" alt="4" src="https://github.com/user-attachments/assets/dd3a0b61-d886-4c40-85d9-6fa0c4559b47" />


### 3. Tactical Overrides (Fail-Safes)
When the A* algorithm returns "No Path" because the drone is boxed in:
* **Thickness = 1 Block:** Fires a Magenta Railgun, deleting the entity from the server.
* **Thickness = 2+ Blocks:** Executes a dynamically calculated Z-axis High-Altitude Vault to leap over the barricade.
<img width="1072" height="600" alt="5" src="https://github.com/user-attachments/assets/ad8dd8d5-1c71-4f4c-8ec9-ecbbcbf07ecc" />

## 📼 The VCR Black Box System (Advanced Debugging)
To debug complex race conditions, I built a custom telemetry logging array. Every WebSocket ping, UI click, and enemy spawn is stamped with a Unix timestamp. On replay, the system wipes the grid and recreates the exact timeline with millisecond accuracy—without pinging the
server again. <img width="1075" height="596" alt="6" src="https://github.com/user-attachments/assets/ea740259-2f4c-482a-8c51-ee1a0648da5c" />

---

## 🚀 EXPANSION: Phase 5 (Cyber-City Manhunt)
**Volumetric Z-Axis Pathfinding • 3D WebGL Rendering • Autonomous Manhunt AI**

*Swarm Matrix has officially evolved from a 2D tactical plane into a fully realized 3D Volumetric Cyber-City.*

### 📐 1. Volumetric Intelligence Core
* **[X, Y, Z] A* Pathfinding:** Upgraded from a flat grid to a full 3D matrix. Drones now mathematically calculate vertical ascents to navigate over multi-story skyscrapers.
* **Ray-Cast Targeting:** Combat logic utilizes 3D vector-snapping to fire lasers down narrow alleys or up at targets positioned on rooftops.
* **Z-Axis Anomaly Movement:** Dynamic threats (Demons) autonomously scale buildings and drop into alleyways without clipping below the physical bounds.

### 📡 2. Autonomous Command Logic
* **Dynamic Patrol & Acquisition:** Alpha (Scout) patrols randomized 3D sectors using simulated LiDAR. Upon detecting the VIP within a 3-block radius, it aborts patrol, locks on, and signals `"SUSPECT APPREHENDED."`
* **Smart Escort Logic:** Bravo (Heavy) strictly targets biological anomalies, ignoring physical infrastructure to preserve kinetic battery.

### 🕶️ 3. Holographic Renderer Upgrades
* **Real-Time World Building:** Users can click to build skyscrapers, or activate the **"Tetris & Sniper" Chaos Engines** to autonomously drop randomized building blocks from the sky while drones adapt flight paths in real-time.
* **Fog of War / LiDAR Reveal:** The city begins as dark wireframes. As Alpha's LiDAR hits coordinates, materials dynamically transform into illuminated, solid blocks using additive blending shaders.
