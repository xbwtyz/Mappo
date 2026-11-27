import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup } from '../src/core/spatial-recovery-coordinator.js';
import { calculateSpatialRoadReview } from '../src/worker/spatial-recovery-worker.js';
import { SRE_RESTORATION_AUDIT_MAX_WITNESSES } from '../src/core/spatial-recovery-restoration-audit.js';
import { createSpatialRoadReviewGate } from '../src/editor/spatial-recovery-review-gate.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const small=()=>createProject({seed:'c2-planned',size:'small',morphology:'planned'});
function fixture({project=small(),roadIds=['RD-0113','RD-0114'],offset={x:.05,y:0},permissions={},host=null,verify=calculateSpatialRoadReview,captureRestorationAudit=false}={}){
  if(!host){host=new SecureIdentityHost();host.adopt(project);}
  const draft={draftRevision:1,roadIds,offset,permissions,captureRestorationAudit,workspace:defaultWorkspace(host.view().project)};
  const gate=createSpatialRoadReviewGate(host,()=>draft,{verify});
  const witness=()=>searchSpatialUnifiedRoadGroup(host.view().project,
    normalizeSpatialRoadGroup(host.view().project,host.view().context.revision,roadIds,offset,permissions),
    permissions.destruction?createSpatialDestructionBudget():createSpatialPreservationBudget(),{captureRestorationAudit});
  return {host,draft,gate,witness};
}

test('road Review/Apply replays exact witness, requires consent and publishes one reversible accepted transaction',{timeout:120000},async()=>{
  let calls=0;
  const f=fixture({verify:async input=>{calls++;return calculateSpatialRoadReview(input);}});
  const before=f.host.view(),workspace=clone(f.draft.workspace),witness=await f.witness();
  assert.equal(witness.status,'verified-witness');
  // Search-reported ledger is not what the review presents.
  const altered={...clone(witness),ledger:{retired:[{collection:'buildings',id:'fabricated'}]}};
  const reviewed=await f.gate.review(altered);
  assert.equal(calls,1);
  assert.equal(f.host.view(),before);
  assert.deepEqual(reviewed.summary.retired,[]);
  assert.deepEqual(reviewed.summary.added,[]);
  const result=await f.gate.apply(reviewed.token,reviewed);
  assert.equal(calls,2);
  assert.equal(result.historyStatus,'recorded');
  assert.equal(f.host.view().context.revision,before.context.revision+1);
  assert.equal(f.host.view().history.length,1);
  assert.deepEqual(result.project.identityAllocation,before.project.identityAllocation);
  assert.deepEqual(f.draft.workspace,workspace);
  assert.notDeepEqual(result.project.city,before.project.city);
  await assert.rejects(()=>f.gate.apply(reviewed.token,reviewed),/consumed/);
  const undo=f.host.replay({direction:'undo',context:f.host.view().context,workspace:result.workspace});
  assert.deepEqual(undo.project.city,before.project.city);
  const redo=f.host.replay({direction:'redo',context:f.host.view().context,workspace:undo.workspace});
  assert.deepEqual(redo.project.city,result.project.city);
});

test('road Review/Apply refuses stale draft, altered consent, canceled review and changed project adoption',{timeout:120000},async()=>{
  const f=fixture(),before=f.host.view(),witness=await f.witness();
  const a=await f.gate.review(witness);
  await assert.rejects(()=>f.gate.apply(a.token,{...a,summary:{...a.summary,demolishedFootprint:42}}),/consent/);
  const b=await f.gate.review(witness);f.draft.draftRevision++;
  await assert.rejects(()=>f.gate.apply(b.token,b),/Stale/);
  const c=await f.gate.review(witness);f.gate.cancel();
  await assert.rejects(()=>f.gate.apply(c.token,c),/Stale/);
  const d=await f.gate.review(witness);f.draft.permissions={alternativeFrontage:true};
  await assert.rejects(()=>f.gate.apply(d.token,d),/Stale/);
  assert.equal(f.host.view(),before);
  f.draft.permissions={};
  const e=await f.gate.review(witness);
  f.host.adopt(before.project);
  const adopted=f.host.view();
  await assert.rejects(()=>f.gate.apply(e.token,e),/Stale/);
  assert.equal(f.host.view(),adopted);
  assert.equal(adopted.history.length,0);
});

