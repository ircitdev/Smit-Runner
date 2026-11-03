/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { LANE_WIDTH } from '../../types';

const StarField: React.FC = () => {
  const speed = useStore(state => state.speed);
  const count = 3000; // Increased star count for better density
  const meshRef = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 400;
      let y = (Math.random() - 0.5) * 200 + 50; // Keep mostly above horizon
      
      // Distribute Z randomly along the entire travel path plus buffer
      // Range: -550 to 100 to ensure full coverage from start
      let z = -550 + Math.random() * 650;

      // Exclude stars from the central play area
      if (Math.abs(x) < 15 && y > -5 && y < 20) {
          if (x < 0) x -= 15;
          else x += 15;
      }

      pos[i * 3] = x;     
      pos[i * 3 + 1] = y; 
      pos[i * 3 + 2] = z; 
    }
    return pos;
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    const activeSpeed = speed > 0 ? speed : 2; // Always move slightly even when stopped

    for (let i = 0; i < count; i++) {
        let z = positions[i * 3 + 2];
        z += activeSpeed * delta * 2.0; // Parallax effect
        
        // Reset when it passes the camera (z > 100 gives plenty of buffer behind camera)
        if (z > 100) {
            // Reset far back with a random buffer to prevent "walls" of stars
            z = -550 - Math.random() * 50; 
            
            // Re-randomize X/Y on respawn with exclusion logic
            let x = (Math.random() - 0.5) * 400;
            let y = (Math.random() - 0.5) * 200 + 50;
            
            if (Math.abs(x) < 15 && y > -5 && y < 20) {
                if (x < 0) x -= 15;
                else x += 15;
            }

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
        }
        positions[i * 3 + 2] = z;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        color="#ffffff"
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
};

const LaneGuides: React.FC = () => {
    const { laneCount, speed, isSpeedBoostActive } = useStore(useShallow((s) => ({ laneCount: s.laneCount, speed: s.speed, isSpeedBoostActive: s.isSpeedBoostActive })));
    const floorMatRef = useRef<THREE.ShaderMaterial>(null);
    const scrollOffsetRef = useRef(0);
    
    const separators = useMemo(() => {
        const lines: number[] = [];
        const startX = -(laneCount * LANE_WIDTH) / 2;
        
        for (let i = 0; i <= laneCount; i++) {
            lines.push(startX + (i * LANE_WIDTH));
        }
        return lines;
    }, [laneCount]);

    const floorUniforms = useMemo(() => ({
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uBoost: { value: 0 },
        uTrackWidth: { value: laneCount * LANE_WIDTH }
    }), []);

    useFrame((state, delta) => {
        const activeSpeed = speed > 0 ? speed : 4;
        scrollOffsetRef.current += activeSpeed * delta;
        if (floorMatRef.current) {
            floorMatRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            floorMatRef.current.uniforms.uScroll.value = scrollOffsetRef.current;
            floorMatRef.current.uniforms.uBoost.value = THREE.MathUtils.lerp(
                floorMatRef.current.uniforms.uBoost.value,
                isSpeedBoostActive ? 1.0 : 0.0,
                delta * 6.0
            );
            floorMatRef.current.uniforms.uTrackWidth.value = laneCount * LANE_WIDTH;
        }
    });

    return (
        <group position={[0, 0.02, 0]}>
            {/* Procedural Scrolling & Pulsing Track Floor */}
            <mesh position={[0, -0.02, -50]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[laneCount * LANE_WIDTH, 220]} />
                <shaderMaterial
                    ref={floorMatRef}
                    uniforms={floorUniforms}
                    transparent
                    depthWrite={false}
                    vertexShader={`
                        varying vec2 vUv;
                        varying vec3 vWorldPos;
                        void main() {
                            vUv = uv;
                            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                            vWorldPos = worldPosition.xyz;
                            gl_Position = projectionMatrix * viewMatrix * worldPosition;
                        }
                    `}
                    fragmentShader={`
                        varying vec2 vUv;
                        varying vec3 vWorldPos;
                        uniform float uTime;
                        uniform float uScroll;
                        uniform float uBoost;

                        void main() {
                            // 128 BPM synthwave rhythmic pulse (~2.133 beats per second)
                            float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
                            
                            // Scrolling Z coordinate towards player
                            float scrolledZ = vWorldPos.z - uScroll;
                            
                            // Rhythmic horizontal speed bars along the track
                            float cellZ = fract(scrolledZ / 6.0);
                            float barLine = smoothstep(0.06, 0.0, abs(cellZ - 0.5));
                            
                            // Subtle center chevron/stream effect
                            float stream = 0.5 + 0.5 * sin(scrolledZ * 0.4 + uTime * 8.0);
                            
                            vec3 baseTrackColor = vec3(0.01, 0.04, 0.09);
                            vec3 pulseColor = mix(vec3(0.06, 0.73, 0.51), vec3(0.20, 0.83, 0.60), uBoost);
                            
                            float barIntensity = barLine * (0.18 + 0.22 * beat + 0.2 * uBoost);
                            vec3 finalColor = baseTrackColor + pulseColor * (barIntensity + stream * 0.04);
                            
                            // Distance fade at far horizon and behind camera
                            float distFade = smoothstep(-160.0, -40.0, vWorldPos.z) * (1.0 - smoothstep(10.0, 40.0, vWorldPos.z));
                            
                            gl_FragColor = vec4(finalColor, 0.92 * distFade);
                        }
                    `}
                />
            </mesh>

            {/* Lane Separators - Glowing Lines */}
            {separators.map((x, i) => (
                <mesh key={`sep-${i}`} position={[x, 0, -50]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.06, 220]} /> 
                    <meshBasicMaterial 
                        color={isSpeedBoostActive ? "#34d399" : "#10b981"} 
                        transparent 
                        opacity={0.6} 
                    />
                </mesh>
            ))}
        </group>
    );
};

