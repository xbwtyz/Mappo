// Inspector providers translate existing records into display sections. The
// shell knows no feature geometry and can accept additional providers later.
export function registerWorkspaceInspectors(shell, {
  getCity,
  getDistrictPanel,
  getWaterPanel,
  getTerrainPanel
}) {
  shell.registerInspector('district', {
    resolve: id => {
      const city = getCity(),
        panel = getDistrictPanel(),
        district = city?.districtState.status === 'assigned' ? city.districts.find(d => d.id === id) : null;
      if (!district || panel.editor.selectedDistrictId !== id) return null;
      return {
        type: 'Neighborhood',
        title: district.name,
        description: 'A connected group of city blocks.',
        section: 'districts',
        controlLabel: 'Open district controls',
        sections: [{
          title: 'District summary',
          rows: [
            ['Blocks', district.blockIds.length],
            ['Properties', city.properties.filter(p => p.districtId === id).length],
            ['Buildings', city.buildings.filter(b => b.districtId === id).length], ...(panel.editor.selectedBlockId ? [
              ['Selected block', panel.editor.selectedBlockId]
            ] : [])
          ]
        }]
      };
    }
  });
  shell.registerInspector('water', {
    resolve: id => {
      const editor = getWaterPanel()?.editor,
        feature = editor?.features.find(f => f.id === id);
      if (!feature) return null;
      const type = feature.kind === 'lake' ? 'Lake' : feature.kind === 'coast' ? 'Coastline' : 'River';
      return {
        type,
        title: typeof feature.name === 'string' ? feature.name : `${type} · ${feature.id}`,
        description: editor.dirty ? 'Water draft pending city generation.' : 'Geometry from the current city.',
        section: 'landscape',
        controlLabel: 'Open water controls',
        sections: [{
          title: 'Water feature',
          rows: [
            ['Shape handles', feature.path.length], ...(feature.kind === 'river' ? [
              ['Width', feature.width],
              ['Bridges', editor.bridges.filter(b => b.waterId === id).length]
            ] : feature.kind === 'coast' ? [
              ['Ocean side', feature.waterSide]
            ] : [])
          ]
        }]
      };
    }
  });
  shell.registerInspector('terrain', {
    resolve: id => {
      const editor = getTerrainPanel()?.editor,
        feature = editor?.features.find(f => f.id === id);
      if (!feature) return null;
      return {
        type: 'Mountain range',
        title: feature.name,
        description: editor.dirty ? 'Terrain draft pending city generation.' : 'Geometry from the current city.',
        section: 'landscape',
        controlLabel: 'Open mountain controls',
        sections: [{
          title: 'Range summary',
          rows: [
            ['Foothill handles', feature.path.length],
            ['Ridge peaks', feature.ridge.length],
            ['Highest peak', Math.max(...feature.ridge.map(p => p.height))],
            ['Road passes', editor.passes.filter(p => p.terrainId === id).length]
          ]
        }]
      };
    }
  });
  return shell;
}
