import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const imports=/^\s*import\s+[^;]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const futureModules=['src/core/project-schema-capabilities.js','src/data/migrate-schema11.js','src/core/identity-transaction.js','src/core/accepted-identity-session.js','src/editor/allocated-building-placement.js','src/editor/allocated-property-creation.js','src/editor/allocated-land-subdivision.js','src/editor/allocated-land-edit.js'];

// Mirror the existing build's flattened module closure. This parse-only
// diagnostic exposes lexical name collisions before runtime adoption.
// It does not replace building or testing the actual standalone.
function compileClosure(entry,extra=[]){
  const visited=new Set(),fragments=[];
  function visit(file){
    if(visited.has(file))return;
    visited.add(file);
    let source=readFileSync(file,'utf8');
    for(const match of source.matchAll(imports)){
      assert.ok(match[1].startsWith('.'),'Runtime dependency must be local');
      visit(resolve(dirname(file),match[1]));
    }
    source=source.replace(imports,'').replace(/^export\s+(?=((?:async\s+)?function|class|const|let)\b)/gm,'');
    assert.doesNotMatch(source,/^\s*(import|export)\s/m);
    fragments.push('\n// '+file+'\n'+source);
  }
  // Production closure followed by detached future modules; imports are
  // deduplicated exactly as in scripts/build.mjs.
  visit(resolve(root,entry));
  for(const module of extra)visit(resolve(root,module));
  return new Script("(function(){\n'use strict';\n"+fragments.join('\n')+"\n})();");
}
for(const entry of ['src/app.js','src/worker/junction-preview-worker.js']){
  test('IDA modules can join the flattened '+entry+' closure without lexical collisions',()=>{
    assert.doesNotThrow(()=>compileClosure(entry,futureModules));
  });
}
test('IDA detached modules parse together in the flattened standalone scope',()=>{
  assert.doesNotThrow(()=>compileClosure('src/core/identity-verification.js',futureModules));
});
