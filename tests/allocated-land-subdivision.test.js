import test from 'node:test';
import assert from 'node:assert/strict';
import { findSplitAndMerge } from './helpers/property-split-merge-fixture.js';
import { vacant } from './helpers/vacant-frontage.js';
import { defaultWorkspace,copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { preparePropertyCreationE1 } from '../src/editor/property-creation-e1.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';
import { previewAllocatedLandSubdivision,commitAllocatedLandSubdivision } from '../src/editor/allocated-land-subdivision.js';
const ns='0123456789abcdef0123456789abcdef';
const context={projectId:'ida-land-subdivision',revision:0,namespace:ns};
const splitFixture=findSplitAndMerge();
const site=vacant(),created=preparePropertyCreationE1(site.project,site.workspace,site.draft);
assert.ok(created.ok,JSON.stringify(created.issues));
function fixture(kind){
 const project=copyJson(kind==='property-split'?splitFixture.base:created.candidate);
 const propertyId=kind==='property-split'?splitFixture.propertyId:created.propertyId;
 const intent=kind==='property-split'?{propertyId,t:.5,flexible:false,exitEdge:2,exitT:.5,approved:[]}:
  {propertyId,steps:[{sourceIndex:0,edgeA:0,edgeB:2,ratioA:.5,ratioB:.5,retain:'first'}],approved:false};
 return {kind,intent,session:new AcceptedIdentitySession({project,context}),workspace:defaultWorkspace(project)};
}
const snapshot=f=>JSON.stringify({read:f.session.read(),history:f.session.copyHistory()});
const preview=f=>previewAllocatedLandSubdivision(f.session,f.workspace,f.kind,f.intent);
const commit=(f,p)=>commitAllocatedLandSubdivision(f.session,f.workspace,f.kind,f.intent,p);
const id=(type,n)=>formatAllocatedIdentity(type,ns,n);
for(const kind of ['property-split','plot-subdivision']){
 test('IDA '+kind+' preview is deterministic and consumes no identities',()=>{
  const f=fixture(kind),before=snapshot(f),p=preview(f);
  assert.ok(p.result.ok,JSON.stringify(p.result.issues));assert.deepEqual(preview(f),p);
  assert.equal(snapshot(f),before);assert.ok(p.receipt.allocations.length);
 });
 test('IDA '+kind+' accepts exact typed membership and retains existing buildings',()=>{
  const f=fixture(kind),before=f.session.read().project,p=preview(f),out=commit(f,p);
  for(const [type,collection] of [['property','properties'],['plot','plots']]){
   const old=new Set(before.city[collection].map(x=>x.id));
   const ids=out.project.city[collection].filter(x=>!old.has(x.id)).map(x=>x.id).sort();
   assert.deepEqual(ids,p.receipt.allocations.filter(x=>x.type===type).map(x=>x.id).sort());
  }
  assert.deepEqual(out.project.city.buildings.map(x=>x.id),before.city.buildings.map(x=>x.id));
  assert.deepEqual(out.project,p.result.candidate);assert.equal(out.context.revision,1);
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(createProjectDocument(out.project,f.workspace))).project,out.project);
 });
 test('IDA '+kind+' Undo/Redo retains counters and restores exact records',()=>{
  const f=fixture(kind),before=f.session.read().project,out=commit(f,preview(f));
  const undo=f.session.replay({direction:'undo',context:out.context,workspace:f.workspace});
  assert.deepEqual(undo.project.city,before.city);assert.deepEqual(undo.project.identityAllocation,out.project.identityAllocation);
  const redo=f.session.replay({direction:'redo',context:undo.context,workspace:f.workspace});
  assert.deepEqual(redo.project,out.project);
 });
 test('IDA '+kind+' rejects tampered and stale receipts without partial acceptance',()=>{
  const f=fixture(kind),p=preview(f),bad=structuredClone(p),before=snapshot(f);
  bad.receipt.allocations[0].key='wrong';assert.throws(()=>commit(f,bad));assert.equal(snapshot(f),before);
  commit(f,p);const after=snapshot(f);assert.throws(()=>commit(f,p),/Stale/);assert.equal(snapshot(f),after);
 });
 test('IDA '+kind+' branch after Undo never reuses allocated identities',()=>{
  const f=fixture(kind),p=preview(f),out=commit(f,p);
  f.session.replay({direction:'undo',context:out.context,workspace:f.workspace});
  const q=preview(f);assert.ok(q.receipt.allocations.every(x=>!p.receipt.allocations.some(y=>x.id===y.id)));
  commit(f,q);assert.equal(f.session.copyHistory().future.length,0);
 });
}
test('IDA property split retains left property and maps new lineage and right plot references',()=>{
 const f=fixture('property-split'),p=preview(f),out=commit(f,p),city=out.project.city;
 const left=city.properties.find(x=>x.id===f.intent.propertyId),right=city.properties.find(x=>x.id===id('property',1));
 assert.ok(left&&right);assert.deepEqual(right.propertySplitHistoryE2.at(-1).successors,[left.id,right.id]);
 assert.ok(right.plotIds.every(id=>city.plots.some(x=>x.id===id&&x.propertyId===right.id)));
 assert.ok(left.plotIds.every(id=>city.plots.some(x=>x.id===id&&x.propertyId===left.id)));
});
test('IDA property split invalid cut consumes nothing',()=>{
 const f=fixture('property-split'),before=snapshot(f);f.intent.t=.01;
 assert.throws(()=>preview(f));assert.equal(snapshot(f),before);
});
test('IDA two subdivisions map every newly accepted plot and journal reference',()=>{
 const f=fixture('plot-subdivision');
 f.intent.steps.push({...f.intent.steps[0],sourceIndex:1});
 const p=preview(f),out=commit(f,p),property=out.project.city.properties.find(x=>x.id===f.intent.propertyId);
 assert.deepEqual(p.receipt.allocations.map(x=>x.id),[id('plot',1),id('plot',2)]);
 const h=property.plotPartitionHistory027.at(-1);
 assert.deepEqual(h.steps.map(x=>x.createdId),[id('plot',1),id('plot',2)]);
 assert.equal(h.steps[1].sourceId,id('plot',1));
 assert.deepEqual(h.resultPlotIds,property.plotIds);
 assert.equal(property.plotIds.length,3);
});
test('IDA plot subdivision refuses unsupported merge steps without allocation',()=>{
 const f=fixture('plot-subdivision'),before=snapshot(f);
 f.intent.steps[0].kind='merge';assert.throws(()=>preview(f),/step/);assert.equal(snapshot(f),before);
});
test('IDA plot subdivision rejects invalid edge geometry without allocation',()=>{
 const f=fixture('plot-subdivision'),before=snapshot(f);
 f.intent.steps[0].edgeB=0;assert.throws(()=>preview(f),/distinct/);assert.equal(snapshot(f),before);
});
