// Isolated qualification only. Frozen source and reference revisions; no Apply authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const TARGET='2a842d6e5f37790a74c1db526a12d99b271a51b0',LEGACY='ad2a0f88995fbd6c869fcb38575626ff85cded19',BASELINE='e5f1cf83dcdcc75e52911aa717035955b40569d0';
const [mode,indexArg,targetDir,baselineDir,legacyDir,outDir]=process.argv.slice(2);
const index=Number(indexArg),root=resolve(targetDir),out=resolve(outDir);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
function exact(dir,sha){assert.equal(git(dir,'rev-parse','HEAD'),sha);assert.equal(git(dir,'status','--porcelain','--untracked-files=all'),'');}
exact(root,TARGET);
assert.equal(process.platform,'linux');assert.equal(process.versions.node.split('.')[0],'22');
const load=p=>import(pathToFileURL(join(root,p)).href);
const {createProject}=await load('src/core/city-model.js');
const {normalizeSpatialRoadGroup}=await load('src/core/spatial-recovery-road-adapter.js');
const {createSpatialDestructionBudget,createSpatialPreservationBudget}=await load('src/core/spatial-recovery-contract.js');
const {createSpatialHighQualityBudget}=await load('src/core/spatial-recovery-quality.js');
const {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness}=await load('src/core/spatial-recovery-coordinator.js');
const {validateStoredProject}=await load('src/data/project-validation.js');
const {migrateProjectData}=await load('src/data/migrations.js');
const {copyJson,defaultWorkspace,roundTripProjectDocument}=await load('src/data/project-format.js');
const {AcceptedEditHistoryD01}=await load('src/core/accepted-edit-history-d01.js');
const {issueIdentityReservation}=await load('src/core/identity-verification.js');
const permissions={destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
const key=r=>JSON.stringify([r.projectId,r.roadIds,r.offset.x,r.offset.y]);
const rows=[];
let setup=null;
async function solve(project,roadIds,offset,p,quality='standard',schedule='baseline',context=null){
  const before=hash(project),op=normalizeSpatialRoadGroup(project,1,roadIds,offset,p);
  const budget=quality==='high'?createSpatialHighQualityBudget():p.destruction?createSpatialDestructionBudget():createSpatialPreservationBudget();
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget,{quality,schedule,context});
  assert.deepEqual(result.stats,budget.snapshot());
  assert.ok(result.stats.work<=(quality==='high'?256000000:p.destruction?32000000:8000000));
  assert.ok(result.stats.expansions<=(p.destruction?131072:32768));
  assert.equal(hash(project),before);
  if(result.status==='refused'){
    assert.equal(result.delta,null);assert.equal(result.basisDelta,null);
    return {status:'refused',stats:result.stats,attempts:result.attempts.map(r=>({phase:r.phase,status:r.status,exhausted:r.exhausted??null}))};
  }
  assert.equal(result.status,'verified-witness');
  let auth=null;
  if(result.provisionalAuthorization){
    const requests=result.provisionalAuthorization.requests;
    auth={context,requests,receipt:issueIdentityReservation(project.identityAllocation,project.city,context,requests)};
    assert.deepEqual(auth.receipt,result.provisionalAuthorization.receipt);
  }
  const actual=await verifySpatialUnifiedRoadWitness(project,op,result,createSpatialDestructionBudget(),auth);
  validateStoredProject(actual);assert.equal(hash(actual),result.delta.candidateFingerprint);
  const counts={};
  for(const k of ['properties','plots','buildings']){
    const beforeIds=project.city[k].map(r=>r.id),afterIds=new Set(actual.city[k].map(r=>r.id));
    assert.deepEqual(beforeIds.filter(id=>!afterIds.has(id)).sort(),result.delta.retired.filter(r=>r.collection===k).map(r=>r.id).sort());
    counts[k]=result.delta.retired.filter(r=>r.collection===k).length;
  }
  for(const k of ['roads','nodes','blocks'])assert.deepEqual(actual.city[k].map(r=>r.id),project.city[k].map(r=>r.id));
  if(!p.regeneration){assert.deepEqual(result.delta.added,[]);assert.deepEqual(actual.identityAllocation,project.identityAllocation);}
  if(!p.destruction){assert.equal(result.kind,'nondestructive');assert.deepEqual(result.delta.retired,[]);assert.equal(result.ledger.concessions.footprintLoss,0);assert.equal(result.ledger.concessions.frontageSwitches.length,0);}
  assert.equal(hash(project),before);
  return {status:'verified',kind:result.kind,fingerprint:hash(actual),counts,footprint:result.ledger.demolishedFootprint,scaleLoss:result.ledger.concessions.footprintLoss,stats:result.stats,actual,result,op,auth};
}
const compact=({actual,result,op,auth,...row})=>row;
async function capture(id,fn){try{const row={id,...await fn()};rows.push(row);console.log('SRE_QUALIFICATION_CASE '+JSON.stringify(row));}catch(error){const row={id,status:'error',error:String(error.stack??error).slice(0,3000)};rows.push(row);console.log('SRE_QUALIFICATION_CASE '+JSON.stringify(row));}}
if(mode==='historical'){
  assert.ok(Number.isInteger(index)&&index>=0&&index<20);
  exact(baselineDir,BASELINE);exact(legacyDir,LEGACY);
  const family=['planned','organic','radial','linear'][Math.floor(index/5)],n=index%5,id=family+'-'+n;
  const initialSeeds={planned:'c2-planned',organic:'b1-organic',radial:'b1-radial',linear:'b1-linear'};
  const opts={seed:n===0?initialSeeds[family]:'lare-'+family+'-'+n,morphology:family,size:n===4?'medium':'small',irregularProperties:n%2===0};
  const {createProject:oldCreate}=await import(pathToFileURL(join(baselineDir,'src/core/city-model.js')).href);
  const original=oldCreate(opts),fingerprint=hash(original),raw=JSON.stringify(original);
  const evidence=join(root,'docs/plans/0.2x/milestones/b1r-research/evidence');
  const archive=readdirSync(evidence).filter(x=>x.endsWith('.jsonl')).sort();
  const read=name=>readFileSync(join(evidence,name),'utf8').trimEnd().split('\n').map(JSON.parse);
  const maps=['selective-','combined-'].map(prefix=>{
    const m=new Map();
    for(const f of archive.filter(f=>f.startsWith(prefix)))for(const row of read(f)){
      assert.ok(!m.has(key(row)));m.set(key(row),row);
    }
    assert.equal(m.size,800);return m;
  });
  const preserved=new Set();
  for(const [k,a] of maps[0]){const b=maps[1].get(k);assert.ok(b);assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.baselineAccepted,b.baselineAccepted);if(a.accepted||b.accepted)preserved.add(k);}
  assert.equal(preserved.size,627);
  const witnesses=new Map();
  for(const prefix of ['demolition-','parcel-compact-','cooperative-results-'])for(const f of archive.filter(f=>f.startsWith(prefix)))for(const row of read(f)){
    const k=key(row);if(!row.best||row.best.accepted===false||preserved.has(k)||witnesses.has(k))continue;
    assert.ok(row.best.removed.length>0);witnesses.set(k,row);
  }
  assert.equal(witnesses.size,141);
  const all=[...maps[0].values()].filter(r=>r.projectId===id);
  assert.equal(all.length,40);for(const row of all)assert.equal(row.fingerprint,fingerprint);
  const migrated=copyJson(migrateProjectData(JSON.parse(raw)));validateStoredProject(migrated);
  assert.equal(migrated.schemaVersion,11);
  const strict=all.filter(r=>preserved.has(key(r))),demolition=all.filter(r=>witnesses.has(key(r)));
  const input=join(out,'legacy-input');mkdirSync(join(input,'projects'),{recursive:true});
  writeFileSync(join(input,'projects',id+'.json'),raw+'\n');
  writeFileSync(join(input,'baseline.json'),JSON.stringify({baseline:BASELINE,projects:[{projectId:id,fingerprint}],rows:demolition.map(r=>({...r,accepted:r.baselineAccepted}))}));
  let legacyRows=[];
  if(demolition.length){
    const log=execFileSync(process.execPath,[join(legacyDir,'scripts/lare-demolition-acceptance.mjs'),input],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:1200000});
    legacyRows=log.split('\n').filter(s=>s.startsWith('LARE_DEMOLITION_CASE ')).map(s=>JSON.parse(s.slice('LARE_DEMOLITION_CASE '.length)));
    assert.equal(legacyRows.length,demolition.length);assert.equal(new Set(legacyRows.map(key)).size,demolition.length);
    for(const r of legacyRows){assert.ok(demolition.some(d=>key(d)===key(r)));assert.equal(r.fingerprint,fingerprint);}
  }
  setup={projectId:id,originalFingerprint:fingerprint,migratedFingerprint:hash(migrated),strict:strict.length,demolitionCohort:demolition.length,legacyRecovered:legacyRows.filter(r=>r.outcome==='recovered').length,legacyRows:legacyRows.map(r=>({key:key(r),outcome:r.outcome,fingerprint:r.candidateFingerprint??null}))};
  for(const r of strict)await capture(key(r),async()=>({group:'strict',expected:true,...compact(await solve(migrated,r.roadIds,r.offset,{}))}));
  for(const r of legacyRows.filter(r=>r.outcome==='recovered'))await capture(key(r),async()=>{
    const p={destruction:true}; // original B1R did not permit scaling or frontage change
    const normal=await solve(migrated,r.roadIds,r.offset,p,'standard','diversified-restoration');
    if(normal.status==='verified')return {group:'demolition',expected:true,quality:'standard',...compact(normal)};
    const high=await solve(migrated,r.roadIds,r.offset,p,'high','diversified-restoration');
    return {group:'demolition',expected:true,quality:'high',standardRefused:true,...compact(high)};
  });
  exact(baselineDir,BASELINE);exact(legacyDir,LEGACY);
}else if(mode==='compression'){
  assert.ok(Number.isInteger(index)&&index>=0&&index<4);
  const {known}=await import(pathToFileURL(join(resolve(import.meta.dirname),'sre-qualification-controls.mjs')).href);
  const specs=[false,true].flatMap(irregular=>[1,.75,.5,.25,.125,.025,-.25,-.5,-1].map(scale=>({irregular,scale}))).filter((_,i)=>i%4===index);
  for(const {irregular,scale} of specs)await capture(JSON.stringify([irregular,scale]),async()=>{
    const p=createProject({seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:irregular});
    const ids=['RD-0184','RD-0186'],offset={x:-3.005274072121821*scale,y:-37.39896113564458*scale};
    const expected=known[irregular?'irregular':'regular'][scale];
    assert.ok(expected);
    const a=compact(await solve(p,ids,offset,permissions,'high','diversified-restoration'));
    assert.equal(a.status,'verified');assert.equal(a.fingerprint,expected);
    const b=compact(await solve(p,ids,offset,permissions,'high','diversified-restoration'));assert.deepEqual(b,a);
    return {group:'compression',...a};
  });
  setup={cases:specs.length};
}else if(mode==='regeneration'){
  assert.equal(index,0);
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
  const ids=['RD-0184','RD-0186'],offset={x:-3.005274072121821*-.5,y:-37.39896113564458*-.5};
  const namespace='12'.repeat(16),other='34'.repeat(16);
  project.identityAllocation.namespaces[namespace]={property:7,plot:11,building:13};project.identityAllocation.namespaces[other]={property:93};
  const context={projectId:project.id??project.city.id,revision:1,namespace},before=hash(project);
  await capture('integrated-positive-regeneration',async()=>{
    const result=await solve(project,ids,offset,{...permissions,regeneration:true},'standard','diversified-restoration',context);
    assert.equal(result.status,'verified');assert.ok(['shell-regeneration','group-regeneration'].includes(result.kind),'Integrated regeneration not reached');
    assert.ok(result.result.delta.added.length>0);assert.ok(result.auth);
    const {actual,op}=result;
    await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,op,result.result,createSpatialDestructionBudget()));
    const denied=normalizeSpatialRoadGroup(project,1,ids,offset,permissions);
    await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,denied,result.result,createSpatialDestructionBudget(),result.auth));
    const stale=structuredClone(result.auth);stale.context.revision++;
    await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,op,result.result,createSpatialDestructionBudget(),stale));
    const workspace=defaultWorkspace(project),history=new AcceptedEditHistoryD01();
    history.clear(project);assert.equal(history.record(project,actual,{family:'road',operation:'translate-road-group',label:'Verified detached regeneration',targetIds:ids}).status,'recorded');
    const undo=history.prepare('undo',actual,workspace);assert.ok(undo.ok,undo.reason);
    assert.equal(hash(undo.candidate),hash({...project,identityAllocation:actual.identityAllocation}));history.accept('undo',undo.entry,undo.candidate);
    const redo=history.prepare('redo',undo.candidate,undo.workspace);assert.ok(redo.ok,redo.reason);assert.equal(hash(redo.candidate),hash(actual));history.accept('redo',redo.entry,redo.candidate);
    assert.equal(hash(roundTripProjectDocument(redo.candidate,redo.workspace).project),hash(actual));assert.equal(hash(project),before);
    return {group:'regeneration',...compact(result),added:result.result.delta.added.map(r=>r.ref),history:'verified',portable:'verified'};
  });setup={cases:1};
}else throw Error('Unknown qualification mode');
exact(root,TARGET);
mkdirSync(out,{recursive:true});
const report={target:TARGET,baseline:BASELINE,legacy:LEGACY,harness:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,mode,index,setup,rows};
writeFileSync(join(out,'qualification.json'),JSON.stringify(report,null,2)+'\n');
console.log('SRE_QUALIFICATION_SUMMARY '+JSON.stringify({...report,rows:undefined,verified:rows.filter(r=>r.status==='verified').length,failed:rows.filter(r=>r.status!=='verified').length}));
if(rows.some(r=>r.status!=='verified'))process.exitCode=1;
