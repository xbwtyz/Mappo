import { clamp } from '../core/geometry.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.width = 800;
    this.height = 600;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  worldToScreen(point) {
    return { x: (point.x - this.x) * this.zoom + this.width / 2,
      y: (point.y - this.y) * this.zoom + this.height / 2 };
  }

  screenToWorld(point) {
    return { x: (point.x - this.width / 2) / this.zoom + this.x,
      y: (point.y - this.height / 2) / this.zoom + this.y };
  }

  pan(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  zoomAt(factor, screenPoint = { x: this.width / 2, y: this.height / 2 }) {
    const before = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * factor, 0.18, 12);
    const after = this.screenToWorld(screenPoint);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  fit(points, padding = 78) {
    if (!points.length) return;
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    this.x = (minX + maxX) / 2;
    this.y = (minY + maxY) / 2;
    this.zoom = clamp(Math.min(
      Math.max(1, this.width - padding * 2) / Math.max(1, maxX - minX),
      Math.max(1, this.height - padding * 2) / Math.max(1, maxY - minY)
    ), 0.18, 12);
  }
}
