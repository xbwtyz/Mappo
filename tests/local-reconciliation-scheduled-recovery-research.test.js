// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retirementCounts as count,recoveryCost,improves,countNonincrease} from './helpers/spatial-recovery-cost.mjs';
import {coordinateRecovery} from './helpers/spatial-recovery-coordinator.mjs';
import {regenerateVacancies,verifyRegeneration} from './helpers/spatial-recovery-regeneration.mjs';
import {createPackingStrategy,createFrontageStrategy,createTargetedScaleStrategy} from './helpers/spatial-recovery-research.mjs';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {createLareContext} from '../src/core/reconciliation-context.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {reconcileRoadWorkspace} from '../src/editor/road-workspace.js';
import {AcceptedEditHistoryD01} from '../src/core/accepted-edit-history-d01.js';
import {classifyRoadProvenance,stampRoadGenerated} from '../src/core/road-provenance.js';
import {polygonSignedArea} from '../src/core/geometry.js';
import {riBudget,riReporter} from '../src/core/road-impact-model.js';
import {inspectRoadDependencies,inspectRoadContextReferences} from '../src/core/road-impact-dependencies.js';

const roadIds=['RD-0184','RD-0186'],baseOffset={x:-3.005274072121821,y:-37.39896113564458};
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const sorted=xs=>[...xs].sort();
const unique=xs=>[...new Set(xs)];
const inventory=(project,draft)=>{
  const context=createLareContext(project,draft,new Map(),createLareBudget());
  const city=project.city,props=new Map(city.properties.map(p=>[p.id,p])),plots=new Map(city.plots.map(p=>[p.id,p]));
  const buildings=new Map(city.buildings.map(b=>[b.id,b]));
  const eligible=new Map();
  for(const e of context.properties){
    const p=props.get(e.id),ownPlots=p.plotIds.map(id=>plots.get(id));
    if(e.policy.mode!=='adaptive'||e.policy.provenance!=='generated'||p.buildingCompounds?.length||
      classifyRoadProvenance(p,ownPlots)!=='generated'||e.buildings.some(b=>b.mode!=='rigid'||b.provenance!=='generated'))continue;
    if(p.buildingIds.some(id=>classifyRoadProvenance(buildings.get(id))!=='generated'))continue;
    eligible.set(p.id,{id:p.id,block:p.blockId,plots:p.plotIds.slice(),buildings:p.buildingIds.slice(),area:p.area,
      footprint:p.buildingIds.reduce((n,id)=>n+buildings.get(id).area,0)});
  }
  return eligible;
};
const removedSets=(eligible,ids)=>{
  assert.equal(unique(ids).length,ids.length,'Duplicate retirement');
  const rows=ids.map(id=>{assert.ok(eligible.has(id),'Protected or out-of-scope parcel: '+id);return eligible.get(id);});
  return {properties:sorted(ids),plots:sorted(rows.flatMap(r=>r.plots)),buildings:sorted(rows.flatMap(r=>r.buildings))};
};
// All surviving records and project metadata are checked for external
// references, including embedded generator snapshots. Fail closed on any
// exact retired ID token inside strings; never dissolve other dependencies.
function externalReference(value,retired){
  if(typeof value==='string'){
    for(const id of retired)if(value.includes(id))return id;
  }else if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(retired.has(k))return k;
      const found=externalReference(v,retired);if(found)return found;
    }
  }
  return null;
}
function reduce(project,sets){
  const next=structuredClone(project),all=new Set(Object.values(sets).flat());
  for(const key of ['properties','plots','buildings']){
    const remove=new Set(sets[key]);
    next.city[key]=next.city[key].filter(row=>!remove.has(row.id));
    assert.equal(project.city[key].length-next.city[key].length,remove.size);
  }
  // A retained generated parcel may lose an explicitly reviewed child.
  // Change only the reciprocal membership and derived provenance snapshot.
  const removedBuildings=new Set(sets.buildings);
  const plots=new Map(next.city.plots.map(p=>[p.id,p]));
  for(const p of next.city.properties){
    const remaining=p.buildingIds.filter(id=>!removedBuildings.has(id));
    if(remaining.length!==p.buildingIds.length){
      assert.equal(classifyRoadProvenance(p,p.plotIds.map(id=>plots.get(id))),'generated');
      p.buildingIds=remaining;
      stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
    }
  }
  const ref=externalReference(next,all);
  if(ref)throw Error('Surviving reference to retired record: '+ref);
  const affected=new Set(project.city.properties.filter(p=>sets.properties.includes(p.id)).map(p=>p.blockId));
  const areas=new Map();
  for(const p of next.city.properties)areas.set(p.blockId,(areas.get(p.blockId)??0)+p.area);
  for(const o of next.city.openSpaces)if(affected.has(o.blockId)){
    o.area=Math.max(0,next.city.blocks.find(b=>b.id===o.blockId).area-(areas.get(o.blockId)??0));
  }
  validateStoredProject(next);
  return next;
}
function verifyOriginal(project,candidate,draft,reviewed,strategy){
  // Recompute the entire removal set from the original and final inventories;
  // no trust in the candidate solver's retirement ledger.
  const missing={};
  for(const key of ['properties','plots','buildings']){
    const now=new Set(candidate.city[key].map(r=>r.id));
    missing[key]=sorted(project.city[key].filter(r=>!now.has(r.id)).map(r=>r.id));
    assert.deepEqual(missing[key],reviewed[key],'Unreviewed retirement');
    assert.equal(candidate.city[key].length,project.city[key].length-missing[key].length);
  }
  const eligible=inventory(project,draft);
  const whole=removedSets(eligible,missing.properties);
  assert.deepEqual(whole.plots,missing.plots,'Plot retirement requires complete parcel retirement');
  const allowed=new Set([...eligible.values()].flatMap(p=>p.buildings));
  const removed=new Set(missing.buildings);
  assert.ok(whole.buildings.every(id=>removed.has(id)),'Retired parcel has surviving child');
  assert.ok(missing.buildings.every(id=>allowed.has(id)),'Unauthorized individual building removal');
  const reduced=reduce(project,missing);
  const reducedDraft=prepareRoadGroupIntentB1(reduced,roadIds,draft.offset);
  assert.deepEqual(reducedDraft.proposedNodes,draft.proposedNodes,'Different final road target');
  const violation=strategy.verify(reduced,candidate,reducedDraft,new Map(),createLareBudget());
  assert.equal(violation,null,JSON.stringify(violation));
  const oldProps=new Map(reduced.city.properties.map(p=>[p.id,p]));
  const switched=candidate.city.properties.filter(p=>p.frontageRoadId!==oldProps.get(p.id).frontageRoadId);
  const oldBuildings=new Map(reduced.city.buildings.map(b=>[b.id,b]));
  const switchedIds=new Set(switched.map(p=>p.id)),scaled=[];
  const edge=r=>Math.hypot(r[0].x-r[1].x,r[0].y-r[1].y);
  for(const b of candidate.city.buildings){
    const a=oldBuildings.get(b.id),factor=edge(b.geometry.regions[0].ring)/edge(a.geometry.regions[0].ring);
    assert.ok(factor>=(strategy.minScale??1)-1e-6&&factor<=1+1e-6,'Scale outside capability');
    if(factor<1-1e-6){
      assert.ok(strategy.minScale&&switchedIds.has(b.propertyId),'Scaling outside switched frontage');
      scaled.push({id:b.id,factor,areaLoss:a.area-b.area});
    }
  }
  const strict=verifyLareGroupPreservation(reduced,candidate,reducedDraft,new Map(),createLareBudget());
  assert.equal(strict?.code??null,switched.length?'group-record-change':scaled.length?'lare-rigid-preservation':null,'Strict comparison differs from authorized delta');
  if(scaled.length){
    const tampered=structuredClone(candidate);
    tampered.city.buildings.find(b=>b.id===scaled[0].id).geometry.regions[0].ring[0].x+=.2;
    assert.ok(strategy.verify(reduced,tampered,reducedDraft,new Map(),createLareBudget()),'Nonuniform distortion accepted');
  }
  if(switched.length){
    assert.ok(strategy.id==='frontage-adjacent'||strategy.minScale,'Unauthorized frontage capability');
    const tampered=structuredClone(candidate);
    tampered.city.properties.find(p=>p.id===switched[0].id).frontageRoadId='RD-NOT-A-BLOCK-EDGE';
    assert.ok(strategy.verify(reduced,tampered,reducedDraft,new Map(),createLareBudget()),'Invalid frontage accepted');
  }
  validateStoredProject(candidate);
  const context={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:createLareContext(project,draft,new Map(),createLareBudget()).blockIds,acceptedValid:true};
  const {emit,items}=riReporter(),spend=riBudget();
  inspectRoadDependencies(candidate.city,candidate.city,context,emit,spend,project.city);
  inspectRoadContextReferences(project.city,candidate.city,context,emit,spend);
  const issues=items().filter(r=>r.severity!=='info'&&r.code!=='frontage-geometry'&&!(r.kind==='plot'&&r.code==='property-containment'));
  assert.deepEqual(issues,[],'Original infrastructure/land dependency failure');
  return {switched:switched.map(p=>({id:p.id,from:oldProps.get(p.id).frontageRoadId,to:p.frontageRoadId})),scaled};
}
function verifyHistory(project,candidate,sets){
  const ws=reconcileRoadWorkspace(defaultWorkspace(project),project.city,candidate.city);
  const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,ws)));
  assert.equal(hash(reopened.project),hash(candidate));assert.equal(hash(reopened.workspace),hash(ws));
  const history=new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project,candidate,{family:'road',operation:'research-retire-generated-parcels',
    label:'Research road and parcel retirement',targetIds:[...roadIds,...sets.properties,...sets.buildings]}).status,'recorded');
  const undo=history.prepare('undo',candidate,ws);assert.ok(undo.ok,undo.reason);
  assert.equal(hash(undo.candidate),hash(project));history.accept('undo',undo.entry,undo.candidate);
  const redo=history.prepare('redo',undo.candidate,undo.workspace);assert.ok(redo.ok,redo.reason);
  assert.equal(hash(redo.candidate),hash(candidate));history.accept('redo',redo.entry,redo.candidate);
}



