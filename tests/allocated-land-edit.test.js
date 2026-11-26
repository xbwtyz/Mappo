import test from 'node:test';
import assert from 'node:assert/strict';
import { vacant } from './helpers/vacant-frontage.js';
import { findSplitAndMerge } from './helpers/property-split-merge-fixture.js';
import { copyJson,defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { previewAllocatedPropertyCreation,commitAllocatedPropertyCreation } from '../src/editor/allocated-property-creation.js';
import { previewAllocatedLandSubdivision,commitAllocatedLandSubdivision } from '../src/editor/allocated-land-subdivision.js';
import { previewAllocatedLandEdit,commitAllocatedLandEdit } from '../src/editor/allocated-land-edit.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';

const ns='0123456789abcdef0123456789abcdef';
const context={projectId:'ida-land-edit',revision:0,namespace:ns};
const site=vacant(),mergeSite=findSplitAndMerge();
const snap=s=>JSON.stringify({read:s.read(),history:s.copyHistory()});
const id=(type,n)=>formatAllocatedIdentity(type,ns,n);
function fresh(){
  const session=new AcceptedIdentitySession({project:copyJson(site.project),context}),workspace=copyJson(site.workspace);
  const p=previewAllocatedPropertyCreation(session,workspace,site.draft);
  const out=commitAllocatedPropertyCreation(session,workspace,site.draft,p);
  return {session,workspace,propertyId:p.result.propertyId,plotId:p.result.plotId,created:out};
}
const editPreview=(f,steps)=>previewAllocatedLandEdit(f.session,f.workspace,'property-edit',{propertyId:f.propertyId,steps,approved:false});
const editApply=(f,steps,p)=>commitAllocatedLandEdit(f.session,f.workspace,'property-edit',{propertyId:f.propertyId,steps,approved:false},p);
const splitStep={sourceIndex:0,edgeA:0,edgeB:2,ratioA:.5,ratioB:.5,retain:'first'};
const mergeStep={kind:'merge',sourceIndex:0,otherIndex:1,retain:'first'};
const partitionPreview=(f,steps)=>previewAllocatedLandSubdivision(f.session,f.workspace,'plot-subdivision',{propertyId:f.propertyId,steps,approved:false});
const partitionApply=(f,steps,p)=>commitAllocatedLandSubdivision(f.session,f.workspace,'plot-subdivision',{propertyId:f.propertyId,steps,approved:false},p);
const propertyOf=(out,f)=>out.project.city.properties.find(p=>p.id===f.propertyId);
test('IDA ordinary divider creation assigns an allocated plot and maps its history',()=>{
  const f=fresh(),steps=[{kind:'add-divider',index:0}],before=snap(f.session),p=editPreview(f,steps);
  assert.ok(p.result.ok,JSON.stringify(p.result.issues));assert.equal(snap(f.session),before);
  assert.deepEqual(p.receipt.allocations.map(x=>x.id),[id('plot',2)]);
  const out=editApply(f,steps,p),property=propertyOf(out,f);
  assert.deepEqual(property.plotIds,[f.plotId,id('plot',2)]);
  assert.equal(property.plotCountHistoryE4.at(-1).newId,id('plot',2));
  assert.equal(property.plotCountHistoryE4.at(-1).retainedId,f.plotId);
});
test('IDA divider removal retires the allocated plot with no new counter advance',()=>{
  const f=fresh(),split=[{kind:'add-divider',index:0}],out=editApply(f,split,editPreview(f,split));
  const steps=[{kind:'remove-divider',index:0}],p=editPreview(f,steps),merged=editApply(f,steps,p);
  assert.deepEqual(p.receipt.allocations,[]);
  assert.deepEqual(merged.project.identityAllocation,out.project.identityAllocation);
  assert.deepEqual(propertyOf(merged,f).plotIds,[f.plotId]);
  assert.equal(propertyOf(merged,f).plotCountHistoryE4.at(-1).retiredId,id('plot',2));
  const undone=f.session.replay({direction:'undo',context:merged.context,workspace:f.workspace});
  assert.deepEqual(undone.project,out.project);
});
test('IDA geometry-only rear shrink preserves land identities and counters',()=>{
  const f=fresh(),property=propertyOf(f.created,f),v=property.frame.inward;
  const steps=[2,3].map(index=>({kind:'corner',index,point:{x:property.boundary[index].x-v.x*.1,y:property.boundary[index].y-v.y*.1}}));
  const p=editPreview(f,steps),out=editApply(f,steps,p);
  assert.deepEqual(p.receipt.allocations,[]);assert.deepEqual(propertyOf(out,f).plotIds,[f.plotId]);
  assert.deepEqual(out.project.identityAllocation,f.created.project.identityAllocation);
  assert.notDeepEqual(propertyOf(out,f).boundary,property.boundary);
});
test('IDA polygon retiling reserves only new convex cells, retaining the first plot',()=>{
  const f=fresh(),property=propertyOf(f.created,f),v=property.frame.inward;
  const p2=property.boundary[2],p3=property.boundary[3];
  const steps=[{kind:'add-vertex',index:2},{kind:'corner',index:3,point:{x:(p2.x+p3.x)/2-v.x*2,y:(p2.y+p3.y)/2-v.y*2}}];
  const p=editPreview(f,steps),out=editApply(f,steps,p),row=propertyOf(out,f);
  assert.ok(p.receipt.allocations.length>0);assert.equal(row.plotIds[0],f.plotId);
  assert.deepEqual(new Set(row.plotIds.slice(1)),new Set(p.receipt.allocations.map(x=>x.id)));
  assert.deepEqual(out.project,p.result.candidate);
});
test('IDA mixed draft split then merge back consumes no persistent identity',()=>{
  const f=fresh(),steps=[splitStep,mergeStep],p=partitionPreview(f,steps),out=partitionApply(f,steps,p),row=propertyOf(out,f);
  assert.deepEqual(p.receipt.allocations,[]);
  assert.deepEqual(out.project.identityAllocation,f.created.project.identityAllocation);
  assert.deepEqual(row.plotIds,[f.plotId]);
  const journal=row.plotPartitionHistory027.at(-1);
  assert.match(journal.steps[0].createdId,/^PLOT-DRAFT-/);
  assert.equal(journal.steps[1].retiredId,journal.steps[0].createdId);
  assert.deepEqual(journal.retiredIds,[]);
});
test('IDA mixed draft can retire an accepted plot while preserving a new survivor',()=>{
  const f=fresh(),steps=[splitStep,{...mergeStep,retain:'second'}],p=partitionPreview(f,steps),out=partitionApply(f,steps,p),row=propertyOf(out,f);
  assert.deepEqual(row.plotIds,[id('plot',2)]);
  const journal=row.plotPartitionHistory027.at(-1);
  assert.equal(journal.steps[0].createdId,id('plot',2));assert.equal(journal.steps[1].retainedId,id('plot',2));
  assert.deepEqual(journal.retiredIds,[f.plotId]);
  assert.equal(out.project.identityAllocation.namespaces[ns].plot,2);
});
test('IDA split merge split retains distinct transient journal labels without allocation gaps',()=>{
  const f=fresh(),steps=[splitStep,mergeStep,splitStep],p=partitionPreview(f,steps),out=partitionApply(f,steps,p),row=propertyOf(out,f);
  assert.deepEqual(p.receipt.allocations.map(x=>x.id),[id('plot',2)]);
  const h=row.plotPartitionHistory027.at(-1);
  assert.notEqual(h.steps[0].createdId,h.steps[2].createdId);
  assert.equal(h.steps[1].retiredId,h.steps[0].createdId);assert.equal(h.steps[2].createdId,id('plot',2));
  assert.ok(out.project.city.plots.every(x=>!x.id.startsWith('PLOT-DRAFT-')));
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(createProjectDocument(out.project,f.workspace))).project,out.project);
});
test('IDA property merge retires allocated secondary while preserving all plot and building identities',()=>{
  const base=copyJson(mergeSite.base),session=new AcceptedIdentitySession({project:base,context}),workspace=defaultWorkspace(base);
  const splitIntent={propertyId:mergeSite.propertyId,t:.5,flexible:false,exitEdge:2,exitT:.5,approved:[]};
  const p=previewAllocatedLandSubdivision(session,workspace,'property-split',splitIntent);
  const divided=commitAllocatedLandSubdivision(session,workspace,'property-split',splitIntent,p);
  const intent={primaryId:mergeSite.propertyId,secondaryId:p.result.newPropertyId,approved:true,approvedBuildings:[]};
  const preview=previewAllocatedLandEdit(session,workspace,'property-merge',intent);
  assert.ok(preview.result.ok,JSON.stringify(preview.result.issues));assert.deepEqual(preview.receipt.allocations,[]);
  const out=commitAllocatedLandEdit(session,workspace,'property-merge',intent,preview);
  assert.deepEqual(out.project.identityAllocation,divided.project.identityAllocation);
  assert.equal(out.project.city.properties.some(x=>x.id===intent.secondaryId),false);
  assert.deepEqual(out.project.city.plots.map(x=>x.id),divided.project.city.plots.map(x=>x.id));
  assert.deepEqual(out.project.city.buildings.map(x=>x.id),divided.project.city.buildings.map(x=>x.id));
  const lineage=out.project.city.properties.find(x=>x.id===intent.primaryId).propertyMergeHistoryE3.at(-1);
  assert.equal(lineage.retiredRecord.id,intent.secondaryId);
  assert.deepEqual(session.replay({direction:'undo',context:out.context,workspace}).project,divided.project);
});
test('IDA land edit refuses stale receipt and malformed counter without publication',()=>{
  const f=fresh(),steps=[{kind:'add-divider',index:0}],p=editPreview(f,steps),bad=structuredClone(p),before=snap(f.session);
  bad.receipt.nextState.namespaces[ns].plot++;
  assert.throws(()=>editApply(f,steps,bad));assert.equal(snap(f.session),before);
  editApply(f,steps,p);const after=snap(f.session);
  assert.throws(()=>editApply(f,steps,p),/Stale/);assert.equal(snap(f.session),after);
});
test('IDA land edit rejects caller supplied identity and invalid geometry',()=>{
  const f=fresh(),before=snap(f.session);
  assert.throws(()=>editPreview(f,[{kind:'add-divider',index:0,id:'PLOT-OVERRIDE'}]),/step/);
  assert.throws(()=>editPreview(f,[{kind:'corner',index:2,point:{x:9999,y:9999}}]));
  assert.equal(snap(f.session),before);
});
