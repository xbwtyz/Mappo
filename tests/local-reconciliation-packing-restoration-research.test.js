// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {createLareContext} from '../src/core/reconciliation-context.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {reconcileRoadWorkspace} from '../src/editor/road-workspace.js';
import {AcceptedEditHistoryD01} from '../src/core/accepted-edit-history-d01.js';
import {classifyRoadProvenance,stampRoadGenerated} from '../src/core/road-provenance.js';
import {polygonSignedArea} from '../src/core/geometry.js';
import {riBudget,riReporter} from '../src/core/road-impact-model.js';
import {inspectRoadDependencies,inspectRoadContextReferences} from '../src/core/road-impact-dependencies.js';

const roadIds=['RD-0184','RD-0186'],baseOffset={x:-3.005274072121821,y:-37.39896113564458};
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const sorted=xs=>[...xs].sort();
const unique=xs=>[...new Set(xs)];
const inventory=(project,draft)=>{
  const context=createLareContext(project,draft,new Map(),createLareBudget());
  const city=project.city,props=new Map(city.properties.map(p=>[p.id,p])),plots=new Map(city.plots.map(p=>[p.id,p]));
  const buildings=new Map(city.buildings.map(b=>[b.id,b]));
  const eligible=new Map();
  for(const e of context.properties){
    const p=props.get(e.id),ownPlots=p.plotIds.map(id=>plots.get(id));
    if(e.policy.mode!=='adaptive'||e.policy.provenance!=='generated'||p.buildingCompounds?.length||
      classifyRoadProvenance(p,ownPlots)!=='generated'||e.buildings.some(b=>b.mode!=='rigid'||b.provenance!=='generated'))continue;
    if(p.buildingIds.some(id=>classifyRoadProvenance(buildings.get(id))!=='generated'))continue;
    eligible.set(p.id,{id:p.id,block:p.blockId,plots:p.plotIds.slice(),buildings:p.buildingIds.slice(),area:p.area,
      footprint:p.buildingIds.reduce((n,id)=>n+buildings.get(id).area,0)});
  }
  return eligible;
};
const removedSets=(eligible,ids)=>{
  assert.equal(unique(ids).length,ids.length,'Duplicate retirement');
  const rows=ids.map(id=>{assert.ok(eligible.has(id),'Protected or out-of-scope parcel: '+id);return eligible.get(id);});
  return {properties:sorted(ids),plots:sorted(rows.flatMap(r=>r.plots)),buildings:sorted(rows.flatMap(r=>r.buildings))};
};
// All surviving records and project metadata are checked for external
// references, including embedded generator snapshots. Fail closed on any
// exact retired ID token inside strings; never dissolve other dependencies.
function externalReference(value,retired){
  if(typeof value==='string'){
    for(const id of retired)if(value.includes(id))return id;
  }else if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(retired.has(k))return k;
      const found=externalReference(v,retired);if(found)return found;
    }
  }
  return null;
}
function reduce(project,sets){
  const next=structuredClone(project),all=new Set(Object.values(sets).flat());
  for(const key of ['properties','plots','buildings']){
    const remove=new Set(sets[key]);
    next.city[key]=next.city[key].filter(row=>!remove.has(row.id));
    assert.equal(project.city[key].length-next.city[key].length,remove.size);
  }
  // A retained generated parcel may lose an explicitly reviewed child.
  // Change only the reciprocal membership and derived provenance snapshot.
  const removedBuildings=new Set(sets.buildings);
  const plots=new Map(next.city.plots.map(p=>[p.id,p]));
  for(const p of next.city.properties){
    const remaining=p.buildingIds.filter(id=>!removedBuildings.has(id));
    if(remaining.length!==p.buildingIds.length){
      assert.equal(classifyRoadProvenance(p,p.plotIds.map(id=>plots.get(id))),'generated');
      p.buildingIds=remaining;
      stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
    }
  }
  const ref=externalReference(next,all);
  if(ref)throw Error('Surviving reference to retired record: '+ref);
  const affected=new Set(project.city.properties.filter(p=>sets.properties.includes(p.id)).map(p=>p.blockId));
  const areas=new Map();
  for(const p of next.city.properties)areas.set(p.blockId,(areas.get(p.blockId)??0)+p.area);
  for(const o of next.city.openSpaces)if(affected.has(o.blockId)){
    o.area=Math.max(0,next.city.blocks.find(b=>b.id===o.blockId).area-(areas.get(o.blockId)??0));
  }
  validateStoredProject(next);
  return next;
}
function verifyOriginal(project,candidate,draft,reviewed){
  // Recompute the entire removal set from the original and final inventories;
  // no trust in the candidate solver's retirement ledger.
  const missing={};
  for(const key of ['properties','plots','buildings']){
    const now=new Set(candidate.city[key].map(r=>r.id));
    missing[key]=sorted(project.city[key].filter(r=>!now.has(r.id)).map(r=>r.id));
    assert.deepEqual(missing[key],reviewed[key],'Unreviewed retirement');
    assert.equal(candidate.city[key].length,project.city[key].length-missing[key].length);
  }
  const eligible=inventory(project,draft);
  const whole=removedSets(eligible,missing.properties);
  assert.deepEqual(whole.plots,missing.plots,'Plot retirement requires complete parcel retirement');
  const allowed=new Set([...eligible.values()].flatMap(p=>p.buildings));
  const removed=new Set(missing.buildings);
  assert.ok(whole.buildings.every(id=>removed.has(id)),'Retired parcel has surviving child');
  assert.ok(missing.buildings.every(id=>allowed.has(id)),'Unauthorized individual building removal');
  const reduced=reduce(project,missing);
  const reducedDraft=prepareRoadGroupIntentB1(reduced,roadIds,draft.offset);
  assert.deepEqual(reducedDraft.proposedNodes,draft.proposedNodes,'Different final road target');
  const violation=verifyLareGroupPreservation(reduced,candidate,reducedDraft,new Map(),createLareBudget());
  assert.equal(violation,null,JSON.stringify(violation));
  validateStoredProject(candidate);
  const context={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:createLareContext(project,draft,new Map(),createLareBudget()).blockIds,acceptedValid:true};
  const {emit,items}=riReporter(),spend=riBudget();
  inspectRoadDependencies(candidate.city,candidate.city,context,emit,spend,project.city);
  inspectRoadContextReferences(project.city,candidate.city,context,emit,spend);
  const issues=items().filter(r=>r.severity!=='info'&&r.code!=='frontage-geometry'&&!(r.kind==='plot'&&r.code==='property-containment'));
  assert.deepEqual(issues,[],'Original infrastructure/land dependency failure');
}
function verifyHistory(project,candidate,sets){
  const ws=reconcileRoadWorkspace(defaultWorkspace(project),project.city,candidate.city);
  const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,ws)));
  assert.equal(hash(reopened.project),hash(candidate));assert.equal(hash(reopened.workspace),hash(ws));
  const history=new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project,candidate,{family:'road',operation:'research-retire-generated-parcels',
    label:'Research road and parcel retirement',targetIds:[...roadIds,...sets.properties,...sets.buildings]}).status,'recorded');
  const undo=history.prepare('undo',candidate,ws);assert.ok(undo.ok,undo.reason);
  assert.equal(hash(undo.candidate),hash(project));history.accept('undo',undo.entry,undo.candidate);
  const redo=history.prepare('redo',undo.candidate,undo.workspace);assert.ok(redo.ok,redo.reason);
  assert.equal(hash(redo.candidate),hash(candidate));history.accept('redo',redo.entry,redo.candidate);
}

function patchOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, 'Research patch must match exactly once');
  return source.replace(marker, replacement);
}

async function createPackingSolver(variant,t) {
  const dir = await mkdtemp(join(tmpdir(), 'mappo-parcel-research-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(new URL('../src/', import.meta.url), join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const path = join(dir, 'src/core/reconciliation-parcels.js');
  const original = await readFile(path, 'utf8');
  let parcelSource = patchOnce(original, 'compactDeformation=false},budget)', 'compactDeformation=false,buildings=[]},budget)');
  parcelSource = patchOnce(parcelSource, 'const tryCandidate = function* (family, boundary, nextPlots) {',
    'const tryCandidate = function* (family, boundary, nextPlots, buildingSeeds=null) {');
  parcelSource = patchOnce(parcelSource, 'found.push({family,property:next,plots:nextPlots,score,order:rank});',
    'found.push({family,property:next,plots:nextPlots,score,order:rank,buildingSeeds});');
  const construction = "    // Geometry driven: pack original rigid footprint bounding boxes in the\n    // new frontage frame, then build an envelope around that actual packing.\n    // No scaling or reflection of any building is permitted.\n    if(mode==='adaptive'&&!fixedRings.length&&buildings.length&&buildings.every(b=>b.permission.mode==='rigid')){\n      attemptLimit=attempts+96;\n      const align=Math.atan2(tangent.y,tangent.x)-Math.atan2(oldT.y,oldT.x);\n      const margin=.12;\n      const rotationModes=[0,1,2];\n      const shape=original.map(local);\n      const rectangular=shape.length===4&&shape.every(q=>\n        (Math.abs(q.u)<1e-5||Math.abs(q.u-width)<1e-5)&&\n        (Math.abs(q.v)<1e-5||Math.abs(q.v-oldDepth)<1e-5));\n      // Keep the original shelf pass intact; add a bounded second family\n      // only where an irregular envelope could clip a tight rigid packing.\n      for(const fitMode of rectangular?[0]:[0,1]){\n      if(fitMode)attemptLimit=attempts+96;\n      for(const rotationMode of rotationModes){\n        const pieces=buildings.map(({source})=>{\n          const pts=source.geometry.regions.flatMap(r=>r.ring);\n          budget.spend(Math.max(1,pts.length*4));\n          const c={x:pts.reduce((n,p)=>n+p.x,0)/pts.length,y:pts.reduce((n,p)=>n+p.y,0)/pts.length};\n          const angle=align+(rotationMode===1?Math.PI/2:rotationMode===2?-align:0);\n          const co=Math.cos(angle),si=Math.sin(angle);\n          const localPoint=p=>{const x=p.x-c.x,y=p.y-c.y;const q={x:x*co-y*si,y:x*si+y*co};\n            return {u:q.x*tangent.x+q.y*tangent.y,v:q.x*inward.x+q.y*inward.y};};\n          const coords=pts.map(localPoint);\n          const minU=Math.min(...coords.map(p=>p.u)),maxU=Math.max(...coords.map(p=>p.u));\n          const minV=Math.min(...coords.map(p=>p.v)),maxV=Math.max(...coords.map(p=>p.v));\n          return {source,c,angle,minU,minV,w:maxU-minU,h:maxV-minV,localPoint};\n        }).sort((a,b)=>b.h-a.h||b.w-a.w||(a.source.id<b.source.id?-1:1));\n        const sumWidth=pieces.reduce((n,p)=>n+p.w+margin,margin);\n        const maxWidth=Math.max(...pieces.map(p=>p.w))+2*margin;\n        const targetWidths=METHOD==='pack-linear'?[sumWidth,maxWidth]:lareParcelUnique([sumWidth,maxWidth,(sumWidth+maxWidth)/2,Math.max(maxWidth,usableWidth*.85)]);\n        for(const target of targetWidths){\n          if(target>length+lareParcelEps)continue;\n          let u=margin,v=margin,rowH=0,usedW=0;\n          const placed=[];\n          for(const p of pieces){\n            budget.spend();\n            if(u>margin&&u+p.w+margin>target+lareParcelEps){u=margin;v+=rowH+margin;rowH=0;}\n            placed.push({p,u,v});usedW=Math.max(usedW,u+p.w+margin);u+=p.w+margin;rowH=Math.max(rowH,p.h);\n          }\n          const packedDepth=v+rowH+margin;\n          const baseSpan=Math.max(minimumWidth,usedW+.08);\n          for(const widthFactor of fitMode?[1.15,1.35,1.6]:[1]){\n          const span=baseSpan*widthFactor;\n          if(span>length||packedDepth<=1)continue;\n          for(const depthFactor of fitMode?[1.15,1.4,1.65]:[1,1.2]){\n            const depth=packedDepth*depthFactor;\n            for(const front of [setback+.05]){\n              const guided=[];\n              if(fitMode&&METHOD==='pack-fit-guided'){\n                // Intersect linear half-plane constraints on translation\n                // along the frontage. For concave blocks this is conservative;\n                // an empty interval removes no ordinary sample.\n                let lo=0,hi=length-span,valid=true;\n                const su=span/width,sv=depth/oldDepth;\n                for(const e of edges){\n                  const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,len=Math.hypot(dx,dy);\n                  if(len<1e-6){valid=false;break;}\n                  const n={x:-dy/len,y:dx/len};\n                  const margin=(STREET_WIDTHS[e.road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.05;\n                  const slope=tangent.x*n.x+tangent.y*n.y;\n                  for(const q of shape){\n                    budget.spend();\n                    const v=world(q.u*su,front+q.v*sv);\n                    const required=margin-((v.x-e.a.x)*n.x+(v.y-e.a.y)*n.y);\n                    if(Math.abs(slope)<1e-9){if(required>1e-7)valid=false;}\n                    else if(slope>0)lo=Math.max(lo,required/slope);\n                    else hi=Math.min(hi,required/slope);\n                  }\n                }\n                if(valid&&lo<=hi)guided.push(lareParcelClamp(center-span/2,lo,hi),(lo+hi)/2,lo,hi);\n              }\n              const starts=lareParcelUnique([...guided,center-span/2,oldLeft,(length-span)*.25,(length-span)*.5,(length-span)*.75,0,length-span]\n                .map(x=>lareParcelClamp(x,0,length-span)));\n              for(const left of starts){\n                if(attempts>=attemptLimit)break;\n                const su=span/width,sv=depth/oldDepth;\n                const map=p=>{const q=local(p);return world(left+q.u*su,front+q.v*sv);};\n                const boundary=original.map(map);\n                const seeds={};\n                let contained=true;\n                for(const {p,u,v} of placed){\n                  budget.spend(Math.max(1,p.source.geometry.regions.reduce((n,r)=>n+r.ring.length,0)*boundary.length*2));\n                  const tx=left+(span-usedW)/2+u-p.minU,ty=front+(depth-packedDepth)/2+v-p.minV;\n                  const c=world(tx,ty);\n                  const transformed=p.source.geometry.regions.map(r=>r.ring.map(q=>{const z=p.localPoint(q);return world(tx+z.u,ty+z.v);}));\n                  if(transformed.some(r=>!shapeContained(r,boundary))){contained=false;break;}\n                  seeds[p.source.id]={dx:c.x-p.c.x,dy:c.y-p.c.y,angle:p.angle};\n                }\n                if(!contained)continue;\n                yield* tryCandidate((fitMode?'packed-fit-':'packed-')+rotationMode+'-'+Math.round(target*100),boundary,mapLarePlotCells(plots,map,budget),seeds);\n              }\n            }\n          }\n          }\n        }\n      }\n      }\n    }\n".replaceAll('METHOD', JSON.stringify(variant));
  const marker = '  }\n  return found.sort(lareParcelCmp);';
  await writeFile(path, patchOnce(parcelSource, marker, construction + marker));
  const buildingPath = join(dir, 'src/core/reconciliation-buildings.js');
  let buildingSource = await readFile(buildingPath, 'utf8');
  buildingSource = patchOnce(buildingSource, 'plots,fixedBuildings=[]},budget)', 'plots,fixedBuildings=[],seedTransforms=[]},budget)');
  buildingSource = patchOnce(buildingSource, "  if(permission?.mode!=='rigid')return candidates;",
    "  if(permission?.mode!=='rigid')return candidates;\n  for(const seed of seedTransforms)yield* tryOne(seed.dx,seed.dy,seed.angle,'packed-seed');");
  buildingSource = patchOnce(buildingSource, "const k=c.rotation===0?'translation':'rotation';",
    "const k=c.family==='packed-seed'?'packed-seed':c.rotation===0?'translation':'rotation';");
  buildingSource = patchOnce(buildingSource, "groups.get(candidates[drop].rotation===0?'translation':'rotation')",
    "groups.get(candidates[drop].family==='packed-seed'?'packed-seed':candidates[drop].rotation===0?'translation':'rotation')");
  await writeFile(buildingPath, buildingSource);
  const arrangementPath = join(dir, 'src/core/reconciliation-arrangement.js');
  let arrangement = await readFile(arrangementPath, 'utf8');
  arrangement = patchOnce(arrangement, 'plots: parcel.plots, fixedBuildings }, budget)',
    'plots: parcel.plots, fixedBuildings, seedTransforms: parcel.buildingSeeds?.[building.source.id] ? [parcel.buildingSeeds[building.source.id]] : [] }, budget)');
  const researchSolver = "  // Detached property bundles. Cache one complete local building proposal\n  // per parcel geometry; no locally successful bundle is an accepted edit.\n  if (enhanced && entries.some(e => e.buildings.some(b => b.permission.mode === 'rigid'))) {\n    const groups=new Map(), cache=new Map(), proposals=[];\n    for(const id of variables){\n      if(!id.startsWith('property:'))continue;\n      const block=byVariable.get(id).entry.property.blockId;\n      if(!groups.has(block))groups.set(block,[]);\n      groups.get(block).push(id);\n    }\n    const report=(status,exhausted=null)=>({status,best:verifiedIncumbent,stage:0,\n      complete:verifiedIncumbent?1:0,stats:budget.snapshot(),exhausted});\n    const zero=()=>({assignments:[],score:[0,0,0,0,0,0],key:''});\n    const add=(row,id,choice)=>({assignments:[...row.assignments,{variable:id,choice}],\n      score:row.score.map((v,i)=>v+choice.score[i]),key:row.key+JSON.stringify([id,choice.key])+';'});\n    const join=(a,b)=>({assignments:[...a.assignments,...b.assignments],score:a.score.map((v,i)=>v+b.score[i]),key:a.key+b.key});\n    let refused=false;\n    try{\n      for(const [block,ids] of groups){\n        let used=0,deepest=0,blocked=null,bundles=0,cacheHits=0,bundleFailures=0,bundleLimits=0,pruned=0,pairTests=0,pairHits=0,arcPasses=0;\n        const expand=()=>{if(used>=2048)throw new LareBudgetExceeded('block-expansions');budget.expand();used++;};\n        const bundle=function*(id,choice){\n          if(cache.has(choice.value)){budget.spend();cacheHits++;return cache.get(choice.value);}\n          bundles++;\n          const entry=byVariable.get(id).entry, root=add(zero(),id,choice);\n          const domains=[];\n          for(const building of entry.buildings){\n            const bid='building:'+building.source.id;\n            const options=(yield* choices(bid,root)).sort((a,b)=>Number(b.value.family==='packed-seed')-Number(a.value.family==='packed-seed'));\n            if(!options.length){cache.set(choice.value,null);bundleFailures++;return null;}\n            domains.push({id:bid,options});\n          }\n          domains.sort((a,b)=>a.options.length-b.options.length||lareArrangeCompare(a.id,b.id));\n          let localUsed=0,limited=false;\n          function* fill(depth,row){\n            if(depth===domains.length)return row;\n            const d=domains[depth];\n            for(const option of d.options){\n              if(localUsed>=256){limited=true;return null;}\n              expand();localUsed++;\n              if(!(yield* compatible(d.id,option,row)))continue;\n              yield {stage:'bundle-building',id:d.id,stats:budget.snapshot()};\n              const next=yield* fill(depth+1,add(row,d.id,option));\n              if(next)return next;\n              if(limited)return null;\n            }\n            return null;\n          }\n          const result=yield* fill(0,root);\n          if(limited)bundleLimits++;\n          else if(!result)bundleFailures++;\n          // A bounded-out bundle is not an impossibility proof.\n          // Record it as unavailable within this experiment's fixed cap.\n          cache.set(choice.value,result);\n          return result;\n        };\n        // Pair compatibility is immutable for this arrangement. Charge cache\n        // reads too; exact geometry remains the original overlap predicate.\n        const pairCache=new Map();\n        const pairOK=(a,b)=>{\n          budget.spend();\n          if(pairCache.get(a.value)?.has(b.value)){pairHits++;return pairCache.get(a.value).get(b.value);}\n          pairTests++;\n          const ok=!lareArrangeOverlap(a.value.property.boundary,b.value.property.boundary,budget);\n          if(!pairCache.has(a.value))pairCache.set(a.value,new Map());\n          if(!pairCache.has(b.value))pairCache.set(b.value,new Map());\n          pairCache.get(a.value).set(b.value,ok);pairCache.get(b.value).set(a.value,ok);\n          return ok;\n        };\n        const available=option=>!cache.has(option.value)||Boolean(cache.get(option.value));\n        function* propagate(domains){\n          if(METHOD!=='domain-arc')return true;\n          let changed=true;\n          while(changed){\n            changed=false;arcPasses++;\n            for(const [id,options] of domains){\n              for(const [other,support] of domains){\n                if(other===id)continue;\n                const current=domains.get(id);\n                const kept=current.filter(a=>available(a)&&support.some(b=>available(b)&&pairOK(a,b)));\n                pruned+=current.length-kept.length;\n                if(kept.length!==current.length){changed=true;domains.set(id,kept);}\n                yield {stage:'domain-arc',id,other,stats:budget.snapshot()};\n                if(!kept.length){blocked=id;return false;}\n              }\n            }\n          }\n          return true;\n        }\n        function* visit(row,domains){\n          const depth=ids.length-domains.size;\n          if(depth>deepest){deepest=depth;blocked=null;}\n          if(!domains.size)return row;\n          // Do not retry known failed/capped local bundles in this run.\n          for(const [id,options] of domains){\n            const kept=options.filter(available);\n            pruned+=options.length-kept.length;domains.set(id,kept);\n            if(!kept.length){blocked=id;return null;}\n          }\n          if(!(yield* propagate(domains)))return null;\n          const [id,options]=[...domains].sort((a,b)=>a[1].length-b[1].length||\n            lareArrangeCompare(a[0],b[0]))[0];\n          for(const option of options.slice().sort((a,b)=>Number(Boolean(b.value.buildingSeeds))-Number(Boolean(a.value.buildingSeeds)))){\n            expand();\n            if(!available(option))continue;\n            const next=new Map();\n            let viable=true;\n            for(const [other,domain] of domains){\n              if(other===id)continue;\n              const kept=domain.filter(b=>available(b)&&pairOK(option,b));\n              pruned+=domain.length-kept.length;\n              yield {stage:'domain-forward',id,other,stats:budget.snapshot()};\n              if(!kept.length){blocked=other;viable=false;break;}\n              next.set(other,kept);\n            }\n            if(!viable)continue;\n            const local=yield* bundle(id,option);\n            if(!local)continue;\n            yield {stage:'bundle-property',id,depth,stats:budget.snapshot()};\n            const result=yield* visit(join(row,local),next);\n            if(result)return result;\n          }\n          if(depth>=deepest)blocked=id;\n          return null;\n        }\n        let local=null,failure=null;\n        try{const domains=new Map();for(const id of ids)domains.set(id,yield* choices(id,zero()));\n          local=yield* visit(zero(),domains);}\n        catch(error){if(!(error instanceof LareBudgetExceeded))throw error;failure=error.resource;}\n        yield {stage:'block-result',block,method:METHOD,status:local?'proposal':failure?'limited':'exhausted',\n          depth:deepest,total:ids.length,blocked,expansions:used,exhausted:failure,bundles,cacheHits,bundleFailures,bundleLimits,pruned,pairTests,pairHits,arcPasses};\n        if(local)proposals.push(local);else refused=true;\n        if(failure&&failure!=='block-expansions')return report(verifiedIncumbent?'candidate':'work-limit',failure);\n      }\n      if(!refused&&proposals.length===groups.size){\n        const candidate=yield* lareStepResult(finalizeState(proposals.reduce(join,zero())));\n        yield {stage:'block-union',accepted:Boolean(candidate)};\n        if(candidate&&(!verifiedIncumbent||compareLareScore(candidate.score,verifiedIncumbent.score)<0||\n          (compareLareScore(candidate.score,verifiedIncumbent.score)===0&&candidate.key<verifiedIncumbent.key)))verifiedIncumbent=candidate;\n      }\n      return report(verifiedIncumbent?'candidate':'search-exhausted');\n    }catch(error){if(!(error instanceof LareBudgetExceeded))throw error;\n      return report(verifiedIncumbent?'candidate':'work-limit',error.resource);}\n  }\n".replaceAll('METHOD', JSON.stringify(variant));
  const solverMarker = '  // Try the first fully compatible arrangement';
  await writeFile(arrangementPath, patchOnce(arrangement, solverMarker, researchSolver + solverMarker));
  const {prepareRoadGroupReflowB1}=await import(pathToFileURL(join(dir,'src/core/neighborhood-reflow.js')).href);
  return prepareRoadGroupReflowB1;
}

// Exact Round 20 witnesses from hosted job 138869413980.
const seeds=[
  {
    "irregularProperties": false,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00123",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00133",
        "PROP-00134",
        "PROP-00137",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00175",
        "PLOT-00176",
        "PLOT-00177",
        "PLOT-00179",
        "PLOT-00182",
        "PLOT-00183",
        "PLOT-00184",
        "PLOT-00185",
        "PLOT-00186",
        "PLOT-00192",
        "PLOT-00193",
        "PLOT-00199",
        "PLOT-00256"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00149",
        "BLD-00150",
        "BLD-00152",
        "BLD-00153",
        "BLD-00156",
        "BLD-00158",
        "BLD-00200"
      ]
    },
    "fingerprint": "efb1706933f704ab8c752e13534c0f7fb6e64e7de340e2b7fb8c8aff785938cf"
  },
  {
    "irregularProperties": false,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00121",
        "PROP-00123",
        "PROP-00126",
        "PROP-00127",
        "PROP-00133",
        "PROP-00134"
      ],
      "plots": [
        "PLOT-00177",
        "PLOT-00179",
        "PLOT-00182",
        "PLOT-00183",
        "PLOT-00184",
        "PLOT-00185",
        "PLOT-00192",
        "PLOT-00193"
      ],
      "buildings": [
        "BLD-00136",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00149",
        "BLD-00150",
        "BLD-00152",
        "BLD-00153",
        "BLD-00156"
      ]
    },
    "fingerprint": "2749fa0838a7c1a4619e600672bf5130f66d6eeb54b16eec7329de2cbbc1005e"
  },
  {
    "irregularProperties": false,
    "scale": -0.5,
    "sets": {
      "properties": [
        "PROP-00167",
        "PROP-00169"
      ],
      "plots": [
        "PLOT-00242",
        "PLOT-00246"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00187",
        "BLD-00188",
        "BLD-00190",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00200"
      ]
    },
    "fingerprint": "0268cbceaf1e6e8d46bd970bd6180b52abda6b46b01af49bc54e523e62da2eef"
  },
  {
    "irregularProperties": false,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00175",
        "PROP-00176"
      ],
      "plots": [
        "PLOT-00235",
        "PLOT-00239",
        "PLOT-00240",
        "PLOT-00241",
        "PLOT-00242",
        "PLOT-00246",
        "PLOT-00254",
        "PLOT-00255"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00186",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00195",
        "BLD-00198",
        "BLD-00199"
      ]
    },
    "fingerprint": "812d86c556ceb1dea7ba09e93bf2a6ceb26ae86770043c66f110304121d83887"
  },
  {
    "irregularProperties": true,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00123",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00133",
        "PROP-00134",
        "PROP-00137",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00197",
        "PLOT-00198",
        "PLOT-00199",
        "PLOT-00201",
        "PLOT-00206",
        "PLOT-00207",
        "PLOT-00208",
        "PLOT-00209",
        "PLOT-00210",
        "PLOT-00216",
        "PLOT-00217",
        "PLOT-00223",
        "PLOT-00292"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00149",
        "BLD-00150",
        "BLD-00152",
        "BLD-00153",
        "BLD-00156",
        "BLD-00158",
        "BLD-00200"
      ]
    },
    "fingerprint": "5382b6223855b67595b3071566a6fe09c7bbdb4e36dc5b74a0d62eed99492d4e"
  },
  {
    "irregularProperties": true,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00121",
        "PROP-00123",
        "PROP-00126",
        "PROP-00127",
        "PROP-00133",
        "PROP-00134"
      ],
      "plots": [
        "PLOT-00199",
        "PLOT-00201",
        "PLOT-00206",
        "PLOT-00207",
        "PLOT-00208",
        "PLOT-00209",
        "PLOT-00216",
        "PLOT-00217"
      ],
      "buildings": [
        "BLD-00136",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00149",
        "BLD-00150",
        "BLD-00152",
        "BLD-00153",
        "BLD-00156"
      ]
    },
    "fingerprint": "264e7f5d8b9166a6f0f74c1834d5d44f8b4267c6ace9f991844540de6be5eb89"
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "sets": {
      "properties": [
        "PROP-00167",
        "PROP-00169"
      ],
      "plots": [
        "PLOT-00272",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00187",
        "BLD-00188",
        "BLD-00190",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00196",
        "BLD-00200"
      ]
    },
    "fingerprint": "dd020cc9f5fec779e76bf69e55623a9c1e2a7c89aa75eda04fbd2615e7395f99"
  },
  {
    "irregularProperties": true,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00175",
        "PROP-00176"
      ],
      "plots": [
        "PLOT-00265",
        "PLOT-00269",
        "PLOT-00270",
        "PLOT-00271",
        "PLOT-00272",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278",
        "PLOT-00288",
        "PLOT-00289",
        "PLOT-00290",
        "PLOT-00291"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00186",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00195",
        "BLD-00198",
        "BLD-00199"
      ]
    },
    "fingerprint": "c8fd2561984e4dfc2ef0460721e52f4d29208e85dc636d4957ee38f7ec6b9178"
  }
];
const restoreGroup=(sets,group,withBuildings)=>({
  properties:sets.properties.filter(id=>id!==group.id),
  plots:sets.plots.filter(id=>!group.plots.includes(id)),
  buildings:withBuildings?sets.buildings.filter(id=>!group.buildings.includes(id)):sets.buildings.slice()
});
const count=sets=>({properties:sets.properties.length,plots:sets.plots.length,buildings:sets.buildings.length});
for(const irregularProperties of [false,true])
test('detached packing-assisted restoration: '+(irregularProperties?'irregular':'regular'),{timeout:900000},async t=>{
  const pack=await createPackingSolver('pack-fit',t);
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={irregularProperties,attempted:0,retained:0,
    improved:0,restoredProperties:0,restoredPlots:0,restoredBuildings:0};
  const byBuilding=new Map(project.city.buildings.map(b=>[b.id,b]));
  for(const seed of seeds.filter(s=>s.irregularProperties===irregularProperties)){
    const {scale}=seed,offset={x:baseOffset.x*scale,y:baseOffset.y*scale};
    const draft=prepareRoadGroupIntentB1(project,roadIds,offset);
    const eligible=inventory(project,draft);
    const parent=new Map([...eligible.values()].flatMap(p=>p.buildings.map(id=>[id,p.id])));
    const attempts=[],seen=new Set();
    const trial=(sets,label,solve=pack)=>{
      sets=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,sorted(v)]));
      const key=JSON.stringify(sets);if(seen.has(key))return null;seen.add(key);
      let reduced;
      try{reduced=reduce(project,sets);}
      catch(error){attempts.push({label,...count(sets),outcome:'reduction-refused',message:error.message});return null;}
      const reducedBefore=hash(reduced);
      const result=solve(reduced,roadIds,offset);
      assert.equal(hash(reduced),reducedBefore);assert.equal(hash(project),before);
      if(!result.candidateProject){
        attempts.push({label,...count(sets),outcome:'reflow-refused',issues:result.unresolved.map(i=>i.code)});
        return null;
      }
      verifyOriginal(project,result.candidateProject,draft,sets);
      attempts.push({label,...count(sets),outcome:'accepted'});
      return {sets,candidate:result.candidateProject,solve};
    };
    let best=trial(seed.sets,'round20-exact',prepareRoadGroupReflowB1);
    assert.ok(best,'Prior witness lost');
    assert.equal(hash(best.candidate),seed.fingerprint,'Exact prior fingerprint changed');
    const original=count(best.sets),rank=ids=>ids.slice().sort((a,b)=>eligible.get(b).footprint-eligible.get(a).footprint||a.localeCompare(b));
    // Each accepted step only restores records. It never removes an
    // additional surviving building or sacrifices an existing witness.
    for(const id of rank(best.sets.properties).slice(0,18)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),true),'whole:'+id);
      if(next)best=next;
    }
    const whole=count(best.sets);
    for(const id of rank(best.sets.properties).slice(0,14)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),false),'empty-shell:'+id);
      if(next)best=next;
    }
    const shell=count(best.sets);
    const buildingOrder=best.sets.buildings.filter(id=>!best.sets.properties.includes(parent.get(id)))
      .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
    for(const id of buildingOrder.slice(0,12)){
      const next=trial({...best.sets,buildings:best.sets.buildings.filter(x=>x!==id)},'child:'+id);
      if(next)best=next;
    }
    const final=count(best.sets);
    for(const k of Object.keys(original))assert.ok(final[k]<=original[k],'Restoration increased destruction');
    for(const k of Object.keys(best.sets))assert.ok(best.sets[k].every(id=>seed.sets[k].includes(id)),'New retirement introduced');
    verifyOriginal(project,best.candidate,draft,best.sets);
    const replay=best.solve(reduce(project,best.sets),roadIds,offset);
    assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
    verifyHistory(project,best.candidate,best.sets);
    for(const key of ['properties','plots','buildings'])if(best.sets[key].length){
      const wrong={...best.sets,[key]:best.sets[key].slice(1)};
      assert.throws(()=>verifyOriginal(project,best.candidate,draft,wrong),'Unreviewed removal accepted: '+key);
    }
    summary.attempted++;summary.retained++;
    const restored={properties:original.properties-final.properties,plots:original.plots-final.plots,buildings:original.buildings-final.buildings};
    if(Object.values(restored).some(n=>n>0))summary.improved++;
    summary.restoredProperties+=restored.properties;summary.restoredPlots+=restored.plots;summary.restoredBuildings+=restored.buildings;
    assert.equal(hash(project),before);
    console.log('PACK_RESTORE_CASE '+JSON.stringify({irregularProperties,scale,original,whole,shell,final,restored,
      removed:best.sets,footprintLoss:best.sets.buildings.reduce((n,id)=>n+byBuilding.get(id).area,0),
      fingerprint:hash(best.candidate),solver:best.solve===pack?'pack-fit':'production',attempts}));
  }
  console.log('PACK_RESTORE_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.retained,4);
});
