import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { prepareBuildingEditorOperation,previewBuildingEditorTransaction,commitBuildingEditorTransaction } from '../src/editor/building-transaction-bridge.js';
import { prepareBuildingStructure3H } from '../src/editor/building-structures.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { courtyardFixture } from './helpers/courtyard-fixture.js';
import { copyJson } from '../src/data/project-format.js';
import { readFileSync } from 'node:fs';

const site=courtyardFixture();
function fixture(){
 let n=0;
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues(bytes){bytes.fill(++n);return bytes;}}});
 host.adopt(site.project);return host;
}
const preview=(host,request)=>previewBuildingEditorTransaction(host,site.workspace,request);
const apply=(host,request,p=preview(host,request))=>commitBuildingEditorTransaction(host,site.workspace,request,p);
const occupant=()=>copyJson(site.occupant);
const ids=p=>p.city.buildings.map(b=>b.id).sort();
const ns='01'.repeat(16);
test('IDA mounted editor add intent uses the same domain gate in legacy and secure modes',()=>{
 const host=fixture(),request=occupant(),before=host.view();
 const legacy=prepareBuildingEditorOperation(before.project,site.workspace,request);
 assert.deepEqual(legacy,prepareBuildingStructure3H(before.project,site.workspace,request));
 const p=preview(host,request);
 assert.ok(p.result.ok,JSON.stringify(p.result.issues));assert.equal(host.view(),before);
 const id=p.receipt.allocations[0].id;
 assert.notEqual(id,request.buildingId);
 const out=apply(host,request,p);
 assert.deepEqual(ids(out.project),[...ids(before.project),id].sort());
 assert.equal(out.project.identityAllocation.namespaces[ns].building,1);
 assert.deepEqual(host.copyHistory().entry('undo').targetIds,[id]);
});
test('IDA secure mounted portal-only intent allocates no top-level entity',()=>{
 const host=fixture(),request=occupant(),first=apply(host,request);
 const portal={...request,courtyard:{...request.courtyard,only:true,innerOffset:.2,outerOffset:.4}};
 const p=preview(host,portal);assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.deepEqual(p.receipt.allocations,[]);
 const out=apply(host,portal,p);
 assert.deepEqual(ids(out.project),ids(first.project));
 assert.deepEqual(out.project.identityAllocation,first.project.identityAllocation);
 assert.deepEqual(host.copyHistory().entry('undo').targetIds,[site.host.id]);
 assert.equal(out.context.revision,2);
});
test('IDA mounted building deletion preserves high-water marks and replays exact allocated identity',()=>{
 const host=fixture(),request=occupant(),p=preview(host,request),first=apply(host,request,p),id=p.receipt.allocations[0].id;
 const deletion={operation:'delete',propertyId:request.propertyId,buildingId:id};
 const q=preview(host,deletion);assert.ok(q.result.ok,JSON.stringify(q.result.issues));
 assert.deepEqual(q.receipt.allocations,[]);
 const out=apply(host,deletion,q);assert.ok(!ids(out.project).includes(id));
 assert.deepEqual(out.project.identityAllocation,first.project.identityAllocation);
 const undo=host.replay({direction:'undo',context:out.context,workspace:site.workspace});
 assert.deepEqual(undo.project,first.project);
});
test('IDA mounted clear uses existing property clear domain gate and preserves counters',()=>{
 const host=fixture(),request=occupant(),first=apply(host,request);
 const clear={operation:'clear',propertyId:request.propertyId};
 const p=preview(host,clear);assert.ok(p.result.ok,JSON.stringify(p.result.issues));
 assert.deepEqual(p.result,preparePropertyBuildingClear4E(first.project,site.workspace,request.propertyId));
 assert.deepEqual(p.receipt.allocations,[]);
 const out=apply(host,clear,p);
 assert.deepEqual(out.project.identityAllocation,first.project.identityAllocation);
 assert.equal(out.project.city.properties.find(x=>x.id===request.propertyId).buildingIds.length,0);
 assert.equal(host.copyHistory().entry('undo').label,'Clear property buildings');
});
test('IDA mounted building Apply ignores altered preview candidate and revalidates actual intent',()=>{
 const host=fixture(),request=occupant(),p=preview(host,request),before=host.view();
 p.result.candidate.city.name='Injected';
 const out=apply(host,request,p);
 assert.equal(out.project.city.name,before.project.city.name);
});
test('IDA mounted building invalid geometry and stale requests preserve accepted publication',()=>{
 const host=fixture(),request=occupant(),before=host.view();
 const invalid={...request,spec:{...request.spec,u:-99999}};
 const p=preview(host,invalid);assert.equal(p.result.ok,false);
 assert.throws(()=>apply(host,invalid,p));assert.equal(host.view(),before);
 const a=preview(host,request),b=preview(host,request);
 apply(host,request,a);const accepted=host.view();
 assert.throws(()=>apply(host,request,b),/Stale/);assert.equal(host.view(),accepted);
});
test('IDA mounted building bridge rejects unreserved additions and forged empty receipt',()=>{
 const host=fixture(),request=occupant(),before=host.view(),p=structuredClone(preview(host,request));
 p.receipt.allocations=[];assert.throws(()=>apply(host,request,p));assert.equal(host.view(),before);
 const clear={operation:'clear',propertyId:request.propertyId},q=structuredClone(preview(host,clear));
 q.receipt.allocations=[{type:'building',key:'manual-building',sequence:1,id:'BLD-IDA-'+ns+'-000001'}];
 assert.throws(()=>apply(host,clear,q));assert.equal(host.view(),before);
});
test('IDA live app uses common mounted building preparation for structure, component, clear and deletion',()=>{
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(source,/function prepareComponentPlacement[\s\S]*?return prepareBuildingEditorOperation\(/);
 assert.match(source,/function commitStructurePlacement3H[\s\S]*?const result = prepareBuildingEditorOperation\(/);
 assert.match(source,/function clearPropertyBuildings4E[\s\S]*?const result=prepareBuildingEditorOperation\(/);
 assert.match(source,/function deleteStructureBuilding3H[\s\S]*?const result=prepareBuildingEditorOperation\(/);
});
