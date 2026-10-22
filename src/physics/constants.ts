import { TableTheme, TableThemeConfig } from '../types/game';

// Simulation dimensions (standard 2:1 pool playfield proportion)
export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 540;

// Inner playfield boundaries (the felt area inside the cushion noses)
// Width = 940 - 60 = 880
// Height = 490 - 50 = 440
// 880 : 440 = exactly 2:1 standard pool ratio!
export const PLAY_LEFT = 60;
export const PLAY_RIGHT = 940;
export const PLAY_TOP = 50;
export const PLAY_BOTTOM = 490;

export const BALL_RADIUS = 14;

// Pocket throat & drop geometry calibrated to WPA 9-ft tournament specification:
// Ball diameter = 28px (2.25").
// Corner pocket mouth = ~54px (1.92x ball diameter), Side pocket mouth = 56px (2.00x ball diameter).
// Pocket holes are recessed back into the rails and jaw corners meet the pocket rim tangentially
// so cushion bodies NEVER poke into the pocket hole and the hole NEVER protrudes onto the bed!
export const CORNER_POCKET_RADIUS = 24.5;
export const SIDE_POCKET_RADIUS = 23.5;
export const POCKET_CAPTURE_RADIUS = 25; // Radius within which ball center drops over the pocket slate shelf

export interface Pocket {
  id: string;
  x: number;
  y: number;
  radius: number;
  isSide: boolean;
  dropX: number; // center of drop well recessed into the rail
  dropY: number;
}

export const POCKETS: Pocket[] = [
  // Corner pockets: recessed into the corners so their inner rim aligns flush with the cushion jaws
  {
    id: 'top-left',
    x: 52,
    y: 42,
    dropX: 40,
    dropY: 30,
    radius: CORNER_POCKET_RADIUS,
    isSide: false,
  },
  {
    id: 'top-mid',
    x: TABLE_WIDTH / 2,
    y: 38,
    dropX: TABLE_WIDTH / 2,
    dropY: 25,
    radius: SIDE_POCKET_RADIUS,
    isSide: true,
  },
  {
    id: 'top-right',
    x: TABLE_WIDTH - 52,
    y: 42,
    dropX: TABLE_WIDTH - 40,
    dropY: 30,
    radius: CORNER_POCKET_RADIUS,
    isSide: false,
  },
  {
    id: 'bot-left',
    x: 52,
    y: TABLE_HEIGHT - 42,
    dropX: 40,
    dropY: TABLE_HEIGHT - 30,
    radius: CORNER_POCKET_RADIUS,
    isSide: false,
  },
  {
    id: 'bot-mid',
    x: TABLE_WIDTH / 2,
    y: TABLE_HEIGHT - 38,
    dropX: TABLE_WIDTH / 2,
    dropY: TABLE_HEIGHT - 25,
    radius: SIDE_POCKET_RADIUS,
    isSide: true,
  },
  {
    id: 'bot-right',
    x: TABLE_WIDTH - 52,
    y: TABLE_HEIGHT - 42,
    dropX: TABLE_WIDTH - 40,
    dropY: TABLE_HEIGHT - 30,
    radius: CORNER_POCKET_RADIUS,
    isSide: false,
  },
];

export interface CushionSegment {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  normal: { x: number; y: number };
}

/**
 * 6 Main Cushion Rails + 12 Chamfered Pocket Jaws.
 * Every jaw normal is strictly perpendicular to its segment and oriented
 * outward from the solid cushion rubber into the pocket throat / playfield.
 */
