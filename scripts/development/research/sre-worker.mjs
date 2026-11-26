// Run only the fixed SRE pilot against an independently checked-out target revision.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {digest} from './contract.mjs';
import {targetRevision,schedules,gates} from './sre-pilot.mjs';
const task=JSON.parse(readFileSync(0,'utf8')),m=task.manifest,root=process.argv[2],start=performance.now();
const load=p=>import(pathToFileURL(join(root,p)).href);
try{
  assert.equal(m.targetRevision,targetRevision);assert.ok(schedules.includes(task.schedule));
  assert.equal(task.manifestDigest,digest(m));
  const {createProject}=await load('src/core/city-model.js');
  const {normalizeSpatialRoadGroup}=await load('src/core/spatial-recovery-road-adapter.js');
  const {createSpatialDestructionBudget}=await load('src/core/spatial-recovery-contract.js');
  const {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness}=await load('src/core/spatial-recovery-coordinator.js');
  const {validateStoredProject}=await load('src/data/project-validation.js');
  async function solve(){
    const c=task.case,project=createProject({...m.project,irregularProperties:c.irregularProperties}),before=digest(project);
    const op=normalizeSpatialRoadGroup(project,1,m.roadIds,{x:m.offset.x*c.scale,y:m.offset.y*c.scale},m.permissions);
    const shared=createSpatialDestructionBudget();
    const result=await searchSpatialUnifiedRoadGroup(project,op,shared,{schedule:task.schedule});
    assert.deepEqual(result.stats,shared.snapshot());
    assert.ok(result.stats.work<=m.budget.work&&result.stats.expansions<=m.budget.expansions);
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
    if(c.id==='regular-preservation'){
      assert.equal(result.kind,'nondestructive');assert.deepEqual(counts,{properties:0,plots:0,buildings:0});
      assert.equal(digest(actual),'29be178022ec22688c465c5f9bb77451c29a697b3a5ef05088f9e9d6ce991581');
    }else{
      assert.equal(result.kind,'retirement');
      const expected=task.schedule==='baseline'?[19,29,25]:[5,9,9];
      assert.deepEqual(Object.values(counts),expected);
    }
    assert.equal(digest(project),before);
    return {inputFingerprint:before,candidateFingerprint:digest(actual),kind:result.kind,counts,demolishedFootprint:result.ledger.demolishedFootprint,scaleLoss:result.ledger.concessions?.footprintLoss??0,stats:result.stats};
  }
  const a=await solve(),b=await solve();assert.deepEqual(a,b,'Nondeterministic SRE replay');
  console.log(JSON.stringify({...a,status:'verified',elapsedMs:performance.now()-start,peakRssKiB:process.resourceUsage().maxRSS,gates:Object.fromEntries(gates.map(g=>[g,true]))}));
}catch(e){console.error(e.stack);process.exitCode=1;}
