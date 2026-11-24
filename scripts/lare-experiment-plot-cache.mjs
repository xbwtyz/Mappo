// Detached experiment: reuse exact plot verification results across tiers.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];if(!root)throw Error('Detached checkout required');
const file=join(root,'src/core/reconciliation-parcels.js');
let source=readFileSync(file,'utf8');
function replace(a,b){assert.ok(source.includes(a),'Experiment source mismatch: '+a);source=source.replace(a,b);}
replace('const lareParcelEps=1e-6;', 'const lareParcelEps=1e-6;\nconst experimentPlotCache=new WeakMap();');
replace('  const original=property.boundary;', '  const original=property.boundary;\n  if(!experimentPlotCache.has(budget))experimentPlotCache.set(budget,new WeakMap());\n  const byProperty=experimentPlotCache.get(budget);\n  if(!byProperty.has(property))byProperty.set(property,new Map());\n  const verified=byProperty.get(property);');
replace('    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}\n    catch(error){if(error instanceof LareBudgetExceeded)throw error;return;}', '    const validationKey=JSON.stringify([boundary,plots,nextPlots,adjacency]);\n    budget.spend();\n    if(!verified.has(validationKey)){\n      try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);verified.set(validationKey,true);}\n      catch(error){if(error instanceof LareBudgetExceeded)throw error;verified.set(validationKey,false);}\n    }\n    if(!verified.get(validationKey))return;');
writeFileSync(file,source);
console.log('EXPERIMENT exact plot verification cache, scoped to operation budget and source property');
