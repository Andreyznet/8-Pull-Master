import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Ball,
  BotShotPlan,
  CollisionMarker,
  PlayerHintSuggestion,
  TableThemeConfig,
  TrajectoryData,
  TurnState,
} from '../types/game';
import {
  BALL_RADIUS,
  FOOT_SPOT_X,
  FOOT_SPOT_Y,
  HEAD_STRING_X,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKETS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from '../physics/constants';
import { isValidCuePlacement } from '../physics/engine';
import { threePoolRenderer } from '../utils/threeBallRenderer';
import { tableRenderer } from '../utils/tableRenderer';
import { haptics } from '../utils/haptics';

interface PoolCanvasProps {
  balls: Ball[];
  theme: TableThemeConfig;
  turnState: TurnState;
  aimAngle: number;
  power: number;
  trajectory: TrajectoryData | null;
  guidelineLength: 'full' | 'medium' | 'short';
  isCueBallInHand: boolean;
  behindHeadString: boolean;
  disabledInteraction?: boolean;
  precisionMode?: boolean;
  showZoomLoupe?: boolean;
  onAimChange: (angle: number) => void;
  onCueBallMove: (x: number, y: number) => void;
  onConfirmCuePlacement: () => void;
  isShootingAnim: boolean;
  shootingProgress: number;
  trajectoryTrails?: { id: number; color: string; path: { x: number; y: number }[] }[] | null;
  collisionMarkers?: CollisionMarker[] | null;
  showVectors?: boolean;
  currentReplayFrame?: number;
  replayPreShotSetup?: {
    cueBallX: number;
    cueBallY: number;
    aimAngle: number;
    power: number;
    trajectory: TrajectoryData | null;
  } | null;
  botPlan?: BotShotPlan | null;
  playerHint?: PlayerHintSuggestion | null;
  touchSafeAim?: boolean;
  touchSensitivity?: number;
  onEmptySpaceTap?: () => void;
}

// Wrap angle delta into [-PI, PI]
function normalizeAngleDelta(delta: number): number {
  let d = delta % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const PoolCanvas: React.FC<PoolCanvasProps> = ({
  balls,
  theme,
  turnState,
  aimAngle,
  power,
  trajectory,
  guidelineLength,
  isCueBallInHand,
  behindHeadString,
  disabledInteraction = false,
  precisionMode = false,
  showZoomLoupe = true,
  onAimChange,
  onCueBallMove,
  onConfirmCuePlacement,
  isShootingAnim,
  shootingProgress,
  trajectoryTrails = null,
  collisionMarkers = null,
  showVectors = false,
  currentReplayFrame = 0,
  replayPreShotSetup = null,
  botPlan = null,
  playerHint = null,
  touchSafeAim = true,
  touchSensitivity = 1.0,
  onEmptySpaceTap,
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tableSize, setTableSize] = useState<{ w: number; h: number } | null>(null);
  const isAimDragging = useRef(false);
  const isCueDragging = useRef(false);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const updateFit = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ratio = TABLE_WIDTH / TABLE_HEIGHT;
      let w = Math.min(rect.width, 1080);
      let h = w / ratio;
      if (h > rect.height) {
        h = rect.height;
        w = h * ratio;
      }
      setTableSize({ w: Math.floor(w), h: Math.floor(h) });
    };

    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    window.addEventListener('resize', updateFit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateFit);
    };
  }, []);
  const lastCursorCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownInfo = useRef<{
    time: number;
    x: number;
    y: number;
    moved: boolean;
    pointerType: string;
  }>({ time: 0, x: 0, y: 0, moved: false, pointerType: 'mouse' });
  const aimAngleRef = useRef(aimAngle);
  aimAngleRef.current = aimAngle;

  // Converts canvas mouse/touch/pointer coordinates to internal table coordinates
  const getTableCoordinates = useCallback(
    (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX =
        'touches' in e && e.touches.length > 0
          ? e.touches[0].clientX
          : (e as MouseEvent).clientX;
      const clientY =
        'touches' in e && e.touches.length > 0
          ? e.touches[0].clientY
          : (e as MouseEvent).clientY;

      const scaleX = TABLE_WIDTH / rect.width;
      const scaleY = TABLE_HEIGHT / rect.height;

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabledInteraction || turnState === 'replay') return;

    const coords = getTableCoordinates(e);
    const cueBall = balls.find(b => b.id === 0);

    if (isCueBallInHand) {
      isCueDragging.current = true;
      pointerDownInfo.current = {
        time: performance.now(),
        x: coords.x,
        y: coords.y,
        moved: false,
        pointerType: e.pointerType,
      };
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (isValidCuePlacement(coords.x, coords.y, balls, behindHeadString)) {
        onCueBallMove(coords.x, coords.y);
      }
      return;
    }

    if (turnState !== 'aiming' || !cueBall) return;

    isAimDragging.current = true;
    lastCursorCoords.current = coords;
    pointerDownInfo.current = {
      time: performance.now(),
      x: coords.x,
      y: coords.y,
      moved: false,
      pointerType: e.pointerType,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const isSlowPrecision = precisionMode || e.shiftKey;
    const distFromCue = Math.hypot(coords.x - cueBall.x, coords.y - cueBall.y);
    const isTouchOrSafe = e.pointerType === 'touch' || touchSafeAim;

    // On desktop Direct mode (!isTouchOrSafe), point immediately on click.
    // On Android / Safe Touch mode, wait to see if user is dragging or tapping so finger touch never jerks aim!
    if (!isTouchOrSafe && !isSlowPrecision && distFromCue > BALL_RADIUS * 2.5) {
      const targetAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
      aimAngleRef.current = targetAngle;
      onAimChange(targetAngle);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabledInteraction || turnState === 'replay') return;

    const coords = getTableCoordinates(e);
    const cueBall = balls.find(b => b.id === 0);

    if (isCueBallInHand && isCueDragging.current) {
      if (
        Math.hypot(coords.x - pointerDownInfo.current.x, coords.y - pointerDownInfo.current.y) > 4
      ) {
        pointerDownInfo.current.moved = true;
      }
      if (isValidCuePlacement(coords.x, coords.y, balls, behindHeadString)) {
        onCueBallMove(coords.x, coords.y);
      }
      return;
    }

    if (isAimDragging.current && turnState === 'aiming' && cueBall) {
      const prevCoords = lastCursorCoords.current;
      lastCursorCoords.current = coords;

      if (
        Math.hypot(coords.x - pointerDownInfo.current.x, coords.y - pointerDownInfo.current.y) > 6
      ) {
        pointerDownInfo.current.moved = true;
      }

      const prevAngle = Math.atan2(prevCoords.y - cueBall.y, prevCoords.x - cueBall.x);
      const currAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
      const rawDelta = normalizeAngleDelta(currAngle - prevAngle);

      const distFromCue = Math.hypot(coords.x - cueBall.x, coords.y - cueBall.y);
      // Dampen sensitivity when finger/cursor is close to the cue ball so it never jerks wildly
      const distanceDamping = Math.min(1, Math.max(0.15, distFromCue / 180));
      const isSlowPrecision = precisionMode || e.shiftKey;
      const baseSens = isSlowPrecision ? 0.14 : 1.0;
      const touchMult = e.pointerType === 'touch' ? touchSensitivity : 1.0;

      const nextAngle = aimAngleRef.current + rawDelta * distanceDamping * baseSens * touchMult;
      aimAngleRef.current = nextAngle;
      onAimChange(nextAngle);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getTableCoordinates(e);
    const cueBall = balls.find(b => b.id === 0);

    if (isCueDragging.current) {
      isCueDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      // On mouse release or valid cue placement, confirm if cue ball is in a valid position
      if (cueBall && isValidCuePlacement(cueBall.x, cueBall.y, balls, behindHeadString)) {
        haptics.confirmPlacement();
        onConfirmCuePlacement();
      }
    }

    if (isAimDragging.current) {
      isAimDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      // Quick Tap-to-Aim on Android / Safe Touch Mode:
      // If the user tapped a ball/spot quickly (< 250ms) without dragging (< 6px), point cue there!
      const elapsed = performance.now() - pointerDownInfo.current.time;
      const isTouchOrSafe = e.pointerType === 'touch' || touchSafeAim;
      if (
        isTouchOrSafe &&
        !pointerDownInfo.current.moved &&
        elapsed < 250 &&
        cueBall &&
        turnState === 'aiming' &&
        !precisionMode
      ) {
        const distFromCue = Math.hypot(coords.x - cueBall.x, coords.y - cueBall.y);
        if (distFromCue > BALL_RADIUS * 2.5) {
          const targetAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
          aimAngleRef.current = targetAngle;
          haptics.tick();
          onAimChange(targetAngle);
        }
      }
    }
  };

  // Mouse wheel micro-adjustment directly on the billiard table
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (disabledInteraction || turnState !== 'aiming' || isCueBallInHand) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    const isSlowPrecision = precisionMode || e.shiftKey;
    const step = isSlowPrecision ? 0.0003 : 0.0012;
    const nextAngle = aimAngleRef.current + dir * step;
    aimAngleRef.current = nextAngle;
    onAimChange(nextAngle);
  };

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // ==========================================
    // 1. PHOTOREALISTIC TOURNAMENT TABLE (2X SUPERSAMPLED CACHED CANVAS)
    // ==========================================
    const staticTableCanvas = tableRenderer.getTableCanvas(theme);
    ctx.drawImage(staticTableCanvas, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // ==========================================
    // 2. TARGET POCKET HIGHLIGHT RING (When linear trajectory is aligned to pot)
    // ==========================================
    if (turnState === 'aiming' && trajectory?.willPot && trajectory?.targetPocketId) {
      const targetPocket = POCKETS.find(p => p.id === trajectory.targetPocketId);
      if (targetPocket) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(targetPocket.dropX, targetPocket.dropY, targetPocket.radius - 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ==========================================
    // 3. TRAJECTORY TRAILS (For Physics Analysis & Replay)
    // ==========================================
    if (trajectoryTrails && trajectoryTrails.length > 0) {
      ctx.save();
      for (const trail of trajectoryTrails) {
        if (!trail.path || trail.path.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(trail.path[0].x, trail.path[0].y);
        for (let i = 1; i < trail.path.length; i++) {
          ctx.lineTo(trail.path[i].x, trail.path[i].y);
        }

        ctx.strokeStyle = trail.color || '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = trail.color || '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.85;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(trail.path[0].x, trail.path[0].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        const lastPt = trail.path[trail.path.length - 1];
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = trail.color || '#38bdf8';
        ctx.fill();
      }
      ctx.restore();
    }

    // ==========================================
    // 7. AIMING RETICLE & GUIDELINES (Live Aiming OR Pre-Shot Replay Guide)
    // ==========================================
    const cueBall = balls.find(b => b.id === 0);
    const activeGuideTrajectory =
      turnState === 'replay' && replayPreShotSetup?.trajectory
        ? replayPreShotSetup.trajectory
        : turnState === 'aiming' && cueBall && !isCueBallInHand
        ? trajectory
        : null;
    const guideStartX =
      turnState === 'replay' && replayPreShotSetup ? replayPreShotSetup.cueBallX : cueBall?.x ?? 0;
    const guideStartY =
      turnState === 'replay' && replayPreShotSetup ? replayPreShotSetup.cueBallY : cueBall?.y ?? 0;

    if (activeGuideTrajectory) {
      const objStart =
        activeGuideTrajectory.objectBallStart ?? activeGuideTrajectory.targetBall;

      ctx.save();
      if (turnState === 'replay') {
        ctx.globalAlpha = 0.9;
        // Draw initial cue ball starting circle in replay
        ctx.beginPath();
        ctx.arc(guideStartX, guideStartY, BALL_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        // Draw initial target ball starting circle in replay
        if (objStart) {
          ctx.beginPath();
          ctx.arc(objStart.x, objStart.y, BALL_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Sub-layer faint solid laser core + crisp dashed overlay for precision alignment
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.moveTo(guideStartX, guideStartY);
      ctx.lineTo(activeGuideTrajectory.aimLineEnd.x, activeGuideTrajectory.aimLineEnd.y);
      ctx.stroke();

      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.moveTo(guideStartX, guideStartY);
      ctx.lineTo(activeGuideTrajectory.aimLineEnd.x, activeGuideTrajectory.aimLineEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ghost Cue Ball at contact point
      if (activeGuideTrajectory.ghostBall) {
        const isPotAligned = Boolean(activeGuideTrajectory.willPot);

        ctx.beginPath();
        ctx.arc(
          activeGuideTrajectory.ghostBall.x,
          activeGuideTrajectory.ghostBall.y,
          BALL_RADIUS + 2,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = isPotAligned ? 'rgba(52, 211, 153, 0.65)' : 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(
          activeGuideTrajectory.ghostBall.x,
          activeGuideTrajectory.ghostBall.y,
          BALL_RADIUS,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();

        // Exact contact point on the surface between Ghost Ball and Target Ball
        if (objStart) {
          const contactX = (activeGuideTrajectory.ghostBall.x + objStart.x) * 0.5;
          const contactY = (activeGuideTrajectory.ghostBall.y + objStart.y) * 0.5;

          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(contactX, contactY, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Red laser center point of Ghost Ball
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(
          activeGuideTrajectory.ghostBall.x,
          activeGuideTrajectory.ghostBall.y,
          2.8,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Projected Object Ball Path into pocket or rail
      if (objStart && activeGuideTrajectory.objectBallLineEnd) {
        const lineColor = activeGuideTrajectory.willPot ? '#34d399' : '#38bdf8';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.8;
        if (turnState === 'replay') {
          ctx.setLineDash([6, 4]);
        }
        ctx.beginPath();
        ctx.moveTo(objStart.x, objStart.y);
        ctx.lineTo(
          activeGuideTrajectory.objectBallLineEnd.x,
          activeGuideTrajectory.objectBallLineEnd.y
        );
        ctx.stroke();
        ctx.setLineDash([]);

        const arrDx = activeGuideTrajectory.objectBallLineEnd.x - objStart.x;
        const arrDy = activeGuideTrajectory.objectBallLineEnd.y - objStart.y;
        const arrLen = Math.hypot(arrDx, arrDy);
        if (arrLen > 12) {
          const arrAngle = Math.atan2(arrDy, arrDx);
          const headLen = 9;
          ctx.fillStyle = lineColor;
          ctx.beginPath();
          ctx.moveTo(
            activeGuideTrajectory.objectBallLineEnd.x,
            activeGuideTrajectory.objectBallLineEnd.y
          );
          ctx.lineTo(
            activeGuideTrajectory.objectBallLineEnd.x - headLen * Math.cos(arrAngle - Math.PI / 6),
            activeGuideTrajectory.objectBallLineEnd.y - headLen * Math.sin(arrAngle - Math.PI / 6)
          );
          ctx.lineTo(
            activeGuideTrajectory.objectBallLineEnd.x - headLen * Math.cos(arrAngle + Math.PI / 6),
            activeGuideTrajectory.objectBallLineEnd.y - headLen * Math.sin(arrAngle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }

        // Secondary Object Ball Cushion Rebound Line (if it hits a rail)
        if (activeGuideTrajectory.objectBallBounceLineEnd) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(
            activeGuideTrajectory.objectBallLineEnd.x,
            activeGuideTrajectory.objectBallLineEnd.y
          );
          ctx.lineTo(
            activeGuideTrajectory.objectBallBounceLineEnd.x,
            activeGuideTrajectory.objectBallBounceLineEnd.y
          );
          ctx.stroke();
          ctx.setLineDash([]);

          const bDx =
            activeGuideTrajectory.objectBallBounceLineEnd.x -
            activeGuideTrajectory.objectBallLineEnd.x;
          const bDy =
            activeGuideTrajectory.objectBallBounceLineEnd.y -
            activeGuideTrajectory.objectBallLineEnd.y;
          const bLen = Math.hypot(bDx, bDy);
          if (bLen > 12) {
            const bAngle = Math.atan2(bDy, bDx);
            const headLen = 7.5;
            ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
            ctx.beginPath();
            ctx.moveTo(
              activeGuideTrajectory.objectBallBounceLineEnd.x,
              activeGuideTrajectory.objectBallBounceLineEnd.y
            );
            ctx.lineTo(
              activeGuideTrajectory.objectBallBounceLineEnd.x -
                headLen * Math.cos(bAngle - Math.PI / 6),
              activeGuideTrajectory.objectBallBounceLineEnd.y -
                headLen * Math.sin(bAngle - Math.PI / 6)
            );
            ctx.lineTo(
              activeGuideTrajectory.objectBallBounceLineEnd.x -
                headLen * Math.cos(bAngle + Math.PI / 6),
              activeGuideTrajectory.objectBallBounceLineEnd.y -
                headLen * Math.sin(bAngle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Cue Ball Tangent Deflection Line
      if (activeGuideTrajectory.ghostBall && activeGuideTrajectory.cueDeflectionLineEnd) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(activeGuideTrajectory.ghostBall.x, activeGuideTrajectory.ghostBall.y);
        ctx.lineTo(
          activeGuideTrajectory.cueDeflectionLineEnd.x,
          activeGuideTrajectory.cueDeflectionLineEnd.y
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Cushion Bounce Reflection Line
      if (activeGuideTrajectory.cushionBounceLineEnd && activeGuideTrajectory.hitPoint) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(activeGuideTrajectory.hitPoint.x, activeGuideTrajectory.hitPoint.y);
        ctx.lineTo(
          activeGuideTrajectory.cushionBounceLineEnd.x,
          activeGuideTrajectory.cushionBounceLineEnd.y
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    // ==========================================
    // 7B. SUPER AI 2-PLY POSITION PLAY TACTICAL OVERLAY
    // ==========================================
    if (turnState === 'aiming' && botPlan) {
      ctx.save();

      // 1. Draw simulated Cue Ball Position Path (with spin & rail rebounds)
      if (botPlan.cueBallPath && botPlan.cueBallPath.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(botPlan.cueBallPath[0].x, botPlan.cueBallPath[0].y);
        for (let i = 1; i < botPlan.cueBallPath.length; i++) {
          ctx.lineTo(botPlan.cueBallPath[i].x, botPlan.cueBallPath[i].y);
        }
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)'; // Electric purple cue position curve
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 4]);
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
      }

      // 2. Draw Planned Cue Ball Stop Reticle (Position Zone)
      const stopX = botPlan.plannedCueStop.x;
      const stopY = botPlan.plannedCueStop.y;

      ctx.beginPath();
      ctx.arc(stopX, stopY, BALL_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(stopX, stopY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.24)';
      ctx.fill();
      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Center crosshair dot at planned cue ball stop
      ctx.beginPath();
      ctx.arc(stopX, stopY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f0abfc';
      ctx.fill();

      // 3. Draw 2nd-Ply Next Shot Lookahead (Planned Cue Stop -> Next Ghost Ball -> Next Target Ball -> Next Pocket)
      if (botPlan.nextTargetBallId !== null && botPlan.nextGhostBall) {
        const nextBall = balls.find(b => b.id === botPlan.nextTargetBallId && !b.inPocket);
        const nextPocket = POCKETS.find(p => p.id === botPlan.nextTargetPocketId);

        if (nextBall) {
          const nextBallX = botPlan.nextBallPos ? botPlan.nextBallPos.x : nextBall.x;
          const nextBallY = botPlan.nextBallPos ? botPlan.nextBallPos.y : nextBall.y;

          // Line from Planned Cue Stop to Next Ghost Ball
          ctx.beginPath();
          ctx.moveTo(stopX, stopY);
          ctx.lineTo(botPlan.nextGhostBall.x, botPlan.nextGhostBall.y);
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.88)'; // Gold tactical next-shot line
          ctx.lineWidth = 2.0;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Next Ghost Ball ring
          ctx.beginPath();
          ctx.arc(botPlan.nextGhostBall.x, botPlan.nextGhostBall.y, BALL_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Highlight ring around Next Target Ball (B2)
          ctx.beginPath();
          ctx.arc(nextBallX, nextBallY, BALL_RADIUS + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Line from Next Target Ball (B2) into Next Pocket (P2)
          if (nextPocket) {
            ctx.beginPath();
            ctx.moveTo(nextBallX, nextBallY);
            ctx.lineTo(nextPocket.dropX, nextPocket.dropY);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
            ctx.lineWidth = 2.4;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Tag above Next Target Ball
            const tagText = `NEXT #${nextBall.id}`;
            ctx.font = 'bold 10px Inter, system-ui, sans-serif';
            const tagW = ctx.measureText(tagText).width + 10;
            const tagX = nextBallX - tagW / 2;
            const tagY = Math.max(PLAY_TOP + 6, nextBallY - BALL_RADIUS - 22);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(tagX, tagY, tagW, 16, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fde047';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tagText, nextBall.x, tagY + 8);
          }
        }
      }

      ctx.restore();
    }

    // ==========================================
    // 7C. PLAYER HINT EASY-SHOT TACTICAL OVERLAY
    // ==========================================
    if (turnState === 'aiming' && playerHint && !botPlan && cueBall && !cueBall.inPocket) {
      ctx.save();

      // 1. Recommended Cue Ball -> First Contact Ghost Ball Path (supports straight & Kick/Абриколь shots)
      ctx.beginPath();
      if (playerHint.cuePathToFirstHit && playerHint.cuePathToFirstHit.length >= 2) {
        ctx.moveTo(playerHint.cuePathToFirstHit[0].x, playerHint.cuePathToFirstHit[0].y);
        for (let i = 1; i < playerHint.cuePathToFirstHit.length; i++) {
          ctx.lineTo(playerHint.cuePathToFirstHit[i].x, playerHint.cuePathToFirstHit[i].y);
        }
      } else {
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(playerHint.ghostBall.x, playerHint.ghostBall.y);
      }
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([7, 5]);
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // 2. Hint Ghost Ball impact target circle
      ctx.beginPath();
      ctx.arc(playerHint.ghostBall.x, playerHint.ghostBall.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2B. If Combination Shot (firstHitBallId !== targetBallId), draw First-Hit Ball Ring & Transfer Line
      if (
        playerHint.shotType === 'combo' &&
        playerHint.firstHitBallPos &&
        playerHint.firstHitBallId &&
        playerHint.firstHitBallId !== playerHint.targetBallId
      ) {
        const fPos = playerHint.firstHitBallPos;
        const tPos = playerHint.targetBallPos;

        // Ring around 1st ball hit
        ctx.beginPath();
        ctx.arc(fPos.x, fPos.y, BALL_RADIUS + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Transfer path from 1st ball to Target Ball
        ctx.beginPath();
        ctx.moveTo(fPos.x, fPos.y);
        ctx.lineTo(tPos.x, tPos.y);
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.92)';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Mini tag on 1st ball
        const step1Text = `1️⃣ В #${playerHint.firstHitBallId}`;
        ctx.font = 'bold 9.5px Inter, system-ui, sans-serif';
        const s1W = ctx.measureText(step1Text).width + 10;
        const s1X = Math.max(PLAY_LEFT + 4, Math.min(PLAY_RIGHT - s1W - 4, fPos.x - s1W / 2));
        const s1Y = Math.max(PLAY_TOP + 6, fPos.y - BALL_RADIUS - 22);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(s1X, s1Y, s1W, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(step1Text, s1X + s1W / 2, s1Y + 8);
      }

      // 3. Recommended Object Ball -> Pocket Path (supports direct & Bank/Дуплет cushion rebounds)
      const tPos = playerHint.targetBallPos;
      const pPos = playerHint.pocketDropPos;
      if (playerHint.shotType !== 'safety') {
        ctx.beginPath();
        if (playerHint.targetBallPath && playerHint.targetBallPath.length >= 2) {
          ctx.moveTo(playerHint.targetBallPath[0].x, playerHint.targetBallPath[0].y);
          for (let i = 1; i < playerHint.targetBallPath.length; i++) {
            ctx.lineTo(playerHint.targetBallPath[i].x, playerHint.targetBallPath[i].y);
          }
        } else {
          ctx.moveTo(tPos.x, tPos.y);
          ctx.lineTo(pPos.x, pPos.y);
        }
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
        ctx.lineWidth = 3.0;
        ctx.setLineDash([6, 4]);
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Target Pocket highlight ring
        ctx.beginPath();
        ctx.arc(pPos.x, pPos.y, BALL_RADIUS * 1.45, 0, Math.PI * 2);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Highlight Ring around Recommended Target Ball
      ctx.beginPath();
      ctx.arc(tPos.x, tPos.y, BALL_RADIUS + 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Simulated Cue Ball Post-Impact Path & Stop Position
      if (playerHint.cueBallPath && playerHint.cueBallPath.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(playerHint.cueBallPath[0].x, playerHint.cueBallPath[0].y);
        for (let i = 1; i < playerHint.cueBallPath.length; i++) {
          ctx.lineTo(playerHint.cueBallPath[i].x, playerHint.cueBallPath[i].y);
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(
          playerHint.plannedCueStop.x,
          playerHint.plannedCueStop.y,
          BALL_RADIUS * 0.85,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Badge above Recommended Target Ball
      const badgeText =
        playerHint.badgeText ||
        `💡 ${playerHint.difficultyLabel.toUpperCase()} #${playerHint.targetBallId} (${playerHint.easeScore}%)`;
      ctx.font = 'bold 10.5px Inter, system-ui, sans-serif';
      const badgeW = ctx.measureText(badgeText).width + 12;
      const badgeX = Math.max(PLAY_LEFT + 4, Math.min(PLAY_RIGHT - badgeW - 4, tPos.x - badgeW / 2));
      const badgeY = Math.max(PLAY_TOP + 6, tPos.y - BALL_RADIUS - 24);

      ctx.fillStyle = 'rgba(6, 78, 59, 0.94)';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, 18, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ecfdf5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 9);

      ctx.restore();
    }

    // ==========================================
    // 8. HIGH-FIDELITY THREE.JS 3D SPHERICAL BALLS
    // ==========================================
    // 8A. Soft multi-layered cloth contact & directional drop shadows under each ball
    for (const b of balls) {
      if (b.inPocket) continue;
      const currentRadius = b.pocketAnim ? BALL_RADIUS * b.pocketAnim.scale : BALL_RADIUS;
      const dropProg = b.pocketAnim?.progress ?? 0;
      // Floor shadow fades out rapidly once the ball leaves the slate shelf into the pocket hole
      const shadowAlpha = b.pocketAnim ? Math.max(0, 1.0 - dropProg * 2.5) : 1.0;
      if (shadowAlpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = shadowAlpha;

      // Soft directional cast shadow away from overhead table light
      const shadowGrad = ctx.createRadialGradient(
        b.x + 2.4,
        b.y + 3.2,
        currentRadius * 0.2,
        b.x + 2.4,
        b.y + 3.2,
        currentRadius * 1.18
      );
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
      shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.26)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(b.x + 2.4, b.y + 3.2, currentRadius * 1.18, 0, Math.PI * 2);
      ctx.fill();

      // Deep ambient occlusion contact core directly beneath sphere bottom
      ctx.beginPath();
      ctx.arc(b.x + 0.6, b.y + 1.0, currentRadius * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fill();

      ctx.restore();
    }

    // 8B. Render real 3D spheres with equirectangular textures & quaternion rotation via Three.js WebGL
    const webglBallsCanvas = threePoolRenderer.renderBalls(balls, theme.feltColor);
    ctx.drawImage(webglBallsCanvas, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // 8C. Crisp studio overhead phenolic lacquer reflection & pocket well shadow engulfment pass
    for (const b of balls) {
      if (b.inPocket) continue;
      const currentRadius = b.pocketAnim ? BALL_RADIUS * b.pocketAnim.scale : BALL_RADIUS;
      const alpha = b.pocketAnim ? b.pocketAnim.alpha : 1.0;
      const dropProg = b.pocketAnim?.progress ?? 0;

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(b.x, b.y, currentRadius, 0, Math.PI * 2);
      ctx.clip();

      // Spherical limb darkening around outer edge for deep 3D curvature
      const limbGrad = ctx.createRadialGradient(
        b.x - currentRadius * 0.18,
        b.y - currentRadius * 0.18,
        currentRadius * 0.45,
        b.x,
        b.y,
        currentRadius
      );
      limbGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      limbGrad.addColorStop(0.76, 'rgba(0, 0, 0, 0.08)');
      limbGrad.addColorStop(1, 'rgba(2, 6, 23, 0.42)');
      ctx.fillStyle = limbGrad;
      ctx.fillRect(b.x - currentRadius, b.y - currentRadius, currentRadius * 2, currentRadius * 2);

      // Studio overhead lamp specular reflection (fades out as ball drops below the pocket rim shadow)
      const specFade = Math.max(0, 1.0 - dropProg * 1.8);
      if (specFade > 0.01) {
        const specGrad = ctx.createRadialGradient(
          b.x - currentRadius * 0.34,
          b.y - currentRadius * 0.34,
          0.5,
          b.x - currentRadius * 0.32,
          b.y - currentRadius * 0.32,
          currentRadius * 0.48
        );
        specGrad.addColorStop(0, `rgba(255, 255, 255, ${0.78 * specFade})`);
        specGrad.addColorStop(0.28, `rgba(255, 255, 255, ${0.22 * specFade})`);
        specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pocket rim cast shadow across the ball as it plunges down into the dark pocket chute
      if (dropProg > 0) {
        ctx.fillStyle = `rgba(2, 4, 10, ${Math.min(0.88, Math.pow(dropProg, 1.1) * 0.9)})`;
        ctx.fillRect(b.x - currentRadius, b.y - currentRadius, currentRadius * 2, currentRadius * 2);
      }

      ctx.restore();
    }

    // ==========================================
    // 8B. REPLAY VELOCITY VECTORS & COLLISION MARKERS
    // ==========================================
    if (turnState === 'replay' && showVectors) {
      ctx.save();

      if (collisionMarkers && collisionMarkers.length > 0) {
        for (const marker of collisionMarkers) {
          if (marker.frame > currentReplayFrame + 2) continue;

          const age = Math.max(0, currentReplayFrame - marker.frame);
          const isRecent = age <= 8;
          const baseColor =
            marker.type === 'ball'
              ? '#fbbf24'
              : marker.type === 'cushion'
              ? '#f43f5e'
              : '#10b981';

          ctx.save();
          ctx.beginPath();
          const radius = isRecent ? 6 + (8 - age) * 1.1 : 5;
          ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = isRecent ? 2.5 : 1.5;
          ctx.globalAlpha = isRecent ? 0.95 : 0.55;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(marker.x, marker.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = baseColor;
          ctx.fill();
          ctx.restore();
        }
      }

      for (const b of balls) {
        if (b.inPocket || b.pocketAnim) continue;
        const speed = Math.hypot(b.vx, b.vy);
        if (speed < 0.08) continue;

        const vecLen = Math.min(90, 14 + speed * 4.2);
        const angle = Math.atan2(b.vy, b.vx);
        const endX = b.x + Math.cos(angle) * vecLen;
        const endY = b.y + Math.sin(angle) * vecLen;

        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        const headLen = 7;
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }

    // ==========================================
    // 9. BALL IN HAND PLACEMENT RETICLE
    // ==========================================
    if (isCueBallInHand && cueBall) {
      ctx.save();
      const isValid = isValidCuePlacement(cueBall.x, cueBall.y, balls, behindHeadString);

      ctx.strokeStyle = isValid ? '#10b981' : '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cueBall.x, cueBall.y, BALL_RADIUS + 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)';
      ctx.fill();

      ctx.font = 'bold 12px Outfit, sans-serif';
      ctx.fillStyle = isValid ? '#34d399' : '#f87171';
      ctx.textAlign = 'center';
      ctx.fillText(
        isValid ? 'Drop to place' : 'Cannot place here',
        cueBall.x,
        cueBall.y - BALL_RADIUS - 14
      );

      ctx.restore();
    }

    // ==========================================
    // 10. REALISTIC 8 BALL POOL CUE STICK (Live Aiming OR Pre-Shot Reference in Replay)
    // ==========================================
    const shouldDrawLiveCue =
      (turnState === 'aiming' || isShootingAnim) && cueBall && !isCueBallInHand;
    const shouldDrawReplayCue = turnState === 'replay' && replayPreShotSetup !== null;

    if (shouldDrawLiveCue || shouldDrawReplayCue) {
      const cueOriginX =
        shouldDrawReplayCue && replayPreShotSetup
          ? replayPreShotSetup.cueBallX
          : cueBall?.x ?? 0;
      const cueOriginY =
        shouldDrawReplayCue && replayPreShotSetup
          ? replayPreShotSetup.cueBallY
          : cueBall?.y ?? 0;
      const cueAngle =
        shouldDrawReplayCue && replayPreShotSetup ? replayPreShotSetup.aimAngle : aimAngle;
      const cuePower =
        shouldDrawReplayCue && replayPreShotSetup ? replayPreShotSetup.power : power;

      const cueAlpha = shouldDrawReplayCue
        ? currentReplayFrame <= 3
          ? 0.92
          : 0.48
        : 1.0;

      let pullback = BALL_RADIUS + 12 + cuePower * 65;
      if (isShootingAnim) {
        pullback =
          BALL_RADIUS + 12 + (1 - shootingProgress) * (cuePower * 65) - shootingProgress * 15;
      } else if (shouldDrawReplayCue && currentReplayFrame > 0) {
        // Show cue at contact point after strike in replay
        pullback = BALL_RADIUS + 4;
      }

      threePoolRenderer.drawTexturedCueStick(
        ctx,
        cueOriginX,
        cueOriginY,
        cueAngle,
        pullback,
        cueAlpha
      );
    }

    // ==========================================
    // 11. PRECISION CONTACT MAGNIFIER LOUPE (2.8x ZOOM PiP)
    // ==========================================
    if (
      showZoomLoupe &&
      turnState === 'aiming' &&
      !isCueBallInHand &&
      !disabledInteraction &&
      trajectory?.targetBall &&
      trajectory?.ghostBall &&
      cueBall
    ) {
      const tb = trajectory.targetBall;
      const gb = trajectory.ghostBall;
      const focusX = (tb.x + gb.x) * 0.5;
      const focusY = (tb.y + gb.y) * 0.5;

      // Pick the corner furthest from the target ball so the loupe never blocks the shot
      const loupeRadius = 58;
      const loupeCenterX = focusX < TABLE_WIDTH / 2 ? TABLE_WIDTH - 130 : 130;
      const loupeCenterY = focusY < TABLE_HEIGHT / 2 ? TABLE_HEIGHT - 120 : 120;
      const zoom = 2.6;

      ctx.save();

      // Drop shadow behind loupe ring
      ctx.beginPath();
      ctx.arc(loupeCenterX, loupeCenterY, loupeRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Clip to circular lens
      ctx.beginPath();
      ctx.arc(loupeCenterX, loupeCenterY, loupeRadius, 0, Math.PI * 2);
      ctx.clip();

      // Lens felt background
      ctx.fillStyle = theme.feltColor;
      ctx.fillRect(
        loupeCenterX - loupeRadius,
        loupeCenterY - loupeRadius,
        loupeRadius * 2,
        loupeRadius * 2
      );

      // Fine optical reticle grid inside lens
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let offset = -40; offset <= 40; offset += 20) {
        ctx.beginPath();
        ctx.moveTo(loupeCenterX - loupeRadius, loupeCenterY + offset);
        ctx.lineTo(loupeCenterX + loupeRadius, loupeCenterY + offset);
        ctx.moveTo(loupeCenterX + offset, loupeCenterY - loupeRadius);
        ctx.lineTo(loupeCenterX + offset, loupeCenterY + loupeRadius);
        ctx.stroke();
      }

      // Transform into 2.6x magnified coordinates centered at (focusX, focusY)
      ctx.save();
      ctx.translate(loupeCenterX, loupeCenterY);
      ctx.scale(zoom, zoom);
      ctx.translate(-focusX, -focusY);

      // Draw Target Ball in zoomed space directly from supersampled 3D WebGL canvas
      const dpr = webglBallsCanvas.width / TABLE_WIDTH;
      const cropPad = BALL_RADIUS + 4;
      ctx.drawImage(
        webglBallsCanvas,
        (tb.x - cropPad) * dpr,
        (tb.y - cropPad) * dpr,
        cropPad * 2 * dpr,
        cropPad * 2 * dpr,
        tb.x - cropPad,
        tb.y - cropPad,
        cropPad * 2,
        cropPad * 2
      );

      // Incoming Cue Ball Aim Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(gb.x - Math.cos(aimAngle) * 35, gb.y - Math.sin(aimAngle) * 35);
      ctx.lineTo(gb.x, gb.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Object Ball Departure Line
      if (trajectory.objectBallLineEnd) {
        ctx.strokeStyle = trajectory.willPot ? '#34d399' : '#38bdf8';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tb.x, tb.y);
        ctx.lineTo(trajectory.objectBallLineEnd.x, trajectory.objectBallLineEnd.y);
        ctx.stroke();
      }

      // Cue Deflection Line
      if (trajectory.cueDeflectionLineEnd) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(gb.x, gb.y);
        ctx.lineTo(trajectory.cueDeflectionLineEnd.x, trajectory.cueDeflectionLineEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ghost Cue Ball in zoomed space
      ctx.beginPath();
      ctx.arc(gb.x, gb.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([2.5, 2.5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Exact Contact Point Crosshair
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(focusX, focusY, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Ghost Ball Center Laser Dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(gb.x, gb.y, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // exit zoom transform

      // Bottom HUD Pill inside Loupe
      ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
      ctx.fillRect(
        loupeCenterX - loupeRadius,
        loupeCenterY + loupeRadius - 22,
        loupeRadius * 2,
        22
      );

      const cutText =
        trajectory.cutAngleDeg !== null && trajectory.cutAngleDeg !== undefined
          ? `CUT ${Math.abs(trajectory.cutAngleDeg).toFixed(1)}°`
          : 'AIM';
      ctx.font = 'bold 10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = trajectory.willPot ? '#34d399' : '#38bdf8';
      ctx.fillText(
        trajectory.willPot ? `${cutText} • POCKET` : cutText,
        loupeCenterX,
        loupeCenterY + loupeRadius - 8
      );

      ctx.restore(); // exit clip

      // Outer Metallic Ring of Loupe
      ctx.save();
      ctx.beginPath();
      ctx.arc(loupeCenterX, loupeCenterY, loupeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = trajectory.willPot ? '#34d399' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [
    balls,
    theme,
    turnState,
    aimAngle,
    power,
    trajectory,
    guidelineLength,
    isCueBallInHand,
    behindHeadString,
    disabledInteraction,
    showZoomLoupe,
    isShootingAnim,
    shootingProgress,
    trajectoryTrails,
    collisionMarkers,
    showVectors,
    currentReplayFrame,
    replayPreShotSetup,
    botPlan,
    playerHint,
  ]);

  return (
    <div
      ref={outerRef}
      onClick={e => {
        if (e.target === e.currentTarget && onEmptySpaceTap) {
          onEmptySpaceTap();
        }
      }}
      className="relative w-full h-full min-w-0 min-h-0 flex items-center justify-center overflow-hidden"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={
          tableSize
            ? { width: `${tableSize.w}px`, height: `${tableSize.h}px` }
            : { width: '100%', aspectRatio: '1000 / 540' }
        }
        className="relative rounded-xl sm:rounded-2xl shadow-[0_18px_45px_-12px_rgba(0,0,0,0.95)] border border-slate-800/90 overflow-hidden bg-slate-950 flex items-center justify-center ring-1 ring-white/10 shrink-0"
      >
        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          className={`w-full h-full block touch-none select-none ${
            disabledInteraction || turnState === 'replay' ? 'cursor-default' : 'cursor-crosshair'
          }`}
        />

        {/* Touch Ball-in-Hand Confirmation Pill */}
        {isCueBallInHand && !disabledInteraction && turnState !== 'replay' && (
          <button
            type="button"
            onClick={() => {
              haptics.confirmPlacement();
              onConfirmCuePlacement();
            }}
            className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full bg-emerald-600/95 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg border border-emerald-400/50 backdrop-blur-xs cursor-pointer active:scale-95 transition"
          >
            ✓ Поставить биток здесь
          </button>
        )}
      </div>
    </div>
  );
};
