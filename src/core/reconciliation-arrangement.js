import { LARE_LIMITS,LareBudgetExceeded } from './reconciliation-budget.js';
import { generateLareParcelCandidates } from './reconciliation-parcels.js';
import { generateLareBuildingCandidates } from './reconciliation-buildings.js';
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
export function* iterateLareArrangement({entries,finalize,incumbent=null},budget){
  if(!Array.isArray(entries)||entries.length>LARE_LIMITS.affectedParcels||
    new Set(entries.map(e=>e.property.id)).size!==entries.length||typeof finalize!=='function')
    throw Error('Invalid local arrangement inventory.');
  const parcelCandidates=new Map(),byVariable=new Map(),buildingCache=new Map();
  let verifiedIncumbent=null;
  try{
    // Verify before candidate inventory can consume the shared work budget.
    if(incumbent){budget.spend();verifiedIncumbent=finalize(incumbent,true);
      if(verifiedIncumbent)compareLareScore(verifiedIncumbent.score,verifiedIncumbent.score);}
    for(const entry of entries.slice().sort((a,b)=>lareArrangeCompare(a.property.id,b.property.id))){
      const fixedRings=entry.buildings.filter(b=>b.permission.mode!=='rigid').flatMap(b=>buildingExteriorRingsS10(b.source));
      parcelCandidates.set(entry.property.id,generateLareParcelCandidates({...entry,fixedRings},budget));
      yield {stage:'parcel-inventory',id:entry.property.id,stats:budget.snapshot()};
    }
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    return {status:verifiedIncumbent?'candidate':'work-limit',best:verifiedIncumbent,stage:0,complete:0,stats:budget.snapshot(),exhausted:error.resource};
  }
  const sorted=lareArrangeRank(entries,parcelCandidates),variables=[];
  for(const e of sorted){const id='property:'+e.property.id;variables.push(id);byVariable.set(id,{entry:e});}
  for(const e of sorted){
    const ordered=e.buildings.slice().sort((a,b)=>(a.permission.mode==='rigid')-(b.permission.mode==='rigid')||
      b.source.area-a.source.area||lareArrangeCompare(a.source.id,b.source.id));
    for(const b of ordered){const id='building:'+b.source.id;variables.push(id);byVariable.set(id,{entry:e,building:b});}
  }
  const choices=(id,state)=>{
    const {entry,building}=byVariable.get(id);
    if(!building)return parcelCandidates.get(entry.property.id).map(c=>({key:String(c.order),value:c,
      score:[0,0,0,c.score,lareArrangePlotCost(entry.plots,c.plots),0]}));
    const parcel=lareArrangeIndex(state,'property:'+entry.property.id);
    if(!parcel)throw Error('Building choice has no selected property.');
    const key=JSON.stringify([building.source.id,parcel.order]);
    if(!buildingCache.has(key)){
      const fixedBuildings=entry.buildings.filter(b=>b.permission.mode!=='rigid'&&b.source.id!==building.source.id).map(b=>b.source);
      buildingCache.set(key,generateLareBuildingCandidates({source:building.source,permission:building.permission,
        oldProperty:entry.property,property:parcel.property,plots:parcel.plots,fixedBuildings},budget));
    }
    return buildingCache.get(key).map(c=>({key:String(c.order),value:c,score:[c.moved,c.displacement,c.rotation,0,0,0]}));
  };
  const compatible=(id,choice,state)=>{
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
        if(!parcelCandidates.get(neighbor.property.id).some(c=>
          !lareArrangeOverlap(boundary,c.property.boundary,budget)&&
          assigned.every(r=>!lareArrangeOverlap(c.property.boundary,r.choice.value.property.boundary,budget))))return false;
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
  // Try the first fully compatible arrangement before expanding the entire
  // beam. This is a complete candidate, not a weaker acceptance path.
  // The verified result is retained even if subsequent search hits its cap.
  try{
    let row={assignments:[],score:[0,0,0,0,0,0],key:''},complete=true;
    for(const id of variables){
      let chosen=null;
      for(const option of choices(id,row)){
        budget.expand();
        if(compatible(id,option,row)){chosen=option;break;}
        yield {stage:'greedy-alternative',id,stats:budget.snapshot()};
      }
      if(!chosen){complete=false;break;}
      row={assignments:[...row.assignments,{variable:id,choice:chosen}],
        score:row.score.map((v,i)=>v+chosen.score[i]),key:row.key+JSON.stringify([id,chosen.key])+';'};
      yield {stage:'greedy-assignment',id,stats:budget.snapshot()};
    }
    if(complete){
      budget.spend();
      const candidate=finalizeState(row);
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
