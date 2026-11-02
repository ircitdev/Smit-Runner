/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* Мост к странице биллинга (игра идёт во встроенном окне).
 *
 * Протокол postMessage (только свой адрес — window.location.origin):
 *   игра → страница  {type:'smitgame:need-seed', game:'cyber', rules}      — нажали «Запустить»
 *   страница → игра  {type:'smitgame:seed', seed, token}                  — сид партии от сервера
 *                    {type:'smitgame:seed', error}                        — сервер отказал (лимит, вход)
 *   игра → страница  {type:'smitgame:over', game:'cyber', rules, token, tape, score, frames,
 *                     distance, level, victory}                            — конец партии
 *   страница → игра  {type:'smitgame:result', saved, score, personal_best, error}  — итог проверки
 *
 * Без страницы (игра открыта сама по себе) или если страница не ответила за 4 с,
 * партия идёт со своим сидом и token=null — результат не засчитывается.
 */
import { RULES } from './core.js';

export interface SeedReply { seed: number; token: string | null; error?: string }

const embedded = typeof window !== 'undefined' && window.parent && window.parent !== window;
let waiting: ((r: SeedReply) => void) | null = null;
let resultListener: ((r: any) => void) | null = null;

function localSeed(): number {
  const a = new Uint32Array(1);
  (window.crypto || (window as any).msCrypto).getRandomValues(a);
  return a[0] >>> 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    const d = e.data || {};
    if (d.type === 'smitgame:seed' && waiting) {
      const w = waiting;
      waiting = null;
      if (d.error) w({ seed: localSeed(), token: null, error: String(d.error) });
      else w({ seed: Number(d.seed) >>> 0, token: d.token ? String(d.token) : null });
    } else if (d.type === 'smitgame:result' && resultListener) {
      resultListener(d);
    }
  });
}

export function requestSeed(): Promise<SeedReply> {
  if (!embedded) return Promise.resolve({ seed: localSeed(), token: null });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (waiting) { waiting = null; resolve({ seed: localSeed(), token: null, error: 'нет связи с сервером' }); }
    }, 4000);
    waiting = (r) => { clearTimeout(timer); resolve(r); };
    window.parent.postMessage({ type: 'smitgame:need-seed', game: 'cyber', rules: RULES }, window.location.origin);
  });
}

export function sendOver(payload: Record<string, unknown>) {
  if (!embedded) return;
  window.parent.postMessage({ type: 'smitgame:over', game: 'cyber', rules: RULES, ...payload }, window.location.origin);
}

export function onResult(cb: (r: any) => void) { resultListener = cb; }
