// Pure read-only Phase 5A pending state; never mutates accepted geometry.
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const str = (v, fallback = '') => String(v ?? fallback);

export function describePendingChanges({
  project, outline, water, terrain, controls = {}, districtEditor,
  districtControls = {}, defensePreview
}) {
  if (!project?.city) return { city: [], local: [], count: 0, cityPending: false };
  const { city, options } = project, rebuild = [], local = [];
  if (!equal(outline?.boundary, city.survey.boundary)
    || !equal(outline?.center, options.center)) rebuild.push('Outline or main square');
  if (str(controls.seed) !== str(project.seed)
    || str(controls.size) !== str(options.size)
    || str(controls.morphology) !== str(options.morphology)) rebuild.push('Street generation settings');
  if (water?.dirty) rebuild.push('Water or crossings');
  if (terrain?.dirty) rebuild.push('Mountains or passes');
  const state = city.districtState;
  if (state?.status === 'assigned') {
    if (str(districtControls.count, 'auto') !== str(state.requestedCount, 'auto')
      || str(districtControls.seed) !== str(state.seed, city.id))
      local.push('District generation');
    const selected = city.districts.find(d => d.id === districtEditor?.selectedDistrictId);
    if (selected && (str(districtControls.name) !== str(selected.name)
      || str(districtControls.color) !== str(selected.color)
      || Boolean(districtControls.target))) local.push('Selected district edits');
  } else if (str(districtControls.count, 'auto') !== 'auto') local.push('District generation');
  if (defensePreview?.pending)
    local.push(defensePreview.invalid ? 'Defense settings need correction' : 'Defense update');
  return { city: rebuild, local, count: rebuild.length + local.length, cityPending: Boolean(rebuild.length) };
}

export const REBUILD_EFFECTS = 'Rebuild city regenerates streets, blocks, properties, buildings, districts '
  + 'and enabled defenses. Custom neighborhood names, membership and defensive layouts can be replaced. '
  + 'Save your project first to preserve the current city. Local district and defense updates do not require a full rebuild.';
