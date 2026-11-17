import {
  cleanOutline,
  findCityCenter,
  validateBoundary,
  checkNarrowSections,
  clearance,
  insideOrOn,
  distanceToSegment
} from '../core/boundary.js';
import {
  generateSurvey
} from '../generators/survey.js';

export function makeStartingOutline(kind, seed, size) {
  if (['radial', 'organic', 'linear', 'planned'].includes(kind)) return generateSurvey(seed, size, kind).boundary;
  const radius = size === 'small' ? 260 : size === 'large' ? 560 : 390;
  const shapes = {
    wedge: [
      [-1, -.9],
      [.65, -.6],
      [1.2, 0],
      [.6, .7],
      [-1, 1]
    ],
    twin: [
      [-1.35, -.65],
      [-.4, -.65],
      [-.25, -.2],
      [.25, -.2],
      [.4, -.65],
      [1.35, -.65],
      [1.35, .65],
      [.4, .65],
      [.25, .2],
      [-.25, .2],
      [-.4, .65],
      [-1.35, .65]
    ],
    branching: [
      [-.28, -.1],
      [-1.1, -.8],
      [-.8, -1.1],
      [0, -.35],
      [.8, -1.1],
      [1.1, -.8],
      [.28, -.1],
      [.28, 1.1],
      [-.28, 1.1]
    ],
    crescent: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [.45, 1],
      [.45, -.4],
      [-.45, -.4],
      [-.45, 1],
      [-1, 1]
    ]
  };
  return cleanOutline(shapes[kind].map(([x, y]) => ({
    x: x * radius,
    y: y * radius
  })), 0);
}

