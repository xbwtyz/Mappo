import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareParcelReconciliationB2 } from '../src/core/parcel-reconciliation.js';
import { roadReconciliationPreviewB3 } from '../src/core/road-inspection.js';
import { prepareRoadApplyB4,verifyRoadDeltaB4 } from '../src/editor/road-application.js';
import { RoadGeometryHistoryB4 } from '../src/editor/road-history.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function undeveloped(seed='b4-vacant'){
  const project=createProject({seed,size:'small',morphology:'organic'});
  const city=project.city;
  city.properties=[];city.plots=[];city.buildings=[];
  city.openSpaces=city.blocks.map(b=>({id:'OPEN-'+b.id,blockId:b.id,kind:'undeveloped',area:b.area}));
  return project;
}
function eligible(project){
  const graph=buildRoadGraph(project.city);
  const ids=[...graph.nodesById.keys()].filter(id=>graph.incidentRoads.get(id)?.length &&
    graph.incidentRoads.get(id).every(r=>!graph.roadClasses.get(r).protected));
  for(const id of ids.slice(0,35)){
    const node=graph.nodesById.get(id);
    const point={x:node.x+.001,y:node.y+.001};
    const result=prepareParcelReconciliationB2(project,id,point);
    if(result.candidateProject&&result.validation.project==='valid'&&!result.unresolved.length)
      return {id,point,result};
  }
  return null;
}
function mockSession(project,proposal){
  const session={project,city:project.city,active:true,checking:false,drag:null,error:'',
    reconciliationError:'',selection:{kind:'junction',id:proposal.id},point:proposal.point,
    pending:true,revision:4,settledRevision:4,acceptedFingerprint:JSON.stringify(project),
    reconciliation:proposal.result,current(){return this.active&&this.project===project&&this.city===project.city}};
  session.previewGeometry=roadReconciliationPreviewB3(project,proposal.result);
  return session;
}
test('B4 refuses missing, unsettled, stale and unresolved previews without touching accepted project',()=>{
 const p=undeveloped(), before=JSON.stringify(p),workspace=defaultWorkspace(p);
 const fake={project:p,city:p.city,current:()=>true,selection:{kind:'junction',id:'x'},pending:true};
 const denied=prepareRoadApplyB4(p,workspace,fake,1,1);
 assert.equal(denied.ok,false);
 assert.equal(prepareRoadApplyB4(p,workspace,fake,1,2).ok,false);
 assert.equal(prepareRoadApplyB4(copy(p),workspace,fake,1,1).ok,false);
 assert.equal(JSON.stringify(p),before);
});
test('B4 field whitelist rejects unauthorized building, metadata, identity and junction changes',()=>{
 const p=createProject({seed:'b4-preserve',size:'small'}), after=copy(p);
 const node=p.city.nodes[0];after.city.nodes[0].x+=.01;
 assert.equal(verifyRoadDeltaB4(p,after,node.id),true);
 after.city.buildings[0].geometry.regions[0].ring[0].x+=.1;
 assert.throws(()=>verifyRoadDeltaB4(p,after,node.id),/unsupported/);
 const stale=copy(p);stale.city.nodes[1].x+=.1;
 assert.throws(()=>verifyRoadDeltaB4(p,stale,node.id),/unrelated/);
});
test('B4 applies one fully proven topology-and-parcel candidate using a fresh independent rebuild',()=>{
 const p=undeveloped(),proposal=eligible(p);
 assert.ok(proposal,'Expected an eligible unprotected vacant-city junction');
 const workspace=defaultWorkspace(p),s=mockSession(p,proposal);
 const before=JSON.stringify(p);
 const receipt=prepareRoadApplyB4(p,workspace,s,1,1);
 assert.equal(receipt.ok,true,receipt.issues?.[0]?.message);
 assert.equal(receipt.applyReady,true);
 assert.equal(receipt.validation.roundTrip,'pass');
 assert.notDeepEqual(receipt.candidate.city.nodes,p.city.nodes);
 assert.deepEqual(receipt.candidate.city.buildings,p.city.buildings);
 assert.equal(JSON.stringify(p),before);
 s.settledRevision=3;
 assert.equal(prepareRoadApplyB4(p,workspace,s,1,1).ok,false);
});
test('B4 Undo/Redo preserves complete coupled project and blocks unrelated changes',()=>{
 const before=undeveloped('b4-history');
 const after=copy(before);after.city.name+='—edited';
 const hist=new RoadGeometryHistoryB4(3),workspace=defaultWorkspace(before);
 assert.equal(hist.record(before,after,'N-test'),true);
 assert.equal(hist.can('undo',after),true);
 const undo=hist.prepare(after,workspace,'undo');
 assert.equal(undo.ok,true,undo.reason);
 assert.deepEqual(undo.candidate,before);
 hist.accept(undo.entry,'undo');
 assert.equal(hist.can('redo',before),true);
 const redo=hist.prepare(before,workspace,'redo');
 assert.equal(redo.ok,true,redo.reason);
 assert.deepEqual(redo.candidate,after);
 hist.accept(redo.entry,'redo');
 const changed=copy(after);changed.city.name+=' another edit';
 assert.equal(hist.can('undo',changed),false);
 assert.equal(hist.prepare(changed,workspace,'undo').ok,false);
 assert.equal(hist.record(after,copy(changed),'N-new'),true);
 assert.equal(hist.can('redo',changed),false);
});
test('B4 compiled inspection keeps Apply disabled for unresolved or invalid geometry',async()=>{
 const app=await buildingAppHarness(),state=app.state(),road=state.roadWorkspace;
 const initial=JSON.stringify(app.capture()),revision=state.files.revision;
 road.start();
 assert.equal(app.el('roadApplyB4').disabled,true);
 road.session.update({x:200000,y:200000},{defer:false});
 assert.equal(app.el('roadApplyB4').disabled,true);
 assert.equal(app.el('roadHistoryUndoB4').disabled,true);
 app.el('roadPreviewReset').handlers.click();
 assert.equal(app.el('roadApplyB4').disabled,true);
 road.exit();
 assert.equal(JSON.stringify(app.capture()),initial);
 assert.equal(state.files.revision,revision);
});

