// Offline acceptance for junction preview and Apply in the inline Blob Worker.
// This deliberately does NOT use the HTTP route used by the browser QA suite.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness } from '../src/core/spatial-recovery-coordinator.js';
import { createSpatialHighQualityBudget } from '../src/core/spatial-recovery-quality.js';
import { createHash } from 'node:crypto';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { defaultWorkspace, roundTripProjectDocument } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const file = new URL('../artifacts/c7/offline-p3.html',import.meta.url);
await mkdir(new URL('../artifacts/c7/',import.meta.url),{recursive:true});
await writeFile(file,observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'),
  'globalThis.__sreWorkerQA = createSpatialRoadWorkerClient;'));
const url = file.href;
const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
const doc = {project,workspace:defaultWorkspace(project)};
const sreProject=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const sreOperation=normalizeSpatialRoadGroup(sreProject,1,['RD-0113','RD-0114'],{x:.05,y:0});
const sreDirect=await searchSpatialUnifiedRoadGroup(sreProject,sreOperation,createSpatialPreservationBudget());
assert.equal(sreDirect.status,'verified-witness');

// Compare the exact mounted accepted input and operation against a fresh
// Node search. Cache only identical serialized inputs within this test run.
const advancedReferenceCache=new Map(),browserFailures=[];
const shaJson=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function firstDifferences(expected,actual,limit=32){
  const differences=[];
  const brief=v=>typeof v==='string'&&v.length>180?v.slice(0,180)+'…':
    v&&typeof v==='object'?(Array.isArray(v)?'Array('+v.length+')':'Object'):v;
  const walk=(a,b,path)=>{
    if(differences.length>=limit||Object.is(a,b))return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
      for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
        if(differences.length>=limit)break;
        walk(a[k],b[k],path+'/'+k);
      }
    }else differences.push({path,expected:brief(a),actual:brief(b),
      ...(typeof a==='number'&&typeof b==='number'?{difference:b-a}:{})});
  };
  walk(expected,actual,'');return differences;
}
async function advancedReference(project,operation){
  const key=shaJson({project,operation});
  if(!advancedReferenceCache.has(key)){
    const budget=createSpatialHighQualityBudget();
    const result=await searchSpatialUnifiedRoadGroup(project,operation,budget,{quality:'high'});
    assert.equal(result.status,'verified-witness','Node mounted-input reference must verify');
    const candidate=await verifySpatialUnifiedRoadWitness(project,operation,result,createSpatialDestructionBudget());
    advancedReferenceCache.set(key,{result,candidate});
  }
  return advancedReferenceCache.get(key);
}
for (const [browserName,engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser=await engine.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(120000);
    const errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(/^https?:/i.test(request.url()))external.push(request.url());
    });
    await page.route('**/*',route=>/^https?:/i.test(route.request().url())?
      route.abort():route.continue());
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const sreResult=await page.evaluate(async ({projectJson,operation})=>{
      const binding={sessionId:'offline-browser-test',operation,quality:'standard'};
      const compute=__sreWorkerQA(()=>binding);
      const before=JSON.stringify(__buildingQA.state().project);
      try{
        const input={...binding,projectJson};
        const first=compute(input);
        const canceled=first.then(()=>false,error=>error.name==='AbortError');
        compute.cancel();
        if(!await canceled)throw Error('Offline SRE cancellation failed');
        const result=await compute(input);
        return {result:result.result,unchanged:before===JSON.stringify(__buildingQA.state().project)};
      }finally{compute.dispose();}
    },{projectJson:JSON.stringify(sreProject),operation:sreOperation});
    assert.equal(sreResult.unchanged,true);
    assert.equal(sreResult.result.status,'verified-witness');
    assert.deepEqual(sreResult.result.delta,sreDirect.delta);
    assert.deepEqual(sreResult.result.basisDelta,sreDirect.basisDelta);
    console.log('SRE_OFFLINE '+JSON.stringify({browser:browserName,passed:true,parity:true,cancellation:true}));

    // Exercise mounted connected-road recovery and its shared Apply button
    // in real offline Firefox and Chromium, not only the detached worker.
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:sreProject,workspace:defaultWorkspace(sreProject)});
    await page.locator('#roadModeButton').click();
    const sreBefore=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      s.select({kind:'road',id:'RD-0113'});
      if(!s.requestSelectionA1({kind:'road',id:'RD-0114'},{toggle:true})||!s.roadGroupB1?.eligible)
        throw Error('Offline SRE group fixture ineligible.');
      s.updateRoadIntent({x:.05,y:0},{defer:false});
      return {project:JSON.stringify(app.project),revision:app.files.revision,identityRevision:app.identityView.context.revision};
    });
    await page.locator('#roadSreStart').waitFor({state:'visible'});
    for(const id of ['roadSreFrontage','roadSreScale','roadSreDestruction','roadSreRegeneration'])
      assert.equal(await page.locator('#'+id).isChecked(),false);
    await page.locator('#roadSreStart').click();
    await page.waitForFunction(()=>['ready','refused','error'].includes(__buildingQA.state().roadWorkspace.sre.state?.phase));
    const sreReview=await page.evaluate(()=>{
      const app=__buildingQA.state(),state=app.roadWorkspace.sre.state;
      return {phase:state?.phase,message:state?.message,summary:state?.review?.summary,
        candidate:state?.review?.candidate,enabled:!document.querySelector('#roadApplyB4').disabled,
        original:JSON.stringify(app.project),revision:app.files.revision};
    });
    assert.equal(sreReview.phase,'ready',sreReview.message);
    assert.equal(sreReview.enabled,true);
    assert.deepEqual(sreReview.summary.retired,[]);
    assert.deepEqual(sreReview.summary.added,[]);
    assert.equal(sreReview.original,sreBefore.project);
    assert.equal(sreReview.revision,sreBefore.revision);
    await page.locator('#roadSreCancel').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.sre.state),null);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),sreBefore.project);
    await page.locator('#roadSreStart').click();
    await page.waitForFunction(()=>['ready','refused','error'].includes(__buildingQA.state().roadWorkspace.sre.state?.phase));
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.sre.state.phase),'ready');
    await page.locator('#roadApplyB4').click();
    await page.waitForFunction(()=>!__buildingQA.state().roadWorkspace.active);
    const sreApplied=await page.evaluate(()=>{
      const app=__buildingQA.state();
      return {project:app.project,revision:app.files.revision,identityRevision:app.identityView.context.revision,history:app.identityView.history.length};
    });
    assert.deepEqual(sreApplied.project,sreReview.candidate);
    assert.equal(sreApplied.revision,sreBefore.revision+1);
    assert.equal(sreApplied.identityRevision,sreBefore.identityRevision+1);
    assert.equal(sreApplied.history,1);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project.city),sreProject.city);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project.city),sreApplied.project.city);
    console.log('SRE_MOUNTED_OFFLINE '+JSON.stringify({browser:browserName,permissionsDefaultOff:true,review:true,cancel:true,apply:true,undoRedo:true}));

    // Actual destructive recovery through mounted controls. Test the same
    // standard reverse-compression fixture qualified by the Node review gate.
    const severe=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:severe,workspace:defaultWorkspace(severe)});
    await page.locator('#roadModeButton').click();
    const severeBefore=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      s.select({kind:'road',id:'RD-0184'});
      if(!s.requestSelectionA1({kind:'road',id:'RD-0186'},{toggle:true})||!s.roadGroupB1?.eligible)
        throw Error('Destructive SRE fixture ineligible.');
      s.updateRoadIntent({x:1.5026370360609105,y:18.69948056782279},{defer:false});
      return {project:JSON.stringify(app.project),revision:app.files.revision,identityRevision:app.identityView.context.revision};
    });
    await page.locator('#roadSreFrontage').check();
    await page.locator('#roadSreScale').check();
    await page.locator('#roadSreScaleLimit').selectOption('0.2');
    await page.locator('#roadSreDestruction').check();
    assert.equal(await page.locator('#roadSreRegeneration').isChecked(),false);
    // Install test-only observation of trusted pointer event dispatch and
    // animation-frame gaps. These are runner diagnostics, not a universal SLA.
    await page.evaluate(()=>{
      const m={input:[],frames:[],progress:[],active:true,lastFrame:performance.now(),lastProgress:''};
      const sample=e=>{if(m.active&&e.isTrusted)m.input.push(Math.max(0,performance.now()-e.timeStamp));};
      document.addEventListener('pointermove',sample,true);
      const frame=now=>{if(!m.active)return;m.frames.push(now-m.lastFrame);m.lastFrame=now;requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
      const watch=new MutationObserver(()=>{
        const text=document.querySelector('#roadSreWork').textContent;
        if(m.active&&text&&text!==m.lastProgress){m.lastProgress=text;m.progress.push(performance.now());}
      });
      watch.observe(document.querySelector('#roadSreWork'),{childList:true,subtree:true,characterData:true});
      window.__srePerf={m,stop:()=>{m.active=false;watch.disconnect();document.removeEventListener('pointermove',sample,true);}};
      document.querySelector('#roadSreStart').click();
      m.stopRequested=performance.now();
      document.querySelector('#roadSreStop').click();
    });
    await page.waitForFunction(()=>['paused','ready','refused','error'].includes(__buildingQA.state().roadWorkspace.sre.state?.phase));
    const pause=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.sre.state;
      return {phase:s.phase,message:s.message,stats:s.progress?.stats,accepted:JSON.stringify(app.project),
        delay:performance.now()-window.__srePerf.m.stopRequested};
    });
    assert.equal(pause.phase,'paused',pause.message);
    assert.equal(pause.accepted,severeBefore.project);
    assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
    await page.locator('#roadSreContinue').click();
    const began=Date.now();
    let phase;
    do{
      await page.mouse.move(12+(Date.now()%20),12);
      phase=await page.evaluate(()=>__buildingQA.state().roadWorkspace.sre.state?.phase);
      if(['ready','refused','error'].includes(phase))break;
      await page.waitForTimeout(80);
    }while(Date.now()-began<120000);
    const destructive=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.sre.state,p=window.__srePerf;
      p.stop();
      return {phase:s.phase,message:s.message,summary:s.review?.summary,candidate:s.review?.candidate,
        progress:s.progress?.stats,accepted:JSON.stringify(app.project),revision:app.files.revision,
        samples:p.m.input,frames:p.m.frames,updates:p.m.progress};
    });
    assert.equal(destructive.phase,'ready',destructive.message);
    assert.ok(destructive.summary.retired.length>0);
    assert.ok(destructive.summary.demolishedFootprint>0);
    assert.equal(destructive.summary.added.length,0);
    assert.equal(destructive.accepted,severeBefore.project);
    assert.equal(destructive.revision,severeBefore.revision);
    assert.ok(destructive.progress.work>=pause.stats.work);
    assert.equal(destructive.progress.work+destructive.progress.remainingWork,32000000);
    const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
    const gaps=destructive.updates.slice(1).map((v,i)=>v-destructive.updates[i]);
    const perf={browser:browserName,stopObservedMs:pause.delay,continueToReviewMs:Date.now()-began,
      pointerSamples:destructive.samples.length,p95PointerDispatchMs:percentile(destructive.samples,.95),
      frameSamples:destructive.frames.length,p95FrameGapMs:percentile(destructive.frames,.95),
      progressUpdates:destructive.updates.length,medianProgressGapMs:percentile(gaps,.5)};
    const applyStarted=Date.now();
    await page.locator('#roadApplyB4').click();
    await page.waitForFunction(()=>!__buildingQA.state().roadWorkspace.active);
    perf.applyObservedMs=Date.now()-applyStarted;
    const severeAfter=await page.evaluate(()=>{
      const app=__buildingQA.state();
      return {project:app.project,revision:app.files.revision,identityRevision:app.identityView.context.revision,history:app.identityView.history.length};
    });
    assert.deepEqual(severeAfter.project,destructive.candidate);
    assert.equal(severeAfter.revision,severeBefore.revision+1);
    assert.equal(severeAfter.identityRevision,severeBefore.identityRevision+1);
    assert.equal(severeAfter.history,1);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project.city),severe.city);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project.city),severeAfter.project.city);
    console.log('SRE_DESTRUCTIVE_OFFLINE '+JSON.stringify({browser:browserName,stopContinue:true,review:true,apply:true,undoRedo:true,retired:destructive.summary.retired.length}));
    console.log('SRE_INTERACTIVE_DIAGNOSTIC '+JSON.stringify(perf));
    await writeFile(new URL('../artifacts/c7/sre-interactive-'+browserName+'.json',import.meta.url),JSON.stringify(perf,null,2)+'\n');

    // Full mounted standard regeneration uses the production schedule and
    // host namespace, not the historical diversified diagnostic schedule.
    // A retirement-only result does not count as positive regeneration.
    async function beginRecoveryFixture(project,offset){
      await page.evaluate(doc=>__buildingQA.apply(doc),{project,workspace:defaultWorkspace(project)});
      await page.locator('#roadModeButton').click();
      const before=await page.evaluate(offset=>{
        const app=__buildingQA.state(),s=app.roadWorkspace.session;
        s.select({kind:'road',id:'RD-0184'});
        if(!s.requestSelectionA1({kind:'road',id:'RD-0186'},{toggle:true})||!s.roadGroupB1?.eligible)
          throw Error('Advanced recovery fixture ineligible.');
        s.updateRoadIntent(offset,{defer:false});
        return {project:app.project,revision:app.files.revision,identityRevision:app.identityView.context.revision,
          namespace:app.identityView.context.namespace};
      },offset);
      await page.locator('#roadSreStart').waitFor({state:'visible'});
      for(const id of ['roadSreFrontage','roadSreScale','roadSreDestruction','roadSreRegeneration'])
        assert.equal(await page.locator('#'+id).isChecked(),false);
      await page.locator('#roadSreFrontage').check();
      await page.locator('#roadSreScale').check();
      await page.locator('#roadSreScaleLimit').selectOption('0.2');
      await page.locator('#roadSreDestruction').check();
      return before;
    }
    async function awaitAdvancedReview(label){
      await page.waitForFunction(()=>['ready','refused','error'].includes(__buildingQA.state().roadWorkspace.sre.state?.phase),null,{timeout:480000});
      const review=await page.evaluate(()=>{
        const app=__buildingQA.state(),s=app.roadWorkspace.sre.state;
        return {phase:s.phase,message:s.message,summary:s.review?.summary,candidate:s.review?.candidate,
          fingerprint:s.review?.candidateFingerprint,progress:s.progress?.stats,accepted:app.project,
          revision:app.files.revision,identityRevision:app.identityView.context.revision,
          requests:s.reservationRequests,operation:s.binding.operation,quality:s.binding.quality,
          enabled:!document.querySelector('#roadApplyB4').disabled};
      });
      assert.equal(review.phase,'ready',browserName+': '+label+': '+review.message);
      assert.equal(review.enabled,true);
      return review;
    }
    async function acceptAdvancedReview(before,review){
      assert.deepEqual(review.accepted,before.project);
      assert.equal(review.revision,before.revision);
      assert.equal(review.identityRevision,before.identityRevision);
      await page.locator('#roadApplyB4').click();
      await page.waitForFunction(()=>!__buildingQA.state().roadWorkspace.active,null,{timeout:120000});
      const after=await page.evaluate(()=>{
        const app=__buildingQA.state();
        return {project:app.project,revision:app.files.revision,identityRevision:app.identityView.context.revision,
          history:app.identityView.history.length};
      });
      assert.deepEqual(after.project,review.candidate);
      assert.equal(after.revision,before.revision+1);
      assert.equal(after.identityRevision,before.identityRevision+1);
      assert.equal(after.history,1);
      assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
      const undone=await page.evaluate(()=>__buildingQA.state().project);
      assert.deepEqual(undone.city,before.project.city);
      assert.deepEqual(undone.identityAllocation,after.project.identityAllocation);
      assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
      assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project),after.project);
      // Exercise the actual document codec in the runner using the exact
      // accepted browser candidate; browser file-picker QA remains separate.
      const reopened=roundTripProjectDocument(after.project,defaultWorkspace(after.project));
      assert.deepEqual(reopened.project,after.project);
      return after;
    }
    const regenBefore=await beginRecoveryFixture(severe,{x:1.5026370360609105,y:18.69948056782279});
    await page.locator('#roadSreRegeneration').check();
    assert.equal(await page.locator('#roadSreQuality').isDisabled(),true);
    assert.equal(await page.locator('#roadSreQuality').inputValue(),'standard');
    await page.locator('#roadSreStart').click();
    const regenReview=await awaitAdvancedReview('standard regeneration');
    console.log('SRE_MOUNTED_REGENERATION_RESULT '+JSON.stringify({browser:browserName,
      retired:regenReview.summary.retired.length,added:regenReview.summary.added,
      progress:regenReview.progress,requests:regenReview.requests}));
    assert.ok(regenReview.summary.added.length>0,browserName+': Standard production schedule did not reach a positive regeneration witness; positive live regeneration remains unqualified.');
    assert.ok(regenReview.summary.regeneratedFootprint>0);
    assert.ok(regenReview.requests?.length>0);
    for(const {collection,id} of regenReview.summary.added){
      assert.ok(!regenBefore.project.city[collection].some(r=>r.id===id));
      assert.ok(regenReview.candidate.city[collection].some(r=>r.id===id));
      assert.ok(id.includes(regenBefore.namespace),'Regenerated identity must use the host-owned namespace.');
    }
    const regenAfter=await acceptAdvancedReview(regenBefore,regenReview);
    const counterTypes={properties:'property',plots:'plot',buildings:'building'};
    for(const [collection,type] of Object.entries(counterTypes)){
      const count=regenReview.summary.added.filter(r=>r.collection===collection).length;
      const old=regenBefore.project.identityAllocation.namespaces[regenBefore.namespace]?.[type]??0;
      const next=regenAfter.project.identityAllocation.namespaces[regenBefore.namespace]?.[type]??0;
      assert.equal(next,old+count);
    }
    console.log('SRE_MOUNTED_REGENERATION '+JSON.stringify({browser:browserName,positive:true,
      independentReservations:true,apply:true,undoRedo:true,portable:true,added:regenReview.summary.added.length}));

    // Previously exact-qualified irregular severe reverse, now through the
    // full production high-quality worker and mounted Review/Apply.
    const highProject=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:true});
    const highBefore=await beginRecoveryFixture(highProject,{x:3.005274072121821,y:37.39896113564458});
    await page.locator('#roadSreQuality').selectOption('high');
    assert.equal(await page.locator('#roadSreRegeneration').isChecked(),false);
    const highStarted=Date.now();
    await page.locator('#roadSreStart').click();
    const highReview=await awaitAdvancedReview('high quality');
    const locked='bbcbad96e73f85b19a2afd51743c9b6f00485daba564ee800576c5239bb80ec1';
    const highExpectedOperation=normalizeSpatialRoadGroup(highBefore.project,highBefore.identityRevision,
      ['RD-0184','RD-0186'],{x:3.005274072121821,y:37.39896113564458},
      {destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
    assert.deepEqual(highReview.operation,highExpectedOperation);
    assert.equal(highReview.quality,'high');
    const reference=await advancedReference(highBefore.project,highExpectedOperation);
    const diagnostic={browser:browserName,locked,actual:highReview.fingerprint,
      nodeMountedInput:reference.result.delta.candidateFingerprint,
      browserAccepted:shaJson(highBefore.project),generatedAccepted:shaJson(highProject),
      inputDifferences:firstDifferences(highProject,highBefore.project),
      candidateDifferences:firstDifferences(reference.candidate,highReview.candidate),
      referenceRetired:reference.result.delta.retired,actualRetired:highReview.summary.retired,
      nodeStats:reference.result.stats,browserProgress:highReview.progress,
      nodePhases:reference.result.attempts.map(r=>({phase:r.phase,status:r.status,work:r.work})),
      operation:highExpectedOperation};
    console.log('SRE_HIGH_QUALITY_DIAGNOSTIC '+JSON.stringify(diagnostic));
    await writeFile(new URL('../artifacts/c7/sre-high-quality-'+browserName+'.json',import.meta.url),
      JSON.stringify({...diagnostic,nodeCandidate:reference.candidate,browserCandidate:highReview.candidate,
        accepted:highBefore.project},null,2)+'\n');
    assert.equal(reference.result.delta.candidateFingerprint,locked,'Mounted input Node reference differs from locked detached witness');
    assert.equal(highReview.fingerprint,reference.result.delta.candidateFingerprint,'Browser and Node exact high-quality candidate fingerprints differ');
    assert.equal(highReview.fingerprint,locked);
    assert.deepEqual(highReview.candidate,reference.candidate);
    assert.deepEqual(['properties','plots','buildings'].map(k=>highReview.summary.retired.filter(r=>r.collection===k).length),[10,19,14]);
    assert.deepEqual(highReview.summary.added,[]);
    assert.deepEqual(highReview.candidate.identityAllocation,highBefore.project.identityAllocation);
    assert.equal(highReview.progress.work+highReview.progress.remainingWork,256000000);
    const highSearchMs=Date.now()-highStarted;
    const highApplyStarted=Date.now();
    await acceptAdvancedReview(highBefore,highReview);
    console.log('SRE_MOUNTED_HIGH_QUALITY '+JSON.stringify({browser:browserName,exactFingerprint:true,
      retired:highReview.summary.retired.length,searchToReviewMs:highSearchMs,
      applyUndoRedoPortableMs:Date.now()-highApplyStarted,positive:true}));

    await page.evaluate(doc=>__buildingQA.apply(doc),doc);
    await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
    await page.locator('#roadModeButton').click();
    const before=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      if(typeof s.computeJunctionAsync!=='function' ||
          typeof s.computeJunctionAsync.cancel!=='function')
        throw Error('Offline HTML did not activate its Blob Web Worker.');
      s.select({kind:'junction',id:'N-0139'});
      const node=app.project.city.nodes.find(n=>n.id==='N-0139');
      if(!node)throw Error('Organic fixture junction N-0139 was not generated.');
      const snapshot={accepted:JSON.stringify(app.project),revision:app.files.revision};
      s.update({x:node.x,y:node.y+15},{defer:false});
      return snapshot;
    });
    await page.waitForFunction(()=>{
      const s=__buildingQA.state().roadWorkspace.session;
      return !s.checking && s.settledRevision===s.revision;
    },null,{timeout:120000});
    const after=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      return {candidate:s.hasApplyCandidate, candidateJson:typeof s.reconciliation?.candidateJson,
        hasClonedCandidate:Object.hasOwn(s.reconciliation, 'candidateProject'),
        validation:s.reconciliation?.validation?.project,
        report:s.report?.status,
        apply:!document.querySelector('#roadApplyB4').disabled,
        accepted:JSON.stringify(app.project),revision:app.files.revision,
        error:s.error,reconciliationError:s.reconciliationError};
    });
    assert.equal(after.candidate,true,browserName+': offline preview candidate');
    assert.equal(after.candidateJson,'string');
    assert.equal(after.hasClonedCandidate,false);
    assert.equal(after.validation,'valid');
    assert.equal(after.apply,true,browserName+': offline preview must become Apply-ready');
    assert.equal(after.error,'');
    assert.equal(after.reconciliationError,'');
    assert.equal(after.accepted,before.accepted,'preview never changes accepted project');
    assert.equal(after.revision,before.revision,'preview never persists changes');
    const cancelled = await page.evaluate(async () => {
      const app = __buildingQA.state(), s = app.roadWorkspace.session;
      const button = document.querySelector('#roadApplyB4');
      const done = app.identityView.history.length;
      button.click();
      const validating = button.disabled && /Validating/.test(document.querySelector('#roadApplyStatusB4').textContent);
      s.reset();
      await new Promise(resolve => requestAnimationFrame(resolve));
      return {
        validating, disabled: button.disabled, revision: app.files.revision,
        accepted: JSON.stringify(__buildingQA.state().project), historyUnchanged: app.identityView.history.length === done,
      };
    });
    assert.equal(cancelled.validating,true,'Apply immediately reports validation and disables repeat clicks');
    assert.equal(cancelled.disabled,true,'reset cancels validation and disables Apply');
    assert.equal(cancelled.revision,before.revision);
    assert.equal(cancelled.accepted,before.accepted);
    assert.equal(cancelled.historyUnchanged,true);

    await page.evaluate(() => {
      const s = __buildingQA.state().roadWorkspace.session;
      const node = s.city.nodes.find(n=>n.id==='N-0139');
      s.update({x:node.x,y:node.y+15},{defer:false});
    });
    await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
    await page.locator('#roadApplyB4').click();
    await page.waitForFunction(() => !__buildingQA.state().roadWorkspace.active);
    const applied = await page.evaluate(() => {
      const app = __buildingQA.state();
      return { revision: app.files.revision, moved: app.project.city.nodes.find(n=>n.id==='N-0139').y,
        history: app.identityView.history.length, acceptedRevision:app.identityView.context.revision,
        allocation:app.project.identityAllocation,city:app.project.city };
    });
    assert.equal(applied.revision,before.revision+1);
    assert.equal(applied.moved,project.city.nodes.find(n=>n.id==='N-0139').y+15);
    assert.equal(applied.history,1);
    assert.equal(applied.acceptedRevision,1);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
    const undone=await page.evaluate(()=>__buildingQA.state().project);
    assert.deepEqual(JSON.parse(JSON.stringify(undone.city)),JSON.parse(JSON.stringify(project.city)));
    assert.deepEqual(undone.identityAllocation,applied.allocation);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().project.city),applied.city);
    assert.deepEqual(external,[],browserName+': offline HTML attempted a network request');
    assert.deepEqual(errors,[],browserName+': offline JavaScript page errors');
    console.log('C7_OFFLINE '+JSON.stringify({browser:browserName,passed:true,
      preview:true,apply:true,resetDuringApply:true,networkRequests:external.length}));
    await page.close();
  } catch(error) {
    browserFailures.push(new Error(browserName+' offline acceptance failed: '+error.message,{cause:error}));
    console.error('SRE_BROWSER_FAILURE '+browserName+' '+(error.stack??String(error)));
  } finally { await browser.close(); }
}
if(browserFailures.length)throw new AggregateError(browserFailures,'Offline browser acceptance failed');
