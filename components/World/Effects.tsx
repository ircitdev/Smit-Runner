/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction, ChromaticAberrationEffect } from 'postprocessing';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';

const COARSE = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export const Effects: React.FC = () => {
  const chromaticRef = useRef<ChromaticAberrationEffect>(null);
  const impactPulseRef = useRef(0);
  const initialOffset = useMemo(() => new THREE.Vector2(0.0008, 0.0004), []);
  const { isSpeedBoostActive, multiplier } = useStore(useShallow((s) => ({ isSpeedBoostActive: s.isSpeedBoostActive, multiplier: s.multiplier })));

  useEffect(() => {
    const triggerChromaticBurst = () => {
      impactPulseRef.current = 1.0;
    };

    window.addEventListener('obstacle-explosion', triggerChromaticBurst);
    window.addEventListener('player-hit', triggerChromaticBurst);
    return () => {
      window.removeEventListener('obstacle-explosion', triggerChromaticBurst);
      window.removeEventListener('player-hit', triggerChromaticBurst);
    };
  }, []);

  useFrame((state, delta) => {
    const safeDelta = Math.min(delta, 0.05);

    if (impactPulseRef.current > 0) {
      impactPulseRef.current = Math.max(0, impactPulseRef.current - safeDelta * 1.85);
    }

    if (chromaticRef.current) {
      const pulse = impactPulseRef.current;
      const t = state.clock.elapsedTime;

      // Baseline subtle aberration during speed boost or high combo, spiking strongly on obstacle collision explosion
      const boostBase = isSpeedBoostActive ? 0.0028 : Math.max(0, multiplier - 1) * 0.00022;
      const explosionSpike = Math.pow(pulse, 1.35) * 0.024;
      const jitterX = pulse > 0.01 ? Math.cos(t * 58.0) * explosionSpike * 0.35 : 0;
      const jitterY = pulse > 0.01 ? Math.sin(t * 47.0) * explosionSpike * 0.25 : 0;

      const offsetX = 0.0006 + boostBase + explosionSpike + jitterX;
      const offsetY = 0.0003 + boostBase * 0.5 + explosionSpike * 0.45 + jitterY;

      chromaticRef.current.offset.set(offsetX, offsetY);
    }
  });

  return (
    <EffectComposer disableNormalPass multisampling={0}>
      {/* Tighter bloom to avoid fog: High threshold, moderate radius */}
      <Bloom 
        luminanceThreshold={0.9}
        luminanceSmoothing={0.05}
        mipmapBlur 
        intensity={1.05} 
        radius={0.62}
        levels={COARSE ? 5 : 8}
      />
      <ChromaticAberration
        ref={chromaticRef}
        blendFunction={BlendFunction.NORMAL}
        offset={initialOffset}
        radialModulation={false}
        modulationOffset={0.15}
      />
      {COARSE ? <></> : <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} />}
      <Vignette eskil={false} offset={0.1} darkness={0.5} />
    </EffectComposer>
  );
};

