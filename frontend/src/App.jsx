import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

const pyToThree = (x, y, z) => [x, z - 0.5, y];

function ShatteredDebris({ position, onComplete }) {
  const groupRef = useRef();
  const fragments = useMemo(() => {
    return [
      { pos: [-0.25, 0.25, -0.25], vel: [-0.05, 0.08, -0.05], rot: [0.1, 0.2, 0.0] },
      { pos: [0.25, 0.25, -0.25], vel: [0.05, 0.08, -0.05], rot: [-0.1, 0.2, 0.1] },
      { pos: [-0.25, 0.25, 0.25], vel: [-0.05, 0.08, 0.05], rot: [0.1, -0.2, 0.2] },
      { pos: [0.25, 0.25, 0.25], vel: [0.05, 0.08, 0.05], rot: [-0.2, 0.1, -0.1] },
    ];
  }, []);

  const [opacity, setOpacity] = useState(1);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.position.x += fragments[i].vel[0]; child.position.y += fragments[i].vel[1]; child.position.z += fragments[i].vel[2];
        child.rotation.x += fragments[i].rot[0]; child.rotation.y += fragments[i].rot[1];
        fragments[i].vel[1] -= 0.005; 
      });
    }
  });

  useEffect(() => {
    const fadeTimer = setInterval(() => setOpacity(prev => Math.max(0, prev - 0.1)), 50);
    const killTimer = setTimeout(onComplete, 600); 
    return () => { clearInterval(fadeTimer); clearTimeout(killTimer); };
  }, [onComplete]);

  return (
    <group ref={groupRef} position={position}>
      {fragments.map((frag, idx) => (
        <mesh key={idx} position={frag.pos}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#ff5500" emissive="#ff2200" emissiveIntensity={1.5} transparent opacity={opacity} wireframe toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function LaserBeam({ start, end }) {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const distance = startVec.distanceTo(endVec);
  const position = startVec.clone().lerp(endVec, 0.5);
  const ref = useRef();
  useEffect(() => { if (ref.current) { ref.current.lookAt(endVec); ref.current.rotateX(Math.PI / 2); } }, [endVec]);
  return (
    <mesh position={position} ref={ref}>
      <cylinderGeometry args={[0.08, 0.08, distance, 8]} />
      <meshStandardMaterial color="#ffaa00" emissive="#ff5500" emissiveIntensity={8.0} toneMapped={false} />
    </mesh>
  );
}

function VTOLScout({ position }) {
  const { pos } = useSpring({ pos: position, config: { mass: 1, tension: 250, friction: 18 } });
  const { scene } = useGLTF('/vtol_air_taxi.glb');
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: "#00ffff", emissive: "#00ffff", emissiveIntensity: 3.5, wireframe: true, toneMapped: false });
    });
    return clone;
  }, [scene]);
  return (
    <animated.mesh position={pos}>
      <primitive object={clonedScene} scale={[0.1, 0.1, 0.1]} position={[0, 0.4, 0]} />
      <pointLight intensity={150} distance={20} color="#00ffff" position={[0, 1, 0]} />
    </animated.mesh>
  );
}

function GothicKnightBravo({ position }) {
  const { pos } = useSpring({ pos: position, config: { mass: 2, tension: 200, friction: 20 } });
  const { scene } = useGLTF('/winged_dark_gothic_knight_with_dragon_helmet.glb');
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    const neonMaterial = new THREE.MeshStandardMaterial({
      color: "#ffaa00", emissive: "#ffaa00", emissiveIntensity: 2.0, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    clone.traverse((child) => { if (child.isMesh) child.material = neonMaterial; });
    return clone;
  }, [scene]);
  return (
    <animated.mesh position={pos}>
      <primitive object={clonedScene} scale={[2.5, 2.5, 2.5]} position={[0, 0.4, 0]} />
      <pointLight intensity={80} distance={12} color="#ffaa00" position={[0, 1, 0]} />
    </animated.mesh>
  );
}

