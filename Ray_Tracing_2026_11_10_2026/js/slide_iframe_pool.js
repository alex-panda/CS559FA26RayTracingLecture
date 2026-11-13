// @ts-check
/**
 * @description Because iframes can be expensive to run, this module pools them,
 * unloading them when they are no longer shown and re-loading them once they
 * are shown again. When not in view, a picture of the iframe's contents is used
 * instead of the iframe itself.
 * 
 * If an iframe has the "keepalive" (or "keep-alive") class, it will not be unloaded
 * when not on the current slide. Instead, a "not_in_view" event is sent to it so
 * that it can unload its contents (e.g. canvases), and an "in_view" event is sent
 * when it is on the current slide once again.
 */

/**
 * @typedef {{
 *   id: string,
 *   slide: HTMLElement,
 *   container: HTMLElement,
 *   originalSrc: string,
 *   attributes: Record<string, string>,
 *   className: string,
 *   styleText: string,
 *   snapshotUrl: string | null,
 *   placeholderImg: HTMLImageElement,
 *   activeIframe: HTMLIFrameElement | null,
 *   isLoaded: boolean,
 *   isKeepAlive: boolean,
 *   isInView: boolean | null,
 * }} PooledIframeRecord
 */

/**
 * Shared reusable pool of detached HTMLIFrameElement instances.
 * @type {HTMLIFrameElement[]}
 */
const iframePool = [];

/**
 * Registry of all pooled iframes keyed by unique identifier.
 * @type {Map<string, PooledIframeRecord>}
 */
const iframeRegistry = new Map();

/**
 * Sequence counter for generating unique pooled iframe identifiers.
 */
let nextPooledIframeId = 1;

/**
 * Generates a styled placeholder poster image as a data URL when direct
 * snapshot extraction from the iframe is unavailable (e.g. cross-origin restrictions).
 * 
 * @param {string} title Display title or URL descriptor
 * @param {string} src Source URL of the iframe
 * @param {number} [width=800] Canvas width in pixels
 * @param {number} [height=450] Canvas height in pixels
 * @returns {string} Data URL of rendered poster image
 */
function generatePosterDataUrl(title, src, width = 800, height = 450) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Dark sleek gradient background matching official UW-Madison dark mode theme (#121212)
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1a1a1a');
    grad.addColorStop(1, '#121212');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle isometric/perspective grid lines
    ctx.strokeStyle = 'rgba(225, 229, 231, 0.035)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Outer card border
    ctx.strokeStyle = 'rgba(225, 229, 231, 0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Center icon & ambient Badger Red glow
    const cx = width / 2;
    const cy = height / 2 - 24;

    ctx.save();
    ctx.translate(cx, cy);

    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 70);
    glow.addColorStop(0, 'rgba(197, 5, 12, 0.28)');
    glow.addColorStop(1, 'rgba(155, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.fill();

    // 3D Isometric cube wireframe icon
    const s = 34;
    ctx.strokeStyle = '#C5050C';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';

    // Top face
    ctx.fillStyle = 'rgba(197, 5, 12, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.866, -s * 0.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-s * 0.866, -s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Left face
    ctx.fillStyle = 'rgba(155, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.moveTo(-s * 0.866, -s * 0.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.866, s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right face
    ctx.fillStyle = 'rgba(197, 5, 12, 0.26)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.866, -s * 0.5);
    ctx.lineTo(s * 0.866, s * 0.5);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Title / Filename text
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    let cleanTitle = title;
    if (!cleanTitle && src) {
        try {
            const url = new URL(src, window.location.href);
            cleanTitle = url.pathname.split('/').filter(Boolean).pop() || url.hostname;
        } catch {
            cleanTitle = src;
        }
    }
    ctx.fillText(cleanTitle || 'Interactive 3D Demo', cx, cy + 64);

    // Subtitle indicator
    ctx.fillStyle = '#E1E5E7';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Interactive frame paused while out of view', cx, cy + 90);

    return canvas.toDataURL('image/png');
}

/**
 * Attempts to capture a snapshot of the iframe's rendered contents.
 * Returns null if blocked by cross-origin security or if no canvas is present.
 * 
 * @param {HTMLIFrameElement} iframe
 * @returns {string | null}
 */
function captureSnapshot(iframe) {
    if (!iframe) return null;

    // Check for explicit poster / snapshot override attribute
    if (iframe.dataset && iframe.dataset.poster) {
        return iframe.dataset.poster;
    }
    if (iframe.dataset && iframe.dataset.snapshot) {
        return iframe.dataset.snapshot;
    }

    // Try reading directly from same-origin iframe document
    try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
            // Check for canvas elements (Three.js, WebGL, 2D)
            const canvases = Array.from(doc.querySelectorAll('canvas'));
            for (const canvas of canvases) {
                if (canvas.width > 0 && canvas.height > 0) {
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        if (dataUrl && dataUrl !== 'data:,' && !dataUrl.startsWith('data:,')) {
                            return dataUrl;
                        }
                    } catch {
                        // Tainted canvas or WebGL preserveDrawingBuffer: false
                    }
                }
            }
        }
    } catch {
        // Cross-origin access blocked by browser Same-Origin Policy
    }

    return null;
}

