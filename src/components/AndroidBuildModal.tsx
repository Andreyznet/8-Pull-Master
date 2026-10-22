import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  Sliders,
  Maximize2,
  Vibrate,
  Check,
  Copy,
  X,
  ArrowLeftRight,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { haptics } from '../utils/haptics';

export interface AndroidControlSettings {
  swapSides: boolean; // false = Power on Right / Fine Aim on Left; true = Power on Left / Fine Aim on Right
  touchSafeAim: boolean; // true = drag rotates smoothly without jumping on touch-down, quick tap aims at ball
  touchSensitivity: number; // 0.5 to 1.8
  hapticsEnabled: boolean;
}

interface AndroidBuildModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AndroidControlSettings;
  onUpdateSettings: (next: AndroidControlSettings) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * Generates a crisp 512x512 3D 8-Ball PNG icon directly in browser memory via HTML5 Canvas
 * and triggers an instant local file download (`8ball-icon-512x512.png`) with zero server dependency.
 */
export function download512PngIcon() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Emerald tournament felt background
  const bgGrad = ctx.createRadialGradient(size * 0.5, size * 0.45, 20, size * 0.5, size * 0.5, size * 0.72);
  bgGrad.addColorStop(0, '#10b981');
  bgGrad.addColorStop(0.55, '#047857');
  bgGrad.addColorStop(1, '#022c22');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle gold border frame
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, size - 36, size - 36);

  // 2. Drop shadow under 8-ball
  const cx = size * 0.5;
  const cy = size * 0.52;
  const r = size * 0.36;

  const shadowGrad = ctx.createRadialGradient(cx + 10, cy + 22, r * 0.2, cx + 10, cy + 22, r * 1.15);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.65)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(cx + 10, cy + 22, r * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // 3. Glossy 3D Black 8-Ball sphere
  const ballGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r);
  ballGrad.addColorStop(0, '#475569');
  ballGrad.addColorStop(0.25, '#1e293b');
  ballGrad.addColorStop(0.7, '#090d16');
  ballGrad.addColorStop(1, '#020617');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 4. White number circle badge
  const badgeX = cx - r * 0.12;
  const badgeY = cy - r * 0.1;
  const badgeR = r * 0.44;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fill();

  // 5. Bold "8" numeral
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 118px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('8', badgeX, badgeY + 6);

  // 6. Specular studio highlight
  const specGrad = ctx.createLinearGradient(cx - r * 0.5, cy - r * 0.75, cx, cy - r * 0.15);
  specGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
  specGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.22, cy - r * 0.48, r * 0.38, r * 0.2, -0.35, 0, Math.PI * 2);
  ctx.fill();

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = '8ball-icon-512x512.png';
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Triggers a direct browser download of the full project source code ZIP archive
 */
