import test from 'node:test';
import assert from 'node:assert/strict';
import { vacant } from './helpers/vacant-frontage.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';
import { preparePropertyCreationE1 } from '../src/editor/property-creation-e1.js';
import { previewAllocatedPropertyCreation, commitAllocatedPropertyCreation } from '../src/editor/allocated-property-creation.js';

const ns='0123456789abcdef0123456789abcdef';
const context={projectId:'ida-property-creation',revision:0,namespace:ns};
const site=vacant();
function fixture(){
 const project=copyJson(site.project);
 return {session:new AcceptedIdentitySession({project,context}),workspace:copyJson(site.workspace),draft:copyJson(site.draft)};
}
const snapshot=f=>JSON.stringify({read:f.session.read(),history:f.session.copyHistory()});
const preview=f=>previewAllocatedPropertyCreation(f.session,f.workspace,f.draft);
const apply=(f,p)=>commitAllocatedPropertyCreation(f.session,f.workspace,f.draft,p);
const id=(type,n)=>formatAllocatedIdentity(type,ns,n);
test('IDA property creation reserves two independently typed IDs without consuming either',()=>{
 const f=fixture(),before=snapshot(f),p=preview(f);
 assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.equal(p.result.propertyId,id('property',1));
 assert.equal(p.result.plotId,id('plot',1));
 assert.deepEqual(p.result.candidate.identityAllocation.namespaces,{[ns]:{plot:1,property:1}});
 assert.deepEqual(preview(f).receipt,p.receipt);
 assert.equal(snapshot(f),before);
});
test('IDA property creation atomically accepts linked property, plot, counters and D01 history',()=>{
 const f=fixture(),before=f.session.read().project,p=preview(f),out=apply(f,p);
 const property=out.project.city.properties.find(row=>row.id===p.result.propertyId);
 const plot=out.project.city.plots.find(row=>row.id===p.result.plotId);
 assert.deepEqual(property.plotIds,[plot.id]);assert.equal(plot.propertyId,property.id);
 assert.deepEqual(property.buildingIds,[]);assert.equal(property.usage,'undeveloped');
 assert.equal(property.roadProvenance.source,'user-created-e1');
 assert.deepEqual(plot.boundary,property.boundary);
 for(const key of ['buildings','roads','blocks','nodes','districts'])assert.deepEqual(out.project.city[key],before.city[key]);
 assert.deepEqual(out.project.city.properties.filter(x=>x.id!==property.id),before.city.properties);
 assert.deepEqual(out.project.city.plots.filter(x=>x.id!==plot.id),before.city.plots);
 assert.equal(out.context.revision,1);assert.equal(out.history.entries.length,1);
 assert.deepEqual(out.project,p.result.candidate);
 assert.doesNotThrow(()=>validateStoredProject(out.project));
 assert.deepEqual(decodeProjectDocument(encodeProjectDocument(createProjectDocument(out.project,f.workspace))).project,out.project);
});
test('IDA property creation preserves both counters during Undo and restores exact IDs during Redo',()=>{
 const f=fixture(),initial=f.session.read(),accepted=apply(f,preview(f));
 const undone=f.session.replay({direction:'undo',context:accepted.context,workspace:f.workspace});
 assert.deepEqual(undone.project.city,initial.project.city);
 assert.deepEqual(undone.project.identityAllocation,accepted.project.identityAllocation);
 const redone=f.session.replay({direction:'redo',context:undone.context,workspace:f.workspace});
 assert.deepEqual(redone.project,accepted.project);
 assert.equal(redone.context.revision,3);
});
test('IDA property creation after Undo advances both counters and discards the old redo branch',()=>{
 const f=fixture(),accepted=apply(f,preview(f));
 f.session.replay({direction:'undo',context:accepted.context,workspace:f.workspace});
 const p=preview(f),second=apply(f,p);
 assert.equal(p.result.propertyId,id('property',2));assert.equal(p.result.plotId,id('plot',2));
 assert.deepEqual(second.project.identityAllocation.namespaces,{[ns]:{plot:2,property:2}});
 assert.equal(f.session.copyHistory().future.length,0);
});
test('IDA property creation refuses invalid geometry without consuming either ID',()=>{
 const f=fixture(),before=snapshot(f);f.draft.width=1;
 const p=preview(f);assert.equal(p.result.ok,false);
 assert.throws(()=>apply(f,p));assert.equal(snapshot(f),before);
 assert.equal(p.receipt.allocations.length,2);
});
test('IDA property creation refuses stale competing reservations atomically',()=>{
 const f=fixture(),a=preview(f),b=preview(f);apply(f,a);
 const before=snapshot(f);assert.throws(()=>apply(f,b),/Stale/);assert.equal(snapshot(f),before);
});
for(const [name,alter] of [
 ['missing plot',p=>p.receipt.allocations.shift()],
 ['wrong request key',p=>p.receipt.allocations[0].key='other'],
 ['wrong typed ID',p=>p.receipt.allocations[0].id=id('property',1)],
 ['inflated property counter',p=>p.receipt.nextState.namespaces[ns].property++],
 ['foreign namespace',p=>p.receipt.binding.namespace='f'.repeat(32)]
]){
 test('IDA property creation refuses '+name+' without partial acceptance',()=>{
  const f=fixture(),p=structuredClone(preview(f)),before=snapshot(f);
  alter(p);assert.throws(()=>apply(f,p));assert.equal(snapshot(f),before);
 });
}
test('IDA property creation independently recomputes instead of trusting a modified preview',()=>{
 const f=fixture(),p=preview(f);
 p.result.candidate.city.properties.find(x=>x.id===p.result.propertyId).customName='Injected';
 const out=apply(f,p);
 assert.equal(out.project.city.properties.find(x=>x.id===p.result.propertyId).customName,undefined);
});
test('IDA property creation rejects caller-selected identity override',()=>{
 const f=fixture(),before=snapshot(f);
 f.draft.propertyId='PROP-OVERRIDE';assert.throws(()=>preview(f),/intent/);
 assert.equal(snapshot(f),before);
});
test('IDA legacy E1 path remains available before coordinated host adoption',()=>{
 const f=fixture(),{project}=f.session.read();
 const legacy=preparePropertyCreationE1(project,f.workspace,f.draft);
 assert.ok(legacy.ok,JSON.stringify(legacy.issues));
 assert.match(legacy.propertyId,/^PROP-\d+$/);assert.match(legacy.plotId,/^PLOT-\d+$/);
 assert.deepEqual(legacy.candidate.identityAllocation,project.identityAllocation);
});
