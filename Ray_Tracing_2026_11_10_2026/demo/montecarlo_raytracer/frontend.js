// @ts-check
/**
 * @file frontend.js
 * @description Frontend script for Monte Carlo Ray Tracer demo inside an iframe.
 * Manages UI interactions, spawns the raytracer Web Worker, receives rendered pixel batches,
 * accumulates them in a typed array (Uint8ClampedArray), and draws them to the canvas.
 * 
 * Supports in_view / not_in_view lifecycle events:
 * - When not in view: unloads the canvas element (to conserve browser canvas count),
 *   while the Web Worker continues rendering into the typed array in the background.
 * - When in view: recreates/remounts the canvas and blits all accumulated pixels from the typed array.
 * 
 * Configurable via URL search parameters (single canonical name per parameter, no aliases):
 * - `scene`: (string) Scene preset identifier. Default: 'diffuse'.
 * - `mode`: ('shaded' | 'normals') Visualization mode. Default: 'normals' if scene is 'normals', else 'shaded'.
 * - `samplesPerPixel`: (number) Samples per pixel. Default: 1 for 'normals', 50 for 'shaded'.
 * - `maxDepth`: (number) Maximum ray bounce recursion depth. Default: 1 for 'normals', 50 for 'shaded'.
 * - `aaJitter`: (boolean) Whether to apply subpixel jitter for anti-aliasing. Default: true. When false, rays shoot through pixel centers without jitter while keeping samplesPerPixel.
 * - `imageWidth`: (number) Render width in pixels. Default: 400.
 * - `aspectRatio`: (number) Camera viewport aspect ratio. Default: 16 / 9.
 * - `imageHeight`: (number) Render height in pixels. Default: Math.round(imageWidth / aspectRatio).
 * - `autoStart`: (boolean) Whether to automatically start rendering when initialized. Default: false.
 * - `aabb`: (boolean) Whether to build AABB / BVH acceleration hierarchy. Default: true if scene === 'camera', else false.
 * - `background`: (string) Background appearance ('sky', 'black', 'white', or hex color). Default: 'sky'.
 * - `hitMin`: (number) Minimum ray hit distance to prevent shadow acne. Default: 0.001.
 * - `diffuseMethod`: ('lambertian' | 'rejection' | 'hemisphere') Diffuse scattering model. Default: 'lambertian'.
 * - `gamma`: (number) Gamma correction exponent. Default: 2.0.
 * - `vfov`: (number) Camera vertical field of view in degrees.
 * - `aperture`: (number) Camera lens aperture diameter for defocus blur.
 * - `focusDist`: (number) Distance to camera focal plane.
 * - `time0`: (number) Shutter open time for motion blur. Default: 0.0.
 * - `time1`: (number) Shutter close time for motion blur. Default: 1.0.
 * - `renderPattern`: (string) Progressive scan pattern.
 * - `numRows`: (number) Number of vertical partition tiles. Default: 4.
 * - `numCols`: (number) Number of horizontal partition tiles. Default: 4.
 * - `buttonLabel`: (string) Label for render button. Default: '▶ Run Live Render'.
 * - `initialStatus`: (string) Initial status message. Default: 'Ready to trace rays'.
 */

// ----------------------------------------------------------------------------
// URL Parameters Parsing
// ----------------------------------------------------------------------------

const urlParams = new URLSearchParams(window.location.search);

/**
 * @param {string} name
 * @param {string} defaultVal
 * @returns {string}
 */
function getParam(name, defaultVal) {
    if (urlParams.has(name)) {
        const v = urlParams.get(name);
        if (v !== null) return v;
    }
    return defaultVal;
}

/**
 * @param {string} name
 * @param {number} defaultVal
 * @returns {number}
 */
function getNumParam(name, defaultVal) {
    if (urlParams.has(name)) {
        const parsed = Number(urlParams.get(name));
        if (!isNaN(parsed)) return parsed;
    }
    return defaultVal;
}

/**
 * @param {string} name
 * @param {boolean} defaultVal
 * @returns {boolean}
 */
function getBoolParam(name, defaultVal) {
    if (urlParams.has(name)) {
        const v = (urlParams.get(name) || '').toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === '';
    }
    return defaultVal;
}

const workerScript = './montecarlo.js';

