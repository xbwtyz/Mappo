// Desktop navigation reuses the existing edit forms and their transaction owners.
const landscapeActions = {
  river: 'generateRiverButton', coast: 'generateCoastButton',
  lake: 'addLakeButton', terrain: 'addTerrainButton',
};

const landscapeRegeneration = { lake: 'regenerateLakeButton', terrain: 'regenerateTerrainButton' };

export class DesktopWorkspace {
  constructor({ getElement, layout, shell, road, landscape, leaveTools, addProperty,
    addBuilding, prepareGeneration, generationKey, acceptedProject, redraw, enabled = true }) {
    Object.assign(this, { $: getElement, layout, shell, road, landscape, leaveTools,
      addProperty, addBuilding, prepareGeneration, generationKey, acceptedProject, redraw });
    this.mode = 'generation';
    this.tool = 'city';
    this.reviewing = false;
    this.proposed = true;
    this.landscapeReviewing = false;
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
    this.shell.inspectorA3.bind('landscape','Details','desktopLandscapeDetailsA3');
    this.shell.inspectorA3.bind('district','Details','desktopDistrictDetailsA3');
    this.shell.inspectorA3.bind('district','Edit','desktopDistrictEditA3');
    $('desktopLandscapeEdit').addEventListener('click', () => this.setLandscapeReview(false));
    $('desktopLandscapeReview').addEventListener('click', () => this.setLandscapeReview(true));
    $('desktopDistrictBack').addEventListener('click', () => {
      this.shell.clear();
      this.tools.find(button => button.dataset.generation === 'districts').focus();
    });
    for (const [id, proposed] of [['desktopGenerationBefore', false], ['desktopGenerationProposed', true]])
      $(id).addEventListener('click', () => {
        this.proposed = proposed;
        this.sync();
        this.redraw();
      });
    this.origins = new Map();
    for (const id of ['cityGenerationControls', 'cityRebuildControls', 'workspaceSection-districts',
      'workspaceSection-defenses', 'workspaceSection-landscape', 'landscapeInspectorControls',
      'roadHistoryHome', 'propertyCreationHistoryControls', 'propertyDeletionHistoryControls',
      'buildingStructureHistoryPanel', 'undoDistrictButton', 'undoFortificationButton',
      'districtInspectorControls', 'workspaceCityReport', 'landscapeHistoryTools', 'landscapeDraftStatus',
      'landscapeReviewRebuild', ...Object.values(landscapeActions), ...Object.values(landscapeRegeneration),
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
    if (mode === this.mode && (mode !== 'roads' || this.road.active)) return true;
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

  setLandscapeReview(reviewing) {
    this.landscapeReviewing = reviewing;
    this.shell.inspectorA3.select('landscape',reviewing?'Review':'Edit');
    this.sync();
  }

  syncLandscape(add, selection, landscapeSelection) {
    const $ = this.$;
    const creating = add && selection?.kind === 'landscape-add';
    const showFeature = add && landscapeSelection;
    const key=showFeature?selection.kind+':'+selection.id:null;
    const presentation=this.shell.inspectorA3;
    const details=showFeature&&presentation.view('landscape',key)==='Details';
    const reviewing = showFeature && this.landscapeReviewing && !details;
    const pending = add && (this.landscape.water.editor.dirty || this.landscape.terrain.editor.dirty);
    this.move('landscapeHistoryTools', add ? 'desktopLandscapeHistory' : null);
    this.move('landscapeDraftStatus', showFeature ? 'desktopLandscapeStatus' : null);
    this.move('landscapeReviewRebuild', add ? 'desktopLandscapeActions' : null);
    const type = showFeature ? this.landscape.type(selection) : null;
    const primaryAction = !showFeature ? null : !creating && landscapeRegeneration[type]
      ? landscapeRegeneration[type] : landscapeActions[type];
    for (const id of [...Object.values(landscapeActions), ...Object.values(landscapeRegeneration)])
      this.move(id, id === primaryAction ? 'desktopLandscapeActions' : null);
    $('desktopLandscapeActions').dataset.reviewing = String(Boolean(reviewing));
    if (add) $('landscapeReviewRebuild').hidden = !pending;
    $('desktopLandscapeFooter').hidden = !add;
    $('desktopLandscapeViews').hidden = !showFeature;
    if(showFeature){
      const descriptor=this.shell.descriptor();
      presentation.present('landscape',{key,kind:selection.kind,title:descriptor?.title,host:$('desktopHomeAdd'),
        views:['Details','Edit','Review'],initial:reviewing?'Review':'Edit',priority:20,
        buttons:{Details:'desktopLandscapeDetailsA3',Edit:'desktopLandscapeEdit',Review:'desktopLandscapeReview'},
        factsId:'desktopLandscapeDetailsFactsA3',rows:inspectorFactsA3(descriptor),
        onView:view=>{this.landscapeReviewing=view==='Review';this.sync();}});
    }else presentation.release('landscape');
    $('desktopLandscapeDetailsPanelA3').hidden=!details;
    $('desktopAddFeatureControls').hidden = !showFeature || reviewing || details;
    $('desktopLandscapeActions').dataset.reviewing=String(Boolean(reviewing||details));
    $('desktopLandscapeImpact').hidden = !reviewing;
    if (!reviewing) return;

    const city = this.acceptedProject()?.city;
    const record = this.landscape.record(selection);
    const original = record && (record.kind === 'terrain' ? city?.terrainFeatures : city?.waterFeatures)
      ?.find(feature => feature.id === record.id);
    $('desktopLandscapeImpactText').textContent = creating
      ? 'Create a draft to review the feature on the map.'
      : !original ? 'This new feature is in the landscape draft. The accepted city has not changed.'
        : JSON.stringify(original) === JSON.stringify(record.feature)
          ? 'The feature geometry matches the accepted city.'
          : 'The map shows draft geometry for this feature. Rebuild city to apply it.';
    const rows = this.shell.descriptor()?.sections?.flatMap(section => section.rows ?? []) ?? [];
    const facts = $('desktopLandscapeFacts');
    facts.replaceChildren(...rows.map(([label, value]) => {
      const item = facts.ownerDocument.createElement('li');
      item.textContent = label + ': ' + value;
      return item;
    }));
  }

  syncDistrict(active) {
    const $ = this.$;
    const descriptor = active ? this.shell.descriptor() : null;
    this.move('districtInspectorControls', active ? 'desktopDistrictControls' : null);
    $('desktopDistrictEdit').hidden = !active;
    $('desktopGenerationForms').hidden = active;
    const presentation=this.shell.inspectorA3;
    if (!active) {presentation.release('district');return;}
    const ref=this.shell.state.selection;
    const c=presentation.present('district',{key:'district:'+ref.id,kind:'district',title:descriptor?.title,
      host:$('desktopDistrictEdit'),views:['Details','Edit'],initial:'Edit',priority:20,
      buttons:{Details:'desktopDistrictDetailsA3',Edit:'desktopDistrictEditA3'},
      factsId:'desktopDistrictFactsA3',rows:inspectorFactsA3(descriptor),onView:()=>this.sync()});
    $('desktopDistrictControls').hidden=c.view==='Details';
    $('desktopDistrictFactsA3').hidden=c.view!=='Details';
    $('desktopDistrictDetails').hidden=c.view==='Details';
    $('desktopDistrictName').textContent = descriptor?.title ?? 'District';
    $('desktopDistrictFacts').textContent = (descriptor?.sections ?? [])
      .flatMap(section => section.rows ?? []).map(([label, value]) => label + ': ' + value).join(' · ');
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
    const districtSelection = selection?.kind === 'district';
    const selectionKey = selection ? selection.kind + ':' + selection.id : '';
    if (selectionKey !== this.selectionKey) {
      this.selectionKey = selectionKey;
      this.landscapeReviewing = false;
      if (enabled && !this.switching && !this.road.active) {
        if (landscapeSelection) this.mode = 'add';
        if (districtSelection) {
          this.mode = 'generation';
          this.tool = 'districts';
          this.reviewing = false;
        }
      }
    }
    const generation = enabled && this.mode === 'generation';
    const add = enabled && this.mode === 'add';
    const districtEdit = generation && this.tool === 'districts' && districtSelection && !this.road.active;
    const contextualInspector = selection && !this.shell.state.inspectorCollapsed
      && !districtEdit && !(add && landscapeSelection);
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
    const host = generation ? 'desktopGenerationForms' : null;
    this.move('cityGenerationControls', host && this.tool === 'city' ? host : null);
    this.move('workspaceSection-districts', host && this.tool === 'districts' ? host : null);
    this.move('workspaceSection-defenses', host && this.tool === 'defenses' ? host : null);
    this.move('cityRebuildControls', generation && this.tool === 'city' ? 'desktopCityRebuildControls' : null);
    this.move('workspaceSection-landscape', add ? 'desktopAddLandscapeTools' : null);
    const landscapeTools = $('workspaceSection-landscape');
    landscapeTools.hidden = !add && this.shell.state.section !== 'landscape';
    landscapeTools.inert = landscapeTools.hidden;
    this.move('landscapeInspectorControls', add && landscapeSelection ? 'desktopAddFeatureControls' : null);
    this.move('roadHistoryHome', enabled && this.mode === 'roads' ? 'desktopRoadHistory' : null);
    this.move('workspaceCityReport', host && this.tool === 'city' ? 'desktopCityReport' : null);
    this.move('undoDistrictButton', generation && this.tool === 'districts' ? 'desktopGenerationHistory' : null);
    this.move('undoFortificationButton', generation && this.tool === 'defenses' ? 'desktopGenerationHistory' : null);
    const placeSelection = ['property', 'building'].includes(selection?.kind);
    this.move('buildingStructureHistoryPanel', enabled && placeSelection && contextualInspector ? 'desktopInspectorHistory' : null);
    this.move('propertyDeletionHistoryControls', available ? 'desktopDeletionHistory'
      : enabled && placeSelection && contextualInspector ? 'desktopInspectorHistory' : null);
    this.syncDistrict(districtEdit);
    this.syncLandscape(add, selection, landscapeSelection);
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
    $('desktopGenerationViews').hidden = !generation || districtEdit;
    $('desktopGenerationActions').hidden = !generation || districtEdit;
    $('desktopCityReport').hidden = !generation || this.tool !== 'city' || this.reviewing;
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
      ? districtEdit ? '' : ready ? 'Preview ready. Review and apply when ready.' : 'Set up your changes, then preview.'
      : add && !landscapeSelection ? 'Choose a feature to add.' : '');
  }
}
