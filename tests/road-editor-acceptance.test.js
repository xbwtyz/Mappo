import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';
import { roadRecoveryGuidanceD3, roadRecoveryIssueD3 } from '../src/ui/road-recovery-d3.js';

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

test('C7 substantial junction drags use local road reflow across all four layouts',async()=>{
  const app=await buildingAppHarness();
  for (const [morphology,id,dx,dy] of [
    ['planned','N-0105',12,0],['radial','N-0101',0,15],
    ['organic','N-0139',0,15],['linear','N-0118',0,8],
  ]) {
    const project=createProject({seed:'c2-'+morphology,size:'small',morphology});
    app.apply({project,workspace:defaultWorkspace(project)});
    const {roadWorkspace,files}=app.state(), before=JSON.stringify(app.state().project), revision=files.revision;
    roadWorkspace.start();
    const s=roadWorkspace.session;
    s.schedule=run=>{run();};
    s.select({kind:'junction',id});
    const {x,y}=s.point;
    assert.equal(s.begin({x,y},5,'touch'),true,morphology);
    s.move({x:x+dx,y:y+dy});
    assert.equal(app.el('roadApplyB4').disabled,true);
    s.end(false);
    assert.equal(app.el('roadApplyB4').disabled,false,morphology+' '+s.reconciliation?.unresolved[0]?.message);
    assert.ok(s.reconciliation.ledger.some(row=>row.kind==='property'||row.kind==='building'),morphology);
    if (['radial','organic'].includes(morphology)) {
      assert.ok(s.reconciliation.ledger.some(row=>row.disposition==='created-junction'));
      assert.match(app.el('roadReportStatus').textContent,/Preview ready/);
    }
    assert.equal(JSON.stringify(app.state().project),before);
    app.el('roadApplyB4').handlers.click();
    assert.equal(files.revision,revision+1);
    assert.deepEqual(app.state().project.city.nodes.find(row=>row.id===id),{id,x:x+dx,y:y+dy});
    const after=JSON.stringify(app.state().project);
    assert.equal(app.moveRoadHistory('undo'),true);
    assert.equal(JSON.stringify(app.state().project),before);
    assert.equal(app.moveRoadHistory('redo'),true);
    assert.equal(JSON.stringify(app.state().project),after);
    const doc=app.capture();
    app.apply(decodeProjectDocument(encodeProjectDocument(createProjectDocument(doc.project,doc.workspace))));
    assert.equal(JSON.stringify(app.state().project),after);
  }
});

test('C7 junction conflicts use the same explicit building choice and Apply gate',async()=>{
  const app=await buildingAppHarness(),project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  project.city.buildings.find(row=>row.id==='BLD-00048').customName='Market Hall';
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace, before=JSON.stringify(app.state().project);
  road.start();
  const s=road.session;
  s.schedule=run=>{run();};
  s.select({kind:'junction',id:'N-0101'});
  const {x,y}=s.point;
  s.update({x,y:y+15},{defer:false});
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(app.el('roadResolveConflictC6').hidden,false);
  assert.match(app.el('roadApplyStatusB4').textContent,/Market Hall/);
  assert.equal(s.decideBuilding('BLD-00048',{kind:'auto'}),true);
  assert.equal(s.reconciliation.ledger.find(row=>row.oldId==='BLD-00048').disposition,'authorized-relocation');
  assert.equal(app.el('roadApplyB4').disabled,false);
  assert.equal(JSON.stringify(app.state().project),before);
  app.el('roadApplyB4').handlers.click();
  assert.equal(app.state().project.city.buildings.find(row=>row.id==='BLD-00048').customName,'Market Hall');
});

test('D1 summary clears when the accepted revision changes', async () => {
  const app=await buildingAppHarness();
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  app.apply({project,workspace:defaultWorkspace(project)});
  const {roadWorkspace,files}=app.state();
  roadWorkspace.start();
  const s=roadWorkspace.session;
  s.select({kind:'junction',id:'N-0105'});
  s.update({x:s.point.x+12,y:s.point.y},{defer:false});
  assert.equal(app.el('roadDetailsD1').open,false);
  assert.equal(app.el('roadReportStatus').textContent,'Preview ready');
  assert.equal(app.el('roadChangeSummaryD1').hidden,false);
  const accepted=JSON.stringify(app.state().project);
  files.revision++;
  s.changed();
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(app.el('roadReportStatus').textContent,'Preview out of date');
  assert.equal(app.el('roadChangeSummaryD1').hidden,true);
  assert.equal(s.roadPreviewVerifiedD1,false);
  assert.equal(JSON.stringify(app.state().project),accepted);
});


test('D2 keeps a settled building choice visible and supports targeted clearing before Apply', async () => {
  const app = await buildingAppHarness();
  const project = createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  project.city.buildings.find(b=>b.id==='BLD-00048').customName = 'Market Hall';
  app.apply({project,workspace:defaultWorkspace(project)});
  const road = app.state().roadWorkspace, before = JSON.stringify(app.state().project);
  road.start();
  const s = road.session;
  s.schedule = run => { run(); };
  s.select({kind:'junction',id:'N-0101'});
  const {x,y}=s.point;
  s.update({x,y:y+15},{defer:false});
  assert.equal(app.el('roadBuildingDecisionsD2').hidden,false);
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(s.decideBuilding('BLD-00048',{kind:'auto'}),true);
  assert.equal(app.el('roadApplyB4').disabled,false);
  assert.equal(app.el('roadBuildingDecisionsD2').hidden,false);
  assert.equal(s.buildingDecisions.get('BLD-00048').kind,'auto');
  assert.equal(s.clearBuildingDecision('BLD-00048'),true);
  assert.equal(s.buildingDecisions.has('BLD-00048'),false);
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(app.el('roadBuildingDecisionsD2').hidden,false);
  assert.equal(JSON.stringify(app.state().project),before);
});

