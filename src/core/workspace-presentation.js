// Optional schema-1 workspace presentation fields. No city schema migration.
// These rules validate user-controlled saved UI data before it touches the DOM.
export const WORKSPACE_SECTION_IDS = Object.freeze(['city','landscape','districts','defenses']);
export const WORKSPACE_DISCLOSURE_IDS = Object.freeze([
  'startingShapeSettings','cityGenerationSettings','landscapeHelpSettings',
  'districtPanel','districtGenerationSettings','fortificationPanel',
  'defenseGenerationSettings','workspaceRebuildGuide',
  'waterPanel','riverGenerationSettings','coastGenerationSettings',
  'lakeGenerationSettings','terrainPanel','terrainGenerationSettings',
  'workspaceCityReport'
]);
export const LANDSCAPE_CONTROL_IDS = Object.freeze([
  'waterSeedInput','riverWidthInput','coastSeedInput','coastDirectionInput',
  'lakeSeedInput','lakeRadiusInput','terrainSeedInput','terrainSizeInput',
  'terrainHeightInput','terrainPlacementInput'
]);

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteScroll = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000000;
const selectionValid = s => s === null || (object(s)
  && ['water','terrain','district','landscape-add'].includes(s.kind)
  && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 128
  && (s.kind !== 'landscape-add' || ['river','coast','lake','terrain'].includes(s.id)));

export function validateWorkspacePresentation(ui) {
  if (ui === undefined) return;
  if (!object(ui)) throw new Error('Invalid saved workspace presentation.');
  if (ui.section !== undefined && !WORKSPACE_SECTION_IDS.includes(ui.section)) throw new Error('Invalid saved editor section.');
  for (const key of ['toolsCollapsed','inspectorCollapsed','inspectorPinned'])
    if (ui[key] !== undefined && typeof ui[key] !== 'boolean') throw new Error('Invalid saved panel visibility.');
  if (ui.selection !== undefined && !selectionValid(ui.selection)) throw new Error('Invalid saved inspector selection.');
  if (ui.inspectorScroll !== undefined && !finiteScroll(ui.inspectorScroll)) throw new Error('Invalid inspector scroll position.');
  if (ui.sectionScroll !== undefined) {
    if (!object(ui.sectionScroll)) throw new Error('Invalid section scroll positions.');
    for (const id of WORKSPACE_SECTION_IDS)
      if (ui.sectionScroll[id] !== undefined && !finiteScroll(ui.sectionScroll[id]))
        throw new Error('Invalid section scroll position.');
  }
  if (ui.disclosures !== undefined) {
    if (!object(ui.disclosures)) throw new Error('Invalid saved disclosure state.');
    for (const id of WORKSPACE_DISCLOSURE_IDS)
      if (ui.disclosures[id] !== undefined && typeof ui.disclosures[id] !== 'boolean')
        throw new Error('Invalid saved disclosure visibility.');
  }
  if (ui.landscape !== undefined) {
    if (!object(ui.landscape)) throw new Error('Invalid saved landscape UI.');
    if (ui.landscape.filter !== undefined && !['all','water','mountains'].includes(ui.landscape.filter))
      throw new Error('Invalid saved landscape filter.');
    if (ui.landscape.formCache !== undefined) {
      if (!Array.isArray(ui.landscape.formCache) || ui.landscape.formCache.length > 80)
        throw new Error('Too many saved landscape input drafts.');
      const seen = new Set();
      for (const entry of ui.landscape.formCache) {
        if (!object(entry) || typeof entry.key !== 'string' || !/^(water|terrain|landscape-add):.{1,128}$/.test(entry.key)
          || seen.has(entry.key) || !object(entry.controls) || Object.keys(entry.controls).length > LANDSCAPE_CONTROL_IDS.length)
          throw new Error('Invalid saved landscape input draft.');
        seen.add(entry.key);
        for (const [id, value] of Object.entries(entry.controls))
          if (!LANDSCAPE_CONTROL_IDS.includes(id) || typeof value !== 'string' || value.length > 256)
            throw new Error('Invalid saved landscape input.');
      }
    }
  }
  if (ui.districts !== undefined) {
    if (!object(ui.districts)) throw new Error('Invalid saved district UI.');
    if (ui.districts.formCache !== undefined) {
      if (!Array.isArray(ui.districts.formCache) || ui.districts.formCache.length > 80)
        throw new Error('Too many saved district input drafts.');
      const seen = new Set();
      for (const entry of ui.districts.formCache) {
        if (!object(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 128 || seen.has(entry.id)
          || typeof entry.name !== 'string' || entry.name.length > 64
          || typeof entry.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.color))
          throw new Error('Invalid saved district input draft.');
        seen.add(entry.id);
      }
    }
  }
  return ui;
}
