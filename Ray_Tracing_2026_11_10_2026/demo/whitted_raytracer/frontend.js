// @ts-check
/**
 * @file frontend.js
 * @description Frontend script for the Classical Whitted Ray Tracer demo inside an iframe.
 * Manages UI interactions, spawns the Whitted raytracer Web Worker (`./whitted.js`),
 * receives rendered pixel batches, accumulates them in a typed array (Uint8ClampedArray),
 * and draws them to the canvas. Renders column-by-column from left to right.
 * 
 * Supports in_view / not_in_view lifecycle events:
 * - When not in view: unloads the canvas element (to conserve the browser's limited canvas count),
 *   while the Web Worker continues rendering into the typed array in the background.
 * - When in view: recreates/remounts the canvas and blits all accumulated pixels from the typed array.
 * 
 * ----------------------------------------------------------------------------
 * URL Parameters Accepted (exact parameter names only, no aliases or typos):
 * ----------------------------------------------------------------------------
 * - `scene`: string
 *     Preset scene name ('whitted' | 'whitted1980' | 'sphere' | 'spherewithpointlight' |
 *     'twosphereswithpointlight' | 'manysphereswithpointlight' | 'manyspheresmanymaterials').
 *     Default: 'whitted'
 * - `imageWidth`: number
 *     Width of the rendered canvas in pixels. Default: 400 (min: 16)
 * - `aspectRatio`: number
 *     Aspect ratio (width / height) used to calculate height when not explicitly provided.
 *     Default: 16 / 9
 * - `imageHeight`: number
 *     Height of the rendered canvas in pixels. Default: imageWidth / aspectRatio
 * - `maxAntialiasingSubdivisions`: number | null
 *     Maximum number of times a pixel can recursively subdivide during Whitted's
 *     4-corner adaptive antialiasing. By default, there is no maximum limit (null / unlimited).
 * - `adaptiveTolerance`: number
 *     Contrast threshold across RGB channels to trigger adaptive subdivision.
 *     Default: 0.1
 * - `maxDepth`: number
 *     Maximum recursion bounce depth for reflection and refraction rays. Default: 10
 * - `ambient`: string
 *     Scene constant ambient illumination color (e.g. 'black', 'white', hex '#rrggbb', or 'r,g,b').
 *     Default: null (evaluates to black [0, 0, 0] in whitted.js)
 * - `onHitAndBlack`: string | null
 *     Color to display for any pixel that had a hit on scene geometry but whose computed
 *     color turned out to be black (e.g. unlit surface or in deep shadow).
 *     Accepts named colors ('red', 'blue', etc.), hex ('#ff0000'), or RGB numbers ('1,0,0').
 *     Default: null (disabled).
 *     NOTE: This is an educational visualization feature and is NOT part of Turner Whitted's ray tracing model.
 * - `shadowRaysForPointLights`: boolean
 *     Whether to cast shadow feeler rays to point light sources. Default: true
 * - `gamma`: number
 *     Gamma correction exponent. Default: 2.0
 * - `updateInterval`: number
 *     How many pixel column batches to process before sending a progress update. Default: 0
 * - `autoStart`: boolean
 *     Whether to start rendering automatically when the demo loads or comes into view. Default: false
 * - `buttonLabel`: string
 *     Custom label text for the render button. Default: '▶ Run Live Render'
 * - `initialStatus`: string
 *     Custom initial status text shown in the status row. Default: 'Ready to trace rays'
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

// Extract parameters supported by whitted.js backend
const workerScript = './whitted.js';

const scene = getParam('scene', 'whitted');
const imageWidth = Math.max(16, getNumParam('imageWidth', 400));
const aspectRatio = getNumParam('aspectRatio', 16 / 9);
const imageHeight = Math.max(16, getNumParam('imageHeight', Math.round(imageWidth / aspectRatio)));
const maxDepth = Math.max(1, getNumParam('maxDepth', 10));

const maxSubdivisionsRaw = getParam('maxAntialiasingSubdivisions', '');
const maxAntialiasingSubdivisions = maxSubdivisionsRaw !== '' ? Number(maxSubdivisionsRaw) : null;
const adaptiveTolerance = getNumParam('adaptiveTolerance', 0.1);

const ambient = getParam('ambient', '');
const onHitAndBlack = getParam('onHitAndBlack', '');
const shadowRaysForPointLights = getBoolParam('shadowRaysForPointLights', true);
const gamma = getNumParam('gamma', 2.0);
const updateInterval = getNumParam('updateInterval', 0);

const autoStart = getBoolParam('autoStart', false);
const buttonLabel = getParam('buttonLabel', '▶ Run Live Render');
const initialStatus = getParam('initialStatus', 'Ready to trace rays');

/** @type {Record<string, any>} */
const workerOptions = {
    scene,
    imageWidth,
    imageHeight,
    aspectRatio,
    maxDepth,
    maxAntialiasingSubdivisions,
    adaptiveTolerance,
    ambient: ambient || null,
    onHitAndBlack: onHitAndBlack || null,
    shadowRaysForPointLights,
    gamma,
    updateInterval,
};

