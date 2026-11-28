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
import {observeP6RelocationCompatibility,observeP6RelocationExtension} from './ares-p6-relocation-compatibility.mjs';
import {tryP6AlternativeFrontageAssembly} from './ares-p6-frontage-assembly.mjs';
import {tryP6CollectiveAssembly} from './ares-p6-collective-assembly.mjs';
import {assembleP6DetachedCity} from './ares-p6-detached-city.mjs';
import {observeP6RigidTranslations} from './ares-p6-rigid-translations.mjs';
import {observeP6FixedBuildings} from './ares-p6-fixed-buildings.mjs';
import {observeP6AlternativeFrontages} from './ares-p6-alternative-frontages.mjs';
import {observeP6SameFrontageAccess,observeP6RelocatedAccess} from './ares-p6-same-frontage-access.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6ParcelReshapes} from './ares-p6-parcel-reshapes.mjs';
import {observeP6PropertyFit} from './ares-p6-property-fit.mjs';
import {auditP6AffectedProperties} from './ares-p6-property-audit.mjs';
import {observeP6AffectedProperties} from './ares-p6-affected-properties.mjs';
import {previewP6BlockLabels} from './ares-p6-block-label-preview.mjs';
import {observeP6BlockOwnership} from './ares-p6-block-ownership.mjs';
import {planP6BlockRecords} from './ares-p6-block-record-plan.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';

export function observeP6DryPipeline(source,candidateRoads,budget,{collective=false,frontageContext=null,landscape=false}={}){
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
 const mixed=!!(source.waterFeatures?.length||source.terrainFeatures?.length||source.waterFaces?.length||source.terrainFaces?.length);
 if(mixed&&!landscape)return refuse('unsupported-landscape');
 const accepted=stage('accepted-graph',()=>buildP6BudgetedRoadGraph(source,budget));
 if(!accepted.valid)return refuse('invalid-accepted-graph',{issues:accepted.issues});
 const candidate=stage('candidate-graph',()=>buildP6BudgetedRoadGraph({nodes:candidateRoads.nodes,roads:candidateRoads.roads},budget));
 if(!candidate.valid)return refuse('invalid-candidate-graph',{issues:candidate.issues});
 const extraction=stage('candidate-extraction',()=>extractP6BudgetedDryFaces(candidate,source,budget,{landscape:mixed}));
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
 const parcelReshapes=stage('parcel-reshape-observation',()=>observeP6ParcelReshapes(source,extraction,propertyFit,budget));
 if(parcelReshapes.status!=='parcel-reshape-observed')return refuse('parcel-reshape-observation-refused',{reason:parcelReshapes.reason});
 const parcelConflicts=stage('parcel-conflict-observation',()=>observeP6ParcelConflicts(source,parcelReshapes,budget));
 if(parcelConflicts.status!=='parcel-conflicts-observed')return refuse('parcel-conflict-observation-refused',{reason:parcelConflicts.reason});
 const cooperativeParcels=stage('cooperative-parcel-observation',()=>observeP6CooperativeParcels(parcelReshapes,parcelConflicts,budget));
 if(cooperativeParcels.status!=='cooperative-parcels-observed')return refuse('cooperative-parcel-observation-refused',{reason:cooperativeParcels.reason});
 const sameFrontageAccess=stage('same-frontage-access-observation',()=>observeP6SameFrontageAccess(source,extraction,parcelReshapes,cooperativeParcels,budget));
 if(sameFrontageAccess.status!=='same-frontage-access-observed')return refuse('same-frontage-access-observation-refused',{reason:sameFrontageAccess.reason});
 const alternativeFrontages=stage('alternative-frontage-observation',()=>observeP6AlternativeFrontages(source,extraction,identity,propertyFit,parcelReshapes,sameFrontageAccess,budget));
 if(alternativeFrontages.status!=='alternative-frontage-observed')return refuse('alternative-frontage-observation-refused',{reason:alternativeFrontages.reason});
 const fixedBuildings=stage('fixed-building-observation',()=>observeP6FixedBuildings(source,parcelReshapes,cooperativeParcels,budget));
 if(fixedBuildings.status!=='fixed-buildings-observed')return refuse('fixed-building-observation-refused',{reason:fixedBuildings.reason});
 const rigidTranslations=stage('rigid-translation-observation',()=>observeP6RigidTranslations(source,parcelReshapes,fixedBuildings,budget));
 if(rigidTranslations.status!=='rigid-translations-observed')return refuse('rigid-translation-observation-refused',{reason:rigidTranslations.reason});
 const relocationCompatibility=stage('relocation-compatibility-observation',()=>observeP6RelocationCompatibility(source,parcelReshapes,rigidTranslations,budget));
 if(relocationCompatibility.status!=='relocation-compatibility-observed')return refuse('relocation-compatibility-observation-refused',{reason:relocationCompatibility.reason});
 const relocationExtension=stage('relocation-extension-observation',()=>observeP6RelocationExtension(source,parcelReshapes,rigidTranslations,cooperativeParcels,relocationCompatibility,budget));
 if(relocationExtension.status!=='relocation-extension-observed')return refuse('relocation-extension-observation-refused',{reason:relocationExtension.reason});
 const relocatedAccess=stage('relocated-access-observation',()=>observeP6RelocatedAccess(source,extraction,parcelReshapes,rigidTranslations,relocationExtension,budget));
 if(relocatedAccess.status!=='relocated-access-observed')return refuse('relocated-access-observation-refused',{reason:relocatedAccess.reason});
 let assembly=stage('detached-city-assembly',()=>assembleP6DetachedCity(source,candidateRoads,extraction,{identity,blockPlan,propertyAudit,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess},budget));
 if(collective&&assembly.status==='assembly-refused'&&assembly.reason==='incomplete-land-selection'&&blockPlan.structural===0){
  assembly=stage('collective-city-assembly',()=>tryP6CollectiveAssembly(source,candidateRoads,extraction,{identity,blockPlan,propertyAudit,propertyFit,parcelReshapes,rigidTranslations,relocationExtension},budget));
 }
 if(frontageContext&&frontageContext.project.city===source&&assembly.status==='assembly-refused'&&blockPlan.structural===0&&relocationExtension.unresolved.length){
  assembly=stage('alternative-frontage-assembly',()=>tryP6AlternativeFrontageAssembly(frontageContext.project,frontageContext.operation,candidateRoads,extraction,{identity,blockPlan,propertyAudit,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess,alternativeFrontages},budget));
 }
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
 return {valid:false,authority:'none',diagnosticsComplete:true,ledger,identity,lineage,blockPlan,blockOwnership,blockLabels,affectedProperties,propertyAudit,propertyFit,parcelReshapes,parcelConflicts,cooperativeParcels,sameFrontageAccess,alternativeFrontages,fixedBuildings,rigidTranslations,relocationCompatibility,relocationExtension,relocatedAccess,assembly,districts,defenses,
  limitations:['no-independent-road-authorization',...(assembly.status==='candidate-assembled'?[]:['no-rebuilt-land']),...(mixed?['mixed-landscape-topology-requires-independent-verification']:['no-mixed-landscape']),'no-apply']};
}
