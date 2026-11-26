import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCiDiagnostics,ciDiagnosticsExitCode} from '../scripts/development/research/ci-diagnostics.mjs';
import {diagnoseCiLog} from '../scripts/development/research/diagnostics.mjs';
const req={runId:45775429431,attempt:1,sourceRevision:'ec9158be87a81f5e11ab7b3e52838a59434a1002'};
const run={id:req.runId,run_attempt:1,head_sha:req.sourceRevision,repository:{full_name:'xbwtyz/Mappo'},name:'Mappo Fast Checks',status:'completed',conclusion:'failure'};
const job={id:139757827123,run_id:req.runId,run_attempt:1,head_sha:req.sourceRevision,name:'Build, syntax and targeted Node smoke tests',status:'completed',conclusion:'failure'};
const raw='2026-11-26T07:28:28.8114506Z not ok 29 - research pilot\n2026-11-26T07:28:28.8116900Z error: ERR_ASSERTION\n2026-11-26T07:28:28.8222573Z ##[error]Process completed with exit code 1.';
const reader=(r=run,jobs=[job],log=raw)=>({json:path=>path.includes('/jobs?')?{total_count:jobs.length,jobs}:r,log:()=>log});
test('DEV-OPT CI retrieval binds exact run attempt, revision and job identity',()=>{
  const report=collectCiDiagnostics(req,reader());
  assert.equal(report.evidenceComplete,true);assert.equal(report.originalConclusion,'failure');assert.equal(ciDiagnosticsExitCode(report),1);
  assert.equal(report.jobs[0].diagnostics.originalLog,raw);assert.equal(report.jobs[0].diagnostics.originalExitCode,1);
  assert.equal(report.jobs[0].diagnostics.failures[0].category,'probable-regression');
  for(const r of [{...run,head_sha:'a'.repeat(40)},{...run,run_attempt:2},{...run,name:'Mappo Research Pilot'}])assert.throws(()=>collectCiDiagnostics(req,reader(r)),/identity mismatch/);
  assert.throws(()=>collectCiDiagnostics(req,reader(run,[{...job,run_attempt:2}])),/Stale or duplicate/);
  assert.throws(()=>collectCiDiagnostics(req,reader(run,[job,job])),/Stale or duplicate/);
});
test('DEV-OPT missing, zero-job, canceled and incomplete CI evidence cannot be green',()=>{
  for(const r of [collectCiDiagnostics(req,reader(run,[])),collectCiDiagnostics(req,reader(run,[job],'')),collectCiDiagnostics(req,reader({...run,status:'in_progress',conclusion:null})),collectCiDiagnostics(req,reader({...run,conclusion:'cancelled'},[{...job,conclusion:'cancelled'}],''))]){
    assert.equal(r.evidenceComplete,false);assert.equal(ciDiagnosticsExitCode(r),1);
  }
  const r=reader();r.json=path=>path.includes('/jobs?')?{total_count:2,jobs:[job]}:run;
  assert.throws(()=>collectCiDiagnostics(req,r),/Incomplete CI job inventory/);
});
test('DEV-OPT CI reader keeps skips separate and only reports original success',()=>{
  const r=collectCiDiagnostics(req,reader({...run,conclusion:'success'},[{...job,conclusion:'success'},{...job,id:2,conclusion:'skipped'}]));
  assert.equal(r.originalConclusion,'success');assert.equal(r.jobs[1].conclusion,'skipped');assert.equal(ciDiagnosticsExitCode(r),0);
});

test('DEV-OPT preserves original ANSI-colored logs while parsing safe text',()=>{
  const colored=raw.replace('not ok 29','\u001b[31mnot ok 29\u001b[0m');
  const report=collectCiDiagnostics(req,reader(run,[job],colored));
  assert.equal(report.evidenceComplete,true);
  assert.equal(report.jobs[0].diagnostics.originalLog,colored);
  assert.equal(report.jobs[0].diagnostics.failures[0].context.testName,'research pilot');
  assert.equal(report.jobs[0].diagnostics.failures[0].category,'probable-regression');
  assert.equal(ciDiagnosticsExitCode(report),1);
});
