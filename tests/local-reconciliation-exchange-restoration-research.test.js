// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retirementCounts as count,countNonincrease,recoveryCost,improves} from './helpers/spatial-recovery-cost.mjs';
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

// Exact Round 23 witnesses from hosted job 138879417747.
const seeds=[
  {
    "irregularProperties": false,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00120"
      ],
      "plots": [
        "PLOT-00176"
      ],
      "buildings": [
        "BLD-00135"
      ]
    },
    "fingerprint": "5a54f7a7b0efe02b4cf600c2554a45f1d2d685bcad3fb3ec062d503eff7112fa",
    "solver": "targeted-20"
  },
  {
    "irregularProperties": false,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00123"
      ],
      "plots": [
        "PLOT-00179"
      ],
      "buildings": [
        "BLD-00138"
      ]
    },
    "fingerprint": "3638014fec0b5ffae9f92c028ed4e479d3a241a19b74ff0ebbd220b88f08596a",
    "solver": "targeted-20"
  },
  {
    "irregularProperties": false,
    "scale": -0.5,
    "sets": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00188"
      ]
    },
    "fingerprint": "450726a7f705db2e61a70ac8752c97c93729f6b52e4edc7b79177b3a447a251b",
    "solver": "frontage-adjacent"
  },
  {
    "irregularProperties": false,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169"
      ],
      "plots": [
        "PLOT-00239",
        "PLOT-00240",
        "PLOT-00241",
        "PLOT-00242",
        "PLOT-00246"
      ],
      "buildings": [
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194"
      ]
    },
    "fingerprint": "41b85153a97349093bac7ce8e8d3b74c4a46b594738501090010c073158e7f45",
    "solver": "frontage-adjacent"
  },
  {
    "irregularProperties": true,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00120",
        "PROP-00123"
      ],
      "plots": [
        "PLOT-00198",
        "PLOT-00201"
      ],
      "buildings": [
        "BLD-00135",
        "BLD-00138",
        "BLD-00141"
      ]
    },
    "fingerprint": "1b642514b7f8166c2194748fd7c5cf1023fb10cb8a5e5ad7ce084eb63e86a154",
    "solver": "targeted-10"
  },
  {
    "irregularProperties": true,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00123"
      ],
      "plots": [
        "PLOT-00201"
      ],
      "buildings": [
        "BLD-00138"
      ]
    },
    "fingerprint": "546303961db1fa32bbb2592c389acf3a5cb52128b4658e0da2cf26efd40eac5f",
    "solver": "targeted-20"
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "sets": {
      "properties": [],
      "plots": [],
      "buildings": [
        "BLD-00185",
        "BLD-00188"
      ]
    },
    "fingerprint": "951a28ebfbc5e9b9bcd01e31790dc4f261c345373beec536dfd7ac167d8f6152",
    "solver": "targeted-20"
  },
  {
    "irregularProperties": true,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169"
      ],
      "plots": [
        "PLOT-00269",
        "PLOT-00270",
        "PLOT-00271",
        "PLOT-00272",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278"
      ],
      "buildings": [
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194"
      ]
    },
    "fingerprint": "1c5f6669dd75e754e57c839009692d4286e37d0ab32f0da46f9cc5024e96ed3d",
    "solver": "targeted-10"
  }
];
const restoreGroup=(sets,group,withBuildings)=>({
  properties:sets.properties.filter(id=>id!==group.id),
  plots:sets.plots.filter(id=>!group.plots.includes(id)),
  buildings:withBuildings?sets.buildings.filter(id=>!group.buildings.includes(id)):sets.buildings.slice()
});
const canonical=sets=>Object.fromEntries(['properties','plots','buildings'].map(k=>[k,sorted(unique(sets[k]))]));
function exchangeProposals(sets,eligible,parent,byBuilding){
  const result=[],old=count(sets),oldKey=JSON.stringify(canonical(sets)),seen=new Set();
  const groups=[...eligible.values()],removedProps=new Set(sets.properties),removedBuildings=new Set(sets.buildings);
  const add=(kind,proposal,reason)=>{
    proposal=canonical(proposal);const key=JSON.stringify(proposal);
    if(key===oldKey||seen.has(key)||!countNonincrease(count(proposal),old))return;
    seen.add(key);
    const c=count(proposal);
    result.push({kind,sets:proposal,reason,key,rank:[c.properties,c.buildings,c.plots,
      proposal.buildings.reduce((n,id)=>n+byBuilding.get(id).area,0)]});
  };
  const retire=(s,g)=>canonical({properties:[...s.properties,g.id],plots:[...s.plots,...g.plots],
    buildings:[...s.buildings,...g.buildings]});
  // Whole- and shell-restoration are useful controls, but exchanges
  // explicitly restore an old record and retire a different eligible one.
  for(const id of sets.properties){
    const g=eligible.get(id);
    add('restore',restoreGroup(sets,g,true),'whole:'+id);
    add('restore',restoreGroup(sets,g,false),'shell:'+id);
    for(const other of groups.filter(o=>o.block===g.block&&!removedProps.has(o.id))){
      add('parcel-exchange',retire(restoreGroup(sets,g,true),other),'property:'+id+'<-'+other.id);
      // Restore land, sacrificing at most one other child in the same block.
      for(const child of other.buildings.filter(id=>!removedBuildings.has(id))){
        const next=restoreGroup(sets,g,true);
        add('land-child-exchange',{...next,buildings:[...next.buildings,child]},'land:'+id+'<-'+child);
      }
    }
  }
  const available=sets.buildings.filter(id=>!removedProps.has(parent.get(id)));
  const retained=groups.filter(g=>!removedProps.has(g.id)).flatMap(g=>g.buildings.filter(id=>!removedBuildings.has(id)));
  for(const id of available){
    const block=eligible.get(parent.get(id)).block;
    add('restore',{...sets,buildings:sets.buildings.filter(x=>x!==id)},'child:'+id);
    for(const other of retained.filter(x=>eligible.get(parent.get(x)).block===block)){
      add('child-exchange',{...sets,buildings:[...sets.buildings.filter(x=>x!==id),other]},'child:'+id+'<-'+other);
      for(const second of available.filter(x=>x>id&&eligible.get(parent.get(x)).block===block)){
        add('child-exchange',{...sets,buildings:[...sets.buildings.filter(x=>x!==id&&x!==second),other]},
          'children:'+id+'+'+second+'<-'+other);
      }
    }
  }
  const cmp=(a,b)=>{for(let i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return a.rank[i]-b.rank[i];return a.key.localeCompare(b.key);};
  result.sort(cmp);
  // Round-robin classes ensure real exchanges are not crowded out by
  // ordinary one-record restoration. At most eight proposals per class.
  const classes=['parcel-exchange','land-child-exchange','child-exchange','restore']
    .map(kind=>result.filter(p=>p.kind===kind).slice(0,8));
  const ordered=[];
  for(let i=0;i<8;i++)for(const c of classes)if(c[i])ordered.push(c[i]);
  return ordered;
}
for(const irregularProperties of [false,true])
test('detached alternative retirement sets: '+(irregularProperties?'irregular':'regular'),{timeout:900000},async t=>{
  const production=Object.freeze({id:'production',solve:prepareRoadGroupReflowB1,verify:verifyLareGroupPreservation});
  const pack=await createPackingStrategy('pack-fit',t);
  const frontage=await createFrontageStrategy('frontage-adjacent',t);
  const scaling=[];
  for(const id of ['targeted-05','targeted-10','targeted-20'])scaling.push(await createTargetedScaleStrategy(id,t));
  const strategies=new Map([production,pack,frontage,...scaling].map(s=>[s.id,s]));
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={irregularProperties,attempted:0,retained:0,
    improved:0,restoredProperties:0,restoredPlots:0,restoredBuildings:0,exchangeAccepted:0,lowerCost:0};
  const byBuilding=new Map(project.city.buildings.map(b=>[b.id,b]));
  for(const seed of seeds.filter(s=>s.irregularProperties===irregularProperties)){
    const {scale}=seed,offset={x:baseOffset.x*scale,y:baseOffset.y*scale};
    const draft=prepareRoadGroupIntentB1(project,roadIds,offset);
    const eligible=inventory(project,draft);
    const parent=new Map([...eligible.values()].flatMap(p=>p.buildings.map(id=>[id,p.id])));
    const attempts=[],seen=new Set();
    const trialOne=(sets,label,strategy)=>{
      sets=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,sorted(v)]));
      const key=JSON.stringify([strategy.id,sets]);if(seen.has(key))return null;seen.add(key);
      let reduced;
      try{reduced=reduce(project,sets);}
      catch(error){attempts.push({label,strategy:strategy.id,...count(sets),outcome:'reduction-refused',message:error.message});return null;}
      const reducedBefore=hash(reduced);
      const result=strategy.solve(reduced,roadIds,offset);
      assert.equal(hash(reduced),reducedBefore);assert.equal(hash(project),before);
      if(!result.candidateProject){
        attempts.push({label,strategy:strategy.id,...count(sets),outcome:'reflow-refused',issues:result.unresolved.map(i=>i.code)});
        return null;
      }
      const {switched,scaled}=verifyOriginal(project,result.candidateProject,draft,sets,strategy);
      attempts.push({label,strategy:strategy.id,...count(sets),outcome:'accepted',switched:switched.length,scaled:scaled.length});
      const witness={sets,candidate:result.candidateProject,strategy,switched,scaled};
      witness.cost=recoveryCost(witness,id=>byBuilding.get(id).area);
      return witness;
    };
    let best=trialOne(seed.sets,'round23-exact',strategies.get(seed.solver));
    assert.ok(best,'Prior witness lost');
    assert.equal(hash(best.candidate),seed.fingerprint,'Exact prior fingerprint changed');
    const original=count(best.sets),originalCost=best.cost,history=[];
    let solveCalls=0,exchangeAccepted=0;
    const cap=48;
    const consider=(sets,label,strategy,kind)=>{
      if(solveCalls>=cap)return false;
      const key=JSON.stringify([strategy.id,canonical(sets)]);
      if(seen.has(key))return false;
      solveCalls++;
      const next=trialOne(canonical(sets),label,strategy);
      if(!next||!improves(next.cost,best.cost))return false;
      history.push({kind,label,solver:strategy.id,from:best.cost,to:next.cost,
        added:Object.fromEntries(Object.keys(next.sets).map(k=>[k,next.sets[k].filter(id=>!best.sets[k].includes(id))])),
        restored:Object.fromEntries(Object.keys(best.sets).map(k=>[k,best.sets[k].filter(id=>!next.sets[k].includes(id))]))});
      if(kind.endsWith('exchange'))exchangeAccepted++;
      best=next;
      return true;
    };
    // Same removal set may be achievable with fewer concessions. Test
    // all known strategies, retaining the exact seed if no cost improves.
    for(const strategy of strategies.values())consider(best.sets,'same-set:'+strategy.id,strategy,'same-set');
    let proposed=0,exchangeProposalsTried=0;
    // Two bounded neighborhoods, deterministic ordering and strategy caps.
    // Do not assume a failed trial proves geometric impossibility.
    for(let pass=0;pass<2&&solveCalls<cap;pass++){
      const candidates=exchangeProposals(best.sets,eligible,parent,byBuilding);
      let accepted=false;
      for(const proposal of candidates.slice(0,24)){
        if(solveCalls>=cap)break;
        if(!countNonincrease(count(proposal.sets),count(best.sets)))continue;
        proposed++;
        if(proposal.kind.endsWith('exchange'))exchangeProposalsTried++;
        const order=unique([best.strategy,pack,frontage,scaling[2]]);
        for(const strategy of order.slice(0,2)){
          if(consider(proposal.sets,proposal.reason,strategy,proposal.kind)){
            accepted=true;break;
          }
        }
        if(accepted)break; // regenerate neighborhood from verified incumbent
      }
      if(!accepted)break;
    }
    const final=count(best.sets);
    assert.ok(countNonincrease(final,original),'Exchange increased destruction count');
    if(history.length)assert.ok(improves(best.cost,originalCost),'Final cost not improved');
    else assert.equal(hash(best.candidate),seed.fingerprint);
    verifyOriginal(project,best.candidate,draft,best.sets,best.strategy);
    const replay=best.strategy.solve(reduce(project,best.sets),roadIds,offset);
    assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
    verifyHistory(project,best.candidate,best.sets);
    for(const key of ['properties','plots','buildings'])if(best.sets[key].length){
      const wrong={...best.sets,[key]:best.sets[key].slice(1)};
      assert.throws(()=>verifyOriginal(project,best.candidate,draft,wrong,best.strategy),'Unreviewed removal accepted: '+key);
    }
    summary.attempted++;summary.retained++;summary.exchangeAccepted+=exchangeAccepted;if(history.length)summary.lowerCost++;
    const restored={properties:original.properties-final.properties,plots:original.plots-final.plots,buildings:original.buildings-final.buildings};
    if(Object.values(restored).some(n=>n>0))summary.improved++;
    summary.restoredProperties+=restored.properties;summary.restoredPlots+=restored.plots;summary.restoredBuildings+=restored.buildings;
    assert.equal(hash(project),before);
    console.log('EXCHANGE_RESTORE_CASE '+JSON.stringify({irregularProperties,scale,original,final,restored,originalCost,finalCost:best.cost,history,solveCalls,proposed,exchangeProposalsTried,exchangeAccepted,
      removed:best.sets,footprintLoss:best.sets.buildings.reduce((n,id)=>n+byBuilding.get(id).area,0),
      fingerprint:hash(best.candidate),solver:best.strategy.id,switched:best.switched,scaled:best.scaled,scaledAreaLoss:best.scaled.reduce((n,b)=>n+b.areaLoss,0),attempts}));
  }
  console.log('EXCHANGE_RESTORE_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.retained,4);
});
