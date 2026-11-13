// @ts-check
/**
 * @file simulation.js - 2D Backward Ray Tracing Simulation (Whitted Style)
 * Simulates classical Whitted recursive ray tracing in 2D using Turner Whitted's (1980) model:
 * 
 *     I = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
 * 
 * 1. Primary rays originate from the camera eye and pass through viewport pixel samples into the scene.
 * 2. Point lights cast direct illumination evaluated by shadow feeler rays.
 * 3. All objects require a single unified Material type with ambient, diffuse, specular, shininess,
 *    reflectivity, transparency, and refractiveIndex.
 * 4. Antialiasing is computed using Whitted's 4-corner adaptive subdivision.
 */

/* ==========================================================================
   DEFAULT CONFIGURATION CONSTANTS
   ========================================================================== */
export const DEFAULT_CAMERA_PIXELS = 20;
export const DEFAULT_ANTIALIASING = false;
export const DEFAULT_MAX_BOUNCES = 3;
export const DEFAULT_SHADOW_RAYS = false;
export const DEFAULT_FOV_DEG = 60;
export const DEFAULT_AMBIENT_ON = false;
export const DEFAULT_AMBIENT_COLOR_HEX = '#404040';
export const DEFAULT_NO_LIGHT_COLOR_HEX = '#000000';
export const DEFAULT_LIGHT_COLOR_HEX = '#ffffff';

export const DEFAULT_MAT_AMBIENT_HEX = '#1a1a1a';
export const DEFAULT_MAT_DIFFUSE_HEX = '#e74c3c';
export const DEFAULT_MAT_SPECULAR_HEX = '#808080';
export const DEFAULT_MAT_SHININESS = 32;
export const DEFAULT_MAT_REFLECTIVITY = 0.0;
export const DEFAULT_MAT_TRANSPARENCY = 0.0;
export const DEFAULT_MAT_REFRACTIVE_INDEX = 1.5;

export const DEFAULT_CAMERA_RAY_COLOR = 'rgba(145, 150, 160, 0.45)';

/** Curated presentation-themed palette for color picker popovers */
export const PRESENTATION_PALETTE = [
    '#C5050C', '#9B0000', '#E1E5E7', '#FFFFFF', '#FFFAD7', '#2C3E50',
    '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB',
    '#9B59B6', '#E84393', '#00CEC9', '#55E6C1', '#404040', '#000000'
];

/**
 * Default obstacles present in the scene when resetting.
 * @type {Barrier[]}
 */
export const DEFAULT_BARRIERS = [];

/* ==========================================================================
   TYPE DEFINITIONS & UNIFIED MATERIAL CLASS
   ========================================================================== */

/**
 * An RGB color representation [r, g, b] where each channel is normalized in [0, 1].
 * @typedef {[number, number, number]} ColorRGB
 */

/**
 * Unified Material class for Whitted Ray Tracing.
 * ALL SCENE OBJECTS ARE REQUIRED TO HAVE THIS MATERIAL TYPE.
 */
export class Material {
    /**
     * @param {Object} [spec={}]
     * @param {ColorRGB} [spec.ambient] Ambient reflection [r, g, b]
     * @param {ColorRGB} [spec.diffuse] Diffuse reflection [r, g, b]
     * @param {ColorRGB} [spec.specular] Specular reflection [r, g, b]
     * @param {number} [spec.shininess] Specular highlight exponent
     * @param {number} [spec.reflectivity] Mirror reflection strength [0, 1]
     * @param {number} [spec.transparency] Transmission strength [0, 1]
     * @param {number} [spec.refractiveIndex] Refraction index eta
     */
    constructor(spec = {}) {
        /** @type {ColorRGB} */
        const diffuseCol = spec.diffuse ? parseColorRGB(spec.diffuse, [0.5, 0.5, 0.5]) : [0.5, 0.5, 0.5];
        /** @type {ColorRGB} ambient reflection */
        this.ambient = (spec.ambient !== undefined && spec.ambient !== null)
            ? parseColorRGB(spec.ambient, [0, 0, 0])
            : [diffuseCol[0], diffuseCol[1], diffuseCol[2]];
        /** @type {ColorRGB} diffuse reflection */
        this.diffuse = diffuseCol;
        /** @type {ColorRGB} specular reflection */
        this.specular = spec.specular ? parseColorRGB(spec.specular, [0, 0, 0]) : [0, 0, 0];
        /** @type {number} */
        this.shininess = Number(spec.shininess ?? 0);
        /** @type {number} Mirror reflection */
        this.reflectivity = Number(spec.reflectivity ?? 0);
        /** @type {number} Transmission Strength */
        this.transparency = Number(spec.transparency ?? 0);
        /** @type {number} Refraction behavior */
        this.refractiveIndex = Number(spec.refractiveIndex ?? 1.0);
    }
}

/**
 * A 2D point (y is distance from the bottom of the screen).
 * @typedef {Object} Point2D
 * @property {number} x - X coordinate.
 * @property {number} y - Y coordinate (from bottom).
 */

/**
 * A user-drawn or default barrier obstacle (Rectangle with width, or Sphere/Circle).
 * ALL OBJECTS ARE REQUIRED TO HAVE THIS MATERIAL TYPE.
 * @typedef {Object} Barrier
 * @property {'rectangle' | 'sphere'} shape - Geometric shape of barrier.
 * @property {Point2D} p1 - First endpoint or sphere center.
 * @property {Point2D} [p2] - Second endpoint for rectangle.
 * @property {number} [width] - Width / thickness for rectangle barriers.
 * @property {number} [radius] - Radius for sphere barriers.
 * @property {Material} material - Surface material (REQUIRED).
 */

/**
 * A scene light source.
 * @typedef {Object} LightSource
 * @property {number} id - Unique light ID.
 * @property {number} x - X coordinate (px from left of canvas).
 * @property {number} y - Y coordinate (px from bottom of screen).
 * @property {number} radius - Radius of light bulb.
 * @property {string} color - Hex color of light.
 * @property {ColorRGB} colorRGB - Normalized RGB color of light.
 */

/**
 * Internal scene geometry representation for ray intersection testing.
 * @typedef {Object} SceneSegment
 * @property {Point2D} p1 - Start point of the segment.
 * @property {Point2D} p2 - End point of the segment.
 * @property {'wall' | 'barrier' | 'light'} type - Segment classification.
 * @property {'rectangle' | 'sphere'} [shape] - Shape of parent barrier.
 * @property {Material} [material] - Surface material (required for barrier).
 * @property {number} [barrierIndex] - Barrier index in barriers array.
 * @property {'circle' | 'segment'} [geomType='segment'] - Geometry primitive type.
 * @property {Point2D} [center] - Center point if circle / sphere.
 * @property {number} [radius] - Radius if circle / sphere.
 * @property {number} [lightId] - Unique ID if this represents a light.
 * @property {ColorRGB} [lightColorRGB] - Light emission color if light.
 */

/**
 * Ray intersection result with scene geometry.
 * @typedef {Object} Intersection
 * @property {number} t - Distance parameter along the ray.
 * @property {number} [u] - Normalized interpolation factor along the segment (0 <= u <= 1).
 * @property {number} x - X position of intersection point.
 * @property {number} y - Y position of intersection point.
 * @property {number} nx - Outward surface unit normal X.
 * @property {number} ny - Outward surface unit normal Y.
 * @property {number} [Vx] - Segment delta X (p2.x - p1.x).
 * @property {number} [Vy] - Segment delta Y (p2.y - p1.y).
 */

/**
 * Shadow ray evaluation result.
 * @typedef {Object} ShadowRayInfo
 * @property {LightSource} light - Target light source.
 * @property {boolean} inShadow - Whether light is occluded.
 * @property {number} nDotL - Dot product of normal and light direction.
 * @property {{ x: number, y: number } | null} shadowHitPoint - Point of occlusion.
 * @property {number} transmission - Transmission fraction reaching light through transparent media.
 * @property {{ x: number, y: number }[]} transparentHits - Intersected transparent surfaces along feeler path.
 */

/**
 * Path segment representing a ray step through the scene.
 * @typedef {Object} RayPathSegment
 * @property {{ x: number, y: number }} from - Ray start coordinate.
 * @property {{ x: number, y: number }} to - Ray hit coordinate.
 * @property {'barrier' | 'wall' | 'miss' | 'light'} type - Segment classification.
 * @property {Material} [material] - Material at intersection.
 * @property {ColorRGB} [colorRGB] - Color at intersection.
 * @property {number} [barrierIndex] - Barrier index if barrier.
 * @property {number} [lightId] - Light index if hit light.
 * @property {number} [nx] - Normal X.
 * @property {number} [ny] - Normal Y.
 * @property {ShadowRayInfo[]} [shadowRays] - Evaluated shadow rays.
 * @property {number} [weight=1.0] - Ray tree branch contribution weight.
 * @property {boolean} [isRefraction=false] - Whether this segment is a refracted transmission ray.
 */

/**
 * Pixel data representing the camera sensor color.
 * @typedef {Object} PixelInfo
 * @property {ColorRGB} color - Computed RGB color for the pixel.
 * @property {number} hitCount - Number of rays from this pixel that reached the light.
 */

/**
 * Systematically generated color variable for hover math popup.
 * @typedef {Object} PixelMathVariable
 * @property {string} name - Variable name (e.g., C_L1, k_d, C_amb).
 * @property {string} desc - What this variable represents.
 * @property {ColorRGB} [colorRGB] - Associated RGB color (for swatch).
 * @property {string} [value] - Display value if scalar.
 */

/**
 * Mathematical lighting equation details for a sensor pixel.
 * @typedef {Object} PixelMathData
 * @property {number} pixelIndex - 0-based pixel index.
 * @property {ColorRGB} finalColor - Resulting RGB color.
 * @property {PixelMathVariable[]} variables - List of systematically generated variables.
 * @property {string} equation - Mathematical formula string.
 * @property {string} evaluation - Numerical breakdown / evaluated equation.
 */

/**
 * Snapshot of the simulation state for undo history.
 * @typedef {Object} SceneSnapshot
 * @property {LightSource[]} lights - Array of lights in the scene.
 * @property {{ eye: Point2D, lookat: Point2D }} camera - Camera ray-tracer geometry.
 * @property {Barrier[]} barriers - Array of barriers in the scene.
 * @property {Record<string, any>} inputs - UI input values.
 */

/* ==========================================================================
   STATE & DOM ELEMENTS
   ========================================================================== */

/** @type {HTMLCanvasElement} */
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('rayCanvas'));
/** @type {CanvasRenderingContext2D} */
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
/** @type {HTMLElement} */
const canvasWrapper = /** @type {HTMLElement} */ (document.getElementById('canvasWrapper'));

/** @type {HTMLInputElement} */
const inputPixels = /** @type {HTMLInputElement} */ (document.getElementById('inputPixels'));
/** @type {HTMLInputElement} */
const checkAntialiasing = /** @type {HTMLInputElement} */ (document.getElementById('checkAntialiasing'));
/** @type {HTMLInputElement} */
const inputMaxAaSubdivisions = /** @type {HTMLInputElement} */ (document.getElementById('inputMaxAaSubdivisions'));
/** @type {HTMLElement} */
const groupMaxAaSubdivisions = /** @type {HTMLElement} */ (document.getElementById('groupMaxAaSubdivisions'));
/** @type {HTMLInputElement} */
const inputBounces = /** @type {HTMLInputElement} */ (document.getElementById('inputBounces'));
/** @type {HTMLInputElement} */
const inputFov = /** @type {HTMLInputElement} */ (document.getElementById('inputFov'));
/** @type {HTMLInputElement} */
const checkShadowRays = /** @type {HTMLInputElement} */ (document.getElementById('checkShadowRays'));

/** @type {HTMLInputElement} */
const checkAmbient = /** @type {HTMLInputElement} */ (document.getElementById('checkAmbient'));
/** @type {HTMLButtonElement} */
const btnAmbientColor = /** @type {HTMLButtonElement} */ (document.getElementById('btnAmbientColor'));
/** @type {HTMLElement} */
const ambientColorSwatch = /** @type {HTMLElement} */ (document.getElementById('ambientColorSwatch'));

/** @type {HTMLButtonElement} */
const btnNoLightColor = /** @type {HTMLButtonElement} */ (document.getElementById('btnNoLightColor'));
/** @type {HTMLElement} */
const noLightColorSwatch = /** @type {HTMLElement} */ (document.getElementById('noLightColorSwatch'));

/** @type {HTMLButtonElement} */
const btnToggleMenu = /** @type {HTMLButtonElement} */ (document.getElementById('btnToggleMenu'));
/** @type {HTMLElement} */
const settingsDrawer = /** @type {HTMLElement} */ (document.getElementById('settingsDrawer'));

/** @type {HTMLButtonElement} */
const btnLightColor = /** @type {HTMLButtonElement} */ (document.getElementById('btnLightColor'));
/** @type {HTMLElement} */
const lightColorSwatch = /** @type {HTMLElement} */ (document.getElementById('lightColorSwatch'));

/** @type {HTMLSelectElement} */
const selectShape = /** @type {HTMLSelectElement} */ (document.getElementById('selectShape'));
/** @type {HTMLInputElement} */
const inputBarrierWidth = /** @type {HTMLInputElement} */ (document.getElementById('inputBarrierWidth'));
/** @type {HTMLElement} */
const groupBarrierWidth = /** @type {HTMLElement} */ (document.getElementById('groupBarrierWidth'));

// Material Struct Input Elements
/** @type {HTMLButtonElement} */
const btnMatAmbient = /** @type {HTMLButtonElement} */ (document.getElementById('btnMatAmbient'));
/** @type {HTMLElement} */
const matAmbientSwatch = /** @type {HTMLElement} */ (document.getElementById('matAmbientSwatch'));

/** @type {HTMLButtonElement} */
const btnMatDiffuse = /** @type {HTMLButtonElement} */ (document.getElementById('btnMatDiffuse'));
/** @type {HTMLElement} */
const matDiffuseSwatch = /** @type {HTMLElement} */ (document.getElementById('matDiffuseSwatch'));

/** @type {HTMLButtonElement} */
const btnMatSpecular = /** @type {HTMLButtonElement} */ (document.getElementById('btnMatSpecular'));
/** @type {HTMLElement} */
const matSpecularSwatch = /** @type {HTMLElement} */ (document.getElementById('matSpecularSwatch'));

/** @type {HTMLInputElement} */
const inputMatShininess = /** @type {HTMLInputElement} */ (document.getElementById('inputMatShininess'));
/** @type {HTMLInputElement} */
const inputMatReflectivity = /** @type {HTMLInputElement} */ (document.getElementById('inputMatReflectivity'));
/** @type {HTMLInputElement} */
const inputMatTransparency = /** @type {HTMLInputElement} */ (document.getElementById('inputMatTransparency'));
/** @type {HTMLInputElement} */
const inputMatRefractiveIndex = /** @type {HTMLInputElement} */ (document.getElementById('inputMatRefractiveIndex'));

// Presentation-Themed Color Picker Popover
/** @type {HTMLElement} */
const themedColorPicker = /** @type {HTMLElement} */ (document.getElementById('themedColorPicker'));
/** @type {HTMLElement} */
const colorPickerTitle = /** @type {HTMLElement} */ (document.getElementById('colorPickerTitle'));
/** @type {HTMLButtonElement} */
const btnCloseColorPicker = /** @type {HTMLButtonElement} */ (document.getElementById('btnCloseColorPicker'));
/** @type {HTMLElement} */
const colorPickerPalette = /** @type {HTMLElement} */ (document.getElementById('colorPickerPalette'));
/** @type {HTMLElement} */
const colorPickerPreview = /** @type {HTMLElement} */ (document.getElementById('colorPickerPreview'));
/** @type {HTMLInputElement} */
const colorPickerHexInput = /** @type {HTMLInputElement} */ (document.getElementById('colorPickerHexInput'));
/** @type {HTMLInputElement} */
const nativeColorInput = /** @type {HTMLInputElement} */ (document.getElementById('nativeColorInput'));
/** @type {HTMLButtonElement} */
const btnCustomColorWheel = /** @type {HTMLButtonElement} */ (document.getElementById('btnCustomColorWheel'));
/** @type {HTMLButtonElement} */
const btnApplyColorPicker = /** @type {HTMLButtonElement} */ (document.getElementById('btnApplyColorPicker'));