test('road Review/Apply refuses changed fresh proof and unavailable reversible history without publication',{timeout:120000},async()=>{
  let calls=0;
  const f=fixture({verify:async input=>{
    const proof=await calculateSpatialRoadReview(input);
    if(++calls===2){const candidate=JSON.parse(proof.candidateJson);candidate.city.name+=' forged';
      return {...proof,candidateJson:JSON.stringify(candidate)};}
    return proof;
  }});
  const before=f.host.view(),a=await f.gate.review(await f.witness());
  await assert.rejects(()=>f.gate.apply(a.token,a),/fingerprint/);
  assert.equal(f.host.view(),before);
  const project=small(),history=new AcceptedEditHistoryD01({maxBytes:1024});history.clear(project);
  const host=new AcceptedIdentitySession({project,context:{projectId:'review-small-history',revision:0,namespace:'12'.repeat(16)},history});
  const limited=fixture({project,host}),old=host.view(),b=await limited.gate.review(await limited.witness());
  await assert.rejects(()=>limited.gate.apply(b.token,b),/history preflight/);
  assert.equal(host.view(),old);
});

test('road Review/Apply presents actual destructive concessions and supports atomic history',{timeout:300000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const f=fixture({project,roadIds:['RD-0184','RD-0186'],offset:{x:1.5026370360609105,y:18.69948056782279},
    permissions:{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2},captureRestorationAudit:true});
  const before=f.host.view(),witness=await f.witness();
  assert.equal(witness.kind,'retirement');
  const reviewed=await f.gate.review(witness);
  assert.deepEqual(reviewed.summary.retired,witness.delta.retired);
  assert.ok(reviewed.summary.demolishedFootprint>0);
  assert.equal(reviewed.restorationAudit.finalBasisFingerprint,witness.basisDelta.candidateFingerprint);
  assert.equal(f.host.view(),before);
  const result=await f.gate.apply(reviewed.token,reviewed);
  assert.deepEqual(result.restorationAudit,reviewed.restorationAudit);
  assert.equal(result.historyStatus,'recorded');
  const undo=f.host.replay({direction:'undo',context:f.host.view().context,workspace:result.workspace});
  assert.deepEqual(undo.project.city,before.project.city);
});

test('opt-in restoration audit is exact consent and fresh replay evidence, not search ledger',{timeout:300000},async()=>{
  let mutateProof=false;
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const f=fixture({project,roadIds:['RD-0184','RD-0186'],offset:{x:1.5026370360609105,y:18.69948056782279},
    permissions:{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2},
    captureRestorationAudit:true,verify:async input=>{
      const proof=await calculateSpatialRoadReview(input);
      if(mutateProof)return {...proof,restorationAudit:{...proof.restorationAudit,grossRetiredFootprint:proof.restorationAudit.grossRetiredFootprint+1}};
      return proof;
    }});
  const before=f.host.view(),witness=await f.witness();
  assert.equal(witness.kind,'retirement');assert.ok(witness.restorationTrail.length);
  const altered={...clone(witness),ledger:{restored:['fabricated']}};
  const a=await f.gate.review(altered);
  assert.equal(a.restorationAudit.finalBasisFingerprint,witness.basisDelta.candidateFingerprint);
  assert.equal(a.restorationAudit.finalRetired.length,a.summary.retired.length);
  assert.ok(Object.isFrozen(a.restorationAudit));
  await assert.rejects(()=>f.gate.apply(a.token,{...a,restorationAudit:null}),/consent/);
  const b=await f.gate.review(witness);
  mutateProof=true;
  await assert.rejects(()=>f.gate.apply(b.token,b),/Fresh road verification/);
  mutateProof=false;
  const c=await f.gate.review(witness);
  f.draft.captureRestorationAudit=false;
  await assert.rejects(()=>f.gate.apply(c.token,c),/Stale/);
  f.draft.captureRestorationAudit=true;
  await assert.rejects(()=>f.gate.review({...witness,restorationTrail:[]}),/basis/);
  assert.equal(f.host.view(),before);
  // Diagnostic cap may not invalidate independently verified geometry.
  const oversized={...witness,restorationTrail:Array(SRE_RESTORATION_AUDIT_MAX_WITNESSES+1).fill(witness.basisDelta)};
  const limited=await f.gate.review(oversized);
  assert.deepEqual(limited.restorationAudit,{version:1,status:'unavailable',reason:'witness-limit',
    finalBasisFingerprint:witness.basisDelta.candidateFingerprint});
  assert.deepEqual(limited.summary,a.summary);
  await assert.rejects(()=>f.gate.apply(limited.token,{...limited,restorationAudit:null}),/consent/);
  const d=await f.gate.review(oversized);
  const applied=await f.gate.apply(d.token,d);
  assert.deepEqual(applied.restorationAudit,d.restorationAudit);
  assert.equal(applied.historyStatus,'recorded');
  const undo=f.host.replay({direction:'undo',context:f.host.view().context,workspace:applied.workspace});
  assert.deepEqual(undo.project.city,before.project.city);
});