// ----------------------------------------------------------------------------
// State & Buffers
// ----------------------------------------------------------------------------

const width = imageWidth;
const height = imageHeight;
const totalPixels = width * height;

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
let shadowRaysCast = 0;
let shadowRaysReached = 0;
let aaSubdivisions = 0;
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
const shadowRaysRow = /** @type {HTMLElement} */ (document.getElementById('shadowRaysRow'));
const shadowRaysEl = /** @type {HTMLElement} */ (document.getElementById('shadowRaysVal'));
const pixelsEl = /** @type {HTMLElement} */ (document.getElementById('pixelsVal'));
const timeEl = /** @type {HTMLElement} */ (document.getElementById('timeVal'));
const etaRow = /** @type {HTMLElement} */ (document.getElementById('etaRow'));
const etaEl = /** @type {HTMLElement} */ (document.getElementById('etaVal'));
const aaSubdivsEl = /** @type {HTMLElement} */ (document.getElementById('aaSubdivsVal') || document.getElementById('sppVal'));
const aaSubdivsOccurredEl = /** @type {HTMLElement} */ (document.getElementById('aaSubdivsOccurredVal'));
const rateEl = /** @type {HTMLElement} */ (document.getElementById('rateVal'));

// Initialize static labels
if (sizeEl) sizeEl.textContent = `${width} × ${height} px`;
if (aaSubdivsEl) {
    aaSubdivsEl.textContent = maxAntialiasingSubdivisions !== null ? String(maxAntialiasingSubdivisions) : 'Unlimited';
}
if (aaSubdivsOccurredEl) {
    aaSubdivsOccurredEl.textContent = '0';
}
if (btnEl) btnEl.textContent = buttonLabel;
if (statusEl) statusEl.textContent = initialStatus;
if (shadowRaysRow) shadowRaysRow.style.display = shadowRaysForPointLights ? '' : 'none';
if (shadowRaysEl) shadowRaysEl.textContent = '--';
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
    const pixelsFormatted = renderedPixelCount.toLocaleString();
    const totalPixelsFormatted = totalPixels.toLocaleString();
    const subdivsFormatted = aaSubdivisions.toLocaleString();

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
            statusEl.textContent = `Render stopped`;
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
    const hasShadowRays = shadowRaysForPointLights || shadowRaysCast > 0;
    if (shadowRaysRow) {
        shadowRaysRow.style.display = hasShadowRays ? '' : 'none';
    }
    if (shadowRaysEl && hasShadowRays) {
        if (shadowRaysCast > 0) {
            const hitPct = Math.round((shadowRaysReached / shadowRaysCast) * 100);
            shadowRaysEl.textContent = `${shadowRaysReached.toLocaleString()} / ${shadowRaysCast.toLocaleString()} (${hitPct}%)`;
        } else {
            shadowRaysEl.textContent = workerRunning ? '0 / 0' : '--';
        }
    }
    if (pixelsEl) {
        pixelsEl.textContent = `${pixelsFormatted} / ${totalPixelsFormatted} (${pct}%)`;
    }
    if (aaSubdivsOccurredEl) {
        aaSubdivsOccurredEl.textContent = subdivsFormatted;
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
    shadowRaysCast = 0;
    shadowRaysReached = 0;
    aaSubdivisions = 0;
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
        if (statsData) {
            if (typeof statsData.shadowRaysCast === 'number') {
                shadowRaysCast = statsData.shadowRaysCast;
            }
            if (typeof statsData.shadowRaysReached === 'number') {
                shadowRaysReached = statsData.shadowRaysReached;
            }
            if (typeof statsData.aaSubdivisions === 'number') {
                aaSubdivisions = statsData.aaSubdivisions;
            }
        }

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
            raysTraced = renderedPixelCount;
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

export {};