/**
 * Extracts all non-src HTML attributes from an element into a key-value record.
 * 
 * @param {HTMLElement} el
 * @returns {Record<string, string>}
 */
function extractAttributes(el) {
    /** @type {Record<string, string>} */
    const attrs = {};
    for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr.name.toLowerCase() !== 'src') {
            attrs[attr.name] = attr.value;
        }
    }
    return attrs;
}

/**
 * Dispatches view lifecycle events to an iframe using postMessage and DOM events.
 * 
 * @param {HTMLIFrameElement | null} iframe Target iframe
 * @param {'in_view' | 'not_in_view'} eventType Lifecycle event type
 */
function sendViewEvent(iframe, eventType) {
    if (!iframe) return;

    // 1. Cross-window postMessage (send both object and string for broad consumer support)
    try {
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: eventType }, '*');
            iframe.contentWindow.postMessage(eventType, '*');
        }
    } catch {
        // Cross-origin restriction or detached window
    }

    // 2. Direct DOM CustomEvent (if same-origin)
    try {
        const win = iframe.contentWindow;
        if (win) {
            win.dispatchEvent(new CustomEvent(eventType, { detail: { type: eventType } }));
            if (win.document) {
                win.document.dispatchEvent(new CustomEvent(eventType, { detail: { type: eventType } }));
            }
        }
    } catch {
        // Blocked by same-origin policy
    }
}

/**
 * Scans the slides container and registers all eligible iframes into the pool.
 * Iframes with the 'keepalive' (or 'keep-alive') class are marked as keepalive
 * and not unloaded when off-slide; instead, in_view / not_in_view events are dispatched.
 */
function discoverAndRegisterIframes() {
    const iframes = Array.from(
        document.querySelectorAll('.reveal .slides section iframe')
    );

    for (const iframe_ of iframes) {
        const iframe = /** @type {HTMLIFrameElement} */ (iframe_);
        const isKeepAlive = iframe.classList.contains('keepalive') || iframe.classList.contains('keep-alive');

        // Check if already registered
        if (iframe.dataset.pooledIframeId && iframeRegistry.has(iframe.dataset.pooledIframeId)) {
            continue;
        }

        const parent = iframe.parentElement;
        const slide = /** @type {HTMLElement | null} */ (iframe.closest('section:not(.stack)') || iframe.closest('section'));
        if (!parent || !slide) {
            continue;
        }

        const id = iframe.id || `pooled-iframe-${nextPooledIframeId++}`;
        iframe.dataset.pooledIframeId = id;

        const originalSrc = iframe.getAttribute('src') || iframe.src;
        const attributes = extractAttributes(iframe);
        const className = iframe.className || 'iframe';
        const styleText = iframe.style.cssText;

        // Create the placeholder <img> element
        const placeholderImg = document.createElement('img');
        placeholderImg.className = `${className} iframe-placeholder`.trim();
        placeholderImg.alt = iframe.title || 'Interactive iframe preview snapshot';
        placeholderImg.dataset.pooledIframeId = id;
        if (styleText) {
            placeholderImg.style.cssText = styleText;
        }
        placeholderImg.style.display = 'block';

        /** @type {PooledIframeRecord} */
        const record = {
            id,
            slide,
            container: parent,
            originalSrc,
            attributes,
            className,
            styleText,
            snapshotUrl: iframe.dataset.poster || iframe.dataset.snapshot || null,
            placeholderImg,
            activeIframe: iframe,
            isLoaded: true,
            isKeepAlive,
            isInView: null,
        };

        if (isKeepAlive) {
            iframe.addEventListener('load', () => {
                if (record.isInView !== null) {
                    sendViewEvent(iframe, record.isInView ? 'in_view' : 'not_in_view');
                }
            });
        }

        iframeRegistry.set(id, record);
    }
}

/**
 * Unloads a pooled iframe from the DOM, replaces it with a still image snapshot,
 * clears its source to terminate running scripts/WebGL, and returns the element to the pool.
 * 
 * @param {PooledIframeRecord} record
 */