export class OutlineEditor {
  constructor(onChange, onMessage) {
    this.onChange = onChange;
    this.onMessage = onMessage;
    this.mode = 'pan';
    this.boundary = [];
    this.center = null;
    this.closed = true;
    this.dirty = false;
    this.error = false;
    this.selected = -1;
    this.history = [];
    this.stroke = false;
    this.dragging = -1;
  }
  snapshot() {
    return {
      boundary: this.boundary.map(p => ({
        ...p
      })),
      center: this.center ? {
        ...this.center
      } : null,
      closed: this.closed,
      dirty: this.dirty
    };
  }
  remember() {
    this.history.push(this.snapshot());
    if (this.history.length > 40) this.history.shift();
  }
  notify(message, error = false) {
    this.error = error;
    this.onMessage(message, error);
    this.onChange();
  }
  setMode(mode) {
    this.mode = mode;
    this.selected = -1;
    this.onChange();
  }
  start(mode) {
    this.remember();
    this.boundary = [];
    this.center = null;
    this.closed = false;
    this.dirty = true;
    this.setMode(mode);
    this.notify(mode === 'freehand' ? 'Drag a continuous outline. Release to close it.' : 'Click to place corners. Press Enter or Close outline to finish.');
  }
  load(boundary, center = null, dirty = true) {
    this.boundary = boundary.map(p => ({
      ...p
    }));
    this.center = center ? {
      ...center
    } : findCityCenter(boundary);
    this.closed = true;
    this.dirty = dirty;
    this.error = false;
    this.selected = -1;
    this.setMode(dirty ? 'edit' : 'pan');
    this.notify(dirty ? 'Outline ready. Adjust points or place the square, then generate.' : 'City generated. Draw a new outline or edit this one.');
  }
  undo() {
    const state = this.history.pop();
    if (!state) return;
    Object.assign(this, state);
    this.selected = -1;
    this.error = false;
    this.mode = this.closed ? 'edit' : 'points';
    this.notify('Last outline edit undone.');
  }
  finish(tolerance = 0) {
    this.closed = true;
    this.stroke = false;
    this.mode = 'edit';
    try {
      this.boundary = cleanOutline(this.boundary, tolerance);
      checkNarrowSections(this.boundary);
      if (!this.center || !insideOrOn(this.center, this.boundary) || clearance(this.center, this.boundary) < 18) this.center = findCityCenter(this.boundary);
      this.notify('Outline ready. Drag corners to refine it, then generate.');
      return true;
    } catch (error) {
      this.notify(error.message, true);
      return false;
    }
  }
  validate() {
    if (!this.closed) throw new Error('Close your outline before generating.');
    validateBoundary(this.boundary);
    checkNarrowSections(this.boundary);
    if (!this.center) this.center = findCityCenter(this.boundary);
    if (!insideOrOn(this.center, this.boundary) || clearance(this.center, this.boundary) < 18) throw new Error('Place the town center inside the outline, at least 18 units from the edge.');
  }
  down(point, zoom) {
    if (this.mode === 'pan') return false;
    if (this.mode === 'freehand') {
      if (this.boundary.length) this.remember();
      this.boundary = [point];
      this.center = null;
      this.closed = false;
      this.dirty = true;
      this.stroke = true;
      this.onChange();
      return true;
    }
    if (this.mode === 'points') {
      if (this.boundary.length >= 3 && Math.hypot(point.x - this.boundary[0].x, point.y - this.boundary[0].y) * zoom < 12) {
        this.finish();
        return true;
      }
      this.remember();
      this.boundary.push(point);
      this.dirty = true;
      this.onChange();
      return true;
    }
    if (this.mode === 'center') {
      if (!this.closed || !insideOrOn(point, this.boundary) || clearance(point, this.boundary) < 18) {
        this.notify('Choose a center inside the outline, at least 18 units from its edge.', true);
        return true;
      }
      this.remember();
      this.center = point;
      this.dirty = true;
      this.notify('Town center placed. Generate to move the main square here.');
      return true;
    }
    if (this.mode === 'edit') {
      let distance = 14 / zoom,
        index = -1;
      this.boundary.forEach((p, i) => {
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d < distance) {
          distance = d;
          index = i;
        }
      });
      this.selected = index;
      this.dragging = index;
      if (index >= 0) this.remember();
      this.onChange();
      return true;
    }
    return false;
  }
  move(point, zoom) {
    if (this.stroke) {
      const last = this.boundary.at(-1);
      if (Math.hypot(last.x - point.x, last.y - point.y) * zoom > 5 && this.boundary.length < 1200) {
        this.boundary.push(point);
        this.onChange();
      }
    } else if (this.dragging >= 0) {
      this.boundary[this.dragging] = point;
      this.dirty = true;
      this.error = false;
      this.onChange();
    }
  }
  up(zoom, cancelled = false) {
    if (cancelled) {
      if (this.stroke || this.dragging >= 0) this.undo();
      this.stroke = false;
      this.dragging = -1;
      return;
    }
    if (this.stroke) this.finish(3 / zoom);
    if (this.dragging >= 0) {
      this.dragging = -1;
      try {
        this.validate();
        this.notify('Boundary updated. Generate to rebuild the streets.');
      } catch (error) {
        this.notify(error.message, true);
      }
    }
  }
  addPoint(point, zoom) {
    if (this.mode !== 'edit' || !this.closed) return;
    let nearest = 12 / zoom,
      index = -1;
    this.boundary.forEach((a, i) => {
      const d = distanceToSegment(point, a, this.boundary[(i + 1) % this.boundary.length]);
      if (d < nearest) {
        nearest = d;
        index = i;
      }
    });
    if (index >= 0) {
      this.remember();
      this.boundary.splice(index + 1, 0, point);
      this.selected = index + 1;
      this.dirty = true;
      this.notify('Corner added. Drag to reshape the boundary.');
    }
  }
  removePoint() {
    if (this.mode !== 'edit' || this.selected < 0) return;
    if (this.boundary.length <= 3) {
      this.notify('Keep at least three outline points.', true);
      return;
    }
    this.remember();
    this.boundary.splice(this.selected, 1);
    this.selected = -1;
    this.dirty = true;
    this.finish();
  }
}
