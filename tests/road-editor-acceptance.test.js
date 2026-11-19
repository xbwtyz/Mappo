import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const scenarios = [
  ['planned','RD-0113',12,0],
  ['radial','RD-0103',0,15],
  ['organic','RD-0160',0,15],
  ['linear','RD-0124',0,8],
];

test('C6 substantial street drags adapt developed cities in all four layouts and survive a reopen', async () => {
  const app=await buildingAppHarness();
  for (const [morphology,id,dx,dy] of scenarios) {
    const project=createProject({seed:'c2-'+morphology,size:'small',morphology});
    app.apply({project,workspace:defaultWorkspace(project)});
    const {roadWorkspace,files}=app.state();
    const before=JSON.stringify(app.state().project), revision=files.revision;
    roadWorkspace.start();
    const session=roadWorkspace.session;
    session.schedule=fn=>{fn();};
    session.select({kind:'road',id});
    const road=session.details.record;
    const a=session.graph.nodesById.get(road.a), b=session.graph.nodesById.get(road.b);
    const point={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    assert.equal(session.begin(point,5,'mouse'),true,morphology);
    session.move({x:point.x+dx,y:point.y+dy});
    assert.equal(app.el('roadApplyB4').disabled,true);
    assert.match(app.el('roadApplyStatusB4').textContent,/Release/);
    session.end(false);
    assert.equal(app.el('roadApplyB4').disabled,false,morphology+' '+session.reconciliation?.unresolved[0]?.message);
    assert.ok(session.reconciliation.ledger.some(row=>row.kind==='property'||row.kind==='building'),morphology);
    assert.equal(files.revision,revision);
    app.el('roadApplyB4').handlers.click();
    const after=JSON.stringify(app.state().project);
    assert.notEqual(after,before);
    assert.equal(files.revision,revision+1);
    assert.equal(app.moveRoadHistory('undo'),true);
    assert.equal(JSON.stringify(app.state().project),before);
    assert.equal(app.moveRoadHistory('redo'),true);
    assert.equal(JSON.stringify(app.state().project),after);
    const doc=app.capture();
    const loaded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(doc.project,doc.workspace)));
    app.apply(loaded);
    assert.equal(JSON.stringify(app.state().project),after);
  }
});

test('C6 can open older schema-9 development without inferring that it is safe to rebuild', async () => {
  const app=await buildingAppHarness();
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  for (const record of [...project.city.properties,...project.city.buildings]) delete record.roadProvenance;
  const doc=decodeProjectDocument(encodeProjectDocument(createProjectDocument(project,defaultWorkspace(project))));
  app.apply(doc);
  const {roadWorkspace,files}=app.state();
  const before=JSON.stringify(app.state().project), revision=files.revision;
  roadWorkspace.start();
  const s=roadWorkspace.session;
  s.select({kind:'road',id:'RD-0113'});
  s.updateRoadIntent({x:0,y:18},{defer:false});
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.match(app.el('roadApplyStatusB4').textContent,/parcel|building/i);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(files.revision,revision);
});
