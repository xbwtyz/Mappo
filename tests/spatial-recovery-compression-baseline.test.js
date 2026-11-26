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
// This first full integrated diagnostic deliberately distinguishes an
// honestly measured search refusal from a regression or invalid witness.
// The 18/18 gate is not satisfied by passing these safety assertions.
for(const irregularProperties of [false,true])test('SRE integrated 18-case baseline '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{
  const family=irregularProperties?'irregular':'regular';
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={family,cases:0,verified:0,nondestructive:0,destructive:0,refused:0,knownRetained:0,retired:{properties:0,plots:0,buildings:0},demolishedFootprint:0,scaleLoss:0};
  for(const scale of scales){
    const op=normalizeSpatialRoadGroup(project,1,roads,{x:offset.x*scale,y:offset.y*scale},permissions);
    const shared=budget();
    const result=await searchSpatialUnifiedRoadGroup(project,op,shared);
    summary.cases++;
    assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
    assert.deepEqual(result.stats,shared.snapshot());
    let counts={properties:0,plots:0,buildings:0},fingerprint=null;
    if(result.status==='verified-witness'){
      const actual=await verifySpatialUnifiedRoadWitness(project,op,result,budget());
      validateStoredProject(actual);
      fingerprint=hash(actual);assert.equal(fingerprint,result.delta.candidateFingerprint);
      assert.deepEqual(actual.identityAllocation,project.identityAllocation);
      assert.deepEqual(result.delta.added,[]);
      const retired=result.delta.retired;
      for(const key of ['properties','plots','buildings']){
        const after=new Set(actual.city[key].map(r=>r.id));
        const missing=project.city[key].filter(r=>!after.has(r.id)).map(r=>r.id);
        assert.deepEqual(missing.slice().sort(),retired.filter(r=>r.collection===key).map(r=>r.id).sort());
        assert.deepEqual(actual.city[key].map(r=>r.id),project.city[key].filter(r=>after.has(r.id)).map(r=>r.id));
        counts[key]=missing.length;summary.retired[key]+=missing.length;
      }
      for(const key of ['roads','nodes','blocks'])assert.deepEqual(actual.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
      assert.deepEqual(result.ledger.retired,retired);
      const missingBuildings=new Set(retired.filter(r=>r.collection==='buildings').map(r=>r.id));
      const demolished=project.city.buildings.reduce((n,b)=>n+(missingBuildings.has(b.id)?b.area:0),0);
      assert.ok(Math.abs(demolished-result.ledger.demolishedFootprint)<1e-6);
      summary.demolishedFootprint+=demolished;
      summary.scaleLoss+=result.ledger.concessions.footprintLoss;
      summary.verified++;
      if(result.kind==='nondestructive'){
        summary.nondestructive++;assert.equal(retired.length,0);
        assert.deepEqual(result.attempts.map(r=>r.phase),['nondestructive']);
        const preserving=normalizeSpatialRoadGroup(project,1,roads,op.geometry.offset,{alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
        assert.deepEqual(inspectSpatialConcessionLedger(project,preserving,actual,budget()),result.ledger.concessions);
      }else{
        assert.equal(result.kind,'retirement');assert.ok(retired.length);summary.destructive++;
      }
    }else{
      assert.equal(result.status,'refused');assert.equal(result.delta,null);summary.refused++;
    }
    if(Object.hasOwn(known[family],scale)){
      assert.equal(result.kind,'nondestructive','Previously qualified nondestructive case lost');
      assert.equal(fingerprint,known[family][scale],'Previously qualified candidate changed');
      summary.knownRetained++;
    }
    assert.equal(hash(project),before);
    console.log('SRE_INTEGRATED_COMPRESSION_CASE '+JSON.stringify({family,scale,status:result.status,kind:result.kind,fingerprint,counts,demolishedFootprint:result.ledger?.demolishedFootprint??null,concessions:result.ledger?.concessions??null,attempts:result.attempts,stats:result.stats,exhausted:result.exhausted}));
  }
  assert.equal(summary.cases,9);
  assert.equal(summary.knownRetained,Object.keys(known[family]).length);
  assert.equal(summary.verified+summary.refused,9);
  console.log('SRE_INTEGRATED_COMPRESSION_SUMMARY '+JSON.stringify(summary));
});


