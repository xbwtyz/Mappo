import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { extractRoadFaces } from '../src/core/road-faces.js';
import { draftRoadConnectionC3 } from '../src/core/road-crossings.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { terminalCorridors, polygonIntrudesTerminalCorridor } from '../src/core/road-terminal-corridors.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { createProjectDocument, defaultWorkspace, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

// A minimal face with one ordinary spur. The spur is part of the road graph,
// not the closed perimeter, and must not alter the area's face total.
function corridorFace() {
  return {
    nodes: [
      {id:'A',x:0,y:0},{id:'B',x:50,y:0},{id:'C',x:100,y:0},
      {id:'D',x:100,y:100},{id:'E',x:50,y:100},{id:'F',x:0,y:100},
      {id:'T',x:75,y:35},
    ],
    roads: [
      ['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A'],
    ].map(([a,b],i)=>({id:'PER-'+i,a,b,kind:'secondary',boundary:true}))
      .concat([{id:'DIVIDER',a:'B',b:'E',kind:'lane'},
        {id:'STUB',a:'C',b:'T',kind:'lane'}]),
    survey:{boundary:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]},
    plaza:{id:'PLAZA',name:'Main Square',center:{x:25,y:50}},
    waterFaces:[],terrainFaces:[],waterFeatures:[],terrainFeatures:[],
  };
}

test('0.2.1-P2 accepts only ordinary connected interior terminal corridors and keeps exact closed-face coverage',()=>{
  const city=corridorFace(), before=structuredClone(city);
  const graph=buildRoadGraph(city);
  assert.equal(graph.valid,true,JSON.stringify(graph.issues));
  assert.deepEqual(graph.terminalRoadIds,['STUB']);
  const result=extractRoadFaces(graph,city);
  assert.equal(result.valid,true,JSON.stringify(result.issues));
  assert.equal(result.faces.length,2);
  assert.equal(result.coverage.error,0);
  assert.deepEqual(city,before);

  const disconnected=structuredClone(city);
  disconnected.nodes.push({id:'X',x:120,y:25},{id:'Y',x:130,y:25});
  disconnected.roads.push({id:'ISLAND',a:'X',b:'Y',kind:'lane'});
  assert.equal(buildRoadGraph(disconnected).valid,false);
  assert.ok(buildRoadGraph(disconnected).issues.some(issue=>issue.code==='disconnected-graph'));

  const protectedStub=structuredClone(city);
  protectedStub.roads.find(r=>r.id==='STUB').bridgeId='bridge-test';
  const rejected=buildRoadGraph(protectedStub);
  assert.equal(rejected.valid,false);
  assert.ok(rejected.issues.some(issue=>issue.code==='protected-terminal-corridor'));

  const orphan=structuredClone(city);
  orphan.nodes.push({id:'ORPHAN',x:80,y:80});
  assert.ok(buildRoadGraph(orphan).issues.some(issue=>issue.code==='orphan-junction'));
});

test('0.2.1-P3 reserves full corridor setback and never grants new property frontage',()=>{
  const city=corridorFace();
  const corridors=terminalCorridors(city);
  assert.deepEqual(corridors.map(c=>c.id),['STUB']);
  assert.equal(polygonIntrudesTerminalCorridor(
    [{x:70,y:20},{x:85,y:20},{x:85,y:48},{x:70,y:48}],corridors),'STUB');
  assert.equal(polygonIntrudesTerminalCorridor(
    [{x:55,y:65},{x:65,y:65},{x:65,y:80},{x:55,y:80}],corridors),null);
});

// Find a deterministic generated fixture that exercises the original failure:
// an ordinary removal produces a degree-one node but leaves the single connected
// city graph intact. Do not invent a recorded road ID from the original report.
function candidateRoads(project) {
  const graph=buildRoadGraph(project.city);
  return project.city.roads.filter(road => {
    if (graph.roadClasses.get(road.id)?.protected) return false;
    const a=graph.incidentRoads.get(road.a),b=graph.incidentRoads.get(road.b);
    if (!a || !b || a.length<2 || b.length<2 || (a.length!==2 && b.length!==2)) return false;
    return [...a,...b].every(id=>!graph.roadClasses.get(id).protected);
  });
}

let selected=null;
function supportedRemoval() {
  if (selected) return selected;
  // Locked regression fixture from 0.2.0: this deletion was formerly
  // rejected at dangling junction N-0140. Avoid silently switching roads if
  // a future change accidentally loses support.
  const morphology='radial', roadId='RD-0153';
  const project=createProject({seed:'c2-radial',size:'small',morphology});
  const oldGraph=buildRoadGraph(project.city);
  assert.equal(oldGraph.valid,true);
  const road=project.city.roads.find(item=>item.id===roadId);
  assert.ok(road && !oldGraph.roadClasses.get(roadId).protected);
  const proposal=draftRoadConnectionC3(project.city,roadId,{kind:'remove'});
  const graph=buildRoadGraph(proposal.proposedCity);
  assert.equal(graph.valid,true,JSON.stringify(graph.issues));
  assert.deepEqual(graph.terminalRoadIds,['RD-0154','RD-0155']);
  const faces=extractRoadFaces(graph,project.city);
  assert.equal(faces.valid,true,JSON.stringify(faces.issues));
  const result=prepareRoadTopologyReflowC3(project,roadId,null,{kind:'remove'});
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  selected={project,roadId,result,morphology};
  return selected;
}

