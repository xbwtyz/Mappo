import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';
import { roadReconciliationPreviewB3 } from '../src/core/road-inspection.js';
import { buildingAppHarness } from './helpers/building-app.js';

const clone = value => JSON.parse(JSON.stringify(value));
const project=createProject({seed:'b3-preview',size:'small',morphology:'organic'});
const node=project.city.nodes[0];

test('B3 preview inventory distinguishes proposed road, block, parcel and plot geometry',()=>{
  const p=clone(project),candidate=clone(p);
  const moving=candidate.city.nodes.find(n=>n.id===candidate.city.blocks[0].vertices[0]);
  moving.x+=.01;
  const block=candidate.city.blocks.find(b=>b.vertices.includes(moving.id));
  block.area+=.01;
  const prop=candidate.city.properties[0];
  prop.boundary[0].x+=.02;prop.frontage[0].x+=.02;prop.area+=.02;
  const plot=candidate.city.plots.find(r=>r.id===prop.plotIds[0]);
  plot.boundary[0].x+=.02;
  const original=JSON.stringify(p);
  const result={candidateProject:candidate,status:'candidate-only',
    validation:{project:'valid'},unresolved:[],changed:[
      {kind:'junction',id:moving.id,fields:['x']},
      {kind:'block',id:block.id,fields:['area']},
      {kind:'property',id:prop.id,fields:['boundary']},
      {kind:'plot',id:plot.id,fields:['boundary']},
    ]};
  const preview=roadReconciliationPreviewB3(p,result);
  assert.equal(preview.mode,'reconciled');
  assert.equal(preview.verified,true);
  for(const kind of ['junction','block','property','plot'])
    assert.ok(preview.rows.some(r=>r.kind===kind));
  assert.equal(preview.buildingsPreserved,p.city.buildings.length);
  const property=preview.rows.find(row=>row.kind==='property');
  assert.ok(Number.isFinite(property.oldFrontage)&&Number.isFinite(property.newFrontage));
  assert.notEqual(property.oldFrontage,property.newFrontage);
  assert.equal(JSON.stringify(p),original);
});
test('B3 rejected B2 results show only proven B1 topology, never invented parcels',()=>{
  const candidate=clone(project);candidate.city.nodes[0].x+=.01;
  const result={candidateProject:null,status:'needs-review',unresolved:[
    {kind:'building',id:'BLD-001',code:'access-connection',severity:'needs-review',message:'Blocked'},
  ]};
  const topology={candidateProject:candidate,changed:[{kind:'junction',id:node.id,fields:['x']}]};
  const preview=roadReconciliationPreviewB3(project,result,topology);
  assert.equal(preview.mode,'topology-only');
  assert.equal(preview.verified,false);
  assert.equal(preview.rows.length,1);
  assert.equal(preview.rows[0].kind,'junction');
  assert.equal(preview.unresolved[0].id,'BLD-001');
  assert.equal(roadReconciliationPreviewB3(project,result).mode,'unavailable');
});
test('B3 stale session callbacks cannot restore discarded candidate or geometry',()=>{
  const callbacks=[];let current=project;
  const session=new RoadPreviewSession({
    getProject:()=>current,
    schedule:fn=>{callbacks.push(fn);return callbacks.length},
    unschedule:()=>{},
    analyze:()=>({status:'needs-review'}),
    reconcile:()=>({candidateProject:null,status:'needs-review',unresolved:[]}),
    reconcileRoad:()=>({candidateProject:clone(current),changed:[]}),
  });
  session.start();
  const original={...session.point};
  session.update({x:original.x+.01,y:original.y+.01});
  const deferred=callbacks.at(-1);
  session.reset();deferred();
  assert.equal(session.reconciliation,null);
  assert.equal(session.topology,null);
  assert.equal(session.previewGeometry,null);
  session.update({x:original.x+.01,y:original.y+.01});
  current=clone(project);callbacks.at(-1)();
  assert.equal(session.reconciliation,null);
  assert.equal(session.previewGeometry,null);
  session.stop();
});
test('B3 compiled panel toggles overlays and preserves every accepted state after Cancel',async()=>{
  const app=await buildingAppHarness(),s=app.state(),road=s.roadWorkspace;
  const before=JSON.stringify(app.capture()),revision=s.files.revision;
  road.start();
  assert.equal(app.el('roadReconciliationB3').hidden,false);
  assert.match(app.el('roadReconciliationStatusB3').textContent,/Accepted city unchanged/);
  assert.equal(road.session.previewVisible,true);
  app.el('roadOverlayB3').checked=false;
  app.el('roadOverlayB3').handlers.change();
  assert.equal(road.session.previewVisible,false);
  road.session.nudge(.01,.01);
  road.session.update(road.session.point,{defer:false});
  assert.equal(road.session.current(),true);
  assert.match(app.el('roadReconciliationStatusB3').textContent,/candidate|unresolved|Checking|Adaptation|geometry|proposed|constraints/i);
  assert.equal(road.session.reconciliation?.applyReady,false);
  assert.equal(JSON.stringify(app.capture()),before);
  road.reset();
  assert.equal(road.session.previewGeometry,null);
  road.exit();
  assert.equal(JSON.stringify(app.capture()),before);
  assert.equal(s.files.revision,revision);
});
