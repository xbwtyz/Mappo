import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSpatialAreaDeficitSeed, normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../src/core/spatial-recovery-coordinator.js';
import { createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { createProject } from '../src/core/city-model.js';

const group=(id,count)=>({propertyId:id,refs:[{collection:'properties',id},...Array.from({length:count-1},(_,i)=>({collection:'buildings',id:id+'-'+i}))]});
test('area deficit seed is deterministic, complete-group only and local to compressed blocks',()=>{
  const groups=[group('C',2),group('A',4),group('B',2),group('D',2),group('E',2)];
  const properties=new Map([['A',{blockId:'X',area:100}],['B',{blockId:'X',area:80}],['C',{blockId:'X',area:80}],['D',{blockId:'Y',area:1000}],['E',{blockId:'Z',area:30}],['PROTECTED',{blockId:'X',area:5000}]]);
  const blocks=new Map([['X',{area:500}],['Y',{area:1000}],['Z',{area:100}]]);
  const changed=[{kind:'block',id:'X',record:{area:390}},{kind:'block',id:'Y',record:{area:1100}},{kind:'block',id:'Z',record:{area:50}}];
  const before=JSON.stringify(groups),budget=createSpatialDestructionBudget();
  const result=selectSpatialAreaDeficitSeed(groups,properties,blocks,changed,budget);
  assert.deepEqual(result.map(g=>g.propertyId),['B','C','E']);
  assert.deepEqual(result,selectSpatialAreaDeficitSeed(groups.slice().reverse(),properties,blocks,changed.slice().reverse(),createSpatialDestructionBudget()));
  for(const g of result)assert.ok(groups.includes(g));
  assert.equal(JSON.stringify(groups),before);assert.ok(budget.snapshot().work>0);
  assert.deepEqual(selectSpatialAreaDeficitSeed(groups,properties,blocks,[],createSpatialDestructionBudget()),[]);
});
test('area deficit schedule preserves the exact nondestructive incumbent and does not enter destruction',{timeout:300000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const before=JSON.stringify(project);
  const op=normalizeSpatialRoadGroup(project,1,['RD-0184','RD-0186'],{x:-3.005274072121821*.025,y:-37.39896113564458*.025},{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
  const a=await searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget());
  const b=await searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget(),{schedule:'area-deficit-seed'});
  assert.equal(a.status,'verified-witness');assert.equal(b.kind,'nondestructive');
  assert.deepEqual(b.delta,a.delta);assert.deepEqual(b.attempts.map(r=>r.phase),['nondestructive']);
  assert.deepEqual(b.delta.retired,[]);assert.deepEqual(b.delta.added,[]);
  const direct=await searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget(),{schedule:'area-deficit-direct'});
  assert.equal(direct.kind,'nondestructive');assert.deepEqual(direct.delta,a.delta);
  assert.deepEqual(direct.attempts.map(r=>r.phase),['nondestructive']);
  await verifySpatialUnifiedRoadWitness(project,op,direct,createSpatialDestructionBudget());
  await verifySpatialUnifiedRoadWitness(project,op,b,createSpatialDestructionBudget());
  assert.equal(JSON.stringify(project),before);
});
