/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* «Кибер-Раннер» — правила игры (честный счёт).
 *
 * Чистое ядро без DOM, three.js и React: партию по ленте действий переигрывает
 * сервер биллинга (billing/services/game_sim_cyber.py — зеркало этого файла
 * до мелочи). Меняя правила здесь, меняйте и там, и поднимайте RULES.
 *
 * Шаг — 1/60 с. Только целые числа: длины в тысячных долях единицы мира («мю»),
 * скорость — мю за шаг, углы — 4096 долей оборота, синус — целочисленная формула
 * Бхаскары (никаких Math.sin/random). Случайность — mulberry32 от сида партии,
 * побитово как billing/static/games/_shell/rng.js.
 *
 * Действия ленты [шаг, действие]: l / r — полоса, j — прыжок, i — щит,
 * в магазине b1…b4 — покупки, c — закрыть магазин. Холостые действия в ленту не пишутся.
 */

export const RULES = 1;
export const MAX_FRAMES = 108000;          // 30 минут — дальше партия кончается сама

export const LANE = 2200;                  // ширина полосы, мю
const SPAWN_Z = -120000;
const REMOVE_Z = 20000;
const BASE_SPEED = 375;                    // 22,5 ед/с
const LETTER_SPEED_UP = 56;                // +15 % базовой за букву
const LEVEL_SPEED_UP = 150;                // +40 % базовой за уровень
const JUMP_V = 267;                        // 16 ед/с
const GRAVITY = 14;                        // 50 ед/с²
const BOOST_TICKS = 240;                   // 4 с
const SHIELD_TICKS = 300;                  // 5 с
const HURT_TICKS = 90;                     // 1,5 с неуязвимости после удара
const MAX_LEVEL = 3;
const LETTER_INTERVAL = [150000, 225000, 337500];

// покупки магазина: действие → [ключ, цена]
export const SHOP = { b1: ['DOUBLE_JUMP', 1000], b2: ['MAX_LIFE', 1500], b3: ['HEAL', 1000], b4: ['IMMORTAL', 3000] };
export const SHOP_ACTION = { DOUBLE_JUMP: 'b1', MAX_LIFE: 'b2', HEAL: 'b3', IMMORTAL: 'b4' };

// достижения: [id, вид, порог, награда] — пороги комбо-множителя и дистанции (ед.)
export const ACH = [
  ['MULT_3X', 'C', 3, 400], ['MULT_5X', 'C', 5, 1000], ['MULT_8X', 'C', 8, 2000], ['MULT_10X', 'C', 10, 3500],
  ['DIST_250', 'D', 250, 500], ['DIST_500', 'D', 500, 1000], ['DIST_1000', 'D', 1000, 2000], ['DIST_2000', 'D', 2000, 4000],
];

