import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { normalizeSpatialRoadGroup, searchSpatialPreservingRoadGroup, searchSpatialConcessionRoadGroup, verifySpatialConcessionRoadWitness, verifySpatialStrictRoadWitness } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { listSpatialAdjacentFrontages, inspectSpatialUniformSimilarity, inspectSpatialConcessionLedger, verifySpatialFrontageAlignment, iterateSpatialConcessionParcelProposals } from '../src/core/spatial-recovery-concessions.js';
import { createSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { stampRoadGenerated } from '../src/core/road-provenance.js';
const budget=()=>createSpatialPreservationBudget();
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
const operation=permissions=>normalizeSpatialRoadGroup(project,1,ids,offset,permissions);
const draft=prepareRoadGroupIntentB1(project,ids,offset);
const context=createLareContext(project,draft,new Map(),budget());
const clone=x=>JSON.parse(JSON.stringify(x));
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
        successful.push([irregularProperties,scaleOffset]);
      }else if(result){assert.equal(result.status,'refused');assert.equal(result.delta,null);}
      exercised+=Number(Boolean(result?.stages?.['concession-inventory']));
      assert.equal(JSON.stringify(source),before);
      console.log('SRE_CONCESSION_COOPERATIVE '+JSON.stringify({irregularProperties,scaleOffset,status:result?.status??'exhausted',exhausted,stats,
        stages:result?.stages??{},issues:result?.issues??[],ledger:result?.ledger??null}));
    }
  }
  assert.ok(exercised,'detached cooperative concession inventory was not exercised');
  assert.deepEqual(successful,[[false,.25],[false,.5],[true,.5]],'retain the three established combined witnesses');
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
        }else if(result){assert.equal(result.status,'refused');assert.equal(result.delta,null);}
        assert.equal(JSON.stringify(source),before);
        rows.push({scale,status:result?.status??'exhausted',exhausted,stats,metrics,
          issueCodes:result?.issues.map(i=>i.code)??[],
          materializations:result?.stages['candidate-materialization']??0,
          accessChecks:result?.stages['building-access']??0,
          unions:result?.stages['block-union']??0});
      }
      console.log('SRE_CONCESSION_TIER_COMPARISON '+JSON.stringify({irregularProperties,scaleOffset,rows}));
    }
  }
});

// The production priority is not altered. This diagnostic isolates the
// cost of the fixed-building arrangement pass at the same child/parent caps.
test('detached relaxed-only concession tier measures repeated fixed-pass overhead',{timeout:600000},async()=>{
  const offset0={x:-3.005274072121821,y:-37.39896113564458},roadIds=['RD-0184','RD-0186'];
  const cases=[{irregularProperties:false,offset:.25,scale:1},{irregularProperties:false,offset:.5,scale:1},
    ...[.25,.5].flatMap(offset=>[1,.95,.9,.8].map(scale=>({irregularProperties:true,offset,scale})))];
  let exercised=0;
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
});
