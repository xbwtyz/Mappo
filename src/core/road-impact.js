import { buildRoadGraph, proposeJunctionMove } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { validateJsonTree, validateStoredProject } from '../data/project-validation.js';
import { inspectRoadDependencies, inspectRoadContextReferences } from './road-impact-dependencies.js';
import {
  riCompare,
  riEqual,
  riIndex,
  riRoadEqual,
  riFreeze,
  riBudget,
  riReporter,
  riRecords,
  inspectOpaqueRoadDependencies,
} from './road-impact-model.js';

const riAllArrays = [
  'nodes',
  'roads',
  'blocks',
  'properties',
  'plots',
  'buildings',
  'openSpaces',
  'districts',
  'walls',
  'gates',
  'towers',
];
const riUnique = (ids) => [...new Set(ids.filter((id) => typeof id === 'string'))].sort(riCompare);

function riDiff(accepted, candidate) {
  const nodeIds = [],
    roadIds = [];
  for (const id of new Set([...accepted.nodesById.keys(), ...candidate.nodesById.keys()]))
    if (!riEqual(accepted.nodesById.get(id), candidate.nodesById.get(id))) nodeIds.push(id);
  const movedNodes = new Set(nodeIds);
  for (const id of new Set([...accepted.roadsById.keys(), ...candidate.roadsById.keys()])) {
    const a = accepted.roadsById.get(id),
      b = candidate.roadsById.get(id);
    if (
      !riRoadEqual(a, b) ||
      (a && [a.a, a.b].some((n) => movedNodes.has(n))) ||
      (b && [b.a, b.b].some((n) => movedNodes.has(n)))
    )
      roadIds.push(id);
  }
  return { nodeIds: nodeIds.sort(riCompare), roadIds: roadIds.sort(riCompare) };
}
function riProtectedContext(city, ids, emit, severity = 'invalid') {
  const roads = riIndex(city.roads),
    bridges = riIndex(city.bridges),
    passes = riIndex(city.terrainPasses);
  for (const id of ids) {
    const road = roads.get(id);
    if (!road) continue;
    if (road.plaza)
      emit(
        'plaza',
        city.plaza.id,
        'protected-edge',
        'A protected plaza connection cannot be rewritten.',
        [id],
        null,
        severity,
      );
    if (road.bridgeId) {
      const bridge = bridges.get(road.bridgeId);
      emit(
        'water',
        road.bridgeId,
        'protected-edge',
        'The protected bridge connection cannot be rewritten.',
        [id, bridge?.waterId],
        null,
        severity,
      );
      if (bridge)
        emit(
          'water',
          bridge.waterId,
          'bridge-connection',
          'A protected bridge on this water feature would be affected.',
          [id, bridge.id],
          null,
          severity,
        );
    }
    if (road.passId) {
      const pass = passes.get(road.passId);
      emit(
        'terrain',
        road.passId,
        'protected-edge',
        'The protected mountain-pass connection cannot be rewritten.',
        [id, pass?.terrainId],
        null,
        severity,
      );
      if (pass)
        emit(
          'terrain',
          pass.terrainId,
          'pass-connection',
          'A protected pass on this mountain range would be affected.',
          [id, pass.id],
          null,
          severity,
        );
    }
    for (const [key, kind, flag] of [
      ['waterFaces', 'water', road.bank || road.waterBoundary],
      ['terrainFaces', 'terrain', road.foothill || road.terrainBoundary],
    ])
      if (flag) {
        for (const face of city[key] ?? [])
          if (
            face.vertices.some(
              (a, i) =>
                (a === road.a && face.vertices[(i + 1) % face.vertices.length] === road.b) ||
                (a === road.b && face.vertices[(i + 1) % face.vertices.length] === road.a),
            )
          ) {
            emit(
              kind,
              face.id,
              'protected-edge',
              'This protected feature face is incident to the proposed road change.',
              [id],
              null,
              severity,
            );
            for (const owner of face.waterIds ?? (face.waterId ? [face.waterId] : (face.terrainIds ?? [])))
              emit(
                kind,
                owner,
                'protected-edge',
                'The saved feature boundary must remain unchanged.',
                [id, face.id],
                null,
                severity,
              );
          }
      }
    if (road.boundary)
      for (const gate of city.gates ?? [])
        if ([road.a, road.b].includes(gate.connection?.cityNodeId))
          emit(
            'defense',
            gate.id,
            'gate-connection',
            'A perimeter road change would affect this accepted gate approach.',
            [id, gate.wallId, gate.connection.cityNodeId],
            null,
            severity,
          );
  }
}
function riGraphIssues(city, issues, fallbackId, emit) {
  for (const issue of issues ?? []) {
    const roads = issue.roadIds ?? [],
      nodes = issue.nodeIds ?? [];
    if (!roads.length && !nodes.length) emit('city', city.id, issue.code, issue.message, [], null, 'invalid');
    for (const id of roads)
      emit(
        'road',
        id,
        issue.code,
        issue.message,
        [...nodes, ...roads.filter((other) => other !== id)],
        null,
        'invalid',
      );
    for (const id of nodes) emit('junction', id, issue.code, issue.message, roads, null, 'invalid');
    if (issue.code === 'candidate-coordinate' && fallbackId)
      emit('junction', fallbackId, issue.code, issue.message, [], null, 'invalid');
  }
}
function riTopologyDependencies(city, faceIds, emit) {
  const ids = new Set(faceIds);
  for (const property of city.properties)
    if (ids.has(property.blockId))
      emit(
        'property',
        property.id,
        'block-topology',
        'The parent block identity requires explicit reconciliation.',
        [property.blockId],
      );
  for (const plot of city.plots)
    if (ids.has(plot.blockId))
      emit('plot', plot.id, 'block-topology', 'The parent block identity requires explicit reconciliation.', [
        plot.blockId,
        plot.propertyId,
      ]);
  for (const building of city.buildings)
    if (ids.has(building.blockId))
      emit(
        'building',
        building.id,
        'block-topology',
        'The parent block identity requires explicit reconciliation.',
        [building.blockId, building.propertyId],
      );
  for (const district of city.districts)
    if (district.blockIds?.some((id) => ids.has(id)))
      emit(
        'district',
        district.id,
        'block-topology',
        'Accepted district blocks include an unresolved identity.',
        district.blockIds.filter((id) => ids.has(id)),
      );
}

