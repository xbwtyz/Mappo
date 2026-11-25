import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { stageMountedIdentityEdit,acceptMountedIdentityEdit,cancelMountedIdentityEdit } from '../src/editor/mounted-identity-transaction.js';
import { copyJson } from '../src/data/project-format.js';
import { vacant } from './helpers/vacant-frontage.js';
import { DistrictPanel } from '../src/ui/districts.js';
import { FortificationPanel } from '../src/ui/fortifications.js';
import { DistrictEditor } from '../src/editor/districts.js';
import { FortificationEditor } from '../src/editor/fortifications.js';
import { applyNonallocatingCityIntent } from '../src/editor/nonallocating-transaction-bridge.js';

const site=vacant();
function fixture(){let n=0;const h=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(++n);return a;}}});h.adopt(site.project);return {h,w:copyJson(site.workspace),i:copyJson(site.draft)};}
const stage=f=>stageMountedIdentityEdit(f.h,f.w,'property-create',f.i,8);
const accept=(f,p)=>acceptMountedIdentityEdit(f.h,p.token,f.w,'property-create',f.i,8);
test('IDA mounted gate reconstructs trusted land intent and returns allocated selection IDs',()=>{
 const f=fixture(),before=f.h.view(),p=stage(f);
 assert.ok(p.result.ok);assert.equal(f.h.view(),before);
 const id=p.result.propertyId;p.result.candidate.city.name='Untrusted preview';
 p.result.propertyId='PROP-FORGED';
 const out=accept(f,p);
 assert.equal(out.result.propertyId,id);assert.equal(out.accepted.project.city.name,before.project.city.name);
 assert.ok(out.accepted.project.city.properties.some(row=>row.id===id));
 assert.equal(f.h.view().history.length,1);
 assert.throws(()=>accept(f,p),/Unknown/);
});
test('IDA mounted gate rejects changed file revision, intent and workspace without publishing',()=>{
 const f=fixture(),before=f.h.view();
 for(const [change,restore] of [
   [()=>f.i.width++,()=>f.i.width--],
   [()=>f.w.view.camera.x++,()=>f.w.view.camera.x--]
 ]){
   const p=stage(f);change();assert.throws(()=>accept(f,p),/stale/);restore();assert.equal(f.h.view(),before);
 }
 const p=stage(f);assert.throws(()=>acceptMountedIdentityEdit(f.h,p.token,f.w,'property-create',f.i,9),/stale/);
 assert.equal(f.h.view(),before);
});
test('IDA mounted gate cancellation, competing token and adoption preserve one accepted authority',()=>{
 const f=fixture(),a=stage(f),b=stage(f),c=stage(f);assert.equal(cancelMountedIdentityEdit(c.token),true);
 assert.throws(()=>accept(f,c),/Unknown/);accept(f,a);const view=f.h.view();
 assert.throws(()=>accept(f,b),/stale/);assert.equal(f.h.view(),view);
 const g=fixture(),p=stage(g);g.h.adopt(site.project);assert.throws(()=>accept(g,p),/stale/);
});
test('IDA mounted gate preserves ordinary identity no-op without consuming revision or history',()=>{
 const f=fixture(),view=f.h.view(),property=view.project.city.properties[0];
 const input={kind:'identity',ref:{kind:'property',id:property.id},input:{customName:property.customName??'',customUse:property.customUse??''}};
 const p=stageMountedIdentityEdit(f.h,f.w,'nonallocating',input,8);assert.ok(p.result.ok);
 const out=acceptMountedIdentityEdit(f.h,p.token,f.w,'nonallocating',input,8,{family:'identity',operation:'identity-change',label:'Rename property',targetIds:[property.id]});
 assert.equal(out.accepted.historyStatus,'unchanged');assert.equal(f.h.view(),view);
});
test('IDA mounted district refusal restores local history and selection, forwards actual intent',()=>{
 const f=fixture(),city=f.h.view().project.city,editor=new DistrictEditor();
 const before=editor.snapshot(),intent={kind:'district-generate',options:{count:'3',seed:'rollback'}};
 let received;
 const panel={editor,getCity:()=>city,commit:(next,detail)=>{received=detail;throw Error('Refused');},syncDraft(){},message(){},$:()=>({setAttribute(){}})};
 const ok=DistrictPanel.prototype.operation.call(panel,i=>applyNonallocatingCityIntent(city,i,editor),'Done','generate',()=>intent);
 assert.equal(ok,false);assert.deepEqual(editor.snapshot(),before);assert.deepEqual(received.intent,intent);
});
test('IDA mounted defense refusal restores local history and forwards actual intent',()=>{
 const f=fixture(),city=f.h.view().project.city,editor=new FortificationEditor(),before=editor.snapshot();
 const options={enabled:true,gateCount:'2',towerSpacing:'24',seed:'rollback'};let received;
 const panel={editor,getCity:()=>city,controls:()=>options,commit:(next,detail)=>{received=detail;throw Error('Refused');},message(){}};
 const ok=FortificationPanel.prototype.commitDraft.call(panel);
 assert.equal(ok,false);assert.deepEqual(editor.snapshot(),before);
 assert.deepEqual(received.intent,{kind:'defense-apply',options});
});
