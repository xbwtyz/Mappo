// Run only the fixed SRE pilot against an independently checked-out target revision.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {digest} from './contract.mjs';
import {targetRevision,schedules,gates,budgetWork} from './sre-pilot.mjs';
const known={
  regular:{
    1:'e2a1f659b2b386a8f2c6a828a4ad7a2f75551b3eea376e5297d0f19b9576e974',
    .75:'ab0c1ca2cbfa6261e9ad606c53a35e7a96a74f53b03f5bad97f09b17e2d63ba6',
    .5:'29be178022ec22688c465c5f9bb77451c29a697b3a5ef05088f9e9d6ce991581',
    .25:'704fbb3ae8a6d05d96f8ed6f85ca9b59da6fc14a1299dd22c248285c5227ba07',
    .125:'132f0b319882e4aac7f6a8b25bcf95ff10b6f3cd560d3d0dff07fa0766774138',
    .025:'84a142db28b1251734fb8a7c6b6e263d4c45f00e4c5fd525b3a00e82faab1201',
    '-0.25':'756f5d414a829cffa1baaf4d5ed19ba24ccd2f361da79e998a7d286f85f40bf5'
  },
  irregular:{
    .125:'2dc47bd03b0b645ed44f88990c2721a5fcb58f550525e0d3d76a10ace81f9b12',
    .025:'d03a287b2c5e1adef598fee0006f98b1ec1bb44dc44c09e263380f6e16823100',
    '-0.25':'954c56bd673e8ef923dc102eb6d3d1bc2a76c15d3499117402c2a48bd1a3c199'
  }
};
const task=JSON.parse(readFileSync(0,'utf8')),m=task.manifest,root=process.argv[2],start=performance.now();
const load=p=>import(pathToFileURL(join(root,p)).href);
try{
  assert.match(m.targetRevision,/^[a-f0-9]{40}$/);assert.ok(schedules.includes(task.schedule));
  assert.equal(task.manifestDigest,digest(m));
  const {createProject}=await load('src/core/city-model.js');
  const {normalizeSpatialRoadGroup}=await load('src/core/spatial-recovery-road-adapter.js');
  const {createSpatialDestructionBudget}=await load('src/core/spatial-recovery-contract.js');
  const {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness}=await load('src/core/spatial-recovery-coordinator.js');
  const experimental=Object.hasOwn(budgetWork,task.schedule),workLimit=experimental?budgetWork[task.schedule]:m.budget.work;
  const research=experimental?await load('src/core/spatial-recovery-budget-research.js'):null;
  const {createLareBudget,LARE_DEMOLITION_LIMITS}=await load('src/core/reconciliation-budget.js');
  const {validateStoredProject}=await load('src/data/project-validation.js');
  const {buildRoadGraph}=await load('src/core/road-graph.js');
  const {proposeRoadGroupNodesB1}=await load('src/core/road-group-b1.js');
  const {prepareRoadGroupIntentB1}=await load('src/core/road-intent-c1.js');
  function selectRoads(project,offset){
    const graph=buildRoadGraph(project.city);assert.ok(graph.valid,'Generated graph invalid');
    const pairs=new Map();
    for(const [,incident] of graph.incidentRoads){
      const ids=[...incident].filter(id=>!graph.roadClasses.get(id)?.protected).sort();
      for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const pair=[ids[i],ids[j]];pairs.set(pair.join(':'),pair);}
    }
    // Fixed pre-search selection, independent of strategy or solver outcome.
    for(const key of [...pairs.keys()].sort().slice(0,128)){
      const ids=pairs.get(key);
      if(!proposeRoadGroupNodesB1(graph,ids,offset).draftable)continue;
      const draft=prepareRoadGroupIntentB1(project,ids,offset);
      if(draft.group?.eligible&&draft.draftable&&draft.topologyResolved&&draft.facesResolved&&draft.status!=='unchanged'&&!draft.issues?.some(i=>i.code==='boundary-escape'))return ids;
    }
    throw Error('No eligible held-out road pair within fixed 128-pair selection bound.');
  }
  async function solve(){
    const c=task.case,project=createProject({...m.project,...(c.fixture??{}),irregularProperties:c.irregularProperties}),before=digest(project);
    validateStoredProject(project);
    const offset={x:m.offset.x*c.scale,y:m.offset.y*c.scale};
    const roadIds=c.fixture?selectRoads(project,offset):m.roadIds;
    const op=normalizeSpatialRoadGroup(project,1,roadIds,offset,m.permissions),operationFingerprint=digest(op);
    const shared=experimental?createLareBudget({work:workLimit,stateExpansions:131072},{ceiling:{...LARE_DEMOLITION_LIMITS,work:256000000}}):createSpatialDestructionBudget();
    const result=experimental?await research.searchSpatialBudgetResearch(project,op,shared,{workLimit,iterative:['iterative-256m','child-priority-256m','solver-selection-256m','combined-256m'].includes(task.schedule),childPriority:['child-priority-256m','solver-selection-256m','combined-256m'].includes(task.schedule),solverSelection:task.schedule==='solver-selection-256m',finalRefinement:task.schedule==='combined-256m'}):await searchSpatialUnifiedRoadGroup(project,op,shared,{schedule:task.schedule});
    assert.deepEqual(result.stats,shared.snapshot());
    assert.ok(result.stats.work<=workLimit&&result.stats.expansions<=m.budget.expansions);
    if(experimental&&workLimit===32000000)assert.equal(result.status,'verified-witness','32M parity control refused');
    const locked=known[c.irregularProperties?'irregular':'regular'][c.scale];
    if(locked||c.scale===-1)assert.equal(result.status,'verified-witness','Locked corpus witness refused');
    if(result.status==='refused'&&c.expectation==='exploratory'){
      assert.equal(result.delta,null);assert.equal(result.basisDelta,null);assert.equal(digest(project),before);
      return {status:'refused',workLimit,inputFingerprint:before,operationFingerprint,roadIds,offset,candidateFingerprint:null,kind:null,counts:null,demolishedFootprint:null,scaleLoss:null,stats:result.stats,attempts:result.attempts};
    }
    assert.equal(result.status,'verified-witness','Known pilot movement refused');
    assert.ok(['nondestructive','retirement'].includes(result.kind));
    const actual=await verifySpatialUnifiedRoadWitness(project,op,result,createSpatialDestructionBudget());
    validateStoredProject(actual);
    assert.equal(digest(actual),result.delta.candidateFingerprint);
    assert.deepEqual(actual.identityAllocation,project.identityAllocation);assert.deepEqual(result.delta.added,[]);
    assert.deepEqual(result.delta.retired,result.ledger.retired);
    const counts={};
    for(const k of ['properties','plots','buildings']){
      const ids=new Set(actual.city[k].map(r=>r.id)),missing=project.city[k].filter(r=>!ids.has(r.id)).map(r=>r.id);
      assert.deepEqual(missing.slice().sort(),result.delta.retired.filter(r=>r.collection===k).map(r=>r.id).sort());
      assert.deepEqual(actual.city[k].map(r=>r.id),project.city[k].filter(r=>ids.has(r.id)).map(r=>r.id));
      counts[k]=missing.length;
    }
    if(locked){
      assert.equal(result.kind,'nondestructive');assert.deepEqual(counts,{properties:0,plots:0,buildings:0});
      assert.equal(digest(actual),locked);assert.deepEqual(result.attempts.map(r=>r.phase),['nondestructive']);
    }
    for(const key of ['roads','nodes','blocks'])assert.deepEqual(actual.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
    const missingBuildings=new Set(result.delta.retired.filter(r=>r.collection==='buildings').map(r=>r.id));
    assert.ok(Math.abs(project.city.buildings.reduce((n,b)=>n+(missingBuildings.has(b.id)?b.area:0),0)-result.ledger.demolishedFootprint)<1e-6);
    if(task.schedule==='combined-256m'&&c.scale===-1){
      assert.deepEqual(Object.values(counts),c.irregularProperties?[10,19,14]:[10,13,14]);
      assert.equal(digest(actual),c.irregularProperties?'bbcbad96e73f85b19a2afd51743c9b6f00485daba564ee800576c5239bb80ec1':'cd747ddbe66afdc9e8ffaf280cbdef597d659a1fcb7893d3520a06f3afd909c1');
    }
    if(c.expectation==='known-preservation'){
      assert.equal(result.kind,'nondestructive');assert.deepEqual(counts,{properties:0,plots:0,buildings:0});
      assert.equal(digest(actual),'29be178022ec22688c465c5f9bb77451c29a697b3a5ef05088f9e9d6ce991581');
    }else if(c.expectation==='known-compression'){
      assert.equal(result.kind,'retirement');
      const expected=task.schedule==='baseline'?[19,29,25]:[5,9,9];
      assert.deepEqual(Object.values(counts),expected);
    }
    if(task.schedule==='solver-selection-256m'){
      assert.equal(c.scale,-1);
      assert.deepEqual(Object.values(counts),c.irregularProperties?[10,19,14]:[10,13,14]);
      assert.equal(digest(actual),c.irregularProperties?'54807c4cd28986fb9eb7cccdd7d1d9329b55e86b24b110030c4311c3fad41b8d':'cd747ddbe66afdc9e8ffaf280cbdef597d659a1fcb7893d3520a06f3afd909c1');
    }
    if(task.schedule==='child-priority-256m'){
      assert.equal(c.scale,-1);
      assert.deepEqual(Object.values(counts),c.irregularProperties?[10,19,14]:[10,13,14]);
      assert.equal(digest(actual),c.irregularProperties?'54807c4cd28986fb9eb7cccdd7d1d9329b55e86b24b110030c4311c3fad41b8d':'f31b70d1976ad440ec8d84e56ca1bb882b7b4e613c7426ae952d0b6e7c9118e9');
    }
    if(task.schedule==='iterative-256m'){
      assert.equal(c.scale,-1);
      assert.deepEqual(Object.values(counts),c.irregularProperties?[10,19,15]:[10,13,15]);
      assert.equal(digest(actual),c.irregularProperties?'a9b261397108df07c9ec3632089118ac9f77615c44f80d089392fc4d9ae39ac2':'5d6aace39754dba0ac1e85d9b3f11198e7b5c92cdd31365439348d0e73e96118');
    }
    if(task.schedule==='budget-256m'){
      assert.equal(c.scale,-1);
      assert.deepEqual(Object.values(counts),c.irregularProperties?[13,24,15]:[13,18,15]);
      assert.equal(digest(actual),c.irregularProperties?'c518ebefe5c2d594f800e8907e34bc773954613103d00981592d12b8ee1c9366':'a8f878cefb323826732e46126770f7fb6f2cc35b3a970f364df3e20c57cdc12d');
    }
    if(experimental&&workLimit===32000000&&c.scale===-1){
      assert.equal(c.scale,-1,'Unexpected budget control fixture');
      assert.deepEqual(Object.values(counts),c.irregularProperties?[16,28,16]:[16,22,16]);
      assert.equal(digest(actual),c.irregularProperties?'1a364cabbf23ecc9ff96e772de572119b784137f444adb9d2c958f92d53b225d':'3dc567b4c2cac07f7c48c779de9b3093fcc06a07e30985f9fe604422bbfb67a1');
    }
    assert.equal(digest(project),before);
    return {status:'verified',workLimit,inputFingerprint:before,operationFingerprint,roadIds,offset,candidateFingerprint:digest(actual),kind:result.kind,counts,demolishedFootprint:result.ledger.demolishedFootprint,scaleLoss:result.ledger.concessions?.footprintLoss??0,stats:result.stats,attempts:result.attempts};
  }
  const a=await solve(),b=await solve();assert.deepEqual(a,b,'Nondeterministic SRE replay');
  console.log(JSON.stringify({...a,elapsedMs:performance.now()-start,peakRssKiB:process.resourceUsage().maxRSS,gates:Object.fromEntries((a.status==='verified'?gates:['nonmutation','deterministicReplay','budget']).map(g=>[g,true]))}));
}catch(e){console.error(e.stack);process.exitCode=1;}
