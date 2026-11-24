// Detached experiment only. Never modifies the checked-in production tree.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];
if(!root)throw Error('Detached checkout required');
const file=join(root,'src/core/reconciliation-parcels.js');
let source=readFileSync(file,'utf8');
function replace(a,b){assert.ok(source.includes(a),'Experiment source mismatch: '+a);source=source.replace(a,b);}
replace('const tryCandidate=(family,boundary,nextPlots)=>{','const tryCandidate=(family,boundary,makePlots)=>{');
replace('    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}','    const nextPlots=makePlots();\n    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}');
replace('tryCandidate(family,original.map(map),mapLarePlotCells(plots,map,budget));','tryCandidate(family,original.map(map),()=>mapLarePlotCells(plots,map,budget));');
replace('          const preview=propertyGeometryPreview3I({properties:[property],plots},property.id,boundary,strip);\n          const next=plots.map((p,i)=>({...p,boundary:preview.plots[i].boundary}));\n          tryCandidate(\'taper-\'+side,boundary,next);', '          tryCandidate(\'taper-\'+side,boundary,()=>{\n            const preview=propertyGeometryPreview3I({properties:[property],plots},property.id,boundary,strip);\n            return plots.map((p,i)=>({...p,boundary:preview.plots[i].boundary}));\n          });');
writeFileSync(file,source);
console.log('EXPERIMENT early-boundary-rejection: unchanged candidate order, constraints and budget ceilings');
