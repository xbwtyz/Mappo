import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { normalizeRoadCrossingsC3 } from '../src/core/road-crossings.js';
import { roadInspectionDetails } from '../src/core/road-inspection.js';
import { JUNCTION_SNAP_CAPTURE_PX, JUNCTION_SNAP_RELEASE_PX,
  findEligibleJunctionTarget } from '../src/core/junction-targeting.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';
import { prepareJunctionReflowC7 } from '../src/core/neighborhood-reflow.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { buildingAppHarness } from './helpers/building-app.js';
import { defaultWorkspace } from '../src/data/project-format.js';

const projectFixture = () => createProject({seed:'c2-planned',size:'small',morphology:'planned'});
// Reverse of the original A03 fixture: the accepted 0.2.2 reflow can safely
// retain N-0139 as the explicitly chosen destination. The opposite direction
// crosses mixed district/land-use ownership and must remain safely blocked.
const sourceId = 'N-0140', targetId = 'N-0139';
const node = (project,id) => project.city.nodes.find(record => record.id === id);

test('J1 deterministic zoom-relative snap targets: 12px capture, 18px release and protected exclusion',()=>{
  const project = projectFixture(),graph = buildRoadGraph(project.city),target=node(project,targetId);
  assert.equal(graph.valid,true);
  assert.equal(JUNCTION_SNAP_CAPTURE_PX,12);
  assert.equal(JUNCTION_SNAP_RELEASE_PX,18);
  assert.equal(roadInspectionDetails(graph,{kind:'junction',id:targetId}).movable,true);
  const at = (deltaPx,zoom,previous=null) =>
    findEligibleJunctionTarget(graph,sourceId,{x:target.x+deltaPx/zoom,y:target.y},zoom,previous);
  assert.equal(at(8,1)?.id,targetId);
  assert.equal(at(8,3)?.id,targetId);
  assert.equal(at(13,3),null);
  assert.equal(at(17,3,targetId)?.id,targetId);
  assert.equal(at(19,3,targetId),null);
  assert.equal(findEligibleJunctionTarget(graph,sourceId,node(project,sourceId),3)?.id===sourceId,false);
  assert.equal(findEligibleJunctionTarget(graph,sourceId,{x:Infinity,y:0},1),null);
  const protectedRoad = structuredClone(project.city);
  const link = protectedRoad.roads.find(r=>r.a===targetId||r.b===targetId);
  link.bridgeId='protected-test';
  const guarded = buildRoadGraph(protectedRoad);
  assert.equal(findEligibleJunctionTarget(guarded,sourceId,target,3),null);
});

test('J2 ordinary junction drag snaps exactly; Alt bypasses while held; switch off disables',()=>{
  const project=projectFixture(),source=node(project,sourceId),target=node(project,targetId);
  const session=new RoadPreviewSession({getProject:()=>project,changed:()=>{},schedule:()=>null});
  assert.equal(session.start(),true);
  session.select({kind:'junction',id:sourceId});
  const zoom=3;
  assert.equal(session.begin(source,zoom,'mouse'),true);
  const approximate={x:target.x+2/zoom,y:target.y};
  session.move(approximate,{altKey:false});
  assert.deepEqual(session.point,{x:target.x,y:target.y});
  assert.equal(session.snapTargetId,targetId);
  session.end(false,{altKey:false});
  assert.equal(session.targetJunctionId,targetId);
  assert.equal(session.point.x,target.x);
  session.reset();
  session.select({kind:'junction',id:sourceId});
  assert.equal(session.begin(source,zoom,'mouse'),true);
  session.move(approximate,{altKey:true});
  assert.equal(session.targetJunctionId,null);
  assert.ok(Math.abs(session.point.x-target.x)>1e-7);
  session.end(false,{altKey:true});
  assert.equal(session.targetJunctionId,null);
  session.setSnapEnabled(false);
  session.reset();
  assert.equal(session.begin(source,zoom,'mouse'),true);
  session.move(approximate,{altKey:false});
  assert.equal(session.targetJunctionId,null);
  session.end(true,{altKey:false});
  assert.deepEqual(session.point,{x:source.x,y:source.y},'Cancel restores the original position');
  session.stop();
});

