import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject} from '../src/core/city-model.js';
import {normalizeSpatialRoadGroup} from '../src/core/spatial-recovery-road-adapter.js';
import {createSpatialDestructionBudget} from '../src/core/spatial-recovery-contract.js';
import {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness} from '../src/core/spatial-recovery-coordinator.js';
import {inspectSpatialConcessionLedger} from '../src/core/spatial-recovery-concessions.js';
import {validateStoredProject} from '../src/data/project-validation.js';

const roads=['RD-0184','RD-0186'],offset={x:-3.005274072121821,y:-37.39896113564458};
const scales=[1,.75,.5,.25,.125,.025,-.25,-.5,-1];
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
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const budget=()=>createSpatialDestructionBudget();
const permissions={destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
// Compare small-shell-first against diversified restoration on all eight
// destructive cases. The nondestructive phase and early-return path are identical.
const diversifiedRetired={
  regular:{'-0.5':[13,18,13],'-1':[16,22,16]},
  irregular:{1:[6,10,10],.75:[6,10,10],.5:[6,10,10],.25:[5,9,9],'-0.5':[13,24,13],'-1':[16,28,16]}
};
for(const irregularProperties of [false,true])test('SRE small-shell-first restoration challenger '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{
  const family=irregularProperties?'irregular':'regular';
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={family,cases:0,verified:0,lost:0,better:0,equal:0,worse:0,retired:{properties:0,plots:0,buildings:0}};
  const collections=['properties','plots','buildings'];
  for(const scale of scales.filter(s=>Object.hasOwn(diversifiedRetired[family],s))){
    const op=normalizeSpatialRoadGroup(project,1,roads,{x:offset.x*scale,y:offset.y*scale},permissions);
    const shared=budget(),result=await searchSpatialUnifiedRoadGroup(project,op,shared,{schedule:'shell-first-restoration'});
    assert.deepEqual(result.stats,shared.snapshot());assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
    summary.cases++;
    const counts={properties:0,plots:0,buildings:0};let fingerprint=null,comparison=null;
    if(result.status==='verified-witness'){
      const actual=await verifySpatialUnifiedRoadWitness(project,op,result,budget());
      validateStoredProject(actual);fingerprint=hash(actual);
      assert.equal(fingerprint,result.delta.candidateFingerprint);assert.equal(result.kind,'retirement');
      assert.deepEqual(actual.identityAllocation,project.identityAllocation);assert.deepEqual(result.delta.added,[]);
      assert.deepEqual(result.delta.retired,result.ledger.retired);
      for(const key of collections){
        const ids=new Set(actual.city[key].map(r=>r.id));
        const missing=project.city[key].filter(r=>!ids.has(r.id)).map(r=>r.id);
        assert.deepEqual(missing.slice().sort(),result.delta.retired.filter(r=>r.collection===key).map(r=>r.id).sort());
        counts[key]=missing.length;summary.retired[key]+=missing.length;
        assert.deepEqual(actual.city[key].map(r=>r.id),project.city[key].filter(r=>ids.has(r.id)).map(r=>r.id));
      }
      summary.verified++;
      const prior=diversifiedRetired[family][scale],now=collections.map(k=>counts[k]);
      comparison=now.some((v,i)=>v>prior[i])?'worse':now.some((v,i)=>v<prior[i])?'better':'equal';
      summary[comparison]++;
    }else{assert.equal(result.status,'refused');assert.equal(result.delta,null);summary.lost++;}
    assert.equal(hash(project),before);
    console.log('SRE_SMALL_SHELL_CASE '+JSON.stringify({family,scale,status:result.status,counts,baseline:diversifiedRetired[family][scale],comparison,fingerprint,demolishedFootprint:result.ledger?.demolishedFootprint??null,scaleLoss:result.ledger?.concessions?.footprintLoss??null,attempts:result.attempts,stats:result.stats}));
  }
  assert.equal(summary.cases,Object.keys(diversifiedRetired[family]).length);
  assert.equal(summary.verified+summary.lost,summary.cases);
  console.log('SRE_SMALL_SHELL_SUMMARY '+JSON.stringify(summary));
});
