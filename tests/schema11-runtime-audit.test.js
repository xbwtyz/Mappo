import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {supportsCanonicalBuildingProjectSchema} from '../src/core/project-schema-capabilities.js';

test('Schema 11 retains canonical Schema 10 building geometry capability',()=>{
  for(const version of [10,11])assert.equal(supportsCanonicalBuildingProjectSchema(version),true);
});
for(const version of [undefined,null,0,1,9,12,100,'10','11',10.5,NaN]){
  test('Canonical building project capability rejects '+String(version),()=>{
    assert.equal(supportsCanonicalBuildingProjectSchema(version),false);
  });
}

const root=fileURLToPath(new URL('../',import.meta.url));
function sourceFiles(directory){
  const result=[];
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())result.push(...sourceFiles(path));
    else if(entry.isFile()&&/\.(?:m?js|cjs)$/.test(entry.name))result.push(path);
  }
  return result.sort();
}
// Diagnostic inventory, not a replacement for review or runtime tests.
// Report all project/workspace schema references, plus numeric schema
// expectations in test/source scripts. Exclude generated HTML and fixtures.
test('Schema adoption audit inventories source and test schema references',t=>{
  const groups=['src','scripts','tests'];
  const pattern=/\bschemaVersion\b|\b(?:CURRENT_PROJECT_SCHEMA|PROJECT_SCHEMA_VERSION)\b|\b(?:Schema|schema)\s*(?:10|11)\b/;
  const hits=new Map();
  for(const group of groups){
    const files=sourceFiles(join(root,group));
    assert.ok(files.length,group+' source inventory empty');
    let matches=0;
    for(const path of files){
      const label=relative(root,path).replaceAll('\\','/');
      if(label==='tests/schema11-runtime-audit.test.js')continue;
      const lines=readFileSync(path,'utf8').split(/\r?\n/);
      const found=[];
      for(let i=0;i<lines.length;i++)if(pattern.test(lines[i])){
        found.push((i+1)+': '+lines[i].trim().slice(0,240));
      }
      if(found.length){
        hits.set(label,found);
        matches+=found.length;
        t.diagnostic(label+' | '+found.join(' | '));
      }
    }
    t.diagnostic('IDA schema audit '+group+': '+files.length+' files scanned, '+matches+' matching lines');
  }
  for(const path of ['src/core/version.js','src/data/migrations.js',
    'src/data/project-format.js','src/data/project-validation.js','src/core/city-model.js',
    'src/core/building-project-s10.js','src/core/reconciliation-context.js',
    'src/core/road-group-preservation-b1.js'])
    assert.ok(hits.has(path),'Missing expected audit surface: '+path);
});
