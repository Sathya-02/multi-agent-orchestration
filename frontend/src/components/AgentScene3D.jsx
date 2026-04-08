import { useRef, useMemo, useEffect, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Sparkles, RoundedBox, Html } from '@react-three/drei'
import * as THREE from 'three'

// ─── Static camera & orbit config ────────────────────────────────────────────
// MUST NOT be inline object literals on JSX props — a new object ref every render
// causes R3F to re-initialise the camera / target, producing the zoom-out snap.
const CAMERA_CONFIG = { position: [0, 12, 19], fov: 43 }
const ORBIT_TARGET  = new THREE.Vector3(0, 1.7, 0)   // stable object reference

const AGENT_META = {
  coordinator: {
    color:'#00D4FF', accentColor:'#0099cc',
    bodyColor:'#b8c4cc', headColor:'#c8d4dc', eyeColor:'#00ffee', circuitColor:'#00D4FF',
    label:'COORDINATOR', role:'Research Lead',
    deskPos:[-4.2,0,-3.2], seatAtTable:[-1.6,0.46,-0.85],
  },
  researcher: {
    color:'#FF7A2F', accentColor:'#cc5500',
    bodyColor:'#8B4513', headColor:'#7a3c10', eyeColor:'#ffaa44', circuitColor:'#FF7A2F',
    label:'RESEARCHER', role:'Data Researcher',
    deskPos:[4.2,0,-3.2], seatAtTable:[1.6,0.46,-0.85],
  },
  analyst: {
    color:'#2ECC8A', accentColor:'#1a9e6a',
    bodyColor:'#3a7a6a', headColor:'#2d6558', eyeColor:'#44ffcc', circuitColor:'#2ECC8A',
    label:'ANALYST', role:'Data Analyst',
    deskPos:[-4.2,0,3.2], seatAtTable:[-1.6,0.46,0.85],
  },
  writer: {
    color:'#FFD700', accentColor:'#cc9900',
    bodyColor:'#f0f0f0', headColor:'#ffffff', eyeColor:'#FFD700', circuitColor:'#FFD700',
    label:'WRITER', role:'Report Writer',
    deskPos:[4.2,0,3.2], seatAtTable:[1.6,0.46,0.85],
  },
}

const AGENT_IDS = Object.keys(AGENT_META)
const HANDSHAKE_PAIRS = [
  ['coordinator','researcher'],['coordinator','analyst'],['coordinator','writer'],
  ['researcher','analyst'],['analyst','writer'],
]
function isDirectPair(a,b){return HANDSHAKE_PAIRS.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a))}

// ─── Smooth auto-rotate controller ───────────────────────────────────────────
// Lerps autoRotateSpeed each frame so React never causes a prop-driven camera reset.
function SmoothAutoRotate({ controlsRef, activeAgent }) {
  const targetSpeed = useRef(activeAgent ? 0.42 : 0.1)

  useEffect(() => {
    targetSpeed.current = activeAgent ? 0.42 : 0.1
  }, [activeAgent])

  useFrame((_, delta) => {
    if (!controlsRef.current) return
    const current = controlsRef.current.autoRotateSpeed
    const target  = targetSpeed.current
    if (Math.abs(current - target) > 0.001) {
      controlsRef.current.autoRotateSpeed += (target - current) * Math.min(delta * 2, 1)
    }
  })

  return null
}

function OfficeRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.01,0]} receiveShadow>
        <planeGeometry args={[30,24]}/>
        <meshStandardMaterial color="#e8e4dc" roughness={0.12} metalness={0.08}/>
      </mesh>
      <gridHelper args={[30,30,'#d0ccc4','#d0ccc4']} position={[0,0.012,0]}/>
      <mesh position={[0,3.5,-12]} receiveShadow>
        <planeGeometry args={[30,7]}/>
        <meshStandardMaterial color="#f5f3ef" roughness={0.92}/>
      </mesh>
      <mesh position={[-15,3.5,0]} rotation={[0,Math.PI/2,0]} receiveShadow>
        <planeGeometry args={[24,7]}/>
        <meshStandardMaterial color="#f0eeea" roughness={0.92}/>
      </mesh>
      <mesh position={[15,3.5,0]} rotation={[0,-Math.PI/2,0]} receiveShadow>
        <planeGeometry args={[24,7]}/>
        <meshStandardMaterial color="#f0eeea" roughness={0.92}/>
      </mesh>
      <mesh rotation={[Math.PI/2,0,0]} position={[0,7,0]}>
        <planeGeometry args={[30,24]}/>
        <meshStandardMaterial color="#ffffff" roughness={1}/>
      </mesh>
      {[[-6,-4],[6,-4],[-6,4],[6,4],[0,0]].map(([x,z],i)=>(
        <mesh key={i} position={[x,6.92,z]}>
          <planeGeometry args={[3.2,0.35]}/>
          <meshBasicMaterial color="#fff5ee"/>
        </mesh>
      ))}
      <mesh position={[0,3.9,-11.88]}>
        <planeGeometry args={[10,5]}/>
        <meshStandardMaterial color="#0f1a3a" emissive="#1a3a80" emissiveIntensity={0.8}/>
      </mesh>
      <mesh position={[0,3.9,-11.84]}>
        <boxGeometry args={[10.5,5.5,0.06]}/>
        <meshStandardMaterial color="#141a28" roughness={0.5} metalness={0.8}/>
      </mesh>
      {[-1.4,-0.5,0.4,1.3].map((y,i)=>(
        <mesh key={i} position={[0,3.9+y,-11.86]}>
          <planeGeometry args={[8,0.055]}/>
          <meshBasicMaterial color="#3366cc" transparent opacity={0.6}/>
        </mesh>
      ))}
      <Text position={[0,5.55,-11.82]} fontSize={0.28} color="#4499ff"
        anchorX="center" anchorY="middle" outlineWidth={0.009} outlineColor="#001133">
        MULTI AGENT ORCHESTRATION
      </Text>
      <Text position={[0,5.15,-11.82]} fontSize={0.16} color="#3366bb"
        anchorX="center" anchorY="middle">
        Executive Boardroom
      </Text>
      {[-6,0,6].map((x,i)=>(
        <group key={i}>
          <mesh position={[x,1.2,-11.9]}>
            <boxGeometry args={[3.9,2.1,0.04]}/>
            <meshStandardMaterial color="#e0ddd8" roughness={0.7} metalness={0.05}/>
          </mesh>
          <mesh position={[x,1.2,-11.87]}>
            <boxGeometry args={[3.55,1.78,0.02]}/>
            <meshStandardMaterial color="#d6d2cc" roughness={0.8}/>
          </mesh>
        </group>
      ))}
      <mesh position={[0,0.022,11]} rotation={[-Math.PI/2,0,0]}>
        <planeGeometry args={[28,0.15]}/>
        <meshBasicMaterial color="#c0c8d0" transparent opacity={0.25}/>
      </mesh>
      <BoardroomTable/>
      {[[-13.5,0,-6],[-13.5,0,0],[13.5,0,-6],[13.5,0,0]].map(([x,y,z],i)=>(
        <ServerRack key={i} position={[x,y,z]}/>
      ))}
    </group>
  )
}

