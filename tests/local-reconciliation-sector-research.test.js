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
const scales = [1, .75, .5, .25, .125, .025, -.25, -.5, -1];
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
  // Replace the prior wide sampling experiment with jointly constructed sectors.
  let parcelSource = patchOnce(original, 'compactDeformation=false},budget)', 'compactDeformation=false,cooperativeSector=null},budget)');
  parcelSource = patchOnce(parcelSource, '    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}',
    '    if(family.startsWith("sector-") && cooperativeSector) { budget.spend(Math.max(1,n*12)); if(!shapeContained(boundary,[cooperativeSector.a,cooperativeSector.b,cooperativeSector.center]))return; }\n    try{verifyLarePlotDeformation(boundary,plots,nextPlots,budget,adjacency);}');
  const construction = "    if (cooperativeSector && mode==='adaptive' && !fixedRings.length) {\n      attemptLimit=attempts+54;\n      const sa=projected(cooperativeSector.a),sb=projected(cooperativeSector.b),sc=projected(cooperativeSector.center);\n      const span=sb.u-sa.u,depth=sc.v-sa.v;\n      if(span>=minimumWidth-lareParcelEps&&depth>2){\n        const lerp=(a,b,f)=>a+(b-a)*f;\n        for(const portion of [.65,.82,1]){\n          const w=Math.max(minimumWidth,span*portion);\n          if(w>span+lareParcelEps)continue;\n          const l=sa.u+(span-w)/2,r=l+w;\n          for(const ratio of [.25,.45,.65,.82]){\n            const rear=sa.v+depth*ratio;\n            const rearL=lerp(l,sc.u,ratio),rearR=lerp(r,sc.u,ratio);\n            // Parallel-sided affine proposals work for arbitrary existing cells.\n            const innerL=Math.max(l,rearL),innerR=Math.min(r,rearR);\n            if(innerR-innerL>=minimumWidth-lareParcelEps)\n              yield* affine('sector-affine-'+portion,innerL,innerR,sa.v,rear);\n            // A verified strip can be tapered without changing plot identities,\n            // vertex count or shared-edge adjacency.\n            if(METHOD==='sector-taper'&&strip!==null&&rearR-rearL>1){\n              const boundary=[world(l,sa.v),world(r,sa.v),world(rearR,rear),world(rearL,rear)];\n              const preview=propertyGeometryPreview3I({properties:[property],plots},property.id,boundary,strip);\n              const next=plots.map((p,i)=>({...p,boundary:preview.plots[i].boundary}));\n              yield* tryCandidate('sector-taper-'+portion,boundary,next);\n            }\n          }\n        }\n      }\n    }\n".replaceAll('METHOD', JSON.stringify(variant));
  const marker = '  }\n  return found.sort(lareParcelCmp);';
  await writeFile(path, patchOnce(parcelSource, marker, construction + marker));
  const arrangementPath = join(dir, 'src/core/reconciliation-arrangement.js');
  let arrangement = await readFile(arrangementPath, 'utf8');
  arrangement = "import { STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';\n" + arrangement;
  const sectorHelper = "// Research-only conservative inset kernel and jointly allocated frontage slots.\n// All geometry emitted below still passes the original candidate validators.\nfunction cooperativeSectors(entries,budget){\n  const blocks=new Map(),result=new Map();\n  for(const e of entries){\n    if(!blocks.has(e.property.blockId))blocks.set(e.property.blockId,[]);\n    blocks.get(e.property.blockId).push(e);\n  }\n  const dot=(p,q)=>p.x*q.x+p.y*q.y;\n  for(const group of blocks.values()){\n    const edges=group[0].edges;\n    if(edges.length<3)continue;\n    const planes=[];\n    for(const edge of edges){\n      budget.spend();\n      const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,length=Math.hypot(dx,dy);\n      const width=STREET_WIDTHS[edge.road?.kind];\n      if(length<=1e-6||!Number.isFinite(width)){planes.length=0;break;}\n      const t={x:dx/length,y:dy/length},n={x:-t.y,y:t.x};\n      const margin=(width+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.05;\n      planes.push({edge,length,t,n,margin,c:dot(edge.a,n)+margin});\n    }\n    if(planes.length!==edges.length)continue;\n    const xs=edges.map(e=>e.a.x),ys=edges.map(e=>e.a.y);\n    const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);\n    let kernel=[{x:loX,y:loY},{x:hiX,y:loY},{x:hiX,y:hiY},{x:loX,y:hiY}];\n    for(const p of planes){\n      const next=[];\n      for(let i=0;i<kernel.length;i++){\n        budget.spend();\n        const a=kernel[i],b=kernel[(i+1)%kernel.length],da=dot(a,p.n)-p.c,db=dot(b,p.n)-p.c;\n        if(da>=-1e-8)next.push(a);\n        if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){\n          const f=da/(da-db);\n          next.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});\n        }\n      }\n      kernel=next;\n      if(kernel.length<3)break;\n    }\n    if(kernel.length<3)continue;\n    const center={x:kernel.reduce((a,p)=>a+p.x,0)/kernel.length,y:kernel.reduce((a,p)=>a+p.y,0)/kernel.length};\n    for(const p of planes){\n      const base={x:p.edge.a.x+p.n.x*p.margin,y:p.edge.a.y+p.n.y*p.margin};\n      let left=0,right=p.length,valid=true;\n      for(const q of planes){\n        budget.spend();\n        const slope=dot(p.t,q.n),intercept=dot(base,q.n)-q.c;\n        if(Math.abs(slope)<1e-9){if(intercept< -1e-7){valid=false;break;}}\n        else if(slope>0)left=Math.max(left,-intercept/slope);\n        else right=Math.min(right,-intercept/slope);\n      }\n      if(!valid||right-left<=.1||dot(center,p.n)-p.c<=2)continue;\n      const members=group.filter(e=>e.property.frontageRoadId===p.edge.road.id).map(e=>{\n        const [a,b]=e.property.boundary;\n        const w=Math.hypot(b.x-a.x,b.y-a.y);\n        const f=e.property.frame;\n        const u=f?dot({x:a.x-f.origin.x,y:a.y-f.origin.y},f.tangent):dot(a,p.t);\n        return {e,w,u,min:Math.min(7,w)};\n      }).sort((a,b)=>a.u-b.u||lareArrangeCompare(a.e.property.id,b.e.property.id));\n      if(!members.length)continue;\n      // Allocate a single frontage interval per original property in order.\n      // Fixed or protected entries reserve their slot but are never deformed.\n      const gap=.06,available=right-left-gap*(members.length+1);\n      const minimum=members.reduce((a,m)=>a+m.min,0);\n      const weights=members.reduce((a,m)=>a+Math.max(1e-6,m.w-m.min),0);\n      if(available<minimum)continue;\n      let cursor=left+gap;\n      for(const m of members){\n        budget.spend();\n        const span=m.min+(available-minimum)*Math.max(1e-6,m.w-m.min)/weights;\n        const a={x:base.x+p.t.x*cursor,y:base.y+p.t.y*cursor};\n        const b={x:base.x+p.t.x*(cursor+span),y:base.y+p.t.y*(cursor+span)};\n        result.set(m.e.property.id,{a,b,center});\n        cursor+=span+gap;\n      }\n    }\n  }\n  return result;\n}\n";
  arrangement = patchOnce(arrangement, '// Pure joint solver over actual parcel/plot and rigid building alternatives.', sectorHelper + '// Pure joint solver over actual parcel/plot and rigid building alternatives.');
  arrangement = patchOnce(arrangement, '    for(const entry of entries.slice().sort', '    const sectors=enhanced&&entries.some(e=>e.buildings.some(b=>b.permission.mode==="rigid"))?cooperativeSectors(entries,budget):new Map();\n    for(const entry of entries.slice().sort');
  arrangement = patchOnce(arrangement, 'compactDeformation: enhanced }, budget)', 'compactDeformation: enhanced, cooperativeSector: sectors.get(entry.property.id) }, budget)');
  const researchSolver = "  // Detached property bundles. Cache one complete local building proposal\n  // per parcel geometry; no locally successful bundle is an accepted edit.\n  if (enhanced && entries.some(e => e.buildings.some(b => b.permission.mode === 'rigid'))) {\n    const groups=new Map(), cache=new Map(), proposals=[];\n    for(const id of variables){\n      if(!id.startsWith('property:'))continue;\n      const block=byVariable.get(id).entry.property.blockId;\n      if(!groups.has(block))groups.set(block,[]);\n      groups.get(block).push(id);\n    }\n    const report=(status,exhausted=null)=>({status,best:verifiedIncumbent,stage:0,\n      complete:verifiedIncumbent?1:0,stats:budget.snapshot(),exhausted});\n    const zero=()=>({assignments:[],score:[0,0,0,0,0,0],key:''});\n    const add=(row,id,choice)=>({assignments:[...row.assignments,{variable:id,choice}],\n      score:row.score.map((v,i)=>v+choice.score[i]),key:row.key+JSON.stringify([id,choice.key])+';'});\n    const join=(a,b)=>({assignments:[...a.assignments,...b.assignments],score:a.score.map((v,i)=>v+b.score[i]),key:a.key+b.key});\n    let refused=false;\n    try{\n      for(const [block,ids] of groups){\n        let used=0,deepest=0,blocked=null,bundles=0,cacheHits=0,bundleFailures=0,bundleLimits=0,pruned=0,pairTests=0,pairHits=0,arcPasses=0;\n        const expand=()=>{if(used>=2048)throw new LareBudgetExceeded('block-expansions');budget.expand();used++;};\n        const bundle=function*(id,choice){\n          if(cache.has(choice.value)){budget.spend();cacheHits++;return cache.get(choice.value);}\n          bundles++;\n          const entry=byVariable.get(id).entry, root=add(zero(),id,choice);\n          const domains=[];\n          for(const building of entry.buildings){\n            const bid='building:'+building.source.id;\n            const options=yield* choices(bid,root);\n            if(!options.length){cache.set(choice.value,null);bundleFailures++;return null;}\n            domains.push({id:bid,options});\n          }\n          domains.sort((a,b)=>a.options.length-b.options.length||lareArrangeCompare(a.id,b.id));\n          let localUsed=0,limited=false;\n          function* fill(depth,row){\n            if(depth===domains.length)return row;\n            const d=domains[depth];\n            for(const option of d.options){\n              if(localUsed>=256){limited=true;return null;}\n              expand();localUsed++;\n              if(!(yield* compatible(d.id,option,row)))continue;\n              yield {stage:'bundle-building',id:d.id,stats:budget.snapshot()};\n              const next=yield* fill(depth+1,add(row,d.id,option));\n              if(next)return next;\n              if(limited)return null;\n            }\n            return null;\n          }\n          const result=yield* fill(0,root);\n          if(limited)bundleLimits++;\n          else if(!result)bundleFailures++;\n          // A bounded-out bundle is not an impossibility proof.\n          // Record it as unavailable within this experiment's fixed cap.\n          cache.set(choice.value,result);\n          return result;\n        };\n        // Pair compatibility is immutable for this arrangement. Charge cache\n        // reads too; exact geometry remains the original overlap predicate.\n        const pairCache=new Map();\n        const pairOK=(a,b)=>{\n          budget.spend();\n          if(pairCache.get(a.value)?.has(b.value)){pairHits++;return pairCache.get(a.value).get(b.value);}\n          pairTests++;\n          const ok=!lareArrangeOverlap(a.value.property.boundary,b.value.property.boundary,budget);\n          if(!pairCache.has(a.value))pairCache.set(a.value,new Map());\n          if(!pairCache.has(b.value))pairCache.set(b.value,new Map());\n          pairCache.get(a.value).set(b.value,ok);pairCache.get(b.value).set(a.value,ok);\n          return ok;\n        };\n        const available=option=>!cache.has(option.value)||Boolean(cache.get(option.value));\n        function* propagate(domains){\n          if(METHOD!=='domain-arc')return true;\n          let changed=true;\n          while(changed){\n            changed=false;arcPasses++;\n            for(const [id,options] of domains){\n              for(const [other,support] of domains){\n                if(other===id)continue;\n                const current=domains.get(id);\n                const kept=current.filter(a=>available(a)&&support.some(b=>available(b)&&pairOK(a,b)));\n                pruned+=current.length-kept.length;\n                if(kept.length!==current.length){changed=true;domains.set(id,kept);}\n                yield {stage:'domain-arc',id,other,stats:budget.snapshot()};\n                if(!kept.length){blocked=id;return false;}\n              }\n            }\n          }\n          return true;\n        }\n        function* visit(row,domains){\n          const depth=ids.length-domains.size;\n          if(depth>deepest){deepest=depth;blocked=null;}\n          if(!domains.size)return row;\n          // Do not retry known failed/capped local bundles in this run.\n          for(const [id,options] of domains){\n            const kept=options.filter(available);\n            pruned+=options.length-kept.length;domains.set(id,kept);\n            if(!kept.length){blocked=id;return null;}\n          }\n          if(!(yield* propagate(domains)))return null;\n          const [id,options]=[...domains].sort((a,b)=>a[1].length-b[1].length||\n            lareArrangeCompare(a[0],b[0]))[0];\n          for(const option of options){\n            expand();\n            if(!available(option))continue;\n            const next=new Map();\n            let viable=true;\n            for(const [other,domain] of domains){\n              if(other===id)continue;\n              const kept=domain.filter(b=>available(b)&&pairOK(option,b));\n              pruned+=domain.length-kept.length;\n              yield {stage:'domain-forward',id,other,stats:budget.snapshot()};\n              if(!kept.length){blocked=other;viable=false;break;}\n              next.set(other,kept);\n            }\n            if(!viable)continue;\n            const local=yield* bundle(id,option);\n            if(!local)continue;\n            yield {stage:'bundle-property',id,depth,stats:budget.snapshot()};\n            const result=yield* visit(join(row,local),next);\n            if(result)return result;\n          }\n          if(depth>=deepest)blocked=id;\n          return null;\n        }\n        let local=null,failure=null;\n        try{const domains=new Map();for(const id of ids)domains.set(id,yield* choices(id,zero()));\n          local=yield* visit(zero(),domains);}\n        catch(error){if(!(error instanceof LareBudgetExceeded))throw error;failure=error.resource;}\n        yield {stage:'block-result',block,method:METHOD,status:local?'proposal':failure?'limited':'exhausted',\n          depth:deepest,total:ids.length,blocked,expansions:used,exhausted:failure,bundles,cacheHits,bundleFailures,bundleLimits,pruned,pairTests,pairHits,arcPasses};\n        if(local)proposals.push(local);else refused=true;\n        if(failure&&failure!=='block-expansions')return report(verifiedIncumbent?'candidate':'work-limit',failure);\n      }\n      if(!refused&&proposals.length===groups.size){\n        const candidate=yield* lareStepResult(finalizeState(proposals.reduce(join,zero())));\n        yield {stage:'block-union',accepted:Boolean(candidate)};\n        if(candidate&&(!verifiedIncumbent||compareLareScore(candidate.score,verifiedIncumbent.score)<0||\n          (compareLareScore(candidate.score,verifiedIncumbent.score)===0&&candidate.key<verifiedIncumbent.key)))verifiedIncumbent=candidate;\n      }\n      return report(verifiedIncumbent?'candidate':'search-exhausted');\n    }catch(error){if(!(error instanceof LareBudgetExceeded))throw error;\n      return report(verifiedIncumbent?'candidate':'work-limit',error.resource);}\n  }\n".replaceAll('METHOD', JSON.stringify(variant));
  const solverMarker = '  // Try the first fully compatible arrangement';
  await writeFile(arrangementPath, patchOnce(arrangement, solverMarker, researchSolver + solverMarker));
  const load = name => import(pathToFileURL(join(dir, 'src', name)).href);
  const [{ createProject }, { iterateRoadGroupReflowB1 }, { validateStoredProject },
    { prepareRoadGroupIntentB1 }, { verifyLareGroupPreservation }, { createLareBudget }] =
    await Promise.all(['core/city-model.js','core/neighborhood-reflow.js','data/project-validation.js',
      'core/road-intent-c1.js','core/reconciliation-preservation.js','core/reconciliation-budget.js'].map(load));

  const summary = { variant, attempted: 0, accepted: 0, recovered: 0, regressed: 0, invalid: 0 };
  for (const irregularProperties of [false, true]) {
    const project = createProject({ seed: 'mappo-001', size: 'medium', morphology: 'organic',
      shapeOptions: { profile: 'balanced', stretch: 30, asymmetry: 58, bend: 44 }, irregularProperties });
    validateStoredProject(project);
    const before = hash(project);
    for (const scale of scales) {
      const offset = { x: baseOffset.x * scale, y: baseOffset.y * scale };
      const replay = () => {
        const iterator = iterateRoadGroupReflowB1(project, roadIds, offset);
        const stages = {}, blocks = [], unions = [];
        let step;
        while (!(step = iterator.next()).done) {
          const stage = step.value?.stage ?? 'other';
          if (stage === 'block-result') blocks.push(step.value);
          if (stage === 'block-union') unions.push(step.value.accepted);
          stages[stage] = (stages[stage] ?? 0) + 1;
        }
        const result = step.value;
        assert.equal(hash(project), before, 'Accepted city mutated');
        if (result.candidateProject) {
          try {
            validateStoredProject(result.candidateProject);
            assert.deepEqual(result.candidateProject.city.buildings.map(b => b.id), project.city.buildings.map(b => b.id));
            const draft = prepareRoadGroupIntentB1(project, roadIds, offset);
            assert.equal(verifyLareGroupPreservation(project, result.candidateProject, draft, new Map(), createLareBudget()), null);
          } catch (error) {
            summary.invalid++;
            throw error;
          }
        }
        return { accepted: Boolean(result.candidateProject), validation: result.validation,
          issues: (result.unresolved ?? []).map(i => i.code),
          stats: result.lare?.operationStats ?? null, stages, blocks, unions,
          candidateFingerprint: result.candidateProject ? hash(result.candidateProject) : null };
      };
      const result = replay();
      if (result.accepted) assert.deepEqual(replay(), result, 'Recovered witness was not deterministic');
      summary.attempted++;
      if (result.accepted) summary.accepted++;
      if (result.accepted && scale !== .025) summary.recovered++;
      if (!result.accepted && scale === .025) summary.regressed++;
      console.log('SECTOR_VARIANT_CASE ' + JSON.stringify({ variant, irregularProperties, scale,
        accepted: result.accepted, validation: result.validation, issues: result.issues, stats: result.stats,
        parcelAttempts: result.stages['parcel-candidate'] ?? 0, buildingAttempts: result.stages['building-placement'] ?? 0,
        fingerprint: result.candidateFingerprint, blocks: result.blocks, unions: result.unions }));
    }
  }
  console.log('SECTOR_VARIANT_SUMMARY ' + JSON.stringify(summary));
  assert.equal(summary.regressed, 0, 'Known baseline successes lost');
  assert.equal(summary.invalid, 0);
}
for (const variant of ['sector-affine', 'sector-taper'])
  test('detached compression experiment: ' + variant, { timeout: 300000 }, t => experiment(variant, t));
