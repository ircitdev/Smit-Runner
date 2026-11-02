/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store';
import {
  GameObject,
  ObjectType,
  LANE_WIDTH,
  SPAWN_DISTANCE,
  REMOVE_DISTANCE,
  GameStatus
} from '../../types';
import { audio } from '../System/Audio';

// --- Shared Geometries for Diverse Dynamic Obstacles ---
const SPIKE_CORE_GEO = new THREE.CylinderGeometry(0.32, 0.38, 1.7, 6);
const SPIKE_BLADE_GEO = new THREE.ConeGeometry(0.24, 1.35, 4);
const SPIKE_RING_GEO = new THREE.TorusGeometry(0.65, 0.05, 8, 24);
const SPIKE_BASE_GEO = new THREE.RingGeometry(0.55, 0.9, 6);

const BARRIER_PYLON_GEO = new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8);
const BARRIER_CAP_GEO = new THREE.OctahedronGeometry(0.22, 0);
const BARRIER_BEAM_GEO = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8);
const BARRIER_FIELD_GEO = new THREE.BoxGeometry(1.6, 1.1, 0.12);

const SPINNER_HUB_GEO = new THREE.OctahedronGeometry(0.38, 1);
const SPINNER_ARM_GEO = new THREE.BoxGeometry(1.9, 0.16, 0.16);
const SPINNER_TIP_GEO = new THREE.ConeGeometry(0.18, 0.4, 4);

const ALIEN_BODY_GEO = new THREE.CylinderGeometry(0.6, 0.3, 0.3, 8);
const ALIEN_DOME_GEO = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const ALIEN_EYE_GEO = new THREE.SphereGeometry(0.1);

const MISSILE_CORE_GEO = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const MISSILE_RING_GEO = new THREE.TorusGeometry(0.15, 0.02, 16, 32);

const SHADOW_CIRCLE_GEO = new THREE.CircleGeometry(0.8, 24);
const SHADOW_BARRIER_GEO = new THREE.PlaneGeometry(1.8, 0.7);
const SHADOW_MISSILE_GEO = new THREE.PlaneGeometry(0.18, 3.0);

const MISSILE_SPEED = 32;
const _playerWorldPos = new THREE.Vector3();

// --- Shared Beat-Synced Shader Uniforms & Materials (128 BPM, matching Environment.tsx) ---
const sharedObstacleUniforms = {
  uTime: { value: 0 },
  uBoost: { value: 0 }
};

// 1. Rotating Spike Blade Shader: Vertex normal pulsation + Grid/Scanline + Fresnel Rim Glow
const spikeBladeShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime,
    uBoost: sharedObstacleUniforms.uBoost,
    uColorPrimary: { value: new THREE.Color('#ff0055') },   // Hazard Neon Rose
    uColorSecondary: { value: new THREE.Color('#10b981') }, // SMIT Emerald
    uColorAccent: { value: new THREE.Color('#ffea00') }     // Beat Peak Gold
  },
  vertexShader: `
    uniform float uTime;
    uniform float uBoost;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    varying vec3 vLocalPos;

    void main() {
      vUv = uv;
      vLocalPos = position;

      // Exact 128 BPM beat formula from Environment.tsx
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      float ripple = sin(position.y * 10.0 - uTime * 12.0) * 0.5 + 0.5;

      // Rhythmic vertex inflation along normal + tip stretch on beat
      vec3 displaced = position + normal * (beat * 0.055 + ripple * 0.02 + uBoost * 0.03);
      displaced.y *= 1.0 + beat * 0.12;

      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      vViewPos = -mvPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBoost;
    uniform vec3 uColorPrimary;
    uniform vec3 uColorSecondary;
    uniform vec3 uColorAccent;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    varying vec3 vLocalPos;

    void main() {
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);

      // Synthwave scanlines scrolling toward the spike tip (same visual language as background)
      float scanWave = 0.5 + 0.5 * sin(vLocalPos.y * 26.0 - uTime * 11.0);
      float scanLine = smoothstep(0.55, 0.92, scanWave);

      // Micro-grid lines matching MovingGrid
      vec2 gridCell = fract(vUv * vec2(6.0, 10.0) - vec2(0.0, uTime * 1.8));
      vec2 distToLine = min(gridCell, 1.0 - gridCell);
      float gridMask = max(
        1.0 - smoothstep(0.0, 0.09, distToLine.x),
        1.0 - smoothstep(0.0, 0.09, distToLine.y)
      );

      // Fresnel rim light
      vec3 viewDir = normalize(vViewPos);
      float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.0);

      vec3 baseCol = mix(uColorPrimary, uColorSecondary, gridMask * 0.65 + uBoost * 0.35);
      vec3 pulseCol = mix(baseCol, uColorAccent, beat * 0.6 + scanLine * 0.35);

      float intensity = 1.15 + beat * 1.1 + gridMask * 0.8 + fresnel * 1.4 + uBoost * 0.6;
      gl_FragColor = vec4(pulseCol * intensity, 1.0);
    }
  `
});

