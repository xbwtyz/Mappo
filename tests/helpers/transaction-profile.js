// S1-A diagnostics for test-instrumented pages only. No runtime import.
// Inclusive timings show call cost; self timings subtract nested instrumented
// calls so their sum is never presented as independent inclusive costs.
export function createTransactionProfiler(now) {
  let active = null;
  const stack = [];
  return {
    begin(label) {
      if (active || stack.length) throw Error('Transaction profile already active');
      active = {label, started: now(), phases: Object.create(null)};
    },
    finish() {
      if (!active || stack.length) throw Error('Transaction profile is not settled');
      const {label, started, phases} = active;
      const wallMs = now() - started;
      active = null;
      const rows = Object.entries(phases).map(([name, row]) => ({name, ...row}));
      const measuredSelfMs = rows.reduce((sum, row) => sum + row.selfMs, 0);
      return {label, wallMs, measuredSelfMs,
        uninstrumentedWallMs: Math.max(0, wallMs - measuredSelfMs), phases: rows};
    },
    wrap(name, fn) {
      if (typeof fn !== 'function') throw Error('Missing transaction phase: ' + name);
      return function (...args) {
        if (!active) return Reflect.apply(fn, this, args);
        const frame = {started: now(), children: 0};
        stack.push(frame);
        try { return Reflect.apply(fn, this, args); }
        finally {
          const elapsed = now() - frame.started;
          stack.pop();
          if (stack.length) stack.at(-1).children += elapsed;
          const row = active.phases[name] ??= {calls: 0, inclusiveMs: 0, selfMs: 0};
          row.calls++;
          row.inclusiveMs += elapsed;
          row.selfMs += Math.max(0, elapsed - frame.children);
        }
      };
    }
  };
}

// These wrappers exist exclusively in the QA-instrumented copy of index.html.
// All named phases are synchronous. Asynchronous worker time, scheduler waits
// and uninstrumented UI work remain in the wall-time residual.
const functions = [
  'stageMountedIdentityEdit', 'acceptMountedIdentityEdit', 'idaMountedPreview',
  'commitRoadIdentityApply', 'idaRoadApplyReconstruct', 'idaRoadApplyAllocated',
  'prepareAcceptedIdentityTransaction', 'verifyIdentityAdditions',
  'validateActiveIdentityInventory', 'validateJsonTree', 'validateStoredProject',
  'copyJson', 'forkAcceptedHistoryD01', 'idaSessionPublishedState', 'idaSessionRead'
];
const methods = [
  ['AcceptedIdentitySession', 'commit'], ['AcceptedIdentitySession', 'replay'],
  ...['canRecord', 'fits', 'record', 'can', 'prepare', 'accept', 'summaries']
    .map(name => ['AcceptedEditHistoryD01', name])
];
export const transactionProfileObservation = `
const idaQAProfiler = (${createTransactionProfiler.toString()})(() => performance.now());
${functions.map(name => name + " = idaQAProfiler.wrap('" + name + "', " + name + ");").join('\n')}
${methods.map(([owner, name]) => owner + ".prototype." + name +
  " = idaQAProfiler.wrap('" + owner + "." + name + "', " + owner + ".prototype." + name + ");").join('\n')}
JSON.stringify = idaQAProfiler.wrap('JSON.stringify', JSON.stringify);
JSON.parse = idaQAProfiler.wrap('JSON.parse', JSON.parse);
__buildingQA.transactionProfile = {begin: idaQAProfiler.begin, finish: idaQAProfiler.finish};
`;

// Fail loudly if instrumentation misses the real acceptance path; do not
// infer zero cost from missing observations or silently drop a sample.
export function requireTransactionPhases(profile, names) {
  if (!profile || !Number.isFinite(profile.wallMs) || profile.wallMs < 0 ||
      !Number.isFinite(profile.measuredSelfMs) || profile.measuredSelfMs > profile.wallMs + 1)
    throw Error('Invalid transaction profile wall-time accounting');
  for (const name of names) {
    const row = profile.phases.find(p => p.name === name);
    if (!row || !Number.isInteger(row.calls) || row.calls < 1)
      throw Error('Required transaction phase not observed: ' + name);
  }
  return profile;
}

export function summarizeTransactionProfiles(profiles) {
  if (!profiles.length) throw Error('No transaction profile samples');
  const n = profiles.length, phases = new Map();
  const round = x => Math.round(x * 10) / 10;
  let wall = 0, self = 0, residual = 0;
  for (const p of profiles) {
    wall += p.wallMs; self += p.measuredSelfMs; residual += p.uninstrumentedWallMs;
    for (const row of p.phases) {
      if (!phases.has(row.name)) phases.set(row.name, {calls:0, inclusiveMs:0, selfMs:0});
      const total = phases.get(row.name);
      total.calls += row.calls;
      total.inclusiveMs += row.inclusiveMs;
      total.selfMs += row.selfMs;
    }
  }
  return {samples:n, meanWallMs:round(wall/n), meanMeasuredSelfMs:round(self/n),
    meanUninstrumentedWallMs:round(residual/n),
    phases:[...phases].sort((a,b)=>b[1].selfMs-a[1].selfMs).map(([name,v])=>({
      name, totalCalls:v.calls, meanCalls:round(v.calls/n),
      meanInclusiveMs:round(v.inclusiveMs/n), meanSelfMs:round(v.selfMs/n)
    }))};
}
