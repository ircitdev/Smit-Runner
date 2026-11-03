/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text3D, Center, Float } from '@react-three/drei';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { GameObject, ObjectType, LANE_WIDTH } from '../../types';
import { runtime } from '../../sim/runtime';

// Geometry Constants
const OBSTACLE_HEIGHT = 1.6;
const OBSTACLE_GEOMETRY = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_GLOW_GEO = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_RING_GEO = new THREE.RingGeometry(0.6, 0.9, 6);

const GEM_GEOMETRY = new THREE.IcosahedronGeometry(0.3, 0);

// Speed Boost (3D Wi-Fi Icon) Geometries
const WIFI_ARC_1_ANGLE = Math.PI * 0.58;
const WIFI_ARC_2_ANGLE = Math.PI * 0.62;
const WIFI_ARC_3_ANGLE = Math.PI * 0.66;
const WIFI_TUBE_RADIUS = 0.058;

const WIFI_DOT_GEO = new THREE.SphereGeometry(0.115, 16, 16);
const WIFI_CAP_GEO = new THREE.SphereGeometry(WIFI_TUBE_RADIUS, 12, 12);
const WIFI_ARC_1_GEO = new THREE.TorusGeometry(0.28, WIFI_TUBE_RADIUS, 16, 32, WIFI_ARC_1_ANGLE);
const WIFI_ARC_2_GEO = new THREE.TorusGeometry(0.48, WIFI_TUBE_RADIUS, 16, 36, WIFI_ARC_2_ANGLE);
const WIFI_ARC_3_GEO = new THREE.TorusGeometry(0.68, WIFI_TUBE_RADIUS, 16, 40, WIFI_ARC_3_ANGLE);
const WIFI_HALO_GEO = new THREE.RingGeometry(0.55, 0.62, 32);

// Alien Geometries
const ALIEN_BODY_GEO = new THREE.CylinderGeometry(0.6, 0.3, 0.3, 8);
const ALIEN_DOME_GEO = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI/2);
const ALIEN_EYE_GEO = new THREE.SphereGeometry(0.1);

// Missile Geometries
const MISSILE_CORE_GEO = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const MISSILE_RING_GEO = new THREE.TorusGeometry(0.15, 0.02, 16, 32);

// Shadow Geometries
const SHADOW_LETTER_GEO = new THREE.PlaneGeometry(2, 0.6);
const SHADOW_GEM_GEO = new THREE.CircleGeometry(0.6, 32);
const SHADOW_BOOST_GEO = new THREE.CircleGeometry(0.7, 32);
const SHADOW_ALIEN_GEO = new THREE.CircleGeometry(0.8, 32);
const SHADOW_MISSILE_GEO = new THREE.PlaneGeometry(0.15, 3);
const SHADOW_DEFAULT_GEO = new THREE.CircleGeometry(0.8, 6);

// Shop Geometries
const SHOP_FRAME_GEO = new THREE.BoxGeometry(1, 7, 1); // Will be scaled
const SHOP_BACK_GEO = new THREE.BoxGeometry(1, 5, 1.2); // Will be scaled
const SHOP_OUTLINE_GEO = new THREE.BoxGeometry(1, 7.2, 0.8); // Will be scaled
const SHOP_FLOOR_GEO = new THREE.PlaneGeometry(1, 4); // Will be scaled

const PARTICLE_COUNT = 600;

// Font for 3D Text
const FONT_URL = "https://cdn.jsdelivr.net/npm/three/examples/fonts/helvetiker_bold.typeface.json";

