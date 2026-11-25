// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retirementCounts as count,recoveryCost,improves,countNonincrease} from './helpers/spatial-recovery-cost.mjs';

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



// Frozen R28 reverse witnesses; independently reproduce before optimization.
const seeds=[
  {
    "irregularProperties": false,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00163",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00170"
      ],
      "plots": [
        "PLOT-00236",
        "PLOT-00239",
        "PLOT-00240",
        "PLOT-00241",
        "PLOT-00242",
        "PLOT-00246",
        "PLOT-00247"
      ],
      "buildings": [
        "BLD-00186",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194"
      ]
    },
    "solver": "targeted-20",
    "fingerprint": "355d44f001e065e6ba2ac9b71939fdb3f73d687dd3b510e5afcdaf207fff46a1",
    "final": "355d44f001e065e6ba2ac9b71939fdb3f73d687dd3b510e5afcdaf207fff46a1",
    "cost": {
      "properties": 6,
      "plots": 7,
      "buildings": 8,
      "demolishedArea": 1400.8857639992498,
      "scaledArea": 1903.1814615682808,
      "footprintLoss": 3304.067225567531,
      "switches": 23,
      "scaled": 27
    }
  },
  {
    "irregularProperties": true,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00163",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00170"
      ],
      "plots": [
        "PLOT-00266",
        "PLOT-00269",
        "PLOT-00270",
        "PLOT-00271",
        "PLOT-00272",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278",
        "PLOT-00279"
      ],
      "buildings": [
        "BLD-00186",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194"
      ]
    },
    "solver": "targeted-20",
    "fingerprint": "a0e6a51fb83b31bb1e91e8b0761b806c71bfe528758f96dacda74c792cb0e3ea",
    "final": "a0e6a51fb83b31bb1e91e8b0761b806c71bfe528758f96dacda74c792cb0e3ea",
    "cost": {
      "properties": 6,
      "plots": 9,
      "buildings": 8,
      "demolishedArea": 1400.8857639992498,
      "scaledArea": 1841.9701553212624,
      "footprintLoss": 3242.855919320512,
      "switches": 22,
      "scaled": 26
    }
  }
];
const kinds=['properties','plots','buildings'];
const canonical=sets=>Object.fromEntries(kinds.map(k=>[k,sorted(unique(sets[k]))]));
const empty=()=>({properties:[],plots:[],buildings:[]});
const restore=(sets,g,children)=>canonical({properties:sets.properties.filter(id=>id!==g.id),
  plots:sets.plots.filter(id=>!g.plots.includes(id)),buildings:children?sets.buildings.filter(id=>!g.buildings.includes(id)):sets.buildings});
