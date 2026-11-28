// Detached correspondence pilot. Never returns Apply or full matching authority.
import {polygonSignedArea,boundsOf} from '../../../src/core/geometry.js';
import {roadFaceOverlapArea} from '../../../src/core/road-face-geometry.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {extractP6BudgetedDryFaces} from './ares-p6-budgeted-dry-faces.mjs';
const charge=(spend,n)=>spend(Math.max(1,n));
const sortCharge=(spend,n)=>charge(spend,n*Math.ceil(Math.log2(n+1)));
function chargeRecord(value,spend){
 spend();
 if(typeof value==='string')charge(spend,value.length);
 if(value&&typeof value==='object'){
  const keys=Object.keys(value);sortCharge(spend,keys.length);
  for(const k of keys){charge(spend,k.length);chargeRecord(value[k],spend);}
 }
}
const rfCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rfPair = (a, b) => JSON.stringify([a, b]);
const rfEdge = (a, b) => JSON.stringify([a, b].sort(rfCompare));
const rfUndirectedRecord = (road) => ({
  ...rfCopy(road),
  a: [road.a, road.b].sort(rfCompare)[0],
  b: [road.a, road.b].sort(rfCompare)[1],
});
function rfCopy(value) {
  if (Array.isArray(value)) return value.map(rfCopy);
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort(rfCompare)
          .map((k) => [k, rfCopy(value[k])]),
      )
    : value;
}
function rfFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(rfFreeze);
    Object.freeze(value);
  }
  return value;
}
function rfIssue(code, message, faceIds = [], roadIds = [], objectIds = []) {
  return {
    code,
    message,
    faceIds: [...faceIds].sort(rfCompare),
    roadIds: [...roadIds].sort(rfCompare),
    objectIds: [...objectIds].sort(rfCompare),
  };
}
function rfIssues(issues) {
  return issues.sort((a, b) => rfCompare(a.code, b.code) || rfCompare(JSON.stringify(a), JSON.stringify(b)));
}
function rfCycle(vertices) {
  let first = 0;
  for (let i = 1; i < vertices.length; i++) if (rfCompare(vertices[i], vertices[first]) < 0) first = i;
  return [...vertices.slice(first), ...vertices.slice(0, first)];
}
const rfKey = (vertices) => JSON.stringify(rfCycle(vertices));
const rfCloseArea = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.max(a, b) * 1e-8);
const rfObjects = (city) => [
  ...(city.blocks ?? []).map((record) => ({ kind: 'block', record })),
  ...(city.plaza ? [{ kind: 'plaza', record: city.plaza }] : []),
  ...(city.waterFaces ?? []).map((record) => ({ kind: 'water', record })),
  ...(city.terrainFaces ?? []).map((record) => ({ kind: 'terrain', record })),
];

function rfOldFaces(city, graph) {
  const byEdge = new Map([...graph.roadsById.values()].map((r) => [rfEdge(r.a, r.b), r.id]));
  return rfObjects(city)
    .map(({ kind, record }) => ({
      kind,
      record,
      key: rfKey(record.vertices),
      polygon: record.vertices.map((id) => graph.nodesById.get(id)),
      roadIds: record.vertices.map((a, i) =>
        byEdge.get(rfEdge(a, record.vertices[(i + 1) % record.vertices.length])),
      ),
    }))
    .sort((a, b) => rfCompare(a.record.id, b.record.id));
}
function rfProtectedIssues(city, candidate, accepted) {
  const issues = [];
  for (const [id, old] of accepted.roadsById)
    if (accepted.roadClasses.get(id).protected || candidate.roadClasses.get(id)?.protected) {
      const road = candidate.roadsById.get(id);
      if (
        !road ||
        JSON.stringify(rfUndirectedRecord(old)) !== JSON.stringify(rfUndirectedRecord(road)) ||
        [old.a, old.b].some((n) => {
          const a = accepted.nodesById.get(n),
            b = candidate.nodesById.get(n);
          return !b || a.x !== b.x || a.y !== b.y;
        })
      )
        issues.push(
          rfIssue('protected-edge-change', 'A protected edge or its junction geometry changed.', [], [id]),
        );
    }
  for (const [id] of candidate.roadsById)
    if (candidate.roadClasses.get(id).protected && !accepted.roadsById.has(id))
      issues.push(
        rfIssue('protected-edge-added', 'Ordinary road editing cannot introduce a protected edge.', [], [id]),
      );
  return issues;
}

