// Shared CI routing policy. Only the current head commit can request a full
// or benchmark run. The request is an opt-in, never permission to merge.
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function classifyCIRequest(message='') {
  const text=String(message).toLowerCase();
  if (text.includes('[full-ci-benchmark]')) return 'benchmark';
  if (text.includes('[full-ci]')) return 'full';
  return 'normal';
}

export function routeFullCI(eventName,event,message='') {
  switch(eventName) {
    case 'pull_request': {
      if (typeof event.pull_request?.draft !== 'boolean') throw new Error('Missing PR state');
      const request=classifyCIRequest(message);
      return {full:!event.pull_request.draft || request!=='normal',benchmark:request==='benchmark'};
    }
    case 'workflow_dispatch':
      return {full:true,benchmark:event.inputs?.run_c7_benchmark===true || event.inputs?.run_c7_benchmark==='true'};
    case 'push':
    case 'merge_group':
      return {full:true,benchmark:false};
    default:
      throw new Error('Unsupported full CI event: '+eventName);
  }
}

// Focused benchmark selection is additive only for ordinary draft heads.
// The full gate wins on ready PRs or an explicit full marker.
export function routeFocusedBenchmarks(eventName,event,message='') {
  if (eventName!=='pull_request') return [];
  if (routeFullCI(eventName,event,message).full) return [];
  const text=String(message).toLowerCase();
  return ['f4','c7'].filter(suite=>text.includes('[benchmark-'+suite+']'));
}

export function routeFastCI({sha,message,pulls}) {
  // Missing/malformed lookup data never suppresses smoke checks. Match the
  // exact pushed head so a stale API response cannot suppress a new push.
  if (!sha || !Array.isArray(pulls)) return {run:true};
  const explicit=classifyCIRequest(message)!=='normal';
  const owner=pulls.some(pr=>pr?.state==='open' && pr.head?.sha===sha &&
    (pr.draft===false || (pr.draft===true && explicit)));
  return {run:!owner};
}

function runCLI(mode,env=process.env) {
  const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  let result;
  if (mode==='full') {
    const message=env.GITHUB_EVENT_NAME==='pull_request'
      ? execFileSync('git',['log','-1','--format=%B'],{encoding:'utf8'}) : '';
    if(env.GITHUB_EVENT_NAME==='pull_request' &&
      execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==event.pull_request?.head?.sha) {
      throw new Error('Routing checkout does not match exact PR head');
    }
    const suites=routeFocusedBenchmarks(env.GITHUB_EVENT_NAME,event,message);
    result={...routeFullCI(env.GITHUB_EVENT_NAME,event,message),
      focused_requested:suites.length>0,focused_suites:JSON.stringify(suites)};
  } else if (mode==='fast') {
    let pulls;
    try {
      const query='repos/'+env.GITHUB_REPOSITORY+'/pulls?state=open&head='+
        encodeURIComponent(env.GITHUB_REPOSITORY_OWNER+':'+env.GITHUB_REF_NAME)+'&per_page=100';
      pulls=JSON.parse(execFileSync('gh',['api','--method','GET',query],{encoding:'utf8'}));
    } catch {
      console.warn('::warning::PR lookup failed; run fast checks to be safe.');
    }
    result=routeFastCI({sha:env.GITHUB_SHA,message:event.head_commit?.message,pulls});
  } else {
    throw new Error('Unknown CI routing mode: '+mode);
  }
  const outputs=Object.entries(result).map(([key,value])=>key+'='+value+'\n').join('');
  appendFileSync(env.GITHUB_OUTPUT,outputs);
  console.log('CI routing '+mode+': '+JSON.stringify(result));
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) runCLI(process.argv[2]);
