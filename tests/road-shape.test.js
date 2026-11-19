import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRiver } from '../src/generators/water.js';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { draftRoadShape, editableRoadPath, ROAD_BEND_LIMIT } from '../src/core/road-shape.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const shapedRoad = 'RD-0113';
const shapeProject = () => createProject({ seed:'c2-planned',size:'small',morphology:'planned' });
const applyShape = (p,id,points) => prepareRoadTopologyReflowC3(p,id,null,{kind:'shape',points});
function bendsFor(graph,id) {
  const [a,b] = editableRoadPath(graph,id).points;
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  return [.33,.66].map((t,i)=>({id:null,x:a.x+t*dx-8*dy/length*(i+1)/2,y:a.y+t*dy+8*dx/length*(i+1)/2}));
}
test('C4 builds, saves and reloads two road bends and recovers the same path from either end',()=>{
  const p=shapeProject(), graph=buildRoadGraph(p.city), original=structuredClone(p);
  const bends=bendsFor(graph,shapedRoad), result=applyShape(p,shapedRoad,bends);
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  assert.deepEqual(p,original);
  assert.deepEqual(applyShape(p,shapedRoad,bends),result);
  const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(result.candidateProject,defaultWorkspace(p))));
  const next=buildRoadGraph(saved.project.city), path=editableRoadPath(next,shapedRoad);
  assert.equal(path.points.length,4);
  assert.deepEqual(editableRoadPath(next,path.segments.at(-1)),path);
  assert.deepEqual(path.points.slice(1,-1).map(({x,y})=>({x,y})),bends.map(({x,y})=>({x,y})));
  assert.deepEqual([path.points[0],path.points.at(-1)],editableRoadPath(graph,shapedRoad).points);

  const updated=path.points.slice(1,-1).map(({id,x,y},i)=>({id,x,y:y+i+1}));
  const moved=applyShape(saved.project,path.segments.at(-1),updated);
  assert.ok(moved.candidateProject,moved.unresolved[0]?.message);
  assert.deepEqual(editableRoadPath(buildRoadGraph(moved.candidateProject.city),shapedRoad).points.slice(1,-1),updated);
  const reduced=applyShape(moved.candidateProject,shapedRoad,[]);
  assert.ok(reduced.candidateProject,reduced.unresolved[0]?.message);
  assert.equal(editableRoadPath(buildRoadGraph(reduced.candidateProject.city),shapedRoad).points.length,2);
  assert.ok(updated.every(({id})=>!reduced.candidateProject.city.nodes.some(node=>node.id===id)));
});

test('C4 rejects protected, out-of-bounds, almost coincident and oversized paths',()=>{
  const p=shapeProject(), graph=buildRoadGraph(p.city), [a]=editableRoadPath(graph,shapedRoad).points;
  const protectedId=p.city.roads.find(road=>graph.roadClasses.get(road.id).protected).id;
  assert.equal(editableRoadPath(graph,protectedId),null);
  assert.throws(()=>draftRoadShape(p.city,graph,protectedId,[]),/ordinary connections/);
  assert.throws(()=>draftRoadShape(p.city,graph,shapedRoad,[{id:null,x:10000,y:10000}]),/inside the city outline/);
  assert.throws(()=>draftRoadShape(p.city,graph,shapedRoad,[{id:null,x:a.x+.0001,y:a.y}]),/too close|city outline/);
  assert.throws(()=>draftRoadShape(p.city,graph,shapedRoad,Array(ROAD_BEND_LIMIT+1).fill(a)),/editable bends/);
});