function DemonicObstacle({ position, isDiscovered }) {
  const { scene } = useGLTF('/demonic_horned_horror_knight.glb');
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    const neonMaterial = new THREE.MeshStandardMaterial({
      color: "#ff003c", emissive: "#ff003c", emissiveIntensity: isDiscovered ? 4.0 : 1.5, 
      wireframe: !isDiscovered, transparent: true, opacity: isDiscovered ? 1.0 : 0.4, toneMapped: false
    });
    clone.traverse((child) => { if (child.isMesh) child.material = neonMaterial; });
    return clone;
  }, [scene, isDiscovered]);
  return <mesh position={position}><primitive object={clonedScene} scale={[2.5, 2.5, 2.5]} position={[0, 0.4, 0]} /></mesh>;
}

// 💥 BUG FIX: Removed useSpring so the VIP perfectly snaps without bouncing! 💥
function TargetVIP({ position }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#ff003c" emissive="#ff003c" emissiveIntensity={3} toneMapped={false}/>
    </mesh>
  );
}

function CyberBuilding({ position, isDiscovered }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.95, 0.95, 0.95]} />
        <meshStandardMaterial 
          color={isDiscovered ? "#ff5500" : "#020202"} 
          emissive={isDiscovered ? "#aa3300" : "#000000"} 
          roughness={isDiscovered ? 0.3 : 0.1} 
          metalness={isDiscovered ? 0.8 : 0.9} 
        />
      </mesh>
      <mesh>
        <boxGeometry args={[0.98, 0.98, 0.98, 2, 2, 2]} />
        <meshBasicMaterial 
          color="#ff5500" wireframe={true} transparent={true} opacity={isDiscovered ? 0.9 : 0.15} 
          blending={isDiscovered ? THREE.NormalBlending : THREE.AdditiveBlending} depthWrite={isDiscovered ? true : false} 
        />
      </mesh>
    </group>
  );
}

function CinematicGimbal({ targetPos }) {
  const controlsRef = useRef();
  useFrame(() => {
    if (controlsRef.current) {
      const droneVec = new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2]);
      const lookTarget = droneVec.clone(); 
      controlsRef.current.target.lerp(lookTarget, 0.1);
      controlsRef.current.update();
    }
  });
  return <OrbitControls ref={controlsRef} makeDefault maxDistance={40} minDistance={5} maxPolarAngle={Math.PI / 1.5} />;
}

