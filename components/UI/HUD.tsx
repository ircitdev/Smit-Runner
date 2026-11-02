/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { Heart, Zap, Wifi, Trophy, MapPin, Diamond, Rocket, ArrowUpCircle, Shield, Activity, PlusCircle, Play, CheckCircle2, Award } from 'lucide-react';
import { useStore } from '../../store';
import { GameStatus, GEMINI_COLORS, ShopItem, RUN_SPEED_BASE, ACHIEVEMENTS } from '../../types';
import { audio } from '../System/Audio';

// Доступные модули в магазине СмИТ Биллинг 3.9
const SHOP_ITEMS: ShopItem[] = [
    {
        id: 'DOUBLE_JUMP',
        name: 'ДВОЙНОЙ ПРЫЖОК',
        description: 'Прыгайте ещё раз в воздухе. Необходимо для высоких преград.',
        cost: 1000,
        icon: ArrowUpCircle,
        oneTime: true
    },
    {
        id: 'MAX_LIFE',
        name: 'МАКС. ЗДОРОВЬЕ',
        description: 'Навсегда добавляет ячейку резервного питания и восстанавливает узел.',
        cost: 1500,
        icon: Activity
    },
    {
        id: 'HEAL',
        name: 'РЕМОНТНЫЙ НАБОР',
        description: 'Мгновенно восстанавливает 1 единицу заряда системы.',
        cost: 1000,
        icon: PlusCircle
    },
    {
        id: 'IMMORTAL',
        name: 'БЕССМЕРТИЕ (ЩИТ)',
        description: 'Способность: Пробел / Тап включает защиту узла на 5 сек.',
        cost: 3000,
        icon: Shield,
        oneTime: true
    }
];

const SmitBrandHeader: React.FC<{ subtitle?: string }> = ({ subtitle }) => (
    <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center font-black text-white text-lg shadow-md shadow-emerald-500/25 shrink-0">
            С
        </div>
        <div className="flex flex-col text-left">
            <div className="flex items-baseline gap-1.5 font-bold tracking-tight text-base sm:text-lg text-slate-100">
                <span>СмИТ Биллинг</span>
                <span className="text-xs font-mono font-semibold text-emerald-400">3.9</span>
            </div>
            {subtitle && (
                <span className="text-[11px] text-slate-400 leading-none">{subtitle}</span>
            )}
        </div>
    </div>
);

const ShopScreen: React.FC = () => {
    const { score, buyItem, closeShop, hasDoubleJump, hasImmortality } = useStore();
    const [items, setItems] = useState<ShopItem[]>([]);

    useEffect(() => {
        let pool = SHOP_ITEMS.filter(item => {
            if (item.id === 'DOUBLE_JUMP' && hasDoubleJump) return false;
            if (item.id === 'IMMORTAL' && hasImmortality) return false;
            return true;
        });

        pool = pool.sort(() => 0.5 - Math.random());
        setItems(pool.slice(0, 3));
    }, [hasDoubleJump, hasImmortality]);

    return (
        <div className="absolute inset-0 bg-slate-950/90 z-[100] text-slate-100 pointer-events-auto backdrop-blur-md overflow-y-auto">
             <div className="flex flex-col items-center justify-center min-h-full py-8 px-4 max-w-5xl mx-auto">
                 <div className="mb-3">
                     <SmitBrandHeader subtitle="Маркетплейс модулей и апгрейдов" />
                 </div>
                 <h2 className="text-2xl md:text-4xl font-black text-white mb-2 font-cyber tracking-wide text-center">
                     МОДУЛИ СмИТ БИЛЛИНГ
                 </h2>
                 <div className="flex items-center text-emerald-400 mb-6 md:mb-8 font-mono text-sm md:text-base">
                     <span className="text-slate-400 mr-2">БАЛАНС ЛИЦЕВОГО СЧЁТА:</span>
                     <span className="text-xl md:text-2xl font-bold text-emerald-400 tabular-nums">{score.toLocaleString('ru-RU')} КР.</span>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl w-full mb-8">
                     {items.map(item => {
                         const Icon = item.icon;
                         const canAfford = score >= item.cost;
                         return (
                             <div key={item.id} className="smit-glass-card p-5 md:p-6 rounded-2xl flex flex-col items-center text-center transition-all hover:border-emerald-500/50">
                                 <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-4">
                                     <Icon className="w-6 h-6 text-emerald-400" />
                                 </div>
                                 <h3 className="text-lg md:text-xl font-bold mb-2 text-slate-100">{item.name}</h3>
                                 <p className="text-slate-300 text-xs md:text-sm mb-5 h-12 flex items-center justify-center">{item.description}</p>
                                 <button 
                                    onClick={() => buyItem(item.id as any, item.cost)}
                                    disabled={!canAfford}
                                    className={`px-4 py-2.5 rounded-xl font-semibold w-full text-sm md:text-base transition-all cursor-pointer ${
                                        canAfford
                                            ? 'smit-glass-tint bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20'
                                            : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed'
                                    }`}
                                 >
                                     {item.cost.toLocaleString('ru-RU')} КРИСТАЛЛОВ
                                 </button>
                             </div>
                         );
                     })}
                 </div>

                 <button 
                    onClick={closeShop}
                    className="smit-glass-tint inline-flex items-center px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-base md:text-lg rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
                 >
                     ПРОДОЛЖИТЬ МАРШРУТ <Play className="ml-2 w-5 h-5 fill-white" />
                 </button>
             </div>
        </div>
    );
};

