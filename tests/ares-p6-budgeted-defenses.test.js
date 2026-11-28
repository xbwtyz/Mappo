import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {generateFortifications} from '../src/generators/fortifications.js';
import {validateFortifications} from '../src/core/fortification-model.js';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {validateP6BudgetedDefenses} from '../scripts/development/research/ares-p6-budgeted-defenses.mjs';
import {buildP6BudgetedRoadGraph} from '../scripts/development/research/ares-p6-budgeted-graph.mjs';
import {extractP6BudgetedDryFaces} from '../scripts/development/research/ares-p6-budgeted-dry-faces.mjs';
import {validateP6BudgetedDistricts} from '../scripts/development/research/ares-p6-budgeted-districts.mjs';
const root=work=>createSpatialPreservationBudget({work,stateExpansions:32768});
const fixture=morphology=>generateFortifications(createProject({seed:'wall-stress',size:'small',morphology}).city,{seed:'wall-stress',gateCount:4,towerSpacing:100});
function prior(city,b){const g=buildP6BudgetedRoadGraph(city,b);assert.ok(extractP6BudgetedDryFaces(g,city,b).valid);validateP6BudgetedDistricts(city,b);}
for(const morphology of ['radial','organic','linear','planned'])test('P6 dry defense shared budget '+morphology,()=>{
 const city=fixture(morphology),before=JSON.stringify(city),b=root(8000000);
 prior(city,b);const initial=b.snapshot().work;
 assert.equal(validateFortifications(city),city);
 assert.equal(validateP6BudgetedDefenses(city,b),city);
 const used=b.snapshot().work-initial;assert.ok(used>0);
 const repeat=root(8000000);assert.equal(validateP6BudgetedDefenses(city,repeat),city);assert.equal(repeat.snapshot().work,used);
 const short=root(initial+used-1);prior(city,short);
 assert.throws(()=>validateP6BudgetedDefenses(city,short),LareBudgetExceeded);
 assert.equal(JSON.stringify(city),before);
 console.log('P6_DEFENSE_BUDGET '+JSON.stringify({morphology,defenseWork:used,combined:initial+used,gates:city.gates.length,towers:city.towers.length,authority:'none'}));
});
test('P6 defense unbuilt, unsupported and invalid gate controls',()=>{
 const city=createProject({seed:'p6-def-unbuilt',size:'small',morphology:'planned'}).city,b=root(8000000);
 assert.equal(validateP6BudgetedDefenses(city,b),validateFortifications(city));
 assert.throws(()=>validateP6BudgetedDefenses(city),/Shared P6 budget/);
 assert.throws(()=>validateP6BudgetedDefenses({...city,waterFeatures:[{}]},b),/empty landscape/);
 assert.throws(()=>validateP6BudgetedDefenses({...city,terrainFeatures:[{}]},b),/empty landscape/);
 const built=fixture('planned'),bad={...built,gates:built.gates.map((g,i)=>i?g:{...g,wallId:'missing'})};
 let message;try{validateFortifications(bad)}catch(e){message=e.message;}
 assert.ok(message);assert.throws(()=>validateP6BudgetedDefenses(bad,b),e=>e.message===message);
});
