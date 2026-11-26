import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { normalizeSpatialRoadGroup, searchSpatialPreservingRoadGroup, searchSpatialConcessionRoadGroup, searchSpatialRankedConcessionRoadGroup, discoverSpatialRoadRetirementEligibility, searchSpatialBuildingRetirementRoadGroup, verifySpatialBuildingRetirementWitness, searchSpatialPropertyRetirementRoadGroup, searchSpatialGroupedRetirementRoadGroup, searchSpatialRetirementSubsetRoadGroup, restoreSpatialRoadRetirements, optimizeSpatialRoadRetirements, verifySpatialRetirementWitness, verifySpatialConcessionRoadWitness, verifySpatialStrictRoadWitness } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget, createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { listSpatialAdjacentFrontages, inspectSpatialUniformSimilarity, inspectSpatialConcessionLedger, verifySpatialFrontageAlignment, iterateSpatialConcessionParcelProposals, createSpatialConcessionProposalSource } from '../src/core/spatial-recovery-concessions.js';
import { createSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { scoreSpatialConcessions,compareSpatialConcessionCost,scoreSpatialPreservation,measureSpatialRetirementCost,improvesSpatialRetirementCost } from '../src/core/spatial-recovery-score.js';
import { stampRoadGenerated } from '../src/core/road-provenance.js';
const budget=()=>createSpatialPreservationBudget();
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
const operation=permissions=>normalizeSpatialRoadGroup(project,1,ids,offset,permissions);
const draft=prepareRoadGroupIntentB1(project,ids,offset);
const context=createLareContext(project,draft,new Map(),budget());
const clone=x=>JSON.parse(JSON.stringify(x));
test('detached concession cost preserves tier priority and deterministic multidimensional ordering',()=>{
  const zero={frontageSwitches:0,scaledBuildings:0,footprintLoss:0,maxLinearReduction:0,
    movedBuildings:0,displacement:0,rotation:0,propertyDeformation:0,plotDeformation:0,accessChanges:0};
  const strict={...zero,movedBuildings:100,displacement:1000};
  const frontage={...zero,frontageSwitches:2,movedBuildings:3};
  const scaled={...zero,frontageSwitches:1,scaledBuildings:1,footprintLoss:10,maxLinearReduction:.05,movedBuildings:1};
  const rows=[strict,frontage,scaled];
  for(let i=0;i<rows.length;i++)for(let j=0;j<rows.length;j++)
    assert.equal(compareSpatialConcessionCost(rows[i],rows[j]),Math.sign(i-j));
  assert.equal(compareSpatialConcessionCost(scaled,{...scaled,maxLinearReduction:.1,footprintLoss:1}),-1);
  assert.equal(compareSpatialConcessionCost(frontage,{...frontage,frontageSwitches:3,movedBuildings:0}),-1);
  assert.equal(compareSpatialConcessionCost(scaled,{...scaled,footprintLoss:11}),-1);
  assert.equal(compareSpatialConcessionCost(scaled,{...scaled,maxLinearReduction:.05-1e-12,footprintLoss:11}),-1);
  for(const key of ['movedBuildings','displacement','rotation','propertyDeformation','plotDeformation','accessChanges'])
    assert.equal(compareSpatialConcessionCost(frontage,{...frontage,[key]:frontage[key]+1}),-1);
  assert.throws(()=>compareSpatialConcessionCost(scaled,{...scaled,footprintLoss:NaN}),/Invalid spatial concession cost/);
  assert.throws(()=>compareSpatialConcessionCost(zero,{...zero,footprintLoss:1}),/Invalid spatial concession cost/);
  assert.throws(()=>compareSpatialConcessionCost(frontage,{...frontage,frontageSwitches:-1}),/Invalid spatial concession cost/);
  const op=operation({});
  const measured=scoreSpatialConcessions(project,op,project,budget());
  assert.deepEqual(measured,{...zero,...scoreSpatialPreservation(project,project,budget())});
  assert.ok(Object.isFrozen(measured));
});
test('detached SRE frontage options require permission, same-block adjacency and eligible generated children',()=>{
  const before=JSON.stringify(project),op=operation({alternativeFrontage:true});
  const eligible=context.properties.filter(p=>p.policy.mode==='adaptive'&&p.buildings.every(b=>b.mode==='rigid'));
  let checked=0;
  for(const entry of eligible){
    const options=listSpatialAdjacentFrontages(project,op,entry.id,budget());
    if(!options.length)continue;
    const block=project.city.blocks.find(b=>b.id===entry.blockId),roads=project.city.roads;
    const original=roads.find(r=>r.id===entry.frontageRoadId);
    assert.ok(options.length<=2);assert.equal(new Set(options).size,options.length);
    for(const id of options){
      const r=roads.find(x=>x.id===id);assert.notEqual(id,entry.frontageRoadId);
      assert.ok([r.a,r.b].some(n=>n===original.a||n===original.b));
      assert.ok(block.vertices.some((v,i)=>[r.a,r.b].includes(v)&&[r.a,r.b].includes(block.vertices[(i+1)%block.vertices.length])));
    }
    assert.deepEqual(listSpatialAdjacentFrontages(project,operation({}),entry.id,budget()),[]);
    assert.deepEqual(listSpatialAdjacentFrontages(project,op,entry.id,budget()),options);
    checked++;break;
  }
  assert.ok(checked,'fixture must exercise real alternative frontage proposals');
  assert.deepEqual(listSpatialAdjacentFrontages(project,op,'not-a-property',budget()),[]);
  assert.equal(JSON.stringify(project),before);
});
function scaled(source,factor){
  const candidate=clone(source),p=source.geometry.regions[0].ring[0],angle=.15,co=Math.cos(angle),si=Math.sin(angle);
  for(const region of candidate.geometry.regions)region.ring=region.ring.map(q=>{
    const x=q.x-p.x,y=q.y-p.y;return {x:p.x+.2+factor*(x*co-y*si),y:p.y+.1+factor*(x*si+y*co)};
  });
  candidate.orientation+=angle;candidate.area*=factor*factor;return candidate;
}
test('detached SRE scaling derives uniform factors, preserves canonical structure and refuses tampering',()=>{
  const before=JSON.stringify(project);
  const op=operation({uniformScaling:true,maxLinearReduction:.2});
  const entries=context.properties.filter(p=>p.policy.mode==='adaptive');
  let source;
  for(const entry of entries){
    for(const b of entry.buildings.filter(x=>x.mode==='rigid')){
      const item=project.city.buildings.find(x=>x.id===b.id);
      try{inspectSpatialUniformSimilarity(project,op,item.id,scaled(item,.95),budget());source=item;break;}
      catch(error){if(!/not eligible for uniform scaling/.test(error.message))throw error;}
    }
    if(source)break;
  }
  assert.ok(source,'fixture must exercise actual affected eligible building');
  for(const factor of [.95,.9,.8]){
    const result=inspectSpatialUniformSimilarity(project,op,source.id,scaled(source,factor),budget());
    assert.ok(Math.abs(result.factor-factor)<1e-6);assert.ok(result.footprintLoss>0);
  }
  assert.throws(()=>inspectSpatialUniformSimilarity(project,operation({}),source.id,scaled(source,.95),budget()),/not permitted/);
  assert.throws(()=>inspectSpatialUniformSimilarity(project,operation({uniformScaling:true,maxLinearReduction:.05}),source.id,scaled(source,.9),budget()),/refused/);
  for(const factor of [.79,1.01])assert.throws(()=>inspectSpatialUniformSimilarity(project,op,source.id,scaled(source,factor),budget()),/refused/);
  for(const tamper of [b=>b.geometry.regions[0].ring[2].x+=.1,b=>b.area+=1,b=>b.propertyId='wrong',b=>b.frontageRoadId='wrong',b=>b.components[0].id='wrong',b=>b.orientation+=.1]){
    const candidate=scaled(source,.95);tamper(candidate);
    assert.throws(()=>inspectSpatialUniformSimilarity(project,op,source.id,candidate,budget()),/refused/);
  }
  assert.equal(JSON.stringify(project),before);
});

test('detached candidate concession ledger derives exact switches and scale loss, never grants edit authority',()=>{
  const before=JSON.stringify(project),op=operation({alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.1});
  let selected;
  for(const entry of context.properties){
    if(!entry.buildings.length)continue;
    const options=listSpatialAdjacentFrontages(project,op,entry.id,budget());
    if(options.length){selected={entry,to:options[0]};break;}
  }
  assert.ok(selected,'fixture must exercise eligible switched property and building');
  const {entry,to}=selected;
  // Synthetic reference and similarity witness only: this intentionally does
  // not claim that old parcel geometry fits the new frontage or road intent.
  const candidate=clone(project),p=candidate.city.properties.find(r=>r.id===entry.id);
  const from=p.frontageRoadId;
  p.frontageRoadId=to;
  const plots=p.plotIds.map(id=>candidate.city.plots.find(r=>r.id===id));
  for(const plot of plots)plot.frontageRoadId=to;
  const children=p.buildingIds.map(id=>candidate.city.buildings.find(r=>r.id===id));
  const first=children[0],b=scaled(first,.95);
  Object.assign(first,b);
  for(const child of children){child.frontageRoadId=to;stampRoadGenerated(child);}
  stampRoadGenerated(p,plots);
  const ledger=inspectSpatialConcessionLedger(project,op,candidate,budget());
  assert.deepEqual(ledger.frontageSwitches,[{propertyId:p.id,from,to}]);
  assert.equal(ledger.scaledBuildings.length,1);
  assert.equal(ledger.scaledBuildings[0].buildingId,first.id);
  assert.ok(Math.abs(ledger.scaledBuildings[0].factor-.95)<1e-6);
  assert.ok(ledger.footprintLoss>0);
  assert.throws(()=>verifySpatialFrontageAlignment(project,op,candidate,ledger,budget()),/frontage/);
  assert.deepEqual(inspectSpatialConcessionLedger(project,op,candidate,budget()),ledger);
  assert.throws(()=>inspectSpatialConcessionLedger(project,operation({uniformScaling:true}),candidate,budget()),/Unauthorized alternative frontage/);
  assert.throws(()=>inspectSpatialConcessionLedger(project,operation({alternativeFrontage:true}),candidate,budget()),/not permitted/);
  for(const tamper of [
    c=>c.city.plots.find(r=>r.id===plots[0].id).frontageRoadId=from,
    c=>c.city.buildings.find(r=>r.id===first.id).frontageRoadId=from,
    c=>c.city.buildings.find(r=>r.id===first.id).propertyId='wrong',
    c=>c.city.buildings.pop(),
    c=>c.city.properties.find(r=>r.id===p.id).frontageRoadId='wrong'
  ]){
    const altered=clone(candidate);tamper(altered);
    assert.throws(()=>inspectSpatialConcessionLedger(project,op,altered,budget()));
  }
  const unchanged=inspectSpatialConcessionLedger(project,operation({}),project,budget());
  assert.deepEqual(unchanged,{frontageSwitches:[],scaledBuildings:[],footprintLoss:0});
  assert.equal(JSON.stringify(project),before);
});

test('detached concession transport verifies a real ordinary road witness, refuses wrong intent and unauthorized geometry',async()=>{
  const before=JSON.stringify(project),strict=operation({});
  const ordinary=await searchSpatialPreservingRoadGroup(project,strict,budget());
  assert.equal(ordinary.status,'verified-witness');
  const candidate=await verifySpatialStrictRoadWitness(project,strict,ordinary.delta,budget());
  const op=operation({alternativeFrontage:true,uniformScaling:true});
  const delta=await createSpatialDelta(project,candidate,op,1,budget());
  const verified=await verifySpatialConcessionRoadWitness(project,op,delta,budget());
  assert.deepEqual(verified,candidate);
  await assert.rejects(()=>verifySpatialStrictRoadWitness(project,op,delta,budget()),/not integrated/);
  await assert.rejects(()=>verifySpatialConcessionRoadWitness(project,operation({uniformScaling:true}),delta,budget()),/Stale or incompatible/);
  const altered=clone(candidate),building=altered.city.buildings[0];
  building.geometry.regions[0].ring[2].x+=.1;
  stampRoadGenerated(building);
  const malformed=await createSpatialDelta(project,altered,op,1,budget());
  await assert.rejects(()=>verifySpatialConcessionRoadWitness(project,op,malformed,budget()));
  assert.equal(JSON.stringify(project),before);
});

function collectConcessionProposals(iterator){
  try{for(;;){const step=iterator.next();if(step.done)return step.value;}}
  finally{iterator.return();}
}
test('detached SRE adjacent frontage and scaled packing produce locally verified parcel bundles',()=>{
  const before=JSON.stringify(project),op=operation({alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
  let actual=null,entry=null,road=null;
  for(const e of context.properties){
    if(!e.buildings.length||e.buildings.some(b=>b.mode!=='rigid'))continue;
    for(const target of listSpatialAdjacentFrontages(project,op,e.id,budget())){
      const result=collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,op,e.id,budget(),{frontageRoadId:target,scale:.8}));
      if(result.length){actual=result;entry=e;road=target;break;}
    }
    if(actual)break;
  }
  assert.ok(actual?.length,'fixture must exercise a genuine combined local proposal');
  assert.ok(actual.length<=24);
  const original=project.city.properties.find(p=>p.id===entry.id);
  for(const bundle of actual){
    assert.equal(bundle.property.id,original.id);
    assert.equal(bundle.property.frontageRoadId,road);
    assert.deepEqual(bundle.property.plotIds,original.plotIds);
    assert.deepEqual(bundle.plots.map(p=>p.id),original.plotIds);
    assert.ok(bundle.plots.every(p=>p.propertyId===original.id&&p.frontageRoadId===road));
    assert.deepEqual(bundle.buildings.map(b=>b.id).sort(),original.buildingIds.slice().sort());
    assert.ok(bundle.requiresAccessRepair);
    for(const b of bundle.buildings){
      const source=project.city.buildings.find(x=>x.id===b.id);
      assert.equal(b.frontageRoadId,road);
      const result=inspectSpatialUniformSimilarity(project,op,b.id,{...b,frontageRoadId:source.frontageRoadId},budget());
      assert.ok(Math.abs(result.factor-.8)<1e-6);
    }
  }
  const again=collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,op,entry.id,budget(),{frontageRoadId:road,scale:.8}));
  assert.deepEqual(again,actual);
  // Repeated proposal source calls must match isolated results exactly,
  // even across different scale permissions within this detached source.
  const sharedBudget=budget(),isolatedBudget=budget();
  const shared=createSpatialConcessionProposalSource(project,op,sharedBudget);
  for(const scale of [.8,1]){
    assert.deepEqual(shared.frontages(entry.id),listSpatialAdjacentFrontages(project,op,entry.id,isolatedBudget));
    const reused=collectConcessionProposals(shared.proposals(entry.id,{frontageRoadId:road,scale}));
    const isolated=collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,op,entry.id,isolatedBudget,{frontageRoadId:road,scale}));
    assert.deepEqual(reused,isolated);
    if(scale===.8)assert.deepEqual(reused,actual);
  }
  assert.ok(sharedBudget.snapshot().work<isolatedBudget.snapshot().work,'shared source must reduce repeated index work');
  assert.throws(()=>collectConcessionProposals(shared.proposals(entry.id,{frontageRoadId:road,scale:.7})),/Unauthorized scaling/);
  assert.throws(()=>collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,operation({uniformScaling:true,maxLinearReduction:.2}),entry.id,budget(),{frontageRoadId:road,scale:.8})),/Unauthorized alternative frontage/);
  assert.throws(()=>collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,operation({alternativeFrontage:true}),entry.id,budget(),{frontageRoadId:road,scale:.8})),/Unauthorized scaling/);
  assert.throws(()=>collectConcessionProposals(iterateSpatialConcessionParcelProposals(project,op,entry.id,budget(),{frontageRoadId:road,scale:.7})),/Unauthorized scaling/);
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_CONCESSION_LOCAL_PROPOSALS '+JSON.stringify({propertyId:entry.id,road,scale:.8,count:actual.length}));
});

