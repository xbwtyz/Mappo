import {
  WORKSPACE_SECTIONS,
  workspaceInitialState,
  workspaceInspectorVisible,
  workspaceSelectionEqual,
  workspaceTransition
} from '../core/workspace-state.js';

export class WorkspaceShell {
  constructor({
    getElement,
    document = globalThis.document,
    onNavigate = () => {},
    onLayout = () => {},
    changed = () => {},
    clearSelection = () => {}
  }) {
    this.$ = getElement;
    this.document = document;
    this.onNavigate = onNavigate;
    this.onLayout = onLayout;
    this.changed = changed;
    this.onClearSelection = clearSelection;
    this.providers = new Map();
    this.state = workspaceInitialState();
  }
  registerInspector(kind, provider) {
    if (typeof kind !== 'string' || !kind || !provider || typeof provider.resolve !== 'function') throw new Error('An inspector provider needs a kind and a resolver.');
    this.providers.set(kind, provider);
    return this;
  }
  descriptor() {
    const selection = this.state.selection;
    return selection ? this.providers.get(selection.kind)?.resolve(selection.id) ?? null : null;
  }
  dispatch(action) {
    const previous = this.state;
    this.state = workspaceTransition(previous, action);
    this.render();
    if (previous.toolsCollapsed !== this.state.toolsCollapsed || workspaceInspectorVisible(previous) !== workspaceInspectorVisible(this.state)) this.onLayout();
    this.changed();
  }
  navigate(section) {
    if (!WORKSPACE_SECTIONS.some(s => s.id === section)) throw new Error('Unknown workspace section.');
    if (section !== this.state.section) this.onNavigate(this.state.section, section);
    this.dispatch({
      type: 'navigate',
      section
    });
  }
  select(selection, {
    reveal = true
  } = {}) {
    if (selection && !this.providers.has(selection.kind)) throw new Error('No inspector provider for this selection.');
    if (workspaceSelectionEqual(selection, this.state.selection) && (!reveal || !this.state.inspectorCollapsed)) {
      this.renderInspector();
      return;
    }
    this.dispatch({
      type: 'select',
      selection,
      reveal
    });
  }
  clear() {
    this.onClearSelection();
    this.select(null);
  }
  refresh() {
    if (this.state.selection && !this.descriptor()) this.select(null, {
      reveal: false
    });
    else this.renderInspector();
  }
  reset({
    section = 'city',
    selection = null
  } = {}) {
    this.state = workspaceInitialState();
    this.state = workspaceTransition(this.state, {
      type: 'navigate',
      section
    });
    if (selection) this.state = workspaceTransition(this.state, {
      type: 'select',
      selection,
      reveal: true
    });
    this.render();
    this.onLayout();
  }
  renderInspector() {
    const descriptor = this.descriptor();
    this.$('workspaceEmptyInspector').hidden = Boolean(descriptor);
    this.$('workspaceSelectionInspector').hidden = !descriptor;
    this.$('workspaceClearSelection').hidden = !descriptor;
    if (!descriptor) {
      this.$('workspaceSelectionSections').replaceChildren();
      return;
    }
    this.$('workspaceSelectionType').textContent = descriptor.type ?? 'Selection';
    this.$('workspaceSelectionName').textContent = descriptor.title ?? this.state.selection.id;
    this.$('workspaceSelectionDescription').textContent = descriptor.description ?? '';
    this.$('workspaceSelectionSections').replaceChildren(...(descriptor.sections ?? []).map(section => {
      const element = this.document.createElement('section');
      element.className = 'workspace-inspector-section';
      element.textContent = [section.title ?? '', ...(section.rows ?? []).map(([label, value]) => `${label}: ${value}`)].filter(Boolean).join('\n');
      return element;
    }));
    this.$('workspaceShowControls').hidden = !descriptor.section;
    this.$('workspaceShowControls').textContent = descriptor.controlLabel ?? 'Open editing controls';
  }
  render() {
    this.$('workspaceApp').classList.toggle('workspace-tools-collapsed', this.state.toolsCollapsed);
    const visible = workspaceInspectorVisible(this.state);
    this.$('workspaceApp').classList.toggle('workspace-inspector-visible', visible);
    this.$('workspaceTools').hidden = this.state.toolsCollapsed;
    this.$('workspaceInspector').hidden = !visible;
    this.$('workspaceOpenTools').hidden = !this.state.toolsCollapsed;
    this.$('workspaceOpenInspector').hidden = visible;
    this.$('workspacePinInspector').setAttribute('aria-pressed', String(this.state.inspectorPinned));
    this.$('workspacePinInspector').textContent = this.state.inspectorPinned ? 'Unpin' : 'Pin';
    this.$('workspacePinInspector').setAttribute('aria-label', this.state.inspectorPinned ? 'Unpin inspector' : 'Pin inspector open');
    for (const section of WORKSPACE_SECTIONS) {
      const active = section.id === this.state.section;
      this.$(`workspaceTab-${section.id}`).setAttribute('aria-selected', String(active));
      this.$(`workspaceTab-${section.id}`).tabIndex = active ? 0 : -1;
      this.$(`workspaceSection-${section.id}`).hidden = !active;
      this.$(`workspaceSection-${section.id}`).inert = !active;
    }
    this.$('workspaceSectionTitle').textContent = WORKSPACE_SECTIONS.find(s => s.id === this.state.section).title;
    this.renderInspector();
  }
  bind() {
    for (const [index, section] of WORKSPACE_SECTIONS.entries()) {
      const button = this.$(`workspaceTab-${section.id}`);
      button.addEventListener('click', () => this.navigate(section.id));
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % WORKSPACE_SECTIONS.length;
        else if (event.key === 'ArrowLeft') next = (index + WORKSPACE_SECTIONS.length - 1) % WORKSPACE_SECTIONS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = WORKSPACE_SECTIONS.length - 1;
        else return;
        event.preventDefault();
        this.navigate(WORKSPACE_SECTIONS[next].id);
        this.$(`workspaceTab-${WORKSPACE_SECTIONS[next].id}`).focus();
      });
    }
    this.$('workspaceCollapseTools').addEventListener('click', () => {
      this.dispatch({
        type: 'tools',
        collapsed: true
      });
      this.$('workspaceOpenTools').focus();
    });
    this.$('workspaceOpenTools').addEventListener('click', () => {
      this.dispatch({
        type: 'tools',
        collapsed: false
      });
      this.$(`workspaceTab-${this.state.section}`).focus();
    });
    this.$('workspaceCloseInspector').addEventListener('click', () => {
      this.dispatch({
        type: 'inspector',
        collapsed: true
      });
      this.$('workspaceOpenInspector').focus();
    });
    this.$('workspaceOpenInspector').addEventListener('click', () => this.dispatch({
      type: 'inspector',
      collapsed: false
    }));
    this.$('workspacePinInspector').addEventListener('click', () => this.dispatch({
      type: 'pin'
    }));
    this.$('workspaceClearSelection').addEventListener('click', () => this.clear());
    this.$('workspaceShowControls').addEventListener('click', () => {
      const descriptor = this.descriptor();
      if (descriptor?.section) this.navigate(descriptor.section);
    });
    this.render();
  }
}
