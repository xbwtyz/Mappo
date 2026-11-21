// Hosts a tool panel beside or below the map. The tool owns its draft and actions.
export class DesktopEditLayout {
  constructor({ viewport, divider, dockDivider, onLayout }) {
    this.viewport = viewport;
    this.divider = divider;
    this.dockDivider = dockDivider;
    this.onLayout = onLayout;
    this.panel = null;
    this.bindResize(divider, {
      value: 360, min: 300, max: 520, axis: 'clientX',
      grow: 'ArrowLeft', shrink: 'ArrowRight', property: '--desktop-edit-width',
    });
    this.bindResize(dockDivider, {
      value: 320, min: 240, max: 480, axis: 'clientY',
      grow: 'ArrowUp', shrink: 'ArrowDown', property: '--desktop-dock-height',
    });
  }
  bindResize(divider, { value, min, max, axis, grow, shrink, property }) {
    let pointer = null;
    const adjust = delta => {
      value = Math.min(max, Math.max(min, value + delta));
      this.viewport.style.setProperty(property, value + 'px');
      divider.setAttribute('aria-valuenow', String(value));
      this.onLayout();
    };
    divider.addEventListener('pointerdown', event => {
      if (divider.hidden || event.button !== 0 || pointer !== null) return;
      pointer = { id: event.pointerId, position: event[axis] };
      divider.setPointerCapture(event.pointerId);
      divider.focus();
    });
    divider.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      adjust(pointer.position - event[axis]);
      pointer.position = event[axis];
    });
    divider.addEventListener('lostpointercapture', event => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
    divider.addEventListener('keydown', event => {
      if (event.key !== grow && event.key !== shrink) return;
      adjust(event.key === grow ? 16 : -16);
      event.preventDefault();
    });
  }
  show(panel) {
    this.panel = panel;
    this.viewport.classList.add('desktop-edit-layout');
    panel.classList.add('desktop-edit-panel');
    this.setDock(false);
  }
  setDock(open) {
    if (!this.panel) return;
    this.viewport.classList.toggle('desktop-impact-layout', open);
    this.divider.hidden = open;
    this.dockDivider.hidden = !open;
    this.onLayout();
  }
  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('desktop-edit-panel');
    this.viewport.classList.remove('desktop-impact-layout');
    this.viewport.classList.remove('desktop-edit-layout');
    this.divider.hidden = true;
    this.dockDivider.hidden = true;
    this.panel = null;
    this.onLayout();
  }
}
