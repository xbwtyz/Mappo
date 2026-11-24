import { isMapShortcutEvent } from '../core/shortcut-scope.js';

export function bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, editor, onTap = () => {}, onHover = () => {}, transform = {}) {
  let active = false,
    panning = false,
    lastX = 0,
    lastY = 0,
    space = false,
    tapEligible = false,
    travel = 0,
    tapPoint = null,
    tapModifiers = {},
    activePointer = null,
    transforming = false;
  window.addEventListener('keydown', e => {
    const focused = document.activeElement;
    // A hidden or unfocused map cannot claim Space from another canvas.
    if (canvas.hidden || (focused?.tagName === 'CANVAS' && focused !== canvas)) return;
    if (e.code === 'Space' && isMapShortcutEvent(e, focused)) {
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

  function finish(cancelled = false, event = null) {
    if (!active) return;
    active = false;
    activePointer = null;
    if (transforming) {
      transform.end?.(cancelled, event);
      transforming = false;
    } else if (!panning) editor.up(camera.zoom, cancelled);
    else if (!cancelled && tapEligible && travel <= 4) onTap(tapPoint,tapModifiers);
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
    tapModifiers={shiftKey:Boolean(event.shiftKey)};
    transforming = event.button === 0 && !space && editor.mode === 'pan' && Boolean(transform.begin?.(tapPoint, camera.zoom, event));
    if (transforming) { panning = false; tapEligible = false; }
    canvas.setPointerCapture(event.pointerId);
    if (panning) canvas.classList.add('is-dragging');
    else if (!transforming) editor.down(world(event), camera.zoom);
  });
  canvas.addEventListener('pointermove', event => {
    if (active && activePointer !== event.pointerId) return;
    if (!active) {
      onHover(editor.mode === 'pan' ? world(event) : null);
      return;
    }
    if (transforming) {
      transform.move?.(world(event),event);
      requestDraw();
    } else if (panning) {
      travel += Math.hypot(event.clientX - lastX, event.clientY - lastY);
      camera.pan(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      requestDraw();
      updateViewport();
    } else editor.move(world(event), camera.zoom);
  });
  canvas.addEventListener('pointerup', event => {
    if (active && activePointer === event.pointerId) finish(false,event);
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
    onHover(null);
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
