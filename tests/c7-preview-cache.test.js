import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

test('C7 caches verified preview geometry for unchanged reconciliation and invalidates it on reset',async()=>{
  const app=await buildingAppHarness();
  const project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace;
  road.start();
  const s=road.session;
  s.select({kind:'junction',id:'N-0101'});
  const {x,y}=s.point;
  s.update({x,y:y+15},{defer:false});
  assert.ok(s.reconciliation?.candidateProject);
  const before=s.previewGeometry;
  assert.equal(before?.verified,true);
  road.render();
  road.render();
  assert.strictEqual(s.previewGeometry,before,'Stable data must not trigger repeated geometry extraction');
  assert.equal(app.el('roadApplyB4').disabled,false);
  s.reset();
  assert.equal(s.previewGeometry,null,'Reset discards the previous preview');
  s.update({x,y:y+15},{defer:false});
  assert.ok(s.previewGeometry?.verified);
  assert.notStrictEqual(s.previewGeometry,before,'A new reconciliation needs a new derived preview');
});
