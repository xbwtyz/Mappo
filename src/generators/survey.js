import {
  createRng,
  randomRange
} from '../core/prng.js';
import {
  pointInPolygon,
  boundsOf,
  clamp
} from '../core/geometry.js';

export const SIZE_PRESETS = Object.freeze({
  small: 260,
  medium: 390,
  large: 560
});
export const MORPHOLOGY_PRESETS = Object.freeze(['radial', 'organic', 'linear', 'planned']);
export const SHAPE_PROFILES = Object.freeze(['balanced', 'wedge', 'crescent', 'twin', 'branching']);

const DEFAULT_SHAPE_OPTIONS = Object.freeze({
  radial: {
    profile: 'balanced',
    stretch: 34,
    asymmetry: 28,
    bend: 18
  },
  organic: {
    profile: 'balanced',
    stretch: 30,
    asymmetry: 58,
    bend: 44
  },
  linear: {
    profile: 'balanced',
    stretch: 78,
    asymmetry: 30,
    bend: 42
  },
  planned: {
    profile: 'balanced',
    stretch: 42,
    asymmetry: 16,
    bend: 12
  }
});

function clampPercent(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(clamp(numeric, 0, 100)) : fallback;
}

export function normalizeShapeOptions(options = {}, morphology = 'radial') {
  const defaults = DEFAULT_SHAPE_OPTIONS[morphology] ?? DEFAULT_SHAPE_OPTIONS.radial;
  const profile = SHAPE_PROFILES.includes(options.profile) ? options.profile : defaults.profile;
  return {
    profile,
    stretch: clampPercent(options.stretch, defaults.stretch),
    asymmetry: clampPercent(options.asymmetry, defaults.asymmetry),
    bend: clampPercent(options.bend, defaults.bend)
  };
}

function buildBoundaryPoint(angle, radius, morphology, shapeOptions, phase, bendPhase, orientation) {
  const stretch = shapeOptions.stretch / 100;
  const asymmetry = shapeOptions.asymmetry / 100;
  const bend = shapeOptions.bend / 100;
  const local = angle - orientation;
  const ca = Math.cos(local);
  const sa = Math.sin(local);
  const profileAngle = local - phase * 0.37;
  let profileScale = 1;
  const profileStrength = (0.16 + asymmetry * 0.18) * (morphology === 'organic' ? 0.72 : 1);
  switch (shapeOptions.profile) {
    case 'wedge':
      profileScale *= 1 - profileStrength * 0.65 * Math.cos(profileAngle) + profileStrength * 0.18 * Math.cos(profileAngle * 2);
      break;
    case 'crescent':
      profileScale *= 0.93 + profileStrength * 0.58 * Math.sin(profileAngle - 0.5) - profileStrength * 0.28 * Math.cos(profileAngle * 2);
      break;
    case 'twin':
      profileScale *= 0.95 + profileStrength * 0.60 * Math.cos(profileAngle * 2);
      break;
    case 'branching':
      profileScale *= 0.90 + profileStrength * 0.55 * Math.cos(profileAngle * 3) + profileStrength * 0.08 * Math.sin(profileAngle);
      break;
    default:
      break;
  }

  profileScale = Math.max(0.7, profileScale);

  let aspectX = 1 + stretch * 0.38;
  let aspectY = 0.86 - stretch * 0.08;
  let irregular = 0;
  let base = 1;

  if (morphology === 'linear') {
    aspectX = 1.8 + stretch * 0.95;
    aspectY = 0.48 - stretch * 0.08;
    irregular = 0.02 + asymmetry * 0.02;
    base += (0.05 + bend * 0.16) * Math.sin(ca * 2.25 + bendPhase) * (0.35 + 0.65 * Math.abs(ca));
  } else if (morphology === 'planned') {
    aspectX = 0.96 + stretch * 0.32;
    aspectY = 0.76 - stretch * 0.06;
    irregular = 0.01 + asymmetry * 0.015;
    const power = 0.27 + bend * 0.04;
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), power) * radius * aspectX * profileScale;
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), power) * radius * aspectY * profileScale;
    return {
      x: sx * Math.cos(orientation) - sy * Math.sin(orientation),
      y: sx * Math.sin(orientation) + sy * Math.cos(orientation)
    };
  } else if (morphology === 'organic') {
    aspectX = 1.03 + stretch * 0.22;
    aspectY = 0.90 - stretch * 0.05;
    irregular = 0.08 + asymmetry * 0.08;
    base += 0.15 * Math.sin(2 * local + phase) + 0.09 * Math.cos(5 * local - 0.55 * phase) + 0.08 * Math.sin(3 * local + bendPhase);
  } else {
    irregular = 0.03 + asymmetry * 0.03;
    base += 0.05 * Math.sin(3 * local + phase) + 0.03 * Math.cos(7 * local - phase);
  }

  base += irregular * Math.sin(4 * local + phase * 1.2) + irregular * 0.55 * Math.cos(7 * local - bendPhase);
  const r = radius * base * profileScale;
  const rawX = ca * r * aspectX;
  const rawY = sa * r * aspectY;
  return {
    x: rawX * Math.cos(orientation) - rawY * Math.sin(orientation),
    y: rawX * Math.sin(orientation) + rawY * Math.cos(orientation)
  };
}