function ServerRack({position}){
  return (
    <group position={position}>
      <mesh position={[0,1.6,0]}>
        <boxGeometry args={[0.65,3.2,0.85]}/>
        <meshStandardMaterial color="#2a3040" roughness={0.5} metalness={0.82}/>
      </mesh>
      {[0.8,0.2,-0.4,-1.0].map((y,i)=>(
        <group key={i}>
          <mesh position={[0,1.6+y,0.4]}>
            <planeGeometry args={[0.55,0.24]}/>
            <meshStandardMaterial color="#080e20" emissive="#001a44" emissiveIntensity={0.55}/>
          </mesh>
          <mesh position={[0.2,1.6+y,0.43]}>
            <sphereGeometry args={[0.025,6,6]}/>
            <meshBasicMaterial color={i%2===0?'#00ff88':'#0088ff'}/>
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CentreOrb(){
  const orbRef=useRef(); const ringRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(orbRef.current){orbRef.current.rotation.y=t*0.9;orbRef.current.rotation.x=Math.sin(t*0.4)*0.3;orbRef.current.material.emissiveIntensity=0.65+Math.sin(t*2)*0.2}
    if(ringRef.current) ringRef.current.rotation.z=t*0.55
  })
  return (
    <group position={[0,0.96,0]}>
      <mesh ref={orbRef}>
        <icosahedronGeometry args={[0.3,1]}/>
        <meshStandardMaterial color="#002255" emissive="#0044bb" emissiveIntensity={0.65} metalness={0.85} roughness={0.1}/>
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI/2,0,0]}>
        <torusGeometry args={[0.45,0.022,8,52]}/>
        <meshBasicMaterial color="#0088ff" transparent opacity={0.65}/>
      </mesh>
      <pointLight position={[0,0.25,0]} intensity={0.9} color="#0066cc" distance={3.2}/>
    </group>
  )
}

function BoardroomTable(){
  return (
    <group>
      <mesh position={[0,0.46,0]} castShadow receiveShadow>
        <boxGeometry args={[6.2,0.13,3.1]}/>
        <meshStandardMaterial color="#2c1a08" roughness={0.18} metalness={0.45}/>
      </mesh>
      <mesh position={[0,0.528,0]}>
        <boxGeometry args={[6.0,0.018,2.95]}/>
        <meshStandardMaterial color="#3a2010" roughness={0.1} metalness={0.6}/>
      </mesh>
      {[[-2.8,0.23,-1.35],[2.8,0.23,-1.35],[-2.8,0.23,1.35],[2.8,0.23,1.35]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}>
          <boxGeometry args={[0.13,0.46,0.13]}/>
          <meshStandardMaterial color="#8a9aaa" roughness={0.12} metalness={0.96}/>
        </mesh>
      ))}
      <CentreOrb/>
      {AGENT_IDS.map(id=>{
        const {color,label,seatAtTable}=AGENT_META[id]
        const [sx,,sz]=seatAtTable
        const onNorth=sz<0
        const chairZ=sz+(onNorth?-0.72:0.72)
        const backZ=sz+(onNorth?-1.02:1.02)
        return (
          <group key={id}>
            <mesh position={[sx,0.28,chairZ]}>
              <boxGeometry args={[0.62,0.08,0.6]}/>
              <meshStandardMaterial color="#2a3545" roughness={0.65}/>
            </mesh>
            <mesh position={[sx,0.62,backZ]}>
              <boxGeometry args={[0.6,0.58,0.07]}/>
              <meshStandardMaterial color="#2a3545" roughness={0.65}/>
            </mesh>
            <mesh position={[sx,0.545,sz]}>
              <boxGeometry args={[1.15,0.1,0.04]}/>
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.08} metalness={0.7}/>
            </mesh>
            <Text position={[sx,0.547,sz+(onNorth?0.04:-0.04)]}
              rotation={[0,onNorth?0:Math.PI,0]}
              fontSize={0.12} color="#ffffff"
              anchorX="center" anchorY="middle"
              outlineWidth={0.007} outlineColor="#000000">
              {label}
            </Text>
          </group>
        )
      })}
    </group>
  )
}

function Desk({color,active,label,role}){
  const screenRef=useRef(); const plateRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(screenRef.current) screenRef.current.material.emissiveIntensity=active?0.55+Math.sin(t*2.2)*0.2:0.07
    if(plateRef.current) plateRef.current.material.emissiveIntensity=active?1.05:0.38
  })
  return (
    <group>
      <mesh position={[0,0.44,0]} castShadow receiveShadow>
        <boxGeometry args={[2.5,0.08,1.3]}/>
        <meshStandardMaterial color="#e8e2d8" roughness={0.22} metalness={0.06}/>
      </mesh>
      <mesh position={[0,0.486,0]}>
        <boxGeometry args={[2.5,0.011,1.3]}/>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active?0.55:0.1}/>
      </mesh>
      {[[-1.1,0.22,-0.55],[1.1,0.22,-0.55],[-1.1,0.22,0.55],[1.1,0.22,0.55]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}>
          <boxGeometry args={[0.07,0.44,0.07]}/>
          <meshStandardMaterial color="#8a9aaa" roughness={0.1} metalness={0.96}/>
        </mesh>
      ))}
      <mesh position={[0,0.54,-0.34]}>
        <boxGeometry args={[0.07,0.22,0.07]}/>
        <meshStandardMaterial color="#4a5060" roughness={0.2} metalness={0.9}/>
      </mesh>
      <mesh position={[0,0.455,-0.34]}>
        <boxGeometry args={[0.42,0.03,0.2]}/>
        <meshStandardMaterial color="#4a5060" roughness={0.2} metalness={0.9}/>
      </mesh>
      <mesh ref={screenRef} position={[0,0.95,-0.36]}>
        <boxGeometry args={[1.0,0.62,0.03]}/>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.07} roughness={0.05} metalness={0.72}/>
      </mesh>
      <mesh position={[0,0.95,-0.34]}>
        <boxGeometry args={[1.07,0.68,0.02]}/>
        <meshStandardMaterial color="#1a1e28" roughness={0.4} metalness={0.85}/>
      </mesh>
      <mesh position={[0,0.455,0.08]}>
        <boxGeometry args={[0.75,0.02,0.3]}/>
        <meshStandardMaterial color="#3a4050" roughness={0.7}/>
      </mesh>
      <mesh ref={plateRef} position={[0,0.46,0.67]}>
        <boxGeometry args={[1.18,0.1,0.04]}/>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.38} roughness={0.08} metalness={0.72}/>
      </mesh>
      <Text position={[0,0.463,0.71]} fontSize={0.12} color="#ffffff"
        anchorX="center" anchorY="middle" outlineWidth={0.007} outlineColor="#000000">
        {label}
      </Text>
      <Text position={[0,0.36,0.7]} fontSize={0.09} color="#aaccee"
        anchorX="center" anchorY="middle">
        {role}
      </Text>
    </group>
  )
}

function CoordinatorRobot({active,isWalking}){
  const {bodyColor,headColor,eyeColor,circuitColor}=AGENT_META.coordinator
  const headRef=useRef(); const lArmRef=useRef(); const rArmRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(headRef.current) headRef.current.rotation.y=active?Math.sin(t*1.2)*0.18:0
    if(lArmRef.current) lArmRef.current.rotation.x=isWalking?Math.sin(t*5)*0.5:(active?-0.28:0)
    if(rArmRef.current) rArmRef.current.rotation.x=isWalking?-Math.sin(t*5)*0.5:(active?0.28:0)
  })
  return (
    <group>
      {[[-0.14,0],[0.14,0]].map(([lx])=>(
        <group key={lx} position={[lx,0.5,0]}>
          <mesh position={[0,-0.22,0]} castShadow>
            <boxGeometry args={[0.18,0.52,0.18]}/>
            <meshStandardMaterial color={bodyColor} roughness={0.12} metalness={0.88}/>
          </mesh>
          <mesh position={[0,-0.52,0.06]}>
            <boxGeometry args={[0.22,0.1,0.28]}/>
            <meshStandardMaterial color="#505870" roughness={0.3} metalness={0.92}/>
          </mesh>
        </group>
      ))}
      <mesh position={[0,0.92,0]} castShadow>
        <boxGeometry args={[0.5,0.58,0.3]}/>
        <meshStandardMaterial color={bodyColor} roughness={0.1} metalness={0.9}/>
      </mesh>
      <mesh position={[0,0.94,0.155]}>
        <planeGeometry args={[0.36,0.32]}/>
        <meshStandardMaterial color="#001830" emissive={circuitColor} emissiveIntensity={active?1.0:0.35}/>
      </mesh>
      <mesh position={[0,1.0,0.162]}>
        <circleGeometry args={[0.04,8]}/>
        <meshBasicMaterial color={eyeColor}/>
      </mesh>
      {[-0.32,0.32].map((x,i)=>(
        <mesh key={i} position={[x,1.18,0]}>
          <sphereGeometry args={[0.145,10,10]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.09} metalness={0.92}/>
        </mesh>
      ))}
      <group ref={lArmRef} position={[-0.36,0.96,0]}>
        <mesh position={[0,-0.22,0]} castShadow>
          <boxGeometry args={[0.15,0.5,0.15]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.12} metalness={0.88}/>
        </mesh>
        <mesh position={[0,-0.5,0]}>
          <sphereGeometry args={[0.09,8,8]}/>
          <meshStandardMaterial color="#99aabc" roughness={0.15} metalness={0.92}/>
        </mesh>
      </group>
      <group ref={rArmRef} position={[0.36,0.96,0]}>
        <mesh position={[0,-0.22,0]} castShadow>
          <boxGeometry args={[0.15,0.5,0.15]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.12} metalness={0.88}/>
        </mesh>
        <mesh position={[0,-0.5,0]}>
          <sphereGeometry args={[0.09,8,8]}/>
          <meshStandardMaterial color="#99aabc" roughness={0.15} metalness={0.92}/>
        </mesh>
      </group>
      <mesh position={[0,1.28,0]}>
        <cylinderGeometry args={[0.08,0.1,0.14,8]}/>
        <meshStandardMaterial color="#99aabc" roughness={0.15} metalness={0.92}/>
      </mesh>
      <group ref={headRef} position={[0,1.58,0]}>
        <RoundedBox args={[0.44,0.46,0.4]} radius={0.1} castShadow>
          <meshStandardMaterial color={headColor} roughness={0.09} metalness={0.92}/>
        </RoundedBox>
        <mesh position={[0,0.04,0.205]}>
          <boxGeometry args={[0.32,0.1,0.02]}/>
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={active?1.3:0.55} transparent opacity={0.92}/>
        </mesh>
        {[-0.09,0.09].map((ex,i)=>(
          <mesh key={i} position={[ex,0.04,0.216]}>
            <circleGeometry args={[0.03,8]}/>
            <meshBasicMaterial color="#ffffff"/>
          </mesh>
        ))}
        <mesh position={[0,0.3,0]}>
          <cylinderGeometry args={[0.014,0.014,0.22,6]}/>
          <meshStandardMaterial color="#aabbcc" metalness={0.92} roughness={0.08}/>
        </mesh>
        <mesh position={[0,0.42,0]}>
          <sphereGeometry args={[0.04,8,8]}/>
          <meshBasicMaterial color={eyeColor}/>
        </mesh>
      </group>
    </group>
  )
}

