// The compiled offline HTML injects this source constant at build-time.
// Raw ESM usage safely falls back to the existing synchronous session path.
export function createJunctionPreviewWorkerP1() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' ||
      typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' ||
      typeof ROAD_JUNCTION_WORKER_SOURCE_P1 !== 'string') return null;
  let worker, url;
  try {
    url = URL.createObjectURL(new Blob([ROAD_JUNCTION_WORKER_SOURCE_P1], { type: 'text/javascript' }));
    worker = new Worker(url, { name: 'mappo-c7-junction-preview' });
  } catch (error) {
    console.warn('Junction worker unavailable; using synchronous fallback:', error);
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
  let nextId = 0, failed = null;
  const pending = new Map();
  const rejectAll = message => {
    failed = message;
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
    worker.terminate();
  };
  worker.addEventListener('message', event => {
    const { requestId, result, error } = event.data ?? {};
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    if (error) entry.reject(new Error(error)); else entry.resolve(result);
  });
  worker.addEventListener('error', event => {
    rejectAll('Junction preview worker failed: ' + (event.message || 'unknown worker error'));
  });
  const compute = ({ project, junctionId, point, decisions }) => {
    if (failed) return Promise.reject(new Error(failed));
    return new Promise((resolve, reject) => {
      const requestId = ++nextId;
      pending.set(requestId, { resolve, reject });
      try { worker.postMessage({ requestId, project, junctionId, point, decisions }); }
      catch (error) { pending.delete(requestId); reject(error); }
    });
  };
  compute.terminate = () => rejectAll('Junction preview worker stopped.');
  return compute;
}
