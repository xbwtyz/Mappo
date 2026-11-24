// Detached experiment: promote only observed conflicting neighbors before broad fallback.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];if(!root)throw Error('Detached checkout required');
const edits=[
  [
    "src/core/reconciliation-parcels.js",
    [
      [
        "fixedNeighbors=[],mode='adaptive'},budget)",
        "fixedNeighbors=[],onNeighborConflict=null,mode='adaptive'},budget)"
      ],
      [
        "      fixedRings.some(ring=>!shapeContained(ring,boundary))||\n      fixedNeighbors.some(ring=>shapesOverlapInterior(ring,boundary)))return;",
        "      fixedRings.some(ring=>!shapeContained(ring,boundary)))return;\n    const conflict=fixedNeighbors.findIndex(ring=>shapesOverlapInterior(ring,boundary));\n    if(conflict!==-1){onNeighborConflict?.(conflict);return;}"
      ]
    ]
  ],
  [
    "src/core/reconciliation-road-group.js",
    [
      [
        "    const activeIds=new Set(active.map(p=>p.id));",
        "    const broadIds=new Set(active.map(p=>p.id));\n    let activeIds=new Set(active.filter(p=>primary.includes(p)||choices.get(p.id)?.kind==='reshape').map(p=>p.id));\n    if(!activeIds.size)activeIds=new Set(broadIds);\n    const conflicts=new Set();"
      ],
      [
        "    const entries=active.map(p=>{\n      const source=propertyIndex.get(p.id),edges=blockEdges.get(p.blockId);",
        "    const makeEntries=()=>active.filter(p=>activeIds.has(p.id)).map(p=>{\n      const source=propertyIndex.get(p.id),edges=blockEdges.get(p.blockId);\n      const neighbors=city.properties.filter(q=>q.blockId===p.blockId&&!activeIds.has(q.id));"
      ],
      [
        "        fixedNeighbors:city.properties.filter(q=>q.blockId===p.blockId&&!activeIds.has(q.id)).map(q=>q.boundary),",
        "        fixedNeighbors:neighbors.map(q=>q.boundary),\n        onNeighborConflict:index=>{const id=neighbors[index].id;if(broadIds.has(id))conflicts.add(id);},"
      ],
      [
        "    const fixed=entries.map(e=>({...e,buildings:e.buildings.map(b=>({...b,permission:{...b.permission,mode:'fixed'}}))}));\n    let outcome=yield* iterateLareArrangement({entries:fixed,finalize,incumbent},budget);\n    if(outcome.best)incumbent=outcome.best;\n    if(!outcome.exhausted&&(!incumbent||incumbent.score[0]>0)){\n      outcome=yield* iterateLareArrangement({entries,finalize,incumbent},budget);\n      if(outcome.best)incumbent=outcome.best;\n    }",
        "    let outcome;\n    for(let scope=0;scope<3;scope++){\n      conflicts.clear();\n      const entries=makeEntries();\n      yield {stage:'neighborhood-scope-'+scope+'-size-'+entries.length,stats:budget.snapshot()};\n      const fixed=entries.map(e=>({...e,buildings:e.buildings.map(b=>({...b,permission:{...b.permission,mode:'fixed'}}))}));\n      outcome=yield* iterateLareArrangement({entries:fixed,finalize,incumbent},budget);\n      if(outcome.best)incumbent=outcome.best;\n      if(!outcome.exhausted&&(!incumbent||incumbent.score[0]>0)){\n        outcome=yield* iterateLareArrangement({entries,finalize,incumbent},budget);\n        if(outcome.best)incumbent=outcome.best;\n      }\n      if(outcome.exhausted||incumbent?.score[0]===0||activeIds.size===broadIds.size)break;\n      const additional=[...conflicts].filter(id=>!activeIds.has(id)).sort();\n      yield {stage:'neighborhood-conflicts-'+additional.length,stats:budget.snapshot()};\n      if(!additional.length&&incumbent)break;\n      // At most one conflict-specific expansion before the original broad fallback.\n      activeIds=scope===0&&additional.length?new Set([...activeIds,...additional]):new Set(broadIds);\n    }"
      ]
    ]
  ]
];
for(const [path,replacements] of edits){const file=join(root,path);let source=readFileSync(file,'utf8');for(const [a,b] of replacements){assert.equal(source.split(a).length,2,'Experiment source mismatch: '+a);source=source.replace(a,b);}writeFileSync(file,source);}
console.log('EXPERIMENT conflict-driven neighborhood: primary, observed collisions, broad fallback; unchanged global limits and final validation');
