import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { captureLandEditorIntent,previewLandEditorTransaction,commitLandEditorTransaction } from '../src/editor/land-transaction-bridge.js';
import { previewNonallocatingEditorTransaction,commitNonallocatingEditorTransaction } from '../src/editor/nonallocating-transaction-bridge.js';
import { previewBuildingEditorTransaction,commitBuildingEditorTransaction } from '../src/editor/building-transaction-bridge.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { PropertySplitSessionE2 } from '../src/editor/property-split-e2.js';
import { PropertyMergeSessionE3 } from '../src/editor/property-merge-e3.js';
import { defaultWorkspace,copyJson } from '../src/data/project-format.js';
import { vacant } from './helpers/vacant-frontage.js';
import { findSplitAndMerge } from './helpers/property-split-merge-fixture.js';
import { buildingComponentFixture } from './helpers/building-component-fixture.js';
import { defaultBuildingSpec3H } from '../src/editor/building-structures.js';
const site=vacant(),splitSite=findSplitAndMerge(),component=buildingComponentFixture();
function hostFor(project){let n=0;const h=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(++n);return a;}}});h.adopt(project);return h;}
const ns='01'.repeat(16),id=(kind,n)=>kind+'-IDA-'+ns+'-'+String(n).padStart(6,'0');
function land(h,w,kind,draft){
 const intent=captureLandEditorIntent(kind,draft),p=previewLandEditorTransaction(h,w,kind,intent);
 assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 return {p,out:commitLandEditorTransaction(h,w,kind,intent,p)};
}
function freshLand(){const h=hostFor(site.project),w=site.workspace;const {out}=land(h,w,'property-create',site.draft);
 return {h,w,propertyId:id('PROP',1),created:out};}
function draftFor(f){const s=new PropertyEditSession3I();assert.ok(s.start(f.h.view().project.city,f.propertyId));return s;}
function splitDraft(s,city){s.flexible.edgeA=0;s.flexible.edgeB=2;s.flexible.ratioA=.5;s.flexible.ratioB=.5;
 s.flexible.retain='first';assert.ok(s.splitFlexible(city),s.flexible.error);}
