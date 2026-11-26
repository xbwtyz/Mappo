// P2: read-only qualification contract for hosted standalone output transfer.
// Evidence must be independently fetched from GitHub. No API writes or approval authority.
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
export function validateHostedBuildTransfer(e){
  const r=e?.request,run=e?.run,generated=e?.generated,dest=e?.destination,comparison=e?.comparison;
  need(r&&sha(r.sha)&&sha(r.tree)&&/^build\/standalone\/[a-zA-Z0-9._/-]+$/.test(r.branch)&&typeof r.version==='string'&&/^\d+\.\d+\.\d+-dev$/.test(r.version),'Invalid isolated request.');
  need(run?.name==='Mappo Hosted Standalone Build'&&positive(run.id)&&run.head_sha===r.sha&&run.head_branch===r.branch&&run.status==='completed'&&run.conclusion==='success','Missing exact-source build success.');
  need(Array.isArray(e.jobs)&&e.jobs.length===2&&['compile','record'].every(n=>e.jobs.some(j=>j.name===n&&j.status==='completed'&&j.conclusion==='success'&&j.run_id===run.id)),'Missing executed compile/record evidence.');
  need(dest&&sha(dest.sha)&&dest.tree===r.tree&&/^(feature|chore|fix|refactor)\//.test(dest.branch)&&dest.branch!==r.branch&&dest.currentSha===dest.sha,'Stale or different destination source tree.');
  const dist='dist/mappo-'+r.version+'.html',allowed=['index.html',dist];
  need(generated&&sha(generated.sha)&&Array.isArray(generated.parents)&&generated.parents.length===1&&generated.parents[0]===r.sha&&e.scratchHead===generated.sha,'Generated parent or scratch ref mismatch.');
  need(comparison?.ahead_by===1&&comparison.behind_by===0&&comparison.base_commit?.sha===r.sha&&Array.isArray(comparison.files)&&comparison.files.length>0&&comparison.files.length<=2,'Unverified generated diff.');
  const names=comparison.files.map(f=>f.filename);
  need(new Set(names).size===names.length&&comparison.files.every(f=>allowed.includes(f.filename)&&['modified','added'].includes(f.status)),'Unauthorized generated path.');
  need(sha(e.blobs?.['index.html'])&&e.blobs['index.html']===e.blobs[dist],'Generated HTML parity mismatch.');
  return {sourceSha:r.sha,sourceTree:r.tree,generatedSha:generated.sha,destinationSha:dest.sha,destinationBranch:dest.branch,files:allowed.map(path=>({path,blob:e.blobs[path]})),requiredExactDestinationCI:true,authorizationGranted:false};
}
export function verifyHostedTransferQualification(plan,observed){
  need(plan?.authorizationGranted===false&&plan.requiredExactDestinationCI===true,'Invalid transfer plan.');
  need(sha(observed?.head)&&observed.branch===plan.destinationBranch&&observed.parent===plan.destinationSha&&observed.currentSha===observed.head,'Wrong transferred candidate.');
  need(plan.files.every(f=>observed.blobs?.[f.path]===f.blob),'Transferred artifact mismatch.');
  need(Array.isArray(observed.changedPaths)&&observed.changedPaths.length>0&&new Set(observed.changedPaths).size===observed.changedPaths.length&&observed.changedPaths.every(p=>plan.files.some(f=>f.path===p)),'Unexpected transferred path.');
  const r=observed.fastRun;
  need(r?.name==='Mappo Fast Checks'&&r.head_sha===observed.head&&r.status==='completed'&&r.conclusion==='success'&&positive(r.id),'Exact transferred Fast Checks missing.');
  need(Array.isArray(observed.fastJobs)&&observed.fastJobs.some(j=>j.name==='Build, syntax and targeted Node smoke tests'&&j.run_id===r.id&&j.status==='completed'&&j.conclusion==='success'),'Fast Checks not executed.');
  return {head:observed.head,focusedQualified:true,fullQualified:false,mergeAuthorized:false,releaseAuthorized:false};
}
