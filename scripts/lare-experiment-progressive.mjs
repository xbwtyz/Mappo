// Detached experiment: bounded first-pass inventory, full fallback with the same global budget.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];if(!root)throw Error('Detached checkout required');
function edit(path,fn){const file=join(root,path);let source=readFileSync(file,'utf8');const replace=(a,b)=>{assert.ok(source.includes(a),'Experiment source mismatch: '+a);source=source.replace(a,b);};fn(replace);writeFileSync(file,source);}
edit('src/core/reconciliation-parcels.js',replace=>{
 replace("fixedNeighbors=[],mode='adaptive'},budget)","fixedNeighbors=[],mode='adaptive',attemptLimit=192},budget)");
 // All existing attempt guards share the experimental cap; candidate checks are identical.
});
const parcel=join(root,'src/core/reconciliation-parcels.js');
let source=readFileSync(parcel,'utf8');
assert.equal((source.match(/attempts(?:\+\+)?\s*>=192/g)||[]).length,5);
source=source.replace(/(attempts(?:\+\+)?\s*>=)192/g,'$1attemptLimit');
writeFileSync(parcel,source);
edit('src/core/reconciliation-arrangement.js',replace=>{
 replace('{entries,finalize,incumbent=null},budget)','{entries,finalize,incumbent=null,attemptLimit=192},budget)');
 replace('generateLareParcelCandidates({...entry,fixedRings},budget)','generateLareParcelCandidates({...entry,fixedRings,attemptLimit},budget)');
});
edit('src/core/reconciliation-road-group.js',replace=>{
 replace('    let outcome=yield* iterateLareArrangement({entries:fixed,finalize,incumbent},budget);\n    if(outcome.best)incumbent=outcome.best;\n    if(!outcome.exhausted&&(!incumbent||incumbent.score[0]>0)){\n      outcome=yield* iterateLareArrangement({entries,finalize,incumbent},budget);\n      if(outcome.best)incumbent=outcome.best;\n    }', '    let outcome;\n    for(const attemptLimit of [24,192]){\n      outcome=yield* iterateLareArrangement({entries:fixed,finalize,incumbent,attemptLimit},budget);\n      if(outcome.best)incumbent=outcome.best;\n      if(outcome.exhausted||incumbent?.score[0]===0)break;\n      outcome=yield* iterateLareArrangement({entries,finalize,incumbent,attemptLimit},budget);\n      if(outcome.best)incumbent=outcome.best;\n      if(outcome.exhausted||incumbent?.score[0]===0)break;\n    }');
});
console.log('EXPERIMENT progressive inventory: 24 attempts then 192 if needed; unchanged global budget and validation');
