import React, { useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ZoomIn } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface FineTuneDialProps {
  onAdjustAngle: (delta: number) => void;
  disabled?: boolean;
  cutAngleDeg?: number | null;
  willPot?: boolean;
  precisionMode?: boolean;
  onTogglePrecisionMode?: () => void;
  showZoomLoupe?: boolean;
  onToggleZoomLoupe?: () => void;
}

export const FineTuneDial: React.FC<FineTuneDialProps> = ({
  onAdjustAngle,
  disabled = false,
  cutAngleDeg = null,
  willPot = false,
  showZoomLoupe = true,
  onToggleZoomLoupe,
}) => {
  const intervalRef = useRef<number | null>(null);
  const isWheelDragging = useRef(false);
  const lastPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const accumTickPx = useRef(0);
  const [wheelOffset, setWheelOffset] = useState(0);

  const startAdjusting = (delta: number) => {
    if (disabled) return;
    haptics.tick();
    onAdjustAngle(delta);
    setWheelOffset(prev => (prev + (delta > 0 ? 5 : -5)) % 24);
    intervalRef.current = window.setInterval(() => {
      haptics.tick();
      onAdjustAngle(delta);
      setWheelOffset(prev => (prev + (delta > 0 ? 4 : -4)) % 24);
    }, 65);
  };

  const stopAdjusting = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Authentic 8 Ball Pool Fine-Tune Ruler Wheel Drag
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    isWheelDragging.current = true;
    accumTickPx.current = 0;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isWheelDragging.current || disabled) return;
    const dy = e.clientY - lastPointerPos.current.y;
    const dx = e.clientX - lastPointerPos.current.x;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    const deltaPx = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    // Ultra-fine smooth micrometer sensitivity (like 8 Ball Pool fine-tune ruler)
    const sensitivity = 0.00042;
    onAdjustAngle(deltaPx * sensitivity);
    setWheelOffset(prev => (prev + deltaPx * 0.65) % 24);

    accumTickPx.current += Math.abs(deltaPx);
    if (accumTickPx.current >= 7) {
      accumTickPx.current = 0;
      haptics.tick();
    }
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isWheelDragging.current) {
      isWheelDragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    const step = 0.0006;
    haptics.tick();
    onAdjustAngle(dir * step);
    setWheelOffset(prev => (prev + dir * 5) % 24);
  };

  const formattedCut =
    cutAngleDeg !== null && cutAngleDeg !== undefined
      ? `${Math.abs(cutAngleDeg).toFixed(0)}°`
      : 'Прицел';

  return (
    <div className="flex flex-col items-center justify-center select-none touch-none h-full py-0.5">
      {/* Top Cut Angle / Aim Indicator */}
      <div
        className={`mb-1 text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded leading-none ${
          willPot
            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
            : 'text-cyan-400'
        }`}
        title="Угол резки (зеленый = шар идет в лузу)"
      >
        {formattedCut}
      </div>

      {/* Main 8 Ball Pool Fine-Tune Ruler Container */}
      <div className="flex flex-col items-center bg-slate-900/95 border-2 border-slate-700/90 rounded-2xl p-1 shadow-2xl">
        {/* Micro-Nudge Counter-Clockwise (-) */}
        <button
          type="button"
          disabled={disabled}
          onPointerDown={() => startAdjusting(-0.00045)}
          onPointerUp={stopAdjusting}
          onPointerLeave={stopAdjusting}
          onPointerCancel={stopAdjusting}
          title="Микро-поворот против часовой (-0.02°)"
          className="w-9 h-6 flex items-center justify-center rounded-t-xl bg-slate-800/90 hover:bg-slate-700 active:bg-cyan-500/30 text-cyan-300 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Scrollable Vertical Micrometer Ruler Wheel */}
        <div
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerUp={handleWheelPointerUp}
          onPointerCancel={handleWheelPointerUp}
          onWheel={handleWheelScroll}
          title="Крутите колесо вверх/вниз для плавной микро-доводки прицела"
          className={`relative w-9 sm:w-10 h-[clamp(100px,42dvh,205px)] bg-slate-950 border-y border-slate-800 overflow-hidden flex items-center justify-center shadow-inner touch-none ${
            disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-ns-resize'
          }`}
        >
          {/* Graduated Ruler Tick Marks */}
          <div className="absolute inset-0 flex flex-col items-center justify-around pointer-events-none">
            {Array.from({ length: 15 }).map((_, idx) => {
              const isMajor = idx % 3 === 0;
              return (
                <div
                  key={idx}
                  style={{
                    transform: `translateY(${((wheelOffset + idx * 2) % 14) - 7}px)`,
                  }}
                  className={`rounded-full ${
                    isMajor
                      ? 'w-6 h-[2px] bg-cyan-400/90 shadow-[0_0_4px_rgba(34,211,238,0.6)]'
                      : 'w-3.5 h-[1.5px] bg-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Center Amber Hairline Indicator */}
          <div className="relative z-10 w-full h-0.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)] pointer-events-none" />

          {/* Top & Bottom 3D Cylinder Shading */}
          <div className="absolute inset-0 bg-linear-to-b from-slate-950/90 via-transparent to-slate-950/90 pointer-events-none" />
        </div>

        {/* Micro-Nudge Clockwise (+) */}
        <button
          type="button"
          disabled={disabled}
          onPointerDown={() => startAdjusting(0.00045)}
          onPointerUp={stopAdjusting}
          onPointerLeave={stopAdjusting}
          onPointerCancel={stopAdjusting}
          title="Микро-поворот по часовой (+0.02°)"
          className="w-9 h-6 flex items-center justify-center rounded-b-xl bg-slate-800/90 hover:bg-slate-700 active:bg-cyan-500/30 text-cyan-300 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* 1-Tap Zoom Loupe Toggle */}
      {onToggleZoomLoupe && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            haptics.tick();
            onToggleZoomLoupe();
          }}
          title="Увеличительная лупа точки удара (ВКЛ/ВЫКЛ)"
          className={`mt-1 px-2 py-0.5 rounded-md border text-[9px] font-bold flex items-center gap-1 transition cursor-pointer ${
            showZoomLoupe
              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <ZoomIn className="w-3 h-3" />
          <span>Лупа</span>
        </button>
      )}
    </div>
  );
};
