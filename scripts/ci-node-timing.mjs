// Development infrastructure only. Native Node isolation, TAP and exit status retained.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { availableParallelism, arch, platform } from 'node:os';
import { pathToFileURL } from 'node:url';

const validSha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const pathPattern=/^tests\/[^/]+\.test\.js$/;
export function nodeInventory(root=process.cwd()) {
  return readdirSync(resolve(root,'tests'),{withFileTypes:true})
    .filter(x=>x.isFile()&&x.name.endsWith('.test.js'))
    .map(x=>'tests/'+x.name).sort();
}
function validCounts(counts) {
  return counts&&['tests','passed','failed','cancelled','skipped','todo'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0);
}
export function parseTiming(text,root,inventory) {
  const allowed=new Set(inventory);
  const files=new Map();
  let total=null;
  for(const line of text.split(/\r?\n/).filter(Boolean)) {
    const row=JSON.parse(line);
    if(!Number.isFinite(row.duration_ms)||row.duration_ms<0||typeof row.success!=='boolean'||!validCounts(row.counts)) throw Error('Invalid native timing summary');
    if(row.file===null) {
      if(total) throw Error('Duplicate aggregate summary');
      total=row;continue;
    }
    if(typeof row.file!=='string') throw Error('Missing timing file');
    const file=relative(root,isAbsolute(row.file)?row.file:resolve(root,row.file)).split(sep).join('/');
    if(!pathPattern.test(file)||!allowed.has(file)||files.has(file)) throw Error('Unexpected or duplicate timing file: '+file);
    files.set(file,{...row,file});
  }
  if(!total||!files.size) throw Error('Incomplete native timing report');
  return {files:[...files.values()].sort((a,b)=>a.file.localeCompare(b.file)),total};
}
export function verifyTimingReports(reports,{inventory,source,runId,attempt,shards}) {
  if(!validSha(source)||!Number.isSafeInteger(shards)||shards<1||!Array.isArray(reports)||reports.length!==shards||
     !Array.isArray(inventory)||!inventory.length||new Set(inventory).size!==inventory.length) throw Error('Invalid timing qualification inputs');
  const expected=new Set(inventory),seen=new Set(),seenShards=new Set(),files=[];
  let environment=null;
  for(const r of reports) {
    if(r?.version!==1||r.source!==source||r.runId!==runId||r.attempt!==attempt||r.shards!==shards||
       !Number.isSafeInteger(r.shard)||r.shard<1||r.shard>shards||seenShards.has(r.shard)||
       typeof r.node!=='string'||typeof r.platform!=='string'||typeof r.arch!=='string'||
       !Number.isSafeInteger(r.parallelism)||r.parallelism<1||
       r.exitCode!==0||r.total?.success!==true||!validCounts(r.total.counts)||
       !Number.isFinite(r.total.duration_ms)||r.total.duration_ms<0||
       r.total.counts.failed!==0||r.total.counts.cancelled!==0||
       !Array.isArray(r.files)||!r.files.length) throw Error('Invalid, stale, failed or duplicate timing shard');
    const e=JSON.stringify([r.node,r.platform,r.arch,r.parallelism]);
    if(environment!==null&&environment!==e) throw Error('Incomparable timing environments');
    environment=e;seenShards.add(r.shard);
    let count=0;
    for(const row of r.files) {
      if(!expected.has(row.file)||seen.has(row.file)||row.success!==true||!validCounts(row.counts)||
         row.counts.failed!==0||row.counts.cancelled!==0||
         !Number.isFinite(row.duration_ms)||row.duration_ms<0) throw Error('Invalid, missing or duplicate timing file: '+row.file);
      count+=row.counts.tests;seen.add(row.file);files.push({file:row.file,ms:row.duration_ms,tests:row.counts.tests,shard:r.shard});
    }
    if(count!==r.total.counts.tests) throw Error('File/aggregate test count mismatch');
  }
  if(seen.size!==expected.size||[...expected].some(x=>!seen.has(x))) throw Error('Incomplete timing inventory');
  return {version:1,source,runId,attempt,shards,environment:JSON.parse(environment),files:files.sort((a,b)=>a.file.localeCompare(b.file)),
    tests:files.reduce((n,x)=>n+x.tests,0)};
}
export function proposeBalanced(files,shards=2) {
  if(!Number.isSafeInteger(shards)||shards<1||!Array.isArray(files)||files.length<shards||
     new Set(files.map(x=>x.file)).size!==files.length||
     files.some(x=>typeof x.file!=='string'||!Number.isFinite(x.ms)||x.ms<0)) throw Error('Invalid measured weights');
  const groups=Array.from({length:shards},(_,i)=>({shard:i+1,ms:0,files:[]}));
  // Deterministic longest processing time first, then lexical path and shard id.
  for(const item of [...files].sort((a,b)=>b.ms-a.ms||a.file.localeCompare(b.file))) {
    const group=[...groups].sort((a,b)=>a.ms-b.ms||a.files.length-b.files.length||a.shard-b.shard)[0];
    group.files.push(item.file);group.ms+=item.ms;
  }
  return groups.map(g=>({...g,files:g.files.sort()}));
}
const source=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const outdir=()=>resolve('artifacts','ci-timings');
function run(shard,shards) {
  if(!Number.isSafeInteger(shard)||!Number.isSafeInteger(shards)||shard<1||shard>shards||![2,4].includes(shards)) throw Error('Invalid native shard');
  const root=process.cwd(),inventory=nodeInventory(root);
  mkdirSync(outdir(),{recursive:true});
  const raw=resolve(outdir(),'node-'+shard+'.ndjson');
  const reportPath=resolve(outdir(),'node-'+shard+'.json');
  const commit=source();
  if(!validSha(commit)) throw Error('Invalid source identity');
  const result=spawnSync(process.execPath,['--test','--test-shard='+shard+'/'+shards,
    '--test-reporter=tap','--test-reporter-destination=stdout',
    '--test-reporter=./scripts/ci-node-timing-reporter.mjs','--test-reporter-destination='+raw,...inventory],
    {cwd:root,stdio:'inherit'});
  if(result.error) throw result.error;
  // On failure, preserve native status even if timing is absent or malformed.
  if(result.status!==0||result.signal) {process.exitCode=result.status||1;return;}
  const parsed=parseTiming(readFileSync(raw,'utf8'),root,inventory);
  const report={version:1,source:commit,runId:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',
    shard,shards,node:process.version,platform:platform(),arch:arch(),parallelism:availableParallelism(),exitCode:0,...parsed};
  if(report.total.success!==true||report.total.counts.failed||report.total.counts.cancelled||
     report.files.some(x=>!x.success||x.counts.failed||x.counts.cancelled)) throw Error('Native timing reports incomplete or failed tests');
  if(report.files.reduce((n,x)=>n+x.counts.tests,0)!==report.total.counts.tests) throw Error('Native timing counts differ');
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('NODE_TIMING_REPORT '+JSON.stringify(report));
}
function aggregate(directory,shards) {
  const reports=readdirSync(directory).filter(p=>/^node-\d+\.json$/.test(p)).map(p=>JSON.parse(readFileSync(resolve(directory,p),'utf8')));
  const evidence=verifyTimingReports(reports,{inventory:nodeInventory(),source:source(),runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,shards});
  const proposal=proposeBalanced(evidence.files,2);
  const report={...evidence,proposal};
  mkdirSync(outdir(),{recursive:true});
  writeFileSync(resolve(outdir(),'node-timing-evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log('NODE_TIMING_EVIDENCE '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv[2]==='run') run(Number(process.argv[3]),Number(process.argv[4]));
  else if(process.argv[2]==='aggregate') aggregate(process.argv[3],Number(process.argv[4]));
  else throw Error('Expected native timing run or aggregate');
}