// 2. Spike Armored Core & Barrier Pylon Shader: Dark Slate Chassis with Pulsing SMIT Emerald Circuit Grid
const armoredCoreShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime,
    uBoost: sharedObstacleUniforms.uBoost,
    uChassisColor: { value: new THREE.Color('#091326') },   // Deep SMIT Slate
    uGridColor: { value: new THREE.Color('#10b981') },      // SMIT Emerald 500
    uBeatColor: { value: new THREE.Color('#06b6d4') }       // SMIT Cyan 500
  },
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    varying vec3 vLocalPos;

    void main() {
      vUv = uv;
      vLocalPos = position;
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      vec3 displaced = position + normal * (beat * 0.025);

      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      vViewPos = -mvPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBoost;
    uniform vec3 uChassisColor;
    uniform vec3 uGridColor;
    uniform vec3 uBeatColor;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    varying vec3 vLocalPos;

    void main() {
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);

      // Scrolling synthwave circuit grid on armor plates
      vec2 cell = fract(vec2(vUv.x * 6.0, vLocalPos.y * 4.5 - uTime * 1.5));
      vec2 d = min(cell, 1.0 - cell);
      float lineX = 1.0 - smoothstep(0.0, 0.08, d.x);
      float lineY = 1.0 - smoothstep(0.0, 0.08, d.y);
      float grid = max(lineX, lineY);
      float intersection = lineX * lineY;

      vec3 viewDir = normalize(vViewPos);
      float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.5);

      vec3 neon = mix(uGridColor, uBeatColor, beat * 0.7 + uBoost * 0.4);
      vec3 col = mix(uChassisColor, neon * (1.2 + beat * 1.5), grid * (0.45 + 0.55 * beat));
      col += neon * fresnel * (0.9 + beat * 0.8);
      col += vec3(0.8, 1.0, 0.95) * intersection * (0.5 + 0.8 * beat);

      gl_FragColor = vec4(col, 1.0);
    }
  `
});

// 3. Moving Plasma Barrier Energy Shield Shader: Holographic Grid + Rhythmic Beat Shockwaves + Scanlines
const barrierFieldShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime,
    uBoost: sharedObstacleUniforms.uBoost,
    uColorPrimary: { value: new THREE.Color('#10b981') },   // SMIT Emerald
    uColorSecondary: { value: new THREE.Color('#06b6d4') }, // SMIT Cyan
    uColorHazard: { value: new THREE.Color('#ff006e') }     // High-Contrast Plasma Rose
  },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: `
    uniform float uTime;
    uniform float uBoost;
    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      vUv = uv;
      vLocalPos = position;

      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      vec3 pos = position;
      // Vertical & depth wave pulse in sync with music beat
      pos.y *= 1.0 + beat * 0.09 + uBoost * 0.04;
      pos.z += sin(uv.x * 12.56 + uTime * 10.0) * 0.035 * (0.4 + beat);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBoost;
    uniform vec3 uColorPrimary;
    uniform vec3 uColorSecondary;
    uniform vec3 uColorHazard;

    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      float offBeat = pow(0.5 + 0.5 * sin(uTime * 6.7 + 3.14159), 2.0);

      // Synthwave grid matching background MovingGrid
      vec2 gridCoord = vUv * vec2(8.0, 5.0) - vec2(uTime * 1.2, uTime * 2.0);
      vec2 cell = fract(gridCoord);
      vec2 distToLine = min(cell, 1.0 - cell);
      float lineX = 1.0 - smoothstep(0.0, 0.085, distToLine.x);
      float lineY = 1.0 - smoothstep(0.0, 0.085, distToLine.y);
      float gridMask = max(lineX, lineY);
      float intersection = lineX * lineY;

      // Rhythmic horizontal scanbars & radial pulse from shield center
      float scanbar = smoothstep(0.3, 0.95, 0.5 + 0.5 * sin(vUv.y * 36.0 - uTime * 14.0));
      float centerDist = length((vUv - 0.5) * vec2(1.6, 1.0));
      float shockwave = smoothstep(0.12, 0.0, abs(fract(centerDist * 1.8 - uTime * 1.06) - 0.5));

      // Glowing frame border
      vec2 edgeDist = min(vUv, 1.0 - vUv);
      float border = 1.0 - smoothstep(0.0, 0.09, min(edgeDist.x, edgeDist.y));

      vec3 basePalette = mix(uColorPrimary, uColorSecondary, vUv.y + 0.3 * sin(uTime * 3.0));
      vec3 activeColor = mix(basePalette, uColorHazard, 0.35 + 0.45 * beat);

      vec3 finalColor = activeColor * (0.45 + gridMask * 0.95 + scanbar * 0.35 + shockwave * 0.8 * beat + border * 1.3);
      finalColor += vec3(0.85, 1.0, 0.95) * intersection * (0.5 + 0.8 * offBeat);

      float alpha = clamp(0.38 + gridMask * 0.42 + border * 0.45 + shockwave * 0.25 + beat * 0.18, 0.3, 0.92);
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
});

// 4. High-Energy Laser Beam & Spinner Blade Shader
const laserBeamShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime,
    uBoost: sharedObstacleUniforms.uBoost,
    uColorA: { value: new THREE.Color('#34d399') }, // Emerald 400
    uColorB: { value: new THREE.Color('#ff006e') }  // Neon Rose
  },
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      vUv = uv;
      vLocalPos = position;
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      vec3 displaced = position + normal * (beat * 0.03);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBoost;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      float energyWave = 0.5 + 0.5 * sin(vLocalPos.x * 12.0 + vLocalPos.y * 12.0 - uTime * 16.0);
      vec3 col = mix(uColorA, uColorB, energyWave * 0.65 + beat * 0.35);
      float glow = 1.6 + beat * 1.5 + energyWave * 0.8 + uBoost * 0.5;
      gl_FragColor = vec4(col * glow, 1.0);
    }
  `
});

// 5. Ground Hazard Ring Shader: Concentric rhythmic pulse ring on track floor
const hazardRingShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime,
    uColor: { value: new THREE.Color('#10b981') },
    uHazardColor: { value: new THREE.Color('#ff0055') }
  },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      vec3 pos = position * (1.0 + beat * 0.14);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uHazardColor;
    varying vec2 vUv;
    void main() {
      float beat = pow(0.5 + 0.5 * sin(uTime * 6.7), 2.0);
      float wave = 0.5 + 0.5 * sin(vUv.x * 25.13 - uTime * 8.0);
      vec3 col = mix(uColor, uHazardColor, 0.5 + 0.5 * beat);
      float alpha = 0.45 + 0.45 * beat * wave;
      gl_FragColor = vec4(col * (1.4 + beat), alpha);
    }
  `
});

// 6. Chromatic Aberration Explosion Shard Shader & Shockwave Ring Shader
const EXPLOSION_SHARD_COUNT = 540;
const EXPLOSION_RING_COUNT = 4;
const EXPLOSION_SHARD_BASE_GEO = new THREE.OctahedronGeometry(0.38, 0);
const EXPLOSION_SHOCKWAVE_GEO = new THREE.RingGeometry(0.25, 0.95, 48);

const chromaticExplosionShardMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  vertexShader: `
    attribute vec3 aColor;
    attribute vec2 aChromaMeta; // x: channel (-1 = R, 0 = G, 1 = B), y: lifeRatio (0..1)
    varying vec3 vColor;
    varying vec2 vChromaMeta;
    varying vec2 vUv;
    varying vec3 vLocalPos;
    varying vec3 vNormal;

    void main() {
      vColor = aColor;
      vChromaMeta = aChromaMeta;
      vUv = uv;
      vLocalPos = position;
      vNormal = normal;

      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec3 vColor;
    varying vec2 vChromaMeta;
    varying vec2 vUv;
    varying vec3 vLocalPos;
    varying vec3 vNormal;

    void main() {
      float life = clamp(vChromaMeta.y, 0.0, 1.0);
      if (life <= 0.001) discard;

      // Chromatic aberration UV & local-space RGB prism dispersion across each shard
      float aberrationSpread = (1.0 - life * 0.45) * 0.38;
      float coordR = vLocalPos.x + aberrationSpread;
      float coordG = vLocalPos.x;
      float coordB = vLocalPos.x - aberrationSpread;

      float bandR = smoothstep(0.42, -0.15, abs(coordR));
      float bandG = smoothstep(0.42, -0.15, abs(coordG));
      float bandB = smoothstep(0.42, -0.15, abs(coordB));

      // High-frequency glitch scanline
      float glitchLine = 0.72 + 0.28 * sin(vLocalPos.y * 34.0 - uTime * 42.0 + vChromaMeta.x * 2.1);

      vec3 prismSplit = vec3(
        bandR * 1.35,
        bandG * 1.15,
        bandB * 1.40
      );

      // Blend instance channel color with the internal RGB chromatic fringe
      vec3 finalCol = mix(prismSplit, vColor * 1.45, 0.62) * glitchLine;
      float edgeGlow = 1.6 + (1.0 - abs(vNormal.z)) * 1.25;
      float alpha = smoothstep(0.0, 0.2, life) * (0.55 + 0.45 * life);

      gl_FragColor = vec4(finalCol * edgeGlow, alpha);
    }
  `
});

const chromaticShockwaveRingMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: sharedObstacleUniforms.uTime
  },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vLocalPos;
    void main() {
      vUv = uv;
      vLocalPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vLocalPos;

    void main() {
      float r = length(vLocalPos.xy);
      // Normalized radius from 0.25 to 0.95
      float normR = clamp((r - 0.25) / 0.70, 0.0, 1.0);

      // Concentric RGB chromatic aberration bands separated radially
      float rBand = smoothstep(0.24, 0.0, abs(normR - 0.82));
      float gBand = smoothstep(0.24, 0.0, abs(normR - 0.54));
      float bBand = smoothstep(0.24, 0.0, abs(normR - 0.26));

      float angle = atan(vLocalPos.y, vLocalPos.x);
      float angularGlitch = 0.75 + 0.25 * sin(angle * 16.0 + uTime * 35.0);

      vec3 col = (
        vec3(1.0, 0.0, 0.35) * rBand * 2.4 +
        vec3(0.06, 0.95, 0.58) * gBand * 2.1 +
        vec3(0.0, 0.92, 1.0) * bBand * 2.4
      ) * angularGlitch;

      float alpha = clamp((rBand + gBand + bBand) * 0.75, 0.0, 0.95);
      gl_FragColor = vec4(col, alpha);
    }
  `
});

interface ExplosionShard {
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  rotVel: THREE.Vector3;
  color: THREE.Color;
  channel: number; // -1 = Red, 0 = Green/Primary, 1 = Cyan/Blue
  size: number;
  stretchX: number;
}

interface ShockwaveRingState {
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
}

const CHROMA_RED = new THREE.Color('#ff0055');
const CHROMA_GREEN = new THREE.Color('#10b981');
const CHROMA_CYAN = new THREE.Color('#00f0ff');
const CHROMA_WHITE = new THREE.Color('#e0f2fe');

const ObstacleExplosionSystem: React.FC = () => {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Clone geometry once and attach per-instance attributes for color and chromatic metadata
  const { geometry, colorArray, metaArray, colorAttr, metaAttr } = useMemo(() => {
    const geo = EXPLOSION_SHARD_BASE_GEO.clone();
    const cArr = new Float32Array(EXPLOSION_SHARD_COUNT * 3);
    const mArr = new Float32Array(EXPLOSION_SHARD_COUNT * 2);
    const cAttr = new THREE.InstancedBufferAttribute(cArr, 3);
    const mAttr = new THREE.InstancedBufferAttribute(mArr, 2);
    cAttr.setUsage(THREE.DynamicDrawUsage);
    mAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', cAttr);
    geo.setAttribute('aChromaMeta', mAttr);
    return {
      geometry: geo,
      colorArray: cArr,
      metaArray: mArr,
      colorAttr: cAttr,
      metaAttr: mAttr
    };
  }, []);

  const shards = useMemo<ExplosionShard[]>(
    () =>
      Array.from({ length: EXPLOSION_SHARD_COUNT }, () => ({
        life: 0,
        maxLife: 0.7,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        color: new THREE.Color('#10b981'),
        channel: 0,
        size: 1,
        stretchX: 1.8
      })),
    []
  );

  const rings = useMemo<ShockwaveRingState[]>(
    () =>
      Array.from({ length: EXPLOSION_RING_COUNT }, () => ({
        life: 0,
        maxLife: 0.55,
        pos: new THREE.Vector3()
      })),
    []
  );

  useEffect(() => {
    const handleObstacleExplosion = (e: Event) => {
      const customEvent = e as CustomEvent<{ position: [number, number, number]; color?: string }>;
      if (!customEvent.detail) return;
      const { position, color } = customEvent.detail;
      const baseColor = new THREE.Color(color || '#10b981').lerp(CHROMA_GREEN, 0.35);

      // 1. Trigger an expanding 3D chromatic shockwave ring at the collision point
      const availableRing = rings.find(r => r.life <= 0) || rings[0];
      availableRing.maxLife = 0.52;
      availableRing.life = availableRing.maxLife;
      availableRing.pos.set(position[0], Math.max(0.95, position[1]), position[2] + 0.25);

      // 2. Spawn 36 lateral-biased trajectory vectors x 3 RGB Chromatic Triplets (108 shards)
      //    + 24 high-speed sideways plasma sparks (132 particles total per collision)
      let cursor = 0;
      const findFreeShard = (): ExplosionShard | null => {
        while (cursor < EXPLOSION_SHARD_COUNT) {
          const candidate = shards[cursor++];
          if (candidate.life <= 0) return candidate;
        }
        return null;
      };

      const tripletCount = 36;
      for (let t = 0; t < tripletCount; t++) {
        // Strong sideways (left/right) dispersion so particles burst across the lanes
        const sideSign = t % 2 === 0 ? 1 : -1;
        const lateralSpeed = (9.5 + Math.random() * 17.5) * sideSign;
        const verticalSpeed = -1.5 + Math.random() * 12.0;
        const depthSpeed = (Math.random() - 0.35) * 11.0;

        const baseRotX = Math.random() * Math.PI * 2;
        const baseRotY = Math.random() * Math.PI * 2;
        const baseRotZ = Math.random() * Math.PI * 2;
        const baseLife = 0.55 + Math.random() * 0.4;
        const baseSize = 0.65 + Math.random() * 0.55;

        // Spawn 3 RGB chromatic aberration sister shards along the same lateral vector
        // with slightly offset lateral speed & position so they visibly split into R / G / B trails
        const channels: Array<{ ch: number; col: THREE.Color; velScale: number; xOffset: number; yOffset: number }> = [
          { ch: -1, col: CHROMA_RED, velScale: 1.14, xOffset: 0.16 * sideSign, yOffset: 0.05 },
          { ch: 0, col: baseColor, velScale: 1.0, xOffset: 0.0, yOffset: 0.0 },
          { ch: 1, col: CHROMA_CYAN, velScale: 0.86, xOffset: -0.16 * sideSign, yOffset: -0.05 }
        ];

        for (const c of channels) {
          const p = findFreeShard();
          if (!p) break;

          p.maxLife = baseLife;
          p.life = baseLife;
          p.pos.set(
            position[0] + c.xOffset,
            Math.max(0.4, position[1] + c.yOffset),
            position[2]
          );
          p.vel.set(
            lateralSpeed * c.velScale,
            verticalSpeed * (0.95 + c.ch * 0.06),
            depthSpeed * c.velScale
          );
          p.rot.set(baseRotX + c.ch * 0.18, baseRotY, baseRotZ);
          p.rotVel.set(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14
          );
          p.color.copy(c.col);
          p.channel = c.ch;
          p.size = baseSize;
          p.stretchX = 1.9 + Math.random() * 1.4;
        }
      }

      // Extra high-velocity lateral white/cyan core streaks
      for (let s = 0; s < 24; s++) {
        const p = findFreeShard();
        if (!p) break;
        const sideSign = s % 2 === 0 ? 1 : -1;
        p.maxLife = 0.38 + Math.random() * 0.25;
        p.life = p.maxLife;
        p.pos.set(position[0], Math.max(0.6, position[1]), position[2]);
        p.vel.set(
          sideSign * (15 + Math.random() * 18),
          (Math.random() - 0.3) * 10,
          (Math.random() - 0.3) * 9
        );
        p.rot.set(0, 0, (Math.random() - 0.5) * 0.6);
        p.rotVel.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
        p.color.copy(s % 3 === 0 ? CHROMA_WHITE : s % 3 === 1 ? CHROMA_RED : CHROMA_CYAN);
        p.channel = (s % 3) - 1;
        p.size = 0.5 + Math.random() * 0.45;
        p.stretchX = 2.8 + Math.random() * 1.5;
      }
    };

    window.addEventListener('obstacle-explosion', handleObstacleExplosion);
    return () => window.removeEventListener('obstacle-explosion', handleObstacleExplosion);
  }, [shards, rings]);

  useFrame((_, delta) => {
    if (!instancedRef.current) return;
    const safeDelta = Math.min(delta, 0.05);

    // 1. Update Chromatic Shards
    for (let i = 0; i < EXPLOSION_SHARD_COUNT; i++) {
      const p = shards[i];
      const cIdx = i * 3;
      const mIdx = i * 2;

      if (p.life > 0) {
        p.life -= safeDelta;
        const lifeRatio = Math.max(0, p.life / p.maxLife);

        p.pos.addScaledVector(p.vel, safeDelta);
        // Gravity pull + aerodynamic lateral drag after the initial sideways blast
        p.vel.y -= safeDelta * 9.5;
        p.vel.x *= Math.pow(0.94, safeDelta * 60);
        p.vel.z *= Math.pow(0.95, safeDelta * 60);

        // Bounce off track floor with sparks
        if (p.pos.y < 0.08 && p.vel.y < 0) {
          p.pos.y = 0.08;
          p.vel.y = -p.vel.y * 0.45;
        }

        p.rot.x += p.rotVel.x * safeDelta;
        p.rot.y += p.rotVel.y * safeDelta;
        p.rot.z += p.rotVel.z * safeDelta;

        dummy.position.copy(p.pos);
        dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);

        const baseScale = lifeRatio * p.size * 0.38;
        // Stretch sideways along X to accentuate the lateral explosion & chromatic streaks
        dummy.scale.set(baseScale * p.stretchX, baseScale * 0.72, baseScale * 0.72);
        dummy.updateMatrix();

        instancedRef.current.setMatrixAt(i, dummy.matrix);

        colorArray[cIdx] = p.color.r;
        colorArray[cIdx + 1] = p.color.g;
        colorArray[cIdx + 2] = p.color.b;

        metaArray[mIdx] = p.channel;
        metaArray[mIdx + 1] = lifeRatio;
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedRef.current.setMatrixAt(i, dummy.matrix);
        metaArray[mIdx + 1] = 0;
      }
    }

    instancedRef.current.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
    metaAttr.needsUpdate = true;

    // 2. Update Expanding 3D Chromatic Shockwave Rings
    for (let r = 0; r < EXPLOSION_RING_COUNT; r++) {
      const ringState = rings[r];
      const mesh = ringRefs.current[r];
      if (!mesh) continue;

      if (ringState.life > 0) {
        ringState.life -= safeDelta;
        const progress = 1.0 - Math.max(0, ringState.life / ringState.maxLife);
        // Rapid lateral expansion (wider horizontally than vertically)
        const scaleX = 0.6 + Math.pow(progress, 0.55) * 8.2;
        const scaleY = 0.6 + Math.pow(progress, 0.65) * 4.8;

        mesh.visible = true;
        mesh.position.copy(ringState.pos);
        mesh.scale.set(scaleX, scaleY, 1);
      } else {
        mesh.visible = false;
        mesh.scale.set(0, 0, 0);
      }
    }
  });

  return (
    <group name="ObstacleExplosionSystem">
      <instancedMesh
        ref={instancedRef}
        args={[geometry, chromaticExplosionShardMat, EXPLOSION_SHARD_COUNT]}
        frustumCulled={false}
      />
      {rings.map((_, idx) => (
        <mesh
          key={`chroma-wave-${idx}`}
          ref={el => {
            ringRefs.current[idx] = el;
          }}
          geometry={EXPLOSION_SHOCKWAVE_GEO}
          material={chromaticShockwaveRingMat}
          visible={false}
        />
      ))}
    </group>
  );
};

export const ObstacleManager: React.FC = () => {
  const { status, speed, laneCount, level, distance, multiplier, registerDodge, isSpeedBoostActive } = useStore();

  const obstaclesRef = useRef<GameObject[]>([]);
  const [, setRenderTrigger] = useState(0);
  const prevStatus = useRef(status);
  const prevLevel = useRef(level);
  const playerObjRef = useRef<THREE.Object3D | null>(null);

  // Handle game state resets and level-up transitions
  useEffect(() => {
    const isRestart = status === GameStatus.PLAYING && prevStatus.current === GameStatus.GAME_OVER;
    const isMenuReset = status === GameStatus.MENU;
    const isLevelUp = level !== prevLevel.current && status === GameStatus.PLAYING;
    const isVictoryReset = status === GameStatus.PLAYING && prevStatus.current === GameStatus.VICTORY;

    if (isMenuReset || isRestart || isVictoryReset) {
      obstaclesRef.current = [];
      setRenderTrigger(t => t + 1);
    } else if (isLevelUp && level > 1) {
      // Clear obstacles near the shop portal spawn area (-100) so the portal is unobstructed
      obstaclesRef.current = obstaclesRef.current.filter(obj => obj.position[2] > -75);
      setRenderTrigger(t => t + 1);
    }

    prevStatus.current = status;
    prevLevel.current = level;
  }, [status, level]);

  // Locate player object reference once
  useFrame((state) => {
    if (!playerObjRef.current) {
      const group = state.scene.getObjectByName('PlayerGroup');
      if (group && group.children.length > 0) {
        playerObjRef.current = group.children[0];
      }
    }
  });

  useFrame((state, delta) => {
    //Normalized combo intensity (0.0 at x1 up to 1.0 at x10)
    const comboIntensity = Math.min(1.0, Math.max(0, (multiplier - 1) / 9));

    // Always update shared rhythmic shader uniforms so obstacles pulse even on pause/shop
    sharedObstacleUniforms.uTime.value = state.clock.elapsedTime;
    sharedObstacleUniforms.uBoost.value = THREE.MathUtils.lerp(
      sharedObstacleUniforms.uBoost.value,
      isSpeedBoostActive ? 1.0 : comboIntensity * 0.65,
      Math.min(delta, 0.05) * 6.0
    );

    if (status !== GameStatus.PLAYING) return;

    const safeDelta = Math.min(delta, 0.05);
    const distDelta = speed * safeDelta;
    const elapsed = state.clock.elapsedTime;

    // Adaptive difficulty factor driven by current combo multiplier, distance, and level
    const difficulty = 1 + (distance / 320) + (level - 1) * 0.45 + (multiplier - 1) * 0.24;
    const maxTrackX = Math.floor(laneCount / 2) * LANE_WIDTH;

    if (playerObjRef.current) {
      playerObjRef.current.getWorldPosition(_playerWorldPos);
    }

    let hasChanges = false;
    const currentObstacles = obstaclesRef.current;
    const keptObstacles: GameObject[] = [];
    const newlySpawned: GameObject[] = [];

    for (const obj of currentObstacles) {
      let moveAmount = distDelta;

      if (obj.type === ObjectType.MISSILE) {
        moveAmount += (MISSILE_SPEED + difficulty * 2.5) * safeDelta;
      }

      const prevZ = obj.position[2];
      obj.position[2] += moveAmount;

      // Dynamic Lateral / Vertical Movement based on obstacle type, amplified slightly by combo intensity
      const baseX = obj.initialX ?? obj.position[0];
      const baseY = obj.initialY ?? obj.position[1];
      const moveSpeed = (obj.moveSpeed ?? 2.0) * (1 + comboIntensity * 0.25);
      const moveRange = obj.moveRange ?? LANE_WIDTH;
      const phase = obj.phase ?? 0;

      if (obj.type === ObjectType.MOVING_BARRIER) {
        // Smoothly strafe across lanes, clamped within playable track boundaries
        const targetX = baseX + Math.sin(elapsed * moveSpeed + phase) * moveRange;
        obj.position[0] = THREE.MathUtils.clamp(targetX, -maxTrackX, maxTrackX);
      } else if (obj.type === ObjectType.ROTATING_SPIKE && moveRange > 0) {
        // Subtle lateral weave at higher distances / combo
        const targetX = baseX + Math.sin(elapsed * moveSpeed + phase) * moveRange;
        obj.position[0] = THREE.MathUtils.clamp(targetX, -maxTrackX, maxTrackX);
      } else if (obj.type === ObjectType.LASER_SPINNER) {
        // Vertical oscillation + slight lateral sway
        obj.position[1] = baseY + Math.sin(elapsed * moveSpeed + phase) * 0.55;
        if (moveRange > 0) {
          const targetX = baseX + Math.cos(elapsed * (moveSpeed * 0.7) + phase) * moveRange;
          obj.position[0] = THREE.MathUtils.clamp(targetX, -maxTrackX, maxTrackX);
        }
      } else if (obj.type === ObjectType.ALIEN) {
        // Aliens strafe and fire missiles when in range
        if (moveRange > 0) {
          const targetX = baseX + Math.sin(elapsed * moveSpeed + phase) * moveRange;
          obj.position[0] = THREE.MathUtils.clamp(targetX, -maxTrackX, maxTrackX);
        }

        if (obj.active && !obj.hasFired && obj.position[2] > -92) {
          obj.hasFired = true;
          newlySpawned.push({
            id: uuidv4(),
            type: ObjectType.MISSILE,
            position: [obj.position[0], 1.0, obj.position[2] + 2.0],
            active: true,
            color: '#ff0033',
            rotationSpeed: 22
          });
          hasChanges = true;

          window.dispatchEvent(
            new CustomEvent('particle-burst', {
              detail: { position: obj.position, color: '#10b981' }
            })
          );
        }
      }

      let keep = true;

      // Swept collision detection against the player
      if (obj.active) {
        const zThreshold = 1.9;
        const inZZone =
          prevZ < _playerWorldPos.z + zThreshold &&
          obj.position[2] > _playerWorldPos.z - zThreshold;

        if (inZZone) {
          // Moving barriers are slightly wider than single-lane spikes
          const horizontalHitThreshold = obj.type === ObjectType.MOVING_BARRIER ? 1.15 : 0.92;
          const dx = Math.abs(obj.position[0] - _playerWorldPos.x);

          if (dx < horizontalHitThreshold) {
            const playerBottom = _playerWorldPos.y;
            const playerTop = _playerWorldPos.y + 1.8;

            let objBottom = 0;
            let objTop = 1.6;

            if (obj.type === ObjectType.ROTATING_SPIKE) {
              objBottom = 0;
              objTop = 1.75;
            } else if (obj.type === ObjectType.MOVING_BARRIER) {
              objBottom = 0;
              objTop = 1.5;
            } else if (obj.type === ObjectType.LASER_SPINNER) {
              objBottom = Math.max(0, obj.position[1] - 0.75);
              objTop = obj.position[1] + 0.75;
            } else if (obj.type === ObjectType.ALIEN) {
              objBottom = obj.position[1] - 0.5;
              objTop = obj.position[1] + 0.6;
            } else if (obj.type === ObjectType.MISSILE) {
              objBottom = 0.5;
              objTop = 1.5;
            }

            const isHit = playerBottom < objTop && playerTop > objBottom;

            if (isHit) {
              window.dispatchEvent(new Event('player-hit'));
              obj.active = false;
              hasChanges = true;

              const impactPosition: [number, number, number] = [
                obj.position[0],
                Math.max(0.95, obj.position[1]),
                obj.position[2]
              ];

              window.dispatchEvent(
                new CustomEvent('obstacle-explosion', {
                  detail: {
                    position: impactPosition,
                    color: obj.color || '#ff0054',
                    type: obj.type
                  }
                })
              );

              window.dispatchEvent(
                new CustomEvent('particle-burst', {
                  detail: {
                    position: impactPosition,
                    color: obj.color || '#ff0054'
                  }
                })
              );
            }
          }
        } else if (!obj.passed && obj.position[2] > _playerWorldPos.z + zThreshold) {
          // Player successfully dodged this obstacle!
          obj.passed = true;
          const dx = Math.abs(obj.position[0] - _playerWorldPos.x);
          const isCloseCall = dx <= LANE_WIDTH * 1.15;
          registerDodge(isCloseCall);
          const nextCombo = useStore.getState().combo;
          audio.playDodge(nextCombo, isCloseCall);
        }
      }

      if (obj.position[2] > REMOVE_DISTANCE) {
        keep = false;
        hasChanges = true;
      }

      if (keep) {
        keptObstacles.push(obj);
      }
    }

    if (newlySpawned.length > 0) {
      keptObstacles.push(...newlySpawned);
    }

    // --- Adaptive Combo-Multiplier & Distance-Scaled Obstacle Spawning ---
    const nonMissileObstacles = keptObstacles.filter(o => o.type !== ObjectType.MISSILE);
    const furthestZ =
      nonMissileObstacles.length > 0
        ? Math.min(...nonMissileObstacles.map(o => o.position[2]))
        : -25;

    // Wave spacing compresses dynamically as combo multiplier and distance increase,
    // while maintaining a physical minimum clearance for landing jumps
    const distanceCompression = Math.min(8, distance / 140);
    const comboCompression = (multiplier - 1) * 1.15; // Up to -10.35 units tighter at x10
    const minGap = Math.max(10.5, 23 - distanceCompression - comboCompression + (speed * 0.22));

    if (furthestZ > -SPAWN_DISTANCE) {
      const spawnZ = Math.min(furthestZ - minGap, -SPAWN_DISTANCE);

      const availableLanes: number[] = [];
      const maxLane = Math.floor(laneCount / 2);
      for (let i = -maxLane; i <= maxLane; i++) {
        availableLanes.push(i);
      }
      availableLanes.sort(() => Math.random() - 0.5);

      // Multi-lane obstacle density increases with combo multiplier (always leaving >=1 open lane)
      const maxSimultaneous = Math.max(1, availableLanes.length - 1);
      const multiSpawnChance = Math.min(0.88, 0.24 + (difficulty - 1) * 0.16 + comboIntensity * 0.36);
      let countToSpawn = 1;

      const roll = Math.random();
      if (roll < multiSpawnChance && maxSimultaneous >= 2) {
        countToSpawn = 2;
        if (roll < multiSpawnChance * (0.4 + comboIntensity * 0.25) && maxSimultaneous >= 3) {
          countToSpawn = 3;
        }
      }

      for (let i = 0; i < countToSpawn; i++) {
        const lane = availableLanes[i];
        const laneX = lane * LANE_WIDTH;
        const typeRoll = Math.random();

        // Higher combo multipliers unlock and boost complex dynamic hazards earlier
        const alienChance =
          level >= 2 || distance > 250 || multiplier >= 4
            ? Math.min(0.28, 0.08 + (difficulty - 1) * 0.05 + comboIntensity * 0.1)
            : 0;
        const spinnerChance =
          distance > 60 || multiplier >= 2
            ? Math.min(0.32, 0.12 + (difficulty - 1) * 0.05 + comboIntensity * 0.12)
            : 0.1;
        const barrierChance = 0.42;

        if (typeRoll < alienChance) {
          // Strafing Alien Saucer
          const strafeRange = difficulty > 1.3 ? LANE_WIDTH * (0.7 + comboIntensity * 0.3) : 0;
          keptObstacles.push({
            id: uuidv4(),
            type: ObjectType.ALIEN,
            position: [laneX, 1.5, spawnZ],
            initialX: laneX,
            initialY: 1.5,
            moveSpeed: 1.6 + difficulty * 0.45,
            moveRange: strafeRange,
            phase: Math.random() * Math.PI * 2,
            active: true,
            color: '#10b981',
            hasFired: false
          });
        } else if (typeRoll < alienChance + spinnerChance) {
          // Rotating & Vertically Oscillating Laser Spinner
          keptObstacles.push({
            id: uuidv4(),
            type: ObjectType.LASER_SPINNER,
            position: [laneX, 1.25, spawnZ],
            initialX: laneX,
            initialY: 1.25,
            moveSpeed: 2.2 + difficulty * 0.5,
            moveRange: difficulty > 1.6 ? LANE_WIDTH * 0.45 : 0,
            phase: Math.random() * Math.PI * 2,
            rotationSpeed: 4.5 + difficulty * 1.8,
            active: true,
            color: '#06b6d4'
          });
        } else if (typeRoll < alienChance + spinnerChance + barrierChance) {
          // Moving Plasma Barrier (slides horizontally across lanes)
          const sweepMultiplier = countToSpawn > 1 ? 0.65 : Math.min(1.5, 0.85 + (difficulty - 1) * 0.25);
          keptObstacles.push({
            id: uuidv4(),
            type: ObjectType.MOVING_BARRIER,
            position: [laneX, 0.8, spawnZ],
            initialX: laneX,
            initialY: 0.8,
            moveSpeed: 1.8 + difficulty * 0.65,
            moveRange: LANE_WIDTH * sweepMultiplier,
            phase: Math.random() * Math.PI * 2,
            active: true,
            color: '#10b981'
          });
        } else {
          // Rotating Cyber Spike Cluster
          const weaveRange = (difficulty > 1.4 || multiplier >= 3) && countToSpawn === 1 ? LANE_WIDTH * 0.55 : 0;
          keptObstacles.push({
            id: uuidv4(),
            type: ObjectType.ROTATING_SPIKE,
            position: [laneX, 0.85, spawnZ],
            initialX: laneX,
            initialY: 0.85,
            moveSpeed: 2.0 + difficulty * 0.5,
            moveRange: weaveRange,
            phase: Math.random() * Math.PI * 2,
            rotationSpeed: 3.5 + difficulty * 1.6,
            active: true,
            color: '#ff0054'
          });
        }
      }

      hasChanges = true;
    }

    if (hasChanges) {
      obstaclesRef.current = keptObstacles;
      setRenderTrigger(t => t + 1);
    }
  });

  return (
    <group name="ObstacleGroup">
      <ObstacleExplosionSystem />
      {obstaclesRef.current.map(obj => {
        if (!obj.active) return null;
        return <ObstacleEntity key={obj.id} data={obj} />;
      })}
    </group>
  );
};

const ObstacleEntity: React.FC<{ data: GameObject }> = React.memo(({ data }) => {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const innerSpinRef = useRef<THREE.Group>(null);
  const outerSpinRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.set(data.position[0], 0, data.position[2]);
    }

    if (visualRef.current) {
      visualRef.current.position.y = data.position[1];
      const rotSpeed = data.rotationSpeed ?? 4.0;

      // Sync scale pulse slightly with the 128 BPM beat (uTime * 6.7)
      const beat = Math.pow(0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 6.7), 2.0);

      if (data.type === ObjectType.ROTATING_SPIKE) {
        if (innerSpinRef.current) {
          innerSpinRef.current.rotation.y += delta * (rotSpeed + beat * 3.0);
        }
        if (outerSpinRef.current) {
          outerSpinRef.current.rotation.y -= delta * (rotSpeed * 1.3 + beat * 2.5);
          outerSpinRef.current.rotation.z += delta * (rotSpeed * 0.8);
        }
      } else if (data.type === ObjectType.MOVING_BARRIER) {
        if (innerSpinRef.current) {
          const pulse = 1 + beat * 0.08;
          innerSpinRef.current.scale.set(1, pulse, 1);
        }
      } else if (data.type === ObjectType.LASER_SPINNER) {
        visualRef.current.rotation.z += delta * (rotSpeed + beat * 2.5);
        visualRef.current.rotation.y += delta * (rotSpeed * 0.4);
      } else if (data.type === ObjectType.ALIEN) {
        visualRef.current.position.y = data.position[1] + Math.sin(state.clock.elapsedTime * 3.5) * 0.2;
        visualRef.current.rotation.y += delta * 1.8;
      } else if (data.type === ObjectType.MISSILE) {
        visualRef.current.rotation.z += delta * 22;
      }
    }
  });

  const shadowGeo = useMemo(() => {
    if (data.type === ObjectType.MOVING_BARRIER) return SHADOW_BARRIER_GEO;
    if (data.type === ObjectType.MISSILE) return SHADOW_MISSILE_GEO;
    return SHADOW_CIRCLE_GEO;
  }, [data.type]);

  return (
    <group ref={groupRef} position={[data.position[0], 0, data.position[2]]}>
      <mesh
        ref={shadowRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        geometry={shadowGeo}
      >
        <meshBasicMaterial color="#000000" opacity={0.35} transparent />
      </mesh>

      <group ref={visualRef} position={[0, data.position[1], 0]}>
        {/* --- ROTATING SPIKE CLUSTER (WITH BEAT-SYNCED SHADERS) --- */}
        {data.type === ObjectType.ROTATING_SPIKE && (
          <group>
            {/* Armored Central Core with Circuit Grid Shader */}
            <mesh
              castShadow
              receiveShadow
              geometry={SPIKE_CORE_GEO}
              material={armoredCoreShaderMat}
            />

            {/* Primary Rotating 4-Blade Spike Star with Beat-Synced Displacement & Scanline Shader */}
            <group ref={innerSpinRef}>
              <mesh
                rotation={[0, 0, Math.PI / 2]}
                geometry={SPIKE_BLADE_GEO}
                material={spikeBladeShaderMat}
              />
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                geometry={SPIKE_BLADE_GEO}
                material={spikeBladeShaderMat}
              />
            </group>

            {/* Counter-Rotating Gyro Ring & Diagonal Blades */}
            <group ref={outerSpinRef}>
              <mesh geometry={SPIKE_RING_GEO} material={laserBeamShaderMat} />
              <mesh
                rotation={[Math.PI / 4, 0, Math.PI / 4]}
                geometry={SPIKE_BLADE_GEO}
                scale={[0.82, 0.88, 0.82]}
                material={spikeBladeShaderMat}
              />
            </group>

            {/* Base Rhythmic Shockwave Ring */}
            <mesh
              position={[0, -0.8, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={SPIKE_BASE_GEO}
              material={hazardRingShaderMat}
            />
          </group>
        )}

        {/* --- MOVING PLASMA BARRIER (WITH BEAT-SYNCED HOLOGRAPHIC GRID SHADER) --- */}
        {data.type === ObjectType.MOVING_BARRIER && (
          <group>
            {/* Left & Right Armored Emitter Pylons with Circuit Grid Shader */}
            <mesh
              position={[-0.8, 0, 0]}
              castShadow
              geometry={BARRIER_PYLON_GEO}
              material={armoredCoreShaderMat}
            />
            <mesh
              position={[0.8, 0, 0]}
              castShadow
              geometry={BARRIER_PYLON_GEO}
              material={armoredCoreShaderMat}
            />

            {/* Glowing Beacon Caps */}
            <mesh
              position={[-0.8, 0.9, 0]}
              geometry={BARRIER_CAP_GEO}
              material={spikeBladeShaderMat}
            />
            <mesh
              position={[0.8, 0.9, 0]}
              geometry={BARRIER_CAP_GEO}
              material={spikeBladeShaderMat}
            />

            {/* Top & Bottom Laser Rails */}
            <mesh
              position={[0, 0.55, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={BARRIER_BEAM_GEO}
              material={laserBeamShaderMat}
            />
            <mesh
              position={[0, -0.45, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={BARRIER_BEAM_GEO}
              material={laserBeamShaderMat}
            />

            {/* Translucent Pulsing Plasma Shield with Synthwave Grid & Beat Shockwaves */}
            <group ref={innerSpinRef}>
              <mesh
                position={[0, 0.05, 0]}
                geometry={BARRIER_FIELD_GEO}
                material={barrierFieldShaderMat}
              />
            </group>
          </group>
        )}

        {/* --- ROTATING LASER SPINNER (WITH BEAT-SYNCED SHADER) --- */}
        {data.type === ObjectType.LASER_SPINNER && (
          <group>
            <mesh
              castShadow
              geometry={SPINNER_HUB_GEO}
              material={armoredCoreShaderMat}
            />
            {/* Intersecting Laser Blades */}
            <mesh geometry={SPINNER_ARM_GEO} material={laserBeamShaderMat} />
            <mesh
              rotation={[0, 0, Math.PI / 2]}
              geometry={SPINNER_ARM_GEO}
              material={spikeBladeShaderMat}
            />
            {/* Blade Tips */}
            <mesh
              position={[0.98, 0, 0]}
              rotation={[0, 0, -Math.PI / 2]}
              geometry={SPINNER_TIP_GEO}
              material={spikeBladeShaderMat}
            />
            <mesh
              position={[-0.98, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={SPINNER_TIP_GEO}
              material={spikeBladeShaderMat}
            />
          </group>
        )}

        {/* --- ALIEN SAUCER --- */}
        {data.type === ObjectType.ALIEN && (
          <group>
            <mesh castShadow geometry={ALIEN_BODY_GEO} material={armoredCoreShaderMat} />
            <mesh position={[0, 0.2, 0]} geometry={ALIEN_DOME_GEO}>
              <meshStandardMaterial
                color="#10b981"
                emissive="#10b981"
                emissiveIntensity={0.8}
                transparent
                opacity={0.85}
              />
            </mesh>
            <mesh position={[0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO} material={spikeBladeShaderMat} />
            <mesh position={[-0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO} material={spikeBladeShaderMat} />
          </group>
        )}

        {/* --- LASER MISSILE --- */}
        {data.type === ObjectType.MISSILE && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={MISSILE_CORE_GEO} material={spikeBladeShaderMat} />
            <mesh position={[0, 1.0, 0]} geometry={MISSILE_RING_GEO} material={laserBeamShaderMat} />
            <mesh position={[0, 0, 0]} geometry={MISSILE_RING_GEO} material={laserBeamShaderMat} />
            <mesh position={[0, -1.0, 0]} geometry={MISSILE_RING_GEO} material={laserBeamShaderMat} />
          </group>
        )}
      </group>
    </group>
  );
});
