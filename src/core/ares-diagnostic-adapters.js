import { createAresDiagnostic, createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';

// Explicit source-specific mappings. Never classify by message text or ID prefix.
const aresGraphReasons=Object.freeze({
  'graph-records':'invalid-input','graph-limit':'unsupported-capability','empty-graph':'domain-violation',
  'node-id':'invalid-input','road-id':'invalid-input','duplicate-node-id':'unknown-data','duplicate-road-id':'unknown-data',
  'node-coordinate':'domain-violation','road-kind':'unsupported-capability','missing-endpoint':'unknown-data',
  'self-loop':'domain-violation','degenerate-road':'domain-violation','duplicate-edge':'domain-violation',
  'overlapping-roads':'domain-violation','unnormalized-crossing':'domain-violation','graph-work-limit':'work-limit',
  'protected-terminal-corridor':'protected-content','orphan-junction':'domain-violation','dangling-junction':'domain-violation',
  'disconnected-graph':'domain-violation','protected-junction':'protected-content','candidate-coordinate':'invalid-input',
  'junction-not-found':'invalid-input','boundary-escape':'domain-violation'
});
const aresGroupReasons=Object.freeze({
  'invalid-base-road-graph':'verification-failure','invalid-group-selection':'invalid-input','road-not-found':'invalid-input',
  'group-too-small':'invalid-input','disconnected-road-group':'invalid-input','protected-connection':'protected-content',
  'terminal-edit-out-of-scope':'unsupported-capability','invalid-offset':'invalid-input','coordinate-limit':'domain-violation'
});
const aresFaceReasons=Object.freeze({
  'invalid-road-graph':'verification-failure','protected-context':'unknown-data','boundary-ring':'domain-violation',
  'face-boundary-escape':'domain-violation','boundary-edge-detached':'domain-violation','protected-face-overlap':'domain-violation',
  'degenerate-face':'domain-violation','plaza-face':'domain-violation','face-coverage':'domain-violation',
  'face-traversal':'verification-failure','protected-edge-change':'protected-content','protected-edge-added':'protected-content',
  'invalid-candidate-faces':'verification-failure','invalid-accepted-faces':'verification-failure',
  'protected-face-change':'protected-content','protected-face-owner':'protected-content','protected-face-unresolved':'protected-content',
  'face-ambiguous':'unknown-data','face-split':'unsupported-capability','face-merge':'unsupported-capability',
  'face-matching':'verification-failure'
});
const aresImpactCollections=Object.freeze({junction:'nodes',road:'roads',block:'blocks',property:'properties',plot:'plots',
  building:'buildings',district:'districts','open-space':'openSpaces'});
function aresKnownReason(map,code){return Object.hasOwn(map,code)?map[code]:'unclassified';}
function aresSourceIds(value){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!id.trim()||id.length>200))
    throw Error('Invalid source diagnostic IDs.');
  return value;
}
function aresTypedIds(collection,ids){return aresSourceIds(ids).map(id=>({collection,id}));}
function aresSourceIssue(context,issue,source,stage,reason,refs=[],extra={}){
  if(!issue||typeof issue!=='object'||Array.isArray(issue))throw Error('Invalid source issue.');
  return createAresDiagnostic(context,{reason,code:issue.code,stage,message:issue.message,refs,
    source:{id:source,version:'1'},...extra});
}
// These adapters preserve source observations; they do not authenticate a
// caller, rerun validation, or prove an accepted object exists.
export function adaptAresGraphIssue(context,issue){
  return aresSourceIssue(context,issue,'road-graph','graph',aresKnownReason(aresGraphReasons,issue?.code),
    [...aresTypedIds('roads',issue?.roadIds),...aresTypedIds('nodes',issue?.nodeIds)]);
}
export function adaptAresGroupIssue(context,issue){
  return aresSourceIssue(context,issue,'road-group-b1','selection',aresKnownReason(aresGroupReasons,issue?.code),
    [...aresTypedIds('roads',issue?.roadIds),...aresTypedIds('nodes',issue?.nodeIds)]);
}
export function adaptAresFaceIssue(context,issue){
  // A face can be block, plaza, wet or terrain; objectIds are also untyped.
  return aresSourceIssue(context,issue,'road-faces','faces',aresKnownReason(aresFaceReasons,issue?.code),
    aresTypedIds('roads',issue?.roadIds),{unresolvedIds:[...aresSourceIds(issue?.faceIds),...aresSourceIds(issue?.objectIds)]});
}
export function adaptAresIntentIssue(context,issue){
  // Pending neighborhood reflow is informational, not a refusal.
  if(issue?.code==='neighborhood-reflow-pending')return null;
  const code=issue?.code;
  const reason=code==='face-reflow-needed'?'unsupported-capability':
    code==='topology-analysis-unavailable'?'verification-failure':
    Object.hasOwn(aresGroupReasons,code)?aresGroupReasons[code]:
    Object.hasOwn(aresGraphReasons,code)?aresGraphReasons[code]:aresKnownReason(aresFaceReasons,code);
  return aresSourceIssue(context,issue,'road-intent-c1','intent',reason,
    [...aresTypedIds('roads',issue?.roadIds),...aresTypedIds('nodes',issue?.nodeIds)]);
}
export function adaptAresImpactIssue(context,issue){
  if(!issue||typeof issue!=='object'||Array.isArray(issue))throw Error('Invalid source issue.');
  if(issue.severity==='info')return null;
  const collection=Object.hasOwn(aresImpactCollections,issue.kind)?aresImpactCollections[issue.kind]:null;
  const refs=collection?aresTypedIds(collection,[issue.id]):[];
  const unresolvedIds=[...aresSourceIds(issue.relatedIds),...(!collection?aresSourceIds([issue.id]):[])];
  const extra={unresolvedIds};
  let reason='unclassified';
  if(issue.code==='road-setback'&&issue.kind==='property'){
    reason='domain-violation';
    const m=issue.metrics;
    if(m!==null&&m!==undefined)extra.measurements={unit:'map-unit',newDistance:m.newDistance,
      requiredDistance:m.requiredDistance,oldDistance:m.oldDistance,oldRequiredDistance:m.oldRequiredDistance};
  }else if(issue.code==='unrecognized-dependency')reason='unknown-data';
  return aresSourceIssue(context,issue,'road-impact','dependencies',reason,refs,extra);
}
// Unified SRE coordinator result only. A refused search is not a proof
// of impossibility. Exhausted may describe a child budget, not the root.
export function adaptAresRecoveryRefusal(contextInput,result){
  const context=createAresDiagnosticContext(contextInput);
  if(!result||result.status!=='refused'||result.delta!==null||
     !matchesAresDiagnosticContext({version:1,context:{...context,operation:result.operation}},context))
    throw Error('Invalid or mismatched SRE refusal.');
  if(result.stopped!==undefined&&typeof result.stopped!=='boolean')throw Error('Invalid SRE stop evidence.');
  if(![null,'work','stateExpansions'].includes(result.exhausted))throw Error('Invalid SRE budget evidence.');
  if(!result.stats)throw Error('Missing SRE work evidence.');
  const reason=result.stopped?'stopped':result.exhausted?'work-limit':'search-exhausted';
  const code=result.stopped?'recovery-stopped':result.exhausted?'recovery-budget-limit':'recovery-no-verified-witness';
  const message=result.stopped?'The search was stopped without a verified witness.':
    result.exhausted?'A search budget reported exhaustion ('+result.exhausted+'); no verified witness was returned.':
    'The bounded recovery search returned no verified witness.';
  return aresSourceIssue(context,{code,message},'spatial-recovery-coordinator','search',reason,[],{work:result.stats});
}