const RetroSun: React.FC = () => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const sunGroupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        }
        // Gentle bobbing
        if (sunGroupRef.current) {
            sunGroupRef.current.position.y = 30 + Math.sin(state.clock.elapsedTime * 0.2) * 1.0;
            sunGroupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
        }
    });

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uColorTop: { value: new THREE.Color('#6ee7b7') }, // Emerald 300
        uColorBottom: { value: new THREE.Color('#0d9488') } // Teal 600
    }), []);

    return (
        <group ref={sunGroupRef} position={[0, 30, -180]}>
            {/* Reduced Geometry for Mobile: 32 segments instead of 64 */}
            <mesh>
                <sphereGeometry args={[35, 32, 32]} />
                <shaderMaterial
                    ref={matRef}
                    uniforms={uniforms}
                    transparent
                    vertexShader={`
                        varying vec2 vUv;

                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `}
                    fragmentShader={`
                        varying vec2 vUv;
                        uniform float uTime;
                        uniform vec3 uColorTop;
                        uniform vec3 uColorBottom;

                        void main() {
                            // 1. Basic Vertical Gradient
                            vec3 color = mix(uColorBottom, uColorTop, vUv.y);
                            
                            // 2. Synthwave Scanlines
                            float stripeFreq = 40.0;
                            float stripeSpeed = 1.0;
                            // Simple scanline logic without heavy rim lighting
                            float stripes = sin((vUv.y * stripeFreq) - (uTime * stripeSpeed));
                            
                            // Create sharp bands
                            float stripeMask = smoothstep(0.2, 0.3, stripes);
                            
                            // Fade scanlines out towards the top of the sun
                            float scanlineFade = smoothstep(0.7, 0.3, vUv.y); 
                            
                            // Apply dark bands (scanlines)
                            vec3 finalColor = mix(color, color * 0.1, (1.0 - stripeMask) * scanlineFade);

                            gl_FragColor = vec4(finalColor, 1.0);
                        }
                    `}
                />
            </mesh>
        </group>
    );
};

