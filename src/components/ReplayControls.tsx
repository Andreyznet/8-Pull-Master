import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  ArrowLeft,
  Activity,
  Compass,
  Undo2,
  Crosshair,
  Film,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ListVideo,
} from 'lucide-react';
import { RecordedShot } from '../types/game';
import { threePoolRenderer } from '../utils/threeBallRenderer';

interface ReplayControlsProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  playbackSpeed: number;
  showAimGuide: boolean;
  showTrails: boolean;
  showVectors: boolean;
  recordedShots: RecordedShot[];
  selectedShotId: number | null;
  controlsVisible: boolean;
  onSetControlsVisible: (visible: boolean) => void;
  onSelectShot: (shotId: number) => void;
  onTogglePlay: () => void;
  onSeek: (frame: number) => void;
  onStep: (delta: number) => void;
  onSpeedChange: (speed: number) => void;
  onToggleAimGuide: () => void;
  onToggleTrails: () => void;
  onToggleVectors: () => void;
  onRetryShot: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  currentFrame,
  totalFrames,
  isPlaying,
  playbackSpeed,
  showAimGuide,
  showTrails,
  showVectors,
  recordedShots,
  selectedShotId,
  controlsVisible,
  onSetControlsVisible,
  onSelectShot,
  onTogglePlay,
  onSeek,
  onStep,
  onSpeedChange,
  onToggleAimGuide,
  onToggleTrails,
  onToggleVectors,
  onRetryShot,
  onRestart,
  onExit,
}) => {
  const [shotListOpen, setShotListOpen] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide video player controls after 2.8 seconds when playing (resets on any panel interaction)
  const resetAutoHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (controlsVisible && isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        onSetControlsVisible(false);
      }, 2800);
    }
  }, [controlsVisible, isPlaying, onSetControlsVisible]);

  useEffect(() => {
    resetAutoHideTimer();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetAutoHideTimer]);

  const speeds = [0.1, 0.25, 0.5, 1.0];
  const safeFrame = Math.max(0, Math.min(Math.max(0, totalFrames - 1), currentFrame));
  const currentTimeSec = (safeFrame / 60).toFixed(2);
  const totalTimeSec = (Math.max(1, totalFrames) / 60).toFixed(2);

  const selectedIndex = recordedShots.findIndex(s => s.id === selectedShotId);
  const activeShot =
    selectedIndex >= 0
      ? recordedShots[selectedIndex]
      : recordedShots[recordedShots.length - 1] ?? null;

  const hasPrevShot = selectedIndex > 0;
  const hasNextShot = selectedIndex >= 0 && selectedIndex < recordedShots.length - 1;

  // When hidden, render nothing (100% clean screen; tapping empty space around the table restores the player!)
  if (!controlsVisible) {
    return null;
  }

  return (
    <>
      {/* TOP VIDEO PLAYER OVERLAY BAR */}
      <div
        onPointerDown={e => {
          e.stopPropagation();
          resetAutoHideTimer();
        }}
        onPointerMove={resetAutoHideTimer}
        onClick={e => e.stopPropagation()}
        className="fixed top-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90 px-2.5 py-1.5 flex flex-col gap-1.5 shadow-xl animate-in fade-in duration-150"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back to Game + Active Shot Info */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold shrink-0 cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span>В игру</span>
            </button>

            <div className="flex items-center gap-1.5 min-w-0">
              <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0 hidden sm:inline" />
              <span className="text-xs font-extrabold text-white truncate">
                {activeShot
                  ? `Удар #${activeShot.shotNumber} • ${activeShot.playerName} (${activeShot.summary})`
                  : 'Запись удара'}
              </span>
            </div>

            {/* Prev / Next Shot Quick Switcher */}
            {recordedShots.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={!hasPrevShot}
                  onClick={() => {
                    if (hasPrevShot) onSelectShot(recordedShots[selectedIndex - 1].id);
                  }}
                  title="Предыдущий удар"
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!hasNextShot}
                  onClick={() => {
                    if (hasNextShot) onSelectShot(recordedShots[selectedIndex + 1].id);
                  }}
                  title="Следующий удар"
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Shot List Toggle, Telemetry Overlays, Retry & Hide UI */}
          <div className="flex items-center gap-1 shrink-0">
            {recordedShots.length > 0 && (
              <button
                type="button"
                onClick={() => setShotListOpen(prev => !prev)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  shotListOpen
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <ListVideo className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Все удары</span>
                <span>({recordedShots.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleAimGuide}
              title="Показать линию прицела перед ударом"
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                showAimGuide
                  ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span className="hidden sm:inline">Прицел</span>
            </button>

            <button
              type="button"
              onClick={onToggleTrails}
              title="Показать треки движения шаров"
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                showTrails
                  ? 'bg-cyan-500/20 border-cyan-400/70 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span className="hidden sm:inline">Треки</span>
            </button>

            <button
              type="button"
              onClick={onToggleVectors}
              title="Показать точки соударений"
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                showVectors
                  ? 'bg-amber-500/20 border-amber-400/70 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Compass className="w-3 h-3" />
              <span className="hidden sm:inline">Векторы</span>
            </button>

            <button
              type="button"
              onClick={onRetryShot}
              title="Перебить этот удар с исходной позиции"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              <span className="hidden sm:inline">Перебить</span>
            </button>

            {/* Hide Video Player Controls Button */}
            <button
              type="button"
              onClick={() => onSetControlsVisible(false)}
              title="Скрыть панель (тапните вне стола, чтобы скрыть/показать)"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Скрыть</span>
            </button>
          </div>
        </div>

        {/* Collapsible Horizontal Shot Strip */}
        {shotListOpen && recordedShots.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
            {recordedShots.map(shot => {
              const isSelected = activeShot?.id === shot.id;
              return (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => onSelectShot(shot.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left transition shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/25 border-cyan-400 text-white shadow-xs'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`text-[10px] font-black px-1 py-0.2 rounded ${
                      isSelected ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{shot.shotNumber}
                  </span>
                  <span className="text-[11px] font-bold text-slate-200 truncate max-w-[75px]">
                    {shot.playerName}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 rounded-full ${
                      shot.isFoul
                        ? 'bg-rose-500/20 text-rose-300'
                        : shot.pocketedBallIds.length > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {shot.summary}
                  </span>
                  {shot.pocketedBallIds.length > 0 ? (
                    <div className="flex items-center -space-x-1">
                      {shot.pocketedBallIds.slice(0, 2).map(bId => (
                        <img
                          key={bId}
                          src={threePoolRenderer.getBallIconDataUrl(bId)}
                          alt={`#${bId}`}
                          className="w-3.5 h-3.5 rounded-full object-contain"
                        />
                      ))}
                    </div>
                  ) : shot.firstBallHitId ? (
                    <img
                      src={threePoolRenderer.getBallIconDataUrl(shot.firstBallHitId)}
                      alt={`#${shot.firstBallHitId}`}
                      className="w-3.5 h-3.5 rounded-full object-contain opacity-65"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM VIDEO PLAYER TRANSPORT OVERLAY BAR */}
      <div
        onPointerDown={e => {
          e.stopPropagation();
          resetAutoHideTimer();
        }}
        onPointerMove={resetAutoHideTimer}
        onClick={e => e.stopPropagation()}
        className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/90 px-3 py-1.5 flex flex-col gap-1.5 shadow-2xl animate-in fade-in duration-150"
      >
        {/* Video Scrubber Row */}
        <div className="flex items-center gap-2.5 w-full">
          <span className="text-[10px] font-mono tabular-nums text-cyan-300 font-bold shrink-0">
            {currentTimeSec}s
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalFrames - 1)}
            value={safeFrame}
            onChange={e => onSeek(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-hidden"
          />
          <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
            {totalTimeSec}s ({safeFrame}/{Math.max(0, totalFrames - 1)})
          </span>
        </div>

        {/* Transport & Speed Controls Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRestart}
              title="В начало"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onStep(-1)}
              title="Кадр назад"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex items-center gap-1 px-3.5 py-1 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-sm cursor-pointer active:scale-95"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Пауза</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Пуск</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              title="Кадр вперед"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <span className="hidden sm:inline text-[10px] text-slate-500 ml-2">
              Тап вне стола — скрыть/показать плеер
            </span>
          </div>

          {/* Playback Speed Selector */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            {speeds.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums transition cursor-pointer ${
                  playbackSpeed === s
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
