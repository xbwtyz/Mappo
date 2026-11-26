import { copyJson } from '../data/project-format.js';

// S1-C2: bind fresh local domain preparation to one synchronous host commit.
// Call only inside a trusted editor bridge, never with a caller/preview result.
// The host independently validates the candidate, allocation and history.
// Exact strings, not hashes or a reusable authority cache, preserve equality.
export function captureEditorApplyEvidence(host,view,workspace,intent){
  const beforeJson=JSON.stringify(view.project),workspaceJson=JSON.stringify(workspace),
    intentJson=JSON.stringify(intent);
  return candidate=>{
    const afterJson=JSON.stringify(candidate);
    let used=false;
    return (before,after)=>{
      if(used)return false;
      used=true;
      return host.view()===view&&JSON.stringify(workspace)===workspaceJson&&
        JSON.stringify(intent)===intentJson&&JSON.stringify(before)===beforeJson&&
        JSON.stringify(after)===afterJson;
    };
  };
}

// S2-A: a mounted caller supplies an expected serialized candidate, never
// accepted-state authority. The bridge has already reconstructed the domain
// operation locally. Independently reissue the reservation and compare exact
// evidence before returning detached selection data or entering the host.
export function prepareMountedEditorCommitResult(host,requests,receipt,result,expectedCandidateJson){
  if(expectedCandidateJson===undefined)return null;
  if(typeof expectedCandidateJson!=='string'||!result.ok||
    JSON.stringify(result.candidate)!==expectedCandidateJson||
    JSON.stringify(host.reserve(requests))!==JSON.stringify(receipt))
    throw Error('Mounted identity intent changed during reconstruction.');
  return copyJson(result);
}
export function finishMountedEditorCommit(accepted,mountedResult){
  return mountedResult===null?accepted:{accepted,result:mountedResult};
}
