import { TableThemeConfig } from '../types/game';
import {
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

/**
 * Helper to adjust hex color brightness
 */
function shadeHexColor(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Renders and caches a 2x supersampled (2000x1080) photorealistic tournament pool table
 * inspired by 8 Ball Pool / Brunswick Gold Crown tables:
 * - Figured mahogany/rosewood rails with realistic wood grain, mitered seams, and glossy lacquer bevels
 * - Recessed featherstrip channel & 3D K-66 cloth-wrapped rubber cushions with perpendicular shading
 * - Soft directional cushion nose shadows cast onto the bed cloth
 * - Fine worsted wool Simonis-style cloth weave with overhead twin-lamp studio illumination
 * - Baulk line (Head String), rack triangle outline, and spot decals
 * - Molded leather pocket liners, deep dark pocket wells with net basket texture, and flush metallic castings
 * - Recessed mother-of-pearl diamond sights set into metallic bezels
 */
class TableRenderer {
  private cache: Map<string, HTMLCanvasElement> = new Map();

  public getTableCanvas(theme: TableThemeConfig): HTMLCanvasElement {
    const cacheKey = `${theme.id}-${theme.feltColor}-${theme.woodTrim}-${theme.pocketRim}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = TABLE_WIDTH * dpr;
    canvas.height = TABLE_HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // =========================================================================
    // 1. WORSTED WOOL PLAYFIELD BED (SIMONIS 860 TOURNAMENT CLOTH)
    // =========================================================================
    const bedPad = 24;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bedPad, bedPad, TABLE_WIDTH - bedPad * 2, TABLE_HEIGHT - bedPad * 2, 16);
    ctx.clip();

    // Base cloth color with smooth, uniform overhead illumination (no circular rings)
    const feltGrad = ctx.createRadialGradient(
      TABLE_WIDTH / 2,
      TABLE_HEIGHT / 2,
      40,
      TABLE_WIDTH / 2,
      TABLE_HEIGHT / 2,
      560
    );
    feltGrad.addColorStop(0, theme.feltHighlight);
    feltGrad.addColorStop(0.65, theme.feltColor);
    feltGrad.addColorStop(1, shadeHexColor(theme.feltColor, -8));
    ctx.fillStyle = feltGrad;
    ctx.fillRect(bedPad, bedPad, TABLE_WIDTH - bedPad * 2, TABLE_HEIGHT - bedPad * 2);

    // Subtle perimeter vignette toward the cushion rails
    const vigGrad = ctx.createRadialGradient(
      TABLE_WIDTH / 2,
      TABLE_HEIGHT / 2,
      180,
      TABLE_WIDTH / 2,
      TABLE_HEIGHT / 2,
      540
    );
    vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vigGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.08)');
    vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(bedPad, bedPad, TABLE_WIDTH - bedPad * 2, TABLE_HEIGHT - bedPad * 2);

    // Fine worsted wool cross-weave micro-texture (subtle 1.5px diagonal twill weave, no vertical bars!)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.016)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let x = bedPad; x < TABLE_WIDTH - bedPad; x += 2.5) {
      ctx.moveTo(x, bedPad);
      ctx.lineTo(x, TABLE_HEIGHT - bedPad);
    }
    for (let y = bedPad; y < TABLE_HEIGHT - bedPad; y += 2.5) {
      ctx.moveTo(bedPad, y);
      ctx.lineTo(TABLE_WIDTH - bedPad, y);
    }
    ctx.stroke();

    // =========================================================================
    // 2. OFFICIAL TOURNAMENT BED MARKINGS (HEAD STRING, RACK OUTLINE, SPOTS)
    // =========================================================================
    // Crisp white chalk baulk line (Head String)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(HEAD_STRING_X, PLAY_TOP);
    ctx.lineTo(HEAD_STRING_X, PLAY_BOTTOM);
    ctx.stroke();

    // Subtle D-zone semi-circle & rack area markings like tournament tables
    const rackDx = 14 * Math.sqrt(3) * 4;
    const rackDy = 14 * 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(
      FOOT_SPOT_X - 16,
      FOOT_SPOT_Y - rackDy - 16,
      rackDx + 32,
      rackDy * 2 + 32,
      14
    );
    ctx.stroke();

    // Head spot, Center spot, and Foot spot tournament decals (dark ring with pale center)
    const drawSpotDecal = (sx: number, sy: number, r: number) => {
      ctx.beginPath();
      ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.fill();
    };

    drawSpotDecal(HEAD_STRING_X, TABLE_HEIGHT / 2, 3.2);
    drawSpotDecal(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 2.6);
    drawSpotDecal(FOOT_SPOT_X, FOOT_SPOT_Y, 3.8);

    // =========================================================================
    // 3. DEEP AMBIENT OCCLUSION SHADOWS UNDER CUSHION NOSES ON PLAYFIELD
    // =========================================================================
    // Top rail shadow on bed
    const topShadow = ctx.createLinearGradient(0, PLAY_TOP - 2, 0, PLAY_TOP + 14);
    topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
    topShadow.addColorStop(0.45, 'rgba(0, 0, 0, 0.18)');
    topShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(PLAY_LEFT, PLAY_TOP - 2, PLAY_RIGHT - PLAY_LEFT, 16);

    // Bottom rail shadow on bed
    const botShadow = ctx.createLinearGradient(0, PLAY_BOTTOM + 2, 0, PLAY_BOTTOM - 12);
    botShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    botShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.14)');
    botShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = botShadow;
    ctx.fillRect(PLAY_LEFT, PLAY_BOTTOM - 12, PLAY_RIGHT - PLAY_LEFT, 14);

    // Left rail shadow on bed
    const leftShadow = ctx.createLinearGradient(PLAY_LEFT - 2, 0, PLAY_LEFT + 14, 0);
    leftShadow.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
    leftShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.15)');
    leftShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(PLAY_LEFT - 2, PLAY_TOP, 16, PLAY_BOTTOM - PLAY_TOP);

    // Right rail shadow on bed
    const rightShadow = ctx.createLinearGradient(PLAY_RIGHT + 2, 0, PLAY_RIGHT - 12, 0);
    rightShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    rightShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.14)');
    rightShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rightShadow;
    ctx.fillRect(PLAY_RIGHT - 12, PLAY_TOP, 14, PLAY_BOTTOM - PLAY_TOP);

    ctx.restore(); // end bed clip

    // =========================================================================
    // 4. DEEP 3D POCKET DROP WELLS (DRAWN BEFORE CUSHIONS SO RAILS OVERHANG CLEANLY)
    // =========================================================================
    for (const p of POCKETS) {
      ctx.save();

      // Deep dark pocket drop well recessed into the slate shelf
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#03050a';
      ctx.fill();

      // Subtle leather net weave at the bottom of the well
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius - 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let d = -p.radius; d <= p.radius; d += 5) {
        ctx.beginPath();
        ctx.moveTo(p.dropX + d, p.dropY - p.radius);
        ctx.lineTo(p.dropX + d + 8, p.dropY + p.radius);
        ctx.moveTo(p.dropX + d, p.dropY + p.radius);
        ctx.lineTo(p.dropX + d + 8, p.dropY - p.radius);
        ctx.stroke();
      }

      // Inner shadow gradient making the pocket look deeply recessed into the slate
      const wellGrad = ctx.createRadialGradient(
        p.dropX + 2,
        p.dropY + 3,
        p.radius * 0.15,
        p.dropX,
        p.dropY,
        p.radius
      );
      wellGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      wellGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.82)');
      wellGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
      ctx.fillStyle = wellGrad;
      ctx.fillRect(p.dropX - p.radius, p.dropY - p.radius, p.radius * 2, p.radius * 2);
      ctx.restore();

      ctx.restore();
    }

    // =========================================================================
    // 5. 3D K-66 CLOTH-WRAPPED RUBBER CUSHION RAILS (SYNCED WITH CUSHION_SEGMENTS)
    // =========================================================================
    const drawRealisticCushion = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      jaw1: { x: number; y: number },
      jaw2: { x: number; y: number },
      gradStart: { x: number; y: number },
      gradEnd: { x: number; y: number },
      isTopOrLeft: boolean
    ) => {
      ctx.save();

      // Cushion body path (from outer featherstrip line jaw1->jaw2 to nose line p1->p2)
      ctx.beginPath();
      ctx.moveTo(jaw1.x, jaw1.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(jaw2.x, jaw2.y);
      ctx.closePath();

      // Base cushion cloth color
      ctx.fillStyle = theme.railColor;
      ctx.fill();

      // Perpendicular 3D K-66 rubber profile shading across the width of the cushion
      const railGrad = ctx.createLinearGradient(
        gradStart.x,
        gradStart.y,
        gradEnd.x,
        gradEnd.y
      );
      if (isTopOrLeft) {
        // Overhead light hits the top face of the cushion, while the nose underside is shaded
        railGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.42)');      // featherstrip recess shadow
        railGrad.addColorStop(0.18, 'rgba(255, 255, 255, 0.16)'); // upper bevel crown highlight
        railGrad.addColorStop(0.68, 'rgba(255, 255, 255, 0.04)');
        railGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0.22)');      // nose bevel slope
        railGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.45)');
      } else {
        // Bottom/Right cushions face the overhead light along their inner nose slope
        railGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.45)');      // featherstrip recess shadow
        railGrad.addColorStop(0.22, 'rgba(0, 0, 0, 0.08)');
        railGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.18)'); // lit K-66 nose crown
        railGrad.addColorStop(0.92, 'rgba(255, 255, 255, 0.26)');
        railGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.25)');
      }
      ctx.fillStyle = railGrad;
      ctx.fill();

      // Subtle bevel crease line 3.5px back from the cushion nose (classic K-66 rubber edge)
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const toRailX = jaw1.x - p1.x;
      const toRailY = jaw1.y - p1.y;
      const sign = nx * toRailX + ny * toRailY > 0 ? 1 : -1;
      const offsetX = nx * sign * 3.5;
      const offsetY = ny * sign * 3.5;

      ctx.beginPath();
      ctx.moveTo(p1.x + offsetX, p1.y + offsetY);
      ctx.lineTo(p2.x + offsetX, p2.y + offsetY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Crisp dark shadow on jaw bevel edges
      ctx.beginPath();
      ctx.moveTo(jaw1.x, jaw1.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(jaw2.x, jaw2.y);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    };

    // Top-Left Cushion (exact match to CUSHION_SEGMENTS)
    drawRealisticCushion(
      { x: 84, y: PLAY_TOP },
      { x: TABLE_WIDTH / 2 - 28, y: PLAY_TOP },
      { x: 64, y: 28 },
      { x: TABLE_WIDTH / 2 - 23.5, y: 28 },
      { x: 250, y: 28 },
      { x: 250, y: PLAY_TOP },
      true
    );

    // Top-Right Cushion
    drawRealisticCushion(
      { x: TABLE_WIDTH / 2 + 28, y: PLAY_TOP },
      { x: TABLE_WIDTH - 84, y: PLAY_TOP },
      { x: TABLE_WIDTH / 2 + 23.5, y: 28 },
      { x: TABLE_WIDTH - 64, y: 28 },
      { x: 750, y: 28 },
      { x: 750, y: PLAY_TOP },
      true
    );

    // Bottom-Left Cushion
    drawRealisticCushion(
      { x: 84, y: PLAY_BOTTOM },
      { x: TABLE_WIDTH / 2 - 28, y: PLAY_BOTTOM },
      { x: 64, y: TABLE_HEIGHT - 28 },
      { x: TABLE_WIDTH / 2 - 23.5, y: TABLE_HEIGHT - 28 },
      { x: 250, y: TABLE_HEIGHT - 28 },
      { x: 250, y: PLAY_BOTTOM },
      false
    );

    // Bottom-Right Cushion
    drawRealisticCushion(
      { x: TABLE_WIDTH / 2 + 28, y: PLAY_BOTTOM },
      { x: TABLE_WIDTH - 84, y: PLAY_BOTTOM },
      { x: TABLE_WIDTH / 2 + 23.5, y: TABLE_HEIGHT - 28 },
      { x: TABLE_WIDTH - 64, y: TABLE_HEIGHT - 28 },
      { x: 750, y: TABLE_HEIGHT - 28 },
      { x: 750, y: PLAY_BOTTOM },
      false
    );

    // Left Cushion
    drawRealisticCushion(
      { x: PLAY_LEFT, y: 74 },
      { x: PLAY_LEFT, y: TABLE_HEIGHT - 74 },
      { x: 34, y: 54 },
      { x: 34, y: TABLE_HEIGHT - 54 },
      { x: 34, y: 270 },
      { x: PLAY_LEFT, y: 270 },
      true
    );

    // Right Cushion
    drawRealisticCushion(
      { x: PLAY_RIGHT, y: 74 },
      { x: PLAY_RIGHT, y: TABLE_HEIGHT - 74 },
      { x: TABLE_WIDTH - 34, y: 54 },
      { x: TABLE_WIDTH - 34, y: TABLE_HEIGHT - 54 },
      { x: TABLE_WIDTH - 34, y: 270 },
      { x: PLAY_RIGHT, y: 270 },
      false
    );

    // =========================================================================
    // 6. FIGURED MAHOGANY / HARDWOOD OUTER RAILS WITH LACQUER BEVELS
    // =========================================================================
    // Carve out the inner playfield + cushion area using even-odd winding
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT, 28);
    ctx.rect(34, 28, TABLE_WIDTH - 68, TABLE_HEIGHT - 56);
    ctx.clip('evenodd');

    // Rich multi-stop hardwood base
    const woodBaseGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    woodBaseGrad.addColorStop(0, shadeHexColor(theme.woodTrim, -8));
    woodBaseGrad.addColorStop(0.25, theme.woodGrain);
    woodBaseGrad.addColorStop(0.5, shadeHexColor(theme.woodGrain, 12));
    woodBaseGrad.addColorStop(0.75, theme.woodGrain);
    woodBaseGrad.addColorStop(1, shadeHexColor(theme.woodTrim, -10));
    ctx.fillStyle = woodBaseGrad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Organic cathedral wood grain fibers & knots along top/bottom rails (horizontal) and side rails (vertical)
    ctx.save();
    for (let i = 0; i < 160; i++) {
      const yTop = (i * 7) % 28;
      const yBot = TABLE_HEIGHT - 28 + ((i * 7) % 28);
      const xStart = (i * 53) % TABLE_WIDTH;
      const len = 45 + ((i * 29) % 110);
      ctx.fillStyle =
        i % 3 === 0 ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 190, 120, 0.06)';
      ctx.fillRect(xStart, yTop, len, 1.2);
      ctx.fillRect((xStart + 300) % TABLE_WIDTH, yBot, len, 1.2);
    }
    for (let i = 0; i < 110; i++) {
      const xLeft = (i * 5) % 34;
      const xRight = TABLE_WIDTH - 34 + ((i * 5) % 34);
      const yStart = (i * 43) % TABLE_HEIGHT;
      const len = 35 + ((i * 23) % 85);
      ctx.fillStyle =
        i % 3 === 0 ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 190, 120, 0.06)';
      ctx.fillRect(xLeft, yStart, 1.2, len);
      ctx.fillRect(xRight, (yStart + 180) % TABLE_HEIGHT, 1.2, len);
    }
    ctx.restore();

    // 3D cylindrical glossy lacquer highlight along each of the 4 wood rails
    // Top wood rail (y: 0 -> 28)
    const topRailLacquer = ctx.createLinearGradient(0, 0, 0, 28);
    topRailLacquer.addColorStop(0.0, 'rgba(0, 0, 0, 0.55)');
    topRailLacquer.addColorStop(0.22, 'rgba(255, 255, 255, 0.18)');
    topRailLacquer.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
    topRailLacquer.addColorStop(0.85, 'rgba(0, 0, 0, 0.28)');
    topRailLacquer.addColorStop(1.0, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = topRailLacquer;
    ctx.fillRect(0, 0, TABLE_WIDTH, 28);

    // Bottom wood rail (y: TABLE_HEIGHT - 28 -> TABLE_HEIGHT)
    const botRailLacquer = ctx.createLinearGradient(0, TABLE_HEIGHT - 28, 0, TABLE_HEIGHT);
    botRailLacquer.addColorStop(0.0, 'rgba(0, 0, 0, 0.65)');
    botRailLacquer.addColorStop(0.22, 'rgba(255, 255, 255, 0.16)');
    botRailLacquer.addColorStop(0.50, 'rgba(255, 255, 255, 0.04)');
    botRailLacquer.addColorStop(0.85, 'rgba(0, 0, 0, 0.35)');
    botRailLacquer.addColorStop(1.0, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = botRailLacquer;
    ctx.fillRect(0, TABLE_HEIGHT - 28, TABLE_WIDTH, 28);

    // Left wood rail (x: 0 -> 34)
    const leftRailLacquer = ctx.createLinearGradient(0, 0, 34, 0);
    leftRailLacquer.addColorStop(0.0, 'rgba(0, 0, 0, 0.55)');
    leftRailLacquer.addColorStop(0.25, 'rgba(255, 255, 255, 0.15)');
    leftRailLacquer.addColorStop(0.55, 'rgba(255, 255, 255, 0.02)');
    leftRailLacquer.addColorStop(0.88, 'rgba(0, 0, 0, 0.32)');
    leftRailLacquer.addColorStop(1.0, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = leftRailLacquer;
    ctx.fillRect(0, 28, 34, TABLE_HEIGHT - 56);

    // Right wood rail (x: TABLE_WIDTH - 34 -> TABLE_WIDTH)
    const rightRailLacquer = ctx.createLinearGradient(TABLE_WIDTH - 34, 0, TABLE_WIDTH, 0);
    rightRailLacquer.addColorStop(0.0, 'rgba(0, 0, 0, 0.65)');
    rightRailLacquer.addColorStop(0.25, 'rgba(255, 255, 255, 0.15)');
    rightRailLacquer.addColorStop(0.55, 'rgba(255, 255, 255, 0.02)');
    rightRailLacquer.addColorStop(0.88, 'rgba(0, 0, 0, 0.38)');
    rightRailLacquer.addColorStop(1.0, 'rgba(0, 0, 0, 0.68)');
    ctx.fillStyle = rightRailLacquer;
    ctx.fillRect(TABLE_WIDTH - 34, 28, 34, TABLE_HEIGHT - 56);

    // Re-carve pocket openings through the wood rail where the pocket well extends into the wood frame
    for (const p of POCKETS) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#03050a';
      ctx.fill();

      const wellGrad = ctx.createRadialGradient(
        p.dropX + 2,
        p.dropY + 3,
        p.radius * 0.15,
        p.dropX,
        p.dropY,
        p.radius
      );
      wellGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      wellGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.82)');
      wellGrad.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
      ctx.fillStyle = wellGrad;
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // end wood rail clip

    // Featherstrip trim line separating wood rail from cushion segments (skipping pocket throats!)
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    // Top-Left & Top-Right featherstrips
    ctx.moveTo(64, 28);
    ctx.lineTo(TABLE_WIDTH / 2 - 23.5, 28);
    ctx.moveTo(TABLE_WIDTH / 2 + 23.5, 28);
    ctx.lineTo(TABLE_WIDTH - 64, 28);
    // Bottom-Left & Bottom-Right featherstrips
    ctx.moveTo(64, TABLE_HEIGHT - 28);
    ctx.lineTo(TABLE_WIDTH / 2 - 23.5, TABLE_HEIGHT - 28);
    ctx.moveTo(TABLE_WIDTH / 2 + 23.5, TABLE_HEIGHT - 28);
    ctx.lineTo(TABLE_WIDTH - 64, TABLE_HEIGHT - 28);
    // Left & Right featherstrips
    ctx.moveTo(34, 54);
    ctx.lineTo(34, TABLE_HEIGHT - 54);
    ctx.moveTo(TABLE_WIDTH - 34, 54);
    ctx.lineTo(TABLE_WIDTH - 34, TABLE_HEIGHT - 54);
    ctx.stroke();
    ctx.restore();

    // Outer table cabinet metallic bevel rim
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(1, 1, TABLE_WIDTH - 2, TABLE_HEIGHT - 2, 27);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // =========================================================================
    // 7. INLAID MOTHER-OF-PEARL DIAMOND SIGHTS ON WOOD RAILS
    // =========================================================================
    const drawDiamondSight = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);

      // Metallic bezel shadow & gold/chrome setting
      ctx.beginPath();
      ctx.moveTo(0, -4.8);
      ctx.lineTo(4.8, 0);
      ctx.lineTo(0, 4.8);
      ctx.lineTo(-4.8, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fill();

      // Inner mother-of-pearl diamond inlay
      ctx.beginPath();
      ctx.moveTo(0, -3.6);
      ctx.lineTo(3.6, 0);
      ctx.lineTo(0, 3.6);
      ctx.lineTo(-3.6, 0);
      ctx.closePath();
      const pearlGrad = ctx.createLinearGradient(-3, -3, 3, 3);
      pearlGrad.addColorStop(0, '#ffffff');
      pearlGrad.addColorStop(0.5, '#e2e8f0');
      pearlGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = pearlGrad;
      ctx.fill();

      ctx.restore();
    };

    const stepX = (PLAY_RIGHT - PLAY_LEFT) / 8;
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue; // Center is occupied by side pocket
      drawDiamondSight(PLAY_LEFT + i * stepX, 14);
      drawDiamondSight(PLAY_LEFT + i * stepX, TABLE_HEIGHT - 14);
    }
    const stepY = (PLAY_BOTTOM - PLAY_TOP) / 4;
    for (let i = 1; i <= 3; i++) {
      drawDiamondSight(17, PLAY_TOP + i * stepY);
      drawDiamondSight(TABLE_WIDTH - 17, PLAY_TOP + i * stepY);
    }

    // =========================================================================
    // 8. FLUSH METALLIC POCKET CASTINGS & LEATHER SHIELD LINERS (ON WOOD RAIL ONLY)
    // =========================================================================
    for (const p of POCKETS) {
      ctx.save();

      // Clip pocket castings and leather shields to the outer table silhouette
      ctx.beginPath();
      ctx.roundRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT, 28);
      ctx.clip();

      // Exact angular span where the pocket well meets the outer wood rail (jaw-to-jaw)
      let startAng = 0;
      let endAng = 0;
      if (p.id === 'top-left') {
        startAng = 0.58 * Math.PI;
        endAng = 1.97 * Math.PI;
      } else if (p.id === 'top-right') {
        startAng = 1.03 * Math.PI;
        endAng = 2.42 * Math.PI;
      } else if (p.id === 'bot-right') {
        startAng = -0.42 * Math.PI;
        endAng = 0.97 * Math.PI;
      } else if (p.id === 'bot-left') {
        startAng = 0.03 * Math.PI;
        endAng = 1.42 * Math.PI;
      } else if (p.id === 'top-mid') {
        startAng = 1.04 * Math.PI;
        endAng = 1.96 * Math.PI;
      } else if (p.id === 'bot-mid') {
        startAng = 0.04 * Math.PI;
        endAng = 0.96 * Math.PI;
      }

      // 8A. Outer Flush Chrome / Brass Metallic Pocket Casting (set strictly into the outer wood rail)
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius + 9.5, startAng, endAng);
      ctx.arc(p.dropX, p.dropY, p.radius + 2.0, endAng, startAng, true);
      ctx.closePath();

      const metalGrad = ctx.createLinearGradient(
        p.dropX - 28,
        p.dropY - 28,
        p.dropX + 28,
        p.dropY + 28
      );
      metalGrad.addColorStop(0.0, '#ffffff');
      metalGrad.addColorStop(0.28, theme.pocketRim);
      metalGrad.addColorStop(0.55, shadeHexColor(theme.pocketRim, -28));
      metalGrad.addColorStop(0.80, theme.pocketRim);
      metalGrad.addColorStop(1.0, '#1e293b');

      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = metalGrad;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // Decorative flush bolts on the metallic casting
      const midAng = (startAng + endAng) * 0.5;
      for (const offsetAng of [-0.38, 0, 0.38]) {
        const boltAng = midAng + offsetAng;
        const bx = p.dropX + Math.cos(boltAng) * (p.radius + 5.8);
        const by = p.dropY + Math.sin(boltAng) * (p.radius + 5.8);
        ctx.beginPath();
        ctx.arc(bx, by, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fill();
      }
      ctx.restore();

      // 8B. Molded Dark Leather / Rubber Pocket Liner Band (flush with the back of the pocket jaws)
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius + 2.5, startAng - 0.02, endAng + 0.02);
      ctx.arc(p.dropX, p.dropY, p.radius - 2.0, endAng + 0.02, startAng - 0.02, true);
      ctx.closePath();

      const leatherGrad = ctx.createLinearGradient(
        p.dropX - 20,
        p.dropY - 20,
        p.dropX + 20,
        p.dropY + 20
      );
      leatherGrad.addColorStop(0, '#27272a');
      leatherGrad.addColorStop(0.5, '#18181b');
      leatherGrad.addColorStop(1, '#09090b');
      ctx.fillStyle = leatherGrad;
      ctx.fill();

      // Subtle leather rim highlight along the inner well wall
      ctx.beginPath();
      ctx.arc(p.dropX, p.dropY, p.radius - 1.5, startAng, endAng);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    this.cache.set(cacheKey, canvas);
    return canvas;
  }
}

export const tableRenderer = new TableRenderer();
