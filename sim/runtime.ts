/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* Связка ядра (sim/core.js) и отрисовки.
 *
 * Правила шагают ровно 60 раз в секунду (так же переигрывает сервер), отрисовка —
 * с каждым кадром экрана: объекты рисуются между двумя шагами (alpha), ввод копится
 * в очереди и применяется в начале шага. Store — только зеркало состояния ядра для HUD.
 */
import { Game, K, RULES } from './core.js';
import { requestSeed, sendOver, onResult } from './bridge';
import { useStore } from '../store';
import { audio } from '../components/System/Audio';
import { GameObject, GameStatus, ObjectType, GEMINI_COLORS } from '../types';

const STEP = 1 / 60;
const LETTERS = ['S', 'M', 'I', 'T'];

const ITEM_VIEW: Record<string, (o: any) => Partial<GameObject>> = {
  [K.GEM]: (o) => ({ type: ObjectType.GEM, color: o.pts === 100 ? '#ffd700' : '#00ffff', points: o.pts }),
  [K.LETTER]: (o) => ({ type: ObjectType.LETTER, color: GEMINI_COLORS[o.idx], value: LETTERS[o.idx], targetIndex: o.idx }),
  [K.BOOST]: () => ({ type: ObjectType.SPEED_BOOST, color: '#ff9100' }),
  [K.PORTAL]: () => ({ type: ObjectType.SHOP_PORTAL }),
  [K.SPIKE]: () => ({ type: ObjectType.ROTATING_SPIKE, color: '#ff0054', rotationSpeed: 5.5 }),
  [K.BARRIER]: () => ({ type: ObjectType.MOVING_BARRIER, color: '#10b981' }),
  [K.SPINNER]: () => ({ type: ObjectType.LASER_SPINNER, color: '#06b6d4', rotationSpeed: 7 }),
  [K.ALIEN]: () => ({ type: ObjectType.ALIEN, color: '#10b981' }),
  [K.MISSILE]: () => ({ type: ObjectType.MISSILE, color: '#ff0033', rotationSpeed: 22 }),
};
const KIND_TYPE: Record<string, ObjectType> = {
  [K.SPIKE]: ObjectType.ROTATING_SPIKE, [K.BARRIER]: ObjectType.MOVING_BARRIER, [K.SPINNER]: ObjectType.LASER_SPINNER,
  [K.ALIEN]: ObjectType.ALIEN, [K.MISSILE]: ObjectType.MISSILE,
};

class Runtime {
  game: any = null;
  token: string | null = null;
  note = '';                 // почему партия не засчитается (нет связи, отказ сервера)
  starting = false;
  private acc = 0;
  alpha = 1;
  private queue: string[] = [];
  private sent = false;
  private views = new Map<number, GameObject>();
  items: GameObject[] = [];
  obs: GameObject[] = [];
  version = 0;               // меняется, когда меняется набор объектов на сцене

  constructor() {
    if (typeof document !== 'undefined') {
      // вкладку свернули — шаги стоят, после возврата время не «догоняется»
      document.addEventListener('visibilitychange', () => { this.acc = 0; });
    }
    onResult((r) => useStore.setState({ verifiedResult: r }));
  }

  async start() {
    if (this.starting) return;
    this.starting = true;
    const r = await requestSeed();
    this.starting = false;
    this.game = new Game(r.seed);
    this.token = r.token;
    this.note = r.error || (r.token ? '' : 'партия без проверки');
    this.queue = [];
    this.acc = 0;
    this.alpha = 1;
    this.sent = false;
    this.views.clear();
    this.items = [];
    this.obs = [];
    this.version += 1;
    useStore.setState({ verifiedResult: null });
    this.mirror();
  }

  push(a: string) {
    const g = this.game;
    if (g && !g.over && this.queue.length < 16) this.queue.push(a);
  }

  /** Каждый кадр экрана (из useFrame). */
  update(delta: number) {
    const g = this.game;
    if (!g) return;
    if (!g.over) {
      this.acc += Math.min(delta, 0.25);
      let n = 0;
      while (this.acc >= STEP && !g.over) {
        this.acc -= STEP;
        this.step();
        if (++n > 15) { this.acc = 0; break; }
      }
    }
    this.alpha = g.over || g.shop ? 1 : this.acc / STEP;
    this.sync();
  }

  private step() {
    const g = this.game;
    while (this.queue.length) g.act(this.queue.shift());
    g.tick();
    this.handle(g.events);
    g.events.length = 0;
    this.mirror();
    if (g.over && !this.sent) this.finish();
  }

  /** Положение объекта между прошлым и текущим шагом, в единицах мира. */
  private place(v: GameObject, o: any) {
    const a = this.alpha;
    v.position[0] = (o.px + (o.x - o.px) * a) / 1000;
    v.position[1] = (o.py + (o.y - o.py) * a) / 1000;
    v.position[2] = (o.pz + (o.z - o.pz) * a) / 1000;
  }

