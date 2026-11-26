import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {digest,expandResearchManifest} from '../scripts/development/research/contract.mjs';
import {diagnoseResearchReport,diagnoseCiLog,classifyFailure} from '../scripts/development/research/diagnostics.mjs';
const m={...JSON.parse(readFileSync(new URL('../docs/development/research/lare-pilot.json',import.meta.url))),sourceRevision:'a'.repeat(40),environment:{nodeMajor:22,platform:'linux'}};
const meta={repository:'xbwtyz/Mappo',sourceRevision:'a'.repeat(40),runId:45775429431,jobId:139757827123,jobName:'Build, syntax and targeted Node smoke tests',conclusion:'failure',exitCode:1};
const log='2026-11-26T07:28:28.8114506Z not ok 29 - DEV-OPT real LARE pilot: two strategies, held-out fixture, isolated deterministic validation\n2026-11-26T07:28:28.8116250Z   ---\n2026-11-26T07:28:28.8116900Z   error: Expected values to be strictly equal:\n2026-11-26T07:28:28.8117960Z   code: ERR_ASSERTION\n2026-11-26T07:28:28.8118000Z   stack: at TestContext.<anonymous> (file:///tests/dev-opt-research.test.js:28:10)\n2026-11-26T07:28:28.8212618Z # tests 72\n2026-11-26T07:28:28.8222573Z ##[error]Process completed with exit code 1.';
test('DEV-OPT diagnoses original research failures with full task context and no authority',()=>{
  const tasks=expandResearchManifest(m);
  const rows=tasks.map(t=>({key:t.key,status:'verified'}));
  rows[0]={key:tasks[0].key,status:'failed',diagnostic:{exitCode:1,stderr:'Error: Unknown preservation strategy.\n at createLareRoadOperation (reconciliation-operation.js:6:11)'}};
  rows[1].status='timeout';rows[2].status='cancelled';rows.pop();
  const report={sourceRevision:m.sourceRevision,manifestDigest:digest(m),complete:false,matrixResult:'failure',runId:'123',attempt:'1',results:rows,faults:['Missing shard 1']};
  const original=JSON.stringify(report),r=diagnoseResearchReport(m,report);
  assert.equal(r.originalComplete,false);assert.equal(r.productionAdoptionAuthorized,false);assert.equal(r.failures.length,5);
  assert.equal(r.failures[0].category,'environment-or-setup');assert.deepEqual(r.failures[0].original,rows[0]);
  assert.deepEqual(r.failures[0].context.fixture,tasks[0].case);assert.equal(r.failures[0].context.strategy,tasks[0].strategy);
  assert.equal(r.failures[1].category,'timeout');assert.equal(r.failures[2].category,'incomplete-evidence');assert.equal(JSON.stringify(report),original);
  assert.throws(()=>diagnoseResearchReport(m,{...report,sourceRevision:'b'.repeat(40)}));
});
test('DEV-OPT preserves TAP assertion, source location, original log and failure status',()=>{
  const r=diagnoseCiLog(meta,log);
  assert.equal(r.originalConclusion,'failure');assert.equal(r.originalExitCode,1);assert.equal(r.originalLog,log);
  assert.equal(r.failures.length,1);assert.equal(r.failures[0].category,'probable-regression');assert.equal(r.failures[0].provisional,true);
  assert.match(r.failures[0].original,/dev-opt-research.test.js:28:10/);
  assert.match(r.failures[0].context.testName,/real LARE pilot/);
  assert.equal(r.context.jobUrl,'https://github.com/xbwtyz/Mappo/actions/runs/45775429431/job/139757827123');
});
test('DEV-OPT failure classification remains provisional and handles absent evidence',()=>{
  assert.equal(classifyFailure('failed','Nondeterministic candidate').category,'nondeterminism');
  assert.equal(classifyFailure('failure','ERR_MODULE_NOT_FOUND').category,'environment-or-setup');
  assert.equal(classifyFailure('failure','ERR_TEST_TIMEOUT').category,'timeout');
  assert.equal(classifyFailure('failure','unexpected problem').category,'unclassified');
  assert.equal(diagnoseCiLog({...meta,conclusion:'cancelled'},'').failures[0].category,'incomplete-evidence');
  assert.throws(()=>diagnoseCiLog({...meta,sourceRevision:'invalid'},log));
});
test('DEV-OPT diagnostics CLI retains failed exit status and cannot overwrite historical evidence',()=>{
  const root=mkdtempSync(join(tmpdir(),'mappo-diagnostics-'));
  try{
    const input=join(root,'meta.json'),raw=join(root,'log.txt'),out=join(root,'out.json');
    writeFileSync(input,JSON.stringify(meta));writeFileSync(raw,log);
    const script=new URL('../scripts/development/research/diagnostics.mjs',import.meta.url);
    const run=()=>spawnSync(process.execPath,[script.pathname,'ci',input,raw,out],{encoding:'utf8'});
    assert.equal(run().status,1);const first=readFileSync(out,'utf8');assert.equal(JSON.parse(first).originalConclusion,'failure');
    assert.equal(run().status,1);assert.equal(readFileSync(out,'utf8'),first);
  }finally{rmSync(root,{recursive:true,force:true});}
});
