// One reproducible pseudo-random stream per seed. Avoid Math.random in generation.
export function normalizeSeed(value) {
  return String(value ?? '').trim().slice(0, 64) || 'mappo';
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of normalizeSeed(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}
