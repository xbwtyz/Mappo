// Detached experiment: interleave each property's building variables before the next property.
// No validators, candidate generation, limits or scoring changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const file=join(process.argv[2],'src/core/reconciliation-arrangement.js');
const source=readFileSync(file,'utf8'),before="  for(const e of sorted){const id='property:'+e.property.id;variables.push(id);byVariable.set(id,{entry:e});}\n  for(const e of sorted){";
assert.equal(source.split(before).length,2,'Arrangement ordering anchor mismatch');
writeFileSync(file,source.replace(before,"  for(const e of sorted){\n    const id='property:'+e.property.id;variables.push(id);byVariable.set(id,{entry:e});"));
console.log('LARE_INTERLEAVED_CONFIG '+JSON.stringify({strategy:'parcel-then-own-buildings',work:4000000,expansions:16384,beam:8,validator:'unchanged'}));
