// Instrument only the detached worktree. No validator, budget or ranking changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];
function patch(path,edits){
 const file=join(root,path);let source=readFileSync(file,'utf8');
 for(const [a,b] of edits){assert.equal(source.split(a).length,2,'Diagnostic source mismatch: '+path+' '+a.slice(0,80));source=source.replace(a,b);}
 writeFileSync(file,source);
}
patch('src/core/reconciliation-parcels.js',[
 ['  const original=property.boundary;',`  const diag={type:'parcel',id:property.id,blockId:property.blockId,mode,fixedRings:fixedRings.length,fixedNeighbors:fixedNeighbors.length,plots:plots.length,vertices:property.boundary.length,attempted:0,valid:0,retained:0,rejected:{},families:{}};
  globalThis.__lareParcelDiagnostic?.push(diag);
  const reject=(reason)=>{diag.rejected[reason]=(diag.rejected[reason]??0)+1;};
  const original=property.boundary;`],
 ['  if(length<lareParcelEps||width<lareParcelEps)return [];','  if(length<lareParcelEps||width<lareParcelEps){reject("degenerate-frontage");return [];}'],
 ['  if(oldT.x*tangent.x+oldT.y*tangent.y<=0)return [];','  if(oldT.x*tangent.x+oldT.y*tangent.y<=0){reject("frontage-reversal");return [];}'],
 ['  if(oldDepth<lareParcelEps)return [];','  if(oldDepth<lareParcelEps){reject("degenerate-depth");return [];}'],
 ['    if(seen.has(key))return;seen.add(key);','    if(seen.has(key)){reject("duplicate");return;}seen.add(key);diag.attempted++;'],
 [`    if(l.u< -lareParcelEps||r.u>length+lareParcelEps||r.u-l.u<minimumWidth-lareParcelEps||
      Math.abs(l.v-r.v)>1e-5||l.v<setback-lareParcelEps||!shapeWellFormed(boundary)||
      !shapeContained(boundary,block)||!propertyFits(boundary,block,edges)||
      fixedRings.some(ring=>!shapeContained(ring,boundary))||
      fixedNeighbors.some(ring=>shapesOverlapInterior(ring,boundary)))return;`,`    if(l.u< -lareParcelEps||r.u>length+lareParcelEps||r.u-l.u<minimumWidth-lareParcelEps){reject("frontage-span");return;}
    if(Math.abs(l.v-r.v)>1e-5||l.v<setback-lareParcelEps){reject("frontage-setback");return;}
    if(!shapeWellFormed(boundary)){reject("parcel-shape");return;}
    if(!shapeContained(boundary,block)){reject("block-containment");return;}
    if(!propertyFits(boundary,block,edges)){reject("block-setback");return;}
    if(fixedRings.some(ring=>!shapeContained(ring,boundary))){reject("fixed-building");return;}
    if(fixedNeighbors.some(ring=>shapesOverlapInterior(ring,boundary))){reject("fixed-neighbor");return;}`],
 ['    catch(error){if(error instanceof LareBudgetExceeded)throw error;return;}','    catch(error){if(error instanceof LareBudgetExceeded)throw error;reject("plot:"+error.message);return;}'],
 ['    found.push({family,property:next,plots:nextPlots,score,order:rank});','    diag.valid++;diag.families[family]=(diag.families[family]??0)+1;found.push({family,property:next,plots:nextPlots,score,order:rank});'],
 ['      found.splice(drop,1);\n    }','      found.splice(drop,1);\n    }\n    diag.retained=found.length;']
]);
patch('src/core/reconciliation-arrangement.js',[
 ['  const parcelCandidates=new Map(),byVariable=new Map(),buildingCache=new Map();',`  const diag={type:'arrangement',entries:entries.length,greedyDeadEnd:null,beamStage:null,complete:null,conflicts:{},emptyBuilding:[]};
  globalThis.__lareParcelDiagnostic?.push(diag);
  const conflict=(a,b,kind)=>{const k=kind+":"+a+":"+b;diag.conflicts[k]=(diag.conflicts[k]??0)+1;};
  const parcelCandidates=new Map(),byVariable=new Map(),buildingCache=new Map();`],
 ['    return buildingCache.get(key).map(c=>','    if(!buildingCache.get(key).length&&!diag.emptyBuilding.includes(building.source.id))diag.emptyBuilding.push(building.source.id);\n    return buildingCache.get(key).map(c=>'],
 ['      if(assigned.some(r=>lareArrangeOverlap(boundary,r.choice.value.property.boundary,budget)))return false;','      if(assigned.some(r=>{const overlap=lareArrangeOverlap(boundary,r.choice.value.property.boundary,budget);if(overlap)conflict(entry.property.id,r.variable,"assigned");return overlap;}))return false;'],
 ['          assigned.every(r=>!lareArrangeOverlap(c.property.boundary,r.choice.value.property.boundary,budget))))return false;','          assigned.every(r=>!lareArrangeOverlap(c.property.boundary,r.choice.value.property.boundary,budget)))){conflict(entry.property.id,neighbor.property.id,"forward");return false;}'],
 ['      if(!chosen){complete=false;break;}','      if(!chosen){diag.greedyDeadEnd=id;complete=false;break;}'],
 ['  if(!result.best&&verifiedIncumbent)return','  diag.beamStage=result.stage;diag.complete=result.complete;diag.status=result.status;\n  if(!result.best&&verifiedIncumbent)return']
]);
console.log('LARE_PARCEL_DIAGNOSTIC_CONFIG '+JSON.stringify({instrumentationOnly:true,validator:'unchanged',cases:22}));
