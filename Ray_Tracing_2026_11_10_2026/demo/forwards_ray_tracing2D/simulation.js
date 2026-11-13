// @ts-check
/**
 * @file simulation.js - 2D Forward Ray Tracing Simulation
 * Simulates real-world forward light emission, specular reflections with surface tinting,
 * barrier obstacle absorption/reflection, and 1D camera sensor imaging.
 */

/* ==========================================================================
   DEFAULT CONFIGURATION CONSTANTS (Easily configurable)
   ========================================================================== */
export const DEFAULT_RAYS = 360;
export const DEFAULT_SPREAD_DEG = 360;
export const DEFAULT_SPACING_DEG = 2.0;
export const DEFAULT_MAX_BOUNCES = 3;
export const DEFAULT_CAMERA_PIXELS = 20;
export const DEFAULT_WALL_BOUNCES = false; // Rays hitting enclosing walls do not bounce by default
export const DEFAULT_BARRIER_COLOR = '#e74c3c';
export const DEFAULT_LIGHT_COLOR = { r: 255, g: 250, b: 215 };
/**
 * Default barriers present when resetting the scene.
 * Set to an empty array so the default scene starts with a clean slate,
 * or add predefined obstacles here if desired.
 * @type {Barrier[]}
 */
export const DEFAULT_BARRIERS = [];

/* ==========================================================================
   JSDOC TYPE DEFINITIONS
   ========================================================================== */

/**
 * An RGB color representation.
 * @typedef {Object} RGBColor
 * @property {number} r - Red channel (0 - 255).
 * @property {number} g - Green channel (0 - 255).
 * @property {number} b - Blue channel (0 - 255).
 */

/**
 * A 2D point.
 * @typedef {Object} Point2D
 * @property {number} x - X coordinate.
 * @property {number} y - Y coordinate.
 */

/**
 * A user-drawn line segment barrier.
 * @typedef {Object} Barrier
 * @property {Point2D} p1 - First endpoint.
 * @property {Point2D} p2 - Second endpoint.
 * @property {string} color - Hex color string (e.g. '#e74c3c').
 * @property {RGBColor} colRgb - Parsed RGB color.
 */

/**
 * Internal scene line segment representation.
 * @typedef {Object} SceneSegment
 * @property {Point2D} p1 - Start point of the segment.
 * @property {Point2D} p2 - End point of the segment.
 * @property {'wall' | 'barrier' | 'camera'} type - Segment classification.
 * @property {RGBColor} [colRgb] - Color tint for reflection filtering.
 * @property {string} [color] - Hex color string.
 * @property {number} [normalX] - Outward normal X component (camera).
 * @property {number} [normalY] - Outward normal Y component (camera).
 */

/**
 * Ray-segment intersection result.
 * @typedef {Object} Intersection
 * @property {number} t - Distance parameter along the ray.
 * @property {number} u - Normalized interpolation factor along the segment (0 <= u <= 1).
 * @property {number} x - X position of intersection point.
 * @property {number} y - Y position of intersection point.
 * @property {number} Vx - Segment delta X (p2.x - p1.x).
 * @property {number} Vy - Segment delta Y (p2.y - p1.y).
 */

/**
 * Pixel data representing the camera sensor color.
 * @typedef {Object} PixelInfo
 * @property {RGBColor} color - Averaged RGB color for the pixel.
 * @property {number} hitCount - Number of light rays absorbed by this pixel.
 */

/**
 * Snapshot of the simulation state for undo history.
 * @typedef {Object} SceneSnapshot
 * @property {{ x: number, y: number }} light - Light position.
 * @property {RGBColor} lightColor - Light base color.
 * @property {{ cx: number, cy: number, length: number, angle: number }} camera - Camera position and geometry.
 * @property {Barrier[]} barriers - Array of barriers in the scene.
 * @property {Object} inputs - UI input values.
 * @property {string} inputs.rays - Number of rays.
 * @property {string} inputs.spacing - Spacing degrees.
 * @property {string} inputs.spread - Spread degrees.
 * @property {string} inputs.bounces - Max bounces.
 * @property {string} inputs.pixels - Camera pixels.
 * @property {boolean} inputs.wallBounces - Whether wall bounces are enabled.
 */

/* ==========================================================================
   STATE
   ========================================================================== */

/** @type {HTMLCanvasElement} */
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('rayCanvas'));
/** @type {CanvasRenderingContext2D} */
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
/** @type {HTMLElement} */
const canvasWrapper = /** @type {HTMLElement} */ (document.getElementById('canvasWrapper'));

