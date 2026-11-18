import { isMapShortcutEvent } from '../core/shortcut-scope.js';

export function bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, editor, onTap = () => {}, onHover = () => {}) {
  let active = false,
    panning = false,
    lastX = 0,
    lastY = 0,
    space = false,
    tapEligible = false,
    travel = 0,
    tapPoint = null,
    activePointer = null;
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && isMapShortcutEvent(e, document.activeElement)) {
      space = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') space = false;
  });
  const world = e => {
    const r = canvas.getBoundingClientRect();
    return camera.screenToWorld({
      x: e.clientX - r.left,
      y: e.clientY - r.top
    });
  };

  function finish(cancelled = false) {
    if (!active) return;
    active = false;
    activePointer = null;
    if (!panning) editor.up(camera.zoom, cancelled);
    else if (!cancelled && tapEligible && travel <= 4) onTap(tapPoint);
    panning = false;
    canvas.classList.remove('is-dragging');
  }
  window.addEventListener('blur', () => {
    space = false;
    finish(true);
  });
  canvas.addEventListener('pointerdown', event => {
    if (active || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    canvas.focus();
    active = true;
    activePointer = event.pointerId;
    onHover(null);
    panning = space || event.button === 1 || editor.mode === 'pan';
    lastX = event.clientX;
    lastY = event.clientY;
    travel = 0;
    tapEligible = event.button === 0 && !space && editor.mode === 'pan';
    tapPoint = world(event);
    canvas.setPointerCapture(event.pointerId);
    if (panning) canvas.classList.add('is-dragging');
    else editor.down(world(event), camera.zoom);
  });
  canvas.addEventListener('pointermove', event => {
    if (active && activePointer !== event.pointerId) return;
    if (!active) {
      onHover(editor.mode === 'pan' ? world(event) : null);
      return;
    }
    if (panning) {
      travel += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      camera.pan(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      requestDraw();
      updateViewport();
    } else editor.move(world(event), camera.zoom);
  });
  canvas.addEventListener('pointerup', event => {
    if (active && activePointer === event.pointerId) finish();
  });
  canvas.addEventListener('pointerleave', () => onHover(null));
  canvas.addEventListener('pointercancel', event => {
    if (active && activePointer === event.pointerId) finish(true);
  });
  canvas.addEventListener('lostpointercapture', event => {
    if (active && activePointer === event.pointerId) finish(true);
  });
  canvas.addEventListener('dblclick', event => {
    if (active || editor.mode === 'pan') return;
    editor.addPoint(world(event), camera.zoom);
    event.preventDefault();
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (active) return;
    const r = canvas.getBoundingClientRect();
    camera.zoomAt(Math.exp(-event.deltaY * .0013), {
      x: event.clientX - r.left,
      y: event.clientY - r.top
    });
    requestDraw();
    updateViewport();
  }, {
    passive: false
  });
}
