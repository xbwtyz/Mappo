// Incremental checks only. Full review-ready/main CI remains independent.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const VALID = x => typeof x === 'string' && SHA.test(x) && !/^0+$/.test(x);
export const MAIN_JOBS = [
  'Resolve full CI request', 'Node regression (shard 1/2)', 'Node regression (shard 2/2)',
  'Browser QA (desktop)', 'Browser QA (roads)', 'Browser QA (property)', 'Browser QA (integration)',
  'Build, Node tests and browser QA'
];
export function verifiedMainRun(sha, run, response) {
  if (!VALID(sha) || run?.head_sha !== sha || run.head_branch !== 'main' || run.event !== 'push' ||
      run.name !== 'Mappo CI' || run.status !== 'completed' || run.conclusion !== 'success' ||
      !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
      !Array.isArray(response?.jobs) || response.total_count !== response.jobs.length) return false;
  return MAIN_JOBS.every(name => {
    const matching = response.jobs.filter(j => j.name === name);
    return matching.length === 1 && matching[0].run_id === run.id &&
      matching[0].run_attempt === run.run_attempt && matching[0].status === 'completed' &&
      matching[0].conclusion === 'success';
  });
}
export function changeRange({head,before,parents,mainAncestor,verifiedMain,isAncestor}) {
  if (!VALID(head) || !Array.isArray(parents) || parents.some(x=>!VALID(x))) throw Error('Invalid checkout identity');
  // Only a single, ordinary two-parent reconciliation of the old branch
  // with independently qualified main can use the second parent.
  if (parents.length===2 && before===parents[0] && mainAncestor===parents[1] &&
      verifiedMain===parents[1] && isAncestor(before,head) && isAncestor(mainAncestor,head))
    return {base:mainAncestor,mode:'verified-main-reconciliation'};
  if (VALID(before) && before!==head && isAncestor(before,head)) return {base:before,mode:'push-range'};
  // New branch with one parent on main, verified by the same full gate.
  if (/^0{40}$/.test(before || '') && parents.length===1 && mainAncestor===parents[0] &&
      verifiedMain===parents[0] && isAncestor(mainAncestor,head))
    return {base:mainAncestor,mode:'verified-new-branch'};
  return {base:null,mode:'conservative-inventory'};
}

const smoke = [
  'build','core','persistence','ci-trigger','road-preview','c7-junction-preview-worker','c7-p2-worker-cancellation'
];
const profiles = {
  infrastructure:/^(ci-|dev-opt-|h1-release-policy)/,
  'compression-partition':/^spatial-recovery-compression(?:\.test|-single-pass-history|-fixed-reuse|-unified-progressive|-unified-history|-inventory-reuse)/,
  geometry:/^(geometry|adjustment-audit|road-|property-|plot-|building|courtyard|local-reconciliation|spatial-recovery|neighborhood-reflow|parcel-reconciliation|dead-end|junction-|c7-)/,
  sre:/^(spatial-recovery|local-reconciliation|lare-|neighborhood-reflow|parcel-reconciliation|road-group|road-reconciliation|identity-qualification|identity-generation)/,
  roads:/^(road-|dead-end|junction-|c7-|neighborhood-reflow|parcel-reconciliation|local-reconciliation|spatial-recovery|lare-|identity-road)/,
  properties:/^(property-|plot-|parcel-reconciliation|building|courtyard|allocated-land|allocated-property|identity-|local-reconciliation|spatial-recovery)/,
  buildings:/^(building|courtyard|allocated-building|property-|plot-|identity-|local-reconciliation|spatial-recovery)/,
  schema:/^(schema|identity|allocated-|persistence|h2-|accepted-|transaction-|building-project|spatial-recovery|local-reconciliation)/,
  serialization:/^(persistence|h2-|schema|identity-|accepted-|whole-city-png|dev4f-|workspace)/,
  ui:/^(canvas-|input-|inspector-|selection-|shortcut-|map-interaction|workspace|responsive-|readability|editing-precision|draft-engine|pending-changes|undo-context|validation-feedback|inspection-|phase7-|.*-workflow|.*-application|road-preview|road-editor|property-selection|building-selection)/
};
function classify(path) {
  if (path.startsWith('docs/') || /^(AGENTS|README|LICENSE|CHANGELOG)(\..*)?$/.test(path)) return [];
  if (path==='tests/spatial-recovery-compression-support.js') return ['compression-partition'];
  if (/^tests\/[^/]+\.test\.js$/.test(path)) return [];
  if (path==='index.html' || /^dist\/mappo-[^/]+\.html$/.test(path)) return [];
  if (/^(scripts\/ci-(trigger|focused|node-timing|node-timing-reporter)\.mjs|\.github\/workflows\/ci(-fast|-node-timing)?\.yml|scripts\/ci-node-weights\.json|scripts\/browser-suites\.json|scripts\/run-browser-suite\.mjs|scripts\/development\/.+)$/.test(path)) return ['infrastructure'];
  if (/^src\/core\/(geometry|validate-|identity|secure-identity|accepted-|city-model|project-schema|prng|boundary|placement|reconciliation-|neighborhood-reflow|parcel-reconciliation|road-group-preservation)/.test(path) ||
      /^src\/data\/project-validation/.test(path)) return ['all'];
  if (/^src\/core\/spatial-recovery-/.test(path)) return ['sre','roads','schema'];
  if (/^src\/(core|editor)\/(road-|junction-)/.test(path)) return ['roads','properties','buildings','schema'];
  if (/^src\/(core|editor)\/(property-|plot-)/.test(path)) return ['properties','roads','buildings','schema'];
  if (/^src\/(core|editor)\/(building|courtyard-)/.test(path)) return ['buildings','properties','roads','schema'];
  if (/^src\/data\/(migrate|migrations|project-format|file-io|recovery-store)/.test(path)) return ['schema','serialization'];
  if (/^(src\/ui\/|styles\/)/.test(path)) return ['ui','roads','properties','buildings'];
  // Build/template, unclassified shared source, tests/fixtures, and unknown
  // tooling may affect anything. Never silently narrow them.
  return ['all'];
}
export function selectTests(paths, inventory, broad=false) {
  if (!Array.isArray(paths) || !Array.isArray(inventory) || !inventory.length ||
      inventory.some(p=>typeof p!=='string'||!/^tests\/[^/]+\.test\.js$/.test(p)) ||
      paths.some(p=>typeof p!=='string'||!p)) throw Error('Invalid incremental inventory');
  const names = new Set(inventory);
  if (names.size!==inventory.length) throw Error('Duplicate test inventory');
  const deletedTest=paths.some(p=>/^tests\/[^/]+\.test\.js$/.test(p)&&!names.has(p));
  const tags = new Set(broad||deletedTest?['all']:paths.flatMap(classify));
  const selected = new Set(smoke.map(n=>'tests/'+n+'.test.js').filter(p=>names.has(p)));
  // Required base smoke tests cannot disappear silently.
  for(const n of smoke.slice(0,4)) if(!selected.has('tests/'+n+'.test.js')) throw Error('Missing required smoke: '+n);
  for(const p of paths) if(names.has(p)) selected.add(p);
  if(tags.has('all')) for(const p of names) selected.add(p);
  else for(const tag of tags) for(const p of names)
    if(profiles[tag].test(p.slice(6))) selected.add(p);
  return {profiles:[...tags].sort(),tests:[...selected].sort()};
}

