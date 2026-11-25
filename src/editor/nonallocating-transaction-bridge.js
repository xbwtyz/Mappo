import { captureEditorApplyEvidence } from './editor-apply-evidence.js';
import { prepareBuildingApply } from './building-application.js';
import { prepareCompoundMembership,prepareCompoundTransform } from './building-compounds-c01.js';
import { IdentityEditor } from '../core/identity.js';
import { DistrictEditor,restoreDistrictSnapshot } from './districts.js';
import { FortificationEditor,restoreFortificationSnapshot } from './fortifications.js';
import { copyJson } from '../data/project-format.js';
import { verifyIdentityReservation } from '../core/identity-verification.js';

// This dispatcher is shared by the mounted panels and the secure host.
// A trusted editor supplies an explicit operation intent, never a city delta.
export function applyNonallocatingCityIntent(city,intent,editor){
  switch(intent.kind){
    case 'identity':return (editor??new IdentityEditor()).apply(city,intent.ref,intent.input);
    case 'district-generate':return (editor??new DistrictEditor()).generate(city,intent.options);
    case 'district-identity':{
      const e=editor??new DistrictEditor();if(!editor)e.selectedDistrictId=intent.districtId;
      return e.edit(city,intent.name,intent.color);
    }
    case 'district-move':{
      const e=editor??new DistrictEditor();if(!editor)e.selectedBlockId=intent.blockId;
      return e.move(city,intent.target);
    }
    case 'defense-apply':return (editor??new FortificationEditor()).apply(city,intent.options);
    case 'district-restore':return restoreDistrictSnapshot(city,intent.snapshot);
    case 'defense-restore':return restoreFortificationSnapshot(city,intent.snapshot);
    default:throw Error('Unsupported nonallocating city intent.');
  }
}
export function prepareNonallocatingEditorOperation(project,workspace,intent){
  switch(intent.kind){
    case 'building-geometry':return prepareBuildingApply(project,workspace,intent.buildingId,intent.transform,intent.draft??null);
    case 'compound-membership':return prepareCompoundMembership(project,workspace,intent.request);
    case 'compound-transform':return prepareCompoundTransform(project,workspace,intent.propertyId,intent.groupId,intent.transform);
    default:return {ok:true,candidate:{...project,city:applyNonallocatingCityIntent(copyJson(project.city),intent)}};
  }
}
function idaNonallocatingHistory(intent,transaction){
  const expected=intent.kind==='identity'?'identity':intent.kind==='building-geometry'?'building':
    intent.kind.startsWith('compound-')?'compound':intent.kind.startsWith('district-')?'districts':
    intent.kind.startsWith('defense-')?'defenses':null;
  if(!expected||transaction?.family!==expected)throw Error('Nonallocating editor transaction family mismatch.');
  return copyJson(transaction);
}
export function previewNonallocatingEditorTransaction(host,workspace,intent){
  const {project,context}=host.view(),input=copyJson(intent),receipt=host.reserve([]);
  return {context,receipt,result:prepareNonallocatingEditorOperation(project,workspace,input)};
}
export function commitNonallocatingEditorTransaction(host,workspace,intent,transaction,reservation,{preserveLegacyCapacity=false,allowUnchanged=false}={}){
  const view=host.view(),{project,context}=view;
  const bindEvidence=captureEditorApplyEvidence(host,view,workspace,intent);
  if(JSON.stringify(context)!==JSON.stringify(reservation?.context))throw Error('Stale nonallocating editor reservation.');
  const input=copyJson(intent),metadata=idaNonallocatingHistory(input,transaction);
  const result=prepareNonallocatingEditorOperation(project,workspace,input);
  if(!result.ok)throw Error(result.reason??result.issues?.[0]?.message??'Nonallocating editor Apply refused.');
  // Mounted identity/district/defense forms may submit unchanged values.
  // Do not publish a new accepted revision or invalidate other previews.
  if(allowUnchanged&&JSON.stringify(result.candidate)===JSON.stringify(project)){
    verifyIdentityReservation(project.identityAllocation,project.city,context,[],reservation.receipt);
    return {...host.read(),historyStatus:'unchanged'};
  }
  const historyPolicy=preserveLegacyCapacity
    ?(input.kind==='building-geometry'&&metadata.operation==='building-structure'?'legacy-ordinary-structure':'legacy-ordinary')
    :'required';
  return host.commit({requests:[],receipt:reservation.receipt,candidateCity:result.candidate.city,transaction:metadata,historyPolicy,
    validateDomain:bindEvidence(result.candidate)});
}
