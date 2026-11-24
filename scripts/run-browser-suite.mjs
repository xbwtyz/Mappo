import {readFileSync,mkdirSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('./browser-suites.json',import.meta.url),'utf8'));
const suite=process.argv[2];
if(process.argv.length!==3||!Object.hasOwn(manifest,suite))throw Error('Expected one browser suite: desktop, roads, property or integration.');
const files=manifest[suite];
if(!Array.isArray(files)||!files.length)throw Error('Empty browser suite: '+suite);
const all=Object.values(manifest).flat();
if(new Set(all).size!==all.length||all.some(file=>typeof file!=='string'||!file.startsWith('scripts/')||!/^[a-z0-9-]+[.]mjs$/.test(file.slice(8))||!existsSync(resolve(root,file))))
  throw Error('Invalid, duplicate or missing browser script in manifest.');
const start=performance.now(),results=[];
for(const file of files){
  console.log('::group::'+suite+' / '+file);
  const begun=performance.now();
  const result=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit',env:process.env});
  const seconds=Number(((performance.now()-begun)/1000).toFixed(2));
  const ok=result.status===0&&!result.error&&!result.signal;
  results.push({file,seconds,ok,exitCode:result.status,signal:result.signal,error:result.error?.message??null});
  console.log('BROWSER_SCRIPT '+JSON.stringify(results.at(-1)));
  console.log('::endgroup::');
}
const elapsedSeconds=Number(((performance.now()-start)/1000).toFixed(2));
const passed=results.filter(x=>x.ok).length;
const report={suite,elapsedSeconds,passed,failed:results.length-passed,results};
const path=resolve(root,'artifacts','ci-timings');
mkdirSync(path,{recursive:true});writeFileSync(resolve(path,suite+'.json'),JSON.stringify(report,null,2)+'\n');
const rows=[...results].sort((a,b)=>b.seconds-a.seconds).map(x=>'| '+x.file+' | '+x.seconds.toFixed(2)+' | '+(x.ok?'PASS':'FAIL')+' |');
const summary=['## Browser QA — '+suite,'','Script execution: '+elapsedSeconds+'s; '+passed+'/'+results.length+' passed. Container startup, checkout and installation are separate Actions steps.','','| Script | Seconds | Result |','| --- | ---: | --- |',...rows,''].join('\n');
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(passed!==results.length)process.exitCode=1;
