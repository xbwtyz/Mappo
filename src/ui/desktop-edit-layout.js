// Hosts an existing tool panel beside the map. The tool keeps its controls,
// focus targets, draft, validation, and transaction handlers.
export class DesktopEditLayout {
  constructor({ viewport, divider, onLayout }) {
    this.viewport = viewport;
    this.divider = divider;
    this.onLayout = onLayout;
    this.panel = null;
    this.width = 360;
    let pointer = null;
    divider.addEventListener('pointerdown', event => {
      if (!this.panel || event.button !== 0 || pointer !== null) return;
      pointer = { id: event.pointerId, x: event.clientX };
      divider.setPointerCapture(event.pointerId);
      divider.focus();
    });
    divider.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      this.adjustWidth(pointer.x - event.clientX);
      pointer.x = event.clientX;
    });
    divider.addEventListener('lostpointercapture', event => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
    divider.addEventListener('keydown', event => {
      if (!this.panel || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      this.adjustWidth(event.key === 'ArrowLeft' ? 16 : -16);
      event.preventDefault();
    });
  }
  show(panel) {
    this.panel = panel;
    this.viewport.classList.add('desktop-edit-layout');
    panel.classList.add('desktop-edit-panel');
    this.divider.hidden = false;
    this.adjustWidth(0);
  }
  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('desktop-edit-panel');
    this.viewport.classList.remove('desktop-edit-layout');
    this.divider.hidden = true;
    this.panel = null;
    this.onLayout();
  }
  adjustWidth(delta) {
    this.width = Math.min(520, Math.max(300, this.width + delta));
    this.viewport.style.setProperty('--desktop-edit-width', this.width + 'px');
    this.divider.setAttribute('aria-valuenow', String(this.width));
    this.onLayout();
  }
}