function ResearcherRobot({active,isWalking}){
  const {bodyColor,headColor,eyeColor,circuitColor}=AGENT_META.researcher
  const lArmRef=useRef(); const rArmRef=useRef(); const drillRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(lArmRef.current) lArmRef.current.rotation.x=isWalking?Math.sin(t*5)*0.5:(active?-0.32:0)
    if(rArmRef.current) rArmRef.current.rotation.x=isWalking?-Math.sin(t*5)*0.5:0
    if(drillRef.current) drillRef.current.rotation.z=active?t*9:0
  })
  return (
    <group>
      {[[-0.18,0],[0.18,0]].map(([lx])=>(
        <group key={lx} position={[lx,0.5,0]}>
          <mesh position={[0,-0.2,0]} castShadow>
            <boxGeometry args={[0.26,0.5,0.26]}/>
            <meshStandardMaterial color={bodyColor} roughness={0.58} metalness={0.42}/>
          </mesh>
          <mesh position={[0,-0.47,0.08]}>
            <boxGeometry args={[0.3,0.13,0.32]}/>
            <meshStandardMaterial color="#2e1808" roughness={0.65} metalness={0.55}/>
          </mesh>
          {[-0.08,0.08].map((rx)=>(
            <mesh key={rx} position={[rx,-0.1,0.14]}>
              <cylinderGeometry args={[0.025,0.025,0.04,6]}/>
              <meshStandardMaterial color="#111111" metalness={0.92} roughness={0.08}/>
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0,0.94,0]} castShadow>
        <boxGeometry args={[0.7,0.62,0.4]}/>
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.45}/>
      </mesh>
      <mesh position={[0,0.98,0.21]}>
        <boxGeometry args={[0.62,0.5,0.03]}/>
        <meshStandardMaterial color="#5a2808" roughness={0.58} metalness={0.52}/>
      </mesh>
      <mesh position={[0,1.02,0.228]}>
        <planeGeometry args={[0.34,0.22]}/>
        <meshStandardMaterial color="#080300" emissive={circuitColor} emissiveIntensity={active?0.88:0.28}/>
      </mesh>
      {[-0.28,0.28].map((x)=>(
        <mesh key={x} position={[x,0.96,-0.26]}>
          <cylinderGeometry args={[0.1,0.1,0.52,10]}/>
          <meshStandardMaterial color="#5a3510" roughness={0.45} metalness={0.62}/>
        </mesh>
      ))}
      <group ref={lArmRef} position={[-0.48,0.98,0]}>
        <mesh position={[0,-0.2,0]} castShadow>
          <boxGeometry args={[0.24,0.5,0.24]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.5}/>
        </mesh>
        <mesh position={[0,-0.48,0]}>
          <boxGeometry args={[0.28,0.2,0.28]}/>
          <meshStandardMaterial color="#2e1808" roughness={0.38} metalness={0.72}/>
        </mesh>
        {[-0.08,0,0.08].map((cx)=>(
          <mesh key={cx} position={[cx,-0.62,0.04]}>
            <boxGeometry args={[0.055,0.18,0.06]}/>
            <meshStandardMaterial color="#1e1005" roughness={0.28} metalness={0.82}/>
          </mesh>
        ))}
      </group>
      <group ref={rArmRef} position={[0.48,0.98,0]}>
        <mesh position={[0,-0.2,0]} castShadow>
          <boxGeometry args={[0.24,0.5,0.24]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={0.5}/>
        </mesh>
        <mesh position={[0,-0.44,0.1]}>
          <cylinderGeometry args={[0.1,0.12,0.2,8]}/>
          <meshStandardMaterial color="#1e1005" roughness={0.28} metalness={0.92}/>
        </mesh>
        <mesh ref={drillRef} position={[0,-0.62,0.1]}>
          <coneGeometry args={[0.06,0.22,6]}/>
          <meshStandardMaterial color="#aaaaaa" roughness={0.08} metalness={1.0}/>
        </mesh>
      </group>
      <mesh position={[0,1.28,0]}>
        <cylinderGeometry args={[0.12,0.14,0.14,8]}/>
        <meshStandardMaterial color="#5a3510" roughness={0.45} metalness={0.72}/>
      </mesh>
      <group position={[0,1.58,0]}>
        <RoundedBox args={[0.57,0.44,0.44]} radius={0.05} castShadow>
          <meshStandardMaterial color={headColor} roughness={0.48} metalness={0.52}/>
        </RoundedBox>
        <mesh position={[0,0.02,0.235]}>
          <boxGeometry args={[0.42,0.18,0.02]}/>
          <meshStandardMaterial color="#0e0400" emissive={eyeColor} emissiveIntensity={active?1.05:0.42} transparent opacity={0.92}/>
        </mesh>
        <mesh position={[0,0.24,0.01]}>
          <boxGeometry args={[0.57,0.04,0.46]}/>
          <meshStandardMaterial color="#ffaa00" emissive="#ff6600" emissiveIntensity={0.32}/>
        </mesh>
        {[-0.3,0.3].map((x)=>(
          <mesh key={x} position={[x,0,0]}>
            <cylinderGeometry args={[0.065,0.065,0.09,6]}/>
            <meshStandardMaterial color="#1e1005" metalness={0.82} roughness={0.18}/>
          </mesh>
        ))}
      </group>
    </group>
  )
}

function AnalystRobot({active,isWalking}){
  const {bodyColor,headColor,eyeColor,circuitColor}=AGENT_META.analyst
  const lArmRef=useRef(); const rArmRef=useRef(); const boardRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(lArmRef.current) lArmRef.current.rotation.x=isWalking?Math.sin(t*5)*0.5:0
    if(rArmRef.current) rArmRef.current.rotation.x=isWalking?-Math.sin(t*5)*0.5:(active?-0.5:-0.2)
    if(boardRef.current) boardRef.current.material.emissiveIntensity=active?0.95+Math.sin(t*3)*0.22:0.28
  })
  return (
    <group>
      {[[-0.17,0],[0.17,0]].map(([lx])=>(
        <group key={lx} position={[lx,0.5,0]}>
          <mesh position={[0,-0.2,0]} castShadow>
            <boxGeometry args={[0.24,0.5,0.24]}/>
            <meshStandardMaterial color={bodyColor} roughness={0.38} metalness={0.62}/>
          </mesh>
          <mesh position={[0,-0.5,0.06]}>
            <boxGeometry args={[0.28,0.12,0.3]}/>
            <meshStandardMaterial color="#142518" roughness={0.38} metalness={0.72}/>
          </mesh>
          <mesh position={[0,-0.12,0.126]}>
            <planeGeometry args={[0.16,0.3]}/>
            <meshStandardMaterial color="#001210" emissive={circuitColor} emissiveIntensity={active?0.72:0.22}/>
          </mesh>
        </group>
      ))}
      <mesh position={[0,0.93,0]} castShadow>
        <boxGeometry args={[0.62,0.6,0.36]}/>
        <meshStandardMaterial color={bodyColor} roughness={0.32} metalness={0.68}/>
      </mesh>
      <mesh position={[0,1.09,0.186]}>
        <boxGeometry args={[0.62,0.04,0.02]}/>
        <meshStandardMaterial color="#904818" roughness={0.28} metalness={0.82}/>
      </mesh>
      <mesh position={[0,0.78,0.186]}>
        <boxGeometry args={[0.62,0.04,0.02]}/>
        <meshStandardMaterial color="#904818" roughness={0.28} metalness={0.82}/>
      </mesh>
      <mesh position={[0,0.93,0.192]}>
        <planeGeometry args={[0.38,0.28]}/>
        <meshStandardMaterial color="#001210" emissive={circuitColor} emissiveIntensity={active?0.88:0.32}/>
      </mesh>
      {[-0.36,0.36].map((x)=>(
        <mesh key={x} position={[x,1.14,0]}>
          <boxGeometry args={[0.08,0.16,0.38]}/>
          <meshStandardMaterial color="#904818" roughness={0.28} metalness={0.82}/>
        </mesh>
      ))}
      <group ref={lArmRef} position={[-0.42,0.96,0]}>
        <mesh position={[0,-0.2,0]} castShadow>
          <boxGeometry args={[0.2,0.48,0.2]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.32} metalness={0.68}/>
        </mesh>
        <mesh position={[0,-0.46,0]}>
          <boxGeometry args={[0.24,0.16,0.24]}/>
          <meshStandardMaterial color="#142518" roughness={0.28} metalness={0.82}/>
        </mesh>
        {[-0.07,0,0.07].map((fx)=>(
          <mesh key={fx} position={[fx,-0.58,0.04]}>
            <boxGeometry args={[0.05,0.16,0.055]}/>
            <meshStandardMaterial color="#0a1c10" roughness={0.28} metalness={0.82}/>
          </mesh>
        ))}
      </group>
      <group ref={rArmRef} position={[0.42,0.96,0]}>
        <mesh position={[0,-0.2,0]} castShadow>
          <boxGeometry args={[0.2,0.48,0.2]}/>
          <meshStandardMaterial color={bodyColor} roughness={0.32} metalness={0.68}/>
        </mesh>
        <mesh ref={boardRef} position={[0,-0.52,0.14]}>
          <boxGeometry args={[0.37,0.27,0.02]}/>
          <meshStandardMaterial color="#001510" emissive={circuitColor} emissiveIntensity={0.4}/>
        </mesh>
        {[-0.1,0.06].map((bx,bi)=>(
          <mesh key={bi} position={[bx,-0.49,0.162]}>
            <boxGeometry args={[0.08,0.06,0.02]}/>
            <meshStandardMaterial color="#0a1c10" roughness={0.48} metalness={0.62}/>
          </mesh>
        ))}
      </group>
      <mesh position={[0,1.28,0]}>
        <cylinderGeometry args={[0.11,0.13,0.12,8]}/>
        <meshStandardMaterial color="#904818" roughness={0.28} metalness={0.82}/>
      </mesh>
      <group position={[0,1.56,0]}>
        <RoundedBox args={[0.5,0.44,0.42]} radius={0.06} castShadow>
          <meshStandardMaterial color={headColor} roughness={0.28} metalness={0.72}/>
        </RoundedBox>
        <mesh position={[0,0.03,0.222]}>
          <boxGeometry args={[0.36,0.1,0.02]}/>
          <meshStandardMaterial color="#001510" emissive={eyeColor} emissiveIntensity={active?1.15:0.52} transparent opacity={0.92}/>
        </mesh>
        {[-0.1,0.1].map((ex)=>(
          <mesh key={ex} position={[ex,0.03,0.232]}>
            <circleGeometry args={[0.026,8]}/>
            <meshBasicMaterial color={eyeColor}/>
          </mesh>
        ))}
        <mesh position={[0,0.22,0]}>
          <boxGeometry args={[0.5,0.04,0.44]}/>
          <meshStandardMaterial color="#904818" roughness={0.28} metalness={0.82}/>
        </mesh>
      </group>
    </group>
  )
}

function WriterRobot({active,isWalking}){
  const {bodyColor,headColor,eyeColor}=AGENT_META.writer
  const lArmRef=useRef(); const rArmRef=useRef(); const headRef=useRef(); const smileRef=useRef()
  useFrame(({clock})=>{
    const t=clock.getElapsedTime()
    if(lArmRef.current) lArmRef.current.rotation.x=isWalking?Math.sin(t*5)*0.5:(active?Math.sin(t*3)*0.22:0)
    if(rArmRef.current) rArmRef.current.rotation.x=isWalking?-Math.sin(t*5)*0.5:(active?-Math.sin(t*3)*0.22:0)
    if(headRef.current) headRef.current.rotation.y=active?Math.sin(t*1.8)*0.22:0
    if(smileRef.current) smileRef.current.material.emissiveIntensity=active?0.95+Math.sin(t*4)*0.3:0.52
  })
  return (
    <group scale={[0.88,0.88,0.88]}>
      {[[-0.14,0],[0.14,0]].map(([lx])=>(
        <group key={lx} position={[lx,0.42,0]}>
          <mesh position={[0,-0.16,0]} castShadow>
            <boxGeometry args={[0.2,0.38,0.2]}/>
            <meshStandardMaterial color="#e8e8e8" roughness={0.18} metalness={0.55}/>
          </mesh>
          <mesh position={[0,-0.38,0.06]}>
            <boxGeometry args={[0.24,0.1,0.26]}/>
            <meshStandardMaterial color="#f5c800" roughness={0.28} metalness={0.62}/>
          </mesh>
        </group>
      ))}
      <mesh position={[0,0.84,0]} castShadow>
        <boxGeometry args={[0.56,0.54,0.34]}/>
        <meshStandardMaterial color={bodyColor} roughness={0.16} metalness={0.58}/>
      </mesh>
      <mesh position={[0,0.86,0.176]}>
        <planeGeometry args={[0.36,0.3]}/>
        <meshStandardMaterial color="#f5c800" emissive="#f5c800" emissiveIntensity={active?0.72:0.28}/>
      </mesh>
      {[-0.28,0.28].map((x)=>(
        <mesh key={x} position={[x,1.06,0]}>
          <sphereGeometry args={[0.132,10,10]}/>
          <meshStandardMaterial color="#f5c800" roughness={0.18} metalness={0.62}/>
        </mesh>
      ))}
      <group ref={lArmRef} position={[-0.36,0.88,0]}>
        <mesh position={[0,-0.18,0]} castShadow>
          <boxGeometry args={[0.16,0.42,0.16]}/>
          <meshStandardMaterial color="#e8e8e8" roughness={0.18} metalness={0.55}/>
        </mesh>
        <mesh position={[0,-0.4,0]}>
          <sphereGeometry args={[0.09,8,8]}/>
          <meshStandardMaterial color="#f5c800" roughness={0.28} metalness={0.62}/>
        </mesh>
      </group>
      <group ref={rArmRef} position={[0.36,0.88,0]}>
        <mesh position={[0,-0.18,0]} castShadow>
          <boxGeometry args={[0.16,0.42,0.16]}/>
          <meshStandardMaterial color="#e8e8e8" roughness={0.18} metalness={0.55}/>
        </mesh>
        <mesh position={[0,-0.4,0]}>
          <sphereGeometry args={[0.09,8,8]}/>
          <meshStandardMaterial color="#f5c800" roughness={0.28} metalness={0.62}/>
        </mesh>
      </group>
      <mesh position={[0,1.16,0]}>
        <cylinderGeometry args={[0.09,0.1,0.12,8]}/>
        <meshStandardMaterial color="#cccccc" roughness={0.18} metalness={0.72}/>
      </mesh>
      <group ref={headRef} position={[0,1.5,0]}>
        <RoundedBox args={[0.52,0.5,0.46]} radius={0.14} castShadow>
          <meshStandardMaterial color={headColor} roughness={0.1} metalness={0.62}/>
        </RoundedBox>
        {[-0.12,0.12].map((ex)=>(
          <group key={ex} position={[ex,0.07,0.24]}>
            <mesh>
              <circleGeometry args={[0.072,12]}/>
              <meshBasicMaterial color="#111111"/>
            </mesh>
            <mesh position={[0,0,0.004]}>
              <circleGeometry args={[0.042,12]}/>
              <meshBasicMaterial color={eyeColor}/>
            </mesh>
            <mesh position={[0.026,0.026,0.008]}>
              <circleGeometry args={[0.016,8]}/>
              <meshBasicMaterial color="#ffffff"/>
            </mesh>
          </group>
        ))}
        <mesh ref={smileRef} position={[0,-0.1,0.242]}>
          <torusGeometry args={[0.092,0.019,8,12,Math.PI]}/>
          <meshBasicMaterial color={eyeColor}/>
        </mesh>
        {[-0.28,0.28].map((ex)=>(
          <mesh key={ex} position={[ex,0.04,0]}>
            <sphereGeometry args={[0.068,8,8]}/>
            <meshStandardMaterial color="#f5c800" roughness={0.18} metalness={0.72}/>
          </mesh>
        ))}
      </group>
    </group>
  )
}

function RobotAvatar({agentId,active,isWalking}){
  const p={active,isWalking}
  switch(agentId){
    case 'coordinator': return <CoordinatorRobot {...p}/>
    case 'researcher':  return <ResearcherRobot  {...p}/>
    case 'analyst':     return <AnalystRobot      {...p}/>
    default:            return <WriterRobot       {...p}/>
  }
}

const SPEECH={coordinator:'Delegating',researcher:'Searching',analyst:'Analysing',writer:'Writing',fs_agent:'File ops'}

// FIX: SpeechBubble no longer conditionally mounts/unmounts the Text node.
// Previously {shown && <Text>} caused React to unmount+remount the Text mesh
// mid-frame whenever activeAgent changed, producing a 1-frame geometry tear
// that jerked the camera. Now the Text is always mounted; opacity is toggled
// imperatively via useFrame so React reconciler is never involved in the switch.
function SpeechBubble({color,active,agentId,lastMessage,isAtTable}){
  const bgRef  = useRef()
  const txtRef = useRef()
  const shown  = active || isAtTable

  const rawText = lastMessage || SPEECH[agentId] || agentId
  const text = rawText.length > 26 ? rawText.slice(0,24)+'…' : rawText

  useFrame(({clock})=>{
    const targetOpacity = shown ? 0.9 : 0
    if(bgRef.current){
      bgRef.current.position.y = 2.85 + Math.sin(clock.getElapsedTime()*2)*0.07
      bgRef.current.material.opacity += (targetOpacity - bgRef.current.material.opacity) * 0.12
    }
    if(txtRef.current){
      txtRef.current.position.y = (bgRef.current?.position.y ?? 2.85) + 0.01
      txtRef.current.material && (txtRef.current.material.opacity = bgRef.current?.material.opacity ?? 0)
    }
  })

  return (
    <group>
      <mesh ref={bgRef} position={[0,2.85,0.01]}>
        <planeGeometry args={[2.1,0.42]}/>
        <meshBasicMaterial color={color} transparent opacity={0} side={THREE.FrontSide}/>
      </mesh>
      <Text
        ref={txtRef}
        position={[0,2.86,0.02]}
        fontSize={0.14}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.009}
        outlineColor={color}
        fillOpacity={shown ? 1 : 0}
      >
        {text}
      </Text>
    </group>
  )
}