/** mulberry32 — побитово как _shell/rng.js и game_verify.Rng. */
export class Rng {
  constructor(seed) { this.a = seed >>> 0; }
  nextU32() {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    const a = this.a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    t = (((t + (Math.imul(t ^ (t >>> 7), 61 | t) >>> 0)) >>> 0) ^ t) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
  below(n) { return Math.floor(this.nextU32() * n / 4294967296); }
}

/** Деление с усечением к нулю (как в Python-зеркале). */
export function tdiv(a, b) {
  const q = Math.floor(Math.abs(a) / Math.abs(b));
  return (a < 0) !== (b < 0) ? -q : q;
}

/** Синус ×1000 по фазе 0…4095 (формула Бхаскары, целые числа). */
export function isin(p) {
  p = ((p % 4096) + 4096) % 4096;
  const neg = p >= 2048;
  if (neg) p -= 2048;
  const q = p * (2048 - p);
  const v = Math.floor(16 * q * 1000 / (5 * 2048 * 2048 - 4 * q));
  return neg ? -v : v;
}

export function icos(p) { return isin(p + 1024); }

/** рад/с ×1000 → долей оборота за шаг */
function rate(radMilli) { return Math.floor(radMilli * 4096 / 376991); }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// виды объектов
export const K = { GEM: 'gem', LETTER: 'letter', BOOST: 'boost', PORTAL: 'portal',
  SPIKE: 'spike', BARRIER: 'barrier', SPINNER: 'spinner', ALIEN: 'alien', MISSILE: 'missile' };

export class Game {
  constructor(seed) {
    this.rng = new Rng(seed);
    this.frame = 0;
    this.over = false;
    this.victory = false;
    this.timeUp = false;
    this.shop = false;
    this.score = 0;
    this.lives = 3;
    this.maxLives = 3;
    this.level = 1;
    this.lanes = 3;
    this.base = BASE_SPEED;
    this.letters = [];
    this.gems = 0;
    this.dist = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.mult = 1;
    this.ach = [];                 // открытые в этой партии
    this.hasDouble = false;
    this.hasShield = false;
    this.boostT = 0;
    this.shieldT = 0;
    this.hurtT = 0;
    // игрок
    this.lane = 0;
    this.x = 0; this.y = 0; this.vy = 0;
    this.px = 0; this.py = 0;
    this.jumping = false;
    this.jumps = 0;
    // мир
    this.items = [];               // бонусы, буквы, ускорения, портал магазина
    this.obs = [];                 // препятствия и ракеты
    this.nextLetter = LETTER_INTERVAL[0];
    this.nextId = 1;
    this.tape = [];
    this.events = [];              // для эффектов отрисовки (на правила не влияют)
  }

  speed() {
    let s = Math.floor(this.base * (100 + (this.mult - 1) * 5) / 100);
    if (this.boostT > 0) s = Math.floor(s * 3 / 2);
    return s;
  }

  maxLane() { return this.lanes >> 1; }

  distUnits() { return Math.floor(this.dist / 1000); }

  /** Действие игрока: true — подействовало и записано в ленту. */
  act(a) {
    if (this.over) return false;
    let ok = false;
    if (this.shop) {
      if (a === 'c') { this.shop = false; ok = true; this.events.push({ t: 'shopClose' }); }
      else if (SHOP[a]) {
        const [kind, cost] = SHOP[a];
        if (this.score >= cost && !(kind === 'DOUBLE_JUMP' && this.hasDouble) && !(kind === 'IMMORTAL' && this.hasShield)) {
          this.score -= cost;
          if (kind === 'DOUBLE_JUMP') this.hasDouble = true;
          else if (kind === 'MAX_LIFE') { this.maxLives += 1; this.lives += 1; }
          else if (kind === 'HEAL') this.lives = Math.min(this.lives + 1, this.maxLives);
          else this.hasShield = true;
          ok = true;
          this.events.push({ t: 'buy', kind });
        }
      }
    } else if (a === 'l' || a === 'r') {
      const nl = clamp(this.lane + (a === 'l' ? -1 : 1), -this.maxLane(), this.maxLane());
      if (nl !== this.lane) { this.lane = nl; ok = true; }
    } else if (a === 'j') {
      const maxJumps = this.hasDouble ? 2 : 1;
      if (!this.jumping) {
        this.jumping = true; this.jumps = 1; this.vy = JUMP_V; ok = true;
        this.events.push({ t: 'jump', double: false });
      } else if (this.jumps < maxJumps) {
        this.jumps += 1; this.vy = JUMP_V; ok = true;
        this.events.push({ t: 'jump', double: true });
      }
    } else if (a === 'i') {
      if (this.hasShield && this.shieldT === 0) { this.shieldT = SHIELD_TICKS; ok = true; this.events.push({ t: 'shield' }); }
    }
    if (ok) this.tape.push([this.frame, a]);
    return ok;
  }

