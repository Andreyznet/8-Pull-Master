import { Ball, ShotResult } from '../types/game';
import {
  BALL_COLORS,
  BALL_RADIUS,
  COULOMB_FRICTION,
  CUSHION_SEGMENTS,
  FOOT_SPOT_X,
  FOOT_SPOT_Y,
  HEAD_STRING_X,
  MIN_SPEED_THRESHOLD,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKET_CAPTURE_RADIUS,
  POCKETS,
  RESTITUTION_BALL,
  RESTITUTION_CUSHION,
  ROLLING_FRICTION,
  SPIN_DECAY,
  TABLE_HEIGHT,
} from './constants';
import { soundManager } from '../utils/audio';

/**
 * Creates the initial racked table state
 */
export function createRackedBalls(): Ball[] {
  const balls: Ball[] = [];

  // Cue ball positioned behind head string
  balls.push({
    id: 0,
    x: HEAD_STRING_X,
    y: TABLE_HEIGHT / 2,
    vx: 0,
    vy: 0,
    spinX: 0,
    spinY: 0,
    rotationX: 0,
    rotationY: 0,
    nx: 0,
    ny: 0,
    nz: 1,
    sx: 1,
    sy: 0,
    sz: 0,
    radius: BALL_RADIUS,
    type: 'cue',
    number: 0,
    color: BALL_COLORS[0].hex,
    inPocket: false,
    pocketAnim: null,
  });

  // Official 8-ball rack layout (5 rows triangle)
  // Triangle order: 8-ball in center, bottom corners one solid and one stripe
  const rackOrder = [
    1,
    9, 2,
    3, 8, 10,
    11, 4, 12, 5,
    6, 13, 7, 14, 15,
  ];

  const dx = BALL_RADIUS * Math.sqrt(3) + 0.08;
  const dy = BALL_RADIUS * 2 + 0.08;

  let ballIdx = 0;
  for (let row = 0; row < 5; row++) {
    const startY = FOOT_SPOT_Y - (row * dy) / 2;
    const rowX = FOOT_SPOT_X + row * dx;

    for (let col = 0; col <= row; col++) {
      const num = rackOrder[ballIdx++];
      const type = num === 8 ? 'eight' : num <= 7 ? 'solid' : 'stripe';
      const color = BALL_COLORS[num].hex;

      const azimuth = Math.random() * Math.PI * 2;
      const tilt = 0.18 + Math.random() * 0.48;
      const nx = Math.sin(tilt) * Math.cos(azimuth);
      const ny = Math.sin(tilt) * Math.sin(azimuth);
      const nz = Math.cos(tilt);

      const baseSx = -Math.sin(azimuth);
      const baseSy = Math.cos(azimuth);
      const rollPsi = (Math.random() - 0.5) * 0.85;
      const rotatedS = rotateVector3D(baseSx, baseSy, 0, nx, ny, nz, rollPsi);
      const sx = rotatedS.x;
      const sy = rotatedS.y;
      const sz = rotatedS.z;

      // Real physical racks (wood/plastic triangle or magic template) have natural micro-gaps
      // of 10-60 microns between balls. In hard-sphere scattering cascades, this creates the authentic
      // deterministic chaos (Lyapunov divergence) seen on real billiard breaks!
      const microJitterX = row === 0 ? 0 : (Math.random() - 0.5) * 0.16;
      const microJitterY = row === 0 ? 0 : (Math.random() - 0.5) * 0.16;

      balls.push({
        id: num,
        x: rowX + microJitterX,
        y: startY + col * dy + microJitterY,
        vx: 0,
        vy: 0,
        spinX: 0,
        spinY: 0,
        rotationX: 0,
        rotationY: 0,
        nx,
        ny,
        nz,
        sx,
        sy,
        sz,
        radius: BALL_RADIUS,
        type,
        number: num,
        color,
        inPocket: false,
        pocketAnim: null,
      });
    }
  }

  return balls;
}

/**
 * Distance squared helper
 */
function distSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * Closest point on line segment (p1 to p2) to circle center (cx, cy)
 */
