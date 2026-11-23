import { parseArgs } from 'node:util';

import { auditControls, createAdjustmentAudit } from '../tests/helpers/adjustment-audit.js';

const {values} = parseArgs({options: {case: {type: 'string'}, replay: {type: 'string'}}});
if (values.case && values.replay) throw new Error('Specify only one of --case and --replay.');
const audit = createAdjustmentAudit();
const groups = new Map();
const summary = {};
const rows = [];
const seen = new Set();
let pendingCase = null;
if (values.case) {
  if (!Object.hasOwn(auditControls, values.case)) throw new Error('Unknown case ' + values.case);
  pendingCase = auditControls[values.case];
} else if (values.replay) {
  pendingCase = JSON.parse(values.replay);
}

for (const spec of pendingCase ? [pendingCase] : audit.cases()) {
  const key = JSON.stringify(spec);
  if (seen.has(key)) continue;
  seen.add(key);
  const {preview, apply, proposal} = audit.execute(spec);
  const outcome = apply.ok ? 'eligible' : 'blocked';
  const stage = apply.ok ? null : preview.ok ? 'apply' : 'preview';
  const issues = apply.ok ? [] : (stage === 'preview' ? preview : apply).issues;
  const bucket = summary[spec.kind] ??= {eligible: 0, blocked: 0};
  bucket[outcome]++;
  const {project} = audit.fixture(spec.fixture);
  const row = {spec, seed: project.seed, outcome, stage, issues, applyIssues: apply.issues ?? []};
  if (proposal?.parcelReview?.length) row.parcelReview = proposal.parcelReview;
  rows.push(row);
  const counted = new Set();
  for (const issue of issues) {
    // Collapse entity IDs while retaining different messages under the same code.
    const reason = issue.message.replace(/\b(?:BLD|PROP|PLOT|RD|N|BLOCK|PORTAL)-[A-Z0-9-]+\b/g, '<ID>');
    const signature = [spec.kind, stage, issue.code, reason].join('/');

    if (counted.has(signature)) continue;
    counted.add(signature);
    const group = groups.get(signature) ?? {signature, count: 0, replay: spec};
    group.count++;
    groups.set(signature, group);
  }
}

console.log(JSON.stringify({summary, groups: [...groups.values()], rows}, null, 2));
