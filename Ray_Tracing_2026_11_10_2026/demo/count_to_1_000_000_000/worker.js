// worker.js - Background thread counting to target without blocking the UI
let isCancelled = false;

self.onmessage = async function (event) {
    const { action, targetCount, delayMs, startCount, initialElapsedMs } = event.data || {};

    if (action === 'stop') {
        isCancelled = true;
        return;
    }

    if (action !== 'start') return;
    isCancelled = false;

    const rawTarget = Number(targetCount);
    const target = (Number.isFinite(rawTarget) && rawTarget > 0) ? Math.floor(rawTarget) : 1_000_000_000;
    const rawStart = Number(startCount);
    const start = (Number.isFinite(rawStart) && rawStart >= 0 && rawStart < target) ? Math.floor(rawStart) : 0;
    const delay = Number(delayMs) || 0;
    const baseElapsed = (Number.isFinite(Number(initialElapsedMs)) && Number(initialElapsedMs) >= 0) ? Number(initialElapsedMs) : 0;
    const updateDelay = 10; // milliseconds

    const t0 = performance.now();
    let lastReport = t0;

    self.postMessage({
        type: 'start',
        count: start,
        target,
        elapsedMs: baseElapsed
    });

    if (delay <= 0) {
        // Addition loop without sleep
        const mask = target > 10_000_000 ? 0x1FFFFF : (target > 100_000 ? 0xFFFF : 0xFF);
        let i = start;
        while (i < target) {
            if (isCancelled) return;
            if ((i & mask) === 0) {
                const now = performance.now();
                if (now - lastReport >= updateDelay) {
                    lastReport = now;
                    self.postMessage({
                        type: 'progress',
                        count: i,
                        target,
                        elapsedMs: baseElapsed + (now - t0)
                    });
                }
            }
            i += 1;
        }
    } else {
        // Addition loop with sleep
        const sleep = (ms) => {
            // busy loop because js doesn't have a real sleep function and we know that this is in a worker thread
            const start = performance.now();
            while (performance.now() - start <= ms) { }
        };
        let i = start;
        while (i < target) {
            if (isCancelled) return;
            sleep(delay);
            i += 1;
            const now = performance.now();
            if (now - lastReport >= updateDelay) {
                lastReport = now;
                self.postMessage({
                    type: 'progress',
                    count: i,
                    target,
                    elapsedMs: baseElapsed + (now - t0)
                });
            }
        }
    }

    if (isCancelled) return;

    const tFinal = performance.now();
    self.postMessage({
        type: 'done',
        count: target,
        target,
        elapsedMs: baseElapsed + (tFinal - t0)
    });
};
