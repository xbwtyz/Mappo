// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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

// Exact Round 22 witnesses from hosted job 138877005648.
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
        "BLD-00135",
        "BLD-00140",
        "BLD-00141",
        "BLD-00150"
      ]
    },
    "fingerprint": "22b78e8e2c279b0d6c8f7bf51070012c15581149f6edc7125bc1b6c01b9eed61",
    "solver": "frontage-adjacent"
  },
  {
    "irregularProperties": false,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00121",
        "PROP-00123"
      ],
      "plots": [
        "PLOT-00177",
        "PLOT-00179"
      ],
      "buildings": [
        "BLD-00136",
        "BLD-00138"
      ]
    },
    "fingerprint": "6e838b13ffe775adb56de5a9138d6058b79fee16fc89e8dc4ca3f1cafb315766",
    "solver": "frontage-adjacent"
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
        "PROP-00123",
        "PROP-00127",
        "PROP-00128",
        "PROP-00133"
      ],
      "plots": [
        "PLOT-00198",
        "PLOT-00201",
        "PLOT-00209",
        "PLOT-00210",
        "PLOT-00216"
      ],
      "buildings": [
        "BLD-00135",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00144",
        "BLD-00145",
        "BLD-00149",
        "BLD-00150",
        "BLD-00152"
      ]
    },
    "fingerprint": "f9d91a0f3ac8210982f48c66eee669045af03a768a8b43102f48f9670fed9ee0",
    "solver": "pack-fit"
  },
  {
    "irregularProperties": true,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00121",
        "PROP-00123",
        "PROP-00127"
      ],
      "plots": [
        "PLOT-00199",
        "PLOT-00201",
        "PLOT-00209"
      ],
      "buildings": [
        "BLD-00136",
        "BLD-00138",
        "BLD-00144"
      ]
    },
    "fingerprint": "8040f2b31b3b1f9b78822e0d78d753f1f60bd7be49c7405642e2f757b6f526a7",
    "solver": "frontage-adjacent"
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "sets": {
      "properties": [
        "PROP-00169"
      ],
      "plots": [
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00188",
        "BLD-00192"
      ]
    },
    "fingerprint": "32f1c8fd1cc1f04fc7b316d243cf37b4909bc5f5986f71686acdb19c2805a63a",
    "solver": "frontage-adjacent"
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
        "BLD-00194",
        "BLD-00195"
      ]
    },
    "fingerprint": "fbdad7729caec0dc01c5941ac28067d30326fb74072953f46833d9ce0ab7a248",
    "solver": "frontage-adjacent"
  }
];
const restoreGroup=(sets,group,withBuildings)=>({
  properties:sets.properties.filter(id=>id!==group.id),
  plots:sets.plots.filter(id=>!group.plots.includes(id)),
  buildings:withBuildings?sets.buildings.filter(id=>!group.buildings.includes(id)):sets.buildings.slice()
});
const count=sets=>({properties:sets.properties.length,plots:sets.plots.length,buildings:sets.buildings.length});
for(const irregularProperties of [false,true])
test('detached scaling-assisted restoration: '+(irregularProperties?'irregular':'regular'),{timeout:900000},async t=>{
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
    improved:0,restoredProperties:0,restoredPlots:0,restoredBuildings:0};
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
      return {sets,candidate:result.candidateProject,strategy,switched,scaled};
    };
    const trial=(sets,label,strategy=null)=>{
      if(strategy)return trialOne(sets,label,strategy);
      for(const candidate of scaling){
        const result=trialOne(sets,label,candidate);
        if(result)return result;
      }
      return null;
    };
    let best=trial(seed.sets,'round22-exact',strategies.get(seed.solver));
    assert.ok(best,'Prior witness lost');
    assert.equal(hash(best.candidate),seed.fingerprint,'Exact prior fingerprint changed');
    const original=count(best.sets),rank=ids=>ids.slice().sort((a,b)=>eligible.get(b).footprint-eligible.get(a).footprint||a.localeCompare(b));
    // Each accepted step only restores records. It never removes an
    // additional surviving building or sacrifices an existing witness.
    for(const id of rank(best.sets.properties).slice(0,18)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),true),'whole:'+id);
      if(next)best=next;
    }
    const whole=count(best.sets);
    for(const id of rank(best.sets.properties).slice(0,14)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),false),'empty-shell:'+id);
      if(next)best=next;
    }
    const shell=count(best.sets);
    const buildingOrder=best.sets.buildings.filter(id=>!best.sets.properties.includes(parent.get(id)))
      .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
    for(const id of buildingOrder.slice(0,12)){
      const next=trial({...best.sets,buildings:best.sets.buildings.filter(x=>x!==id)},'child:'+id);
      if(next)best=next;
    }
    const final=count(best.sets);
    for(const k of Object.keys(original))assert.ok(final[k]<=original[k],'Restoration increased destruction');
    for(const k of Object.keys(best.sets))assert.ok(best.sets[k].every(id=>seed.sets[k].includes(id)),'New retirement introduced');
    verifyOriginal(project,best.candidate,draft,best.sets,best.strategy);
    const replay=best.strategy.solve(reduce(project,best.sets),roadIds,offset);
    assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
    verifyHistory(project,best.candidate,best.sets);
    for(const key of ['properties','plots','buildings'])if(best.sets[key].length){
      const wrong={...best.sets,[key]:best.sets[key].slice(1)};
      assert.throws(()=>verifyOriginal(project,best.candidate,draft,wrong,best.strategy),'Unreviewed removal accepted: '+key);
    }
    summary.attempted++;summary.retained++;
    const restored={properties:original.properties-final.properties,plots:original.plots-final.plots,buildings:original.buildings-final.buildings};
    if(Object.values(restored).some(n=>n>0))summary.improved++;
    summary.restoredProperties+=restored.properties;summary.restoredPlots+=restored.plots;summary.restoredBuildings+=restored.buildings;
    assert.equal(hash(project),before);
    console.log('SCALE_RESTORE_CASE '+JSON.stringify({irregularProperties,scale,original,whole,shell,final,restored,
      removed:best.sets,footprintLoss:best.sets.buildings.reduce((n,id)=>n+byBuilding.get(id).area,0),
      fingerprint:hash(best.candidate),solver:best.strategy.id,switched:best.switched,scaled:best.scaled,scaledAreaLoss:best.scaled.reduce((n,b)=>n+b.areaLoss,0),attempts}));
  }
  console.log('SCALE_RESTORE_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.retained,4);
});