const scene = getParam('scene', 'diffuse');
const mode = getParam('mode', scene === 'normals' ? 'normals' : 'shaded');
const samplesPerPixel = Math.max(1, getNumParam('samplesPerPixel', mode === 'normals' ? 1 : 50));
const maxDepth = Math.max(1, getNumParam('maxDepth', mode === 'normals' ? 1 : 50));
const aaJitter = urlParams.has('aaJitter')
    ? getBoolParam('aaJitter', true)
    : (urlParams.has('aajitter') ? getBoolParam('aajitter', true) : true);
const imageWidth = Math.max(16, getNumParam('imageWidth', 400));
const aspectRatio = getNumParam('aspectRatio', 16 / 9);
const imageHeight = Math.max(16, getNumParam('imageHeight', Math.round(imageWidth / aspectRatio)));
const autoStart = getBoolParam('autoStart', false);
const aabb = getBoolParam('aabb', scene === 'camera');
const background = urlParams.has('background') ? urlParams.get('background') : undefined;
const hitMin = getNumParam('hitMin', 0.001);
const diffuseMethod = getParam('diffuseMethod', 'lambertian').toLowerCase();
const gamma = getNumParam('gamma', 2.0);
const vfov = urlParams.has('vfov') ? Number(urlParams.get('vfov')) : null;
const aperture = urlParams.has('aperture') ? Number(urlParams.get('aperture')) : null;
const focusDist = urlParams.has('focusDist') ? Number(urlParams.get('focusDist')) : null;
const time0 = getNumParam('time0', 0.0);
const time1 = getNumParam('time1', 1.0);
const buttonLabel = getParam('buttonLabel', '▶ Run Live Render');
const initialStatus = getParam('initialStatus', 'Ready to trace rays');

// Progressive render pattern
let renderPattern = null;
const patternName = getParam('renderPattern', '');
if (patternName) {
    renderPattern = {
        pattern: patternName,
        numRows: Math.max(1, getNumParam('numRows', 4)),
        numCols: Math.max(1, getNumParam('numCols', 4)),
    };
}

/** @type {Record<string, any>} */
const workerOptions = {
    scene,
    mode,
    samplesPerPixel,
    maxDepth,
    imageWidth,
    imageHeight,
    aspectRatio,
    gamma,
    hitMin,
    diffuseMethod,
    vfov,
    aperture,
    focusDist,
    time0,
    time1,
    background,
    aabb,
    renderPattern,
    aaJitter,
};

// ----------------------------------------------------------------------------
// State & Buffers
// ----------------------------------------------------------------------------

const width = imageWidth;
const height = imageHeight;
const totalPixels = width * height;
const totalRays = totalPixels * samplesPerPixel;

/**
 * Persistent pixel buffer storing rendered RGBA image across canvas mounts/unmounts.
 * @type {Uint8ClampedArray}
 */
const pixelArray = new Uint8ClampedArray(width * height * 4);

/**
 * Resets pixel buffer to light background (#f8fafc).
 */
function resetPixelBuffer() {
    for (let i = 0; i < pixelArray.length; i += 4) {
        pixelArray[i] = 248;     // R
        pixelArray[i + 1] = 250; // G
        pixelArray[i + 2] = 252; // B
        pixelArray[i + 3] = 255; // A
    }
}
resetPixelBuffer();

/** @type {Worker | null} */
let worker = null;
let workerRunning = false;
let workerDone = false;
let hasRenderedAtLeastOnce = false;
let isInView = true;

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
/** @type {HTMLImageElement | null} */
let imgPlaceholder = null;
/** @type {string | null} */
let lastSnapshotUrl = null;

let renderedPixelCount = 0;
let raysTraced = 0;
let rayBounces = 0;
let startTime = 0;
let elapsedSeconds = '0.0';

// ----------------------------------------------------------------------------
// DOM References
// ----------------------------------------------------------------------------

