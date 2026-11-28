// Detached dry accounting experiment. No P5 authorization, reconstruction or Apply.
import {buildP6BudgetedRoadGraph} from './ares-p6-budgeted-graph.mjs';
import {extractP6BudgetedDryFaces} from './ares-p6-budgeted-dry-faces.mjs';
import {matchP6BudgetedIdentity} from './ares-p6-budgeted-identity.mjs';
import {observeP6BudgetedLineage} from './ares-p6-budgeted-lineage.mjs';
import {validateP6BudgetedDistricts} from './ares-p6-budgeted-districts.mjs';
import {validateP6BudgetedDefenses} from './ares-p6-budgeted-defenses.mjs';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';

export function observeP6DryPipeline(source,candidateRoads,budget){
 if(!budget?.spend||!budget?.snapshot)throw Error('Shared P6 budget required.');
 const ledger=[];
 function stage(name,fn){
  const before=budget.snapshot().work;
  budget.spend();
  const value=fn();
  ledger.push({name,work:budget.snapshot().work-before});
  return value;
 }
 const refuse=reason=>({valid:false,authority:'none',diagnosticsComplete:false,reason,ledger});
 if(!source||!Array.isArray(candidateRoads?.nodes)||!Array.isArray(candidateRoads?.roads))return refuse('missing-road-records');
 if(source.waterFeatures?.length||source.terrainFeatures?.length||source.waterFaces?.length||source.terrainFaces?.length)return refuse('unsupported-landscape');
 const accepted=stage('accepted-graph',()=>buildP6BudgetedRoadGraph(source,budget));
 if(!accepted.valid)return refuse('invalid-accepted-graph');
 const candidate=stage('candidate-graph',()=>buildP6BudgetedRoadGraph({nodes:candidateRoads.nodes,roads:candidateRoads.roads},budget));
 if(!candidate.valid)return refuse('invalid-candidate-graph');
 const extraction=stage('candidate-extraction',()=>extractP6BudgetedDryFaces(candidate,source,budget));
 if(!extraction.valid)return refuse('invalid-candidate-extraction');
 const identity=stage('correspondence',()=>matchP6BudgetedIdentity(source,extraction,accepted,budget));
 if(!identity.correspondenceValid)return refuse('unproven-correspondence');
 const lineage=stage('lineage-observation',()=>observeP6BudgetedLineage(source,extraction,identity,budget));
 if(!lineage.lineageValid)return refuse('unproven-lineage');
 // This is only the legacy mapped-block snapshot, NOT rebuilt land.
 const snapshot=stage('diagnostic-snapshot',()=>{
  budget.spend(Math.max(1,identity.preserved.length+identity.changed.length+candidate.nodesById.size+candidate.roadsById.size));
  return {...source,nodes:[...candidate.nodesById.values()],roads:[...candidate.roadsById.values()],
   blocks:[...identity.preserved,...identity.changed].filter(f=>f.kind==='block').map(f=>f.record)};
 });
 function check(name,enabled,fn){
  return stage(name,()=>{
   if(!enabled)return {checked:false,passed:false,reason:'not-enabled'};
   try{fn(snapshot,budget);return {checked:true,passed:true};}
   catch(error){if(error instanceof LareBudgetExceeded)throw error;return {checked:true,passed:false,reason:error.message};}
  });
 }
 const districts=check('district-diagnostic',!!source.districtState,validateP6BudgetedDistricts);
 const defenses=check('defense-diagnostic',!!source.fortificationState,validateP6BudgetedDefenses);
 return {valid:false,authority:'none',diagnosticsComplete:true,ledger,identity,lineage,districts,defenses,
  limitations:['no-independent-road-authorization','no-rebuilt-land','no-mixed-landscape','no-apply']};
}