export const HUD: React.FC = () => {
  const {
    score,
    lives,
    maxLives,
    collectedLetters,
    status,
    level,
    restartGame,
    startGame,
    gemsCollected,
    distance,
    maxDistance,
    combo,
    maxCombo,
    multiplier,
    lastComboAt,
    lastDodgeCloseCall,
    unlockedAchievements,
    sessionAchievements,
    activeAchievement,
    achievementTriggerCount,
    isImmortalityActive,
    isSpeedBoostActive,
    speed,
    customRobotModelUrl,
    setCustomRobotModelUrl
  } = useStore();
  const target = ['S', 'M', 'I', 'T'];
  const [customModelName, setCustomModelName] = useState<string | null>(null);
  const [isGlitchBurst, setIsGlitchBurst] = useState(false);

  useEffect(() => {
    if (combo > 0 && lastComboAt > 0) {
      setIsGlitchBurst(true);
      const timer = setTimeout(() => setIsGlitchBurst(false), 320);
      return () => clearTimeout(timer);
    }
  }, [combo, lastComboAt]);

  const handleModelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCustomRobotModelUrl(objectUrl);
    setCustomModelName(file.name);
  };

  const containerClass = "absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-7 z-50";

  if (status === GameStatus.SHOP) {
      return <ShopScreen />;
  }

  if (status === GameStatus.MENU) {
      return (
          <div className="absolute inset-0 flex items-center justify-center z-[100] bg-slate-950/80 backdrop-blur-md p-4 pointer-events-auto">
              <div className="relative w-full max-w-lg">
                  {/* Ambient Emerald/Teal Glow behind card (from billing.smit34.ru hero) */}
                  <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500/25 to-teal-500/25 rounded-3xl blur-xl pointer-events-none"></div>

                  {/* Signature billing.smit34.ru Glass Card */}
                  <div className="smit-glass-card relative rounded-2xl shadow-2xl p-6 sm:p-7 overflow-hidden">
                      {/* Top Terminal Window Bar from billing.smit34.ru */}
                      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
                          <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                              <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                              <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
                              <span className="text-xs font-mono text-slate-400 ml-2">billing.smit34.ru</span>
                          </div>
                          <span className="text-xs font-mono font-semibold text-emerald-400">
                              СмИТ 3.9
                          </span>
                      </div>

                      {/* Brand Header & SMIT Letters */}
                      <div className="flex flex-col items-center text-center mb-5">
                          <div className="mb-3">
                              <SmitBrandHeader subtitle="Оптическая магистраль GPON · Кибер-Раннер" />
                          </div>

                          <div className="inline-flex space-x-2.5 my-2">
                              {['S', 'M', 'I', 'T'].map((ch, idx) => (
                                  <span
                                      key={ch}
                                      style={{
                                          borderColor: GEMINI_COLORS[idx],
                                          boxShadow: `0 0 18px ${GEMINI_COLORS[idx]}44`,
                                          backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                          color: GEMINI_COLORS[idx]
                                      }}
                                      className="w-12 h-13 md:w-13 md:h-14 flex items-center justify-center border-2 rounded-xl font-cyber font-black text-2xl md:text-3xl"
                                  >
                                      {ch}
                                  </span>
                              ))}
                          </div>

                          <h1 className="text-2xl sm:text-3xl font-black font-cyber tracking-wide text-white mt-2">
                              СКОРОСТЬ БЕЗ ГРАНИЦ
                          </h1>
                          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-md leading-relaxed">
                              Управляйте роботом-помощником <strong className="text-emerald-400">СмИТ</strong>, собирайте Wi-Fi ускорения и открывайте достижения за дистанцию и комбо.
                          </p>
                      </div>

                      {/* Best Distance & Achievements Summary Row */}
                      <div className="mb-5 grid grid-cols-2 gap-2.5 text-xs font-mono">
                          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/75 border border-emerald-500/25 flex items-center justify-between">
                              <span className="text-slate-400 flex items-center gap-1.5">
                                  <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  РЕКОРД:
                              </span>
                              <strong className="text-emerald-400 tabular-nums">{Math.floor(maxDistance)} СВ. Л.</strong>
                          </div>
                          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/75 border border-teal-500/25 flex items-center justify-between">
                              <span className="text-slate-400 flex items-center gap-1.5">
                                  <Award className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                  НАГРАДЫ:
                              </span>
                              <strong className="text-teal-300 tabular-nums">{unlockedAchievements.length} / {ACHIEVEMENTS.length}</strong>
                          </div>
                      </div>

                      {/* Primary Action CTA (exact billing.smit34.ru .glass-tint button style) */}
                      <button
                          onClick={() => { audio.init(); startGame(); }}
                          className="smit-glass-tint w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base sm:text-lg font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-600 hover:shadow-xl hover:shadow-emerald-500/35 transition-all cursor-pointer"
                      >
                          <span>ЗАПУСТИТЬ ЗАБЕГ</span>
                          <Play className="w-5 h-5 fill-white" />
                      </button>

                      {/* Custom Tripo3D .GLB Robot Model Loader */}
                      <div className="mt-3 w-full flex items-center justify-center gap-2">
                          <label className="cursor-pointer flex-1 inline-flex items-center justify-center px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-xs font-semibold transition-colors">
                              {customModelName ? `3D-МОДЕЛЬ: ${customModelName.slice(0, 20)}` : 'ЗАГРУЗИТЬ 3D-РОБОТА (.GLB)'}
                              <input
                                  type="file"
                                  accept=".glb,.gltf"
                                  onChange={handleModelFileUpload}
                                  className="hidden"
                              />
                          </label>
                          {customRobotModelUrl && (
                              <button
                                  onClick={() => {
                                      setCustomRobotModelUrl(null);
                                      setCustomModelName(null);
                                  }}
                                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-xs font-semibold cursor-pointer"
                              >
                                  СБРОС
                              </button>
                          )}
                      </div>

                      {/* Feature Checklist Footer (matching billing.smit34.ru hero checklist) */}
                      <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                          <div className="flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">Оптика GPON</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">Wi-Fi Турбо</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">Комбо x10</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (status === GameStatus.GAME_OVER) {
      return (
          <div className="absolute inset-0 bg-slate-950/90 z-[100] text-slate-100 pointer-events-auto backdrop-blur-md overflow-y-auto">
              <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
                <div className="smit-glass-card w-full max-w-md rounded-2xl p-6 sm:p-7">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
                        <SmitBrandHeader subtitle="Отчёт сессии абонента" />
                        <span className="text-xs font-mono text-rose-400">ОБРЫВ ЛИНИИ</span>
                    </div>

                    <h1 className="text-3xl md:text-4xl font-black text-white mb-5 font-cyber text-center">
                        СЕССИЯ ЗАВЕРШЕНА
                    </h1>
                    
                    <div className="grid grid-cols-1 gap-2.5 text-center mb-6 w-full">
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                            <div className="flex items-center text-emerald-400 text-sm"><Trophy className="mr-2 w-4 h-4"/> УРОВЕНЬ СЕТИ</div>
                            <div className="text-lg font-bold font-mono tabular-nums">{level} / 3</div>
                        </div>
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                            <div className="flex items-center text-teal-400 text-sm"><Diamond className="mr-2 w-4 h-4"/> СОБРАНО ПАКЕТОВ</div>
                            <div className="text-lg font-bold font-mono tabular-nums">{gemsCollected}</div>
                        </div>
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-emerald-500/30 flex items-center justify-between">
                            <div className="flex items-center text-emerald-300 text-sm"><Zap className="mr-2 w-4 h-4"/> МАКС. КОМБО УВОРОТОВ</div>
                            <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums">{maxCombo}</div>
                        </div>
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-teal-500/30 flex items-center justify-between">
                            <div className="flex items-center text-teal-300 text-sm"><Award className="mr-2 w-4 h-4"/> ОТКРЫТО ДОСТИЖЕНИЙ</div>
                            <div className="text-lg font-bold font-mono text-teal-300 tabular-nums">{sessionAchievements.length} (ВСЕГО {unlockedAchievements.length}/{ACHIEVEMENTS.length})</div>
                        </div>
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                            <div className="flex items-center text-cyan-400 text-sm"><MapPin className="mr-2 w-4 h-4"/> ДИСТАНЦИЯ</div>
                            <div className="text-lg font-bold font-mono tabular-nums">{Math.floor(distance)} СВ. ЛЕТ</div>
                        </div>
                        <div className="bg-slate-900/75 p-3 rounded-xl border border-emerald-500/30 flex items-center justify-between">
                            <div className="flex items-center text-amber-300 text-sm"><Trophy className="mr-2 w-4 h-4"/> ЛУЧШАЯ ДИСТАНЦИЯ</div>
                            <div className="text-lg font-bold font-mono text-amber-400 tabular-nums">{Math.floor(maxDistance)} СВ. ЛЕТ</div>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl flex items-center justify-between mt-1">
                            <div className="flex items-center text-slate-200 text-sm font-semibold">ИТОГОВЫЙ БАЛАНС</div>
                            <div className="text-2xl font-bold font-cyber text-emerald-400 tabular-nums">{score.toLocaleString('ru-RU')}</div>
                        </div>
                    </div>

                    <button 
                      onClick={() => { audio.init(); restartGame(); }}
                      className="smit-glass-tint w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-base md:text-lg rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
                    >
                        ПЕРЕПОДКЛЮЧИТЬСЯ
                    </button>
                </div>
              </div>
          </div>
      );
  }

  if (status === GameStatus.VICTORY) {
    return (
        <div className="absolute inset-0 bg-slate-950/95 z-[100] text-slate-100 pointer-events-auto backdrop-blur-md overflow-y-auto">
            <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
                <div className="smit-glass-card w-full max-w-lg rounded-2xl p-6 sm:p-8 text-center">
                    <Rocket className="w-14 h-14 md:w-20 md:h-20 text-emerald-400 mx-auto mb-3 animate-bounce drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 mb-2 font-cyber leading-tight">
                        МАГИСТРАЛЬ ПОДКЛЮЧЕНА
                    </h1>
                    <p className="text-slate-300 text-xs md:text-base font-mono mb-6 tracking-wider">
                        ВСЕ УЗЛЫ SMIT АКТИВИРОВАНЫ — СКОРОСТЬ НА МАКСИМУМЕ
                    </p>
                    
                    <div className="grid grid-cols-1 gap-4 text-center mb-6 w-full">
                        <div className="bg-slate-900/80 p-5 rounded-xl border border-emerald-500/30">
                            <div className="text-xs text-slate-400 mb-1 tracking-wider">ИТОГОВЫЙ БАЛАНС ОЧКОВ</div>
                            <div className="text-3xl md:text-4xl font-bold font-cyber text-emerald-400 tabular-nums">{score.toLocaleString('ru-RU')}</div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            <div className="bg-slate-900/75 p-3 rounded-xl border border-slate-800">
                                <div className="text-[11px] text-slate-400">ПАКЕТЫ</div>
                                <div className="text-lg font-bold text-teal-400 tabular-nums">{gemsCollected}</div>
                            </div>
                            <div className="bg-slate-900/75 p-3 rounded-xl border border-emerald-500/30">
                                <div className="text-[11px] text-emerald-300/80">МАКС. КОМБО</div>
                                <div className="text-lg font-bold text-emerald-400 tabular-nums">{maxCombo}</div>
                            </div>
                            <div className="bg-slate-900/75 p-3 rounded-xl border border-teal-500/30">
                                <div className="text-[11px] text-teal-300/80">НАГРАДЫ</div>
                                <div className="text-lg font-bold text-teal-300 tabular-nums">{unlockedAchievements.length}/{ACHIEVEMENTS.length}</div>
                            </div>
                            <div className="bg-slate-900/75 p-3 rounded-xl border border-amber-500/30">
                                <div className="text-[11px] text-amber-300/80">РЕКОРД</div>
                                <div className="text-lg font-bold text-amber-400 tabular-nums">{Math.floor(maxDistance)} СВ. Л.</div>
                            </div>
                        </div>
                    </div>

                    <button 
                      onClick={() => { audio.init(); restartGame(); }}
                      className="smit-glass-tint w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-base md:text-lg rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-500/30 tracking-wider cursor-pointer"
                    >
                        НОВЫЙ ЗАПУСК
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className={containerClass}>
        {/* Top Bar */}
        <div className="flex justify-between items-start w-full">
            <div className="flex flex-col space-y-2">
                {/* Main Score & Neon Glitch Multiplier Card (billing.smit34.ru glass card) */}
                <div className="smit-glass-card px-3.5 py-2.5 rounded-2xl flex flex-col space-y-1">
                    <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center font-black text-white text-sm shadow-sm shadow-emerald-500/20">
                            С
                        </div>
                        <div className="text-2xl md:text-4xl font-bold text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.45)] font-cyber tabular-nums">
                            {score.toLocaleString('ru-RU')}
                        </div>

                        {/* Neon Glitch Score Multiplier */}
                        <div
                            key={`mult-${combo}`}
                            className={`flex items-center px-2 py-0.5 rounded-lg bg-slate-950/80 border transition-all ${
                                combo > 0
                                    ? 'border-emerald-400/80 shadow-[0_0_16px_rgba(16,185,129,0.5)] opacity-100'
                                    : 'border-slate-700/70 opacity-65'
                            } ${isGlitchBurst ? 'cyber-glitch-burst' : ''}`}
                        >
                            <span
                                data-text={`x${multiplier}`}
                                className={`font-cyber font-black text-lg md:text-2xl tracking-wider tabular-nums ${
                                    multiplier >= 5
                                        ? 'text-amber-300 cyber-glitch'
                                        : multiplier >= 2
                                        ? 'text-emerald-300 cyber-glitch'
                                        : 'text-slate-300'
                                }`}
                            >
                                x{multiplier}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] md:text-xs font-mono tracking-wider tabular-nums pt-0.5">
                        <span className="text-slate-300 flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                            {Math.floor(distance)} СВ. Л.
                        </span>
                        <span className="hidden md:inline text-slate-600">·</span>
                        <span className="hidden md:flex text-amber-300/90 items-center">
                            <Trophy className="w-3.5 h-3.5 mr-1 text-amber-400" />
                            РЕКОРД {Math.floor(maxDistance)} СВ. Л.
                        </span>
                    </div>
                </div>

                {/* Neon Glitch Dodge Combo Counter Panel */}
                {combo > 0 && (
                    <div
                        className={`smit-glass-card inline-flex flex-col self-start px-3.5 py-2 rounded-xl border border-emerald-400/50 shadow-[0_0_22px_rgba(16,185,129,0.3)] ${
                            isGlitchBurst ? 'cyber-glitch-burst' : ''
                        }`}
                    >
                        <div className="flex items-center space-x-2">
                            <span
                                data-text={`КОМБО x${combo}`}
                                className="cyber-glitch font-cyber font-black text-sm md:text-lg text-emerald-300 tracking-widest tabular-nums"
                            >
                                КОМБО x{combo}
                            </span>
                            {lastDodgeCloseCall && (
                                <span
                                    data-text="РИСК!"
                                    className="cyber-glitch text-[10px] md:text-xs font-cyber font-bold text-amber-300 uppercase tracking-wider"
                                >
                                    РИСК!
                                </span>
                            )}
                        </div>
                        {/* Progress bar toward next multiplier tier */}
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-150"
                                style={{
                                    width: multiplier >= 10 ? '100%' : `${((combo % 2) === 1 ? 50 : 100)}%`
                                }}
                            />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-400 space-x-2">
                            <span>СКОРОСТЬ +{(multiplier - 1) * 5}%</span>
                            <span>·</span>
                            <span className={multiplier >= 6 ? 'text-rose-400 font-semibold' : multiplier >= 3 ? 'text-amber-300' : 'text-emerald-400'}>
                                ПЛОТНОСТЬ {multiplier >= 7 ? 'МАКС.' : multiplier >= 4 ? 'ВЫСОКАЯ' : 'ШТАТНАЯ'}
                            </span>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex flex-col items-end space-y-2">
                <div className="smit-glass-card px-3 py-2 rounded-xl flex space-x-1.5 md:space-x-2">
                    {[...Array(maxLives)].map((_, i) => (
                        <Heart 
                            key={i} 
                            className={`w-5 h-5 md:w-7 md:h-7 ${i < lives ? 'text-emerald-400 fill-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'text-slate-800 fill-slate-800'}`} 
                        />
                    ))}
                </div>

                {/* Телефон: уровень и буквы SMIT под жизнями, а не по центру — иначе наезжают на карточку счёта */}
                <div className="md:hidden flex flex-col items-end space-y-1.5">
                    <div className="smit-glass-card px-2.5 py-1 rounded-lg text-[11px] text-emerald-300 font-bold tracking-wider font-mono">
                        УРОВЕНЬ {level} <span className="text-slate-400">/ 3</span>
                    </div>
                    <div className="flex space-x-1">
                        {target.map((char, idx) => {
                            const isCollected = collectedLetters.includes(idx);
                            const color = GEMINI_COLORS[idx];
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        borderColor: isCollected ? color : 'rgba(51, 65, 85, 0.8)',
                                        color: isCollected ? '#020617' : 'rgba(100, 116, 139, 0.9)',
                                        boxShadow: isCollected ? `0 0 12px ${color}` : 'none',
                                        backgroundColor: isCollected ? color : 'rgba(15, 23, 42, 0.85)'
                                    }}
                                    className="w-6 h-7 flex items-center justify-center border-2 font-black text-sm font-cyber rounded-lg transition-all duration-300"
                                >
                                    {char}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Glitch-Animated In-Game Achievement Popup Banner */}
                {activeAchievement && (
                    <div
                        key={`ach-${activeAchievement.id}-${achievementTriggerCount}`}
                        className="cyber-achievement-toast smit-glass-card px-3.5 py-2.5 rounded-2xl border border-emerald-400/80 shadow-[0_0_28px_rgba(16,185,129,0.45)] flex items-center space-x-3 max-w-xs md:max-w-sm"
                    >
                        <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex flex-col items-center justify-center font-cyber font-black text-white text-xs md:text-sm shadow-md shadow-emerald-500/30 shrink-0">
                            <Award className="w-4 h-4 mb-0.5 text-amber-200" />
                            <span>{activeAchievement.badge}</span>
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center space-x-1.5">
                                <span className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-widest">
                                    ДОСТИЖЕНИЕ СмИТ
                                </span>
                                <span className="text-[10px] font-mono text-emerald-300">
                                    +{activeAchievement.reward} КР.
                                </span>
                            </div>
                            <div
                                data-text={activeAchievement.title}
                                className="cyber-glitch font-cyber font-black text-xs md:text-sm text-white tracking-wider truncate"
                            >
                                {activeAchievement.title}
                            </div>
                            <div className="text-[11px] text-slate-300 truncate">
                                {activeAchievement.description}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        {/* Level Indicator - Top Center */}
        <div className="hidden md:block absolute top-4 md:top-7 left-1/2 transform -translate-x-1/2 text-xs md:text-sm text-emerald-300 font-bold tracking-wider font-mono smit-glass-card px-3.5 py-1.5 rounded-xl z-50">
            СмИТ 3.9 · УРОВЕНЬ {level} <span className="text-slate-400">/ 3</span>
        </div>

        {/* Active Skill / Power-up Indicators */}
        <div className="absolute top-[150px] md:top-36 left-1/2 transform -translate-x-1/2 flex flex-col items-center space-y-2">
            {isImmortalityActive && (
                 <div className="text-amber-300 font-bold text-lg md:text-2xl flex items-center drop-shadow-[0_0_10px_rgba(251,191,36,0.7)] font-cyber tracking-wider">
                     <Shield className="mr-2 w-5 h-5 md:w-6 md:h-6 fill-amber-400 text-amber-300" /> ЗАЩИТА АКТИВНА
                 </div>
            )}
            {isSpeedBoostActive && (
                 <div className="text-emerald-300 font-bold text-lg md:text-2xl flex items-center drop-shadow-[0_0_12px_rgba(16,185,129,0.8)] font-cyber tracking-wider">
                     <Wifi className="mr-2 w-5 h-5 md:w-6 md:h-6 text-emerald-400 animate-spin" /> WI-FI УСКОРЕНИЕ
                 </div>
            )}
        </div>

        {/* SMIT Collection Status */}
        <div className="absolute top-14 md:top-20 left-1/2 transform -translate-x-1/2 hidden md:flex space-x-2 md:space-x-2.5">
            {target.map((char, idx) => {
                const isCollected = collectedLetters.includes(idx);
                const color = GEMINI_COLORS[idx];

                return (
                    <div 
                        key={idx}
                        style={{
                            borderColor: isCollected ? color : 'rgba(51, 65, 85, 0.8)',
                            color: isCollected ? '#020617' : 'rgba(100, 116, 139, 0.9)',
                            boxShadow: isCollected ? `0 0 18px ${color}` : 'none',
                            backgroundColor: isCollected ? color : 'rgba(15, 23, 42, 0.85)'
                        }}
                        className="w-8 h-10 md:w-10 md:h-12 flex items-center justify-center border-2 font-black text-lg md:text-xl font-cyber rounded-xl transform transition-all duration-300"
                    >
                        {char}
                    </div>
                );
            })}
        </div>

        {/* Bottom Overlay */}
        <div className="w-full flex justify-end items-end">
             <div className={`smit-glass-card px-3.5 py-2 rounded-xl flex items-center space-x-2 transition-all duration-300 ${isSpeedBoostActive ? 'text-emerald-300 border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105' : 'text-emerald-400/90'}`}>
                 {isSpeedBoostActive ? (
                     <Wifi className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 animate-spin" />
                 ) : (
                     <Zap className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 animate-pulse" />
                 )}
                 <span className="font-mono text-sm md:text-lg font-bold tabular-nums">КАНАЛ {Math.round((speed / RUN_SPEED_BASE) * 100)}%</span>
             </div>
        </div>
    </div>
  );
};