const canvasWrap = /** @type {HTMLElement} */ (document.getElementById('canvasWrap'));
const btnEl = /** @type {HTMLButtonElement} */ (document.getElementById('renderBtn'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('statusVal'));
const sizeEl = /** @type {HTMLElement} */ (document.getElementById('sizeVal'));
const raysEl = /** @type {HTMLElement} */ (document.getElementById('raysVal'));
const bouncesEl = /** @type {HTMLElement} */ (document.getElementById('bouncesVal') || document.getElementById('rayBouncesVal'));
const maxDepthEl = /** @type {HTMLElement} */ (document.getElementById('maxDepthVal') || document.getElementById('maxBounceDepthVal'));
const shadowRaysRow = /** @type {HTMLElement} */ (document.getElementById('shadowRaysRow'));
const shadowRaysEl = /** @type {HTMLElement} */ (document.getElementById('shadowRaysVal'));
const pixelsEl = /** @type {HTMLElement} */ (document.getElementById('pixelsVal'));
const timeEl = /** @type {HTMLElement} */ (document.getElementById('timeVal'));
const etaRow = /** @type {HTMLElement} */ (document.getElementById('etaRow'));
const etaEl = /** @type {HTMLElement} */ (document.getElementById('etaVal'));
const sppEl = /** @type {HTMLElement} */ (document.getElementById('sppVal'));
const rateEl = /** @type {HTMLElement} */ (document.getElementById('rateVal'));

// Initialize static labels
if (sizeEl) sizeEl.textContent = `${width} × ${height} px`;
if (sppEl) sppEl.textContent = String(samplesPerPixel);
if (maxDepthEl) maxDepthEl.textContent = String(maxDepth);
if (bouncesEl) bouncesEl.textContent = '0';
if (btnEl) btnEl.textContent = buttonLabel;
if (statusEl) statusEl.textContent = initialStatus;
if (shadowRaysRow) shadowRaysRow.style.display = 'none';
if (etaEl) etaEl.textContent = '--';

// ----------------------------------------------------------------------------
// Canvas Mount / Unmount Operations
// ----------------------------------------------------------------------------

/**
 * Mounts the canvas into the DOM and paints accumulated pixels from the typed array.
 */
function mountCanvas() {
    if (canvas && canvas.parentNode) {
        return;
    }

    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.className = 'demo-canvas';
    c.style.maxWidth = '100%';
    c.style.aspectRatio = `${width} / ${height}`;
    c.style.display = 'block';

    const context = c.getContext('2d');
    if (!context) {
        console.error('Failed to acquire 2D context for canvas');
        return;
    }

    // Restore pixel buffer from typed array
    const imgData = context.createImageData(width, height);
    imgData.data.set(pixelArray);
    context.putImageData(imgData, 0, 0);

    canvas = c;
    ctx = context;

    if (imgPlaceholder && imgPlaceholder.parentNode) {
        imgPlaceholder.replaceWith(c);
        imgPlaceholder = null;
    } else if (canvasWrap) {
        canvasWrap.innerHTML = '';
        canvasWrap.appendChild(c);
    }
}

/**
 * Unloads the canvas element from the DOM to free limited browser GPU/canvas contexts.
 * Displays a lightweight image snapshot while not in view.
 */
function unmountCanvas() {
    if (!canvas) {
        return;
    }

    // Capture still snapshot before removing canvas
    try {
        lastSnapshotUrl = canvas.toDataURL('image/png');
    } catch {
        // Fallback if canvas is tainted or cannot export
    }

    if (!imgPlaceholder) {
        imgPlaceholder = document.createElement('img');
        imgPlaceholder.className = 'demo-canvas demo-img-placeholder';
        imgPlaceholder.alt = 'Ray tracing render snapshot';
        imgPlaceholder.style.maxWidth = '100%';
        imgPlaceholder.style.aspectRatio = `${width} / ${height}`;
        imgPlaceholder.style.display = 'block';
    }

    if (lastSnapshotUrl) {
        imgPlaceholder.src = lastSnapshotUrl;
    }

    if (canvas.parentNode) {
        canvas.replaceWith(imgPlaceholder);
    }

    // Release canvas memory and context
    canvas.width = 0;
    canvas.height = 0;
    canvas = null;
    ctx = null;
}

// ----------------------------------------------------------------------------
// UI Updates
// ----------------------------------------------------------------------------

function updateUI() {
    if (!btnEl) return;

    const pct = Math.min(100, Math.round((renderedPixelCount / totalPixels) * 100));
    const raysFormatted = raysTraced.toLocaleString();
    const bouncesFormatted = rayBounces.toLocaleString();
    const pixelsFormatted = renderedPixelCount.toLocaleString();
    const totalPixelsFormatted = totalPixels.toLocaleString();

    if (workerRunning) {
        btnEl.textContent = '⏹ Stop Render';
        if (statusEl) {
            statusEl.textContent = `Tracing rays (${pct}%)`;
        }
    } else if (workerDone) {
        btnEl.textContent = '↻ Re-render';
        if (statusEl) {
            statusEl.textContent = `Render complete in ${elapsedSeconds}s`;
        }
    } else if (renderedPixelCount > 0) {
        btnEl.textContent = buttonLabel.startsWith('↻') ? buttonLabel : '↻ Re-render';
        if (statusEl) {
            statusEl.textContent = 'Render stopped';
        }
    } else {
        btnEl.textContent = buttonLabel;
        if (statusEl) {
            statusEl.textContent = initialStatus;
        }
    }

    if (raysEl) {
        raysEl.textContent = raysFormatted;
    }
    if (bouncesEl) {
        bouncesEl.textContent = bouncesFormatted;
    }
    if (maxDepthEl) {
        maxDepthEl.textContent = String(maxDepth);
    }
    if (pixelsEl) {
        pixelsEl.textContent = `${pixelsFormatted} / ${totalPixelsFormatted} (${pct}%)`;
    }
    if (timeEl) {
        timeEl.textContent = `${elapsedSeconds}s`;
    }
    if (etaEl) {
        if (workerRunning && renderedPixelCount > 0) {
            const elapsed = (performance.now() - startTime) / 1000;
            const remainingPixels = totalPixels - renderedPixelCount;
            if (remainingPixels <= 0) {
                etaEl.textContent = '0.0s';
            } else if (elapsed > 0.05) {
                const pixelsPerSec = renderedPixelCount / elapsed;
                const remainingSec = remainingPixels / pixelsPerSec;
                if (remainingSec < 60) {
                    etaEl.textContent = `${remainingSec.toFixed(1)}s`;
                } else {
                    const mins = Math.floor(remainingSec / 60);
                    const secs = Math.round(remainingSec % 60);
                    etaEl.textContent = `${mins}m ${secs}s`;
                }
            } else {
                etaEl.textContent = '--';
            }
        } else if (workerDone) {
            etaEl.textContent = '0.0s';
        } else {
            etaEl.textContent = '--';
        }
    }
    if (rateEl) {
        const sec = parseFloat(elapsedSeconds);
        if (sec > 0 && raysTraced > 0) {
            const rate = Math.round(raysTraced / sec);
            rateEl.textContent = `${rate.toLocaleString()} rays/s`;
        } else {
            rateEl.textContent = '--';
        }
    }
}

// ----------------------------------------------------------------------------
// Worker Execution Lifecycle
// ----------------------------------------------------------------------------

function stopRender() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    workerRunning = false;
    updateUI();
    if (statusEl) {
        statusEl.textContent = 'Render stopped';
    }
}

