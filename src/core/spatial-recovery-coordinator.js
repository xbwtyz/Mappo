import { createSpatialOperation, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { createLareBudget, LareBudgetExceeded, LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';
import { searchSpatialNondestructiveRoadGroup, searchSpatialBuildingRetirementRoadGroup,
  searchSpatialPropertyRetirementRoadGroup, searchSpatialGroupedRetirementRoadGroup,
  restoreSpatialRoadRetirements, optimizeSpatialRoadRetirements, searchSpatialRetirementSubsetRoadGroup,
  verifySpatialStrictRoadWitness, verifySpatialConcessionRoadWitness, verifySpatialRetirementWitness } from './spatial-recovery-road-adapter.js';
import { searchSpatialShellRegeneration, searchSpatialGroupRegeneration,
  verifySpatialShellRegeneration, verifySpatialGroupRegeneration } from './spatial-recovery-regeneration.js';
import { riEqual, riFreeze } from './road-impact-model.js';
import { restoreSpatialPriorityChildren, SRE_HIGH_QUALITY_LIMITS } from './spatial-recovery-quality.js';
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
function sreChild(parent,work,expansions=131072,reserve=0,ceiling=LARE_DEMOLITION_LIMITS){
  const remaining=parent.snapshot();
  const cap={work:Math.min(work,remaining.remainingWork-reserve),
    stateExpansions:Math.min(expansions,remaining.remainingExpansions)};
  if(cap.work<1||cap.stateExpansions<1)return null;
  return createLareBudget(cap,{parent,ceiling});
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
export async function searchSpatialUnifiedRoadGroup(project,input,callerBudget,{context=null,quality='standard',schedule=quality==='high'?'diversified-restoration':'baseline'}={}){
  const {operation,retirement,preserving,building}=sreRoadOperations(input);
  const p=operation.permissions,attempts=[];
  if(!['standard','high'].includes(quality))throw Error('Unsupported detached recovery quality.');
  const high=quality==='high';
  if(high){
    if(!p.destruction||p.regeneration||schedule!=='diversified-restoration')
      throw Error('High quality requires explicit destruction permission, diversified scheduling and no regeneration.');
    const snapshot=callerBudget.snapshot();
    if(snapshot.work!==0||snapshot.expansions!==0||snapshot.remainingWork!==SRE_HIGH_QUALITY_LIMITS.work||
      snapshot.remainingExpansions!==SRE_HIGH_QUALITY_LIMITS.stateExpansions)throw Error('High quality requires a fresh matching operation budget.');
  }
  const extra=high?SRE_HIGH_QUALITY_LIMITS.work-LARE_DEMOLITION_LIMITS.work:0;
  const restoreExtra=Math.floor(extra*2/3),optimizeExtra=extra-restoreExtra;
  if(!['baseline','grouped-first','diversified-restoration','shell-first-restoration','area-deficit-seed','area-deficit-direct'].includes(schedule))throw Error('Unsupported detached scheduling policy.');
  if(p.regeneration&&(context?.projectId!==operation.projectId||context?.revision!==operation.revision))
    throw Error('Missing or stale regeneration reservation context.');
  const limits=high?SRE_HIGH_QUALITY_LIMITS:p.destruction?LARE_DEMOLITION_LIMITS:LARE_PRESERVATION_LIMITS;
  const ceiling=high?SRE_HIGH_QUALITY_LIMITS:LARE_DEMOLITION_LIMITS;
  const budget=sreChild(callerBudget,limits.work,limits.stateExpansions,0,ceiling);
  let incumbent=null,exhausted=null;
  const finish=()=>riFreeze({status:incumbent?'verified-witness':'refused',operation,
    kind:incumbent?.kind??null,delta:incumbent?.delta??null,basisDelta:incumbent?.basisDelta??null,
    ledger:incumbent?.ledger??null,provisionalAuthorization:incumbent?.provisionalAuthorization??null,
    attempts,exhausted,stats:callerBudget.snapshot()});
  if(!budget){exhausted='work';return finish();}
  const phase=async(name,cap,run,{expansions=131072,reserve=0}={})=>{
    const child=sreChild(budget,cap,expansions,reserve,ceiling);
    if(!child){attempts.push({phase:name,status:'skipped-budget',stats:budget.snapshot()});return null;}
    const row={phase:name,status:'refused',stats:budget.snapshot()};attempts.push(row);
    try{
      const result=await run(child);
      row.status=result.status;row.exhausted=result.exhausted??null;row.work=child.snapshot().work;
      if(schedule==='area-deficit-direct'&&name==='grouped-retirement')row.seedTrials=result.attempts??[];
      if(high&&name.startsWith('iterative-child-'))row.childTrials=result.attempts??[];
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
    const restored=await phase('restoration',(schedule==='baseline'?6000000:12000000)+restoreExtra,
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
    // High-quality improvement passes start from the verified incumbent.
    // The standard path remains the existing one-pass coordinator.
    if(high){
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
        // Alternate small shells and diversified batches, then prioritize
        // restoration of retired children on surviving properties.
        const policy=pass%2?'shell-first':'diversified';
        const restored=await phase('iterative-restoration-'+pass,45000000,
          b=>restoreSpatialRoadRetirements(project,retirement,incumbent.basisDelta,b,{proposalPolicy:policy}),{reserve:bindReserve});
        if(await improve(restored))changed=true;
        const optimized=await phase('iterative-child-'+pass,32000000,
          b=>restoreSpatialPriorityChildren(project,retirement,incumbent,b,childSeen),{reserve:bindReserve});
        if(await improve(optimized))changed=true;
        if(!changed&&pass>=2)break; // explore both orderings once, then stop on plateau
        if(budget.snapshot().remainingWork<=bindReserve)break;
      }
    }
    // Combine fast identity-first recovery with least-disruptive same-set
    // solver selection. Spend only remaining shared operation allowance.
    // Every trial independently verifies the original-to-final retirement
    // witness; exact retirement membership and strict cost improvement
    // are required before replacing the fully bound incumbent.
    if(high&&p.alternativeFrontage&&p.uniformScaling){
      for(const scale of [1,.95,.9,.85,.8]){
        if(scale<1-p.maxLinearReduction-1e-9)continue;
        const oldCost=measureSpatialRetirementCost(incumbent.ledger,budget);
        if(oldCost.scaleLoss<=1e-6)break;
        const refs=incumbent.basisDelta.retired;
        const result=await phase('final-refinement-'+scale,5000000,
          b=>searchSpatialRetirementSubsetRoadGroup(project,retirement,refs,b,{diagnosticScale:scale}),
          {expansions:16384,reserve:bindReserve});
        if(!result)continue;
        const expected=new Set(refs.map(spatialRefKey));
        if(result.delta.added.length||result.delta.retired.length!==expected.size||
          result.delta.retired.some(r=>!expected.has(spatialRefKey(r))))throw Error('Unexpected final refinement retirement membership.');
        const newCost=measureSpatialRetirementCost(result.ledger,budget);
        if(improvesSpatialRetirementCost(newCost,oldCost))await setRetirement(result);
      }
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
