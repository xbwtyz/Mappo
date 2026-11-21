// Desktop navigation reuses the existing edit forms and their transaction owners.
export class DesktopWorkspace {
  constructor({ getElement, layout, shell, road, landscape, leaveTools, addProperty,
    addBuilding, prepareGeneration, generationKey, acceptedProject, redraw, enabled = true }) {
    Object.assign(this, { $: getElement, layout, shell, road, landscape, leaveTools,
      addProperty, addBuilding, prepareGeneration, generationKey, acceptedProject, redraw });
    this.mode = 'generation';
    this.tool = 'city';
    this.reviewing = false;
    this.proposed = true;
    this.message = '';
    this.panel = this.$('desktopWorkspaceHome');
    this.media = enabled ? globalThis.window?.matchMedia?.('(min-width: 1000px)') : null;
  }

  bind() {
    const $ = this.$;
    const doc = $('desktopWorkspaceTabs');
    this.media?.addEventListener('change', () => this.sync());
    if (!this.media) return;
    this.tabs = [...doc.querySelectorAll('[data-workspace]')];
    this.tools = [...$('desktopGenerationTools').querySelectorAll('[data-generation]')];
    this.addButtons = [...$('desktopHomeAdd').querySelectorAll('[data-add]')];
    for (const tab of this.tabs)
      tab.addEventListener('click', () => this.open(tab.dataset.workspace));
    doc.addEventListener('keydown', event => {
      const index = this.tabs.indexOf(event.target);
      if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.tabs.length - 1
        : (index + this.tabs.length + (event.key === 'ArrowRight' ? 1 : -1)) % this.tabs.length;
      if (this.open(this.tabs[next].dataset.workspace)) this.tabs[next].focus();
    });
    for (const button of this.tools)
      button.addEventListener('click', () => this.generationTool(button.dataset.generation));
    for (const button of this.addButtons)
      button.addEventListener('click', () => this.chooseAdd(button.dataset.add));
    $('desktopReopenRoads').addEventListener('click', () => this.open('roads'));
    $('desktopGenerationEdit').addEventListener('click', () => this.setReview(false));
    $('desktopGenerationReview').addEventListener('click', () => this.setReview(true));
    $('desktopGenerationPreview').addEventListener('click', () => this.preview());
    $('desktopGenerationCancel').addEventListener('click', () => {
      this.cancelPreview();
    });
    $('desktopGenerationApply').addEventListener('click', () => this.apply());
    for (const [id, proposed] of [['desktopGenerationBefore', false], ['desktopGenerationProposed', true]])
      $(id).addEventListener('click', () => {
        this.proposed = proposed;
        this.sync();
        this.redraw();
      });
    this.origins = new Map();
    for (const id of ['cityGenerationControls', 'cityRebuildControls', 'workspaceSection-districts',
      'workspaceSection-defenses', 'workspaceSection-landscape', 'landscapeInspectorControls',
      'acceptedRoadHistoryControls', 'propertyCreationHistoryControls',
      'propertySplitHistoryControls', 'propertyMergeHistoryControls']) {
      const node = $(id);
      this.origins.set(id, [node.parentNode, node.nextSibling]);
    }
    this.sync();
  }

  roadEntry() {
    return this.media?.matches ? this.tabs.find(tab => tab.dataset.workspace === 'roads') : null;
  }

  get usesGeneration() {
    return this.media?.matches && this.mode === 'generation';
  }

  move(id, target) {
    const node = this.$(id);
    const [parent, sibling] = this.origins.get(id);
    const destination = target ? this.$(target) : parent;
    if (node.parentNode === destination) return;
    destination.insertBefore(node, target ? null : sibling?.parentNode === parent ? sibling : null);
  }

  open(mode) {
    if (!this.media?.matches || this.switching) return false;
    if (mode === this.mode && mode === 'roads' && this.road.active) return true;
    if (!this.leaveTools()) return false;
    this.switching = true;
    try {
      this.road.exit();
      this.mode = mode;
      this.reviewing = false;
      this.awaitingProperty = false;
      this.message = '';
      this.clearPreview();
      this.shell.select(null, { reveal: false });
      this.shell.navigate(mode === 'generation' ? this.tool : mode === 'add' ? 'landscape' : 'city');
      this.sync();
      if (mode === 'roads') {
        this.road.start({ desktop: true });
        this.sync();
      } else this.$('desktopWorkspaceHeading').focus();
      return true;
    } finally {
      this.switching = false;
    }
  }

