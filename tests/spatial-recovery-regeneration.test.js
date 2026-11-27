import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup, discoverSpatialRoadRetirementEligibility, searchSpatialRetirementSubsetRoadGroup, searchSpatialGroupedRetirementRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialShellRegeneration, verifySpatialShellRegeneration, searchSpatialGroupRegeneration, verifySpatialGroupRegeneration } from '../src/core/spatial-recovery-regeneration.js';
import { issueIdentityReservation } from '../src/core/identity-verification.js';
import { createSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { calculateSpatialRoadReview,calculateSpatialRoadReservationPlan } from '../src/worker/spatial-recovery-worker.js';
import { createSpatialRoadReviewGate } from '../src/editor/spatial-recovery-review-gate.js';
import { verifySpatialRoadWorkerReservation } from '../src/core/spatial-recovery-worker-reservation.js';
const budget=()=>createSpatialDestructionBudget();
const clone=x=>JSON.parse(JSON.stringify(x));
test('detached optional shell regeneration uses fresh Schema 11 reservations and preserves survivors',{timeout:300000},async()=>{
  const project=clone(createProject({seed:'lare-linear-2',morphology:'linear',size:'small',irregularProperties:true}));
  const ids=['RD-0174','RD-0252'],offset={x:4,y:3},revision=5;
  const retirement=normalizeSpatialRoadGroup(project,revision,ids,offset,{destruction:true});
  const op=normalizeSpatialRoadGroup(project,revision,ids,offset,{destruction:true,regeneration:true});
  const namespace='12'.repeat(16),other='34'.repeat(16);
  project.identityAllocation.namespaces[namespace]={building:7};
  project.identityAllocation.namespaces[other]={building:13,plot:3};
  const context={projectId:op.projectId,revision,namespace};
  const before=JSON.stringify(project),shared=budget();
  const eligible=discoverSpatialRoadRetirementEligibility(project,retirement,shared);
  const known=eligible.buildingRefs.find(r=>r.id==='BLD-00153');assert.ok(known);
  const parentIds=new Map(project.city.properties.map(p=>[p.id,p.buildingIds.length]));
  const buildings=new Map(project.city.buildings.map(b=>[b.id,b]));
  let seed=null,result=null;
  for(const extra of eligible.buildingRefs.filter(r=>r.id!==known.id&&parentIds.get(buildings.get(r.id).propertyId)===1).slice(0,3)){
    const trial=await searchSpatialRetirementSubsetRoadGroup(project,retirement,[known,extra],shared);
    if(trial.status!=='verified-witness')continue;
    const regen=await searchSpatialShellRegeneration(project,op,trial.delta,context,shared);
    if(regen.status==='verified-witness'){seed=trial;result=regen;break;}
    console.log('SRE_SHELL_REFUSAL '+JSON.stringify(regen.attempts));
  }
  assert.ok(result,'must demonstrate real additive shell regeneration');
  const requests=result.provisionalAuthorization.requests;
  const receipt=issueIdentityReservation(project.identityAllocation,project.city,context,requests);
  const auth={context,requests,receipt};
  assert.deepEqual(receipt,result.provisionalAuthorization.receipt);
  // Explicit expected plan in this fixture; production must obtain its
  // independent request policy from the trusted host, not the receipt.
  const expected=requests.map(row=>({...row}));
  assert.deepEqual(verifySpatialRoadWorkerReservation(project,op,context,expected,result.provisionalAuthorization),auth);
  assert.throws(()=>verifySpatialRoadWorkerReservation(project,op,context,[],result.provisionalAuthorization),/host requests/);
  const wrongHost=clone(expected);wrongHost[0].key+='-wrong';
  assert.throws(()=>verifySpatialRoadWorkerReservation(project,op,context,wrongHost,result.provisionalAuthorization),/host requests/);
  const wrongReceipt=clone(result.provisionalAuthorization);wrongReceipt.receipt.allocations[0].sequence++;
  assert.throws(()=>verifySpatialRoadWorkerReservation(project,op,context,expected,wrongReceipt),/allocation/);
  assert.throws(()=>verifySpatialRoadWorkerReservation(project,op,{...context,namespace:other},expected,result.provisionalAuthorization),/host requests/);
  const actual=await verifySpatialShellRegeneration(project,op,seed.delta,result.delta,auth,budget());
  assert.deepEqual(result.delta.retired,seed.delta.retired);
  assert.ok(result.delta.added.length>0&&result.delta.added.every(r=>r.ref.collection==='buildings'));
  assert.equal(actual.identityAllocation.namespaces[namespace].building,7+result.delta.added.length);
  assert.deepEqual(actual.identityAllocation.namespaces[other],project.identityAllocation.namespaces[other]);
  for(const row of result.delta.added)assert.ok(!project.city.buildings.some(b=>b.id===row.ref.id));
  await assert.rejects(()=>verifySpatialShellRegeneration(project,retirement,seed.delta,result.delta,auth,budget()),/permission/i);
  await assert.rejects(()=>verifySpatialShellRegeneration(project,op,seed.delta,result.delta,null,budget()),/authorization/i);
  const stale=clone(auth);stale.context.revision++;
  await assert.rejects(()=>verifySpatialShellRegeneration(project,op,seed.delta,result.delta,stale,budget()));
  const tampered=clone(actual);tampered.city.buildings.find(b=>project.city.buildings.some(p=>p.id===b.id)).roofTone=99;
  const rebound=await createSpatialDelta(project,tampered,op,1,budget(),auth);
  await assert.rejects(()=>verifySpatialShellRegeneration(project,op,seed.delta,rebound,auth,budget()),/survivor/);
  const tiny=await searchSpatialShellRegeneration(project,op,seed.delta,context,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);
  // Independent fixture-side planning pass, never a worker receipt as policy.
  const planned=await searchSpatialShellRegeneration(project,op,seed.delta,context,budget());
  assert.equal(planned.status,'verified-witness');
  const host=new AcceptedIdentitySession({project,context:{projectId:'host-session-not-city',revision,namespace}});
  const hostBefore=host.view(),draft={draftRevision:1,roadIds:ids,offset,permissions:op.permissions,
    workspace:defaultWorkspace(hostBefore.project),reservationRequests:planned.provisionalAuthorization.requests};
  const gate=createSpatialRoadReviewGate(host,()=>draft,{verify:calculateSpatialRoadReview});
  const witness={status:'verified-witness',operation:op,kind:'shell-regeneration',delta:result.delta,
    basisDelta:seed.delta,provisionalAuthorization:result.provisionalAuthorization};
  const reviewed=await gate.review(witness);
  assert.equal(host.view(),hostBefore);
  assert.deepEqual(reviewed.summary.added,result.delta.added.map(row=>row.ref));
  const published=await gate.apply(reviewed.token,reviewed);
  assert.equal(published.historyStatus,'recorded');
  assert.deepEqual(published.project,actual);
  const undo=host.replay({direction:'undo',context:host.view().context,workspace:published.workspace});
  assert.deepEqual(undo.project.city,project.city);
  assert.deepEqual(undo.project.identityAllocation,actual.identityAllocation);
  const redo=host.replay({direction:'redo',context:host.view().context,workspace:undo.workspace});
  assert.deepEqual(redo.project,actual);
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_SHELL_REGENERATION '+JSON.stringify({retired:result.delta.retired,added:result.delta.added.map(r=>r.ref),attempts:result.attempts,stats:shared.snapshot()}));
});


test('detached complete property regeneration reserves every new identity and leaves original survivors unchanged',{timeout:300000},async()=>{
  const project=clone(createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false}));
  const ids=['RD-0184','RD-0186'],offset={x:-3.005274072121821*-.5,y:-37.39896113564458*-.5};
  const permissions={destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
  const retirement=normalizeSpatialRoadGroup(project,1,ids,offset,permissions);
  const op=normalizeSpatialRoadGroup(project,1,ids,offset,{...permissions,regeneration:true});
  const namespace='12'.repeat(16),other='34'.repeat(16);
  project.identityAllocation.namespaces[namespace]={property:7,plot:11,building:13};
  project.identityAllocation.namespaces[other]={property:93};
  const context={projectId:op.projectId,revision:1,namespace},before=JSON.stringify(project),shared=budget();
  const seed=await searchSpatialGroupedRetirementRoadGroup(project,retirement,shared);
  assert.equal(seed.status,'verified-witness');
  const result=await searchSpatialGroupRegeneration(project,op,seed.delta,context,shared);
  console.log('SRE_GROUP_REGENERATION_ATTEMPTS '+JSON.stringify({attempts:result.attempts,stats:result.stats,exhausted:result.exhausted}));
  assert.equal(result.status,'verified-witness');
  const requests=result.provisionalAuthorization.requests,receipt=issueIdentityReservation(project.identityAllocation,project.city,context,requests);
  const auth={context,requests,receipt};
  const actual=await verifySpatialGroupRegeneration(project,op,seed.delta,result.delta,auth,budget());
  assert.deepEqual(result.delta.retired,seed.delta.retired);
  const counts={properties:0,plots:0,buildings:0};
  for(const {ref} of result.delta.added){
    counts[ref.collection]++;
    assert.ok(!project.city[ref.collection].some(r=>r.id===ref.id));
  }
  assert.equal(counts.properties,1);assert.ok(counts.plots>0&&counts.buildings>0);
  for(const [type,collection] of [['property','properties'],['plot','plots'],['building','buildings']])
    assert.equal(actual.identityAllocation.namespaces[namespace][type],project.identityAllocation.namespaces[namespace][type]+counts[collection]);
  assert.deepEqual(actual.identityAllocation.namespaces[other],project.identityAllocation.namespaces[other]);
  const wrong=clone(auth);wrong.receipt.allocations.pop();
  await assert.rejects(()=>verifySpatialGroupRegeneration(project,op,seed.delta,result.delta,wrong,budget()));
  await assert.rejects(()=>verifySpatialGroupRegeneration(project,retirement,seed.delta,result.delta,auth,budget()),/permission/i);
  const tampered=clone(actual);tampered.city.buildings.find(b=>project.city.buildings.some(p=>p.id===b.id)).roofTone=99;
  const rebound=await createSpatialDelta(project,tampered,op,1,budget(),auth);
  await assert.rejects(()=>verifySpatialGroupRegeneration(project,op,seed.delta,rebound,auth,budget()),/survivor/);
  const tiny=await searchSpatialGroupRegeneration(project,op,seed.delta,context,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);
  assert.equal(JSON.stringify(project),before);
  // Fresh plan receives the accepted snapshot, verified retirement basis and
  // permission/session context only, never the search's receipt or request keys.
  const plan=await calculateSpatialRoadReservationPlan({kind:'plan-reservation',version:1,requestId:1,
    sessionId:'independent-group-plan',projectJson:JSON.stringify(project),operation:op,quality:'standard',
    reservationContext:context,basisDelta:seed.delta,regenerationKind:'group-regeneration'});
  assert.equal(plan.kind,'planned-reservation');
  assert.equal(plan.candidateFingerprint,result.delta.candidateFingerprint);
  assert.deepEqual(plan.requests,requests);
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_GROUP_REGENERATION '+JSON.stringify({counts,added:result.delta.added.map(r=>r.ref),stats:shared.snapshot()}));
});
