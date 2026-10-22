export type BallType = 'cue' | 'solid' | 'stripe' | 'eight';

export interface Ball {
  id: number;           // 0 is cue ball, 1-15 are numbered balls
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinX: number;        // Side spin (-1 to 1)
  spinY: number;        // Top/Back spin (-1 to 1)
  radius: number;
  color: string;
  type: BallType;
  number: number;
  inPocket: boolean;
  pocketAnim: {
    targetX: number;
    targetY: number;
    wellX?: number;
    wellY?: number;
    wellRadius?: number;
    progress?: number;
    scale: number;
    alpha: number;
  } | null;
  // 3D Orientation vectors for authentic rolling rotation
  nx: number;           // Number badge normal X
  ny: number;           // Number badge normal Y
  nz: number;           // Number badge normal Z
  sx: number;           // Pole / Stripe normal X
  sy: number;           // Pole / Stripe normal Y
  sz: number;           // Pole / Stripe normal Z
  rotationX: number;    // Visual roll tracking X
  rotationY: number;    // Visual roll tracking Y
}

export type GameMode = 'vs-bot' | 'pass-and-play' | 'practice';
export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'super';
export type TableTheme = 'emerald' | 'blue' | 'burgundy' | 'slate';
export type TurnState = 'aiming' | 'shooting' | 'rolling' | 'ball-in-hand' | 'replay' | 'game-over';
export type BallGroup = 'solids' | 'stripes' | null;

export interface BotShotPlan {
  targetBallId: number;
  targetPocketId: string;
  cueBallPath: { x: number; y: number }[];
  plannedCueStop: { x: number; y: number };
  nextTargetBallId: number | null;
  nextTargetPocketId: string | null;
  nextGhostBall: { x: number; y: number } | null;
  nextBallPos?: { x: number; y: number } | null;
  nextAimAngle?: number;
  nextPower?: number;
  nextSpinX?: number;
  nextSpinY?: number;
  inferredGroup?: 'solids' | 'stripes';
  spinLabel: string;
  strategyText: string;
  confidence: number;
}

export interface Player {
  id: 'p1' | 'p2' | 'bot';
  name: string;
  group: BallGroup;
  score: number;
  isBot?: boolean;
  avatar: string;
}

export interface Pocket {
  id: string;
  x: number;
  y: number;
  dropX: number;
  dropY: number;
  radius: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export interface TrajectoryData {
  aimLineEnd: TrajectoryPoint;
  hitPoint: TrajectoryPoint | null;
  targetBall: Ball | null;
  objectBallStart?: TrajectoryPoint | null;
  ghostBall: TrajectoryPoint | null;
  objectBallLineEnd: TrajectoryPoint | null;
  objectBallBounceLineEnd?: TrajectoryPoint | null;
  cueDeflectionLineEnd: TrajectoryPoint | null;
  cushionBounceLineEnd: TrajectoryPoint | null;
  cutAngleDeg: number | null;
  willPot: boolean;
  targetPocketId: string | null;
}

export interface CollisionMarker {
  x: number;
  y: number;
  type: 'ball' | 'cushion' | 'pocket';
  frame: number;
  intensity: number;
}

export interface ShotResult {
  firstBallHit: Ball | null;
  ballsPocketed: Ball[];
  cuePocketed: boolean;
  eightPocketed: boolean;
  cushionsHitAfterBallHit: number;
  collisions?: CollisionMarker[];
  ballPaths?: Record<number, TrajectoryPoint[]>;
}

export interface ReplayFrame {
  balls: Ball[];
  time: number;
}

export interface PlayerHintSuggestion {
  targetBallId: number;
  firstHitBallId?: number;
  firstHitBallPos?: { x: number; y: number };
  firstHitBallPath?: { x: number; y: number }[];
  shotType?: 'direct' | 'bank' | 'kick' | 'combo' | 'safety';
  badgeText?: string;
  targetPocketId: string;
  pocketName: string;
  aimAngle: number;
  power: number;
  spinX: number;
  spinY: number;
  cutAngleDeg: number;
  ghostBall: { x: number; y: number };
  targetBallPos: { x: number; y: number };
  pocketDropPos: { x: number; y: number };
  cuePathToFirstHit?: { x: number; y: number }[];
  targetBallPath?: { x: number; y: number }[];
  cueBallPath: { x: number; y: number }[];
  plannedCueStop: { x: number; y: number };
  difficultyLabel: 'Очень легкий' | 'Легкий' | 'Средний' | 'Сложный';
  easeScore: number;
  description: string;
}

export interface RecordedShot {
  id: number;
  shotNumber: number;
  timestamp: string;
  playerId: 'p1' | 'p2' | 'bot';
  playerName: string;
  playerAvatar: string;
  playerGroup: BallGroup;
  firstBallHitId: number | null;
  pocketedBallIds: number[];
  isFoul: boolean;
  isBreak: boolean;
  summary: string;
  frames: ReplayFrame[];
  collisions: CollisionMarker[];
  ballPaths: Record<number, { x: number; y: number }[]>;
  setup: {
    cueBallX: number;
    cueBallY: number;
    aimAngle: number;
    power: number;
    trajectory: TrajectoryData | null;
  } | null;
  preShotState: {
    balls: Ball[];
    activePlayerId: 'p1' | 'p2' | 'bot';
    p1: Player;
    p2: Player;
    aimAngle: number;
    power: number;
    spinX: number;
    spinY: number;
  } | null;
}

export interface TableThemeConfig {
  id: TableTheme;
  name: string;
  feltColor: string;
  feltHighlight: string;
  cushionColor?: string;
  railColor: string;
  woodGrain: string;
  woodTrim: string;
  pocketRim: string;
}