/** @type {HTMLButtonElement} */
const btnAddLight = /** @type {HTMLButtonElement} */ (document.getElementById('btnAddLight'));
/** @type {HTMLButtonElement} */
const btnUndoBarrier = /** @type {HTMLButtonElement} */ (document.getElementById('btnUndoBarrier'));
/** @type {HTMLButtonElement} */
const btnClearBarriers = /** @type {HTMLButtonElement} */ (document.getElementById('btnClearBarriers'));
/** @type {HTMLButtonElement} */
const btnResetScene = /** @type {HTMLButtonElement} */ (document.getElementById('btnResetScene'));
/** @type {HTMLButtonElement} */
const btnCopyLink = /** @type {HTMLButtonElement} */ (document.getElementById('btnCopyLink'));
/** @type {HTMLButtonElement} */
const btnLoadScene = /** @type {HTMLButtonElement} */ (document.getElementById('btnLoadScene'));

// Modal dialog elements
/** @type {HTMLElement} */
const loadSceneModal = /** @type {HTMLElement} */ (document.getElementById('loadSceneModal'));
/** @type {HTMLButtonElement} */
const btnCloseModal = /** @type {HTMLButtonElement} */ (document.getElementById('btnCloseModal'));
/** @type {HTMLButtonElement} */
const btnCancelModal = /** @type {HTMLButtonElement} */ (document.getElementById('btnCancelModal'));
/** @type {HTMLButtonElement} */
const btnApplyScene = /** @type {HTMLButtonElement} */ (document.getElementById('btnApplyScene'));
/** @type {HTMLTextAreaElement} */
const txtSceneInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('txtSceneInput'));
/** @type {HTMLElement} */
const loadErrorMsg = /** @type {HTMLElement} */ (document.getElementById('loadErrorMsg'));

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

// Stylized Pixel Math Hover Popup Elements
/** @type {HTMLElement} */
const pixelMathPopup = /** @type {HTMLElement} */ (document.getElementById('pixelMathPopup'));
/** @type {HTMLElement} */
const mathPopupTitle = /** @type {HTMLElement} */ (document.getElementById('mathPopupTitle'));
/** @type {HTMLElement} */
const mathPopupSwatch = /** @type {HTMLElement} */ (document.getElementById('mathPopupSwatch'));
/** @type {HTMLElement} */
const mathPopupRgbVal = /** @type {HTMLElement} */ (document.getElementById('mathPopupRgbVal'));
/** @type {HTMLElement} */
const mathPopupVariables = /** @type {HTMLElement} */ (document.getElementById('mathPopupVariables'));
/** @type {HTMLElement} */
const mathPopupEquation = /** @type {HTMLElement} */ (document.getElementById('mathPopupEquation'));
/** @type {HTMLElement} */
const mathPopupEvaluation = /** @type {HTMLElement} */ (document.getElementById('mathPopupEvaluation'));

/**
 * Cached per-pixel mathematical breakdown for the hover popup.
 * @type {PixelMathData[]}
 */
let pixelMathData = [];

/** @type {boolean} */
let isAmbientOn = DEFAULT_AMBIENT_ON;
/** @type {string} */
let ambientColorHex = DEFAULT_AMBIENT_COLOR_HEX;
/** @type {ColorRGB} */
let ambientColorRGB = parseColorRGB(DEFAULT_AMBIENT_COLOR_HEX);

/** @type {string} */
let noLightColorHex = DEFAULT_NO_LIGHT_COLOR_HEX;
/** @type {ColorRGB} */
let noLightColorRGB = parseColorRGB(DEFAULT_NO_LIGHT_COLOR_HEX);

/** @type {string} */
let selectedLightColorHex = DEFAULT_LIGHT_COLOR_HEX;
/** @type {ColorRGB} */
let selectedLightColorRGB = parseColorRGB(DEFAULT_LIGHT_COLOR_HEX);

// Current Material UI state values used when user creates a shape
let currentMatAmbientHex = DEFAULT_MAT_AMBIENT_HEX;
let currentMatDiffuseHex = DEFAULT_MAT_DIFFUSE_HEX;
let currentMatSpecularHex = DEFAULT_MAT_SPECULAR_HEX;

/**
 * Scene light sources state.
 * All Y values are measured from the bottom of the screen.
 * @type {LightSource[]}
 */
let lights = [
    {
        id: 1,
        x: 180,
        y: 410,
        radius: 16,
        color: DEFAULT_LIGHT_COLOR_HEX,
        colorRGB: parseColorRGB(DEFAULT_LIGHT_COLOR_HEX)
    }
];

/**
 * Camera ray-tracer parameterization state.
 * All Y values are measured from the bottom of the screen.
 * @type {{
 *   eye: Point2D,
 *   lookat: Point2D,
 *   viewportWidth: number,
 *   viewportP1?: Point2D,
 *   viewportP2?: Point2D,
 *   dir?: Point2D,
 *   up?: Point2D,
 *   handlePos?: Point2D
 * }}
 */
const camera = {
    eye: { x: 780, y: 340 },
    lookat: { x: 500, y: 340 },
    viewportWidth: 160
};

/** @type {Barrier[]} */
let barriers = [];

/**
 * Currently hovered interactive item for visual grab cue.
 * @type {{ type: 'barrierEndpoint', barrierIndex: number, endpoint: 'p1' | 'p2' } |
 *        { type: 'circleMove', barrierIndex: number } |
 *        { type: 'circleResize', barrierIndex: number } |
 *        { type: 'eye' } |
 *        { type: 'viewport' } |
 *        { type: 'light', index: number } |
 *        null}
 */
