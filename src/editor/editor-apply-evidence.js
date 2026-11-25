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