// Plan boundaries remain star-shaped from the origin so downstream radial
// queries always intersect the city edge exactly once.
export function generateSurvey(seed, size, morphology = 'radial', shapeOverrides = {}) {
  const radius = SIZE_PRESETS[size] ?? SIZE_PRESETS.medium;
  const shape = MORPHOLOGY_PRESETS.includes(morphology) ? morphology : 'radial';
  const shapeOptions = normalizeShapeOptions(shapeOverrides, shape);
  const rng = createRng(`${seed}:survey:v3:${size}:${shape}:${shapeOptions.profile}:${shapeOptions.stretch}:${shapeOptions.asymmetry}:${shapeOptions.bend}`);
  const phase = randomRange(rng, -Math.PI, Math.PI);
  const bendPhase = randomRange(rng, -1.1, 1.1);
  const orientation = shape === 'planned' ?
    randomRange(rng, -0.085, 0.085) :
    randomRange(rng, -0.55, 0.55) * (shapeOptions.bend / 100);
  const count = 64;
  const boundary = Array.from({
    length: count
  }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return buildBoundaryPoint(a, radius, shape, shapeOptions, phase, bendPhase, orientation);
  });

  const anchors = [{
    id: 'SITE-00',
    kind: 'center',
    x: 0,
    y: 0
  }];
  const target = size === 'small' ? 7 : size === 'large' ? 15 : 11;
  const bounds = boundsOf(boundary);
  const minimumGap = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.12;
  let attempts = 0;
  while (anchors.length <= target && attempts++ < target * 120) {
    let candidate;
    if (shape === 'radial') {
      const a = randomRange(rng, 0, 2 * Math.PI);
      const r = radius * Math.sqrt(rng()) * 0.79;
      candidate = {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.86
      };
    } else {
      candidate = {
        x: randomRange(rng, bounds.minX * 0.87, bounds.maxX * 0.87),
        y: randomRange(rng, bounds.minY * 0.87, bounds.maxY * 0.87)
      };
    }
    if (!pointInPolygon(candidate, boundary)) continue;
    if (anchors.some(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < minimumGap)) continue;
    anchors.push({
      id: `SITE-${String(anchors.length).padStart(2, '0')}`,
      kind: 'survey',
      ...candidate
    });
  }

  return {
    boundary,
    anchors,
    nominalRadius: radius,
    morphology: shape,
    plannedAngle: orientation,
    linearBendPhase: bendPhase,
    axisAngle: orientation,
    shapeOptions
  };
}
