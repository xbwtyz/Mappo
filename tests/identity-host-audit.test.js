import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { ProjectFiles } from '../src/ui/project-files.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const lines=app.split('\n');
const matching=pattern=>lines.flatMap((line,i)=>pattern.test(line)?[{line:i+1,source:line.trim()}]:[]);
test('IDA mounted host is the only accepted project publication authority',()=>{
 const rows=matching(/^\s*project\s*=(?!=)/);
 assert.deepEqual(rows.map(x=>x.source),['project = secureIdentityHost.adopted?secureIdentityHost.view().project:undefined;']);
 assert.equal(matching(/^\s*project\.\w+\s*=(?!=)/).length,0);
 assert.doesNotMatch(app,/new AcceptedEditHistoryD01|stageAcceptedPublicationD01|stageAcceptedReplayD01|stageAcceptedReplacementD01|forkAcceptedHistoryD01/);
 assert.match(app,/const secureIdentityHost=new SecureIdentityHost\(\)/);
 assert.match(app,/function workspaceChanged\(\)[\s\S]*?Untracked accepted project publication refused/);
});
test('IDA mounted ordinary Apply requires trusted intent and no direct history writer',()=>{
 assert.match(app,/function commitAcceptedEdit\(candidate,transaction,\{localRecord,stage\}=\{\}\)[\s\S]*?acceptMountedIdentityEdit\(secureIdentityHost,stage.token[\s\S]*?publishAcceptedStateD01\(out.accepted.historyStatus\)[\s\S]*?publishLocalEditorRecord\(localRecord\)/);
 assert.doesNotMatch(app,/(?:roadHistory|propertyHistory|propertyDeletionHistory4A|propertyCreationHistoryE1|buildingHistory|buildingStructureHistory|acceptedHistoryD01)\.record\(/);
 const rows=matching(/^\s*(?:commitAcceptedEdit|commitNonallocatingD01)\(/);
 assert.equal(rows.length,14);
 for(const kind of ['building','property-create','property-split','property-merge','property-delete','property-and-plot','nonallocating'])
  assert.ok(app.includes("prepareMountedApplyD01('"+kind+"'"),kind);
});
test('IDA mounted host owns replay and staged project adoption',()=>{
 assert.match(app,/secureIdentityHost\.replay\(\{direction,context,workspace:/);
 assert.match(app,/secureIdentityHost\.adopt\(prepared,\{applyView:/);
 assert.match(app,/secureIdentityHost\.stageAdoption\(document\)/);
 assert.match(app,/secureIdentityHost\.commitAdoption\(token,\{applyView:/);
 assert.match(app,/secureIdentityHost\.restoreAdoptionRollback\(checkpoint.token\)/);
 assert.match(app,/restoreAdoptionRollback: restoreProjectAdoptionRollbackD01/);
});
test('IDA host audit distinguishes file dirty revision from accepted city revision',()=>{
 const files=new ProjectFiles({getElement:()=>({}),capture:()=>{throw Error('No city is required for a view-only dirty signal');},apply:()=>{throw Error('No city adoption required');}});
 assert.equal(files.revision,0);
 files.changed();files.changed();assert.equal(files.revision,2);
 files.applying=true;files.changed();assert.equal(files.revision,2);
 assert.match(app,/function workspaceChanged\(\)[\s\S]*?files\?\.changed\(\);/);
});
test('IDA mounted road Apply binds current draft and worker result to host commit',()=>{
 assert.match(app,/beginRoadIdentityApply\(secureIdentityHost,workspace,session,baselineRevision,revision/);
 assert.match(app,/commitRoadIdentityApply\(secureIdentityHost,begun.token,captureWorkspace\(\).workspace,session,revision,workerResult\)/);
 assert.match(app,/session\.computeJunctionAsync\(begun.workerRequest\)/);
 assert.doesNotMatch(app,/commitAcceptedEdit\(candidate, transaction, \{requireRecorded:group/);
});
