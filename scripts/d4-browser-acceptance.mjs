// D4 non-destructive acceptance: developed large city, schema-9 conservative
// recovery, keyboard semantics and real phone controls in both browser engines.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const output=new URL('../artifacts/d4/',import.meta.url);
await mkdir(output,{recursive:true});
const cases=[
  {name:'desktop',width:1440,height:900},
  {name:'phone',width:390,height:844},
];
const failures=[];
for(const [browserName,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try {
    for(const viewport of cases){
      const label=browserName+'-'+viewport.name;
      const page=await browser.newPage({viewport,hasTouch:browserName==='chromium'});
      page.setDefaultTimeout(120000);
      const pageErrors=[];
      page.on('pageerror',error=>pageErrors.push(error.message));
      try {
        await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
          ?route.fulfill({contentType:'text/html',body:html}):route.abort());
        await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>__buildingQA.state().files.ready);
        if(viewport.name==='phone')await page.locator('#workspaceCloseInspector').click();
        const start=async(project)=>{
          await page.evaluate(doc=>__buildingQA.apply(doc),{project,workspace:defaultWorkspace(project)});
          await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
          await page.locator('#roadModeButton').click();
          await page.locator('#roadEditControlsD1 > summary').click();
        };
        const original=createProject({seed:'c2-organic',size:'large',morphology:'organic'});
        await start(original);
        const before=await page.evaluate(async()=>{
          const app=__buildingQA.state();
          await app.files.flush();
          return {project:JSON.stringify(app.project),revision:app.files.revision,
            saved:JSON.stringify(await app.files.store.read())};
        });
        const heading=page.locator('#roadPreviewHeading');
        assert.equal(await heading.count(),1);
        assert.equal(await page.locator('#roadPreviewPanel [role="status"][aria-live="polite"]').count(),1);
        assert.equal(await page.locator('#roadApplyB4').getAttribute('aria-describedby'),
          'roadReportStatus roadApplyStatusB4 roadChangeSummaryD1');
        for(const id of ['roadReportStatus','roadApplyStatusB4','roadChangeSummaryD1'])
          assert.equal(await page.locator('#'+id).count(),1);
        await page.locator('#roadSelectionKind').selectOption('junction');
        await page.locator('#roadSelectionId').selectOption('N-0145');
        const point=original.city.nodes.find(n=>n.id==='N-0145');
        assert.ok(point,'C7 large fixture junction must exist');
        await page.locator('#roadProposedX').fill(String(point.x+8));
        await page.waitForFunction(()=>{
          const app=__buildingQA.state(),s=app.roadWorkspace.session;
          return !s.checking&&s.pending&&s.settledRevision===s.revision;
        });
        assert.equal(await page.locator('#roadApplyB4').isDisabled(),false,
          'Large developed city must reach verified ready state');
        assert.equal(await page.locator('#roadReportStatus').innerText(),'Preview ready');
        assert.equal(await page.locator('#roadDetailsD1').evaluate(el=>el.open),false);
        assert.equal(await page.locator('#roadChangeSummaryD1').isVisible(),true);
        assert.equal(await page.locator('#roadRecoveryD3').isVisible(),false);
        const afterDraft=await page.evaluate(async()=>{
          const app=__buildingQA.state();
          await app.files.flush();
          return {project:JSON.stringify(app.project),revision:app.files.revision,
            saved:JSON.stringify(await app.files.store.read())};
        });
        assert.deepEqual(afterDraft,before,'Preview must not persist data or advance revision');
        // A real Tab keyboard traversal must have an accessible, visibly focused control.
        await page.locator('#roadPreviewMinimize').focus();
        await page.keyboard.press('Tab');
        const keyboardFocus=await page.evaluate(()=>{
          const el=document.activeElement,css=getComputedStyle(el);
          return {tag:el.tagName,id:el.id,outline:css.outlineStyle,width:css.outlineWidth,
            visible:Boolean(el.getClientRects().length)};
        });
        assert.equal(keyboardFocus.visible,true,'Tab target must be visible');
        assert.ok(['BUTTON','INPUT','SELECT','SUMMARY'].includes(keyboardFocus.tag),
          'Tab must land on an interactive control, not a hidden element');
        assert.notEqual(keyboardFocus.outline,'none','Tab focus must have a visible outline');
        // Reset and Cancel do not mutate the developed city or recovery state.
        await page.locator('#roadPreviewReset').click();
        assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
        assert.equal(await page.locator('#roadRecoveryD3').isVisible(),false);
        await page.locator('#roadPreviewCancel').click();
        assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.active),false);
        const afterCancel=await page.evaluate(async()=>{
          const app=__buildingQA.state();
          await app.files.flush();
          return {project:JSON.stringify(app.project),revision:app.files.revision,
            saved:JSON.stringify(await app.files.store.read())};
        });
        assert.deepEqual(afterCancel,before);

        // Schema-9 records without provenance are protected, not silently regenerated.
        const legacy=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
        for(const row of [...legacy.city.properties,...legacy.city.buildings])delete row.roadProvenance;
        await start(legacy);
        const legacyBefore=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
        await page.locator('#roadSelectionKind').selectOption('road');
        await page.locator('#roadSelectionId').selectOption('RD-0113');
        await page.locator('#roadIntentDyC1').fill('18');
        await page.waitForFunction(()=>{
          const s=__buildingQA.state().roadWorkspace.session;
          return !s.checking&&s.pending&&s.settledRevision===s.revision;
        });
        assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
        assert.equal(await page.locator('#roadRecoveryD3').isVisible(),true);
        assert.equal(await page.locator('#roadDetailsD1').evaluate(el=>el.open),false);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),legacyBefore);
        assert.equal(await page.locator('#roadPreviewPanel').evaluate(el=>{
          const box=el.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;
        }),true,'Preview must stay inside phone/desktop viewport');
        await page.locator('#roadPreviewCancel').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),legacyBefore);
        assert.deepEqual(pageErrors,[],'No browser exceptions');
        console.log('PASS D4 '+label+': large-city preview, recovery isolation, focus, schema-9 blocker');
      }catch(error){
        failures.push(label+': '+error.message);
        console.error('FAIL D4 '+label+': '+error.stack);
        await page.screenshot({path:new URL(label+'-failure.png',output).pathname}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}
if(failures.length)throw Error('D4 acceptance failures:\n'+failures.join('\n'));
console.log('D4 browser QA: '+(cases.length*2)+' developed-city / accessibility / schema-9 checks passed.');
