// DEV-OPT manual acceptance: package deterministic synthetic cities, never
// user data or automatic manual approval. Development-only, not bundled.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createProject } from '../../src/core/city-model.js';
import { APP_VERSION, PROJECT_SCHEMA_VERSION } from '../../src/core/version.js';
import { createProjectDocument, defaultWorkspace, encodeProjectDocument, decodeProjectDocument } from '../../src/data/project-format.js';

const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,message)=>{if(!ok)throw Error(message);};
const date='2026-11-26T00:00:00.000Z';
const roadIds=['RD-0184','RD-0186'];
const offset={x:-3.005274072121821,y:-37.39896113564458};
const scales=[.025,.125,-.25,1,-1];
const baseOptions={seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44}};
const scenarios=[false,true].map(irregularProperties=>({
  id:irregularProperties?'irregular':'regular',
  options:{...baseOptions,irregularProperties},
  roadIds:[...roadIds],
  movements:scales.map(scale=>({scale,offset:{x:offset.x*scale,y:offset.y*scale}}))
}));
const expectedFiles=['index.html','regular.mappo.json','irregular.mappo.json','scenarios.json','CHECKLIST.md','BUG-REPORT.md'].sort();
export function createAcceptanceFixture(scenario){
  const project=createProject(scenario.options);
  need(project.schemaVersion===PROJECT_SCHEMA_VERSION,'Unexpected fixture schema');
  need(scenario.roadIds.every(id=>project.city.roads.some(r=>r.id===id)),'Fixture road identity missing');
  const workspace=defaultWorkspace(project);
  workspace.view.layers.properties=true;workspace.view.layers.plots=true;
  const document=createProjectDocument(project,workspace,null,date);
  document.documentId='mappo-dev-opt-acceptance-'+scenario.id;
  const text=encodeProjectDocument(document);
  const restored=decodeProjectDocument(text);
  need(restored.project.schemaVersion===PROJECT_SCHEMA_VERSION&&
    restored.project.seed===project.seed&&
    JSON.stringify(restored.project)===JSON.stringify(document.project),'Fixture round trip altered accepted project');
  return text;
}
function checklist(source,liveRecovery){
  return [
    '# Mappo manual acceptance — '+APP_VERSION,
    '', 'Source checkout: '+source, '',
    'Status: NOT RUN. This package is not CI qualification or manual approval.',
    ...(liveRecovery?[
      'This candidate contains the connected-road Spatial recovery controls. The checklist is a test plan, not a claim that the controls have passed.',
      'High quality is available only with destruction enabled and regeneration disabled. Stop pauses at a safe phase boundary; it is not immediate cancellation.'
    ]:[
      'The DEV-OPT baseline still uses the existing road editor; the SRE is detached. Do not expect live high-quality recovery, destruction, regeneration, Stop/Continue, or future worker controls.',
      'For a future live-SRE milestone, obtain its approved candidate-specific acceptance criteria before using these fixtures as an activation gate.'
    ]),
    '', '## Setup',
    '', '- [ ] Extract the archive into a new directory. Open index.html locally in Firefox; repeat in Chromium.',
    '- [ ] Use desktop/laptop and, where available, 32:9 ultrawide. Confirm offline file:// operation.',
    '- [ ] Open regular.mappo.json, then repeat with irregular.mappo.json. Do not overwrite the supplied fixture.',
    '', '## Road movement and preservation',
    '', '- [ ] Select the connected road segments RD-0184 and RD-0186 in the Roads editor. Use the map/inspector to confirm IDs.',
    '- [ ] Use scenarios.json as the movement reference. Begin with small moves, then try stronger compression and the reverse direction. Use exact numeric offsets if supported; otherwise record the actual drag/offset and do not claim an exact corpus replay.',
    '- [ ] Before Apply, switch inspector views; verify the draft is retained and accepted geometry is unchanged.',
    '- [ ] Cancel/reset the draft; verify no accepted geometry or identity changes.',
    '- [ ] Apply a valid preview; confirm affected parcels/buildings are preserved according to the existing editor contract. Undo, then Redo, and save a separate copy; reopen it and compare the accepted geometry.',
    '- [ ] For a refused move, verify a clear refusal and unchanged accepted city. Strong moves may legitimately refuse in this detached baseline.',
    '- [ ] Check unrelated selection and map controls remain usable; note any freezes or rendering defects.',
    ...(liveRecovery?[
      '', '## Live connected-road recovery',
      '', '- [ ] With both connected roads selected, enter a nonzero movement, wait for the ordinary preview, and locate Spatial recovery. Confirm all four permission checkboxes default off.',
      '- [ ] Start a small preservation-only search. Confirm that progress is work consumed, not elapsed time; the accepted city, file revision and history stay unchanged before Apply.',
      '- [ ] Use Stop during a longer search; record delay until pause or completion. Continue if paused. If a verified incumbent exists, Review best solution must show exactly that result.',
      '- [ ] Cancel during search and after Review. Reset and change the displacement. Verify stale results do not reappear and new drafts reset permissions.',
      '- [ ] Enable alternative frontage and scaling independently; test 5%, 10% and 20% limits. Review the exact frontage and scaling changes. No destruction or regeneration without their separate permissions.',
      '- [ ] On the regular fixture use scale -0.5 (offset X 1.5026370360609105, Y 18.69948056782279), with alternative frontage, scaling at 20%, destruction on, regeneration off and Standard quality. Review the removed IDs and footprint loss. Apply only if the exact result is acceptable; Undo, Redo, save a separate copy and reopen.',
      '- [ ] Try the same or another difficult movement with regeneration separately enabled. Verify fresh additions are listed separately from removals. If no regenerated result is found, record BLOCKED for the positive regeneration test, not PASS. High-quality regeneration must remain unavailable.',
      '- [ ] Try High quality explicitly with destruction permitted and regeneration off; verify any accepted result is reviewed. Record refusal as refusal, not success.',
      '- [ ] While searching, move the pointer and use non-editing inspector/map controls. Record responsiveness, progress cadence, Stop and Apply latency; note any freezes. Repeat offline in Firefox and Chromium.',
      '- [ ] Confirm the ordinary connected-road preview, other road edit modes and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z remain usable. Report any discrepancy between the map overlay, exact review and accepted result.',
      '- [ ] For a destructive Review, compare temporarily retired (selected path), restored and retained, and final removed counts; gross = restored + final removed. Restored IDs must survive in the candidate and must not be listed as removed. These are selected-lineage counts, not all attempted trials.',
      '- [ ] If restoration statistics are unavailable due to evidence/work limits, confirm no partial counts appear, final changes remain independently verified and exact consent is still required. Do not force a limit in normal production to claim this case passed.',
      '- [ ] For the irregular High fixture at X 3.005274072121821, Y 37.39896113564458, alternative frontage and 20% scaling, destruction on and regeneration off, expect 60 temporarily retired, 17 restored and retained, 43 final removals (10 properties, 19 plots, 14 buildings) on the locked fixture. Record mismatches, not an assumed pass.',
      '- [ ] Stop with a verified incumbent, Review best, inspect the exact restoration counts and accepted-state isolation, then change the road intent. Confirm that the stale review disappears and no old result can be applied. Repeat offline in Firefox and Chromium.',
      '- [ ] Record any missing restored-identity audit or other incomplete acceptance criterion as BLOCKED; do not treat this checklist alone as approval to merge.'
    ]:[]),
    '', '## Result',
    '', 'Record PASS / FAIL / BLOCKED separately for each scenario and browser, using BUG-REPORT.md. A checkbox or generated package is not evidence of a completed manual test. Do not submit private cities or credentials.'
  ].join('\n')+'\n';
}
const bugReport=[
  '# Manual test report','',
  'Candidate source SHA:','Browser / version:','OS / display resolution:','Fixture / scenario / actual movement:',
  'Test step:','Result (PASS / FAIL / BLOCKED / NOT RUN):','Expected:','Observed:',
  'Reproduction steps:','Screenshots or non-private exported fixture (optional):','',
  'Do not include private user data, account information, or credentials.',''
].join('\n');
export function buildAcceptancePackage({source,prHead=null,html,distHtml}){
  need(sha(source)&&(!prHead||sha(prHead)),'Invalid candidate identity');
  need(Buffer.isBuffer(html)&&Buffer.isBuffer(distHtml)&&html.length>0&&html.equals(distHtml),'Standalone byte parity mismatch');
  const files={
    'index.html':html,
    'regular.mappo.json':Buffer.from(createAcceptanceFixture(scenarios[0])),
    'irregular.mappo.json':Buffer.from(createAcceptanceFixture(scenarios[1])),
    'scenarios.json':Buffer.from(JSON.stringify({version:1,scenarios},null,2)+'\n'),
    'CHECKLIST.md':Buffer.from(checklist(source,html.includes(Buffer.from('id="roadSrePanel"')))),
    'BUG-REPORT.md':Buffer.from(bugReport)
  };
  const manifest={version:1,source,prHead,appVersion:APP_VERSION,projectSchema:PROJECT_SCHEMA_VERSION,
    portableFormat:1,workspaceSchema:1,manualStatus:'not-run',qualification:'not-asserted',
    files:Object.keys(files).sort().map(path=>({path,bytes:files[path].length,sha256:digest(files[path])}))};
  return {manifest,files};
}
export function verifyAcceptancePackage({manifest,files},expectedSource){
  need(manifest?.version===1&&sha(expectedSource)&&manifest.source===expectedSource&&
    manifest.appVersion===APP_VERSION&&manifest.projectSchema===PROJECT_SCHEMA_VERSION&&
    manifest.portableFormat===1&&manifest.workspaceSchema===1&&manifest.manualStatus==='not-run'&&
    manifest.qualification==='not-asserted'&&(!manifest.prHead||sha(manifest.prHead)),'Invalid package identity or manual claim');
  need(Array.isArray(manifest.files)&&JSON.stringify(manifest.files.map(x=>x.path))===JSON.stringify(expectedFiles)&&
    JSON.stringify(Object.keys(files).sort())===JSON.stringify(expectedFiles),'Missing, duplicate or unexpected package content');
  for(const row of manifest.files){
    const bytes=files[row.path];need(Buffer.isBuffer(bytes)&&bytes.length===row.bytes&&digest(bytes)===row.sha256,'Package integrity mismatch: '+row.path);
  }
  for(const s of scenarios){
    const doc=decodeProjectDocument(files[s.id+'.mappo.json'].toString('utf8'));
    need(doc.documentId==='mappo-dev-opt-acceptance-'+s.id&&doc.project.seed===s.options.seed&&
      s.roadIds.every(id=>doc.project.city.roads.some(r=>r.id===id)),'Fixture identity mismatch');
  }
  return true;
}
export function writeAcceptancePackage(output,packageData){
  verifyAcceptancePackage(packageData,packageData.manifest.source);
  need(!existsSync(output)||readdirSync(output).length===0,'Output directory must be new or empty');
  mkdirSync(output,{recursive:true});
  for(const [path,bytes] of Object.entries(packageData.files))writeFileSync(join(output,path),bytes,{flag:'wx'});
  writeFileSync(join(output,'manifest.json'),JSON.stringify(packageData.manifest,null,2)+'\n',{flag:'wx'});
}
function run(){
  const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const source=git(['rev-parse','HEAD']),expected=process.env.EXPECTED_SOURCE||process.env.GITHUB_SHA;
  need(sha(expected)&&source===expected,'Checkout differs from requested exact candidate');
  const dist='dist/mappo-'+APP_VERSION+'.html';
  git(['ls-files','--error-unmatch','index.html',dist]);
  git(['diff','--exit-code','HEAD','--','index.html',dist]);
  const data=buildAcceptancePackage({source,prHead:process.env.PR_HEAD||null,html:readFileSync('index.html'),distHtml:readFileSync(dist)});
  writeAcceptancePackage(resolve('artifacts','manual-acceptance'),data);
  console.log('MANUAL_ACCEPTANCE_PACKAGE '+JSON.stringify(data.manifest));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
