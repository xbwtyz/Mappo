import { lareStepResult } from './reconciliation-steps.js';
import { LARE_LIMITS,LareBudgetExceeded } from './reconciliation-budget.js';
import { iterateLareParcelCandidates } from './reconciliation-parcels.js';
import { iterateLareBuildingCandidates } from './reconciliation-buildings.js';
import { buildingExteriorRingsS10 } from './building-geometry-adapter-s10.js';
import { shapesOverlapInterior } from './building-validation.js';
import { occupiedRegionsOverlapS10 } from './building-occupancy-s10.js';
import { compareLareScore,iterateLareSearch } from './reconciliation-search.js';

const lareArrangeCompare=(a,b)=>a<b?-1:a>b?1:0;
const lareArrangeDist=(a,b)=>a.reduce((s,p,i)=>s+Math.hypot(p.x-b[i].x,p.y-b[i].y),0);
const lareArrangeIndex=(state,id)=>state.assignments.find(row=>row.variable===id)?.choice.value;
const lareArrangePlotCost=(before,after)=>before.reduce((sum,p,i)=>sum+lareArrangeDist(p.boundary,after[i].boundary),0);
function lareArrangeOverlap(a,b,budget){
  budget.spend(Math.max(1,a.length+b.length));
  const axis=(ring,k)=>[Math.min(...ring.map(p=>p[k])),Math.max(...ring.map(p=>p[k]))];
  for(const k of ['x','y']){const x=axis(a,k),y=axis(b,k);
    if(x[1]<y[0]||y[1]<x[0])return false;}
  budget.spend(Math.max(1,4*a.length*b.length));
  return shapesOverlapInterior(a,b);
}
function lareArrangeBuildingOverlap(a,b,budget){
  const count=g=>g.regions.reduce((n,r)=>n+r.ring.length,0);
  const n=count(a.geometry),m=count(b.geometry);
  budget.spend(Math.max(1,n*n+m*m));
  return occupiedRegionsOverlapS10(a.geometry,b.geometry,{charge:(n=1)=>{if(n>0)budget.spend(n);}});
}
function lareArrangeRank(entries,parcelCandidates){
  return entries.slice().sort((a,b)=>parcelCandidates.get(a.property.id).length-parcelCandidates.get(b.property.id).length||
    b.buildings.filter(x=>x.permission.mode!=='rigid').length-a.buildings.filter(x=>x.permission.mode!=='rigid').length||
    lareArrangeCompare(a.property.id,b.property.id));
}
// Pure joint solver over actual parcel/plot and rigid building alternatives.
// Adapter supplies affected blocks, external obstacles and whole-project finalizer.
export function* iterateLareArrangement({entries,finalize,incumbent=null,enhanced=false,packing=false,concessionSource=null},budget){
  if(!Array.isArray(entries)||entries.length>LARE_LIMITS.affectedParcels||
    new Set(entries.map(e=>e.property.id)).size!==entries.length||typeof finalize!=='function')
    throw Error('Invalid local arrangement inventory.');
  const parcelCandidates=new Map(),byVariable=new Map(),buildingCache=new Map();
  let verifiedIncumbent=null;
  try{
    // Verify before candidate inventory can consume the shared work budget.
    if(incumbent){budget.spend();verifiedIncumbent = yield* lareStepResult(finalize(incumbent, true));
      if(verifiedIncumbent)compareLareScore(verifiedIncumbent.score,verifiedIncumbent.score);}
    for(const entry of entries.slice().sort((a,b)=>lareArrangeCompare(a.property.id,b.property.id))){
      const fixedRings=entry.buildings.filter(b=>b.permission.mode!=='rigid').flatMap(b=>buildingExteriorRingsS10(b.source));
      const candidates = yield* iterateLareParcelCandidates({ ...entry, fixedRings, compactDeformation: enhanced, packing }, budget);
      if(concessionSource&&enhanced&&!fixedRings.length&&entry.mode==='adaptive'){
        const extra=yield* concessionSource(entry);
        // Bound the joint inventory, retaining ordinary and concession
        // alternatives independently. Only the detached concession tier
        // uses this split; ordinary LARE candidate ordering is untouched.
        const normalLimit=extra.length?Math.min(12,candidates.length):candidates.length;
        const ordinary=candidates.slice(0,normalLimit),available=LARE_LIMITS.parcelCandidates-ordinary.length;
        const proposals=extra.slice(0,available).map((bundle,i)=>({
          property:bundle.property,plots:bundle.plots,buildingSeeds:[],
          concessionBuildings:bundle.buildings, family:'concession-'+bundle.family,
          score:lareArrangeDist(entry.property.boundary,bundle.property.boundary),
          order:Math.max(-1,...candidates.map(c=>c.order))+1+i
        }));
        candidates.splice(0,candidates.length,...ordinary,...proposals);
        yield {stage:'concession-inventory',id:entry.property.id,ordinary:ordinary.length,concessions:proposals.length};
      }
      parcelCandidates.set(entry.property.id, candidates);
      yield {stage:'parcel-inventory',id:entry.property.id,stats:budget.snapshot()};
    }
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    return {status:verifiedIncumbent?'candidate':'work-limit',best:verifiedIncumbent,stage:0,complete:0,stats:budget.snapshot(),exhausted:error.resource};
  }
  const sorted = lareArrangeRank(entries, parcelCandidates), variables = [], largestRigid = new Map();
  const addParcel = entry => {
    const id = 'property:' + entry.property.id;
    variables.push(id);
    byVariable.set(id, { entry });
  };
  if (!enhanced) sorted.forEach(addParcel);
  for (const entry of sorted) {
    if (enhanced) addParcel(entry);
    const ordered = entry.buildings.slice().sort((a, b) => (a.permission.mode === 'rigid') -
      (b.permission.mode === 'rigid') || b.source.area - a.source.area || lareArrangeCompare(a.source.id, b.source.id));
    largestRigid.set(entry, ordered.find(building => building.permission.mode === 'rigid'));
    for (const building of ordered) {
      const id = 'building:' + building.source.id;
      variables.push(id);
      byVariable.set(id, { entry, building });
    }
  }
  const buildingInventory = function* (entry, building, parcel) {
    // A parcel candidate and building descriptor belong to this arrangement
    // only. Retries and different fixed/rigid passes get separate inventories.
    if (!buildingCache.has(parcel)) buildingCache.set(parcel, new Map());
    const inventory = buildingCache.get(parcel);
    if (!inventory.has(building)) {
      const fixedBuildings = entry.buildings.filter(other => other.permission.mode !== 'rigid' &&
        other.source.id !== building.source.id).map(other => other.source);
      if(parcel.concessionBuildings){
        const candidate=parcel.concessionBuildings.find(b=>b.id===building.source.id);
        const center=b=>{const points=b.geometry.regions.flatMap(r=>r.ring);budget.spend(points.length);
          return {x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};};
        const old=center(building.source),next=candidate?center(candidate):null;
        inventory.set(building,candidate?[{building:candidate,family:'packed-seed',order:0,moved:1,
          displacement:Math.hypot(next.x-old.x,next.y-old.y),
          rotation:Math.abs(Math.atan2(Math.sin(candidate.orientation-building.source.orientation),Math.cos(candidate.orientation-building.source.orientation)))}]:[]);
        return inventory.get(building);
      }
      const candidates = yield* iterateLareBuildingCandidates({ source: building.source,
        permission: building.permission, oldProperty: entry.property, property: parcel.property,
        plots: parcel.plots, fixedBuildings, seedTransforms: parcel.buildingSeeds?.filter(seed=>seed.id===building.source.id)??[] }, budget);
      inventory.set(building, candidates);
    }
    return inventory.get(building);
  };
  const choices = function* (id, state) {
    const { entry, building } = byVariable.get(id);
    if (!building) return parcelCandidates.get(entry.property.id).map(candidate => ({
      key: String(candidate.order), value: candidate,
      score: [0, 0, 0, candidate.score, lareArrangePlotCost(entry.plots, candidate.plots), 0],
    }));
    const parcel = lareArrangeIndex(state, 'property:' + entry.property.id);
    if (!parcel) throw Error('Building choice has no selected property.');
    return (yield* buildingInventory(entry, building, parcel)).map(candidate => ({
      key: String(candidate.order), value: candidate,
      score: [candidate.moved, candidate.displacement, candidate.rotation, 0, 0, 0],
    }));
  };
  const compatible = function* (id, choice, state) {
    const {entry,building}=byVariable.get(id);
    if(!building){
      const assigned=state.assignments.filter(row=>row.variable.startsWith('property:')&&
        byVariable.get(row.variable).entry.property.blockId===entry.property.blockId);
      const boundary=choice.value.property.boundary;
      if(assigned.some(r=>lareArrangeOverlap(boundary,r.choice.value.property.boundary,budget)))return false;
      // Forward-check each still-unassigned neighbor against the retained
      // alternatives. This prevents the beam filling with already dead ends.
      const assignedIds=new Set(assigned.map(r=>byVariable.get(r.variable).entry.property.id));
      for(const neighbor of sorted){
        if(neighbor.property.id===entry.property.id||neighbor.property.blockId!==entry.property.blockId||
          assignedIds.has(neighbor.property.id))continue;
        yield { stage: 'parcel-compatibility', id: neighbor.property.id };
        if(!parcelCandidates.get(neighbor.property.id).some(c=>
          !lareArrangeOverlap(boundary,c.property.boundary,budget)&&
          assigned.every(r=>!lareArrangeOverlap(c.property.boundary,r.choice.value.property.boundary,budget))))return false;
      }
      const probe = enhanced ? largestRigid.get(entry) : null;
      if (probe) {
        budget.spend();
        if (!(yield* buildingInventory(entry, probe, choice.value)).length) return false;
      }
      return true;
    }
    return !state.assignments.some(row=>{
      if(!row.variable.startsWith('building:'))return false;
      return byVariable.get(row.variable).entry.property.id===entry.property.id&&
        lareArrangeBuildingOverlap(choice.value.building,row.choice.value.building,budget);
    });
  };
  const finalizeState=row=>{
    const parcels=row.assignments.filter(r=>r.variable.startsWith('property:')).map(r=>r.choice.value);
    const buildings=row.assignments.filter(r=>r.variable.startsWith('building:')).map(r=>r.choice.value.building);
    if(parcels.length!==entries.length||buildings.length!==entries.reduce((n,e)=>n+e.buildings.length,0))return null;
    return finalize({parcels,buildings,score:row.score,key:row.key},false);
  };
  // R7/R8 cooperative packing: cache a complete local building proposal
  // per parcel geometry; no locally successful bundle is an accepted edit.
  if (packing && enhanced && entries.some(e => e.buildings.some(b => b.permission.mode === 'rigid'))) {
    const groups=new Map(), cache=new Map(), proposals=[];
    for(const id of variables){
      if(!id.startsWith('property:'))continue;
      const block=byVariable.get(id).entry.property.blockId;
      if(!groups.has(block))groups.set(block,[]);
      groups.get(block).push(id);
    }
    const report=(status,exhausted=null)=>({status,best:verifiedIncumbent,stage:0,
      complete:verifiedIncumbent?1:0,stats:budget.snapshot(),exhausted});
    const zero=()=>({assignments:[],score:[0,0,0,0,0,0],key:''});
    const add=(row,id,choice)=>({assignments:[...row.assignments,{variable:id,choice}],
      score:row.score.map((v,i)=>v+choice.score[i]),key:row.key+JSON.stringify([id,choice.key])+';'});
    const join=(a,b)=>({assignments:[...a.assignments,...b.assignments],score:a.score.map((v,i)=>v+b.score[i]),key:a.key+b.key});
    let refused=false;
    try{
      for(const [block,ids] of groups){
        let used=0,deepest=0,blocked=null,bundles=0,cacheHits=0,bundleFailures=0,bundleLimits=0,pruned=0,pairTests=0,pairHits=0;
        const expand=()=>{if(used>=2048)throw new LareBudgetExceeded('block-expansions');budget.expand();used++;};
        const bundle=function*(id,choice){
          if(cache.has(choice.value)){budget.spend();cacheHits++;return cache.get(choice.value);}
          bundles++;
          const entry=byVariable.get(id).entry, root=add(zero(),id,choice);
          const domains=[];
          for(const building of entry.buildings){
            const bid='building:'+building.source.id;
            const options=(yield* choices(bid,root)).sort((a,b)=>Number(b.value.family==='packed-seed')-Number(a.value.family==='packed-seed'));
            if(!options.length){cache.set(choice.value,null);bundleFailures++;return null;}
            domains.push({id:bid,options});
          }
          domains.sort((a,b)=>a.options.length-b.options.length||lareArrangeCompare(a.id,b.id));
          let localUsed=0,limited=false;
          function* fill(depth,row){
            if(depth===domains.length)return row;
            const d=domains[depth];
            for(const option of d.options){
              if(localUsed>=256){limited=true;return null;}
              expand();localUsed++;
              if(!(yield* compatible(d.id,option,row)))continue;
              yield {stage:'bundle-building',id:d.id,stats:budget.snapshot()};
              const next=yield* fill(depth+1,add(row,d.id,option));
              if(next)return next;
              if(limited)return null;
            }
            return null;
          }
          const result=yield* fill(0,root);
          if(limited)bundleLimits++;
          else if(!result)bundleFailures++;
          // A bounded-out bundle is not an impossibility proof.
          // Record it as unavailable within this experiment's fixed cap.
          cache.set(choice.value,result);
          return result;
        };
        // Pair compatibility is immutable for this arrangement. Charge cache
        // reads too; exact geometry remains the original overlap predicate.
        const pairCache=new Map();
        const pairOK=(a,b)=>{
          budget.spend();
          if(pairCache.get(a.value)?.has(b.value)){pairHits++;return pairCache.get(a.value).get(b.value);}
          pairTests++;
          const ok=!lareArrangeOverlap(a.value.property.boundary,b.value.property.boundary,budget);
          if(!pairCache.has(a.value))pairCache.set(a.value,new Map());
          if(!pairCache.has(b.value))pairCache.set(b.value,new Map());
          pairCache.get(a.value).set(b.value,ok);pairCache.get(b.value).set(a.value,ok);
          return ok;
        };
        const available=option=>!cache.has(option.value)||Boolean(cache.get(option.value));
        function* visit(row,domains){
          const depth=ids.length-domains.size;
          if(depth>deepest){deepest=depth;blocked=null;}
          if(!domains.size)return row;
          // Do not retry known failed/capped local bundles in this run.
          for(const [id,options] of domains){
            const kept=options.filter(available);
            pruned+=options.length-kept.length;domains.set(id,kept);
            if(!kept.length){blocked=id;return null;}
          }
          const [id,options]=[...domains].sort((a,b)=>a[1].length-b[1].length||
            lareArrangeCompare(a[0],b[0]))[0];
          for(const option of options.slice().sort((a,b)=>Number(Boolean(b.value.buildingSeeds))-Number(Boolean(a.value.buildingSeeds)))){
            expand();
            if(!available(option))continue;
            const next=new Map();
            let viable=true;
            for(const [other,domain] of domains){
              if(other===id)continue;
              const kept=domain.filter(b=>available(b)&&pairOK(option,b));
              pruned+=domain.length-kept.length;
              yield {stage:'domain-forward',id,other,stats:budget.snapshot()};
              if(!kept.length){blocked=other;viable=false;break;}
              next.set(other,kept);
            }
            if(!viable)continue;
            const local=yield* bundle(id,option);
            if(!local)continue;
            yield {stage:'bundle-property',id,depth,stats:budget.snapshot()};
            const result=yield* visit(join(row,local),next);
            if(result)return result;
          }
          if(depth>=deepest)blocked=id;
          return null;
        }
        let local=null,failure=null;
        try{const domains=new Map();for(const id of ids)domains.set(id,yield* choices(id,zero()));
          local=yield* visit(zero(),domains);}
        catch(error){if(!(error instanceof LareBudgetExceeded))throw error;failure=error.resource;}
        yield {stage:'block-result',block,method:'pack-fit',status:local?'proposal':failure?'limited':'exhausted',
          depth:deepest,total:ids.length,blocked,expansions:used,exhausted:failure,bundles,cacheHits,bundleFailures,bundleLimits,pruned,pairTests,pairHits};
        if(local)proposals.push(local);else refused=true;
        if(failure&&failure!=='block-expansions')return report(verifiedIncumbent?'candidate':'work-limit',failure);
      }
      if(!refused&&proposals.length===groups.size){
        const candidate=yield* lareStepResult(finalizeState(proposals.reduce(join,zero())));
        yield {stage:'block-union',accepted:Boolean(candidate)};
        if(candidate&&(!verifiedIncumbent||compareLareScore(candidate.score,verifiedIncumbent.score)<0||
          (compareLareScore(candidate.score,verifiedIncumbent.score)===0&&candidate.key<verifiedIncumbent.key)))verifiedIncumbent=candidate;
      }
      // If local bundles did not yield a complete verified candidate, continue
      // into the existing greedy/beam path with remaining shared work.
      if(verifiedIncumbent)return report('candidate');
    }catch(error){if(!(error instanceof LareBudgetExceeded))throw error;
      return report(verifiedIncumbent?'candidate':'work-limit',error.resource);}
  }
  // Try the first fully compatible arrangement before expanding the entire
  // beam. This is a complete candidate, not a weaker acceptance path.
  // The verified result is retained even if subsequent search hits its cap.
  try{
    let row={assignments:[],score:[0,0,0,0,0,0],key:''},complete=true;
    for(const id of variables){
      let chosen=null;
      for (const option of yield* choices(id, row)) {
        budget.expand();
        if (yield* compatible(id, option, row)) { chosen = option; break; }
        yield {stage:'greedy-alternative',id,stats:budget.snapshot()};
      }
      if(!chosen){complete=false;break;}
      row={assignments:[...row.assignments,{variable:id,choice:chosen}],
        score:row.score.map((v,i)=>v+chosen.score[i]),key:row.key+JSON.stringify([id,chosen.key])+';'};
      yield {stage:'greedy-assignment',id,stats:budget.snapshot()};
    }
    if(complete){
      budget.spend();
      const candidate = yield* lareStepResult(finalizeState(row));
      if(candidate&&(!verifiedIncumbent||compareLareScore(candidate.score,verifiedIncumbent.score)<0||
        (compareLareScore(candidate.score,verifiedIncumbent.score)===0&&candidate.key<verifiedIncumbent.key)))
        verifiedIncumbent=candidate;
      yield {stage:'greedy-validation',stats:budget.snapshot()};
    }
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    return {status:verifiedIncumbent?'candidate':'work-limit',best:verifiedIncumbent,stage:0,complete:0,stats:budget.snapshot(),exhausted:error.resource};
  }
  const result=yield* iterateLareSearch({variables,choices,compatible,incumbent:verifiedIncumbent,
    finalize:(row,old)=>old?verifiedIncumbent:finalizeState(row)},budget);
  if(!result.best&&verifiedIncumbent)return {...result,status:'candidate',best:verifiedIncumbent};
  return result;
}
export function solveLareArrangement(request,budget){
  const iterator=iterateLareArrangement(request,budget);
  for(;;){const step=iterator.next();if(step.done)return step.value;}
}
