import { Ball, TrajectoryData, TrajectoryPoint } from '../types/game';
import {
  BALL_RADIUS,
  CUSHION_SEGMENTS,
  POCKET_CAPTURE_RADIUS,
  POCKETS,
  RESTITUTION_BALL,
  RESTITUTION_CUSHION,
} from './constants';

/**
 * Calculates ray-circle intersection
 * Returns distance t along ray (origin + t * dir) or null
 */
function rayCircleIntersection(
  origin: TrajectoryPoint,
  dir: TrajectoryPoint,
  center: TrajectoryPoint,
  radius: number
): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;

  const a = dir.x * dir.x + dir.y * dir.y;
  const b = 2 * (ox * dir.x + oy * dir.y);
  const c = ox * ox + oy * oy - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  if (t1 > 0.01) return t1;
  if (t2 > 0.01) return t2;
  return null;
}

/**
 * Calculates ray-segment intersection
 */
function raySegmentIntersection(
  origin: TrajectoryPoint,
  dir: TrajectoryPoint,
  p1: TrajectoryPoint,
  p2: TrajectoryPoint
): { t: number; normal: TrajectoryPoint } | null {
  const v1 = { x: origin.x - p1.x, y: origin.y - p1.y };
  const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const v3 = { x: -dir.y, y: dir.x };

  const dot = v2.x * v3.x + v2.y * v3.y;
  if (Math.abs(dot) < 0.00001) return null;

  const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
  const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

  if (t1 > 0.01 && t2 >= 0 && t2 <= 1) {
    const segLen = Math.hypot(v2.x, v2.y);
    const nx = -v2.y / segLen;
    const ny = v2.x / segLen;
    return { t: t1, normal: { x: nx, y: ny } };
  }

  return null;
}

function isInPocketCapture(x: number, y: number): boolean {
  for (const p of POCKETS) {
    const captureR = p.radius + 2.5;
    const dx = x - p.dropX;
    const dy = y - p.dropY;
    if (dx * dx + dy * dy < captureR * captureR) {
      return true;
    }
  }
  return false;
}

/**
 * Intersects a moving ball of radius BALL_RADIUS with all cushion segments & jaw knuckles,
 * returning the exact distance t and rebound normal where the ball's outer edge hits the rail.
 */