test('detached cooperative concession transport compression diagnostic',{timeout:300000},async()=>{
  // Research geometry only, not hardcoded answers or witness sets. Report
  // actual recovery rather than asserting an unqualified success rate.
  const offset0={x:-3.005274072121821,y:-37.39896113564458},roadIds=['RD-0184','RD-0186'];
  let exercised=0;const successful=[];
  for(const irregularProperties of [false,true]){
    const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    const before=JSON.stringify(source);
    for(const scaleOffset of [.25,.5]){
      const op=normalizeSpatialRoadGroup(source,1,roadIds,{x:offset0.x*scaleOffset,y:offset0.y*scaleOffset},
        {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
      const shared=budget();
      let result,exhausted=null;
      try{result=await searchSpatialConcessionRoadGroup(source,op,shared,{scale:.8});}
      catch(error){if(error.name!=='LareBudgetExceeded'&&error.constructor.name!=='LareBudgetExceeded')throw error;exhausted=error.resource;}
      const stats=shared.snapshot();
      assert.ok(stats.work<=8000000&&stats.expansions<=32768);
      if(result?.status==='verified-witness'){
        const actual=await verifySpatialConcessionRoadWitness(source,op,result.delta,budget());
        assert.deepEqual(inspectSpatialConcessionLedger(source,op,actual,budget()),result.ledger);
        assert.deepEqual(actual.identityAllocation,source.identityAllocation);
        assert.equal(Object.hasOwn(result,'candidateProject'),false);
        assert.ok(result.ledger.frontageSwitches.length&&result.ledger.scaledBuildings.length);
        assert.deepEqual(result.delta.retired,[]);assert.deepEqual(result.delta.added,[]);
        for(const key of ['properties','plots','buildings','roads','nodes','blocks'])
          assert.deepEqual(actual.city[key].map(r=>r.id),source.city[key].map(r=>r.id));
        if(!irregularProperties&&scaleOffset===.25){
          // A3: genuine combined witness, not merely a synthetic ledger.
          const originalDelta=JSON.stringify(result.delta),originalCandidate=JSON.stringify(actual);
          const replay=await verifySpatialConcessionRoadWitness(source,op,result.delta,budget());
          assert.deepEqual(replay,actual);
          assert.notEqual(replay,actual);
          const rerun=await searchSpatialConcessionRoadGroup(source,op,budget(),{scale:.8});
          assert.equal(rerun.status,'verified-witness');
          assert.deepEqual(rerun.delta,result.delta);assert.deepEqual(rerun.ledger,result.ledger);
          const intent=permissions=>normalizeSpatialRoadGroup(source,1,roadIds,op.geometry.offset,permissions);
          for(const policy of [{alternativeFrontage:true},{uniformScaling:true,maxLinearReduction:.2},
            {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.05}]){
            const denied=intent(policy);
            await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,denied,result.delta,budget()),/Stale or incompatible/);
            // A freshly rebound transport must still fail the domain gate.
            const rebound=await createSpatialDelta(source,actual,denied,1,budget());
            await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,denied,rebound,budget()));
          }
          const staleSource=clone(source);
          const changed=staleSource.city.buildings.find(b=>b.id===result.ledger.scaledBuildings[0].buildingId);
          delete changed.roadProvenance;
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(staleSource,op,result.delta,budget()),/Stale or incompatible/);
          const freshlyBound=await createSpatialDelta(staleSource,actual,op,1,budget());
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(staleSource,op,freshlyBound,budget()));
          assert.equal(changed.roadProvenance,undefined);
          const staleRevision=normalizeSpatialRoadGroup(source,2,roadIds,op.geometry.offset,op.permissions);
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,staleRevision,result.delta,budget()),/Stale or incompatible/);
          const alteredOffset=normalizeSpatialRoadGroup(source,1,roadIds,
            {x:op.geometry.offset.x+.01,y:op.geometry.offset.y},op.permissions);
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,alteredOffset,result.delta,budget()));
          for(const key of ['acceptedFingerprint','intentFingerprint','policyFingerprint','candidateFingerprint']){
            const forged=clone(result.delta);forged[key]='0'.repeat(64);
            await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,op,forged,budget()));
          }
          const duplicate=clone(result.delta);duplicate.modified.push(duplicate.modified[0]);
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,op,duplicate,budget()),/Duplicate/);
          const omitted=clone(result.delta);omitted.modified.pop();
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,op,omitted,budget()),/fingerprint/);
          const tiny=createSpatialPreservationBudget({work:1,stateExpansions:1});
          await assert.rejects(()=>verifySpatialConcessionRoadWitness(source,op,result.delta,tiny),
            error=>error.name==='LareBudgetExceeded');
          assert.equal(JSON.stringify(result.delta),originalDelta);
          assert.equal(JSON.stringify(actual),originalCandidate);
          assert.equal(JSON.stringify(source),before);
          console.log('SRE_CONCESSION_TRANSPORT_CONTRACT '+JSON.stringify({replay:true,deterministic:true,
            deniedPolicies:3,staleRevision:true,alteredIntent:true,forgedDigests:4,duplicate:true,omitted:true,
            exhausted:true,identityUnchanged:true}));
        }
        successful.push([irregularProperties,scaleOffset]);
      }else if(result){assert.equal(result.status,'refused');assert.equal(result.delta,null);}
      exercised+=Number(Boolean(result?.stages?.['concession-inventory']));
      assert.equal(JSON.stringify(source),before);
      console.log('SRE_CONCESSION_COOPERATIVE '+JSON.stringify({irregularProperties,scaleOffset,status:result?.status??'exhausted',exhausted,stats,
        stages:result?.stages??{},issues:result?.issues??[],ledger:result?.ledger??null}));
    }
  }
  assert.ok(exercised,'detached cooperative concession inventory was not exercised');
  // Index reuse qualified the fourth previously exhausted case in exact-head CI.
  // Require every established witness, including irregular +.25, to survive.
  assert.deepEqual(successful,[[false,.25],[false,.5],[true,.25],[true,.5]],'retain all four independently verified combined witnesses');
});