function startRender() {
    if (worker) {
        worker.terminate();
        worker = null;
    }

    resetPixelBuffer();
    renderedPixelCount = 0;
    raysTraced = 0;
    rayBounces = 0;
    startTime = performance.now();
    elapsedSeconds = '0.0';
    workerRunning = true;
    workerDone = false;
    hasRenderedAtLeastOnce = true;

    // Reset current canvas if mounted
    if (isInView && ctx && canvas) {
        const imgData = ctx.createImageData(width, height);
        imgData.data.set(pixelArray);
        ctx.putImageData(imgData, 0, 0);
    }

    updateUI();

    try {
        worker = new Worker(workerScript, { type: 'module' });
    } catch (err) {
        console.error(`Failed to spawn raytracer Web Worker (${workerScript}):`, err);
        workerRunning = false;
        if (statusEl) {
            statusEl.textContent = 'Worker failed to initialize';
        }
        updateUI();
        return;
    }

    worker.onmessage = (event) => {
        const [[IMAGE_WIDTH, IMAGE_HEIGHT], newlyRenderedPixels, doneRayTracing, statsData] = event.data;

        // 1. Accumulate pixels in typed array (persists regardless of view state)
        for (let i = 0; i < newlyRenderedPixels.length; i++) {
            const [pixX, pixY, [r, g, b]] = newlyRenderedPixels[i];
            const invY = IMAGE_HEIGHT - 1 - pixY;
            if (pixX >= 0 && pixX < width && invY >= 0 && invY < height) {
                const idx = (invY * width + pixX) * 4;
                pixelArray[idx] = r;
                pixelArray[idx + 1] = g;
                pixelArray[idx + 2] = b;
                pixelArray[idx + 3] = 255;
            }
        }

        renderedPixelCount += newlyRenderedPixels.length;
        if (statsData && typeof statsData.raysTraced === 'number') {
            raysTraced = statsData.raysTraced;
        } else {
            raysTraced = renderedPixelCount * samplesPerPixel;
        }
        if (statsData && typeof statsData.rayBounces === 'number') {
            rayBounces = statsData.rayBounces;
        }
        elapsedSeconds = ((performance.now() - startTime) / 1000).toFixed(1);

        // 2. If in view, draw directly to the mounted canvas
        if (isInView && ctx && canvas) {
            const scaleX = canvas.width / IMAGE_WIDTH;
            const scaleY = canvas.height / IMAGE_HEIGHT;

            for (let i = 0; i < newlyRenderedPixels.length; i++) {
                const [pixX, pixY, [r, g, b]] = newlyRenderedPixels[i];
                const invY = IMAGE_HEIGHT - 1 - pixY;
                if (pixX >= 0 && pixX < IMAGE_WIDTH && invY >= 0 && invY < IMAGE_HEIGHT) {
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    const startX = Math.floor(pixX * scaleX);
                    const endX = Math.floor((pixX + 1) * scaleX);
                    const startY = Math.floor(invY * scaleY);
                    const endY = Math.floor((invY + 1) * scaleY);
                    ctx.fillRect(startX, startY, Math.max(1, endX - startX), Math.max(1, endY - startY));
                }
            }
        }

        updateUI();

        if (doneRayTracing) {
            workerRunning = false;
            workerDone = true;
            if (worker) {
                worker.terminate();
                worker = null;
            }
            updateUI();

            // Post snapshot to parent presentation frame if listening
            if (window.parent && window.parent !== window) {
                try {
                    let snap = lastSnapshotUrl;
                    if (canvas) {
                        snap = canvas.toDataURL('image/png');
                    }
                    if (snap) {
                        window.parent.postMessage({
                            type: 'iframe-snapshot',
                            dataUrl: snap
                        }, '*');
                    }
                } catch {
                    // Ignore cross-origin snapshot message errors
                }
            }
        }
    };

    worker.onerror = (err) => {
        console.error('Worker error during ray tracing:', err);
        workerRunning = false;
        if (worker) {
            worker.terminate();
            worker = null;
        }
        if (statusEl) {
            statusEl.textContent = 'Render error';
        }
        updateUI();
    };

    worker.postMessage(workerOptions);
}

