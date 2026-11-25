import { copyJson } from '../data/project-format.js';
import { previewBuildingEditorTransaction,commitBuildingEditorTransaction } from './building-transaction-bridge.js';
import { previewLandEditorTransaction,commitLandEditorTransaction } from './land-transaction-bridge.js';
import { previewNonallocatingEditorTransaction,commitNonallocatingEditorTransaction } from './nonallocating-transaction-bridge.js';

// One preparation interface for the mounted non-road editors. The token
// binds the trusted current session, exact file revision, workspace and
// intent. The returned domain preview is not accepted-state authority.
const idaMountedTokens=new WeakMap();
const idaMountedSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function idaMountedPreview(host,workspace,kind,intent){
  if(kind==='building')return previewBuildingEditorTransaction(host,workspace,intent);
  if(kind==='nonallocating')return previewNonallocatingEditorTransaction(host,workspace,intent);
  if(['property-create','property-split','property-merge','property-delete','property-and-plot'].includes(kind))
    return previewLandEditorTransaction(host,workspace,kind,intent);
  throw Error('Unsupported mounted identity operation.');
}
export function stageMountedIdentityEdit(host,workspace,kind,intent,revision){
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid mounted file revision.');
  const view=host.view(),input=copyJson(intent),ws=copyJson(workspace);
  const p=idaMountedPreview(host,ws,kind,input);
  if(host.view()!==view)throw Error('Accepted identity changed during preparation.');
  if(!p.result.ok)return {token:null,result:p.result};
  const token=Object.freeze({});
  idaMountedTokens.set(token,{host,view,revision,kind,intent:input,workspace:ws,
    receipt:copyJson(p.receipt),candidateJson:JSON.stringify(p.result.candidate)});
  return {token,result:p.result};
}
export function cancelMountedIdentityEdit(token){return idaMountedTokens.delete(token);}
export function acceptMountedIdentityEdit(host,token,workspace,kind,intent,revision,transaction){
  const staged=idaMountedTokens.get(token);
  if(!staged||staged.host!==host)throw Error('Unknown mounted identity transaction.');
  idaMountedTokens.delete(token);
  if(host.view()!==staged.view||staged.revision!==revision||staged.kind!==kind||
    !idaMountedSame(staged.intent,intent)||!idaMountedSame(staged.workspace,workspace))
    throw Error('Mounted identity transaction is stale.');
  // Each commit bridge independently reconstructs from the bound intent.
  // Compare that fresh result to the private staging evidence inside the
  // bridge, before publication, rather than reconstructing twice here.
  const reservation={context:staged.view.context,receipt:staged.receipt};
  const options={preserveLegacyCapacity:true,allowUnchanged:true,mountedCandidateJson:staged.candidateJson};
  return kind==='building'?commitBuildingEditorTransaction(host,staged.workspace,staged.intent,reservation,options):
    kind==='nonallocating'?commitNonallocatingEditorTransaction(host,staged.workspace,staged.intent,transaction,reservation,options):
    commitLandEditorTransaction(host,staged.workspace,kind,staged.intent,reservation,options);
}