// Independent qualification trials, NOT retries that reset a live operation's
// budget. Compare actual cost ledgers for each authorized tier. No production
// ranking rule is selected by this diagnostic, and no success is presumed.
test('detached concession tier comparison measures least-disruptive available recovery',{timeout:600000},async()=>{
  const offset0={x:-3.005274072121821,y:-37.39896113564458},roadIds=['RD-0184','RD-0186'];
  for(const irregularProperties of [false,true]){
    const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    const before=JSON.stringify(source);
    for(const scaleOffset of [.25,.5]){
      const rows=[];
      for(const scale of [1,.95,.9]){
        const permissions=scale===1?{alternativeFrontage:true}:
          {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:scale===.95?.05:.1};
        const op=normalizeSpatialRoadGroup(source,1,roadIds,{x:offset0.x*scaleOffset,y:offset0.y*scaleOffset},permissions);
        const shared=budget();
        let result,exhausted=null;
        try{result=await searchSpatialConcessionRoadGroup(source,op,shared,{scale});}
        catch(error){if(error.constructor.name!=='LareBudgetExceeded')throw error;exhausted=error.resource;}
        const stats=shared.snapshot();
        assert.ok(stats.work<=8000000&&stats.expansions<=32768);
        let metrics=null;
        if(result?.status==='verified-witness'){
          const actual=await verifySpatialConcessionRoadWitness(source,op,result.delta,budget());
          const ledger=inspectSpatialConcessionLedger(source,op,actual,budget());
          assert.deepEqual(ledger,result.ledger);
          assert.deepEqual(actual.identityAllocation,source.identityAllocation);
          for(const key of ['properties','plots','buildings'])
            assert.deepEqual(actual.city[key].map(x=>x.id),source.city[key].map(x=>x.id));
          if(scale===1)assert.equal(ledger.scaledBuildings.length,0);
          else assert.ok(ledger.scaledBuildings.every(b=>Math.abs(b.factor-scale)<1e-6));
          const prior=new Map(source.city.buildings.map(b=>[b.id,b]));
          const priorProps=new Map(source.city.properties.map(p=>[p.id,p]));
          const priorPlots=new Map(source.city.plots.map(p=>[p.id,p]));
          const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
          const ringCost=(a,b)=>a.reduce((n,p,i)=>n+dist(p,b[i]),0);
          const center=b=>{const pts=b.geometry.regions.flatMap(r=>r.ring);return {
            x:pts.reduce((n,p)=>n+p.x,0)/pts.length,y:pts.reduce((n,p)=>n+p.y,0)/pts.length};};
          const moved=actual.city.buildings.filter(b=>JSON.stringify(b.geometry)!==JSON.stringify(prior.get(b.id).geometry)||
            b.orientation!==prior.get(b.id).orientation);
          metrics={frontageSwitches:ledger.frontageSwitches.length,scaledBuildings:ledger.scaledBuildings.length,
            footprintLoss:ledger.footprintLoss,movedBuildings:moved.length,
            displacement:moved.reduce((n,b)=>n+dist(center(b),center(prior.get(b.id))),0),
            rotation:moved.reduce((n,b)=>{const a=b.orientation-prior.get(b.id).orientation;return n+Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));},0),
            propertyDeformation:actual.city.properties.reduce((n,p)=>n+ringCost(priorProps.get(p.id).boundary,p.boundary),0),
            plotDeformation:actual.city.plots.reduce((n,p)=>n+ringCost(priorPlots.get(p.id).boundary,p.boundary),0),
            accessChanges:actual.city.buildings.filter(b=>JSON.stringify([b.entrance,b.accessPath])!==JSON.stringify([prior.get(b.id).entrance,prior.get(b.id).accessPath])).length};
          assert.ok(Object.values(metrics).every(n=>Number.isFinite(n)&&n>=0));
          // Independent legacy diagnostic calculation is an oracle for the
          // new common scorer, not a source of rank or permission.
          const ranked=scoreSpatialConcessions(source,op,actual,budget());
          for(const key of Object.keys(metrics))
            assert.ok(Math.abs(metrics[key]-ranked[key])<1e-6,'concession metric mismatch: '+key);
          assert.equal(ranked.maxLinearReduction,Math.max(0,...ledger.scaledBuildings.map(b=>1-b.factor)));
          metrics=ranked;
        }else if(result){assert.equal(result.status,'refused');assert.equal(result.delta,null);}
        assert.equal(JSON.stringify(source),before);
        rows.push({scale,status:result?.status??'exhausted',exhausted,stats,metrics,
          issueCodes:result?.issues.map(i=>i.code)??[],
          materializations:result?.stages['candidate-materialization']??0,
          accessChecks:result?.stages['building-access']??0,
          unions:result?.stages['block-union']??0});
      }
      // Independent trial ranking is evidence only. Each trial used its own
      // qualification budget; it cannot justify resetting a live operation.
      const verified=rows.filter(row=>row.status==='verified-witness');
      let preferred=null;
      for(const row of verified)
        if(!preferred||compareSpatialConcessionCost(row.metrics,preferred.metrics)<0)preferred=row;
      if(verified.some(row=>row.metrics.scaledBuildings===0))
        assert.equal(preferred.metrics.scaledBuildings,0);
      console.log('SRE_CONCESSION_TIER_COMPARISON '+JSON.stringify({irregularProperties,scaleOffset,rows,preferred:preferred?.scale??null}));
    }
  }
});