// --- Particle System ---
const ParticleSystem: React.FC = () => {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const particles = useMemo(() => new Array(PARTICLE_COUNT).fill(0).map(() => ({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        color: new THREE.Color()
    })), []);

    useEffect(() => {
        const handleExplosion = (e: CustomEvent) => {
            const { position, color } = e.detail;
            let spawned = 0;
            const burstAmount = 40; 

            for(let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particles[i];
                if (p.life <= 0) {
                    p.life = 1.0 + Math.random() * 0.5; 
                    p.pos.set(position[0], position[1], position[2]);
                    
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const speed = 2 + Math.random() * 10;
                    
                    p.vel.set(
                        Math.sin(phi) * Math.cos(theta),
                        Math.sin(phi) * Math.sin(theta),
                        Math.cos(phi)
                    ).multiplyScalar(speed);

                    p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    p.rotVel.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(5);
                    
                    p.color.set(color);
                    
                    spawned++;
                    if (spawned >= burstAmount) break;
                }
            }
        };
        
        window.addEventListener('particle-burst', handleExplosion as any);
        return () => window.removeEventListener('particle-burst', handleExplosion as any);
    }, [particles]);

    useFrame((state, delta) => {
        if (!mesh.current) return;
        const safeDelta = Math.min(delta, 0.1);

        particles.forEach((p, i) => {
            if (p.life > 0) {
                p.life -= safeDelta * 1.5;
                p.pos.addScaledVector(p.vel, safeDelta);
                p.vel.y -= safeDelta * 5; 
                p.vel.multiplyScalar(0.98);

                p.rot.x += p.rotVel.x * safeDelta;
                p.rot.y += p.rotVel.y * safeDelta;
                
                dummy.position.copy(p.pos);
                const scale = Math.max(0, p.life * 0.25);
                dummy.scale.set(scale, scale, scale);
                
                dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
                dummy.updateMatrix();
                
                mesh.current!.setMatrixAt(i, dummy.matrix);
                mesh.current!.setColorAt(i, p.color);
            } else {
                dummy.scale.set(0,0,0);
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        
        mesh.current.instanceMatrix.needsUpdate = true;
        if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
        </instancedMesh>
    );
};


// Бонусы, буквы SMIT, ускорения и портал магазина: положение, сбор и появление
// считает ядро (sim/core.js) — здесь только отрисовка того, что лежит в runtime.items.
export const LevelManager: React.FC = () => {
  const [, setRenderTrigger] = useState(0);
  const seen = useRef(-1);

  useFrame(() => {
    if (runtime.version !== seen.current) {
      seen.current = runtime.version;
      setRenderTrigger(t => t + 1);
    }
  });

  return (
    <group>
      <ParticleSystem />
      {runtime.items.map(obj => <GameEntity key={obj.id} data={obj} />)}
    </group>
  );
};

// Procedural Russian Neon Sign Texture for Shop Portal (billing.smit34.ru style)
let _shopSignTexture: THREE.CanvasTexture | null = null;
const getShopSignTexture = (): THREE.CanvasTexture => {
    if (_shopSignTexture) return _shopSignTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(13, 20, 36, 0.92)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 8;
        ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
        ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

        ctx.font = '900 80px "Exo 2", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#34d399';
        ctx.fillText('СмИТ БИЛЛИНГ 3.9', canvas.width / 2, canvas.height / 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    _shopSignTexture = tex;
    return tex;
};

const GameEntity: React.FC<{ data: GameObject }> = React.memo(({ data }) => {
    const groupRef = useRef<THREE.Group>(null);
    const visualRef = useRef<THREE.Group>(null);
    const shadowRef = useRef<THREE.Mesh>(null);
    const { laneCount } = useStore(useShallow((s) => ({ laneCount: s.laneCount })));
    
    useFrame((state, delta) => {
        // 1. Move Main Container
        if (groupRef.current) {
            groupRef.current.position.set(data.position[0], 0, data.position[2]);
        }

        // 2. Animate Visuals
        if (visualRef.current) {
            const baseHeight = data.position[1];
            
            if (data.type === ObjectType.SHOP_PORTAL) {
                 visualRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.02);
            } else if (data.type === ObjectType.MISSILE) {
                 // Missile rotation
                 visualRef.current.rotation.z += delta * 20; // Fast spin
                 visualRef.current.position.y = baseHeight;
            } else if (data.type === ObjectType.ALIEN) {
                 // Alien Hover
                 visualRef.current.position.y = baseHeight + Math.sin(state.clock.elapsedTime * 3) * 0.2;
                 visualRef.current.rotation.y += delta;
            } else if (data.type === ObjectType.SPEED_BOOST) {
                 // High-energy spin & bobbing for Speed Boost power-up
                 visualRef.current.rotation.y += delta * 4.5;
                 const bobOffset = Math.sin(state.clock.elapsedTime * 6 + data.position[0]) * 0.14;
                 visualRef.current.position.y = baseHeight + bobOffset;
                 const pulseScale = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.08;
                 visualRef.current.scale.setScalar(pulseScale);

                 if (shadowRef.current) {
                     const shadowScale = 1 - bobOffset;
                     shadowRef.current.scale.setScalar(shadowScale);
                 }
            } else if (data.type !== ObjectType.OBSTACLE) {
                // Gem/Letter Bobbing
                visualRef.current.rotation.y += delta * 3;
                const bobOffset = Math.sin(state.clock.elapsedTime * 4 + data.position[0]) * 0.1;
                visualRef.current.position.y = baseHeight + bobOffset;
                
                if (shadowRef.current) {
                    const shadowScale = 1 - bobOffset; 
                    shadowRef.current.scale.setScalar(shadowScale);
                }
            } else {
                visualRef.current.position.y = baseHeight;
            }
        }
    });

    // Select Shadow Geometry based on type (using shared geometries)
    const shadowGeo = useMemo(() => {
        if (data.type === ObjectType.LETTER) return SHADOW_LETTER_GEO;
        if (data.type === ObjectType.GEM) return SHADOW_GEM_GEO;
        if (data.type === ObjectType.SPEED_BOOST) return SHADOW_BOOST_GEO;
        if (data.type === ObjectType.SHOP_PORTAL) return null; // No shadow needed or custom handled
        if (data.type === ObjectType.ALIEN) return SHADOW_ALIEN_GEO;
        if (data.type === ObjectType.MISSILE) return SHADOW_MISSILE_GEO;
        return SHADOW_DEFAULT_GEO; 
    }, [data.type]);

    return (
        <group ref={groupRef} position={[data.position[0], 0, data.position[2]]}>
            {data.type !== ObjectType.SHOP_PORTAL && shadowGeo && (
                <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} geometry={shadowGeo}>
                    <meshBasicMaterial color="#000000" opacity={0.3} transparent />
                </mesh>
            )}

            <group ref={visualRef} position={[0, data.position[1], 0]}>
                {/* --- SHOP PORTAL --- */}
                {data.type === ObjectType.SHOP_PORTAL && (
                    <group>
                         <mesh position={[0, 3, 0]} geometry={SHOP_FRAME_GEO} scale={[laneCount * LANE_WIDTH + 2, 1, 1]}>
                             <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.2} />
                         </mesh>
                         <mesh position={[0, 2, 0]} geometry={SHOP_BACK_GEO} scale={[laneCount * LANE_WIDTH, 1, 1]}>
                              <meshBasicMaterial color="#000000" />
                         </mesh>
                         <mesh position={[0, 3, 0]} geometry={SHOP_OUTLINE_GEO} scale={[laneCount * LANE_WIDTH + 2.2, 1, 1]}>
                             <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.3} />
                         </mesh>
                         <mesh position={[0, 5.4, 0.65]}>
                             <planeGeometry args={[7.2, 1.8]} />
                             <meshBasicMaterial map={getShopSignTexture()} transparent toneMapped={false} />
                         </mesh>
                         <mesh position={[0, 0.1, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={SHOP_FLOOR_GEO} scale={[laneCount * LANE_WIDTH, 1, 1]}>
                             <meshBasicMaterial color="#00ffff" transparent opacity={0.3} />
                         </mesh>
                    </group>
                )}

                {/* --- OBSTACLE --- */}
                {data.type === ObjectType.OBSTACLE && (
                    <group>
                        <mesh geometry={OBSTACLE_GEOMETRY} castShadow receiveShadow>
                             <meshStandardMaterial 
                                 color="#330011"
                                 roughness={0.3} 
                                 metalness={0.8} 
                                 flatShading={true}
                             />
                        </mesh>
                        <mesh scale={[1.02, 1.02, 1.02]} geometry={OBSTACLE_GLOW_GEO}>
                             <meshBasicMaterial 
                                 color={data.color} 
                                 wireframe 
                                 transparent 
                                 opacity={0.3} 
                             />
                        </mesh>
                         <mesh position={[0, -OBSTACLE_HEIGHT/2 + 0.05, 0]} rotation={[-Math.PI/2,0,0]} geometry={OBSTACLE_RING_GEO}>
                             <meshBasicMaterial color={data.color} transparent opacity={0.4} side={THREE.DoubleSide} />
                         </mesh>
                    </group>
                )}

                {/* --- ALIEN (LEVEL 2+) --- */}
                {data.type === ObjectType.ALIEN && (
                    <group>
                        {/* Saucer Body */}
                        <mesh castShadow geometry={ALIEN_BODY_GEO}>
                            <meshStandardMaterial color="#4400cc" metalness={0.8} roughness={0.2} />
                        </mesh>
                        {/* Dome */}
                        <mesh position={[0, 0.2, 0]} geometry={ALIEN_DOME_GEO}>
                            <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} transparent opacity={0.8} />
                        </mesh>
                        {/* Glowing Eyes/Lights */}
                        <mesh position={[0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO}>
                             <meshBasicMaterial color="#ff00ff" />
                        </mesh>
                        <mesh position={[-0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO}>
                             <meshBasicMaterial color="#ff00ff" />
                        </mesh>
                    </group>
                )}

                {/* --- MISSILE (Long Laser) --- */}
                {data.type === ObjectType.MISSILE && (
                    <group rotation={[Math.PI / 2, 0, 0]}>
                        {/* Long glowing core: Oriented along Y (which is Z after rotation) */}
                        <mesh geometry={MISSILE_CORE_GEO}>
                            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={4} />
                        </mesh>
                        {/* Energy Rings */}
                        <mesh position={[0, 1.0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                        <mesh position={[0, 0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                        <mesh position={[0, -1.0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                    </group>
                )}

                {/* --- GEM --- */}
                {data.type === ObjectType.GEM && (
                    <mesh castShadow geometry={GEM_GEOMETRY}>
                        <meshStandardMaterial 
                            color={data.color} 
                            roughness={0} 
                            metalness={1} 
                            emissive={data.color} 
                            emissiveIntensity={2} 
                        />
                    </mesh>
                )}

                {/* --- SPEED BOOST (ROTATING 3D WI-FI ICON) --- */}
                {data.type === ObjectType.SPEED_BOOST && (
                    <group position={[0, -0.28, 0]}>
                        {/* Base Signal Dot */}
                        <mesh castShadow geometry={WIFI_DOT_GEO} position={[0, 0, 0]}>
                            <meshStandardMaterial
                                color="#00ffff"
                                roughness={0.1}
                                metalness={0.8}
                                emissive="#00e5ff"
                                emissiveIntensity={3.2}
                            />
                        </mesh>

                        {/* Inner Wi-Fi Wave (Arc 1, R=0.28) */}
                        <group>
                            <mesh
                                castShadow
                                geometry={WIFI_ARC_1_GEO}
                                rotation={[0, 0, (Math.PI - WIFI_ARC_1_ANGLE) / 2]}
                            >
                                <meshStandardMaterial
                                    color="#00ffff"
                                    roughness={0.15}
                                    metalness={0.85}
                                    emissive="#00e5ff"
                                    emissiveIntensity={2.8}
                                />
                            </mesh>
                            {[
                                (Math.PI - WIFI_ARC_1_ANGLE) / 2,
                                (Math.PI + WIFI_ARC_1_ANGLE) / 2
                            ].map((ang, i) => (
                                <mesh
                                    key={`c1-${i}`}
                                    geometry={WIFI_CAP_GEO}
                                    position={[0.28 * Math.cos(ang), 0.28 * Math.sin(ang), 0]}
                                >
                                    <meshStandardMaterial
                                        color="#00ffff"
                                        roughness={0.15}
                                        metalness={0.85}
                                        emissive="#00e5ff"
                                        emissiveIntensity={2.8}
                                    />
                                </mesh>
                            ))}
                        </group>

                        {/* Middle Wi-Fi Wave (Arc 2, R=0.48) */}
                        <group>
                            <mesh
                                castShadow
                                geometry={WIFI_ARC_2_GEO}
                                rotation={[0, 0, (Math.PI - WIFI_ARC_2_ANGLE) / 2]}
                            >
                                <meshStandardMaterial
                                    color="#ffea00"
                                    roughness={0.15}
                                    metalness={0.85}
                                    emissive="#ff9100"
                                    emissiveIntensity={2.8}
                                />
                            </mesh>
                            {[
                                (Math.PI - WIFI_ARC_2_ANGLE) / 2,
                                (Math.PI + WIFI_ARC_2_ANGLE) / 2
                            ].map((ang, i) => (
                                <mesh
                                    key={`c2-${i}`}
                                    geometry={WIFI_CAP_GEO}
                                    position={[0.48 * Math.cos(ang), 0.48 * Math.sin(ang), 0]}
                                >
                                    <meshStandardMaterial
                                        color="#ffea00"
                                        roughness={0.15}
                                        metalness={0.85}
                                        emissive="#ff9100"
                                        emissiveIntensity={2.8}
                                    />
                                </mesh>
                            ))}
                        </group>

                        {/* Outer Wi-Fi Wave (Arc 3, R=0.68) */}
                        <group>
                            <mesh
                                castShadow
                                geometry={WIFI_ARC_3_GEO}
                                rotation={[0, 0, (Math.PI - WIFI_ARC_3_ANGLE) / 2]}
                            >
                                <meshStandardMaterial
                                    color="#00ffff"
                                    roughness={0.15}
                                    metalness={0.85}
                                    emissive="#00e5ff"
                                    emissiveIntensity={3.0}
                                />
                            </mesh>
                            {[
                                (Math.PI - WIFI_ARC_3_ANGLE) / 2,
                                (Math.PI + WIFI_ARC_3_ANGLE) / 2
                            ].map((ang, i) => (
                                <mesh
                                    key={`c3-${i}`}
                                    geometry={WIFI_CAP_GEO}
                                    position={[0.68 * Math.cos(ang), 0.68 * Math.sin(ang), 0]}
                                >
                                    <meshStandardMaterial
                                        color="#00ffff"
                                        roughness={0.15}
                                        metalness={0.85}
                                        emissive="#00e5ff"
                                        emissiveIntensity={3.0}
                                    />
                                </mesh>
                            ))}
                        </group>

                        {/* Ground Signal Pulse Ring */}
                        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={WIFI_HALO_GEO}>
                            <meshBasicMaterial color="#00e5ff" transparent opacity={0.45} side={THREE.DoubleSide} />
                        </mesh>
                    </group>
                )}

                {/* --- LETTER --- */}
                {data.type === ObjectType.LETTER && (
                    <group scale={[1.5, 1.5, 1.5]}>
                         <Center>
                             <Text3D 
                                font={FONT_URL} 
                                size={0.8} 
                                height={0.5} 
                                bevelEnabled
                                bevelThickness={0.02}
                                bevelSize={0.02}
                                bevelSegments={5}
                             >
                                {data.value}
                                <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={1.5} />
                             </Text3D>
                         </Center>
                    </group>
                )}
            </group>
        </group>
    );
});
