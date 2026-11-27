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
