// Detached experiment: reject rank-dominated alternatives before geometry.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.argv[2];if(!root)throw Error('Detached checkout required');
const file=join(root,"src/core/reconciliation-search.js"),source=readFileSync(file,'utf8');
const before="          if(!keys.has(key)&&compatible(variable,choice,state)){\n            keys.add(key);\n            const score=lareSearchAdd(state.score,choice.score);\n            if(!best||compareLareScore(score,best.score)<=0){\n              next.push({assignments:[...state.assignments,{variable,choice}],score,key});\n              next.sort(lareSearchCompare);\n              if(next.length>LARE_LIMITS.beamWidth)next.pop();\n            }\n          }\n          yield {stage,stats:budget.snapshot()};",after="          const score=lareSearchAdd(state.score,choice.score);\n          // All score increments are nonnegative. Keep equal incumbent\n          // scores eligible, because final deterministic key may be better.\n          const incumbentDominated=best&&compareLareScore(score,best.score)>0;\n          const beamDominated=next.length===LARE_LIMITS.beamWidth&&\n            lareSearchCompare({score,key},next[next.length-1])>=0;\n          if(!incumbentDominated&&!beamDominated&&!keys.has(key)&&compatible(variable,choice,state)){\n            keys.add(key);\n            next.push({assignments:[...state.assignments,{variable,choice}],score,key});\n            next.sort(lareSearchCompare);\n            if(next.length>LARE_LIMITS.beamWidth)next.pop();\n          }\n          yield {stage:incumbentDominated?'rank-pruned-incumbent':beamDominated?'rank-pruned-beam':stage,stats:budget.snapshot()};";
assert.equal(source.split(before).length,2,'Experiment source mismatch');
writeFileSync(file,source.replace(before,after));
// Focused proof that rank-pruned states skip geometry while equal-score
// candidates remain eligible and expansion accounting remains unchanged.
const {runLareSearch}=await import(pathToFileURL(file).href);
const {createLareBudget}=await import(pathToFileURL(join(root,'src/core/reconciliation-budget.js')).href);
const score=n=>[n,0,0,0,0,0];
let checked=[];
const budget=createLareBudget();
const result=runLareSearch({variables:['p'],choices:()=>Array.from({length:12},(_,i)=>({key:String(i).padStart(2,'0'),score:score(i)})),compatible:(_id,c)=>{checked.push(c.key);return true;},finalize:(r)=>r},budget);
assert.equal(result.best.score[0],0);assert.equal(checked.length,8);assert.equal(budget.snapshot().expansions,12);
checked=[];
const equal=runLareSearch({variables:['p'],choices:()=>[{key:'a',score:score(0)},{key:'b',score:score(1)}],incumbent:{key:'z',score:score(0)},compatible:(_id,c)=>{checked.push(c.key);return true;},finalize:r=>r},createLareBudget());
assert.deepEqual(checked,['a']);assert.equal(equal.best.key,JSON.stringify(['p','a'])+';');
console.log('EXPERIMENT rank-first pruning: focused checks passed; geometry, expansion cap and final validation unchanged');
