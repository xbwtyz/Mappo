import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {validateDistricts} from '../src/core/district-model.js';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {validateP6BudgetedDistricts} from '../scripts/development/research/ares-p6-budgeted-districts.mjs';
import {buildP6BudgetedRoadGraph} from '../scripts/development/research/ares-p6-budgeted-graph.mjs';
import {extractP6BudgetedDryFaces} from '../scripts/development/research/ares-p6-budgeted-dry-faces.mjs';
const root=work=>createSpatialPreservationBudget({work,stateExpansions:32768});
for(const morphology of ['radial','organic','linear','planned'])test('P6 district validation parity '+morphology,()=>{
 const p=createProject({seed:'p6-b1a-budget-'+morphology,size:'small',morphology}),city=p.city;
 const before=JSON.stringify(p),b=root(8000000);
 const g=buildP6BudgetedRoadGraph(city,b);
 assert.ok(extractP6BudgetedDryFaces(g,city,b).valid);
 const initial=b.snapshot().work;
 assert.equal(validateDistricts(city),city);
 assert.equal(validateP6BudgetedDistricts(city,b),city);
 const used=b.snapshot().work-initial;
 assert.ok(used>0);
 assert.equal(validateP6BudgetedDistricts(city,b),city);
 assert.equal(b.snapshot().work,initial+2*used);
 const short=root(initial+used-1);
 extractP6BudgetedDryFaces(buildP6BudgetedRoadGraph(city,short),city,short);
 assert.throws(()=>validateP6BudgetedDistricts(city,short),LareBudgetExceeded);
 assert.equal(JSON.stringify(p),before);
 console.log('P6_DISTRICT_BUDGET '+JSON.stringify({morphology,districtWork:used,districts:city.districts.length,combined:initial+used,authority:'none'}));
});
test('P6 district invalid membership matches legacy refusal',()=>{
 const city=createProject({seed:'c2-radial',size:'small',morphology:'radial'}).city;
 const malformed={...city,districtState:{...city.districtState,version:999}};
 let message;
 try{validateDistricts(malformed)}catch(e){message=e.message;}
 assert.ok(message);
 assert.throws(()=>validateP6BudgetedDistricts(malformed,root(8000000)),e=>e.message===message);
 assert.throws(()=>validateP6BudgetedDistricts(city),/Shared P6 budget/);
});
