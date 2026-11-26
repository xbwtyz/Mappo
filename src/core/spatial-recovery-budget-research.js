// RESEARCH ONLY: derived from coordinator at 3b0b6dd6d3abac84ae7a1f15d261606c7e50d689.
// Never imported by editor or production bundle. Work-limit comparison only.
import { createSpatialOperation, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { createLareBudget, LareBudgetExceeded, LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';
import { searchSpatialNondestructiveRoadGroup, searchSpatialBuildingRetirementRoadGroup,
  searchSpatialPropertyRetirementRoadGroup, searchSpatialGroupedRetirementRoadGroup,
  restoreSpatialRoadRetirements, optimizeSpatialRoadRetirements, searchSpatialRetirementSubsetRoadGroup, discoverSpatialRoadRetirementEligibility,
  verifySpatialStrictRoadWitness, verifySpatialConcessionRoadWitness, verifySpatialRetirementWitness } from './spatial-recovery-road-adapter.js';
import { searchSpatialShellRegeneration, searchSpatialGroupRegeneration,
  verifySpatialShellRegeneration, verifySpatialGroupRegeneration } from './spatial-recovery-regeneration.js';
import { riEqual, riFreeze, riCompare } from './road-impact-model.js';
import { measureSpatialRetirementCost, improvesSpatialRetirementCost } from './spatial-recovery-score.js';

// Detached road coordinator, not a worker, UI, acceptance or allocation
// publisher. Every strategy uses a child of one caller-owned operation
// budget. Qualified nondestructive search order and limits are unchanged.
function sreRoadOperations(input){
  const operation=createSpatialOperation(input),p=operation.permissions;
  if(operation.family!=='road'||operation.operation!=='translate-road-group')
    throw Error('Unsupported unified road operation.');
  if(p.regeneration&&!p.destruction)throw Error('Regeneration requires destruction permission.');
  const retirement=createSpatialOperation({...operation,permissions:{...p,regeneration:false}});
  const preserving=createSpatialOperation({...retirement,permissions:{...retirement.permissions,destruction:false}});
  const building=createSpatialOperation({...retirement,permissions:{destruction:p.destruction}});
  return {operation,retirement,preserving,building};
}
const sreHasConcessions=op=>op.permissions.alternativeFrontage||op.permissions.uniformScaling;
const sreEmptyConcessions=()=>({frontageSwitches:[],scaledBuildings:[],footprintLoss:0});
function sreChild(parent,work,expansions=131072,reserve=0){
  const remaining=parent.snapshot();
  const cap={work:Math.min(work,remaining.remainingWork-reserve),
    stateExpansions:Math.min(expansions,remaining.remainingExpansions)};
  if(cap.work<1||cap.stateExpansions<1)return null;
  return createLareBudget(cap,{parent,ceiling:{...LARE_DEMOLITION_LIMITS,work:256000000}});
}
async function sreBind(project,from,to,delta,budget){
  if(riEqual(from,to))return delta;
  const candidate=await reconstructSpatialDelta(project,from,1,delta,budget);
  const rebound=await createSpatialDelta(project,candidate,to,1,budget);
  if(rebound.candidateFingerprint!==delta.candidateFingerprint)
    throw Error('Unified witness changed during intent binding.');
  return rebound;
}

// Independent replay dispatch derives all sub-intents from the external
// operation, never from an untrusted strategy report. No claimed costs,
// status, ledger, or provisional authorization can grant Apply authority.
export async function verifySpatialUnifiedRoadWitness(project,input,witness,budget,authorization=null){
  const {operation,retirement,preserving}=sreRoadOperations(input);
  if(!witness?.delta||!witness.basisDelta)throw Error('Missing unified witness.');
  if(witness.kind==='shell-regeneration'||witness.kind==='group-regeneration'){
    const verify=witness.kind==='shell-regeneration'?verifySpatialShellRegeneration:verifySpatialGroupRegeneration;
    return verify(project,operation,witness.basisDelta,witness.delta,authorization,budget);
  }
  if(authorization)throw Error('Unexpected regeneration authorization.');
  let basis;
  if(witness.kind==='nondestructive'){
    const verify=sreHasConcessions(preserving)?verifySpatialConcessionRoadWitness:verifySpatialStrictRoadWitness;
    basis=await verify(project,preserving,witness.basisDelta,budget);
  }else if(witness.kind==='retirement'){
    if(!operation.permissions.destruction)throw Error('Unauthorized retirement witness.');
    basis=await verifySpatialRetirementWitness(project,retirement,witness.basisDelta,budget);
  }else throw Error('Unsupported unified witness kind.');
  const candidate=await reconstructSpatialDelta(project,operation,1,witness.delta,budget);
  if(!riEqual(candidate,basis))throw Error('Unified witness differs from independently verified basis.');
  return candidate;
}

// Phase ceilings are scheduling boundaries within existing limits, not
// new allowances. Reserve enough work to bind a verified witness to the
// external operation before spending on optional improvements.
// Research-only child-first pass. Search derives candidate sets from the
// current independently verified incumbent, not from old fixture answers.
async function searchResearchChildRestoration(project,operation,seed,budget,seen){
  let incumbent={delta:seed.basisDelta,ledger:seed.ledger},exhausted=null;
  const attempts=[];
  const finish=()=>({status:'verified-witness',...incumbent,attempts,exhausted});
  try{
    const buildings=new Map(project.city.buildings.map(b=>[b.id,b]));
    budget.spend(Math.max(1,buildings.size));
    const p=operation.permissions;
    const scale=p.alternativeFrontage?(p.uniformScaling?1-p.maxLinearReduction:1):null;
    const children=()=>{
      const keys=new Set(incumbent.delta.retired.map(spatialRefKey));
      budget.spend(Math.max(1,keys.size));
      return incumbent.delta.retired.filter(r=>{
        budget.spend();
        return r.collection==='buildings'&&!keys.has(spatialRefKey({collection:'properties',id:buildings.get(r.id).propertyId}));
      }).sort((a,b)=>{budget.spend();return buildings.get(a.id).area-buildings.get(b.id).area||riCompare(a.id,b.id);});
    };
    for(const size of [4,2,1]){
      const rows=children();
      for(let i=0;i<rows.length;i+=size){
        if(attempts.length>=12)return finish();
        const keys=new Set(rows.slice(i,i+size).map(spatialRefKey));
        const remaining=incumbent.delta.retired.filter(r=>{budget.spend();return !keys.has(spatialRefKey(r));});
        if(!remaining.length||remaining.length===incumbent.delta.retired.length)continue;
        const key=JSON.stringify([remaining.map(spatialRefKey).sort(riCompare),scale]);
        if(seen.has(key))continue;
        const trialBudget=sreChild(budget,5000000,16384,20000);
        if(!trialBudget)return finish();
        seen.add(key);
        const row={size,restoring:incumbent.delta.retired.length-remaining.length,status:'refused',selected:false};
        attempts.push(row);
        try{
          const result=await searchSpatialRetirementSubsetRoadGroup(project,operation,remaining,trialBudget,{diagnosticScale:scale});
          row.status=result.status;row.exhausted=result.exhausted??null;
          if(result.status!=='verified-witness')continue;
          const expected=new Set(remaining.map(spatialRefKey));
          if(result.delta.added.length||result.delta.retired.length!==expected.size||
            result.delta.retired.some(r=>!expected.has(spatialRefKey(r))))throw Error('Unexpected research child retirement membership.');
          if(improvesSpatialRetirementCost(measureSpatialRetirementCost(result.ledger,trialBudget),measureSpatialRetirementCost(incumbent.ledger,trialBudget))){
            incumbent={delta:result.delta,ledger:result.ledger};row.selected=true;
          }
        }catch(error){
          if(!(error instanceof LareBudgetExceeded))throw error;
          row.exhausted=error.resource;
        }finally{row.work=trialBudget.snapshot().work;}
      }
    }
    return finish();
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    exhausted=error.resource;return finish();
  }
}
// Research-only two-for-one building exchange. All replacement retirement
// IDs come from original, independently derived eligibility; no net increase
// in any entity count, no parent/plot changes, no historical fixture answers.
async function searchResearchChildExchange(project,operation,seed,budget){
  let incumbent={delta:seed.basisDelta,ledger:seed.ledger},exhausted=null;
  const attempts=[],seen=new Set();
  const finish=()=>({status:'verified-witness',...incumbent,attempts,exhausted});
  try{
    const eligibility=discoverSpatialRoadRetirementEligibility(project,operation,budget);
    const buildings=new Map(project.city.buildings.map(b=>[b.id,b]));
    budget.spend(Math.max(1,buildings.size));
    const p=operation.permissions;
    const scale=p.alternativeFrontage?(p.uniformScaling?1-p.maxLinearReduction:1):null;
    for(let pass=0;pass<3;pass++){
      const retired=new Set(incumbent.delta.retired.map(spatialRefKey));
      budget.spend(Math.max(1,retired.size));
      const parentSurvives=r=>!retired.has(spatialRefKey({collection:'properties',id:buildings.get(r.id).propertyId}));
      const children=incumbent.delta.retired.filter(r=>{budget.spend();return r.collection==='buildings'&&parentSurvives(r);})
        .sort((a,b)=>{budget.spend();return buildings.get(a.id).area-buildings.get(b.id).area||riCompare(a.id,b.id);});
      const eligible=eligibility.buildingRefs.filter(r=>{budget.spend();return !retired.has(spatialRefKey(r))&&parentSurvives(r);});
      const proposals=[];
      // Bound enumeration before solving, and prefer freeing enough footprint
      // to fit both old children. This is a ranking hint, not a geometry gate.
      for(let i=0;i<children.length;i++){
        for(let j=i+1;j<children.length;j++){
          budget.spend();
          const a=buildings.get(children[i].id),b=buildings.get(children[j].id);
          if(!a.blockId||a.blockId!==b.blockId)continue;
          for(const ref of eligible){
            budget.spend();
            const c=buildings.get(ref.id);
            if(c.blockId!==a.blockId)continue;
            const key=JSON.stringify([children[i].id,children[j].id,ref.id]);
            if(seen.has(key))continue;
            const row={restore:[children[i],children[j]],retire:ref,key,margin:c.area-a.area-b.area};
            proposals.push(row);
          }
        }
      }
      proposals.sort((a,b)=>{budget.spend();return b.margin-a.margin||riCompare(a.key,b.key);});
      let improved=false;
      for(const proposal of proposals.slice(0,12-attempts.length)){
        const trialBudget=sreChild(budget,5000000,16384,20000);
        if(!trialBudget)return finish();
        seen.add(proposal.key);
        const restored=new Set(proposal.restore.map(spatialRefKey));
        const refs=incumbent.delta.retired.filter(r=>{budget.spend();return !restored.has(spatialRefKey(r));}).concat(proposal.retire);
        const row={restored:proposal.restore.map(r=>r.id),retired:proposal.retire.id,status:'refused',selected:false};
        attempts.push(row);
        try{
          const result=await searchSpatialRetirementSubsetRoadGroup(project,operation,refs,trialBudget,{diagnosticScale:scale});
          row.status=result.status;row.exhausted=result.exhausted??null;
          if(result.status!=='verified-witness')continue;
          const expected=new Set(refs.map(spatialRefKey));
          if(result.delta.added.length||result.delta.retired.length!==expected.size||
            result.delta.retired.some(r=>!expected.has(spatialRefKey(r))))throw Error('Unexpected exchange retirement membership.');
          if(improvesSpatialRetirementCost(measureSpatialRetirementCost(result.ledger,trialBudget),measureSpatialRetirementCost(incumbent.ledger,trialBudget))){
            incumbent={delta:result.delta,ledger:result.ledger};row.selected=true;improved=true;break;
          }
        }catch(error){
          if(!(error instanceof LareBudgetExceeded))throw error;
          row.exhausted=error.resource;
        }finally{row.work=trialBudget.snapshot().work;}
      }
      if(!improved||attempts.length>=12)break;
    }
    return finish();
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    exhausted=error.resource;return finish();
  }
}
export async function searchSpatialBudgetResearch(project,input,callerBudget,{workLimit,iterative=false,childPriority=false,childExchange=false}={}){
  if(typeof childExchange!=='boolean'||(childExchange&&!childPriority))throw Error('Unsupported exchange research setting.');
  if(typeof childPriority!=='boolean'||(childPriority&&!iterative))throw Error('Unsupported child priority research setting.');
  if(typeof iterative!=='boolean'||(iterative&&workLimit!==256000000))throw Error('Unsupported iterative research setting.');
  if(![32000000,64000000,128000000,256000000].includes(workLimit))throw Error('Unsupported research work limit.');
  if(callerBudget.snapshot().remainingWork!==workLimit||callerBudget.snapshot().work!==0||callerBudget.snapshot().remainingExpansions!==131072)throw Error('Research budget mismatch.');
  const context=null,schedule='diversified-restoration';
  const extra=workLimit-32000000,restoreExtra=Math.floor(extra*2/3),optimizeExtra=extra-restoreExtra;
  const {operation,retirement,preserving,building}=sreRoadOperations(input);
  const p=operation.permissions,attempts=[];
  if(!p.destruction||p.regeneration)throw Error('Research requires destruction and forbids regeneration.');
  if(!['baseline','grouped-first','diversified-restoration','shell-first-restoration','area-deficit-seed','area-deficit-direct'].includes(schedule))throw Error('Unsupported detached scheduling policy.');
  if(p.regeneration&&(context?.projectId!==operation.projectId||context?.revision!==operation.revision))
    throw Error('Missing or stale regeneration reservation context.');
  const limits={...LARE_DEMOLITION_LIMITS,work:workLimit};
  const budget=sreChild(callerBudget,limits.work,limits.stateExpansions);
  let incumbent=null,exhausted=null;
  const finish=()=>riFreeze({status:incumbent?'verified-witness':'refused',operation,
    kind:incumbent?.kind??null,delta:incumbent?.delta??null,basisDelta:incumbent?.basisDelta??null,
    ledger:incumbent?.ledger??null,provisionalAuthorization:incumbent?.provisionalAuthorization??null,
    attempts,exhausted,stats:callerBudget.snapshot()});
  if(!budget){exhausted='work';return finish();}
  const phase=async(name,cap,run,{expansions=131072,reserve=0}={})=>{
    const child=sreChild(budget,cap,expansions,reserve);
    if(!child){attempts.push({phase:name,status:'skipped-budget',stats:budget.snapshot()});return null;}
    const row={phase:name,status:'refused',stats:budget.snapshot()};attempts.push(row);
    try{
      const result=await run(child);
      row.status=result.status;row.exhausted=result.exhausted??null;row.work=child.snapshot().work;
      if(schedule==='area-deficit-direct'&&name==='grouped-retirement')row.seedTrials=result.attempts??[];
      if(childPriority&&name.startsWith('iterative-child-'))row.childTrials=result.attempts??[];
      if(childExchange&&name==='child-exchange')row.exchangeTrials=result.attempts??[];
      if(result.exhausted)exhausted=result.exhausted;
      return result.status==='verified-witness'?result:null;
    }catch(error){
      if(!(error instanceof LareBudgetExceeded))throw error;
      row.exhausted=error.resource;row.work=child.snapshot().work;exhausted=error.resource;return null;
    }
  };
  const setRetirement=async(result)=>{
    const delta=await sreBind(project,retirement,operation,result.delta,budget);
    incumbent={kind:'retirement',delta,basisDelta:result.delta,ledger:result.ledger};
  };
  try{
    const ordinary=await phase('nondestructive',8000000,
      b=>searchSpatialNondestructiveRoadGroup(project,preserving,b,{reusePackingInventory:true}),{expansions:32768});
    if(ordinary){
      const delta=await sreBind(project,preserving,operation,ordinary.delta,budget);
      incumbent={kind:'nondestructive',delta,basisDelta:ordinary.delta,
        ledger:{retired:[],demolishedFootprint:0,concessions:ordinary.ledger??sreEmptyConcessions()}};
      return finish(); // never search destructive or regenerative alternatives
    }
    if(!p.destruction)return finish();
    const bindReserve=1500000;
    // Diagnostic challenger: establish the broad eligible recovery first
    // and redirect unused small-subset allowances to restoration. Keep
    // the existing baseline schedule unchanged by default.
    if(schedule!=='baseline'){
      const grouped=await phase('grouped-retirement',18000000,
        b=>searchSpatialGroupedRetirementRoadGroup(project,retirement,b,
          {seedPolicy:schedule==='area-deficit-direct'?'area-deficit-direct':schedule==='area-deficit-seed'?'area-deficit':'baseline'}),{reserve:bindReserve});
      if(grouped)await setRetirement(grouped);
    }
    const legacy=incumbent?null:await phase('building-retirement',4000000,
      b=>searchSpatialBuildingRetirementRoadGroup(project,building,b),{expansions:16384,reserve:bindReserve});
    if(legacy){
      const delta=await sreBind(project,building,retirement,legacy.delta,budget);
      await verifySpatialRetirementWitness(project,retirement,delta,budget);
      await setRetirement({delta,ledger:{...legacy.ledger,concessions:sreEmptyConcessions()}});
    }
    if(!incumbent){
      const single=await phase('single-property-retirement',2000000,
        b=>searchSpatialPropertyRetirementRoadGroup(project,retirement,b),{expansions:8192,reserve:bindReserve});
      if(single)await setRetirement(single);
    }
    if(!incumbent&&schedule==='baseline'){
      const grouped=await phase('grouped-retirement',18000000,
        b=>searchSpatialGroupedRetirementRoadGroup(project,retirement,b),{reserve:bindReserve});
      if(grouped)await setRetirement(grouped);
    }
    if(!incumbent)return finish();
    // Preserve a fully bound incumbent before every optional phase. If
    // optimization runs out of work or rebinding fails on its budget,
    // the already validated witness remains available.
    const regenerationReserve=p.regeneration?4000000:0;
    const restored=await phase('restoration',12000000+restoreExtra,
      b=>restoreSpatialRoadRetirements(project,retirement,incumbent.basisDelta,b,
        {proposalPolicy:schedule==='shell-first-restoration'?'shell-first':['diversified-restoration','area-deficit-seed','area-deficit-direct'].includes(schedule)?'diversified':'baseline'}),
      {reserve:bindReserve+regenerationReserve});
    if(restored&&restored.delta.candidateFingerprint!==incumbent.basisDelta.candidateFingerprint)
      await setRetirement(restored);
    const optimized=await phase('optimization',6000000+optimizeExtra,
      b=>optimizeSpatialRoadRetirements(project,retirement,incumbent.basisDelta,b),
      {reserve:bindReserve+regenerationReserve});
    if(optimized&&optimized.delta.candidateFingerprint!==incumbent.basisDelta.candidateFingerprint)
      await setRetirement(optimized);
    // Research-only extra passes, seeded by the independently verified
    // current-operation incumbent, never by a historical witness.
    // Preserve the exact one-pass control when iterative is false.
    if(iterative){
      const improve=async(result)=>{
        if(!result||result.delta.candidateFingerprint===incumbent.basisDelta.candidateFingerprint)return false;
        const oldCost=measureSpatialRetirementCost(incumbent.ledger,budget);
        const newCost=measureSpatialRetirementCost(result.ledger,budget);
        if(!improvesSpatialRetirementCost(newCost,oldCost))return false;
        await setRetirement(result);return true;
      };
      const childSeen=new Set();
      for(let pass=1;pass<=3;pass++){
        let changed=false;
        // Alternate small shells and diversified batches, then re-rank
        // same-block exchanges against the current surviving identities.
        const policy=pass%2?'shell-first':'diversified';
        const restored=await phase('iterative-restoration-'+pass,45000000,
          b=>restoreSpatialRoadRetirements(project,retirement,incumbent.basisDelta,b,{proposalPolicy:policy}),{reserve:bindReserve});
        if(await improve(restored))changed=true;
        const optimized=childPriority?
          await phase('iterative-child-'+pass,32000000,
            b=>searchResearchChildRestoration(project,retirement,incumbent,b,childSeen),{reserve:bindReserve}):
          await phase('iterative-optimization-'+pass,32000000,
            b=>optimizeSpatialRoadRetirements(project,retirement,incumbent.basisDelta,b),{reserve:bindReserve});
        if(await improve(optimized))changed=true;
        if(!changed&&pass>=2)break; // explore both orderings once, then stop on plateau
        if(budget.snapshot().remainingWork<=bindReserve)break;
      }
    }
    if(childExchange){
      const exchanged=await phase('child-exchange',60000000,
        b=>searchResearchChildExchange(project,retirement,incumbent,b),{reserve:bindReserve});
      if(exchanged&&exchanged.delta.candidateFingerprint!==incumbent.basisDelta.candidateFingerprint&&
        improvesSpatialRetirementCost(measureSpatialRetirementCost(exchanged.ledger,budget),measureSpatialRetirementCost(incumbent.ledger,budget)))
        await setRetirement(exchanged);
    }
    if(p.regeneration){
      for(const [kind,search] of [['shell-regeneration',searchSpatialShellRegeneration],['group-regeneration',searchSpatialGroupRegeneration]]){
        const result=await phase(kind,kind==='shell-regeneration'?2000000:6000000,
          b=>search(project,operation,incumbent.basisDelta,context,b));
        if(result){
          incumbent={kind,delta:result.delta,basisDelta:incumbent.basisDelta,
            ledger:incumbent.ledger,provisionalAuthorization:result.provisionalAuthorization};
          break;
        }
      }
    }
    return finish();
  }catch(error){
    if(error instanceof LareBudgetExceeded){exhausted=error.resource;return finish();}
    throw error;
  }
}
