// Detached investigation of two distinct failure hypotheses.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const [root,mode]=process.argv.slice(2);
assert.ok(root&&['inset','interleaved'].includes(mode),'Invalid experiment');
execFileSync(process.execPath,[fileURLToPath(new URL('lare-experiment-refusals.mjs',import.meta.url)),root],{stdio:'inherit'});
const patches=[["src/core/reconciliation-buildings.js","const b=lareBuildingBounds(rotated,project),minU=pb.minX-b.minX,maxU=pb.maxX-b.maxX,\n      minV=pb.minY-b.minY,maxV=pb.maxY-b.maxY;","const b=lareBuildingBounds(rotated,project);\n    // Prefer interior placements where the available interval permits.\n    // Exact-fit intervals remain available; final validation is unchanged.\n    const rawMinU=pb.minX-b.minX,rawMaxU=pb.maxX-b.maxX,\n      rawMinV=pb.minY-b.minY,rawMaxV=pb.maxY-b.maxY;\n    const insetU=Math.min(1e-5,Math.max(0,(rawMaxU-rawMinU)/4)),\n      insetV=Math.min(1e-5,Math.max(0,(rawMaxV-rawMinV)/4));\n    const minU=rawMinU+insetU,maxU=rawMaxU-insetU,\n      minV=rawMinV+insetV,maxV=rawMaxV-insetV;"],["src/core/reconciliation-arrangement.js","  for(const e of sorted){const id='property:'+e.property.id;variables.push(id);byVariable.set(id,{entry:e});}\n  for(const e of sorted){","  // Assign each property's buildings immediately after its parcel.\n  // Retain the same candidate sets, forward checks and finalizer.\n  for(const e of sorted){\n    const id='property:'+e.property.id;variables.push(id);byVariable.set(id,{entry:e});"]];
const [path,before,after]=patches[mode==='inset'?0:1];
const file=join(root,path),source=readFileSync(file,'utf8');
assert.equal(source.split(before).length,2,'Experiment source mismatch');
writeFileSync(file,source.replace(before,after));
console.log('LARE_FAILURE_EXPERIMENT '+JSON.stringify({mode,work:4000000,expansions:16384,beam:8,inventory:24,validator:'unchanged',inset:mode==='inset'?1e-5:0}));
