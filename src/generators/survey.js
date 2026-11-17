import { createRng, randomRange } from '../core/prng.js';
import { pointInPolygon, boundsOf } from '../core/geometry.js';

export const SIZE_PRESETS = Object.freeze({ small: 260, medium: 390, large: 560 });
export const MORPHOLOGY_PRESETS = Object.freeze(['radial', 'organic', 'linear', 'planned']);

// Plan boundaries are star-shaped so every interior mesh can be guaranteed to
// stay inside the proposed city extent. The four presets have distinct forms.
export function generateSurvey(seed, size, morphology = 'radial') {
  const radius = SIZE_PRESETS[size] ?? SIZE_PRESETS.medium;
  const shape = MORPHOLOGY_PRESETS.includes(morphology) ? morphology : 'radial';
  const rng = createRng(shape === 'radial' ? `${seed}:survey:v1:${size}` : `${seed}:survey:v2:${size}:${shape}`);
  const phase = randomRange(rng, -Math.PI, Math.PI);
  const waveA = randomRange(rng, 0.015, 0.065);
  const waveB = randomRange(rng, 0.012, 0.048);
  const bendPhase = randomRange(rng, -1.1, 1.1);
  const gridAngle = shape === 'planned' ? randomRange(rng, -0.075, 0.075) : 0;
  const count = 64;
  const boundary = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    if (shape === 'radial') {
      const r = radius * (1 + Math.sin(a * 3 + phase) * waveA + Math.cos(a * 7 - phase) * waveB);
      return { x: ca * r, y: sa * r * 0.86 };
    }
    if (shape === 'linear') {
      // A long trade-road corridor with a curved axis, not a stretched ring.
      const x = ca * radius * 2.50;
      return { x, y: sa * radius * 0.72 + radius * 0.12 * Math.sin(x / radius * 1.05 + bendPhase) };
    }
    if (shape === 'planned') {
      // Superellipse is a softly chamfered rectangle; grid streets run parallel
      // to its axes. Rotating all geometry together retains the planned layout.
      const power = 0.27;
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), power) * radius * 1.07;
      const y = Math.sign(sa) * Math.pow(Math.abs(sa), power) * radius * 0.82;
      return { x: x * Math.cos(gridAngle) - y * Math.sin(gridAngle),
        y: x * Math.sin(gridAngle) + y * Math.cos(gridAngle) };
    }
    const r = radius * (1 + 0.19 * Math.sin(2 * a + phase) +
      0.095 * Math.cos(5 * a - 0.55 * phase) + 0.07 * Math.sin(3 * a + bendPhase));
    return { x: ca * r * 1.11 + radius * 0.11,
      y: sa * r * 0.91 - radius * 0.065 };
  });

  // Survey sites are guides. They are not streets, blocks or buildings.
  const anchors = [{ id: 'SITE-00', kind: 'center', x: 0, y: 0 }];
  const target = size === 'small' ? 7 : size === 'large' ? 15 : 11;
  const bounds = boundsOf(boundary);
  const minimumGap = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.12;
  let attempts = 0;
  while (anchors.length <= target && attempts++ < target * 120) {
    let candidate;
    if (shape === 'radial') {
      const a = randomRange(rng, 0, 2 * Math.PI);
      const r = radius * Math.sqrt(rng()) * 0.79;
      candidate = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86 };
    } else {
      candidate = { x: randomRange(rng, bounds.minX * 0.87, bounds.maxX * 0.87),
        y: randomRange(rng, bounds.minY * 0.87, bounds.maxY * 0.87) };
    }
    if (!pointInPolygon(candidate, boundary)) continue;
    if (anchors.some(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < minimumGap)) continue;
    anchors.push({ id: `SITE-${String(anchors.length).padStart(2, '0')}`, kind: 'survey', ...candidate });
  }
  return { boundary, anchors, nominalRadius: radius,
    morphology: shape, plannedAngle: gridAngle, linearBendPhase: bendPhase };
}