export default function App() {
  const localCityBlocks = useMemo(() => {
      const blocks = [];
      const city_data = [
          [2, 3, 2, 3, 6], [11, 12, 11, 12, 6], [8, 9, 2, 3, 4], [2, 3, 11, 12, 4], [6, 7, 6, 7, 4], 
          [1, 1, 6, 6, 2], [13, 13, 6, 6, 2], [6, 6, 1, 1, 2], [6, 6, 13, 13, 2]
      ];
      city_data.forEach(b => {
          for(let x=b[0]; x<=b[1]; x++) {
              for(let y=b[2]; y<=b[3]; y++) {
                  for(let z=1; z<=b[4]; z++) { blocks.push([x, y, z]); }
              }
          }
      });
      return blocks;
  }, []);

  const [alphaPos, setAlphaPos] = useState([0, 0.5, 0]); 
  const [alphaBattery, setAlphaBattery] = useState(100.0);
  const [bravoPos, setBravoPos] = useState([0, 0.5, 14]); 
  const [bravoBattery, setBravoBattery] = useState(100.0);

  const [isBravoActive, setIsBravoActive] = useState(false);
  const [vipPos, setVipPos] = useState([14, 0.5, 14]);

  const [status, setStatus] = useState("Awaiting Swarm Telemetry...");
  const [wsConnected, setWsConnected] = useState(false);
  const [laserBeam, setLaserBeam] = useState(null);
  const [shrapnel, setShatter] = useState([]);

  const [staticWalls, setStaticWalls] = useState(localCityBlocks);
  const [dynamicWalls, setDynamicWalls] = useState([]);
  const [demonWalls, setDemonWalls] = useState([]);
  const [discoveredWalls, setDiscoveredWalls] = useState([]);
  const [missionMemory, setMissionMemory] = useState({ walls: [], demons: [] }); 
  
  const [isRunning, setIsRunning] = useState(false);
  const [isVCRMode, setIsVCRMode] = useState(false); 
  const [isSniperChaosOn, setIsSniperChaosOn] = useState(false);
  const [isHeavyChaosOn, setIsHeavyChaosOn] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(3); 
  
  const speedMultipliers = [0.25, 0.33, 0.5, 1.0, 2.0, 3.0, 4.0];
  const speedLabels = ["SLOW 4x", "SLOW 3x", "SLOW 2x", "NORMAL 1x", "FAST 2x", "FAST 3x", "FAST 4x"];

  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  const isVCRModeRef = useRef(isVCRMode);
  useEffect(() => { isVCRModeRef.current = isVCRMode; }, [isVCRMode]);
  
  const blackBox = useRef([]);
  const vcrTimeouts = useRef([]);
  const wsRef = useRef(null);
  
  const alphaPosRef = useRef([0, 0.5, 0]);
  const bravoPosRef = useRef([0, 0.5, 14]);

  const startPos = [0, 0.01, 1]; 
  const bravoStartPos = [0, 0.01, 14]; 
  const gridCenter = 7; 

  useEffect(() => { alphaPosRef.current = alphaPos; }, [alphaPos]);
  useEffect(() => { bravoPosRef.current = bravoPos; }, [bravoPos]);

  const processWsData = (data) => {
    if (data.alpha_battery !== undefined) setAlphaBattery(data.alpha_battery);
    if (data.bravo_battery !== undefined) setBravoBattery(data.bravo_battery);
    if (data.demons !== undefined) setDemonWalls(data.demons); 
    if (data.bravo_active !== undefined) setIsBravoActive(data.bravo_active);
    
    if (data.vip_pos !== undefined) setVipPos(pyToThree(data.vip_pos[0], data.vip_pos[1], data.vip_pos[2]));

    if (data.clear_walls) {
      setDynamicWalls([]); setDemonWalls([]); setDiscoveredWalls([]); 
      setStaticWalls(localCityBlocks);
    }
    if (data.clear_memory) setDiscoveredWalls([]); 

    if (data.discovered_walls) {
      setDiscoveredWalls(prev => {
        const newSet = [...prev];
        data.discovered_walls.forEach(newWall => {
          if (!newSet.some(w => w[0] === newWall[0] && w[1] === newWall[1] && w[2] === newWall[2])) newSet.push(newWall);
        });
        return newSet;
      });
    }

    if (data.alpha_pos) setAlphaPos(pyToThree(data.alpha_pos[0], data.alpha_pos[1], data.alpha_pos[2]));
    if (data.bravo_pos) setBravoPos(pyToThree(data.bravo_pos[0], data.bravo_pos[1], data.bravo_pos[2]));
    
    if (data.status) {
      setStatus(data.status);
      if (data.status.includes("SECURED") || data.status.includes("APPREHENDED") || data.status.includes("FAILURE") || data.status.includes("COMPLETE") || data.status.includes("AWAITING ORDERS")) setIsRunning(false);
      
      if (data.destroyed_wall) {
        const dx = data.destroyed_wall[0]; const dy = data.destroyed_wall[1]; const dz = data.destroyed_wall[2];
        let shooterPos = alphaPosRef.current;
        if (data.shooter === "bravo") shooterPos = bravoPosRef.current;
        
        const threeTarget = pyToThree(dx, dy, dz);
        setLaserBeam({ start: [shooterPos[0], shooterPos[1]+0.2, shooterPos[2]], end: [threeTarget[0], threeTarget[1], threeTarget[2]] });
        setTimeout(() => setLaserBeam(null), 250); 
        
        const newShrapnel = { id: Date.now(), x: threeTarget[0], y: threeTarget[2], z: threeTarget[1] };
        setShatter(prev => [...prev, newShrapnel]);

        setStaticWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy && w[2] === dz)));
        setDynamicWalls(prev => prev.filter(w => !(w[0] === dx && w[1] === dy && w[2] === dz)));
      }
    }
  };

  useEffect(() => {
    let reconnectTimeout;
    let isMounted = true; 
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket("ws://127.0.0.1:8000/radar");
      
      wsRef.current.onopen = () => {
        if(!isMounted) return; 
        setWsConnected(true);
        setStatus("SYSTEM IDLE. READY FOR MANHUNT.");
      };

      wsRef.current.onmessage = (event) => {
        if(!isMounted) return;
        const data = JSON.parse(event.data);
        if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'ws', data, time: Date.now() });
        if (!isVCRModeRef.current) processWsData(data);
      };

      wsRef.current.onclose = () => {
        if(!isMounted) return;
        setWsConnected(false);
        setStatus("OFFLINE: RECONNECTING TO PYTHON CORE...");
        reconnectTimeout = setTimeout(connectWebSocket, 2000);
      };
      
      wsRef.current.onerror = () => { if(isMounted && wsRef.current) wsRef.current.close(); }
    };

    connectWebSocket();
    return () => { 
      isMounted = false; 
      clearTimeout(reconnectTimeout); 
      if (wsRef.current) {
        wsRef.current.onclose = null; 
        wsRef.current.close(); 
      }
    };
  }, []);

  const sendCommand = (action, value = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "command", action, value }));
  };

  const handleFloorClick = (event) => {
    const clickX = Math.round(event.point.x); const clickZ = Math.round(event.point.z);
    let highestZ = 0;
    staticWalls.forEach(w => { if (w[0] === clickX && w[1] === clickZ && w[2] > highestZ) highestZ = w[2]; });
    dynamicWalls.forEach(w => { if (w[0] === clickX && w[1] === clickZ && w[2] > highestZ) highestZ = w[2]; });
    const clickY = highestZ + 1; 
    
    if (clickY <= 6 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "obstacle", x: clickX, y: clickZ, z: clickY }));
      setDynamicWalls((prev) => [...prev, [clickX, clickZ, clickY]]);
      if (isRunningRef.current && !isVCRModeRef.current) blackBox.current.push({ type: 'chaos', data: {x: clickX, y: clickZ, z: clickY}, time: Date.now() });
    }
  };

  useEffect(() => {
    let sniperTimer;
    if (isSniperChaosOn && isRunning && !isVCRMode) {
      sniperTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const dropX = Math.floor(Math.random() * 15); const dropZ = Math.floor(Math.random() * 15);
          let highestZ = 0;
          staticWalls.forEach(w => { if (w[0] === dropX && w[1] === dropZ && w[2] > highestZ) highestZ = w[2]; });
          dynamicWalls.forEach(w => { if (w[0] === dropX && w[1] === dropZ && w[2] > highestZ) highestZ = w[2]; });
          const dropY = highestZ + 1;
          
          if (dropY <= 6 && !(dropX === 0 && dropZ === 0) && !(dropX === 14 && dropZ === 14)) {
            wsRef.current.send(JSON.stringify({ type: "obstacle", x: dropX, y: dropZ, z: dropY }));
            setDynamicWalls(prev => [...prev, [dropX, dropZ, dropY]]);
          }
        }
      }, 800);
    }
    return () => clearInterval(sniperTimer);
  }, [isSniperChaosOn, isRunning, isVCRMode, dynamicWalls, staticWalls]);

  useEffect(() => {
    let heavyTimer;
    if (isHeavyChaosOn && isRunning && !isVCRMode) {
      heavyTimer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const baseX = Math.floor(Math.random() * 14); const baseZ = Math.floor(Math.random() * 14);
          const shapes = [[[0,0], [1,0], [0,1], [1,1]], [[0,0], [0,1], [0,2], [0,3]]];
          const shape = shapes[Math.floor(Math.random() * shapes.length)];

          shape.forEach(offset => {
            const nx = baseX + offset[0]; const nz = baseZ + offset[1];
            let highestZ = 0;
            staticWalls.forEach(w => { if (w[0] === nx && w[1] === nz && w[2] > highestZ) highestZ = w[2]; });
            dynamicWalls.forEach(w => { if (w[0] === nx && w[1] === nz && w[2] > highestZ) highestZ = w[2]; });
            const dropY = highestZ + 1;
            
            if (dropY <= 6 && nx <= 14 && nz <= 14 && !(nx === 0 && nz === 0) && !(nx === 14 && nz === 14)) {
              wsRef.current.send(JSON.stringify({ type: "obstacle", x: nx, y: nz, z: dropY }));
              setDynamicWalls(prev => [...prev, [nx, nz, dropY]]);
            }
          });
        }
      }, 1500);
    }
    return () => clearInterval(heavyTimer);
  }, [isHeavyChaosOn, isRunning, isVCRMode, dynamicWalls, staticWalls]);

  const handleSpeedChange = (direction) => {
    const newIdx = Math.max(0, Math.min(speedMultipliers.length - 1, speedIdx + direction));
    setSpeedIdx(newIdx); sendCommand("set_speed", speedMultipliers[newIdx]);
  };

  const handleDropThreat = () => {
    if (demonWalls.length >= 6) { setStatus("MAXIMUM THREAT CAPACITY REACHED."); return; }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let dropX, dropZ, isOccupied, isBaseOrRelay, attempts = 0;
      do {
        dropX = Math.floor(Math.random() * 15); dropZ = Math.floor(Math.random() * 15); 
        isOccupied = [...staticWalls, ...dynamicWalls, ...demonWalls].some(w => w[0] === dropX && w[1] === dropZ && w[2] === 1);
        isBaseOrRelay = (dropX === 0 && dropZ === 0) || (dropX === 14 && dropZ === 14) || (dropX === 0 && dropZ === 14);
        attempts++;
      } while ((isOccupied || isBaseOrRelay) && attempts < 50);
      if (!isOccupied && !isBaseOrRelay) wsRef.current.send(JSON.stringify({ type: "drop_demon", x: dropX, y: dropZ, z: 1 }));
    }
  };

  const handlePlayPause = () => {
    if (isVCRMode) return; 
    if (!wsConnected) { setStatus("OFFLINE: START PYTHON SERVER."); return; }
    if (!isRunning) {
      if (alphaPos[0] === 0 && alphaPos[2] === 0) { setMissionMemory({ walls: [...dynamicWalls], demons: [...demonWalls] }); blackBox.current = []; }
      sendCommand("start_mission");
    } else sendCommand("pause_mission");
    setIsRunning(!isRunning);
  };

  const handleResetDrone = () => {
    if (isVCRMode) { vcrTimeouts.current.forEach(clearTimeout); vcrTimeouts.current = []; setIsVCRMode(false); }
    sendCommand("reset_drone");
    setStaticWalls(localCityBlocks); 
  };

  const handleReplay = () => {
    if (blackBox.current.length === 0) { setStatus("NO FLIGHT RECORDED."); return; }
    sendCommand("pause_mission"); setIsRunning(false); setIsVCRMode(true);
    vcrTimeouts.current.forEach(clearTimeout); vcrTimeouts.current = [];
    setAlphaPos(pyToThree(0,0,1)); setAlphaBattery(100); 
    setBravoPos(pyToThree(0,14,1)); setBravoBattery(100);
    setStatus("⏪ VCR INITIATED..."); setDiscoveredWalls([]);
    setDynamicWalls([...missionMemory.walls]); setDemonWalls([...missionMemory.demons]);
    const startTime = blackBox.current[0].time;
    blackBox.current.forEach((log, index) => {
      const delay = log.time - startTime;
      const t = setTimeout(() => {
        if (log.type === 'ws') processWsData(log.data);
        else if (log.type === 'chaos') setDynamicWalls(prev => [...prev, [log.data.x, log.data.y, log.data.z]]);
        if (index === blackBox.current.length - 1) setTimeout(() => { setIsVCRMode(false); setStatus("✅ VCR PLAYBACK COMPLETE."); }, 1000);
      }, delay);
      vcrTimeouts.current.push(t);
    });
  };

  const checkDiscovered = (x, y, z) => discoveredWalls.some(w => w[0] === x && w[1] === y && w[2] === z);
  const btnStyle = { background: 'rgba(10, 10, 10, 0.7)', color: wsConnected ? '#ff5500' : '#444', border: `1px solid ${wsConnected ? '#aa3300' : '#444'}`, padding: '8px 10px', cursor: wsConnected ? 'pointer' : 'not-allowed', borderRadius: '4px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', backdropFilter: 'blur(5px)', width: '100%', textAlign: 'center', transition: 'all 0.2s', fontWeight: 'bold' };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {isVCRMode && <div style={{ position: 'absolute', top: 20, right: 20, color: '#ff003c', zIndex: 10, fontFamily: 'monospace', fontSize: '16px', animation: 'pulse 1s infinite', border: '1px solid #ff003c', padding: '10px', background: 'rgba(255,0,0,0.1)' }}>● VCR PLAYBACK ACTIVE</div>}
      {!wsConnected && <div style={{ position: 'absolute', top: 20, right: 20, color: '#ff003c', zIndex: 10, fontFamily: 'monospace', fontSize: '16px', animation: 'pulse 1s infinite', border: '1px solid #ff003c', padding: '10px', background: 'rgba(255,0,0,0.1)' }}>⚠ PYTHON SERVER OFFLINE</div>}
      
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#ff5500', zIndex: 10, fontFamily: 'monospace', pointerEvents: 'none', width: '300px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: '2px', textShadow: '0 0 10px #ff5500' }}>CYBER-CITY MANHUNT</h1>
        <p style={{ margin: '5px 0', opacity: 0.8, fontSize: '12px', color: wsConnected ? '#ffaa00' : '#ff003c' }}>STATUS: {status}</p>
        
        <div style={{ marginTop: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: alphaBattery > 40 ? '#00ffff' : '#ff003c', marginBottom: '2px', fontWeight: 'bold' }}><span>ALPHA (SCOUT)</span><span>{Math.max(0, alphaBattery).toFixed(1)}%</span></div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(20,20,20,0.8)', border: '1px solid #333', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${Math.max(0, alphaBattery)}%`, height: '100%', background: alphaBattery > 40 ? '#00ffff' : '#ff003c', transition: 'width 0.3s ease' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: bravoBattery > 40 ? '#ffaa00' : '#ff003c', marginBottom: '2px', fontWeight: 'bold' }}><span>BRAVO (HEAVY)</span><span>{Math.max(0, bravoBattery).toFixed(1)}%</span></div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(20,20,20,0.8)', border: '1px solid #333', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${Math.max(0, bravoBattery)}%`, height: '100%', background: bravoBattery > 40 ? '#ffaa00' : '#ff003c', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>
      
      <div style={{ position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, fontFamily: 'monospace', width: '180px' }}>
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- MISSION CONTROL ---</div>
        <button onClick={handlePlayPause} style={{ ...btnStyle, background: isRunning ? 'rgba(255, 85, 0, 0.2)' : 'rgba(10, 10, 10, 0.7)', fontSize: '14px', padding: '12px', color: isRunning ? '#ffaa00' : (wsConnected ? '#ff5500' : '#444'), borderColor: isRunning ? '#ffaa00' : (wsConnected ? '#aa3300' : '#444') }}>{isRunning ? '⏸ PAUSE' : '▶ START MANHUNT'}</button>
        
        <button onClick={() => sendCommand("relocate_vip")} style={{ ...btnStyle, color: wsConnected ? '#ff003c' : '#444', borderColor: wsConnected ? '#ff003c' : '#444', background: wsConnected ? 'rgba(255, 0, 60, 0.1)' : 'rgba(10,10,10,0.7)' }}>✛ RELOCATE VIP TARGET</button>

        <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
          <button onClick={() => sendCommand("toggle_bravo")} style={{ ...btnStyle, background: isBravoActive ? 'rgba(255, 170, 0, 0.4)' : 'rgba(255, 170, 0, 0.05)', color: isBravoActive ? '#ffffff' : (wsConnected ? '#cc8800' : '#444'), borderColor: isBravoActive ? '#ffffff' : (wsConnected ? '#cc8800' : '#444'), boxShadow: isBravoActive ? '0 0 12px rgba(255, 170, 0, 0.8)' : 'none', transition: 'all 0.3s ease' }}>{isBravoActive ? '🛡 BRAVO' : '▶ BRAVO'}</button>
        </div>
        
        <button onClick={handleReplay} style={{ ...btnStyle, color: wsConnected ? '#00aaff' : '#444', borderColor: wsConnected ? '#00aaff' : '#444' }}>⏪ REPLAY TIMELINE</button>
        
        <div style={{ display: 'flex', gap: '5px', width: '100%', marginTop: '5px' }}>
          <button onClick={() => handleSpeedChange(-1)} style={{ ...btnStyle, width: '30px' }}>-</button>
          <div style={{ ...btnStyle, cursor: 'default', flex: 1, color: wsConnected ? '#ffaa00' : '#444', borderColor: wsConnected ? '#ffaa00' : '#444', padding: '8px 0' }}>{speedLabels[speedIdx]}</div>
          <button onClick={() => handleSpeedChange(1)} style={{ ...btnStyle, width: '30px' }}>+</button>
        </div>
        
        <button onClick={() => { sendCommand("rtb"); setIsRunning(true); }} style={{ ...btnStyle, color: wsConnected ? '#bb66ff' : '#444', borderColor: wsConnected ? '#bb66ff' : '#444' }}>⮌ RETURN TO BASE</button>
        <button onClick={handleResetDrone} style={{ ...btnStyle, color: wsConnected ? '#fff' : '#444', borderColor: wsConnected ? '#fff' : '#444' }}>⟳ RESET SWARM</button>
      </div>

      <div style={{ position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, fontFamily: 'monospace', width: '180px' }}>
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '10px', letterSpacing: '2px'}}>--- THREAT DEPLOYMENT ---</div>
        <button onClick={handleDropThreat} style={{ ...btnStyle, color: wsConnected ? '#ff003c' : '#444', borderColor: wsConnected ? '#ff003c' : '#444', background: wsConnected ? 'rgba(255, 0, 60, 0.1)' : 'rgba(10,10,10,0.7)' }}>⚠ DROP DEMON KNIGHT</button>
        
        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '15px', letterSpacing: '2px'}}>--- CHAOS ENGINES ---</div>
        <button onClick={() => setIsSniperChaosOn(!isSniperChaosOn)} style={{ ...btnStyle, background: isSniperChaosOn ? 'rgba(255, 170, 0, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isSniperChaosOn ? '#ffaa00' : (wsConnected ? '#555' : '#333'), borderColor: isSniperChaosOn ? '#ffaa00' : '#333' }}>{isSniperChaosOn ? '■ SNIPER: ON' : '▶ SNIPER: OFF'}</button>
        <button onClick={() => setIsHeavyChaosOn(!isHeavyChaosOn)} style={{ ...btnStyle, background: isHeavyChaosOn ? 'rgba(255, 0, 60, 0.2)' : 'rgba(10, 10, 10, 0.7)', color: isHeavyChaosOn ? '#ff003c' : (wsConnected ? '#555' : '#333'), borderColor: isHeavyChaosOn ? '#ff003c' : '#333' }}>{isHeavyChaosOn ? '■ TETRIS: ON' : '▶ TETRIS: OFF'}</button>
        <button onClick={() => { setDynamicWalls([]); sendCommand("clear_walls"); }} style={{ ...btnStyle, color: wsConnected ? '#ff4400' : '#444', borderColor: wsConnected ? '#ff4400' : '#444' }}>⎚ CLEAR ANOMALIES</button>

        <div style={{ color: '#aaa', fontSize: '10px', textAlign: 'center', marginTop: '15px', letterSpacing: '2px'}}>--- OVERRIDE ---</div>
        <div style={{ display: 'flex', gap: '5px', width: '100%', flexWrap: 'wrap' }}>
          <button onClick={() => sendCommand("manual_shoot", "alpha")} style={{ ...btnStyle, flex: 1, color: wsConnected ? '#ff5500' : '#444', borderColor: wsConnected ? '#aa3300' : '#444' }}>◎ A-SHT</button>
          <button onClick={() => sendCommand("manual_shoot", "bravo")} style={{ ...btnStyle, flex: 1, color: wsConnected ? '#ffaa00' : '#444', borderColor: wsConnected ? '#442200' : '#444' }}>◎ B-SHT</button>
        </div>
      </div>

      <Canvas camera={{ position: [5, 10, 15], fov: 50 }}>
        <color attach="background" args={['#050301']} />
        <fog attach="fog" args={['#050301', 8, 40]} />
        
        <ambientLight intensity={0.6} color="#88aaff" /> 
        <directionalLight position={[10, 20, 10]} intensity={1.5} color="#00ffff" />
        
        <CinematicGimbal targetPos={[alphaPos[0], alphaPos[1], alphaPos[2]]} />
        <gridHelper args={[15, 15, "#331100", "#110500"]} position={[gridCenter, 0.0, gridCenter]} />
        
        <Suspense fallback={null}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridCenter, -0.01, gridCenter]} onClick={handleFloorClick}>
            <planeGeometry args={[15, 15]} />
            <meshStandardMaterial color="#020202" roughness={0.1} metalness={0.9} /> 
          </mesh>
          
          <VTOLScout position={alphaPos} />
          <GothicKnightBravo position={bravoPos} />
          
          {laserBeam && <LaserBeam start={laserBeam.start} end={laserBeam.end} />}

          {shrapnel.map((frag) => {
            const threePos = pyToThree(frag.x, frag.y, frag.z);
            return <ShatteredDebris key={frag.id} position={threePos} onComplete={() => setShatter(prev => prev.filter(f => f.id !== frag.id))} />;
          })}

          <TargetVIP position={vipPos} />
          
          <mesh position={[startPos[0], 0.02, startPos[1]]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1} toneMapped={false} rotation={[-Math.PI/2, 0, 0]}/></mesh>
          <mesh position={[bravoStartPos[0], 0.02, bravoStartPos[1]]}><planeGeometry args={[1.5, 1.5]} /><meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={1.5} toneMapped={false} rotation={[-Math.PI/2, 0, 0]}/></mesh>
          
          {staticWalls.map((obs, index) => {
            const threePos = pyToThree(obs[0], obs[1], obs[2]);
            return <CyberBuilding key={`bldg-${index}`} position={threePos} isDiscovered={checkDiscovered(obs[0], obs[1], obs[2])} />;
          })}
          
          {dynamicWalls.map((wall, index) => {
            const threePos = pyToThree(wall[0], wall[1], wall[2]);
            return <CyberBuilding key={`dyn-${index}`} position={threePos} isDiscovered={checkDiscovered(wall[0], wall[1], wall[2])} />;
          })}
          
          {demonWalls.map((obs, index) => {
            const threePos = pyToThree(obs[0], obs[1], obs[2]);
            return <DemonicObstacle key={`demon-${index}`} position={threePos} isDiscovered={checkDiscovered(obs[0], obs[1], obs[2])} />;
          })}
        </Suspense>
      </Canvas>
    </div>
  );
}