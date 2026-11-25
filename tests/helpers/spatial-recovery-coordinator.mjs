// Research-only generic coordinator. Domain adapters own geometry, intents,
// eligibility, candidate construction and independent validation.
// Policy is supplied separately from strategy descriptors. Nothing here
// grants production authorization or mutates the accepted project.
export function* iterateCoordinateRecovery({adapter,strategies,policy,signal}){
  const registry=new Map(strategies.map(s=>[s.id,s]));
  if(registry.size!==strategies.length)throw Error('Duplicate strategy id');
  if(!Number.isSafeInteger(policy.maxCalls)||policy.maxCalls<1)throw Error('Invalid call budget');
  const seen=new Set(),attempts=[];
  let calls=0,best=null,stop='exhausted';
  const canContinue=()=>!signal?.aborted&&calls<policy.maxCalls;
  function* attempt(plan){
    if(!canContinue())return false;
    const strategy=registry.get(plan.strategy);
    if(!strategy||!policy.permits(plan,strategy))return false;
    const key=JSON.stringify([strategy.id,adapter.key(plan)]);
    if(seen.has(key))return false;
    seen.add(key);calls++;
    yield {phase:'attempt-start',stage:plan.stage,strategy:strategy.id,calls};
    if(signal?.aborted)return false;
    let outcome;
    if(adapter.iterateSolve){
      const iterator=adapter.iterateSolve(plan,strategy);
      try{
        while(!signal?.aborted){
          const step=iterator.next();
          if(step.done){outcome=step.value;break;}
          // Expose only small serializable progress records, never mutable
          // candidate objects or the accepted city.
          yield {phase:'solver',stage:plan.stage,strategy:strategy.id,calls,
            solverStage:typeof step.value?.stage==='string'?step.value.stage:'work'};
        }
      }finally{iterator.return();}
    }else outcome=adapter.solve(plan,strategy);
    if(signal?.aborted)return false;
    if(!outcome?.candidate){
      attempts.push({stage:plan.stage,strategy:strategy.id,key:adapter.key(plan),
        outcome:'refused',issues:outcome?.issues??[]});
      return false;
    }
    // Invalid accepted candidates are hard failures, not hidden refusals.
    const details=adapter.verify(plan,strategy,outcome.candidate);
    const witness={plan,strategy,candidate:outcome.candidate,details};
    witness.cost=adapter.cost(witness);
    const chosen=!best||policy.improves(witness.cost,best.cost);
    attempts.push({stage:plan.stage,strategy:strategy.id,key:adapter.key(plan),
      outcome:chosen?'incumbent':'valid-alternative',cost:witness.cost});
    if(chosen)best=witness;
    yield {phase:'verified',stage:plan.stage,strategy:strategy.id,calls,chosen};
    return chosen;
  }
  for(const plan of adapter.initialPlans()){
    if(!canContinue())break;
    if(yield* attempt(plan))break;
  }
  if(best&&!policy.finished(best.cost)){
    for(let pass=0;pass<policy.maxPasses&&canContinue();pass++){
      let improved=false;
      for(const plan of adapter.improvementPlans(best)){
        if(!canContinue())break;
        if(yield* attempt(plan)){improved=true;break;}
      }
      if(!improved||policy.finished(best.cost))break;
    }
  }
  stop=signal?.aborted?'cancelled':calls>=policy.maxCalls?'call-limit':best?'candidate':'exhausted';
  return {best,attempts,calls,stop};
}

// Preserve the existing synchronous research API for older experiments.
export function coordinateRecovery(options){
  const iterator=iterateCoordinateRecovery(options);
  for(;;){const step=iterator.next();if(step.done)return step.value;}
}
