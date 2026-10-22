import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Ball,
  BallGroup,
  BotDifficulty,
  BotShotPlan,
  CollisionMarker,
  GameMode,
  Player,
  PlayerHintSuggestion,
  RecordedShot,
  ReplayFrame,
  ShotResult,
  TableTheme,
  TrajectoryData,
  TurnState,
} from './types/game';
import {
  BALL_COLORS,
  HEAD_STRING_X,
  TABLE_HEIGHT,
  TABLE_THEMES,
} from './physics/constants';
import {
  areAllBallsStopped,
  createRackedBalls,
  findValidBallPlacement,
  updatePhysics,
} from './physics/engine';
import { calculateTrajectory } from './physics/trajectory';
import {
  calculateBotShot,
  calculatePlayerHints,
  findBestBotCuePlacement,
} from './bot/botAI';
import { soundManager } from './utils/audio';
import { PoolCanvas } from './components/PoolCanvas';
import { GameHUD } from './components/GameHUD';
import { PowerSlider } from './components/PowerSlider';
import { FineTuneDial } from './components/FineTuneDial';
import { ReplayControls } from './components/ReplayControls';
import { VictoryModal, RulesModal } from './components/Modals';
import {
  AndroidBuildModal,
  AndroidControlSettings,
} from './components/AndroidBuildModal';

// Helper to deep clone ball objects for replay snapshots
const cloneBalls = (list: Ball[]): Ball[] =>
  list.map(b => ({
    ...b,
    pocketAnim: b.pocketAnim ? { ...b.pocketAnim } : null,
  }));

