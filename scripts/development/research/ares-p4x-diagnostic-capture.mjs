import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {riCompare} from '../../../src/core/road-impact-model.js';
const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
export function createDiagnosticCapture(){
  const counts=new Map(),phases={},nested={};
  let best=null,completed=0,rejected=0,pairRejected=0,dropped=0;
  function measure(name,b,fn,inner=false){
    const before=b.snapshot().work;
    try{return fn();}finally{const table=inner?nested:phases;table[name]=(table[name]??0)+b.snapshot().work-before;}
  }
  return {
    measure,
    *trials(stream,b){
      try{for(;;){const next=measure('proposal',b,()=>stream.next());if(next.done)return;yield next.value;}}
      finally{stream.return?.();}
    },
    record(checked,neighbors,attempt,strategy,b){
      if(checked.issues.includes('graph-work-limit'))return;
      const pairs=(checked.conflictPairs??[]).map(p=>({code:p.code,roadIds:[...p.roadIds]}));
      b.spend(1+pairs.length*4+checked.issues.length);
      const other=checked.issues.filter(c=>!pairCode(c)).length;
      const score=[other,pairs.length];
      const improved=!best||score[0]<best.score[0]||(score[0]===best.score[0]&&score[1]<best.score[1]);
      const candidate=!checked.valid&&pairs.length&&improved?{attempt,strategy,score,issues:[...checked.issues],pairs,neighbors:neighbors.map(n=>({id:n.id,old:{...n.old},point:{...n.point}}))}:null;
      if(candidate)aresReplayJson(candidate,b);
      // Charge before updating bounded counters. No partial candidate
      // retained if diagnostic accounting exhausts the existing root.
      b.spend(1+pairs.length);
      completed++;
      if(checked.valid)return;
      rejected++;if(pairs.length)pairRejected++;
      const once=new Set();
      for(const p of pairs){
        const key=JSON.stringify([p.code,p.roadIds]);if(once.has(key))continue;once.add(key);
        if(counts.has(key))counts.get(key).count++;
        else if(counts.size<1024)counts.set(key,{...p,count:1});
        else dropped++;
      }
      if(candidate)best=candidate;
    },
    finish(){
      // Serialization only; all retained rows and counters were metered.
      // Fixed bound of 1024 distinct keys and one candidate, no new search.
      const recurrence=[...counts.values()].sort((a,b)=>b.count-a.count||riCompare(JSON.stringify(a.roadIds),JSON.stringify(b.roadIds))||riCompare(a.code,b.code));
      return {version:1,completed,rejected,pairRejected,dropped,phases:{...phases},nested:{...nested},best,recurrence};
    }
  };
}
