import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { migrateBuildingRecordS10, migrateSchema9ProjectS10 } from '../src/core/building-project-s10.js';
import { projectSimpleBuildingS10 } from '../src/core/building-geometry-adapter-s10.js';
import { stampRoadGenerated, classifyRoadProvenance } from '../src/core/road-provenance.js';

const clone = x => JSON.parse(JSON.stringify(x));
// S10-B keeps the shipped Schema 9 migration contract tested independently of
// the now-native Schema 10 generator; no test deletes historical fixtures.
function legacyFixture(options) {
  const current=createProject(options);
  assert.equal(current.schemaVersion,10);
  const old=clone(current);
  old.schemaVersion=9;
  old.city.buildings=old.city.buildings.map(building=>{
    const view=projectSimpleBuildingS10(building.geometry,building.components);
    assert.equal(view.ok,true);
    const legacy={...building,footprint:view.footprint,holes:view.holes};
    delete legacy.geometry; delete legacy.components;
    if (classifyRoadProvenance(building)==='generated') stampRoadGenerated(legacy);
    return legacy;
  });
  return old;
}


test('S10-B P1 migrates generated morphologies without regeneration or accepted-data mutation', () => {
  for (const morphology of ['planned','organic','radial','linear']) {
    const before=legacyFixture({seed:'schema10-b1-'+morphology,size:'small',morphology});
    assert.equal(before.schemaVersion,9);
    const snapshot=JSON.stringify(before);
    const updated=migrateSchema9ProjectS10(before);
    assert.equal(JSON.stringify(before),snapshot);
    assert.equal(updated.schemaVersion,10);
    assert.equal(updated.city.buildings.length,before.city.buildings.length);
    for (let index=0; index<before.city.buildings.length; index++) {
      const original=before.city.buildings[index],next=updated.city.buildings[index];
      assert.equal(next.id,original.id);
      assert.equal(next.propertyId,original.propertyId);
      assert.equal(next.blockId,original.blockId);
      assert.deepEqual(next.plotIds,original.plotIds);
      assert.deepEqual(next.entrance,original.entrance);
      assert.deepEqual(next.accessPath,original.accessPath);
      assert.equal(next.area,original.area);
      assert.equal(classifyRoadProvenance(next),classifyRoadProvenance(original),
        'authored/generated/unknown provenance must survive the schema rewrite');
      assert.equal(Object.hasOwn(next,'footprint'),false);
      assert.equal(Object.hasOwn(next,'holes'),false);
      const view=projectSimpleBuildingS10(next.geometry,next.components);
      assert.equal(view.ok,true);
      assert.deepEqual(view.footprint,original.footprint);
      assert.deepEqual(view.holes,original.holes);
      const roundtrip={...clone(next)};
      delete roundtrip.geometry; delete roundtrip.components;
      const comparableOriginal=clone(original);
      delete comparableOriginal.footprint;delete comparableOriginal.holes;
      // A generator fingerprint includes the serialized shape fields and must
      // be recomputed exactly for proven generated records only.
      if(classifyRoadProvenance(original)==='generated') {
        delete roundtrip.roadProvenance;delete comparableOriginal.roadProvenance;
      }
      assert.deepEqual(roundtrip,comparableOriginal);
    }
    assert.deepEqual({...updated, schemaVersion:9,city:{...updated.city,buildings:[]}},
      {...before,city:{...before.city,buildings:[]}});
    assert.deepEqual(migrateSchema9ProjectS10(before),updated);
  }
});

test('S10-B P1 preserves building and compound metadata with independent ownership', () => {
  const project=legacyFixture({seed:'schema10-b1-metadata',size:'small'});
  const target=project.city.buildings[0];
  target.customName='A deliberately authored building';
  target.extensions={owner:{name:'Keep this'},history:[1,2]};
  target.foreignExtension={name:'opaque'};
  const site=project.city.properties.find(p=>p.id===target.propertyId);
  site.extensions={siteMetadata:{notes:'unchanged'}};
  if(site.buildingIds.length>=2)
    site.buildingCompounds=[{id:'CMP-MAN-0001',name:'Independent compound',
      memberBuildingIds:site.buildingIds.slice(0,2)}];
  const original=clone(project);
  const updated=migrateSchema9ProjectS10(project);
  const converted=updated.city.buildings.find(b=>b.id===target.id);
  assert.deepEqual(converted.extensions,target.extensions);
  assert.deepEqual(converted.foreignExtension,target.foreignExtension);
  assert.equal(converted.customName,target.customName);
  assert.deepEqual(updated.city.properties,original.city.properties);
  assert.deepEqual(project,original);
  assert.equal(converted.components.length,1);
  assert.equal(converted.geometry.regions[0].componentId,converted.components[0].id);
});

test('S10-B P1 refuses field collisions, malformed geometry, and partial migrations', () => {
  const p=legacyFixture({seed:'schema10-b1-reject',size:'small'});
  const snapshot=JSON.stringify(p);
  assert.throws(()=>migrateBuildingRecordS10({...p.city.buildings[0],geometry:{custom:'data'}}),/overwrite/);
  assert.throws(()=>migrateBuildingRecordS10({...p.city.buildings[0],components:[]}),/overwrite/);
  const malformed=clone(p);
  malformed.city.buildings.at(-1).holes=[malformed.city.buildings.at(-1).footprint];
  assert.throws(()=>migrateSchema9ProjectS10(malformed));
  assert.equal(JSON.stringify(p),snapshot);
  assert.throws(()=>migrateSchema9ProjectS10({...p,schemaVersion:10}),/Schema 9/);
  assert.throws(()=>migrateSchema9ProjectS10({...p,city:{...p.city,buildings:null}}),/Schema 9/);
});

test('S10-B P1 converted records never have dual writable geometry', () => {
  const p=legacyFixture({seed:'schema10-b1-authority',size:'small'});
  const source=p.city.buildings[0];
  const converted=migrateBuildingRecordS10(source);
  assert.deepEqual(Object.keys(converted).filter(k=>['footprint','holes'].includes(k)),[]);
  assert.equal(converted.geometry.version,1);
  converted.geometry.regions[0].ring[0].x += .01;
  assert.notDeepEqual(converted.geometry.regions[0].ring,source.footprint);
  assert.equal(JSON.stringify(p.city.buildings[0]),JSON.stringify(source));
});