let hoveredItem = null;

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
        lights: lights.map((l) => ({
            id: l.id,
            x: l.x,
            y: l.y,
            radius: l.radius,
            color: l.color,
            colorRGB: [...l.colorRGB]
        })),
        camera: {
            eye: { x: camera.eye.x, y: camera.eye.y },
            lookat: { x: camera.lookat.x, y: camera.lookat.y }
        },
        barriers: barriers.map((b) => ({
            shape: b.shape,
            p1: { x: b.p1.x, y: b.p1.y },
            p2: b.p2 ? { x: b.p2.x, y: b.p2.y } : undefined,
            width: b.width !== undefined ? b.width : 16,
            radius: b.radius !== undefined ? b.radius : 30,
            material: new Material({
                ambient: [...b.material.ambient],
                diffuse: [...b.material.diffuse],
                specular: [...b.material.specular],
                shininess: b.material.shininess,
                reflectivity: b.material.reflectivity,
                transparency: b.material.transparency,
                refractiveIndex: b.material.refractiveIndex
            })
        })),
        inputs: {
            pixels: inputPixels.value,
            antialiasing: checkAntialiasing ? checkAntialiasing.checked : DEFAULT_ANTIALIASING,
            maxAaSubdivisions: inputMaxAaSubdivisions ? inputMaxAaSubdivisions.value : '',
            bounces: inputBounces.value,
            fov: inputFov ? inputFov.value : String(DEFAULT_FOV_DEG),
            shadowRays: checkShadowRays ? checkShadowRays.checked : DEFAULT_SHADOW_RAYS,
            ambient: checkAmbient ? checkAmbient.checked : DEFAULT_AMBIENT_ON,
            ambientColor: ambientColorHex,
            noLightColor: noLightColorHex,
            lightColor: selectedLightColorHex,
            matAmbient: currentMatAmbientHex,
            matDiffuse: currentMatDiffuseHex,
            matSpecular: currentMatSpecularHex,
            matShininess: inputMatShininess ? inputMatShininess.value : String(DEFAULT_MAT_SHININESS),
            matReflectivity: inputMatReflectivity ? inputMatReflectivity.value : String(DEFAULT_MAT_REFLECTIVITY),
            matTransparency: inputMatTransparency ? inputMatTransparency.value : String(DEFAULT_MAT_TRANSPARENCY),
            matRefractiveIndex: inputMatRefractiveIndex ? inputMatRefractiveIndex.value : String(DEFAULT_MAT_REFRACTIVE_INDEX),
            shape: selectShape ? selectShape.value : 'rectangle',
            barrierWidth: inputBarrierWidth ? inputBarrierWidth.value : '16'
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
    if (Array.isArray(s.lights)) {
        lights = s.lights.map((l, idx) => ({
            id: l.id || (idx + 1),
            x: Number(l.x),
            y: Number(l.y),
            radius: l.radius || 16,
            color: l.color || DEFAULT_LIGHT_COLOR_HEX,
            colorRGB: l.colorRGB ? [...l.colorRGB] : parseColorRGB(l.color || DEFAULT_LIGHT_COLOR_HEX)
        }));
    }

    if (s.camera) {
        if (s.camera.eye) {
            camera.eye = { x: Number(s.camera.eye.x), y: Number(s.camera.eye.y) };
            camera.lookat = { x: Number(s.camera.lookat.x), y: Number(s.camera.lookat.y) };
        }
    }

    if (Array.isArray(s.barriers)) {
        barriers = s.barriers.map((b) => {
            const mat = b.material instanceof Material ? b.material : new Material(b.material || {});
            return {
                shape: b.shape || 'rectangle',
                p1: { x: Number(b.p1.x), y: Number(b.p1.y) },
                p2: b.p2 ? { x: Number(b.p2.x), y: Number(b.p2.y) } : undefined,
                width: b.width !== undefined ? Number(b.width) : 16,
                radius: b.radius !== undefined ? Number(b.radius) : 30,
                material: mat
            };
        });
    }

    if (s.inputs) {
        inputPixels.value = s.inputs.pixels || String(DEFAULT_CAMERA_PIXELS);
        if (checkAntialiasing && s.inputs.antialiasing !== undefined) {
            checkAntialiasing.checked = s.inputs.antialiasing;
            updateAntialiasingUiVisibility();
        }
        if (inputMaxAaSubdivisions) inputMaxAaSubdivisions.value = s.inputs.maxAaSubdivisions || '';
        inputBounces.value = s.inputs.bounces || String(DEFAULT_MAX_BOUNCES);
        if (inputFov) inputFov.value = s.inputs.fov || String(DEFAULT_FOV_DEG);
        if (checkShadowRays && s.inputs.shadowRays !== undefined) checkShadowRays.checked = s.inputs.shadowRays;
        if (checkAmbient && s.inputs.ambient !== undefined) {
            checkAmbient.checked = s.inputs.ambient;
            isAmbientOn = checkAmbient.checked;
        }
        if (s.inputs.ambientColor) {
            ambientColorHex = s.inputs.ambientColor;
            ambientColorRGB = parseColorRGB(ambientColorHex);
            if (ambientColorSwatch) ambientColorSwatch.style.backgroundColor = ambientColorHex;
        }
        if (s.inputs.noLightColor) {
            noLightColorHex = s.inputs.noLightColor;
            noLightColorRGB = parseColorRGB(noLightColorHex);
            if (noLightColorSwatch) noLightColorSwatch.style.backgroundColor = noLightColorHex;
        }
        if (s.inputs.lightColor) {
            selectedLightColorHex = s.inputs.lightColor;
            selectedLightColorRGB = parseColorRGB(selectedLightColorHex);
            if (lightColorSwatch) lightColorSwatch.style.backgroundColor = selectedLightColorHex;
        }
        if (s.inputs.matAmbient) {
            currentMatAmbientHex = s.inputs.matAmbient;
            if (matAmbientSwatch) matAmbientSwatch.style.backgroundColor = currentMatAmbientHex;
        }
        if (s.inputs.matDiffuse) {
            currentMatDiffuseHex = s.inputs.matDiffuse;
            if (matDiffuseSwatch) matDiffuseSwatch.style.backgroundColor = currentMatDiffuseHex;
        }
        if (s.inputs.matSpecular) {
            currentMatSpecularHex = s.inputs.matSpecular;
            if (matSpecularSwatch) matSpecularSwatch.style.backgroundColor = currentMatSpecularHex;
        }
        if (s.inputs.matShininess && inputMatShininess) {
            inputMatShininess.value = s.inputs.matShininess;
        }
        if (s.inputs.matReflectivity && inputMatReflectivity) {
            inputMatReflectivity.value = s.inputs.matReflectivity;
        }
        if (s.inputs.matTransparency && inputMatTransparency) {
            inputMatTransparency.value = s.inputs.matTransparency;
        }
        if (s.inputs.matRefractiveIndex && inputMatRefractiveIndex) {
            inputMatRefractiveIndex.value = s.inputs.matRefractiveIndex;
        }
        if (s.inputs.shape && selectShape) {
            selectShape.value = s.inputs.shape;
            updateShapeUiVisibility();
        }
        if (s.inputs.barrierWidth && inputBarrierWidth) {
            inputBarrierWidth.value = s.inputs.barrierWidth;
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
 * Parses color inputs into a standard ColorRGB [r, g, b] array with channels in [0, 1].
 * @param {any} v Input color value.
 * @param {ColorRGB} [defaultColor=[0, 0, 0]]
 * @returns {ColorRGB}
 */
export function parseColorRGB(v, defaultColor = [0, 0, 0]) {
    if (v === null || v === undefined || v === '') return [...defaultColor];
    if (Array.isArray(v)) {
        const scale = (v[0] > 1 || v[1] > 1 || v[2] > 1) ? (1 / 255) : 1;
        return [Number(v[0]) * scale, Number(v[1]) * scale, Number(v[2]) * scale];
    }
    if (typeof v === 'object' && 'r' in v && 'g' in v && 'b' in v) {
        const scale = (v.r > 1 || v.g > 1 || v.b > 1) ? (1 / 255) : 1;
        return [Number(v.r) * scale, Number(v.g) * scale, Number(v.b) * scale];
    }
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        const hex = s.startsWith('#') ? s.slice(1) : s;
        if (/^[0-9a-f]{6}$/i.test(hex)) {
            return [
                parseInt(hex.slice(0, 2), 16) / 255,
                parseInt(hex.slice(2, 4), 16) / 255,
                parseInt(hex.slice(4, 6), 16) / 255
            ];
        }
        if (/^[0-9a-f]{3}$/i.test(hex)) {
            return [
                parseInt(hex[0] + hex[0], 16) / 255,
                parseInt(hex[1] + hex[1], 16) / 255,
                parseInt(hex[2] + hex[2], 16) / 255
            ];
        }
        if (s.includes(',')) {
            const parts = s.split(',').map(p => Number(p.trim()));
            if (parts.length >= 3 && !parts.some(isNaN)) {
                const scale = (parts[0] > 1 || parts[1] > 1 || parts[2] > 1) ? (1 / 255) : 1;
                return [parts[0] * scale, parts[1] * scale, parts[2] * scale];
            }
        }
    }
    return [...defaultColor];
}

/**
 * Converts a ColorRGB [r, g, b] array (values in [0, 1]) to hex color string.
 * @param {ColorRGB} rgb
 * @returns {string}
 */
export function colorRGBToHex(rgb) {
    if (!rgb) return DEFAULT_LIGHT_COLOR_HEX;
    const r = Math.max(0, Math.min(255, Math.round(rgb[0] * 255))).toString(16).padStart(2, '0');
    const g = Math.max(0, Math.min(255, Math.round(rgb[1] * 255))).toString(16).padStart(2, '0');
    const b = Math.max(0, Math.min(255, Math.round(rgb[2] * 255))).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/**
 * Converts a ColorRGB [r, g, b] array to CSS rgb string.
 * @param {ColorRGB} rgb
 * @returns {string}
 */
export function colorRGBToString(rgb) {
    const r = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
    const g = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
    const b = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Clamps value x into range [min, max].
 * @param {number} x
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(x, min, max) {
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

/**
 * Component-wise multiply two ColorRGB colors.
 * @param {ColorRGB} c1
 * @param {ColorRGB} c2
 * @returns {ColorRGB}
 */
export function multiplyColors(c1, c2) {
    return [
        c1[0] * c2[0],
        c1[1] * c2[1],
        c1[2] * c2[2]
    ];
}

/**
 * Component-wise add two ColorRGB colors, clamping to 1.0.
 * @param {ColorRGB} c1
 * @param {ColorRGB} c2
 * @returns {ColorRGB}
 */
export function addColor(c1, c2) {
    return [
        Math.min(1.0, c1[0] + c2[0]),
        Math.min(1.0, c1[1] + c2[1]),
        Math.min(1.0, c1[2] + c2[2])
    ];
}

/**
 * Scale a ColorRGB color by a scalar multiplier.
 * @param {ColorRGB} c
 * @param {number} s
 * @returns {ColorRGB}
 */
export function scaleColor(c, s) {
    return [
        Math.min(1.0, Math.max(0, c[0] * s)),
        Math.min(1.0, Math.max(0, c[1] * s)),
        Math.min(1.0, Math.max(0, c[2] * s))
    ];
}

/**
 * Get CSS variable value with fallback.
 * @param {string} cssVar
 * @param {string} fallback
 * @returns {string}
 */
function varColor(cssVar, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
}

/* ==========================================================================
   INPUTS & SCENE INITIALIZATION
   ========================================================================== */

/** @type {'matAmbient' | 'matDiffuse' | 'matSpecular' | 'ambient' | 'noLight' | 'light' | null} */
let activePickerTarget = null;

/** Populate the presentation color palette in the picker popover */
export function initColorPickerPalette() {
    if (!colorPickerPalette) return;
    colorPickerPalette.innerHTML = '';
    PRESENTATION_PALETTE.forEach((hex) => {
        const swatch = document.createElement('div');
        swatch.className = 'popover-swatch';
        swatch.style.backgroundColor = hex;
        swatch.dataset.color = hex;
        swatch.title = hex;
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            selectColorFromPicker(hex);
        });
        colorPickerPalette.appendChild(swatch);
    });
}

/**
 * Open the presentation-themed color picker.
 * @param {'matAmbient' | 'matDiffuse' | 'matSpecular' | 'ambient' | 'noLight' | 'light'} target
 * @param {HTMLElement} anchorElement
 */
export function openColorPicker(target, anchorElement) {
    if (!themedColorPicker) return;
    activePickerTarget = target;
    let currentHex = '#ffffff';

    if (target === 'matAmbient') currentHex = currentMatAmbientHex;
    else if (target === 'matDiffuse') currentHex = currentMatDiffuseHex;
    else if (target === 'matSpecular') currentHex = currentMatSpecularHex;
    else if (target === 'ambient') currentHex = ambientColorHex;
    else if (target === 'noLight') currentHex = noLightColorHex;
    else if (target === 'light') currentHex = selectedLightColorHex;

    if (colorPickerTitle) {
        if (target === 'matAmbient') colorPickerTitle.textContent = 'Mat Ambient';
        else if (target === 'matDiffuse') colorPickerTitle.textContent = 'Mat Diffuse';
        else if (target === 'matSpecular') colorPickerTitle.textContent = 'Mat Specular';
        else if (target === 'ambient') colorPickerTitle.textContent = 'Ambient Color';
        else if (target === 'noLight') colorPickerTitle.textContent = 'No-Hit Color';
        else if (target === 'light') colorPickerTitle.textContent = 'Light Color';
    }
    if (colorPickerHexInput) {
        colorPickerHexInput.value = currentHex.toUpperCase();
    }
    if (colorPickerPreview) {
        colorPickerPreview.style.backgroundColor = currentHex;
    }
    if (nativeColorInput) {
        nativeColorInput.value = currentHex.startsWith('#') ? currentHex : `#${currentHex}`;
    }

    if (colorPickerPalette) {
        colorPickerPalette.querySelectorAll('.popover-swatch').forEach((s) => {
            const el = /** @type {HTMLElement} */ (s);
            if (el.dataset.color && el.dataset.color.toLowerCase() === currentHex.toLowerCase()) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    const rect = anchorElement.getBoundingClientRect();
    themedColorPicker.style.display = 'flex';
    const popoverW = 250;
    const left = Math.max(8, Math.min(window.innerWidth - popoverW - 12, rect.left));
    const top = rect.bottom + 4;
    themedColorPicker.style.left = `${left}px`;
    themedColorPicker.style.top = `${top}px`;
}

/** Close the color picker popover */
export function closeColorPicker() {
    if (themedColorPicker) {
        themedColorPicker.style.display = 'none';
    }
    activePickerTarget = null;
}

/**
 * Apply selected color to the active target and re-render.
 * @param {string} hex
 */
export function selectColorFromPicker(hex) {
    let cleanHex = (hex || '').trim();
    if (!cleanHex) return;
    if (!cleanHex.startsWith('#')) cleanHex = `#${cleanHex}`;
    if (!/^#[0-9a-fA-F]{3,6}$/.test(cleanHex)) return;
    if (!activePickerTarget) return;

    pushUndo();
    if (activePickerTarget === 'matAmbient') {
        currentMatAmbientHex = cleanHex;
        if (matAmbientSwatch) matAmbientSwatch.style.backgroundColor = cleanHex;
    } else if (activePickerTarget === 'matDiffuse') {
        currentMatDiffuseHex = cleanHex;
        if (matDiffuseSwatch) matDiffuseSwatch.style.backgroundColor = cleanHex;
    } else if (activePickerTarget === 'matSpecular') {
        currentMatSpecularHex = cleanHex;
        if (matSpecularSwatch) matSpecularSwatch.style.backgroundColor = cleanHex;
    } else if (activePickerTarget === 'ambient') {
        ambientColorHex = cleanHex;
        ambientColorRGB = parseColorRGB(cleanHex);
        if (ambientColorSwatch) ambientColorSwatch.style.backgroundColor = cleanHex;
    } else if (activePickerTarget === 'noLight') {
        noLightColorHex = cleanHex;
        noLightColorRGB = parseColorRGB(cleanHex);
        if (noLightColorSwatch) noLightColorSwatch.style.backgroundColor = cleanHex;
    } else if (activePickerTarget === 'light') {
        selectedLightColorHex = cleanHex;
        selectedLightColorRGB = parseColorRGB(cleanHex);
        if (lightColorSwatch) lightColorSwatch.style.backgroundColor = cleanHex;
    }

    closeColorPicker();
    render();
}

/**
 * Constructs a new Material instance using current UI settings inputs.
 * @returns {Material}
 */
export function getCurrentMaterial() {
    return new Material({
        ambient: parseColorRGB(currentMatAmbientHex),
        diffuse: parseColorRGB(currentMatDiffuseHex),
        specular: parseColorRGB(currentMatSpecularHex),
        shininess: inputMatShininess ? Math.max(0, parseFloat(inputMatShininess.value) || 0) : DEFAULT_MAT_SHININESS,
        reflectivity: inputMatReflectivity ? Math.max(0, Math.min(1, parseFloat(inputMatReflectivity.value) || 0)) : DEFAULT_MAT_REFLECTIVITY,
        transparency: inputMatTransparency ? Math.max(0, Math.min(1, parseFloat(inputMatTransparency.value) || 0)) : DEFAULT_MAT_TRANSPARENCY,
        refractiveIndex: inputMatRefractiveIndex ? Math.max(1.0, parseFloat(inputMatRefractiveIndex.value) || 1.0) : DEFAULT_MAT_REFRACTIVE_INDEX
    });
}

/** Apply default constant values to the UI controls */
function applyDefaultInputs() {
    inputPixels.value = String(DEFAULT_CAMERA_PIXELS);
    if (checkAntialiasing) checkAntialiasing.checked = DEFAULT_ANTIALIASING;
    if (inputMaxAaSubdivisions) inputMaxAaSubdivisions.value = '';
    updateAntialiasingUiVisibility();
    inputBounces.value = String(DEFAULT_MAX_BOUNCES);
    if (inputFov) inputFov.value = String(DEFAULT_FOV_DEG);
    if (checkShadowRays) checkShadowRays.checked = DEFAULT_SHADOW_RAYS;
    if (checkAmbient) checkAmbient.checked = DEFAULT_AMBIENT_ON;

    isAmbientOn = DEFAULT_AMBIENT_ON;
    ambientColorHex = DEFAULT_AMBIENT_COLOR_HEX;
    ambientColorRGB = parseColorRGB(DEFAULT_AMBIENT_COLOR_HEX);
    if (ambientColorSwatch) ambientColorSwatch.style.backgroundColor = DEFAULT_AMBIENT_COLOR_HEX;

    noLightColorHex = DEFAULT_NO_LIGHT_COLOR_HEX;
    noLightColorRGB = parseColorRGB(DEFAULT_NO_LIGHT_COLOR_HEX);
    if (noLightColorSwatch) noLightColorSwatch.style.backgroundColor = DEFAULT_NO_LIGHT_COLOR_HEX;

    selectedLightColorHex = DEFAULT_LIGHT_COLOR_HEX;
    selectedLightColorRGB = parseColorRGB(DEFAULT_LIGHT_COLOR_HEX);
    if (lightColorSwatch) lightColorSwatch.style.backgroundColor = DEFAULT_LIGHT_COLOR_HEX;

    currentMatAmbientHex = DEFAULT_MAT_AMBIENT_HEX;
    if (matAmbientSwatch) matAmbientSwatch.style.backgroundColor = DEFAULT_MAT_AMBIENT_HEX;

    currentMatDiffuseHex = DEFAULT_MAT_DIFFUSE_HEX;
    if (matDiffuseSwatch) matDiffuseSwatch.style.backgroundColor = DEFAULT_MAT_DIFFUSE_HEX;

    currentMatSpecularHex = DEFAULT_MAT_SPECULAR_HEX;
    if (matSpecularSwatch) matSpecularSwatch.style.backgroundColor = DEFAULT_MAT_SPECULAR_HEX;

    if (inputMatShininess) inputMatShininess.value = String(DEFAULT_MAT_SHININESS);
    if (inputMatReflectivity) inputMatReflectivity.value = String(DEFAULT_MAT_REFLECTIVITY);
    if (inputMatTransparency) inputMatTransparency.value = String(DEFAULT_MAT_TRANSPARENCY);
    if (inputMatRefractiveIndex) inputMatRefractiveIndex.value = String(DEFAULT_MAT_REFRACTIVE_INDEX);

    if (selectShape) selectShape.value = 'rectangle';
    if (inputBarrierWidth) inputBarrierWidth.value = '16';
    updateShapeUiVisibility();
}

/** Update visibility of shape-specific options in the UI */
function updateShapeUiVisibility() {
    if (!selectShape || !groupBarrierWidth) return;
    const shape = selectShape.value;
    groupBarrierWidth.style.display = shape === 'rectangle' ? 'flex' : 'none';
}

/** Update visibility of antialiasing subdivision depth controls */
function updateAntialiasingUiVisibility() {
    if (!groupMaxAaSubdivisions) return;
    const isAa = checkAntialiasing ? checkAntialiasing.checked : DEFAULT_ANTIALIASING;
    groupMaxAaSubdivisions.style.display = isAa ? 'flex' : 'none';
}

/** Reset lights, camera, and default barriers */
export function setupDefaultScene() {
    const w = canvasWrapper.clientWidth || 850;
    const h = canvasWrapper.clientHeight || 550;

    lights = [
        {
            id: 1,
            x: Math.round(w * 0.22),
            y: Math.round(h * 0.65),
            radius: 16,
            color: DEFAULT_LIGHT_COLOR_HEX,
            colorRGB: parseColorRGB(DEFAULT_LIGHT_COLOR_HEX)
        }
    ];

    camera.eye = {
        x: Math.round(Math.min(w - 70, 780)),
        y: Math.round(h * 0.52)
    };
    camera.lookat = {
        x: Math.round(Math.min(w - 70, 780) - 200),
        y: Math.round(h * 0.52)
    };
    camera.viewportWidth = Math.max(120, Math.min(220, Math.round(h * 0.35)));

    barriers = [];
}

/** Add another light source to the scene */
export function addLight() {
    pushUndo();
    const nextId = lights.length > 0 ? Math.max(...lights.map((l) => l.id)) + 1 : 1;
    const w = canvasWrapper.clientWidth || 850;
    const h = canvasWrapper.clientHeight || 550;
    const offset = (lights.length * 70) % 240;
    const newLight = {
        id: nextId,
        x: Math.max(30, Math.min(w - 30, Math.round(w * 0.15 + offset))),
        y: Math.max(30, Math.min(h - 30, Math.round(h * 0.45 + (lights.length % 2 === 0 ? 60 : -60)))),
        radius: 16,
        color: selectedLightColorHex,
        colorRGB: /** @type {ColorRGB} */ ([selectedLightColorRGB[0], selectedLightColorRGB[1], selectedLightColorRGB[2]])
    };
    lights.push(newLight);
    render();
}

/* ==========================================================================
   CANVAS & MATH UTILITIES
   ========================================================================== */

/** Resize canvas backing store for high DPI screens */
export function resizeCanvas() {
    const rect = canvasWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayW = Math.round(rect.width);
    const displayH = Math.round(rect.height);
    if (displayW <= 0 || displayH <= 0) return;

    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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

    if (Math.abs(denom) < 1e-9) return null;

    const dAx = Ax - Ox;
    const dAy = Ay - Oy;

    const t = (dAx * Vy - dAy * Vx) / denom;
    const u = (dAx * Dy - dAy * Dx) / denom;

    if (t > 0.05 && u >= 0 && u <= 1) {
        const segLen = Math.hypot(Vx, Vy) || 1;
        return {
            t,
            u,
            x: Ox + t * Dx,
            y: Oy + t * Dy,
            nx: -Vy / segLen,
            ny: Vx / segLen,
            Vx,
            Vy
        };
    }
    return null;
}

/**
 * Ray vs circle intersection test returning intersection position and surface normal.
 * @param {number} Ox - Ray origin X.
 * @param {number} Oy - Ray origin Y.
 * @param {number} Dx - Ray direction X (normalized).
 * @param {number} Dy - Ray direction Y (normalized).
 * @param {number} Cx - Circle center X.
 * @param {number} Cy - Circle center Y.
 * @param {number} radius - Circle radius.
 * @returns {Intersection | null}
 */
export function intersectRayCircleDetailed(Ox, Oy, Dx, Dy, Cx, Cy, radius) {
    const dx = Ox - Cx;
    const dy = Oy - Cy;
    const b = 2 * (dx * Dx + dy * Dy);
    const c = dx * dx + dy * dy - radius * radius;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / 2;
    if (t <= 0.05) {
        t = (-b + sqrtDisc) / 2;
    }
    if (t <= 0.05) return null;

    const hitX = Ox + t * Dx;
    const hitY = Oy + t * Dy;
    const nx = (hitX - Cx) / radius;
    const ny = (hitY - Cy) / radius;

    return {
        t,
        x: hitX,
        y: hitY,
        nx,
        ny
    };
}

/**
 * Computes Snell's refraction unit vector in 2D.
 * @param {number} dx Incident ray direction X (normalized).
 * @param {number} dy Incident ray direction Y (normalized).
 * @param {number} nx Surface normal X (normalized).
 * @param {number} ny Surface normal Y (normalized).
 * @param {number} eta Ratio of refractive indices (etaI / etaT).
 * @returns {{ x: number, y: number } | null} Refracted direction or null if total internal reflection.
 */
export function refract2D(dx, dy, nx, ny, eta) {
    const cosTheta = Math.min(-(dx * nx + dy * ny), 1.0);
    const sinThetaSq = eta * eta * Math.max(0, 1.0 - cosTheta * cosTheta);
    if (sinThetaSq >= 1.0) return null;
    const cosThetaT = Math.sqrt(Math.max(0, 1.0 - sinThetaSq));
    const rx = eta * dx + (eta * cosTheta - cosThetaT) * nx;
    const ry = eta * dy + (eta * cosTheta - cosThetaT) * ny;
    const len = Math.hypot(rx, ry) || 1;
    return { x: rx / len, y: ry / len };
}

/**
 * Exact unpolarized Fresnel reflectance for dielectric boundary (Whitted 1980).
 * @param {number} cosTheta Cosine of angle of incidence.
 * @param {number} eta Ratio of refractive indices (etaI / etaT).
 * @returns {number} Reflectance factor R in [0, 1].
 */
export function dielectricReflectance(cosTheta, eta) {
    const sinThetaTSq = eta * eta * Math.max(0, 1.0 - cosTheta * cosTheta);
    if (sinThetaTSq >= 1.0) return 1.0;
    const cosThetaT = Math.sqrt(Math.max(0, 1.0 - sinThetaTSq));
    const rParl = (eta * cosTheta - cosThetaT) / (eta * cosTheta + cosThetaT);
    const rPerp = (cosTheta - eta * cosThetaT) / (cosTheta + eta * cosThetaT);
    return Math.min(1.0, Math.max(0.0, 0.5 * (rParl * rParl + rPerp * rPerp)));
}

/**
 * Build 4 rectangle boundary segments from a center-line barrier [p1, p2] with width/thickness.
 * @param {Point2D} p1
 * @param {Point2D} p2
 * @param {number} width
 * @returns {{ p1: Point2D, p2: Point2D, nx: number, ny: number }[]}
 */
export function buildRectangleEdges(p1, p2, width) {
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy) || 1;
    const ux = vx / len;
    const uy = vy / len;

    const halfW = (width || 16) / 2;
    const px = -uy * halfW;
    const py = ux * halfW;

    const c1 = { x: p1.x + px, y: p1.y + py };
    const c2 = { x: p2.x + px, y: p2.y + py };
    const c3 = { x: p2.x - px, y: p2.y - py };
    const c4 = { x: p1.x - px, y: p1.y - py };

    return [
        { p1: c1, p2: c2, nx: -uy, ny: ux },
        { p1: c2, p2: c3, nx: ux, ny: uy },
        { p1: c3, p2: c4, nx: uy, ny: -ux },
        { p1: c4, p2: c1, nx: -ux, ny: -uy }
    ];
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
   RENDER PIPELINE (BACKWARD RAY TRACING)
   ========================================================================== */

/** Main Ray Tracing and Scene Drawing function */
export function render() {
    const w = canvasWrapper.clientWidth;
    const h = canvasWrapper.clientHeight;
    if (!w || !h) return;

    // Convert bottom-based Y (0 at bottom, h at top) to canvas context Y (0 at top, h at bottom)
    /** @param {number} yVal */
    const toY = (yVal) => h - yVal;

    ctx.clearRect(0, 0, w, h);

    const numPixels = Math.max(1, isNaN(parseInt(inputPixels.value, 10)) ? DEFAULT_CAMERA_PIXELS : parseInt(inputPixels.value, 10));
    const isAntialiasingOn = checkAntialiasing ? checkAntialiasing.checked : DEFAULT_ANTIALIASING;
    const maxBounces = isNaN(parseInt(inputBounces.value, 10)) ? DEFAULT_MAX_BOUNCES : Math.max(0, parseInt(inputBounces.value, 10));
    const showShadowRays = checkShadowRays ? checkShadowRays.checked : DEFAULT_SHADOW_RAYS;
    const isAmbientActive = checkAmbient ? checkAmbient.checked : DEFAULT_AMBIENT_ON;
    const ambientLight = isAmbientActive ? ambientColorRGB : [0, 0, 0];

    const maxSubdivsRaw = inputMaxAaSubdivisions ? inputMaxAaSubdivisions.value.trim() : '';
    const maxAntialiasingSubdivisions = maxSubdivsRaw !== '' ? parseInt(maxSubdivsRaw, 10) : null;
    const adaptiveTolerance = 0.1;

    // Ray-Tracer Camera Parameterization:
    // Eye point E = camera.eye
    // Viewport center and LookAt point are the SAME point: L = camera.lookat
    // Forward view direction D = normalize(L - E)
    // Perpendicular vector U = (-Dy, Dx)
    let rawDx = camera.lookat.x - camera.eye.x;
    let rawDy = camera.lookat.y - camera.eye.y;
    let distToViewport = Math.hypot(rawDx, rawDy);
    if (distToViewport < 1e-4) {
        rawDx = -1;
        rawDy = 0;
        distToViewport = 1;
    }
    const dirX = rawDx / distToViewport;
    const dirY = rawDy / distToViewport;

    const upX = -dirY;
    const upY = dirX;

    camera.dir = { x: dirX, y: dirY };
    camera.up = { x: upX, y: upY };

    const fovDeg = inputFov && !isNaN(parseFloat(inputFov.value)) ? Math.min(140, Math.max(10, parseFloat(inputFov.value))) : DEFAULT_FOV_DEG;
    const fovRad = (fovDeg * Math.PI) / 180;
    const calcVpWidth = 2 * distToViewport * Math.tan(fovRad / 2);
    camera.viewportWidth = Math.max(20, Math.min(800, calcVpWidth));

    const halfW = camera.viewportWidth / 2;

    const vpCenter = {
        x: camera.lookat.x,
        y: camera.lookat.y
    };

    const vpP1 = {
        x: vpCenter.x - halfW * upX,
        y: vpCenter.y - halfW * upY
    };
    const vpP2 = {
        x: vpCenter.x + halfW * upX,
        y: vpCenter.y + halfW * upY
    };
    camera.viewportP1 = vpP1;
    camera.viewportP2 = vpP2;

    const handleOffset = Math.min(22, distToViewport * 0.3);
    const handlePos = {
        x: vpCenter.x - dirX * handleOffset,
        y: vpCenter.y - dirY * handleOffset
    };
    camera.handlePos = handlePos;

    // Scene Geometries: Outer walls + User barriers (ALL barriers required to have Material)
    /** @type {SceneSegment[]} */
    const segments = [];

    segments.push({ p1: { x: 0, y: 0 }, p2: { x: w, y: 0 }, type: 'wall', geomType: 'segment' });
    segments.push({ p1: { x: w, y: 0 }, p2: { x: w, y: h }, type: 'wall', geomType: 'segment' });
    segments.push({ p1: { x: w, y: h }, p2: { x: 0, y: h }, type: 'wall', geomType: 'segment' });
    segments.push({ p1: { x: 0, y: h }, p2: { x: 0, y: 0 }, type: 'wall', geomType: 'segment' });

    barriers.forEach((b, bIdx) => {
        if (!b.material || !(b.material instanceof Material)) {
            b.material = new Material(b.material || {});
        }

        if (b.shape === 'sphere') {
            const radius = b.radius !== undefined ? b.radius : 30;
            segments.push({
                p1: b.p1,
                p2: b.p1,
                type: 'barrier',
                geomType: 'circle',
                center: b.p1,
                radius,
                material: b.material,
                shape: 'sphere',
                barrierIndex: bIdx
            });
        } else {
            const p2 = b.p2 || { x: b.p1.x + 40, y: b.p1.y };
            const width = b.width !== undefined ? b.width : 16;
            const edges = buildRectangleEdges(b.p1, p2, width);
            edges.forEach((edge) => {
                segments.push({
                    p1: edge.p1,
                    p2: edge.p2,
                    type: 'barrier',
                    geomType: 'segment',
                    material: b.material,
                    shape: 'rectangle',
                    barrierIndex: bIdx
                });
            });
        }
    });

    const stats = { raysTraced: 0, shadowRaysCast: 0, shadowRaysReached: 0 };

    /**
     * Function to test ray intersection against all scene obstacles and lights.
     * @param {number} ox
     * @param {number} oy
     * @param {number} dx
     * @param {number} dy
     * @param {SceneSegment | null} [ignoreSeg]
     * @param {boolean} [includeLights=true]
     * @returns {{ hit: Intersection, seg: SceneSegment } | null}
     */
    const findClosestIntersection = (ox, oy, dx, dy, ignoreSeg = null, includeLights = true) => {
        /** @type {Intersection | null} */
        let closestHit = null;
        /** @type {SceneSegment | null} */
        let hitSeg = null;

        if (includeLights) {
            for (let lIdx = 0; lIdx < lights.length; lIdx++) {
                const l = lights[lIdx];
                const lHit = intersectRayCircleDetailed(ox, oy, dx, dy, l.x, l.y, l.radius);
                if (lHit && (!closestHit || lHit.t < closestHit.t)) {
                    closestHit = lHit;
                    hitSeg = {
                        p1: { x: l.x, y: l.y },
                        p2: { x: l.x, y: l.y },
                        type: 'light',
                        geomType: 'circle',
                        center: { x: l.x, y: l.y },
                        radius: l.radius,
                        lightId: l.id,
                        lightColorRGB: l.colorRGB
                    };
                }
            }
        }

        for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            if (ignoreSeg && seg === ignoreSeg) {
                // Do not skip circles: a ray traversing inside a sphere must be able to hit the opposite boundary!
                if (seg.geomType !== 'circle') continue;
            }

            if (seg.geomType === 'circle' && seg.center && seg.radius !== undefined) {
                const cHit = intersectRayCircleDetailed(ox, oy, dx, dy, seg.center.x, seg.center.y, seg.radius);
                if (cHit && (!closestHit || cHit.t < closestHit.t)) {
                    closestHit = cHit;
                    hitSeg = seg;
                }
            } else {
                const sHit = intersectRaySegment(ox, oy, dx, dy, seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
                if (sHit && (!closestHit || sHit.t < closestHit.t)) {
                    const vx = sHit.Vx || (seg.p2.x - seg.p1.x);
                    const vy = sHit.Vy || (seg.p2.y - seg.p1.y);
                    const segLen = Math.hypot(vx, vy) || 1;
                    sHit.nx = -vy / segLen;
                    sHit.ny = vx / segLen;
                    closestHit = sHit;
                    hitSeg = seg;
                }
            }
        }

        if (closestHit && hitSeg) {
            return { hit: closestHit, seg: hitSeg };
        }
        return null;
    };

    /**
     * Casts a Whitted (1980) shadow feeler ray toward a point light in 2D.
     * @param {number} startX
     * @param {number} startY
     * @param {LightSource} lightTarget
     * @param {SceneSegment} fromSeg
     * @param {number} nx Surface normal X.
     * @param {number} ny Surface normal Y.
     * @returns {{ inShadow: boolean, transmission: number, shadowHitPoint: {x: number, y: number} | null, transparentHits: {x: number, y: number}[] }}
     */
    const castShadowFeeler2D = (startX, startY, lightTarget, fromSeg, nx, ny) => {
        // Offset ray origin along normal to avoid self-intersection acne
        let curOx = startX + nx * 0.05;
        let curOy = startY + ny * 0.05;
        let transmission = 1.0;
        let ignoreCurrent = fromSeg;
        /** @type {{x: number, y: number}[]} */
        const transparentHits = [];

        for (let pass = 0; pass < 8; pass++) {
            const toLx = lightTarget.x - curOx;
            const toLy = lightTarget.y - curOy;
            const distL = Math.hypot(toLx, toLy) || 1;
            const lDirX = toLx / distL;
            const lDirY = toLy / distL;

            const probe = findClosestIntersection(
                curOx,
                curOy,
                lDirX,
                lDirY,
                ignoreCurrent,
                false
            );

            if (!probe || probe.hit.t >= distL - 0.5) {
                return {
                    inShadow: false,
                    transmission,
                    shadowHitPoint: null,
                    transparentHits
                };
            }

            const trans = probe.seg.material ? probe.seg.material.transparency : 0;
            if (trans > 0.001) {
                transparentHits.push({ x: probe.hit.x, y: probe.hit.y });
                transmission *= trans;
                curOx = probe.hit.x + lDirX * 0.05;
                curOy = probe.hit.y + lDirY * 0.05;
                ignoreCurrent = probe.seg;
                if (transmission < 0.01) {
                    return { inShadow: true, transmission: 0, shadowHitPoint: { x: probe.hit.x, y: probe.hit.y }, transparentHits };
                }
            } else {
                return {
                    inShadow: true,
                    transmission: 0,
                    shadowHitPoint: { x: probe.hit.x, y: probe.hit.y },
                    transparentHits
                };
            }
        }

        return { inShadow: true, transmission: 0, shadowHitPoint: { x: curOx, y: curOy }, transparentHits };
    };

    /**
     * Traces a Whitted ray and evaluates radiance according to Whitted's illumination model:
     * 
     *     I = I_a + sum_j [ k_d (N . L_j) + k_s (N . H_j)^n ] + k_s * S + k_t * T
     * 
     * @param {number} ox Ray start X.
     * @param {number} oy Ray start Y.
     * @param {number} dx Ray direction X (unit length).
     * @param {number} dy Ray direction Y (unit length).
     * @param {number} depth Remaining bounce recursion depth.
     * @param {number} weight Ray energy throughput weight.
     * @param {boolean} isRefraction Whether this segment represents a refracted ray.
     * @param {SceneSegment | null} [ignoreSeg] Segment to ignore for self-intersection avoidance.
     * @param {RayPathSegment[] | null} [currentPath] Traced segment list for visualization.
     * @returns {ColorRGB} Resulting radiance [r, g, b].
     */
    const traceWhittedRay = (ox, oy, dx, dy, depth, weight = 1.0, isRefraction = false, ignoreSeg = null, currentPath = null) => {
        const found = findClosestIntersection(ox, oy, dx, dy, ignoreSeg, true);

        if (found) {
            const { hit, seg } = found;
            const hitX = hit.x;
            const hitY = hit.y;

            // Direct hit on light bulb
            if (seg.type === 'light') {
                if (currentPath) {
                    currentPath.push({
                        from: { x: ox, y: oy },
                        to: { x: hitX, y: hitY },
                        type: 'light',
                        colorRGB: seg.lightColorRGB || [1, 1, 1],
                        lightId: seg.lightId,
                        weight,
                        isRefraction
                    });
                }
                return seg.lightColorRGB || [1, 1, 1];
            }

            // Hit on barrier object (ALL objects required to have Material)
            if (seg.type === 'barrier' && seg.material) {
                const mat = seg.material;
                let nx = hit.nx;
                let ny = hit.ny;
                let frontFace = true;
                if (dx * nx + dy * ny > 0) {
                    nx = -nx;
                    ny = -ny;
                    frontFace = false;
                }

                // ================================================================
                // Whitted's Illumination Model (Turner Whitted 1980):
                // I = I_a + sum_j [ k_d (N . L_j) + k_s (N . H_j)^n ] + k_s * S + k_t * T
                // ================================================================

                // ----------------------------------------------------------------
                // Term 1: I_a (Ambient Term)
                // I_a = k_a * I_ambient
                // Constant baseline ambient illumination across the scene.
                // ----------------------------------------------------------------
                const I_a = [
                    mat.ambient[0] * ambientLight[0],
                    mat.ambient[1] * ambientLight[1],
                    mat.ambient[2] * ambientLight[2]
                ];

                // ----------------------------------------------------------------
                // Term 2: Local Illumination from Point Light Sources (with Shadow Rays)
                // Diffuse (Lambert) + Specular Highlight (Phong/Blinn-Phong)
                // Evaluates direct illumination from point light sources.
                // For each light source j, a shadow feeler ray is cast along L_j.
                // If unobstructed (V_j > 0), the diffuse cosine contribution and
                // direct specular highlight are added.
                // ----------------------------------------------------------------
                let sum_diffuse = [0, 0, 0];
                let sum_specular = [0, 0, 0];
                const shadowRays = [];

                // View vector V pointing from hit point back toward the ray origin
                const vx = -dx;
                const vy = -dy;

                if (showShadowRays && lights.length > 0) {
                    for (let lIdx = 0; lIdx < lights.length; lIdx++) {
                        const l = lights[lIdx];
                        const toLightX = l.x - hitX;
                        const toLightY = l.y - hitY;
                        const distToLight = Math.hypot(toLightX, toLightY) || 1;

                        if (distToLight > 0.0001) {
                            const lightDirX = toLightX / distToLight;
                            const lightDirY = toLightY / distToLight;
                            const nDotL = nx * lightDirX + ny * lightDirY;

                            if (nDotL > 0) {
                                stats.shadowRaysCast++;
                                const feeler = castShadowFeeler2D(hitX, hitY, l, seg, nx, ny);
                                shadowRays.push({
                                    light: l,
                                    inShadow: feeler.inShadow,
                                    nDotL,
                                    shadowHitPoint: feeler.shadowHitPoint,
                                    transmission: feeler.transmission,
                                    transparentHits: feeler.transparentHits
                                });

                                if (!feeler.inShadow && feeler.transmission > 0) {
                                    stats.shadowRaysReached++;
                                    const effIntensity = feeler.transmission;

                                    // Diffuse Lambertian component: C_L * V_j * (N . L_j)
                                    sum_diffuse[0] += l.colorRGB[0] * effIntensity * nDotL;
                                    sum_diffuse[1] += l.colorRGB[1] * effIntensity * nDotL;
                                    sum_diffuse[2] += l.colorRGB[2] * effIntensity * nDotL;

                                    // Local Blinn-Phong Specular Highlight from point light source
                                    if (mat.shininess > 0) {
                                        const hx = lightDirX + vx;
                                        const hy = lightDirY + vy;
                                        const hLen = Math.hypot(hx, hy) || 1;
                                        const nDotH = Math.max(0, (nx * hx + ny * hy) / hLen);
                                        if (nDotH > 0) {
                                            const specFactor = Math.pow(nDotH, mat.shininess) * effIntensity;
                                            sum_specular[0] += l.colorRGB[0] * specFactor;
                                            sum_specular[1] += l.colorRGB[1] * specFactor;
                                            sum_specular[2] += l.colorRGB[2] * specFactor;
                                        }
                                    }
                                }
                            } else {
                                shadowRays.push({
                                    light: l,
                                    inShadow: true,
                                    nDotL,
                                    shadowHitPoint: null,
                                    transmission: 0,
                                    transparentHits: []
                                });
                            }
                        }
                    }
                }

                // Diffuse contribution: k_d * sum(N . L_j)
                const kd_sum = [
                    mat.diffuse[0] * sum_diffuse[0],
                    mat.diffuse[1] * sum_diffuse[1],
                    mat.diffuse[2] * sum_diffuse[2]
                ];

                // Direct local specular highlight: k_s * sum(N . H_j)^n
                const ks_sum_local = [
                    mat.specular[0] * sum_specular[0],
                    mat.specular[1] * sum_specular[1],
                    mat.specular[2] * sum_specular[2]
                ];

                // Local Illumination: I_local = I_a + k_d * sum(N . L_j) + k_s * sum(N . H_j)^n
                const I_local = [
                    I_a[0] + kd_sum[0] + ks_sum_local[0],
                    I_a[1] + kd_sum[1] + ks_sum_local[1],
                    I_a[2] + kd_sum[2] + ks_sum_local[2]
                ];

                // ----------------------------------------------------------------
                // Fresnel Reflectance & Dielectric Energy Conservation (Whitted 1980)
                // ----------------------------------------------------------------
                const eta = mat.refractiveIndex;
                const refractionRatio = frontFace ? (1.0 / eta) : eta;
                const cosTheta = Math.min(-(dx * nx + dy * ny), 1.0);
                const sinThetaSq = refractionRatio * refractionRatio * Math.max(0, 1.0 - (cosTheta * cosTheta));
                const isTIR = (sinThetaSq >= 1.0);

                let R_fresnel = 1.0;
                if (!isTIR && mat.transparency > 0.0001) {
                    R_fresnel = dielectricReflectance(cosTheta, refractionRatio);
                }

                // Reflection strength: base reflectivity plus Fresnel reflection for dielectric media
                const effReflectivity = Math.min(1.0, mat.reflectivity + (mat.transparency > 0 ? mat.transparency * R_fresnel : 0));
                // Transmission strength: remaining energy after Fresnel reflection
                const effTransparency = isTIR ? 0 : mat.transparency * (1.0 - R_fresnel);

                // ----------------------------------------------------------------
                // Term 3: k_s * S (Specular Mirror Reflection Term)
                // S is the incoming radiance from the mirror reflection direction R.
                // Casts a recursive secondary ray along R = V - 2 * (V . N) * N.
                // ----------------------------------------------------------------
                let ks_S = [0, 0, 0];
                const specCoeff = (mat.specular[0] > 0 || mat.specular[1] > 0 || mat.specular[2] > 0)
                    ? mat.specular
                    : [1.0, 1.0, 1.0];

                const ks = [
                    Math.min(1.0, specCoeff[0] * mat.reflectivity + (mat.transparency > 0 ? mat.transparency * R_fresnel : 0)),
                    Math.min(1.0, specCoeff[1] * mat.reflectivity + (mat.transparency > 0 ? mat.transparency * R_fresnel : 0)),
                    Math.min(1.0, specCoeff[2] * mat.reflectivity + (mat.transparency > 0 ? mat.transparency * R_fresnel : 0))
                ];

                const hasSpecular = (effReflectivity > 0.0001);

                if (hasSpecular && depth > 0) {
                    const dDotN = dx * nx + dy * ny;
                    const reflDx = dx - 2 * dDotN * nx;
                    const reflDy = dy - 2 * dDotN * ny;
                    // Offset ray origin along surface normal (facing outward from surface)
                    const reflOx = hitX + nx * 0.05;
                    const reflOy = hitY + ny * 0.05;

                    const S = traceWhittedRay(reflOx, reflOy, reflDx, reflDy, depth - 1, weight * effReflectivity, false, seg, currentPath);
                    ks_S = [
                        ks[0] * S[0],
                        ks[1] * S[1],
                        ks[2] * S[2]
                    ];
                }

                // ----------------------------------------------------------------
                // Term 4: k_t * T (Transmission / Refraction Term)
                // T is the incoming radiance from the refraction direction computed via Snell's Law.
                // Automatically accounts for Total Internal Reflection (TIR) via Fresnel R=1.
                // ----------------------------------------------------------------
                let kt_T = [0, 0, 0];

                if (effTransparency > 0.0001 && depth > 0 && !isTIR) {
                    const refrDir = refract2D(dx, dy, nx, ny, refractionRatio);
                    if (refrDir) {
                        // Offset ray origin into the medium (opposite to surface normal)
                        const refrOx = hitX - nx * 0.05;
                        const refrOy = hitY - ny * 0.05;
                        const T = traceWhittedRay(refrOx, refrOy, refrDir.x, refrDir.y, depth - 1, weight * effTransparency, true, seg, currentPath);
                        kt_T = [
                            effTransparency * T[0],
                            effTransparency * T[1],
                            effTransparency * T[2]
                        ];
                    }
                }

                // Non-Local (Recursive) Illumination: I_non_local = k_s * S + k_t * T
                const I_non_local = [
                    ks_S[0] + kt_T[0],
                    ks_S[1] + kt_T[1],
                    ks_S[2] + kt_T[2]
                ];

                // Total Radiance: I = clamp(I_local + I_non_local)
                const I = [
                    Math.min(1.0, Math.max(0, I_local[0] + I_non_local[0])),
                    Math.min(1.0, Math.max(0, I_local[1] + I_non_local[1])),
                    Math.min(1.0, Math.max(0, I_local[2] + I_non_local[2]))
                ];

                if (currentPath) {
                    currentPath.push({
                        from: { x: ox, y: oy },
                        to: { x: hitX, y: hitY },
                        type: 'barrier',
                        material: mat,
                        colorRGB: mat.diffuse,
                        barrierIndex: seg.barrierIndex,
                        nx,
                        ny,
                        shadowRays,
                        weight,
                        isRefraction
                    });
                }

                return /** @type {ColorRGB} */ (I);
            }
        }

        // --------------------------------------------------------------------
        // NO-HIT Color
        // --------------------------------------------------------------------
        // If the ray did not hit any object in the scene, return the no-hit color.
        // This is explicitly left here at the end so it does not cause confusion
        // as to whether it is part of Whitted's illumination model or not.
        // (It is the no-hit color, returned solely because the ray hit nothing in the void;
        // this color is NOT part of Whitted's illumination model.)
        const noHitColor = /** @type {ColorRGB} */ ([noLightColorRGB[0], noLightColorRGB[1], noLightColorRGB[2]]);

        if (currentPath) {
            currentPath.push({
                from: { x: ox, y: oy },
                to: { x: ox + dx * 2000, y: oy + dy * 2000 },
                type: 'miss',
                colorRGB: noHitColor,
                weight,
                isRefraction
            });
        }

        return noHitColor;
    };

    /** @type {PixelInfo[]} */
    const pixelColors = [];
    /** @type {RayPathSegment[][][]} */
    const pixelPaths = Array.from({ length: numPixels }, () => []);

    // Whitted (1980) 4-corner adaptive subdivision antialiasing along 1D sensor
    for (let p = 0; p < numPixels; p++) {
        const u0 = p / numPixels;
        const u1 = (p + 1) / numPixels;
        /** @type {RayPathSegment[][]} */
        const allPathsForPixel = [];

        /**
         * @param {number} u
         * @returns {ColorRGB}
         */
        const sampleRay = (u) => {
            stats.raysTraced++;
            const pixelX = vpP1.x + u * (vpP2.x - vpP1.x);
            const pixelY = vpP1.y + u * (vpP2.y - vpP1.y);

            const tDx = pixelX - camera.eye.x;
            const tDy = pixelY - camera.eye.y;
            const tLen = Math.hypot(tDx, tDy) || 1;
            const rayDx = tDx / tLen;
            const rayDy = tDy / tLen;

            /** @type {RayPathSegment[]} */
            const curPath = [];
            const col = traceWhittedRay(camera.eye.x, camera.eye.y, rayDx, rayDy, maxBounces, 1.0, false, null, curPath);
            allPathsForPixel.push(curPath);
            return col;
        };

        let finalColor;
        if (!isAntialiasingOn) {
            // No antialiasing: cast a single ray through the pixel center
            const uCenter = (p + 0.5) / numPixels;
            finalColor = sampleRay(uCenter);
        } else {
            /**
             * @param {number} uA
             * @param {number} uB
             * @param {ColorRGB} colA
             * @param {ColorRGB} colB
             * @param {number} level
             * @returns {ColorRGB}
             */
            const evaluateSubdivision = (uA, uB, colA, colB, level) => {
                const contrast = Math.max(
                    Math.abs(colA[0] - colB[0]),
                    Math.abs(colA[1] - colB[1]),
                    Math.abs(colA[2] - colB[2])
                );

                // ----------------------------------------------------------------
                // Stopping Criteria:
                // 1. Whitted's original criterion: Contrast between samples is below adaptiveTolerance.
                // 2. Max Antialiasing Subdivisions:
                // NOTE: Limiting subdivisions to a maximum depth is a computational control;
                // it is NOT part of Turner Whitted's normal 1980 antialiasing method, which only tested contrast.
                // ----------------------------------------------------------------
                const reachedMax = (maxAntialiasingSubdivisions !== null && maxAntialiasingSubdivisions !== undefined)
                    ? (level >= maxAntialiasingSubdivisions)
                    : false;

                const reachedSafeguard = (maxAntialiasingSubdivisions === null || maxAntialiasingSubdivisions === undefined) && (level >= 8);

                if (contrast < adaptiveTolerance || reachedMax || reachedSafeguard) {
                    return [
                        (colA[0] + colB[0]) * 0.5,
                        (colA[1] + colB[1]) * 0.5,
                        (colA[2] + colB[2]) * 0.5
                    ];
                }

                const uMid = (uA + uB) * 0.5;
                const colMid = sampleRay(uMid);

                const leftCol = evaluateSubdivision(uA, uMid, colA, colMid, level + 1);
                const rightCol = evaluateSubdivision(uMid, uB, colMid, colB, level + 1);

                return [
                    (leftCol[0] + rightCol[0]) * 0.5,
                    (leftCol[1] + rightCol[1]) * 0.5,
                    (leftCol[2] + rightCol[2]) * 0.5
                ];
            };

            const c0 = sampleRay(u0);
            const c1 = sampleRay(u1);
            finalColor = evaluateSubdivision(u0, u1, c0, c1, 0);
        }

        pixelColors.push({
            color: finalColor,
            hitCount: (finalColor[0] > 0 || finalColor[1] > 0 || finalColor[2] > 0) ? 1 : 0
        });
        pixelPaths[p] = allPathsForPixel;
    }

    // Draw Traced Rays & Shadow Rays
    for (let p = 0; p < pixelPaths.length; p++) {
        const pathsForPx = pixelPaths[p];
        for (let pathIdx = 0; pathIdx < pathsForPx.length; pathIdx++) {
            const path = pathsForPx[pathIdx];

            // 1. Shadow Rays
            for (let i = 0; i < path.length; i++) {
                const hit = path[i];
                if (hit.shadowRays) {
                    for (let s = 0; s < hit.shadowRays.length; s++) {
                        const sRay = hit.shadowRays[s];
                        if (sRay.nDotL > 0) {
                            if (sRay.inShadow && sRay.shadowHitPoint) {
                                ctx.strokeStyle = 'rgba(231, 76, 60, 0.35)';
                                ctx.setLineDash([2, 4]);
                                ctx.lineWidth = 0.9;
                                ctx.beginPath();
                                ctx.moveTo(hit.to.x, toY(hit.to.y));
                                ctx.lineTo(sRay.shadowHitPoint.x, toY(sRay.shadowHitPoint.y));
                                ctx.stroke();
                                ctx.setLineDash([]);
                            } else if (!sRay.inShadow) {
                                ctx.strokeStyle = colorRGBToString(sRay.light.colorRGB);
                                ctx.setLineDash([3, 4]);
                                ctx.lineWidth = 0.9;
                                ctx.beginPath();
                                ctx.moveTo(hit.to.x, toY(hit.to.y));
                                ctx.lineTo(sRay.light.x, toY(sRay.light.y));
                                ctx.stroke();
                                ctx.setLineDash([]);

                                ctx.fillStyle = colorRGBToString(sRay.light.colorRGB);
                                ctx.beginPath();
                                ctx.arc(hit.to.x, toY(hit.to.y), 2.3, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    }
                }
            }

            // 2. Primary, reflection, and refraction rays
            for (let i = 0; i < path.length; i++) {
                const segHit = path[i];
                if (i === 0) {
                    ctx.strokeStyle = DEFAULT_CAMERA_RAY_COLOR;
                    ctx.lineWidth = 1.0;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = colorRGBToString(segHit.colorRGB || [1, 1, 1]);
                    ctx.lineWidth = 1.2;
                    if (segHit.isRefraction) {
                        ctx.setLineDash([3, 3]);
                    } else {
                        ctx.setLineDash([]);
                    }
                }

                ctx.beginPath();
                ctx.moveTo(segHit.from.x, toY(segHit.from.y));
                ctx.lineTo(segHit.to.x, toY(segHit.to.y));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    // Draw Barriers (Rectangles and Spheres) and interactive handles
    barriers.forEach((b, bIdx) => {
        ctx.save();
        const mat = b.material;
        const diffuseStr = colorRGBToString(mat.diffuse);
        ctx.fillStyle = diffuseStr;
        ctx.strokeStyle = varColor('--badger-red', '#C5050C');
        ctx.lineWidth = 2;

        if (b.shape === 'sphere') {
            const r = b.radius !== undefined ? b.radius : 30;
            ctx.beginPath();
            ctx.arc(b.p1.x, toY(b.p1.y), r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            const isCircHovered = hoveredItem && 'barrierIndex' in hoveredItem && hoveredItem.barrierIndex === bIdx;
            if (isCircHovered) {
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }

            // Center move handle
            ctx.fillStyle = isCircHovered ? '#3498db' : '#ffffff';
            ctx.beginPath();
            ctx.arc(b.p1.x, toY(b.p1.y), 3.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const p2 = b.p2 || { x: b.p1.x + 40, y: b.p1.y };
            const width = b.width !== undefined ? b.width : 16;
            const edges = buildRectangleEdges(b.p1, p2, width);

            ctx.beginPath();
            ctx.moveTo(edges[0].p1.x, toY(edges[0].p1.y));
            for (let eIdx = 0; eIdx < edges.length; eIdx++) {
                ctx.lineTo(edges[eIdx].p2.x, toY(edges[eIdx].p2.y));
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Centerline guide
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(b.p1.x, toY(b.p1.y));
            ctx.lineTo(p2.x, toY(p2.y));
            ctx.stroke();
            ctx.setLineDash([]);

            // Endpoint handles
            const isP1Hovered = hoveredItem && hoveredItem.type === 'barrierEndpoint' && hoveredItem.barrierIndex === bIdx && hoveredItem.endpoint === 'p1';
            const isP2Hovered = hoveredItem && hoveredItem.type === 'barrierEndpoint' && hoveredItem.barrierIndex === bIdx && hoveredItem.endpoint === 'p2';

            ctx.fillStyle = isP1Hovered ? '#3498db' : '#ffffff';
            ctx.beginPath();
            ctx.arc(b.p1.x, toY(b.p1.y), 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isP2Hovered ? '#3498db' : '#ffffff';
            ctx.beginPath();
            ctx.arc(p2.x, toY(p2.y), 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });

    // Temporary Preview of Barrier Currently Being Drawn
    if (drawingBarrier && dragStart && dragCurrent) {
        ctx.save();
        ctx.strokeStyle = currentMatDiffuseHex;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        const curShape = selectShape ? selectShape.value : 'rectangle';
        if (curShape === 'sphere') {
            const r = Math.round(Math.hypot(dragCurrent.x - dragStart.x, dragCurrent.y - dragStart.y));
            ctx.beginPath();
            ctx.arc(dragStart.x, toY(dragStart.y), r, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            const curWidth = inputBarrierWidth ? Math.max(2, parseFloat(inputBarrierWidth.value) || 16) : 16;
            const previewEdges = buildRectangleEdges(dragStart, dragCurrent, curWidth);
            ctx.beginPath();
            ctx.moveTo(previewEdges[0].p1.x, toY(previewEdges[0].p1.y));
            for (let eIdx = 0; eIdx < previewEdges.length; eIdx++) {
                ctx.lineTo(previewEdges[eIdx].p2.x, toY(previewEdges[eIdx].p2.y));
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.restore();
    }

    // Draw Ray-Tracer Camera Setup: Eye, View Frustum, Viewport Pixels, and LookAt Target
    ctx.save();

    // 1) View Frustum Guide Lines
    ctx.strokeStyle = 'rgba(225, 229, 231, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(camera.eye.x, toY(camera.eye.y));
    ctx.lineTo(vpP1.x, toY(vpP1.y));
    ctx.moveTo(camera.eye.x, toY(camera.eye.y));
    ctx.lineTo(vpP2.x, toY(vpP2.y));
    ctx.stroke();

    // 2) Optical Axis Line
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(camera.eye.x, toY(camera.eye.y));
    ctx.lineTo(camera.lookat.x, toY(camera.lookat.y));
    ctx.stroke();
    ctx.setLineDash([]);

    // 3) Viewport Pixels Line (Sensor)
    const segVx = (vpP2.x - vpP1.x) / numPixels;
    const segVy = (vpP2.y - vpP1.y) / numPixels;

    for (let p = 0; p < numPixels; p++) {
        const px1 = vpP1.x + p * segVx;
        const py1 = vpP1.y + p * segVy;
        const px2 = px1 + segVx;
        const py2 = py1 + segVy;

        const pCol = pixelColors[p].color;
        ctx.strokeStyle = colorRGBToString(pCol);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px1, toY(py1));
        ctx.lineTo(px2, toY(py2));
        ctx.stroke();
    }

    // Viewport Frame Border
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpP1.x - upX * 4, toY(vpP1.y - upY * 4));
    ctx.lineTo(vpP1.x, toY(vpP1.y));
    ctx.moveTo(vpP2.x, toY(vpP2.y));
    ctx.lineTo(vpP2.x + upX * 4, toY(vpP2.y + upY * 4));
    ctx.stroke();

    // 4) Viewport Move Handle & LookAt Target Point
    const isVpHovered = (hoveredItem && hoveredItem.type === 'viewport') ||
                        (draggingItem && draggingItem.type === 'viewport');

    ctx.strokeStyle = isVpHovered ? '#3498db' : 'rgba(127, 140, 141, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(handlePos.x, toY(handlePos.y));
    ctx.lineTo(vpCenter.x, toY(vpCenter.y));
    ctx.stroke();

    const handleRadius = isVpHovered ? 7.5 : 6;
    ctx.fillStyle = isVpHovered ? '#3498db' : '#2c3e50';
    ctx.beginPath();
    ctx.arc(handlePos.x, toY(handlePos.y), handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isVpHovered ? '#ffffff' : '#bdc3c7';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isVpHovered ? '#ffffff' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(handlePos.x, toY(handlePos.y), 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(225, 229, 231, 0.85)';
    ctx.font = '600 11px ui-monospace, Consolas, sans-serif';
    ctx.fillText('Viewport (LookAt)', (vpP2.x + upX * 6) + 7, toY((vpP2.y + upY * 6) - 7));

    // 5) Eye Point
    const isEyeHovered = (hoveredItem && hoveredItem.type === 'eye') ||
                         (draggingItem && draggingItem.type === 'eye');
    const eyeRadius = isEyeHovered ? 11 : 9;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(camera.eye.x, toY(camera.eye.y), eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = varColor('--badger-red', '#C5050C');
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#111116';
    ctx.beginPath();
    ctx.arc(camera.eye.x + dirX * 3, toY(camera.eye.y + dirY * 3), eyeRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px ui-monospace, Consolas, sans-serif';
    ctx.fillText('Eye', camera.eye.x - 12, toY(camera.eye.y) + eyeRadius + 15);
    ctx.restore();

    // Draw Light Sources
    for (let lIdx = 0; lIdx < lights.length; lIdx++) {
        const l = lights[lIdx];
        ctx.save();
        const ly = toY(l.y);
        const glowGrad = ctx.createRadialGradient(l.x, ly, 2, l.x, ly, 30);
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        glowGrad.addColorStop(0.35, colorRGBToString(l.colorRGB));
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(l.x, ly, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(l.x, ly, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colorRGBToString(l.colorRGB);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Pre-generate mathematical lighting equations for hover popup
    pixelMathData = [];
    for (let p = 0; p < numPixels; p++) {
        pixelMathData.push(
            buildPixelMathEquation(p, pixelColors[p].color, pixelPaths[p])
        );
    }

    // Update 1D Sensor Bar DOM
    updateSensorStrip(pixelColors);

    // Update stats
    const hitPixelsCount = pixelColors.filter((p) => p.hitCount > 0).length;
    statHits.textContent = String(stats.shadowRaysReached);
    statTotal.textContent = String(stats.raysTraced);
    const pct = stats.raysTraced > 0 ? ((stats.shadowRaysReached / stats.raysTraced) * 100).toFixed(1) : '0.0';
    statPercent.textContent = `${pct}%`;

    if (statPixelsHit && statTotalPixels && statPixelsPercent) {
        statPixelsHit.textContent = String(hitPixelsCount);
        statTotalPixels.textContent = String(numPixels);
        const pxPct = ((hitPixelsCount / numPixels) * 100).toFixed(1);
        statPixelsPercent.textContent = `${pxPct}%`;
    }
}

/**
 * Systematically builds the mathematical lighting equation and variable breakdown for a pixel.
 * Uses Whitted's illumination model:
 * 
 *     I = I_a + k_d * sum(N . L_j) + k_s * S + k_t * T
 * 
 * @param {number} pixelIndex - 0-based pixel index
 * @param {ColorRGB} finalColor - Computed RGB color
 * @param {RayPathSegment[][]} samplePaths - Traced ray paths for this pixel
 * @returns {PixelMathData}
 */
function buildPixelMathEquation(pixelIndex, finalColor, samplePaths) {
    if (!samplePaths || samplePaths.length === 0) {
        return {
            pixelIndex,
            finalColor: [0, 0, 0],
            variables: [
                { name: 'C_void', desc: 'Background / unlit void', colorRGB: noLightColorRGB }
            ],
            equation: 'I = C_void = (0, 0, 0)',
            evaluation: 'Ray did not intersect any scene geometry.'
        };
    }

    const primaryPath = samplePaths[0] || [];
    if (primaryPath.length === 0) {
        return {
            pixelIndex,
            finalColor: [0, 0, 0],
            variables: [
                { name: 'C_void', desc: 'Background / unlit void', colorRGB: noLightColorRGB }
            ],
            equation: 'I = C_void = (0, 0, 0)',
            evaluation: 'Ray did not intersect any scene geometry.'
        };
    }

    /** @type {Map<string, PixelMathVariable>} */
    const varMap = new Map();

    /**
     * @param {string} id
     * @param {string} name
     * @param {string} desc
     * @param {ColorRGB} [colorRGB]
     * @param {string} [value]
     */
    function registerVar(id, name, desc, colorRGB, value) {
        if (!varMap.has(id)) {
            varMap.set(id, { name, desc, colorRGB, value });
        }
    }

    // Register lights in scene
    lights.forEach((l) => {
        const lName = lights.length > 1 ? `C_L${l.id}` : 'C_L';
        registerVar(`L_${l.id}`, lName, `Light ${l.id} emission`, l.colorRGB);
    });

    // Register barriers encountered along path
    primaryPath.forEach((hit) => {
        if (hit.type === 'barrier' && hit.material) {
            const bIdx = (hit.barrierIndex !== undefined ? hit.barrierIndex : 0) + 1;
            registerVar(`B_${bIdx}_kd`, `k_d${bIdx}`, `Barrier ${bIdx} diffuse reflectance`, hit.material.diffuse);
            if (hit.material.shininess > 0) {
                registerVar(`B_${bIdx}_ks_spec`, `k_s${bIdx}`, `Barrier ${bIdx} specular highlight (shininess=${hit.material.shininess})`, hit.material.specular);
            }
            if (hit.material.reflectivity > 0) {
                registerVar(`B_${bIdx}_ks`, `k_s${bIdx}(mirror)`, `Barrier ${bIdx} mirror reflectivity`, hit.material.specular, hit.material.reflectivity.toFixed(2));
            }
            if (hit.material.transparency > 0) {
                registerVar(`B_${bIdx}_kt`, `k_t${bIdx}`, `Barrier ${bIdx} transmission (eta=${hit.material.refractiveIndex})`, undefined, hit.material.transparency.toFixed(2));
            }
        }
    });

    if (isAmbientOn) {
        registerVar('amb', 'I_a', 'Constant ambient baseline', ambientColorRGB);
    }
    registerVar('void', 'C_void', 'Background void / unlit color', noLightColorRGB);

    let equation = '';
    let evaluation = '';

    const firstHit = primaryPath[0];

    if (firstHit.type === 'miss' || firstHit.type === 'wall') {
        equation = 'I = C_void';
        evaluation = `Ray missed all scene objects \u2192 Void = ${colorRGBToString(noLightColorRGB)}`;
    } else if (firstHit.type === 'light') {
        const lName = lights.length > 1 ? `C_L${firstHit.lightId || 1}` : 'C_L';
        equation = `I = ${lName}`;
        evaluation = `Direct line of sight to light bulb = ${colorRGBToString(finalColor)}`;
    } else if (firstHit.type === 'barrier' && firstHit.material) {
        const bIdx = (firstHit.barrierIndex !== undefined ? firstHit.barrierIndex : 0) + 1;
        const mat = firstHit.material;

        // Direct diffuse and specular highlight terms
        /** @type {string[]} */
        const directTermsEq = [];
        if (firstHit.shadowRays) {
            firstHit.shadowRays.forEach((sr) => {
                const lName = lights.length > 1 ? `C_L${sr.light.id}` : 'C_L';
                const vSymbol = sr.inShadow ? '0' : (sr.transmission < 0.99 ? sr.transmission.toFixed(2) : '1');
                const nDotLStr = Math.max(0, sr.nDotL).toFixed(2);
                const specPart = (mat.shininess > 0) ? ` + (k_s${bIdx} \u2299 ${lName}) \u22c5 (N \u22c5 H)^${mat.shininess}` : '';
                directTermsEq.push(`${vSymbol} \u22c5 [ (k_d${bIdx} \u2299 ${lName}) \u22c5 (${nDotLStr})${specPart} ]`);
            });
        }

        const ambTermEq = isAmbientOn ? `(k_a${bIdx} \u2299 I_a)` : '';
        const directStr = directTermsEq.length > 0 ? directTermsEq.join(' + ') : '0';
        const localEq = ambTermEq ? `${ambTermEq} + ${directStr}` : directStr;

        let recursiveEq = '';
        if (mat.reflectivity > 0 || mat.transparency > 0) {
            recursiveEq += ` + (k_s${bIdx} \u22c5 S)`;
        }
        if (mat.transparency > 0) {
            recursiveEq += ` + (k_t${bIdx} \u22c5 T)`;
        }

        equation = `I = ${localEq}${recursiveEq}`;
        evaluation = `I = I_a + k_d \u2211(N \u22c5 L_j) + k_s \u2211(N \u22c5 H_j)^n + k_s S + k_t T = ${colorRGBToString(finalColor)}`;
    }

    return {
        pixelIndex,
        finalColor,
        variables: Array.from(varMap.values()),
        equation,
        evaluation
    };
}

/**
 * Display the stylized math equation popup for a hovered sensor pixel.
 * @param {number} pixelIndex
 * @param {HTMLElement} cell
 */
function showPixelMathPopup(pixelIndex, cell) {
    if (!pixelMathPopup) return;
    const data = pixelMathData[pixelIndex];
    if (!data) return;

    if (mathPopupTitle) mathPopupTitle.textContent = `Pixel #${pixelIndex + 1} Color`;
    const rgbStr = colorRGBToString(data.finalColor);
    if (mathPopupSwatch) mathPopupSwatch.style.backgroundColor = rgbStr;
    if (mathPopupRgbVal) mathPopupRgbVal.textContent = rgbStr;

    if (mathPopupVariables) {
        mathPopupVariables.innerHTML = '';
        data.variables.forEach((v) => {
            const row = document.createElement('div');
            row.className = 'pixel-var-row';

            const tag = document.createElement('span');
            tag.className = 'pixel-var-tag';

            if (v.colorRGB) {
                const swatch = document.createElement('span');
                swatch.className = 'pixel-var-swatch';
                swatch.style.backgroundColor = colorRGBToString(v.colorRGB);
                tag.appendChild(swatch);
            }
            const nameText = document.createTextNode(v.name);
            tag.appendChild(nameText);

            const desc = document.createElement('span');
            desc.className = 'pixel-var-desc';
            const valText = v.value !== undefined ? ` (${v.value})` : (v.colorRGB ? ` (${colorRGBToString(v.colorRGB)})` : '');
            desc.textContent = `: ${v.desc}${valText}`;

            row.appendChild(tag);
            row.appendChild(desc);
            mathPopupVariables.appendChild(row);
        });
    }

    if (mathPopupEquation) mathPopupEquation.textContent = data.equation;
    if (mathPopupEvaluation) mathPopupEvaluation.textContent = data.evaluation;

    pixelMathPopup.style.display = 'flex';

    const cellRect = cell.getBoundingClientRect();
    const popupW = pixelMathPopup.offsetWidth || 480;
    let left = cellRect.left + cellRect.width / 2 - popupW / 2;
    left = Math.max(12, Math.min(window.innerWidth - popupW - 12, left));

    const popupH = pixelMathPopup.offsetHeight || 190;
    let top = cellRect.top - popupH - 10;
    if (top < 10) {
        top = cellRect.bottom + 10;
    }
    pixelMathPopup.style.left = `${left}px`;
    pixelMathPopup.style.top = `${top}px`;
}

/** Hide the stylized pixel math popup */
function hidePixelMathPopup() {
    if (pixelMathPopup) {
        pixelMathPopup.style.display = 'none';
    }
}

let cachedPixelCount = 0;

/**
 * Update 1D Sensor strip DOM with custom math breakdown hover events.
 * @param {PixelInfo[]} pixelColors
 */
function updateSensorStrip(pixelColors) {
    if (cachedPixelCount !== pixelColors.length) {
        sensorStrip.innerHTML = '';
        for (let i = 0; i < pixelColors.length; i++) {
            const cell = document.createElement('div');
            cell.className = 'sensor-pixel-cell';
            cell.id = `sensorPx_${i}`;
            const pxIndex = i;
            cell.addEventListener('mouseenter', () => showPixelMathPopup(pxIndex, cell));
            cell.addEventListener('mousemove', () => showPixelMathPopup(pxIndex, cell));
            cell.addEventListener('mouseleave', () => hidePixelMathPopup());
            sensorStrip.appendChild(cell);
        }
        cachedPixelCount = pixelColors.length;
    }

    for (let i = 0; i < pixelColors.length; i++) {
        const cell = /** @type {HTMLElement} */ (sensorStrip.children[i]);
        if (!cell) continue;
        const item = pixelColors[i];
        const isLit = item.color[0] > 0 || item.color[1] > 0 || item.color[2] > 0;
        cell.removeAttribute('title');
        if (isLit) {
            cell.style.backgroundColor = colorRGBToString(item.color);
        } else {
            cell.style.backgroundColor = '#000000';
        }
    }
}

if (sensorStrip) {
  sensorStrip.addEventListener('mouseleave', hidePixelMathPopup);
}
window.addEventListener('scroll', hidePixelMathPopup);
window.addEventListener('resize', hidePixelMathPopup);

/* ==========================================================================
   INTERACTIONS & EVENT LISTENERS
   ========================================================================== */

/**
 * Item being dragged.
 * @type {{ type: 'light', index: number } |
 *        { type: 'eye' } |
 *        { type: 'lookat' } |
 *        { type: 'viewport' } |
 *        { type: 'barrierEndpoint', barrierIndex: number, endpoint: 'p1' | 'p2' } |
 *        { type: 'circleMove', barrierIndex: number, offsetX: number, offsetY: number } |
 *        { type: 'circleResize', barrierIndex: number } |
 *        null}
 */
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
 * Y coordinate is measured from the bottom of the screen (0 = bottom, h = top).
 * @param {MouseEvent} e
 * @returns {Point2D}
 */
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: rect.bottom - e.clientY
    };
}

// Right Click: Delete Light or Barrier
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = getMousePos(e);

    // 1. Right click on light to delete
    if (lights.length > 0) {
        for (let i = lights.length - 1; i >= 0; i--) {
            const l = lights[i];
            if (Math.hypot(pos.x - l.x, pos.y - l.y) <= l.radius + 10) {
                pushUndo();
                lights.splice(i, 1);
                render();
                return;
            }
        }
    }

    // 2. Right click on barrier to delete
    for (let i = barriers.length - 1; i >= 0; i--) {
        const b = barriers[i];
        if (b.shape === 'sphere') {
            const r = b.radius || 30;
            if (Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y) <= r + 8) {
                pushUndo();
                barriers.splice(i, 1);
                render();
                return;
            }
        } else {
            const p2 = b.p2 || { x: b.p1.x + 40, y: b.p1.y };
            const hitDist = Math.max(10, (b.width || 16) / 2 + 6);
            if (distToSegment(pos.x, pos.y, b.p1.x, b.p1.y, p2.x, p2.y) <= hitDist) {
                pushUndo();
                barriers.splice(i, 1);
                render();
                return;
            }
        }
    }
});

// Left Click: Start drag or start drawing barrier
canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pos = getMousePos(e);

    // 1. Check Light Sources for dragging
    for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        if (Math.hypot(pos.x - l.x, pos.y - l.y) <= l.radius + 10) {
            draggingItem = { type: 'light', index: i };
            dragStartSnapshot = getSnapshot();
            selectedLightColorHex = l.color || DEFAULT_LIGHT_COLOR_HEX;
            selectedLightColorRGB = parseColorRGB(selectedLightColorHex);
            if (lightColorSwatch) lightColorSwatch.style.backgroundColor = selectedLightColorHex;
            return;
        }
    }

    // 2. Check Eye Point
    if (Math.hypot(pos.x - camera.eye.x, pos.y - camera.eye.y) <= 16) {
        draggingItem = { type: 'eye' };
        dragStartSnapshot = getSnapshot();
        canvas.style.cursor = 'grabbing';
        return;
    }

    // 3. Check Viewport Move Handle or LookAt point
    if (camera.handlePos && Math.hypot(pos.x - camera.handlePos.x, pos.y - camera.handlePos.y) <= 16) {
        draggingItem = { type: 'viewport' };
        dragStartSnapshot = getSnapshot();
        canvas.style.cursor = 'grabbing';
        return;
    }
    if (Math.hypot(pos.x - camera.lookat.x, pos.y - camera.lookat.y) <= 16) {
        draggingItem = { type: 'viewport' };
        dragStartSnapshot = getSnapshot();
        canvas.style.cursor = 'grabbing';
        return;
    }
    if (camera.viewportP1 && camera.viewportP2 &&
        distToSegment(pos.x, pos.y, camera.viewportP1.x, camera.viewportP1.y, camera.viewportP2.x, camera.viewportP2.y) <= 10) {
        draggingItem = { type: 'viewport' };
        dragStartSnapshot = getSnapshot();
        canvas.style.cursor = 'grabbing';
        return;
    }

    // 4. Check Barrier Handles & Geometries for dragging
    for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        if (b.shape === 'sphere') {
            const r = b.radius || 30;
            const distFromCenter = Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y);
            // Clicking near the circumference resizes the circle from anywhere around the circumference
            if (Math.abs(distFromCenter - r) <= 8) {
                draggingItem = { type: 'circleResize', barrierIndex: i };
                dragStartSnapshot = getSnapshot();
                canvas.style.cursor = 'crosshair';
                return;
            }
            if (distFromCenter < r - 8 || distFromCenter <= 12) {
                draggingItem = {
                    type: 'circleMove',
                    barrierIndex: i,
                    offsetX: b.p1.x - pos.x,
                    offsetY: b.p1.y - pos.y
                };
                dragStartSnapshot = getSnapshot();
                canvas.style.cursor = 'grabbing';
                return;
            }
        } else {
            if (Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y) <= 14) {
                draggingItem = { type: 'barrierEndpoint', barrierIndex: i, endpoint: 'p1' };
                dragStartSnapshot = getSnapshot();
                canvas.style.cursor = 'grabbing';
                return;
            }
            if (b.p2 && Math.hypot(pos.x - b.p2.x, pos.y - b.p2.y) <= 14) {
                draggingItem = { type: 'barrierEndpoint', barrierIndex: i, endpoint: 'p2' };
                dragStartSnapshot = getSnapshot();
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }

    // Otherwise: Start drawing new barrier
    drawingBarrier = true;
    dragStart = pos;
    dragCurrent = pos;
});

window.addEventListener('mousemove', (e) => {
    const pos = getMousePos(e);

    if (draggingItem) {
        if (draggingItem.type === 'light') {
            const l = lights[draggingItem.index];
            if (l) {
                l.x = Math.max(15, Math.min(canvasWrapper.clientWidth - 15, pos.x));
                l.y = Math.max(15, Math.min(canvasWrapper.clientHeight - 15, pos.y));
                render();
            }
        } else if (draggingItem.type === 'eye') {
            camera.eye.x = Math.max(15, Math.min(canvasWrapper.clientWidth - 15, pos.x));
            camera.eye.y = Math.max(15, Math.min(canvasWrapper.clientHeight - 15, pos.y));
            render();
        } else if (draggingItem.type === 'viewport') {
            camera.lookat.x = Math.max(15, Math.min(canvasWrapper.clientWidth - 15, pos.x));
            camera.lookat.y = Math.max(15, Math.min(canvasWrapper.clientHeight - 15, pos.y));
            render();
        } else if (draggingItem.type === 'circleMove') {
            const b = barriers[draggingItem.barrierIndex];
            if (b) {
                b.p1.x = Math.max(10, Math.min(canvasWrapper.clientWidth - 10, pos.x + draggingItem.offsetX));
                b.p1.y = Math.max(10, Math.min(canvasWrapper.clientHeight - 10, pos.y + draggingItem.offsetY));
                render();
            }
        } else if (draggingItem.type === 'circleResize') {
            const b = barriers[draggingItem.barrierIndex];
            if (b) {
                b.radius = Math.max(8, Math.round(Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y)));
                render();
            }
        } else if (draggingItem.type === 'barrierEndpoint') {
            const b = barriers[draggingItem.barrierIndex];
            if (b) {
                const clampedX = Math.max(0, Math.min(canvasWrapper.clientWidth, pos.x));
                const clampedY = Math.max(0, Math.min(canvasWrapper.clientHeight, pos.y));
                if (draggingItem.endpoint === 'p1') {
                    b.p1.x = clampedX;
                    b.p1.y = clampedY;
                } else if (b.p2) {
                    b.p2.x = clampedX;
                    b.p2.y = clampedY;
                }
                render();
            }
        }
    } else if (drawingBarrier) {
        dragCurrent = pos;
        render();
    } else {
        /** @type {typeof hoveredItem} */
        let foundHover = null;
        let hoverCursor = 'crosshair';

        for (let i = 0; i < barriers.length; i++) {
            const b = barriers[i];
            if (b.shape === 'sphere') {
                const r = b.radius || 30;
                const distFromCenter = Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y);
                if (Math.abs(distFromCenter - r) <= 8) {
                    foundHover = { type: 'circleResize', barrierIndex: i };
                    hoverCursor = 'crosshair';
                    break;
                }
                if (distFromCenter < r - 8 || distFromCenter <= 12) {
                    foundHover = { type: 'circleMove', barrierIndex: i };
                    hoverCursor = 'grab';
                    break;
                }
            } else {
                if (Math.hypot(pos.x - b.p1.x, pos.y - b.p1.y) <= 12) {
                    foundHover = { type: 'barrierEndpoint', barrierIndex: i, endpoint: 'p1' };
                    hoverCursor = 'grab';
                    break;
                }
                if (b.p2 && Math.hypot(pos.x - b.p2.x, pos.y - b.p2.y) <= 12) {
                    foundHover = { type: 'barrierEndpoint', barrierIndex: i, endpoint: 'p2' };
                    hoverCursor = 'grab';
                    break;
                }
            }
        }

        if (!foundHover && Math.hypot(pos.x - camera.eye.x, pos.y - camera.eye.y) <= 14) {
            foundHover = { type: 'eye' };
            hoverCursor = 'grab';
        }

        if (!foundHover) {
            if (camera.handlePos && Math.hypot(pos.x - camera.handlePos.x, pos.y - camera.handlePos.y) <= 14) {
                foundHover = { type: 'viewport' };
                hoverCursor = 'grab';
            } else if (Math.hypot(pos.x - camera.lookat.x, pos.y - camera.lookat.y) <= 14) {
                foundHover = { type: 'viewport' };
                hoverCursor = 'grab';
            } else if (camera.viewportP1 && camera.viewportP2 &&
                       distToSegment(pos.x, pos.y, camera.viewportP1.x, camera.viewportP1.y, camera.viewportP2.x, camera.viewportP2.y) <= 8) {
                foundHover = { type: 'viewport' };
                hoverCursor = 'grab';
            }
        }

        if (!foundHover) {
            for (let i = 0; i < lights.length; i++) {
                const l = lights[i];
                if (Math.hypot(pos.x - l.x, pos.y - l.y) <= l.radius + 8) {
                    foundHover = { type: 'light', index: i };
                    hoverCursor = 'grab';
                    break;
                }
            }
        }

        const hoverChanged = JSON.stringify(foundHover) !== JSON.stringify(hoveredItem);
        if (hoverChanged) {
            hoveredItem = foundHover;
            canvas.style.cursor = hoveredItem ? hoverCursor : 'crosshair';
            render();
        }
    }
});

window.addEventListener('mouseup', () => {
    if (draggingItem) {
        if (dragStartSnapshot) {
            undoStack.push(dragStartSnapshot);
            if (undoStack.length > 50) undoStack.shift();
            updateUndoButton();
            dragStartSnapshot = null;
        }
        draggingItem = null;
        canvas.style.cursor = hoveredItem ? 'grab' : 'crosshair';
        render();
    } else if (drawingBarrier && dragStart && dragCurrent) {
        const dist = Math.hypot(dragCurrent.x - dragStart.x, dragCurrent.y - dragStart.y);
        if (dist >= 12) {
            pushUndo();
            const currentShape = (selectShape && selectShape.value === 'sphere') ? 'sphere' : 'rectangle';
            const currentWidth = inputBarrierWidth ? Math.max(2, parseFloat(inputBarrierWidth.value) || 16) : 16;
            const newMaterial = getCurrentMaterial();

            if (currentShape === 'sphere') {
                barriers.push({
                    shape: 'sphere',
                    p1: { x: dragStart.x, y: dragStart.y },
                    radius: Math.round(dist),
                    material: newMaterial
                });
            } else {
                barriers.push({
                    shape: 'rectangle',
                    p1: { x: dragStart.x, y: dragStart.y },
                    p2: { x: dragCurrent.x, y: dragCurrent.y },
                    width: currentWidth,
                    material: newMaterial
                });
            }
        }
        drawingBarrier = false;
        dragStart = null;
        dragCurrent = null;
        render();
    }
});

// Color Picker Button Event Listeners
if (btnMatAmbient) {
    btnMatAmbient.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matAmbient', btnMatAmbient);
    });
}
if (matAmbientSwatch) {
    matAmbientSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matAmbient', btnMatAmbient);
    });
}

if (btnMatDiffuse) {
    btnMatDiffuse.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matDiffuse', btnMatDiffuse);
    });
}
if (matDiffuseSwatch) {
    matDiffuseSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matDiffuse', btnMatDiffuse);
    });
}

if (btnMatSpecular) {
    btnMatSpecular.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matSpecular', btnMatSpecular);
    });
}
if (matSpecularSwatch) {
    matSpecularSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('matSpecular', btnMatSpecular);
    });
}

if (btnAmbientColor) {
    btnAmbientColor.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('ambient', btnAmbientColor);
    });
}
if (ambientColorSwatch) {
    ambientColorSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('ambient', btnAmbientColor);
    });
}