export const CUSHION_SEGMENTS: CushionSegment[] = [
  // Top-Left Rail
  {
    id: 'top-left-rail',
    p1: { x: 84, y: PLAY_TOP },
    p2: { x: TABLE_WIDTH / 2 - 28, y: PLAY_TOP },
    normal: { x: 0, y: 1 },
  },
  // Top-Right Rail
  {
    id: 'top-right-rail',
    p1: { x: TABLE_WIDTH / 2 + 28, y: PLAY_TOP },
    p2: { x: TABLE_WIDTH - 84, y: PLAY_TOP },
    normal: { x: 0, y: 1 },
  },
  // Bottom-Left Rail
  {
    id: 'bot-left-rail',
    p1: { x: 84, y: PLAY_BOTTOM },
    p2: { x: TABLE_WIDTH / 2 - 28, y: PLAY_BOTTOM },
    normal: { x: 0, y: -1 },
  },
  // Bottom-Right Rail
  {
    id: 'bot-right-rail',
    p1: { x: TABLE_WIDTH / 2 + 28, y: PLAY_BOTTOM },
    p2: { x: TABLE_WIDTH - 84, y: PLAY_BOTTOM },
    normal: { x: 0, y: -1 },
  },
  // Left Rail
  {
    id: 'left-rail',
    p1: { x: PLAY_LEFT, y: 74 },
    p2: { x: PLAY_LEFT, y: TABLE_HEIGHT - 74 },
    normal: { x: 1, y: 0 },
  },
  // Right Rail
  {
    id: 'right-rail',
    p1: { x: PLAY_RIGHT, y: 74 },
    p2: { x: PLAY_RIGHT, y: TABLE_HEIGHT - 74 },
    normal: { x: -1, y: 0 },
  },

  // Chamfered pocket jaws - normals point into the pocket throat (perpendicular to jaw edge)
  // Top-Left
  { id: 'tl-jaw1', p1: { x: PLAY_LEFT, y: 74 }, p2: { x: 34, y: 54 }, normal: { x: 0.6097, y: -0.7926 } },
  { id: 'tl-jaw2', p1: { x: 84, y: PLAY_TOP }, p2: { x: 64, y: 28 }, normal: { x: -0.7399, y: 0.6727 } },

  // Top-Right
  { id: 'tr-jaw1', p1: { x: TABLE_WIDTH - 84, y: PLAY_TOP }, p2: { x: TABLE_WIDTH - 64, y: 28 }, normal: { x: 0.7399, y: 0.6727 } },
  { id: 'tr-jaw2', p1: { x: PLAY_RIGHT, y: 74 }, p2: { x: TABLE_WIDTH - 34, y: 54 }, normal: { x: -0.6097, y: -0.7926 } },

  // Top-Mid
  { id: 'tm-jaw1', p1: { x: TABLE_WIDTH / 2 - 28, y: PLAY_TOP }, p2: { x: TABLE_WIDTH / 2 - 23.5, y: 28 }, normal: { x: 0.9797, y: 0.2004 } },
  { id: 'tm-jaw2', p1: { x: TABLE_WIDTH / 2 + 28, y: PLAY_TOP }, p2: { x: TABLE_WIDTH / 2 + 23.5, y: 28 }, normal: { x: -0.9797, y: 0.2004 } },

  // Bottom-Left
  { id: 'bl-jaw1', p1: { x: PLAY_LEFT, y: TABLE_HEIGHT - 74 }, p2: { x: 34, y: TABLE_HEIGHT - 54 }, normal: { x: 0.6097, y: 0.7926 } },
  { id: 'bl-jaw2', p1: { x: 84, y: PLAY_BOTTOM }, p2: { x: 64, y: TABLE_HEIGHT - 28 }, normal: { x: -0.7399, y: -0.6727 } },

  // Bottom-Right
  { id: 'br-jaw1', p1: { x: TABLE_WIDTH - 84, y: PLAY_BOTTOM }, p2: { x: TABLE_WIDTH - 64, y: TABLE_HEIGHT - 28 }, normal: { x: 0.7399, y: -0.6727 } },
  { id: 'br-jaw2', p1: { x: PLAY_RIGHT, y: TABLE_HEIGHT - 74 }, p2: { x: TABLE_WIDTH - 34, y: TABLE_HEIGHT - 54 }, normal: { x: -0.6097, y: 0.7926 } },

  // Bottom-Mid
  { id: 'bm-jaw1', p1: { x: TABLE_WIDTH / 2 - 28, y: PLAY_BOTTOM }, p2: { x: TABLE_WIDTH / 2 - 23.5, y: TABLE_HEIGHT - 28 }, normal: { x: 0.9797, y: -0.2004 } },
  { id: 'bm-jaw2', p1: { x: TABLE_WIDTH / 2 + 28, y: PLAY_BOTTOM }, p2: { x: TABLE_WIDTH / 2 + 23.5, y: TABLE_HEIGHT - 28 }, normal: { x: -0.9797, y: -0.2004 } },
];

