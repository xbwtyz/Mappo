// Detached hypothesis: screen a parcel using the largest eligible rigid building's sampled inventory.
// Same generator/cache, budget, validator, beam, scoring and interleaved variable order.
// A sampled empty inventory is not proof of geometric infeasibility.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const file=join(process.argv[2],'src/core/reconciliation-arrangement.js');let s=readFileSync(file,'utf8');
function replace(a,b){assert.equal(s.split(a).length,2,'Anchor mismatch '+a.slice(0,80));s=s.replace(a,b);}
replace("    const key=JSON.stringify([building.source.id,parcel.order]);\n    if(!buildingCache.has(key)){\n      const fixedBuildings=entry.buildings.filter(b=>b.permission.mode!=='rigid'&&b.source.id!==building.source.id).map(b=>b.source);\n      buildingCache.set(key,generateLareBuildingCandidates({source:building.source,permission:building.permission,\n        oldProperty:entry.property,property:parcel.property,plots:parcel.plots,fixedBuildings},budget));\n    }",'    const inventory=getBuildingInventory(entry,building,parcel);');
replace("    if(!buildingCache.get(key).length&&!diag.emptyBuilding.includes(building.source.id))diag.emptyBuilding.push(building.source.id);","    if(!inventory.length&&!diag.emptyBuilding.includes(building.source.id))diag.emptyBuilding.push(building.source.id);");
replace("    return buildingCache.get(key).map(c=>","    return inventory.map(c=>");
replace("  const choices=(id,state)=>{","  const getBuildingInventory=(entry,building,parcel)=>{\n    const key=JSON.stringify([building.source.id,parcel.order]);\n    if(!buildingCache.has(key)){\n      const fixedBuildings=entry.buildings.filter(b=>b.permission.mode!=='rigid'&&b.source.id!==building.source.id).map(b=>b.source);\n      buildingCache.set(key,generateLareBuildingCandidates({source:building.source,permission:building.permission,\n        oldProperty:entry.property,property:parcel.property,plots:parcel.plots,fixedBuildings},budget));\n    }\n    return buildingCache.get(key);\n  };\n  const choices=(id,state)=>{");
replace("      return true;\n    }\n    return !state.assignments.some(row=>{",`      // Check only the largest rigid building, after cheap parcel compatibility.
      // Reuse the same candidate cache when its actual variable is evaluated.
      const probe=entry.buildings.filter(b=>b.permission.mode==='rigid').sort((a,b)=>b.source.area-a.source.area||lareArrangeCompare(a.source.id,b.source.id))[0];
      if(probe){
        budget.spend();
        diag.lookaheadChecks=(diag.lookaheadChecks??0)+1;
        if(!getBuildingInventory(entry,probe,choice.value).length){
          diag.lookaheadRejected=(diag.lookaheadRejected??0)+1;
          return false;
        }
      }
      return true;
    }
    return !state.assignments.some(row=>{`);
writeFileSync(file,s);
console.log('LARE_BUILDING_AWARE_CONFIG '+JSON.stringify({probe:'largest-rigid-building',cache:'shared',work:4000000,expansions:16384,beam:8,validator:'unchanged'}));
