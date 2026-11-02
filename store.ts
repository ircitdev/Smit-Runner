/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import {
  GameStatus,
  RUN_SPEED_BASE,
  SPEED_BOOST_MULTIPLIER,
  SPEED_BOOST_DURATION,
  Achievement,
  ACHIEVEMENTS
} from './types';
import { audio } from './components/System/Audio';

let speedBoostTimeout: ReturnType<typeof setTimeout> | null = null;
let achievementTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingAchievementQueue: Achievement[] = [];

interface GameState {
  status: GameStatus;
  score: number;
  lives: number;
  maxLives: number;
  speed: number;
  baseSpeed: number;
  collectedLetters: number[]; 
  level: number;
  laneCount: number;
  gemsCollected: number;
  distance: number;
  maxDistance: number;

  // Combo & Score Multiplier
  combo: number;
  maxCombo: number;
  multiplier: number;
  lastComboAt: number;
  lastDodgeCloseCall: boolean;

  // In-Game Achievements
  unlockedAchievements: string[];
  sessionAchievements: string[];
  activeAchievement: Achievement | null;
  achievementTriggerCount: number;
  
  // Inventory / Abilities
  hasDoubleJump: boolean;
  hasImmortality: boolean;
  isImmortalityActive: boolean;
  isSpeedBoostActive: boolean;
  customRobotModelUrl: string | null;

  // Actions
  startGame: () => void;
  restartGame: () => void;
  takeDamage: () => void;
  addScore: (amount: number) => void;
  registerDodge: (isCloseCall?: boolean) => void;
  collectGem: (value: number) => void;
  collectLetter: (index: number) => void;
  collectSpeedBoost: () => void;
  setStatus: (status: GameStatus) => void;
  setDistance: (dist: number) => void;
  setCustomRobotModelUrl: (url: string | null) => void;
  
  // Shop / Abilities
  buyItem: (type: 'DOUBLE_JUMP' | 'MAX_LIFE' | 'HEAL' | 'IMMORTAL', cost: number) => boolean;
  advanceLevel: () => void;
  openShop: () => void;
  closeShop: () => void;
  activateImmortality: () => void;
}

const SMIT_TARGET = ['S', 'M', 'I', 'T'];
const MAX_LEVEL = 3;
const MAX_DISTANCE_STORAGE_KEY = 'smit_runner_max_distance';
const ACHIEVEMENTS_STORAGE_KEY = 'smit_runner_achievements';

// Adaptive speed scaling: +5% baseSpeed per multiplier step above x1 (up to +45% at x10)
export const COMBO_SPEED_STEP = 0.05;

export const computeAdaptiveSpeed = (
  baseSpeed: number,
  multiplier: number,
  isSpeedBoostActive: boolean
): number => {
  const comboFactor = 1 + Math.max(0, multiplier - 1) * COMBO_SPEED_STEP;
  const boostFactor = isSpeedBoostActive ? SPEED_BOOST_MULTIPLIER : 1.0;
  return baseSpeed * comboFactor * boostFactor;
};