test('0.2.1-P1/P3 deterministic road deletion preserves corridor, valid generated development and portable schema-9 round trip',()=>{
  const {project,roadId,result}=supportedRemoval();
  const before=structuredClone(project);
  assert.ok(result.candidateProject,result.unresolved?.[0]?.message);
  const candidate=result.candidateProject;
  const originalRoad=project.city.roads.find(road=>road.id===roadId);
  assert.ok(originalRoad);
  assert.equal(candidate.city.roads.some(road=>road.id===roadId),false);
  const graph=buildRoadGraph(candidate.city),faces=extractRoadFaces(graph,candidate.city);
  assert.equal(graph.valid,true,JSON.stringify(graph.issues));
  assert.ok(graph.terminalRoadIds.length>0);
  assert.equal(faces.valid,true,JSON.stringify(faces.issues));
  assert.equal(validateStoredProject(candidate),candidate);
  const corridors=terminalCorridors(candidate.city);
  assert.ok(corridors.length);
  for(const property of candidate.city.properties) {
    assert.equal(polygonIntrudesTerminalCorridor(property.boundary,corridors),null,property.id);
    assert.equal(graph.terminalRoadIds.includes(property.frontageRoadId),false);
  }
  for(const building of candidate.city.buildings)
    assert.equal(graph.terminalRoadIds.includes(building.frontageRoadId),false);
  const document=createProjectDocument(candidate,defaultWorkspace(candidate));
  const reopened=decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(reopened.project,candidate);
  assert.deepEqual(project,before,'Reconciliation mutated accepted city');
  assert.deepEqual(prepareRoadTopologyReflowC3(project,roadId,null,{kind:'remove'}).candidateProject,candidate);
});

test('0.2.1-P4 editor Apply, Undo, Redo and Cancel use one validated transaction for a dead-end street',async()=>{
  const {project,roadId}=supportedRemoval();
  const app=await buildingAppHarness();
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace;
  road.start();
  road.session.schedule=fn=>fn();
  road.session.select({kind:'road',id:roadId});
  const before=JSON.stringify(app.state().project);
  const rev=app.state().files.revision;
  app.el('roadRemoveC3').handlers.click();
  assert.equal(app.el('roadApplyB4').disabled,false,road.session.reconciliation?.unresolved?.[0]?.message);
  assert.equal(JSON.stringify(app.state().project),before,'Preview unexpectedly mutated accepted project');
  app.el('roadApplyB4').handlers.click();
  const after=JSON.stringify(app.state().project);
  assert.notEqual(after,before);
  assert.equal(app.state().files.revision,rev+1);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),after);
  const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(app.capture().project,app.capture().workspace)));
  assert.equal(JSON.stringify(decoded.project),after);
});

test('0.2.1 preserves authored parcel edits and refuses unscoped terminal-road modification',()=>{
  const {project,roadId,result}=supportedRemoval();
  const custom=structuredClone(project);
  const authored=custom.city.properties.find(property=>property.id==='PROP-00063');
  assert.ok(authored);
  authored.customName='Hand-edited workshop';
  const refused=prepareRoadTopologyReflowC3(custom,roadId,null,{kind:'remove'});
  assert.equal(refused.candidateProject,null);
  assert.equal(refused.unresolved[0]?.code,'parcel-decision-required');
  assert.equal(custom.city.properties.find(property=>property.id===authored.id).customName,'Hand-edited workshop');
  const accepted=result.candidateProject;
  const retainedId=buildRoadGraph(accepted.city).terminalRoadIds[0];
  const unscoped=prepareRoadTopologyReflowC3(accepted,retainedId,null,{kind:'reconnect',endpoint:'a',target:'N-0184'});
  assert.equal(unscoped.candidateProject,null);
  assert.equal(unscoped.unresolved[0]?.code,'terminal-edit-out-of-scope');
});

for (const [morphology,size,roadId] of [
  ['radial','large','RD-0297'],
  ['planned','large','RD-0223'],
  ['organic','large','RD-0266'],
]) {
  test(`0.2.1 permits safely reconciled connected stubs in ${size} ${morphology} cities`,()=>{
    const project=createProject({seed:'c2-'+morphology,size,morphology});
    const result=prepareRoadTopologyReflowC3(project,roadId,null,{kind:'remove'});
    assert.ok(result.candidateProject,result.unresolved?.[0]?.message);
    const candidate=result.candidateProject;
    const graph=buildRoadGraph(candidate.city);
    assert.equal(graph.valid,true,JSON.stringify(graph.issues));
    assert.ok(graph.terminalRoadIds.length);
    assert.equal(extractRoadFaces(graph,candidate.city).valid,true);
    assert.equal(validateStoredProject(candidate),candidate);
    const corridors=terminalCorridors(candidate.city);
    assert.ok(candidate.city.properties.every(property=>
      !polygonIntrudesTerminalCorridor(property.boundary,corridors)));
  });
}
