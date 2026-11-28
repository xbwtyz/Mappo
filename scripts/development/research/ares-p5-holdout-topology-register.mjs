import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {runHoldoutTopology} from './ares-p5-holdout-topology-run.mjs';
const bounded=s=>{assert.ok(s.work<=8000000&&s.expansions<=32768);};
export function registerHoldoutTopology(morphology,part){
  const rows=HOLDOUT_MANIFEST.rows.filter(r=>r.options.morphology===morphology).slice(part*5,part*5+5);
  assert.equal(rows.length,5);
  for(const recipe of rows)test('Holdout topology '+recipe.id,async()=>{
    const id='h:'+recipe.id,lock=holdoutLockedRow(id),r=await runHoldoutTopology(id);
    console.log('ARES_HOLDOUT_TOPOLOGY '+JSON.stringify(r));
    assert.equal(r.source,lock.source);assert.equal(r.authority,'none');
    assert.deepEqual(r.offset,lock.offset);assert.deepEqual(r.selectedRoadIds,lock.selectedRoadIds);
    assert.ok(['observation-work-limit','preflight-refused','other-blockers','no-contacts','contact-closure-held','candidate-refused','work-limit','strict-topology-verified','swept-held','rejected','unverified'].includes(r.category));
    if(r.observation){bounded(r.observation.stats);assert.equal(r.observation.source,lock.source);assert.equal(r.observation.topologyChanged,false);}
    if(r.construction){
      assert.ok(r.observation.scope.mandatoryComplete);assert.equal(r.observation.other.length,0);
      assert.ok(r.observation.conflicts.length>0&&r.observation.conflicts.every(c=>c.status==='research-contact-only'&&c.contact.kind==='interior-interior'));
      bounded(r.construction.stats);assert.ok(r.construction.attempts<=1);
      assert.equal(r.construction.authority,'none');
      if(r.construction.status==='graph-candidate'){
        assert.ok(r.audit);assert.equal(Object.hasOwn(r.construction.witness,'neighbors'),false);
      }
    }
    if(r.audit){
      bounded(r.audit.stats);assert.equal(r.audit.source,lock.source);assert.equal(r.audit.authority,'none');
      if(r.audit.rotationDiagnostic)assert.equal(r.audit.rotationDiagnostic.policy,'required');
      if(r.audit.status==='topology-final-verified'){
        assert.equal(r.audit.rotationDiagnostic.finalChanged,0);
        assert.equal(r.audit.identityLedger.status,'complete');
        assert.deepEqual(r.audit.identityLedger.roads.retired,[]);
        assert.deepEqual(r.audit.identityLedger.nodes.retired,[]);
        assert.deepEqual(r.audit.finalBlockers,[]);
      }
    }
    if(r.category==='strict-topology-verified'){assert.equal(r.audit.reason,null);assert.deepEqual(r.audit.sweptUnresolved,[]);}
  });
}
