import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

function TacticalDrone({ position }) {
  const { pos } = useSpring({ pos: position, config: { mass: 1, tension: 250, friction: 18 } });
  return (
    <animated.mesh position={pos}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2.5} toneMapped={false}/>
    </animated.mesh>
  );
}

function HologramWall({ position, color, emissiveColor, opacity = 0.5 }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.1} transparent={true} opacity={opacity} emissive={emissiveColor} emissiveIntensity={1.8} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function CinematicGimbal({ targetPos }) {
  const controlsRef = useRef();
  useFrame(() => {
    if (controlsRef.current) {
      const gridCenter = new THREE.Vector3(7, 0, 7);
      const droneVec = new THREE.Vector3(targetPos[0], 0, targetPos[1]);
      const lookTarget = gridCenter.lerp(droneVec, 0.25); 
      controlsRef.current.target.lerp(lookTarget, 0.05);
      controlsRef.current.update();
    }
  });
  return <OrbitControls ref={controlsRef} makeDefault maxDistance={50} maxPolarAngle={Math.PI / 2.2} />;
}

export default function App() {
  const [dronePos, setDronePos] = useState([0, 0, 0]);
  const [status, setStatus] = useState("Awaiting Telemetry...");
  
  const [staticWalls, setStaticWalls] = useState([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [10, 8], [10, 9], [10, 10], [11, 10], [12, 10]]);
  const [dynamicWalls, setDynamicWalls] = useState([]);
  
  const [missionMemory, setMissionMemory] = useState([]); 
  
  const [isRunning, setIsRunning] = useState(false);
  const [isHeavyChaosOn, setIsHeavyChaosOn] = useState(false);
  const [isSniperChaosOn, setIsSniperChaosOn] = useState(false);
  
  const speedMultipliers = [0.25, 0.33, 0.5, 1.0, 2.0, 3.0, 4.0];
  const speedLabels = ["SLOW 4x", "SLOW 3x", "SLOW 2x", "NORMAL 1x", "FAST 2x", "FAST 3x", "FAST 4x"];
  const [speedIdx, setSpeedIdx] = useState(3); 
  
  const wsRef = useRef(null);
  const dronePosRef = useRef([0, 0, 0]);
  
  const targetPos = [14, 0, 14]; 
  const startPos = [0, 0, 0];
  const gridCenter = 7; 

  useEffect(() => { dronePosRef.current = dronePos; }, [dronePos]);

  useEffect(() => {
    wsRef.current = new WebSocket("ws://127.0.0.1:8000/radar");
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.clear_walls) {
        setDynamicWalls([]);
        setStaticWalls([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [10, 8], [10, 9], [10, 10], [11, 10], [12, 10]]);
      }

      if (data.drone_position) {
        const alt = data.altitude !== undefined ? data.altitude : 0;
        setDronePos([data.drone_position[0], alt, data.drone_position[1]]);
      } 
      
      if (data.status) {
        setStatus(data.status);
        if (data.status.includes("SECURED") || data.status.includes("FAILURE") || data.status.includes("RESET")) {
          setIsRunning(false);
        }
        if (data.destroyed_wall) {
          const [dx, dy] = data.destroyed_wall;
          setStaticWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy)));
          setDynamicWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy)));
        }
      }
    };
    return () => wsRef.current.close();
  }, []);

  const handleFloorClick = (event) => {
    const clickX = Math.round(event.point.x);
    const clickZ = Math.round(event.point.z);
    const isNearTarget = Math.abs(clickX - targetPos[0]) <= 1 && Math.abs(clickZ - targetPos[2]) <= 1;
    if (clickX >= 0 && clickX <= 14 && clickZ >= 0 && clickZ <= 14 && !isNearTarget) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "obstacle", x: clickX, y: clickZ }));
        setDynamicWalls((prev) => [...prev, [clickX, clickZ]]);
      }
    }
  };

  const sendCommand = (action, value = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", action, value }));
    }
  };

  const handleSpeedChange = (direction) => {
    const newIdx = Math.max(0, Math.min(speedMultipliers.length - 1, speedIdx + direction));
    setSpeedIdx(newIdx);
    sendCommand("set_speed", speedMultipliers[newIdx]);
  };

  const handlePlayPause = () => {
    if (!isRunning) {
      if (dronePos[0] === 0 && dronePos[2] === 0) {
        setMissionMemory([...dynamicWalls]);
      }
      sendCommand("start_mission");
    } else {
      sendCommand("pause_mission");
    }
    setIsRunning(!isRunning);
  };

  const handleReplay = () => {
    sendCommand("clear_walls");
    setDynamicWalls([...missionMemory]);
    missionMemory.forEach(wall => {
      sendCommand("obstacle", null); 
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "obstacle", x: wall[0], y: wall[1] }));
      }
    });
    sendCommand("reset_drone");
    setTimeout(() => {
      sendCommand("start_mission");
      setIsRunning(true);
    }, 500); 
  };

  // --- CHAOS ENGINES ---
  useEffect(() => {
    let heavyTimer;
    if (isHeavyChaosOn && isRunning) {
      heavyTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const cx = Math.floor(dronePosRef.current[0]);
          const cz = Math.floor(dronePosRef.current[2]);
          const dirX = targetPos[0] > cx ? 1 : (targetPos[0] < cx ? -1 : 0);
          const dirZ = targetPos[2] > cz ? 1 : (targetPos[2] < cz ? -1 : 0);
          const dropX = Math.min(14, Math.max(0, cx + (dirX * 2)));
          const dropZ = Math.min(14, Math.max(0, cz + (dirZ * 2)));

          const shapes = [[[0,0], [1,0], [2,0], [3,0]], [[0,0], [1,0], [0,1], [1,1]], [[0,0], [1,0], [2,0], [1,1]], [[0,0], [0,1], [0,2], [1,2]]];
          const selectedShape = shapes[Math.floor(Math.random() * shapes.length)];
          
          selectedShape.forEach(offset => {
            const nx = dropX + offset[0];
            const nz = dropZ + offset[1];
            const isNearTarget = Math.abs(nx - targetPos[0]) <= 1 && Math.abs(nz - targetPos[2]) <= 1;
            const isNearStart = nx === 0 && nz === 0;
            if (nx >= 0 && nx <= 14 && nz >= 0 && nz <= 14 && !isNearTarget && !isNearStart) {
              wsRef.current.send(JSON.stringify({ type: "obstacle", x: nx, y: nz }));
              setDynamicWalls(prev => [...prev, [nx, nz]]);
            }
          });
        }
      }, 1500);
    }
    return () => clearInterval(heavyTimer);
  }, [isHeavyChaosOn, isRunning]);

  useEffect(() => {
    let sniperTimer;
    if (isSniperChaosOn && isRunning) {
      sniperTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const cx = Math.floor(dronePosRef.current[0]);
          const cz = Math.floor(dronePosRef.current[2]);
          const dirX = targetPos[0] > cx ? 1 : (targetPos[0] < cx ? -1 : 0);
          const dirZ = targetPos[2] > cz ? 1 : (targetPos[2] < cz ? -1 : 0);
          const dropX = Math.min(14, Math.max(0, cx + dirX));
          const dropZ = Math.min(14, Math.max(0, cz + dirZ));

          const isNearTarget = Math.abs(dropX - targetPos[0]) <= 1 && Math.abs(dropZ - targetPos[2]) <= 1;
          const isNearStart = dropX === 0 && dropZ === 0;
          if (!isNearTarget && !isNearStart) {
            wsRef.current.send(JSON.stringify({ type: "obstacle", x: dropX, y: dropZ }));
            setDynamicWalls(prev => [...prev, [dropX, dropZ]]);
          }
        }
      }, 800);
    }
    return () => clearInterval(sniperTimer);
  }, [isSniperChaosOn, isRunning]);

  const btnStyle = {
    background: 'rgba(10, 10, 10, 0.7)', color: '#00ffcc', border: '1px solid #004444', 
    padding: '8px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', 
    letterSpacing: '1px', textTransform: 'uppercase', backdropFilter: 'blur(5px)',
    width: '100%', textAlign: 'center', transition: 'all 0.2s', fontWeight: 'bold'
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#00ffcc', zIndex: 10, fontFamily: 'monospace', pointerEvents: 'none' }}>
        <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: '2px', textShadow: '0 0 10px #00ffcc' }}>TACTICAL MATRIX v11.0</h1>
        <p style={{ margin: '5px 0', opacity: 0.8, fontSize: '12px' }}>STATUS: {status}</p>
      </div>

      <div style={{ 
        position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)', 
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, fontFamily: 'monospace',
        width: '180px', maxHeight: '90vh', overflowY: 'auto'
      }}>
        
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- MISSION CONTROL ---</div>

        <button onClick={handlePlayPause} style={{ ...btnStyle, background: isRunning ? 'rgba(0, 255, 204, 0.2)' : 'rgba(10, 10, 10, 0.7)', fontSize: '14px', padding: '12px' }}>
          {isRunning ? '⏸ PAUSE MISSION' : '▶ START MISSION'}
        </button>
        <button onClick={handleReplay} style={{ ...btnStyle, color: '#00aaff', borderColor: '#00aaff' }}>⏪ REPLAY TIMELINE</button>

        <div style={{ display: 'flex', gap: '5px', width: '100%', marginTop: '5px' }}>
          <button onClick={() => handleSpeedChange(-1)} style={{ ...btnStyle, width: '30px' }}>-</button>
          <div style={{ ...btnStyle, cursor: 'default', flex: 1, color: '#00ffff', borderColor: '#00ffff', padding: '8px 0' }}>{speedLabels[speedIdx]}</div>
          <button onClick={() => handleSpeedChange(1)} style={{ ...btnStyle, width: '30px' }}>+</button>
        </div>

        <button onClick={() => { sendCommand("rtb"); setIsRunning(true); }} style={{ ...btnStyle, color: '#bb66ff', borderColor: '#bb66ff' }}>⮌ RETURN TO BASE</button>
        <button onClick={() => sendCommand("reset_drone")} style={{ ...btnStyle, color: '#fff', borderColor: '#fff' }}>⟳ RESET DRONE</button>
        <button onClick={() => { setDynamicWalls([]); sendCommand("clear_walls"); }} style={{ ...btnStyle, color: '#ff4400', borderColor: '#ff4400' }}>⎚ CLEAR ANOMALIES</button>

        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- MANUAL OVERRIDE ---</div>
        
        <button onClick={() => sendCommand("manual_shoot")} style={{ ...btnStyle, color: '#aaa', borderColor: '#444' }}>◎ MANUAL SHOOT</button>
        <button onClick={() => sendCommand("manual_jump")} style={{ ...btnStyle, color: '#aaa', borderColor: '#444' }}>⇡ MANUAL JUMP</button>

        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- CHAOS ENGINES ---</div>

        <button onClick={() => setIsSniperChaosOn(!isSniperChaosOn)} style={{ ...btnStyle, background: isSniperChaosOn ? 'rgba(255, 170, 0, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isSniperChaosOn ? '#ffaa00' : '#555', borderColor: isSniperChaosOn ? '#ffaa00' : '#333' }}>
          {isSniperChaosOn ? '■ SNIPER (1-BLOCK): ON' : '▶ SNIPER (1-BLOCK): OFF'}
        </button>
        <button onClick={() => setIsHeavyChaosOn(!isHeavyChaosOn)} style={{ ...btnStyle, background: isHeavyChaosOn ? 'rgba(255, 0, 60, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isHeavyChaosOn ? '#ff003c' : '#555', borderColor: isHeavyChaosOn ? '#ff003c' : '#333' }}>
          {isHeavyChaosOn ? '■ TETRIS (MULTI): ON' : '▶ TETRIS (MULTI): OFF'}
        </button>

      </div>

      <Canvas camera={{ position: [20, 30, 25], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[7, 20, 7]} intensity={400} color="#00ffcc" distance={80} />
        <CinematicGimbal targetPos={dronePos} />
        <gridHelper args={[15, 15, "#00ffcc", "#111111"]} position={[gridCenter, -0.5, gridCenter]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridCenter, -0.5, gridCenter]} onClick={handleFloorClick}>
          <planeGeometry args={[15, 15]} />
          <meshBasicMaterial visible={false} /> 
        </mesh>
        <TacticalDrone position={dronePos} />
        
        <mesh position={[targetPos[0], 0, targetPos[2]]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="#ff003c" emissive="#ff003c" emissiveIntensity={2} toneMapped={false}/>
        </mesh>
        <mesh position={[startPos[0], -0.4, startPos[2]]}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshStandardMaterial color="#bb66ff" emissive="#bb66ff" emissiveIntensity={1} toneMapped={false} rotation={[-Math.PI/2, 0, 0]}/>
        </mesh>

        {staticWalls.map((obs, index) => (
          <HologramWall key={`hard-${index}`} position={[obs[0], 0.5, obs[1]]} color="#1a1a1a" emissiveColor="#004444" opacity={0.6} />
        ))}
        {dynamicWalls.map((wall, index) => (
          <HologramWall key={`dyn-${index}`} position={[wall[0], 0.5, wall[1]]} color="#ff4400" emissiveColor="#ff2200" opacity={0.7} />
        ))}
      </Canvas>
    </div>
  );
}