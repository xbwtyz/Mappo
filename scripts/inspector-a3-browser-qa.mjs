import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {observeBuildingApp} from '../tests/helpers/building-app.js';
const dir=new URL('../artifacts/inspector-a3/',import.meta.url);
await mkdir(dir,{recursive:true});
const file=new URL('instrumented.html',dir);
const baselineFile=new URL('baseline.html',dir);
await writeFile(baselineFile,observeBuildingApp(await readFile(new URL('../dist/mappo-0.2.19-dev.html',import.meta.url),'utf8'),'',{legacy:false}));
const query='?seed=inspector-a3-qa&size=small';
await writeFile(file,observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'),'',{legacy:false}));
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const el=id=>page.locator('#'+id);
    await page.context().setOffline(true);await page.goto(file.href+query);
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const city=()=>page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    const original=await city();
    const selected=await page.evaluate(()=>{
      const a=__buildingQA.state(),b=a.project.city.buildings.find(b=>b.footprint?.length>=3);
      if(!b)return null;return a.buildingWorkspace.select({kind:'building',id:b.id})?b.id:null;
    });
    assert.ok(selected);
    assert.equal(await el('workspaceSelectionInspector').getAttribute('data-inspector-kind'),'building');
    await page.locator('#workspaceInspectorQuickButtons button').filter({hasText:'Edit footprint'}).click();
    assert.equal(await el('desktopPlaceEditor').isVisible(),true);
    const control=await el('buildingTransformPanel').evaluate(node=>{window.__a3OriginalControl=node;return node.id;});
    assert.equal(control,'buildingTransformPanel');
    await el('buildingOffsetX').fill('0.5');
    await el('buildingOffsetX').dispatchEvent('change');
    const offset=await el('buildingOffsetX').inputValue();
    assert.equal(Number(offset),0.5);
    const editStart=Date.now();
    await el('desktopPlaceDetailsA3').click();
    assert.equal(await el('desktopPlaceEditor').getAttribute('data-inspector-view'),'Details');
    assert.equal(await el('buildingTransformPanel').isHidden(),true);
    await el('desktopPlaceEdit').click();
    const commonStart=Date.now();
    await el('desktopPlaceReview').click();await el('desktopPlaceEdit').click();
    const commonMs=Date.now()-commonStart;
    assert.equal(await el('buildingTransformPanel').isVisible(),true);
    assert.equal(await el('buildingTransformPanel').evaluate(node=>node===window.__a3OriginalControl),true);
    assert.equal(await el('buildingOffsetX').inputValue(),offset);
    assert.equal(await city(),original);
    const placeMs=Date.now()-editStart;
    // Exercise the real discard guard: dismiss preserves the draft; accept closes it.
    const cancelBuilding = async accept => {
      const seen = page.waitForEvent('dialog');
      const click = el('buildingPreviewCancel').click();
      const dialog = await seen;
      const message = dialog.message(), type = dialog.type();
      await (accept ? dialog.accept() : dialog.dismiss());
      await click;
      assert.equal(type,'confirm');
      assert.match(message,/Discard the unsaved building preview/);
    };
    await cancelBuilding(false);
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.isActive),true);
    assert.equal(await el('buildingOffsetX').inputValue(),offset);
    assert.equal(await city(),original);
    await cancelBuilding(true);
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.isActive),false);
    assert.equal(await city(),original);
    const baseline=await browser.newPage({viewport:{width:1440,height:900}});
    let baselineMs;
    try{
      await baseline.context().setOffline(true);await baseline.goto(baselineFile.href+query);
      await baseline.waitForFunction(()=>__buildingQA.state().files.ready);
      const match=await baseline.evaluate(id=>__buildingQA.state().buildingWorkspace.select({kind:'building',id}),selected);
      assert.equal(match,true);
      await baseline.locator('#workspaceInspectorQuickButtons button').filter({hasText:'Edit footprint'}).click();
      await baseline.locator('#buildingOffsetX').fill('0.5');
      await baseline.locator('#buildingOffsetX').dispatchEvent('change');
      const t=Date.now();
      await baseline.locator('#desktopPlaceReview').click();await baseline.locator('#desktopPlaceEdit').click();
      baselineMs=Date.now()-t;
      assert.equal(Number(await baseline.locator('#buildingOffsetX').inputValue()),0.5);
      assert.equal(await baseline.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
    }finally{await baseline.close();}
    await page.getByRole('tab',{name:'Roads',exact:true}).click();
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.active);
    const roadState=()=>page.evaluate(()=>{const s=__buildingQA.state().roadWorkspace.session;return JSON.stringify({point:s.point,pending:s.pending,revision:s.revision});});
    const roadBefore=await roadState();
    await el('roadMenuDetailsA3').click();
    assert.equal(await el('roadInspectorDetailsA3').isVisible(),true);
    await el('roadMenuReview').click();await el('roadMenuEdit').click();
    assert.equal(await roadState(),roadBefore);
    assert.equal(await city(),original);
    await el('roadPreviewCancel').click();
    await page.getByRole('tab',{name:'Add',exact:true}).click();
    await page.locator('[data-add=lake]').click();
    await el('lakeRadiusInput').fill('18');
    await el('desktopLandscapeDetailsA3').click();
    assert.equal(await el('desktopLandscapeDetailsPanelA3').isVisible(),true);
    await el('desktopLandscapeReview').click();await el('desktopLandscapeEdit').click();
    assert.equal(await el('lakeRadiusInput').inputValue(),'18');
    assert.equal(await city(),original);
    for(const viewport of [{width:1366,height:768},{width:5120,height:1440}]){
      await page.setViewportSize(viewport);
      assert.ok((await el('mapCanvas').boundingBox()).width>300);
      assert.equal(await el('desktopLandscapeEdit').isVisible(),true);
    }
    const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});
    assert.deepEqual(duplicates,[]);assert.deepEqual(errors,[]);
    console.log('PASS '+name+' A3 details/edit/review, original control identity, draft isolation, landscape input and viewport checks');
    await writeFile(new URL(name+'.json',dir),JSON.stringify({engine:name,placeViewTransitions:4,placeClicks:4,placeMs,commonWorkflow:{baselineClicks:2,candidateClicks:2,baselineMs,candidateMs:commonMs},detailsDuringDraft:{baselineAvailable:false,candidateClicks:1}},null,2));
  }finally{await browser.close();}
}
