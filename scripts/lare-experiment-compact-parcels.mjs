// Experimental only: append at most 54 compact joint affine alternatives.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const file=join(process.argv[2],'src/core/reconciliation-parcels.js');
const source=readFileSync(file,'utf8'),anchor="  return found.sort(lareParcelCmp);";
assert.equal(source.split(anchor).length,2,'Parcel source mismatch');
writeFileSync(file,source.replace(anchor,"  // Additional independent bounded inventory, original attempts untouched.\n  // Joint frontage/depth/position combinations are useful when the original\n  // one-axis and near-original samples miss a small feasible corner envelope.\n  attempts=0;\n  const compactSpans=lareParcelUnique([minimumWidth,(minimumWidth+usableWidth)/2,usableWidth]);\n  for(const front of frontValues){\n    for(const span of compactSpans){\n      if(span>length||span<minimumWidth)continue;\n      const maxStart=length-span;\n      const starts=lareParcelUnique([center-span/2,oldLeft,oldRight-span]\n        .map(x=>lareParcelClamp(x,0,maxStart)));\n      for(const start of starts)for(const depth of [.35,.55,.75].map(k=>Math.max(2,oldDepth*k))){\n        affine('compact-joint',start,start+span,front,front+depth);\n      }\n    }\n  }\n  return found.sort(lareParcelCmp);"));
console.log('LARE_COMPACT_PARCEL_CONFIG '+JSON.stringify({additionalAttempts:54,work:4000000,expansions:16384,retained:24,validator:'unchanged'}));
