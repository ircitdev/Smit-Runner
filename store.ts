/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/* Состояние для интерфейса. Правила игры и счёт — в sim/core.js (честный счёт:
 * сервер биллинга переигрывает партию), сюда их состояние зеркалит sim/runtime.ts.
 * Действия игрока (старт, покупки, щит) идут в ядро через очередь runtime. */
import { create } from 'zustand';
import {
  GameStatus,
  RUN_SPEED_BASE,
  Achievement,
  ACHIEVEMENTS
} from './types';
import { audio } from './components/System/Audio';
import { runtime } from './sim/runtime';
import { SHOP_ACTION } from './sim/core.js';

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

  // итог проверки партии сервером (сообщение smitgame:result от страницы биллинга)
  verifiedResult: any;

  // Actions
  startGame: () => void;
  restartGame: () => void;
  setStatus: (status: GameStatus) => void;
  setCustomRobotModelUrl: (url: string | null) => void;
  pushAchievement: (id: string) => void;
  saveMaxDistance: (dist: number) => void;

  // Shop / Abilities — действия ленты (sim/core.js: b1…b4, c, i)
  buyItem: (type: 'DOUBLE_JUMP' | 'MAX_LIFE' | 'HEAL' | 'IMMORTAL', cost: number) => boolean;
  closeShop: () => void;
  activateImmortality: () => void;
}

const MAX_DISTANCE_STORAGE_KEY = 'smit_runner_max_distance';
const ACHIEVEMENTS_STORAGE_KEY = 'smit_runner_achievements';

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

  // новая партия: сброс того, что только для показа; игровое состояние придёт из ядра
  const begin = () => {
    if (achievementTimeout) {
      clearTimeout(achievementTimeout);
      achievementTimeout = null;
    }
    pendingAchievementQueue = [];
    set({ sessionAchievements: [], activeAchievement: null, combo: 0, lastComboAt: 0, lastDodgeCloseCall: false });
    runtime.start();
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
    verifiedResult: null,

    startGame: begin,
    restartGame: begin,

    pushAchievement: (id) => {
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (!ach) return;
      const state = get();
      const session = state.sessionAchievements.includes(id) ? state.sessionAchievements : [...state.sessionAchievements, id];
      let global = state.unlockedAchievements;
      if (!global.includes(id)) {
        global = [...global, id];
        saveUnlockedAchievements(global);
      }
      set({ sessionAchievements: session, unlockedAchievements: global });
      enqueueAchievements([ach]);
    },

    saveMaxDistance: (dist) => {
      if (dist > get().maxDistance) {
        saveMaxDistance(dist);
        set({ maxDistance: dist });
      }
    },

    // покупка спишет очки на следующем шаге ядра; здесь — только «хватает ли»
    buyItem: (type, cost) => {
      if (get().score < cost) return false;
      runtime.push(SHOP_ACTION[type]);
      return true;
    },

    closeShop: () => runtime.push('c'),

    activateImmortality: () => runtime.push('i'),

    setStatus: (status) => set({ status }),
    setCustomRobotModelUrl: (url) => set({ customRobotModelUrl: url }),
  };
});
