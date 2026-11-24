import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

const dir=new URL('../artifacts/road-group-b1/',import.meta.url);
await mkdir(dir,{recursive:true});
const file=new URL('mappo.html',dir);
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
await writeFile(file,observeBuildingApp(html,`
globalThis.groupQA={
  choose:()=>{
    const s=roadWorkspace.session,g=s.graph;
    const pairs=[['RD-0113','RD-0114']];
    for(const ids of g.incidentRoads.values())for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]].sort());
    let attempts=0;
    for(const ids of pairs){
      const group=resolveRoadGroupB1(g,ids);
      if(!group.eligible)continue;
      if(!ids.every(id=>{const r=g.roadsById.get(id),a=g.nodesById.get(r.a),b=g.nodesById.get(r.b);return Math.hypot(a.x-b.x,a.y-b.y)>12;}))continue;
      const result=prepareRoadGroupReflowB1(project,ids,{x:.5,y:0});
      if(result.candidateProject){s.select({kind:'road',id:ids[0]});return ids;}
      if(++attempts>=50)break;
    }
    throw Error('No valid connected pair for offline acceptance');
  },
  reopen:()=>applyProjectDocument(decodeProjectDocument(encodeProjectDocument(createProjectDocument(project,captureWorkspace().workspace))))
};`,{legacy:false}));
const engines={chromium,firefox};
for(const name of process.env.MAPPO_QA_ENGINE?[process.env.MAPPO_QA_ENGINE]:Object.keys(engines)){
  const browser=await engines[name].launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},offline:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(file.href+'?seed=c2-planned&size=small&shape=planned');
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const el=id=>page.locator('#'+id);
    const city=()=>page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    const entries=()=>page.evaluate(()=>__buildingQA.state().acceptedHistoryD01.summaries());
    const key=async chord=>{await el('mapCanvas').focus();await page.keyboard.press(chord);};
    await page.getByRole('tab',{name:'Generation',exact:true}).click();
    await page.locator('[data-generation=districts]').click();
    if(await el('districtList').getByRole('button').count()===0){
      await el('desktopGenerationPreview').click();await el('desktopGenerationApply').click();
    }
    const baseline=await city();
    const beforeCount=(await entries()).length;
    await el('districtList').getByRole('button').first().click();
    await el('districtNameInput').fill('B1 district replay');
    await el('applyDistrictButton').click();
    const afterDistrict=await city();
    await el('desktopDistrictBack').click();
    await page.locator('[data-generation=defenses]').click();
    const walls=el('wallsEnabledInput');await walls.setChecked(!(await walls.isChecked()));
    await el('desktopGenerationPreview').click();await el('desktopGenerationApply').click();
    const afterDefense=await city();
    const histories=()=>page.evaluate(()=>{const w=__buildingQA.capture().workspace;return JSON.stringify([w.districtEditor?.history??[],w.fortificationEditor?.history??[]]);});
    const saved=await histories();
    await page.getByRole('tab',{name:'Roads',exact:true}).click();
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.active);
    const ids=await page.evaluate(()=>groupQA.choose());
    const point=await page.evaluate(id=>{
      const q=__buildingQA.state(),s=q.roadWorkspace.session,r=s.graph.roadsById.get(id);
      const a=s.graph.nodesById.get(r.a),b=s.graph.nodesById.get(r.b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      q.camera.x=mid.x;q.camera.y=mid.y;q.camera.zoom=3;
      const screen=q.camera.worldToScreen(mid),box=document.getElementById('mapCanvas').getBoundingClientRect();
      __buildingQA.draw();return{x:screen.x+box.left,y:screen.y+box.top};
    },ids[1]);
    await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y);await page.keyboard.up('Shift');
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.session.roadGroupB1?.eligible);
    await el('roadMenuEdit').click();
    await el('roadIntentDxC1').fill('0.5');
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.session.hasApplyCandidate);
    assert.equal(await city(),afterDefense);
    await el('roadMenuDetailsA3').click();
    await el('roadMenuReview').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.roadIntentOffset.x),.5);
    await key('Control+Shift+z');
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.pending),false);
    assert.equal(await city(),afterDefense);
    await el('roadMenuEdit').click();
    await el('roadIntentDxC1').fill('0.5');
    await page.waitForFunction(()=>!document.getElementById('roadApplyB4').disabled);
    await el('roadApplyB4').click();
    await page.waitForFunction(()=>!__buildingQA.state().roadWorkspace.active);
    const afterGroup=await city();
    assert.notEqual(afterGroup,afterDefense);
    assert.equal(await histories(),saved);
    const list=await entries();
    assert.equal(list.length,beforeCount+3);
    assert.deepEqual(list.slice(-3).map(r=>r.family),['districts','defenses','road']);
    assert.equal(list.at(-1).operation,'translate-road-group');
    assert.deepEqual(list.at(-1).targetIds,[...ids].sort());
    for(const expected of [afterDefense,afterDistrict,baseline]){await key('Control+z');assert.equal(await city(),expected);}
    for(const expected of [afterDistrict,afterDefense,afterGroup]){await key('Control+y');assert.equal(await city(),expected);}
    assert.equal(await histories(),saved);
    await page.evaluate(()=>groupQA.reopen());
    assert.equal(await city(),afterGroup);assert.equal(await histories(),saved);assert.equal((await entries()).length,0);
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' B1 '+ids.join(',')+' connected selection, numeric draft, reset, district/defense/road history and portable reopen');
  }finally{await browser.close();}
}
