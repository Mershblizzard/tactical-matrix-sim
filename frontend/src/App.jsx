import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

// --- NEW: THE RAILGUN LASER BEAM ---
function LaserBeam({ start, end }) {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const distance = startVec.distanceTo(endVec);
  const position = startVec.clone().lerp(endVec, 0.5);
  
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.lookAt(endVec);
      ref.current.rotateX(Math.PI / 2);
    }
  }, [endVec]);

  return (
    <mesh position={position} ref={ref}>
      <cylinderGeometry args={[0.08, 0.08, distance, 8]} />
      <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={6.0} toneMapped={false} />
    </mesh>
  );
}

function VTOLScout({ position }) {
  const { pos } = useSpring({ pos: position, config: { mass: 1, tension: 250, friction: 18 } });
  const { scene } = useGLTF('/vtol_air_taxi.glb');
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child.isMesh) {
        const name = child.name.toLowerCase();
        const isEngine = name.includes('prop') || name.includes('rotor') || name.includes('blade') || name.includes('fan') || name.includes('engine');
        child.material = new THREE.MeshStandardMaterial({
          color: "#00ffcc", emissive: "#00ffcc", emissiveIntensity: isEngine ? 3.0 : 1.5, wireframe: !isEngine, toneMapped: false
        });
      }
    });
    return clone;
  }, [scene]);
  return <animated.mesh position={pos}><primitive object={clonedScene} scale={[0.1, 0.1, 0.1]} position={[0, 0.2, 0]} /></animated.mesh>;
}

function DemonicObstacle({ position, isDiscovered }) {
  const { pos } = useSpring({ pos: position, config: { mass: 1, tension: 150, friction: 20 } }); 
  const { scene } = useGLTF('/demonic_horned_horror_knight.glb');
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    const neonMaterial = new THREE.MeshStandardMaterial({
      color: "#ff003c", emissive: "#ff003c", emissiveIntensity: isDiscovered ? 4.0 : 0.4, 
      wireframe: true, transparent: true, opacity: isDiscovered ? 1.0 : 0.15, toneMapped: false
    });
    clone.traverse((child) => { if (child.isMesh) child.material = neonMaterial; });
    return clone;
  }, [scene, isDiscovered]);
  return <animated.mesh position={pos}><primitive object={clonedScene} scale={[2.5, 2.5, 2.5]} position={[0, 0.1, 0]} /></animated.mesh>;
}

