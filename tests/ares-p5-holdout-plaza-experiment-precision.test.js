import test from 'node:test';
import assert from 'node:assert/strict';
import {measurePlaza} from '../scripts/development/research/ares-p5-holdout-plaza-experiment-register.mjs';
import {PLAZA_EXPERIMENT_CASES} from '../scripts/development/research/ares-p5-holdout-plaza-experiment-lock.mjs';
import {constructP5PlazaExperiment} from '../scripts/development/research/ares-p5-topology-observe.mjs';
test('Radial-12 matched frozen one-blocker precision witness',async()=>{const r=await measurePlaza('h:radial-12',true);assert.equal(r.arms.length,2);assert.notEqual(r.arms[0].audit?.status,'topology-final-verified');});
test('Experiment admission and arm locks',async()=>{assert.equal(PLAZA_EXPERIMENT_CASES.length,49);await assert.rejects(()=>constructP5PlazaExperiment('h:unknown','plaza-attached'),/Frozen plaza experiment/);await assert.rejects(()=>constructP5PlazaExperiment('h:radial-12','unlimited'),/Frozen plaza experiment/);await assert.rejects(()=>constructP5PlazaExperiment('h:radial-16','plaza-attached',true),/Frozen plaza precision/);});