test('D2 rejects a new building decision if the road draft was reset', async () => {
  const app = await buildingAppHarness();
  const project = createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  project.city.buildings.find(b=>b.id==='BLD-00048').customName = 'Market Hall';
  app.apply({project,workspace:defaultWorkspace(project)});
  const road = app.state().roadWorkspace;
  road.start();
  const s = road.session;
  s.schedule = run => { run(); };
  s.select({kind:'junction',id:'N-0101'});
  const {x,y}=s.point;
  s.update({x,y:y+15},{defer:false});
  assert.equal(s.decideBuilding('BLD-00048',{kind:'auto'}),true);
  s.reset();
  assert.equal(s.decideBuilding('BLD-00048',{kind:'fixed'}),false);
  assert.equal(s.clearBuildingDecision('BLD-00048'),false);
  assert.equal(app.el('roadBuildingDecisionsD2').hidden,true);
});


test('D3 maps supported blockers to useful actions without inventing a map target', () => {
  const scenarios = [
    ['protected-edge','Protected infrastructure','adjust'],
    ['unnormalized-crossing','Road crossing needs a junction','adjust'],
    ['face-ambiguous','Block identity unclear','adjust'],
    ['plot-ownership','Plot ownership cannot be preserved','adjust'],
    ['access-connection','Access would disconnect','adjust'],
    ['building-decision-required','Building needs a decision','building'],
    ['building-placement-blocked','Building placement was rejected','building'],
    ['protected-junction','Protected road junction','choose'],
    ['candidate-coordinate','Coordinates cannot be used','adjust'],
    ['coordinate-limit','Coordinates cannot be used','adjust'],
  ];
  for (const [code,title,action] of scenarios) {
    const guide=roadRecoveryGuidanceD3({code,message:'source note'});
    assert.equal(guide.title,title);
    assert.equal(guide.action,action);
    assert.ok(guide.description.length>30);
  }
  assert.equal(roadRecoveryGuidanceD3({code:'unsupported-case',message:'Original explanation'}).description,
    'Original explanation');
  assert.equal(roadRecoveryIssueD3({pending:false,checking:false}),null);
  assert.equal(roadRecoveryIssueD3({pending:true,checking:true}),null);
  const session={pending:true,checking:false,drag:null,
    reconciliation:{unresolved:[
      {kind:'road',id:'RD-4',code:'overlapping-roads'},
      {kind:'building',id:'BLD-1',code:'building-decision-required'}]}};
  assert.equal(roadRecoveryIssueD3(session).id,'BLD-1');
});

test('D3 invalid junction proposal offers adjustment without changing accepted geometry', async () => {
  const app=await buildingAppHarness();
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace, before=JSON.stringify(app.state().project);
  road.start();
  const s=road.session;
  s.select({kind:'junction',id:'N-0105'});
  s.update({x:200000,y:s.point.y},{defer:false});
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(app.el('roadRecoveryD3').hidden,false);
  assert.equal(app.el('roadRecoveryHeadingD3').textContent,'Coordinates cannot be used');
  assert.equal(app.el('roadRecoveryLocateD3').hidden,true);
  app.el('roadRecoveryPrimaryD3').handlers.click();
  assert.equal(app.el('roadEditControlsD1').open,true);
  assert.equal(JSON.stringify(app.state().project),before);
  road.reset();
  assert.equal(app.el('roadRecoveryD3').hidden,true);
  assert.equal(JSON.stringify(app.state().project),before);
});

test('D3 locates a known accepted road obstruction without changing the draft or Apply safety', async () => {
  const app=await buildingAppHarness();
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace, before=JSON.stringify(app.state().project);
  road.start();
  const s=road.session;
  s.select({kind:'junction',id:'N-0105'});
  s.update({x:s.point.x+12,y:s.point.y},{defer:false});
  const draft={...s.point};
  s.reconciliation={...s.reconciliation,
    unresolved:[{kind:'road',id:'RD-0113',code:'overlapping-roads',message:'Road overlap'}]};
  s.changed();
  assert.equal(app.el('roadRecoveryD3').hidden,false);
  assert.equal(app.el('roadRecoveryHeadingD3').textContent,'Roads overlap');
  assert.equal(app.el('roadRecoveryLocateD3').hidden,false);
  assert.equal(app.el('roadApplyB4').disabled,true);
  app.el('roadRecoveryLocateD3').handlers.click();
  assert.equal(s.recoveryFocusD3.id,'RD-0113');
  assert.equal(JSON.stringify(s.point),JSON.stringify(draft));
  assert.equal(JSON.stringify(app.state().project),before);
  s.update({x:draft.x+1,y:draft.y},{defer:false});
  assert.equal(s.recoveryFocusD3,null);
});
