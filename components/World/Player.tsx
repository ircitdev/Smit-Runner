/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { runtime } from '../../sim/runtime';
import { ThrusterParticles } from './ThrusterParticles';

// Полоса, прыжок, удары — в ядре (sim/core.js); здесь отрисовка и ввод.

// --- Multi-Part Articulated Cyber-Robot Geometries ---
// Head & Helmet
const HELMET_DOME_GEO = new THREE.BoxGeometry(0.32, 0.3, 0.34);
const HELMET_CREST_GEO = new THREE.BoxGeometry(0.1, 0.12, 0.38);
const VISOR_GEO = new THREE.BoxGeometry(0.34, 0.1, 0.24);
const EAR_POD_GEO = new THREE.CylinderGeometry(0.08, 0.08, 0.38, 8);
const ANTENNA_GEO = new THREE.CylinderGeometry(0.015, 0.025, 0.28, 6);

// Torso & Core
const CHEST_PLATE_GEO = new THREE.CylinderGeometry(0.3, 0.22, 0.48, 6);
const CORE_RING_GEO = new THREE.TorusGeometry(0.1, 0.025, 8, 20);
const CORE_CRYSTAL_GEO = new THREE.OctahedronGeometry(0.08, 0);
const WAIST_PISTON_GEO = new THREE.CylinderGeometry(0.18, 0.2, 0.22, 8);
const HIPS_ARMOR_GEO = new THREE.BoxGeometry(0.36, 0.18, 0.26);

// Twin-Turbine Jetpack
const JETPACK_CHASSIS_GEO = new THREE.BoxGeometry(0.36, 0.44, 0.18);
const TURBINE_POD_GEO = new THREE.CylinderGeometry(0.09, 0.12, 0.42, 8);
const TURBINE_NOZZLE_GEO = new THREE.TorusGeometry(0.08, 0.02, 8, 16);
const GLOW_STRIP_GEO = new THREE.PlaneGeometry(0.05, 0.28);

// Arms & Pauldrons
const PAULDRON_GEO = new THREE.OctahedronGeometry(0.16, 1);
const UPPER_ARM_GEO = new THREE.CylinderGeometry(0.08, 0.07, 0.32, 8);
const ELBOW_JOINT_GEO = new THREE.SphereGeometry(0.075, 12, 12);
const FOREARM_GAUNTLET_GEO = new THREE.BoxGeometry(0.13, 0.34, 0.14);
const HAND_CLAW_GEO = new THREE.OctahedronGeometry(0.07, 0);

// Legs & Cyber-Boots
const THIGH_GEO = new THREE.CylinderGeometry(0.11, 0.09, 0.38, 8);
const KNEE_GUARD_GEO = new THREE.OctahedronGeometry(0.095, 0);
const SHIN_ARMOR_GEO = new THREE.BoxGeometry(0.15, 0.4, 0.18);
const BOOT_BASE_GEO = new THREE.BoxGeometry(0.17, 0.12, 0.28);

const SHADOW_GEO = new THREE.CircleGeometry(0.55, 32);

