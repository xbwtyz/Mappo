// Shared, nonmodal panels. Feature controllers continue to own their controls.
export class WorkspaceMenus {
  constructor({
    getElement,
    document = globalThis.document
  }) {
    this.$ = getElement;
    this.document = document;
    this.active = null;
    this.projectPending = null;
    this.entries = {
      project: {
        button: 'projectMenuButton',
        panel: 'projectMenu',
        first: 'saveProjectButton'
      },
      layers: {
        button: 'layersMenuButton',
        panel: 'layersMenu',
        first: 'buildingsLayer'
      }
    };
  }
  contains(name, target) {
    const entry = this.entries[name];
    return this.$(entry.button) === target || this.$(entry.button).contains?.(target) || this.$(entry.panel).contains?.(target);
  }
  close({
    restoreFocus = false
  } = {}) {
    const previous = this.active;
    this.active = null;
    for (const entry of Object.values(this.entries)) {
      this.$(entry.panel).hidden = true;
      this.$(entry.button).setAttribute('aria-expanded', 'false');
    }
    if (restoreFocus && previous) this.$(this.entries[previous].button).focus();
  }
  open(name, {
    focus = true
  } = {}) {
    if (!this.entries[name]) throw new Error('Unknown workspace menu.');
    const leavingPanel = this.active && this.$(this.entries[this.active].panel).contains?.(this.document.activeElement);
    this.close();
    this.active = name;
    const entry = this.entries[name];
    this.$(entry.panel).hidden = false;
    this.$(entry.button).setAttribute('aria-expanded', 'true');
    if (focus || leavingPanel) this.$(entry.first).focus();
  }
  projectStatus({
    message,
    error,
    pending,
    recovery
  }) {
    const attention = Boolean(error || pending || recovery);
    this.$('projectMenuAttention').hidden = !attention;
    this.$('projectMenuButton').setAttribute('aria-label', attention ? 'Project — action needed' : 'Project');
    this.$('projectMenuButton').title = message;
    // File selection is asynchronous: reveal the validated preview or error even
    // if the user has closed the menu while the file was being read.
    if (error || (pending && pending !== this.projectPending)) this.open('project', {
      focus: false
    });
    this.projectPending = pending;
  }
  bind() {
    this.close();
    for (const [name, entry] of Object.entries(this.entries)) {
      this.$(entry.button).addEventListener('click', () => this.active === name ? this.close() : this.open(name));
      this.$(entry.button).addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.open(name);
        }
      });
    }
    this.$('projectMenuClose').addEventListener('click', () => this.close({
      restoreFocus: true
    }));
    this.$('layersMenuClose').addEventListener('click', () => this.close({
      restoreFocus: true
    }));
    this.document.addEventListener?.('pointerdown', event => {
      if (this.active && !this.contains(this.active, event.target)) this.close({
        restoreFocus: true
      });
    });
    this.document.addEventListener?.('focusin', event => {
      if (this.active && !this.contains(this.active, event.target)) this.close();
    });
    this.document.addEventListener?.('keydown', event => {
      if (this.active && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close({
          restoreFocus: true
        });
      }
    }, true);
  }
}