if (btnNoLightColor) {
    btnNoLightColor.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('noLight', btnNoLightColor);
    });
}
if (noLightColorSwatch) {
    noLightColorSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('noLight', btnNoLightColor);
    });
}

if (btnLightColor) {
    btnLightColor.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('light', btnLightColor);
    });
}
if (lightColorSwatch) {
    lightColorSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker('light', btnLightColor);
    });
}

if (btnToggleMenu && settingsDrawer) {
    btnToggleMenu.addEventListener('click', () => {
        const isOpen = settingsDrawer.classList.toggle('open');
        btnToggleMenu.classList.toggle('open', isOpen);
        resizeCanvas();
        render();
    });
}

if (checkAmbient) {
    checkAmbient.addEventListener('change', () => {
        isAmbientOn = checkAmbient.checked;
        pushUndo();
        render();
    });
}

// Themed Color Picker Popover Handlers
if (btnCloseColorPicker) {
    btnCloseColorPicker.addEventListener('click', () => closeColorPicker());
}
if (btnCustomColorWheel) {
    btnCustomColorWheel.addEventListener('click', () => {
        if (nativeColorInput) nativeColorInput.click();
    });
}
if (nativeColorInput) {
    nativeColorInput.addEventListener('input', () => {
        if (colorPickerHexInput) colorPickerHexInput.value = nativeColorInput.value.toUpperCase();
        if (colorPickerPreview) colorPickerPreview.style.backgroundColor = nativeColorInput.value;
    });
    nativeColorInput.addEventListener('change', () => {
        selectColorFromPicker(nativeColorInput.value);
    });
}
if (btnApplyColorPicker) {
    btnApplyColorPicker.addEventListener('click', () => {
        if (colorPickerHexInput) selectColorFromPicker(colorPickerHexInput.value.trim());
    });
}
if (colorPickerHexInput) {
    colorPickerHexInput.addEventListener('input', () => {
        const val = colorPickerHexInput.value.trim();
        const formatted = val.startsWith('#') ? val : `#${val}`;
        if (/^#[0-9a-fA-F]{3,6}$/.test(formatted) && colorPickerPreview) {
            colorPickerPreview.style.backgroundColor = formatted;
        }
    });
    colorPickerHexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            selectColorFromPicker(colorPickerHexInput.value.trim());
        }
    });
}
window.addEventListener('mousedown', (e) => {
    if (!themedColorPicker || themedColorPicker.style.display === 'none') return;
    const target = /** @type {Node} */ (e.target);
    if (!themedColorPicker.contains(target) &&
        (!btnMatAmbient || !btnMatAmbient.contains(target)) &&
        (!btnMatDiffuse || !btnMatDiffuse.contains(target)) &&
        (!btnMatSpecular || !btnMatSpecular.contains(target)) &&
        (!btnAmbientColor || !btnAmbientColor.contains(target)) &&
        (!btnNoLightColor || !btnNoLightColor.contains(target)) &&
        (!btnLightColor || !btnLightColor.contains(target))) {
        closeColorPicker();
    }
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && themedColorPicker && themedColorPicker.style.display !== 'none') {
        closeColorPicker();
    }
});

