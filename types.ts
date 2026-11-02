/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  SHOP = 'SHOP',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum ObjectType {
  OBSTACLE = 'OBSTACLE',
  MOVING_BARRIER = 'MOVING_BARRIER',
  ROTATING_SPIKE = 'ROTATING_SPIKE',
  LASER_SPINNER = 'LASER_SPINNER',
  GEM = 'GEM',
  LETTER = 'LETTER',
  SHOP_PORTAL = 'SHOP_PORTAL',
  ALIEN = 'ALIEN',
  MISSILE = 'MISSILE',
  SPEED_BOOST = 'SPEED_BOOST'
}

export interface GameObject {
  id: string;
  type: ObjectType;
  position: [number, number, number]; // x, y, z
  active: boolean;
  value?: string; // For letters (G, E, M...)
  color?: string;
  targetIndex?: number; // Index in the GEMINI target word
  points?: number; // Score value for gems
  hasFired?: boolean; // For Aliens
  passed?: boolean; // Whether player successfully dodged this obstacle
  // Dynamic Obstacle properties
  initialX?: number;
  initialY?: number;
  moveSpeed?: number;
  moveRange?: number;
  phase?: number;
  rotationSpeed?: number;
}

export const LANE_WIDTH = 2.2;
export const JUMP_HEIGHT = 2.5;
export const JUMP_DURATION = 0.6; // seconds
export const RUN_SPEED_BASE = 22.5;
export const SPAWN_DISTANCE = 120;
export const REMOVE_DISTANCE = 20; // Behind player

export const SPEED_BOOST_MULTIPLIER = 1.5;
export const SPEED_BOOST_DURATION = 4000; // milliseconds
export const BASE_FOV = 60;
export const BOOST_FOV = 82;

// Brand Colors for SMIT letters (billing.smit34.ru Emerald & Teal Palette)
export const GEMINI_COLORS = [
    '#10b981', // S - Emerald 500
    '#14b8a6', // M - Teal 500
    '#06b6d4', // I - Cyan 500
    '#34d399', // T - Emerald 400
];

export interface ShopItem {
    id: string;
    name: string;
    description: string;
    cost: number;
    icon: any; // Lucide icon component
    oneTime?: boolean; // If true, remove from pool after buying
}

export interface Achievement {
    id: string;
    title: string;
    description: string;
    category: 'DISTANCE' | 'COMBO';
    threshold: number;
    reward: number;
    badge: string;
}

export const ACHIEVEMENTS: Achievement[] = [
    // Пороги комбо-множителя
    {
        id: 'MULT_3X',
        title: 'ЧИСТЫЙ КАНАЛ',
        description: 'Достигнут комбо-множитель очков x3',
        category: 'COMBO',
        threshold: 3,
        reward: 400,
        badge: 'x3'
    },
    {
        id: 'MULT_5X',
        title: 'ГИГАБИТНЫЙ ПОТОК',
        description: 'Достигнут комбо-множитель очков x5',
        category: 'COMBO',
        threshold: 5,
        reward: 1000,
        badge: 'x5'
    },
    {
        id: 'MULT_8X',
        title: 'СВЕРХПРОВОДИМОСТЬ',
        description: 'Достигнут комбо-множитель очков x8',
        category: 'COMBO',
        threshold: 8,
        reward: 2000,
        badge: 'x8'
    },
    {
        id: 'MULT_10X',
        title: 'МАКСИМАЛЬНЫЙ SLA',
        description: 'Активирован предельный множитель x10',
        category: 'COMBO',
        threshold: 10,
        reward: 3500,
        badge: 'x10'
    },
    // Пороги дистанции
    {
        id: 'DIST_250',
        title: 'АБОНЕНТ ПОДКЛЮЧЕН',
        description: 'Пройдена дистанция 250 световых лет',
        category: 'DISTANCE',
        threshold: 250,
        reward: 500,
        badge: '250'
    },
    {
        id: 'DIST_500',
        title: 'ОПТИКА GPON В ДОМ',
        description: 'Пройдена дистанция 500 световых лет',
        category: 'DISTANCE',
        threshold: 500,
        reward: 1000,
        badge: '500'
    },
    {
        id: 'DIST_1000',
        title: 'МАГИСТРАЛЬНЫЙ УЗЕЛ',
        description: 'Пройдена дистанция 1 000 световых лет',
        category: 'DISTANCE',
        threshold: 1000,
        reward: 2000,
        badge: '1K'
    },
    {
        id: 'DIST_2000',
        title: 'ВЛАСТЕЛИН ТРАФИКА СмИТ',
        description: 'Пройдена дистанция 2 000 световых лет',
        category: 'DISTANCE',
        threshold: 2000,
        reward: 4000,
        badge: '2K'
    }
];
