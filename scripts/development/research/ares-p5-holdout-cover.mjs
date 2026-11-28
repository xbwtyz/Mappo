import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
// Pure diagnostic hitting set. Coverage is necessary for the fixed baseline
// contacts, never a claim of geometric feasibility or editing authority.
export function measureContactCover(input,budget){
  const unique=new Map();
  for(const c of input){budget.spend(1+c.length);const v=[...new Set(c)].sort();unique.set(JSON.stringify(v),v);}
  const clauses=[...unique.values()].sort((a,b)=>a.length-b.length||JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  if(clauses.some(c=>!c.length))return {status:'no-endpoint-cover',minimum:null,lower:null,upper:null,witness:null,emptyClauses:input.filter(c=>!c.length).length};
  if(!clauses.length)return {status:'exact',minimum:0,lower:0,upper:0,witness:[],emptyClauses:0};
  const covers=(set,c)=>{budget.spend(1+c.length);return c.some(id=>set.has(id));};
  function lower(cs){
    const used=new Set();let n=0;
    for(const c of cs){budget.spend(1+c.length);if(c.every(id=>!used.has(id))){n++;for(const id of c)used.add(id);}}
    return n;
  }
  let lb=0,best=null;
  try{
    lb=lower(clauses);
    // Greedy cover provides an upper bound, not a geometric solution.
    let remaining=clauses,seed=new Set();
    while(remaining.length){
      const counts=new Map();
      for(const c of remaining)for(const id of c){budget.spend();counts.set(id,(counts.get(id)??0)+1);}
      const id=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||a.localeCompare(b,'en'))[0];
      seed.add(id);remaining=remaining.filter(c=>!covers(seed,c));
    }
    best=[...seed].sort();
    const seen=new Set();
    function visit(chosen){
      budget.expand();const key=JSON.stringify([...chosen].sort());budget.spend(1+chosen.size);
      if(seen.has(key))return;seen.add(key);
      const unmet=clauses.filter(c=>!covers(chosen,c));
      if(!unmet.length){if(chosen.size<best.length)best=[...chosen].sort();return;}
      if(chosen.size+lower(unmet)>=best.length)return;
      for(const id of unmet[0]){budget.spend();const next=new Set(chosen);next.add(id);visit(next);}
    }
    if(lb<best.length)visit(new Set());
    if(!clauses.every(c=>covers(new Set(best),c)))throw Error('Cover witness invalid.');
    return {status:'exact',minimum:best.length,lower:best.length,upper:best.length,witness:best,emptyClauses:0};
  }catch(e){if(!(e instanceof LareBudgetExceeded))throw e;return {status:'bounded-unknown',minimum:null,lower:lb,upper:best?.length??null,witness:best,emptyClauses:0,reason:e.resource};}
}

// Connectivity convention matches X7: eligible vertices may connect through
// the fixed selected group; every extra eligible connector counts in the cap.
// Exhaustive only through cap=4, no larger movement permission is inferred.
export function measureConnectedFour(clauses,adj,budget){
  if(clauses.some(c=>!c.length))return {status:'no-endpoint-cover',witness:null};
  if(!clauses.length)return {status:'within-four',witness:[]};
  const seen=new Set();
  function visit(chosen){
    budget.expand();const ids=[...chosen].sort(),key=JSON.stringify(ids);
    budget.spend(1+ids.length);if(seen.has(key))return null;seen.add(key);
    const unmet=clauses.find(c=>{budget.spend(1+c.length);return !c.some(id=>chosen.has(id));});
    let branch=unmet;
    if(!unmet){
      const reached=new Set([ids[0]]),queue=[ids[0]];
      for(const n of queue)for(const v of adj.get(n)??[]){budget.spend();if(chosen.has(v)&&!reached.has(v)){reached.add(v);queue.push(v);}}
      if(reached.size===chosen.size)return ids;
      const frontier=new Set();
      for(const n of reached)for(const v of adj.get(n)??[]){budget.spend();if(!chosen.has(v))frontier.add(v);}
      branch=[...frontier].sort();
    }
    if(chosen.size>=4)return null;
    for(const id of branch){budget.spend();const next=new Set(chosen);next.add(id);const found=visit(next);if(found)return found;}
    return null;
  }
  try{const witness=visit(new Set());return {status:witness?'within-four':'requires-more-than-four-or-disconnected',witness};}
  catch(e){if(!(e instanceof LareBudgetExceeded))throw e;return {status:'bounded-unknown',witness:null,reason:e.resource};}
}