/** @type {HTMLInputElement} */
const inputRays = /** @type {HTMLInputElement} */ (document.getElementById('inputRays'));
/** @type {HTMLInputElement} */
const inputSpacing = /** @type {HTMLInputElement} */ (document.getElementById('inputSpacing'));
/** @type {HTMLInputElement} */
const inputSpread = /** @type {HTMLInputElement} */ (document.getElementById('inputSpread'));
/** @type {HTMLInputElement} */
const inputBounces = /** @type {HTMLInputElement} */ (document.getElementById('inputBounces'));
/** @type {HTMLInputElement} */
const inputPixels = /** @type {HTMLInputElement} */ (document.getElementById('inputPixels'));
/** @type {HTMLInputElement} */
const checkWallBounces = /** @type {HTMLInputElement} */ (document.getElementById('checkWallBounces'));

/** @type {HTMLElement} */
const swatchGroup = /** @type {HTMLElement} */ (document.getElementById('swatchGroup'));
/** @type {HTMLButtonElement} */
const btnUndoBarrier = /** @type {HTMLButtonElement} */ (document.getElementById('btnUndoBarrier'));
/** @type {HTMLButtonElement} */
const btnClearBarriers = /** @type {HTMLButtonElement} */ (document.getElementById('btnClearBarriers'));
/** @type {HTMLButtonElement} */
const btnResetScene = /** @type {HTMLButtonElement} */ (document.getElementById('btnResetScene'));

/** @type {HTMLElement} */
const sensorStrip = /** @type {HTMLElement} */ (document.getElementById('sensorStrip'));
/** @type {HTMLElement} */
const statHits = /** @type {HTMLElement} */ (document.getElementById('statHits'));
/** @type {HTMLElement} */
const statTotal = /** @type {HTMLElement} */ (document.getElementById('statTotal'));
/** @type {HTMLElement} */
const statPercent = /** @type {HTMLElement} */ (document.getElementById('statPercent'));
/** @type {HTMLElement} */
const statPixelsHit = /** @type {HTMLElement} */ (document.getElementById('statPixelsHit'));
/** @type {HTMLElement} */
const statTotalPixels = /** @type {HTMLElement} */ (document.getElementById('statTotalPixels'));
/** @type {HTMLElement} */
const statPixelsPercent = /** @type {HTMLElement} */ (document.getElementById('statPixelsPercent'));

/** @type {string} */
let selectedColor = DEFAULT_BARRIER_COLOR;

/**
 * Scene light source state.
 * @type {{ x: number, y: number, radius: number, baseColor: RGBColor }}
 */
const light = {
  x: 160,
  y: 220,
  radius: 14,
  baseColor: { ...DEFAULT_LIGHT_COLOR }
};

/**
 * Camera state.
 * @type {{ cx: number, cy: number, length: number, angle: number, rotHandle?: Point2D }}
 */
const camera = {
  cx: 640,
  cy: 220,
  length: 160,
  angle: 0 // angle 0: sensor faces left (-x direction)
};

/** @type {Barrier[]} */
let barriers = [];

/* ==========================================================================
   UNDO & HISTORY STACK
   ========================================================================== */

/** @type {SceneSnapshot[]} */
const undoStack = [];

/**
 * Capture current scene state.
 * @returns {SceneSnapshot}
 */
export function getSnapshot() {
  return {
    light: { x: light.x, y: light.y },
    lightColor: { ...light.baseColor },
    camera: {
      cx: camera.cx,
      cy: camera.cy,
      length: camera.length,
      angle: camera.angle
    },
    barriers: barriers.map((b) => ({
      p1: { x: b.p1.x, y: b.p1.y },
      p2: { x: b.p2.x, y: b.p2.y },
      color: b.color,
      colRgb: { ...b.colRgb }
    })),
    inputs: {
      rays: inputRays.value,
      spacing: inputSpacing.value,
      spread: inputSpread.value,
      bounces: inputBounces.value,
      pixels: inputPixels.value,
      wallBounces: checkWallBounces ? checkWallBounces.checked : DEFAULT_WALL_BOUNCES
    }
  };
}

/**
 * Push current state onto the undo stack.
 */
export function pushUndo() {
  undoStack.push(getSnapshot());
  if (undoStack.length > 50) {
    undoStack.shift();
  }
  updateUndoButton();
}

/**
 * Restore scene state from a snapshot.
 * @param {SceneSnapshot} s
 */
