import { Ball, BallGroup, BotDifficulty, BotShotPlan, PlayerHintSuggestion } from '../types/game';
import {
  BALL_RADIUS,
  COULOMB_FRICTION,
  CUSHION_SEGMENTS,
  HEAD_STRING_X,
  MIN_SPEED_THRESHOLD,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKETS,
  RESTITUTION_BALL,
  RESTITUTION_CUSHION,
  ROLLING_FRICTION,
  SPIN_DECAY,
  TABLE_HEIGHT,
} from '../physics/constants';
import {
  closestPointOnSegment,
  findValidBallPlacement,
  getCapturedPocket,
  getPocketLipOverhang,
  isValidCuePlacement,
} from '../physics/engine';

export interface BotShotDecision {
  aimAngle: number;
  power: number;
  spinX: number;
  spinY: number;
  plan: BotShotPlan | null;
}

interface SimBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinX: number;
  spinY: number;
  radius: number;
  inPocket: boolean;
}

interface SimResult {
  firstBallHitId: number | null;
  firstHitGhostPos: { x: number; y: number } | null;
  cushionsBeforeFirstHit: number;
  pocketedIds: number[];
  pocketedByMap: Record<number, { id: string; dropX: number; dropY: number }>;
  ballCushionsMap: Record<number, number>;
  cuePocketed: boolean;
  eightPocketed: boolean;
  cushionsHitAfterContact: number;
  finalCueX: number;
  finalCueY: number;
  finalBalls: SimBall[];
  cuePath: { x: number; y: number }[];
  cuePathToFirstHit: { x: number; y: number }[];
  ballPaths: Record<number, { x: number; y: number }[]>;
}

interface BaseCandidate {
  ball: SimBall | Ball;
  pocket: (typeof POCKETS)[number];
  aimAngle: number;
  basePower: number;
  cutAngle: number;
  distCueToGhost: number;
  distBallToPocket: number;
  ghostX: number;
  ghostY: number;
  geomScore: number;
  inferredGroup: 'solids' | 'stripes';
}

interface SpinProfile {
  spinX: number;
  spinY: number;
  label: string;
}

const SUPER_SPIN_PROFILES: SpinProfile[] = [
  { spinX: 0, spinY: 0, label: 'Natural Roll' },
  { spinX: 0, spinY: -0.48, label: 'Stun Stop' },
  { spinX: 0, spinY: -0.88, label: 'Backspin Draw' },
  { spinX: 0, spinY: 0.82, label: 'Topspin Follow' },
  { spinX: 0, spinY: -0.22, label: 'Controlled Check' },
  { spinX: 0, spinY: 0.42, label: 'Medium Follow' },
  { spinX: -0.52, spinY: -0.38, label: 'Left English Draw' },
  { spinX: 0.52, spinY: -0.38, label: 'Right English Draw' },
  { spinX: -0.48, spinY: 0.48, label: 'Left English Follow' },
  { spinX: 0.48, spinY: 0.48, label: 'Right English Follow' },
];

/**
 * Checks if line segment between (x1, y1) and (x2, y2) is obstructed by any other ball
 */
