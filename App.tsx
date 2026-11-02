/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Environment } from './components/World/Environment';
import { Player } from './components/World/Player';
import { LevelManager } from './components/World/LevelManager';
import { ObstacleManager } from './components/World/ObstacleManager';
import { Effects } from './components/World/Effects';
import { HUD } from './components/UI/HUD';
import { useStore } from './store';
import { BASE_FOV, BOOST_FOV } from './types';
import { runtime } from './sim/runtime';

// Шаги правил (60 в секунду) — первыми в кадре, до отрисовки объектов
const SimDriver = () => {
  useFrame((_, delta) => runtime.update(delta));
  return null;
};

const _targetPos = new THREE.Vector3();

// Dynamic Camera Controller
const CameraController = () => {
  const { camera, size } = useThree();
  const { laneCount, isSpeedBoostActive, multiplier } = useStore();
  const shakeIntensityRef = React.useRef(0);

  React.useEffect(() => {
    const handleExplosion = () => {
      shakeIntensityRef.current = 0.42;
    };
    window.addEventListener('obstacle-explosion', handleExplosion);
    return () => window.removeEventListener('obstacle-explosion', handleExplosion);
  }, []);
  
  useFrame((state, delta) => {
    const safeDelta = Math.min(delta, 0.05);
    // Determine if screen is narrow (mobile portrait)
    const aspect = size.width / size.height;
    const isMobile = aspect < 1.2; // Threshold for "mobile-like" narrowness or square-ish displays

    // Calculate expansion factors
    const heightFactor = isMobile ? 2.0 : 0.5;
    const distFactor = isMobile ? 4.5 : 1.0;

    // Base (3 lanes): y=5.5, z=8
    const extraLanes = Math.max(0, laneCount - 3);

    const targetY = 5.5 + (extraLanes * heightFactor);
    const targetZ = 8.0 + (extraLanes * distFactor);

    if (shakeIntensityRef.current > 0) {
      shakeIntensityRef.current = Math.max(0, shakeIntensityRef.current - safeDelta * 1.4);
    }

    const shake = shakeIntensityRef.current;
    const t = state.clock.elapsedTime;
    const shakeX = shake > 0.001 ? Math.sin(t * 62.0) * shake : 0;
    const shakeY = shake > 0.001 ? Math.cos(t * 51.0) * shake * 0.55 : 0;

    _targetPos.set(shakeX, targetY + shakeY, targetZ);
    
    // Smoothly interpolate camera position
    camera.position.lerp(_targetPos, safeDelta * (shake > 0.01 ? 14.0 : 2.0));
    
    // Smoothly interpolate camera visual FOV for Speed Boost & Adaptive Combo Speed
    if (camera instanceof THREE.PerspectiveCamera) {
      const comboFovBonus = Math.max(0, multiplier - 1) * 1.2;
      const targetFov = isSpeedBoostActive ? BOOST_FOV : BASE_FOV + comboFovBonus;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, safeDelta * 6.0);
        camera.updateProjectionMatrix();
      }
    }

    camera.lookAt(shakeX * 0.35, 0, -30); 
  });
  
  return null;
};

function Scene() {
  return (
    <>
        <Environment />
        <group>
            {/* Attach a userData to identify player group for LevelManager collision logic */}
            <group userData={{ isPlayer: true }} name="PlayerGroup">
                 <Player />
            </group>
            <LevelManager />
            <ObstacleManager />
        </group>
        <Effects />
    </>
  );
}

function App() {
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <HUD />
      <Canvas
        shadows
        dpr={[1, 1.5]} 
        gl={{ antialias: false, stencil: false, depth: true, powerPreference: "high-performance" }}
        // Initial camera, matches the controller base
        camera={{ position: [0, 5.5, 8], fov: 60 }}
      >
        <SimDriver />
        <CameraController />
        <Suspense fallback={null}>
            <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default App;
