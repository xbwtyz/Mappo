import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

// Deliberately scoped 0.2.4 acceptance matrix; not the heavyweight C7 benchmark.
// Times are one-run exploratory measurements on the executing CI runner,
// not stable cross-machine speed guarantees or release performance thresholds.
test('024 P5 acceptance: 4 morphologies by 3 sizes, fallback evidence and saved-city parity', {timeout:180000}, () => {
  const rows=[];
  for (const size of ['small','medium','large']) {
    for (const morphology of ['organic','radial','linear','planned']) {
      const seed='024-acceptance-'+morphology+'-'+size;
      const options={seed,size,morphology};
      const metrics={eligibleCandidates:0,attemptedCandidates:0,rejectedCandidates:0,acceptedCandidates:0};
      const t0=performance.now();
      const baseline=createProject({...options,irregularProperties:false});
      const baselineMs=performance.now()-t0;
      const t1=performance.now();
      const project=createProject({...options,irregularProperties:true,irregularMetrics:metrics});
      const irregularMs=performance.now()-t1;
      assert.deepEqual(project.city.nodes,baseline.city.nodes,'Street nodes must not change');
      assert.deepEqual(project.city.roads,baseline.city.roads,'Street roads must not change');
      assert.deepEqual(project.city.blocks,baseline.city.blocks,'Street blocks must not change');
      assert.deepEqual(project.city.districts,baseline.city.districts,'Districts must not change');
      assert.equal(project.schemaVersion,9);
      assert.doesNotThrow(()=>validateStoredProject(project));
      const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(project,defaultWorkspace(project))));
      assert.equal(JSON.stringify(saved.project.city),JSON.stringify(project.city),'Portable JSON roundtrip must be exact');
      const repeat=createProject({...options,irregularProperties:true});
      assert.deepEqual(repeat.city,project.city,'Seeded output must be deterministic');
      const sideCounts={};
      for(const property of project.city.properties){
        const sides=property.boundary.length;
        sideCounts[sides]=(sideCounts[sides]??0)+1;
        assert.ok(sides>=3&&sides<=12,'Generated polygon respects authoring size bound');
      }
      const irregularCount=project.city.properties.filter(p=>p.boundary.length!==4).length;
      assert.equal(metrics.acceptedCandidates,irregularCount,'Successful irregular attempts match final polygons');
      assert.equal(metrics.attemptedCandidates,metrics.acceptedCandidates+metrics.rejectedCandidates,
        'Every selected irregular candidate is either accepted or rejected');
      rows.push({
        seed,size,morphology,
        totalProperties:project.city.properties.length,
        sideCounts,
        attempted:metrics.attemptedCandidates,
        accepted:metrics.acceptedCandidates,
        fallback:metrics.rejectedCandidates,
        fallbackPct:metrics.attemptedCandidates
          ? +(100*metrics.rejectedCandidates/metrics.attemptedCandidates).toFixed(1):null,
        baselineMs:+baselineMs.toFixed(1),
        irregularMs:+irregularMs.toFixed(1)
      });
      console.log('024_MATRIX '+JSON.stringify(rows.at(-1)));
    }
  }
  assert.equal(rows.length,12);
  assert.ok(rows.filter(r=>r.morphology==='organic').some(r=>r.accepted>0));
  assert.ok(rows.filter(r=>r.morphology==='radial').some(r=>r.accepted>0));
  const totals=rows.reduce((s,row)=>({
    properties:s.properties+row.totalProperties,
    attempted:s.attempted+row.attempted,
    accepted:s.accepted+row.accepted,
    fallback:s.fallback+row.fallback
  }),{properties:0,attempted:0,accepted:0,fallback:0});
  console.log('024_MATRIX_SUMMARY '+JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,caseCount:rows.length,...totals}));
});
