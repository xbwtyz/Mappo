import { createRng, randomRange } from '../core/prng.js';
import { pointInPolygon } from '../core/geometry.js';

export const SIZE_PRESETS = Object.freeze({ small: 260, medium: 390, large: 560 });

// Milestone 1 only: a deterministic survey footprint, NOT generated city geometry.
export function generateSurvey(seed, size) {
  const radius = SIZE_PRESETS[size] ?? SIZE_PRESETS.medium;
  const rng = createRng(`${seed}:survey:v1:${size}`);
  const phase = randomRange(rng, -Math.PI, Math.PI);
  const waveA = randomRange(rng, 0.015, 0.065);
  const waveB = randomRange(rng, 0.012, 0.048);
  const count = 64;
  const boundary = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const r = radius * (1 + Math.sin(a * 3 + phase) * waveA + Math.cos(a * 7 - phase) * waveB);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86 };
  });

  const anchors = [{ id: 'SITE-00', kind: 'center', x: 0, y: 0 }];
  const target = size === 'small' ? 7 : size === 'large' ? 15 : 11;
  let attempts = 0;
  while (anchors.length <= target && attempts++ < target * 50) {
    const a = randomRange(rng, 0, 2 * Math.PI);
    const r = radius * Math.sqrt(rng()) * 0.79;
    const candidate = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86 };
    if (!pointInPolygon(candidate, boundary)) continue;
    if (anchors.some(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < radius * 0.18)) continue;
    anchors.push({ id: `SITE-${String(anchors.length).padStart(2, '0')}`, kind: 'survey', ...candidate });
  }
  return { boundary, anchors, nominalRadius: radius };
}