export async function downloadFullProjectZip() {
  try {
    const res = await fetch('/8-ball-pool-full-project.zip');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '8-ball-pool-full-project.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    const link = document.createElement('a');
    link.href = '/8-ball-pool-full-project.zip';
    link.download = '8-ball-pool-full-project.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Triggers a direct browser download of the compiled & signed `8-Ball-Pool-Master.apk`
 */
export async function downloadReadyApk() {
  try {
    const res = await fetch('/8-Ball-Pool-Master.apk');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '8-Ball-Pool-Master.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    const link = document.createElement('a');
    link.href = '/8-Ball-Pool-Master.apk';
    link.download = '8-Ball-Pool-Master.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const PWAInstallButton: React.FC<{
  onOpenAndroidModal: () => void;
}> = ({ onOpenAndroidModal }) => {
  const isInsideNativeApk =
    typeof window !== 'undefined' && 'AndroidBridge' in (window as unknown as Record<string, unknown>);

  return (
    <div className="flex items-center gap-1.5">
      {!isInsideNativeApk && (
        <button
          type="button"
          onClick={downloadReadyApk}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md transition cursor-pointer whitespace-nowrap"
          title="Скачать автономный офлайн-файл 8-Ball-Pool-Master.apk (не требует интернета)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Скачать .APK (Офлайн)</span>
        </button>
      )}

      <button
        type="button"
        onClick={onOpenAndroidModal}
        className="flex items-center gap-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-emerald-500/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:text-white transition cursor-pointer whitespace-nowrap"
        title="Android Touch Controls & APK Build Settings"
      >
        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
        <span>Android</span>
      </button>
    </div>
  );
};

export const AndroidBuildModal: React.FC<AndroidBuildModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'controls' | 'build'>('controls');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(id);
    haptics.tick();
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const capacitorCommands = `# 1. Установка Capacitor Android и сборка веб-бандла dist/
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build:android

# 2. Инициализация Android-проекта (capacitor.config.ts уже настроен)
npx cap add android
npx cap sync android

# 3. Сборка готового APK (через Gradle или Android Studio)
cd android && ./gradlew assembleDebug
# Готовый файл: android/app/build/outputs/apk/debug/app-debug.apk`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 select-none">
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                Android Touch &amp; APK Build Center
              </h2>
              <p className="text-[11px] text-slate-400">
                Настройка сенсорного управления 8 Ball Pool и сборка под Android
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1.5 bg-slate-950/50 border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'controls'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Управление Android</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('build')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'build'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Билд APK / WebAPK</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
          {activeTab === 'controls' ? (
            <>
              {/* 1. Fullscreen & Landscape Lock */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Полноэкранный альбомный режим (Landscape)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Скрывает системные панели браузера и фиксирует горизонтальную ориентацию экрана
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className={`px-3.5 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer shrink-0 ${
                    isFullscreen
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isFullscreen ? 'Выйти из Fullscreen' : 'Включить Fullscreen'}
                </button>
              </div>

              {/* 2. Left/Right Handedness Swap */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Расположение слайдера силы кия</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {settings.swapSides
                      ? 'Левша: Кий (Сила) слева • Колесо точной доводки справа'
                      : 'Правша: Колесо точной доводки слева • Кий (Сила) справа'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptics.tick();
                    onUpdateSettings({ ...settings, swapSides: !settings.swapSides });
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold whitespace-nowrap transition cursor-pointer shrink-0"
                >
                  {settings.swapSides ? 'Кий слева (Левша)' : 'Кий справа (Правша)'}
                </button>
              </div>

              {/* 3. Safe Touch Drag vs Instant Point */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div className="font-bold text-white">
                    Защита от сбивания прицела при касании (Safe Touch Aim)
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Как в оригинальном 8 Ball Pool: свайп пальцем плавно вращает кий без резкого прыжка в точку касания, а быстрый тап по шару сразу наводит на него
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptics.tick();
                    onUpdateSettings({ ...settings, touchSafeAim: !settings.touchSafeAim });
                  }}
                  className={`px-3.5 py-2 rounded-lg font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    settings.touchSafeAim
                      ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-400'
                  }`}
                >
                  {settings.touchSafeAim ? 'Включено ✓' : 'Выкл'}
                </button>
              </div>

              {/* 4. Touch Aim Sensitivity */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    Чувствительность вращения кия пальцем
                  </span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {Math.round(settings.touchSensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.8"
                  step="0.1"
                  value={settings.touchSensitivity}
                  onChange={e =>
                    onUpdateSettings({
                      ...settings,
                      touchSensitivity: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Точнее (40%)</span>
                  <span>Стандарт (100%)</span>
                  <span>Быстрее (180%)</span>
                </div>
              </div>

              {/* 5. Android Haptic Vibration */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Vibrate className="w-3.5 h-3.5 text-amber-400" />
                    <span>Тактильная вибрация Android (Haptics)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Щелчки при прокрутке микрометра, натяжении кия и ударе по битку
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = haptics.toggle();
                    onUpdateSettings({ ...settings, hapticsEnabled: next });
                  }}
                  className={`px-3.5 py-2 rounded-lg font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    settings.hapticsEnabled
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-400'
                  }`}
                >
                  {settings.hapticsEnabled ? 'Активна ✓' : 'Выкл'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Build Status Readiness Card */}
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Android Build &amp; WebAPK Ready (dist/ собран)</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400">
                    com.proarena.eightballpool
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Проект полностью упакован для Android: настроены <strong>VitePWA Service Worker</strong> (офлайн-режим), манифест с фиксацией <strong>landscape + fullscreen</strong>, иконки 192px/512px/maskable и конфигурация <strong>capacitor.config.ts</strong>.
                </p>

                {/* Direct 1-Click Ready APK Download & 512x512 Icon Download */}
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadReadyApk}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать готовый 8-Ball-Pool-Master.apk</span>
                  </button>

                  <button
                    type="button"
                    onClick={downloadFullProjectZip}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать весь проект (.ZIP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={download512PngIcon}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать иконку 512×512 (.PNG)</span>
                  </button>

                  {!isInstalled && isInstallable ? (
                    <button
                      type="button"
                      onClick={install}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Установить на Android в 1 клик (WebAPK)</span>
                    </button>
                  ) : isInstalled ? (
                    <div className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Приложение уже установлено на устройство</span>
                    </div>
                  ) : isIOS ? (
                    <div className="text-amber-300 text-[11px]">
                      На iOS: нажмите «Поделиться» в Safari → «На экран Домой».
                    </div>
                  ) : (
                    <div className="text-slate-300 text-[11px]">
                      В Chrome на Android: откройте меню браузера <strong>⋮</strong> → <strong>«Установить приложение»</strong>.
                    </div>
                  )}
                </div>
              </div>

              {/* Native APK / AAB Build via Capacitor */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>Сборка нативного .APK / .AAB через Capacitor</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCommand(capacitorCommands, 'cap')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
                  >
                    {copiedCmd === 'cap' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Копировать команды</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                  {capacitorCommands}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Для отмены удара на Android: верните слайдер кия вверх до 0% не отпуская палец
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