test('J1/J3 chosen target ID survives a verified merge; bad identity request blocks without mutation',()=>{
  const project=projectFixture(),before=structuredClone(project),target=node(project,targetId);
  const options={targetJunctionId:targetId};
  const result=prepareJunctionReflowC7(project,sourceId,{x:target.x,y:target.y},new Map(),options);
  assert.ok(result.candidateProject,result.unresolved?.[0]?.message);
  const candidate=result.candidateProject;
  assert.equal(candidate.city.nodes.length,project.city.nodes.length-1);
  assert.equal(candidate.city.nodes.some(n=>n.id===sourceId),false,'Source ID retired');
  assert.equal(candidate.city.nodes.some(n=>n.id===targetId),true,'Selected destination retains its ID');
  assert.equal(buildRoadGraph(candidate.city).valid,true);
  assert.equal(validateStoredProject(candidate),candidate);
  assert.deepEqual(project,before);
  assert.deepEqual(prepareJunctionReflowC7(project,sourceId,{x:target.x,y:target.y},
    new Map(),options).candidateProject,candidate,'Exact deterministic reflow');
  const mismatched=prepareJunctionReflowC7(project,sourceId,{x:target.x+1,y:target.y},
    new Map(),options);
  assert.equal(mismatched.candidateProject,null);
  assert.equal(mismatched.unresolved[0].code,'target-junction-invalid');
  const self=prepareJunctionReflowC7(project,sourceId,{x:target.x,y:target.y},
    new Map(),{targetJunctionId:sourceId});
  assert.equal(self.candidateProject,null);
  assert.equal(self.unresolved[0].code,'target-junction-invalid');
});

test('J3 explicit target preference overrides lexicographic node choice in a safe ordinary graph',()=>{
  const city={
    nodes:[['A',0,0],['B',10,0],['C',10,10],['D',0,10],['X',5,5],['Y',5,5]]
      .map(([id,x,y])=>({id,x,y})),
    roads:[['A','B'],['B','C'],['C','D'],['D','A'],
      ['A','X'],['X','C'],['B','Y'],['Y','D']]
      .map(([a,b],i)=>({id:'R-'+i,a,b,kind:'lane'})),
  };
  const before=structuredClone(city);
  const result=normalizeRoadCrossingsC3(city,{preferredNodeId:'Y'});
  assert.equal(result.graph.valid,true);
  assert.deepEqual(result.consolidatedNodeIds,['X']);
  assert.equal(result.city.nodes.some(n=>n.id==='Y'),true);
  assert.equal(result.city.nodes.some(n=>n.id==='X'),false);
  assert.deepEqual(city,before);
});

test('J3 target identity cannot bypass ownership safeguards when direction is unsafe',()=>{
  const project=projectFixture(),dest=node(project,'N-0140');
  const before=structuredClone(project);
  const result=prepareJunctionReflowC7(project,'N-0139',{x:dest.x,y:dest.y},
    new Map(),{targetJunctionId:'N-0140'});
  assert.equal(result.candidateProject,null);
  assert.equal(result.unresolved[0]?.code,'ownership-decision-required');
  assert.deepEqual(project,before);
});

test('J3/J4 UI chooses source then target by map clicks, uses verified Apply, Undo/Redo and cancel',async()=>{
  const app=await buildingAppHarness(),project=projectFixture();
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace;
  road.start();
  road.session.schedule=fn=>fn();
  assert.equal(app.el('roadSnapJunctions').checked,true);
  const before=JSON.stringify(app.state().project),revision=app.state().files.revision;
  app.el('roadStartMergeJunctions').handlers.click();
  assert.equal(road.session.mergeMode,true);
  assert.equal(road.session.mergeSourceId,null);
  const choose=(id)=>{
    const point=node(project,id);
    assert.equal(road.session.begin(point,3,'mouse'),true);
    road.session.end(false,{altKey:false});
  };
  choose(sourceId);
  assert.equal(road.session.mergeSourceId,sourceId);
  assert.equal(road.session.mergeTargetId,null);
  assert.equal(JSON.stringify(app.state().project),before,'Source choice cannot edit accepted city');
  choose(targetId);
  assert.equal(road.session.mergeSourceId,sourceId);
  assert.equal(road.session.mergeTargetId,targetId);
  assert.equal(road.session.targetJunctionId,targetId);
  assert.equal(road.session.reconciliation?.candidateProject?.city.nodes.some(n=>n.id===sourceId),
    false,road.session.reconciliation?.unresolved?.[0]?.message);
  assert.equal(road.session.reconciliation?.candidateProject?.city.nodes.some(n=>n.id===targetId),true);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(app.el('roadApplyB4').disabled,false,road.session.reconciliation?.unresolved?.[0]?.message);
  app.el('roadApplyB4').handlers.click();
  const after=JSON.stringify(app.state().project);
  assert.notEqual(after,before);
  assert.equal(app.state().files.revision,revision+1);
  assert.equal(app.state().project.city.nodes.some(n=>n.id===targetId),true);
  assert.equal(app.state().project.city.nodes.some(n=>n.id===sourceId),false);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),after);

  // Restart then test exiting a two-click pick without changing accepted data.
  road.start();
  app.el('roadStartMergeJunctions').handlers.click();
  choose(targetId);
  assert.equal(road.session.mergeMode,true);
  app.el('roadCancelMergeJunctions').handlers.click();
  assert.equal(road.session.mergeMode,false);
  assert.equal(JSON.stringify(app.state().project),after);
  road.exit();
});