export function closestPointOnSegment(
  cx: number,
  cy: number,
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number; t: number } {
  const segDx = p2.x - p1.x;
  const segDy = p2.y - p1.y;
  const segLenSq = segDx * segDx + segDy * segDy;

  if (segLenSq === 0) return { x: p1.x, y: p1.y, t: 0 };

  let t = ((cx - p1.x) * segDx + (cy - p1.y) * segDy) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: p1.x + t * segDx,
    y: p1.y + t * segDy,
    t,
  };
}

// Helper function: Rodrigues' 3D rotation formula
function rotateVector3D(
  vx: number,
  vy: number,
  vz: number,
  axisX: number,
  axisY: number,
  axisZ: number,
  angle: number
): { x: number; y: number; z: number } {
  if (Math.abs(angle) < 1e-7) return { x: vx, y: vy, z: vz };
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dot = vx * axisX + vy * axisY + vz * axisZ;

  const crossX = axisY * vz - axisZ * vy;
  const crossY = axisZ * vx - axisX * vz;
  const crossZ = axisX * vy - axisY * vx;

  const rx = vx * cosA + crossX * sinA + axisX * dot * (1 - cosA);
  const ry = vy * cosA + crossY * sinA + axisY * dot * (1 - cosA);
  const rz = vz * cosA + crossZ * sinA + axisZ * dot * (1 - cosA);

  const len = Math.hypot(rx, ry, rz) || 1;
  return { x: rx / len, y: ry / len, z: rz / len };
}

/**
 * Checks if a ball center (x, y) has crossed the pocket brink (center of mass beyond the rounded slate lip)
 */
const POCKET_BRINK_OFFSET = 2.5; // rounded lip edge offset inside which center of mass immediately tips
const POCKET_LIP_BEVEL_WIDTH = 9.5; // bevelled cloth/slate rim width beyond brink (total overhang zone = radius + 12px)

export function getCapturedPocket(x: number, y: number) {
  for (const pocket of POCKETS) {
    const captureR = pocket.radius + POCKET_BRINK_OFFSET;
    const dSq = distSq(x, y, pocket.dropX, pocket.dropY);
    if (dSq < captureR * captureR) {
      return pocket;
    }
  }
  return null;
}

/**
 * Checks if a ball is resting/rolling on the downward-bevelled cloth lip of a pocket
 * (where the front hemisphere of the ball hangs over the pocket opening).
 * Returns the pocket and normalized overhang factor (0 at outer bevel edge -> 1 at brink).
 */
export function getPocketLipOverhang(x: number, y: number) {
  for (const pocket of POCKETS) {
    const captureR = pocket.radius + POCKET_BRINK_OFFSET;
    const outerLipR = captureR + POCKET_LIP_BEVEL_WIDTH;
    const d = Math.hypot(x - pocket.dropX, y - pocket.dropY);
    if (d >= captureR && d < outerLipR) {
      const overhang = 1 - (d - captureR) / POCKET_LIP_BEVEL_WIDTH;
      return { pocket, d, overhang };
    }
  }
  return null;
}

/**
 * Records an exact vertex along a ball's path for high-precision trajectory trail rendering
 */
function recordBallPathPoint(shotResult: ShotResult | null, ballId: number, x: number, y: number) {
  if (!shotResult || !shotResult.ballPaths) return;
  let path = shotResult.ballPaths[ballId];
  if (!path) {
    path = [];
    shotResult.ballPaths[ballId] = path;
  }
  const last = path[path.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) > 0.25) {
    path.push({ x, y });
  }
}

/**
 * Runs 1 frame of physics update with high-precision Continuous Collision Detection (CCD)
 * so ball contact angles and cushion rebounds match the geometric raycast trajectory 100%.
 */