function HologramWall({ position, baseColor, glowColor, isDiscovered }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color={baseColor} transparent={true} opacity={isDiscovered ? 0.7 : 0.35} emissive={glowColor} emissiveIntensity={isDiscovered ? 1.8 : 0.8} wireframe={!isDiscovered} depthWrite={false} toneMapped={false} />
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
  const [battery, setBattery] = useState(100.0);
  
  // THE NEW LASER STATE
  const [laserBeam, setLaserBeam] = useState(null);

  const [staticWalls, setStaticWalls] = useState([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [10, 8], [10, 9], [10, 10], [11, 10], [12, 10]]);
  const [dynamicWalls, setDynamicWalls] = useState([]);
  const [demonWalls, setDemonWalls] = useState([]);
  const [discoveredWalls, setDiscoveredWalls] = useState([]);
  const [missionMemory, setMissionMemory] = useState({ walls: [], demons: [] }); 
  
  const [isRunning, setIsRunning] = useState(false);
  const [isVCRMode, setIsVCRMode] = useState(false); 
  const [isHeavyChaosOn, setIsHeavyChaosOn] = useState(false);
  const [isSniperChaosOn, setIsSniperChaosOn] = useState(false);
  
  const speedMultipliers = [0.25, 0.33, 0.5, 1.0, 2.0, 3.0, 4.0];
  const speedLabels = ["SLOW 4x", "SLOW 3x", "SLOW 2x", "NORMAL 1x", "FAST 2x", "FAST 3x", "FAST 4x"];
  const [speedIdx, setSpeedIdx] = useState(3); 
  
  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  const isVCRModeRef = useRef(isVCRMode);
  useEffect(() => { isVCRModeRef.current = isVCRMode; }, [isVCRMode]);
  
  const blackBox = useRef([]);
  const vcrTimeouts = useRef([]);
  const wsRef = useRef(null);
  const dronePosRef = useRef([0, 0, 0]);
  const targetPos = [14, 0, 14]; const startPos = [0, 0, 0]; const relayPos = [7, 0, 7]; const gridCenter = 7; 

  useEffect(() => { dronePosRef.current = dronePos; }, [dronePos]);

  const processWsData = (data) => {
    if (data.battery !== undefined) setBattery(data.battery);
    if (data.demons !== undefined) setDemonWalls(data.demons); 

    if (data.clear_walls) {
      setDynamicWalls([]); setDemonWalls([]); setDiscoveredWalls([]); 
      setStaticWalls([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [10, 8], [10, 9], [10, 10], [11, 10], [12, 10]]);
    }
    if (data.clear_memory) setDiscoveredWalls([]); 

    if (data.discovered_walls) {
      setDiscoveredWalls(prev => {
        const newSet = [...prev];
        data.discovered_walls.forEach(newWall => {
          if (!newSet.some(w => w[0] === newWall[0] && w[1] === newWall[1])) newSet.push(newWall);
        });
        return newSet;
      });
    }

    if (data.drone_position) {
      setDronePos([data.drone_position[0], data.altitude !== undefined ? data.altitude : 0, data.drone_position[1]]);
    } 
    
    if (data.status) {
      setStatus(data.status);
      if (data.status.includes("SECURED") || data.status.includes("FAILURE") || data.status.includes("DEPLETED") || data.status.includes("AWAITING ORDERS")) setIsRunning(false);
      
      // TRIGGER THE LASER EFFECT!
      if (data.destroyed_wall) {
        const [dx, dy] = data.destroyed_wall;
        
        // Spawn the laser from the drone to the target block
        setLaserBeam({ 
          start: [dronePosRef.current[0], 0.5, dronePosRef.current[2]], 
          end: [dx, 0.5, dy] 
        });
        
        // Erase the laser after 400 milliseconds
        setTimeout(() => setLaserBeam(null), 400);

        setStaticWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy)));
        setDynamicWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy)));
      }
    }
  };

  useEffect(() => {
    wsRef.current = new WebSocket("ws://127.0.0.1:8000/radar");
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'ws', data, time: Date.now() });
      if (!isVCRModeRef.current) processWsData(data);
    };
    return () => wsRef.current.close();
  }, []);

  const sendCommand = (action, value = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "command", action, value }));
  };

  const handleFloorClick = (event) => {
    const clickX = Math.round(event.point.x); const clickZ = Math.round(event.point.z);
    const isNearTarget = Math.abs(clickX - targetPos[0]) <= 1 && Math.abs(clickZ - targetPos[2]) <= 1;
    const isNearRelay = clickX === relayPos[0] && clickZ === relayPos[2];
    if (clickX >= 0 && clickX <= 14 && clickZ >= 0 && clickZ <= 14 && !isNearTarget && !isNearRelay) {
      const isOccupied = [...staticWalls, ...dynamicWalls, ...demonWalls].some(w => w[0] === clickX && w[1] === clickZ);
      if (!isOccupied && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "obstacle", x: clickX, y: clickZ }));
        setDynamicWalls((prev) => [...prev, [clickX, clickZ]]);
        if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'chaos', data: {x: clickX, y: clickZ}, time: Date.now() });
      }
    }
  };

  const handleSpeedChange = (direction) => {
    const newIdx = Math.max(0, Math.min(speedMultipliers.length - 1, speedIdx + direction));
    setSpeedIdx(newIdx); sendCommand("set_speed", speedMultipliers[newIdx]);
  };

  const handleDropThreat = () => {
    if (demonWalls.length >= 4) { setStatus("MAXIMUM THREAT CAPACITY REACHED (4/4)."); return; }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let dropX, dropZ, isOccupied, isBaseOrRelay, attempts = 0;
      do {
        dropX = Math.floor(Math.random() * 12) + 2; 
        dropZ = Math.floor(Math.random() * 12) + 2; 
        isOccupied = [...staticWalls, ...dynamicWalls, ...demonWalls].some(w => w[0] === dropX && w[1] === dropZ);
        isBaseOrRelay = (dropX === 0 && dropZ === 0) || (dropX === 7 && dropZ === 7) || (dropX === 14 && dropZ === 14);
        attempts++;
      } while ((isOccupied || isBaseOrRelay) && attempts < 50);

      if (!isOccupied && !isBaseOrRelay) {
        wsRef.current.send(JSON.stringify({ type: "drop_demon", x: dropX, y: dropZ }));
      }
    }
  };

  const handlePlayPause = () => {
    if (isVCRMode) return; 
    if (!isRunning) {
      if (dronePos[0] === 0 && dronePos[2] === 0) { setMissionMemory({ walls: [...dynamicWalls], demons: [...demonWalls] }); blackBox.current = []; }
      sendCommand("start_mission");
    } else sendCommand("pause_mission");
    setIsRunning(!isRunning);
  };

  const handleResetDrone = () => {
    if (isVCRMode) { vcrTimeouts.current.forEach(clearTimeout); vcrTimeouts.current = []; setIsVCRMode(false); }
    sendCommand("reset_drone");
  };

  const handleReplay = () => {
    if (blackBox.current.length === 0) { setStatus("NO FLIGHT DATA RECORDED YET."); return; }
    sendCommand("pause_mission"); setIsRunning(false); setIsVCRMode(true);
    vcrTimeouts.current.forEach(clearTimeout); vcrTimeouts.current = [];
    setDronePos([0, 0, 0]); setBattery(100); setStatus("⏪ VCR SYSTEM INITIATED..."); setDiscoveredWalls([]);
    setDynamicWalls([...missionMemory.walls]); setDemonWalls([...missionMemory.demons]);
    setStaticWalls([[3, 3], [3, 4], [3, 5], [4, 5], [5, 5], [10, 8], [10, 9], [10, 10], [11, 10], [12, 10]]);
    const startTime = blackBox.current[0].time;
    blackBox.current.forEach((log, index) => {
      const delay = log.time - startTime;
      const t = setTimeout(() => {
        if (log.type === 'ws') processWsData(log.data);
        else if (log.type === 'chaos') setDynamicWalls(prev => [...prev, [log.data.x, log.data.y]]);
        if (index === blackBox.current.length - 1) setTimeout(() => { setIsVCRMode(false); setStatus("✅ VCR PLAYBACK COMPLETE."); }, 1000);
      }, delay);
      vcrTimeouts.current.push(t);
    });
  };

  useEffect(() => {
    let heavyTimer;
    if (isHeavyChaosOn && isRunning && !isVCRMode) {
      heavyTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const cx = Math.floor(dronePosRef.current[0]); const cz = Math.floor(dronePosRef.current[2]);
          const dirX = targetPos[0] > cx ? 1 : (targetPos[0] < cx ? -1 : 0); const dirZ = targetPos[2] > cz ? 1 : (targetPos[2] < cz ? -1 : 0);
          const dropX = Math.min(14, Math.max(0, cx + (dirX * 2))); const dropZ = Math.min(14, Math.max(0, cz + (dirZ * 2)));
          const shapes = [[[0,0], [1,0], [2,0], [3,0]], [[0,0], [1,0], [0,1], [1,1]], [[0,0], [1,0], [2,0], [1,1]], [[0,0], [0,1], [0,2], [1,2]]];
          const selectedShape = shapes[Math.floor(Math.random() * shapes.length)];
          selectedShape.forEach(offset => {
            const nx = dropX + offset[0]; const nz = dropZ + offset[1];
            const isOccupied = [...staticWalls, ...dynamicWalls, ...demonWalls].some(w => w[0] === nx && w[1] === nz);
            if (nx >= 0 && nx <= 14 && nz >= 0 && nz <= 14 && !(Math.abs(nx-targetPos[0])<=1 && Math.abs(nz-targetPos[2])<=1) && !(nx===0&&nz===0) && !isOccupied) {
              wsRef.current.send(JSON.stringify({ type: "obstacle", x: nx, y: nz }));
              setDynamicWalls(prev => [...prev, [nx, nz]]);
              if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'chaos', data: {x: nx, y: nz}, time: Date.now() });
            }
          });
        }
      }, 1500);
    }
    return () => clearInterval(heavyTimer);
  }, [isHeavyChaosOn, isRunning, isVCRMode]);

  useEffect(() => {
    let sniperTimer;
    if (isSniperChaosOn && isRunning && !isVCRMode) {
      sniperTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const cx = Math.floor(dronePosRef.current[0]); const cz = Math.floor(dronePosRef.current[2]);
          const dirX = targetPos[0] > cx ? 1 : (targetPos[0] < cx ? -1 : 0); const dirZ = targetPos[2] > cz ? 1 : (targetPos[2] < cz ? -1 : 0);
          const dropX = Math.min(14, Math.max(0, cx + dirX)); const dropZ = Math.min(14, Math.max(0, cz + dirZ));
          const isOccupied = [...staticWalls, ...dynamicWalls, ...demonWalls].some(w => w[0] === dropX && w[1] === dropZ);
          if (!(Math.abs(dropX-targetPos[0])<=1 && Math.abs(dropZ-targetPos[2])<=1) && !(dropX===0&&dropZ===0) && !isOccupied) {
            wsRef.current.send(JSON.stringify({ type: "obstacle", x: dropX, y: dropZ }));
            setDynamicWalls(prev => [...prev, [dropX, dropZ]]);
            if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'chaos', data: {x: dropX, y: dropZ}, time: Date.now() });
          }
        }
      }, 800);
    }
    return () => clearInterval(sniperTimer);
  }, [isSniperChaosOn, isRunning, isVCRMode]);

  const checkDiscovered = (x, y) => discoveredWalls.some(w => w[0] === x && w[1] === y);
  const btnStyle = { background: 'rgba(10, 10, 10, 0.7)', color: '#00ffcc', border: '1px solid #004444', padding: '8px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', backdropFilter: 'blur(5px)', width: '100%', textAlign: 'center', transition: 'all 0.2s', fontWeight: 'bold' };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {isVCRMode && <div style={{ position: 'absolute', top: 20, right: 20, color: '#ff003c', zIndex: 10, fontFamily: 'monospace', fontSize: '16px', animation: 'pulse 1s infinite', border: '1px solid #ff003c', padding: '10px', background: 'rgba(255,0,0,0.1)' }}>● VCR PLAYBACK ACTIVE</div>}
      
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#00ffcc', zIndex: 10, fontFamily: 'monospace', pointerEvents: 'none', width: '300px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: '2px', textShadow: '0 0 10px #00ffcc' }}>TACTICAL MATRIX v15.2</h1>
        <p style={{ margin: '5px 0', opacity: 0.8, fontSize: '12px', color: '#ffaa00' }}>STATUS: {status}</p>
        <div style={{ marginTop: '15px' }}>
          {/* UPDATED UI COLORS TO 40% THRESHOLD */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: battery > 40 ? '#00ffcc' : '#ff003c', marginBottom: '4px', fontWeight: 'bold' }}><span>CORE ENERGY</span><span>{Math.max(0, battery).toFixed(1)}%</span></div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(20,20,20,0.8)', border: '1px solid #333', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${Math.max(0, battery)}%`, height: '100%', background: battery > 40 ? '#00ffcc' : '#ff003c', transition: 'width 0.3s ease' }} /></div>
        </div>
      </div>
      
      <div style={{ position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, fontFamily: 'monospace', width: '180px' }}>
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- MISSION CONTROL ---</div>
        <button onClick={handlePlayPause} style={{ ...btnStyle, background: isRunning ? 'rgba(0, 255, 204, 0.2)' : 'rgba(10, 10, 10, 0.7)', fontSize: '14px', padding: '12px', color: isRunning ? '#00ffff' : '#00ffcc', borderColor: isRunning ? '#00ffff' : '#004444' }}>{isRunning ? '⏸ PAUSE MISSION' : '▶ START MISSION'}</button>
        <button onClick={handleReplay} style={{ ...btnStyle, color: '#00aaff', borderColor: '#00aaff' }}>⏪ REPLAY TIMELINE</button>
        
        <div style={{ display: 'flex', gap: '5px', width: '100%', marginTop: '5px' }}>
          <button onClick={() => handleSpeedChange(-1)} style={{ ...btnStyle, width: '30px' }}>-</button>
          <div style={{ ...btnStyle, cursor: 'default', flex: 1, color: '#00ffff', borderColor: '#00ffff', padding: '8px 0' }}>{speedLabels[speedIdx]}</div>
          <button onClick={() => handleSpeedChange(1)} style={{ ...btnStyle, width: '30px' }}>+</button>
        </div>
        
        <button onClick={() => { sendCommand("rtb"); setIsRunning(true); }} style={{ ...btnStyle, color: '#bb66ff', borderColor: '#bb66ff' }}>⮌ RETURN TO BASE</button>
        <button onClick={handleResetDrone} style={{ ...btnStyle, color: '#fff', borderColor: '#fff' }}>⟳ RESET DRONE</button>
        <button onClick={() => { setDynamicWalls([]); setDemonWalls([]); sendCommand("clear_walls"); }} style={{ ...btnStyle, color: '#ff4400', borderColor: '#ff4400' }}>⎚ CLEAR ANOMALIES</button>
      </div>

      <div style={{ position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, fontFamily: 'monospace', width: '180px' }}>
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- THREAT DEPLOYMENT ---</div>
        <button onClick={handleDropThreat} style={{ ...btnStyle, color: '#ff003c', borderColor: '#ff003c', background: 'rgba(255, 0, 60, 0.1)' }}>⚠ DROP DEMON KNIGHT</button>
        
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '15px', letterSpacing: '2px'}}>--- CHAOS ENGINES ---</div>
        <button onClick={() => setIsSniperChaosOn(!isSniperChaosOn)} style={{ ...btnStyle, background: isSniperChaosOn ? 'rgba(255, 170, 0, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isSniperChaosOn ? '#ffaa00' : '#555', borderColor: isSniperChaosOn ? '#ffaa00' : '#333' }}>{isSniperChaosOn ? '■ SNIPER: ON' : '▶ SNIPER: OFF'}</button>
        <button onClick={() => setIsHeavyChaosOn(!isHeavyChaosOn)} style={{ ...btnStyle, background: isHeavyChaosOn ? 'rgba(255, 0, 60, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isHeavyChaosOn ? '#ff003c' : '#555', borderColor: isHeavyChaosOn ? '#ff003c' : '#333' }}>{isHeavyChaosOn ? '■ TETRIS: ON' : '▶ TETRIS: OFF'}</button>

        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '15px', letterSpacing: '2px'}}>--- MANUAL OVERRIDE ---</div>
        <button onClick={() => sendCommand("manual_shoot")} style={{ ...btnStyle, color: '#aaa', borderColor: '#444' }}>◎ MANUAL SHOOT</button>
        <button onClick={() => sendCommand("manual_jump")} style={{ ...btnStyle, color: '#aaa', borderColor: '#444' }}>⇡ MANUAL JUMP</button>
      </div>

      <Canvas camera={{ position: [20, 30, 25], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[7, 20, 7]} intensity={400} color="#00ffcc" distance={80} />
        <CinematicGimbal targetPos={dronePos} />
        <gridHelper args={[15, 15, "#00ffcc", "#111111"]} position={[gridCenter, -0.5, gridCenter]} />
        <Suspense fallback={null}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridCenter, -0.5, gridCenter]} onClick={handleFloorClick}>
            <planeGeometry args={[15, 15]} />
            <meshBasicMaterial visible={false} /> 
          </mesh>
          <VTOLScout position={dronePos} />
          
          {/* RENDERS THE LASER BEAM IF IT EXISTS */}
          {laserBeam && <LaserBeam start={laserBeam.start} end={laserBeam.end} />}

          <mesh position={[targetPos[0], 0, targetPos[2]]}><boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="#ff003c" emissive="#ff003c" emissiveIntensity={2} toneMapped={false}/></mesh>
          <mesh position={[startPos[0], -0.4, startPos[2]]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#bb66ff" emissive="#bb66ff" emissiveIntensity={1} toneMapped={false} rotation={[-Math.PI/2, 0, 0]}/></mesh>
          <mesh position={[relayPos[0], -0.39, relayPos[2]]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={1.5} toneMapped={false} rotation={[-Math.PI/2, 0, 0]}/></mesh>
          {staticWalls.map((obs, index) => <HologramWall key={`hard-${index}`} position={[obs[0], 0.5, obs[1]]} baseColor="#1a1a1a" glowColor="#004444" isDiscovered={checkDiscovered(obs[0], obs[1])} />)}
          {dynamicWalls.map((wall, index) => <HologramWall key={`dyn-${index}`} position={[wall[0], 0.5, wall[1]]} baseColor="#ff4400" glowColor="#ff2200" isDiscovered={checkDiscovered(wall[0], wall[1])} />)}
          {demonWalls.map((obs, index) => <DemonicObstacle key={`demon-${index}`} position={[obs[0], 0.5, obs[1]]} isDiscovered={checkDiscovered(obs[0], obs[1])} />)}
        </Suspense>
      </Canvas>
    </div>
  );
}