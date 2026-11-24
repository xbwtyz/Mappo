// Detached budget scaling experiment. Do not alter source in the checked-in branch.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [root,workArg,expArg]=process.argv.slice(2);
const work=Number(workArg),expansions=Number(expArg);
assert.ok(root&&[2000000,4000000,8000000,16000000].includes(work)&&expansions===work/1000000*2048,'Invalid experimental budget');
const path=join(root,'src/core/reconciliation-budget.js');
let source=readFileSync(path,'utf8');
const before='beamWidth:8,stateExpansions:2048,work:1000000',after='beamWidth:8,stateExpansions:'+expansions+',work:'+work;
assert.equal(source.split(before).length,2,'Budget source mismatch');
writeFileSync(path,source.replace(before,after));
const {LARE_LIMITS,createLareBudget}=await import(pathToFileURL(path).href);
assert.deepEqual(LARE_LIMITS,{affectedParcels:256,parcelCandidates:24,buildingCandidates:24,beamWidth:8,stateExpansions:expansions,work});
assert.equal(createLareBudget().snapshot().remainingWork,work);
assert.equal(createLareBudget().snapshot().remainingExpansions,expansions);
// Keep independent verification at the original limit. Add instrumentation
// for Apply wall time and largest iterator step; no acceptance logic changed.
const runner=join(root,'scripts/lare-compare.mjs');
source=readFileSync(runner,'utf8');
const replace=(a,b)=>{assert.equal(source.split(a).length,2,'Comparator source mismatch: '+a);source=source.replace(a,b);};
replace('let step,previous=','let maxIteratorStepMs=0;\n  let step,previous=');
replace('step=iterator.next();const now=performance.now();','step=iterator.next();const now=performance.now();maxIteratorStepMs=Math.max(maxIteratorStepMs,now-clock);');
replace('  const receipt=preview.candidateProject?', '  const applyStart=performance.now();\n  const receipt=preview.candidateProject?');
replace('  const accepted=Boolean(receipt?.ok);','  const applyMs=preview.candidateProject?performance.now()-applyStart:null;\n  const accepted=Boolean(receipt?.ok);');
replace('draft,new Map(),createLareBudget());','draft,new Map(),createLareBudget({work:1000000,stateExpansions:2048}));');
replace('classification,invalid,previewMs,issues:', 'classification,invalid,previewMs,applyMs,maxIteratorStepMs,issues:');
writeFileSync(runner,source);
console.log('LARE_BUDGET_CONFIG '+JSON.stringify({work,expansions,beamWidth:8,parcelCandidates:24,buildingCandidates:24,parcelAttempts:192,impactLimit:6000000,mode:'unmodified-b1r-search'}));