function isLineClear(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  balls: { id: number; x: number; y: number; inPocket: boolean }[],
  ignoreIds: number[],
  clearanceMultiplier = 1.92
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;

  const nx = dx / len;
  const ny = dy / len;
  const minClearance = BALL_RADIUS * clearanceMultiplier;

  for (const b of balls) {
    if (b.inPocket || ignoreIds.includes(b.id)) continue;

    const bx = b.x - x1;
    const by = b.y - y1;
    const proj = bx * nx + by * ny;

    // Balls behind the starting point (proj <= 0) are moving away from the forward ray
    if (proj <= 0) continue;

    if (proj >= len) {
      // Beyond the endpoint (x2, y2): check actual Euclidean distance to the endpoint (x2, y2)
      const endDist = Math.hypot(b.x - x2, b.y - y2);
      if (endDist < minClearance) {
        return false;
      }
    } else {
      // Strictly along the interior of the segment (0 < proj < len)
      const perpDist = Math.abs(bx * -ny + by * nx);
      if (perpDist < minClearance) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Exact 16-substep deterministic headless physics simulation matching updatePhysics(..., 16, ..., 1)
 * in src/physics/engine.ts bit-for-bit so the cue ball and object balls stop at the exact predicted pixel.
 */
function simulateShotFast(
  sourceBalls: { id: number; x: number; y: number; radius?: number; inPocket: boolean }[],
  aimAngle: number,
  shotPower: number,
  spinX: number,
  spinY: number,
  recordCuePath: boolean = false
): SimResult {
  const balls: SimBall[] = sourceBalls.map(b => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: 0,
    vy: 0,
    spinX: 0,
    spinY: 0,
    radius: b.radius ?? BALL_RADIUS,
    inPocket: b.inPocket,
  }));

  const cue = balls.find(b => b.id === 0);
  const cuePath: { x: number; y: number }[] = [];
  const cuePathToFirstHit: { x: number; y: number }[] = [];
  const ballPaths: Record<number, { x: number; y: number }[]> = {};
  const pocketedByMap: Record<number, { id: string; dropX: number; dropY: number }> = {};
  const ballCushionsMap: Record<number, number> = {};

  if (!cue || cue.inPocket) {
    return {
      firstBallHitId: null,
      firstHitGhostPos: null,
      cushionsBeforeFirstHit: 0,
      pocketedIds: [],
      pocketedByMap,
      ballCushionsMap,
      cuePocketed: true,
      eightPocketed: false,
      cushionsHitAfterContact: 0,
      finalCueX: cue?.x ?? HEAD_STRING_X,
      finalCueY: cue?.y ?? TABLE_HEIGHT / 2,
      finalBalls: balls,
      cuePath,
      cuePathToFirstHit,
      ballPaths,
    };
  }

  const speed = 3.0 + Math.pow(shotPower, 1.08) * 30.5;
  cue.vx = Math.cos(aimAngle) * speed;
  cue.vy = Math.sin(aimAngle) * speed;
  cue.spinX = spinX;
  cue.spinY = spinY;

  if (recordCuePath) {
    cuePath.push({ x: cue.x, y: cue.y });
    cuePathToFirstHit.push({ x: cue.x, y: cue.y });
    for (const b of balls) {
      if (!b.inPocket && b.id !== 0) {
        ballPaths[b.id] = [{ x: b.x, y: b.y }];
      }
    }
  }

  let firstBallHitId: number | null = null;
  let firstHitGhostPos: { x: number; y: number } | null = null;
  let cushionsBeforeFirstHit = 0;
  const pocketedIds: number[] = [];
  let cuePocketed = false;
  let eightPocketed = false;
  let cushionsHitAfterContact = 0;

  // Always use subSteps = 16 to match updatePhysics(subSteps = 16, frameDt = 1) in src/physics/engine.ts 100%
  // (Fast performance is achieved by skipping stationary ball pairs in step B & D below)
  const subSteps = 16;
  const dt = 1 / subSteps;
  const spinDecayStep = Math.pow(SPIN_DECAY, dt);
  const rollingFrictionStep = Math.pow(ROLLING_FRICTION, dt);
  const maxFrames = recordCuePath ? 720 : 520;

  const safeInteriorLeft = PLAY_LEFT + 18;
  const safeInteriorRight = PLAY_RIGHT - 18;
  const safeInteriorTop = PLAY_TOP + 18;
  const safeInteriorBottom = PLAY_BOTTOM - 18;

  for (let frame = 0; frame < maxFrames; frame++) {
    let anyMoving = false;

    for (let step = 0; step < subSteps; step++) {
      // A. Step active ball positions using current velocity
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.inPocket) continue;
        if (b.vx !== 0 || b.vy !== 0) {
          const s = Math.hypot(b.vx, b.vy);
          if (s > 0.001) {
            anyMoving = true;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
          }
        }
      }

      if (!anyMoving) break;

      // B. Ball-to-Ball collisions with Continuous Collision Detection (CCD) Rewind
      for (let i = 0; i < balls.length; i++) {
        const b1 = balls[i];
        if (b1.inPocket) continue;
        const b1Moving = b1.vx !== 0 || b1.vy !== 0;

        for (let j = i + 1; j < balls.length; j++) {
          const b2 = balls[j];
          if (b2.inPocket) continue;
          // Two stationary balls cannot collide with each other
          if (!b1Moving && b2.vx === 0 && b2.vy === 0) continue;

          let dx = b2.x - b1.x;
          let dy = b2.y - b1.y;
          let dist2 = dx * dx + dy * dy;
          const minDist = b1.radius + b2.radius;

          if (dist2 < minDist * minDist && dist2 > 0) {
            const rvx = b1.vx - b2.vx;
            const rvy = b1.vy - b2.vy;
            const rvSq = rvx * rvx + rvy * rvy;
            const approachDot = rvx * dx + rvy * dy;
            let rewoundTau = 0;

            if (approachDot > 0 && rvSq > 0.0001) {
              const pDotRv = -approachDot;
              const disc = pDotRv * pDotRv - rvSq * (dist2 - minDist * minDist);
              if (disc >= 0) {
                const exactTau = (pDotRv + Math.sqrt(disc)) / rvSq;
                rewoundTau = Math.max(0, Math.min(dt * 1.25, exactTau));
              }
            }

            if (rewoundTau > 0) {
              b1.x -= b1.vx * rewoundTau;
              b1.y -= b1.vy * rewoundTau;
              b2.x -= b2.vx * rewoundTau;
              b2.y -= b2.vy * rewoundTau;
              dx = b2.x - b1.x;
              dy = b2.y - b1.y;
              dist2 = dx * dx + dy * dy;
            }

            const dist = Math.sqrt(dist2) || minDist;
            const nx = dx / dist;
            const ny = dy / dist;

            if (dist < minDist) {
              const overlap = minDist - dist;
              b1.x -= nx * overlap * 0.5;
              b1.y -= ny * overlap * 0.5;
              b2.x += nx * overlap * 0.5;
              b2.y += ny * overlap * 0.5;
            }

            if (recordCuePath) {
              if (b1.id === 0 || b2.id === 0) {
                cuePath.push({ x: cue.x, y: cue.y });
              }
              if (b1.id !== 0 && ballPaths[b1.id]) {
                ballPaths[b1.id].push({ x: b1.x, y: b1.y });
              }
              if (b2.id !== 0 && ballPaths[b2.id]) {
                ballPaths[b2.id].push({ x: b2.x, y: b2.y });
              }
            }

            const velAlongNormal = rvx * nx + rvy * ny;
            if (velAlongNormal > 0) {
              const impulse = (1 + RESTITUTION_BALL) * velAlongNormal * 0.5;
              b1.vx -= impulse * nx;
              b1.vy -= impulse * ny;
              b2.vx += impulse * nx;
              b2.vy += impulse * ny;

              const cBall = b1.id === 0 ? b1 : b2.id === 0 ? b2 : null;
              const sign = b1.id === 0 ? 1 : -1;
              if (cBall) {
                if (cBall.spinY < -0.05) {
                  const drawForce = Math.abs(cBall.spinY) * Math.min(velAlongNormal * 0.68, 6.2);
                  cBall.vx -= sign * nx * drawForce;
                  cBall.vy -= sign * ny * drawForce;
                  cBall.spinY *= 0.25;
                } else if (cBall.spinY > 0.05) {
                  const followForce = cBall.spinY * Math.min(velAlongNormal * 0.55, 5.2);
                  cBall.vx += sign * nx * followForce;
                  cBall.vy += sign * ny * followForce;
                  cBall.spinY *= 0.3;
                }
                if (Math.abs(cBall.spinX) > 0.05) {
                  const throwForce = cBall.spinX * Math.min(velAlongNormal * 0.16, 1.4);
                  cBall.vx += sign * -ny * throwForce;
                  cBall.vy += sign * nx * throwForce;
                  cBall.spinX *= 0.7;
                }
              }

              if (firstBallHitId === null) {
                if (b1.id === 0) {
                  firstBallHitId = b2.id;
                  firstHitGhostPos = { x: b1.x, y: b1.y };
                  if (recordCuePath) {
                    cuePathToFirstHit.push({ x: b1.x, y: b1.y });
                  }
                } else if (b2.id === 0) {
                  firstBallHitId = b1.id;
                  firstHitGhostPos = { x: b2.x, y: b2.y };
                  if (recordCuePath) {
                    cuePathToFirstHit.push({ x: b2.x, y: b2.y });
                  }
                }
              }

              const forwardTau = Math.min(dt, rewoundTau);
              if (forwardTau > 0) {
                b1.x += b1.vx * forwardTau;
                b1.y += b1.vy * forwardTau;
                b2.x += b2.vx * forwardTau;
                b2.y += b2.vy * forwardTau;
              }
            }
          }
        }
      }

      // C. Pocket capture check
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.inPocket) continue;
        if (
          b.x > safeInteriorLeft &&
          b.x < safeInteriorRight &&
          b.y > safeInteriorTop &&
          b.y < safeInteriorBottom
        ) {
          continue;
        }

        const capturedPocket = getCapturedPocket(b.x, b.y);
        if (capturedPocket) {
          b.inPocket = true;
          b.vx = 0;
          b.vy = 0;
          if (b.id === 0) {
            cuePocketed = true;
            if (recordCuePath) {
              cuePath.push({ x: capturedPocket.dropX, y: capturedPocket.dropY });
            }
          } else {
            pocketedByMap[b.id] = {
              id: capturedPocket.id,
              dropX: capturedPocket.dropX,
              dropY: capturedPocket.dropY,
            };
            if (recordCuePath && ballPaths[b.id]) {
              ballPaths[b.id].push({ x: capturedPocket.dropX, y: capturedPocket.dropY });
            }
            if (b.id === 8) {
              eightPocketed = true;
              pocketedIds.push(8);
            } else {
              pocketedIds.push(b.id);
            }
          }
        }
      }

      if (cuePocketed) {
        return {
          firstBallHitId,
          firstHitGhostPos,
          cushionsBeforeFirstHit,
          pocketedIds,
          pocketedByMap,
          ballCushionsMap,
          cuePocketed: true,
          eightPocketed,
          cushionsHitAfterContact,
          finalCueX: cue.x,
          finalCueY: cue.y,
          finalBalls: balls,
          cuePath,
          cuePathToFirstHit,
          ballPaths,
        };
      }

      // D. Ball-to-Cushion collisions (exact match to engine.ts lines 553-646)
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.inPocket || (b.vx === 0 && b.vy === 0)) continue;
        if (
          b.x > safeInteriorLeft &&
          b.x < safeInteriorRight &&
          b.y > safeInteriorTop &&
          b.y < safeInteriorBottom
        ) {
          continue;
        }

        if (getCapturedPocket(b.x, b.y)) continue;

        for (let sIdx = 0; sIdx < CUSHION_SEGMENTS.length; sIdx++) {
          const seg = CUSHION_SEGMENTS[sIdx];
          const closest = closestPointOnSegment(b.x, b.y, seg.p1, seg.p2);
          const dx = b.x - closest.x;
          const dy = b.y - closest.y;
          const dist = Math.hypot(dx, dy);

          if (dist < b.radius) {
            let nx = dist > 0 ? dx / dist : seg.normal.x;
            let ny = dist > 0 ? dy / dist : seg.normal.y;

            if (nx * seg.normal.x + ny * seg.normal.y < -0.2) {
              nx = seg.normal.x;
              ny = seg.normal.y;
            }

            const penetration = b.radius - dist;
            const vDotN = b.vx * nx + b.vy * ny;

            if (vDotN < 0) {
              const rewoundTau = Math.min(dt, penetration / Math.abs(vDotN));
              b.x -= b.vx * rewoundTau;
              b.y -= b.vy * rewoundTau;

              const checkClosest = closestPointOnSegment(b.x, b.y, seg.p1, seg.p2);
              const remDist = Math.hypot(b.x - checkClosest.x, b.y - checkClosest.y);
              if (remDist < b.radius) {
                b.x += nx * (b.radius - remDist);
                b.y += ny * (b.radius - remDist);
              }

              if (recordCuePath) {
                if (b.id === 0) {
                  cuePath.push({ x: b.x, y: b.y });
                  if (firstBallHitId === null) {
                    cuePathToFirstHit.push({ x: b.x, y: b.y });
                  }
                } else if (ballPaths[b.id]) {
                  ballPaths[b.id].push({ x: b.x, y: b.y });
                }
              }

              const isOverhangingJaw =
                seg.id.includes('jaw') &&
                Math.hypot(b.vx, b.vy) < 2.2 &&
                getPocketLipOverhang(b.x, b.y) !== null;
              const effectiveRestitution = isOverhangingJaw ? 0.12 : RESTITUTION_CUSHION;
              b.vx = b.vx - (1 + effectiveRestitution) * vDotN * nx;
              b.vy = b.vy - (1 + effectiveRestitution) * vDotN * ny;

              if (b.id === 0 && Math.abs(b.spinX) > 0.05) {
                const tangentX = -ny;
                const tangentY = nx;
                const spinThrow = b.spinX * Math.min(Math.abs(vDotN) * 0.48, 3.2);
                b.vx += tangentX * spinThrow;
                b.vy += tangentY * spinThrow;
                b.spinX *= 0.55;
              }

              b.x += b.vx * rewoundTau;
              b.y += b.vy * rewoundTau;

              if (firstBallHitId !== null) {
                cushionsHitAfterContact++;
                if (b.id !== 0) {
                  ballCushionsMap[b.id] = (ballCushionsMap[b.id] || 0) + 1;
                }
              } else if (b.id === 0) {
                cushionsBeforeFirstHit++;
              }
            } else {
              b.x += nx * penetration;
              b.y += ny * penetration;
            }
          }
        }
      }

      // E. Cloth spin interaction, rolling friction, and pocket lip overhang tipping
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.inPocket) continue;
        if (b.vx === 0 && b.vy === 0 && b.spinX === 0 && b.spinY === 0) continue;

        const speed = Math.hypot(b.vx, b.vy);

        // Ball spin decay & cloth interaction
        if (Math.abs(b.spinX) > 0.015 || Math.abs(b.spinY) > 0.015) {
          if (b.id === 0 && speed > 0.1) {
            const dirX = b.vx / speed;
            const dirY = b.vy / speed;
            b.vx += dirX * b.spinY * 0.035 * dt;
            b.vy += dirY * b.spinY * 0.035 * dt;
          }
          b.spinX *= spinDecayStep;
          b.spinY *= spinDecayStep;
        }

        const nearPocketEdge =
          b.x <= safeInteriorLeft ||
          b.x >= safeInteriorRight ||
          b.y <= safeInteriorTop ||
          b.y >= safeInteriorBottom;
        const lipState = nearPocketEdge ? getPocketLipOverhang(b.x, b.y) : null;
        const curSpeed = Math.hypot(b.vx, b.vy);
        if (curSpeed > 0) {
          const viscousSpeed = curSpeed * rollingFrictionStep;
          const effectiveCoulomb = lipState
            ? COULOMB_FRICTION * Math.max(0, 0.25 * (1 - lipState.overhang * 1.5))
            : COULOMB_FRICTION;
          const nextSpeed = Math.max(0, viscousSpeed - effectiveCoulomb * dt);

          if (nextSpeed < MIN_SPEED_THRESHOLD && !lipState) {
            b.vx = 0;
            b.vy = 0;
            b.spinX = 0;
            b.spinY = 0;
          } else {
            const scale = curSpeed > 1e-6 ? nextSpeed / curSpeed : 0;
            b.vx *= scale;
            b.vy *= scale;
          }
        }

        // Pocket lip overhang tipping
        if (lipState && curSpeed < 2.2 && lipState.d > 0.001) {
          const nx = (lipState.pocket.dropX - b.x) / lipState.d;
          const ny = (lipState.pocket.dropY - b.y) / lipState.d;
          const tipAccel = (0.026 + 0.088 * lipState.overhang * lipState.overhang) * dt;
          b.vx += nx * tipAccel;
          b.vy += ny * tipAccel;
          anyMoving = true;
        }
      }
    }

    if (recordCuePath && frame % 3 === 0) {
      if (!cue.inPocket) {
        const lastPt = cuePath[cuePath.length - 1];
        if (!lastPt || Math.hypot(cue.x - lastPt.x, cue.y - lastPt.y) > 3.5) {
          cuePath.push({ x: cue.x, y: cue.y });
        }
      }
      for (const b of balls) {
        if (!b.inPocket && b.id !== 0 && ballPaths[b.id]) {
          const pts = ballPaths[b.id];
          const lastB = pts[pts.length - 1];
          if (!lastB || Math.hypot(b.x - lastB.x, b.y - lastB.y) > 3.5) {
            pts.push({ x: b.x, y: b.y });
          }
        }
      }
    }

    if (!anyMoving) {
      let allStopped = true;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.inPocket) continue;
        if (Math.hypot(b.vx, b.vy) > MIN_SPEED_THRESHOLD) {
          allStopped = false;
          break;
        }
        if (
          (b.x <= safeInteriorLeft ||
            b.x >= safeInteriorRight ||
            b.y <= safeInteriorTop ||
            b.y >= safeInteriorBottom) &&
          getPocketLipOverhang(b.x, b.y) !== null
        ) {
          allStopped = false;
          break;
        }
      }
      if (allStopped) break;
    }
  }

  if (recordCuePath) {
    if (!cue.inPocket) {
      cuePath.push({ x: cue.x, y: cue.y });
    }
    for (const b of balls) {
      if (!b.inPocket && b.id !== 0 && ballPaths[b.id]) {
        const pts = ballPaths[b.id];
        const lastB = pts[pts.length - 1];
        if (!lastB || Math.hypot(b.x - lastB.x, b.y - lastB.y) > 1.0) {
          pts.push({ x: b.x, y: b.y });
        }
      }
    }
  }

  return {
    firstBallHitId,
    firstHitGhostPos,
    cushionsBeforeFirstHit,
    pocketedIds,
    pocketedByMap,
    ballCushionsMap,
    cuePocketed,
    eightPocketed,
    cushionsHitAfterContact,
    finalCueX: cue.x,
    finalCueY: cue.y,
    finalBalls: balls,
    cuePath,
    cuePathToFirstHit,
    ballPaths,
  };
}