export const Player: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const coreCrystalRef = useRef<THREE.Mesh>(null);

  // Articulated Robot Limb Refs
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftShinRef = useRef<THREE.Group>(null);
  const rightShinRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const {
    status,
    isImmortalityActive,
    isSpeedBoostActive,
    customRobotModelUrl
  } = useStore();

  // Optional Custom GLB Model Loader (for exported Tripo3D .glb files)
  const [customScene, setCustomScene] = useState<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (!customRobotModelUrl) {
      setCustomScene(null);
      mixerRef.current = null;
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      customRobotModelUrl,
      (gltf) => {
        const root = gltf.scene.clone(true);
        // Normalize bounding box to 1.8 units tall and ground feet at y = 0
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 1.8 / maxDim;
        root.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(root);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        root.position.set(
          -scaledCenter.x,
          -scaledBox.min.y - 1.1, // Offset relative to bodyRef at y=1.1
          -scaledCenter.z
        );

        // Face forward along the track (-Z)
        root.rotation.y = Math.PI;

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          mixerRef.current = mixer;
        } else {
          mixerRef.current = null;
        }

        setCustomScene(root);
      },
      undefined,
      () => {
        setCustomScene(null);
      }
    );
  }, [customRobotModelUrl]);

  const spinRotation = useRef(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Memoized PBR Robot Materials (billing.smit34.ru Emerald & Slate Mecha Theme)
  const {
    primaryArmorMat,
    secondaryPlateMat,
    darkChassisMat,
    neonGlowMat,
    visorMat,
    shadowMaterial
  } = useMemo(() => {
    const primaryColor = isImmortalityActive
      ? '#fbbf24'
      : isSpeedBoostActive
      ? '#34d399'
      : '#e2e8f0'; // Crisp Slate-100 Titanium Armor
    const secondaryColor = isImmortalityActive
      ? '#f59e0b'
      : isSpeedBoostActive
      ? '#059669'
      : '#0d9488'; // SMIT Teal-600 Accent Plates
    const glowColor = isImmortalityActive
      ? '#ffffff'
      : isSpeedBoostActive
      ? '#6ee7b7'
      : '#10b981'; // SMIT Emerald-500 Core Glow

    return {
      primaryArmorMat: new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.22,
        metalness: 0.88
      }),
      secondaryPlateMat: new THREE.MeshStandardMaterial({
        color: secondaryColor,
        roughness: 0.32,
        metalness: 0.8
      }),
      darkChassisMat: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.5,
        metalness: 0.7
      }),
      neonGlowMat: new THREE.MeshStandardMaterial({
        color: glowColor,
        emissive: glowColor,
        emissiveIntensity: 2.5,
        roughness: 0.1,
        metalness: 0.9
      }),
      visorMat: new THREE.MeshStandardMaterial({
        color: '#34d399',
        emissive: isSpeedBoostActive ? '#a7f3d0' : '#10b981',
        emissiveIntensity: 2.8,
        roughness: 0.1,
        metalness: 0.95
      }),
      shadowMaterial: new THREE.MeshBasicMaterial({
        color: '#000000',
        opacity: 0.35,
        transparent: true
      })
    };
  }, [isImmortalityActive, isSpeedBoostActive]);

  // Ввод — в очередь действий ядра (применится в начале следующего шага)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== GameStatus.PLAYING) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ф') runtime.push('l');
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'в') runtime.push('r');
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ц') runtime.push('j');
      else if (e.key === ' ' || e.key === 'Enter') runtime.push('i');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (status !== GameStatus.PLAYING) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
        runtime.push(deltaX > 0 ? 'r' : 'l');
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -30) {
        runtime.push('j');
      } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        runtime.push('i');
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [status]);

  // Animation Loop
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (status !== GameStatus.PLAYING && status !== GameStatus.SHOP) return;

    if (mixerRef.current) {
      mixerRef.current.update(delta * (isSpeedBoostActive ? 1.5 : 1.0));
    }

    const p = runtime.player();
    if (!p) return;
    const jumping = p.jumping;

    // 1–2. Положение и прыжок — из ядра (между двумя шагами)
    groupRef.current.position.x = p.x;
    groupRef.current.position.y = p.y;
    if (!jumping) {
      spinRotation.current = 0;
      if (bodyRef.current) bodyRef.current.rotation.x = 0;
    } else if (p.jumps === 2 && bodyRef.current) {
      // кувырок при двойном прыжке — только вид
      spinRotation.current -= delta * 15;
      if (spinRotation.current < -Math.PI * 2) spinRotation.current = -Math.PI * 2;
      bodyRef.current.rotation.x = spinRotation.current;
    }

    // Banking Rotation & Forward Sprint Lean
    const xDiff = p.targetX - groupRef.current.position.x;
    groupRef.current.rotation.z = -xDiff * 0.22;
    groupRef.current.rotation.x = jumping
      ? 0.12
      : isSpeedBoostActive
      ? 0.2
      : 0.07;

    // 3. Articulated Robot Skeletal Animation
    const time = state.clock.elapsedTime * (isSpeedBoostActive ? 36 : 25);

    if (coreCrystalRef.current) {
      coreCrystalRef.current.rotation.z += delta * 4;
      coreCrystalRef.current.rotation.y += delta * 3;
    }

    if (!jumping) {
      const stride = Math.sin(time);
      const oppStride = Math.sin(time + Math.PI);

      if (leftArmRef.current) leftArmRef.current.rotation.x = stride * 0.75;
      if (rightArmRef.current) rightArmRef.current.rotation.x = oppStride * 0.75;
      if (leftForearmRef.current) {
        leftForearmRef.current.rotation.x = -0.45 + Math.max(0, stride) * 0.35;
      }
      if (rightForearmRef.current) {
        rightForearmRef.current.rotation.x = -0.45 + Math.max(0, oppStride) * 0.35;
      }

      if (leftLegRef.current) leftLegRef.current.rotation.x = oppStride * 0.95;
      if (rightLegRef.current) rightLegRef.current.rotation.x = stride * 0.95;
      if (leftShinRef.current) {
        leftShinRef.current.rotation.x = Math.max(0, -oppStride) * 0.65;
      }
      if (rightShinRef.current) {
        rightShinRef.current.rotation.x = Math.max(0, -stride) * 0.65;
      }

      if (headRef.current) {
        headRef.current.rotation.y = -xDiff * 0.15;
        headRef.current.position.y = 0.62 + Math.abs(stride) * 0.025;
      }

      if (bodyRef.current) {
        bodyRef.current.position.y = 1.1 + Math.abs(stride) * 0.09;
      }
    } else {
      const jumpPoseSpeed = delta * 10;
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x,
          -2.2,
          jumpPoseSpeed
        );
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          -2.2,
          jumpPoseSpeed
        );
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
          leftLegRef.current.rotation.x,
          0.55,
          jumpPoseSpeed
        );
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
          rightLegRef.current.rotation.x,
          -0.45,
          jumpPoseSpeed
        );
      }
      if (leftShinRef.current) {
        leftShinRef.current.rotation.x = THREE.MathUtils.lerp(
          leftShinRef.current.rotation.x,
          0.4,
          jumpPoseSpeed
        );
      }
      if (rightShinRef.current) {
        rightShinRef.current.rotation.x = THREE.MathUtils.lerp(
          rightShinRef.current.rotation.x,
          0.5,
          jumpPoseSpeed
        );
      }

      if (bodyRef.current && p.jumps !== 2) {
        bodyRef.current.position.y = 1.1;
      }
    }

    // 4. Dynamic Ground Shadow
    if (shadowRef.current) {
      const height = groupRef.current.position.y;
      const scale = Math.max(0.2, 1 - (height / 2.5) * 0.5);
      const runStretch = jumping ? 1 : 1 + Math.abs(Math.sin(time)) * 0.25;

      shadowRef.current.scale.set(scale, scale, scale * runStretch);
      const material = shadowRef.current.material as THREE.MeshBasicMaterial;
      if (material && !Array.isArray(material)) {
        material.opacity = Math.max(0.1, 0.32 - (height / 2.5) * 0.2);
      }
    }

    // Мигание после удара (неуязвимость считает ядро); под щитом — без мигания
    groupRef.current.visible = p.hurt && !isImmortalityActive
      ? Math.floor(Date.now() / 50) % 2 === 0
      : true;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={bodyRef} position={[0, 1.1, 0]}>
        {customScene ? (
          <group>
            <primitive object={customScene} />
            <ThrusterParticles />
          </group>
        ) : (
          <>
            {/* --- MECHA CHEST & ENERGY REACTOR CORE --- */}
            <mesh
              castShadow
              position={[0, 0.24, 0]}
              geometry={CHEST_PLATE_GEO}
              material={primaryArmorMat}
            />
            <mesh
              position={[0, 0.26, -0.22]}
              geometry={CORE_RING_GEO}
              material={secondaryPlateMat}
            />
            <mesh
              ref={coreCrystalRef}
              position={[0, 0.26, -0.24]}
              geometry={CORE_CRYSTAL_GEO}
              material={neonGlowMat}
            />
            {/* Waist Hydraulics & Hip Armor */}
            <mesh
              position={[0, -0.02, 0]}
              geometry={WAIST_PISTON_GEO}
              material={darkChassisMat}
            />
            <mesh
              castShadow
              position={[0, -0.16, 0]}
              geometry={HIPS_ARMOR_GEO}
              material={secondaryPlateMat}
            />

            {/* --- TWIN-TURBINE JETPACK & THRUSTER PARTICLES --- */}
            <group position={[0, 0.22, 0.2]}>
              <mesh
                castShadow
                geometry={JETPACK_CHASSIS_GEO}
                material={darkChassisMat}
              />
              <mesh
                position={[-0.12, 0.02, 0.06]}
                geometry={TURBINE_POD_GEO}
                material={secondaryPlateMat}
              />
              <mesh
                position={[0.12, 0.02, 0.06]}
                geometry={TURBINE_POD_GEO}
                material={secondaryPlateMat}
              />
              <mesh
                position={[-0.12, -0.18, 0.08]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={TURBINE_NOZZLE_GEO}
                material={neonGlowMat}
              />
              <mesh
                position={[0.12, -0.18, 0.08]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={TURBINE_NOZZLE_GEO}
                material={neonGlowMat}
              />
              <mesh
                position={[-0.12, 0.04, 0.17]}
                geometry={GLOW_STRIP_GEO}
                material={neonGlowMat}
              />
              <mesh
                position={[0.12, 0.04, 0.17]}
                geometry={GLOW_STRIP_GEO}
                material={neonGlowMat}
              />
            </group>
            <ThrusterParticles />

            {/* --- SCULPTED ROBOT HEAD, VISOR & ANTENNAS --- */}
            <group ref={headRef} position={[0, 0.62, 0]}>
              <mesh
                castShadow
                geometry={HELMET_DOME_GEO}
                material={primaryArmorMat}
              />
              <mesh
                position={[0, 0.16, 0]}
                geometry={HELMET_CREST_GEO}
                material={secondaryPlateMat}
              />
              {/* Glowing Cybernetic Visor */}
              <mesh
                position={[0, 0.02, -0.08]}
                geometry={VISOR_GEO}
                material={visorMat}
              />
              {/* Side Audio/Sensor Pods */}
              <mesh
                position={[0, 0.0, 0]}
                rotation={[0, 0, Math.PI / 2]}
                geometry={EAR_POD_GEO}
                material={darkChassisMat}
              />
              {/* Twin Fin Antennas */}
              <mesh
                position={[-0.17, 0.2, 0.04]}
                rotation={[-0.25, 0, 0.18]}
                geometry={ANTENNA_GEO}
                material={neonGlowMat}
              />
              <mesh
                position={[0.17, 0.2, 0.04]}
                rotation={[-0.25, 0, -0.18]}
                geometry={ANTENNA_GEO}
                material={neonGlowMat}
              />
            </group>

            {/* --- ARTICULATED RIGHT ARM --- */}
            <group position={[0.35, 0.42, 0]}>
              <group ref={rightArmRef}>
                {/* Shoulder Pauldron */}
                <mesh
                  castShadow
                  position={[0.04, 0.04, 0]}
                  geometry={PAULDRON_GEO}
                  material={secondaryPlateMat}
                />
                {/* Upper Arm */}
                <mesh
                  castShadow
                  position={[0, -0.16, 0]}
                  geometry={UPPER_ARM_GEO}
                  material={darkChassisMat}
                />
                {/* Elbow Joint */}
                <mesh
                  position={[0, -0.32, 0]}
                  geometry={ELBOW_JOINT_GEO}
                  material={neonGlowMat}
                />
                {/* Forearm Gauntlet & Hand */}
                <group ref={rightForearmRef} position={[0, -0.32, 0]}>
                  <mesh
                    castShadow
                    position={[0, -0.17, 0]}
                    geometry={FOREARM_GAUNTLET_GEO}
                    material={primaryArmorMat}
                  />
                  <mesh
                    position={[0, -0.36, 0]}
                    geometry={HAND_CLAW_GEO}
                    material={neonGlowMat}
                  />
                </group>
              </group>
            </group>

            {/* --- ARTICULATED LEFT ARM --- */}
            <group position={[-0.35, 0.42, 0]}>
              <group ref={leftArmRef}>
                <mesh
                  castShadow
                  position={[-0.04, 0.04, 0]}
                  geometry={PAULDRON_GEO}
                  material={secondaryPlateMat}
                />
                <mesh
                  castShadow
                  position={[0, -0.16, 0]}
                  geometry={UPPER_ARM_GEO}
                  material={darkChassisMat}
                />
                <mesh
                  position={[0, -0.32, 0]}
                  geometry={ELBOW_JOINT_GEO}
                  material={neonGlowMat}
                />
                <group ref={leftForearmRef} position={[0, -0.32, 0]}>
                  <mesh
                    castShadow
                    position={[0, -0.17, 0]}
                    geometry={FOREARM_GAUNTLET_GEO}
                    material={primaryArmorMat}
                  />
                  <mesh
                    position={[0, -0.36, 0]}
                    geometry={HAND_CLAW_GEO}
                    material={neonGlowMat}
                  />
                </group>
              </group>
            </group>

            {/* --- ARTICULATED RIGHT LEG & CYBER-BOOT --- */}
            <group position={[0.14, -0.24, 0]}>
              <group ref={rightLegRef}>
                <mesh
                  castShadow
                  position={[0, -0.18, 0]}
                  geometry={THIGH_GEO}
                  material={primaryArmorMat}
                />
                <mesh
                  position={[0, -0.38, -0.06]}
                  geometry={KNEE_GUARD_GEO}
                  material={neonGlowMat}
                />
                <group ref={rightShinRef} position={[0, -0.38, 0]}>
                  <mesh
                    castShadow
                    position={[0, -0.2, 0]}
                    geometry={SHIN_ARMOR_GEO}
                    material={secondaryPlateMat}
                  />
                  <mesh
                    castShadow
                    position={[0, -0.42, -0.04]}
                    geometry={BOOT_BASE_GEO}
                    material={primaryArmorMat}
                  />
                </group>
              </group>
            </group>

            {/* --- ARTICULATED LEFT LEG & CYBER-BOOT --- */}
            <group position={[-0.14, -0.24, 0]}>
              <group ref={leftLegRef}>
                <mesh
                  castShadow
                  position={[0, -0.18, 0]}
                  geometry={THIGH_GEO}
                  material={primaryArmorMat}
                />
                <mesh
                  position={[0, -0.38, -0.06]}
                  geometry={KNEE_GUARD_GEO}
                  material={neonGlowMat}
                />
                <group ref={leftShinRef} position={[0, -0.38, 0]}>
                  <mesh
                    castShadow
                    position={[0, -0.2, 0]}
                    geometry={SHIN_ARMOR_GEO}
                    material={secondaryPlateMat}
                  />
                  <mesh
                    castShadow
                    position={[0, -0.42, -0.04]}
                    geometry={BOOT_BASE_GEO}
                    material={primaryArmorMat}
                  />
                </group>
              </group>
            </group>
          </>
        )}
      </group>

      <mesh
        ref={shadowRef}
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={SHADOW_GEO}
        material={shadowMaterial}
      />
    </group>
  );
};