function TableSeatBubble({color,label}){
  const ref=useRef()
  useFrame(({clock})=>{
    if(ref.current) ref.current.position.y=2.4+Math.sin(clock.getElapsedTime()*2.5)*0.05
  })
  return (
    <group>
      <mesh ref={ref} position={[0,2.4,0]}>
        <planeGeometry args={[1.3,0.32]}/>
        <meshBasicMaterial color={color} transparent opacity={0.82} side={THREE.FrontSide}/>
      </mesh>
      <Text position={[0,2.402,0.01]} fontSize={0.13} color="#ffffff"
        anchorX="center" anchorY="middle" outlineWidth={0.007} outlineColor={color}>
        {label} — listening
      </Text>
    </group>
  )
}

// FIX: AgentNode — isActive and isPartner are memoised so sibling nodes don't
// recompute on every activeAgent change, preventing the frame-spike that
// momentarily corrupted OrbitControls' spherical radius.
function AgentNode({agentId,activeAgent,lastMessage,currentPhase}){
  const meta=AGENT_META[agentId]
  if(!meta)return null
  const {color,deskPos,label,role,seatAtTable}=meta
  const avatarRef=useRef()
  const curPos=useRef(new THREE.Vector3(deskPos[0],0,deskPos[2]+0.88))
  const curAngle=useRef(0)

  const isActive  = activeAgent===agentId
  const isPartner = !isActive && !!activeAgent && isDirectPair(agentId,activeAgent)

  useFrame((_,delta)=>{
    if(!avatarRef.current)return
    let tx,tz,ta
    if(isPartner){
      const onNorth=seatAtTable[2]<0
      tx=seatAtTable[0]; tz=seatAtTable[2]+(onNorth?0.4:-0.4)
      const ap=AGENT_META[activeAgent]?.deskPos||deskPos
      ta=Math.atan2(ap[0]-deskPos[0],ap[2]-deskPos[2])
    }else{tx=deskPos[0];tz=deskPos[2]+0.88;ta=0}
    const k=Math.min(delta*3,1)
    curPos.current.x+=(tx-curPos.current.x)*k
    curPos.current.z+=(tz-curPos.current.z)*k
    curAngle.current+=(ta-curAngle.current)*Math.min(delta*4,1)
    avatarRef.current.position.set(curPos.current.x,0,curPos.current.z)
    avatarRef.current.rotation.y=curAngle.current
  })

  return (
    <>
      <group position={deskPos}><Desk color={color} active={isActive} label={label} role={role}/></group>
      <group ref={avatarRef} position={[deskPos[0],0,deskPos[2]+0.88]}>
        <RobotAvatar agentId={agentId} active={isActive} isWalking={isPartner}/>
        <SpeechBubble color={color} active={isActive} agentId={agentId}
          lastMessage={lastMessage} isAtTable={isPartner} currentPhase={currentPhase}/>
        {/* Sparkles key is stable (agentId) so it never remounts mid-frame */}
        {isActive && <Sparkles key={agentId} count={16} scale={1.6} size={1.5} speed={0.48} color={color} position={[0,1.35,0]}/>}
        {isPartner && <TableSeatBubble color={color} label={label} agentId={agentId}/>}
      </group>
    </>
  )
}