function findClosestCushionHit(
  origin: TrajectoryPoint,
  dir: TrajectoryPoint
): { t: number; normal: TrajectoryPoint; pocketId: string | null } | null {
  let minT = Infinity;
  let bestNormal: TrajectoryPoint | null = null;

  // Check if the ball falls into a pocket before hitting the back of a jaw
  let minPocketT = Infinity;
  let hitPocketId: string | null = null;
  for (const p of POCKETS) {
    const pt = rayCircleIntersection(
      origin,
      dir,
      { x: p.dropX, y: p.dropY },
      p.radius + 2.5
    );
    if (pt !== null && pt < minPocketT) {
      minPocketT = pt;
      hitPocketId = p.id;
    }
  }

  for (const seg of CUSHION_SEGMENTS) {
    const vx = seg.p2.x - seg.p1.x;
    const vy = seg.p2.y - seg.p1.y;
    const len = Math.hypot(vx, vy);
    if (len < 0.001) continue;

    // Orient normal toward table interior (matching seg.normal)
    let nx = -vy / len;
    let ny = vx / len;
    if (nx * seg.normal.x + ny * seg.normal.y < 0) {
      nx = -nx;
      ny = -ny;
    }

    // 1. Offset segment by BALL_RADIUS along normal
    const offP1 = { x: seg.p1.x + nx * BALL_RADIUS, y: seg.p1.y + ny * BALL_RADIUS };
    const offP2 = { x: seg.p2.x + nx * BALL_RADIUS, y: seg.p2.y + ny * BALL_RADIUS };
    const segHit = raySegmentIntersection(origin, dir, offP1, offP2);
    if (segHit && segHit.t < minT) {
      const hx = origin.x + dir.x * segHit.t;
      const hy = origin.y + dir.y * segHit.t;
      if (!isInPocketCapture(hx, hy)) {
        minT = segHit.t;
        bestNormal = { x: nx, y: ny };
      }
    }

    // 2. Endpoint circles (jaw knuckles) of radius BALL_RADIUS
    for (const ep of [seg.p1, seg.p2]) {
      if (isInPocketCapture(ep.x, ep.y)) continue;
      const ct = rayCircleIntersection(origin, dir, ep, BALL_RADIUS);
      if (ct !== null && ct < minT) {
        const hx = origin.x + dir.x * ct;
        const hy = origin.y + dir.y * ct;
        if (!isInPocketCapture(hx, hy)) {
          const cnx = (hx - ep.x) / BALL_RADIUS;
          const cny = (hy - ep.y) / BALL_RADIUS;
          if (dir.x * cnx + dir.y * cny < 0) {
            minT = ct;
            bestNormal = { x: cnx, y: cny };
          }
        }
      }
    }
  }

  // If the ball enters a pocket capture zone before hitting any cushion, it drops into the pocket
  if (minPocketT < minT) {
    const pocket = POCKETS.find(p => p.id === hitPocketId);
    let finalPocketT = minPocketT;
    if (pocket) {
      const entryX = origin.x + dir.x * minPocketT;
      const entryY = origin.y + dir.y * minPocketT;
      const proj = Math.max(
        6,
        Math.min(24, (pocket.dropX - entryX) * dir.x + (pocket.dropY - entryY) * dir.y)
      );
      finalPocketT = minPocketT + proj;
    }
    return { t: finalPocketT, normal: { x: 0, y: 0 }, pocketId: hitPocketId };
  }

  if (minT < Infinity && bestNormal) {
    return { t: minT, normal: bestNormal, pocketId: null };
  }
  return null;
}

/**
 * Computes exact cushion rebound unit vector matching engine.ts (using RESTITUTION_CUSHION)
 */
function computeCushionReboundDir(
  inDir: TrajectoryPoint,
  cushionNormal: TrajectoryPoint
): TrajectoryPoint {
  const vDotN = inDir.x * cushionNormal.x + inDir.y * cushionNormal.y;
  const rx = inDir.x - (1 + RESTITUTION_CUSHION) * vDotN * cushionNormal.x;
  const ry = inDir.y - (1 + RESTITUTION_CUSHION) * vDotN * cushionNormal.y;
  const rLen = Math.hypot(rx, ry) || 1;
  return { x: rx / rLen, y: ry / rLen };
}

/**
 * Computes full trajectory lines for the aiming reticle
 */
