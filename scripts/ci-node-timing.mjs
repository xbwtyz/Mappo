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
export function trackedNodeInventory(root=process.cwd()){
  const tracked=execFileSync('git',['ls-files','-z','--','tests/'],{cwd:root,encoding:'utf8'})
    .split('\0').filter(p=>pathPattern.test(p)).sort();
  const actual=nodeInventory(root);
  if(JSON.stringify(tracked)!==JSON.stringify(actual))throw Error('Tracked and actual Node inventory differ');
  return tracked;
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

// The reviewed manifest is evidence, not permission to omit an added test.
// Validate historical measurement integrity separately from live scheduling.
export function validateBalancedManifest(manifest,inventory) {
  if(manifest?.version!==1||!validSha(manifest.source)||
     typeof manifest.runId!=='string'||!/^\d+$/.test(manifest.runId)||
     typeof manifest.attempt!=='string'||!/^\d+$/.test(manifest.attempt)||
     !Array.isArray(manifest.files)||!Array.isArray(manifest.proposal)||
     !Array.isArray(inventory)||inventory.length<2||new Set(inventory).size!==inventory.length||
     inventory.some(p=>!pathPattern.test(p))) throw Error('Invalid balanced manifest');
  if(manifest.files.some(x=>!pathPattern.test(x.file)||!Number.isFinite(x.ms)||x.ms<0)||
     new Set(manifest.files.map(x=>x.file)).size!==manifest.files.length||
     JSON.stringify(manifest.files.map(x=>x.file).sort())!==JSON.stringify([...inventory].sort()))
    throw Error('Balanced timing manifest does not match complete current inventory');
  const expected=proposeBalanced(manifest.files,2);
  if(manifest.proposal.length!==2||manifest.proposal.some((g,i)=>
     g.shard!==expected[i].shard||g.ms!==expected[i].ms||
     JSON.stringify(g.files)!==JSON.stringify(expected[i].files)))
    throw Error('Balanced assignment differs from reproducible measured proposal');
  const assigned=manifest.proposal.flatMap(g=>g.files);
  if(new Set(assigned).size!==assigned.length||
     JSON.stringify([...assigned].sort())!==JSON.stringify([...inventory].sort()))
    throw Error('Incomplete or duplicate balanced assignment');
  return expected;
}

// Current inventory is authoritative; the historical manifest supplies weights only.
// Unknown tests receive a conservative 120s weight (or the measured p90 if higher).
export function currentWeights(manifest,inventory){
  if(!Array.isArray(manifest?.files))throw Error('Missing historical timing weights');
  validateBalancedManifest(manifest,manifest.files.map(x=>x.file));
  if(!Array.isArray(inventory)||!inventory.length||new Set(inventory).size!==inventory.length||
     inventory.some(p=>!pathPattern.test(p)))throw Error('Invalid current inventory');
  const old=new Map(manifest.files.map(x=>[x.file,x.ms]));
  const ordered=[...old.values()].sort((a,b)=>a-b);
  const fallback=Math.max(120000,ordered[Math.ceil(ordered.length*.9)-1]);
  return [...inventory].sort().map(file=>({file,ms:old.get(file)??fallback,estimated:!old.has(file)}));
}
export function measuredAssignments(manifest,inventory,shards){
  if(![2,16].includes(shards))throw Error('Unsupported measured shard count');
  const groups=proposeBalanced(currentWeights(manifest,inventory),shards);
  const assigned=groups.flatMap(g=>g.files);
  if(groups.length!==shards||groups.some(g=>g.files.length===0)||new Set(assigned).size!==assigned.length||
     JSON.stringify([...assigned].sort())!==JSON.stringify([...inventory].sort()))throw Error('Invalid measured assignment');
  return groups;
}

export const source=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const outdir=()=>resolve('artifacts','ci-timings');
function run(shard,shards) {
  if(!Number.isSafeInteger(shard)||!Number.isSafeInteger(shards)||shard<1||shard>shards||![2,4,16].includes(shards)) throw Error('Invalid native shard');
  const root=process.cwd(),inventory=trackedNodeInventory(root);
  const commit=source();
  if(!validSha(commit)) throw Error('Invalid source identity');
  const manifest=shards===4?null:JSON.parse(readFileSync(resolve(root,'scripts/ci-node-weights.json'),'utf8'));
  const assignment=manifest?measuredAssignments(manifest,inventory,shards)[shard-1]:null;
  const selected=assignment?assignment.files:inventory;
  const flags=assignment?[]:['--test-shard='+shard+'/'+shards];
  if(assignment) console.log('NODE_BALANCED_ASSIGNMENT '+JSON.stringify({source:commit,shard,estimatedMs:assignment.ms,files:selected}));
  return runTimedSelection({selected,flags,expected:assignment?selected:null,shard,shards,root,commit});
}
export function runTimedSelection({selected,flags=[],expected=selected,shard,shards,root=process.cwd(),commit=source()}){
  mkdirSync(outdir(),{recursive:true});
  const raw=resolve(outdir(),'node-'+shard+'.ndjson');
  const reportPath=resolve(outdir(),'node-'+shard+'.json');
  const result=spawnSync(process.execPath,['--test',...flags,
    '--test-reporter=tap','--test-reporter-destination=stdout',
    '--test-reporter=./scripts/ci-node-timing-reporter.mjs','--test-reporter-destination='+raw,...selected],
    {cwd:root,stdio:'inherit'});
  if(result.error) throw result.error;
  // On failure, preserve native status even if timing is absent or malformed.
  if(result.status!==0||result.signal) {process.exitCode=result.status||1;return;}
  const parsed=parseTiming(readFileSync(raw,'utf8'),root,selected);
  if(expected&&JSON.stringify(parsed.files.map(x=>x.file).sort())!==JSON.stringify([...expected].sort())) throw Error('Executed files differ from balanced assignment');
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
  const evidence=verifyTimingReports(reports,{inventory:trackedNodeInventory(),source:source(),runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,shards});
  if(shards===16){
    const groups=measuredAssignments(JSON.parse(readFileSync('scripts/ci-node-weights.json','utf8')),trackedNodeInventory(),16);
    for(const r of reports){
      if(JSON.stringify(r.files.map(x=>x.file).sort())!==JSON.stringify([...groups[r.shard-1].files].sort()))
        throw Error('Shard executed a different measured assignment');
    }
  }
  const proposal=proposeBalanced(evidence.files,2);
  const report={...evidence,proposal,diagnosticProposal:shards===16?proposeBalanced(evidence.files,16):null,
    shardTimes:reports.map(r=>({shard:r.shard,ms:r.total.duration_ms,files:r.files.length,tests:r.total.counts.tests})).sort((a,b)=>a.shard-b.shard)};
  mkdirSync(outdir(),{recursive:true});
  writeFileSync(resolve(outdir(),'node-timing-evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log('NODE_TIMING_EVIDENCE '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv[2]==='run') run(Number(process.argv[3]),Number(process.argv[4]));
  else if(process.argv[2]==='aggregate') aggregate(process.argv[3],Number(process.argv[4]));
  else throw Error('Expected native timing run or aggregate');
}
