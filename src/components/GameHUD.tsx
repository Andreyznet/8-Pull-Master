import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  HelpCircle,
  Film,
  Lightbulb,
  Crosshair,
  RefreshCw,
  Settings,
  Smartphone,
  Download,
  X,
} from 'lucide-react';
import {
  Ball,
  BallGroup,
  BotDifficulty,
  GameMode,
  Player,
  PlayerHintSuggestion,
  TableTheme,
  TurnState,
} from '../types/game';
import { threePoolRenderer } from '../utils/threeBallRenderer';
import { SpinSelector } from './SpinSelector';
import { downloadReadyApk } from './AndroidBuildModal';

interface GameHUDProps {
  player1: Player;
  player2: Player;
  activePlayerId: 'p1' | 'p2' | 'bot';
  balls: Ball[];
  turnState: TurnState;
  gameMode: GameMode;
  botDifficulty: BotDifficulty;
  currentTheme: TableTheme;
  guidelineLength: 'full' | 'medium' | 'short';
  turnTimer: number;
  statusMessage: string;
  isMuted: boolean;
  canReplay: boolean;
  recordedShotsCount: number;
  isReplaying: boolean;
  hintMode: boolean;
  activeHint: PlayerHintSuggestion | null;
  hintIndex: number;
  totalHints: number;
  isHintLocked?: boolean;
  spinX: number;
  spinY: number;
  onSpinChange: (sx: number, sy: number) => void;
  onModeChange: (mode: GameMode) => void;
  onToggleHintMode: () => void;
  onApplyHint: () => void;
  onShootHint?: () => void;
  onCycleHint: () => void;
  onOpenReplay: () => void;
  onToggleMute: () => void;
  onThemeChange: (theme: TableTheme) => void;
  onGuidelineChange: (len: 'full' | 'medium' | 'short') => void;
  onDifficultyChange: (diff: BotDifficulty) => void;
  onResetGame: () => void;
  onOpenRules: () => void;
  onOpenAndroidModal: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  player1,
  player2,
  activePlayerId,
  balls,
  turnState,
  gameMode,
  botDifficulty,
  currentTheme,
  guidelineLength,
  turnTimer,
  statusMessage,
  isMuted,
  recordedShotsCount,
  hintMode,
  activeHint,
  hintIndex,
  totalHints,
  isHintLocked = false,
  spinX,
  spinY,
  onSpinChange,
  onModeChange,
  onToggleHintMode,
  onApplyHint,
  onShootHint,
  onCycleHint,
  onOpenReplay,
  onToggleMute,
  onThemeChange,
  onGuidelineChange,
  onDifficultyChange,
  onResetGame,
  onOpenRules,
  onOpenAndroidModal,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isP1Active = activePlayerId === 'p1';

  // Render compact 3D ball tray like original 8 Ball Pool top bar
  const renderBallTray = (group: BallGroup, defaultGroup: 'solids' | 'stripes') => {
    const effectiveGroup = group || defaultGroup;
    const startNum = effectiveGroup === 'solids' ? 1 : 9;
    const endNum = effectiveGroup === 'solids' ? 7 : 15;
    const groupBalls = [];

    for (let i = startNum; i <= endNum; i++) {
      const ballObj = balls.find(b => b.id === i);
      const isPocketed = Boolean(ballObj?.inPocket);
      const iconUrl = threePoolRenderer.getBallIconDataUrl(i);

      groupBalls.push(
        <div
          key={i}
          className={`relative w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center transition-all ${
            isPocketed ? 'bg-slate-950/90 ring-1 ring-slate-800/80' : ''
          }`}
        >
          <img
            src={iconUrl}
            alt={`#${i}`}
            draggable={false}
            className={`w-full h-full object-contain select-none ${
              isPocketed
                ? 'opacity-15 scale-75 brightness-50'
                : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]'
            }`}
          />
        </div>
      );
    }

    const eightPocketed = Boolean(balls.find(b => b.id === 8)?.inPocket);
    const eightIconUrl = threePoolRenderer.getBallIconDataUrl(8);
    groupBalls.push(
      <div
        key={8}
        className={`relative w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center ${
          eightPocketed ? 'bg-slate-950/90 ring-1 ring-slate-800/80' : ''
        }`}
      >
        <img
          src={eightIconUrl}
          alt="#8"
          draggable={false}
          className={`w-full h-full object-contain select-none ${
            eightPocketed ? 'opacity-15 scale-75' : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
          }`}
        />
      </div>
    );

    return <div className="flex items-center gap-0.5">{groupBalls}</div>;
  };

