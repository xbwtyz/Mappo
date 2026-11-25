import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createProject } from '../src/core/city-model.js';
import { roadTopologyId } from '../src/core/road-crossings.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { issueIdentityReservation, verifyIdentityAdditions } from '../src/core/identity-verification.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const context={projectId:'ida-generation-audit',revision:0,namespace:'0123456789abcdef0123456789abcdef'};
function sourceFiles(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=join(dir,entry.name);
    return entry.isDirectory()?sourceFiles(path):/\.(?:js|mjs|cjs)$/.test(entry.name)?[path]:[];
  }).sort();
}
test('IDA generation audit inventories all current direct generator and reflow symbol references',t=>{
  // Deliberate source inventory, not a JS parser or proof against computed
  // dispatch. New callers must be classified rather than silently enabled.
  const expected={
    populateProperty:['src/core/road-building-reflow.js','src/generators/buildings.js'],
    generateBuildings:['src/core/city-model.js','src/core/road-topology-reflow.js','src/generators/buildings.js'],
    reflowGeneratedRoadBuildings:['src/core/neighborhood-reflow.js','src/core/road-building-reflow.js']
  };
  const files=sourceFiles(join(root,'src'));
  for(const [symbol,paths] of Object.entries(expected)){
    const found=[];
    for(const path of files){
      const lines=readFileSync(path,'utf8').split(/\r?\n/);
      const hits=lines.flatMap((line,index)=>new RegExp('\\b'+symbol+'\\b').test(line)?[index+1]:[]);
      if(!hits.length)continue;
      const name=relative(root,path).replaceAll('\\','/');
      found.push(name);
      t.diagnostic(symbol+' '+name+':'+hits.join(','));
    }
    assert.deepEqual(found.sort(),paths.slice().sort(),symbol+' caller inventory changed');
  }
  t.diagnostic('Scanned '+files.length+' source files');
});
test('IDA initial generation keeps seeded sequential IDs and an empty allocator',()=>{
  const options={seed:'c2-planned',size:'small',morphology:'planned'};
  const a=createProject(options),b=createProject(options);
  assert.deepEqual(a,b);
  assert.deepEqual(a.identityAllocation.namespaces,{});
  assert.ok(a.city.buildings.length>0);
  assert.ok(a.city.buildings.every((row,i)=>row.id==='BLD-'+String(i+1).padStart(5,'0')));
});
test('IDA topology legacy name generator checks active IDs, not retired history',()=>{
  // Characterize the helper only; this is not evidence of a complete live
  // retirement/recreation sequence or a requirement to preserve unsafe use.
  const active=new Set(),key=['BLOCK-fixture','BLD-00001'];
  const first=roadTopologyId('BLD-X',key,active);
  const next=roadTopologyId('BLD-X',key,active);
  assert.notEqual(first,next);
  active.delete(first);
  assert.equal(roadTopologyId('BLD-X',key,active),first);
});
function assertUnreservedRefusal(project,result,prefix){
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  const beforeIds=new Set(project.city.buildings.map(b=>b.id));
  const added=result.candidateProject.city.buildings.filter(b=>!beforeIds.has(b.id));
  assert.ok(added.length>0,'Expected new buildings in fixture');
  assert.ok(added.every(b=>b.id.startsWith(prefix)),JSON.stringify(added.map(b=>b.id)));
  assert.deepEqual(result.candidateProject.identityAllocation,project.identityAllocation);
  const before=JSON.stringify(project),requests=[];
  const receipt=issueIdentityReservation(project.identityAllocation,project.city,context,requests);
  assert.throws(()=>verifyIdentityAdditions(project.identityAllocation,project.city,context,requests,receipt,result.candidateProject.city),/Unreserved identity addition/);
  assert.equal(JSON.stringify(project),before);
}
test('IDA refuses unreserved neighborhood regeneration from an existing C3 fixture',()=>{
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const before=structuredClone(project);
  const result=prepareNeighborhoodReflowC3(project,'RD-0113',{x:12,y:0});
  assert.ok(result.ledger.some(row=>row.kind==='building'&&row.disposition==='regenerated'));
  assertUnreservedRefusal(project,result,'BLD-REFLOW-');
  assert.deepEqual(project,before);
});
test('IDA refuses unreserved topology development from an existing crossing fixture',()=>{
  const project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  const before=structuredClone(project);
  const result=prepareNeighborhoodReflowC3(project,'RD-0103',{x:0,y:15});
  assertUnreservedRefusal(project,result,'BLD-X-');
  assert.deepEqual(project,before);
});
test('IDA refuses unreserved topology development after an ordinary road removal',()=>{
  const project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  const before=structuredClone(project);
  const result=prepareRoadTopologyReflowC3(project,'RD-0099',null,{kind:'remove'});
  assertUnreservedRefusal(project,result,'BLD-X-');
  assert.deepEqual(project,before);
});