  generationTool(tool) {
    if (!this.leaveTools()) return;
    this.tool = tool;
    this.reviewing = false;
    this.message = '';
    this.clearPreview();
    this.shell.select(null, { reveal: false });
    this.shell.navigate(tool);
    this.sync();
  }

  chooseAdd(type) {
    if (!this.leaveTools()) return;
    this.awaitingProperty = false;
    this.message = '';
    const selection = this.shell.state.selection;
    if (type === 'property') {
      this.shell.navigate('city');
      this.addProperty();
    } else if (type === 'building') {
      this.shell.navigate('city');
      if (selection?.kind === 'property' && this.addBuilding(selection.id)) return;
      this.awaitingProperty = true;
      this.message = 'Select a property on the map for the new building.';
    } else {
      if (!this.landscape.available(type)) return;
      this.landscape.beginAdd(type);
    }
    this.sync();
  }

  chooseBuildingProperty(propertyId) {
    if (!this.media?.matches || !this.awaitingProperty) return false;
    if (!propertyId || !this.addBuilding(propertyId)) {
      this.message = 'Choose ground inside an existing property.';
      this.sync();
      return true;
    }
    this.awaitingProperty = false;
    this.message = '';
    this.sync();
    return true;
  }

  setReview(reviewing) {
    this.reviewing = reviewing;
    this.sync();
    this.redraw();
  }

  cancelPreview() {
    this.clearPreview();
    this.message = '';
    this.setReview(false);
  }

  clearPreview() {
    this.candidate = null;
    this.redraw();
  }

  preview() {
    try {
      this.candidate = {
        project: this.prepareGeneration(this.tool),
        accepted: this.acceptedProject(),
        key: this.generationKey(this.tool),
      };
      this.proposed = true;
      this.message = '';
      this.setReview(true);
    } catch (error) {
      this.clearPreview();
      this.message = error.message;
      this.sync();
    }
  }

  apply() {
    if (!this.validPreview()) return;
    this.clearPreview();
    this.setReview(false);
    const control = { city: 'generateButton', districts: 'generateDistrictButton', defenses: 'applyFortificationButton' };
    this.$(control[this.tool]).click();
  }

  validPreview() {
    return this.candidate && this.candidate.accepted === this.acceptedProject()
      && this.candidate.key === this.generationKey(this.tool);
  }

  mapPreview() {
    if (!this.usesGeneration || !this.reviewing || !this.validPreview()) return null;
    return this.proposed ? this.candidate.project : this.candidate.accepted;
  }

  revealGeneration() {
    if (!this.media?.matches) return false;
    this.tool = 'city';
    if (!this.open('generation')) return false;
    this.$('workspaceRebuildGuide').open = true;
    this.$('desktopGenerationPreview').focus();
    return true;
  }