// The production priority is not altered. This diagnostic isolates the
// cost of the fixed-building arrangement pass at the same child/parent caps.
test('detached relaxed-only concession tier measures repeated fixed-pass overhead',{timeout:600000},async()=>{
  const offset0={x:-3.005274072121821,y:-37.39896113564458},roadIds=['RD-0184','RD-0186'];
  const cases=[{irregularProperties:false,offset:.25,scale:1},{irregularProperties:false,offset:.5,scale:1},
    ...[.25,.5].flatMap(offset=>[1,.95,.9,.8].map(scale=>({irregularProperties:true,offset,scale})))];
  let exercised=0,verifiedCount=0;
  for(const irregularProperties of [false,true]){
    const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    const before=JSON.stringify(source);
    for(const row of cases.filter(c=>c.irregularProperties===irregularProperties)){
      const {offset,scale}=row;
      const permissions=scale===1?{alternativeFrontage:true}:
        {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:scale===.95?.05:scale===.9?.1:.2};
      const op=normalizeSpatialRoadGroup(source,1,roadIds,{x:offset0.x*offset,y:offset0.y*offset},permissions);
      const shared=budget();
      let result,exhausted=null;
      try{result=await searchSpatialConcessionRoadGroup(source,op,shared,{scale,relaxedOnlyDiagnostic:true});}
      catch(error){if(error.constructor.name!=='LareBudgetExceeded')throw error;exhausted=error.resource;}
      const stats=shared.snapshot();assert.ok(stats.work<=8000000&&stats.expansions<=32768);
      if(result?.stages?.['concession-relaxed-only-diagnostic'])exercised++;
      let metrics=null;
      if(result?.status==='verified-witness')verifiedCount++;
      if(result?.status==='verified-witness'){
        const actual=await verifySpatialConcessionRoadWitness(source,op,result.delta,budget());
        const ledger=inspectSpatialConcessionLedger(source,op,actual,budget());
        assert.deepEqual(ledger,result.ledger);assert.deepEqual(actual.identityAllocation,source.identityAllocation);
        for(const k of ['properties','plots','buildings'])assert.deepEqual(actual.city[k].map(x=>x.id),source.city[k].map(x=>x.id));
        if(scale===1)assert.equal(ledger.scaledBuildings.length,0);
        else assert.ok(ledger.scaledBuildings.every(b=>Math.abs(b.factor-scale)<1e-6));
        metrics={switches:ledger.frontageSwitches.length,scaled:ledger.scaledBuildings.length,loss:ledger.footprintLoss};
      }else if(result){assert.equal(result.status,'refused');assert.equal(result.delta,null);}
      assert.equal(JSON.stringify(source),before);
      console.log('SRE_RELAXED_TIER_COMPARISON '+JSON.stringify({...row,status:result?.status??'exhausted',exhausted,stats,metrics,
        issueCodes:result?.issues.map(i=>i.code)??[],materializations:result?.stages['candidate-materialization']??0,
        accessChecks:result?.stages['building-access']??0,unions:result?.stages['block-union']??0,
        parcelInventory:result?.stages['parcel-inventory']??0}));
    }
  }
  assert.ok(exercised,'relaxed-only diagnostic must exercise its intended branch');
  assert.equal(verifiedCount,cases.length,'retain all ten independently verified relaxed-only witnesses');
});


