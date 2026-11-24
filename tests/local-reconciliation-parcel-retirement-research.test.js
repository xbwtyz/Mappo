// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
import {classifyRoadProvenance} from '../src/core/road-provenance.js';
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
function verifyOriginal(project,candidate,draft,reviewed){
  // Recompute the entire removal set from the original and final inventories;
  // no trust in the candidate solver's retirement ledger.
  const missing={};
  for(const key of ['properties','plots','buildings']){
    const now=new Set(candidate.city[key].map(r=>r.id));
    missing[key]=sorted(project.city[key].filter(r=>!now.has(r.id)).map(r=>r.id));
    assert.deepEqual(missing[key],reviewed[key],'Unreviewed retirement');
    assert.equal(candidate.city[key].length,project.city[key].length-missing[key].length);
  }
  assert.deepEqual(removedSets(inventory(project,draft),missing.properties),missing);
  const reduced=reduce(project,missing);
  const reducedDraft=prepareRoadGroupIntentB1(reduced,roadIds,draft.offset);
  assert.deepEqual(reducedDraft.proposedNodes,draft.proposedNodes,'Different final road target');
  const violation=verifyLareGroupPreservation(reduced,candidate,reducedDraft,new Map(),createLareBudget());
  assert.equal(violation,null,JSON.stringify(violation));
  validateStoredProject(candidate);
  const context={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:createLareContext(project,draft,new Map(),createLareBudget()).blockIds,acceptedValid:true};
  const {emit,items}=riReporter(),spend=riBudget();
  inspectRoadDependencies(candidate.city,candidate.city,context,emit,spend,project.city);
  inspectRoadContextReferences(project.city,candidate.city,context,emit,spend);
  const issues=items().filter(r=>r.severity!=='info'&&r.code!=='frontage-geometry'&&!(r.kind==='plot'&&r.code==='property-containment'));
  assert.deepEqual(issues,[],'Original infrastructure/land dependency failure');
}
function verifyHistory(project,candidate,sets){
  const ws=reconcileRoadWorkspace(defaultWorkspace(project),project.city,candidate.city);
  const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,ws)));
  assert.equal(hash(reopened.project),hash(candidate));assert.equal(hash(reopened.workspace),hash(ws));
  const history=new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project,candidate,{family:'road',operation:'research-retire-generated-parcels',
    label:'Research road and parcel retirement',targetIds:[...roadIds,...sets.properties]}).status,'recorded');
  const undo=history.prepare('undo',candidate,ws);assert.ok(undo.ok,undo.reason);
  assert.equal(hash(undo.candidate),hash(project));history.accept('undo',undo.entry,undo.candidate);
  const redo=history.prepare('redo',undo.candidate,undo.workspace);assert.ok(redo.ok,redo.reason);
  assert.equal(hash(redo.candidate),hash(candidate));history.accept('redo',redo.entry,redo.candidate);
}
test('detached whole generated parcel retirement with bounded restoration', {timeout:600000},()=>{
  const summary={attempted:0,recovered:0,broadRecovered:0,compressedRecovered:0,unresolved:0};
  for(const irregularProperties of [false,true]){
    const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    validateStoredProject(project);
    const before=hash(project),oldNodes=new Map(project.city.nodes.map(n=>[n.id,n]));
    for(const scale of [1,.75,-.5,-1]){
      const offset={x:baseOffset.x*scale,y:baseOffset.y*scale};
      const draft=prepareRoadGroupIntentB1(project,roadIds,offset),topology=readRoadGroupTopologyB1(project,draft);
      assert.ok(topology?.graph.valid&&topology?.faces.valid&&topology?.identity.valid);
      const eligible=inventory(project,draft),all=sorted(eligible.keys());
      assert.ok(all.length>0,'No eligible retirement groups');
      const compressed=new Set();
      for(const b of project.city.blocks.filter(b=>[...eligible.values()].some(p=>p.block===b.id))){
        const old=Math.abs(polygonSignedArea(b.vertices.map(v=>oldNodes.get(v))));
        const next=Math.abs(polygonSignedArea(b.vertices.map(v=>topology.graph.nodesById.get(v))));
        if(next<old-1e-6)compressed.add(b.id);
      }
      const attempts=[],cache=new Map();
      const trial=(ids,label)=>{
        ids=sorted(ids);
        const key=JSON.stringify(ids);if(cache.has(key))return cache.get(key);
        const sets=removedSets(eligible,ids);
        let reduced,result;
        try{reduced=reduce(project,sets);}
        catch(error){attempts.push({label,properties:ids.length,outcome:'reduction-refused',message:error.message});cache.set(key,null);return null;}
        const reducedBefore=hash(reduced);
        result=prepareRoadGroupReflowB1(reduced,roadIds,offset);
        assert.equal(hash(reduced),reducedBefore);assert.equal(hash(project),before);
        if(!result.candidateProject){
          attempts.push({label,properties:ids.length,buildings:sets.buildings.length,outcome:'reflow-refused',
            issues:result.unresolved.map(i=>i.code)});
          cache.set(key,null);return null;
        }
        // A failed independent gate must fail the test rather than count
        // as an accepted witness.
        verifyOriginal(project,result.candidateProject,draft,sets);
        const witness={sets,candidate:result.candidateProject,ids,area:ids.reduce((n,id)=>n+eligible.get(id).area,0)};
        attempts.push({label,properties:ids.length,buildings:sets.buildings.length,plots:sets.plots.length,outcome:'accepted'});
        cache.set(key,witness);return witness;
      };
      const broad=trial(all,'all-eligible');
      const narrower=trial(all.filter(id=>compressed.has(eligible.get(id).block)),'compressed-blocks');
      if(broad)summary.broadRecovered++;if(narrower)summary.compressedRecovered++;
      let best=narrower??broad;
      if(best){
        // Deterministic restore blocks, then high-footprint parcels.
        // Max 12 additional calls. This does not prove minimal destruction.
        const blocks=unique(best.ids.map(id=>eligible.get(id).block));
        let restores=0;
        for(const block of blocks){
          if(restores++>=12)break;
          const next=trial(best.ids.filter(id=>eligible.get(id).block!==block),'restore-block:'+block);
          if(next)best=next;
        }
        const restore=best.ids.slice().sort((a,b)=>eligible.get(b).footprint-eligible.get(a).footprint||a.localeCompare(b));
        for(const id of restore){
          if(restores++>=12)break;
          const next=trial(best.ids.filter(x=>x!==id),'restore-property:'+id);
          if(next)best=next;
        }
        verifyOriginal(project,best.candidate,draft,best.sets);
        // Fresh solve, no cached witness; exact replay from original.
        const replay=prepareRoadGroupReflowB1(reduce(project,best.sets),roadIds,offset);
        assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
        verifyHistory(project,best.candidate,best.sets);
        if(best.sets.properties.length){
          const wrong={...best.sets,properties:best.sets.properties.slice(1)};
          assert.throws(()=>verifyOriginal(project,best.candidate,draft,wrong),'Unreviewed retirement accepted');
        }
        summary.recovered++;
      }else summary.unresolved++;
      summary.attempted++;
      assert.equal(hash(project),before,'Original accepted city mutated');
      console.log('PARCEL_RETIREMENT_CASE '+JSON.stringify({irregularProperties,scale,eligible:all.length,
        broad:Boolean(broad),compressed:Boolean(narrower),attempts,accepted:Boolean(best),
        removed:best?.sets,area:best?.area,fingerprint:best?hash(best.candidate):null}));
    }
  }
  console.log('PARCEL_RETIREMENT_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.attempted,8);
});
