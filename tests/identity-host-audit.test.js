import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { ProjectFiles } from '../src/ui/project-files.js';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const lines=app.split('\n');
const matching=pattern=>lines.flatMap((line,i)=>pattern.test(line)?[{line:i+1,source:line.trim()}]:[]);
function report(label,rows){for(const row of rows)console.log(label+' src/app.js:'+row.line+' '+row.source);}
test('IDA host audit inventories all direct project assignments and their adoption/replay/rollback boundaries',()=>{
 const rows=matching(/^\s*project\s*=(?!=)/);
 report('project writer',rows);
 assert.deepEqual(rows.map(x=>x.source),[
  'project=receipt.candidate;','project = candidate;','project=previous;','project = next;','project = next;'
 ]);
 assert.equal(matching(/^\s*project\.\w+\s*=(?!=)/).length,0);
});
test('IDA host audit inventories the fifteen direct commitAcceptedEdit call sites',()=>{
 const rows=matching(/^\s*commitAcceptedEdit\(/);
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
 "commitAcceptedEdit(candidate, transaction);",
 "commitAcceptedEdit(receipt.candidate, { family: 'property', operation: 'property-delete',",
 "commitAcceptedEdit(received.candidate, { family: 'property', operation: 'property-and-plot', label,"
 ]);
});
test('IDA host audit identifies independent D01 writers and deferred history publication',()=>{
 const rows=matching(/acceptedHistoryD01\.(?:accept|record|observe|clear)\(/);
 report('D01 writer',rows);
 assert.deepEqual(rows.map(x=>x.source),[
  'acceptedHistoryD01.accept(direction,receipt.entry,project);',
  'const observed = project && !d01ReplayingHistory ? acceptedHistoryD01.observe(project, transaction) : null;',
  "acceptedHistoryD01.clear(project,'City generation started a new session history.');",
  'const recorded=acceptedHistoryD01.record(previous,candidate,transaction);',
  "acceptedHistoryD01.clear(project,'Opening or recovering a project cleared session history.');"
 ]);
 assert.match(app,/pendingHistoryTransaction = \{ candidate, transaction \};\s*project = candidate;/);
 assert.match(app,/pendingHistoryTransaction = null;\s*const observed = project/);
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
 assert.match(app,/function commitCityGeneration\(current\)[\s\S]*?project = next;[\s\S]*?acceptedHistoryD01\.clear\(project/);
 assert.match(app,/function applyProjectDocument\(document\)[\s\S]*?project = next;[\s\S]*?acceptedHistoryD01\.clear\(project/);
 assert.match(app,/apply: applyProjectDocument/);
 assert.match(app,/session\.computeJunctionAsync\(\{[\s\S]*?if \(project !== previous \|\| JSON\.stringify\(project\) !== projectJson\)/);
 assert.match(app,/function commitRoadEditB4\([\s\S]*?acceptedHistoryD01\.record\(previous,candidate,transaction\)/);
});