export default function App() {
  // Game Setup & Players
  const [gameMode, setGameMode] = useState<GameMode>('vs-bot');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('super');
  const [botPlan, setBotPlan] = useState<BotShotPlan | null>(null);
  const [theme, setTheme] = useState<TableTheme>('emerald');
  const [guidelineLength, setGuidelineLength] = useState<'full' | 'medium' | 'short'>('full');
  const [isMuted, setIsMuted] = useState(soundManager.getMuted());

  const [p1, setP1] = useState<Player>({
    id: 'p1',
    name: 'Player 1',
    avatar: '🎱',
    group: null,
    score: 0,
  });

  const [p2, setP2] = useState<Player>({
    id: 'bot',
    name: 'AI Pro',
    avatar: '🤖',
    group: null,
    score: 0,
    isBot: true,
  });

  const [activePlayerId, setActivePlayerId] = useState<'p1' | 'p2' | 'bot'>('p1');
  const [turnState, setTurnState] = useState<TurnState>('aiming');
  const [turnTimer, setTurnTimer] = useState(30);
  const [statusMessage, setStatusMessage] = useState('Break shot! Pull down power to break');

  // Table & Ball state
  const [balls, setBalls] = useState<Ball[]>(() => createRackedBalls());
  const ballsRef = useRef<Ball[]>(balls);
  ballsRef.current = balls;

  // Aiming & Controls
  const [aimAngle, setAimAngle] = useState(0); // in radians
  const [power, setPower] = useState(0.4);
  const [spinX, setSpinX] = useState(0);
  const [spinY, setSpinY] = useState(0);
  const [precisionMode, setPrecisionMode] = useState(false);
  const [showZoomLoupe, setShowZoomLoupe] = useState(true);
  const [hintMode, setHintMode] = useState(true);
  const [hintIndex, setHintIndex] = useState(0);

  // Ball in Hand & Fouls
  const [isCueBallInHand, setIsCueBallInHand] = useState(false);
  const [behindHeadString, setBehindHeadString] = useState(false);

  // Animation states
  const [isShootingAnim, setIsShootingAnim] = useState(false);
  const [shootingProgress, setShootingProgress] = useState(0);
  const strikeAnimRef = useRef<number | null>(null);
  const botLastPlanRef = useRef<BotShotPlan | null>(null);

  // Shot tracking
  const currentShotRef = useRef<ShotResult>({
    firstBallHit: null,
    ballsPocketed: [],
    cuePocketed: false,
    eightPocketed: false,
    cushionsHitAfterBallHit: 0,
    collisions: [],
  });

  // Replay System & All Recorded Shots Archive
  const [recordedShots, setRecordedShots] = useState<RecordedShot[]>([]);
  const recordedShotsRef = useRef<RecordedShot[]>([]);
  recordedShotsRef.current = recordedShots;
  const [selectedReplayShotId, setSelectedReplayShotId] = useState<number | null>(null);

  const [lastShotReplay, setLastShotReplay] = useState<ReplayFrame[] | null>(null);
  const [lastShotCollisions, setLastShotCollisions] = useState<CollisionMarker[]>([]);
  const [lastShotPaths, setLastShotPaths] = useState<Record<number, { x: number; y: number }[]> | null>(null);
  const [lastShotSetup, setLastShotSetup] = useState<{
    cueBallX: number;
    cueBallY: number;
    aimAngle: number;
    power: number;
    trajectory: TrajectoryData | null;
  } | null>(null);
  const currentShotSetupRef = useRef<{
    cueBallX: number;
    cueBallY: number;
    aimAngle: number;
    power: number;
    trajectory: TrajectoryData | null;
  } | null>(null);
  const [replayFrameIndex, setReplayFrameIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(0.25); // default quarter-speed slow-mo
  const [showReplayAimGuide, setShowReplayAimGuide] = useState(true);
  const [showTrajectoryTrails, setShowTrajectoryTrails] = useState(true);
  const [showReplayVectors, setShowReplayVectors] = useState(true);
  const [replayControlsVisible, setReplayControlsVisible] = useState(true);

  const currentReplayBufferRef = useRef<ReplayFrame[]>([]);
  const savedGameStateRef = useRef<{
    balls: Ball[];
    turnState: TurnState;
    statusMessage: string;
    activePlayerId: 'p1' | 'p2' | 'bot';
    isCueBallInHand: boolean;
  } | null>(null);

  const preShotStateRef = useRef<{
    balls: Ball[];
    activePlayerId: 'p1' | 'p2' | 'bot';
    p1: Player;
    p2: Player;
    aimAngle: number;
    power: number;
    spinX: number;
    spinY: number;
  } | null>(null);

  // Modals & Android Touch Settings
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [androidSettings, setAndroidSettings] = useState<AndroidControlSettings>({
    swapSides: false,
    touchSafeAim: true,
    touchSensitivity: 1.0,
    hapticsEnabled: true,
  });
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState('');

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const scr = window.screen as unknown as {
          orientation?: { lock?: (o: string) => Promise<void> };
        };
        if (scr.orientation?.lock) {
          await scr.orientation.lock('landscape').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by parent iframe
    }
  }, []);

  // Synchronize player 2 based on game mode
  useEffect(() => {
    if (gameMode === 'vs-bot') {
      setP2(prev => ({
        ...prev,
        id: 'bot',
        name:
          botDifficulty === 'super'
            ? 'Super AI 🧠'
            : botDifficulty === 'hard'
            ? 'AI Master'
            : botDifficulty === 'medium'
            ? 'AI Pro'
            : 'AI Casual',
        avatar: '🤖',
        isBot: true,
      }));
    } else if (gameMode === 'pass-and-play') {
      setP2(prev => ({
        ...prev,
        id: 'p2',
        name: 'Player 2',
        avatar: '🎯',
        isBot: false,
      }));
    } else {
      setP2(prev => ({
        ...prev,
        id: 'p2',
        name: 'Practice Mode',
        avatar: '⛳',
        isBot: false,
      }));
    }
  }, [gameMode, botDifficulty]);

  // Switch turns between players
  const handleTurnSwitch = useCallback(
    (foul: boolean = false, customMsg?: string) => {
      setTurnTimer(30);
      setBehindHeadString(false);
      setBotPlan(null);
      botLastPlanRef.current = null;
      setSpinX(0);
      setSpinY(0);

      const isCurrentP1 = activePlayerId === 'p1';
      let nextPlayerId: 'p1' | 'p2' | 'bot' = 'p1';

      if (gameMode === 'vs-bot') {
        nextPlayerId = isCurrentP1 ? 'bot' : 'p1';
      } else if (gameMode === 'pass-and-play') {
        nextPlayerId = isCurrentP1 ? 'p2' : 'p1';
      } else {
        nextPlayerId = 'p1';
      }

      setActivePlayerId(nextPlayerId);
      const nextName = nextPlayerId === 'p1' ? p1.name : p2.name;

      if (foul) {
        if (nextPlayerId === 'bot') {
          // Bot strategically places cue ball for optimal 2-ply position play
          const validPos = findBestBotCuePlacement(ballsRef.current, p2.group, botDifficulty);
          const cue = ballsRef.current.find(b => b.id === 0);
          if (cue) {
            cue.inPocket = false;
            cue.pocketAnim = null;
            cue.x = validPos.x;
            cue.y = validPos.y;
            cue.vx = 0;
            cue.vy = 0;
            setBalls([...ballsRef.current]);
          }
          setIsCueBallInHand(false);
          setTurnState('aiming');
          setStatusMessage(customMsg || `Foul! ${nextName} placed Ball in Hand strategically`);
        } else {
          setIsCueBallInHand(true);
          setTurnState('ball-in-hand');
          setStatusMessage(
            customMsg || `${nextName} has Ball in Hand! Drag or click to place cue ball`
          );
        }
      } else {
        setIsCueBallInHand(false);
        setTurnState('aiming');
        setStatusMessage(customMsg || `${nextName}'s turn to shoot`);
      }
    },
    [activePlayerId, botDifficulty, gameMode, p1.name, p2.group, p2.name]
  );

  // Turn timer interval
  useEffect(() => {
    if (gameMode === 'practice' || turnState !== 'aiming' || winner) return;

    const timer = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          soundManager.playFoul();
          handleTurnSwitch(true, 'Time expired! Opponent receives Ball in Hand');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [turnState, gameMode, winner, activePlayerId, handleTurnSwitch]);

  // Compute trajectory trails from exact substep collision vertices & recorded replay frames
  const computedTrails = useMemo(() => {
    if (!lastShotReplay || lastShotReplay.length < 2) return null;
    const trails: { id: number; color: string; path: { x: number; y: number }[] }[] = [];
    const firstFrame = lastShotReplay[0];
    if (!firstFrame || !firstFrame.balls) return null;

    for (let bId = 0; bId <= 15; bId++) {
      const startBall = firstFrame.balls.find(b => b.id === bId);
      const startX = startBall?.x ?? 0;
      const startY = startBall?.y ?? 0;

      const recordedExactPath = lastShotPaths?.[bId];
      let path: { x: number; y: number }[] = [];
      let maxDist = 0;

      if (recordedExactPath && recordedExactPath.length >= 2) {
        path = recordedExactPath;
        for (const pt of path) {
          const d = Math.hypot(pt.x - startX, pt.y - startY);
          if (d > maxDist) maxDist = d;
        }
      } else {
        for (let f = 0; f < lastShotReplay.length; f++) {
          const frame = lastShotReplay[f];
          if (!frame?.balls) continue;
          const bObj = frame.balls.find(b => b.id === bId);
          if (bObj && !bObj.inPocket) {
            path.push({ x: bObj.x, y: bObj.y });
            const d = Math.hypot(bObj.x - startX, bObj.y - startY);
            if (d > maxDist) maxDist = d;
          }
        }
      }

      // Include all balls that moved more than 3 units
      if (maxDist > 3 && path.length >= 2) {
        trails.push({
          id: bId,
          color: BALL_COLORS[bId]?.hex || '#ffffff',
          path,
        });
      }
    }

    return trails;
  }, [lastShotReplay, lastShotPaths]);

  // Process shot results against official 8-Ball rules
  const processShotEnd = useCallback(() => {
    const shot = currentShotRef.current;
    const shooter = activePlayerId === 'p1' ? p1 : p2;
    const opponent = activePlayerId === 'p1' ? p2 : p1;

    // Practice Mode: relaxed solo flow
    if (gameMode === 'practice') {
      if (shot.cuePocketed) {
        soundManager.playFoul();
        const cue = ballsRef.current.find(b => b.id === 0);
        const validPos = findValidBallPlacement(ballsRef.current, HEAD_STRING_X, TABLE_HEIGHT / 2);
        if (cue) {
          cue.inPocket = false;
          cue.pocketAnim = null;
          cue.x = validPos.x;
          cue.y = validPos.y;
          cue.vx = 0;
          cue.vy = 0;
          setBalls([...ballsRef.current]);
        }
        setIsCueBallInHand(true);
        setTurnState('ball-in-hand');
        setStatusMessage('Scratch in Practice! Place the cue ball anywhere');
        return;
      }

      const remainingObjectBalls = ballsRef.current.filter(b => b.id !== 0 && !b.inPocket);
      if (remainingObjectBalls.length === 0) {
        setWinner(p1);
        setWinReason('Table cleared in Solo Practice Mode!');
        setTurnState('game-over');
        soundManager.playVictory();
        return;
      }

      setTurnState('aiming');
      setStatusMessage(
        shot.ballsPocketed.length > 0
          ? `Pocketed ${shot.ballsPocketed.map(b => `#${b.id}`).join(', ')}! Keep shooting`
          : 'Solo Practice — Aim your next shot'
      );
      return;
    }

    // 1. Check Cue Ball Scratch
    if (shot.cuePocketed) {
      soundManager.playFoul();

      if (shot.eightPocketed) {
        setWinner(opponent);
        setWinReason(`${shooter.name} scratched while pocketing the 8-Ball!`);
        setTurnState('game-over');
        soundManager.playVictory();
        return;
      }

      // Respawn cue ball at a guaranteed non-overlapping spot
      const cue = ballsRef.current.find(b => b.id === 0);
      const validPos = findValidBallPlacement(ballsRef.current, HEAD_STRING_X, TABLE_HEIGHT / 2);
      if (cue) {
        cue.inPocket = false;
        cue.pocketAnim = null;
        cue.x = validPos.x;
        cue.y = validPos.y;
        cue.vx = 0;
        cue.vy = 0;
        setBalls([...ballsRef.current]);
      }

      handleTurnSwitch(true, `Scratch! ${opponent.name} receives Ball in Hand`);
      return;
    }

    // 2. Check 8-Ball pocketed
    if (shot.eightPocketed) {
      const shooterGroup = shooter.group;
      const isSolids = shooterGroup === 'solids';
      // Was the shooter already on the 8-ball BEFORE this shot started?
      const hadGroupBallsAtShotStart =
        !shooterGroup ||
        ballsRef.current.some(
          b =>
            (isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15) &&
            (!b.inPocket || shot.ballsPocketed.some(p => p.id === b.id))
        );

      if (!hadGroupBallsAtShotStart && shot.firstBallHit?.id === 8) {
        setWinner(shooter);
        setWinReason(`${shooter.name} legally pocketed the 8-Ball to win!`);
        setTurnState('game-over');
        soundManager.playVictory();
        return;
      } else {
        setWinner(opponent);
        setWinReason(`${shooter.name} pocketed the 8-Ball illegally!`);
        setTurnState('game-over');
        soundManager.playVictory();
        return;
      }
    }

    // 3. Validate First Ball Hit BEFORE assigning groups or continuing turn
    let isFoul = false;
    let foulReason = '';

    if (!shot.firstBallHit) {
      isFoul = true;
      foulReason = `Foul: Cue ball did not contact any ball! ${opponent.name} gets Ball in Hand`;
    } else if (!p1.group) {
      // Open table: hitting the 8-ball first is a foul
      if (shot.firstBallHit.id === 8) {
        isFoul = true;
        foulReason = `Foul: Cannot hit the 8-Ball first on an Open Table!`;
      }
    } else if (shooter.group) {
      const isSolids = shooter.group === 'solids';
      // Check if shooter still had any of their group balls on the table AT THE START of this shot
      // (including balls that were just pocketed during this shot)
      const hadMyBallsAtShotStart = ballsRef.current.some(
        b =>
          (isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15) &&
          (!b.inPocket || shot.ballsPocketed.some(p => p.id === b.id))
      );

      if (hadMyBallsAtShotStart) {
        const hitOwn = isSolids
          ? shot.firstBallHit.id >= 1 && shot.firstBallHit.id <= 7
          : shot.firstBallHit.id >= 9 && shot.firstBallHit.id <= 15;

        if (!hitOwn) {
          isFoul = true;
          foulReason = `Foul: Must hit ${shooter.group} first! ${opponent.name} gets Ball in Hand`;
        }
      } else {
        if (shot.firstBallHit.id !== 8) {
          isFoul = true;
          foulReason = `Foul: Must hit the 8-Ball first! ${opponent.name} gets Ball in Hand`;
        }
      }
    }

    if (isFoul) {
      soundManager.playFoul();
      handleTurnSwitch(true, foulReason);
      return;
    }

    // 4. Resolve Open Table group assignment (only on a legal shot!)
    const numberedPocketed = shot.ballsPocketed.filter(b => b.id >= 1 && b.id <= 15 && b.id !== 8);

    if (!p1.group && numberedPocketed.length > 0) {
      const firstSunk = numberedPocketed[0];
      const sunkIsSolid = firstSunk.id <= 7;

      const p1Assigned: BallGroup =
        shooter.id === 'p1'
          ? sunkIsSolid
            ? 'solids'
            : 'stripes'
          : sunkIsSolid
          ? 'stripes'
          : 'solids';

      const p2Assigned: BallGroup = p1Assigned === 'solids' ? 'stripes' : 'solids';

      setP1(prev => ({ ...prev, group: p1Assigned }));
      setP2(prev => ({ ...prev, group: p2Assigned }));

      setStatusMessage(
        `${shooter.name} pocketed #${firstSunk.id}! Assigned ${
          shooter.id === 'p1' ? p1Assigned : p2Assigned
        }`
      );

      if (shooter.id === 'bot' && botLastPlanRef.current?.nextAimAngle !== undefined) {
        setAimAngle(botLastPlanRef.current.nextAimAngle);
      }

      setTurnState('aiming');
      setTurnTimer(30);
      return;
    }

    // 5. Check if shooter pocketed at least one of their own balls
    if (shooter.group) {
      const isSolids = shooter.group === 'solids';
      const pocketedOwn = shot.ballsPocketed.some(b =>
        isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15
      );

      if (pocketedOwn) {
        if (shooter.id === 'bot' && botLastPlanRef.current?.nextAimAngle !== undefined) {
          setAimAngle(botLastPlanRef.current.nextAimAngle);
        }
        const remainingMyBalls = ballsRef.current.some(
          b => !b.inPocket && (isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15)
        );
        setStatusMessage(
          remainingMyBalls
            ? `Nice shot! ${shooter.name} continues`
            : `All ${shooter.group} cleared! ${shooter.name} continues — shoot the 8-Ball!`
        );
        setTurnState('aiming');
        setTurnTimer(30);
        return;
      }
    }

    // Otherwise, clean miss: pass turn to opponent
    handleTurnSwitch(false);
  }, [activePlayerId, gameMode, handleTurnSwitch, p1, p2]);

  // Physics animation loop (60Hz fixed deterministic step so live physics matches AI simulation 100%)
  useEffect(() => {
    if (turnState !== 'rolling') return;

    let animId: number;
    let lastTime = performance.now();
    let accumulatorMs = 0;
    const STEP_MS = 1000 / 60;

    const loop = (now: number) => {
      const elapsedMs = Math.min(50, Math.max(0, now - lastTime));
      lastTime = now;
      accumulatorMs += elapsedMs;

      let stepsToRun = 0;
      if (accumulatorMs >= STEP_MS * 0.7) {
        stepsToRun = Math.min(2, Math.max(1, Math.round(accumulatorMs / STEP_MS)));
        accumulatorMs = Math.max(0, accumulatorMs - stepsToRun * STEP_MS);
      }

      for (let s = 0; s < stepsToRun; s++) {
        const frameIdx = currentReplayBufferRef.current.length;
        const isMoving = updatePhysics(
          ballsRef.current,
          currentShotRef.current,
          16,
          frameIdx,
          contactBalls => {
            currentReplayBufferRef.current.push({
              balls: cloneBalls(contactBalls),
              time: currentReplayBufferRef.current.length / 60,
            });
          },
          1
        );

        // Record snapshot for slow-motion replay
        currentReplayBufferRef.current.push({
          balls: cloneBalls(ballsRef.current),
          time: currentReplayBufferRef.current.length / 60,
        });

        if (!isMoving && areAllBallsStopped(ballsRef.current)) {
          setBalls([...ballsRef.current]);
          // Finished rolling! Atomically store shot replay sequence and append to full match shot archive
          if (currentReplayBufferRef.current.length >= 2) {
            const framesCopy = [...currentReplayBufferRef.current];
            const collisionsCopy = [...(currentShotRef.current.collisions || [])];
            const clonedPaths: Record<number, { x: number; y: number }[]> = {};
            if (currentShotRef.current.ballPaths) {
              for (const [k, pts] of Object.entries(currentShotRef.current.ballPaths)) {
                clonedPaths[Number(k)] = pts.map(p => ({ x: p.x, y: p.y }));
              }
            }
            const setupCopy = currentShotSetupRef.current
              ? { ...currentShotSetupRef.current }
              : null;
            const preShotCopy = preShotStateRef.current
              ? {
                  ...preShotStateRef.current,
                  balls: cloneBalls(preShotStateRef.current.balls),
                  p1: { ...preShotStateRef.current.p1 },
                  p2: { ...preShotStateRef.current.p2 },
                }
              : null;

            setLastShotReplay(framesCopy);
            setLastShotCollisions(collisionsCopy);
            setLastShotPaths(clonedPaths);
            if (setupCopy) {
              setLastShotSetup(setupCopy);
            }

            // Build human-readable summary & metadata for the match shot archive
            const shot = currentShotRef.current;
            const shooter = activePlayerId === 'p1' ? p1 : p2;
            const shotNum = recordedShotsRef.current.length + 1;
            const isBreak = shotNum === 1;
            const pocketedIds = shot.ballsPocketed
              .filter(b => b.id !== 0)
              .map(b => b.id);

            let shotFoul = false;
            if (shot.cuePocketed || !shot.firstBallHit) {
              shotFoul = true;
            } else if (gameMode !== 'practice') {
              if (!p1.group && shot.firstBallHit.id === 8) {
                shotFoul = true;
              } else if (shooter.group) {
                const isSolids = shooter.group === 'solids';
                const hadMyBalls = ballsRef.current.some(
                  b =>
                    (isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15) &&
                    (!b.inPocket || shot.ballsPocketed.some(p => p.id === b.id))
                );
                if (hadMyBalls) {
                  const hitOwn = isSolids
                    ? shot.firstBallHit.id >= 1 && shot.firstBallHit.id <= 7
                    : shot.firstBallHit.id >= 9 && shot.firstBallHit.id <= 15;
                  if (!hitOwn) shotFoul = true;
                } else if (shot.firstBallHit.id !== 8) {
                  shotFoul = true;
                }
              }
            }

            let summary = 'Промах';
            if (shot.cuePocketed) {
              summary = 'Фол (биток)';
            } else if (shotFoul) {
              summary = 'Фол';
            } else if (isBreak) {
              summary =
                pocketedIds.length > 0
                  ? `Разбой (${pocketedIds.map(id => `#${id}`).join(', ')})`
                  : 'Разбой';
            } else if (pocketedIds.length > 0) {
              summary = `Забит ${pocketedIds.map(id => `#${id}`).join(', ')}`;
            }

            const newRecord: RecordedShot = {
              id: Date.now() + shotNum,
              shotNumber: shotNum,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              playerId: activePlayerId,
              playerName: shooter.name,
              playerAvatar: shooter.avatar,
              playerGroup: shooter.group,
              firstBallHitId: shot.firstBallHit?.id ?? null,
              pocketedBallIds: pocketedIds,
              isFoul: shotFoul,
              isBreak,
              summary,
              frames: framesCopy,
              collisions: collisionsCopy,
              ballPaths: clonedPaths,
              setup: setupCopy,
              preShotState: preShotCopy,
            };

            setRecordedShots(prev => [...prev, newRecord]);
            setSelectedReplayShotId(newRecord.id);
          }
          setHintIndex(0);
          processShotEnd();
          return;
        }
      }

      if (stepsToRun > 0) {
        setBalls([...ballsRef.current]);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [turnState, processShotEnd]);

  // Replay playback loop (clamped dt & frame index so it never goes negative or out of bounds)
  useEffect(() => {
    if (turnState !== 'replay' || !lastShotReplay || lastShotReplay.length === 0) return;

    let animId: number;
    let lastTime = performance.now();
    const maxFrame = Math.max(0, lastShotReplay.length - 1);

    const replayLoop = (now: number) => {
      // Clamp dt to [0, 0.1] so a slightly earlier rAF timestamp never causes negative dt!
      const dt = Math.max(0, Math.min(0.1, (now - lastTime) / 1000));
      lastTime = now;

      if (isReplayPlaying) {
        setReplayFrameIndex(prev => {
          const safePrev = Number.isFinite(prev) ? Math.max(0, prev) : 0;
          const next = safePrev + replaySpeed * 60 * dt;
          if (next >= maxFrame) {
            setIsReplayPlaying(false);
            return maxFrame;
          }
          return Math.max(0, next);
        });
      }

      animId = requestAnimationFrame(replayLoop);
    };

    animId = requestAnimationFrame(replayLoop);
    return () => cancelAnimationFrame(animId);
  }, [turnState, lastShotReplay, isReplayPlaying, replaySpeed]);

  // Trajectory calculation for aiming
  const cueBall = balls.find(b => b.id === 0);
  const trajectory =
    cueBall && turnState === 'aiming' && !isCueBallInHand
      ? calculateTrajectory(cueBall, aimAngle, balls, spinX, spinY, guidelineLength)
      : null;

  // Player Hint calculation (computed asynchronously after paint so UI never lags!)
  const activeHumanGroup = activePlayerId === 'p1' ? p1.group : p2.group;
  const [playerHints, setPlayerHints] = useState<PlayerHintSuggestion[]>([]);

  useEffect(() => {
    if (!hintMode || turnState !== 'aiming' || activePlayerId === 'bot' || isCueBallInHand) {
      setPlayerHints([]);
      return;
    }
    const timer = setTimeout(() => {
      const computed = calculatePlayerHints(
        ballsRef.current,
        activeHumanGroup,
        gameMode === 'practice'
      );
      setPlayerHints(computed);
    }, 16);
    return () => clearTimeout(timer);
  }, [hintMode, turnState, activePlayerId, isCueBallInHand, balls, activeHumanGroup, gameMode]);

  const safeHintIndex = playerHints.length > 0 ? hintIndex % playerHints.length : 0;
  const activePlayerHint = playerHints[safeHintIndex] ?? null;

  // True when the player has locked onto the active hint's exact physics-verified angle & spin
  const isHintLocked = Boolean(
    hintMode &&
      turnState === 'aiming' &&
      activePlayerId !== 'bot' &&
      !isCueBallInHand &&
      activePlayerHint &&
      Math.abs(aimAngle - activePlayerHint.aimAngle) < 0.0006 &&
      Math.abs(spinX - activePlayerHint.spinX) < 0.02 &&
      Math.abs(spinY - activePlayerHint.spinY) < 0.02
  );

  const handleApplyHint = useCallback(() => {
    if (!activePlayerHint) return;
    setAimAngle(activePlayerHint.aimAngle);
    setPower(activePlayerHint.power);
    setSpinX(activePlayerHint.spinX);
    setSpinY(activePlayerHint.spinY);
    setStatusMessage(
      `🎯 Прицел и сила (${Math.round(activePlayerHint.power * 100)}%) зафиксированы: ${activePlayerHint.description}`
    );
  }, [activePlayerHint]);

  const handleCycleHint = useCallback(() => {
    if (playerHints.length <= 1) return;
    setHintIndex(prev => (prev + 1) % playerHints.length);
  }, [playerHints.length]);

  // Execute shot
  const handleShoot = useCallback(
    (
      shotPower: number,
      overrideAimAngle?: number,
      overrideSpinX?: number,
      overrideSpinY?: number
    ) => {
      if (turnState !== 'aiming' || isShootingAnim) return;

      const activeCue = ballsRef.current.find(b => b.id === 0);
      if (!activeCue || activeCue.inPocket) return;

      const shotAngle = overrideAimAngle !== undefined ? overrideAimAngle : aimAngle;
      const effectiveSpinX = overrideSpinX !== undefined ? overrideSpinX : spinX;
      const effectiveSpinY = overrideSpinY !== undefined ? overrideSpinY : spinY;
      const snapshotBalls = cloneBalls(ballsRef.current);
      const snapshotCue = snapshotBalls.find(b => b.id === 0) || { ...activeCue };

      // Save pre-shot state for "Retry Shot" and Aim Guide in Replay using cloned balls
      const preTrajectory = calculateTrajectory(
        snapshotCue,
        shotAngle,
        snapshotBalls,
        effectiveSpinX,
        effectiveSpinY,
        'full'
      );

      const setupData = {
        cueBallX: snapshotCue.x,
        cueBallY: snapshotCue.y,
        aimAngle: shotAngle,
        power: shotPower,
        trajectory: preTrajectory,
      };
      currentShotSetupRef.current = setupData;
      setLastShotSetup(setupData);

      preShotStateRef.current = {
        balls: snapshotBalls,
        activePlayerId,
        p1: { ...p1 },
        p2: { ...p2 },
        aimAngle: shotAngle,
        power: shotPower,
        spinX: effectiveSpinX,
        spinY: effectiveSpinY,
      };

      setIsShootingAnim(true);
      setShootingProgress(0);

      // Initialize exact ball path tracking starting at pre-shot coordinates
      const initialPaths: Record<number, { x: number; y: number }[]> = {};
      for (const b of snapshotBalls) {
        if (!b.inPocket) {
          initialPaths[b.id] = [{ x: b.x, y: b.y }];
        }
      }

      // Reset shot tracking
      currentShotRef.current = {
        firstBallHit: null,
        ballsPocketed: [],
        cuePocketed: false,
        eightPocketed: false,
        cushionsHitAfterBallHit: 0,
        collisions: [],
        ballPaths: initialPaths,
      };

      // Reset replay recording buffer and save starting frame
      currentReplayBufferRef.current = [
        {
          balls: cloneBalls(ballsRef.current),
          time: 0,
        },
      ];

      // Animate cue strike forward over 120ms
      const startTime = performance.now();
      const animDuration = 120;

      const animateStrike = (now: number) => {
        const elapsed = Math.max(0, now - startTime);
        const p = Math.min(1, elapsed / animDuration);
        setShootingProgress(p);

        if (p < 1) {
          strikeAnimRef.current = requestAnimationFrame(animateStrike);
        } else {
          strikeAnimRef.current = null;
          setIsShootingAnim(false);
          setShootingProgress(0);
          setBotPlan(null);

          // Apply initial impulse to cue ball calibrated to 8 Ball Pool shot power curve
          const speed = 3.0 + Math.pow(shotPower, 1.08) * 30.5;
          activeCue.vx = Math.cos(shotAngle) * speed;
          activeCue.vy = Math.sin(shotAngle) * speed;
          activeCue.spinX = effectiveSpinX;
          activeCue.spinY = effectiveSpinY;

          soundManager.playCueHit(shotPower);
          setTurnState('rolling');
          setStatusMessage('Shot in motion...');
        }
      };

      strikeAnimRef.current = requestAnimationFrame(animateStrike);
    },
    [activePlayerId, aimAngle, isShootingAnim, p1, p2, spinX, spinY, turnState]
  );

  const handleShootRef = useRef(handleShoot);
  useEffect(() => {
    handleShootRef.current = handleShoot;
  }, [handleShoot]);

  // Bot AI decision and automatic execution (fast & non-blocking)
  useEffect(() => {
    if (turnState !== 'aiming' || activePlayerId !== 'bot' || winner) return;

    setStatusMessage('🤖 ИИ прицеливается...');
    let shotTimer: ReturnType<typeof setTimeout> | null = null;

    const botTimer = setTimeout(() => {
      const decision = calculateBotShot(
        ballsRef.current,
        p2.group,
        botDifficulty,
        botLastPlanRef.current
      );

      setAimAngle(decision.aimAngle);
      setPower(decision.power);
      setSpinX(decision.spinX);
      setSpinY(decision.spinY);
      setBotPlan(decision.plan);

      if (decision.plan) {
        setStatusMessage(`🧠 ${decision.plan.strategyText}`);
      }

      shotTimer = setTimeout(() => {
        botLastPlanRef.current = decision.plan;
        handleShootRef.current(
          decision.power,
          decision.aimAngle,
          decision.spinX,
          decision.spinY
        );
      }, 480);
    }, 180);

    return () => {
      clearTimeout(botTimer);
      if (shotTimer) clearTimeout(shotTimer);
    };
  }, [activePlayerId, botDifficulty, p2.group, turnState, winner]);

  // Restart / Rack new game
  const handleResetGame = () => {
    if (strikeAnimRef.current) {
      cancelAnimationFrame(strikeAnimRef.current);
      strikeAnimRef.current = null;
    }
    setIsShootingAnim(false);
    setShootingProgress(0);
    setBotPlan(null);
    botLastPlanRef.current = null;

    const newBalls = createRackedBalls();
    setBalls(newBalls);
    ballsRef.current = newBalls;
    setP1(prev => ({ ...prev, group: null, score: 0 }));
    setP2(prev => ({ ...prev, group: null, score: 0 }));
    setActivePlayerId('p1');
    setTurnState('aiming');
    setTurnTimer(30);
    setWinner(null);
    setWinReason('');
    setIsCueBallInHand(false);
    setBehindHeadString(false);
    setAimAngle(0);
    setPower(0.4);
    setSpinX(0);
    setSpinY(0);
    setHintIndex(0);
    setRecordedShots([]);
    setSelectedReplayShotId(null);
    setLastShotReplay(null);
    setLastShotCollisions([]);
    setLastShotPaths(null);
    setLastShotSetup(null);
    savedGameStateRef.current = null;
    preShotStateRef.current = null;
    setStatusMessage('Break shot! Pull down power to break');
    soundManager.playBallHit(12);
  };

  // Handle fine-tune dial
  const handleAdjustAngle = useCallback((delta: number) => {
    setAimAngle(prev => (prev + delta) % (Math.PI * 2));
  }, []);

  // Keyboard shortcuts for precision aiming & power
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (turnState !== 'aiming' || activePlayerId === 'bot' || isCueBallInHand || isRulesOpen || winner) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const step = e.shiftKey || precisionMode ? 0.00035 : 0.0022;
        handleAdjustAngle(-step);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const step = e.shiftKey || precisionMode ? 0.00035 : 0.0022;
        handleAdjustAngle(step);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setPower(prev => Math.min(1, Number((prev + 0.02).toFixed(2))));
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setPower(prev => Math.max(0.05, Number((prev - 0.02).toFixed(2))));
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        handleShoot(power);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activePlayerId,
    handleAdjustAngle,
    handleShoot,
    isCueBallInHand,
    isRulesOpen,
    power,
    precisionMode,
    turnState,
    winner,
  ]);

  // Switch game mode directly
  const handleModeChange = (mode: GameMode) => {
    setGameMode(mode);
    handleResetGame();
  };

  // Select a specific shot from the recorded shots archive to view in replay
  const handleSelectReplayShot = useCallback(
    (shotId: number) => {
      const targetShot = recordedShotsRef.current.find(s => s.id === shotId);
      if (!targetShot) return;

      setSelectedReplayShotId(targetShot.id);
      setLastShotReplay(targetShot.frames);
      setLastShotCollisions(targetShot.collisions);
      setLastShotPaths(targetShot.ballPaths);
      setLastShotSetup(targetShot.setup);
      if (targetShot.preShotState) {
        preShotStateRef.current = {
          ...targetShot.preShotState,
          balls: cloneBalls(targetShot.preShotState.balls),
          p1: { ...targetShot.preShotState.p1 },
          p2: { ...targetShot.preShotState.p2 },
        };
      }
      setReplayFrameIndex(0);
      setIsReplayPlaying(true);
      setStatusMessage(
        `Повтор удара #${targetShot.shotNumber}: ${targetShot.playerName} — ${targetShot.summary}`
      );
    },
    []
  );

  // Slow-Mo Replay Handlers
  const handleOpenReplay = () => {
    if (recordedShotsRef.current.length === 0 && (!lastShotReplay || lastShotReplay.length === 0)) {
      return;
    }

    // Cancel any ongoing strike animation if bot was about to shoot
    if (strikeAnimRef.current) {
      cancelAnimationFrame(strikeAnimRef.current);
      strikeAnimRef.current = null;
      setIsShootingAnim(false);
      setShootingProgress(0);
    }

    // Snapshot game state before entering replay
    savedGameStateRef.current = {
      balls: cloneBalls(ballsRef.current),
      turnState,
      statusMessage,
      activePlayerId,
      isCueBallInHand,
    };

    const latestShot = recordedShotsRef.current[recordedShotsRef.current.length - 1];
    if (latestShot) {
      setSelectedReplayShotId(latestShot.id);
      setLastShotReplay(latestShot.frames);
      setLastShotCollisions(latestShot.collisions);
      setLastShotPaths(latestShot.ballPaths);
      setLastShotSetup(latestShot.setup);
      if (latestShot.preShotState) {
        preShotStateRef.current = {
          ...latestShot.preShotState,
          balls: cloneBalls(latestShot.preShotState.balls),
          p1: { ...latestShot.preShotState.p1 },
          p2: { ...latestShot.preShotState.p2 },
        };
      }
    }

    setTurnState('replay');
    setReplayFrameIndex(0);
    setIsReplayPlaying(true);
    setReplayControlsVisible(true);
    setReplaySpeed(0.25);
    setStatusMessage(
      latestShot
        ? `Архив ударов • Удар #${latestShot.shotNumber}: ${latestShot.playerName} (${latestShot.summary})`
        : 'Slow-Motion Physics Replay (0.25x)'
    );
  };

  const handleExitReplay = () => {
    if (savedGameStateRef.current) {
      const restoredBalls = cloneBalls(savedGameStateRef.current.balls);
      setBalls(restoredBalls);
      ballsRef.current = restoredBalls;
      setTurnState(savedGameStateRef.current.turnState);
      setStatusMessage(savedGameStateRef.current.statusMessage);
      setActivePlayerId(savedGameStateRef.current.activePlayerId);
      setIsCueBallInHand(savedGameStateRef.current.isCueBallInHand);
      savedGameStateRef.current = null;
    } else {
      setTurnState('aiming');
    }
    setIsReplayPlaying(false);
  };

  const handleRetryShot = () => {
    if (!preShotStateRef.current) {
      handleExitReplay();
      return;
    }

    const snap = preShotStateRef.current;
    const restoredBalls = cloneBalls(snap.balls);
    setBalls(restoredBalls);
    ballsRef.current = restoredBalls;
    setP1({ ...snap.p1 });
    setP2({ ...snap.p2 });
    setActivePlayerId('p1');
    setAimAngle(snap.aimAngle);
    setPower(snap.power);
    setSpinX(snap.spinX);
    setSpinY(snap.spinY);
    setIsCueBallInHand(false);
    setWinner(null);
    setWinReason('');
    setTurnTimer(30);
    setTurnState('aiming');
    setBotPlan(null);
    botLastPlanRef.current = null;
    setIsReplayPlaying(false);
    savedGameStateRef.current = null;
    setStatusMessage('Shot restored! Adjust aim, spin, or power and shoot again');
  };

  const handleStepReplay = (delta: number) => {
    if (!lastShotReplay || lastShotReplay.length === 0) return;
    setIsReplayPlaying(false);
    setReplayFrameIndex(prev => {
      const safePrev = Number.isFinite(prev) ? prev : 0;
      return Math.max(0, Math.min(lastShotReplay.length - 1, Math.round(safePrev + delta)));
    });
  };

  // Safe replay frame index guaranteed within [0, lastShotReplay.length - 1]
  const safeReplayFrameIndex =
    lastShotReplay && lastShotReplay.length > 0
      ? Math.max(
          0,
          Math.min(
            lastShotReplay.length - 1,
            Math.floor(Number.isFinite(replayFrameIndex) ? replayFrameIndex : 0)
          )
        )
      : 0;

  // Determine active balls to render on table (replay snapshot or live table)
  const displayBalls =
    turnState === 'replay' && lastShotReplay && lastShotReplay.length > 0
      ? lastShotReplay[safeReplayFrameIndex]?.balls ?? balls
      : balls;

  return (
    <div className="h-dvh w-screen max-h-dvh overflow-hidden bg-slate-950 text-slate-100 flex flex-col justify-between select-none font-sans">
      {/* Compact Single-Row Top Bar (Hidden when inside the dedicated Shot Recordings Video Player screen) */}
      {turnState !== 'replay' && (
        <GameHUD
          player1={p1}
          player2={p2}
          activePlayerId={activePlayerId}
          balls={balls}
          turnState={turnState}
          gameMode={gameMode}
          botDifficulty={botDifficulty}
          currentTheme={theme}
          guidelineLength={guidelineLength}
          turnTimer={turnTimer}
          statusMessage={statusMessage}
          isMuted={isMuted}
          canReplay={recordedShots.length > 0 && turnState !== 'rolling'}
          recordedShotsCount={recordedShots.length}
          isReplaying={false}
          hintMode={hintMode}
          activeHint={activePlayerHint}
          hintIndex={safeHintIndex}
          totalHints={playerHints.length}
          isHintLocked={isHintLocked}
          spinX={spinX}
          spinY={spinY}
          onSpinChange={(sx, sy) => {
            setSpinX(sx);
            setSpinY(sy);
          }}
          onModeChange={handleModeChange}
          onToggleHintMode={() => setHintMode(prev => !prev)}
          onApplyHint={handleApplyHint}
          onShootHint={() => {
            if (!activePlayerHint) return;
            handleShoot(
              activePlayerHint.power,
              activePlayerHint.aimAngle,
              activePlayerHint.spinX,
              activePlayerHint.spinY
            );
          }}
          onCycleHint={handleCycleHint}
          onOpenReplay={handleOpenReplay}
          onToggleMute={() => setIsMuted(soundManager.toggleMute())}
          onThemeChange={setTheme}
          onGuidelineChange={setGuidelineLength}
          onDifficultyChange={setBotDifficulty}
          onResetGame={handleResetGame}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenAndroidModal={() => setIsAndroidModalOpen(true)}
        />
      )}

      {/* Main Arena: Fits 100% inside single smartphone screen (Left Dock + Billiard Table + Right Dock) */}
      <main
        onClick={e => {
          if (turnState === 'replay' && e.target === e.currentTarget) {
            setReplayControlsVisible(prev => !prev);
          }
        }}
        className={`flex-1 min-h-0 min-w-0 w-full flex items-center justify-center ${
          turnState === 'replay'
            ? 'p-4 sm:p-8 md:p-12 cursor-pointer'
            : 'gap-1.5 sm:gap-2.5 md:gap-4 px-1.5 sm:px-3 py-1'
        }`}
      >
        {/* Left Dock: Fine-Tune Aim Ruler (Default) OR Cue Power Slider (if swapped) */}
        {turnState !== 'replay' && (
          <div className="shrink-0 h-full flex items-center justify-center">
            {androidSettings.swapSides ? (
              <PowerSlider
                power={power}
                onPowerChange={setPower}
                onShoot={handleShoot}
                disabled={turnState !== 'aiming' || activePlayerId === 'bot'}
                recommendedPower={
                  hintMode && activePlayerId !== 'bot' && activePlayerHint
                    ? activePlayerHint.power
                    : null
                }
                isHintLocked={isHintLocked}
              />
            ) : (
              <FineTuneDial
                onAdjustAngle={handleAdjustAngle}
                disabled={turnState !== 'aiming' || activePlayerId === 'bot'}
                cutAngleDeg={trajectory?.cutAngleDeg ?? null}
                willPot={Boolean(trajectory?.willPot)}
                precisionMode={precisionMode}
                onTogglePrecisionMode={() => setPrecisionMode(prev => !prev)}
                showZoomLoupe={showZoomLoupe}
                onToggleZoomLoupe={() => setShowZoomLoupe(prev => !prev)}
              />
            )}
          </div>
        )}

        {/* Center: Billiard Table Canvas (Auto-scales to fit both width and height of screen) */}
        <div
          onClick={e => {
            if (turnState === 'replay' && e.target === e.currentTarget) {
              setReplayControlsVisible(prev => !prev);
            }
          }}
          className="flex-1 h-full min-w-0 min-h-0 flex items-center justify-center"
        >
          <PoolCanvas
            balls={displayBalls}
            theme={TABLE_THEMES[theme]}
            turnState={turnState}
            aimAngle={aimAngle}
            power={power}
            trajectory={turnState === 'replay' ? null : trajectory}
            guidelineLength={guidelineLength}
            isCueBallInHand={turnState === 'replay' ? false : isCueBallInHand}
            behindHeadString={behindHeadString}
            disabledInteraction={activePlayerId === 'bot' || turnState === 'replay'}
            precisionMode={precisionMode}
            showZoomLoupe={showZoomLoupe}
            onAimChange={setAimAngle}
            onCueBallMove={(x, y) => {
              const cue = ballsRef.current.find(b => b.id === 0);
              if (cue) {
                cue.x = x;
                cue.y = y;
                setBalls([...ballsRef.current]);
              }
            }}
            onConfirmCuePlacement={() => {
              setIsCueBallInHand(false);
              setTurnState('aiming');
              setStatusMessage('Биток установлен. Прицельтесь и бейте!');
            }}
            isShootingAnim={isShootingAnim}
            shootingProgress={shootingProgress}
            trajectoryTrails={turnState === 'replay' && showTrajectoryTrails ? computedTrails : null}
            collisionMarkers={turnState === 'replay' ? lastShotCollisions : null}
            showVectors={turnState === 'replay' && showReplayVectors}
            currentReplayFrame={safeReplayFrameIndex}
            replayPreShotSetup={turnState === 'replay' && showReplayAimGuide ? lastShotSetup : null}
            botPlan={activePlayerId === 'bot' && turnState === 'aiming' ? botPlan : null}
            playerHint={
              hintMode && activePlayerId !== 'bot' && turnState === 'aiming'
                ? activePlayerHint
                : null
            }
            touchSafeAim={androidSettings.touchSafeAim}
            touchSensitivity={androidSettings.touchSensitivity}
            onEmptySpaceTap={
              turnState === 'replay'
                ? () => setReplayControlsVisible(prev => !prev)
                : undefined
            }
          />
        </div>

        {/* Right Dock: Authentic 8 Ball Pool Cue Power Slider (Default) OR Fine-Tune Ruler (if swapped) */}
        {turnState !== 'replay' && (
          <div className="shrink-0 h-full flex items-center justify-center">
            {androidSettings.swapSides ? (
              <FineTuneDial
                onAdjustAngle={handleAdjustAngle}
                disabled={turnState !== 'aiming' || activePlayerId === 'bot'}
                cutAngleDeg={trajectory?.cutAngleDeg ?? null}
                willPot={Boolean(trajectory?.willPot)}
                precisionMode={precisionMode}
                onTogglePrecisionMode={() => setPrecisionMode(prev => !prev)}
                showZoomLoupe={showZoomLoupe}
                onToggleZoomLoupe={() => setShowZoomLoupe(prev => !prev)}
              />
            ) : (
              <PowerSlider
                power={power}
                onPowerChange={setPower}
                onShoot={handleShoot}
                disabled={turnState !== 'aiming' || activePlayerId === 'bot'}
                recommendedPower={
                  hintMode && activePlayerId !== 'bot' && activePlayerHint
                    ? activePlayerHint.power
                    : null
                }
                isHintLocked={isHintLocked}
              />
            )}
          </div>
        )}
      </main>

      {/* Dedicated Full-Screen Shot Recordings Video Player Overlay (auto-hides during playback & toggles via tap outside table) */}
      {turnState === 'replay' && lastShotReplay && lastShotReplay.length > 0 && (
        <ReplayControls
          currentFrame={safeReplayFrameIndex}
          totalFrames={lastShotReplay.length}
          isPlaying={isReplayPlaying}
          playbackSpeed={replaySpeed}
          showAimGuide={showReplayAimGuide}
          showTrails={showTrajectoryTrails}
          showVectors={showReplayVectors}
          controlsVisible={replayControlsVisible}
          onSetControlsVisible={setReplayControlsVisible}
          recordedShots={recordedShots}
          selectedShotId={selectedReplayShotId}
          onSelectShot={handleSelectReplayShot}
          onTogglePlay={() => setIsReplayPlaying(prev => !prev)}
          onSeek={frame => {
            setIsReplayPlaying(false);
            setReplayFrameIndex(
              Math.max(0, Math.min(lastShotReplay.length - 1, Number(frame) || 0))
            );
          }}
          onStep={handleStepReplay}
          onSpeedChange={speed => {
            setReplaySpeed(speed);
            setStatusMessage(`Замедленный повтор (${speed}x)`);
          }}
          onToggleAimGuide={() => setShowReplayAimGuide(prev => !prev)}
          onToggleTrails={() => setShowTrajectoryTrails(prev => !prev)}
          onToggleVectors={() => setShowReplayVectors(prev => !prev)}
          onRetryShot={handleRetryShot}
          onRestart={() => {
            setReplayFrameIndex(0);
            setIsReplayPlaying(true);
          }}
          onExit={handleExitReplay}
        />
      )}

      {/* Modals */}
      <VictoryModal
        winner={winner}
        winReason={winReason}
        onPlayAgain={handleResetGame}
        onSwitchMode={handleModeChange}
      />

      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

      <AndroidBuildModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
        settings={androidSettings}
        onUpdateSettings={setAndroidSettings}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />
    </div>
  );
}