test('detached ranked concession challenger uses one budget and retains the better verified witness',{timeout:600000},async()=>{
  const offset0={x:-3.005274072121821,y:-37.39896113564458},roadIds=['RD-0184','RD-0186'];
  let compared=0;
  for(const irregularProperties of [false,true]){
    const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    const before=JSON.stringify(source),multiplier=irregularProperties?.5:.25;
    const op=normalizeSpatialRoadGroup(source,1,roadIds,{x:offset0.x*multiplier,y:offset0.y*multiplier},
      {alternativeFrontage:true});
    const shared=budget(),result=await searchSpatialRankedConcessionRoadGroup(source,op,shared);
    assert.equal(result.status,'verified-witness');
    const {baseline,challenger,selection}=result.ranking;
    assert.equal(baseline.status,'verified-witness');assert.ok(baseline.cost);
    assert.equal(result.stats.work,shared.snapshot().work);
    assert.ok(result.stats.work<=8000000&&result.stats.expansions<=32768);
    if(challenger){
      assert.ok(challenger.stats.work>=baseline.stats.work);
      assert.ok(challenger.stats.expansions>=baseline.stats.expansions);
      if(challenger.status==='verified-witness'&&challenger.cost){
        assert.ok(challenger.rankedInventories>0);compared++;
        const better=compareSpatialConcessionCost(challenger.cost,baseline.cost)<0;
        assert.equal(selection,better?'challenger':'baseline');
      }else assert.equal(selection,'baseline');
    }else assert.equal(selection,'baseline');
    const winner=selection==='challenger'?challenger:baseline;
    // Freeze the two independently qualified improvements; a later
    // candidate may replace them only with separately reviewed evidence.
    assert.equal(selection,'challenger');
    assert.equal(winner.fingerprint,irregularProperties?
      '0d59707e544bd784e6cf67ff2577deb5aec4fee86bae3a44397122f28eccf451':
      'bf2cae8b09db08c74976fa0771df6a1464c976e7b9679abd703f3becc48a07a4');
    assert.equal(winner.cost.frontageSwitches,irregularProperties?22:23);
    assert.equal(winner.cost.scaledBuildings,0);
    assert.equal(winner.cost.footprintLoss,0);
    assert.equal(result.delta.candidateFingerprint,winner.fingerprint);
    const actual=await verifySpatialConcessionRoadWitness(source,op,result.delta,budget());
    assert.deepEqual(scoreSpatialConcessions(source,op,actual,budget()),winner.cost);
    assert.deepEqual(inspectSpatialConcessionLedger(source,op,actual,budget()),result.ledger);
    assert.equal(JSON.stringify(source),before);
    console.log('SRE_CONCESSION_RANKED_CHALLENGER '+JSON.stringify({irregularProperties,multiplier,
      ranking:result.ranking,stats:result.stats}));
  }
  assert.ok(compared>0,'at least one challenger must complete full independent comparison');
});


