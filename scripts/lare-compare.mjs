import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {prepareRoadGroupReflowB1,iterateRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {validateRoadGroupApplyB1} from '../src/editor/road-application.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
const [dir,strategy]=process.argv.slice(2);
if(!dir)throw Error('Usage: node scripts/lare-compare.mjs CORPUS_DIRECTORY [STRATEGY]');
const hash=s=>createHash('sha256').update(s).digest('hex');
const corpus=JSON.parse(await readFile(join(dir,'baseline.json'),'utf8'));
assert.equal(corpus.baseline,'e5f1cf83dcdcc75e52911aa717035955b40569d0');
const archivePrefix = { 'selective-adaptive': 'selective-', 'enhanced-adaptive': 'combined-' }[strategy];
if (strategy && !archivePrefix) throw Error('Unknown standalone preservation strategy: ' + strategy);
const caseKey = row => JSON.stringify([row.projectId, row.roadIds, row.offset.x, row.offset.y]);
const archive = new Map(), archiveDifferences = [];
if (archivePrefix) {
  const evidence = new URL('../docs/plans/0.2x/milestones/b1r-research/evidence/', import.meta.url);
  for (const name of (await readdir(evidence)).filter(name => name.startsWith(archivePrefix) && name.endsWith('.jsonl'))) {
    const raw = await readFile(new URL(name, evidence), 'utf8');
    for (const line of raw.trimEnd().split('\n')) {
      const row = JSON.parse(line), key = caseKey(row);
      assert.ok(!archive.has(key), 'Duplicate archived case: ' + key);
      archive.set(key, row);
    }
  }
  assert.equal(archive.size, 800);
  assert.equal(new Set(corpus.rows.map(caseKey)).size, corpus.rows.length, 'Duplicate frozen corpus cases');
  for (const row of corpus.rows) {
    const key = caseKey(row), archived = archive.get(key);
    assert.ok(archived, 'Case absent from research archive: ' + key);
    assert.equal(row.fingerprint, archived.fingerprint, 'Project differs from archived input: ' + key);
    assert.equal(row.accepted, archived.baselineAccepted, 'B1 outcome differs from archived baseline: ' + key);
  }
}

const summary={attempted:0,baselineAccepted:0,retained:0,recovered:0,regressed:0,bothRefused:0,invalid:0};
const rows=[];
for(const entry of corpus.projects){
 const raw=(await readFile(join(dir,'projects',entry.projectId+'.json'),'utf8')).trimEnd();
 assert.equal(hash(raw),entry.fingerprint);
 const project=JSON.parse(raw),workspace=defaultWorkspace(project);
 validateStoredProject(project);
 for(const row of corpus.rows.filter(r=>r.projectId===entry.projectId)){
  assert.equal(row.fingerprint,entry.fingerprint);
  const start=performance.now();
  const stages={},inventory=new Map();
  const iterator=iterateRoadGroupReflowB1(project,row.roadIds,row.offset,{strategy});
  let step,previous={work:0,expansions:0},clock=performance.now(),tier=0,seenInventory=false;
  for(;;){
   step=iterator.next();const now=performance.now();
   if(step.done){const a=stages['return']??={yields:0,ms:0,work:0,expansions:0};a.ms+=now-clock;break;}
   const v=step.value??{},stage=String(v.stage??'search');
   if(stage==='parcel-inventory'&&inventory.has(tier+':'+v.id)){tier++;seenInventory=true;}
   if(stage==='parcel-inventory'){inventory.set(tier+':'+v.id,true);seenInventory=true;}
   const a=stages[tier+':'+stage]??={yields:0,ms:0,work:0,expansions:0};
   a.yields++;a.ms+=now-clock;
   if(v.stats){a.work+=v.stats.work-previous.work;a.expansions+=v.stats.expansions-previous.expansions;previous=v.stats;}
   clock=now;
  }
  const preview=step.value;
  const previewMs=performance.now()-start;
  const receipt=preview.candidateProject?validateRoadGroupApplyB1(project,workspace,{selectedRoadIds:row.roadIds,offset:row.offset,strategy},preview):null;
  const accepted=Boolean(receipt?.ok);
  let invalid=null;
  if(accepted){
   try {
    validateStoredProject(receipt.candidate);
    const draft=prepareRoadGroupIntentB1(project,row.roadIds,row.offset);
    const violation=verifyLareGroupPreservation(project,receipt.candidate,draft,new Map(),createLareBudget());
    assert.equal(violation,null,JSON.stringify(violation));
   }catch(error){invalid=error.message;summary.invalid++;}
  }
  assert.equal(JSON.stringify(project),raw,'Accepted input mutated');
  summary.attempted++;if(row.accepted)summary.baselineAccepted++;
  const classification=row.accepted?(accepted?'retained':'regressed'):(accepted?'recovered':'bothRefused');
  summary[classification]++;
  const record={projectId:entry.projectId,fingerprint:entry.fingerprint,roadIds:row.roadIds,offset:row.offset,baselineAccepted:row.accepted,accepted,classification,invalid,previewMs,issues:(preview.candidateProject?(receipt?.issues??[]):preview.unresolved??[]).map(i=>({code:i.code,message:i.message})),candidateFingerprint:accepted?hash(JSON.stringify(receipt.candidate)):null,baselineIssues:row.issues,diagnostic:{stages,inventory:[...inventory.keys()],inferredSecondInventory:tier>0,stats:preview.lare?.stats??null,lastRejectedCandidate:preview.lare?.lastRejectedCandidate??null,exhausted:preview.lare?.exhausted??null,score:preview.lare?.score??null,source:preview.lare?.source??null}};
  const archived = archive.get(caseKey(record));
  if (archived && record.accepted !== archived.accepted) {
    archiveDifferences.push({ projectId: record.projectId, roadIds: record.roadIds, offset: record.offset,
      archivedAccepted: archived.accepted, accepted: record.accepted, issues: record.issues });
  }
  rows.push(record);
  console.log('LARE_CASE '+JSON.stringify(record));
 }
 console.log('LARE_PROJECT '+JSON.stringify({projectId:entry.projectId,fingerprint:entry.fingerprint,summary}));
}
await writeFile(join(dir,strategy?'comparison-'+strategy+'.json':'comparison.json'),JSON.stringify({baseline:corpus.baseline,strategy:strategy??null,summary,archiveDifferences,rows},null,2)+'\n');
console.log('LARE_SUMMARY '+JSON.stringify(summary));
assert.equal(summary.attempted,corpus.rows.length);
assert.equal(summary.invalid,0,'Invalid accepted candidates');
assert.equal(summary.regressed,0,'Previously valid B1 edits refused by B1R');

assert.equal(archiveDifferences.filter(row => row.archivedAccepted).length, 0,
  'Archived strategy successes refused by B1R');
