import test from 'node:test';
import assert from 'node:assert/strict';
import {TOURNAMENT_CASES,tournamentLockedRow} from '../scripts/development/research/ares-p5-tournament-lock.mjs';
import {searchTournamentPlazaRecovery} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
test('New cohort has exactly 100 disjoint locked cases and rejects outside recipes',async()=>{
 assert.equal(TOURNAMENT_CASES.length,100);
 for(const m of ['radial','organic','linear','planned'])assert.equal(TOURNAMENT_CASES.filter(id=>id.startsWith('t:t-'+m+'-')).length,25);
 assert.throws(()=>tournamentLockedRow('h:radial-01'));await assert.rejects(searchTournamentPlazaRecovery('h:radial-01'));await assert.rejects(searchTournamentPlazaRecovery('t:unknown'));
});