const git = args => execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const nul = text => text.split('\0').filter(Boolean);
const ancestor = (a,b) => VALID(a)&&VALID(b)&&spawnSync('git',['merge-base','--is-ancestor',a,b],{stdio:'ignore'}).status===0;
function mainEvidence(sha,env) {
  if (!VALID(sha)) return null;
  try {
    const api = path => JSON.parse(execFileSync('gh',['api','--method','GET','repos/'+env.GITHUB_REPOSITORY+'/'+path],{encoding:'utf8',maxBuffer:8*1024*1024}));
    const result=api('actions/workflows/ci.yml/runs?branch=main&event=push&head_sha='+sha+'&status=success&per_page=10');
    for(const run of result.workflow_runs || []) {
      if(run.head_sha!==sha || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt)) continue;
      const jobs=api('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
      if(verifiedMainRun(sha,run,jobs)) return sha;
    }
  } catch(error) { console.warn('::warning::Exact-main qualification lookup unavailable; keep conservative push selection.'); }
  return null;
}
function planPath(env) {
  if (!env.RUNNER_TEMP) throw Error('Missing runner temporary directory');
  return join(env.RUNNER_TEMP,'mappo-focus-plan.json');
}
function plan(env) {
  const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  const head=git(['rev-parse','HEAD']).trim();
  if (env.GITHUB_EVENT_NAME!=='push'||head!==env.GITHUB_SHA||head!==event.after) throw Error('Not exact pushed revision');
  const parents=git(['show','-s','--format=%P',head]).trim().split(/\s+/).filter(Boolean);
  const possible=parents.length===2&&event.before===parents[0]?parents[1]:
    parents.length===1&&/^0{40}$/.test(event.before||'')?parents[0]:null;
  // The candidate must be reachable from the fetched, trusted main ref.
  const mainTip=spawnSync('git',['rev-parse','--verify','refs/remotes/origin/main'],{encoding:'utf8'});
  const mainAncestor=mainTip.status===0&&ancestor(possible,mainTip.stdout.trim())?possible:null;
  const range=changeRange({head,before:event.before,parents,mainAncestor,
    verifiedMain:mainEvidence(mainAncestor,env),isAncestor:ancestor});
  const inventory=nul(git(['ls-files','-z','--','tests/'])).filter(p=>/^tests\/[^/]+\.test\.js$/.test(p));
  const paths=range.base?nul(git(['diff','--no-renames','--name-only','-z',range.base,head,'--'])):nul(git(['ls-files','-z']));
  const selection=selectTests(paths,inventory,!range.base);
  const output={head,...range,changedPaths:paths,...selection};
  writeFileSync(planPath(env),JSON.stringify(output,null,2));
  console.log('CI_FOCUS '+JSON.stringify(output));
}
function runNode(args) {
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) process.exit(result.status||1);
}
function runCLI(mode,env=process.env) {
  if(mode==='plan') return plan(env);
  const selection=JSON.parse(readFileSync(planPath(env),'utf8'));
  if(selection.head!==git(['rev-parse','HEAD']).trim()||selection.head!==env.GITHUB_SHA) throw Error('Stale focus plan');
  if(mode==='syntax') {
    for(const p of selection.changedPaths) if(/^(src|scripts|tests)\/.*\.(js|mjs)$/.test(p)&&existsSync(p)) runNode(['--check',p]);
  } else if(mode==='test') {
    if(!selection.tests.length||selection.tests.some(p=>!/^tests\/[^/]+\.test\.js$/.test(p)||!existsSync(p))) throw Error('Invalid selected tests');
    runNode(['--test',...selection.tests]);
  } else throw Error('Unknown focused CI mode');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) runCLI(process.argv[2]);
