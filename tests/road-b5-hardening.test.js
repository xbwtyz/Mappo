import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareParcelReconciliationB2 } from '../src/core/parcel-reconciliation.js';
import { roadReconciliationPreviewB3 } from '../src/core/road-inspection.js';
import { prepareRoadApplyB4, verifyRoadDeltaB4 } from '../src/editor/road-application.js';
import { RoadGeometryHistoryB4 } from '../src/editor/road-history.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const copy = value => JSON.parse(JSON.stringify(value));
const compatible = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function eligible(project, max=55) {
  const graph=buildRoadGraph(project.city);
  for(const id of [...graph.nodesById.keys()].slice(0,max)){
    const incident=graph.incidentRoads.get(id)??[];
    if(!incident.length||incident.some(r=>graph.roadClasses.get(r)?.protected))continue;
    const node=graph.nodesById.get(id), point={x:node.x+.001,y:node.y+.001};
    const reconciliation=prepareParcelReconciliationB2(project,id,point);
    if(reconciliation.candidateProject && reconciliation.validation?.project==='valid' &&
       reconciliation.validation?.parcels==='pass' && !reconciliation.unresolved?.length)
      return {id,point,reconciliation};
  }
  return null;
}
function session(project,proposal){
  const s={
    active:true,project,city:project.city,checking:false,drag:null,error:'',
    reconciliationError:'',selection:{kind:'junction',id:proposal.id},
    point:proposal.point,pending:true,revision:1,settledRevision:1,
    acceptedFingerprint:JSON.stringify(project),reconciliation:proposal.reconciliation,
    current(){return this.active && this.project===project && this.city===project.city;}
  };
  s.previewGeometry=roadReconciliationPreviewB3(project,proposal.reconciliation);
  return s;
}
test('B5 accepts a portable ordinary road edit and restores exact accepted geometry through Undo/Redo',()=>{
  const project=createProject({seed:'b4-vacant',size:'small',morphology:'organic'});
  project.city.properties=[];project.city.plots=[];project.city.buildings=[];
  project.city.openSpaces=project.city.blocks.map(b=>({id:'OPEN-'+b.id,blockId:b.id,kind:'undeveloped',area:b.area}));
  const move=eligible(project);
  assert.ok(move,'Known vacant-city fixture requires one proven ordinary junction movement');
  const before=copy(project),workspace=defaultWorkspace(project);
  const prepared=prepareRoadApplyB4(project,workspace,session(project,move),4,4);
  assert.equal(prepared.ok,true,prepared.issues?.[0]?.message);
  assert.equal(prepared.validation.identity,'pass');
  assert.deepEqual(project,before,'Preview and preparation leave accepted project untouched');
  verifyRoadDeltaB4(before,prepared.candidate,move.id);
  const encoded=encodeProjectDocument(createProjectDocument(prepared.candidate,workspace));
  const loaded=decodeProjectDocument(encoded);
  assert.deepEqual(loaded.project,prepared.candidate,'Save/reopen retains accepted road location');
  assert.deepEqual(loaded.workspace,workspace);
  const history=new RoadGeometryHistoryB4(6);
  assert.equal(history.record(before,loaded.project,move.id),true);
  const undo=history.prepare(loaded.project,workspace,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.deepEqual(undo.candidate,before);
  history.accept(undo.entry,'undo');
  const redo=history.prepare(undo.candidate,workspace,'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate,loaded.project);
});
test('B5 developed cities cannot change buildings, property ownership or accepted project during B2 inspection',()=>{
  for(const [seed,morphology] of [['b5-urban-organic','organic'],['b5-urban-planned','planned'],['b5-urban-radial','radial'],['b5-urban-linear','linear']]){
    const project=createProject({seed,size:'small',morphology});
    const original=JSON.stringify(project);
    const buildings=JSON.stringify(project.city.buildings);
    const graph=buildRoadGraph(project.city);
    let inspected=0;
    for(const id of graph.nodesById.keys()){
      if(inspected>=8)break;
      const incident=graph.incidentRoads.get(id)??[];
      if(!incident.length||incident.some(r=>graph.roadClasses.get(r)?.protected))continue;
      const node=graph.nodesById.get(id);
      const result=prepareParcelReconciliationB2(project,id,{x:node.x+.001,y:node.y+.001});
      inspected++;
      if(result.candidateProject){
        assert.equal(result.validation?.project,'valid');
        assert.equal(JSON.stringify(result.candidateProject.city.buildings),buildings);
        assert.deepEqual(result.candidateProject.city.properties.map(p=>[p.id,p.blockId,p.name]),
          project.city.properties.map(p=>[p.id,p.blockId,p.name]));
      }else assert.notEqual(result.status,'candidate-only');
      assert.equal(JSON.stringify(project),original,seed+' preview must not mutate accepted city');
    }
    assert.ok(inspected>0,seed+' should exercise at least one ordinary junction');
  }
});
test('B5 stale preview and intervening data changes never produce an accepted candidate',()=>{
  const project=createProject({seed:'b5-stale',size:'small'});
  const original=JSON.stringify(project), workspace=defaultWorkspace(project);
  const fake={project,city:project.city,current:()=>true,pending:true,selection:{kind:'junction',id:'missing'},point:{x:1,y:2},settledRevision:1,revision:2,acceptedFingerprint:JSON.stringify(project)};
  for(const [expected,current] of [[3,4],[4,4]]){
    const prepared=prepareRoadApplyB4(project,workspace,fake,expected,current);
    assert.equal(prepared.ok,false);
    assert.equal(prepared.candidate,null);
    assert.equal(JSON.stringify(project),original);
  }
  const changed=copy(project);
  changed.city.nodes[0].x+=0.125;
  assert.throws(()=>verifyRoadDeltaB4(project,changed,project.city.nodes[1].id),/unrelated/);
});
