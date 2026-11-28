import test from 'node:test';
import assert from 'node:assert/strict';
import {SQUARE_TOURNAMENT_CASES} from '../scripts/development/research/square-trial-tournament-lock.mjs';
import {runSquareTournamentCase} from '../scripts/development/research/square-trial-tournament-run.mjs';
// Round-robin distribution across fixed files; GitHub scheduler retains
// control of actual runner assignment. Each frozen case appears once.
const cases=SQUARE_TOURNAMENT_CASES.filter((_,i)=>i%32===7);
assert.ok(cases.length>0);
for(const id of cases)test('Square tournament '+id,async()=>{
 const r=await runSquareTournamentCase(id);
 console.log('SQUARE_TOURNAMENT_RESULT '+JSON.stringify(r));
 assert.equal(r.id,id);
});
