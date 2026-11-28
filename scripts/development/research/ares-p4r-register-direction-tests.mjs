import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,probeP4RCap,probeP4RDirectional } from './ares-p4r-research.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
const history=JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/p4r-r3a-46068804189.json',import.meta.url),'utf8')).rows;
const strip=({elapsedMs,auditMs,...r})=>r;
function check(r,cap,prior){
  assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
  assert.equal(r.source,prior.source);assert.equal(r.baselineValid,false);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
  assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);assert.ok(r.attempts<=cap);
  if(r.category==='geometry-recovered'){
    assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);
  }
}
export function registerDirectionalPilot(ids){
  for(const id of ids)test('R3B matched displacement directions '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);assert.equal(prior.category,'search-refused');
    let incumbent=null;
    for(const cap of [64,256]){
      const reference=await probeP4RCap(id,cap),directional=await probeP4RDirectional(id,cap);
      console.log('ARES_P4R_R3B '+JSON.stringify({id,cap,reference,directional}));
      check(reference,cap,prior);check(directional,cap,prior);
      assert.deepEqual(strip(reference),strip(history.find(r=>r.id===id&&r.cap===cap).reference));
      if(directional.category==='geometry-recovered'){
        const {factor,taper,direction}=directional.stencil;
        assert.ok([.0625,.125,.25,.5,1,-.125,-.25,-.5,-1].includes(factor));assert.equal(typeof taper,'boolean');
        const {x,y}=prior.offset;
        const vectors={parallel:[x,y],perpendicular:[-y,x],'diagonal-left':[(x-y)*Math.SQRT1_2,(x+y)*Math.SQRT1_2],'diagonal-right':[(x+y)*Math.SQRT1_2,(y-x)*Math.SQRT1_2]};
        const v=vectors[direction];assert.ok(v);
        for(const n of directional.witness.neighbors){
          const dx=n.point.x-n.old.x,dy=n.point.y-n.old.y;
          assert.ok(Math.hypot(dx,dy)<=Math.hypot(x,y)*Math.abs(factor)+1e-8);
          assert.ok(Math.abs(dx*v[1]-dy*v[0])<1e-7);
          assert.ok((dx*v[0]+dy*v[1])*factor>0);
        }
        incumbent??=directional;
      }
      if(incumbent){assert.equal(directional.category,'geometry-recovered');assert.equal(directional.attempts,incumbent.attempts);assert.deepEqual(directional.witness,incumbent.witness);assert.deepEqual(directional.stencil,incumbent.stencil);}
    }
  });
}
