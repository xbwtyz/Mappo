// Locked-source accounting only. No caller-provided candidate or road authority.
import {createHash} from 'node:crypto';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {readP6ArchivedRoadEvidence} from './ares-p6-ownership-observe.mjs';
import {auditP5CoordinatedCandidateForP6} from './ares-p5-topology-audit.mjs';
import {observeP6DryPipeline} from './ares-p6-budgeted-pipeline.mjs';
function fingerprint(value,b){
 const json=aresReplayJson(value,b);
 b.spend(Math.max(1,Math.ceil(Buffer.byteLength(json)/64)));
 return createHash('sha256').update(json,'utf8').digest('hex');
}
// Independently reassemble road records from the audited witness. This helper
// is diagnostic only; even a matching fingerprint grants no Apply authority.
export function bindP6RoadRecords(city,w,expected,b){
 const moved=new Map(),parts=new Map();
 for(const n of w.requested){b.spend();moved.set(n.ref.id,n.point);}
 for(const n of w.neighbors){b.spend();moved.set(n.id,n.point);}
 for(const row of w.lineage){b.spend();parts.set(row.parent,row.children);}
 const nodes=city.nodes.map(n=>{b.spend();const p=moved.get(n.id);return p?{...n,x:p.x,y:p.y}:{...n};});
 for(const c of w.contacts){b.spend();nodes.push({...c.node});}
 const roads=city.roads.flatMap(r=>{
  const children=parts.get(r.id);b.spend(Math.max(1,children?.length??1));
  return children??[{...r}];
 });
 const candidate={nodes,roads},actual=fingerprint(candidate,b);
 return actual===expected?{status:'matched',candidate,fingerprint:actual,authority:'none'}:{status:'mismatch',authority:'none'};
}
export async function observeP6LockedDryPipeline(id){
 const prior=readP6ArchivedRoadEvidence(id);
 const base={id,source:prior.source,authority:'none',valid:false,landVerified:false};
 if(prior.status!=='verified')return {...base,status:'road-refused'};
 if(prior.audit?.status!=='topology-final-verified'||prior.audit.sweptUnresolved.length||!prior.construction?.witness)throw Error('Missing archived qualified road witness.');
 const audit=await auditP5CoordinatedCandidateForP6(id,prior.construction);
 if(audit.status!=='topology-final-verified'||audit.sweptUnresolved.length||audit.rotationDiagnostic.finalChanged!==0||!audit.p6RoadFingerprint)
  return {...base,status:'road-replay-refused',roadAudit:audit.status,reason:audit.reason};
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
 let bindingWork=0,matched=false;
 const finish=(status,extra={})=>({...base,status,roadAudit:audit.status,roadAuditWork:audit.stats.work,bindingWork,bindingMatched:matched,stats:b.snapshot(),...extra});
 try{
  const f=materializeLockedRtreCase(id),before=fingerprint(f.project,b);
  if(before!==prior.source||before!==audit.source)return finish('source-mismatch');
  const bound=bindP6RoadRecords(f.project.city,prior.construction.witness,audit.p6RoadFingerprint,b);
  bindingWork=b.snapshot().work;
  if(bound.status!=='matched')return finish('road-record-mismatch');
  matched=true;
  const pipeline=observeP6DryPipeline(f.project.city,bound.candidate,b);
  const unchanged=fingerprint(f.project,b)===before;
  if(!unchanged)throw Error('P6 source mutated.');
  return finish(pipeline.diagnosticsComplete?'diagnostics-complete':'pipeline-refused',{fingerprint:bound.fingerprint,pipeline,sourceUnchanged:true});
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',{reason:e.resource});throw e;}
}
