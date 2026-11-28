import test from 'node:test';
import assert from 'node:assert/strict';
import {TOURNAMENT_MANIFEST as m} from '../scripts/development/research/ares-p5-tournament-inventory.mjs';
import {HOLDOUT_MANIFEST as old} from '../scripts/development/research/ares-p5-holdout-inventory.mjs';
test('Tournament manifest is a fixed disjoint matched 100-city cohort',()=>{
 assert.equal(m.rows.length,100);assert.equal(new Set(m.rows.map(r=>r.id)).size,100);assert.equal(new Set(m.rows.map(r=>r.options.seed)).size,100);
 assert.equal(m.reference,'89bdbd6a8c3aa85c61c7cd674efc64e115678c17');
 for(const morph of m.morphologies)assert.equal(m.rows.filter(r=>r.options.morphology===morph).length,25);
 for(let i=0;i<100;i++){const a=m.rows[i],b=old.rows[i];assert.equal(a.id,'t-'+b.id);assert.notEqual(a.options.seed,b.options.seed);assert.equal(a.options.size,b.options.size);assert.equal(a.options.morphology,b.options.morphology);assert.equal(a.preferredGroup,b.preferredGroup);assert.deepEqual(a.offset,b.offset);assert.ok(Math.abs(a.offset.x)<=100&&Math.abs(a.offset.y)<=100);}
});
