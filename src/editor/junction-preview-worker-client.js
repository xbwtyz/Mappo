// The single-file build injects ROAD_JUNCTION_WORKER_SOURCE_P1 at compile time.
// In ESM-only environments the UI retains the synchronous preview fallback.

// Only one active calculation is permitted. Cancellation terminates the worker
// itself, so a superseded noninterruptible CPU calculation cannot block the
// next draft behind an ever-growing postMessage queue.
export function createJunctionPreviewControllerP2(createWorker, { timeoutMs = 30000 } = {}) {
  let worker = null, pending = null, nextId = 0, terminated = false;
  const failure = (message, name = 'Error') => Object.assign(new Error(message), { name });
  const abort = (message = 'Superseded junction preview.') => {
    const task = pending;
    pending = null;
    if (task) {
      clearTimeout(task.timer);
      task.reject(failure(message, 'AbortError'));
    }
    return Boolean(task);
  };
  const recycle = () => {
    const old = worker;
    worker = null;
    if (old) old.terminate();
  };
  const cancel = () => {
    if (!abort()) return false;
    recycle();
    return true;
  };
  const suspend = () => {
    cancel();
    recycle();
  };
  const failWorker = (source, message) => {
    if (worker !== source) return;
    const task = pending;
    pending = null;
    if (task) {
      clearTimeout(task.timer);
      task.reject(failure(message));
    }
    recycle();
  };
  const prepare = () => {
    if (terminated) throw failure('Junction preview controller was terminated.');
    if (worker) return worker;
    const created = createWorker(); // May fail (e.g., unsupported CSP).
    worker = created;
    created.addEventListener('message', ({ data }) => {
      if (worker !== created || !pending || data?.requestId !== pending.requestId) return;
      const task = pending;
      pending = null;
      clearTimeout(task.timer);
      if (data.error) task.reject(failure(data.error));
      else if (!Object.prototype.hasOwnProperty.call(data, 'result'))
        task.reject(failure('Background junction preview returned no result.'));
      else task.resolve(data.result);
    });
    created.addEventListener('error', (event) => {
      failWorker(created, 'Background junction preview failed: ' + (event.message || 'worker error'));
    });
    created.addEventListener('messageerror', () => {
      failWorker(created, 'Background junction preview response could not be decoded.');
    });
    return created;
  };
  const compute = input => {
    if (terminated) return Promise.reject(failure('Junction preview controller was terminated.'));
    cancel(); // Latest request wins even if callers omit cancel().
    return new Promise((resolve, reject) => {
      let active;
      try {
        active = prepare();
        const requestId = ++nextId;
        pending = { requestId, resolve, reject, timer: undefined };
        // Structured-clone failures never leave a stuck pending request.
        active.postMessage({ requestId, ...input });
        if (pending?.requestId === requestId) {
          pending.timer = setTimeout(() => {
            failWorker(active, 'Background junction preview timed out after ' + timeoutMs + ' ms.');
          }, timeoutMs);
        }
      } catch (error) {
        if (pending) {
          clearTimeout(pending.timer);
          pending = null;
        }
        recycle();
        reject(error);
      }
    });
  };
  compute.cancel = cancel;
  compute.suspend = suspend; // Called on editor exit; recreate lazily on next edit.
  compute.terminate = () => { terminated = true; suspend(); };
  compute.warmup = () => { prepare(); };
  return compute;
}

export function createJunctionPreviewWorkerP1() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' ||
      typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' ||
      typeof ROAD_JUNCTION_WORKER_SOURCE_P1 !== 'string') return null;
  const createWorker = () => {
    const url = URL.createObjectURL(new Blob([ROAD_JUNCTION_WORKER_SOURCE_P1],
      { type: 'text/javascript' }));
    try {
      return new Worker(url, { name: 'mappo-c7-junction-preview' });
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const compute = createJunctionPreviewControllerP2(createWorker);
  try {
    compute.warmup(); // Preserve P1's synchronous fallback on startup failures.
  } catch (error) {
    compute.terminate();
    console.warn('Junction worker unavailable; using synchronous fallback:', error);
    return null;
  }
  return compute;
}