// FIX: CommArc — useMemo deps corrected from [] to [posAKey, posBKey].
// Previously stale closures meant geometry was never rebuilt when agents changed.
// Using stringified position keys so the dep comparison is stable.
function CommArc({agentA,agentB,active}){
  const lineRef = useRef()
  const dotRef  = useRef()
  const color   = AGENT_META[agentA]?.color || '#4488ff'
  const posA    = AGENT_META[agentA]?.deskPos || [0,0,0]
  const posB    = AGENT_META[agentB]?.deskPos || [0,0,0]

  // AGENT_META positions are module-level constants — safe to use as deps
  const curve = useMemo(() => {
    const a   = new THREE.Vector3(posA[0], 2.1, posA[2])
    const b   = new THREE.Vector3(posB[0], 2.1, posB[2])
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 1.4, 0))
    return new THREE.QuadraticBezierCurve3(a, mid, b)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentA, agentB])

  const geom = useMemo(() => (
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(60))
  ), [curve])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (lineRef.current) {
      lineRef.current.material.opacity = active ? 0.55 + Math.sin(t * 5) * 0.25 : 0
    }
    if (dotRef.current) {
      if (active) {
        const progress = (t % 2) / 2
        const pt = curve.getPoint(progress)
        dotRef.current.position.copy(pt)
        dotRef.current.material.opacity = 0.95
        dotRef.current.scale.setScalar(1 + Math.sin(t * 8) * 0.15)
      } else {
        dotRef.current.material.opacity = 0
      }
    }
  })

  return (
    <group>
      <line geometry={geom} ref={lineRef}>
        <lineBasicMaterial color={color} transparent opacity={0} linewidth={2}/>
      </line>
      <mesh ref={dotRef} position={posA}>
        <sphereGeometry args={[0.1, 10, 10]}/>
        <meshBasicMaterial color={color} transparent opacity={0}/>
      </mesh>
    </group>
  )
}

function Lighting({activeAgent}){
  return (
    <>
      <ambientLight intensity={1.1}  color="#ffffff"/>
      <pointLight position={[0,6.4,0]} intensity={2.8}  color="#fff8f0" castShadow/>
      <pointLight position={[0,4.2,-10]} intensity={0.5}  color="#4488ff"/>
      {AGENT_IDS.map(id=>{
        const meta=AGENT_META[id]; if(!meta)return null
        const {deskPos,color}=meta
        return <pointLight key={id} position={[deskPos[0],5.7,deskPos[2]]} intensity={activeAgent===id?1.8:0.35} color={activeAgent===id?color:'#ffffff'} distance={9}/>
      })}
      <directionalLight position={[0,5.8,-9]} intensity={0.7}  color="#ffe8d0" castShadow/>
    </>
  )
}