// Settings Inputs Event Listeners
inputPixels.addEventListener('input', () => render());
if (checkAntialiasing) {
    checkAntialiasing.addEventListener('change', () => {
        pushUndo();
        updateAntialiasingUiVisibility();
        render();
    });
}
if (inputMaxAaSubdivisions) inputMaxAaSubdivisions.addEventListener('input', () => render());
inputBounces.addEventListener('input', () => render());
if (inputFov) inputFov.addEventListener('input', () => render());
if (checkShadowRays) {
    checkShadowRays.addEventListener('change', () => {
        pushUndo();
        render();
    });
}

if (selectShape) {
    selectShape.addEventListener('change', () => {
        updateShapeUiVisibility();
    });
}

if (inputBarrierWidth) {
    inputBarrierWidth.addEventListener('input', () => render());
}

if (inputMatShininess) inputMatShininess.addEventListener('input', () => render());
if (inputMatReflectivity) inputMatReflectivity.addEventListener('input', () => render());
if (inputMatTransparency) inputMatTransparency.addEventListener('input', () => render());
if (inputMatRefractiveIndex) inputMatRefractiveIndex.addEventListener('input', () => render());

// Add Light Button
if (btnAddLight) {
    btnAddLight.addEventListener('click', () => {
        addLight();
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
    render();
});

/* ==========================================================================
   SCENE SERIALIZATION & QUERY PARAMETERS
   ========================================================================== */

/**
 * Generate share URL containing the scene JSON specification in `scene` parameter.
 * @returns {string}
 */
export function generateShareUrl() {
    const url = new URL(window.location.href);
    url.search = '';

    const sceneSpec = {
        lights: lights.map((l) => ({
            x: Math.round(l.x),
            y: Math.round(l.y),
            color: l.color
        })),
        camera: {
            eye: { x: Math.round(camera.eye.x), y: Math.round(camera.eye.y) },
            lookat: { x: Math.round(camera.lookat.x), y: Math.round(camera.lookat.y) }
        },
        barriers: barriers.map((b) => ({
            shape: b.shape,
            p1: { x: Math.round(b.p1.x), y: Math.round(b.p1.y) },
            p2: b.p2 ? { x: Math.round(b.p2.x), y: Math.round(b.p2.y) } : undefined,
            width: b.width !== undefined ? Math.round(b.width) : 16,
            radius: b.radius !== undefined ? Math.round(b.radius) : 30,
            material: {
                ambient: b.material.ambient,
                diffuse: b.material.diffuse,
                specular: b.material.specular,
                shininess: b.material.shininess,
                reflectivity: b.material.reflectivity,
                transparency: b.material.transparency,
                refractiveIndex: b.material.refractiveIndex
            }
        }))
    };

    url.searchParams.set('scene', JSON.stringify(sceneSpec));

    const curPixels = parseInt(inputPixels.value, 10);
    if (!isNaN(curPixels) && curPixels !== DEFAULT_CAMERA_PIXELS) {
        url.searchParams.set('pixels', String(curPixels));
    }

    const curAntialiasing = checkAntialiasing ? checkAntialiasing.checked : DEFAULT_ANTIALIASING;
    if (curAntialiasing !== DEFAULT_ANTIALIASING) {
        url.searchParams.set('antialiasing', String(curAntialiasing));
    }

    if (inputMaxAaSubdivisions && inputMaxAaSubdivisions.value.trim() !== '') {
        url.searchParams.set('maxAaSubdivisions', inputMaxAaSubdivisions.value.trim());
    }

    const curBounces = parseInt(inputBounces.value, 10);
    if (!isNaN(curBounces) && curBounces !== DEFAULT_MAX_BOUNCES) {
        url.searchParams.set('bounces', String(curBounces));
    }

    const curFov = inputFov ? parseFloat(inputFov.value) : DEFAULT_FOV_DEG;
    if (!isNaN(curFov) && curFov !== DEFAULT_FOV_DEG) {
        url.searchParams.set('fov', String(curFov));
    }

    const curShadow = checkShadowRays ? checkShadowRays.checked : DEFAULT_SHADOW_RAYS;
    if (curShadow !== DEFAULT_SHADOW_RAYS) {
        url.searchParams.set('shadowRays', String(curShadow));
    }

    const curAmbient = checkAmbient ? checkAmbient.checked : DEFAULT_AMBIENT_ON;
    if (curAmbient !== DEFAULT_AMBIENT_ON) {
        url.searchParams.set('ambient', String(curAmbient));
    }

    if (ambientColorHex.toLowerCase() !== DEFAULT_AMBIENT_COLOR_HEX.toLowerCase()) {
        url.searchParams.set('ambientColor', ambientColorHex.replace('#', ''));
    }

    if (noLightColorHex.toLowerCase() !== DEFAULT_NO_LIGHT_COLOR_HEX.toLowerCase()) {
        url.searchParams.set('noLightColor', noLightColorHex.replace('#', ''));
    }

    if (selectedLightColorHex.toLowerCase() !== DEFAULT_LIGHT_COLOR_HEX.toLowerCase()) {
        url.searchParams.set('lightColor', selectedLightColorHex.replace('#', ''));
    }

    return url.toString();
}

/**
 * Apply a scene specification object.
 * ALL barriers in sceneObj are ensured to have Material.
 * @param {any} sceneObj
 */
export function applySceneObject(sceneObj) {
    if (!sceneObj || typeof sceneObj !== 'object') {
        throw new Error('Scene specification must be a valid JSON object.');
    }

    pushUndo();

    if (Array.isArray(sceneObj.lights)) {
        lights = sceneObj.lights.map(/** @param {any} l @param {number} idx */ (l, idx) => ({
            id: idx + 1,
            x: Number(l.x),
            y: Number(l.y),
            radius: l.radius ? Number(l.radius) : 16,
            color: l.color || DEFAULT_LIGHT_COLOR_HEX,
            colorRGB: parseColorRGB(l.color || DEFAULT_LIGHT_COLOR_HEX)
        }));
    }

    if (sceneObj.camera) {
        if (sceneObj.camera.eye) {
            camera.eye = { x: Number(sceneObj.camera.eye.x), y: Number(sceneObj.camera.eye.y) };
            camera.lookat = { x: Number(sceneObj.camera.lookat.x), y: Number(sceneObj.camera.lookat.y) };
        }
    }

    if (Array.isArray(sceneObj.barriers)) {
        barriers = sceneObj.barriers.map(/** @param {any} b */ (b) => {
            let mat;
            if (b.material instanceof Material) {
                mat = b.material;
            } else {
                const matSpec = b.material ? { ...b.material } : {};
                if (matSpec.diffuse === undefined && (b.color || DEFAULT_MAT_DIFFUSE_HEX)) {
                    matSpec.diffuse = parseColorRGB(b.color || DEFAULT_MAT_DIFFUSE_HEX);
                }
                if (matSpec.ambient === undefined && b.ambient) {
                    matSpec.ambient = parseColorRGB(b.ambient);
                }
                mat = new Material(matSpec);
            }

            return {
                shape: b.shape || 'rectangle',
                p1: { x: Number(b.p1.x), y: Number(b.p1.y) },
                p2: b.p2 ? { x: Number(b.p2.x), y: Number(b.p2.y) } : (b.shape === 'sphere' ? undefined : { x: Number(b.p1.x) + 40, y: Number(b.p1.y) }),
                width: b.width !== undefined ? Number(b.width) : 16,
                radius: b.radius !== undefined ? Number(b.radius) : 30,
                material: mat
            };
        });
    }
}

/**
 * Parse a URL, query string, or scene JSON string, and apply it to the simulation.
 * @param {string} rawInput
 */
export function parseAndApplyScene(rawInput) {
    let str = (rawInput || '').trim();
    if (!str) {
        throw new Error('Please enter a query string, URL, or JSON specification.');
    }

    if (str.startsWith('{') && str.endsWith('}')) {
        const sceneObj = JSON.parse(str);
        applySceneObject(sceneObj);
        render();
        return;
    }

    let searchStr = str;
    if (str.includes('?')) {
        searchStr = str.substring(str.indexOf('?'));
    } else if (!str.startsWith('?')) {
        searchStr = '?' + str;
    }

    const params = new URLSearchParams(searchStr);
    const sceneParam = params.get('scene');
    if (sceneParam) {
        const sceneObj = JSON.parse(sceneParam);
        applySceneObject(sceneObj);
    } else if (params.has('lights') || params.has('camera') || params.has('barriers')) {
        const sceneObj = {};
        if (params.has('lights')) sceneObj.lights = JSON.parse(params.get('lights') || '[]');
        if (params.has('camera')) sceneObj.camera = JSON.parse(params.get('camera') || '{}');
        if (params.has('barriers')) sceneObj.barriers = JSON.parse(params.get('barriers') || '[]');
        applySceneObject(sceneObj);
    }

    if (params.has('pixels')) inputPixels.value = params.get('pixels') || '';
    if (params.has('antialiasing') && checkAntialiasing) {
        checkAntialiasing.checked = params.get('antialiasing') === 'true';
        updateAntialiasingUiVisibility();
    }
    if (params.has('maxAaSubdivisions') && inputMaxAaSubdivisions) {
        inputMaxAaSubdivisions.value = params.get('maxAaSubdivisions') || '';
    }
    if (params.has('bounces')) inputBounces.value = params.get('bounces') || '';
    if (params.has('fov') && inputFov) inputFov.value = params.get('fov') || '';
    if (params.has('shadowRays') && checkShadowRays) {
        checkShadowRays.checked = params.get('shadowRays') === 'true';
    }
    if (params.has('ambient') && checkAmbient) {
        checkAmbient.checked = params.get('ambient') === 'true';
        isAmbientOn = checkAmbient.checked;
    }
    if (params.has('ambientColor')) {
        const col = params.get('ambientColor') || '';
        ambientColorHex = col.startsWith('#') ? col : `#${col}`;
        ambientColorRGB = parseColorRGB(ambientColorHex);
        if (ambientColorSwatch) ambientColorSwatch.style.backgroundColor = ambientColorHex;
    }
    if (params.has('noLightColor')) {
        const col = params.get('noLightColor') || '';
        noLightColorHex = col.startsWith('#') ? col : `#${col}`;
        noLightColorRGB = parseColorRGB(noLightColorHex);
        if (noLightColorSwatch) noLightColorSwatch.style.backgroundColor = noLightColorHex;
    }
    if (params.has('lightColor')) {
        const col = params.get('lightColor') || '';
        selectedLightColorHex = col.startsWith('#') ? col : `#${col}`;
        selectedLightColorRGB = parseColorRGB(selectedLightColorHex);
        if (lightColorSwatch) lightColorSwatch.style.backgroundColor = selectedLightColorHex;
    }
    if (params.has('shape') && selectShape) {
        selectShape.value = params.get('shape') || 'rectangle';
        updateShapeUiVisibility();
    }
    if (params.has('barrierWidth') && inputBarrierWidth) {
        inputBarrierWidth.value = params.get('barrierWidth') || '16';
    }

    render();
}

// Copy Link Button handler
if (btnCopyLink) {
    btnCopyLink.addEventListener('click', async () => {
        const shareUrl = generateShareUrl();
        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                copied = true;
            }
        } catch {}

        if (!copied) {
            try {
                const tempArea = document.createElement('textarea');
                tempArea.value = shareUrl;
                tempArea.style.position = 'fixed';
                tempArea.style.opacity = '0';
                document.body.appendChild(tempArea);
                tempArea.focus();
                tempArea.select();
                copied = document.execCommand('copy');
                document.body.removeChild(tempArea);
            } catch {}
        }

        const origText = btnCopyLink.textContent;
        btnCopyLink.textContent = copied ? 'Copied!' : 'Link Ready';
        btnCopyLink.classList.remove('btn-secondary');
        setTimeout(() => {
            btnCopyLink.textContent = origText;
            btnCopyLink.classList.add('btn-secondary');
        }, 1500);
    });
}

