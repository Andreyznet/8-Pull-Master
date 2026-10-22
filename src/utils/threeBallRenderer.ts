import * as THREE from 'three';
import { Ball } from '../types/game';
import { BALL_COLORS, BALL_RADIUS, TABLE_HEIGHT, TABLE_WIDTH } from '../physics/constants';

/**
 * Generates an authentic 1024x512 equirectangular spherical texture for a billiard ball (0..15).
 * Uses exact 3D spherical coordinate mapping so circular badges, measles dots, and equatorial
 * stripes suffer zero equirectangular polar distortion when wrapped onto a 3D SphereGeometry.
 */
function createBallEquirectangularTexture(ballId: number): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const ballColorInfo = BALL_COLORS[ballId] || { hex: '#ffffff', name: 'Cue' };
  const primaryHex = ballColorInfo.hex;
  const isStripe = ballId >= 9 && ballId <= 15;
  const isCue = ballId === 0;

  // 1. Base coat (Warm Aramith phenolic ivory for cue & stripes, rich pigment for solids/8-ball)
  const ivoryColor = '#f8f5ec';
  ctx.fillStyle = isCue || isStripe ? ivoryColor : primaryHex;
  ctx.fillRect(0, 0, width, height);

  // Subtle phenolic resin micro-variation along latitude
  const sheenGrad = ctx.createLinearGradient(0, 0, 0, height);
  sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  sheenGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.02)');
  sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.fillStyle = sheenGrad;
  ctx.fillRect(0, 0, width, height);

  if (isCue) {
    // Pro-Cup Aramith Measles Cue Ball: 6 crimson dots at octahedral poles (±X, ±Y, ±Z)
    // Drawn using exact spherical angular distance so even polar dots are perfect circles on the 3D sphere!
    const dotRadiusRad = 0.21; // ~12 degrees angular radius
    const cosMax = Math.cos(dotRadiusRad);
    const cosEdge = Math.cos(dotRadiusRad * 0.92);

    const poles = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      const theta = ((py + 0.5) / height) * Math.PI; // 0 at North Pole (+Y), PI at South Pole (-Y)
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let px = 0; px < width; px++) {
        const phi = ((px + 0.5) / width) * Math.PI * 2;
        // Match Three.js SphereGeometry vertex layout:
        // x = -cos(phi)*sin(theta), y = cos(theta), z = sin(phi)*sin(theta)
        const sx = -Math.cos(phi) * sinTheta;
        const sy = cosTheta;
        const sz = Math.sin(phi) * sinTheta;

        for (let p = 0; p < poles.length; p++) {
          const dot = sx * poles[p][0] + sy * poles[p][1] + sz * poles[p][2];
          if (dot >= cosMax) {
            const alpha =
              dot >= cosEdge ? 1.0 : Math.max(0, (dot - cosMax) / (cosEdge - cosMax));
            const idx = (py * width + px) * 4;
            // Crimson Aramith dot (#d91b24)
            data[idx] = Math.round(data[idx] * (1 - alpha) + 217 * alpha);
            data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + 27 * alpha);
            data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + 36 * alpha);
            break;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else {
    // 2. For Striped Balls (9..15): Draw the equatorial colored band around the sphere
    // In equirectangular map, latitude lines are horizontal lines!
    // A stripe spanning |y_local| <= 0.57 corresponds to theta in [acos(0.57), PI - acos(0.57)]
    if (isStripe) {
      const latBoundary = Math.acos(0.57); // ~55.2 deg from pole (±34.8 deg from equator)
      const yTop = (latBoundary / Math.PI) * height;
      const yBottom = ((Math.PI - latBoundary) / Math.PI) * height;

      ctx.fillStyle = primaryHex;
      ctx.fillRect(0, yTop, width, yBottom - yTop);

      // Subtle darker trim line along stripe borders for crisp tournament look
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(0, yTop - 1.5, width, 3);
      ctx.fillRect(0, yBottom - 1.5, width, 3);
    }

    // 3. Render a high-resolution 2D tangent-plane Number Badge (256x256)
    const badgeSize = 256;
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = badgeSize;
    badgeCanvas.height = badgeSize;
    const bCtx = badgeCanvas.getContext('2d')!;

    const bCenter = badgeSize / 2;
    const bRadius = badgeSize * 0.46;

    // White circular badge background
    bCtx.beginPath();
    bCtx.arc(bCenter, bCenter, bRadius, 0, Math.PI * 2);
    bCtx.fillStyle = '#fcfaf5';
    bCtx.fill();

    // Subtle dark outer hairline & inner tournament ring on striped/8-ball badges
    bCtx.lineWidth = 3.5;
    bCtx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    bCtx.stroke();

    // Crisp bold number typography
    bCtx.fillStyle = '#0f172a';
    bCtx.font = `900 ${ ballId >= 10 ? 116 : 126 }px "Outfit", "Arial Black", sans-serif`;
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText(String(ballId), bCenter, bCenter + 4);

    // Classic tournament underline under 6 and 9 to distinguish orientation in 3D
    if (ballId === 6 || ballId === 9) {
      bCtx.fillStyle = '#0f172a';
      bCtx.fillRect(bCenter - 28, bCenter + 54, 56, 9);
    }

    const badgeData = bCtx.getImageData(0, 0, badgeSize, badgeSize).data;

    // 4. Project the tangent-plane badge onto the two diametrically opposite poles:
    // Front badge at local +Z (0, 0, 1) -> phi = PI/2 (u = 0.25)
    // Back badge at local -Z (0, 0, -1) -> phi = 3*PI/2 (u = 0.75)
    // Both have local +Y (0, 1, 0) as the "UP" direction of the digits!
    const badgeAngularRadius = 0.455; // ~26.1 deg angular radius on sphere (sin(0.455) ≈ 0.44 R)
    const maxTan = Math.tan(badgeAngularRadius);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      const theta = ((py + 0.5) / height) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      // Quick latitude bounds check: badge only exists near equator
      if (Math.abs(cosTheta) > Math.sin(badgeAngularRadius + 0.05)) continue;

      for (let px = 0; px < width; px++) {
        const phi = ((px + 0.5) / width) * Math.PI * 2;
        const sx = -Math.cos(phi) * sinTheta;
        const sy = cosTheta;
        const sz = Math.sin(phi) * sinTheta;

        // Check Front Badge (+Z) or Back Badge (-Z)
        const absZ = Math.abs(sz);
        if (absZ < Math.cos(badgeAngularRadius)) continue;

        // Gnomonic / orthographic tangent coordinates relative to badge center:
        // When looking at +Z from outside (+Z), right is +X, up is +Y.
        // When looking at -Z from outside (-Z), right is -X, up is +Y.
        const signZ = sz > 0 ? 1 : -1;
        const tanX = (signZ * sx) / absZ;
        const tanY = -sy / absZ; // canvas Y goes down

        const normDist = Math.hypot(tanX, tanY) / maxTan;
        if (normDist <= 1.0) {
          const bx = Math.min(
            badgeSize - 1,
            Math.max(0, Math.floor((tanX / maxTan * 0.46 + 0.5) * badgeSize))
          );
          const by = Math.min(
            badgeSize - 1,
            Math.max(0, Math.floor((tanY / maxTan * 0.46 + 0.5) * badgeSize))
          );

          const bIdx = (by * badgeSize + bx) * 4;
          const bAlpha = badgeData[bIdx + 3] / 255;

          if (bAlpha > 0.01) {
            // Smooth anti-aliased edge feathering on the sphere
            const edgeFeather = normDist > 0.95 ? Math.max(0, (1.0 - normDist) / 0.05) : 1.0;
            const finalAlpha = bAlpha * edgeFeather;

            const idx = (py * width + px) * 4;
            data[idx] = Math.round(data[idx] * (1 - finalAlpha) + badgeData[bIdx] * finalAlpha);
            data[idx + 1] = Math.round(
              data[idx + 1] * (1 - finalAlpha) + badgeData[bIdx + 1] * finalAlpha
            );
            data[idx + 2] = Math.round(
              data[idx + 2] * (1 - finalAlpha) + badgeData[bIdx + 2] * finalAlpha
            );
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an overhead billiard table lamp studio reflection environment map
 * so the 3D spheres have crisp overhead fluorescent/halide pool table reflections.
 */
function createStudioEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0f172a);

  // Two bright overhead billiard table light panels (+Z in camera/table space)
  const panelGeo = new THREE.PlaneGeometry(28, 10);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const lightPanel1 = new THREE.Mesh(panelGeo, panelMat);
  lightPanel1.position.set(-10, 8, 35);
  envScene.add(lightPanel1);

  const lightPanel2 = new THREE.Mesh(panelGeo, panelMat);
  lightPanel2.position.set(12, 8, 35);
  envScene.add(lightPanel2);

  // Soft warm rim fill
  const rimGeo = new THREE.SphereGeometry(60, 16, 16);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x1e293b,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(rimGeo, rimMat));

  const envTexture = pmremGenerator.fromScene(envScene, 0.03).texture;
  pmremGenerator.dispose();
  return envTexture;
}

/**
 * Singleton Three.js 3D WebGL Ball Renderer + Authentic Textured Cue Stick Renderer
 */
class ThreePoolRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private ballMeshes: Map<number, THREE.Mesh> = new Map();
  private ballMaterials: Map<number, THREE.MeshPhysicalMaterial> = new Map();
  private bounceLight: THREE.DirectionalLight | null = null;
  private cueTextureCanvas: HTMLCanvasElement | null = null;
  private ballIconCache: Map<number, string> = new Map();

  // Reusable math objects to avoid per-frame allocations
  private tempVecN = new THREE.Vector3();
  private tempVecS = new THREE.Vector3();
  private tempVecT = new THREE.Vector3();
  private tempMat4 = new THREE.Matrix4();

  private init() {
    if (this.renderer) return;

    const dpr = 2; // 2x supersampled resolution (2000x1080) for razor-sharp spheres and numbers
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setSize(TABLE_WIDTH * dpr, TABLE_HEIGHT * dpr, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    const scene = new THREE.Scene();

    // Orthographic camera matching table coordinates:
    // X: 0 -> TABLE_WIDTH (left to right)
    // Y: 0 -> -TABLE_HEIGHT (top to bottom in right-handed 3D space)
    const camera = new THREE.OrthographicCamera(
      0,
      TABLE_WIDTH,
      0,
      -TABLE_HEIGHT,
      1,
      1000
    );
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);

    const envMap = createStudioEnvironmentMap(renderer);
    scene.environment = envMap;

    // 1. Ambient base illumination so dark balls (8-ball) show clear 3D curvature
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    // 2. Main overhead billiard table lamp (slightly top-left of center)
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.25);
    keyLight.position.set(-180, 220, 460);
    scene.add(keyLight);

    // 3. Secondary overhead fill lamp
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.85);
    fillLight.position.set(220, -140, 380);
    scene.add(fillLight);

    // 4. Felt bounce light from below (-Z / lower rim)
    const bounceLight = new THREE.DirectionalLight(0x10b981, 0.65);
    bounceLight.position.set(0, -300, -180);
    scene.add(bounceLight);
    this.bounceLight = bounceLight;

    // Shared high-tesselation sphere geometry
    const sphereGeo = new THREE.SphereGeometry(BALL_RADIUS, 48, 36);

    for (let id = 0; id <= 15; id++) {
      const texture = createBallEquirectangularTexture(id);
      const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.14,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        reflectivity: 0.9,
        envMapIntensity: 0.85,
        transparent: true,
        opacity: 1.0,
      });

      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.visible = false;
      scene.add(mesh);

      this.ballMeshes.set(id, mesh);
      this.ballMaterials.set(id, material);
    }

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Updates all 3D ball meshes from physics state, renders the WebGL scene,
   * and returns the offscreen WebGL canvas to composite onto the 2D table canvas.
   */
  public renderBalls(balls: Ball[], feltHex: string): HTMLCanvasElement {
    this.init();
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;

    if (this.bounceLight) {
      this.bounceLight.color.set(feltHex);
    }

    // Hide all meshes first
    for (const mesh of this.ballMeshes.values()) {
      mesh.visible = false;
    }

    for (const b of balls) {
      if (b.inPocket) continue;
      const mesh = this.ballMeshes.get(b.id);
      const mat = this.ballMaterials.get(b.id);
      if (!mesh || !mat) continue;

      mesh.visible = true;

      const scale = b.pocketAnim ? Math.max(0.28, b.pocketAnim.scale) : 1.0;
      const alpha = b.pocketAnim ? Math.max(0, b.pocketAnim.alpha) : 1.0;
      const dropProgress = b.pocketAnim?.progress ?? 0;

      // Darken the 3D sphere as it plunges into the unlit pocket well (authentic 8 Ball Pool look)
      const shade = b.pocketAnim ? Math.max(0.08, 1.0 - Math.pow(dropProgress, 1.15) * 0.92) : 1.0;
      mat.color.setRGB(shade, shade, shade);
      mat.envMapIntensity = 0.85 * shade;

      mesh.position.set(b.x, -b.y, 0);
      mesh.scale.setScalar(scale);
      mat.opacity = alpha;

      // Construct exact right-handed 3D rotation basis from (nx, ny, nz) and (sx, sy, sz):
      // In physics space, +X is right, +Y is down, +Z is out of screen.
      // In Three.js world space, +X is right, +Y is up (-y_screen), +Z is out of screen.
      this.tempVecN.set(b.nx, -b.ny, b.nz);
      if (this.tempVecN.lengthSq() < 1e-5) {
        this.tempVecN.set(0, 0, 1);
      } else {
        this.tempVecN.normalize();
      }

      this.tempVecS.set(b.sx, -b.sy, b.sz);
      // Gram-Schmidt orthogonalize S against N so basis is strictly orthonormal
      this.tempVecS.addScaledVector(this.tempVecN, -this.tempVecS.dot(this.tempVecN));
      if (this.tempVecS.lengthSq() < 1e-5) {
        // Fallback orthogonal vector if degenerate
        if (Math.abs(this.tempVecN.y) < 0.9) {
          this.tempVecS.set(0, 1, 0).addScaledVector(this.tempVecN, -this.tempVecN.y).normalize();
        } else {
          this.tempVecS.set(1, 0, 0).addScaledVector(this.tempVecN, -this.tempVecN.x).normalize();
        }
      } else {
        this.tempVecS.normalize();
      }

      // Right-handed third basis vector: T = S x N (since X = Y x Z)
      this.tempVecT.crossVectors(this.tempVecS, this.tempVecN).normalize();

      this.tempMat4.makeBasis(this.tempVecT, this.tempVecS, this.tempVecN);
      mesh.quaternion.setFromRotationMatrix(this.tempMat4);
    }

    renderer.render(scene, camera);
    return renderer.domElement;
  }

  /**
   * Generates and caches a high-resolution (1200 x 64) textured tournament cue stick sprite
   * with authentic Canadian hard-rock maple wood grain, 4-point flame-veneer ebony splices,
   * mother-of-pearl diamond inlays, braided Irish linen grip wrap, stainless steel joint,
   * ivory ferrule, and domed Master-chalked leather tip.
   */
  private getCueStickTexture(): HTMLCanvasElement {
    if (this.cueTextureCanvas) return this.cueTextureCanvas;

    const width = 1200; // 3x supersampled for 400px cue length
    const height = 72;  // Supersampled thickness
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const cy = height / 2;
    const tipHalfH = 7.5;   // tip radius in texture space
    const buttHalfH = 22.5; // butt radius in texture space
    const tipX = 24;        // leave room at left for domed leather tip
    const endX = width - 12;
    const bodyLen = endX - tipX;

    const getHalfWidthAt = (x: number) => {
      const t = Math.max(0, Math.min(1, (x - tipX) / bodyLen));
      // Pro-taper curve (steeper taper in forearm/butt, gentle taper in shaft)
      const taper = t < 0.45 ? t * 0.65 : 0.2925 + (t - 0.45) * 1.286;
      return tipHalfH + (buttHalfH - tipHalfH) * Math.min(1, taper);
    };

    // Clip to exact tapered cue silhouette (plus rounded domed tip & rubber bumper)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tipX, cy - tipHalfH);
    for (let x = tipX; x <= endX; x += 12) {
      ctx.lineTo(x, cy - getHalfWidthAt(x));
    }
    // Rounded rubber bumper at butt end
    ctx.arc(endX, cy, buttHalfH, -Math.PI / 2, Math.PI / 2);
    for (let x = endX; x >= tipX; x -= 12) {
      ctx.lineTo(x, cy + getHalfWidthAt(x));
    }
    // Domed leather tip at front end
    ctx.arc(tipX - 6, cy, tipHalfH, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.clip();

    // ----------------------------------------------------
    // 1. BLUE MASTER CHALK & COMPRESSED LEATHER TIP (0 -> tipX)
    // ----------------------------------------------------
    const tipGrad = ctx.createLinearGradient(tipX - 14, 0, tipX, 0);
    tipGrad.addColorStop(0, '#1d4ed8');   // Royal blue chalk crown
    tipGrad.addColorStop(0.55, '#2563eb');
    tipGrad.addColorStop(0.62, '#78350f'); // Compressed pigskin leather layers
    tipGrad.addColorStop(0.92, '#451a03');
    tipGrad.addColorStop(1, '#1c1917');   // Black fiber pad
    ctx.fillStyle = tipGrad;
    ctx.fillRect(0, 0, tipX, height);

    // ----------------------------------------------------
    // 2. IVORY PHENOLIC FERRULE (tipX -> tipX + 26)
    // ----------------------------------------------------
    const ferruleEnd = tipX + 26;
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(tipX, 0, 26, height);
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(ferruleEnd - 2, 0, 2, height);

    // ----------------------------------------------------
    // 3. CANADIAN HARD ROCK MAPLE SHAFT (ferruleEnd -> jointStart)
    // ----------------------------------------------------
    const jointStart = tipX + Math.round(bodyLen * 0.46);
    const mapleGrad = ctx.createLinearGradient(ferruleEnd, 0, jointStart, 0);
    mapleGrad.addColorStop(0, '#f5e6c8');
    mapleGrad.addColorStop(0.5, '#edd29f');
    mapleGrad.addColorStop(1, '#dfba78');
    ctx.fillStyle = mapleGrad;
    ctx.fillRect(ferruleEnd, 0, jointStart - ferruleEnd, height);

    // Fine realistic maple wood grain fibers & pores along shaft
    for (let i = 0; i < 95; i++) {
      const gx = ferruleEnd + ((i * 73) % (jointStart - ferruleEnd - 30));
      const gy = ((i * 29) % height);
      const glen = 25 + ((i * 17) % 65);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(146, 64, 14, 0.11)' : 'rgba(180, 83, 9, 0.07)';
      ctx.fillRect(gx, gy, glen, 1.2);
    }

    // ----------------------------------------------------
    // 4. POLISHED STAINLESS STEEL & BRASS JOINT COLLAR
    // ----------------------------------------------------
    const jointWidth = 34;
    const forearmStart = jointStart + jointWidth;
    // Black phenolic collar rings with silver stitch dashes
    ctx.fillStyle = '#090d16';
    ctx.fillRect(jointStart, 0, 8, height);
    ctx.fillRect(forearmStart - 8, 0, 8, height);

    // Brushed stainless steel center joint
    const steelGrad = ctx.createLinearGradient(jointStart + 8, 0, forearmStart - 8, 0);
    steelGrad.addColorStop(0, '#94a3b8');
    steelGrad.addColorStop(0.3, '#f8fafc');
    steelGrad.addColorStop(0.5, '#cbd5e1');
    steelGrad.addColorStop(0.8, '#e2e8f0');
    steelGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = steelGrad;
    ctx.fillRect(jointStart + 8, 0, jointWidth - 16, height);

    // Gold/brass accent rings inside joint
    ctx.fillStyle = '#eab308';
    ctx.fillRect(jointStart + 7, 0, 2, height);
    ctx.fillRect(forearmStart - 9, 0, 2, height);

    // Silver check ring stitches
    ctx.fillStyle = '#e2e8f0';
    for (let sy = 4; sy < height; sy += 6) {
      ctx.fillRect(jointStart + 2, sy, 4, 2.5);
      ctx.fillRect(forearmStart - 6, sy, 4, 2.5);
    }

    // ----------------------------------------------------
    // 5. BIRDSEYE MAPLE FOREARM WITH 4 FLAME-VENEER EBONY SPLICED POINTS
    // ----------------------------------------------------
    const wrapStart = tipX + Math.round(bodyLen * 0.70);
    const forearmGrad = ctx.createLinearGradient(forearmStart, 0, wrapStart, 0);
    forearmGrad.addColorStop(0, '#e6be7a');
    forearmGrad.addColorStop(1, '#c89246');
    ctx.fillStyle = forearmGrad;
    ctx.fillRect(forearmStart, 0, wrapStart - forearmStart, height);

    // Subtle birdseye maple figure knots
    for (let i = 0; i < 40; i++) {
      const kx = forearmStart + ((i * 41) % (wrapStart - forearmStart));
      const ky = (i * 19) % height;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 4, 2, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 53, 15, 0.12)';
      ctx.fill();
    }

    // Draw 3 visible spliced points across the cylinder height (top, center, bottom)
    // Each point has triple flame veneers (turquoise -> vermilion red -> gold -> Macassar ebony core)
    const pointCentersY = [cy - 16, cy, cy + 16];
    const veneerSpecs = [
      { color: '#06b6d4', tipOffset: 0, baseHalfW: 8.5 },   // Outer turquoise veneer
      { color: '#ef4444', tipOffset: 10, baseHalfW: 7.0 },  // Middle vermilion flame veneer
      { color: '#fef08a', tipOffset: 20, baseHalfW: 5.5 },  // Inner maple veneer
      { color: '#090d16', tipOffset: 30, baseHalfW: 4.2 },  // Core Macassar Ebony splice
    ];

    const pointApexX = forearmStart + 26;
    for (const py of pointCentersY) {
      for (const v of veneerSpecs) {
        ctx.beginPath();
        ctx.moveTo(pointApexX + v.tipOffset, py);
        ctx.lineTo(wrapStart, py - v.baseHalfW);
        ctx.lineTo(wrapStart, py + v.baseHalfW);
        ctx.closePath();
        ctx.fillStyle = v.color;
        ctx.fill();
      }

      // Mother-of-pearl notched diamond inlay inside each ebony point
      const inlayX = wrapStart - 46;
      ctx.beginPath();
      ctx.moveTo(inlayX - 11, py);
      ctx.lineTo(inlayX, py - 2.6);
      ctx.lineTo(inlayX + 11, py);
      ctx.lineTo(inlayX, py + 2.6);
      ctx.closePath();
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }

    // ----------------------------------------------------
    // 6. BRAIDED IRISH LINEN / TEXTURED LEATHER GRIP WRAP
    // ----------------------------------------------------
    const sleeveStart = tipX + Math.round(bodyLen * 0.90);
    // Decorative ring before wrap
    ctx.fillStyle = '#090d16';
    ctx.fillRect(wrapStart - 8, 0, 8, height);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(wrapStart - 9, 0, 1.5, height);
    ctx.fillRect(wrapStart, 0, 1.5, height);

    // Charcoal & white spec Irish linen base
    ctx.fillStyle = '#18181b';
    ctx.fillRect(wrapStart, 0, sleeveStart - wrapStart, height);

    // Fine wound linen thread lines with white/silver flecks
    for (let lx = wrapStart + 2; lx < sleeveStart; lx += 3) {
      ctx.fillStyle = lx % 6 === 0 ? '#27272a' : '#09090b';
      ctx.fillRect(lx, 0, 1.5, height);

      // Spec flecks along thread
      const fleckY = ((lx * 37) % (height - 8)) + 4;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.38)';
      ctx.fillRect(lx, fleckY, 1.5, 3);
      ctx.fillRect(lx, (fleckY + 23) % height, 1.5, 2.5);
    }

    // ----------------------------------------------------
    // 7. EXOTIC COCOBOLO / ROSEWOOD BUTT SLEEVE & INLAYS
    // ----------------------------------------------------
    const capStart = endX - 16;
    const sleeveGrad = ctx.createLinearGradient(sleeveStart, 0, capStart, 0);
    sleeveGrad.addColorStop(0, '#451a03');
    sleeveGrad.addColorStop(0.5, '#7c2d12');
    sleeveGrad.addColorStop(1, '#3b0764');
    ctx.fillStyle = sleeveGrad;
    ctx.fillRect(sleeveStart, 0, capStart - sleeveStart, height);

    // Decorative check rings framing the butt sleeve
    ctx.fillStyle = '#090d16';
    ctx.fillRect(sleeveStart, 0, 8, height);
    ctx.fillRect(capStart - 8, 0, 8, height);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(sleeveStart + 8, 0, 2, height);
    ctx.fillRect(capStart - 10, 0, 2, height);

    // Mother-of-pearl oval & diamond inlays in the butt sleeve
    const sleeveMidX = (sleeveStart + 10 + capStart - 10) * 0.5;
    for (const py of [cy - 13, cy, cy + 13]) {
      ctx.beginPath();
      ctx.moveTo(sleeveMidX - 14, py);
      ctx.lineTo(sleeveMidX, py - 3.5);
      ctx.lineTo(sleeveMidX + 14, py);
      ctx.lineTo(sleeveMidX, py + 3.5);
      ctx.closePath();
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ----------------------------------------------------
    // 8. MATTE BLACK RUBBER BUMPER CAP AT END
    // ----------------------------------------------------
    ctx.fillStyle = '#09090b';
    ctx.fillRect(capStart, 0, width - capStart, height);

    // ----------------------------------------------------
    // 9. CYLINDRICAL 3D NORMAL SHADING & GLOSSY POLYURETHANE LACQUER HIGHLIGHT
    // ----------------------------------------------------
    const cylGrad = ctx.createLinearGradient(0, cy - buttHalfH, 0, cy + buttHalfH);
    cylGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.62)');
    cylGrad.addColorStop(0.18, 'rgba(0, 0, 0, 0.12)');
    cylGrad.addColorStop(0.30, 'rgba(255, 255, 255, 0.44)'); // Glossy cylindrical lacquer reflection
    cylGrad.addColorStop(0.38, 'rgba(255, 255, 255, 0.14)');
    cylGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.0)');
    cylGrad.addColorStop(0.84, 'rgba(0, 0, 0, 0.42)');
    cylGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = cylGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();

    this.cueTextureCanvas = canvas;
    return canvas;
  }

  /**
   * Draws the high-resolution textured cue stick onto the 2D table canvas
   * with realistic drop shadow and strike pullback animation.
   */
  public drawTexturedCueStick(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    aimAngle: number,
    pullback: number,
    alpha: number = 1.0
  ) {
    const cueTex = this.getCueStickTexture();
    const cueLength = 408;
    const cueThickness = 24;
    const tipOffsetPx = 5.5; // aligns blue chalk tip exactly with pullback=0

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(originX, originY);
    ctx.rotate(aimAngle + Math.PI);
    ctx.translate(pullback, 0);

    // 1. Soft realistic tapered drop shadow on the table cloth & rail
    ctx.save();
    ctx.translate(3, 7);
    ctx.beginPath();
    ctx.moveTo(-2, -2.5);
    ctx.lineTo(cueLength - 6, -7.5);
    ctx.lineTo(cueLength - 6, 7.5);
    ctx.lineTo(-2, 2.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();

    // 2. Draw supersampled textured cue stick
    ctx.drawImage(
      cueTex,
      -tipOffsetPx,
      -cueThickness / 2,
      cueLength,
      cueThickness
    );

    ctx.restore();
  }

  /**
   * Generates high-resolution 3D rendered ball icons (0..15) using the exact same
   * Three.js WebGL 3D sphere meshes, equirectangular textures, studio lighting,
   * and phenolic lacquer reflections as the balls on the table.
   */
  public getBallIconDataUrl(ballId: number): string {
    const clampedId = Math.max(0, Math.min(15, Math.round(ballId)));
    const cached = this.ballIconCache.get(clampedId);
    if (cached) return cached;

    this.init();
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;

    if (this.bounceLight) {
      this.bounceLight.color.set('#10b981');
    }

    const iconScale = 1.85;
    const dpr = 2;
    const worldRadius = BALL_RADIUS * iconScale; // 25.9
    const pxRadius = worldRadius * dpr; // 51.8 px in WebGL canvas

    // Position all 16 balls across the scene with a natural 3D studio presentation tilt
    for (let id = 0; id <= 15; id++) {
      const mesh = this.ballMeshes.get(id);
      const mat = this.ballMaterials.get(id);
      if (!mesh || !mat) continue;

      const bx = 62 + id * 58;
      const by = 270;

      mesh.visible = true;
      mesh.position.set(bx, -by, 0);
      mesh.scale.setScalar(iconScale);

      mat.color.setRGB(1, 1, 1);
      mat.envMapIntensity = 0.95;
      mat.opacity = 1.0;

      // Slight 3D tilt so the equatorial stripe and number badge display natural 3D curvature
      this.tempVecN.set(0.06, 0.08, 0.995).normalize();
      this.tempVecS.set(0.0, 1.0, -0.08);
      this.tempVecS.addScaledVector(this.tempVecN, -this.tempVecS.dot(this.tempVecN)).normalize();
      this.tempVecT.crossVectors(this.tempVecS, this.tempVecN).normalize();

      this.tempMat4.makeBasis(this.tempVecT, this.tempVecS, this.tempVecN);
      mesh.quaternion.setFromRotationMatrix(this.tempMat4);
    }

    renderer.render(scene, camera);

    const iconSize = 112;
    const halfIcon = iconSize / 2;
    const drawRadius = 50;

    for (let id = 0; id <= 15; id++) {
      const bx = 62 + id * 58;
      const by = 270;
      const srcCx = bx * dpr;
      const srcCy = by * dpr;

      const iconCanvas = document.createElement('canvas');
      iconCanvas.width = iconSize;
      iconCanvas.height = iconSize;
      const ictx = iconCanvas.getContext('2d')!;

      // 1. Subtle 3D drop shadow under the sphere
      ictx.save();
      const shadowGrad = ictx.createRadialGradient(
        halfIcon + 2,
        halfIcon + 5,
        drawRadius * 0.2,
        halfIcon + 2,
        halfIcon + 5,
        drawRadius * 1.08
      );
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      shadowGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.32)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ictx.fillStyle = shadowGrad;
      ictx.beginPath();
      ictx.arc(halfIcon + 2, halfIcon + 5, drawRadius * 1.08, 0, Math.PI * 2);
      ictx.fill();
      ictx.restore();

      // 2. Clip to crisp sphere circle and draw the WebGL 3D rendered ball
      ictx.save();
      ictx.beginPath();
      ictx.arc(halfIcon, halfIcon, drawRadius, 0, Math.PI * 2);
      ictx.clip();

      ictx.drawImage(
        renderer.domElement,
        srcCx - pxRadius,
        srcCy - pxRadius,
        pxRadius * 2,
        pxRadius * 2,
        halfIcon - drawRadius,
        halfIcon - drawRadius,
        drawRadius * 2,
        drawRadius * 2
      );

      // 3. Spherical limb darkening around outer edge for deep 3D volume
      const limbGrad = ictx.createRadialGradient(
        halfIcon - drawRadius * 0.18,
        halfIcon - drawRadius * 0.18,
        drawRadius * 0.45,
        halfIcon,
        halfIcon,
        drawRadius
      );
      limbGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      limbGrad.addColorStop(0.74, 'rgba(0, 0, 0, 0.10)');
      limbGrad.addColorStop(1, 'rgba(2, 6, 23, 0.48)');
      ictx.fillStyle = limbGrad;
      ictx.fillRect(0, 0, iconSize, iconSize);

      // 4. Studio overhead lamp phenolic specular highlight
      const specGrad = ictx.createRadialGradient(
        halfIcon - drawRadius * 0.34,
        halfIcon - drawRadius * 0.34,
        1.5,
        halfIcon - drawRadius * 0.32,
        halfIcon - drawRadius * 0.32,
        drawRadius * 0.48
      );
      specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
      specGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.24)');
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ictx.fillStyle = specGrad;
      ictx.beginPath();
      ictx.arc(halfIcon, halfIcon, drawRadius, 0, Math.PI * 2);
      ictx.fill();

      ictx.restore();

      this.ballIconCache.set(id, iconCanvas.toDataURL('image/png'));
    }

    return this.ballIconCache.get(clampedId) || '';
  }
}

export const threePoolRenderer = new ThreePoolRenderer();