const MovingGrid: React.FC = () => {
    const { speed, laneCount, isSpeedBoostActive } = useStore(useShallow((s) => ({ speed: s.speed, laneCount: s.laneCount, isSpeedBoostActive: s.isSpeedBoostActive })));
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const scrollOffsetRef = useRef(0);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uSpeedRatio: { value: 1.0 },
        uBoost: { value: 0.0 },
        uCorridorHalfWidth: { value: (3 * LANE_WIDTH) * 0.5 + 2.5 },
        uColorPrimary: { value: new THREE.Color('#10b981') },   // SMIT Emerald 500
        uColorSecondary: { value: new THREE.Color('#14b8a6') }, // SMIT Teal 500
        uColorBoost: { value: new THREE.Color('#34d399') },     // SMIT Emerald 400 Boost
        uFogColor: { value: new THREE.Color('#020617') }        // SMIT Slate 950
    }), []);
    
    useFrame((state, delta) => {
        const activeSpeed = speed > 0 ? speed : 6;
        scrollOffsetRef.current += activeSpeed * delta;

        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            matRef.current.uniforms.uScroll.value = scrollOffsetRef.current;
            matRef.current.uniforms.uSpeedRatio.value = THREE.MathUtils.lerp(
                matRef.current.uniforms.uSpeedRatio.value,
                activeSpeed / 22.5,
                delta * 5.0
            );
            matRef.current.uniforms.uBoost.value = THREE.MathUtils.lerp(
                matRef.current.uniforms.uBoost.value,
                isSpeedBoostActive ? 1.0 : 0.0,
                delta * 6.0
            );
            matRef.current.uniforms.uCorridorHalfWidth.value = (laneCount * LANE_WIDTH) * 0.5 + 2.0;
        }
    });

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, -90]}>
            <planeGeometry args={[340, 360, 120, 120]} />
            <shaderMaterial
                ref={matRef}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                vertexShader={`
                    uniform float uTime;
                    uniform float uScroll;
                    uniform float uBoost;
                    uniform float uCorridorHalfWidth;

                    varying vec3 vWorldPos;
                    varying float vElevation;
                    varying float vCorridorMask;

                    // Procedural pseudo-noise for synthwave valley flanks
                    float synthWaveHeight(vec2 p) {
                        float w1 = sin(p.x * 0.07) * cos(p.y * 0.06);
                        float w2 = sin(p.x * 0.14 + p.y * 0.09) * 0.5;
                        float w3 = cos(p.x * 0.03 - p.y * 0.04) * 0.75;
                        return max(0.0, (w1 + w2 + w3) * 0.5 + 0.35);
                    }

                    void main() {
                        vec3 pos = position;
                        // Plane is rotated -PI/2 on X, so local X = world X, local Y = -world Z
                        float worldX = pos.x;
                        float worldZ = -pos.y - 90.0;
                        float scrolledZ = worldZ - uScroll;

                        // Keep central play corridor flat, raise synthwave ridges along flanks
                        float distFromCenter = abs(worldX);
                        float flankMask = smoothstep(uCorridorHalfWidth, uCorridorHalfWidth + 28.0, distFromCenter);

                        // Rhythmic beat pulse (128 BPM) modulates ridge height slightly
                        float beat = 0.5 + 0.5 * sin(uTime * 6.7);
                        float ridgePulse = 1.0 + beat * 0.14 + uBoost * 0.2;

                        float h = synthWaveHeight(vec2(worldX, scrolledZ)) * flankMask * 14.0 * ridgePulse;
                        pos.z += h; // Local +Z is World +Y after -PI/2 X rotation

                        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
                        vWorldPos = worldPosition.xyz;
                        vElevation = h;
                        vCorridorMask = flankMask;

                        gl_Position = projectionMatrix * viewMatrix * worldPosition;
                    }
                `}
                fragmentShader={`
                    uniform float uTime;
                    uniform float uScroll;
                    uniform float uSpeedRatio;
                    uniform float uBoost;
                    uniform vec3 uColorPrimary;
                    uniform vec3 uColorSecondary;
                    uniform vec3 uColorBoost;
                    uniform vec3 uFogColor;

                    varying vec3 vWorldPos;
                    varying float vElevation;
                    varying float vCorridorMask;

                    void main() {
                        // Scrolled world coordinates moving towards the player (+Z)
                        float scrolledZ = vWorldPos.z - uScroll;
                        vec2 gridCoord = vec2(vWorldPos.x, scrolledZ);

                        // Primary synthwave grid (cell size = 6.0 units)
                        vec2 cell = fract(gridCoord / 6.0);
                        vec2 distToLine = min(cell, 1.0 - cell);

                        // Distance-adaptive line thickness to keep horizon crisp
                        float camDist = clamp(-vWorldPos.z / 160.0, 0.0, 1.0);
                        float lineWidth = mix(0.028, 0.065, camDist);

                        float lineX = 1.0 - smoothstep(0.0, lineWidth, distToLine.x);
                        float lineZ = 1.0 - smoothstep(0.0, lineWidth, distToLine.y);
                        float primaryGrid = max(lineX, lineZ);

                        // Secondary sub-grid for extra speed sensation near player
                        vec2 subCell = fract(gridCoord / 2.0);
                        vec2 subDist = min(subCell, 1.0 - subCell);
                        float subGrid = max(
                            1.0 - smoothstep(0.0, lineWidth * 0.65, subDist.x),
                            1.0 - smoothstep(0.0, lineWidth * 0.65, subDist.y)
                        ) * (1.0 - camDist) * 0.28;

                        // Rhythmic synthwave beat + traveling energy pulse waves
                        float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
                        float waveSpeed = 7.0 + uBoost * 5.0;
                        float forwardWave = 0.5 + 0.5 * sin(scrolledZ * 0.06 + uTime * waveSpeed);
                        float radialWave = 0.5 + 0.5 * sin(length(vec2(vWorldPos.x * 0.4, vWorldPos.z)) * 0.08 - uTime * 5.5);
                        float rhythmPulse = clamp(0.45 + 0.35 * beat + 0.35 * forwardWave * radialWave, 0.2, 1.4);

                        // Blend synthwave palette based on lateral position, elevation, rhythm, and Speed Boost
                        float colorMix = clamp(vElevation * 0.08 + forwardWave * 0.45, 0.0, 1.0);
                        vec3 baseGridColor = mix(uColorPrimary, uColorSecondary, colorMix);
                        vec3 activeGridColor = mix(baseGridColor, uColorBoost, uBoost * 0.75);

                        // Subtle dark synth valley fill between grid lines
                        vec3 cellFill = mix(vec3(0.03, 0.0, 0.08), activeGridColor * 0.14, vCorridorMask * (0.4 + 0.6 * beat));

                        float gridMask = clamp(primaryGrid + subGrid, 0.0, 1.0);
                        float glowBoost = 1.0 + (uSpeedRatio - 1.0) * 0.35 + uBoost * 0.6;
                        vec3 color = mix(cellFill, activeGridColor * rhythmPulse * glowBoost, gridMask);

                        // Highlight grid intersections with extra rhythmic sparkle
                        float intersection = lineX * lineZ;
                        color += vec3(1.0, 0.9, 1.0) * intersection * (0.35 + 0.65 * beat);

                        // Smooth horizon & rear camera fade
                        float horizonFade = smoothstep(-240.0, -55.0, vWorldPos.z);
                        float rearFade = 1.0 - smoothstep(12.0, 45.0, vWorldPos.z);
                        float lateralFade = 1.0 - smoothstep(95.0, 165.0, abs(vWorldPos.x));
                        float visibility = horizonFade * rearFade * lateralFade;

                        vec3 finalColor = mix(uFogColor, color, visibility);
                        float alpha = clamp((0.25 + gridMask * 0.75) * visibility, 0.0, 0.95);

                        gl_FragColor = vec4(finalColor, alpha);
                    }
                `}
            />
        </mesh>
    );
};

