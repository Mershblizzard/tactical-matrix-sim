# 🛰️ TACTICAL MATRIX v11.0: Autonomous AI Swarm Simulator

An enterprise-grade, 3D autonomous pathfinding simulator featuring a custom Python A* intelligence engine, real-time WebSocket telemetry, and a React Three Fiber fluid-dynamics frontend. 

Built as a testing sandbox for autonomous drone behavior, this engine forces the AI to dynamically evaluate environmental threats, calculate obstacle density, and seamlessly switch between evasive flight maneuvers and offensive breaching protocols.

## 🧠 Core Intelligence Features

* **Greedy Proximity Pathfinding:** The AI does not blindly surrender when trapped. It calculates the closest reachable node, physically approaches the barricade, and evaluates the blockage face-to-face.
* **Dynamic Z-Axis Vaulting:** If an obstacle is multi-layered (>1 block thick), the AI calculates the depth of the barrier and triggers a mathematically precise parabolic vault over the structure using React Spring fluid dynamics.
* **The Railgun Protocol:** If an obstacle is exactly 1-block thick, the AI opts for speed over evasion. It fires a targeted breach, instantly deleting the obstacle from the server memory and the 3D visual matrix, maintaining forward momentum.

## 🎛️ Command & Control (C2) Dashboard

The frontend serves as a complete Director's Sandbox, giving the user God-Mode control over the simulation parameters:

* **The Time Machine (Deterministic Replay):** The React frontend stores a perfect memory snapshot of the custom maze upon mission start. Clicking `REPLAY` instantly wipes the board, rebuilds the exact custom maze from memory, teleports the drone to `[0,0]`, and auto-launches the simulation.
* **7-Gear Throttle Control:** Dynamically adjust the Python server's tick rate in real-time, scaling from 4x Slow-Motion for tactical debugging to 4x Overdrive for high-speed stress testing.
* **God's Eye Cinematic Gimbal:** A custom camera anchor that permanently frames the 15x15 grid while subtly tracking the drone's vector, ensuring zero blind spots.
* **Full Override Capability:** Manual `Return to Base`, `Reset Drone`, `Clear Anomalies`, `Manual Jump`, and `Manual Shoot` functions wired directly into the backend state machine.

## 🌪️ The Dual Chaos Engines (Stress Testing)

To truly test the AI, the C2 Dashboard features two predictive hostility algorithms:
1. **Sniper Chaos (1-Block Strikes):** Rapidly drops single concrete pillars exactly one block ahead of the drone's current trajectory, actively forcing the AI to engage its Railgun protocol at high speeds.
2. **Tetris Chaos (Heavy Barricades):** Calculates the drone's forward vector and drops complex, multi-layered geometric shapes (L-Shapes, T-Shapes, 2x2 Cubes) directly into its path, forcing the AI to rapidly calculate Z-Axis Vault arcs.

## 🛠️ The Tech Stack

* **Backend Brain:** Python, FastAPI, Uvicorn, Custom A* Heuristics.
* **Neural Link:** Full-Duplex WebSockets (Real-time `[X, Altitude, Z]` telemetry).
* **Frontend Hologram:** React, Vite, Three.js, React Three Fiber, React Drei.
* **Physics Engine:** React Spring (Mass, Tension, and Friction-based fluid animation).

## 🚀 How to Boot the Matrix

**1. Ignite the Brain (Terminal 1)**
```bash
# Navigate to the root folder
python -m uvicorn server:app --reload
2. Initialize the Hologram (Terminal 2)

Bash
cd frontend
npm run dev
Open http://localhost:5173/ in your browser. Build your maze. Hit Play.


***
