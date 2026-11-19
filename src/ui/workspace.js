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
    clearSelection = () => {},
    onInspect = () => {}
  }) {
    this.$ = getElement;
    this.document = document;
    this.onNavigate = onNavigate;
    this.onLayout = onLayout;
    this.changed = changed;
    this.onClearSelection = clearSelection;
    this.onInspect = onInspect;
    this.providers = new Map();
    this.state = workspaceInitialState();
    this.sectionScroll = new Map();
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
    if (action.type === 'tools' && action.collapsed && !previous.toolsCollapsed) {
      const scroll = Number(this.$('workspaceToolScroll').scrollTop ?? 0);
      this.sectionScroll.set(previous.section, Number.isFinite(scroll) ? Math.max(0, scroll) : 0);
    }
    this.state = workspaceTransition(previous, action);
    this.render();
    if (previous.toolsCollapsed !== this.state.toolsCollapsed || workspaceInspectorVisible(previous) !== workspaceInspectorVisible(this.state)) this.onLayout();
    if (previous.toolsCollapsed && !this.state.toolsCollapsed)
      this.$('workspaceToolScroll').scrollTop = this.sectionScroll.get(this.state.section) ?? 0;
    this.changed();
  }
  navigate(section) {
    if (!WORKSPACE_SECTIONS.some(s => s.id === section)) throw new Error('Unknown workspace section.');
    const previous = this.state.section;
    if (section !== previous) {
      const scroll = Number(this.$('workspaceToolScroll').scrollTop ?? 0);
      this.sectionScroll.set(previous, Number.isFinite(scroll) ? Math.max(0, scroll) : 0);
      this.onNavigate(previous, section);
    }
    this.dispatch({
      type: 'navigate',
      section
    });
    if (section !== previous) this.$('workspaceToolScroll').scrollTop = this.sectionScroll.get(section) ?? 0;
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
  snapshot() {
    const scroll = Object.fromEntries(this.sectionScroll);
    const current = Number(this.$('workspaceToolScroll').scrollTop ?? 0);
    if (!this.state.toolsCollapsed || scroll[this.state.section] === undefined)
      scroll[this.state.section] = Number.isFinite(current) ? Math.max(0, current) : 0;
    const inspectorScroll = Number(this.$('workspaceInspectorScroll').scrollTop ?? 0);
    return {
      section: this.state.section,
      toolsCollapsed: this.state.toolsCollapsed,
      inspectorCollapsed: this.state.inspectorCollapsed,
      inspectorPinned: this.state.inspectorPinned,
      selection: this.state.selection ? { ...this.state.selection } : null,
      sectionScroll: scroll,
      inspectorScroll: Number.isFinite(inspectorScroll) ? Math.max(0, inspectorScroll) : 0
    };
  }
  reset({
    section = 'city',
    selection = null,
    ui = null,
    transient = false
  } = {}) {
    this.sectionScroll.clear();
    for (const [id, value] of Object.entries(ui?.sectionScroll ?? {}))
      if (WORKSPACE_SECTIONS.some(s => s.id === id) && Number.isFinite(value))
        this.sectionScroll.set(id, Math.max(0, value));
    const destination = ui?.section ?? section;
    this.state = workspaceTransition(workspaceInitialState(), {
      type: 'navigate',
      section: destination
    });
    if (selection) this.state = workspaceTransition(this.state, {
      type: 'select', selection, reveal: true
    });
    if (ui) this.state = {
      ...this.state,
      toolsCollapsed: ui.toolsCollapsed ?? false,
      inspectorCollapsed: ui.inspectorCollapsed ?? false,
      inspectorPinned: ui.inspectorPinned ?? false
    };
    this.render();
    this.$('workspaceToolScroll').scrollTop = this.sectionScroll.get(destination) ?? 0;
    this.$('workspaceInspectorScroll').scrollTop = ui?.inspectorScroll ?? 0;
    this.onLayout();
    if(transient)this.restoredScroll = new Map(['workspaceToolScroll','workspaceInspectorScroll']
      .map(id=>[id,Number(this.$(id).scrollTop??0)]));
  }
  renderInspector() {
    const descriptor = this.descriptor();
    this.$('workspaceEmptyInspector').hidden = Boolean(descriptor);
    this.$('workspaceSelectionInspector').hidden = !descriptor;
    this.$('workspaceClearSelection').hidden = !descriptor;
    if (!descriptor) {
      this.$('workspaceSelectionSections').replaceChildren();
      this.onInspect(this.state.selection);
      return;
    }
    this.$('workspaceSelectionType').textContent = descriptor.type ?? 'Selection';
    this.$('workspaceSelectionName').textContent = descriptor.title ?? this.state.selection.id;
    this.$('workspaceSelectionDescription').textContent = descriptor.description ?? '';
    this.$('workspaceSelectionSections').replaceChildren(...(descriptor.sections ?? []).map(section => {
      const element = this.document.createElement('section');
      element.className = 'workspace-inspector-section';
      element.textContent = [section.title ?? '', ...(section.rows ?? []).map(([label, value]) => `${label}: ${value}`)].filter(Boolean).join('\n');
      if (section.actions?.length) {
        const summary = this.document.createElement('div');
        summary.textContent = element.textContent;
        element.textContent = '';
        element.replaceChildren(summary, ...section.actions.map(action => {
          const button = this.document.createElement('button');
          button.type = 'button';
          button.className = 'workspace-inspector-action';
          button.textContent = action.label;
          button.disabled = Boolean(action.disabled);
          if (action.selection) {
            button.setAttribute('data-inspector-kind', action.selection.kind);
            button.setAttribute('data-inspector-id', action.selection.id);
          }
          button.addEventListener('click', () => {
            action.run();
            this.$('workspaceSelectionName').setAttribute('tabindex', '-1');
            this.$('workspaceSelectionName').focus?.();
          });
          return button;
        }));
      }
      return element;
    }));
    this.$('workspaceShowControls').hidden = !descriptor.section;
    this.$('workspaceShowControls').textContent = descriptor.controlLabel ?? 'Open editing controls';
    this.onInspect(this.state.selection);
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
    for(const id of ['workspaceToolScroll','workspaceInspectorScroll'])this.$(id).addEventListener('scroll',()=>{
      // Browser scroll events arrive after a transient layout has been restored.
      // Ignore only the exact restored position, never a subsequent user scroll.
      const expected=this.restoredScroll?.get(id);
      this.restoredScroll?.delete(id);
      if(expected!==undefined && Number(this.$(id).scrollTop??0)===expected)return;
      this.changed();
    });
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
