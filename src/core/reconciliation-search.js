import { LARE_LIMITS,LareBudgetExceeded } from './reconciliation-budget.js';

// Hard constraints are not penalty scores. Rank valid alternatives by moved
// count, displacement, rotation, parcel change, plot change, access change.
export const LARE_SCORE_SIZE=6;
const lareSearchZero=()=>Array(LARE_SCORE_SIZE).fill(0);
const lareSearchValid=s=>Array.isArray(s)&&s.length===LARE_SCORE_SIZE&&s.every(x=>Number.isFinite(x)&&x>=0);
const lareSearchAdd=(a,b)=>a.map((x,i)=>x+b[i]);
export function compareLareScore(a,b){
  if(!lareSearchValid(a)||!lareSearchValid(b))throw Error('Invalid LARE score.');
  for(let i=0;i<LARE_SCORE_SIZE;i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;
  return 0;
}
const lareSearchCompare=(a,b)=>compareLareScore(a.score,b.score)||(a.key<b.key?-1:a.key>b.key?1:0);
function lareSearchBest(best,row){return !best||lareSearchCompare(row,best)<0?row:best;}
function lareSearchVerified(row){
  if(!lareSearchValid(row.score)||typeof row.key!=='string')throw Error('Invalid verified arrangement rank.');
  return row;
}
// The finalizer is the only route to a complete candidate. Yield after
// expansions so preview scheduling and synchronous Apply share one algorithm.
function* lareSearchCore({variables,choices,compatible=()=>true,finalize},budget,best=null){
  if(!budget?.expand||!budget?.spend||!Array.isArray(variables)||
    new Set(variables).size!==variables.length||typeof choices!=='function'||typeof finalize!=='function')
    throw Error('Invalid cooperative search contract.');
  let beam=[{assignments:[],score:lareSearchZero(),key:''}],stage=0,complete=0;
  const report=status=>({status,best,stage,complete,stats:budget.snapshot()});
  try{
    for(const variable of variables){
      const next=[],keys=new Set();
      for(const state of beam){
        const alternatives=choices(variable,state);
        if(!Array.isArray(alternatives))throw Error('Search alternatives must be an array.');
        for(const choice of alternatives){
          budget.expand();
          if(typeof choice.key!=='string'||!lareSearchValid(choice.score))throw Error('Invalid search alternative.');
          const key=JSON.stringify([state.key,variable,choice.key]);
          if(!keys.has(key)&&compatible(variable,choice,state)){
            keys.add(key);
            const score=lareSearchAdd(state.score,choice.score);
            if(!best||compareLareScore(score,best.score)<=0){
              next.push({assignments:[...state.assignments,{variable,choice}],score,key});
              next.sort(lareSearchCompare);
              if(next.length>LARE_LIMITS.beamWidth)next.pop();
            }
          }
          yield {stage,stats:budget.snapshot()};
        }
      }
      beam=next;stage++;
      if(!beam.length)return report(best?'candidate':'search-exhausted');
    }
    for(const row of beam){
      budget.spend();const verified=finalize(row,false);
      if(verified){
        lareSearchVerified(verified);
        if(compareLareScore(verified.score,row.score)<0)throw Error('Final score violates the partial lower bound.');
        complete++;best=lareSearchBest(best,verified);
      }
      yield {stage,stats:budget.snapshot()};
    }
    return report(best?'candidate':'search-exhausted');
  }catch(error){
    if(error instanceof LareBudgetExceeded)return {...report(best?'candidate':'work-limit'),exhausted:error.resource};
    throw error;
  }
}
export function* iterateLareSearch(request,budget){
  let best=null;
  try{
    if(request.incumbent){budget.spend();const row=request.finalize(request.incumbent,true);
      if(row)best=lareSearchVerified(row);}
  }catch(error){
    if(error instanceof LareBudgetExceeded)return {status:'work-limit',best:null,stage:0,complete:0,stats:budget.snapshot(),exhausted:error.resource};
    throw error;
  }
  return yield* lareSearchCore(request,budget,best);
}
export function runLareSearch(request,budget){
  const iterator=iterateLareSearch(request,budget);
  for(;;){const step=iterator.next();if(step.done)return step.value;}
}