export function restoreSnapshot(s) {
  light.x = s.light.x;
  light.y = s.light.y;
  light.baseColor = { ...s.lightColor };

  camera.cx = s.camera.cx;
  camera.cy = s.camera.cy;
  camera.length = s.camera.length;
  camera.angle = s.camera.angle;

  barriers = s.barriers.map((b) => ({
    p1: { x: b.p1.x, y: b.p1.y },
    p2: { x: b.p2.x, y: b.p2.y },
    color: b.color,
    colRgb: { ...b.colRgb }
  }));

  if (s.inputs) {
    inputRays.value = s.inputs.rays;
    inputSpacing.value = s.inputs.spacing;
    inputSpread.value = s.inputs.spread;
    inputBounces.value = s.inputs.bounces;
    inputPixels.value = s.inputs.pixels;
    if (checkWallBounces) {
      checkWallBounces.checked = s.inputs.wallBounces;
    }
  }

  updateUndoButton();
  render();
}

/**
 * Undo the most recent action.
 */
export function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  restoreSnapshot(previous);
}

/**
 * Update disabled state of Undo button.
 */
function updateUndoButton() {
  if (btnUndoBarrier) {
    btnUndoBarrier.disabled = undoStack.length === 0;
  }
}

/* ==========================================================================
   COLOR UTILITIES
   ========================================================================== */

/**
 * Parse hex string to RGB object.
 * @param {string} hex - Hex color string.
 * @returns {RGBColor}
 */
export function parseHexColor(hex) {
  const clean = hex.replace('#', '');
  let r = 0, g = 0, b = 0;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }
  return { r, g, b };
}

/**
 * Physically tint a light ray upon bouncing off a colored barrier.
 * @param {RGBColor} rayCol - Incoming ray color.
 * @param {RGBColor} barrierCol - Surface color.
 * @returns {RGBColor}
 */
export function filterColor(rayCol, barrierCol) {
  const r = Math.round(rayCol.r * (barrierCol.r / 255));
  const g = Math.round(rayCol.g * (barrierCol.g / 255));
  const b = Math.round(rayCol.b * (barrierCol.b / 255));
  // Blend 80% filtered + 20% surface color to keep bouncing rays vibrant
  return {
    r: Math.min(255, Math.round(r * 0.8 + barrierCol.r * 0.2)),
    g: Math.min(255, Math.round(g * 0.8 + barrierCol.g * 0.2)),
    b: Math.min(255, Math.round(b * 0.8 + barrierCol.b * 0.2))
  };
}

/**
 * Convert RGBColor to css rgba string.
 * @param {RGBColor} c - RGB color.
 * @param {number} [alpha=1] - Opacity value.
 * @returns {string}
 */
export function rgbToString(c, alpha = 1) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/**
 * Get CSS variable value with fallback.
 * @param {string} cssVar - CSS custom property name.
 * @param {string} fallback - Fallback string.
 * @returns {string}
 */
function varColor(cssVar, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
}

/* ==========================================================================
   INPUTS & SCENE INITIALIZATION
   ========================================================================== */

/** Apply default constant values to the UI controls */
function applyDefaultInputs() {
  inputRays.value = String(DEFAULT_RAYS);
  inputSpread.value = String(DEFAULT_SPREAD_DEG);
  inputSpacing.value = DEFAULT_SPACING_DEG.toFixed(1);
  inputBounces.value = String(DEFAULT_MAX_BOUNCES);
  inputPixels.value = String(DEFAULT_CAMERA_PIXELS);
  if (checkWallBounces) {
    checkWallBounces.checked = DEFAULT_WALL_BOUNCES;
  }
  selectedColor = DEFAULT_BARRIER_COLOR;

  document.querySelectorAll('.color-swatch').forEach((s) => {
    if (s.getAttribute('data-color') === DEFAULT_BARRIER_COLOR) {
      s.classList.add('active');
    } else {
      s.classList.remove('active');
    }
  });
}

/** Reset light, camera, and default barriers */
export function setupDefaultScene() {
  const w = canvasWrapper.clientWidth || 800;
  const h = canvasWrapper.clientHeight || 450;

  light.x = Math.round(w * 0.18);
  light.y = Math.round(h * 0.48);
  light.baseColor = { ...DEFAULT_LIGHT_COLOR };

  camera.cx = Math.round(w * 0.82);
  camera.cy = Math.round(h * 0.48);
  camera.length = Math.max(120, Math.min(220, h * 0.45));
  camera.angle = 0; // Sensor points directly left into the scene

  barriers = DEFAULT_BARRIERS.map((b) => ({
    p1: { x: b.p1.x, y: b.p1.y },
    p2: { x: b.p2.x, y: b.p2.y },
    color: b.color,
    colRgb: { ...b.colRgb }
  }));
}

/* ==========================================================================
   INTERCONNECTED RAY CONTROLS
   ========================================================================== */

let updatingInputs = false;

