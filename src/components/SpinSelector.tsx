import React, { useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface SpinSelectorProps {
  spinX: number;
  spinY: number;
  onSpinChange: (spinX: number, spinY: number) => void;
  disabled?: boolean;
}

export const SpinSelector: React.FC<SpinSelectorProps> = ({
  spinX,
  spinY,
  onSpinChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ballRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const radius = 56; // 112px diameter for easy smartphone finger control

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDragging.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    updateSpinFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return;
    updateSpinFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      soundManager.playChalk();
    }
  };

  const updateSpinFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ballRef.current) return;
    const rect = ballRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = (e.clientX - cx) / radius;
    let dy = (e.clientY - cy) / radius;

    const dist = Math.hypot(dx, dy);
    if (dist > 0.85) {
      dx = (dx / dist) * 0.85;
      dy = (dy / dist) * 0.85;
    }

    onSpinChange(Number(dx.toFixed(2)), Number((-dy).toFixed(2)));
  };

  const resetSpin = () => {
    if (disabled) return;
    onSpinChange(0, 0);
    soundManager.playChalk();
  };

  const dotPxX = spinX * radius;
  const dotPxY = -spinY * radius;

  const hasSpin = Math.abs(spinX) > 0.05 || Math.abs(spinY) > 0.05;

  let spinLabel = 'По центру (Без винта)';
  if (spinY > 0.25) spinLabel = 'Накат (Topspin)';
  else if (spinY < -0.25) spinLabel = 'Оттяжка (Backspin)';
  if (spinX > 0.25) spinLabel += (spinLabel.startsWith('По центру') ? '' : ' + ') + 'Правый винт';
  else if (spinX < -0.25) spinLabel += (spinLabel.startsWith('По центру') ? '' : ' + ') + 'Левый винт';

  return (
    <>
      {/* Original 8 Ball Pool Cue Ball Spin Icon Button in Top HUD */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        title="Винт / вращение битка (Точка удара кием)"
        className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-md border ${
          hasSpin
            ? 'border-amber-400 ring-2 ring-amber-400/30'
            : 'border-slate-500 hover:border-white'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{
          background:
            'radial-gradient(circle at 35% 30%, #ffffff 0%, #e2e8f0 50%, #94a3b8 90%, #64748b 100%)',
        }}
      >
        {/* Crosshair lines on mini cue ball */}
        <div className="absolute inset-x-1 top-1/2 h-[0.5px] bg-slate-400/50 pointer-events-none" />
        <div className="absolute inset-y-1 left-1/2 w-[0.5px] bg-slate-400/50 pointer-events-none" />
        {/* Red impact spot */}
        <div
          className="w-2 h-2 rounded-full bg-red-600 ring-1 ring-white shadow-xs pointer-events-none"
          style={{
            transform: `translate(${spinX * 9}px, ${-spinY * 9}px)`,
          }}
        />
      </button>

      {/* Centered Smartphone-Friendly 3D Cue Ball Spin Modal (Like Original 8 Ball Pool) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl w-64 text-slate-100 flex flex-col items-center gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                Винт / Вращение битка
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={resetSpin}
                  title="Сбросить по центру"
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Large Interactive 3D Cue Ball */}
            <div
              ref={ballRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative w-28 h-28 rounded-full cursor-crosshair touch-none select-none shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.45),0_12px_24px_rgba(0,0,0,0.65)] border-2 border-slate-300/40 flex items-center justify-center"
              style={{
                background:
                  'radial-gradient(circle at 35% 30%, #ffffff 0%, #f1f5f9 42%, #94a3b8 82%, #475569 100%)',
              }}
            >
              <div className="absolute inset-x-2 top-1/2 h-px bg-slate-500/30 pointer-events-none" />
              <div className="absolute inset-y-2 left-1/2 w-px bg-slate-500/30 pointer-events-none" />
              <div className="absolute w-16 h-16 rounded-full border border-dashed border-slate-400/40 pointer-events-none" />

              {/* Red Cue Tip Contact Spot */}
              <div
                className="absolute w-5 h-5 rounded-full bg-radial from-red-400 to-red-600 shadow-lg ring-2 ring-white pointer-events-none"
                style={{
                  transform: `translate(${dotPxX}px, ${dotPxY}px)`,
                }}
              />
            </div>

            <div className="text-center">
              <div className="text-xs font-bold text-amber-300">{spinLabel}</div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-1.5 text-xs font-extrabold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition cursor-pointer"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </>
  );
};
