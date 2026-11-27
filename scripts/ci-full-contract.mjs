// Full CI architecture. Historical six-runner evidence is explicitly separate.
export const NODE_SHARDS=16;
export const BROWSER_SUITES=Object.freeze(['desktop','roads','property','integration']);
export function mandatoryJobNames(shards=NODE_SHARDS,{routing=true}={}){
  if(![2,NODE_SHARDS].includes(shards))throw Error('Unsupported CI architecture');
  return [...(routing?['Resolve full CI request']:[]),
    ...Array.from({length:shards},(_,i)=>'Node regression (shard '+(i+1)+'/'+shards+')'),
    ...BROWSER_SUITES.map(name=>'Browser QA ('+name+')'),
    'Build, Node tests and browser QA'];
}
export function completeFullJobs(jobs,run,shards=NODE_SHARDS){
  if(!Array.isArray(jobs)||!Number.isSafeInteger(run?.id)||run.id<1||!Number.isSafeInteger(run?.run_attempt)||run.run_attempt<1)return false;
  const required=mandatoryJobNames(shards);
  const nodeJobs=jobs.filter(j=>j.name.startsWith('Node regression (shard '));
  if(nodeJobs.length!==shards)return false;
  return required.every(name=>{
    const rows=jobs.filter(j=>j.name===name);
    return rows.length===1&&rows[0].run_id===run.id&&rows[0].run_attempt===run.run_attempt&&
      rows[0].status==='completed'&&rows[0].conclusion==='success';
  });
}

export const FAST_JOB='Build, syntax and targeted Node smoke tests';
export const FAST_COMPLETE='Focused execution completeness';
export function focusedExecution(jobs,run){
  if(!Array.isArray(jobs)||!Number.isSafeInteger(run?.id)||run.id<1||!Number.isSafeInteger(run?.run_attempt)||run.run_attempt<1)return null;
  const rows=jobs.filter(j=>j.name===FAST_JOB);
  const good=j=>j?.run_id===run.id&&j.run_attempt===run.run_attempt&&j.status==='completed'&&j.conclusion==='success';
  const passedStep=(j,name)=>Array.isArray(j?.steps)&&j.steps.filter(s=>s.name===name).length===1&&j.steps.some(s=>s.name===name&&s.conclusion==='success');
  if(rows.length!==1||!good(rows[0])||!passedStep(rows[0],'Select exact-push incremental checks')||
     !passedStep(rows[0],'Build and verify offline standalone parity'))return null;
  const primary=rows[0],parallel=jobs.filter(j=>/^Focused Node \(shard \d+\)$/.test(j.name));
  const aggregate=jobs.filter(j=>j.name===FAST_COMPLETE);
  if(passedStep(primary,'Run smoke tests and directly modified Node tests')){
    if(parallel.length||aggregate.some(j=>j.conclusion!=='skipped'))return null;
    return {shards:1,jobId:primary.id,completionJobId:null};
  }
  if(!passedStep(primary,'Retain exact focused execution plan')||parallel.length<2||parallel.length>16||aggregate.length!==1||
     !good(aggregate[0])||!passedStep(aggregate[0],'Verify exact selected inventory and all shard reports'))return null;
  for(let i=1;i<=parallel.length;i++){
    const list=parallel.filter(j=>j.name==='Focused Node (shard '+i+')');
    if(list.length!==1||!good(list[0])||!passedStep(list[0],'Run assigned focused tests'))return null;
  }
  return {shards:parallel.length,jobId:primary.id,completionJobId:aggregate[0].id};
}