function onRaysChanged() {
  if (updatingInputs) return;
  updatingInputs = true;
  const parsed = parseInt(inputRays.value);
  const rays = isNaN(parsed) ? DEFAULT_RAYS : Math.max(0, parsed);
  const spread = Math.min(360, Math.max(10, parseFloat(inputSpread.value) || DEFAULT_SPREAD_DEG));
  const spacing = rays > 1 ? (spread / (spread >= 360 ? rays : (rays - 1))) : spread;
  inputSpacing.value = spacing.toFixed(1);
  updatingInputs = false;
  render();
}

function onSpacingChanged() {
  if (updatingInputs) return;
  updatingInputs = true;
  const spacing = Math.max(0.1, parseFloat(inputSpacing.value) || DEFAULT_SPACING_DEG);
  const spread = Math.min(360, Math.max(10, parseFloat(inputSpread.value) || DEFAULT_SPREAD_DEG));
  let rays = Math.round(spread / spacing);
  if (spread < 360) rays += 1;
  rays = Math.max(0, Math.min(1500, rays));
  inputRays.value = String(rays);
  updatingInputs = false;
  render();
}

function onSpreadChanged() {
  if (updatingInputs) return;
  updatingInputs = true;
  const spread = Math.min(360, Math.max(10, parseFloat(inputSpread.value) || DEFAULT_SPREAD_DEG));
  const parsed = parseInt(inputRays.value);
  const rays = isNaN(parsed) ? DEFAULT_RAYS : Math.max(0, parsed);
  const spacing = rays > 1 ? (spread / (spread >= 360 ? rays : (rays - 1))) : spread;
  inputSpacing.value = spacing.toFixed(1);
  updatingInputs = false;
  render();
}

/* ==========================================================================
   CANVAS & MATH UTILITIES
   ========================================================================== */

/** Resize canvas backing store for high DPI screens */
export function resizeCanvas() {
  const rect = canvasWrapper.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
}

/**
 * Ray vs line segment intersection test.
 * Ray: O + t * D (t > 1e-4)
 * Segment: A + u * (B - A) (0 <= u <= 1)
 *
 * @param {number} Ox - Ray origin X.
 * @param {number} Oy - Ray origin Y.
 * @param {number} Dx - Ray direction X (normalized).
 * @param {number} Dy - Ray direction Y (normalized).
 * @param {number} Ax - Segment point A X.
 * @param {number} Ay - Segment point A Y.
 * @param {number} Bx - Segment point B X.
 * @param {number} By - Segment point B Y.
 * @returns {Intersection | null}
 */
export function intersectRaySegment(Ox, Oy, Dx, Dy, Ax, Ay, Bx, By) {
  const Vx = Bx - Ax;
  const Vy = By - Ay;
  const denom = Dx * Vy - Dy * Vx;

  if (Math.abs(denom) < 1e-9) return null; // Parallel

  const dAx = Ax - Ox;
  const dAy = Ay - Oy;

  const t = (dAx * Vy - dAy * Vx) / denom;
  const u = (dAx * Dy - dAy * Dx) / denom;

  if (t > 1e-4 && u >= 0 && u <= 1) {
    return {
      t,
      u,
      x: Ox + t * Dx,
      y: Oy + t * Dy,
      Vx,
      Vy
    };
  }
  return null;
}

/**
 * Calculate distance from point to segment.
 * @param {number} px - Point X.
 * @param {number} py - Point Y.
 * @param {number} x1 - Segment start X.
 * @param {number} y1 - Segment start Y.
 * @param {number} x2 - Segment end X.
 * @param {number} y2 - Segment end Y.
 * @returns {number} Distance in pixels.
 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

/* ==========================================================================
   RENDER PIPELINE
   ========================================================================== */

