import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadTopologyReflowC3} from '../src/core/road-topology-reflow.js';
import {prepareJunctionReflowC7} from '../src/core/neighborhood-reflow.js';
import {validateRoadApplyC2} from '../src/editor/road-application.js';
import {calculateJunctionPreviewP1} from '../src/worker/junction-preview-worker.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {validateStoredProject} from '../src/data/project-validation.js';

const radial=()=>createProject({seed:'c2-radial',size:'small',morphology:'radial'});
const planned=()=>createProject({seed:'c2-planned',size:'small',morphology:'planned'});
function runR1(project,ownershipChoices=new Map()){
  return prepareRoadTopologyReflowC3(project,'RD-0098',null,{kind:'remove'},new Map(),{ownershipChoices});
}
function runR2(project,ownershipChoices=new Map()){
  const target=project.city.nodes.find(n=>n.id==='N-0140');
  return prepareJunctionReflowC7(project,'N-0139',{x:target.x,y:target.y},new Map(),
    {targetJunctionId:'N-0140',ownershipChoices});
}
function choose(held,field='districtId',last=false){
  return new Map(held.ownershipReview.filter(row=>row.choiceRequired.district||row.choiceRequired.usage)
    .map(row=>[row.candidateKey,{
      ...(row.choiceRequired.district?{districtId:row.eligibleDistrictIds[last?row.eligibleDistrictIds.length-1:0]}:{}),
      ...(row.choiceRequired.usage?{usage:row.eligibleUsages[last?row.eligibleUsages.length-1:0]}:{})
    }]));
}

for(const [name,fixture,run] of [['R1',radial,runR1],['R2',planned,runR2]])
  test('0.2.3 '+name+' explicit ownership accepts both eligible districts with no accepted mutation',()=>{
    const project=fixture(),before=structuredClone(project);
    const blocked=run(project);
    assert.equal(blocked.candidateProject,null);
    assert.equal(blocked.unresolved[0]?.code,'ownership-decision-required');
    assert.ok(blocked.ownershipReview?.length);
    for(const last of [false,true]){
      const choices=choose(blocked,'districtId',last);
      const result=run(project,choices);
      assert.ok(result.candidateProject,result.unresolved?.[0]?.message);
      validateStoredProject(result.candidateProject);
      assert.deepEqual(run(project,choices).candidateProject,result.candidateProject);
      const loaded=decodeProjectDocument(encodeProjectDocument(
        createProjectDocument(result.candidateProject,defaultWorkspace(result.candidateProject))));
      // Portable JSON normalizes signed zero (-0) to 0; compare the saved
      // representation, as independent Road Apply does.
      assert.equal(JSON.stringify(loaded.project),JSON.stringify(result.candidateProject));
      assert.deepEqual(project,before,'Preview must not mutate accepted project');
      for(const row of result.lineage.reverse){
        const receipt=result.ledger.find(entry=>entry.kind==='block'&&entry.oldId===row.oldId);
        const direct=row.candidateKeys.map(key=>
          result.ownershipReview.find(face=>face.candidateKey===key)?.proposedId).filter(Boolean);
        if(receipt && direct.length)assert.deepEqual(receipt.successorIds,direct,
          'Ledger must include only direct successor faces');
      }
    }
  });

test('0.2.3 R2 only the large successor needs a choice; fabricated eligibility fails',()=>{
  const project=planned(),blocked=runR2(project);
  const marked=blocked.ownershipReview.filter(row=>row.choiceRequired.district);
  assert.equal(marked.length,1);
  const exact=blocked.ownershipReview.filter(row=>row.relation==='many-to-many');
  assert.equal(exact.length,3);
  for(const row of exact.filter(r=>!r.choiceRequired.district)){
    assert.deepEqual(row.eligibleDistrictIds,['DIST-003']);
    assert.deepEqual(row.predecessors.map(p=>p.blockId),['BLK-0030']);
  }
  const invalid=choose(blocked);
  const exclusive=exact.find(row=>!row.choiceRequired.district);
  invalid.set(exclusive.candidateKey,{districtId:'DIST-001'});
  assert.equal(runR2(project,invalid).unresolved[0]?.code,'ownership-invalid');
  const impossible=choose(blocked);
  impossible.set(marked[0].candidateKey,{districtId:'NONEXISTENT'});
  assert.equal(runR2(project,impossible).unresolved[0]?.code,'ownership-invalid');
});

test('0.2.3 direct-overlap land use is an independent decision',()=>{
  const project=radial();
  project.city.blocks.find(b=>b.id==='BLK-0029').usage='residential';
  project.city.blocks.find(b=>b.id==='BLK-0030').usage='commercial';
  validateStoredProject(project);
  const blocked=runR1(project);
  const row=blocked.ownershipReview.find(r=>r.choiceRequired.usage);
  assert.ok(row);
  assert.deepEqual(row.eligibleUsages,['commercial','residential']);
  const districtOnly=choose(blocked);
  districtOnly.set(row.candidateKey,{districtId:row.eligibleDistrictIds[0]});
  assert.equal(runR1(project,districtOnly).unresolved[0]?.code,'ownership-decision-required');
  for(const usage of row.eligibleUsages){
    const withUsage=new Map(districtOnly);
    withUsage.set(row.candidateKey,{...withUsage.get(row.candidateKey),usage});
    const result=runR1(project,withUsage);
    assert.ok(result.candidateProject,result.unresolved?.[0]?.message);
    assert.equal(result.candidateProject.city.blocks.find(b=>b.id===row.proposedId).usage,usage);
  }
});

test('0.2.3 blocks custom source data rather than discarding it',()=>{
  const project=radial();
  project.city.blocks.find(b=>b.id==='BLK-0029').customZoningNote='Keep this!';
  const result=runR1(project);
  assert.equal(result.candidateProject,null);
  assert.ok(result.unresolved.length>0);
  assert.equal(project.city.blocks.find(b=>b.id==='BLK-0029').customZoningNote,'Keep this!');
});

test('0.2.3 worker and direct junction preview agree; fresh Apply uses same choices',()=>{
  const project=planned(),before=structuredClone(project);
  const target=project.city.nodes.find(n=>n.id==='N-0140');
  const point={x:target.x,y:target.y};
  const blocked=runR2(project),choices=choose(blocked);
  const direct=runR2(project,choices);
  assert.ok(direct.candidateProject);
  const worker=calculateJunctionPreviewP1({project,junctionId:'N-0139',point,
    targetJunctionId:'N-0140',ownershipChoices:[...choices]});
  assert.deepEqual(worker.reconciliation.candidateProject,direct.candidateProject);
  assert.deepEqual(worker.reconciliation.ownershipReview,direct.ownershipReview);
  const workspace=defaultWorkspace(project);
  const checked=validateRoadApplyC2(project,workspace,
    {selection:{kind:'junction',id:'N-0139'},point,buildingDecisions:new Map(),
      targetJunctionId:'N-0140',ownershipChoices:choices},
    {candidateProject:direct.candidateProject,ledger:direct.ledger});
  assert.equal(checked.ok,true,checked.issues?.[0]?.message);
  assert.deepEqual(checked.candidate,direct.candidateProject);
  const wrong=validateRoadApplyC2(project,workspace,
    {selection:{kind:'junction',id:'N-0139'},point,buildingDecisions:new Map(),
      targetJunctionId:'N-0140',ownershipChoices:new Map()},
    {candidateProject:direct.candidateProject,ledger:direct.ledger});
  assert.equal(wrong.ok,false);
  assert.deepEqual(project,before);
});