// Button click listener
if (btnEl) {
    btnEl.addEventListener('click', () => {
        if (workerRunning) {
            stopRender();
        } else {
            startRender();
        }
    });
}

// ----------------------------------------------------------------------------
// View Lifecycle Handling (in_view / not_in_view)
// ----------------------------------------------------------------------------

function handleInView() {
    if (isInView) return;
    isInView = true;
    mountCanvas();
    updateUI();

    // Auto-start render if enabled and not yet started
    if (autoStart && !hasRenderedAtLeastOnce && !workerRunning) {
        startRender();
    }
}

function handleNotInView() {
    if (!isInView) return;
    isInView = false;
    unmountCanvas();
}

// Listen for messages from parent window
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data === 'in_view' || data?.type === 'in_view') {
        handleInView();
    } else if (data === 'not_in_view' || data?.type === 'not_in_view') {
        handleNotInView();
    }
});

// Listen for DOM CustomEvents (for same-origin or direct dispatch)
window.addEventListener('in_view', handleInView);
window.addEventListener('not_in_view', handleNotInView);
document.addEventListener('in_view', handleInView);
document.addEventListener('not_in_view', handleNotInView);

// ----------------------------------------------------------------------------
// Initial Mount
// ----------------------------------------------------------------------------

mountCanvas();
updateUI();

if (autoStart && !hasRenderedAtLeastOnce && !workerRunning) {
    startRender();
}