// Load Scene Modal Dialog Handlers
function openLoadModal() {
    if (loadSceneModal) {
        loadSceneModal.style.display = 'flex';
        if (loadErrorMsg) {
            loadErrorMsg.textContent = '';
            loadErrorMsg.style.display = 'none';
        }
        if (txtSceneInput) {
            txtSceneInput.value = '';
            setTimeout(() => txtSceneInput.focus(), 50);
        }
    }
}

function closeLoadModal() {
    if (loadSceneModal) {
        loadSceneModal.style.display = 'none';
    }
}

if (btnLoadScene) {
    btnLoadScene.addEventListener('click', openLoadModal);
}
if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeLoadModal);
}
if (btnCancelModal) {
    btnCancelModal.addEventListener('click', closeLoadModal);
}
if (loadSceneModal) {
    loadSceneModal.addEventListener('click', (e) => {
        if (e.target === loadSceneModal) closeLoadModal();
    });
}
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loadSceneModal && loadSceneModal.style.display !== 'none') {
        closeLoadModal();
    }
});

if (btnApplyScene) {
    btnApplyScene.addEventListener('click', () => {
        if (!txtSceneInput) return;
        try {
            parseAndApplyScene(txtSceneInput.value);
            try {
                window.history.replaceState(null, '', generateShareUrl());
            } catch {}
            closeLoadModal();
        } catch (err) {
            if (loadErrorMsg) {
                const msg = err instanceof Error ? err.message : String(err);
                loadErrorMsg.textContent = msg || 'Invalid scene specification or query string.';
                loadErrorMsg.style.display = 'block';
            }
        }
    });
}

window.addEventListener('resize', () => {
    resizeCanvas();
    render();
});

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
initColorPickerPalette();
applyDefaultInputs();
resizeCanvas();

if (window.location.search) {
    try {
        parseAndApplyScene(window.location.search);
    } catch (err) {
        console.warn('Failed to parse scene from URL:', err);
        setupDefaultScene();
    }
} else {
    setupDefaultScene();
}

updateUndoButton();
render();



