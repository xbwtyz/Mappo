// Detached dry accounting experiment. No P5 authorization, reconstruction or Apply.
import {buildP6BudgetedRoadGraph} from './ares-p6-budgeted-graph.mjs';
import {extractP6BudgetedDryFaces} from './ares-p6-budgeted-dry-faces.mjs';
import {matchP6BudgetedIdentity} from './ares-p6-budgeted-identity.mjs';
import {observeP6BudgetedLineage} from './ares-p6-budgeted-lineage.mjs';
import {validateP6BudgetedDistricts} from './ares-p6-budgeted-districts.mjs';
import {validateP6BudgetedDefenses} from './ares-p6-budgeted-defenses.mjs';
import {observeP6UnmatchedGeometry,observeP6SmallFaceGeometry} from './ares-p6-refusal-geometry.mjs';
import {observeP6TopologyIdentity} from './ares-p6-topology-identity.mjs';
import {observeP6BlockCapacity} from './ares-p6-block-capacity.mjs';
import {observeP6PropertyFit} from './ares-p6-property-fit.mjs';
import {auditP6AffectedProperties} from './ares-p6-property-audit.mjs';
import {observeP6AffectedProperties} from './ares-p6-affected-properties.mjs';
import {previewP6BlockLabels} from './ares-p6-block-label-preview.mjs';
import {observeP6BlockOwnership} from './ares-p6-block-ownership.mjs';
import {planP6BlockRecords} from './ares-p6-block-record-plan.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
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
 const refuse=(reason,evidence=null)=>{
  if(evidence)stage('refusal-evidence',()=>{
   const serialized=aresReplayJson(evidence,budget);
   budget.spend(Math.max(1,Math.ceil(Buffer.byteLength(serialized)/64)));
  });
  return {valid:false,authority:'none',diagnosticsComplete:false,reason,ledger,...(evidence?{evidence}: {})};
 };
 if(!source||!Array.isArray(candidateRoads?.nodes)||!Array.isArray(candidateRoads?.roads))return refuse('missing-road-records');
 if(source.waterFeatures?.length||source.terrainFeatures?.length||source.waterFaces?.length||source.terrainFaces?.length)return refuse('unsupported-landscape');
 const accepted=stage('accepted-graph',()=>buildP6BudgetedRoadGraph(source,budget));
 if(!accepted.valid)return refuse('invalid-accepted-graph',{issues:accepted.issues});
 const candidate=stage('candidate-graph',()=>buildP6BudgetedRoadGraph({nodes:candidateRoads.nodes,roads:candidateRoads.roads},budget));
 if(!candidate.valid)return refuse('invalid-candidate-graph',{issues:candidate.issues});
 const extraction=stage('candidate-extraction',()=>extractP6BudgetedDryFaces(candidate,source,budget));
 if(!extraction.valid)return refuse('invalid-candidate-extraction',{issues:extraction.issues,coverage:extraction.coverage,faceCount:extraction.faces.length,smallFaces:stage('small-face-observation',()=>observeP6SmallFaceGeometry(extraction,budget))});
 const identity=stage('correspondence',()=>matchP6BudgetedIdentity(source,extraction,accepted,budget));
 if(!identity.correspondenceValid)return refuse('unproven-correspondence',{issues:identity.issues});
 const lineage=stage('lineage-observation',()=>observeP6BudgetedLineage(source,extraction,identity,budget));
 if(!lineage.lineageValid){
  const topologyIdentity=stage('topology-identity-observation',()=>observeP6TopologyIdentity(source,extraction,identity,budget));
  return refuse('unproven-lineage',{issues:lineage.issues,added:identity.added,removed:identity.removed,split:identity.split,merged:identity.merged,ambiguous:identity.ambiguous,preservedCount:identity.preserved.length,changedCount:identity.changed.length,unmatchedGeometry:stage('unmatched-geometry-observation',()=>observeP6UnmatchedGeometry(source,extraction,identity,budget)),topologyIdentity,capacity:stage('block-capacity-observation',()=>observeP6BlockCapacity(source,extraction,topologyIdentity,budget))});
 }
 const blockPlan=stage('block-record-plan',()=>planP6BlockRecords(source,extraction,identity,lineage,budget));
 if(blockPlan.status!=='block-plan-observed')return refuse('block-record-plan-refused',{reason:blockPlan.reason});
 const blockOwnership=stage('block-ownership-observation',()=>observeP6BlockOwnership(source,blockPlan,budget));
 if(blockOwnership.status!=='block-ownership-observed')return refuse('block-ownership-refused',{reason:blockOwnership.reason});
 const blockLabels=stage('block-label-preview',()=>previewP6BlockLabels(source,blockPlan,blockOwnership,identity,lineage,budget));
 if(blockLabels.status!=='block-label-preview-observed')return refuse('block-label-preview-refused',{reason:blockLabels.reason});
 const affectedProperties=stage('affected-property-observation',()=>observeP6AffectedProperties(source,accepted,candidate,blockPlan,blockOwnership,budget));
 if(affectedProperties.status==='refused')return refuse('affected-property-observation-refused',{reason:affectedProperties.reason});
 const propertyAudit=stage('affected-property-audit',()=>auditP6AffectedProperties(source,candidateRoads,identity,lineage,affectedProperties,budget));
 if(propertyAudit.status!=='matched')return refuse('affected-property-audit-refused',{reason:propertyAudit.reason});
 const propertyFit=stage('property-fit-observation',()=>observeP6PropertyFit(source,extraction,propertyAudit,budget));
 if(propertyFit.status!=='property-fit-observed')return refuse('property-fit-observation-refused',{reason:propertyFit.reason});
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
 return {valid:false,authority:'none',diagnosticsComplete:true,ledger,identity,lineage,blockPlan,blockOwnership,blockLabels,affectedProperties,propertyAudit,propertyFit,districts,defenses,
  limitations:['no-independent-road-authorization','no-rebuilt-land','no-mixed-landscape','no-apply']};
}
