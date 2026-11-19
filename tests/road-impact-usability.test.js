import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRoadImpact } from '../src/ui/road-inspection.js';

test('A5 prioritizes blocking issues and retains distinct typed IDs', () => {
  const rows=[
    {kind:'road',id:'same',severity:'needs-review',code:'frontage-missing',message:'one',relatedIds:[]},
    {kind:'property',id:'same',severity:'needs-review',code:'frontage-missing',message:'two',relatedIds:[]},
    {kind:'road',id:'same',severity:'needs-review',code:'frontage-missing',message:'three',relatedIds:[]},
    {kind:'junction',id:'N-1',severity:'invalid',code:'unnormalized-crossing',message:'bad',relatedIds:['R-1']},
  ];
  const before=JSON.stringify(rows);
  const groups=summarizeRoadImpact({affected:rows});
  assert.equal(groups.length,2);
  assert.equal(groups[0].severity,'invalid');
  assert.equal(groups[1].count,2);
  assert.equal(groups[1].rows.length,3);
  assert.match(groups[0].suggestion,/crossing/i);
  assert.equal(JSON.stringify(rows),before);
});
test('A5 handles incomplete/unknown reports conservatively and safely', () => {
  assert.deepEqual(summarizeRoadImpact(null),[]);
  const groups=summarizeRoadImpact({affected:[{kind:'city',id:'x',severity:'needs-review',code:'new-unknown-code',message:'<script>',relatedIds:[]}]});
  assert.equal(groups[0].count,1);
  assert.match(groups[0].suggestion,/cannot be safely/);
  assert.equal(groups[0].rows[0].message,'<script>');
});
