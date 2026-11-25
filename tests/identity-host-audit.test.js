import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { ProjectFiles } from '../src/ui/project-files.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const lines=app.split('\n');
const matching=pattern=>lines.flatMap((line,i)=>pattern.test(line)?[{line:i+1,source:line.trim()}]:[]);
function report(label,rows){for(const row of rows)console.log(label+' src/app.js:'+row.line+' '+row.source);}
test('IDA host audit enforces a single direct project publication boundary',()=>{
 const rows=matching(/^\s*project\s*=(?!=)/);
 report('project writer',rows);
 assert.deepEqual(rows.map(x=>x.source),[
  'project = next;'
 ]);
 assert.equal(matching(/^\s*project\.\w+\s*=(?!=)/).length,0);
});
test('IDA host audit inventories the fifteen direct commitAcceptedEdit call sites',()=>{
 const rows=matching(/^\s*(?:try\{)?commitAcceptedEdit\(/);
 report('accepted edit',rows);
 assert.deepEqual(rows.map(x=>x.source),[
 'commitAcceptedEdit({ ...project, city }, { family, operation, label, targetIds, editorHistory });',
 "commitAcceptedEdit(candidate, { family, operation: 'restore', label, targetIds: [], editorHistory });",
 "commitAcceptedEdit(received.candidate, { family: 'building',",
 "commitAcceptedEdit(receipt.candidate, { family: 'compound', operation: 'compound-membership',",
 "commitAcceptedEdit(receipt.candidate, { family: 'compound', operation: 'compound-transform',",
 "commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',",
 "commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',",
 "commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',",
 "commitAcceptedEdit(candidate, { family: 'property', operation: 'property-split',",
 "commitAcceptedEdit(candidate, { family: 'property', operation: 'property-merge',",
 "commitAcceptedEdit(receipt.candidate, { family: 'property', operation: 'property-create',",
 "commitAcceptedEdit({ ...project, city }, { family: 'identity', operation: 'identity-change',",
 "try{commitAcceptedEdit(candidate, transaction, {requireRecorded:group});}",
 "commitAcceptedEdit(receipt.candidate, { family: 'property', operation: 'property-delete',",
 "commitAcceptedEdit(received.candidate, { family: 'property', operation: 'property-and-plot', label,"
 ]);
});
test('IDA host audit prohibits independent D01 mutation and deferred recording in app',()=>{
 const rows=matching(/acceptedHistoryD01\.(?:accept|record|observe|clear)\(/);
 report('D01 writer',rows);assert.deepEqual(rows,[]);
 assert.doesNotMatch(app,/pendingHistoryTransaction/);
 assert.match(app,/function publishAcceptedStateD01\(next,staged\) \{\s*Object\.assign\(acceptedHistoryD01,staged\.history\);\s*project = next;/);
 assert.match(app,/function commitAcceptedEdit\(candidate, transaction, options\) \{\s*const staged=stageAcceptedPublicationD01\(acceptedHistoryD01,project,candidate,transaction,options\);\s*publishAcceptedStateD01\(candidate,staged\);/);
 assert.match(app,/staged\.observe\(project,null\)/);
});
test('IDA host audit distinguishes file dirty revision from accepted city revision',()=>{
 const files=new ProjectFiles({getElement:()=>({}),capture:()=>{throw Error('No city is required for a view-only dirty signal');},apply:()=>{throw Error('No city adoption required');}});
 assert.equal(files.revision,0);
 files.changed();files.changed();assert.equal(files.revision,2);
 files.applying=true;files.changed();assert.equal(files.revision,2);
 assert.match(app,/function workspaceChanged\(\)[\s\S]*?files\?\.changed\(\);/);
});
test('IDA host audit locates adoption and async road stale-check boundaries',()=>{
 assert.match(app,/function prepareCityGeneration\(\)[\s\S]*?createProject\(/);
 assert.match(app,/function commitCityGeneration\(current\)[\s\S]*?publishAcceptedStateD01\(next,stageAcceptedReplacementD01\(acceptedHistoryD01,next,/);
 assert.match(app,/function applyProjectDocument\(document,rollback=null\)[\s\S]*?stageAcceptedReplacementD01\(acceptedHistoryD01,next,[\s\S]*?publishAcceptedStateD01\(next,staged\)/);
 assert.match(app,/restoreAdoptionRollback: restoreProjectAdoptionRollbackD01/);
 assert.match(app,/apply: applyProjectDocument/);
 assert.match(app,/session\.computeJunctionAsync\(\{[\s\S]*?if \(project !== previous \|\| JSON\.stringify\(project\) !== projectJson\)/);
 assert.match(app,/function commitRoadEditB4\([\s\S]*?commitAcceptedEdit\(candidate, transaction, \{requireRecorded:group\}\)/);
});