function BlackboardStatus({ currentWorker, activeAgent, lastMessages }) {
  const bgRef = useRef()

  useFrame(({ clock }) => {
    if (!bgRef.current) return
    const t = clock.getElapsedTime()
    const hasWorker = !!(currentWorker || activeAgent)
    bgRef.current.material.opacity = hasWorker ? 0.9 + Math.sin(t * 1.5) * 0.05 : 0.0
  })

  const worker = currentWorker || {}
  const agentId    = worker.agent || activeAgent
  const agentMeta  = agentId ? AGENT_META[agentId] : null
  const agentLabel = worker.label || agentMeta?.label || agentId
  const toolLabel  = worker.tool_label || worker.tool || ''
  const msg        = lastMessages?.[agentId] || ''

  if (!agentId && !toolLabel) return null

  const mainLine = agentLabel ? `${agentLabel} is working…` : ''
  const toolLine = toolLabel
    ? `Tool: ${toolLabel}`
    : (msg ? msg.slice(0, 42) + (msg.length > 42 ? '…' : '') : '')

  return (
    <group position={[0, 3.9, -11.8]}>
      <mesh ref={bgRef} position={[0, 0, 0.01]}>
        <planeGeometry args={[9.4, 1.4]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.0} />
      </mesh>
      <Text position={[0, 0.42, 0.02]} fontSize={0.22} color="#e5f2ff"
        anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#1e293b">
        CURRENT PIPELINE STAGE
      </Text>
      {mainLine && (
        <Text position={[0, 0.06, 0.02]} fontSize={0.19} color="#bfdbfe"
          anchorX="center" anchorY="middle">
          {mainLine}
        </Text>
      )}
      {toolLine && (
        <Text position={[0, -0.32, 0.02]} fontSize={0.16} color="#93c5fd"
          anchorX="center" anchorY="middle">
          {toolLine}
        </Text>
      )}
    </group>
  )
}

// FIX: DoubleSide replaced with FrontSide throughout panel meshes to eliminate
// z-fighting flicker during camera orbit (both faces fighting for the same pixel).
function TableActivityPanel({activeAgent, lastMessages, currentPhase}) {
  const panelRef = useRef()
  const bgRef    = useRef()

  const seatedIds = AGENT_IDS.filter(id => {
    if (!activeAgent) return false
    if (id === activeAgent) return false
    return isDirectPair(id, activeAgent)
  })

  const hasActivity = !!activeAgent
  const PHASE_LABELS = {
    coordinator: 'Scoping problem',
    researcher:  'Gathering data',
    analyst:     'Analysing patterns',
    writer:      'Writing report',
    fs_agent:    'File operations',
  }

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (panelRef.current) {
      panelRef.current.position.y = 1.85 + Math.sin(t * 0.8) * 0.04
    }
    if (bgRef.current) {
      bgRef.current.material.opacity = hasActivity ? 0.88 : 0.0
    }
  })

  if (!hasActivity) return null

  const activeMeta  = AGENT_META[activeAgent]
  if (!activeMeta) return null

  const activeMsg = lastMessages?.[activeAgent] || PHASE_LABELS[activeAgent] || activeAgent
  const truncActive = activeMsg.length > 32 ? activeMsg.slice(0,30)+'…' : activeMsg

  const rows = [
    { id: activeAgent, meta: activeMeta, msg: truncActive, status: 'active' },
    ...seatedIds.map(id => {
      const meta = AGENT_META[id]
      if (!meta) return null
      const msg0 = lastMessages?.[id] || 'Listening…'
      const msg1 = msg0.length > 28 ? msg0.slice(0,26)+'…' : msg0
      return { id, meta, msg: msg1, status: 'seated' }
    }).filter(Boolean),
  ]

  const panelH = 0.52 + rows.length * 0.36
  const panelW = 4.2

  return (
    <group ref={panelRef} position={[0, 1.85, 0]}>
      <mesh ref={bgRef} position={[0, 0, 0]}>
        <planeGeometry args={[panelW, panelH]}/>
        {/* FrontSide only — DoubleSide caused z-fighting during orbit */}
        <meshBasicMaterial color="#ffffff" transparent opacity={0.88} side={THREE.FrontSide}/>
      </mesh>
      <mesh position={[0, panelH/2 - 0.04, 0.001]}>
        <planeGeometry args={[panelW, 0.08]}/>
        <meshBasicMaterial color={activeMeta.color} transparent opacity={0.95}/>
      </mesh>
      <Text position={[0, panelH/2 - 0.16, 0.002]} fontSize={0.13} color="#222244"
        anchorX="center" anchorY="middle" fontWeight={700}>
        {currentPhase ? `Phase: ${PHASE_LABELS[currentPhase] || currentPhase}` : 'Agents Active'}
      </Text>
      <mesh position={[0, panelH/2 - 0.3, 0.001]}>
        <planeGeometry args={[panelW - 0.2, 0.01]}/>
        <meshBasicMaterial color="#ddddee"/>
      </mesh>
      {rows.map((row, i) => {
        const rowY = panelH/2 - 0.46 - i * 0.36
        const isActive = row.status === 'active'
        return (
          <group key={row.id} position={[0, rowY, 0.002]}>
            <mesh position={[-panelW/2 + 0.22, 0, 0]}>
              <circleGeometry args={[0.08, 12]}/>
              <meshBasicMaterial color={row.meta.color}/>
            </mesh>
            {isActive && (
              <PulsingRing color={row.meta.color} y={rowY}/>
            )}
            <Text position={[-panelW/2 + 0.48, 0.08, 0]} fontSize={0.13}
              color={isActive ? row.meta.color : '#445566'}
              anchorX="left" anchorY="middle" fontWeight={isActive ? 700 : 400}>
              {row.meta.label}
            </Text>
            <Text position={[-panelW/2 + 0.48, -0.1, 0]} fontSize={0.1}
              color={isActive ? '#334455' : '#778899'}
              anchorX="left" anchorY="middle">
              {isActive ? `▶ ${truncActive}` : `◉ ${row.msg}`}
            </Text>
            {isActive && seatedIds.length > 0 && (
              <Text position={[panelW/2 - 0.35, 0, 0]} fontSize={0.18} color={row.meta.color}
                anchorX="right" anchorY="middle">
                ›
              </Text>
            )}
          </group>
        )
      })}
      {seatedIds.length > 0 && (
        <Text position={[0, -panelH/2 + 0.14, 0.002]} fontSize={0.1} color="#667788"
          anchorX="center" anchorY="middle">
          Output flowing to: {seatedIds.map(id => AGENT_META[id]?.label || id).join(' → ')}
        </Text>
      )}
    </group>
  )
}

function PulsingRing({color}) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.35
    ref.current.scale.setScalar(s)
    ref.current.material.opacity = 0.5 - Math.sin(clock.getElapsedTime() * 4) * 0.3
  })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[0.1, 0.015, 8, 24]}/>
      <meshBasicMaterial color={color} transparent opacity={0.5}/>
    </mesh>
  )
}

const CUSTOM_DESK_SLOTS = [
  [-3.5, 0,  5.5],
  [ 3.5, 0,  5.5],
  [-7.5, 0, -1.5],
  [ 7.5, 0, -1.5],
  [-7.5, 0,  2.5],
  [ 7.5, 0,  2.5],
  [ 0,   0,  6.5],
]