export function analyzeRoadImpact(project, proposal) {
  const { emit, items } = riReporter(),
    spend = riBudget(),
    city = project?.city;
  const report = {
    status: 'invalid',
    operation: typeof proposal?.operation === 'string' ? proposal.operation : 'inspect-network',
    roadIds: [],
    junctionIds: [],
    affected: [],
    issues: [],
    preservedIds: [],
    preservedObjects: [],
    requiresReconciliation: false,
    canApplyIn02A: false,
    complete: false,
    metrics: { junctions: [], roads: [], faces: [], openSpaceAreas: [], topology: null },
    validation: { accepted: 'unchecked', candidate: 'not-run' },
  };
  let baseValid = false,
    complete = false,
    identity = null;
  const finish = () => {
    report.affected = items();
    report.issues = report.affected.filter((i) => i.severity !== 'info');
    report.status = report.issues.some((i) => i.severity === 'invalid')
      ? 'invalid'
      : report.issues.length
        ? 'needs-review'
        : complete
          ? 'safe'
          : 'needs-review';
    report.complete = complete;
    report.requiresReconciliation = report.issues.some((i) => i.severity === 'needs-review');
    const affected = new Set(report.affected.map((i) => `${i.kind}\0${i.id}`));
    if (complete && city) {
      report.preservedObjects = riRecords(city)
        .filter((r) => !affected.has(`${r.kind}\0${r.id}`))
        .map(({ kind, id }) => ({ kind, id }));
      report.preservedIds = riUnique(report.preservedObjects.map((r) => r.id));
    }
    report.counts = {
      affectedObjects: new Set(report.affected.map((i) => `${i.kind}\0${i.id}`)).size,
      issues: report.issues.length,
      preservedObjects: report.preservedObjects.length,
    };
    return riFreeze(report);
  };
  if (!city || riAllArrays.some((key) => !Array.isArray(city[key])) || !city.plaza) {
    emit(
      'city',
      city?.id,
      'accepted-project',
      'Provide a supported accepted project with complete city collections.',
      [],
      null,
      'invalid',
    );
    return finish();
  }
  try {
    try {
      validateJsonTree(project);
    } catch (error) {
      report.validation.accepted = 'invalid';
      emit('city', city.id, 'accepted-project', error.message, [], null, 'invalid');
      return finish();
    }
    try {
      validateStoredProject(project);
      baseValid = true;
      report.validation.accepted = 'valid';
    } catch (error) {
      report.validation.accepted = 'invalid';
      emit('city', city.id, 'accepted-project', error.message, [], null, 'invalid');
    }
    const accepted = buildRoadGraph(city);
    if (!accepted.valid) {
      riGraphIssues(city, accepted.issues, null, emit);
      return finish();
    }
    if (!proposal?.graph) {
      report.roadIds = riUnique([
        ...(proposal?.issues ?? []).flatMap((i) => i.roadIds ?? []),
        ...(accepted.incidentRoads.get(proposal?.junctionId) ?? []),
      ]);
      report.junctionIds = riUnique([
        proposal?.junctionId,
        ...(proposal?.issues ?? []).flatMap((i) => i.nodeIds ?? []),
      ]);
      riGraphIssues(city, proposal?.issues ?? [], proposal?.junctionId, emit);
      if (!proposal?.issues?.length)
        emit(
          'city',
          city.id,
          'candidate-input',
          'A temporary A1 road proposal is required.',
          [],
          null,
          'invalid',
        );
      riProtectedContext(
        city,
        report.roadIds.filter((id) => accepted.roadClasses.get(id)?.protected),
        emit,
      );
      return finish();
    }
    // Re-index: the caller's claimed graphValid flag and changed ID list are not
    // proof. Actual detached records determine geometry, identities and scope.
    let graph;
    try {
      if (
        typeof proposal.graph.nodesById?.values !== 'function' ||
        typeof proposal.graph.roadsById?.values !== 'function'
      )
        throw new Error('The temporary candidate graph is missing supported node/road indexes.');
      graph = buildRoadGraph({
        nodes: [...proposal.graph.nodesById.values()],
        roads: [...proposal.graph.roadsById.values()],
      });
    } catch (error) {
      emit('city', city.id, 'candidate-input', error.message, [], null, 'invalid');
      return finish();
    }
    const diff = riDiff(accepted, graph);
    const movedNodeIds = new Set(diff.nodeIds);
    report.roadIds = diff.roadIds;
    report.junctionIds = riUnique([...diff.nodeIds, proposal.junctionId]);
    for (const id of diff.nodeIds) {
      const a = accepted.nodesById.get(id),
        b = graph.nodesById.get(id);
      report.metrics.junctions.push({
        id,
        oldPoint: a ? { x: a.x, y: a.y } : null,
        newPoint: b && Number.isFinite(b.x) && Number.isFinite(b.y) ? { x: b.x, y: b.y } : null,
      });
      emit(
        'junction',
        id,
        'junction-change',
        'This junction differs from the accepted network.',
        [],
        null,
        'info',
      );
    }
    for (const id of diff.roadIds) {
      const a = accepted.roadsById.get(id),
        b = graph.roadsById.get(id),
        p = accepted.nodesById.get(a?.a),
        q = accepted.nodesById.get(a?.b),
        r = graph.nodesById.get(b?.a),
        s = graph.nodesById.get(b?.b);
      const metrics = {
        id,
        oldLength: p && q ? Math.hypot(q.x - p.x, q.y - p.y) : null,
        newLength: r && s && Number.isFinite(r.x + r.y + s.x + s.y) ? Math.hypot(s.x - r.x, s.y - r.y) : null,
        oldClass: a?.kind ?? null,
        newClass: b?.kind ?? null,
      };
      report.metrics.roads.push(metrics);
      emit(
        'road',
        id,
        'road-change',
        'This road differs from the accepted network.',
        [a?.a, a?.b, b?.a, b?.b],
        metrics,
        'info',
      );
    }
    if (!graph.valid) {
      riGraphIssues(city, graph.issues, proposal.junctionId, emit);
      riProtectedContext(
        city,
        riUnique(graph.issues.flatMap((i) => i.roadIds ?? [])).filter(
          (id) => accepted.roadClasses.get(id)?.protected,
        ),
        emit,
      );
      return finish();
    }
    const extraction = extractRoadFaces(graph, city);
    if (!extraction.valid) {
      for (const issue of extraction.issues) {
        for (const id of issue.roadIds.length ? issue.roadIds : [city.id])
          emit(
            issue.roadIds.length ? 'road' : 'city',
            id,
            issue.code,
            issue.message,
            issue.faceIds.concat(issue.objectIds),
            null,
            'invalid',
          );
      }
      riProtectedContext(
        city,
        diff.roadIds.filter((id) => accepted.roadClasses.get(id)?.protected),
        emit,
      );
      return finish();
    }
    identity = matchExistingFaces(city, extraction);
    const kinds = new Map(riRecords(city).map((r) => [r.id, r.kind]));
    const faceKinds = new Map([
      ...city.blocks.map((f) => [f.id, 'block']),
      [city.plaza.id, 'plaza'],
      ...(city.waterFaces ?? []).map((f) => [f.id, 'water']),
      ...(city.terrainFaces ?? []).map((f) => [f.id, 'terrain']),
    ]);
    const deferredContext = [];
    for (const issue of identity.issues) {
      if (['district-reference', 'defense-reference'].includes(issue.code)) {
        deferredContext.push(issue);
        continue;
      }
      const severity = [
        'face-split',
        'face-merged',
        'face-ambiguous',
        'district-reference',
        'defense-reference',
      ].includes(issue.code)
        ? 'needs-review'
        : 'invalid';
      const targets = [
        ...issue.faceIds.map((id) => ({ kind: faceKinds.get(id) ?? 'block', id })),
        ...issue.roadIds.map((id) => ({ kind: 'road', id })),
        ...issue.objectIds.map((id) => ({ kind: kinds.get(id) ?? 'city', id })),
      ];
      for (const target of targets.length ? targets : [{ kind: 'city', id: city.id }])
        emit(target.kind, target.id, issue.code, issue.message, issue.roadIds, null, severity);
    }
    report.metrics.topology = {
      split: identity.split,
      merged: identity.merged,
      ambiguous: identity.ambiguous,
      added: identity.added,
      removed: identity.removed,
    };
    const mapped = [...identity.preserved, ...identity.changed],
      changedBlockIds = identity.changed.filter((f) => f.kind === 'block').map((f) => f.id);
    report.metrics.faces = mapped
      .map((f) => ({
        id: f.id,
        kind: f.kind,
        oldArea: f.oldArea,
        newArea: f.newArea,
        overlapArea: f.overlapArea,
        geometryChanged: identity.changed.includes(f),
      }))
      .sort((a, b) => riCompare(a.id, b.id));
    for (const f of identity.changed)
      emit(
        f.kind,
        f.id,
        'face-geometry',
        'The candidate retains this face identity with changed boundary geometry.',
        [],
        { oldArea: f.oldArea, newArea: f.newArea, overlapArea: f.overlapArea },
        'info',
      );
    const unresolved = riUnique([
      ...identity.removed.map((f) => f.id),
      ...identity.split.flatMap((f) => f.oldIds),
      ...identity.merged.flatMap((f) => f.oldIds),
      ...identity.ambiguous.flatMap((f) => f.oldIds),
    ]);
    for (const row of identity.added)
      emit(
        'candidate-face',
        row.candidateKey,
        'face-added',
        'A new face has no accepted identity; automatic assignment is prohibited.',
      );
    for (const row of identity.removed)
      emit(
        row.kind,
        row.id,
        'face-removed',
        'The accepted face has no candidate counterpart; automatic deletion is prohibited.',
      );
    riTopologyDependencies(city, unresolved, emit);
    const records = new Map(mapped.map((f) => [f.id, f.record]));
    const snapshot = {
      ...city,
      nodes: [...graph.nodesById.values()],
      roads: [...graph.roadsById.values()],
      blocks: mapped.filter((f) => f.kind === 'block').map((f) => f.record),
      plaza: records.get(city.plaza.id) ?? city.plaza,
      waterFaces: (city.waterFaces ?? []).map((f) => records.get(f.id) ?? f),
      terrainFaces: (city.terrainFaces ?? []).map((f) => records.get(f.id) ?? f),
    };
    const context = {
      roadIds: diff.roadIds,
      junctionIds: diff.nodeIds,
      changedBlockIds,
      acceptedValid: baseValid,
    };
    report.metrics.openSpaceAreas = inspectRoadDependencies(
      city,
      snapshot,
      context,
      emit,
      spend,
    ).openSpaceAreas;
    inspectRoadContextReferences(city, snapshot, context, emit, spend);
    for (const issue of deferredContext) {
      const kind = issue.code === 'district-reference' ? 'district' : 'defense';
      if (!items().some((i) => i.kind === kind && i.severity !== 'info'))
        emit('city', city.id, issue.code, issue.message, issue.objectIds);
    }
    if (diff.roadIds.length || diff.nodeIds.length)
      inspectOpaqueRoadDependencies(project, graph, emit, spend);
    riProtectedContext(
      city,
      diff.roadIds.filter(
        (id) =>
          (accepted.roadClasses.get(id)?.protected &&
            !riRoadEqual(accepted.roadsById.get(id), graph.roadsById.get(id))) ||
          (accepted.roadClasses.get(id)?.protected &&
            [accepted.roadsById.get(id).a, accepted.roadsById.get(id).b].some((n) => movedNodeIds.has(n))),
      ),
      emit,
    );
    // Only derived area summaries are computed in the validation-only snapshot.
    // No property, plot, building, frontage or ownership record is rewritten.
    const areaUpdates = new Map(report.metrics.openSpaceAreas.map((m) => [m.id, m.newArea]));
    snapshot.openSpaces = city.openSpaces.map((o) =>
      areaUpdates.has(o.id) ? { ...o, area: areaUpdates.get(o.id) } : o,
    );
    const blocking = items().some((i) => i.severity !== 'info');
    if (!blocking && baseValid && identity.valid && !identity.requiresReview) {
      try {
        validateStoredProject({ ...project, city: snapshot });
        report.validation.candidate = 'valid';
      } catch (error) {
        report.validation.candidate = 'failed';
        emit(
          'city',
          city.id,
          'candidate-validation',
          'Full candidate validation could not prove preservation: ' + error.message,
          diff.roadIds,
        );
      }
    }
    complete = true;
  } catch (error) {
    emit('city', city.id, 'impact-incomplete', error.message, report.roadIds);
    complete = false;
  }
  return finish();
}

export function inspectJunctionImpact(project, junctionId, point) {
  try {
    return analyzeRoadImpact(project, proposeJunctionMove(project?.city, junctionId, point));
  } catch (error) {
    return analyzeRoadImpact(project, {
      operation: 'move-junction',
      junctionId,
      graph: null,
      issues: [
        {
          code: 'candidate-input',
          message: error.message,
          nodeIds: typeof junctionId === 'string' ? [junctionId] : [],
          roadIds: [],
        },
      ],
    });
  }
}