  tick() {
    if (this.over) return;
    if (this.shop) { this.advanceFrame(); return; }   // в магазине мир стоит
    if (this.boostT > 0) this.boostT -= 1;
    if (this.shieldT > 0) this.shieldT -= 1;
    if (this.hurtT > 0) this.hurtT -= 1;

    // игрок: смена полосы с затуханием, прыжок
    this.px = this.x; this.py = this.y;
    const target = this.lane * LANE;
    this.x += this.boostT > 0 ? tdiv((target - this.x) * 2, 5) : tdiv(target - this.x, 4);
    if (Math.abs(target - this.x) < 8) this.x = target;
    if (this.jumping) {
      this.y += this.vy;
      this.vy -= GRAVITY;
      if (this.y <= 0) { this.y = 0; this.jumping = false; this.jumps = 0; this.vy = 0; }
    }

    const sp = this.speed();
    this.levelUp = false;
    this.stepItems(sp);
    if (!this.over && !this.shop) this.stepObstacles(sp);
    if (this.levelUp) this.applyLevelUp();
    this.advanceFrame();
  }

  advanceFrame() {
    this.frame += 1;
    if (this.frame >= MAX_FRAMES && !this.over) { this.over = true; this.timeUp = true; this.events.push({ t: 'over', why: 'time' }); }
  }

  unlock(kind, value) {
    let gain = 0;
    for (const [id, k, th, reward] of ACH) {
      if (k === kind && value >= th && this.ach.indexOf(id) < 0) {
        this.ach.push(id);
        gain += reward;
        this.events.push({ t: 'ach', id });
      }
    }
    return gain;
  }

  randLane() { const m = this.maxLane(); return this.rng.below(2 * m + 1) - m; }

  add(list, o) { o.id = this.nextId++; o.pz = o.z; o.px = o.x; o.py = o.y; o.active = true; list.push(o); return o; }

  stepItems(sp) {
    this.dist += sp;
    this.score += this.unlock('D', this.distUnits());
    const kept = [];
    for (const o of this.items) {
      o.pz = o.z; o.px = o.x; o.py = o.y;
      const pz = o.z;
      o.z += sp;
      let keep = true;
      if (o.active) {
        if (o.k === K.PORTAL) {
          if (Math.abs(o.z) < 2000) {
            this.shop = true; o.active = false; keep = false;
            this.events.push({ t: 'shop' });
          }
        } else if (pz < 2000 && o.z > -2000 && Math.abs(o.x - this.x) < 950 && Math.abs(o.y - this.y) < 2500) {
          if (o.k === K.GEM) { this.score += o.pts * this.mult; this.gems += 1; }
          else if (o.k === K.LETTER) this.collectLetter(o.idx);
          else if (o.k === K.BOOST) { this.boostT = BOOST_TICKS; this.score += 150 * this.mult; }
          o.active = false;
          this.events.push({ t: 'pick', k: o.k, x: o.x, y: o.y, z: o.z, idx: o.idx, pts: o.pts });
        }
      }
      if (o.z > REMOVE_Z) keep = false;
      if (keep) kept.push(o);
    }
    this.items = kept;

    let furthest = -20000;
    for (const o of kept) if (o.z < furthest) furthest = o.z;
    if (furthest > SPAWN_Z) {
      const spawnZ = Math.min(furthest - (16000 + sp * 21), SPAWN_Z);
      if (this.dist >= this.nextLetter) {
        const lane = this.randLane();
        const avail = [0, 1, 2, 3].filter(i => this.letters.indexOf(i) < 0);
        if (avail.length) {
          const idx = avail[this.rng.below(avail.length)];
          this.add(kept, { k: K.LETTER, x: lane * LANE, y: 1000, z: spawnZ, idx });
          this.nextLetter += LETTER_INTERVAL[this.level - 1];
        } else {
          this.add(kept, { k: K.GEM, x: lane * LANE, y: 1200, z: spawnZ, pts: 50 });
        }
      } else if (this.rng.below(1000) >= 250) {
        const lane = this.randLane();
        const roll = this.rng.below(1000);
        if (roll < 220) this.add(kept, { k: K.BOOST, x: lane * LANE, y: 1200, z: spawnZ });
        else if (roll < 480) this.add(kept, { k: K.GEM, x: lane * LANE, y: 2400, z: spawnZ, pts: 100 });
        else this.add(kept, { k: K.GEM, x: lane * LANE, y: 1200, z: spawnZ, pts: 50 });
      }
    }
  }

