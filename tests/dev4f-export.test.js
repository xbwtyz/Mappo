import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { LAYER_KEYS_4F,LAYER_PRESETS_4F,layerPreset4F,identifyLayerPreset4F } from '../src/core/layer-presets-4f.js';
import { safeExportBase4F,exportFilename4F } from '../src/core/export-filenames-4f.js';
import { downloadMapPNG4F } from '../src/data/png-export-4f.js';
import { createProjectDocument,defaultWorkspace,projectFilename,encodeProjectDocument } from '../src/data/project-format.js';

test('Dev4f layer presets only update the existing seven visibility flags',()=>{
 const project=createProject({seed:'4f-presets',size:'small',morphology:'organic'});
 const before=JSON.stringify(project.city);
 assert.equal(LAYER_KEYS_4F.length,7);
 for(const name of Object.keys(LAYER_PRESETS_4F)){
  const preset=layerPreset4F(name);
  assert.equal(identifyLayerPreset4F(preset),name);
  assert.deepEqual(Object.keys(preset).sort(),[...LAYER_KEYS_4F].sort());
  assert.ok(Object.values(preset).every(x=>typeof x==='boolean'));
  preset.buildings=false;
  assert.equal(LAYER_PRESETS_4F[name].buildings,true,'Presets must not be mutable by callers');
 }
 assert.equal(identifyLayerPreset4F({...layerPreset4F('planning'),fortifications:true}),'custom');
 assert.equal(layerPreset4F('unknown'),null);
 assert.equal(JSON.stringify(project.city),before);
 const workspace=defaultWorkspace(project);
 workspace.view.layers=layerPreset4F('minimal');
 const serialized=encodeProjectDocument(createProjectDocument(project,workspace));
 assert.equal(JSON.parse(serialized).workspace.view.layers.plots,false);
 assert.equal(JSON.parse(serialized).project.schemaVersion,10);
});
test('Dev4f filenames sanitize paths and never change existing project content',()=>{
 const project=createProject({seed:'4f-filename',size:'small',morphology:'organic'});
 const doc=createProjectDocument(project,defaultWorkspace(project),null,'2026-11-18T00:00:00.000Z');
 const original=encodeProjectDocument(doc),defaultName=projectFilename(doc);
 assert.equal(exportFilename4F('',defaultName),defaultName);
 assert.equal(exportFilename4F('',defaultName,'png'),defaultName.replace(/\.mappo\.json$/,'.png'));
 assert.equal(exportFilename4F('River Town.mappo.json',defaultName),'River-Town.mappo.json');
 assert.equal(exportFilename4F('River Town.PNG',defaultName,'png'),'River-Town.png');
 assert.equal(exportFilename4F('  ../../Out: Nérø?!',defaultName),'Out-Ner.mappo.json');
 assert.equal(exportFilename4F('CON',defaultName),'mappo-CON.mappo.json');
 assert.equal(exportFilename4F('////',defaultName),defaultName);
 assert.equal(safeExportBase4F('x'.repeat(100)).length,64);
 assert.throws(()=>exportFilename4F('test',defaultName,'svg'),/Unknown/);
 assert.equal(encodeProjectDocument(doc),original);
});
test('Dev4f PNG download serializes the supplied canvas and revokes its object URL',async()=>{
 let clicked=0,removed=0,revoked='';
 const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});
 const env={
  URL:{createObjectURL:b=>{assert.equal(b,blob);return 'blob:sample';},revokeObjectURL:u=>{revoked=u;}},
  document:{body:{appendChild:x=>{assert.equal(x.download,'map.png');}},
    createElement:tag=>{assert.equal(tag,'a');return {click(){clicked++;},remove(){removed++;}};}},
  setTimeout:cb=>cb()
 };
 const canvas={width:1200,height:750,toBlob:(cb,type)=>{assert.equal(type,'image/png');cb(blob);}};
 const result=await downloadMapPNG4F(canvas,'map.png',env);
 assert.deepEqual(result,{width:1200,height:750,bytes:blob.size});
 assert.equal(clicked,1);assert.equal(removed,1);assert.equal(revoked,'blob:sample');
 await assert.rejects(downloadMapPNG4F({width:1,height:1,toBlob:cb=>cb(null)},'broken.png',env),/encode/);
 await assert.rejects(downloadMapPNG4F({},'broken.png',env),/not ready/);
});