function unloadIframe(record) {
    if (!record.isLoaded || !record.activeIframe) {
        return;
    }

    const iframe = record.activeIframe;

    // 1. Capture snapshot if possible
    const captured = captureSnapshot(iframe);
    if (captured) {
        record.snapshotUrl = captured;
    } else if (!record.snapshotUrl) {
        // Generate poster preview if no snapshot exists yet
        const width = iframe.clientWidth || 800;
        const height = iframe.clientHeight || 450;
        record.snapshotUrl = generatePosterDataUrl(
            iframe.title || iframe.getAttribute('title') || '',
            record.originalSrc,
            width,
            height
        );
    }

    // 2. Assign image source
    if (record.snapshotUrl) {
        record.placeholderImg.src = record.snapshotUrl;
    }

    // 3. Swap iframe in the DOM with the placeholder image
    if (iframe.parentNode) {
        iframe.parentNode.replaceChild(record.placeholderImg, iframe);
    }

    // 4. Terminate iframe execution and recycle into pool
    try {
        iframe.src = 'about:blank';
    } catch {
        // Ignore navigation error on unloading frame
    }

    iframePool.push(iframe);
    record.activeIframe = null;
    record.isLoaded = false;
}

/**
 * Loads an iframe from the pool, restores its original attributes and source,
 * and swaps it into the DOM in place of the placeholder image.
 * 
 * @param {PooledIframeRecord} record
 */
function loadIframe(record) {
    if (record.isLoaded && record.activeIframe) {
        return;
    }

    // Acquire iframe from pool or create new element
    const iframe = iframePool.pop() || document.createElement('iframe');

    // Restore attributes
    for (const [key, value] of Object.entries(record.attributes)) {
        iframe.setAttribute(key, value);
    }

    iframe.className = record.className;
    if (record.styleText) {
        iframe.style.cssText = record.styleText;
    }
    iframe.dataset.pooledIframeId = record.id;

    // Swap placeholder image with active iframe
    if (record.placeholderImg.parentNode) {
        record.placeholderImg.parentNode.replaceChild(iframe, record.placeholderImg);
    } else if (record.container) {
        record.container.appendChild(iframe);
    }

    // Load source
    iframe.src = record.originalSrc;

    // Attempt to update snapshot once the iframe has finished loading
    iframe.addEventListener('load', () => {
        const snap = captureSnapshot(iframe);
        if (snap) {
            record.snapshotUrl = snap;
        }
    }, { once: true });

    record.activeIframe = iframe;
    record.isLoaded = true;
}

/**
 * Updates iframe states based on the currently active slide.
 * Unloads iframes on inactive slides (replacing them with still images)
 * and loads/re-loads iframes when their slide comes into view.
 * 
 * @param {HTMLElement | null} [currentSlide] Active slide element.
 * @param {number} [indexH] Horizontal slide index.
 * @param {number} [indexV] Vertical slide index.
 */
function update(currentSlide, indexH, indexV) {
    // Discover any newly mounted iframes (e.g. from markdown render)
    discoverAndRegisterIframes();

    for (const record of iframeRegistry.values()) {
        const isCurrentSlide = Boolean(
            currentSlide && (
                record.slide === currentSlide ||
                currentSlide.contains(record.container) ||
                currentSlide.contains(record.slide)
            )
        );

        if (record.isKeepAlive) {
            // Keepalive iframe remains mounted; dispatch in_view / not_in_view lifecycle notifications
            if (isCurrentSlide) {
                if (record.isInView !== true) {
                    record.isInView = true;
                    sendViewEvent(record.activeIframe, 'in_view');
                }
            } else {
                if (record.isInView !== false) {
                    record.isInView = false;
                    sendViewEvent(record.activeIframe, 'not_in_view');
                }
            }
            continue;
        }

        if (isCurrentSlide) {
            loadIframe(record);
        } else {
            unloadIframe(record);
        }
    }
}

/**
 * Initialization function called when Reveal.js is ready.
 * Registers iframes, establishes event listeners for slide changes,
 * and sets up cross-frame message listener for snapshot communication.
 * 
 * @param {any} Reveal Reveal.js instance
 * @param {any} event Reveal ready event
 */
export function onRevealReady(Reveal, event) {
    // Listen for optional snapshot data posted from cooperating iframes
    window.addEventListener('message', (msgEvent) => {
        if (!msgEvent.data || typeof msgEvent.data !== 'object') return;
        const { type, id, dataUrl } = msgEvent.data;
        if (type === 'iframe-snapshot' && dataUrl) {
            const record = id ? iframeRegistry.get(id) : Array.from(iframeRegistry.values()).find(r => r.activeIframe?.contentWindow === msgEvent.source);
            if (record) {
                record.snapshotUrl = dataUrl;
                if (!record.isLoaded && record.placeholderImg) {
                    record.placeholderImg.src = dataUrl;
                }
            }
        }
    });

    // Initial update for starting slide
    const initialSlide = event?.currentSlide || (Reveal.getCurrentSlide ? Reveal.getCurrentSlide() : null);
    update(initialSlide, event?.indexh, event?.indexv);

    // Update on slide navigation
    Reveal.on('slidechanged', (/** @type {any} */ evt) => {
        update(evt.currentSlide, evt.indexh, evt.indexv);
    });

    // Update on overview mode toggle
    Reveal.on('overviewhidden', () => {
        const slide = Reveal.getCurrentSlide ? Reveal.getCurrentSlide() : null;
        update(slide);
    });
}


