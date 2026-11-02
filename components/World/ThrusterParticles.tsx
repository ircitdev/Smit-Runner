/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { GameStatus } from '../../types';

const THRUSTER_PARTICLE_COUNT = 160;
const PARTICLE_GEO = new THREE.OctahedronGeometry(0.14, 0);
const NOZZLE_PLUME_GEO = new THREE.ConeGeometry(0.11, 0.65, 8);

const NEON_TRAIL_PALETTE = [
  new THREE.Color('#ffea00'), // Hyper Yellow Core
  new THREE.Color('#ff6d00'), // Solar Boost Orange
  new THREE.Color('#ff007f'), // Synthwave Neon Magenta
  new THREE.Color('#00f0ff'), // Cyber Cyan
];

interface ThrusterParticle {
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  color: THREE.Color;
  size: number;
}

const _emitterWorldPos = new THREE.Vector3();
const _parentWorldPos = new THREE.Vector3();

export const ThrusterParticles: React.FC = () => {
  const { status, isSpeedBoostActive, speed } = useStore();

  const containerRef = useRef<THREE.Group>(null);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const leftPlumeRef = useRef<THREE.Mesh>(null);
  const rightPlumeRef = useRef<THREE.Mesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo<ThrusterParticle[]>(
    () =>
      Array.from({ length: THRUSTER_PARTICLE_COUNT }, () => ({
        life: 0,
        maxLife: 0.45,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotSpeed: new THREE.Vector3(),
        color: new THREE.Color('#ff9100'),
        size: 1,
      })),
    []
  );

  useFrame((state, delta) => {
    if (!instancedMeshRef.current || !containerRef.current) return;
    if (status !== GameStatus.PLAYING && status !== GameStatus.SHOP) {
      // Hide all particles when not actively in game
      for (let i = 0; i < THRUSTER_PARTICLE_COUNT; i++) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      return;
    }

    const safeDelta = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;

    // Get the world position of the thruster mount on the player's back
    containerRef.current.getWorldPosition(_emitterWorldPos);

    // Animate direct nozzle plasma plumes when Speed Boost is active
    const plumeScale = isSpeedBoostActive ? 0.9 + Math.sin(t * 45) * 0.25 : 0;
    if (leftPlumeRef.current) {
      leftPlumeRef.current.scale.set(plumeScale, plumeScale * 1.3, plumeScale);
      leftPlumeRef.current.visible = isSpeedBoostActive;
    }
    if (rightPlumeRef.current) {
      rightPlumeRef.current.scale.set(plumeScale, plumeScale * 1.3, plumeScale);
      rightPlumeRef.current.visible = isSpeedBoostActive;
    }

    // Spawn new neon thruster particles while Speed Boost is active
    if (isSpeedBoostActive && status === GameStatus.PLAYING) {
      let spawnedThisFrame = 0;
      const targetSpawnCount = 8; // Dense twin-nozzle stream

      for (let i = 0; i < THRUSTER_PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (p.life <= 0) {
          const isLeftNozzle = spawnedThisFrame % 2 === 0;
          const nozzleOffsetX = isLeftNozzle ? -0.09 : 0.09;

          p.maxLife = 0.28 + Math.random() * 0.22;
          p.life = p.maxLife;

          // Store in world coordinates so the trail ribbons naturally as the player dodges & jumps
          p.pos.set(
            _emitterWorldPos.x + nozzleOffsetX + (Math.random() - 0.5) * 0.06,
            _emitterWorldPos.y + (Math.random() - 0.5) * 0.06,
            _emitterWorldPos.z + 0.12
          );

          // Stream backward (+Z toward camera) with slight lateral/vertical spread
          const backwardSpeed = Math.max(14, speed * 0.45) + Math.random() * 6;
          p.vel.set(
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.35) * 2.0,
            backwardSpeed
          );

          p.rot.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
          );
          p.rotSpeed.set(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 12
          );

          const chosenColor =
            NEON_TRAIL_PALETTE[Math.floor(Math.random() * NEON_TRAIL_PALETTE.length)];
          p.color.copy(chosenColor);
          p.size = 0.75 + Math.random() * 0.65;

          spawnedThisFrame++;
          if (spawnedThisFrame >= targetSpawnCount) break;
        }
      }
    }

    // Ensure world matrix is up to date before converting world-space particle positions to local space
    containerRef.current.updateWorldMatrix(true, false);

    for (let i = 0; i < THRUSTER_PARTICLE_COUNT; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= safeDelta;
        const lifeRatio = Math.max(0, p.life / p.maxLife);

        p.pos.addScaledVector(p.vel, safeDelta);
        // Slight upward buoyancy + lateral drag
        p.vel.y += safeDelta * 1.5;
        p.vel.x *= 0.96;

        p.rot.x += p.rotSpeed.x * safeDelta;
        p.rot.y += p.rotSpeed.y * safeDelta;
        p.rot.z += p.rotSpeed.z * safeDelta;

        // Convert world-space particle position into local container space
        dummy.position.copy(p.pos);
        containerRef.current.worldToLocal(dummy.position);

        dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);

        // Elongate along Z to enhance high-velocity light-streak sensation
        const xyScale = lifeRatio * p.size * 0.9;
        const zStretch = lifeRatio * p.size * 2.6;
        dummy.scale.set(xyScale, xyScale, zStretch);
        dummy.updateMatrix();

        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        instancedMeshRef.current.setColorAt(i, p.color);
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
      }
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group ref={containerRef} position={[0, 0.12, 0.18]}>
      {/* Twin Jetpack Plasma Plumes visible during Speed Boost */}
      <mesh
        ref={leftPlumeRef}
        position={[-0.09, 0, 0.25]}
        rotation={[Math.PI / 2, 0, 0]}
        geometry={NOZZLE_PLUME_GEO}
        visible={false}
      >
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} />
      </mesh>
      <mesh
        ref={rightPlumeRef}
        position={[0.09, 0, 0.25]}
        rotation={[Math.PI / 2, 0, 0]}
        geometry={NOZZLE_PLUME_GEO}
        visible={false}
      >
        <meshBasicMaterial color="#ff007f" transparent opacity={0.85} />
      </mesh>

      {/* Instanced Neon Trailing Particles */}
      <instancedMesh
        ref={instancedMeshRef}
        args={[PARTICLE_GEO, undefined, THRUSTER_PARTICLE_COUNT]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          toneMapped={false}
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
};
