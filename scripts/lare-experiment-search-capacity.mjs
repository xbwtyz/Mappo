// Detached capacity/diversity experiment; production modules are never committed.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const [root,configArg]=process.argv.slice(2);
const config=JSON.parse(configArg);
const {work,expansions,beam,parcels,buildings,combined}=config;
assert.ok(root&&[2000000,4000000,8000000].includes(work)&&[4096,8192,16384].includes(expansions)&&[8,16,32].includes(beam)&&[24,48,96].includes(parcels)&&[24,48,96].includes(buildings)&&typeof combined==='boolean','Invalid experimental limits');
if(combined){
  // The rank-pruning script's focused assertions use the original beam of 8.
  // Apply the combined transformations before changing limits.
  execFileSync(process.execPath,[fileURLToPath(new URL('lare-experiment-combined.mjs',import.meta.url)),root],{stdio:'inherit'});
}
const path=join(root,'src/core/reconciliation-budget.js');
let source=readFileSync(path,'utf8');
const before='affectedParcels:256,parcelCandidates:24,buildingCandidates:24,\n  beamWidth:8,stateExpansions:2048,work:1000000';
const after='affectedParcels:256,parcelCandidates:'+parcels+',buildingCandidates:'+buildings+',\n  beamWidth:'+beam+',stateExpansions:'+expansions+',work:'+work;
assert.equal(source.split(before).length,2,'Budget source mismatch');
writeFileSync(path,source.replace(before,after));
const {LARE_LIMITS,createLareBudget}=await import(pathToFileURL(path).href);
assert.deepEqual(LARE_LIMITS,{affectedParcels:256,parcelCandidates:parcels,buildingCandidates:buildings,beamWidth:beam,stateExpansions:expansions,work});
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

console.log('LARE_SEARCH_CONFIG '+JSON.stringify({...config,parcelAttempts:combined?[24,192]:[192],impactLimit:6000000,independentVerificationWork:1000000}));
