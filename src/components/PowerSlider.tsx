import React, { useRef, useState, useEffect, useCallback } from 'react';
import { soundManager } from '../utils/audio';
import { haptics } from '../utils/haptics';

interface PowerSliderProps {
  power: number; // 0 to 1
  onPowerChange: (power: number) => void;
  onShoot: (power: number) => void;
  disabled?: boolean;
  recommendedPower?: number | null;
  isHintLocked?: boolean;
}

export const PowerSlider: React.FC<PowerSliderProps> = ({
  power,
  onPowerChange,
  onShoot,
  disabled = false,
  recommendedPower = null,
  isHintLocked = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPower, setDragPower] = useState(0);
  const currentPowerRef = useRef(0);
  const lastNotchRef = useRef(0);

  useEffect(() => {
    if (!isDragging) {
      setDragPower(0);
      currentPowerRef.current = 0;
    }
  }, [isDragging]);

  const updatePowerFromPointer = useCallback(
    (clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const clampedY = Math.max(0, Math.min(rect.height, relativeY));
      const calculatedPower = clampedY / rect.height;
      let cleanPower = Number(calculatedPower.toFixed(2));

      // When user pressed "Навести" (isHintLocked) and pulls past cancel zone,
      // magnetically snap within ±18% of recommendedPower or cap to exact verified hint power
      if (
        isHintLocked &&
        recommendedPower !== null &&
        cleanPower >= 0.08 &&
        Math.abs(cleanPower - recommendedPower) <= 0.18
      ) {
        cleanPower = recommendedPower;
      }

      const notch = Math.floor(cleanPower * 12);
      if (notch !== lastNotchRef.current) {
        lastNotchRef.current = notch;
        haptics.tick();
      }

      currentPowerRef.current = cleanPower;
      setDragPower(cleanPower);
      onPowerChange(cleanPower);
    },
    [isHintLocked, onPowerChange, recommendedPower]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    updatePowerFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    updatePowerFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rawReleasePower = currentPowerRef.current;
    setDragPower(0);
    currentPowerRef.current = 0;

    if (rawReleasePower >= 0.06) {
      // If user clicked "Навести" (isHintLocked), use the exact physics-verified hint power
      // so human thumb release variance never causes the hinted shot to miss!
      const finalShotPower =
        isHintLocked && recommendedPower !== null ? recommendedPower : rawReleasePower;
      onPowerChange(finalShotPower);
      haptics.strike(finalShotPower);
      soundManager.playCueHit(finalShotPower);
      onShoot(finalShotPower);
    } else {
      // Returned to top (< 6%) -> Cancel shot just like original 8 Ball Pool
      onPowerChange(recommendedPower ?? 0.4);
    }
  };

  const activePull = isDragging ? dragPower : 0;
  const effectiveDisplayPower =
    isHintLocked && recommendedPower !== null && (!isDragging || dragPower >= 0.06)
      ? recommendedPower
      : isDragging
      ? dragPower
      : power;
  const displayPercent = Math.round(effectiveDisplayPower * 100);
  const isCancelZone = isDragging && dragPower < 0.06;

  return (
    <div className="flex flex-col items-center justify-center select-none touch-none h-full py-0.5">
      {/* Top Status Label */}
      <div className="mb-1 text-[9px] font-extrabold uppercase tracking-wider text-center leading-none">
        {isCancelZone ? (
          <span className="text-rose-400">Отмена</span>
        ) : isHintLocked && recommendedPower !== null ? (
          <span className="text-emerald-300 font-mono">🎯 {Math.round(recommendedPower * 100)}%</span>
        ) : isDragging ? (
          <span className="text-amber-300 font-mono">{displayPercent}%</span>
        ) : (
          <span className="text-slate-400">Сила</span>
        )}
      </div>

      {/* Original 8 Ball Pool Vertical Cue Stick Chamber */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false);
          setDragPower(0);
          currentPowerRef.current = 0;
        }}
        className={`relative w-11 sm:w-12 h-[clamp(145px,58dvh,275px)] rounded-2xl bg-slate-900/95 border-2 p-1 flex flex-col items-center shadow-2xl overflow-hidden touch-none transition-colors ${
          disabled
            ? 'opacity-35 border-slate-800 cursor-not-allowed'
            : isDragging
            ? isCancelZone
              ? 'border-slate-500 ring-2 ring-slate-400/20 cursor-ns-resize'
              : 'border-amber-400 ring-2 ring-amber-400/30 cursor-ns-resize'
            : isHintLocked
            ? 'border-emerald-400/90 ring-1 ring-emerald-400/30 cursor-ns-resize'
            : 'border-slate-700/90 hover:border-emerald-500/60 cursor-ns-resize'
        }`}
        title="Потяните кий вниз для удара (верните вверх для отмены)"
      >
        {/* Background Color-Coded Power Chamber (Green -> Yellow -> Orange -> Red) */}
        <div className="absolute inset-1.5 rounded-xl bg-slate-950 overflow-hidden shadow-inner">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                'linear-gradient(to bottom, #10b981 0%, #eab308 45%, #f97316 75%, #ef4444 100%)',
            }}
          />

          {/* Active Pull Fill */}
          <div
            className="w-full origin-top transition-transform duration-75"
            style={{
              height: `${activePull * 100}%`,
              background:
                'linear-gradient(to bottom, rgba(16,185,129,0.75) 0%, rgba(234,179,8,0.85) 45%, rgba(249,115,22,0.9) 75%, rgba(239,68,68,0.95) 100%)',
              boxShadow: activePull > 0.06 ? '0 0 14px rgba(249, 115, 22, 0.65)' : 'none',
            }}
          />
        </div>

        {/* Left & Right Graduated Notches */}
        <div className="absolute inset-y-3 left-1.5 w-1.5 flex flex-col justify-between pointer-events-none z-10">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`h-[1.5px] rounded-full ${
                i % 3 === 0 ? 'w-2 bg-white/70' : 'w-1 bg-white/35'
              }`}
            />
          ))}
        </div>
        <div className="absolute inset-y-3 right-1.5 w-1.5 flex flex-col justify-between items-end pointer-events-none z-10">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`h-[1.5px] rounded-full ${
                i % 3 === 0 ? 'w-2 bg-white/70' : 'w-1 bg-white/35'
              }`}
            />
          ))}
        </div>

        {/* Recommended Power Marker Line (when Hint Mode is active) */}
        {recommendedPower !== null && recommendedPower > 0 && !disabled && (
          <div
            className="absolute inset-x-1 z-20 flex items-center justify-between pointer-events-none"
            style={{ top: `${Math.min(94, Math.max(6, recommendedPower * 100))}%` }}
          >
            <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_6px_#10b981]" />
          </div>
        )}

        {/* Original 8 Ball Pool Sliding Wooden Cue Stick Graphic */}
        <div
          className="relative z-10 w-3.5 sm:w-4 h-full pointer-events-none flex flex-col items-center"
          style={{
            transform: `translateY(${activePull * 78}%)`,
            transition: isDragging
              ? 'none'
              : 'transform 130ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div className="w-2.5 h-1.5 rounded-t-sm bg-sky-400 border-b border-sky-600 shrink-0 shadow-xs" />
          <div className="w-2.5 h-2 bg-slate-100 border-b border-amber-500 shrink-0" />
          <div
            className="w-3 h-20 shrink-0 border-x border-amber-900/50"
            style={{
              background:
                'linear-gradient(90deg, #b45309 0%, #fde68a 38%, #f59e0b 72%, #78350f 100%)',
            }}
          />
          <div className="w-3.5 h-2 bg-linear-to-r from-amber-600 via-yellow-300 to-amber-700 border-y border-amber-950 shrink-0" />
          <div
            className="w-3.5 flex-1 rounded-b-md border border-slate-950 shadow-md"
            style={{
              background:
                'repeating-linear-gradient(180deg, #0f172a 0px, #0f172a 8px, #d97706 8px, #fbbf24 10px, #1e293b 10px, #1e293b 18px)',
            }}
          />
        </div>

        {/* Down-Arrow Prompt when idle */}
        {!isDragging && !disabled && (
          <div className="absolute bottom-2 inset-x-0 z-20 flex flex-col items-center pointer-events-none animate-bounce">
            <span className="text-[9px] font-black text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              ▼
            </span>
          </div>
        )}
      </div>

      {/* Quick 1-Tap Strike Button (uses exact recommendedPower when hint is locked) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          const p =
            isHintLocked && recommendedPower !== null
              ? recommendedPower
              : Math.max(0.1, power);
          haptics.strike(p);
          soundManager.playCueHit(p);
          onShoot(p);
        }}
        title={`Быстрый удар с точной силой (${Math.round(effectiveDisplayPower * 100)}%)`}
        className={`mt-1 px-1.5 py-0.5 rounded-md disabled:opacity-30 text-[9px] font-black uppercase tracking-tight text-white shadow-xs transition active:scale-95 cursor-pointer disabled:cursor-not-allowed ${
          isHintLocked
            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-1 ring-emerald-300'
            : 'bg-emerald-600/90 hover:bg-emerald-500'
        }`}
      >
        Удар {Math.round(effectiveDisplayPower * 100)}%
      </button>
    </div>
  );
};
