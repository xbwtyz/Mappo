import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeRoadCrossingsC3,draftRoadConnectionC3} from '../src/core/road-crossings.js';
import {prepareJunctionIntentC7} from '../src/core/road-intent-c1.js';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';

function fixture(kind){
  const planned=kind==='R2';
  const project=createProject({seed:planned?'c2-planned':'c2-radial',size:'small',morphology:planned?'planned':'radial'});
  const before=structuredClone(project);
  let draft;
  if(planned){
    const to=project.city.nodes.find(n=>n.id==='N-0140');
    draft=prepareJunctionIntentC7(project,'N-0139',{x:to.x,y:to.y});
  }else draft=draftRoadConnectionC3(project.city,'RD-0098',{kind:'remove'});
  const normalized=normalizeRoadCrossingsC3(structuredClone(draft.proposedCity),
    planned?{preferredNodeId:'N-0140'}:{});
  const extraction=extractRoadFaces(normalized.graph,project.city);
  const matching=matchExistingFaces(project.city,extraction);
  return {project,before,extraction,matching};
}

test('0.2.3 R1: merge retains both positive-overlap owners without mutation',()=>{
  const {project,before,extraction,matching}=fixture('R1');
  const result=buildRoadFaceLineage023(project.city,extraction,matching);
  assert.equal(result.valid,true,JSON.stringify(result.issues));
  assert.equal(result.groups[0].relation,'merge');
  const row=result.faces.find(f=>f.relation==='merge');
  assert.deepEqual(row.predecessors.map(p=>p.blockId),['BLK-0029','BLK-0030']);
  assert.deepEqual(row.eligibleDistrictIds,['DIST-001','DIST-003']);
  assert.equal(row.choiceRequired.district,true);
  assert.ok(row.predecessors.every(p=>Math.abs(p.ratioOfSuccessor-0.5)<1e-6));
  assert.equal(result.reverse.length,project.city.blocks.length);
  assert.deepEqual(project,before);
  assert.deepEqual(buildRoadFaceLineage023(project.city,extraction,matching),result);
});

test('0.2.3 R2: exclusive successor faces cannot inherit unrelated districts',()=>{
  const {project,extraction,matching}=fixture('R2');
  const result=buildRoadFaceLineage023(project.city,extraction,matching);
  assert.equal(result.valid,true,JSON.stringify(result.issues));
  assert.equal(result.groups[0].relation,'many-to-many');
  const changed=result.faces.filter(f=>f.relation==='many-to-many');
  assert.equal(changed.length,3);
  const shared=changed.find(f=>f.predecessors.length===2);
  assert.ok(shared);
  assert.equal(shared.choiceRequired.district,true);
  assert.ok(Math.abs(shared.predecessors[0].ratioOfSuccessor-0.884782)<1e-5);
  for(const row of changed.filter(f=>f!==shared)){
    assert.deepEqual(row.predecessors.map(p=>p.blockId),['BLK-0030']);
    assert.deepEqual(row.eligibleDistrictIds,['DIST-003']);
    assert.equal(row.choiceRequired.district,false);
    assert.equal(row.predecessors[0].ratioOfSuccessor,1);
  }
});

test('0.2.3 usage is independent of district and unknown metadata remains visible',()=>{
  const {project,extraction,matching}=fixture('R1');
  const a=project.city.blocks.find(b=>b.id==='BLK-0029');
  const b=project.city.blocks.find(b=>b.id==='BLK-0030');
  a.usage='residential';b.usage='commercial';a.customZoningNote='owner-preserved';
  const result=buildRoadFaceLineage023(project.city,extraction,matching);
  assert.equal(result.valid,true,JSON.stringify(result.issues));
  const row=result.faces.find(f=>f.relation==='merge');
  assert.deepEqual(row.eligibleUsages,['commercial','residential']);
  assert.equal(row.choiceRequired.usage,true);
  assert.equal(row.predecessors.find(p=>p.blockId===a.id).hasOpaqueFields,true);
  assert.equal(a.customZoningNote,'owner-preserved');
});

test('0.2.3 incomplete or nonconserving lineage fails closed',()=>{
  const {project,extraction,matching}=fixture('R1');
  const altered={...matching,merged:matching.merged.map(g=>({...g,overlapArea:g.overlapArea+100}))};
  const r=buildRoadFaceLineage023(project.city,extraction,altered);
  assert.equal(r.valid,false);
  assert.equal(r.issues[0].code,'lineage-unproven');
  assert.deepEqual(r.faces,[]);
  assert.equal(buildRoadFaceLineage023(project.city,extraction,
    {...matching,added:[{candidateKey:'unmatched'}]}).valid,false);
});