test('IDA mounted creation plus ordinary divider edit publishes persistent linked property and plot IDs',()=>{
 const f=freshLand(),s=draftFor(f),before=f.h.view();
 assert.ok(s.addDivider(before.project.city,0));
 const {p,out}=land(f.h,f.w,'property-and-plot',s);
 assert.deepEqual(p.receipt.allocations.map(a=>a.id),[id('PLOT',2)]);
 const row=out.project.city.properties.find(p=>p.id===f.propertyId);
 assert.deepEqual(row.plotIds,[id('PLOT',1),id('PLOT',2)]);
 assert.equal(row.plotCountHistoryE4.at(-1).newId,id('PLOT',2));
});
test('IDA mounted flexible split merge split with reused legacy draft ID allocates only final survivor',()=>{
 const f=freshLand(),s=draftFor(f),city=f.h.view().project.city;assert.ok(s.beginFlexible(city));
 splitDraft(s,city);const first=s.flexible.operations[0].createdId;
 s.flexible.selectedId=id('PLOT',1);s.flexible.otherId=first;s.flexible.retain='first';assert.ok(s.mergeFlexible());
 splitDraft(s,city);assert.equal(s.flexible.operations[2].createdId,first);
 const {p,out}=land(f.h,f.w,'property-and-plot',s);
 assert.deepEqual(p.receipt.allocations.map(a=>a.id),[id('PLOT',2)]);
 const row=out.project.city.properties.find(p=>p.id===f.propertyId),j=row.plotPartitionHistory027.at(-1);
 assert.match(j.steps[0].createdId,/^PLOT-DRAFT-/);assert.equal(j.steps[1].retiredId,j.steps[0].createdId);
 assert.equal(j.steps[2].createdId,id('PLOT',2));assert.deepEqual(row.plotIds,[id('PLOT',1),id('PLOT',2)]);
 assert.equal(s.flexible.operations[0].createdId,first);
});
test('IDA mounted split merge and delete preserve survivors and never rewind counters',()=>{
 const h=hostFor(splitSite.base),w=defaultWorkspace(splitSite.base),s=new PropertySplitSessionE2();
 assert.ok(s.start(h.view().project.city,splitSite.propertyId));
 const split=land(h,w,'property-split',s),newId=split.p.result.newPropertyId;
 assert.equal(newId,id('PROP',1));
 const m=new PropertyMergeSessionE3();assert.ok(m.start(h.view().project.city,splitSite.propertyId));
 assert.ok(m.choose(h.view().project.city,newId));m.approve(true);
 const merged=land(h,w,'property-merge',m);
 assert.deepEqual(merged.p.receipt.allocations,[]);
 assert.deepEqual(merged.out.project.identityAllocation,split.out.project.identityAllocation);
 const deleted=land(h,w,'property-delete',{propertyId:splitSite.propertyId});
 assert.deepEqual(deleted.out.project.identityAllocation,split.out.project.identityAllocation);
 assert.equal(deleted.out.project.city.properties.some(p=>p.id===splitSite.propertyId),false);
});
test('IDA mounted land stale baseline refuses without replacing accepted view',()=>{
 const f=freshLand(),s=draftFor(f);assert.ok(s.addDivider(f.h.view().project.city,0));
 const intent=captureLandEditorIntent('property-and-plot',s);
 intent.active.originalBoundary[0].x+=1;
 const before=f.h.view();assert.throws(()=>previewLandEditorTransaction(f.h,f.w,'property-and-plot',intent),/Stale/);
 assert.equal(f.h.view(),before);
});
test('IDA mounted land stale reservations and forged candidate cannot publish',()=>{
 const f=freshLand(),s=draftFor(f);assert.ok(s.addDivider(f.h.view().project.city,0));
 const intent=captureLandEditorIntent('property-and-plot',s),p=previewLandEditorTransaction(f.h,f.w,'property-and-plot',intent);
 p.result.candidate.city.name='Injected';
 const out=commitLandEditorTransaction(f.h,f.w,'property-and-plot',intent,p),before=f.h.view();
 assert.notEqual(out.project.city.name,'Injected');
 assert.throws(()=>commitLandEditorTransaction(f.h,f.w,'property-and-plot',intent,p),/Stale/);assert.equal(f.h.view(),before);
});
function non(h,w,intent,tx){
 const p=previewNonallocatingEditorTransaction(h,w,intent);assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.deepEqual(p.receipt.allocations,[]);
 return commitNonallocatingEditorTransaction(h,w,intent,tx,p);
}
const tx=(family,operation,targetIds=[])=>({family,operation,label:operation,targetIds});
test('IDA identity edit and saved district generation advance revision without top-level allocation',()=>{
 const f=freshLand(),ref={kind:'property',id:f.propertyId};
 const identity=non(f.h,f.w,{kind:'identity',ref,input:{customName:'Guildhall',customUse:'',useChoice:''}},tx('identity','identity-change',[ref.id]));
 assert.equal(identity.project.city.properties.find(p=>p.id===ref.id).customName,'Guildhall');
 const districts=non(f.h,f.w,{kind:'district-generate',options:{count:3,seed:'ida-batch1'}},tx('districts','generate'));
 assert.ok(districts.project.city.districts.length);
 assert.deepEqual(districts.project.identityAllocation,f.created.project.identityAllocation);
 assert.equal(districts.context.revision,3);
});
test('IDA nonallocating defense build and disable preserve allocated land and building counters',()=>{
 const f=freshLand(),a=non(f.h,f.w,{kind:'defense-apply',options:{enabled:true,gateCount:3,towerSpacing:40,seed:'ida-defense'}},tx('defenses','build'));
 assert.equal(a.project.city.fortificationState.status,'built');
 const b=non(f.h,f.w,{kind:'defense-apply',options:{enabled:false}},tx('defenses','disable'));
 assert.equal(b.project.city.fortificationState.enabled,false);
 assert.deepEqual(b.project.identityAllocation,f.created.project.identityAllocation);
 assert.deepEqual(b.project.city.buildings,a.project.city.buildings);
});
test('IDA nonallocating bridge refuses foreign history family and stale receipt',()=>{
 const f=freshLand(),ref={kind:'property',id:f.propertyId},intent={kind:'identity',ref,input:{customName:'One',customUse:'',useChoice:''}};
 const p=previewNonallocatingEditorTransaction(f.h,f.w,intent),before=f.h.view();
 assert.throws(()=>commitNonallocatingEditorTransaction(f.h,f.w,intent,tx('road','identity-change'),p),/family/);
 assert.equal(f.h.view(),before);
 non(f.h,f.w,intent,tx('identity','identity-change',[ref.id]));
 assert.throws(()=>commitNonallocatingEditorTransaction(f.h,f.w,intent,tx('identity','identity-change',[ref.id]),p),/Stale/);
});
test('IDA mounted component addition preserves top-level building identity and allocator',()=>{
 const h=hostFor(component.project),w=component.workspace,request={operation:'components',propertyId:component.property.id,
   buildingId:component.original.id,componentDraft:{...component.first,dx:0,dy:0,scaleX:100,scaleY:100}};
 const p=previewBuildingEditorTransaction(h,w,request);assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.deepEqual(p.receipt.allocations,[]);
 const out=commitBuildingEditorTransaction(h,w,request,p),b=out.project.city.buildings.find(b=>b.id===component.original.id);
 assert.equal(b.components.length,2);assert.deepEqual(out.project.identityAllocation,component.project.identityAllocation);
});
test('IDA mounted simple replacement preserves top-level building identity and counters',()=>{
 const h=hostFor(component.project),w=component.workspace,request={operation:'replace',propertyId:component.property.id,
   buildingId:component.original.id,spec:{...defaultBuildingSpec3H(component.property,component.original),width:3,depth:3,preset:'rectangle'}};
 const p=previewBuildingEditorTransaction(h,w,request);assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.deepEqual(p.receipt.allocations,[]);
 const out=commitBuildingEditorTransaction(h,w,request,p);
 assert.deepEqual(out.project.identityAllocation,component.project.identityAllocation);
 assert.equal(out.project.city.buildings.find(b=>b.id===component.original.id).area,9);
});
