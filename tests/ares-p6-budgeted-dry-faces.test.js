import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterEditor} from '../src/editor/water.js';
import {TerrainEditor} from '../src/editor/terrain.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {resolveRoadGroupB1} from '../src/core/road-group-b1.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {qualifyP6RoadMovement} from '../scripts/development/research/ares-p6-road-qualification.mjs';
import {matchP6BudgetedIdentity} from '../scripts/development/research/ares-p6-budgeted-identity.mjs';
import {createProject} from '../src/core/city-model.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {extractRoadFaces} from '../src/core/road-faces.js';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {extractP6BudgetedDryFaces} from '../scripts/development/research/ares-p6-budgeted-dry-faces.mjs';
const budget=work=>createSpatialPreservationBudget({work,stateExpansions:32768});
const recipe=morphology=>createProject({seed:'p6-b1a-budget-'+morphology,size:'small',morphology});
const comparable=r=>({valid:r.valid,issues:r.issues,faces:r.faces,exterior:r.exterior,coverage:r.coverage});
for(const morphology of ['radial','organic','linear','planned'])test('P6 B1a dry face parity '+morphology,()=>{
 const p=recipe(morphology),before=JSON.stringify(p),g=buildRoadGraph(p.city);
 assert.ok(g.valid);
 const legacy=extractRoadFaces(g,p.city),b=budget(8000000),first=extractP6BudgetedDryFaces(g,p.city,b);
 assert.ok(legacy.valid);assert.deepEqual(comparable(first),comparable(legacy));
 const w=b.snapshot().work;assert.ok(w>0);
 const second=extractP6BudgetedDryFaces(g,p.city,b);
 assert.deepEqual(comparable(first),comparable(second));assert.equal(b.snapshot().work,2*w);
 const short=budget(w);
 short.spend();
 assert.throws(()=>extractP6BudgetedDryFaces(g,p.city,short),LareBudgetExceeded);
 assert.equal(JSON.stringify(p),before);
 console.log('P6_FACE_BUDGET '+JSON.stringify({morphology,faces:first.faces.length,work:w,twoPassWork:b.snapshot().work,legacyParity:true,authority:'none'}));
});
test('P6 dry face pilot fails closed on missing budget or unsupported landscape',()=>{
 const p=recipe('radial'),g=buildRoadGraph(p.city);
 assert.throws(()=>extractP6BudgetedDryFaces(g,p.city),/Shared P6 budget/);
 assert.throws(()=>extractP6BudgetedDryFaces(g,{...p.city,waterFeatures:[{id:'unsupported'}]},budget(8000000)),/empty landscape/);
 assert.throws(()=>extractP6BudgetedDryFaces(g,{...p.city,terrainFeatures:[{id:'unsupported'}]},budget(8000000)),/empty landscape/);
});

test('P6 mixed landscape classification preserves all protected face ownership and trials an ordinary road movement',async()=>{
 const base=createProject({seed:'mountains',morphology:'organic'});
 const water=new WaterEditor();
 water.generateCoastline(base.options.boundary,base.options.center,{seed:'mountains',direction:'east'});
 water.generate(base.options.boundary,base.options.center,{seed:'mountains',width:24});
 water.generateLakeDraft(base.options.boundary,base.options.center,{seed:'mountains',radius:18});
 const wet=createProject({...base.options,seed:base.seed,water:water.definition()});
 const terrain=new TerrainEditor();
 terrain.generate(base.options.boundary,base.options.center,{seed:'mixed-mountains',placement:'inside',size:40,water:{features:wet.city.waterFeatures,bridges:wet.city.bridges}});
 const project=createProject({...wet.options,seed:wet.seed,water:water.definition(),terrain:terrain.definition(),fortifications:{enabled:true}});
 validateStoredProject(project);
 const city=project.city,before=JSON.stringify(project),graph=buildRoadGraph(city),b=budget(8000000);
 assert.deepEqual(new Set(city.waterFeatures.map(f=>f.kind)),new Set(['river','coast','lake']));
 assert.ok(city.terrainFeatures.length);assert.ok(city.bridges.length);
 const legacy=extractRoadFaces(graph,city),candidate=extractP6BudgetedDryFaces(graph,city,b,{landscape:true});
 assert.ok(legacy.valid);assert.deepEqual(comparable(candidate),comparable(legacy));
 assert.equal(candidate.landscapeValidation,'deferred-to-independent-operation-verifier');
 const match=matchP6BudgetedIdentity(city,candidate,graph,b);
 assert.equal(match.correspondenceValid,true,JSON.stringify(match.issues));
 assert.equal(match.preserved.filter(f=>f.kind==='water'||f.kind==='terrain').length,city.waterFaces.length+city.terrainFaces.length);
 assert.equal(match.changed.length,0);
 assert.throws(()=>extractP6BudgetedDryFaces(graph,city,budget(1),{landscape:true}),LareBudgetExceeded);
 // Choose a small ordinary group whose original B1 intent resolves.
 // The result is an actual P6 trial, not a substituted legacy candidate.
 let pair;
 outer:for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
  const ids=[incident[i],incident[j]];
  if(!resolveRoadGroupB1(graph,ids).eligible)continue;
  const draft=prepareRoadGroupIntentB1(project,ids,{x:.05,y:0});
  if(draft.draftable&&draft.topologyResolved&&draft.facesResolved&&draft.status!=='unchanged'){pair=ids;break outer;}
 }
 assert.ok(pair,'mixed fixture must exercise ordinary road intent');
 const result=await qualifyP6RoadMovement(project,1,pair,{x:.05,y:0},budget(8000000));
 assert.equal(result.authority,'none');
 if(result.status==='verified-detached-road-movement'){assert.equal(result.counts.added,0);assert.equal(result.counts.retired,0);assert.equal(result.landVerified,true);}
 else{assert.equal(result.status,'refused');assert.equal(result.delta,null);assert.ok(result.reason);}
 const protectedRoad=city.roads.find(r=>r.bridgeId);
 assert.ok(protectedRoad);
 const denied=await qualifyP6RoadMovement(project,1,[protectedRoad.id,...pair],{x:1,y:0},budget(8000000));
 assert.equal(denied.status,'refused');assert.equal(denied.delta,null);
 assert.equal(JSON.stringify(project),before);
 console.log('P6_MIXED_LANDSCAPE '+JSON.stringify({waterFaces:city.waterFaces.length,terrainFaces:city.terrainFaces.length,bridges:city.bridges.length,passes:city.terrainPasses.length,faceParity:true,identityWork:b.snapshot().work,trial:{status:result.status,stage:result.stage,reason:result.reason,details:result.details??null,counts:result.counts??null,stats:result.stats},authority:'none'}));
});
