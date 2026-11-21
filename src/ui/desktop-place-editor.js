// Hosts the existing property and building controls in the same resizable
// map layout as roads. The original controls keep their handlers and IDs.
const panels = [
  ['propertyCreatePanelE1', 'Create property', 'propertyCreateBlockE1'],
  ['propertySplitPanelE2', 'Split property', 'propertySplitTargetE2'],
  ['propertyMergePanelE3', 'Merge properties', 'propertyMergePrimaryE3'],
  ['propertyEditPanel3I', 'Edit property geometry', 'propertyEditTarget3I'],
  ['buildingTransformPanel', 'Edit building footprint', 'buildingPreviewTarget'],
  ['buildingStructurePanel', 'Place building', 'structurePropertyLabel'],
];

export class DesktopPlaceEditor {
  constructor({ getElement, layout, getContext, getTitle, document = globalThis.document }) {
    Object.assign(this, { $: getElement, layout, getContext, getTitle, document });
    this.host = this.$('desktopPlaceEditor');
    this.scroll = this.$('desktopPlaceScroll');
    this.media = window.matchMedia?.('(min-width: 1000px)');
    this.media?.addEventListener('change', () => this.sync());
    this.$('desktopPlaceReviewChoice').addEventListener('click', () => {
      this.setView('Review');
      this.current?.querySelector('[data-place-review] input[type="checkbox"]:not(:checked):not(:disabled)')?.focus();
    });
    for (const view of ['Edit', 'Review']) {
      this.$('desktopPlace' + view).addEventListener('click', () => this.setView(view));
    }
  }
  setView(view) {
    const review = view === 'Review';
    this.host.classList.toggle('place-review', review);
    this.$('desktopPlaceEdit').setAttribute('aria-pressed', String(!review));
    this.$('desktopPlaceReview').setAttribute('aria-pressed', String(review));
    this.scroll.scrollTop = 0;
    this.updateReviewChoice();
  }
  sync() {
    const config = this.media?.matches && panels.find(([id]) => !this.$(id).hidden);
    const panel = config ? this.$(config[0]) : null;
    if (this.current !== panel) {
      const hadFocus = this.current && this.host.contains(this.document.activeElement);
      this.release();
      if (panel) this.mount(panel);
      else if (hadFocus) {
        const target = this.$('workspaceSelectionInspector').hidden
          ? this.$('mapCanvas') : this.$('workspaceSelectionName');
        if (target !== this.$('mapCanvas')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
    if (!panel) return;
    this.updateReviewChoice();
    const [id, label, record] = config;
    const title = this.getTitle(id, label);
    const context = this.getContext(id) || this.$(record).textContent;
    if (this.$('desktopPlaceHeading').textContent !== title)
      this.$('desktopPlaceHeading').textContent = title;
    if (this.$('desktopPlaceContext').textContent !== context)
      this.$('desktopPlaceContext').textContent = context;
  }
  updateReviewChoice() {
    const undisclosed = this.current && !this.host.classList.contains('place-review');
    const checkboxes = undisclosed
      ? this.current.querySelectorAll('[data-place-review] input[type="checkbox"]:not(:checked):not(:disabled)')
      : [];
    this.$('desktopPlaceReviewChoice').hidden =
      !Array.from(checkboxes).some(input => !input.closest('[hidden]'));
  }
  mount(panel) {
    this.current = panel;
    panel.querySelector('[data-place-intro]').hidden = false;
    this.setView('Edit');
    this.origins = [];
    const move = (node, to) => {
      this.origins.push([node, node.parentNode, node.nextSibling]);
      to.append(node);
    };
    move(panel.querySelector('[data-place-status]'), this.$('desktopPlaceStatus'));
    move(panel.querySelector('[data-place-actions]'), this.$('desktopPlaceActions'));
    move(panel, this.scroll);
    this.$('workspaceApp').classList.add('place-editor-active');
    this.host.hidden = false;
    this.layout.show(this.host);
    // The invoking Inspector action also updates focus after opening the tool.
    queueMicrotask(() => {
      if (this.current === panel) this.$('desktopPlaceHeading').focus({ preventScroll: true });
    });
  }
  release() {
    if (!this.current) return;
    this.host.hidden = true;
    this.current.querySelector('[data-place-intro]').hidden = true;
    this.$('workspaceApp').classList.remove('place-editor-active');
    for (const [node, parent, next] of this.origins.reverse()) {
      parent.insertBefore(node, next);
    }
    this.origins = [];
    this.current = null;
    if (this.layout.panel === this.host) this.layout.hide();
  }
}