/** Main Ray Tracing and Scene Drawing function */
export function render() {
  const w = canvasWrapper.clientWidth;
  const h = canvasWrapper.clientHeight;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  const parsedRays = parseInt(inputRays.value);
  const numRays = isNaN(parsedRays) ? DEFAULT_RAYS : Math.max(0, parsedRays);
  const spreadDeg = Math.min(360, Math.max(10, parseFloat(inputSpread.value) || DEFAULT_SPREAD_DEG));
  const maxBounces = Math.max(0, parseInt(inputBounces.value) || DEFAULT_MAX_BOUNCES);
  const parsedPixels = parseInt(inputPixels.value);
  const numPixels = isNaN(parsedPixels) ? DEFAULT_CAMERA_PIXELS : Math.max(1, parsedPixels);
  const allowWallBounces = checkWallBounces ? checkWallBounces.checked : DEFAULT_WALL_BOUNCES;

  // Camera Geometry
  // Angle 0: Normal = (-1, 0) pointing left
  const halfL = camera.length / 2;
  const cosA = Math.cos(camera.angle);
  const sinA = Math.sin(camera.angle);

  // Normal vector pointing outward from sensor front
  const camNormalX = -cosA;
  const camNormalY = -sinA;

  // Segment endpoints perpendicular to normal
  const camP1 = {
    x: camera.cx + halfL * sinA,
    y: camera.cy - halfL * cosA
  };
  const camP2 = {
    x: camera.cx - halfL * sinA,
    y: camera.cy + halfL * cosA
  };

  // Camera rotation handle point (along sensor front normal vector)
  const rotHandleDist = 28;
  const rotHandle = {
    x: camera.cx + camNormalX * rotHandleDist,
    y: camera.cy + camNormalY * rotHandleDist
  };
  camera.rotHandle = rotHandle;

  /** @type {RGBColor[][]} */
  const pixelHits = Array.from({ length: numPixels }, () => []);

  // Scene Segments: User Barriers + 4 Outer Walls
  /** @type {SceneSegment[]} */
  const segments = [];

  // Enclosing canvas boundary walls
  segments.push({
    p1: { x: 0, y: 0 },
    p2: { x: w, y: 0 },
    type: 'wall',
    colRgb: { r: 180, g: 180, b: 180 }
  });
  segments.push({
    p1: { x: w, y: 0 },
    p2: { x: w, y: h },
    type: 'wall',
    colRgb: { r: 180, g: 180, b: 180 }
  });
  segments.push({
    p1: { x: w, y: h },
    p2: { x: 0, y: h },
    type: 'wall',
    colRgb: { r: 180, g: 180, b: 180 }
  });
  segments.push({
    p1: { x: 0, y: h },
    p2: { x: 0, y: 0 },
    type: 'wall',
    colRgb: { r: 180, g: 180, b: 180 }
  });

  // User barriers
  barriers.forEach((b) => {
    segments.push({
      p1: b.p1,
      p2: b.p2,
      type: 'barrier',
      colRgb: b.colRgb,
      color: b.color
    });
  });

  // Camera segment
  /** @type {SceneSegment} */
  const cameraSeg = {
    p1: camP1,
    p2: camP2,
    type: 'camera',
    normalX: camNormalX,
    normalY: camNormalY
  };

  let totalSensorHits = 0;

  // Ray Angular Spreading
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const startAngle = -spreadRad / 2;
  const angleStep = spreadDeg >= 360 ? (2 * Math.PI) / numRays : (numRays > 1 ? spreadRad / (numRays - 1) : 0);

  // Trace Rays
  ctx.lineWidth = 1;

  for (let r = 0; r < numRays; r++) {
    let currentAngle;
    if (spreadDeg >= 360) {
      currentAngle = r * angleStep;
    } else {
      currentAngle = startAngle + r * angleStep;
    }

    let rayOx = light.x;
    let rayOy = light.y;
    let rayDx = Math.cos(currentAngle);
    let rayDy = Math.sin(currentAngle);
    let rayColor = { ...light.baseColor };

    let bouncesRemaining = maxBounces;

    while (true) {
      // Find closest intersection
      /** @type {Intersection | null} */
      let closestHit = null;
      /** @type {SceneSegment | null} */
      let hitObject = null;

      // Check camera segment
      const camHit = intersectRaySegment(
        rayOx, rayOy, rayDx, rayDy,
        cameraSeg.p1.x, cameraSeg.p1.y, cameraSeg.p2.x, cameraSeg.p2.y
      );
      if (camHit) {
        closestHit = camHit;
        hitObject = cameraSeg;
      }

      // Check walls and barriers
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const hit = intersectRaySegment(
          rayOx, rayOy, rayDx, rayDy,
          seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y
        );
        if (hit) {
          if (!closestHit || hit.t < closestHit.t) {
            closestHit = hit;
            hitObject = seg;
          }
        }
      }

      if (!closestHit || !hitObject) break;

      // Draw ray segment
      ctx.strokeStyle = rgbToString(rayColor, 0.45);
      ctx.beginPath();
      ctx.moveTo(rayOx, rayOy);
      ctx.lineTo(closestHit.x, closestHit.y);
      ctx.stroke();

      // 1) Camera Hit Logic
      if (hitObject.type === 'camera') {
        const dot = rayDx * /** @type {number} */ (cameraSeg.normalX) + rayDy * /** @type {number} */ (cameraSeg.normalY);
        if (dot < 0) {
          // FRONT FACE: Camera Sensor absorbs the ray!
          const u = closestHit.u; // 0 to 1 along P1 -> P2
          const pixelIdx = Math.min(numPixels - 1, Math.max(0, Math.floor(u * numPixels)));
          pixelHits[pixelIdx].push({ ...rayColor });
          totalSensorHits++;

          // Impact spark on sensor
          ctx.fillStyle = rgbToString(rayColor, 0.9);
          ctx.beginPath();
          ctx.arc(closestHit.x, closestHit.y, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Ray is consumed: bounces no more!
          break;
        } else {
          // BACK FACE: Bounces off camera casing! Does NOT color any pixel.
          if (bouncesRemaining <= 0) break;
          bouncesRemaining--;

          // Normal on back face points outward opposite to sensor normal
          const nX = -/** @type {number} */ (cameraSeg.normalX);
          const nY = -/** @type {number} */ (cameraSeg.normalY);
          const nDot = rayDx * nX + rayDy * nY;
          rayDx = rayDx - 2 * nDot * nX;
          rayDy = rayDy - 2 * nDot * nY;

          rayOx = closestHit.x + rayDx * 0.1;
          rayOy = closestHit.y + rayDy * 0.1;
          continue;
        }
      }

      // 2) Wall Hit Logic: Wall bounce toggle defaults to OFF (rays terminate at walls)
      if (hitObject.type === 'wall') {
        if (!allowWallBounces || bouncesRemaining <= 0) {
          // Terminate ray at wall (absorbed / leaves bounds)
          break;
        }
        bouncesRemaining--;

        const vx = closestHit.Vx;
        const vy = closestHit.Vy;
        const len = Math.hypot(vx, vy);
        let nx = -vy / len;
        let ny = vx / len;

        if (rayDx * nx + rayDy * ny > 0) {
          nx = -nx;
          ny = -ny;
        }

        const nDot = rayDx * nx + rayDy * ny;
        rayDx = rayDx - 2 * nDot * nx;
        rayDy = rayDy - 2 * nDot * ny;

        rayOx = closestHit.x + rayDx * 0.1;
        rayOy = closestHit.y + rayDy * 0.1;
        continue;
      }

      // 3) Barrier Hit Logic
      if (bouncesRemaining <= 0) break;
      bouncesRemaining--;

      const vx = closestHit.Vx;
      const vy = closestHit.Vy;
      const len = Math.hypot(vx, vy);
      let nx = -vy / len;
      let ny = vx / len;

      if (rayDx * nx + rayDy * ny > 0) {
        nx = -nx;
        ny = -ny;
      }

      // Reflect direction: D - 2(D·N)N
      const nDot = rayDx * nx + rayDy * ny;
      rayDx = rayDx - 2 * nDot * nx;
      rayDy = rayDy - 2 * nDot * ny;

      // Tint ray color by barrier surface color
      if (hitObject.colRgb) {
        rayColor = filterColor(rayColor, hitObject.colRgb);
      }

      rayOx = closestHit.x + rayDx * 0.1;
      rayOy = closestHit.y + rayDy * 0.1;
    }
  }

  // Draw Barriers
  barriers.forEach((b) => {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(b.p1.x, b.p1.y);
    ctx.lineTo(b.p2.x, b.p2.y);
    ctx.stroke();

    // Endcaps
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.p1.x, b.p1.y, 4, 0, Math.PI * 2);
    ctx.arc(b.p2.x, b.p2.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Temporary Preview of Barrier Currently Being Drawn
  if (drawingBarrier && dragStart && dragCurrent) {
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(dragStart.x, dragStart.y);
    ctx.lineTo(dragCurrent.x, dragCurrent.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw Camera Structure
  // 1) Backside casing (dark protective housing)
  ctx.save();
  ctx.strokeStyle = '#424248';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(camP1.x, camP1.y);
  ctx.lineTo(camP2.x, camP2.y);
  ctx.stroke();

  // Rotation Handle & Direction indicator
  ctx.strokeStyle = '#e1e5e7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(camera.cx, camera.cy);
  ctx.lineTo(rotHandle.x, rotHandle.y);
  ctx.stroke();

  // Handle knob
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rotHandle.x, rotHandle.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = varColor('--badger-red', '#C5050C');
  ctx.lineWidth = 2;
  ctx.stroke();

  // 2) Camera Sensor Pixels along front line
  /** @type {PixelInfo[]} */
  const pixelColors = [];
  const segVx = (camP2.x - camP1.x) / numPixels;
  const segVy = (camP2.y - camP1.y) / numPixels;

  for (let p = 0; p < numPixels; p++) {
    const hits = pixelHits[p];
    /** @type {RGBColor} */
    let pColor;
    if (hits.length === 0) {
      pColor = { r: 18, g: 18, b: 24 }; // Unhit dark pixel
    } else {
      // Average color of all rays hitting this pixel
      let sumR = 0, sumG = 0, sumB = 0;
      for (let h = 0; h < hits.length; h++) {
        sumR += hits[h].r;
        sumG += hits[h].g;
        sumB += hits[h].b;
      }
      pColor = {
        r: Math.round(sumR / hits.length),
        g: Math.round(sumG / hits.length),
        b: Math.round(sumB / hits.length)
      };
    }
    pixelColors.push({ color: pColor, hitCount: hits.length });

    // Draw individual pixel segment on camera line
    const px1 = camP1.x + p * segVx;
    const py1 = camP1.y + p * segVy;
    const px2 = px1 + segVx;
    const py2 = py1 + segVy;

    ctx.strokeStyle = hits.length > 0 ? rgbToString(pColor) : '#1a1a24';
    ctx.lineWidth = hits.length > 0 ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();

    // Divider tick
    ctx.strokeStyle = '#555560';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px1 + camNormalX * 3, py1 + camNormalY * 3);
    ctx.stroke();
  }

  // Camera label
//   ctx.fillStyle = '#ffffff';
//   ctx.font = 'bold 13px ui-monospace, sans-serif';
//   ctx.fillText('📷 Camera (Sensor Front)', camera.cx - 75, camera.cy - halfL - 12);
//   ctx.restore();

  // Draw Light Source
  ctx.save();
  const glowGrad = ctx.createRadialGradient(light.x, light.y, 2, light.x, light.y, 28);
  glowGrad.addColorStop(0, 'rgba(255, 252, 220, 0.95)');
  glowGrad.addColorStop(0.35, 'rgba(255, 220, 90, 0.5)');
  glowGrad.addColorStop(1, 'rgba(255, 200, 40, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(light.x, light.y, 28, 0, Math.PI * 2);
  ctx.fill();

  // Bulb center
  ctx.fillStyle = '#fffbe0';
  ctx.beginPath();
  ctx.arc(light.x, light.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2.5;
  ctx.stroke();

//   ctx.fillStyle = '#ffffff';
//   ctx.font = 'bold 13px ui-monospace, sans-serif';
//   ctx.fillText('☼ Light Source', light.x - 45, light.y - 18);
//   ctx.restore();

  // Update 1D Sensor Bar DOM
  updateSensorStrip(pixelColors);

  // Calculate how many pixels were hit by at least one ray
  const hitPixelsCount = pixelColors.filter((p) => p.hitCount > 0).length;

  // Update Stats: "Rays that hit sensor:" and "Pixels Hit:"
  statHits.textContent = String(totalSensorHits);
  statTotal.textContent = String(numRays);
  const pct = ((totalSensorHits / numRays) * 100).toFixed(1);
  statPercent.textContent = `${pct}%`;

  if (statPixelsHit && statTotalPixels && statPixelsPercent) {
    statPixelsHit.textContent = String(hitPixelsCount);
    statTotalPixels.textContent = String(numPixels);
    const pxPct = ((hitPixelsCount / numPixels) * 100).toFixed(1);
    statPixelsPercent.textContent = `${pxPct}%`;
  }
}

let cachedPixelCount = 0;

/**
 * Update 1D Sensor strip DOM.
 * @param {PixelInfo[]} pixelColors
 */
function updateSensorStrip(pixelColors) {
  if (cachedPixelCount !== pixelColors.length) {
    sensorStrip.innerHTML = '';
    for (let i = 0; i < pixelColors.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'sensor-pixel-cell';
      cell.id = `sensorPx_${i}`;
      sensorStrip.appendChild(cell);
    }
    cachedPixelCount = pixelColors.length;
  }

  for (let i = 0; i < pixelColors.length; i++) {
    const cell = /** @type {HTMLElement} */ (sensorStrip.children[i]);
    if (!cell) continue;
    const item = pixelColors[i];
    if (item.hitCount > 0) {
      const colStr = `rgb(${item.color.r}, ${item.color.g}, ${item.color.b})`;
      cell.style.backgroundColor = colStr;
      cell.title = `Pixel #${i + 1}: ${item.hitCount} ray hit(s), ${colStr}`;
    } else {
      cell.style.backgroundColor = '#08080c';
      cell.title = `Pixel #${i + 1}: No ray hits (dark)`;
    }
  }
}

/* ==========================================================================
   INTERACTIONS & EVENT LISTENERS
   ========================================================================== */

/** @type {'light' | 'camera' | 'cameraRot' | null} */
let draggingItem = null;
let drawingBarrier = false;
/** @type {Point2D | null} */
let dragStart = null;
/** @type {Point2D | null} */
let dragCurrent = null;
/** @type {SceneSnapshot | null} */
let dragStartSnapshot = null;

/**
 * Get canvas coordinates from MouseEvent.
 * @param {MouseEvent} e
 * @returns {Point2D}
 */
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

// Right Click: Delete Barrier
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const pos = getMousePos(e);
  for (let i = barriers.length - 1; i >= 0; i--) {
    const b = barriers[i];
    if (distToSegment(pos.x, pos.y, b.p1.x, b.p1.y, b.p2.x, b.p2.y) <= 8) {
      pushUndo();
      barriers.splice(i, 1);
      render();
      return;
    }
  }
});

// Left Click: Start drag or start drawing barrier
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const pos = getMousePos(e);

  // Check Light Source
  if (Math.hypot(pos.x - light.x, pos.y - light.y) <= light.radius + 10) {
    draggingItem = 'light';
    dragStartSnapshot = getSnapshot();
    return;
  }

  // Check Camera Rotation Handle
  if (camera.rotHandle && Math.hypot(pos.x - camera.rotHandle.x, pos.y - camera.rotHandle.y) <= 12) {
    draggingItem = 'cameraRot';
    dragStartSnapshot = getSnapshot();
    return;
  }

  // Check Camera Center
  if (Math.hypot(pos.x - camera.cx, pos.y - camera.cy) <= 26) {
    draggingItem = 'camera';
    dragStartSnapshot = getSnapshot();
    return;
  }

  // Otherwise: Start drawing new barrier line
  drawingBarrier = true;
  dragStart = pos;
  dragCurrent = pos;
});

window.addEventListener('mousemove', (e) => {
  const pos = getMousePos(e);

  if (draggingItem === 'light') {
    light.x = Math.max(15, Math.min(canvasWrapper.clientWidth - 15, pos.x));
    light.y = Math.max(15, Math.min(canvasWrapper.clientHeight - 15, pos.y));
    render();
  } else if (draggingItem === 'camera') {
    camera.cx = Math.max(25, Math.min(canvasWrapper.clientWidth - 25, pos.x));
    camera.cy = Math.max(camera.length / 2 + 5, Math.min(canvasWrapper.clientHeight - camera.length / 2 - 5, pos.y));
    render();
  } else if (draggingItem === 'cameraRot') {
    const dx = pos.x - camera.cx;
    const dy = pos.y - camera.cy;
    camera.angle = Math.atan2(-dy, -dx);
    render();
  } else if (drawingBarrier) {
    dragCurrent = pos;
    render();
  }
});

window.addEventListener('mouseup', (e) => {
  if (draggingItem) {
    if (dragStartSnapshot) {
      const moved =
        dragStartSnapshot.light.x !== light.x ||
        dragStartSnapshot.light.y !== light.y ||
        dragStartSnapshot.camera.cx !== camera.cx ||
        dragStartSnapshot.camera.cy !== camera.cy ||
        dragStartSnapshot.camera.angle !== camera.angle;
      if (moved) {
        undoStack.push(dragStartSnapshot);
        if (undoStack.length > 50) undoStack.shift();
        updateUndoButton();
      }
      dragStartSnapshot = null;
    }
    draggingItem = null;
    render();
  } else if (drawingBarrier && dragStart && dragCurrent) {
    const dist = Math.hypot(dragCurrent.x - dragStart.x, dragCurrent.y - dragStart.y);
    if (dist >= 15) {
      pushUndo();
      barriers.push({
        p1: { x: dragStart.x, y: dragStart.y },
        p2: { x: dragCurrent.x, y: dragCurrent.y },
        color: selectedColor,
        colRgb: parseHexColor(selectedColor)
      });
    }
    drawingBarrier = false;
    dragStart = null;
    dragCurrent = null;
    render();
  }
});

// Color Swatch Selection
swatchGroup.addEventListener('click', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  const swatch = target.closest('.color-swatch');
  if (!swatch) return;
  document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
  swatch.classList.add('active');
  selectedColor = swatch.getAttribute('data-color') || DEFAULT_BARRIER_COLOR;
});

// Inputs
inputRays.addEventListener('input', onRaysChanged);
inputSpacing.addEventListener('input', onSpacingChanged);
inputSpread.addEventListener('input', onSpreadChanged);
inputBounces.addEventListener('input', () => render());
inputPixels.addEventListener('input', () => render());
if (checkWallBounces) {
  checkWallBounces.addEventListener('change', () => {
    pushUndo();
    render();
  });
}

// Action Buttons
btnUndoBarrier.addEventListener('click', () => {
  undo();
});

btnClearBarriers.addEventListener('click', () => {
  if (barriers.length > 0) {
    pushUndo();
    barriers = [];
    render();
  }
});

btnResetScene.addEventListener('click', () => {
  pushUndo();
  applyDefaultInputs();
  setupDefaultScene();
  onRaysChanged();
});

window.addEventListener('resize', () => {
  resizeCanvas();
  render();
});

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
applyDefaultInputs();
resizeCanvas();
setupDefaultScene();
updateUndoButton();
onRaysChanged();