// Pre-allocated colors for zero-GC rhythmic lighting interpolation (billing.smit34.ru palette)
const _colorMagenta = new THREE.Color('#10b981');
const _colorCyan = new THREE.Color('#14b8a6');
const _colorViolet = new THREE.Color('#0f766e');
const _colorGold = new THREE.Color('#34d399');
const _tempLightColorA = new THREE.Color();
const _tempLightColorB = new THREE.Color();

const LIGHT_ORB_GEO = new THREE.OctahedronGeometry(0.45, 1);

const RhythmicPointLights: React.FC = () => {
    const { speed, laneCount, isSpeedBoostActive } = useStore(useShallow((s) => ({ speed: s.speed, laneCount: s.laneCount, isSpeedBoostActive: s.isSpeedBoostActive })));

    const sunLightRef = useRef<THREE.PointLight>(null);
    const nearBeatLightRef = useRef<THREE.PointLight>(null);
    const leftChaserLightRef = useRef<THREE.PointLight>(null);
    const rightChaserLightRef = useRef<THREE.PointLight>(null);

    const leftOrbGroupRef = useRef<THREE.Group>(null);
    const rightOrbGroupRef = useRef<THREE.Group>(null);
    const leftOrbMatRef = useRef<THREE.MeshBasicMaterial>(null);
    const rightOrbMatRef = useRef<THREE.MeshBasicMaterial>(null);

    const travelOffsetRef = useRef(0);

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime;
        const activeSpeed = speed > 0 ? speed : 6;
        travelOffsetRef.current += activeSpeed * delta;

        // Shared 128 BPM synthwave rhythmic beat (matches grid & track shaders: uTime * 6.7)
        const rawSine = 0.5 + 0.5 * Math.sin(t * 6.7);
        const primaryBeat = Math.pow(rawSine, 2.0);
        const offBeat = Math.pow(0.5 + 0.5 * Math.sin(t * 6.7 + Math.PI), 2.0);
        const boostFactor = isSpeedBoostActive ? 1.5 : 1.0;

        // 1. Horizon Sun Pulsating PointLight
        if (sunLightRef.current) {
            sunLightRef.current.intensity = (2.2 + primaryBeat * 3.8) * boostFactor;
            _tempLightColorA.copy(_colorMagenta).lerp(_colorGold, isSpeedBoostActive ? 0.8 : primaryBeat * 0.45);
            sunLightRef.current.color.copy(_tempLightColorA);
        }

        // 2. Near-Field / Player Overhead Rhythmic Beat PointLight
        if (nearBeatLightRef.current) {
            nearBeatLightRef.current.intensity = (1.4 + primaryBeat * 2.8) * boostFactor;
            _tempLightColorB.copy(_colorCyan).lerp(
                isSpeedBoostActive ? _colorGold : _colorMagenta,
                isSpeedBoostActive ? 0.75 : offBeat * 0.5
            );
            nearBeatLightRef.current.color.copy(_tempLightColorB);
            nearBeatLightRef.current.position.y = 5.5 + primaryBeat * 1.2;
        }

        // 3. Left & Right Track Flank Chaser PointLights & Glowing Beacon Orbs
        const corridorX = (laneCount * LANE_WIDTH) * 0.5 + 2.2;
        const loopLength = 90;
        const leftZ = -75 + (travelOffsetRef.current % loopLength);
        const rightZ = -75 + ((travelOffsetRef.current + loopLength * 0.5) % loopLength);
        const leftY = 2.6 + primaryBeat * 1.1;
        const rightY = 2.6 + offBeat * 1.1;

        if (leftChaserLightRef.current) {
            leftChaserLightRef.current.position.set(-corridorX, leftY, leftZ);
            leftChaserLightRef.current.intensity = (2.0 + primaryBeat * 3.5) * boostFactor;
            leftChaserLightRef.current.color.copy(isSpeedBoostActive ? _colorGold : _colorCyan);
        }
        if (leftOrbGroupRef.current) {
            leftOrbGroupRef.current.position.set(-corridorX, leftY, leftZ);
            leftOrbGroupRef.current.rotation.y = t * 3.5;
            leftOrbGroupRef.current.scale.setScalar(0.85 + primaryBeat * 0.45);
        }
        if (leftOrbMatRef.current) {
            leftOrbMatRef.current.color.copy(isSpeedBoostActive ? _colorGold : _colorCyan);
        }

        if (rightChaserLightRef.current) {
            rightChaserLightRef.current.position.set(corridorX, rightY, rightZ);
            rightChaserLightRef.current.intensity = (2.0 + offBeat * 3.5) * boostFactor;
            rightChaserLightRef.current.color.copy(isSpeedBoostActive ? _colorGold : _colorMagenta);
        }
        if (rightOrbGroupRef.current) {
            rightOrbGroupRef.current.position.set(corridorX, rightY, rightZ);
            rightOrbGroupRef.current.rotation.y = -t * 3.5;
            rightOrbGroupRef.current.scale.setScalar(0.85 + offBeat * 0.45);
        }
        if (rightOrbMatRef.current) {
            rightOrbMatRef.current.color.copy(isSpeedBoostActive ? _colorGold : _colorMagenta);
        }
    });

    return (
        <group name="RhythmicLightingRig">
            {/* Horizon Sun Pulsating PointLight */}
            <pointLight
                ref={sunLightRef}
                position={[0, 26, -145]}
                intensity={3.0}
                color="#ff007f"
                distance={220}
                decay={1.8}
            />

            {/* Near-Field Beat Fill PointLight illuminating Player & incoming hazards */}
            <pointLight
                ref={nearBeatLightRef}
                position={[0, 6.0, 2]}
                intensity={2.2}
                color="#00f0ff"
                distance={45}
                decay={1.8}
            />

            {/* Left Track Flank Pulsating PointLight & Beacon Orb */}
            <pointLight
                ref={leftChaserLightRef}
                position={[-5.5, 3.0, -30]}
                intensity={3.0}
                color="#00f0ff"
                distance={40}
                decay={2.0}
            />
            <group ref={leftOrbGroupRef} position={[-5.5, 3.0, -30]}>
                <mesh geometry={LIGHT_ORB_GEO}>
                    <meshBasicMaterial ref={leftOrbMatRef} color="#00f0ff" />
                </mesh>
            </group>

            {/* Right Track Flank Pulsating PointLight & Beacon Orb */}
            <pointLight
                ref={rightChaserLightRef}
                position={[5.5, 3.0, -60]}
                intensity={3.0}
                color="#ff007f"
                distance={40}
                decay={2.0}
            />
            <group ref={rightOrbGroupRef} position={[5.5, 3.0, -60]}>
                <mesh geometry={LIGHT_ORB_GEO}>
                    <meshBasicMaterial ref={rightOrbMatRef} color="#ff007f" />
                </mesh>
            </group>
        </group>
    );
};

export const Environment: React.FC = () => {
  return (
    <>
      <color attach="background" args={['#020617']} />
      <fog attach="fog" args={['#020617', 40, 160]} />
      
      <ambientLight intensity={0.28} color="#0f172a" />
      <hemisphereLight args={['#34d399', '#020617', 0.45]} />
      <directionalLight position={[0, 20, -10]} intensity={1.5} color="#6ee7b7" />
      <RhythmicPointLights />
      
      <StarField />
      <MovingGrid />
      <LaneGuides />
      
      <RetroSun />
    </>
  );
};