export function* iterateP6BudgetedIdentity(oldCity, extraction, accepted, budget) {
  if(!budget?.spend||!budget?.snapshot)throw Error('Shared P6 budget required.');
  if(!accepted?.valid)throw Error('Validated baseline graph required.');
  const result = {
    valid: false,
    correspondenceValid: false,
    authority: 'none',
    deferredValidation: ['district','defense','graph-provenance'],
    preserved: [],
    changed: [],
    added: [],
    removed: [],
    split: [],
    merged: [],
    ambiguous: [],
    issues: [],
    requiresReview: true,
    canApplyIn02A: false,
  };
  const spend = (n=1)=>budget.spend(n);
  spend();
  if (!extraction?.valid) {
    result.issues.push(
      rfIssue(
        'invalid-candidate-faces',
        'Identity matching requires a fully validated candidate face extraction.',
      ),
    );
    return rfFreeze(result);
  }
  yield { stage: 'accepted-face-graph' };
  const baseline = extractP6BudgetedDryFaces(accepted, oldCity,budget,{landscape:extraction.landscapeValidation==='deferred-to-independent-operation-verifier'});
  if (!baseline.valid) {
    result.issues.push(rfIssue('invalid-accepted-faces', 'The accepted road/face network is not valid.'));
    return rfFreeze(result);
  }
  try {
    charge(spend,accepted.roadsById.size+extraction.graph.roadsById.size+extraction.faces.length);
    for(const {record} of rfObjects(oldCity)){chargeRecord(record,spend);charge(spend,4*record.vertices.length);}
    sortCharge(spend,rfObjects(oldCity).length);
    for(const graph of [accepted,extraction.graph])for(const road of graph.roadsById.values())chargeRecord(road,spend);
    const old = rfOldFaces(oldCity, accepted),
      fresh = extraction.faces,
      oldIds = new Set(old.map((f) => f.record.id));
    const baselineByKey = new Map(baseline.faces.map((f) => [f.key, f]));
    if (
      oldIds.size !== old.length ||
      old.length !== baseline.faces.length ||
      new Set(old.map((f) => f.key)).size !== old.length ||
      old.some((f) => baselineByKey.get(f.key)?.kind !== f.kind)
    )
      throw new Error('Accepted face IDs or boundaries do not correspond uniquely to its road network.');
    result.issues.push(...rfProtectedIssues(oldCity, extraction.graph, accepted));
    const assignedOld = new Set(),
      assignedNew = new Set(),
      newByKey = new Map(fresh.map((f) => [f.key, f]));
    function assign(a, b, overlap) {
      chargeRecord(a.record,spend);charge(spend,3*a.polygon.length+b.roadIds.length);
      const unchanged = a.record.vertices.every((id) => {
        const p = accepted.nodesById.get(id),
          q = extraction.graph.nodesById.get(id);
        return q && p.x === q.x && p.y === q.y;
      });
      const record = rfCopy(a.record);
      if (!unchanged) {
        record.area = Math.round(b.area * 100) / 100;
      }
      const item = {
        id: record.id,
        kind: a.kind,
        candidateKey: b.key,
        record,
        oldArea: Math.abs(polygonSignedArea(a.polygon)),
        newArea: b.area,
        overlapArea: overlap,
      };
      result[unchanged ? 'preserved' : 'changed'].push(item);
      assignedOld.add(a.record.id);
      assignedNew.add(b.key);
      if (a.kind !== 'block' && !unchanged)
        result.issues.push(
          rfIssue(
            'protected-face-change',
            'Protected face geometry cannot be rewritten by ordinary editing.',
            [a.record.id],
            b.roadIds,
          ),
        );
      if (
        (a.kind === 'water' &&
          JSON.stringify([...(a.record.waterIds ?? [a.record.waterId])].sort()) !==
            JSON.stringify([...(b.waterIds ?? [])].sort())) ||
        (a.kind === 'terrain' &&
          JSON.stringify([...(a.record.terrainIds ?? [])].sort()) !==
            JSON.stringify([...(b.terrainIds ?? [])].sort()))
      )
        result.issues.push(
          rfIssue(
            'protected-face-owner',
            'Protected face ownership differs from the accepted feature references.',
            [a.record.id],
            b.roadIds,
          ),
        );
    }
    for (const a of old) {
      yield { stage: 'road-face-identity', id: a.record.id };
      charge(spend,3*a.polygon.length+3*a.roadIds.length);
      sortCharge(spend,a.roadIds.length);
      const b = newByKey.get(a.key);
      if(b)sortCharge(spend,b.roadIds.length);
      if (
        !b ||
        a.kind !== b.kind ||
        JSON.stringify([...a.roadIds].sort(rfCompare)) !== JSON.stringify([...b.roadIds].sort(rfCompare)) ||
        a.roadIds.some((id, i) => {
          const road = extraction.graph.roadsById.get(id);
          return (
            !road ||
            rfEdge(road.a, road.b) !==
              rfEdge(a.record.vertices[i], a.record.vertices[(i + 1) % a.record.vertices.length])
          );
        })
      )
        continue;
      const unchanged = a.record.vertices.every((id) => {
        const p = accepted.nodesById.get(id),
          q = extraction.graph.nodesById.get(id);
        return q && p.x === q.x && p.y === q.y;
      });
      const overlap = unchanged ? b.area : roadFaceOverlapArea(a.polygon, b.polygon, spend);
      if (overlap > Math.min(Math.abs(polygonSignedArea(a.polygon)), b.area) * 1e-8) assign(a, b, overlap);
    }
    // Remaining faces form a bipartite positive-overlap graph. Its components
    // are diagnostics only. Splits/merges never inherit IDs or metadata.
    const remainingOld = old.filter((f) => !assignedOld.has(f.record.id)),
      remainingNew = fresh.filter((f) => !assignedNew.has(f.key)),
      links = new Map(),
      reverse = new Map(),
      areas = new Map();
    charge(spend,old.length+fresh.length);
    for(const f of remainingNew)charge(spend,f.polygon.length);
    const boxes = remainingNew.map((f) => boundsOf(f.polygon));
    for (let i = 0; i < remainingOld.length; i++) {
      yield { stage: 'road-face-overlap', id: remainingOld[i].record.id };
      const a = remainingOld[i],
        bounds = boundsOf(a.polygon);
      charge(spend,a.polygon.length);
      links.set(i, []);
      charge(spend,remainingNew.length+old.length+fresh.length);
    for (let j = 0; j < remainingNew.length; j++) {
        spend();
        const box = boxes[j];
        if (
          bounds.maxX <= box.minX ||
          bounds.minX >= box.maxX ||
          bounds.maxY <= box.minY ||
          bounds.minY >= box.maxY
        )
          continue;
        charge(spend,a.polygon.length+remainingNew[j].polygon.length);
        const overlap = roadFaceOverlapArea(a.polygon, remainingNew[j].polygon, spend);
        if (overlap <= 1e-6) continue;
        links.get(i).push(j);
        if (!reverse.has(j)) reverse.set(j, []);
        reverse.get(j).push(i);
        areas.set(rfPair(i, j), overlap);
      }
    }
    const seenOld = new Set(),
      seenNew = new Set();
    for (let i = 0; i < remainingOld.length; i++) {
      spend();
      if (seenOld.has(i)) continue;
      const os = [i],
        ns = [];
      seenOld.add(i);
      for (let k = 0; k < os.length; k++){
        charge(spend,1+links.get(os[k]).length);
        for (const j of links.get(os[k]))
          if (!seenNew.has(j)) {
            charge(spend,1+reverse.get(j).length);
            seenNew.add(j);
            ns.push(j);
            for (const oi of reverse.get(j))
              if (!seenOld.has(oi)) {
                seenOld.add(oi);
                os.push(oi);
              }
          }
      }
      if (!ns.length) {
        result.removed.push({ id: remainingOld[i].record.id, kind: remainingOld[i].kind });
        continue;
      }
      charge(spend,os.length*ns.length+os.length+ns.length);
      for(const i of os)charge(spend,remainingOld[i].polygon.length);
      sortCharge(spend,os.length);sortCharge(spend,ns.length);
      const oldFaces = os.map((i) => remainingOld[i]),
        newFaces = ns.map((j) => remainingNew[j]),
        oldArea = oldFaces.reduce((n, f) => n + Math.abs(polygonSignedArea(f.polygon)), 0),
        newArea = newFaces.reduce((n, f) => n + f.area, 0);
      const overlapArea = os.reduce(
        (n, i) => n + ns.reduce((m, j) => m + (areas.get(rfPair(i, j)) ?? 0), 0),
        0,
      );
      const entry = {
        oldIds: oldFaces.map((f) => f.record.id).sort(rfCompare),
        candidateKeys: newFaces.map((f) => f.key).sort(rfCompare),
        oldArea,
        newArea,
        overlapArea,
      };
      const closed =
        rfCloseArea(oldArea, overlapArea) &&
        rfCloseArea(newArea, overlapArea) &&
        oldFaces.every((f) => f.kind === 'block') &&
        newFaces.every((f) => f.kind === 'block');
      const category =
        closed && os.length === 1 && ns.length > 1
          ? 'split'
          : closed && os.length > 1 && ns.length === 1
            ? 'merged'
            : 'ambiguous';
      result[category].push(entry);
      result.issues.push(
        rfIssue(
          `face-${category}`,
          `${category === 'ambiguous' ? 'Face correspondence is ambiguous' : category === 'split' ? 'An accepted face would split' : 'Accepted faces would merge'}; no identity was assigned.`,
          entry.oldIds,
          [],
        ),
      );
    }
    for (let j = 0; j < remainingNew.length; j++)
      if (!seenNew.has(j))
        result.added.push({ candidateKey: remainingNew[j].key, kind: remainingNew[j].kind });
    const mapped = [...result.preserved, ...result.changed],
      mappedIds = new Set(mapped.map((f) => f.id));
    for (const face of old.filter((f) => f.kind !== 'block'))
      if (!mappedIds.has(face.record.id))
        result.issues.push(
          rfIssue(
            'protected-face-unresolved',
            'A plaza, water or terrain face lost its unambiguous counterpart.',
            [face.record.id],
          ),
        );
    // District/defense validation deliberately not run or claimed here.
    result.correspondenceValid = !result.issues.some(i=>!['face-split','face-merged','face-ambiguous'].includes(i.code));
  } catch (error) {
    if(error instanceof LareBudgetExceeded)throw error;
    result.correspondenceValid=false;
    // Never return a partly proven mapping if geometric corroboration stops.
    for (const key of ['preserved', 'changed', 'added', 'removed', 'split', 'merged', 'ambiguous'])
      result[key] = [];
    result.issues.push(rfIssue('face-matching', error.message));
    result.valid = false;
    result.requiresReview = true;
  }
  chargeRecord(result,spend);
  sortCharge(spend,result.issues.length);
  rfIssues(result.issues);
  return rfFreeze(result);
}


export function matchP6BudgetedIdentity(city,extraction,accepted,budget){
 const it=iterateP6BudgetedIdentity(city,extraction,accepted,budget);
 for(let step=it.next();;step=it.next())if(step.done)return step.value;
}