// Physical constants calibrated to authentic Miniclip 8 Ball Pool & Dr. Dave Alciatore billiard physics
// Scale: 912px playfield = 2.54m (9-ft table) => 1 m/s = 6.0 px/frame, 1 m/s² = 0.10 px/frame²
export const RESTITUTION_BALL = 0.96; // Crisp phenolic resin ball-on-ball energy transfer
export const RESTITUTION_CUSHION = 0.82; // Lively K-66 rubber cushion rebound
export const ROLLING_FRICTION = 0.9945; // Smooth rolling retention across the table
export const COULOMB_FRICTION = 0.0085; // True Simonis cloth rolling resistance (~0.085 m/s² constant deceleration)
export const SPIN_DECAY = 0.982;
export const MIN_SPEED_THRESHOLD = 0.04;

// Kitchen line & spots
export const HEAD_STRING_X = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.25;
export const FOOT_SPOT_X = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.72;
export const FOOT_SPOT_Y = TABLE_HEIGHT / 2;

// Standard ball colors (8 Ball Pool style vibrant phenolic palette)
export const BALL_COLORS: Record<number, { name: string; hex: string; isStripe: boolean }> = {
  0: { name: 'Cue Ball', hex: '#ffffff', isStripe: false },
  1: { name: 'Yellow', hex: '#fbbf24', isStripe: false },
  2: { name: 'Blue', hex: '#2563eb', isStripe: false },
  3: { name: 'Red', hex: '#ef4444', isStripe: false },
  4: { name: 'Purple', hex: '#8b5cf6', isStripe: false },
  5: { name: 'Orange', hex: '#f97316', isStripe: false },
  6: { name: 'Green', hex: '#10b981', isStripe: false },
  7: { name: 'Burgundy', hex: '#991b1b', isStripe: false },
  8: { name: 'Eight Ball', hex: '#111827', isStripe: false },
  9: { name: 'Stripe Yellow', hex: '#fbbf24', isStripe: true },
  10: { name: 'Stripe Blue', hex: '#2563eb', isStripe: true },
  11: { name: 'Stripe Red', hex: '#ef4444', isStripe: true },
  12: { name: 'Stripe Purple', hex: '#8b5cf6', isStripe: true },
  13: { name: 'Stripe Orange', hex: '#f97316', isStripe: true },
  14: { name: 'Stripe Green', hex: '#10b981', isStripe: true },
  15: { name: 'Stripe Burgundy', hex: '#991b1b', isStripe: true },
};

export const TABLE_THEMES: Record<TableTheme, TableThemeConfig> = {
  emerald: {
    id: 'emerald',
    name: 'Classic Tournament',
    feltColor: '#0d734c',
    feltHighlight: '#169664',
    railColor: '#09593a',
    woodTrim: '#3b190b',
    woodGrain: '#632b13',
    pocketRim: '#e2e8f0', // Polished chrome pocket castings
  },
  blue: {
    id: 'blue',
    name: 'Vegas Pro Blue',
    feltColor: '#1d4ed8',
    feltHighlight: '#2563eb',
    railColor: '#1e3a8a',
    woodTrim: '#27170e',
    woodGrain: '#432818',
    pocketRim: '#f1f5f9',
  },
  burgundy: {
    id: 'burgundy',
    name: 'Monaco Luxury',
    feltColor: '#881337',
    feltHighlight: '#be123c',
    railColor: '#650e29',
    woodTrim: '#2c1208',
    woodGrain: '#4d200e',
    pocketRim: '#facc15', // Brushed gold castings
  },
  slate: {
    id: 'slate',
    name: 'Cyber Onyx',
    feltColor: '#334155',
    feltHighlight: '#475569',
    railColor: '#1e293b',
    woodTrim: '#090d16',
    woodGrain: '#1e293b',
    pocketRim: '#38bdf8', // Titanium cyan castings
  },
};