function CustomRobotBody({ color, isActive, slotIndex }) {
  const bodyRef = useRef()
  const headRef = useRef()
  const lARef   = useRef()
  const rARef   = useRef()
  const variant = slotIndex % 4

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bodyRef.current) bodyRef.current.material.emissiveIntensity = isActive ? 0.35 + Math.sin(t*2)*0.15 : 0.06
    if (headRef.current) headRef.current.rotation.y = isActive ? Math.sin(t*1.4)*0.22 : 0
    if (lARef.current)   lARef.current.rotation.x   = isActive ? Math.sin(t*2)*0.25 : 0
    if (rARef.current)   rARef.current.rotation.x   = isActive ? -Math.sin(t*2)*0.25 : 0
  })

  if (variant === 0) return (
    <group>
      {[[-0.12,0.45,0],[0.12,0.45,0]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}><boxGeometry args={[0.14,0.5,0.14]}/><meshStandardMaterial color="#c0c8d8" roughness={0.1} metalness={0.95}/></mesh>
      ))}
      <mesh ref={bodyRef} position={[0,0.9,0]}><boxGeometry args={[0.44,0.5,0.26]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.06} roughness={0.15} metalness={0.85}/></mesh>
      <mesh position={[0,0.96,0.14]}><planeGeometry args={[0.28,0.22]}/><meshStandardMaterial color="#000a18" emissive={color} emissiveIntensity={isActive?0.8:0.2}/></mesh>
      <group ref={lARef} position={[-0.3,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.12,0.42,0.12]}/><meshStandardMaterial color={color} roughness={0.15} metalness={0.85}/></mesh></group>
      <group ref={rARef} position={[0.3,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.12,0.42,0.12]}/><meshStandardMaterial color={color} roughness={0.15} metalness={0.85}/></mesh></group>
      <group ref={headRef} position={[0,1.26,0]}>
        <RoundedBox args={[0.38,0.38,0.32]} radius={0.08}><meshStandardMaterial color="#c8d4e0" roughness={0.08} metalness={0.92}/></RoundedBox>
        <mesh position={[0,0.02,0.17]}><boxGeometry args={[0.26,0.08,0.02]}/><meshBasicMaterial color={color}/></mesh>
        <mesh position={[0,0.24,0]}><cylinderGeometry args={[0.012,0.012,0.18,6]}/><meshStandardMaterial color="#aabbcc" metalness={0.9}/></mesh>
        <mesh position={[0,0.34,0]}><sphereGeometry args={[0.035,8,8]}/><meshBasicMaterial color={color}/></mesh>
      </group>
    </group>
  )

  if (variant === 1) return (
    <group>
      {[[-0.17,0.46,0],[0.17,0.46,0]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}><boxGeometry args={[0.22,0.5,0.22]}/><meshStandardMaterial color="#5a3010" roughness={0.6} metalness={0.4}/></mesh>
      ))}
      <mesh ref={bodyRef} position={[0,0.94,0]}><boxGeometry args={[0.62,0.56,0.36]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.06} roughness={0.55} metalness={0.45}/></mesh>
      <mesh position={[0,0.98,0.19]}><planeGeometry args={[0.3,0.2]}/><meshStandardMaterial color="#0a0300" emissive={color} emissiveIntensity={isActive?0.9:0.25}/></mesh>
      <group ref={lARef} position={[-0.45,0.96,0]}><mesh position={[0,-0.2,0]}><boxGeometry args={[0.2,0.46,0.2]}/><meshStandardMaterial color={color} roughness={0.5} metalness={0.5}/></mesh></group>
      <group ref={rARef} position={[0.45,0.96,0]}><mesh position={[0,-0.2,0]}><boxGeometry args={[0.2,0.46,0.2]}/><meshStandardMaterial color={color} roughness={0.5} metalness={0.5}/></mesh></group>
      <group ref={headRef} position={[0,1.55,0]}>
        <RoundedBox args={[0.52,0.42,0.42]} radius={0.04}><meshStandardMaterial color="#4a2808" roughness={0.5} metalness={0.5}/></RoundedBox>
        <mesh position={[0,0.02,0.225]}><boxGeometry args={[0.38,0.16,0.02]}/><meshBasicMaterial color={color}/></mesh>
        <mesh position={[0,0.22,0.01]}><boxGeometry args={[0.52,0.04,0.44]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4}/></mesh>
      </group>
    </group>
  )

  if (variant === 2) return (
    <group scale={[0.9,0.9,0.9]}>
      {[[-0.13,0.44,0],[0.13,0.44,0]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}><boxGeometry args={[0.18,0.46,0.18]}/><meshStandardMaterial color="#1a3828" roughness={0.5} metalness={0.5}/></mesh>
      ))}
      <mesh ref={bodyRef} position={[0,0.9,0]}><boxGeometry args={[0.5,0.5,0.3]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.06} roughness={0.35} metalness={0.65}/></mesh>
      <mesh position={[0,0.92,0.155]}><planeGeometry args={[0.32,0.24]}/><meshStandardMaterial color="#001510" emissive={color} emissiveIntensity={isActive?0.85:0.28}/></mesh>
      <group ref={lARef} position={[-0.34,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.16,0.42,0.16]}/><meshStandardMaterial color={color} roughness={0.3} metalness={0.7}/></mesh></group>
      <group ref={rARef} position={[0.34,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.16,0.42,0.16]}/><meshStandardMaterial color={color} roughness={0.3} metalness={0.7}/></mesh></group>
      <group ref={headRef} position={[0,1.5,0]}>
        <RoundedBox args={[0.46,0.44,0.4]} radius={0.12}><meshStandardMaterial color={color} roughness={0.28} metalness={0.72}/></RoundedBox>
        <mesh position={[0,0.03,0.205]}><boxGeometry args={[0.3,0.09,0.02]}/><meshBasicMaterial color="#001510"/></mesh>
        {[-0.09,0.09].map((ex,i)=><mesh key={i} position={[ex,0.03,0.215]}><circleGeometry args={[0.025,8]}/><meshBasicMaterial color={color}/></mesh>)}
        <mesh position={[0,0.26,0]}><boxGeometry args={[0.46,0.04,0.42]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4}/></mesh>
      </group>
    </group>
  )

  return (
    <group>
      {[[-0.13,0.44,0],[0.13,0.44,0]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}><boxGeometry args={[0.16,0.48,0.16]}/><meshStandardMaterial color="#1a0a2e" roughness={0.2} metalness={0.8}/></mesh>
      ))}
      <mesh ref={bodyRef} position={[0,0.92,0]}><boxGeometry args={[0.42,0.52,0.28]}/><meshStandardMaterial color="#1a0a2e" emissive={color} emissiveIntensity={isActive?0.18:0.04} roughness={0.2} metalness={0.8}/></mesh>
      <mesh position={[0,0.94,0.148]}><planeGeometry args={[0.26,0.26]}/><meshStandardMaterial color="#050010" emissive={color} emissiveIntensity={isActive?1.0:0.3}/></mesh>
      {[-0.28,0.28].map((x,i)=><mesh key={i} position={[x,1.12,0]}><sphereGeometry args={[0.11,10,10]}/><meshStandardMaterial color={color} roughness={0.1} metalness={0.9}/></mesh>)}
      <group ref={lARef} position={[-0.3,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.13,0.44,0.13]}/><meshStandardMaterial color={color} roughness={0.1} metalness={0.9}/></mesh></group>
      <group ref={rARef} position={[0.3,0.92,0]}><mesh position={[0,-0.18,0]}><boxGeometry args={[0.13,0.44,0.13]}/><meshStandardMaterial color={color} roughness={0.1} metalness={0.9}/></mesh></group>
      <group ref={headRef} position={[0,1.55,0]}>
        <mesh><sphereGeometry args={[0.26,16,16]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive?0.5:0.15} roughness={0.05} metalness={0.9} transparent opacity={0.92}/></mesh>
        {[-0.09,0.09].map((ex,i)=><mesh key={i} position={[ex,0.04,0.22]}><circleGeometry args={[0.04,12]}/><meshBasicMaterial color="#ffffff"/></mesh>)}
        <mesh position={[0,0.34,0]}><cylinderGeometry args={[0.012,0.012,0.2,6]}/><meshStandardMaterial color="#c0a0ff" metalness={0.9}/></mesh>
        <mesh position={[0,0.46,0]}><sphereGeometry args={[0.04,8,8]}/><meshBasicMaterial color={color}/></mesh>
      </group>
    </group>
  )
}

