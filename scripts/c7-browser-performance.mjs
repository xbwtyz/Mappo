// Browser-only C7 performance and safety evidence, not a physical-device substitute.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const cases = [
  ['small','N-0139','y',15],
  ['large','N-0145','x',8],
  ['large','N-0239','x',8],
  ['large','N-0332','x',8],
];
const results=[], errors=[];
const round = n => Math.round(n*10)/10;
const median = a => {a=[...a].sort((x,y)=>x-y);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try {
    for(const viewport of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
      const page=await browser.newPage({viewport,hasTouch:name==='chromium'});
      page.setDefaultTimeout(120000);
      page.on('pageerror',e=>errors.push(name+'/'+viewport.name+': '+e.message));
      try {
        await page.route('**/*',r=>r.request().url()==='http://mappo.test/index.html'?
          r.fulfill({contentType:'text/html',body:html}):r.abort());
        await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>__buildingQA.state().files.ready);
        const projects=new Map();
        for(const [size,id,axis,delta] of cases){
          if(!projects.has(size))projects.set(size,createProject({size,seed:'c2-organic',morphology:'organic'}));
          const project=projects.get(size);
          for(const pass of ['cold','warm']){
            const doc={project,workspace:defaultWorkspace(project)};
            await page.evaluate(doc=>{
              __buildingQA.apply(doc);
              __buildingQA.state().roadWorkspace.start();
            },doc);
            const before=await page.evaluate(args=>{
              const app=__buildingQA.state(),s=app.roadWorkspace.session;
              s.select({kind:'junction',id:args.id});
              const point={...s.point},original=JSON.stringify(app.project),revision=app.files.revision;
              const row={started:performance.now(),analyzeMs:0,reconcileMs:0,renderMs:0,
                frameGapMs:0,done:false};
              window.__c7=row;
              let prev=performance.now();
              const frame=now=>{row.frameGapMs=Math.max(row.frameGapMs,now-prev);
                prev=now;if(!row.done)requestAnimationFrame(frame);};
              requestAnimationFrame(frame);
              for(const key of ['analyze','reconcile']){
                const fn=s[key];if(typeof fn!=='function')continue;
                s[key]=(...p)=>{const t=performance.now();try{return fn(...p);}finally{
                  row[key==='analyze'?'analyzeMs':'reconcileMs']+=performance.now()-t;}};
              }
              const changed=s.changed;
              s.changed=(...p)=>{
                const t=performance.now();changed(...p);
                if(!row.done && !s.checking && s.pending){
                  row.renderMs=performance.now()-t;
                  row.previewMs=performance.now()-row.started;
                  row.ready=!document.querySelector('#roadApplyB4').disabled;
                  row.done=true;
                }
              };
              const field=document.querySelector(args.axis==='x'?'#roadProposedX':'#roadProposedY');
              field.value=String(point[args.axis]+args.delta);
              field.dispatchEvent(new Event('input',{bubbles:true}));
              return {original,revision,point};
            },{id,axis,delta});
            await page.waitForFunction(()=>window.__c7?.done,null,{timeout:120000});
            const result=await page.evaluate(()=>({...window.__c7}));
            assert.equal(result.ready,true,name+'/'+viewport.name+'/'+size+'/'+id+' Apply not ready');
            assert.equal(await page.evaluate(b=>JSON.stringify(__buildingQA.state().project)===b.original),true,before);
            assert.equal(await page.evaluate(b=>__buildingQA.state().files.revision===b.revision),true,before);
            let applyMs=null;
            if(pass==='warm'){
              applyMs=await page.evaluate(b=>{
                const t=performance.now();
                document.querySelector('#roadApplyB4').click();
                const duration=performance.now()-t;
                if(__buildingQA.state().files.revision!==b.revision+1)throw Error('Apply not atomic');
                if(!__buildingQA.moveRoadHistory('undo'))throw Error('Undo failed');
                if(JSON.stringify(__buildingQA.state().project)!==b.original)throw Error('Undo mismatch');
                if(!__buildingQA.moveRoadHistory('redo'))throw Error('Redo failed');
                return duration;
              },before);
            }else{
              await page.evaluate(()=>{
                const s=__buildingQA.state().roadWorkspace.session;
                s.update({x:100000,y:100000},{defer:false});
              });
              assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
              await page.evaluate(({id,axis,delta})=>{
                const s=__buildingQA.state().roadWorkspace.session;
                const node=s.city.nodes.find(n=>n.id===id);
                for(const v of [1,2,3,delta]){
                  const p={x:node.x,y:node.y};p[axis]+=v;
                  s.update(p,{defer:true});
                }
              },{id,axis,delta});
              await page.waitForFunction(()=>{const s=__buildingQA.state().roadWorkspace.session;
                return !s.checking && s.settledRevision===s.revision;},null,{timeout:120000});
              assert.equal(await page.evaluate(b=>JSON.stringify(__buildingQA.state().project)===b.original),true,before);
            }
            results.push({browser:name,version:browser.version(),viewport:viewport.name,size,
              nodeCount:project.city.nodes.length,propertyCount:project.city.properties.length,
              id,pass,previewMs:round(result.previewMs),analyzeMs:round(result.analyzeMs),
              reconcileMs:round(result.reconcileMs),renderMs:round(result.renderMs),
              frameGapMs:round(result.frameGapMs),applyMs:applyMs===null?null:round(applyMs)});
          }
        }
      }catch(e){errors.push(name+'/'+viewport.name+': '+e.stack);}
      finally{await page.close();}
    }
  }finally{await browser.close();}
}
const summary=[];
for(const group of [...new Set(results.map(r=>[r.browser,r.viewport,r.size].join('/')))]){
  const rows=results.filter(r=>[r.browser,r.viewport,r.size].join('/')===group);
  const sorted=rows.map(r=>r.previewMs).sort((a,b)=>a-b);
  summary.push({group,n:rows.length,medianMs:round(median(sorted)),
    p95Ms:round(sorted[Math.ceil(.95*sorted.length)-1]),
    maxFrameGapMs:round(Math.max(...rows.map(r=>r.frameGapMs)))});
}
const report={runner:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,
  memoryGiB:round(os.totalmem()/2**30),platform:process.platform,node:process.version},
  summary,results,errors};
await mkdir(new URL('../artifacts/c7/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/c7/performance.json',import.meta.url),JSON.stringify(report,null,2));
console.log('C7_BROWSER_PERFORMANCE '+JSON.stringify({runner:report.runner,summary,errors}));
if(errors.length)throw Error('C7 performance/safety harness failed: '+errors.join(' | '));