test('C4 normal workspace routes bend controls, snapped drag, cancel and redo through one Apply',async()=>{
  const app=await buildingAppHarness(), p=shapeProject();
  app.apply({project:p,workspace:defaultWorkspace(p)});
  const state=app.state(), road=state.roadWorkspace;
  const original=JSON.stringify(state.project), revision=state.files.revision;
  road.start();
  const session=road.session;
  session.schedule=fn=>{fn();};
  session.select({kind:'road',id:shapedRoad});
  app.el('roadStartBendsC4').handlers.click();
  app.el('roadInsertBendC4').handlers.click();
  const [initial]=session.bendEditor.points;
  session.snapBends=true;
  assert.equal(session.begin(initial,4,'touch'),true);
  session.move({x:initial.x+.9,y:initial.y+3.4});
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(session.bendEditor.points[0].x,Math.round(initial.x+.9));
  assert.equal(session.bendEditor.points[0].y,Math.round(initial.y+3.4));
  session.end(true);
  assert.deepEqual(session.bendEditor.points[0],initial);
  assert.equal(JSON.stringify(app.state().project),original);

  const target=bendsFor(session.graph,shapedRoad)[0];
  app.el('roadBendXC4').value=String(target.x);
  app.el('roadBendYC4').value=String(target.y);
  app.el('roadBendXC4').handlers.input();
  assert.equal(app.el('roadApplyB4').disabled,false,session.reconciliation?.unresolved[0]?.message);
  assert.equal(state.files.revision,revision);
  app.el('roadApplyB4').handlers.click();
  const applied=JSON.stringify(app.state().project);
  assert.notEqual(applied,original);
  assert.equal(state.files.revision,revision+1);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.equal(JSON.stringify(app.state().project),original);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),applied);
});

test('C4 sends shaped streets through C3 crossing normalization',()=>{
  const p=shapeProject(), graph=buildRoadGraph(p.city);
  const id='RD-0120', [a,b]=editableRoadPath(graph,id).points;
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  const bend={id:null,x:(a.x+b.x)/2+60*dy/length,y:(a.y+b.y)/2-60*dx/length};
  const result=applyShape(p,id,[bend]);
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  const next=buildRoadGraph(result.candidateProject.city);
  assert.equal(next.valid,true);
  assert.equal(result.candidateProject.city.nodes.filter(node=>node.id.startsWith('N-X-')).length,2);
  assert.ok(result.candidateProject.city.nodes.some(node=>node.id.startsWith('N-BEND-')));
});

test('C4 keeps a proposed bend into water from changing accepted roads',()=>{
  const seed='river-stress';
  const base=createProject({seed,morphology:'organic',size:'small'});
  const water=generateRiver(base.city.survey.boundary,base.options.center,{seed,width:24});
  const p=createProject({...base.options,seed,water});
  const path=p.city.waterFeatures[0].path, {x,y}=path[Math.floor(path.length/2)];
  const before=structuredClone(p);
  const result=applyShape(p,'RD-0125',[{id:null,x,y}]);
  assert.equal(result.candidateProject,null);
  assert.match(result.unresolved[0].message,/protected infrastructure/);
  assert.deepEqual(p,before);
});

test('C4 applies a bend along a district border without merging or reassigning blocks',()=>{
  const p=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  const graph=buildRoadGraph(p.city), id='RD-0098', [a,b]=editableRoadPath(graph,id).points;
  const shared=p.city.blocks.filter(block=>block.vertices.some((node,i)=>
    [node,block.vertices[(i+1)%block.vertices.length]].includes(a.id) &&
    [node,block.vertices[(i+1)%block.vertices.length]].includes(b.id)));
  assert.equal(new Set(shared.map(block=>block.districtId)).size,2);
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  const bend={id:null,x:(a.x+b.x)/2-4*dy/length,y:(a.y+b.y)/2+4*dx/length};
  const result=applyShape(p,id,[bend]);
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  assert.deepEqual(result.candidateProject.city.districts,p.city.districts);
  const revised=result.candidateProject.city.blocks.filter(block=>shared.some(old=>old.id===block.id));
  assert.equal(revised.length,2);
  assert.ok(revised.every(block=>block.vertices.some(node=>node.startsWith('N-BEND-'))));
});