  collectLetter(idx) {
    if (this.letters.indexOf(idx) >= 0) return;
    this.letters.push(idx);
    this.base += LETTER_SPEED_UP;
    this.score += 250 * this.mult;
    if (this.letters.length === 4) {
      if (this.level < MAX_LEVEL) {
        this.level += 1;
        this.lanes = Math.min(this.lanes + 2, 9);
        this.base += LEVEL_SPEED_UP;
        this.letters = [];
        this.levelUp = true;
        this.events.push({ t: 'level', level: this.level });
      } else {
        this.score += 5000;
        this.boostT = 0;
        this.over = true;
        this.victory = true;
        this.events.push({ t: 'over', why: 'victory' });
      }
    }
  }

  applyLevelUp() {
    // ближние объекты остаются, дальние — место под портал магазина
    this.items = this.items.filter(o => o.z > -80000);
    this.add(this.items, { k: K.PORTAL, x: 0, y: 0, z: -100000 });
    this.nextLetter = this.dist - 120000 + LETTER_INTERVAL[this.level - 1];
    this.obs = this.obs.filter(o => o.z > -75000);
  }

  difficulty() {
    return 1000 + Math.floor(this.distUnits() * 1000 / 320) + (this.level - 1) * 450 + (this.mult - 1) * 240;
  }

  comboIntensity() { return Math.min(1000, Math.floor((this.mult - 1) * 1000 / 9)); }

  damage() {
    if (this.hurtT > 0 || this.shieldT > 0) return;
    if (this.lives > 1) {
      this.lives -= 1; this.combo = 0; this.mult = 1; this.hurtT = HURT_TICKS;
      this.events.push({ t: 'hurt' });
    } else {
      this.lives = 0; this.combo = 0; this.mult = 1; this.boostT = 0;
      this.over = true;
      this.events.push({ t: 'hurt' });
      this.events.push({ t: 'over', why: 'crash' });
    }
  }

  dodge(close) {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.mult = Math.min(10, 1 + Math.floor((this.combo + 1) / 2));
    let gain = (close ? 40 : 20) * this.mult;
    gain += this.unlock('C', this.mult);
    this.score += gain;
    this.events.push({ t: 'dodge', close, combo: this.combo });
  }