const getInitialMaxDistance = (): number => {
  try {
    const saved = localStorage.getItem(MAX_DISTANCE_STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

const saveMaxDistance = (dist: number) => {
  try {
    localStorage.setItem(MAX_DISTANCE_STORAGE_KEY, String(Math.floor(dist)));
  } catch {
    // Ignore storage errors in restricted environments
  }
};

const getInitialUnlockedAchievements = (): string[] => {
  try {
    const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveUnlockedAchievements = (ids: string[]) => {
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
};

export const useStore = create<GameState>((set, get) => {
  const showNextAchievement = () => {
    if (pendingAchievementQueue.length === 0) {
      achievementTimeout = null;
      set({ activeAchievement: null });
      return;
    }

    const nextAch = pendingAchievementQueue.shift()!;
    audio.playAchievement();
    set((state) => ({
      activeAchievement: nextAch,
      achievementTriggerCount: state.achievementTriggerCount + 1
    }));

    achievementTimeout = setTimeout(() => {
      showNextAchievement();
    }, 3600);
  };

  const enqueueAchievements = (newlyUnlocked: Achievement[]) => {
    if (newlyUnlocked.length === 0) return;
    pendingAchievementQueue.push(...newlyUnlocked);
    if (!achievementTimeout) {
      showNextAchievement();
    }
  };

  return {
    status: GameStatus.MENU,
    score: 0,
    lives: 3,
    maxLives: 3,
    speed: 0,
    baseSpeed: RUN_SPEED_BASE,
    collectedLetters: [],
    level: 1,
    laneCount: 3,
    gemsCollected: 0,
    distance: 0,
    maxDistance: getInitialMaxDistance(),

    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    lastComboAt: 0,
    lastDodgeCloseCall: false,

    unlockedAchievements: getInitialUnlockedAchievements(),
    sessionAchievements: [],
    activeAchievement: null,
    achievementTriggerCount: 0,
    
    hasDoubleJump: false,
    hasImmortality: false,
    isImmortalityActive: false,
    isSpeedBoostActive: false,
    customRobotModelUrl: null,

    startGame: () => {
      if (speedBoostTimeout) {
        clearTimeout(speedBoostTimeout);
        speedBoostTimeout = null;
      }
      if (achievementTimeout) {
        clearTimeout(achievementTimeout);
        achievementTimeout = null;
      }
      pendingAchievementQueue = [];
      set({ 
        status: GameStatus.PLAYING, 
        score: 0, 
        lives: 3, 
        maxLives: 3,
        speed: RUN_SPEED_BASE,
        baseSpeed: RUN_SPEED_BASE,
        collectedLetters: [],
        level: 1,
        laneCount: 3,
        gemsCollected: 0,
        distance: 0,
        combo: 0,
        maxCombo: 0,
        multiplier: 1,
        lastComboAt: 0,
        lastDodgeCloseCall: false,
        sessionAchievements: [],
        activeAchievement: null,
        hasDoubleJump: false,
        hasImmortality: false,
        isImmortalityActive: false,
        isSpeedBoostActive: false
      });
    },

    restartGame: () => {
      if (speedBoostTimeout) {
        clearTimeout(speedBoostTimeout);
        speedBoostTimeout = null;
      }
      if (achievementTimeout) {
        clearTimeout(achievementTimeout);
        achievementTimeout = null;
      }
      pendingAchievementQueue = [];
      set({ 
        status: GameStatus.PLAYING, 
        score: 0, 
        lives: 3, 
        maxLives: 3,
        speed: RUN_SPEED_BASE,
        baseSpeed: RUN_SPEED_BASE,
        collectedLetters: [],
        level: 1,
        laneCount: 3,
        gemsCollected: 0,
        distance: 0,
        combo: 0,
        maxCombo: 0,
        multiplier: 1,
        lastComboAt: 0,
        lastDodgeCloseCall: false,
        sessionAchievements: [],
        activeAchievement: null,
        hasDoubleJump: false,
        hasImmortality: false,
        isImmortalityActive: false,
        isSpeedBoostActive: false
      });
    },

    takeDamage: () => {
      const { lives, isImmortalityActive, baseSpeed, isSpeedBoostActive } = get();
      if (isImmortalityActive) return;

      if (lives > 1) {
        // Resetting combo to 0 and multiplier to 1 adaptively drops speed back to base level
        set({
          lives: lives - 1,
          combo: 0,
          multiplier: 1,
          speed: computeAdaptiveSpeed(baseSpeed, 1, isSpeedBoostActive),
          lastDodgeCloseCall: false
        });
      } else {
        if (speedBoostTimeout) {
          clearTimeout(speedBoostTimeout);
          speedBoostTimeout = null;
        }
        set({
          lives: 0,
          status: GameStatus.GAME_OVER,
          speed: 0,
          isSpeedBoostActive: false,
          combo: 0,
          multiplier: 1,
          lastDodgeCloseCall: false
        });
      }
    },

    addScore: (amount) => set((state) => ({ score: state.score + Math.round(amount * state.multiplier) })),

    registerDodge: (isCloseCall = false) => {
      const state = get();
      const nextCombo = state.combo + 1;
      const nextMaxCombo = Math.max(state.maxCombo, nextCombo);
      const nextMultiplier = Math.min(10, 1 + Math.floor((nextCombo + 1) / 2));
      const baseDodgePoints = isCloseCall ? 40 : 20;
      let bonusScore = baseDodgePoints * nextMultiplier;

      // Dynamically recalculate adaptive speed from the new multiplier
      const nextSpeed = computeAdaptiveSpeed(
        state.baseSpeed,
        nextMultiplier,
        state.isSpeedBoostActive
      );

      // Check COMBO multiplier achievements
      const newlyUnlocked: Achievement[] = [];
      const nextSessionAch = [...state.sessionAchievements];
      const nextGlobalAch = [...state.unlockedAchievements];

      for (const ach of ACHIEVEMENTS) {
        if (
          ach.category === 'COMBO' &&
          nextMultiplier >= ach.threshold &&
          !nextSessionAch.includes(ach.id)
        ) {
          nextSessionAch.push(ach.id);
          if (!nextGlobalAch.includes(ach.id)) {
            nextGlobalAch.push(ach.id);
          }
          bonusScore += ach.reward;
          newlyUnlocked.push(ach);
        }
      }

      if (newlyUnlocked.length > 0) {
        saveUnlockedAchievements(nextGlobalAch);
      }

      set({
        combo: nextCombo,
        maxCombo: nextMaxCombo,
        multiplier: nextMultiplier,
        speed: nextSpeed,
        score: state.score + bonusScore,
        lastComboAt: Date.now(),
        lastDodgeCloseCall: isCloseCall,
        sessionAchievements: nextSessionAch,
        unlockedAchievements: nextGlobalAch
      });

      if (newlyUnlocked.length > 0) {
        enqueueAchievements(newlyUnlocked);
      }
    },
    
    collectGem: (value) => set((state) => ({ 
      score: state.score + Math.round(value * state.multiplier), 
      gemsCollected: state.gemsCollected + 1 
    })),

    setDistance: (dist) => {
      const floored = Math.floor(dist);
      const state = get();
      const nextMaxDist = Math.max(state.maxDistance, floored);
      if (floored > state.maxDistance) {
        saveMaxDistance(floored);
      }

      // Check DISTANCE threshold achievements
      const newlyUnlocked: Achievement[] = [];
      const nextSessionAch = [...state.sessionAchievements];
      const nextGlobalAch = [...state.unlockedAchievements];
      let achievementReward = 0;

      for (const ach of ACHIEVEMENTS) {
        if (
          ach.category === 'DISTANCE' &&
          floored >= ach.threshold &&
          !nextSessionAch.includes(ach.id)
        ) {
          nextSessionAch.push(ach.id);
          if (!nextGlobalAch.includes(ach.id)) {
            nextGlobalAch.push(ach.id);
          }
          achievementReward += ach.reward;
          newlyUnlocked.push(ach);
        }
      }

      if (newlyUnlocked.length > 0) {
        saveUnlockedAchievements(nextGlobalAch);
      }

      set({
        distance: floored,
        maxDistance: nextMaxDist,
        score: state.score + achievementReward,
        sessionAchievements: nextSessionAch,
        unlockedAchievements: nextGlobalAch
      });

      if (newlyUnlocked.length > 0) {
        enqueueAchievements(newlyUnlocked);
      }
    },

    collectSpeedBoost: () => {
      const { baseSpeed, score, multiplier } = get();
      if (speedBoostTimeout) {
        clearTimeout(speedBoostTimeout);
      }

      set({
        isSpeedBoostActive: true,
        speed: computeAdaptiveSpeed(baseSpeed, multiplier, true),
        score: score + Math.round(150 * multiplier)
      });

      speedBoostTimeout = setTimeout(() => {
        const currentState = get();
        speedBoostTimeout = null;
        if (currentState.status === GameStatus.GAME_OVER) {
          set({ isSpeedBoostActive: false, speed: 0 });
        } else {
          set({
            isSpeedBoostActive: false,
            speed: computeAdaptiveSpeed(currentState.baseSpeed, currentState.multiplier, false)
          });
        }
      }, SPEED_BOOST_DURATION);
    },

    collectLetter: (index) => {
      const { collectedLetters, level, baseSpeed, isSpeedBoostActive, score, multiplier } = get();
      
      if (!collectedLetters.includes(index)) {
        const newLetters = [...collectedLetters, index];
        
        const speedIncrease = RUN_SPEED_BASE * 0.15;
        const nextBaseSpeed = baseSpeed + speedIncrease;
        const nextSpeed = computeAdaptiveSpeed(nextBaseSpeed, multiplier, isSpeedBoostActive);

        set({ 
          collectedLetters: newLetters,
          baseSpeed: nextBaseSpeed,
          speed: nextSpeed,
          score: score + Math.round(250 * multiplier)
        });

        if (newLetters.length === SMIT_TARGET.length) {
          if (level < MAX_LEVEL) {
              get().advanceLevel();
          } else {
              if (speedBoostTimeout) {
                clearTimeout(speedBoostTimeout);
                speedBoostTimeout = null;
              }
              set({
                  status: GameStatus.VICTORY,
                  score: get().score + 5000,
                  isSpeedBoostActive: false
              });
          }
        }
      }
    },

    advanceLevel: () => {
        const { level, laneCount, baseSpeed, multiplier, isSpeedBoostActive } = get();
        const nextLevel = level + 1;
        
        const speedIncrease = RUN_SPEED_BASE * 0.40;
        const newBaseSpeed = baseSpeed + speedIncrease;
        const newSpeed = computeAdaptiveSpeed(newBaseSpeed, multiplier, isSpeedBoostActive);

        set({
            level: nextLevel,
            laneCount: Math.min(laneCount + 2, 9),
            status: GameStatus.PLAYING,
            baseSpeed: newBaseSpeed,
            speed: newSpeed,
            collectedLetters: []
        });
    },

    openShop: () => set({ status: GameStatus.SHOP }),
    
    closeShop: () => set({ status: GameStatus.PLAYING }),

    buyItem: (type, cost) => {
        const { score, maxLives, lives } = get();
        
        if (score >= cost) {
            set({ score: score - cost });
            
            switch (type) {
                case 'DOUBLE_JUMP':
                    set({ hasDoubleJump: true });
                    break;
                case 'MAX_LIFE':
                    set({ maxLives: maxLives + 1, lives: lives + 1 });
                    break;
                case 'HEAL':
                    set({ lives: Math.min(lives + 1, maxLives) });
                    break;
                case 'IMMORTAL':
                    set({ hasImmortality: true });
                    break;
            }
            return true;
        }
        return false;
    },

    activateImmortality: () => {
        const { hasImmortality, isImmortalityActive } = get();
        if (hasImmortality && !isImmortalityActive) {
            set({ isImmortalityActive: true });
            
            setTimeout(() => {
                set({ isImmortalityActive: false });
            }, 5000);
        }
    },

    setStatus: (status) => set({ status }),
    setCustomRobotModelUrl: (url) => set({ customRobotModelUrl: url }),
  };
});