/**
 * Returns remaining legal target balls for a given group on a ball list
 */
function getLegalTargetBalls<T extends { id: number; x: number; y: number; inPocket: boolean }>(
  balls: T[],
  group: 'solids' | 'stripes'
): T[] {
  const isSolids = group === 'solids';
  const groupBalls = balls.filter(
    b => !b.inPocket && (isSolids ? b.id >= 1 && b.id <= 7 : b.id >= 9 && b.id <= 15)
  );
  if (groupBalls.length > 0) return groupBalls;

  const eightBall = balls.find(b => !b.inPocket && b.id === 8);
  return eightBall ? [eightBall] : [];
}

interface NextShotCandidate {
  ballId: number;
  pocketId: string;
  ballPos: { x: number; y: number };
  ghostBall: { x: number; y: number };
  aimAngle: number;
  power: number;
  score: number;
}

/**
 * Evaluates the quality of the cue ball's resting position (cueX, cueY) for the NEXT shot (B2 -> P2).
 * When verifyWithSecondSim is true, it simulates the 2nd shot with simulateShotFast and ONLY selects
 * a nextBallId that is 100% physics-verified to pot legally without scratching!
 */
function evaluateNextShotPosition(
  cueX: number,
  cueY: number,
  ballsAfterShot: SimBall[],
  group: 'solids' | 'stripes',
  verifyWithSecondSim: boolean = false,
  initialBalls?: { id: number; x: number; y: number }[]
): {
  positionScore: number;
  nextBallId: number | null;
  nextPocketId: string | null;
  nextGhostBall: { x: number; y: number } | null;
  nextBallPos: { x: number; y: number } | null;
  nextAimAngle: number;
  nextPower: number;
  nextSpinX: number;
  nextSpinY: number;
} {
  const nextTargets = getLegalTargetBalls(ballsAfterShot, group);
  if (nextTargets.length === 0) {
    return {
      positionScore: 100, // Game won!
      nextBallId: null,
      nextPocketId: null,
      nextGhostBall: null,
      nextBallPos: null,
      nextAimAngle: 0,
      nextPower: 0.5,
      nextSpinX: 0,
      nextSpinY: 0,
    };
  }

  // Penalty if cue ball is frozen against a cushion rail or deep in a pocket jaw
  const railMargin = 26;
  let railPenalty = 0;
  if (
    cueX < PLAY_LEFT + railMargin ||
    cueX > PLAY_RIGHT - railMargin ||
    cueY < PLAY_TOP + railMargin ||
    cueY > PLAY_BOTTOM - railMargin
  ) {
    railPenalty = 2.8;
  }

  const candidates: NextShotCandidate[] = [];

  for (const nextBall of nextTargets) {
    // Small bonus if this next target ball wasn't disturbed during Shot 1
    let stationaryBonus = 0;
    if (initialBalls) {
      const orig = initialBalls.find(b => b.id === nextBall.id);
      if (orig && Math.hypot(orig.x - nextBall.x, orig.y - nextBall.y) < 1.5) {
        stationaryBonus = 2.5;
      }
    }

    for (const pocket of POCKETS) {
      const toPocketDx = pocket.dropX - nextBall.x;
      const toPocketDy = pocket.dropY - nextBall.y;
      const distToPocket = Math.hypot(toPocketDx, toPocketDy);
      if (distToPocket < 10) continue;

      const pocketDirX = toPocketDx / distToPocket;
      const pocketDirY = toPocketDy / distToPocket;

      const ghostX = nextBall.x - pocketDirX * (BALL_RADIUS * 2);
      const ghostY = nextBall.y - pocketDirY * (BALL_RADIUS * 2);

      // Ghost ball must be comfortably on the play surface
      if (
        ghostX < PLAY_LEFT + BALL_RADIUS * 0.5 ||
        ghostX > PLAY_RIGHT - BALL_RADIUS * 0.5 ||
        ghostY < PLAY_TOP + BALL_RADIUS * 0.5 ||
        ghostY > PLAY_BOTTOM - BALL_RADIUS * 0.5
      ) {
        continue;
      }

      const cueToGhostDx = ghostX - cueX;
      const cueToGhostDy = ghostY - cueY;
      const distCueToGhost = Math.hypot(cueToGhostDx, cueToGhostDy);

      // Too close (< 22px) means cue ball is practically touching / awkward bridge
      if (distCueToGhost < 22) continue;

      const cueDirX = cueToGhostDx / distCueToGhost;
      const cueDirY = cueToGhostDy / distCueToGhost;

      const dot = cueDirX * pocketDirX + cueDirY * pocketDirY;
      const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

      // For next shot shape, we want a reliable cut angle (< 64 degrees)
      if (cutAngle > (64 * Math.PI) / 180) continue;

      const cueClear = isLineClear(
        cueX,
        cueY,
        ghostX,
        ghostY,
        ballsAfterShot,
        [0, nextBall.id],
        1.92
      );
      if (!cueClear) continue;

      const pocketClear = isLineClear(
        nextBall.x,
        nextBall.y,
        pocket.dropX,
        pocket.dropY,
        ballsAfterShot,
        [0, nextBall.id],
        1.88
      );
      if (!pocketClear) continue;

      // 1. Cut angle quality: 0-22 deg is dead straight/ideal shape
      const cutQuality = Math.pow(Math.cos(cutAngle), 1.6);

      // 2. Ideal cue-to-object distance: sweet spot is 75px to 240px
      let distCueQuality = 1.0;
      if (distCueToGhost < 75) {
        distCueQuality = 0.65 + (distCueToGhost / 75) * 0.35;
      } else {
        distCueQuality = Math.max(0.25, 1.0 - (distCueToGhost - 75) / 520);
      }

      // 3. Object-ball-to-pocket distance quality
      const distPocketQuality = Math.max(0.25, 1.0 - distToPocket / 750);

      // 4. Side pocket entry angle check (side pockets prefer straighter entry from center)
      let pocketEntryBonus = 0;
      if (pocket.id.includes('mid')) {
        const verticality = Math.abs(pocketDirY);
        if (verticality < 0.55) continue;
        pocketEntryBonus = verticality * 1.2;
      } else {
        pocketEntryBonus = 1.0;
      }

      const candidateScore =
        cutQuality * 14.0 +
        distCueQuality * 8.0 +
        distPocketQuality * 6.0 +
        pocketEntryBonus +
        stationaryBonus -
        railPenalty;

      const totalDist = distCueToGhost + distToPocket;
      const power = Math.min(0.85, Math.max(0.36, totalDist / 1100 + 0.34 + cutAngle * 0.1));

      candidates.push({
        ballId: nextBall.id,
        pocketId: pocket.id,
        ballPos: { x: nextBall.x, y: nextBall.y },
        ghostBall: { x: ghostX, y: ghostY },
        aimAngle: Math.atan2(cueToGhostDy, cueToGhostDx),
        power,
        score: candidateScore,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const multiOptionBonus = Math.min(candidates.length, 3) * 1.6;

  if (candidates.length === 0) {
    return {
      positionScore: -15 - railPenalty,
      nextBallId: null,
      nextPocketId: null,
      nextGhostBall: null,
      nextBallPos: null,
      nextAimAngle: 0,
      nextPower: 0.5,
      nextSpinX: 0,
      nextSpinY: 0,
    };
  }

  if (!verifyWithSecondSim) {
    const top = candidates[0];
    return {
      positionScore: top.score + multiOptionBonus,
      nextBallId: top.ballId,
      nextPocketId: top.pocketId,
      nextGhostBall: top.ghostBall,
      nextBallPos: top.ballPos,
      nextAimAngle: top.aimAngle,
      nextPower: top.power,
      nextSpinX: 0,
      nextSpinY: 0,
    };
  }

  // 2nd-Ply Physics Verification: test top 2 candidates with simulateShotFast
  const maxToVerify = Math.min(candidates.length, 2);
  for (let i = 0; i < maxToVerify; i++) {
    const cand = candidates[i];
    const testShots = [
      { angle: cand.aimAngle, power: cand.power, spinX: 0, spinY: 0 },
      { angle: cand.aimAngle, power: cand.power, spinX: 0, spinY: -0.45 },
    ];

    for (const ts of testShots) {
      const sim2 = simulateShotFast(ballsAfterShot, ts.angle, ts.power, ts.spinX, ts.spinY, false);
      const pottedNext = sim2.pocketedIds.includes(cand.ballId);
      const legal2 =
        !sim2.cuePocketed &&
        (!sim2.eightPocketed || cand.ballId === 8) &&
        sim2.firstBallHitId === cand.ballId;

      if (pottedNext && legal2) {
        return {
          positionScore: cand.score + 24.0 + multiOptionBonus,
          nextBallId: cand.ballId,
          nextPocketId: cand.pocketId,
          nextGhostBall: cand.ghostBall,
          nextBallPos: cand.ballPos,
          nextAimAngle: ts.angle,
          nextPower: ts.power,
          nextSpinX: ts.spinX,
          nextSpinY: ts.spinY,
        };
      }
    }
  }

  // None of the top geometric candidates passed 2nd-ply physics verification
  return {
    positionScore: candidates[0].score - 12.0,
    nextBallId: null,
    nextPocketId: null,
    nextGhostBall: null,
    nextBallPos: null,
    nextAimAngle: 0,
    nextPower: 0.5,
    nextSpinX: 0,
    nextSpinY: 0,
  };
}

/**
 * Smart Ball-in-Hand Placement for AI Bot when opponent fouls.
 * Finds a legal cue ball placement on the table that gives a dead-straight pot on B1
 * AND natural position on B2.
 */
export function findBestBotCuePlacement(
  balls: Ball[],
  botGroup: BallGroup,
  difficulty: BotDifficulty = 'super'
): { x: number; y: number } {
  if (difficulty === 'easy') {
    return findValidBallPlacement(balls, HEAD_STRING_X, TABLE_HEIGHT / 2);
  }

  const groupsToCheck: ('solids' | 'stripes')[] = botGroup ? [botGroup] : ['solids', 'stripes'];
  let bestSpot: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (const grp of groupsToCheck) {
    const targets = getLegalTargetBalls(balls, grp);
    for (const ball of targets) {
      for (const pocket of POCKETS) {
        const toPocketDx = pocket.dropX - ball.x;
        const toPocketDy = pocket.dropY - ball.y;
        const distToPocket = Math.hypot(toPocketDx, toPocketDy);
        if (distToPocket < 15) continue;

        const pocketClear = isLineClear(
          ball.x,
          ball.y,
          pocket.dropX,
          pocket.dropY,
          balls,
          [0, ball.id],
          1.92
        );
        if (!pocketClear) continue;

        const dirX = toPocketDx / distToPocket;
        const dirY = toPocketDy / distToPocket;

        for (const backDist of [115, 155]) {
          for (const angleOffset of [0, -0.18, 0.18]) {
            const cosA = Math.cos(angleOffset);
            const sinA = Math.sin(angleOffset);
            const rDirX = dirX * cosA - dirY * sinA;
            const rDirY = dirX * sinA + dirY * cosA;

            const placeX = ball.x - rDirX * backDist;
            const placeY = ball.y - rDirY * backDist;

            if (!isValidCuePlacement(placeX, placeY, balls, false)) continue;

            const ghostX = ball.x - dirX * (BALL_RADIUS * 2);
            const ghostY = ball.y - dirY * (BALL_RADIUS * 2);
            if (!isLineClear(placeX, placeY, ghostX, ghostY, balls, [0, ball.id], 1.92)) continue;

            const score = 30 - distToPocket / 40 - Math.abs(angleOffset) * 10;
            if (score > bestScore) {
              bestScore = score;
              bestSpot = { x: placeX, y: placeY };
            }
          }
        }
      }
    }
  }

  return bestSpot ?? findValidBallPlacement(balls, HEAD_STRING_X, TABLE_HEIGHT / 2);
}

/**
 * Helper that searches spin profiles, power variations, and micro-angles for a list of candidates
 * and returns the highest-scoring 2-ply verified decision.
 */
function findBestDecisionForCandidates(
  candidatesToSearch: BaseCandidate[],
  balls: Ball[],
  botGroup: BallGroup,
  difficulty: BotDifficulty,
  plannedCommitment?: {
    aimAngle?: number;
    power?: number;
    spinX?: number;
    spinY?: number;
  }
): BotShotDecision | null {
  const spinProfiles =
    difficulty === 'super' ? SUPER_SPIN_PROFILES.slice(0, 5) : SUPER_SPIN_PROFILES.slice(0, 3);
  const defaultPowers =
    difficulty === 'super' ? [0.42, 0.62, 0.82] : [0.45, 0.68];
  const angleMicroOffsets = [0];

  let bestOverallScore = -Infinity;
  let bestDecision: BotShotDecision | null = null;

  for (const cand of candidatesToSearch) {
    const targetId = cand.ball.id;
    const grp = cand.inferredGroup;
    const isEightTarget = targetId === 8;

    const powerVariations = [cand.basePower, ...defaultPowers];
    if (plannedCommitment?.power !== undefined) {
      powerVariations.unshift(plannedCommitment.power);
    }

    for (const spinProf of spinProfiles) {
      const throwComp = -spinProf.spinX * 0.0055;

      const anglesToTest = angleMicroOffsets.map(m => cand.aimAngle + throwComp + m);

      if (plannedCommitment?.aimAngle !== undefined && Math.abs(spinProf.spinX) < 0.05) {
        anglesToTest.unshift(plannedCommitment.aimAngle);
      }

      for (const testAngle of anglesToTest) {
        for (const testPower of powerVariations) {
          const sim = simulateShotFast(
            balls,
            testAngle,
            testPower,
            spinProf.spinX,
            spinProf.spinY,
            false
          );

          // 1. Disqualify any scratch or illegal 8-ball sink
          if (sim.cuePocketed) continue;
          if (sim.eightPocketed && !isEightTarget) continue;
          if (sim.firstBallHitId === null) continue;

          // Validate first ball hit legality
          if (!isEightTarget) {
            const hitIsSolid = sim.firstBallHitId >= 1 && sim.firstBallHitId <= 7;
            const hitIsStripe = sim.firstBallHitId >= 9 && sim.firstBallHitId <= 15;
            if (botGroup === 'solids' && !hitIsSolid) continue;
            if (botGroup === 'stripes' && !hitIsStripe) continue;
            if (!botGroup && sim.firstBallHitId === 8) continue;
          } else {
            if (sim.firstBallHitId !== 8) continue;
          }

          // 2. Did the shot pot the intended target ball?
          const pottedTarget = sim.pocketedIds.includes(targetId);
          if (!pottedTarget) continue;

          // On an open table, ensure the FIRST numbered ball pocketed matches our inferredGroup
          const numberedPocketed = sim.pocketedIds.filter(id => id >= 1 && id <= 15 && id !== 8);
          if (!botGroup && numberedPocketed.length > 0) {
            const firstSunkIsSolid = numberedPocketed[0] <= 7;
            if (
              (grp === 'solids' && !firstSunkIsSolid) ||
              (grp === 'stripes' && firstSunkIsSolid)
            ) {
              continue;
            }
          }

          const legalPocketedCount = sim.pocketedIds.filter(id => {
            if (isEightTarget) return id === 8;
            return grp === 'solids' ? id >= 1 && id <= 7 : id >= 9 && id <= 15;
          }).length;

          const opponentPocketedCount = sim.pocketedIds.length - legalPocketedCount;

          // 3. Evaluate 2nd-Ply Position Play (shape on the NEXT ball B2!)
          const nextEval = evaluateNextShotPosition(
            sim.finalCueX,
            sim.finalCueY,
            sim.finalBalls,
            grp,
            difficulty === 'super',
            balls
          );

          const potBonus = 40 + legalPocketedCount * 10 - opponentPocketedCount * 12;
          const powerEconomyBonus = (1.0 - Math.abs(testPower - 0.52)) * 1.5;

          const totalScore =
            potBonus + cand.geomScore * 2.5 + nextEval.positionScore + powerEconomyBonus;

          if (totalScore > bestOverallScore) {
            bestOverallScore = totalScore;

            const nextBallLabel =
              nextEval.nextBallId === 8
                ? 'the 8-Ball'
                : nextEval.nextBallId
                ? `#${nextEval.nextBallId}`
                : null;

            const strategyText = nextBallLabel
              ? `Pot #${targetId} (${spinProf.label}) → Shape for ${nextBallLabel}`
              : targetId === 8
              ? `Winning 8-Ball Pot (${spinProf.label})`
              : `Pot #${targetId} (${spinProf.label}) → Center Table Control`;

            const confidence = Math.min(
              99,
              Math.max(80, Math.round(84 + Math.min(15, Math.max(0, nextEval.positionScore / 3.5))))
            );

            bestDecision = {
              aimAngle: testAngle,
              power: testPower,
              spinX: spinProf.spinX,
              spinY: spinProf.spinY,
              plan: {
                targetBallId: targetId,
                targetPocketId: cand.pocket.id,
                cueBallPath: [],
                plannedCueStop: {
                  x: sim.finalCueX,
                  y: sim.finalCueY,
                },
                nextTargetBallId: nextEval.nextBallId,
                nextTargetPocketId: nextEval.nextPocketId,
                nextGhostBall: nextEval.nextGhostBall,
                nextBallPos: nextEval.nextBallPos,
                nextAimAngle: nextEval.nextAimAngle,
                nextPower: nextEval.nextPower,
                nextSpinX: nextEval.nextSpinX,
                nextSpinY: nextEval.nextSpinY,
                inferredGroup: grp,
                spinLabel: spinProf.label,
                strategyText,
                confidence,
              },
            };
          }
        }
      }
    }
  }

  // Run full 16-substep path trace ONLY ONCE for the final winning shot
  if (bestDecision && bestDecision.plan) {
    const detailedSim = simulateShotFast(
      balls,
      bestDecision.aimAngle,
      bestDecision.power,
      bestDecision.spinX,
      bestDecision.spinY,
      true
    );
    bestDecision.plan.cueBallPath = detailedSim.cuePath;
    bestDecision.plan.plannedCueStop = {
      x: detailedSim.finalCueX,
      y: detailedSim.finalCueY,
    };
  }

  return bestDecision;
}

/**
 * Computes optimal shot choice for AI player with 2-Ply Physics Lookahead & Cue-Ball Position Control.
 * If previousPlan is provided (when the bot continues its turn after pocketing a ball),
 * it strictly commits to executing the planned nextTargetBallId from the previous shot!
 */
export function calculateBotShot(
  balls: Ball[],
  botGroup: BallGroup,
  difficulty: BotDifficulty = 'super',
  previousPlan: BotShotPlan | null = null
): BotShotDecision {
  const cueBall = balls.find(b => b.id === 0);
  if (!cueBall) {
    return { aimAngle: 0, power: 0.5, spinX: 0, spinY: 0, plan: null };
  }

  const groupsToEvaluate: ('solids' | 'stripes')[] = botGroup
    ? [botGroup]
    : ['solids', 'stripes'];

  const baseCandidates: BaseCandidate[] = [];

  for (const grp of groupsToEvaluate) {
    const legalBalls = getLegalTargetBalls(balls, grp);

    for (const ball of legalBalls) {
      for (const pocket of POCKETS) {
        const toPocketDx = pocket.dropX - ball.x;
        const toPocketDy = pocket.dropY - ball.y;
        const distToPocket = Math.hypot(toPocketDx, toPocketDy);
        if (distToPocket < 10) continue;

        const pocketDirX = toPocketDx / distToPocket;
        const pocketDirY = toPocketDy / distToPocket;

        const ghostX = ball.x - pocketDirX * (BALL_RADIUS * 2);
        const ghostY = ball.y - pocketDirY * (BALL_RADIUS * 2);

        if (
          ghostX < PLAY_LEFT - 6 ||
          ghostX > PLAY_RIGHT + 6 ||
          ghostY < PLAY_TOP - 6 ||
          ghostY > PLAY_BOTTOM + 6
        ) {
          continue;
        }

        const cueToGhostDx = ghostX - cueBall.x;
        const cueToGhostDy = ghostY - cueBall.y;
        const distCueToGhost = Math.hypot(cueToGhostDx, cueToGhostDy);
        if (distCueToGhost < 2) continue;

        const cueDirX = cueToGhostDx / distCueToGhost;
        const cueDirY = cueToGhostDy / distCueToGhost;

        const dot = cueDirX * pocketDirX + cueDirY * pocketDirY;
        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

        if (cutAngle > (76 * Math.PI) / 180) continue;

        const cueClear = isLineClear(
          cueBall.x,
          cueBall.y,
          ghostX,
          ghostY,
          balls,
          [0, ball.id],
          1.84
        );
        if (!cueClear) continue;

        const pocketClear = isLineClear(
          ball.x,
          ball.y,
          pocket.dropX,
          pocket.dropY,
          balls,
          [0, ball.id],
          1.84
        );
        if (!pocketClear) continue;

        const cutScore = Math.cos(cutAngle);
        const distScore = 1.0 - Math.min(distToPocket / 800, 0.8);
        const cueDistScore = 1.0 - Math.min(distCueToGhost / 800, 0.5);
        const geomScore = cutScore * 3.5 + distScore * 2.0 + cueDistScore * 1.0;

        const totalDist = distCueToGhost + distToPocket;
        let basePower = Math.min(Math.max(totalDist / 1100 + 0.34, 0.34), 0.86);
        basePower += cutAngle * 0.12;
        basePower = Math.min(basePower, 0.92);

        const aimAngle = Math.atan2(cueToGhostDy, cueToGhostDx);

        baseCandidates.push({
          ball,
          pocket,
          aimAngle,
          basePower,
          cutAngle,
          distCueToGhost,
          distBallToPocket: distToPocket,
          ghostX,
          ghostY,
          geomScore,
          inferredGroup: grp,
        });
      }
    }
  }

  baseCandidates.sort((a, b) => b.geomScore - a.geomScore);

  // ============================================================================
  // SUPER AI & MASTER AI: Physics-Simulated 2-Ply Position Play Search
  // ============================================================================
  if (difficulty === 'super' || difficulty === 'hard') {
    // 1. STRICT PLAN CONTINUITY: If the bot planned a specific nextTargetBallId on the previous shot,
    //    and that ball is still on the table and legal, execute that planned ball first!
    if (previousPlan && previousPlan.nextTargetBallId !== null) {
      const plannedBallId = previousPlan.nextTargetBallId;
      const plannedPocketId = previousPlan.nextTargetPocketId;
      const effectiveGroup = botGroup ?? previousPlan.inferredGroup ?? 'solids';
      const legalNow = getLegalTargetBalls(balls, effectiveGroup);
      const plannedBallObj = legalNow.find(b => b.id === plannedBallId && !b.inPocket);

      if (plannedBallObj) {
        // Gather candidates for this exact planned ball (prioritizing the exact planned pocket)
        const plannedCandidates = baseCandidates.filter(c => c.ball.id === plannedBallId);
        plannedCandidates.sort((a, b) => {
          const aMatch = a.pocket.id === plannedPocketId ? 1 : 0;
          const bMatch = b.pocket.id === plannedPocketId ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          return b.geomScore - a.geomScore;
        });

        // If exact planned pocket wasn't in baseCandidates due to strict geometric filter, construct it directly
        if (
          plannedPocketId &&
          !plannedCandidates.some(c => c.pocket.id === plannedPocketId)
        ) {
          const pocketObj = POCKETS.find(p => p.id === plannedPocketId);
          if (pocketObj) {
            const toPocketDx = pocketObj.dropX - plannedBallObj.x;
            const toPocketDy = pocketObj.dropY - plannedBallObj.y;
            const distToPocket = Math.hypot(toPocketDx, toPocketDy) || 1;
            const ghostX = plannedBallObj.x - (toPocketDx / distToPocket) * (BALL_RADIUS * 2);
            const ghostY = plannedBallObj.y - (toPocketDy / distToPocket) * (BALL_RADIUS * 2);
            const aimAngle =
              previousPlan.nextAimAngle ??
              Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x);

            plannedCandidates.unshift({
              ball: plannedBallObj,
              pocket: pocketObj,
              aimAngle,
              basePower: previousPlan.nextPower ?? 0.52,
              cutAngle: 0.2,
              distCueToGhost: Math.hypot(ghostX - cueBall.x, ghostY - cueBall.y),
              distBallToPocket: distToPocket,
              ghostX,
              ghostY,
              geomScore: 6.0,
              inferredGroup: effectiveGroup,
            });
          }
        }

        if (plannedCandidates.length > 0) {
          const committedDecision = findBestDecisionForCandidates(
            plannedCandidates,
            balls,
            botGroup,
            difficulty,
            {
              aimAngle: previousPlan.nextAimAngle,
              power: previousPlan.nextPower,
              spinX: previousPlan.nextSpinX,
              spinY: previousPlan.nextSpinY,
            }
          );
          if (committedDecision) {
            return committedDecision;
          }
        }
      }
    }

    // 2. General 2-Ply Position Play search across top candidates
    const topCandidates = baseCandidates.slice(0, difficulty === 'super' ? 5 : 3);
    const bestDecision = findBestDecisionForCandidates(
      topCandidates,
      balls,
      botGroup,
      difficulty
    );
    if (bestDecision) {
      return bestDecision;
    }

    // ==========================================================================
    // TACTICAL BANK / KICK / SAFETY SOLVER (When snookered or no direct pot exists)
    // ==========================================================================
    let bestTacticalScore = -Infinity;
    let bestTacticalDecision: BotShotDecision | null = null;
    const grp = botGroup ?? 'solids';

    for (let i = 0; i < 48; i++) {
      const testAngle = -Math.PI + (i / 48) * Math.PI * 2;
      for (const testPower of [0.54]) {
        const sim = simulateShotFast(balls, testAngle, testPower, 0, 0, false);
        if (sim.cuePocketed) continue;
        if (sim.firstBallHitId === null) continue;

        const legalTargets = getLegalTargetBalls(balls, grp);
        const isEightOnly = legalTargets.length === 1 && legalTargets[0].id === 8;
        if (sim.eightPocketed && !isEightOnly) continue;

        const hitLegal = isEightOnly
          ? sim.firstBallHitId === 8
          : !botGroup
          ? sim.firstBallHitId !== 8
          : botGroup === 'solids'
          ? sim.firstBallHitId >= 1 && sim.firstBallHitId <= 7
          : sim.firstBallHitId >= 9 && sim.firstBallHitId <= 15;

        if (!hitLegal) continue;

        const legalPocketed = sim.pocketedIds.filter(id =>
          isEightOnly
            ? id === 8
            : grp === 'solids'
            ? id >= 1 && id <= 7
            : id >= 9 && id <= 15
        );

        const isLegalSafety = sim.cushionsHitAfterContact > 0 || sim.pocketedIds.length > 0;
        if (!isLegalSafety) continue;

        let tacticalScore = 0;
        let nextEval: ReturnType<typeof evaluateNextShotPosition> | null = null;
        if (legalPocketed.length > 0) {
          nextEval = evaluateNextShotPosition(
            sim.finalCueX,
            sim.finalCueY,
            sim.finalBalls,
            grp,
            difficulty === 'super',
            balls
          );
          tacticalScore = 60 + nextEval.positionScore;
        } else {
          tacticalScore = 10 + Math.min(sim.cushionsHitAfterContact, 3) * 2;
        }

        if (tacticalScore > bestTacticalScore) {
          bestTacticalScore = tacticalScore;
          const pottedId = legalPocketed[0] ?? sim.firstBallHitId;

          bestTacticalDecision = {
            aimAngle: testAngle,
            power: testPower,
            spinX: 0,
            spinY: 0,
            plan: {
              targetBallId: pottedId,
              targetPocketId: POCKETS[0].id,
              cueBallPath: [],
              plannedCueStop: {
                x: sim.finalCueX,
                y: sim.finalCueY,
              },
              nextTargetBallId: nextEval?.nextBallId ?? null,
              nextTargetPocketId: nextEval?.nextPocketId ?? null,
              nextGhostBall: nextEval?.nextGhostBall ?? null,
              nextBallPos: nextEval?.nextBallPos ?? null,
              nextAimAngle: nextEval?.nextAimAngle,
              nextPower: nextEval?.nextPower,
              nextSpinX: nextEval?.nextSpinX,
              nextSpinY: nextEval?.nextSpinY,
              inferredGroup: grp,
              spinLabel: legalPocketed.length > 0 ? 'Bank / Kick Shot' : 'Tactical Safety',
              strategyText:
                legalPocketed.length > 0
                  ? `Bank/Kick Pot on #${pottedId}`
                  : `Tactical Safety on #${sim.firstBallHitId}`,
              confidence: legalPocketed.length > 0 ? 88 : 75,
            },
          };
        }
      }
    }

    if (bestTacticalDecision) {
      if (bestTacticalDecision.plan) {
        const detailedSim = simulateShotFast(
          balls,
          bestTacticalDecision.aimAngle,
          bestTacticalDecision.power,
          0,
          0,
          true
        );
        bestTacticalDecision.plan.cueBallPath = detailedSim.cuePath;
        bestTacticalDecision.plan.plannedCueStop = {
          x: detailedSim.finalCueX,
          y: detailedSim.finalCueY,
        };
      }
      return bestTacticalDecision;
    }
  }

  // ============================================================================
  // EASY / MEDIUM AI (or Fallback if completely trapped)
  // ============================================================================
  if (baseCandidates.length > 0) {
    const pickIdx =
      difficulty === 'medium'
        ? Math.min(baseCandidates.length - 1, Math.random() < 0.8 ? 0 : 1)
        : Math.min(baseCandidates.length - 1, Math.floor(Math.random() * 3));
    const selected = baseCandidates[pickIdx];

    const jitter =
      difficulty === 'easy'
        ? (Math.random() - 0.5) * 0.042
        : (Math.random() - 0.5) * 0.014;
    const powerJitter =
      difficulty === 'easy'
        ? 0.88 + Math.random() * 0.24
        : 0.95 + Math.random() * 0.1;

    return {
      aimAngle: selected.aimAngle + jitter,
      power: Math.min(Math.max(selected.basePower * powerJitter, 0.28), 0.95),
      spinX: 0,
      spinY: 0,
      plan: null,
    };
  }

  // Ultimate fallback: hit closest legal ball
  const activeBalls = balls.filter(b => !b.inPocket && b.id !== 0);
  const legalFallback = botGroup
    ? getLegalTargetBalls(balls, botGroup)
    : activeBalls.filter(b => b.id !== 8);
  const pool = legalFallback.length > 0 ? legalFallback : activeBalls;

  let bestDist = Infinity;
  let fallbackBall = pool[0];
  for (const b of pool) {
    const d = Math.hypot(b.x - cueBall.x, b.y - cueBall.y);
    if (d < bestDist) {
      bestDist = d;
      fallbackBall = b;
    }
  }

  const angle = fallbackBall
    ? Math.atan2(fallbackBall.y - cueBall.y, fallbackBall.x - cueBall.x)
    : 0;

  return {
    aimAngle: angle,
    power: 0.48,
    spinX: 0,
    spinY: 0,
    plan: null,
  };
}

const POCKET_NAMES_RU: Record<string, string> = {
  'top-left': 'Верхняя левая луза',
  'top-mid': 'Верхняя средняя луза',
  'top-right': 'Верхняя правая луза',
  'bot-left': 'Нижняя левая луза',
  'bot-mid': 'Нижняя средняя луза',
  'bot-right': 'Нижняя правая луза',
};

/**
 * Finds and ranks the easiest, physics-verified legal shots for the human player.
 * Prioritizes straight-in angles, short distances, wide pocket entry, and zero/simple spin.
 */
export function calculatePlayerHints(
  balls: Ball[],
  playerGroup: BallGroup,
  isPractice: boolean = false
): PlayerHintSuggestion[] {
  const cueBall = balls.find(b => b.id === 0 && !b.inPocket);
  if (!cueBall) return [];

  const activeObjectBalls = balls.filter(b => b.id !== 0 && !b.inPocket);
  if (activeObjectBalls.length === 0) return [];

  // Detect intact break rack (all 15 object balls clustered in triangle)
  if (activeObjectBalls.length === 15) {
    const ball1 = activeObjectBalls.find(b => b.id === 1);
    const minX = Math.min(...activeObjectBalls.map(b => b.x));
    if (ball1 && minX > 650) {
      const aimAngle = Math.atan2(ball1.y - 2 - cueBall.y, ball1.x - cueBall.x);
      const breakPower = 0.96;
      const sim = simulateShotFast(balls, aimAngle, breakPower, 0, -0.25, true);
      const targetPocket = POCKETS[2];
      const ghostPos = sim.firstHitGhostPos || { x: ball1.x - BALL_RADIUS * 2, y: ball1.y - 2 };
      return [
        {
          targetBallId: 1,
          firstHitBallId: 1,
          shotType: 'direct',
          badgeText: '💡 РАЗБОЙ #1 (96%)',
          targetPocketId: targetPocket.id,
          pocketName: 'Мощный разбой пирамиды',
          aimAngle,
          power: breakPower,
          spinX: 0,
          spinY: -0.25,
          cutAngleDeg: 2,
          ghostBall: ghostPos,
          targetBallPos: { x: ball1.x, y: ball1.y },
          pocketDropPos: { x: targetPocket.dropX, y: targetPocket.dropY },
          cuePathToFirstHit: sim.cuePathToFirstHit,
          targetBallPath: sim.ballPaths[1],
          cueBallPath: sim.cuePath,
          plannedCueStop: { x: sim.finalCueX, y: sim.finalCueY },
          difficultyLabel: 'Очень легкий',
          easeScore: 98,
          description: 'Плотный разбой в 1-й шар на полной силе (96%)',
        },
      ];
    }
  }

  // Determine legal target balls
  let targetPool: Ball[] = [];
  if (isPractice) {
    const nonEight = activeObjectBalls.filter(b => b.id !== 8);
    targetPool = nonEight.length > 0 ? nonEight : activeObjectBalls;
  } else if (playerGroup) {
    targetPool = getLegalTargetBalls(balls, playerGroup);
  } else {
    targetPool = activeObjectBalls.filter(b => b.id !== 8);
  }

  const isFirstHitLegal = (hitId: number | null, isEightTarget: boolean): boolean => {
    if (hitId === null) return false;
    if (isPractice) return true;
    if (isEightTarget) return hitId === 8;
    if (playerGroup === 'solids') return hitId >= 1 && hitId <= 7;
    if (playerGroup === 'stripes') return hitId >= 9 && hitId <= 15;
    return hitId !== 8;
  };

  const isTargetBallId = (id: number): boolean => targetPool.some(t => t.id === id);

  interface RawEasyCandidate {
    ball: Ball;
    pocket: (typeof POCKETS)[number];
    aimAngle: number;
    basePower: number;
    cutAngle: number;
    cutAngleDeg: number;
    distCueToGhost: number;
    distToPocket: number;
    ghostX: number;
    ghostY: number;
    easeRankScore: number;
  }

  const rawCandidates: RawEasyCandidate[] = [];

  for (const ball of targetPool) {
    for (const pocket of POCKETS) {
      const toPocketDx = pocket.dropX - ball.x;
      const toPocketDy = pocket.dropY - ball.y;
      const distToPocket = Math.hypot(toPocketDx, toPocketDy);
      if (distToPocket < 8) continue;

      const pocketDirX = toPocketDx / distToPocket;
      const pocketDirY = toPocketDy / distToPocket;

      const ghostX = ball.x - pocketDirX * (BALL_RADIUS * 2);
      const ghostY = ball.y - pocketDirY * (BALL_RADIUS * 2);

      if (
        ghostX < PLAY_LEFT - 5 ||
        ghostX > PLAY_RIGHT + 5 ||
        ghostY < PLAY_TOP - 5 ||
        ghostY > PLAY_BOTTOM + 5
      ) {
        continue;
      }

      const cueToGhostDx = ghostX - cueBall.x;
      const cueToGhostDy = ghostY - cueBall.y;
      const distCueToGhost = Math.hypot(cueToGhostDx, cueToGhostDy);
      if (distCueToGhost < 4) continue;

      const cueDirX = cueToGhostDx / distCueToGhost;
      const cueDirY = cueToGhostDy / distCueToGhost;

      const dot = cueDirX * pocketDirX + cueDirY * pocketDirY;
      const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
      const cutAngleDeg = Math.round((cutAngle * 180) / Math.PI);

      // Allow cuts up to 85 deg so thin direct cuts are evaluated in Stage 1
      if (cutAngleDeg > 85) continue;

      const cueClear = isLineClear(
        cueBall.x,
        cueBall.y,
        ghostX,
        ghostY,
        balls,
        [0, ball.id],
        1.48
      );
      if (!cueClear) continue;

      const pocketClear = isLineClear(
        ball.x,
        ball.y,
        pocket.dropX,
        pocket.dropY,
        balls,
        [0, ball.id],
        1.48
      );
      if (!pocketClear) continue;

      // Side pocket entry check
      let pocketBonus = 1.2;
      if (pocket.id.includes('mid')) {
        const verticality = Math.abs(pocketDirY);
        if (verticality < 0.2) continue;
        pocketBonus = verticality * 1.1;
      }

      // Strongly weight straight-in angle (cos^2.5) + short distance to pocket + short cue travel
      const straightness = Math.pow(Math.max(0.05, Math.cos(cutAngle)), 2.5);
      const pocketProximity = Math.max(0.15, 1.0 - distToPocket / 680);
      const cueProximity = Math.max(0.2, 1.0 - distCueToGhost / 750);

      const easeRankScore =
        straightness * 55 + pocketProximity * 25 + cueProximity * 14 + pocketBonus * 6;

      const totalDist = distCueToGhost + distToPocket;
      const basePower = Number(
        Math.min(0.84, Math.max(0.36, totalDist / 1150 + 0.32 + cutAngle * 0.1)).toFixed(2)
      );

      rawCandidates.push({
        ball,
        pocket,
        aimAngle: Math.atan2(cueToGhostDy, cueToGhostDx),
        basePower,
        cutAngle,
        cutAngleDeg,
        distCueToGhost,
        distToPocket,
        ghostX,
        ghostY,
        easeRankScore,
      });
    }
  }

  rawCandidates.sort((a, b) => b.easeRankScore - a.easeRankScore);

  const verifiedHints: PlayerHintSuggestion[] = [];
  const topToVerify = rawCandidates.slice(0, 16);

  // ============================================================================
  // STAGE 1: Direct Single-Ball Cuts & Straight Shots (100% 16-substep verified)
  // Strictly requires: cue ball hits cand.ball FIRST without hitting cushions first,
  // and cand.ball itself drops directly into cand.pocket!
  // ============================================================================
  for (const cand of topToVerify) {
    if (verifiedHints.length >= 3) break;

    const rawPowers = [
      cand.basePower,
      Math.min(0.88, cand.basePower + 0.12),
      Math.max(0.34, cand.basePower - 0.08),
    ];
    const testPowers = Array.from(new Set(rawPowers.map(p => Number(p.toFixed(2)))));
    const testSpins = [
      { spinX: 0, spinY: 0 },
      { spinX: 0, spinY: -0.28 },
      { spinX: 0, spinY: 0.28 },
    ];
    const angleAdjustments = [
      0,
      -0.0035,
      0.0035,
      -0.0075,
      0.0075,
      -0.013,
      0.013,
      -0.02,
      0.02,
    ];

    let foundValid = false;

    for (const sp of testSpins) {
      if (foundValid) break;
      for (const pwr of testPowers) {
        if (foundValid) break;
        for (const dAng of angleAdjustments) {
          const testAngle = cand.aimAngle + dAng;
          const sim = simulateShotFast(balls, testAngle, pwr, sp.spinX, sp.spinY, false);

          if (sim.cuePocketed) continue;
          if (sim.eightPocketed && cand.ball.id !== 8) continue;
          // MUST hit cand.ball directly first (no other ball in the way, no cushion before contact)
          if (sim.firstBallHitId !== cand.ball.id) continue;
          if (sim.cushionsBeforeFirstHit > 0) continue;
          // MUST pot cand.ball into cand.pocket directly
          if (!sim.pocketedIds.includes(cand.ball.id)) continue;
          if (sim.pocketedByMap[cand.ball.id]?.id !== cand.pocket.id) continue;
          if ((sim.ballCushionsMap[cand.ball.id] || 0) > 0) continue;

          const detailedSim = simulateShotFast(balls, testAngle, pwr, sp.spinX, sp.spinY, true);
          const easeScore = Math.min(99, Math.max(45, Math.round(cand.easeRankScore)));

          let difficultyLabel: PlayerHintSuggestion['difficultyLabel'] = 'Легкий';
          let badgePrefix = '💡 ЛЕГКИЙ';
          if (cand.cutAngleDeg <= 14 && cand.distToPocket < 280) {
            difficultyLabel = 'Очень легкий';
            badgePrefix = '💡 ОЧЕНЬ ЛЕГКИЙ';
          } else if (cand.cutAngleDeg <= 32) {
            difficultyLabel = 'Легкий';
            badgePrefix = '💡 ЛЕГКИЙ';
          } else if (cand.cutAngleDeg <= 52) {
            difficultyLabel = 'Средний';
            badgePrefix = '💡 СРЕДНИЙ';
          } else {
            difficultyLabel = 'Сложный';
            badgePrefix = '💡 ТОНКАЯ РЕЗКА';
          }

          const pocketName = POCKET_NAMES_RU[cand.pocket.id] || cand.pocket.id;
          const description = `Шар #${cand.ball.id} → ${pocketName} (резка ${cand.cutAngleDeg}°, сила ${Math.round(pwr * 100)}%)`;
          const exactGhost = detailedSim.firstHitGhostPos || {
            x: cueBall.x + Math.cos(testAngle) * cand.distCueToGhost,
            y: cueBall.y + Math.sin(testAngle) * cand.distCueToGhost,
          };

          verifiedHints.push({
            targetBallId: cand.ball.id,
            firstHitBallId: cand.ball.id,
            shotType: 'direct',
            badgeText: `${badgePrefix} #${cand.ball.id} (${easeScore}%)`,
            targetPocketId: cand.pocket.id,
            pocketName,
            aimAngle: testAngle,
            power: pwr,
            spinX: sp.spinX,
            spinY: sp.spinY,
            cutAngleDeg: cand.cutAngleDeg,
            ghostBall: exactGhost,
            targetBallPos: { x: cand.ball.x, y: cand.ball.y },
            pocketDropPos: { x: cand.pocket.dropX, y: cand.pocket.dropY },
            cuePathToFirstHit: detailedSim.cuePathToFirstHit,
            targetBallPath: detailedSim.ballPaths[cand.ball.id],
            cueBallPath: detailedSim.cuePath,
            plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
            difficultyLabel,
            easeScore,
            description,
          });

          foundValid = true;
          break;
        }
      }
    }
  }

  // ============================================================================
  // STAGE 1B: Direct Single-Ball Circumference Squeeze & Thin-Cut Scan
  // Scans 23 contact points across the face of each legal ball and checks if
  // hitting that ball directly pots THAT SAME BALL (never a random combo!).
  // ============================================================================
  if (verifiedHints.length === 0) {
    // Lateral contact fractions s = sin(cutAngle) from center out to thin edge cuts
    const contactFractions = [
      0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45, -0.6, 0.6, -0.72, 0.72, -0.82, 0.82, -0.9, 0.9,
      -0.95, 0.95, -0.98, 0.98,
    ];
    const scanPowers = [0.5, 0.7, 0.86];

    for (const ball of targetPool) {
      if (verifiedHints.length >= 2) break;
      const dx = ball.x - cueBall.x;
      const dy = ball.y - cueBall.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_RADIUS * 2.02) continue;

      const ux = dx / dist;
      const uy = dy / dist;
      const px = -uy;
      const py = ux;

      for (const s of contactFractions) {
        if (verifiedHints.length >= 2) break;
        const c = Math.sqrt(Math.max(0.01, 1 - s * s));
        const ghostX = ball.x - ux * c * (BALL_RADIUS * 2) + px * s * (BALL_RADIUS * 2);
        const ghostY = ball.y - uy * c * (BALL_RADIUS * 2) + py * s * (BALL_RADIUS * 2);
        const testAngle = Math.atan2(ghostY - cueBall.y, ghostX - cueBall.x);

        for (const pwr of scanPowers) {
          const sim = simulateShotFast(balls, testAngle, pwr, 0, 0, false);
          if (sim.cuePocketed) continue;
          if (sim.eightPocketed && ball.id !== 8) continue;
          // Strictly require hitting THIS ball first and potting THIS SAME ball!
          if (sim.firstBallHitId !== ball.id) continue;
          if (sim.cushionsBeforeFirstHit > 0) continue;
          if (!sim.pocketedIds.includes(ball.id)) continue;

          const actualPocket = sim.pocketedByMap[ball.id] || POCKETS[0];
          const detailedSim = simulateShotFast(balls, testAngle, pwr, 0, 0, true);
          const isBank = (sim.ballCushionsMap[ball.id] || 0) > 0;
          const cutDeg = Math.round((Math.asin(Math.min(1, Math.abs(s))) * 180) / Math.PI);
          const pocketName = POCKET_NAMES_RU[actualPocket.id] || actualPocket.id;
          const exactGhost = detailedSim.firstHitGhostPos || { x: ghostX, y: ghostY };

          verifiedHints.push({
            targetBallId: ball.id,
            firstHitBallId: ball.id,
            shotType: isBank ? 'bank' : 'direct',
            badgeText: isBank
              ? `💡 ДУПЛЕТ #${ball.id}`
              : `💡 РЕЗКА #${ball.id} (${cutDeg}°)`,
            targetPocketId: actualPocket.id,
            pocketName,
            aimAngle: testAngle,
            power: pwr,
            spinX: 0,
            spinY: 0,
            cutAngleDeg: cutDeg,
            ghostBall: exactGhost,
            targetBallPos: { x: ball.x, y: ball.y },
            pocketDropPos: { x: actualPocket.dropX, y: actualPocket.dropY },
            cuePathToFirstHit: detailedSim.cuePathToFirstHit,
            targetBallPath: detailedSim.ballPaths[ball.id],
            cueBallPath: detailedSim.cuePath,
            plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
            difficultyLabel: isBank || cutDeg > 52 ? 'Сложный' : 'Средний',
            easeScore: isBank ? 54 : Math.max(55, 85 - cutDeg),
            description: isBank
              ? `Дуплет от борта: Шар #${ball.id} → ${pocketName} (сила ${Math.round(pwr * 100)}%)`
              : `Шар #${ball.id} → ${pocketName} (резка ${cutDeg}°, сила ${Math.round(pwr * 100)}%)`,
          });
          break;
        }
      }
    }
  }

  // ============================================================================
  // STAGE 2 & 3 & 4: 360° Single-Ball Kick/Bank Solver -> 2-Ball Combo Solver -> Safety
  // Prioritizes single-ball pots (firstBallHitId === pottedId) BEFORE multi-ball combos!
  // ============================================================================
  if (verifiedHints.length === 0) {
    const isEightOnly = targetPool.length === 1 && targetPool[0].id === 8;
    const singleBallBankKickHints: PlayerHintSuggestion[] = [];
    const comboHints: PlayerHintSuggestion[] = [];
    let bestSafetyCandidate: {
      angle: number;
      power: number;
      hitBallId: number;
      cushions: number;
      score: number;
    } | null = null;

    const NUM_ANGLES = 90;
    const scanPowers = [0.58, 0.8];

    for (let i = 0; i < NUM_ANGLES; i++) {
      if (singleBallBankKickHints.length >= 2) break;
      const testAngle = -Math.PI + (i / NUM_ANGLES) * Math.PI * 2;

      for (const pwr of scanPowers) {
        const sim = simulateShotFast(balls, testAngle, pwr, 0, 0, false);
        if (sim.cuePocketed) continue;
        if (sim.eightPocketed && !isEightOnly) continue;
        if (!isFirstHitLegal(sim.firstBallHitId, isEightOnly)) continue;

        const legalPotted = sim.pocketedIds.filter(id => isTargetBallId(id));
        if (legalPotted.length > 0 && sim.firstBallHitId !== null) {
          // Prefer single-ball pot if the first ball hit was among the potted balls
          const isSingleBallPot = legalPotted.includes(sim.firstBallHitId);
          const pottedId = isSingleBallPot ? sim.firstBallHitId : legalPotted[0];
          const pottedBallObj = balls.find(b => b.id === pottedId) || targetPool[0];
          const firstHitBallObj = balls.find(b => b.id === sim.firstBallHitId) || pottedBallObj;
          const actualPocket = sim.pocketedByMap[pottedId] || POCKETS[0];
          const pocketName = POCKET_NAMES_RU[actualPocket.id] || actualPocket.id;

          if (isSingleBallPot) {
            const detailedSim = simulateShotFast(balls, testAngle, pwr, 0, 0, true);
            const isKick = sim.cushionsBeforeFirstHit > 0;
            const exactGhost = detailedSim.firstHitGhostPos || {
              x: pottedBallObj.x,
              y: pottedBallObj.y,
            };

            singleBallBankKickHints.push({
              targetBallId: pottedId,
              firstHitBallId: pottedId,
              shotType: isKick ? 'kick' : 'bank',
              badgeText: isKick ? `💡 АБРИКОЛЬ #${pottedId}` : `💡 ДУПЛЕТ #${pottedId}`,
              targetPocketId: actualPocket.id,
              pocketName,
              aimAngle: testAngle,
              power: pwr,
              spinX: 0,
              spinY: 0,
              cutAngleDeg: 45,
              ghostBall: exactGhost,
              targetBallPos: { x: pottedBallObj.x, y: pottedBallObj.y },
              pocketDropPos: { x: actualPocket.dropX, y: actualPocket.dropY },
              cuePathToFirstHit: detailedSim.cuePathToFirstHit,
              targetBallPath: detailedSim.ballPaths[pottedId],
              cueBallPath: detailedSim.cuePath,
              plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
              difficultyLabel: 'Сложный',
              easeScore: isKick ? 46 : 50,
              description: isKick
                ? `Абриколь (биток от борта): Шар #${pottedId} → ${pocketName} (${Math.round(pwr * 100)}%)`
                : `Дуплет (шар от борта): Шар #${pottedId} → ${pocketName} (${Math.round(pwr * 100)}%)`,
            });
            break;
          } else if (comboHints.length < 2) {
            const detailedSim = simulateShotFast(balls, testAngle, pwr, 0, 0, true);
            const exactGhost = detailedSim.firstHitGhostPos || {
              x: firstHitBallObj.x,
              y: firstHitBallObj.y,
            };

            comboHints.push({
              targetBallId: pottedId,
              firstHitBallId: firstHitBallObj.id,
              firstHitBallPos: { x: firstHitBallObj.x, y: firstHitBallObj.y },
              firstHitBallPath: detailedSim.ballPaths[firstHitBallObj.id],
              shotType: 'combo',
              badgeText: `💡 КОМБО #${firstHitBallObj.id} → #${pottedId}`,
              targetPocketId: actualPocket.id,
              pocketName,
              aimAngle: testAngle,
              power: pwr,
              spinX: 0,
              spinY: 0,
              cutAngleDeg: 40,
              ghostBall: exactGhost,
              targetBallPos: { x: pottedBallObj.x, y: pottedBallObj.y },
              pocketDropPos: { x: actualPocket.dropX, y: actualPocket.dropY },
              cuePathToFirstHit: detailedSim.cuePathToFirstHit,
              targetBallPath: detailedSim.ballPaths[pottedId],
              cueBallPath: detailedSim.cuePath,
              plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
              difficultyLabel: 'Сложный',
              easeScore: 44,
              description: `Комбинация: удар в #${firstHitBallObj.id} забивает шар #${pottedId} → ${pocketName} (${Math.round(pwr * 100)}%)`,
            });
            break;
          }
        }

        // Track best legal safety / escape shot in case no pot exists
        if (sim.firstBallHitId !== null) {
          const isLegalSafety = sim.cushionsHitAfterContact > 0;
          const directHitBonus = sim.cushionsBeforeFirstHit === 0 ? 12 : 0;
          const safetyScore =
            (isLegalSafety ? 50 : 15) +
            directHitBonus +
            Math.min(sim.cushionsHitAfterContact, 4) * 5;
          if (!bestSafetyCandidate || safetyScore > bestSafetyCandidate.score) {
            bestSafetyCandidate = {
              angle: testAngle,
              power: pwr,
              hitBallId: sim.firstBallHitId,
              cushions: sim.cushionsHitAfterContact,
              score: safetyScore,
            };
          }
        }
      }
    }

    if (singleBallBankKickHints.length > 0) {
      verifiedHints.push(...singleBallBankKickHints);
    } else if (comboHints.length > 0) {
      verifiedHints.push(...comboHints);
    } else if (bestSafetyCandidate) {
      const hitBall = balls.find(b => b.id === bestSafetyCandidate.hitBallId) || targetPool[0];
      const detailedSim = simulateShotFast(
        balls,
        bestSafetyCandidate.angle,
        bestSafetyCandidate.power,
        0,
        0,
        true
      );
      const exactGhost = detailedSim.firstHitGhostPos || { x: hitBall.x, y: hitBall.y };
      verifiedHints.push({
        targetBallId: hitBall.id,
        firstHitBallId: hitBall.id,
        shotType: 'safety',
        badgeText: `🛡️ ОТЫГРЫШ ОБ #${hitBall.id}`,
        targetPocketId: POCKETS[0].id,
        pocketName: 'Отыгрыш / Выход из снукера',
        aimAngle: bestSafetyCandidate.angle,
        power: bestSafetyCandidate.power,
        spinX: 0,
        spinY: 0,
        cutAngleDeg: 35,
        ghostBall: exactGhost,
        targetBallPos: { x: hitBall.x, y: hitBall.y },
        pocketDropPos: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
        cuePathToFirstHit: detailedSim.cuePathToFirstHit,
        cueBallPath: detailedSim.cuePath,
        plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
        difficultyLabel: 'Сложный',
        easeScore: 38,
        description: `Тактический отыгрыш по шару #${hitBall.id} с доведением до борта (${Math.round(bestSafetyCandidate.power * 100)}%)`,
      });
    } else {
      const fallbackBall = targetPool[0];
      const fallbackAngle = Math.atan2(fallbackBall.y - cueBall.y, fallbackBall.x - cueBall.x);
      const fallbackPower = 0.55;
      const detailedSim = simulateShotFast(balls, fallbackAngle, fallbackPower, 0, 0, true);
      const exactGhost = detailedSim.firstHitGhostPos || { x: fallbackBall.x, y: fallbackBall.y };
      verifiedHints.push({
        targetBallId: fallbackBall.id,
        firstHitBallId: fallbackBall.id,
        shotType: 'safety',
        badgeText: `🛡️ ОТЫГРЫШ В #${fallbackBall.id}`,
        targetPocketId: POCKETS[0].id,
        pocketName: 'Защитный удар',
        aimAngle: fallbackAngle,
        power: fallbackPower,
        spinX: 0,
        spinY: 0,
        cutAngleDeg: 0,
        ghostBall: exactGhost,
        targetBallPos: { x: fallbackBall.x, y: fallbackBall.y },
        pocketDropPos: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
        cuePathToFirstHit: detailedSim.cuePathToFirstHit,
        cueBallPath: detailedSim.cuePath,
        plannedCueStop: { x: detailedSim.finalCueX, y: detailedSim.finalCueY },
        difficultyLabel: 'Сложный',
        easeScore: 35,
        description: `Защитный удар в направлении шара #${fallbackBall.id} (${Math.round(fallbackPower * 100)}%)`,
      });
    }
  }

  verifiedHints.sort((a, b) => b.easeScore - a.easeScore);
  return verifiedHints;
}

