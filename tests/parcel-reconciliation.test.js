import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareParcelReconciliationB2, warpPropertyFrontageB2 } from '../src/core/parcel-reconciliation.js';
import { polygonSignedArea } from '../src/core/geometry.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from '../src/core/property-geometry.js';
import { validateStoredProject } from '../src/data/project-validation.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const project=createProject({seed:'b2-baseline',size:'small',morphology:'organic'});
const graph=buildRoadGraph(project.city);
const ordinary=[...graph.nodesById.keys()].find(id=>graph.incidentRoads.get(id)?.length &&
  graph.incidentRoads.get(id).every(r=>!graph.roadClasses.get(r).protected));
assert.ok(ordinary);
const pt=graph.nodesById.get(ordinary);
test('B2 no-op is detached, exactly identity-preserving, and never Apply-ready',()=>{
 const p=freeze(clone(project)),before=JSON.stringify(p);
 const result=prepareParcelReconciliationB2(p,ordinary,{x:pt.x,y:pt.y});
 assert.equal(result.status,'unchanged');
 assert.equal(result.applyReady,false);
 assert.equal(result.validation.parcels,'unchanged');
 assert.equal(JSON.stringify(result.candidateProject),before);
 assert.equal(JSON.stringify(p),before);
 assert.throws(()=>{result.candidateProject.city.properties[0].area=0},TypeError);
});
test('B2 frontage transform adapts only the frontage of a supported quadrilateral',()=>{
 const source=project.city.properties[0];
 assert.ok(source?.frame?.origin?.id);
 const road=project.city.roads.find(r=>r.id===source.frontageRoadId);
 const oldNodes=new Map(project.city.nodes.map(n=>[n.id,n]));
 const nextNodes=new Map(project.city.nodes.map(n=>[n.id,clone(n)]));
 const anchor=nextNodes.get(source.frame.origin.id);
 anchor.x+=0.05;anchor.y+=0.03;
 const original=JSON.stringify(source);
 const result=warpPropertyFrontageB2(source,road,oldNodes,nextNodes);
 assert.equal(result.boundary.length,4);
 assert.deepEqual(result.boundary.slice(2),source.boundary.slice(2));
 assert.notDeepEqual(result.boundary.slice(0,2),source.boundary.slice(0,2));
 assert.ok(polygonSignedArea(result.boundary)>0);
 const fractions=propertyDividerFractions3I(project.city,source);
 const subdiv=propertyGeometryPreview3I(project.city,source.id,result.boundary,fractions);
 assert.equal(subdiv.plots.length,source.plotIds.length);
 assert.deepEqual(subdiv.plots.map(r=>r.id),source.plotIds);
 assert.ok(Math.abs(subdiv.area-subdiv.total)<.02);
 assert.equal(JSON.stringify(source),original);
});
test('B2 rejects unknown parcel shapes and detached frontage frames',()=>{
 const p=clone(project.city.properties[0]);
 const road=project.city.roads.find(r=>r.id===p.frontageRoadId);
 const nodes=new Map(project.city.nodes.map(n=>[n.id,n]));
 p.boundary.push({x:2,y:3});
 assert.throws(()=>warpPropertyFrontageB2(p,road,nodes,nodes),/four-corner/);
 p.boundary.pop();
 p.frame.origin.id='NONEXISTENT';
 assert.throws(()=>warpPropertyFrontageB2(p,road,nodes,nodes),/anchored/);
});
test('B2 never mutates buildings or accepted history on a real proposed movement',()=>{
 const input=freeze(clone(project)),before=JSON.stringify(input);
 const result=prepareParcelReconciliationB2(input,ordinary,{x:pt.x+.001,y:pt.y+.001});
 assert.equal(result.applyReady,false);
 assert.equal(JSON.stringify(input),before);
 if(result.candidateProject){
   assert.equal(result.status,'candidate-only');
   assert.deepEqual(result.candidateProject.city.buildings,input.city.buildings);
   assert.equal(result.candidateProject.schemaVersion,10);
   assert.doesNotThrow(()=>validateStoredProject(result.candidateProject));
   assert.ok(result.reconciled.every(row=>['property','plot','open-space'].includes(row.kind)));
 } else {
   assert.ok(['invalid','needs-review'].includes(result.status));
   assert.ok(result.unresolved.length);
 }
});
test('B2 is deterministic for identical accepted state and has no stale Apply flag',()=>{
 const point={x:pt.x+.001,y:pt.y+.001};
 const a=prepareParcelReconciliationB2(project,ordinary,point);
 const b=prepareParcelReconciliationB2(clone(project),ordinary,point);
 assert.deepEqual(a,b);
 assert.equal(a.applyReady,false);
});
test('B2 maintains strict preservation across all morphology fixtures',async()=>{
 const data=JSON.parse(await readFile(new URL('./fixtures/road-generation-parity-0.1.json',import.meta.url),'utf8'));
 const byMorph=new Map();
 for(const row of data.fixtures) if(!byMorph.has(row.options.morphology))byMorph.set(row.options.morphology,row);
 assert.equal(byMorph.size,4);
 for(const row of byMorph.values()){
   const opts=row.shape?{...row.options,boundary:data.boundaries[row.shape+'/'+row.options.size]}:row.options;
   const p=createProject(opts),g=buildRoadGraph(p.city);
   const id=[...g.nodesById.keys()].find(id=>g.incidentRoads.get(id)?.length &&
     g.incidentRoads.get(id).every(r=>!g.roadClasses.get(r).protected));
   assert.ok(id);
   const n=g.nodesById.get(id),before=JSON.stringify(p);
   const result=prepareParcelReconciliationB2(p,id,{x:n.x,y:n.y});
   assert.equal(result.status,'unchanged');
   assert.equal(JSON.stringify(result.candidateProject),before);
 }
});