test('detached destruction eligibility uses actual affected scope and protects property groups',()=>{
  const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const before=JSON.stringify(source),roads=['RD-0184','RD-0186'],
    move={x:-3.005274072121821*.25,y:-37.39896113564458*.25};
  const op=normalizeSpatialRoadGroup(source,1,roads,move,{destruction:true});
  const denied=normalizeSpatialRoadGroup(source,1,roads,move,{});
  const none=discoverSpatialRoadRetirementEligibility(source,denied,budget());
  assert.deepEqual(none.buildingRefs,[]);assert.deepEqual(none.propertyGroups,[]);
  const result=discoverSpatialRoadRetirementEligibility(source,op,budget());
  assert.ok(result.buildingRefs.length>0);assert.ok(result.propertyGroups.length>0);
  assert.deepEqual(result,discoverSpatialRoadRetirementEligibility(source,op,budget()));
  assert.ok(Object.isFrozen(result.propertyGroups));
  const groups=result.propertyGroups.filter(g=>g.refs.some(r=>r.collection==='buildings'));
  assert.ok(groups.length);
  const group=groups[0],building=group.refs.find(r=>r.collection==='buildings');
  const selected=result.buildingRefs.map(r=>r.id);
  for(const g of result.propertyGroups){
    const p=source.city.properties.find(r=>r.id===g.propertyId);
    assert.deepEqual(g.refs.filter(r=>r.collection==='plots').map(r=>r.id),p.plotIds);
    assert.deepEqual(g.refs.filter(r=>r.collection==='buildings').map(r=>r.id).sort(),p.buildingIds.slice().sort());
    assert.ok(g.refs.filter(r=>r.collection==='buildings').every(r=>selected.includes(r.id)));
    assert.ok(g.refs.every(r=>['properties','plots','buildings'].includes(r.collection)));
  }
  for(const mutate of [
    s=>{delete s.city.buildings.find(r=>r.id===building.id).roadProvenance;},
    s=>{s.city.buildings.find(r=>r.id===building.id).customName='Protected';},
    s=>{s.city.buildings.find(r=>r.id===building.id).unsupportedExtension={value:1};
      stampRoadGenerated(s.city.buildings.find(r=>r.id===building.id));},
    s=>{s.opaqueReference={target:building.id};}
  ]){
    const altered=clone(source);mutate(altered);const unchanged=JSON.stringify(altered);
    const protectedResult=discoverSpatialRoadRetirementEligibility(altered,op,budget());
    assert.ok(!protectedResult.buildingRefs.some(r=>r.id===building.id));
    assert.ok(!protectedResult.propertyGroups.some(g=>g.propertyId===group.propertyId));
    assert.equal(JSON.stringify(altered),unchanged);
  }
  for(const member of group.refs.filter(r=>r.collection!=='buildings')){
    const altered=clone(source);altered.opaqueReference={target:member.id};
    const protectedResult=discoverSpatialRoadRetirementEligibility(altered,op,budget());
    assert.ok(!protectedResult.propertyGroups.some(g=>g.propertyId===group.propertyId));
  }
  assert.throws(()=>discoverSpatialRoadRetirementEligibility(source,{...op,permissions:{destruction:true,regeneration:true}},budget()),/not integrated/);
  assert.throws(()=>discoverSpatialRoadRetirementEligibility(source,op,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_RETIREMENT_ELIGIBILITY '+JSON.stringify({buildings:result.buildingRefs.length,groups:result.propertyGroups.length}));
});


test('detached building retirement search recovers a real historical witness with one shared budget',{timeout:300000},async()=>{
  const source=createProject({seed:'lare-linear-2',morphology:'linear',size:'small',irregularProperties:true});
  const before=JSON.stringify(source),ids=['RD-0174','RD-0252'],offset={x:4,y:3};
  const op=normalizeSpatialRoadGroup(source,5,ids,offset,{destruction:true});
  const result=await searchSpatialBuildingRetirementRoadGroup(source,op,createSpatialDestructionBudget());
  assert.equal(result.status,'verified-witness',JSON.stringify(result.attempts));
  assert.deepEqual(result.delta.retired,[{collection:'buildings',id:'BLD-00153'}]);
  assert.deepEqual(result.delta.added,[]);
  assert.ok(result.attempts.length<=16);
  assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
  const actual=await verifySpatialBuildingRetirementWitness(source,op,result.delta,createSpatialDestructionBudget());
  assert.deepEqual(actual.identityAllocation,source.identityAllocation);
  assert.equal(result.ledger.demolishedFootprint,source.city.buildings.find(b=>b.id==='BLD-00153').area);
  assert.equal(Object.hasOwn(result,'candidateProject'),false);
  for(const collection of ['properties','plots','roads','nodes','blocks'])
    assert.deepEqual(actual.city[collection].map(r=>r.id),source.city[collection].map(r=>r.id));
  assert.deepEqual(actual.city.buildings.map(r=>r.id),source.city.buildings.filter(r=>r.id!=='BLD-00153').map(r=>r.id));
  const repeat=await searchSpatialBuildingRetirementRoadGroup(source,op,createSpatialDestructionBudget());
  assert.deepEqual(repeat.delta,result.delta);assert.deepEqual(repeat.ledger,result.ledger);
  await assert.rejects(()=>verifySpatialBuildingRetirementWitness(source,{...op,permissions:{}},result.delta,budget()),/permission/);
  await assert.rejects(()=>verifySpatialBuildingRetirementWitness(source,{...op,revision:6},result.delta,budget()),/Stale/);
  const forged=clone(result.delta);forged.retired.push(forged.retired[0]);
  await assert.rejects(()=>verifySpatialBuildingRetirementWitness(source,op,forged,budget()),/Duplicate/);
  const protectedSource=clone(source);protectedSource.opaqueReference={target:'BLD-00153'};
  const protectedCandidate=clone(actual);protectedCandidate.opaqueReference=clone(protectedSource.opaqueReference);
  const rebound=await createSpatialDelta(protectedSource,protectedCandidate,op,1,budget());
  await assert.rejects(()=>verifySpatialBuildingRetirementWitness(protectedSource,op,rebound,createSpatialDestructionBudget()),/protected|eligible/);
  const tiny=await searchSpatialBuildingRetirementRoadGroup(source,op,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);assert.equal(tiny.exhausted,'work');
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_BUILDING_RETIREMENT '+JSON.stringify({retired:result.ledger.retired,footprint:result.ledger.demolishedFootprint,attempts:result.attempts,stats:result.stats}));
});


test('detached whole-property retirement preserves exact group membership and validates survivors',{timeout:300000},async()=>{
  const source=createProject({seed:'lare-linear-2',morphology:'linear',size:'small',irregularProperties:true});
  const before=JSON.stringify(source),ids=['RD-0174','RD-0252'],offset={x:4,y:3};
  const op=normalizeSpatialRoadGroup(source,5,ids,offset,{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.1});
  const eligibility=discoverSpatialRoadRetirementEligibility(source,op,budget());
  assert.ok(eligibility.propertyGroups.length);
  const shared=createSpatialDestructionBudget();
  const result=await searchSpatialPropertyRetirementRoadGroup(source,op,shared);
  assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
  assert.ok(result.attempts.length<=16);
  assert.equal(result.status,'verified-witness',JSON.stringify(result.attempts));
  const group=eligibility.propertyGroups.find(g=>result.delta.retired.some(r=>r.collection==='properties'&&r.id===g.propertyId));
  assert.ok(group);
  const keys=refs=>refs.map(r=>JSON.stringify([r.collection,r.id])).sort();
  assert.deepEqual(keys(result.delta.retired),keys(group.refs));
  assert.deepEqual(result.delta.added,[]);
  const actual=await verifySpatialRetirementWitness(source,op,result.delta,createSpatialDestructionBudget());
  assert.deepEqual(actual.identityAllocation,source.identityAllocation);
  for(const collection of ['properties','plots','buildings','roads','nodes','blocks']){
    const retired=new Set(group.refs.filter(r=>r.collection===collection).map(r=>r.id));
    assert.deepEqual(actual.city[collection].map(r=>r.id),source.city[collection].filter(r=>!retired.has(r.id)).map(r=>r.id));
  }
  assert.ok(result.ledger.concessions);
  const omitted=clone(result.delta);omitted.retired.pop();
  await assert.rejects(()=>verifySpatialRetirementWitness(source,op,omitted,budget()));
  const protectedSource=clone(source);protectedSource.opaqueReference={target:group.propertyId};
  const protectedCandidate=clone(actual);protectedCandidate.opaqueReference=clone(protectedSource.opaqueReference);
  const rebound=await createSpatialDelta(protectedSource,protectedCandidate,op,1,budget());
  await assert.rejects(()=>verifySpatialRetirementWitness(protectedSource,op,rebound,createSpatialDestructionBudget()),/protected|ineligible/i);
  await assert.rejects(()=>verifySpatialRetirementWitness(source,{...op,permissions:{}},result.delta,budget()),/permission/);
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_PROPERTY_RETIREMENT '+JSON.stringify({group:group.propertyId,ledger:result.ledger,attempts:result.attempts,stats:result.stats}));
  const optimized=await restoreSpatialRoadRetirements(source,op,result.delta,shared);
  assert.equal(optimized.status,'verified-witness');
  assert.deepEqual(optimized.delta.retired,[{collection:'buildings',id:'BLD-00153'}]);
  assert.deepEqual(keys(optimized.restored),keys(group.refs.filter(r=>r.collection!=='buildings')));
  assert.ok(optimized.attempts.some(r=>r.tier==='property-shell'&&r.status==='verified-witness'));
  const restoredCandidate=await verifySpatialRetirementWitness(source,op,optimized.delta,createSpatialDestructionBudget());
  assert.deepEqual(restoredCandidate.identityAllocation,source.identityAllocation);
  assert.deepEqual(restoredCandidate.city.properties.map(p=>p.id),source.city.properties.map(p=>p.id));
  assert.deepEqual(restoredCandidate.city.plots.map(p=>p.id),source.city.plots.map(p=>p.id));
  assert.equal(JSON.stringify(source),before);
  const tiny=await restoreSpatialRoadRetirements(source,op,result.delta,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);
  const forged=clone(result.delta);forged.retired.pop();
  await assert.rejects(()=>restoreSpatialRoadRetirements(source,op,forged,createSpatialDestructionBudget()));
  console.log('SRE_SHELL_RESTORATION '+JSON.stringify({before:result.delta.retired,after:optimized.delta.retired,restored:optimized.restored,attempts:optimized.attempts,stats:optimized.stats}));
});


test('detached grouped retirement searches real compression without preselected witness sets',{timeout:300000},async()=>{
  const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const before=JSON.stringify(source),ids=['RD-0184','RD-0186'];
  const offset={x:-3.005274072121821*-.5,y:-37.39896113564458*-.5};
  const op=normalizeSpatialRoadGroup(source,1,ids,offset,{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
  const eligibility=discoverSpatialRoadRetirementEligibility(source,op,budget());
  const shared=createSpatialDestructionBudget();
  const result=await searchSpatialGroupedRetirementRoadGroup(source,op,shared);
  assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
  assert.ok(result.attempts.length<=2);
  assert.equal(result.status,'verified-witness',JSON.stringify(result.attempts));
  const retiredGroups=result.delta.retired.filter(r=>r.collection==='properties');
  assert.ok(retiredGroups.length>1);
  const keys=refs=>refs.map(r=>JSON.stringify([r.collection,r.id])).sort();
  const expected=eligibility.propertyGroups.filter(g=>retiredGroups.some(r=>r.id===g.propertyId)).flatMap(g=>g.refs);
  assert.deepEqual(keys(result.delta.retired),keys(expected));assert.deepEqual(result.delta.added,[]);
  const actual=await verifySpatialRetirementWitness(source,op,result.delta,createSpatialDestructionBudget());
  assert.deepEqual(actual.identityAllocation,source.identityAllocation);
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_GROUPED_RETIREMENT '+JSON.stringify({ledger:result.ledger,attempts:result.attempts,stats:result.stats}));
  const optimized=await restoreSpatialRoadRetirements(source,op,result.delta,shared);
  assert.equal(optimized.status,'verified-witness');
  const retired=new Set(keys(optimized.delta.retired)),original=new Set(keys(result.delta.retired));
  assert.ok([...retired].every(key=>original.has(key)));
  assert.deepEqual(keys(optimized.restored),[...original].filter(key=>!retired.has(key)).sort());
  assert.deepEqual(optimized.delta.added,[]);
  assert.ok(optimized.attempts.length<=14);
  assert.ok(optimized.stats.work<=32000000&&optimized.stats.expansions<=131072);
  const restoredCandidate=await verifySpatialRetirementWitness(source,op,optimized.delta,createSpatialDestructionBudget());
  assert.deepEqual(restoredCandidate.identityAllocation,source.identityAllocation);
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_GROUP_RESTORATION '+JSON.stringify({before:result.delta.retired,after:optimized.delta.retired,restored:optimized.restored,attempts:optimized.attempts,stats:optimized.stats,exhausted:optimized.exhausted}));
});

test('detached mixed retirement and actual concessions independently replay under separate permissions',{timeout:300000},async()=>{
  const source=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const before=JSON.stringify(source),ids=['RD-0184','RD-0186'],
    offset={x:-3.005274072121821*.25,y:-37.39896113564458*.25};
  const op=normalizeSpatialRoadGroup(source,1,ids,offset,{destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
  const eligible=discoverSpatialRoadRetirementEligibility(source,op,budget());
  const shared=createSpatialDestructionBudget();
  let result=null;
  // Small deterministic diagnostic sample; no prescribed witness IDs.
  for(const group of eligible.propertyGroups.filter(g=>g.refs.some(r=>r.collection==='buildings')).slice(0,3)){
    const trial=await searchSpatialRetirementSubsetRoadGroup(source,op,group.refs,shared,{diagnosticScale:.8});
    if(trial.status==='verified-witness'&&trial.ledger.concessions.frontageSwitches.length&&trial.ledger.concessions.scaledBuildings.length){result=trial;break;}
  }
  assert.ok(result,'must demonstrate actual retirement, frontage and scaling together');
  assert.ok(result.delta.retired.length&&result.ledger.concessions.footprintLoss>0);
  assert.deepEqual(result.delta.added,[]);
  const actual=await verifySpatialRetirementWitness(source,op,result.delta,createSpatialDestructionBudget());
  assert.deepEqual(actual.identityAllocation,source.identityAllocation);
  for(const permissions of [{destruction:true,alternativeFrontage:true},{destruction:true,uniformScaling:true,maxLinearReduction:.2},
    {destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.05}]){
    const denied=normalizeSpatialRoadGroup(source,1,ids,offset,permissions);
    const rebound=await createSpatialDelta(source,actual,denied,1,budget());
    await assert.rejects(()=>verifySpatialRetirementWitness(source,denied,rebound,createSpatialDestructionBudget()));
  }
  assert.equal(JSON.stringify(source),before);
  console.log('SRE_MIXED_RETIREMENT_CONCESSIONS '+JSON.stringify({ledger:result.ledger,stats:shared.snapshot()}));
});


test('retirement comparison protects each identity count and ranks independently measured equal-count losses',()=>{
  const a=measureSpatialRetirementCost({retired:[{collection:'buildings',id:'B'}],demolishedFootprint:100,
    concessions:{footprintLoss:30,frontageSwitches:[{}],scaledBuildings:[{}]}},budget());
  assert.equal(improvesSpatialRetirementCost({...a,buildings:0,scaleLoss:200,totalFootprintLoss:300},a),true);
  assert.equal(improvesSpatialRetirementCost({...a,properties:1,buildings:0},a),false);
  assert.equal(improvesSpatialRetirementCost({...a,demolishedFootprint:99,totalFootprintLoss:129},a),true);
  assert.equal(improvesSpatialRetirementCost({...a,frontageSwitches:0},a),true);
  assert.equal(improvesSpatialRetirementCost(a,a),false);
  assert.throws(()=>improvesSpatialRetirementCost({...a,totalFootprintLoss:NaN},a));
});

test('detached individual restoration and bounded exchange optimization retain verified incumbent',{timeout:300000},async()=>{
  const source=createProject({seed:'lare-linear-2',morphology:'linear',size:'small',irregularProperties:true});
  const before=JSON.stringify(source),ids=['RD-0174','RD-0252'],offset={x:4,y:3};
  const op=normalizeSpatialRoadGroup(source,5,ids,offset,{destruction:true});
  const shared=createSpatialDestructionBudget(),eligible=discoverSpatialRoadRetirementEligibility(source,op,budget());
  const known=eligible.buildingRefs.find(r=>r.id==='BLD-00153');
  assert.ok(known);
  let seed=null;
  for(const extra of eligible.buildingRefs.filter(r=>r.id!==known.id).slice(0,3)){
    const result=await searchSpatialRetirementSubsetRoadGroup(source,op,[known,extra],shared);
    if(result.status==='verified-witness'){seed=result;break;}
  }
  assert.ok(seed,'must construct a verified redundant building-retirement seed');
  const optimized=await optimizeSpatialRoadRetirements(source,op,seed.delta,shared);
  assert.equal(optimized.status,'verified-witness');
  assert.equal(optimized.cost.properties,0);assert.equal(optimized.cost.plots,0);
  assert.equal(optimized.cost.buildings,1);
  assert.ok(optimized.attempts.some(r=>r.tier==='individual-building'&&r.selected));
  assert.ok(improvesSpatialRetirementCost(optimized.cost,optimized.initialCost));
  assert.deepEqual(optimized.delta.added,[]);
  assert.ok(optimized.attempts.length<=8);
  assert.ok(optimized.stats.work<=32000000&&optimized.stats.expansions<=131072);
  const actual=await verifySpatialRetirementWitness(source,op,optimized.delta,createSpatialDestructionBudget());
  assert.deepEqual(actual.identityAllocation,source.identityAllocation);
  assert.equal(JSON.stringify(source),before);
  const tiny=await optimizeSpatialRoadRetirements(source,op,seed.delta,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);
  console.log('SRE_BUILDING_RESTORATION_OPTIMIZATION '+JSON.stringify({before:optimized.initialCost,after:optimized.cost,
    restored:optimized.restored,newlyRetired:optimized.newlyRetired,attempts:optimized.attempts,stats:optimized.stats}));
});