const kinds=['properties','plots','buildings'];
const canonical=sets=>Object.fromEntries(kinds.map(k=>[k,sorted(unique(sets[k]))]));
const empty=()=>({properties:[],plots:[],buildings:[]});
const restore=(sets,g,children)=>canonical({properties:sets.properties.filter(id=>id!==g.id),
  plots:sets.plots.filter(id=>!g.plots.includes(id)),buildings:children?sets.buildings.filter(id=>!g.buildings.includes(id)):sets.buildings});
const strategyIds=['production','pack-fit','frontage-adjacent','targeted-05','targeted-10','targeted-20'];
// This adapter alone knows the road operation and land entity semantics.
// No saved recovery sets, fingerprints, case-specific block IDs or answers
// are used in proposal generation.
function makeRoadAdapter(project,draft,offset,strategies){
  const eligible=inventory(project,draft),all=sorted(eligible.keys()),byBuilding=new Map(project.city.buildings.map(b=>[b.id,b]));
  const parent=new Map([...eligible.values()].flatMap(g=>g.buildings.map(id=>[id,g.id])));
  const topology=readRoadGroupTopologyB1(project,draft);
  assert.ok(topology?.graph.valid&&topology?.faces.valid&&topology?.identity.valid);
  const oldNodes=new Map(project.city.nodes.map(n=>[n.id,n]));
  const compressed=new Set(project.city.blocks.filter(b=>
    Math.abs(polygonSignedArea(b.vertices.map(v=>topology.graph.nodesById.get(v))))<
    Math.abs(polygonSignedArea(b.vertices.map(v=>oldNodes.get(v))))-1e-6).map(b=>b.id));
  const affected=all.filter(id=>compressed.has(eligible.get(id).block));
  const before=hash(project),telemetry=[];
  const plan=(sets,strategy,stage)=>({sets:canonical(sets),strategy,stage});
  return {
    key:p=>p.sets,
    telemetry,
    *initialPlans(){
      for(const id of strategyIds)yield plan(empty(),id,'preservation');
      // Try two bounded building-only inventories before whole-parcel
      // retirement, largest-first and complete compressed-block children.
      const ids=affected.flatMap(id=>eligible.get(id).buildings)
        .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
      for(const subset of [ids.slice(0,4),ids]){
        if(!subset.length)continue;
        for(const id of ['pack-fit','frontage-adjacent'])yield plan({...empty(),buildings:subset},id,'building-retirement');
      }
      for(const subset of [affected,all]){
        if(!subset.length)continue;
        for(const id of ['production','pack-fit','frontage-adjacent','targeted-20'])
          yield plan(removedSets(eligible,subset),id,'parcel-retirement');
      }
    },
    *improvementPlans(witness){
      const sets=witness.plan.sets,old=count(sets),proposals=[],keys=new Set();
      const rank=sets.properties.slice().sort((a,b)=>eligible.get(b).footprint-eligible.get(a).footprint||a.localeCompare(b));
      const add=(next,stage)=>{
        next=canonical(next);const key=JSON.stringify(next);
        if(keys.has(key)||JSON.stringify(sets)===key||!countNonincrease(count(next),old))return;
        keys.add(key);proposals.push({next,stage});
      };
      const restoreMany=(ids,full)=>ids.reduce((next,id)=>restore(next,eligible.get(id),full),sets);
      const blocks=unique(rank.map(id=>eligible.get(id).block));
      // Coarse-to-fine proposals: try whole blocks, smaller groups, then
      // individual parcels. Shell-only proposals are peers, not afterthoughts.
      for(const block of blocks){
        const ids=rank.filter(id=>eligible.get(id).block===block);
        add(restoreMany(ids,true),'restore-block');
        add(restoreMany(ids,false),'restore-block-shells');
      }
      for(const size of [4,2]){
        for(const block of blocks){
          const ids=rank.filter(id=>eligible.get(id).block===block);
          for(let i=0;i<ids.length;i+=size){
            const group=ids.slice(i,i+size);
            if(group.length<2)continue;
            add(restoreMany(group,true),'restore-batch');
            add(restoreMany(group,false),'restore-batch-shells');
          }
        }
      }
      for(const id of rank){
        add(restoreMany([id],true),'restore-property');
        add(restoreMany([id],false),'restore-shell');
      }
      const buildings=sets.buildings.filter(id=>!sets.properties.includes(parent.get(id)))
        .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
      for(const block of unique(buildings.map(id=>eligible.get(parent.get(id)).block))){
        const ids=buildings.filter(id=>eligible.get(parent.get(id)).block===block);
        for(let i=0;i+1<ids.length;i+=2){
          const pair=new Set(ids.slice(i,i+2));
          add({...sets,buildings:sets.buildings.filter(id=>!pair.has(id))},'restore-child-pair');
        }
      }
      for(const id of buildings)add({...sets,buildings:sets.buildings.filter(x=>x!==id)},'restore-child');
      // Class-interleaved proposal ranking avoids spending an entire pass
      // on failed large restorations. Favor more restored identities within
      // each class. No corpus-specific target blocks or witnesses.
      const cmp=(a,b)=>{
        const x=count(a.next),y=count(b.next);
        return x.properties-y.properties||x.buildings-y.buildings||x.plots-y.plots||
          JSON.stringify(a.next).localeCompare(JSON.stringify(b.next));
      };
      const classes=[
        proposals.filter(p=>p.stage.startsWith('restore-block')).sort(cmp),
        proposals.filter(p=>p.stage.startsWith('restore-batch')).sort(cmp),
        proposals.filter(p=>['restore-property','restore-shell'].includes(p.stage)).sort(cmp),
        proposals.filter(p=>p.stage.startsWith('restore-child')).sort(cmp)
      ];
      const diversified=[];
      for(let i=0;i<Math.max(0,...classes.map(c=>c.length));i++)
        for(const c of classes)if(c[i])diversified.push(c[i]);
      // Diversify geometry proposals before spending several expensive
      // solver calls on one removal set. Start with an empowered strategy
      // when the current witness required whole parcels to be retired.
      const order=unique([...(sets.properties.length?['targeted-20']:[]),
        witness.strategy.id,'frontage-adjacent','targeted-10','pack-fit']);
      for(const strategy of order.slice(0,3))
        for(const {next,stage} of diversified)yield plan(next,strategy,stage);
    },
    solve(p,strategy){
      const started=performance.now();
      let reduced;
      try{reduced=reduce(project,p.sets);}
      catch(error){telemetry.push({stage:p.stage,strategy:strategy.id,accepted:false,ms:performance.now()-started,
        chargedWork:null,expansions:null});return {issues:[error.message]};}
      const h=hash(reduced),result=strategy.solve(reduced,roadIds,offset);
      assert.equal(hash(reduced),h);assert.equal(hash(project),before);
      const stats=result.lare?.operationStats;
      telemetry.push({stage:p.stage,strategy:strategy.id,accepted:Boolean(result.candidateProject),
        ms:performance.now()-started,chargedWork:stats?.work??null,expansions:stats?.expansions??null});
      return {candidate:result.candidateProject,issues:result.unresolved.map(r=>r.code)};
    },
    verify(p,strategy,candidate){return verifyOriginal(project,candidate,draft,p.sets,strategy);},
    cost(w){return recoveryCost({sets:w.plan.sets,...w.details},id=>byBuilding.get(id).area);}
  };
}
test('coordinator rejects disabled strategies, enforces budget, retains verified incumbent and stops on cancellation',()=>{
  const strategy=[{id:'disabled'},{id:'ok'}],calls=[];
  const adapter={
    key:p=>p.value,
    *initialPlans(){yield {strategy:'disabled',value:0};yield {strategy:'ok',value:3};},
    *improvementPlans(){yield {strategy:'ok',value:2};yield {strategy:'ok',value:1};},
    solve(p){calls.push(p.value);return {candidate:{value:p.value}};},
    verify(p,s,c){assert.equal(p.value,c.value);return {};},
    cost:w=>w.candidate.value
  };
  const policy={maxCalls:2,maxPasses:3,permits:p=>p.strategy==='ok',finished:n=>n===0,improves:(a,b)=>a<b};
  const first=coordinateRecovery({adapter,strategies:strategy,policy});
  assert.deepEqual(calls,[3,2]);assert.equal(first.best.cost,2);assert.equal(first.stop,'call-limit');
  const repeat=coordinateRecovery({adapter,strategies:strategy,policy});
  assert.deepEqual(first,repeat);
  const controller=new AbortController();controller.abort();
  const stopped=coordinateRecovery({adapter,strategies:strategy,policy,signal:controller.signal});
  assert.equal(stopped.calls,0);assert.equal(stopped.stop,'cancelled');
  assert.throws(()=>coordinateRecovery({adapter:{...adapter,verify(){throw Error('bad candidate');}},strategies:strategy,policy}),/bad candidate/);
});
for(const irregularProperties of [false,true])
test('oracle-free diversified restoration: '+(irregularProperties?'irregular':'regular'),{timeout:900000},async t=>{
  const production=Object.freeze({id:'production',solve:prepareRoadGroupReflowB1,verify:verifyLareGroupPreservation});
  const pack=await createPackingStrategy('pack-fit',t),frontage=await createFrontageStrategy('frontage-adjacent',t);
  const scaling=[];
  for(const id of ['targeted-05','targeted-10','targeted-20'])scaling.push(await createTargetedScaleStrategy(id,t));
  const strategies=[production,pack,frontage,...scaling];
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={irregularProperties,attempted:0,accepted:0,nonDestructive:0,regenerated:0,unresolved:0};
  // Explicit experiment-only capability policy, not a user-facing
  // permission. Real production review/Apply must be separately designed.
  const policy={maxCalls:64,maxPasses:32,permits:(p,s)=>strategyIds.includes(s.id),
    finished:c=>kinds.every(k=>c[k]===0),improves};
  for(const scale of [1,.75,.5,.25,.125,.025,-.25,-.5,-1]){
    const offset={x:baseOffset.x*scale,y:baseOffset.y*scale},draft=prepareRoadGroupIntentB1(project,roadIds,offset);
    const adapter=makeRoadAdapter(project,draft,offset,strategies);
    const started=performance.now();
    const result=coordinateRecovery({adapter,strategies,policy});
    const searchMs=performance.now()-started,telemetry=adapter.telemetry.slice();
    assert.equal(telemetry.length,result.calls);
    const first=telemetry.findIndex(a=>a.accepted);
    const timing={searchMs,firstCandidateSolveMs:first<0?null:telemetry.slice(0,first+1).reduce((n,a)=>n+a.ms,0),
      solveMs:telemetry.reduce((n,a)=>n+a.ms,0),maxSolveMs:Math.max(0,...telemetry.map(a=>a.ms)),
      reportedWork:telemetry.reduce((n,a)=>n+(a.chargedWork??0),0),reportedExpansions:telemetry.reduce((n,a)=>n+(a.expansions??0),0),
      workReportedCalls:telemetry.filter(a=>a.chargedWork!==null).length};
    summary.attempted++;
    if(!result.best){
      summary.unresolved++;
      console.log('SCHEDULE_RECOVERY_CASE '+JSON.stringify({irregularProperties,scale,accepted:false,calls:result.calls,stop:result.stop,attempts:result.attempts}));
      continue;
    }
    const w=result.best,sets=w.plan.sets,base=w.candidate,baseHash=hash(base);
    const replay=adapter.solve(w.plan,w.strategy);
    assert.ok(replay.candidate);assert.equal(hash(replay.candidate),baseHash);
    adapter.verify(w.plan,w.strategy,replay.candidate);
    const options={seed:project.seed+':recovery-r27:'+scale+':'+irregularProperties,
      morphology:irregularProperties?'organic':null};
    const regen=kinds.some(k=>sets[k].length)?regenerateVacancies(project,base,sets,options):
      {candidate:base,added:empty(),attempts:[]};
    verifyRegeneration(project,base,regen.candidate,sets,regen.added);
    const repeat=kinds.some(k=>sets[k].length)?regenerateVacancies(project,base,sets,options):regen;
    assert.equal(hash(repeat.candidate),hash(regen.candidate));
    assert.deepEqual(repeat.added,regen.added);
    verifyHistory(project,regen.candidate,sets);
    assert.equal(hash(project),before);assert.equal(hash(base),baseHash);
    for(const k of kinds){
      const actual=new Set(regen.candidate.city[k].map(r=>r.id));
      assert.deepEqual(sorted(project.city[k].filter(r=>!actual.has(r.id)).map(r=>r.id)),sets[k]);
      if(sets[k].length)assert.throws(()=>adapter.verify({...w.plan,sets:{...sets,[k]:sets[k].slice(1)}},w.strategy,base));
      if(regen.added[k].length)assert.throws(()=>verifyRegeneration(project,base,regen.candidate,sets,{...regen.added,[k]:regen.added[k].slice(1)}));
    }
    summary.accepted++;
    if(kinds.every(k=>!sets[k].length))summary.nonDestructive++;
    if(kinds.some(k=>regen.added[k].length))summary.regenerated++;
    console.log('SCHEDULE_RECOVERY_CASE '+JSON.stringify({irregularProperties,scale,accepted:true,
      stage:w.plan.stage,solver:w.strategy.id,calls:result.calls,stop:result.stop,cost:w.cost,
      removed:sets,added:regen.added,net:Object.fromEntries(kinds.map(k=>[k,sets[k].length-regen.added[k].length])),
      baseFingerprint:baseHash,fingerprint:hash(regen.candidate),timing,telemetry,attempts:result.attempts,regeneration:regen.attempts}));
  }
  console.log('SCHEDULE_RECOVERY_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.accepted,9,'Progressive coordinator must independently recover all nine movements per layout');
});
