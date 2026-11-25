// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retirementCounts as count,recoveryCost,improves,countNonincrease} from './helpers/spatial-recovery-cost.mjs';
import {coordinateRecovery,iterateCoordinateRecovery} from './helpers/spatial-recovery-coordinator.mjs';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {regenerateVacancies,verifyRegeneration} from './helpers/spatial-recovery-regeneration.mjs';
import {createPackingStrategy,createFrontageStrategy,createTargetedScaleStrategy} from './helpers/spatial-recovery-research.mjs';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1,iterateRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
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



// Frozen evidence used only after search completion for parity assertions.
const expected=[
  {
    "irregularProperties": false,
    "scale": 1,
    "calls": 44,
    "stop": "candidate",
    "solver": "targeted-20",
    "base": "a8681a5e20ad881c1527edcad3628be5378503bf8eed483d325a464e90302efb",
    "final": "1d5c9fe398c2281daaf8139dbcdc24fddd999e5620707cf6907dc71ad77f9a30"
  },
  {
    "irregularProperties": false,
    "scale": 0.75,
    "calls": 10,
    "stop": "candidate",
    "solver": "frontage-adjacent",
    "base": "9ab5d30a59659028faea0f7ad93b2fd1d354ce0b7a36dae18d0ba0c47416e9df",
    "final": "27bcd67d3673ac8fb5638214bb8ceb9c7028fcc3f11e80514bf1cedc78e9cac9"
  },
  {
    "irregularProperties": false,
    "scale": 0.5,
    "calls": 3,
    "stop": "candidate",
    "solver": "frontage-adjacent",
    "base": "1e32d9f357c54211f96540ad2fde0800ed55b139806e875f2cc38a3498eacae2",
    "final": "1e32d9f357c54211f96540ad2fde0800ed55b139806e875f2cc38a3498eacae2"
  },
  {
    "irregularProperties": false,
    "scale": 0.25,
    "calls": 3,
    "stop": "candidate",
    "solver": "frontage-adjacent",
    "base": "37f5400f53ed52d6ab96c31bf3e5a560f699b7b11b9ac68265150f3ba4b83174",
    "final": "37f5400f53ed52d6ab96c31bf3e5a560f699b7b11b9ac68265150f3ba4b83174"
  },
  {
    "irregularProperties": false,
    "scale": 0.125,
    "calls": 2,
    "stop": "candidate",
    "solver": "pack-fit",
    "base": "a7a334db8c092a68fb5b6a544b42f265513ef97c887d3aa6f99eb6b556dad857",
    "final": "a7a334db8c092a68fb5b6a544b42f265513ef97c887d3aa6f99eb6b556dad857"
  },
  {
    "irregularProperties": false,
    "scale": 0.025,
    "calls": 1,
    "stop": "candidate",
    "solver": "production",
    "base": "c08983389f2270eeda6f2ec814909cbb8ac9944388f27ef3d8708efc33331cdf",
    "final": "c08983389f2270eeda6f2ec814909cbb8ac9944388f27ef3d8708efc33331cdf"
  },
  {
    "irregularProperties": false,
    "scale": -0.25,
    "calls": 2,
    "stop": "candidate",
    "solver": "pack-fit",
    "base": "191cbb77674b9ba44f90744e121f9638f610b45144df45fe3718c49ae3089e05",
    "final": "191cbb77674b9ba44f90744e121f9638f610b45144df45fe3718c49ae3089e05"
  },
  {
    "irregularProperties": false,
    "scale": -0.5,
    "calls": 12,
    "stop": "candidate",
    "solver": "frontage-adjacent",
    "base": "450726a7f705db2e61a70ac8752c97c93729f6b52e4edc7b79177b3a447a251b",
    "final": "0d681405e3f3b4e7463bbcf111b72b4c35e26e58c75deac5da2ccc6735c00087"
  },
  {
    "irregularProperties": false,
    "scale": -1,
    "calls": 64,
    "stop": "call-limit",
    "solver": "targeted-20",
    "base": "355d44f001e065e6ba2ac9b71939fdb3f73d687dd3b510e5afcdaf207fff46a1",
    "final": "355d44f001e065e6ba2ac9b71939fdb3f73d687dd3b510e5afcdaf207fff46a1"
  },
  {
    "irregularProperties": true,
    "scale": 1,
    "calls": 57,
    "stop": "candidate",
    "solver": "targeted-20",
    "base": "f623e757113209471b5b4c333b5021fa5bbc6644d067c0049a8a680e046a58b1",
    "final": "89cfbc62823c5c6c3f9456268cc9db4b4d925ae98f05fe1414828d822568f6d0"
  },
  {
    "irregularProperties": true,
    "scale": 0.75,
    "calls": 28,
    "stop": "candidate",
    "solver": "targeted-20",
    "base": "6ffc22b17ce06e466893886a8d5be2da267004fdd510db95e06ce60d84b77ab1",
    "final": "15416a9156adf37022e25cca468668ee2e16ebcc54003d551a7643639c1777e8"
  },
  {
    "irregularProperties": true,
    "scale": 0.5,
    "calls": 4,
    "stop": "candidate",
    "solver": "targeted-05",
    "base": "eaada7ca8420187627824994fb1f79a21a4997c9489005f77bb522b80b198e03",
    "final": "eaada7ca8420187627824994fb1f79a21a4997c9489005f77bb522b80b198e03"
  },
  {
    "irregularProperties": true,
    "scale": 0.25,
    "calls": 6,
    "stop": "candidate",
    "solver": "targeted-20",
    "base": "8480b9b95a3541cc915572ac3833735ebe09989e96b9774c4955df886a654f3f",
    "final": "8480b9b95a3541cc915572ac3833735ebe09989e96b9774c4955df886a654f3f"
  },
  {
    "irregularProperties": true,
    "scale": 0.125,
    "calls": 2,
    "stop": "candidate",
    "solver": "pack-fit",
    "base": "86db6e2b17a17f991d97ae28bad77440e8f2094ba9c5383365dc83aad671fb1c",
    "final": "86db6e2b17a17f991d97ae28bad77440e8f2094ba9c5383365dc83aad671fb1c"
  },
  {
    "irregularProperties": true,
    "scale": 0.025,
    "calls": 1,
    "stop": "candidate",
    "solver": "production",
    "base": "ca46adfa452f5216f1b9890aa0d072b0352eec8eebb0cc594baced66a2aaadc5",
    "final": "ca46adfa452f5216f1b9890aa0d072b0352eec8eebb0cc594baced66a2aaadc5"
  },
  {
    "irregularProperties": true,
    "scale": -0.25,
    "calls": 2,
    "stop": "candidate",
    "solver": "pack-fit",
    "base": "b7d79840f057310612313549569fe0a995f29c9d2f3ecc5d4f40316d97f10a06",
    "final": "b7d79840f057310612313549569fe0a995f29c9d2f3ecc5d4f40316d97f10a06"
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "calls": 34,
    "stop": "candidate",
    "solver": "targeted-20",
    "base": "951a28ebfbc5e9b9bcd01e31790dc4f261c345373beec536dfd7ac167d8f6152",
    "final": "43f2683df28d63d4dffcc812352eb5f3087bda494450c3103b08c4784f24ff9e"
  },
  {
    "irregularProperties": true,
    "scale": -1,
    "calls": 64,
    "stop": "call-limit",
    "solver": "targeted-20",
    "base": "a0e6a51fb83b31bb1e91e8b0761b806c71bfe528758f96dacda74c792cb0e3ea",
    "final": "a0e6a51fb83b31bb1e91e8b0761b806c71bfe528758f96dacda74c792cb0e3ea"
  }
];
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
    *iterateSolve(p,strategy){
      const started=performance.now();
      let reduced;
      try{reduced=reduce(project,p.sets);}
      catch(error){telemetry.push({stage:p.stage,strategy:strategy.id,accepted:false,ms:performance.now()-started,
        chargedWork:null,expansions:null});return {issues:[error.message]};}
      const h=hash(reduced),iterator=strategy.iterate(reduced,roadIds,offset);
      let result;
      try{for(;;){const step=iterator.next();if(step.done){result=step.value;break;}yield step.value;}}
      finally{iterator.return();}
     
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
// Time controls scheduling only, never candidate order or search budgets.
// Measure synchronous next() units separately from the host's cooperative
// batch. Node setImmediate is a pilot for a future worker/event-loop adapter.
async function drainCooperatively(iterator,{sliceMs=8,maxTicks=256,onProgress=()=>{}}={}){
  let ticks=0,batches=0,maxTickMs=0,maxBatchMs=0,over8=0,over16=0,over50=0,started=performance.now();
  const stageCounts={},slowest=[];
  try{
    for(;;){
      const batch=performance.now();
      let step;
      for(let i=0;i<maxTicks;i++){
        const start=performance.now();
        step=iterator.next();
        const ms=performance.now()-start;ticks++;
        maxTickMs=Math.max(maxTickMs,ms);
        if(ms>8)over8++;if(ms>16)over16++;if(ms>50)over50++;
        if(ms>8){
          slowest.push({ms,phase:step.value?.phase??'done',stage:step.value?.solverStage??step.value?.stage??null});
          slowest.sort((a,b)=>b.ms-a.ms);if(slowest.length>10)slowest.pop();
        }
        if(step.done)break;
        const event=step.value;
        assert.ok(event&&typeof event.phase==='string');
        assert.ok(!Object.hasOwn(event,'candidate')&&!Object.hasOwn(event,'project'));
        stageCounts[event.solverStage??event.phase]=(stageCounts[event.solverStage??event.phase]??0)+1;
        onProgress(event,ticks);
        if(performance.now()-batch>=sliceMs)break;
      }
      batches++;maxBatchMs=Math.max(maxBatchMs,performance.now()-batch);
      if(step.done)return {result:step.value,slicing:{ticks,batches,maxTickMs,maxBatchMs,over8,over16,over50,
        elapsedMs:performance.now()-started,stageCounts,slowest}};
      await yieldTurn();
    }
  }finally{iterator.return();}
}
test('resumable coordinator preserves verified incumbent when cancelled during next solve',async()=>{
  const controller=new AbortController(),strategy={id:'s'};
  let closed=0,verified=0;
  const adapter={
    key:p=>p.value,
    *initialPlans(){yield {strategy:'s',value:3,stage:'initial'};},
    *improvementPlans(){yield {strategy:'s',value:2,stage:'improve'};},
    *iterateSolve(p){try{yield {stage:'part-a'};yield {stage:'part-b'};return {candidate:{value:p.value}};}finally{closed++;}},
    verify(p,s,c){verified++;assert.equal(p.value,c.value);return {};},
    cost:w=>w.candidate.value
  };
  const policy={maxCalls:8,maxPasses:4,permits:()=>true,finished:()=>false,improves:(a,b)=>a<b};
  const {result}=await drainCooperatively(iterateCoordinateRecovery({adapter,strategies:[strategy],policy,signal:controller.signal}),
    {maxTicks:1,onProgress:event=>{
      if(event.phase==='solver'&&event.stage==='improve')controller.abort();
    }});
  assert.equal(result.stop,'cancelled');assert.equal(result.best.cost,3);
  assert.equal(result.calls,2);assert.equal(verified,1);assert.equal(closed,2);
  assert.equal(result.attempts.length,1);
});

for(const irregularProperties of [false,true])
test('oracle-free cooperative restoration: '+(irregularProperties?'irregular':'regular'),{timeout:900000},async t=>{
  const production=Object.freeze({id:'production',solve:prepareRoadGroupReflowB1,iterate:iterateRoadGroupReflowB1,verify:verifyLareGroupPreservation});
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
    const reference=expected.find(x=>x.irregularProperties===irregularProperties&&x.scale===scale);
    // Real domain cancellation test, in a separate detached iterator,
    // before the first candidate is verified. No partial result may escape.
    if(scale===1){
      const abort=new AbortController(),cancelAdapter=makeRoadAdapter(project,draft,offset,strategies);
      const cancelled=await drainCooperatively(iterateCoordinateRecovery({adapter:cancelAdapter,strategies,policy,signal:abort.signal}),
        {maxTicks:16,onProgress:(event,ticks)=>{if(event.phase==='solver'&&ticks>=32)abort.abort();}});
      assert.equal(cancelled.result.stop,'cancelled');
      assert.equal(cancelled.result.best,null);
      assert.equal(hash(project),before);
    }
    const started=performance.now();
    const {result,slicing}=await drainCooperatively(iterateCoordinateRecovery({adapter,strategies,policy}));
    assert.equal(result.calls,reference.calls,'Scheduling changed call order');
    assert.equal(result.stop,reference.stop,'Scheduling changed stop condition');
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
      console.log('COOPERATIVE_RECOVERY_CASE '+JSON.stringify({irregularProperties,scale,accepted:false,calls:result.calls,stop:result.stop,attempts:result.attempts}));
      continue;
    }
    const w=result.best,sets=w.plan.sets,base=w.candidate,baseHash=hash(base);
    assert.equal(w.strategy.id,reference.solver);
    assert.equal(baseHash,reference.base,'Scheduling changed recovery geometry');
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
    assert.equal(hash(regen.candidate),reference.final,'Scheduling changed regenerated geometry');
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
    console.log('COOPERATIVE_RECOVERY_CASE '+JSON.stringify({irregularProperties,scale,accepted:true,
      stage:w.plan.stage,solver:w.strategy.id,calls:result.calls,stop:result.stop,cost:w.cost,
      removed:sets,added:regen.added,net:Object.fromEntries(kinds.map(k=>[k,sets[k].length-regen.added[k].length])),
      baseFingerprint:baseHash,fingerprint:hash(regen.candidate),timing,slicing,telemetry,attempts:result.attempts,regeneration:regen.attempts}));
  }
  console.log('COOPERATIVE_RECOVERY_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.accepted,9,'Progressive coordinator must independently recover all nine movements per layout');
});
