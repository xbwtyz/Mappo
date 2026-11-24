// Detached experiment only: production src and compiled files are never changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const roadIds = ['RD-0184', 'RD-0186'];
const baseOffset = { x: -3.005274072121821, y: -37.39896113564458 };
const scales = [1, .75, -.5, -1];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function patchOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, 'Research patch must match exactly once');
  return source.replace(marker, replacement);
}

async function experiment(variant, t) {
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
  // All experimental writes stay inside the temporary module copy.
  const groupPath=join(dir,'src/core/reconciliation-road-group.js');
  let group=await readFile(groupPath,'utf8');
  const transferCode=String.raw`
    // Reassign only eligible active generated entries in the same block.
    // Capacity is an estimate for candidate ordering, never a feasibility test.
    const redistributed=entries.map(e=>({...e,property:{...e.property,buildingIds:e.property.buildingIds.slice()},buildings:e.buildings.slice()}));
    const oldNodes=riIndex(city.nodes);
    const groups=new Map(),transfers=[],movedIds=new Set(),inventory=[];
    for(const e of redistributed){
      if(e.mode!=='adaptive'||e.buildings.some(b=>b.permission.mode!=='rigid')||!e.edge)continue;
      if(!groups.has(e.property.blockId))groups.set(e.property.blockId,[]);
      groups.get(e.property.blockId).push(e);
    }
    const capacity=e=>{
      const a=oldNodes.get(e.edge.road.a),b=oldNodes.get(e.edge.road.b);
      const oldLen=Math.hypot(a.x-b.x,a.y-b.y);
      const newLen=Math.hypot(e.edge.a.x-e.edge.b.x,e.edge.a.y-e.edge.b.y);
      return Math.max(1,e.property.area*Math.min(1.5,newLen/Math.max(1,oldLen)));
    };
    const load=e=>e.buildings.reduce((n,b)=>n+b.source.area,0);
    const score=(a,b,area)=>{
      const ca=capacity(a),cb=capacity(b),la=load(a),lb=load(b);
      return (la/ca)**2+(lb/cb)**2-((la-area)/ca)**2-((lb+area)/cb)**2;
    };
    if(enhanced)for(const [block,list] of groups){
      const compressed=list.some(e=>{
        const a=oldNodes.get(e.edge.road.a),b=oldNodes.get(e.edge.road.b);
        return Math.hypot(e.edge.a.x-e.edge.b.x,e.edge.a.y-e.edge.b.y)<Math.hypot(a.x-b.x,a.y-b.y)-1e-6;
      });
      const stats={block,compressed,eligible:list.length,donors:list.filter(e=>e.buildings.length>=MIN_DONOR).length,
        scored:0,finiteScores:0,bestScore:null,selected:0};
      inventory.push(stats);
      if(!compressed||list.length<2)continue;
      for(let count=0;count<TRANSFER_CAP;count++){
        let best=null;
        for(const donor of list){
          if(donor.buildings.length<MIN_DONOR)continue;
          for(const receiver of list){
            if(receiver===donor)continue;
            for(const member of donor.buildings){
              budget.spend();
              if(movedIds.has(member.source.id))continue;
              const improvement=score(donor,receiver,member.source.area);
              stats.scored++;
              if(!Number.isFinite(improvement))continue;
              stats.finiteScores++;
              if(stats.bestScore===null||improvement>stats.bestScore)stats.bestScore=improvement;
              if(!best||improvement>best.improvement)best={donor,receiver,member,improvement};
            }
          }
        }
        if(!best)break;
        const {donor,receiver,member}=best,id=member.source.id;
        donor.buildings=donor.buildings.filter(b=>b.source.id!==id);
        donor.property.buildingIds=donor.property.buildingIds.filter(x=>x!==id);
        receiver.buildings.push({...member,source:{...member.source,propertyId:receiver.property.id,
          frontageRoadId:receiver.property.frontageRoadId}});
        receiver.property.buildingIds.push(id);
        movedIds.add(id);
        stats.selected++;
        transfers.push({id,block,from:donor.property.id,to:receiver.property.id,score:best.improvement});
      }
    }
    yield {stage:'ownership-proposal',transfers,inventory};
`;
  group=patchOnce(group,'    const permissions=new Map(context.properties.flatMap(p=>p.buildings.map(b=>[b.id,b])));',
    transferCode.replaceAll('TRANSFER_CAP',variant==='ranked-3'?'3':'1').replaceAll('MIN_DONOR',variant==='ranked-nonempty'?'2':'1')+'    const permissions=new Map(context.properties.flatMap(p=>p.buildings.map(b=>[b.id,b])));');
  // Preserve fixed pass and selective behavior, only redistribute enhanced rigid pass.
  group=patchOnce(group,'outcome=yield* iterateLareArrangement({entries,finalize,incumbent,enhanced},budget);',
    'outcome=yield* iterateLareArrangement({entries:enhanced?redistributed:entries,finalize,incumbent,enhanced},budget);');
  await writeFile(groupPath,group);
  const identityPath=join(dir,'src/core/road-group-preservation-b1.js');
  let identity=await readFile(identityPath,'utf8');
  identity=patchOnce(identity,"        if (!generated) allowed = allowed.filter(field => field !== 'roadProvenance');",
    "        if (!generated) allowed = allowed.filter(field => field !== 'roadProvenance');\n        else allowed=[...allowed,'buildingIds'];");
  identity=patchOnce(identity,"      if(!b1SameProtectedFields(a, b, allowed))",
    "      if(key==='buildings'&&classifyRoadProvenance(a)==='generated')allowed=[...allowed,'propertyId','frontageRoadId'];\n      if(!b1SameProtectedFields(a, b, allowed))");
  await writeFile(identityPath,identity);
  const gatePath=join(dir,'src/core/reconciliation-preservation.js');
  let gate=await readFile(gatePath,'utf8');
  const guard=String.raw`
    // Independently establish all transfers from original and proposed records.
    // No trust in reassignment metadata or the search's claimed authorization.
    const byProperty=new Map(context.properties.map(p=>[p.id,p]));
    const eligible=id=>{
      const e=byProperty.get(id);
      return e?.policy.mode==='adaptive'&&e.policy.provenance==='generated'&&e.buildings.every(b=>b.mode==='rigid');
    };
    const actualMembers=new Map(),transferred=new Set();
    for(const original of old.buildings){
      const candidate=bBuildings.get(original.id);
      budget.spend();
      if(!candidate||removedIds.has(original.id))continue;
      if(!actualMembers.has(candidate.propertyId))actualMembers.set(candidate.propertyId,[]);
      actualMembers.get(candidate.propertyId).push(candidate.id);
      const moved=original.propertyId!==candidate.propertyId;
      if(!moved&&original.frontageRoadId!==candidate.frontageRoadId)
        return lareGateFail('building',original.id,'lare-transfer-frontage','Frontage change requires a transfer.');
      if(moved){
        const from=aProps.get(original.propertyId),to=aProps.get(candidate.propertyId);
        const source=byProperty.get(original.propertyId)?.buildings.find(b=>b.id===original.id);
        if(!from||!to||from.blockId!==to.blockId||candidate.blockId!==original.blockId||
          !eligible(from.id)||!eligible(to.id)||source?.mode!=='rigid'||source.provenance!=='generated'||
          candidate.frontageRoadId!==to.frontageRoadId)
          return lareGateFail('building',original.id,'lare-transfer-policy','Unauthorized ownership transfer.');
        transferred.add(original.id);
      }
    }
    for(const entry of context.properties){
      const a=aProps.get(entry.id),b=bProps.get(entry.id);
      const expected=(actualMembers.get(entry.id)??[]).slice().sort();
      if(!riEqual(expected,b.buildingIds.slice().sort()))
        return lareGateFail('property',entry.id,'lare-transfer-membership','Building membership is inconsistent.');
      if(!riEqual(a.buildingIds,b.buildingIds)&&!eligible(entry.id))
        return lareGateFail('property',entry.id,'lare-transfer-policy','Protected property membership changed.');
    }
`;
  gate=patchOnce(gate,'    const prior=old.roadParcelDecisionHistory028??[],archive=next.roadParcelDecisionHistory028??[];',
    guard+'    const prior=old.roadParcelDecisionHistory028??[],archive=next.roadParcelDecisionHistory028??[];');
  gate=patchOnce(gate,"const lareGateParcelFields=['boundary','frontage','frame','local','area','roadProvenance'];",
    "const lareGateParcelFields=['boundary','frontage','frame','local','area','roadProvenance','buildingIds'];");
  gate=patchOnce(gate,'LARE_CONSTRAINTS.rigidBuilding.check(original,candidate,budget)',
    'LARE_CONSTRAINTS.rigidBuilding.check(original,transferred.has(original.id)?{...candidate,propertyId:original.propertyId,frontageRoadId:original.frontageRoadId}:candidate,budget)');
  // Provenance can legitimately change when a building keeps its world
  // geometry but transfers its property/plot association.
  gate=patchOnce(gate,'(moved||routeChanged||occupancyChanged)',
    '(moved||routeChanged||occupancyChanged||transferred.has(original.id))');
  await writeFile(gatePath,gate);
  const accessPath=join(dir,'src/core/reconciliation-access.js');
  let access=await readFile(accessPath,'utf8');
  access=patchOnce(access,"  if(placement.id!==original.id||placement.propertyId!==original.propertyId||\n    placement.frontageRoadId!==original.frontageRoadId)throw Error('Building ownership or frontage changed.');",
    "  const transfer=placement.propertyId!==original.propertyId;\n  const parent=city.properties.find(p=>p.id===placement.propertyId);\n  if(placement.id!==original.id||(!transfer&&placement.frontageRoadId!==original.frontageRoadId)||(transfer&&(permission?.mode!=='rigid'||classifyRoadProvenance(original)!=='generated'||parent?.blockId!==original.blockId||parent?.frontageRoadId!==placement.frontageRoadId)))throw Error('Unauthorized ownership or frontage change.');");
  access=patchOnce(access,'if(frontageRoadId!==original.frontageRoadId)','if(frontageRoadId!==placement.frontageRoadId)');
  await writeFile(accessPath,access);
  const load = name => import(pathToFileURL(join(dir, 'src', name)).href);
  const [{ createProject }, { iterateRoadGroupReflowB1 }, { validateStoredProject },
    { prepareRoadGroupIntentB1 }, { verifyLareGroupPreservation }, { createLareBudget }] =
    await Promise.all(['core/city-model.js','core/neighborhood-reflow.js','data/project-validation.js',
      'core/road-intent-c1.js','core/reconciliation-preservation.js','core/reconciliation-budget.js'].map(load));

  const {verifyLareGroupPreservation:strictVerify}=await import(new URL('../src/core/reconciliation-preservation.js',import.meta.url));
  const {createLareBudget:strictBudget}=await import(new URL('../src/core/reconciliation-budget.js',import.meta.url));
  const summary={variant,attempted:0,accepted:0,invalid:0,priorRetained:0,priorLost:0,newRecoveries:0,transferWitnesses:0,proposedTransfers:0,scoredPairs:0,finiteScores:0};
  for (const irregularProperties of [false, true]) {
    const project = createProject({ seed: 'mappo-001', size: 'medium', morphology: 'organic',
      shapeOptions: { profile: 'balanced', stretch: 30, asymmetry: 58, bend: 44 }, irregularProperties });
    validateStoredProject(project);
    const before = hash(project);
    for (const scale of scales) {
      const offset = { x: baseOffset.x * scale, y: baseOffset.y * scale };
      const replay = () => {
        const iterator = iterateRoadGroupReflowB1(project, roadIds, offset);
        const stages = {}, blocks = [], unions = [], proposals=[],inventory=[];
        let step;
        while (!(step = iterator.next()).done) {
          const stage = step.value?.stage ?? 'other';
          if (stage === 'block-result') blocks.push(step.value);
          if (stage === 'block-union') unions.push(step.value.accepted);
          if (stage === 'ownership-proposal') {proposals.push(step.value.transfers);inventory.push(...step.value.inventory);}
          stages[stage] = (stages[stage] ?? 0) + 1;
        }
        const result = step.value;
        assert.equal(hash(project), before, 'Accepted city mutated');
        let transfers=[],strictIssue=null;
        if (result.candidateProject) {
          try {
            validateStoredProject(result.candidateProject);
            assert.deepEqual(result.candidateProject.city.buildings.map(b => b.id), project.city.buildings.map(b => b.id));
            const draft = prepareRoadGroupIntentB1(project, roadIds, offset);
            assert.equal(verifyLareGroupPreservation(project, result.candidateProject, draft, new Map(), createLareBudget()), null);
            const old=new Map(project.city.buildings.map(b=>[b.id,b]));
            transfers=result.candidateProject.city.buildings.filter(b=>b.propertyId!==old.get(b.id).propertyId)
              .map(b=>({id:b.id,from:old.get(b.id).propertyId,to:b.propertyId}));
            strictIssue=strictVerify(project,result.candidateProject,draft,new Map(),strictBudget())?.code??null;
            assert.equal(strictIssue,transfers.length?'group-record-change':null);
            if(transfers.length){
              const tampered=JSON.parse(JSON.stringify(result.candidateProject));
              tampered.city.buildings.find(b=>b.id===transfers[0].id).propertyId='PROP-NONEXISTENT';
              assert.ok(verifyLareGroupPreservation(project,tampered,draft,new Map(),createLareBudget()),'Invalid parent accepted');
            }
          } catch (error) {
            summary.invalid++;
            throw error;
          }
        }
        return { accepted: Boolean(result.candidateProject), validation: result.validation,
          issues: (result.unresolved ?? []).map(i => i.code),
          stats: result.lare?.operationStats ?? null, stages, blocks, unions, proposals, inventory, transfers, strictIssue,
          candidateFingerprint: result.candidateProject ? hash(result.candidateProject) : null };
      };
      const result = replay();
      if (result.accepted) assert.deepEqual(replay(), result, 'Recovered witness was not deterministic');
      summary.attempted++;
      if (result.accepted) summary.accepted++;
      const known=[.025,.125,.25,.5,-.25].includes(scale);
      if(known&&result.accepted)summary.priorRetained++;
      if(known&&!result.accepted)summary.priorLost++;
      if(!known&&result.accepted)summary.newRecoveries++;
      if(result.transfers.length)summary.transferWitnesses++;
      summary.proposedTransfers+=result.proposals.reduce((n,p)=>n+p.length,0);
      summary.scoredPairs+=result.inventory.reduce((n,p)=>n+p.scored,0);
      summary.finiteScores+=result.inventory.reduce((n,p)=>n+p.finiteScores,0);
      if(!result.accepted&&scale===.025)assert.fail('Known baseline success lost');
      console.log('FLEX_RANKED_TRANSFER_CASE ' + JSON.stringify({ variant, irregularProperties, scale,
        accepted: result.accepted, validation: result.validation, issues: result.issues, stats: result.stats,
        parcelAttempts: result.stages['parcel-candidate'] ?? 0, buildingAttempts: result.stages['building-placement'] ?? 0,
        fingerprint: result.candidateFingerprint, blocks: result.blocks, unions: result.unions,proposals:result.proposals,inventory:result.inventory,transfers:result.transfers,strictIssue:result.strictIssue }));
    }
  }
  console.log('FLEX_RANKED_TRANSFER_SUMMARY ' + JSON.stringify(summary));

  assert.equal(summary.invalid, 0);
  if(variant!=='ranked-nonempty')assert.ok(summary.proposedTransfers>0,'No transfers proposed: experiment inactive');
}
for (const variant of ['ranked-nonempty','ranked-empty','ranked-3'])
  test('detached compression experiment: ' + variant, { timeout: 300000 }, t => experiment(variant, t));