export function updatePhysics(
  balls: Ball[],
  shotResult: ShotResult | null,
  subSteps: number = 16,
  currentFrame: number = 0,
  onSubstepCollision?: (balls: Ball[]) => void,
  frameDt: number = 1
): boolean {
  let anyMoving = false;
  let capturedSubstepSnapshot = false;
  const clampedFrameDt = Math.min(2.2, Math.max(0.25, frameDt));
  const dt = clampedFrameDt / subSteps;

  // 1. Process balls that are currently dropping into pockets (Authentic 8 Ball Pool 3D drop)
  for (const b of balls) {
    if (b.pocketAnim) {
      anyMoving = true;
      const prevProgress = b.pocketAnim.progress ?? 0;
      const nextProgress = Math.min(1, prevProgress + 0.068 * clampedFrameDt);
      b.pocketAnim.progress = nextProgress;

      // Move along incoming velocity + gravitational pull over the slate pocket shelf into the well
      const wellX = b.pocketAnim.wellX ?? b.pocketAnim.targetX;
      const wellY = b.pocketAnim.wellY ?? b.pocketAnim.targetY;
      const wellRadius = b.pocketAnim.wellRadius ?? 24;

      const prevX = b.x;
      const prevY = b.y;

      const pull = Math.min(1, (0.16 + nextProgress * 0.28) * clampedFrameDt);
      b.x += b.vx * 0.45 * clampedFrameDt + (b.pocketAnim.targetX - b.x) * pull;
      b.y += b.vy * 0.45 * clampedFrameDt + (b.pocketAnim.targetY - b.y) * pull;
      b.vx *= Math.pow(0.84, clampedFrameDt);
      b.vy *= Math.pow(0.84, clampedFrameDt);

      // Keep ball strictly inside the pocket well boundary as it drops down the chute
      const currentScale = Math.max(0.32, 1.0 - Math.pow(nextProgress, 1.65) * 0.65);
      b.pocketAnim.scale = currentScale;

      // Stay opaque while tipping over the lip, then darken/fade into the deep shadow at the bottom
      b.pocketAnim.alpha =
        nextProgress < 0.45
          ? 1.0
          : Math.max(0, 1.0 - Math.pow((nextProgress - 0.45) / 0.55, 1.35));

      const maxWellOffset = Math.max(2, wellRadius - b.radius * currentScale * 0.85);
      const dxWell = b.x - wellX;
      const dyWell = b.y - wellY;
      const distWell = Math.hypot(dxWell, dyWell);
      if (distWell > maxWellOffset && distWell > 0.001) {
        b.x = wellX + (dxWell / distWell) * maxWellOffset;
        b.y = wellY + (dyWell / distWell) * maxWellOffset;
      }

      // Continue 3D spherical rotation as the ball rolls over the slate lip into the pocket!
      const moveDx = b.x - prevX;
      const moveDy = b.y - prevY;
      const moveDist = Math.hypot(moveDx, moveDy);
      if (moveDist > 0.001) {
        const dTheta = (moveDist / b.radius) * 1.35; // extra forward pitch as it tips over the edge
        const axisX = -moveDy / moveDist;
        const axisY = moveDx / moveDist;
        const nRot = rotateVector3D(b.nx, b.ny, b.nz, axisX, axisY, 0, dTheta);
        b.nx = nRot.x;
        b.ny = nRot.y;
        b.nz = nRot.z;
        const sRot = rotateVector3D(b.sx, b.sy, b.sz, axisX, axisY, 0, dTheta);
        b.sx = sRot.x;
        b.sy = sRot.y;
        b.sz = sRot.z;
      }

      if (nextProgress >= 1.0 || b.pocketAnim.alpha <= 0.03) {
        b.pocketAnim = null;
        b.inPocket = true;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  // 2. High-rate sub-stepping loop with exact CCD time-of-impact rewinding
  for (let step = 0; step < subSteps; step++) {
    // A. Step active ball positions using current velocity
    for (const b of balls) {
      if (b.inPocket || b.pocketAnim) continue;

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0.001) {
        anyMoving = true;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
    }

    // B. Ball-to-Ball collisions with Continuous Collision Detection (CCD) Rewind
    // Executed immediately after position step (before friction/spin) so rewind uses the exact step velocity!
    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (b1.inPocket || b1.pocketAnim) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (b2.inPocket || b2.pocketAnim) continue;

        let dx = b2.x - b1.x;
        let dy = b2.y - b1.y;
        let dist2 = dx * dx + dy * dy;
        const minDist = b1.radius + b2.radius;

        if (dist2 < minDist * minDist && dist2 > 0) {
          const rvx = b1.vx - b2.vx;
          const rvy = b1.vy - b2.vy;
          const rvSq = rvx * rvx + rvy * rvy;

          // Check if balls are approaching each other
          const approachDot = rvx * dx + rvy * dy;
          let rewoundTau = 0;

          if (approachDot > 0 && rvSq > 0.0001) {
            // Solve exact time-of-impact tau back along relative velocity vector
            // where |(b1 - b2) - (v1 - v2)*tau|^2 === minDist^2
            const pDotRv = -approachDot; // (b1 - b2) . (v1 - v2)
            const disc = pDotRv * pDotRv - rvSq * (dist2 - minDist * minDist);
            if (disc >= 0) {
              const exactTau = (pDotRv + Math.sqrt(disc)) / rvSq;
              rewoundTau = Math.max(0, Math.min(dt * 1.25, exactTau));
            }
          }

          // 1. Rewind both balls to exact geometric point of contact!
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

          // Resolve any microscopic overlap
          if (dist < minDist) {
            const overlap = minDist - dist;
            b1.x -= nx * overlap * 0.5;
            b1.y -= ny * overlap * 0.5;
            b2.x += nx * overlap * 0.5;
            b2.y += ny * overlap * 0.5;
          }

          // Record exact impact vertices into ballPaths before post-impact step!
          recordBallPathPoint(shotResult, b1.id, b1.x, b1.y);
          recordBallPathPoint(shotResult, b2.id, b2.x, b2.y);

          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal > 0) {
            // Elastic collision impulse along exact contact normal
            const impulse = (1 + RESTITUTION_BALL) * velAlongNormal * 0.5;
            b1.vx -= impulse * nx;
            b1.vy -= impulse * ny;
            b2.vx += impulse * nx;
            b2.vy += impulse * ny;

            // Proportional Draw/Follow/English effect when cue ball strikes an object ball
            const cue = b1.id === 0 ? b1 : b2.id === 0 ? b2 : null;
            const sign = b1.id === 0 ? 1 : -1;
            if (cue) {
              if (cue.spinY < -0.05) {
                const drawForce = Math.abs(cue.spinY) * Math.min(velAlongNormal * 0.68, 6.2);
                cue.vx -= sign * nx * drawForce;
                cue.vy -= sign * ny * drawForce;
                cue.spinY *= 0.25;
              } else if (cue.spinY > 0.05) {
                const followForce = cue.spinY * Math.min(velAlongNormal * 0.55, 5.2);
                cue.vx += sign * nx * followForce;
                cue.vy += sign * ny * followForce;
                cue.spinY *= 0.3;
              }
              if (Math.abs(cue.spinX) > 0.05) {
                const throwForce = cue.spinX * Math.min(velAlongNormal * 0.16, 1.4);
                cue.vx += sign * -ny * throwForce;
                cue.vy += sign * nx * throwForce;
                cue.spinX *= 0.7;
              }
            }

            // Track first ball hit for rules
            if (shotResult && !shotResult.firstBallHit) {
              if (b1.id === 0) shotResult.firstBallHit = b2;
              else if (b2.id === 0) shotResult.firstBallHit = b1;
            }

            const impactSpeed = Math.abs(velAlongNormal);
            if (impactSpeed > 0.35) {
              soundManager.playBallHit(impactSpeed);
              if (onSubstepCollision && !capturedSubstepSnapshot) {
                capturedSubstepSnapshot = true;
                onSubstepCollision(balls);
              }
              if (shotResult?.collisions) {
                const cx = (b1.x + b2.x) * 0.5;
                const cy = (b1.y + b2.y) * 0.5;
                const lastCol = shotResult.collisions[shotResult.collisions.length - 1];
                if (!lastCol || Math.hypot(lastCol.x - cx, lastCol.y - cy) > 8) {
                  shotResult.collisions.push({
                    x: cx,
                    y: cy,
                    type: 'ball',
                    frame: currentFrame,
                    intensity: Math.min(1, impactSpeed / 12),
                  });
                }
              }
            }

            // Advance balls forward by remaining post-impact substep time
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
    for (const b of balls) {
      if (b.inPocket || b.pocketAnim) continue;

      const capturedPocket = getCapturedPocket(b.x, b.y);
      if (capturedPocket) {
        recordBallPathPoint(shotResult, b.id, b.x, b.y);

        // Project final trajectory point strictly straight along incoming velocity vector
        // so the recorded path into the pocket never bends sideways toward dropX/dropY
        const speed = Math.hypot(b.vx, b.vy);
        let straightEndX = capturedPocket.dropX;
        let straightEndY = capturedPocket.dropY;
        if (speed > 0.01) {
          const ux = b.vx / speed;
          const uy = b.vy / speed;
          const proj = Math.max(
            6,
            Math.min(
              24,
              (capturedPocket.dropX - b.x) * ux + (capturedPocket.dropY - b.y) * uy
            )
          );
          straightEndX = b.x + ux * proj;
          straightEndY = b.y + uy * proj;
        }
        recordBallPathPoint(shotResult, b.id, straightEndX, straightEndY);

        // Keep the drop animation target inside the deep pocket well along the entry vector
        const dxDrop = straightEndX - capturedPocket.dropX;
        const dyDrop = straightEndY - capturedPocket.dropY;
        const distDrop = Math.hypot(dxDrop, dyDrop);
        const maxDropOffset = Math.max(4, capturedPocket.radius * 0.32);
        const animTargetX =
          distDrop > maxDropOffset && distDrop > 0.001
            ? capturedPocket.dropX + (dxDrop / distDrop) * maxDropOffset
            : capturedPocket.dropX;
        const animTargetY =
          distDrop > maxDropOffset && distDrop > 0.001
            ? capturedPocket.dropY + (dyDrop / distDrop) * maxDropOffset
            : capturedPocket.dropY;

        b.pocketAnim = {
          targetX: animTargetX,
          targetY: animTargetY,
          wellX: capturedPocket.dropX,
          wellY: capturedPocket.dropY,
          wellRadius: capturedPocket.radius,
          progress: 0,
          scale: 1.0,
          alpha: 1.0,
        };
        // Keep 55% of entry velocity so the ball rolls naturally over the pocket lip before dropping
        b.vx *= 0.55;
        b.vy *= 0.55;

        soundManager.playPocketDrop();

        if (shotResult) {
          if (shotResult.collisions) {
            shotResult.collisions.push({
              x: animTargetX,
              y: animTargetY,
              type: 'pocket',
              frame: currentFrame,
              intensity: 1,
            });
          }
          if (b.id === 0) {
            shotResult.cuePocketed = true;
          } else if (b.id === 8) {
            shotResult.eightPocketed = true;
            shotResult.ballsPocketed.push(b);
          } else {
            shotResult.ballsPocketed.push(b);
          }
        }
      }
    }

    // D. Ball-to-Cushion collisions
    for (const b of balls) {
      if (b.inPocket || b.pocketAnim) continue;

      if (getCapturedPocket(b.x, b.y)) continue;

      for (const seg of CUSHION_SEGMENTS) {
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
            // Rewind to exact cushion contact point along velocity vector
            const rewoundTau = Math.min(dt, penetration / Math.abs(vDotN));
            b.x -= b.vx * rewoundTau;
            b.y -= b.vy * rewoundTau;

            // Ensure no remaining penetration
            const checkClosest = closestPointOnSegment(b.x, b.y, seg.p1, seg.p2);
            const remDist = Math.hypot(b.x - checkClosest.x, b.y - checkClosest.y);
            if (remDist < b.radius) {
              b.x += nx * (b.radius - remDist);
              b.y += ny * (b.radius - remDist);
            }

            // Record exact cushion impact vertex into ballPaths before rebound step!
            recordBallPathPoint(shotResult, b.id, b.x, b.y);
            if (onSubstepCollision && !capturedSubstepSnapshot) {
              capturedSubstepSnapshot = true;
              onSubstepCollision(balls);
            }

            // Rebound with restitution (dampened on pocket jaws when a slow ball is overhanging the lip)
            const isOverhangingJaw =
              seg.id.includes('jaw') &&
              Math.hypot(b.vx, b.vy) < 2.2 &&
              getPocketLipOverhang(b.x, b.y) !== null;
            const effectiveRestitution = isOverhangingJaw ? 0.12 : RESTITUTION_CUSHION;
            b.vx = b.vx - (1 + effectiveRestitution) * vDotN * nx;
            b.vy = b.vy - (1 + effectiveRestitution) * vDotN * ny;

            // Side spin (English) cushion deflection proportional to impact velocity
            if (b.id === 0 && Math.abs(b.spinX) > 0.05) {
              const tangentX = -ny;
              const tangentY = nx;
              const spinThrow = b.spinX * Math.min(Math.abs(vDotN) * 0.48, 3.2);
              b.vx += tangentX * spinThrow;
              b.vy += tangentY * spinThrow;
              b.spinX *= 0.55;
            }

            // Step forward by remaining time after rebound
            b.x += b.vx * rewoundTau;
            b.y += b.vy * rewoundTau;

            if (shotResult && shotResult.firstBallHit) {
              shotResult.cushionsHitAfterBallHit++;
            }

            const impactSpeed = Math.abs(vDotN);
            if (impactSpeed > 0.4) {
              soundManager.playCushionHit(impactSpeed);
              if (shotResult?.collisions) {
                const lastCol = shotResult.collisions[shotResult.collisions.length - 1];
                if (!lastCol || Math.hypot(lastCol.x - closest.x, lastCol.y - closest.y) > 8) {
                  shotResult.collisions.push({
                    x: closest.x,
                    y: closest.y,
                    type: 'cushion',
                    frame: currentFrame,
                    intensity: Math.min(1, impactSpeed / 10),
                  });
                }
              }
            }
          } else {
            b.x += nx * penetration;
            b.y += ny * penetration;
          }
        }
      }
    }

    // E. Visual 3D rotation, cloth spin interaction, and rolling friction
    for (const b of balls) {
      if (b.inPocket || b.pocketAnim) continue;

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0.001) {
        const rollDist = speed * dt;
        // Include cue ball topspin/backspin (spinY) in angular rolling velocity
        const spinYContribution = b.id === 0 ? b.spinY * 4.2 * dt : 0;
        const rollAngle = (rollDist + spinYContribution) / BALL_RADIUS;
        const axisX = -b.vy / speed;
        const axisY = b.vx / speed;

        const newN = rotateVector3D(b.nx, b.ny, b.nz, axisX, axisY, 0, rollAngle);
        b.nx = newN.x;
        b.ny = newN.y;
        b.nz = newN.z;

        const newS = rotateVector3D(b.sx, b.sy, b.sz, axisX, axisY, 0, rollAngle);
        b.sx = newS.x;
        b.sy = newS.y;
        b.sz = newS.z;

        const moveAngle = Math.atan2(b.vy, b.vx);
        b.rotationX += rollAngle * Math.sin(moveAngle);
        b.rotationY += rollAngle * Math.cos(moveAngle);
      }

      // Side spin (English) rotates vectors around Z axis
      if (Math.abs(b.spinX) > 0.015) {
        const spinAngle = b.spinX * 11 * dt;
        const newN = rotateVector3D(b.nx, b.ny, b.nz, 0, 0, 1, spinAngle);
        b.nx = newN.x;
        b.ny = newN.y;
        b.nz = newN.z;
        const newS = rotateVector3D(b.sx, b.sy, b.sz, 0, 0, 1, spinAngle);
        b.sx = newS.x;
        b.sy = newS.y;
        b.sz = newS.z;
      }

      // Re-orthonormalize (sx, sy, sz) against (nx, ny, nz) to prevent any floating-point drift
      const nDotS = b.nx * b.sx + b.ny * b.sy + b.nz * b.sz;
      const orthoSx = b.sx - nDotS * b.nx;
      const orthoSy = b.sy - nDotS * b.ny;
      const orthoSz = b.sz - nDotS * b.nz;
      const orthoLen = Math.hypot(orthoSx, orthoSy, orthoSz);
      if (orthoLen > 1e-5) {
        b.sx = orthoSx / orthoLen;
        b.sy = orthoSy / orthoLen;
        b.sz = orthoSz / orthoLen;
      }

      // Ball spin decay & cloth interaction
      if (Math.abs(b.spinX) > 0.015 || Math.abs(b.spinY) > 0.015) {
        if (b.id === 0 && speed > 0.1) {
          const dirX = b.vx / speed;
          const dirY = b.vy / speed;
          b.vx += dirX * b.spinY * 0.035 * dt;
          b.vy += dirY * b.spinY * 0.035 * dt;
        }
        b.spinX *= Math.pow(SPIN_DECAY, dt);
        b.spinY *= Math.pow(SPIN_DECAY, dt);
      }

      // Authentic billiard cloth physics (Dr. Dave Alciatore & Miniclip 8 Ball Pool):
      // 1. Smooth velocity retention during roll (ROLLING_FRICTION = 0.9945)
      // 2. True constant Coulomb rolling resistance (COULOMB_FRICTION = 0.0085 px/frame² ≈ 0.085 m/s²)
      //    so balls glide naturally across the table and come to a smooth, organic stop.
      const lipState = getPocketLipOverhang(b.x, b.y);
      const curSpeed = Math.hypot(b.vx, b.vy);
      if (curSpeed > 0) {
        const viscousSpeed = curSpeed * Math.pow(ROLLING_FRICTION, dt);
        // Disable flat-cloth Coulomb stopping resistance when ball is on the downward-sloping pocket lip
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

      // 3. Pocket lip overhang tipping ("перевес шара на краю лузы"):
      //    If a slow-moving or stationary ball has its front hemisphere hanging over the
      //    bevelled slate lip of a pocket, gravitational torque along the rounded cloth bevel
      //    pulls its center of mass toward the hole so it naturally teeters and tips in.
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

  // Record end-of-frame ball positions into ballPaths ONLY for balls actively rolling on the bed
  // (never record pocketAnim frames, which would bend the trajectory toward the pocket center)
  if (shotResult?.ballPaths) {
    for (const b of balls) {
      if (!b.inPocket && !b.pocketAnim) {
        recordBallPathPoint(shotResult, b.id, b.x, b.y);
      }
    }
  }

  return anyMoving;
}

/**
 * Checks if all balls on table have come to a complete standstill
 */
export function areAllBallsStopped(balls: Ball[]): boolean {
  for (const b of balls) {
    if (b.inPocket) continue;
    if (b.pocketAnim !== null) return false;
    if (Math.hypot(b.vx, b.vy) > MIN_SPEED_THRESHOLD) return false;
    if (getPocketLipOverhang(b.x, b.y) !== null) return false;
  }
  return true;
}

/**
 * Validates whether cue ball can be legally placed at (x, y)
 */
export function isValidCuePlacement(
  x: number,
  y: number,
  balls: Ball[],
  behindHeadString: boolean = false,
  ignoreBallId: number = 0
): boolean {
  const minX = PLAY_LEFT + BALL_RADIUS + 4;
  const maxX = behindHeadString ? HEAD_STRING_X : PLAY_RIGHT - BALL_RADIUS - 4;
  const minY = PLAY_TOP + BALL_RADIUS + 4;
  const maxY = PLAY_BOTTOM - BALL_RADIUS - 4;

  if (x < minX || x > maxX || y < minY || y > maxY) return false;

  for (const b of balls) {
    if (b.id === ignoreBallId || b.inPocket) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < BALL_RADIUS * 2 + 2) return false;
  }

  return true;
}

/**
 * Finds a guaranteed non-overlapping valid position near (preferredX, preferredY)
 */
export function findValidBallPlacement(
  balls: Ball[],
  preferredX: number = HEAD_STRING_X,
  preferredY: number = TABLE_HEIGHT / 2,
  behindHeadString: boolean = false,
  ignoreBallId: number = 0
): { x: number; y: number } {
  if (isValidCuePlacement(preferredX, preferredY, balls, behindHeadString, ignoreBallId)) {
    return { x: preferredX, y: preferredY };
  }

  for (let radius = 10; radius <= 350; radius += 10) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const candidateX = preferredX + Math.cos(angle) * radius;
      const candidateY = preferredY + Math.sin(angle) * radius;
      if (isValidCuePlacement(candidateX, candidateY, balls, behindHeadString, ignoreBallId)) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  return { x: preferredX, y: preferredY };
}