  return (
    <>
      {/* Single Compact Top Bar (Original 8 Ball Pool Smartphone Layout) */}
      <header className="w-full h-11 sm:h-12 bg-slate-900/95 border-b border-slate-800/90 px-2 sm:px-3 flex items-center justify-between gap-1.5 shrink-0 z-30 shadow-md">
        {/* Left Side: Settings Button + Player 1 Compact Pod */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            title="Настройки, режимы игры и стол"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-200 hover:text-white transition shrink-0 cursor-pointer active:scale-95"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Player 1 Pod */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all ${
              isP1Active
                ? 'bg-emerald-950/60 border-emerald-500/60 shadow-xs'
                : 'bg-slate-950/50 border-slate-800/70 opacity-75'
            }`}
          >
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800 border border-emerald-400/60 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={threePoolRenderer.getBallIconDataUrl(8)}
                alt="P1"
                className="w-5 h-5 object-contain"
              />
              {isP1Active && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 leading-none">
                <span className="text-[11px] font-bold text-white truncate max-w-[68px] sm:max-w-[90px]">
                  {player1.name}
                </span>
                {gameMode !== 'practice' && isP1Active && turnState === 'aiming' && (
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      turnTimer <= 8 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                    }`}
                  >
                    {turnTimer}s
                  </span>
                )}
              </div>
              <div className="mt-0.5">{renderBallTray(player1.group, 'solids')}</div>
            </div>
          </div>
        </div>

        {/* Center: Compact Status OR Interactive 1-Tap Hint Pill */}
        <div className="flex items-center justify-center min-w-0 flex-1 px-1">
          {hintMode && turnState === 'aiming' && activePlayerId !== 'bot' ? (
            activeHint ? (
              <div className="flex items-center gap-1 bg-emerald-950/85 border border-emerald-500/60 rounded-full px-2 py-0.5 shadow-sm max-w-full">
                <img
                  src={threePoolRenderer.getBallIconDataUrl(activeHint.targetBallId)}
                  alt={`#${activeHint.targetBallId}`}
                  className="w-4 h-4 rounded-full object-contain shrink-0"
                />
                <span className="text-[10px] sm:text-xs font-bold text-emerald-200 truncate hidden md:inline max-w-[170px]">
                  {activeHint.pocketName} ({activeHint.difficultyLabel})
                </span>
                <button
                  type="button"
                  onClick={onApplyHint}
                  title={activeHint.description}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[10px] sm:text-[11px] whitespace-nowrap transition active:scale-95 cursor-pointer ${
                    isHintLocked
                      ? 'bg-emerald-800/80 text-emerald-200 border border-emerald-400/50'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>
                    {isHintLocked
                      ? `Наведен (${Math.round(activeHint.power * 100)}%)`
                      : `Навести ${Math.round(activeHint.power * 100)}%`}
                  </span>
                </button>
                {isHintLocked && onShootHint && (
                  <button
                    type="button"
                    onClick={onShootHint}
                    title="Выполнить точный удар по параметрам подсказки"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] sm:text-[11px] whitespace-nowrap transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    <span>⚡ Ударить</span>
                  </button>
                )}
                {totalHints > 1 && (
                  <button
                    type="button"
                    onClick={onCycleHint}
                    title="Следующий вариант удара"
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>
                      {hintIndex + 1}/{totalHints}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-[10px] sm:text-xs font-bold text-emerald-300 truncate">
                💡 {statusMessage}
              </div>
            )
          ) : (
            <div className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] sm:text-xs font-bold text-amber-300 truncate max-w-[220px] sm:max-w-[340px]">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Right Side: Player 2 / Bot Pod + Quick Action Icons (Hints, Recordings, Spin, New Game) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Player 2 / Bot Pod */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-all ${
              !isP1Active
                ? 'bg-indigo-950/60 border-indigo-500/60 shadow-xs'
                : 'bg-slate-950/50 border-slate-800/70 opacity-75'
            }`}
          >
            <div className="flex flex-col items-end min-w-0">
              <div className="flex items-center gap-1 leading-none">
                {!isP1Active && activePlayerId === 'bot' && turnState === 'aiming' && (
                  <span className="text-[9px] font-bold text-indigo-300 animate-pulse">AI...</span>
                )}
                <span className="text-[11px] font-bold text-white truncate max-w-[75px]">
                  {player2.name}
                </span>
              </div>
              <div className="mt-0.5">{renderBallTray(player2.group, 'stripes')}</div>
            </div>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800 border border-indigo-400/60 flex items-center justify-center text-xs shrink-0">
              {player2.avatar}
            </div>
          </div>

          {/* Hint Mode Toggle Button */}
          <button
            type="button"
            onClick={onToggleHintMode}
            title={`Подсказки лучшего легкого удара: ${hintMode ? 'ВКЛ' : 'ВЫКЛ'}`}
            className={`w-8 h-8 sm:w-auto sm:px-2.5 sm:h-8 rounded-xl border flex items-center justify-center gap-1 text-xs font-bold transition cursor-pointer active:scale-95 ${
              hintMode
                ? 'bg-emerald-950/80 border-emerald-400/70 text-emerald-300'
                : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Lightbulb
              className={`w-4 h-4 ${
                hintMode ? 'text-amber-300 fill-amber-300/30' : 'text-slate-400'
              }`}
            />
            <span className="hidden lg:inline text-[11px]">Подсказки</span>
          </button>

          {/* Dedicated Shot Recordings Screen Button */}
          <button
            type="button"
            onClick={onOpenReplay}
            disabled={recordedShotsCount === 0}
            title="Открыть отдельный экран записей всех ударов (Видеоплеер)"
            className={`relative h-8 px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-1 text-xs font-bold transition cursor-pointer active:scale-95 ${
              recordedShotsCount > 0
                ? 'bg-cyan-950/80 border-cyan-400/70 text-cyan-300 hover:bg-cyan-900/70'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-extrabold">{recordedShotsCount}</span>
            <span className="hidden md:inline text-[11px]">Записи</span>
          </button>

          {/* Cue Ball Spin Selector (Original 8 Ball Pool Mini Cue Ball) */}
          <SpinSelector
            spinX={spinX}
            spinY={spinY}
            onSpinChange={onSpinChange}
            disabled={turnState !== 'aiming' || activePlayerId === 'bot'}
          />

          {/* Quick New Game Button */}
          <button
            type="button"
            onClick={onResetGame}
            title="Новая партия"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-white transition cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Direct Download Updated Offline APK Button (hidden when already running inside native APK) */}
          {typeof window !== 'undefined' &&
            !('AndroidBridge' in (window as unknown as Record<string, unknown>)) && (
              <button
                type="button"
                onClick={downloadReadyApk}
                title="Скачать обновленный автономный .APK (Офлайн)"
                className="h-8 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black flex items-center gap-1 shadow-xs transition cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">.APK</span>
              </button>
            )}
        </div>
      </header>

      {/* Smartphone Settings & Game Mode Modal Drawer */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-md text-slate-100 shadow-2xl flex flex-col gap-3 max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight text-white">
                  <span className="text-emerald-400">8 BALL</span> POOL • МЕНЮ И НАСТРОЙКИ
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Game Mode Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Режим игры
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'vs-bot', label: 'Против Бота' },
                    { id: 'pass-and-play', label: '2 Игрока' },
                    { id: 'practice', label: 'Тренировка' },
                  ] as const
                ).map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onModeChange(m.id);
                      setIsMenuOpen(false);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      gameMode === m.id
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bot Difficulty */}
            {gameMode === 'vs-bot' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Уровень ИИ Бота
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'easy', label: 'Легкий' },
                      { id: 'medium', label: 'Средний' },
                      { id: 'hard', label: 'Мастер' },
                      { id: 'super', label: 'Супер ИИ' },
                    ] as const
                  ).map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onDifficultyChange(d.id)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        botDifficulty === d.id
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Table Felt Theme & Guideline Length */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Цвет сукна
                </span>
                <select
                  value={currentTheme}
                  onChange={e => onThemeChange(e.target.value as TableTheme)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white outline-hidden cursor-pointer"
                >
                  <option value="emerald">Изумрудный (Emerald)</option>
                  <option value="blue">Турнирный синий (Blue)</option>
                  <option value="burgundy">Бордовый (Burgundy)</option>
                  <option value="slate">Графитовый (Slate)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Линия прицела
                </span>
                <select
                  value={guidelineLength}
                  onChange={e =>
                    onGuidelineChange(e.target.value as 'full' | 'medium' | 'short')
                  }
                  className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold text-white outline-hidden cursor-pointer"
                >
                  <option value="full">Длинная (Полная)</option>
                  <option value="medium">Средняя</option>
                  <option value="short">Короткая (Профи)</option>
                </select>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleMute}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
              >
                {isMuted ? (
                  <>
                    <VolumeX className="w-4 h-4 text-rose-400" />
                    <span>Звук: ВЫКЛ</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>Звук: ВКЛ</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenAndroidModal();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-emerald-300 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Управление / APK</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenRules();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                <span>Правила пула</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onResetGame();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Новая игра</span>
              </button>
            </div>

            {typeof window !== 'undefined' &&
              !('AndroidBridge' in (window as unknown as Record<string, unknown>)) && (
                <button
                  type="button"
                  onClick={downloadReadyApk}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>Скачать обновленный 8-Ball-Pool-Master.apk (Офлайн)</span>
                </button>
              )}
          </div>
        </div>
      )}
    </>
  );
};
