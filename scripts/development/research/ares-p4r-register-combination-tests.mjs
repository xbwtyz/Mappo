import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,P4R_COMBINATIONS,probeP4RCombination } from './ares-p4r-research.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const history=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
export const COMBO_CAPS=Object.freeze([64,128,256]);
export function registerCombinationGroup(ids){
  for(const id of ids)test('R4C-A matched combined strategies '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);assert.equal(prior.category,'search-refused');
    for(const kind of P4R_COMBINATIONS){
      let incumbent=null;
      for(const cap of COMBO_CAPS){
        const reference=history.find(r=>r.id===id&&r.cap===cap);assert.ok(reference);
        const r=await probeP4RCombination(id,cap,kind);
        console.log('ARES_P4R_R4CA '+JSON.stringify({id,cap,kind,referenceCategory:reference.category,referenceAttempts:reference.attempts,referenceWork:reference.stats.work,result:r}));
        assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
        assert.equal(r.source,prior.source);assert.equal(r.baselineValid,false);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
        assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);assert.ok(r.attempts<=cap);
        if(r.category==='geometry-recovered'){
          assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);
          assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);assert.ok(r.audit.stats.expansions<=G_MANIFEST.audit.root.stateExpansions);
          const {factor,direction='parallel'}=r.stencil;assert.ok([.0625,.125,.25,.5,1,-.125,-.25,-.5,-1].includes(factor));
          const {x,y}=prior.offset;
          const v={parallel:[x,y],perpendicular:[-y,x],'diagonal-left':[(x-y)*Math.SQRT1_2,(x+y)*Math.SQRT1_2],'diagonal-right':[(x+y)*Math.SQRT1_2,(y-x)*Math.SQRT1_2]}[direction];assert.ok(v);
          for(const n of r.witness.neighbors){
            const dx=n.point.x-n.old.x,dy=n.point.y-n.old.y;
            assert.ok(Math.hypot(dx,dy)<=Math.hypot(x,y)*Math.abs(factor)+1e-8);
            assert.ok(Math.abs(dx*v[1]-dy*v[0])<1e-7);
          }
          incumbent??=r;
        }
        if(kind==='original-directional-fallback'&&reference.category==='geometry-recovered'&&reference.attempts<=64){
          assert.equal(r.category,'geometry-recovered');assert.equal(r.attempts,reference.attempts);assert.deepEqual(r.witness,reference.witness);
        }
        if(incumbent){assert.equal(r.category,'geometry-recovered');assert.equal(r.attempts,incumbent.attempts);assert.deepEqual(r.witness,incumbent.witness);assert.deepEqual(r.stencil,incumbent.stencil);}
      }
    }
  });
}