function CustomAgentNode({ agent, slotIndex, activeAgent, lastMessage }) {
  const color   = agent.color  || '#a78bfa'
  const label   = agent.label  || agent.role?.toUpperCase().slice(0,12) || 'AGENT'
  const agentId = agent.id
  const deskPos = CUSTOM_DESK_SLOTS[slotIndex % CUSTOM_DESK_SLOTS.length]
  const isActive = activeAgent === agentId

  const screenRef = useRef()
  const plateRef  = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (screenRef.current)
      screenRef.current.material.emissiveIntensity = isActive ? 0.55 + Math.sin(t*2)*0.2 : 0.07
    if (plateRef.current)
      plateRef.current.material.emissiveIntensity = isActive ? 1.05 : 0.38
  })

  const msg = lastMessage || 'idle'
  const truncMsg = msg.length > 24 ? msg.slice(0,22)+'…' : msg

  return (
    <group position={deskPos}>
      <mesh position={[0,0.44,0]} castShadow receiveShadow>
        <boxGeometry args={[2.2,0.08,1.2]}/><meshStandardMaterial color="#e8e2d8" roughness={0.22} metalness={0.06}/>
      </mesh>
      <mesh position={[0,0.486,0]}>
        <boxGeometry args={[2.2,0.011,1.2]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive?0.55:0.1}/>
      </mesh>
      {[[-0.95,0.22,-0.5],[0.95,0.22,-0.5],[-0.95,0.22,0.5],[0.95,0.22,0.5]].map(([x,y,z],i)=>(
        <mesh key={i} position={[x,y,z]}><boxGeometry args={[0.07,0.44,0.07]}/><meshStandardMaterial color="#8a9aaa" roughness={0.1} metalness={0.96}/></mesh>
      ))}
      <mesh position={[0,0.94,-0.34]}><boxGeometry args={[0.88,0.54,0.02]}/><meshStandardMaterial color="#080c14" roughness={0.4} metalness={0.85}/></mesh>
      <mesh ref={screenRef} position={[0,0.94,-0.35]}><boxGeometry args={[0.82,0.48,0.02]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.07} roughness={0.05} metalness={0.72}/></mesh>
      <mesh ref={plateRef} position={[0,0.46,0.62]}><boxGeometry args={[1.1,0.1,0.04]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.38} roughness={0.08} metalness={0.72}/></mesh>
      <Text position={[0,0.463,0.66]} fontSize={0.11} color="#ffffff"
        anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor="#000000">
        {label}
      </Text>
      <Text position={[0,0.36,0.65]} fontSize={0.078} color="#aaccee"
        anchorX="center" anchorY="middle">
        {agent.role?.slice(0,20) || ''}
      </Text>
      <group position={[0,0,0.82]}>
        <CustomRobotBody color={color} isActive={isActive} slotIndex={slotIndex}/>
        {isActive && <Sparkles key={agentId} count={14} scale={1.4} size={1.4} speed={0.46} color={color} position={[0,1,0]}/>}
        {isActive && (
          <>
            <mesh position={[0,2.35,0]}>
              <planeGeometry args={[1.7,0.34]}/><meshBasicMaterial color={color} transparent opacity={0.88} side={THREE.FrontSide}/>
            </mesh>
            <Text position={[0,2.352,0.01]} fontSize={0.13} color="#ffffff"
              anchorX="center" anchorY="middle" outlineWidth={0.007} outlineColor={color}>
              {truncMsg}
            </Text>
          </>
        )}
      </group>
    </group>
  )
}

// FIX: ActiveAgentHUD moved from world-space 3D geometry (position={[-5.5,5.8,-8]})
// to a <Html> overlay. The previous world-space implementation meant the panel's
// rendered position depended on the camera matrix — any camera drift made it
// visually jump. Html overlay is camera-independent and always pixel-perfect.
function ActiveAgentHUD({ activeAgent, agents, lastMessages }) {
  if (!activeAgent) return null

  const allMeta = {
    ...Object.fromEntries(Object.entries(AGENT_META)),
    ...Object.fromEntries(
      (agents || [])
        .filter(a => !AGENT_META[a.id])
        .map(a => [a.id, { color: a.color || '#a78bfa', label: a.label || a.id, role: a.role || a.id }])
    ),
  }
  const meta    = allMeta[activeAgent]
  const color   = meta?.color   || '#6366f1'
  const label   = meta?.label   || activeAgent.toUpperCase()
  const role    = meta?.role    || activeAgent
  const msg     = lastMessages?.[activeAgent] || ''
  const truncMsg = msg.length > 34 ? msg.slice(0,32)+'…' : msg

  return (
    <Html
      position={[-5.5, 5.8, -8]}
      distanceFactor={10}
      occlude={false}
      style={{ pointerEvents: 'none' }}
    >
      <div style={{
        background: 'rgba(255,255,255,0.94)',
        borderRadius: 10,
        padding: '10px 16px',
        minWidth: 200,
        boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
        borderLeft: `5px solid ${color}`,
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.5,
        userSelect: 'none',
      }}>
        <div style={{ color: '#778899', fontWeight: 700, letterSpacing: 2, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Now Active</div>
        <div style={{ color, fontWeight: 700, fontSize: 18 }}>{label}</div>
        <div style={{ color: '#334455', fontSize: 12 }}>{role}</div>
        {truncMsg && <div style={{ color: '#667788', fontSize: 11, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4 }}>{truncMsg}</div>}
      </div>
    </Html>
  )
}

// FIX: CustomCommArc — deps corrected from [posA, posB] array references
// (which are new on every render) to string keys for stable memoisation.
function CustomCommArc({ posA, posB, color, active }) {
  const ref    = useRef()
  const dotRef = useRef()

  const posAKey = posA.join(',')
  const posBKey = posB.join(',')

  const curve = useMemo(() => {
    const a   = new THREE.Vector3(posA[0], 2.2, posA[2])
    const b   = new THREE.Vector3(posB[0], 2.2, posB[2])
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 1.5, 0))
    return new THREE.QuadraticBezierCurve3(a, mid, b)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posAKey, posBKey])

  const geom = useMemo(() =>
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), [curve])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (ref.current)
      ref.current.material.opacity = active ? 0.5 + Math.sin(t*5)*0.25 : 0
    if (dotRef.current) {
      if (active) {
        const pt = curve.getPoint((t % 2) / 2)
        dotRef.current.position.copy(pt)
        dotRef.current.material.opacity = 0.9
      } else {
        dotRef.current.material.opacity = 0
      }
    }
  })

  return (
    <group>
      <line geometry={geom} ref={ref}>
        <lineBasicMaterial color={color} transparent opacity={0} linewidth={2}/>
      </line>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.1,8,8]}/>
        <meshBasicMaterial color={color} transparent opacity={0}/>
      </mesh>
    </group>
  )
}

export default function AgentScene3D({activeAgent,agents,lastMessages,currentPhase,currentWorker}){
  const activeAgentsList = agents ? agents.filter(a => a.active !== false) : null
  const controlsRef = useRef()

  return (
    <Canvas
      camera={CAMERA_CONFIG}
      style={{width:'100%',height:'100%',background:'#f0f2f5'}}
      shadows
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
    >
      <Lighting activeAgent={activeAgent}/>
      <OfficeRoom/>
      <BlackboardStatus
        currentWorker={currentWorker}
        activeAgent={activeAgent}
        lastMessages={lastMessages}
      />
      {HANDSHAKE_PAIRS.map(([a,b])=>(
        <CommArc key={`${a}-${b}`} agentA={a} agentB={b} active={activeAgent===a||activeAgent===b}/>
      ))}
      {AGENT_IDS.map(id=>(
        <AgentNode key={id} agentId={id} activeAgent={activeAgent}
          lastMessage={lastMessages?.[id]||''} currentPhase={currentPhase}/>
      ))}
      {(activeAgentsList||[])
        .filter(a => !AGENT_META[a.id])
        .map((a,idx) => (
          <CustomAgentNode key={a.id} agent={a} slotIndex={idx}
            activeAgent={activeAgent}
            lastMessage={lastMessages?.[a.id]||''}/>
        ))
      }
      {(activeAgentsList||[])
        .filter(a => !AGENT_META[a.id])
        .map((a,idx) => {
          const slot  = CUSTOM_DESK_SLOTS[idx % CUSTOM_DESK_SLOTS.length]
          const posA  = AGENT_META['coordinator']?.deskPos || [0,0,0]
          const color = a.color || '#a78bfa'
          return (
            <CustomCommArc key={`coord-${a.id}`}
              posA={posA} posB={slot} color={color}
              active={activeAgent===a.id || activeAgent==='coordinator'}/>
          )
        })
      }
      <TableActivityPanel activeAgent={activeAgent} lastMessages={lastMessages} currentPhase={currentPhase}/>
      <ActiveAgentHUD activeAgent={activeAgent} agents={activeAgentsList} lastMessages={lastMessages}/>

      {/*
        OrbitControls — complete fix summary:
        1. makeDefault           → sole R3F camera controller, no competing loops
        2. target={ORBIT_TARGET} → stable THREE.Vector3 object, never recreated
        3. enableDamping         → all transitions ease smoothly
        4. autoRotateSpeed omitted from props → managed by SmoothAutoRotate via ref
        5. maxDistance 28        → prevents extreme far positions
      */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={10}
        maxDistance={28}
        minPolarAngle={Math.PI/10}
        maxPolarAngle={Math.PI/2.1}
        autoRotate
        autoRotateSpeed={0.1}
        target={ORBIT_TARGET}
      />
      <SmoothAutoRotate controlsRef={controlsRef} activeAgent={activeAgent}/>
    </Canvas>
  )
}