const strategyIds=['production','pack-fit','frontage-adjacent','targeted-05','targeted-10','targeted-20'];
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
    add('restore',restore(sets,g,true),'whole:'+id);
    add('restore',restore(sets,g,false),'shell:'+id);
    for(const other of groups.filter(o=>o.block===g.block&&!removedProps.has(o.id))){
      add('parcel-exchange',retire(restore(sets,g,true),other),'property:'+id+'<-'+other.id);
      // Restore land, sacrificing at most one other child in the same block.
      for(const child of other.buildings.filter(id=>!removedBuildings.has(id))){
        const next=restore(sets,g,true);
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

test('severe reverse recovery: targeted shells and alternative concessions',{timeout:600000},async t=>{
  const production=Object.freeze({id:'production',solve:prepareRoadGroupReflowB1,verify:verifyLareGroupPreservation});
  const pack=await createPackingStrategy('pack-fit',t),frontage=await createFrontageStrategy('frontage-adjacent',t);
  const scaling=[];
  for(const id of ['targeted-05','targeted-10','targeted-20'])scaling.push(await createTargetedScaleStrategy(id,t));
  const strategies=[production,pack,frontage,...scaling],registry=new Map(strategies.map(s=>[s.id,s]));
  for(const seed of seeds){
    const {irregularProperties,scale}=seed;
    const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    validateStoredProject(project);
    const before=hash(project),offset={x:baseOffset.x*scale,y:baseOffset.y*scale};
    const draft=prepareRoadGroupIntentB1(project,roadIds,offset),eligible=inventory(project,draft);
    const byBuilding=new Map(project.city.buildings.map(b=>[b.id,b]));
    const parent=new Map([...eligible.values()].flatMap(g=>g.buildings.map(id=>[id,g.id])));
    const attempts=[],seen=new Set(),changes=[];
    let calls=0;
    const trial=(sets,strategy,label)=>{
      sets=canonical(sets);const key=JSON.stringify([strategy.id,sets]);
      if(seen.has(key)||calls>=96)return null;
      seen.add(key);calls++;
      const started=performance.now();
      let reduced;
      try{reduced=reduce(project,sets);}
      catch(error){attempts.push({label,strategy:strategy.id,outcome:'reduction-refused',message:error.message});return null;}
      const h=hash(reduced),result=strategy.solve(reduced,roadIds,offset);
      assert.equal(hash(reduced),h);assert.equal(hash(project),before);
      const ms=performance.now()-started,work=result.lare?.operationStats?.work??null;
      if(!result.candidateProject){
        attempts.push({label,strategy:strategy.id,outcome:'refused',ms,work,issues:result.unresolved.map(r=>r.code)});
        return null;
      }
      const details=verifyOriginal(project,result.candidateProject,draft,sets,strategy);
      const witness={sets,strategy,candidate:result.candidateProject,...details};
      witness.cost=recoveryCost(witness,id=>byBuilding.get(id).area);
      attempts.push({label,strategy:strategy.id,outcome:'accepted',ms,work,cost:witness.cost});
      return witness;
    };
    let best=trial(seed.sets,registry.get(seed.solver),'R28-exact');
    assert.ok(best);assert.equal(hash(best.candidate),seed.fingerprint);
    const original=best.cost;
    const consider=(sets,strategy,label)=>{
      const next=trial(sets,strategy,label);
      if(!next||!improves(next.cost,best.cost))return false;
      changes.push({label,strategy:strategy.id,from:best.cost,to:next.cost,
        restored:Object.fromEntries(kinds.map(k=>[k,best.sets[k].filter(id=>!next.sets[k].includes(id))])),
        newlyRetired:Object.fromEntries(kinds.map(k=>[k,next.sets[k].filter(id=>!best.sets[k].includes(id))]))});
      best=next;return true;
    };
    // Prefer smaller empty land envelopes first. A parcel with no child
    // buildings should not be forced into the footprint-heavy search order.
    // All proposed geometry is still constructed and validated by the
    // existing strategy; no new exemption or capacity assumption.
    const shellOrder=()=>best.sets.properties.slice().sort((a,b)=>eligible.get(a).area-eligible.get(b).area||a.localeCompare(b));
    for(let pass=0;pass<3&&calls<40;pass++){
      let progress=false;
      for(const pid of shellOrder()){
        for(const id of ['frontage-adjacent','pack-fit','targeted-10','targeted-20']){
          if(calls>=40)break;
          if(consider(restore(best.sets,eligible.get(pid),false),registry.get(id),'shell:'+pid)){progress=true;break;}
        }
      }
      if(!progress)break;
    }
    // Optimize the same retirement set before comparing different ones.
    for(const strategy of strategies)consider(best.sets,strategy,'same-set');
    const afterShell=best.cost;
    // Explore same-block exchanges, including restoring whole parcels
    // and replacing different child removals. Keep identity count monotonic.
    for(let pass=0;pass<3&&calls<84;pass++){
      let progress=false;
      const proposals=exchangeProposals(best.sets,eligible,parent,byBuilding);
      for(const p of proposals){
        if(calls>=84)break;
        const order=unique([best.strategy.id,'frontage-adjacent','targeted-20']);
        for(const id of order.slice(0,2)){
          if(calls>=84)break;
          if(consider(p.sets,registry.get(id),p.reason)){progress=true;break;}
        }
        if(progress)break;
      }
      if(!progress)break;
    }
    // Reserve a final bounded pass for same-set concessions and direct
    // child restoration rather than consuming every call on exchanges.
    for(const strategy of strategies)consider(best.sets,strategy,'final-same-set');
    const available=best.sets.buildings.filter(id=>!best.sets.properties.includes(parent.get(id)))
      .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
    for(const id of available){
      if(calls>=96)break;
      consider({...best.sets,buildings:best.sets.buildings.filter(x=>x!==id)},best.strategy,'final-child:'+id);
    }
    assert.ok(countNonincrease(best.cost,{properties:original.properties,plots:original.plots,buildings:original.buildings}));
    if(changes.length)assert.ok(improves(best.cost,original));
    else assert.equal(hash(best.candidate),seed.fingerprint);
    const replay=best.strategy.solve(reduce(project,best.sets),roadIds,offset);
    assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
    verifyOriginal(project,best.candidate,draft,best.sets,best.strategy);
    const options={seed:project.seed+':recovery-r27:'+scale+':'+irregularProperties,morphology:irregularProperties?'organic':null};
    const regen=regenerateVacancies(project,best.candidate,best.sets,options);
    verifyRegeneration(project,best.candidate,regen.candidate,best.sets,regen.added);
    const repeat=regenerateVacancies(project,best.candidate,best.sets,options);
    assert.equal(hash(repeat.candidate),hash(regen.candidate));
    assert.deepEqual(repeat.added,regen.added);
    verifyHistory(project,regen.candidate,best.sets);
    for(const k of kinds){
      const actual=new Set(regen.candidate.city[k].map(r=>r.id));
      assert.deepEqual(sorted(project.city[k].filter(r=>!actual.has(r.id)).map(r=>r.id)),best.sets[k]);
      if(best.sets[k].length)assert.throws(()=>verifyOriginal(project,best.candidate,draft,{...best.sets,[k]:best.sets[k].slice(1)},best.strategy));
      if(regen.added[k].length)assert.throws(()=>verifyRegeneration(project,best.candidate,regen.candidate,best.sets,{...regen.added,[k]:regen.added[k].slice(1)}));
    }
    assert.equal(hash(project),before);
    console.log('REVERSE_OPT_CASE '+JSON.stringify({irregularProperties,scale,original,afterShell,final:best.cost,
      solver:best.strategy.id,calls,changes,removed:best.sets,added:regen.added,
      baseFingerprint:hash(best.candidate),fingerprint:hash(regen.candidate),attempts}));
  }
});