  sync() {
    if (!this.origins) return;
    const $ = this.$, enabled = Boolean(this.media.matches);
    const app = $('workspaceApp');
    app.classList.toggle('three-tab-workspace', enabled);
    const selection = this.shell.state.selection;
    const landscapeSelection = ['landscape-add', 'water', 'terrain'].includes(selection?.kind);
    const contextualInspector = selection && !this.shell.state.inspectorCollapsed
      && !(this.mode === 'add' && landscapeSelection);
    const available = enabled && !this.road.active
      && (!this.layout.panel || this.layout.panel === this.panel) && !contextualInspector;
    this.panel.hidden = !available;
    app.classList.toggle('desktop-home-open', available);
    if (available && this.layout.panel !== this.panel) this.layout.show(this.panel);
    if (!available && this.layout.panel === this.panel) this.layout.hide();

    if (this.outlineMode !== enabled) {
      $('desktopOutlineSettings').open = !enabled;
      this.outlineMode = enabled;
    }
    const generation = enabled && this.mode === 'generation';
    const add = enabled && this.mode === 'add';
    const host = generation ? 'desktopGenerationControls' : null;
    this.move('cityGenerationControls', host && this.tool === 'city' ? host : null);
    this.move('workspaceSection-districts', host && this.tool === 'districts' ? host : null);
    this.move('workspaceSection-defenses', host && this.tool === 'defenses' ? host : null);
    this.move('cityRebuildControls', generation && this.tool === 'city' ? 'desktopCityRebuildControls' : null);
    this.move('workspaceSection-landscape', add ? 'desktopAddLandscapeTools' : null);
    const landscapeTools = $('workspaceSection-landscape');
    landscapeTools.hidden = !add && this.shell.state.section !== 'landscape';
    landscapeTools.inert = landscapeTools.hidden;
    this.move('landscapeInspectorControls', add && landscapeSelection ? 'desktopAddFeatureControls' : null);
    this.move('acceptedRoadHistoryControls', enabled && this.mode === 'roads' ? 'desktopRoadHistory' : null);
    for (const id of ['propertyCreationHistoryControls', 'propertySplitHistoryControls', 'propertyMergeHistoryControls'])
      this.move(id, add ? 'desktopAddPropertyHistory' : null);
    $('newSeedButton').textContent = generation ? 'New street seed' : 'Rebuild with a new seed';
    if (!enabled) return;

    for (const tab of this.tabs) {
      const active = tab.dataset.workspace === this.mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    $('desktopWorkspaceHeading').textContent = generation ? 'Generation' : add ? 'Add to the map' : 'Roads';
    $('desktopHomeGeneration').hidden = !generation;
    $('desktopGenerationViews').hidden = !generation;
    $('desktopGenerationActions').hidden = !generation;
    $('desktopHomeAdd').hidden = !add;
    $('desktopHomeRoads').hidden = this.mode !== 'roads';
    const featureHeading = $('desktopAddFeatureHeading');
    featureHeading.hidden = !add || !landscapeSelection;
    if (!featureHeading.hidden) {
      featureHeading.textContent = selection.kind === 'landscape-add'
        ? 'New ' + { river: 'river', coast: 'coastline', lake: 'lake', terrain: 'mountain range' }[selection.id]
        : this.shell.descriptor()?.title ?? '';
    }
    for (const button of this.tools)
      button.setAttribute('aria-pressed', String(button.dataset.generation === this.tool));
    for (const button of this.addButtons) {
      const type = button.dataset.add;
      button.disabled = !['building', 'property'].includes(type) && !this.landscape.available(type);
      button.setAttribute('aria-pressed', String(selection?.kind === 'landscape-add' && selection.id === type));
    }
    if (this.candidate && !this.validPreview()) {
      this.clearPreview();
      this.message = 'The inputs changed. Preview again to review the current changes.';
    }
    const ready = Boolean(this.candidate);
    $('desktopGenerationControls').hidden = this.reviewing;
    $('desktopGenerationImpact').hidden = !this.reviewing;
    $('desktopGenerationEdit').setAttribute('aria-pressed', String(!this.reviewing));
    $('desktopGenerationReview').setAttribute('aria-pressed', String(this.reviewing));
    $('desktopGenerationComparison').hidden = !ready;
    $('desktopGenerationBefore').setAttribute('aria-pressed', String(!this.proposed));
    $('desktopGenerationProposed').setAttribute('aria-pressed', String(this.proposed));
    $('desktopGenerationCancel').disabled = !ready;
    $('desktopGenerationApply').disabled = !ready;
    $('desktopGenerationApply').textContent = {
      city: 'Rebuild city', districts: 'Rebuild districts', defenses: 'Update defenses',
    }[this.tool];
    const impacts = {
      city: 'A rebuild regenerates streets, properties and buildings around the current outline and landscape drafts.',
      districts: 'This rebuild updates district names and block membership. Streets and buildings stay in place.',
      defenses: 'This update affects walls, gates and towers. The city layout stays in place.',
    };
    const city = this.candidate?.project.city;
    const counts = city ? {
      city: `${city.blocks.length} blocks · ${city.buildings.length} buildings`,
      districts: `${city.districts.length} districts`,
      defenses: `${city.gates.length} gates · ${city.towers.length} towers`,
    }[this.tool] : '';
    $('desktopGenerationImpactText').textContent = [impacts[this.tool], counts].filter(Boolean).join(' ');
    $('desktopWorkspaceStatus').textContent = this.message || (generation
      ? ready ? 'Preview ready. Review and apply when ready.' : 'Set up your changes, then preview.'
      : add ? 'Choose a feature to add.' : '');
  }
}