  private viewOf(o: any): GameObject {
    let v = this.views.get(o.id);
    if (!v) {
      v = { id: 'o' + o.id, active: true, position: [0, 0, 0], ...ITEM_VIEW[o.k](o) } as GameObject;
      this.views.set(o.id, v);
    }
    this.place(v, o);
    return v;
  }

  private sync() {
    const g = this.game;
    const items: GameObject[] = [];
    const obs: GameObject[] = [];
    const live = new Set<number>();
    for (const o of g.items) if (o.active) { items.push(this.viewOf(o)); live.add(o.id); }
    for (const o of g.obs) if (o.active) { obs.push(this.viewOf(o)); live.add(o.id); }
    let changed = items.length !== this.items.length || obs.length !== this.obs.length;
    if (!changed) {
      for (let i = 0; i < items.length && !changed; i++) changed = items[i] !== this.items[i];
      for (let i = 0; i < obs.length && !changed; i++) changed = obs[i] !== this.obs[i];
    }
    if (changed) {
      for (const id of Array.from(this.views.keys())) if (!live.has(id)) this.views.delete(id);
      this.items = items;
      this.obs = obs;
      this.version += 1;
    }
  }

  /** Игрок для отрисовки: x и y в единицах мира между шагами. */
  player() {
    const g = this.game;
    if (!g) return null;
    const a = this.alpha;
    return {
      x: (g.px + (g.x - g.px) * a) / 1000,
      y: (g.py + (g.y - g.py) * a) / 1000,
      targetX: g.lane * 2.2,
      jumping: g.jumping,
      jumps: g.jumps,
      hurt: g.hurtT > 0,
    };
  }

  private handle(events: any[]) {
    for (const e of events) {
      const pos = e.x !== undefined ? [e.x / 1000, e.y / 1000, e.z / 1000] : null;
      if (e.t === 'jump') audio.playJump(e.double);
      else if (e.t === 'pick') {
        if (e.k === K.GEM) audio.playGemCollect();
        else if (e.k === K.LETTER) audio.playLetterCollect();
        else if (e.k === K.BOOST) audio.playSpeedBoost();
        const color = e.k === K.LETTER ? GEMINI_COLORS[e.idx] : e.k === K.BOOST ? '#ff9100'
          : e.pts === 100 ? '#ffd700' : '#00ffff';
        window.dispatchEvent(new CustomEvent('particle-burst', { detail: { position: pos, color } }));
      } else if (e.t === 'boom') {
        const color = (ITEM_VIEW[e.k]({}) as any).color || '#ff0054';
        window.dispatchEvent(new CustomEvent('obstacle-explosion', { detail: { position: pos, color, type: KIND_TYPE[e.k] } }));
        window.dispatchEvent(new CustomEvent('particle-burst', { detail: { position: pos, color } }));
      } else if (e.t === 'hurt') {
        audio.playDamage();
        window.dispatchEvent(new Event('player-hit'));
      } else if (e.t === 'dodge') {
        audio.playDodge(e.combo, e.close);
        useStore.setState({ lastComboAt: Date.now(), lastDodgeCloseCall: e.close });
      } else if (e.t === 'fire') {
        window.dispatchEvent(new CustomEvent('particle-burst', { detail: { position: pos, color: '#10b981' } }));
      } else if (e.t === 'ach') {
        useStore.getState().pushAchievement(e.id);
      }
    }
  }

  private mirror() {
    const g = this.game;
    const st: any = useStore.getState();
    const status = g.over ? (g.victory ? GameStatus.VICTORY : GameStatus.GAME_OVER)
      : g.shop ? GameStatus.SHOP : GameStatus.PLAYING;
    const next: any = {
      status, score: g.score, lives: g.lives, maxLives: g.maxLives,
      speed: g.over ? 0 : g.speed() * 60 / 1000, baseSpeed: g.base * 60 / 1000,
      level: g.level, laneCount: g.lanes, gemsCollected: g.gems, distance: g.distUnits(),
      combo: g.combo, maxCombo: g.maxCombo, multiplier: g.mult,
      hasDoubleJump: g.hasDouble, hasImmortality: g.hasShield,
      isImmortalityActive: g.shieldT > 0, isSpeedBoostActive: g.boostT > 0,
    };
    const patch: any = {};
    for (const k of Object.keys(next)) if (st[k] !== next[k]) patch[k] = next[k];
    if (st.collectedLetters.join(',') !== g.letters.join(',')) patch.collectedLetters = g.letters.slice();
    if (Object.keys(patch).length) useStore.setState(patch);
  }

  private finish() {
    const g = this.game;
    this.sent = true;
    useStore.getState().saveMaxDistance(g.distUnits());
    sendOver({
      token: this.token, tape: g.tape, score: g.score, frames: g.frame,
      distance: g.distUnits(), level: g.level, victory: g.victory,
    });
  }
}

export const runtime = new Runtime();
export { RULES };
