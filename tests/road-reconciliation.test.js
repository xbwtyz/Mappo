import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareRoadReconciliationB1 } from '../src/core/road-reconciliation.js';

const copy = x => JSON.parse(JSON.stringify(x));
const base = createProject({ seed:'b1-baseline',size:'small',morphology:'organic' });
const graph = buildRoadGraph(base.city);
const ordinary = [...graph.nodesById.keys()].find(id =>
  graph.incidentRoads.get(id).length && graph.incidentRoads.get(id).every(r=>!graph.roadClasses.get(r).protected));
assert.ok(ordinary);
const initial = graph.nodesById.get(ordinary);
const freeze = value => { if (value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('B1 unchanged proposal preserves accepted candidate, IDs and metadata without enabling Apply', () => {
  const input=freeze(copy(base)), before=JSON.stringify(input);
  const result=prepareRoadReconciliationB1(input,ordinary,{x:initial.x,y:initial.y});
  assert.equal(result.status,'unchanged');
  assert.equal(result.applyReady,false);
  assert.equal(result.validation.identity,'pass');
  assert.equal(JSON.stringify(result.candidateProject),before);
  assert.equal(JSON.stringify(input),before);
  assert.throws(()=>{result.candidateProject.city.nodes[0].x=200000},TypeError);
});

test('B1 safe tiny movement builds isolated topology candidate and returns typed dependencies', () => {
  const input=freeze(copy(base)),before=JSON.stringify(input);
  const result=prepareRoadReconciliationB1(input,ordinary,{x:initial.x+.001,y:initial.y+.001});
  assert.equal(result.status,'candidate-only',JSON.stringify(result.unresolved));
  assert.equal(result.applyReady,false);
  assert.equal(result.validation.graph,'pass');
  assert.equal(result.validation.faces,'pass');
  assert.equal(result.validation.identity,'pass');
  assert.equal(result.validation.project,'not-run');
  assert.equal(JSON.stringify(input),before);
  assert.equal(result.candidateProject.city.id,input.city.id);
  assert.equal(result.candidateProject.city.nodes.find(n=>n.id===ordinary).x,initial.x+.001);
  assert.deepEqual(result.candidateProject.city.properties,input.city.properties);
  assert.deepEqual(result.candidateProject.city.plots,input.city.plots);
  assert.deepEqual(result.candidateProject.city.buildings,input.city.buildings);
  assert.deepEqual(result.candidateProject.city.roads,input.city.roads);
  assert.equal(result.changed.filter(r=>r.kind==='road').length,graph.incidentRoads.get(ordinary).length);
});

test('B1 rejects protected moves, outside coordinates and incomplete proposals without mutation', () => {
  const protectedId=[...graph.nodesById.keys()].find(id=>graph.incidentRoads.get(id).some(r=>graph.roadClasses.get(r).protected));
  const input=freeze(copy(base)),before=JSON.stringify(input);
  for(const [id,p] of [[protectedId,{x:200000,y:200000}],[ordinary,{x:Infinity,y:0}],[ordinary,{x:200000,y:200000}],[ordinary,{x:NaN,y:0}]]) {
    const result=prepareRoadReconciliationB1(input,id,p);
    assert.equal(result.status,'invalid');
    assert.equal(result.candidateProject,null);
    assert.equal(result.applyReady,false);
    assert.ok(result.unresolved.length);
  }
  assert.equal(JSON.stringify(input),before);
});

test('B1 results are deterministic and detached from input object order',()=>{
 const a=prepareRoadReconciliationB1(base,ordinary,{x:initial.x+.001,y:initial.y+.001});
 const b=prepareRoadReconciliationB1(copy(base),ordinary,{x:initial.x+.001,y:initial.y+.001});
 assert.deepEqual(a,b);
 const reordered=copy(base);
 reordered.city.nodes.reverse();
 reordered.city.roads.reverse();
 const c=prepareRoadReconciliationB1(reordered,ordinary,{x:initial.x+.001,y:initial.y+.001});
 assert.equal(c.validation.identity,a.validation.identity);
 assert.deepEqual(c.changed,a.changed);
 assert.deepEqual(c.dependent,a.dependent);
});


import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { proposeJunctionMove } from '../src/core/road-graph.js';
import { classifyRoadIdentityB1 } from '../src/core/road-reconciliation.js';
import { readFile } from 'node:fs/promises';

const typeKey = (kind, id) => JSON.stringify([kind,id]);
test('B1 consumes A3 complete typed dependency inventory, including fields outside changed blocks', () => {
  const point={x:initial.x+.001,y:initial.y+.001};
  const report=analyzeRoadImpact(base,proposeJunctionMove(base.city,ordinary,point));
  const result=prepareRoadReconciliationB1(base,ordinary,point);
  assert.equal(report.complete,true);
  assert.equal(result.impactStatus,report.status);
  assert.equal(result.applyReady,false);
  const changed=new Set(result.changed.map(row=>typeKey(row.kind,row.id)));
  const found=new Map(result.dependent.map(row=>[typeKey(row.kind,row.id),row]));
  for (const row of report.affected) {
    const key=typeKey(row.kind,row.id);
    if(changed.has(key)) continue;
    assert.ok(found.has(key),'Missing A3 dependency '+key+' ('+row.code+')');
    assert.ok(found.get(key).reasons.some(reason=>reason.code===row.code),row.code);
  }
  for (const row of report.issues)
    assert.ok(result.unresolved.some(issue=>issue.kind===row.kind &&
      issue.id===row.id && issue.code===row.code && issue.severity===row.severity));
  assert.equal(result.dependent.every(row=>typeof row.kind==='string' && typeof row.id==='string'),true);
  assert.equal(result.preserved.every(row=>row.state==='unchanged'),true);
  assert.equal(result.changed.every(row=>row.state==='modified-identity-preserved'),true);
  const keys=new Set([...result.changed,...result.dependent,...result.preserved]
    .map(row=>typeKey(row.kind,row.id)));
  assert.equal(keys.size,result.changed.length+result.dependent.length+result.preserved.length);
});
test('B1 distinguishes face ambiguity from invalid protected/topology changes',()=>{
  for (const code of ['face-split','face-merged','face-ambiguous','district-reference','defense-reference'])
    assert.equal(classifyRoadIdentityB1([{code}]),'needs-review',code);
  for (const code of ['protected-edge-change','face-matching','invalid-accepted-faces'])
    assert.equal(classifyRoadIdentityB1([{code}]),'invalid',code);
  assert.equal(classifyRoadIdentityB1([{code:'face-split'},{code:'protected-edge-change'}]),'invalid');
});
test('B1 denies collapse of an ordinary road, keeping accepted city intact',()=>{
  const road=base.city.roads.find(r=>r.a===ordinary || r.b===ordinary);
  const other=graph.nodesById.get(road.a===ordinary?road.b:road.a);
  const input=freeze(copy(base)),before=JSON.stringify(input);
  const result=prepareRoadReconciliationB1(input,ordinary,{x:other.x,y:other.y});
  assert.equal(result.status,'invalid');
  assert.equal(result.candidateProject,null);
  assert.equal(result.applyReady,false);
  assert.equal(JSON.stringify(input),before);
});
test('B1 no-op parity for four morphologies, sizes and custom outline fixtures',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/road-generation-parity-0.1.json',import.meta.url),'utf8'));
 const byMorph=new Map();
 for(const item of fixture.fixtures) {
   const kind=item.options.morphology;
   if (!byMorph.has(kind)) byMorph.set(kind,item);
 }
 assert.ok(byMorph.size>=4);
 for(const item of byMorph.values()) {
   const opts=item.shape?{...item.options,boundary:fixture.boundaries[item.shape+'/'+item.options.size]}:item.options;
   const p=freeze(createProject(opts));
   const g=buildRoadGraph(p.city);
   const id=[...g.nodesById.keys()].find(id=>g.incidentRoads.get(id)?.length &&
     g.incidentRoads.get(id).every(r=>!g.roadClasses.get(r).protected));
   assert.ok(id,JSON.stringify(opts));
   const pt=g.nodesById.get(id),before=JSON.stringify(p);
   const result=prepareRoadReconciliationB1(p,id,{x:pt.x,y:pt.y});
   assert.equal(result.status,'unchanged',JSON.stringify(opts));
   assert.equal(result.validation.identity,'pass');
   assert.equal(JSON.stringify(result.candidateProject),before);
   assert.equal(JSON.stringify(p),before);
 }
});
test('B1 complete A3 metadata is not silently treated as safe',()=>{
  const p=copy(base);
  const prop=p.city.properties[0];
  assert.ok(prop);
  prop.extensions={customRoadPolicy:{scope:'manual-review'}};
  const result=prepareRoadReconciliationB1(p,ordinary,{x:initial.x+.001,y:initial.y+.001});
  assert.equal(result.applyReady,false);
  assert.ok(result.status==='candidate-only' || result.status==='needs-review' || result.status==='invalid');
  if(result.status==='candidate-only') {
    assert.ok(result.unresolved.some(row=>row.code==='unrecognized-dependency'));
    assert.ok(result.dependent.some(row=>row.kind==='property' && row.id===prop.id));
  } else assert.equal(result.candidateProject,null);
});