test('B4 full accepted Apply and Undo/Redo each change recovery revision once',async()=>{
 const app=await buildingAppHarness();
 const city=undeveloped('b4-atomic-integration');
 app.apply({project:city,workspace:defaultWorkspace(city)});
 const current=app.state().project;
 // Modular reconciliation runs in Node; serialize the mounted VM snapshot into that realm.
 const proposal=eligible(copy(current));
 assert.ok(proposal,'Expected a reconciled road move for integration testing');
 const road=app.state().roadWorkspace;
 road.start();
 const session=road.session;
 session.select({kind:'junction',id:proposal.id});
 assert.equal(session.update(proposal.point,{defer:false}),true);
 assert.equal(session.settledRevision,session.revision);
 assert.equal(session.reconciliation?.status,'candidate-only');
 const before=JSON.stringify(app.state().project);
 const revision=app.state().files.revision;
 const result=app.applyRoad(session,road.baseRevision);
 assert.equal(result.ok,true,result.message);
 assert.equal(app.state().files.revision,revision+1,'Apply must issue exactly one recovery revision');
 const transaction=app.state().acceptedHistoryD01.entry('undo');
 assert.equal(transaction.operation,'road-reflow');
 assert.equal(transaction.label,'Move road junction');
 assert.deepEqual([...transaction.targetIds],[proposal.id]);
 const applied=JSON.stringify(app.state().project);
 assert.notEqual(applied,before);
 assert.equal(app.moveRoadHistory('undo'),true);
 assert.equal(app.state().files.revision,revision+2,'Undo must issue exactly one recovery revision');
 assert.equal(JSON.stringify(app.state().project),before,'Undo restores complete coupled project');
 assert.equal(app.moveRoadHistory('redo'),true);
 assert.equal(app.state().files.revision,revision+3,'Redo must issue exactly one recovery revision');
 assert.equal(JSON.stringify(app.state().project),applied,'Redo restores complete coupled project');
 assert.equal(app.state().acceptedHistoryD01.past.length,1);
 assert.equal(app.state().acceptedHistoryD01.future.length,0);
});