  stepObstacles(sp) {
    const diff = this.difficulty();
    const ci = this.comboIntensity();
    const missileExtra = Math.floor((64000 + diff * 5) / 120);
    const ampl = 1000 + Math.floor(ci / 4);
    const maxX = this.maxLane() * LANE;
    const kept = [];
    const fired = [];
    for (const o of this.obs) {
      o.pz = o.z; o.px = o.x; o.py = o.y;
      const pz = o.z;
      o.z += o.k === K.MISSILE ? sp + missileExtra : sp;
      if (o.k !== K.MISSILE) {
        o.ph = (o.ph + Math.floor(o.ms * ampl / 1000)) % 4096;
        if (o.k === K.BARRIER || (o.k === K.SPIKE && o.range > 0) || (o.k === K.ALIEN && o.range > 0)) {
          o.x = clamp(o.bx + tdiv(isin(o.ph) * o.range, 1000), -maxX, maxX);
        } else if (o.k === K.SPINNER) {
          o.y = o.by + tdiv(isin(o.ph) * 550, 1000);
          if (o.range > 0) {
            o.ph2 = (o.ph2 + Math.floor(o.ms * ampl * 7 / 10000)) % 4096;
            o.x = clamp(o.bx + tdiv(icos(o.ph2) * o.range, 1000), -maxX, maxX);
          }
        }
        if (o.k === K.ALIEN && o.active && !o.fired && o.z > -92000) {
          o.fired = true;
          fired.push({ k: K.MISSILE, x: o.x, y: 1000, z: o.z + 2000 });
          this.events.push({ t: 'fire', x: o.x, y: o.y, z: o.z });
        }
      }
      if (o.active && !this.over) {     // после последнего удара на этом шаге столкновений нет
        if (pz < 1900 && o.z > -1900) {
          if (Math.abs(o.x - this.x) < (o.k === K.BARRIER ? 1150 : 920)) {
            let bottom = 0, top = 1600;
            if (o.k === K.SPIKE) top = 1750;
            else if (o.k === K.BARRIER) top = 1500;
            else if (o.k === K.SPINNER) { bottom = Math.max(0, o.y - 750); top = o.y + 750; }
            else if (o.k === K.ALIEN) { bottom = o.y - 500; top = o.y + 600; }
            else if (o.k === K.MISSILE) { bottom = 500; top = 1500; }
            if (this.y < top && this.y + 1800 > bottom) {
              o.active = false;
              this.events.push({ t: 'boom', k: o.k, x: o.x, y: Math.max(950, o.y), z: o.z });
              this.damage();
            }
          }
        } else if (!o.passed && o.z > 1900) {
          o.passed = true;
          this.dodge(Math.abs(o.x - this.x) <= 2530);
        }
      }
      if (o.z <= REMOVE_Z) kept.push(o);
    }
    for (const m of fired) this.add(kept, m);
    this.obs = kept;
    if (this.over) return;

    let furthest = -25000;
    for (const o of kept) if (o.k !== K.MISSILE && o.z < furthest) furthest = o.z;
    const du = this.distUnits();
    const minGap = Math.max(10500, 23000 - Math.min(8000, Math.floor(du * 1000 / 140)) - (this.mult - 1) * 1150 +
                                   Math.floor(sp * 66 / 5));
    if (furthest <= SPAWN_Z) return;
    const spawnZ = Math.min(furthest - minGap, SPAWN_Z);
    const m = this.maxLane();
    const lanes = [];
    for (let i = -m; i <= m; i++) lanes.push(i);
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = this.rng.below(i + 1);
      const t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t;
    }
    const maxSim = Math.max(1, lanes.length - 1);
    const msc = Math.min(880, 240 + Math.floor((diff - 1000) * 16 / 100) + Math.floor(ci * 36 / 100));
    let count = 1;
    const roll = this.rng.below(1000);
    if (roll < msc && maxSim >= 2) {
      count = 2;
      if (roll < Math.floor(msc * (400 + Math.floor(ci * 25 / 100)) / 1000) && maxSim >= 3) count = 3;
    }
    const alienCh = (this.level >= 2 || du > 250 || this.mult >= 4)
      ? Math.min(280, 80 + Math.floor((diff - 1000) * 5 / 100) + Math.floor(ci * 10 / 100)) : 0;
    const spinCh = (du > 60 || this.mult >= 2)
      ? Math.min(320, 120 + Math.floor((diff - 1000) * 5 / 100) + Math.floor(ci * 12 / 100)) : 100;
    for (let i = 0; i < count; i++) {
      const lx = lanes[i] * LANE;
      const tr = this.rng.below(1000);
      const ph = this.rng.below(4096);
      let o;
      if (tr < alienCh) {
        o = { k: K.ALIEN, y: 1500, ms: rate(1600 + Math.floor(diff * 450 / 1000)),
              range: diff > 1300 ? Math.floor(LANE * (700 + Math.floor(ci * 300 / 1000)) / 1000) : 0 };
      } else if (tr < alienCh + spinCh) {
        o = { k: K.SPINNER, y: 1250, ms: rate(2200 + Math.floor(diff * 500 / 1000)), range: diff > 1600 ? 990 : 0 };
      } else if (tr < alienCh + spinCh + 420) {
        const sweep = count > 1 ? 650 : Math.min(1500, 850 + Math.floor((diff - 1000) * 250 / 1000));
        o = { k: K.BARRIER, y: 800, ms: rate(1800 + Math.floor(diff * 650 / 1000)), range: Math.floor(LANE * sweep / 1000) };
      } else {
        o = { k: K.SPIKE, y: 850, ms: rate(2000 + Math.floor(diff * 500 / 1000)),
              range: ((diff > 1400 || this.mult >= 3) && count === 1) ? 1210 : 0 };
      }
      o.x = lx; o.bx = lx; o.by = o.y; o.z = spawnZ; o.ph = ph; o.ph2 = ph; o.passed = false; o.fired = false;
      this.add(kept, o);
    }
  }
}