export function calculateTrajectory(
  cueBall: Ball,
  aimAngle: number,
  balls: Ball[],
  spinX: number = 0,
  spinY: number = 0,
  guidelineLength: 'full' | 'medium' | 'short' = 'full'
): TrajectoryData {
  const dir: TrajectoryPoint = {
    x: Math.cos(aimAngle),
    y: Math.sin(aimAngle),
  };

  const origin: TrajectoryPoint = { x: cueBall.x, y: cueBall.y };
  let closestBall: Ball | null = null;
  let minBallDist = Infinity;

  // 1. Check collision with any object ball
  for (const b of balls) {
    if (b.id === 0 || b.inPocket || b.pocketAnim) continue;

    const t = rayCircleIntersection(origin, dir, { x: b.x, y: b.y }, BALL_RADIUS * 2);
    if (t !== null && t < minBallDist) {
      minBallDist = t;
      closestBall = b;
    }
  }

  // 2. Check collision with cushions / pockets accounting for BALL_RADIUS
  const cushionHit = findClosestCushionHit(origin, dir);
  const minCushionDist = cushionHit ? cushionHit.t : Infinity;
  const cushionNormal = cushionHit ? cushionHit.normal : null;

  const lengthMultiplier =
    guidelineLength === 'full' ? 1.0 : guidelineLength === 'medium' ? 0.55 : 0.3;

  // Case A: Cue ball hits an object ball first
  if (closestBall && minBallDist < minCushionDist) {
    const ghostBall: TrajectoryPoint = {
      x: origin.x + dir.x * minBallDist,
      y: origin.y + dir.y * minBallDist,
    };

    const objectBallStart: TrajectoryPoint = {
      x: closestBall.x,
      y: closestBall.y,
    };

    // Vector from ghost cue ball center to object ball center
    const contactDx = objectBallStart.x - ghostBall.x;
    const contactDy = objectBallStart.y - ghostBall.y;
    const contactDist = Math.hypot(contactDx, contactDy) || 1;
    const normal: TrajectoryPoint = {
      x: contactDx / contactDist,
      y: contactDy / contactDist,
    };

    // Signed cut angle in degrees (-90° to +90°)
    const dot = Math.max(-1, Math.min(1, dir.x * normal.x + dir.y * normal.y));
    const cross = dir.x * normal.y - dir.y * normal.x;
    const cutAngleRad = Math.acos(dot);
    const cutAngleDeg = ((cutAngleRad * 180) / Math.PI) * (cross >= 0 ? 1 : -1);

    // Object ball path: strictly linear raycast along contact normal
    const maxObjectLine = guidelineLength === 'full' ? 620 : 280 * lengthMultiplier;
    let objectBallLineLen = maxObjectLine;

    // Check if another object ball blocks the target ball's path
    let minOtherBallDist = Infinity;
    for (const b of balls) {
      if (b.id === 0 || b.id === closestBall.id || b.inPocket || b.pocketAnim) continue;
      const bt = rayCircleIntersection(
        objectBallStart,
        normal,
        { x: b.x, y: b.y },
        BALL_RADIUS * 2
      );
      if (bt !== null && bt < minOtherBallDist) {
        minOtherBallDist = bt;
      }
    }

    // Check cushion / pocket hit along target ball's linear path
    const objCushionHit = findClosestCushionHit(objectBallStart, normal);
    let willPot = false;
    let targetPocketId: string | null = null;
    let hitsCushionFirst = false;

    if (objCushionHit) {
      if (objCushionHit.pocketId && objCushionHit.t < minOtherBallDist) {
        willPot = true;
        targetPocketId = objCushionHit.pocketId;
      }
      if (objCushionHit.t < objectBallLineLen && objCushionHit.t < minOtherBallDist) {
        objectBallLineLen = objCushionHit.t;
        if (!objCushionHit.pocketId && Math.hypot(objCushionHit.normal.x, objCushionHit.normal.y) > 0.1) {
          hitsCushionFirst = true;
        }
      }
    }

    if (minOtherBallDist < objectBallLineLen) {
      objectBallLineLen = minOtherBallDist;
      hitsCushionFirst = false;
    }

    const objectBallLineEnd: TrajectoryPoint = {
      x: objectBallStart.x + normal.x * objectBallLineLen,
      y: objectBallStart.y + normal.y * objectBallLineLen,
    };

    // If the target ball hits a cushion rail first, compute its post-cushion rebound vector matching engine.ts
    let objectBallBounceLineEnd: TrajectoryPoint | null = null;
    if (hitsCushionFirst && objCushionHit) {
      const reboundDir = computeCushionReboundDir(normal, objCushionHit.normal);
      let bounceLen = 190 * lengthMultiplier;
      const secondCushion = findClosestCushionHit(objectBallLineEnd, reboundDir);
      if (secondCushion && secondCushion.t < bounceLen) {
        bounceLen = secondCushion.t;
      }
      objectBallBounceLineEnd = {
        x: objectBallLineEnd.x + reboundDir.x * bounceLen,
        y: objectBallLineEnd.y + reboundDir.y * bounceLen,
      };
    }

    // Exact post-impact cue ball velocity vector matching engine.ts
    const estSpeed = 16;
    const vx = dir.x * estSpeed;
    const vy = dir.y * estSpeed;
    const velAlongNormal = vx * normal.x + vy * normal.y;
    const impulse = (1 + RESTITUTION_BALL) * velAlongNormal * 0.5;

    let postVx = vx - impulse * normal.x;
    let postVy = vy - impulse * normal.y;

    if (spinY < -0.05) {
      const drawForce = Math.abs(spinY) * Math.min(velAlongNormal * 0.68, 6.2);
      postVx -= normal.x * drawForce;
      postVy -= normal.y * drawForce;
    } else if (spinY > 0.05) {
      const followForce = spinY * Math.min(velAlongNormal * 0.55, 5.2);
      postVx += normal.x * followForce;
      postVy += normal.y * followForce;
    }

    if (Math.abs(spinX) > 0.05) {
      const throwForce = spinX * Math.min(velAlongNormal * 0.16, 1.4);
      postVx += -normal.y * throwForce;
      postVy += normal.x * throwForce;
    }

    const postLen = Math.hypot(postVx, postVy);
    const finalCueDx = postLen > 0.01 ? postVx / postLen : 0;
    const finalCueDy = postLen > 0.01 ? postVy / postLen : 0;

    let cueDeflectionLen = postLen > 0.05 ? 160 * lengthMultiplier : 0;
    if (cueDeflectionLen > 0) {
      const cueCushionHit = findClosestCushionHit(ghostBall, { x: finalCueDx, y: finalCueDy });
      if (cueCushionHit && cueCushionHit.t < cueDeflectionLen) {
        cueDeflectionLen = cueCushionHit.t;
      }
    }

    const cueDeflectionLineEnd: TrajectoryPoint = {
      x: ghostBall.x + finalCueDx * cueDeflectionLen,
      y: ghostBall.y + finalCueDy * cueDeflectionLen,
    };

    return {
      aimLineEnd: ghostBall,
      hitPoint: ghostBall,
      targetBall: {
        ...closestBall,
        pocketAnim: closestBall.pocketAnim ? { ...closestBall.pocketAnim } : null,
      },
      objectBallStart,
      ghostBall,
      objectBallLineEnd,
      objectBallBounceLineEnd,
      cueDeflectionLineEnd,
      cushionBounceLineEnd: null,
      cutAngleDeg,
      willPot,
      targetPocketId,
    };
  }

  // Case B: Cue ball hits a cushion rail first (or enters pocket)
  if (minCushionDist < Infinity && cushionNormal) {
    const hitPoint: TrajectoryPoint = {
      x: origin.x + dir.x * minCushionDist,
      y: origin.y + dir.y * minCushionDist,
    };

    const hasNormal = Math.hypot(cushionNormal.x, cushionNormal.y) > 0.1;
    let cushionBounceLineEnd: TrajectoryPoint | null = null;

    if (hasNormal) {
      const reflectDir = computeCushionReboundDir(dir, cushionNormal);
      let bounceLen = 200 * lengthMultiplier;
      const nextCushion = findClosestCushionHit(hitPoint, reflectDir);
      if (nextCushion && nextCushion.t < bounceLen) {
        bounceLen = nextCushion.t;
      }
      cushionBounceLineEnd = {
        x: hitPoint.x + reflectDir.x * bounceLen,
        y: hitPoint.y + reflectDir.y * bounceLen,
      };
    }

    return {
      aimLineEnd: hitPoint,
      hitPoint,
      targetBall: null,
      objectBallStart: null,
      ghostBall: null,
      objectBallLineEnd: null,
      objectBallBounceLineEnd: null,
      cueDeflectionLineEnd: null,
      cushionBounceLineEnd,
      cutAngleDeg: null,
      willPot: false,
      targetPocketId: null,
    };
  }

  return {
    aimLineEnd: {
      x: origin.x + dir.x * 500,
      y: origin.y + dir.y * 500,
    },
    hitPoint: null,
    targetBall: null,
    objectBallStart: null,
    ghostBall: null,
    objectBallLineEnd: null,
    objectBallBounceLineEnd: null,
    cueDeflectionLineEnd: null,
    cushionBounceLineEnd: null,
    cutAngleDeg: null,
    willPot: false,
    targetPocketId: null,
  };
}
