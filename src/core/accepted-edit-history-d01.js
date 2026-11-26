import { validateIdentityAllocationState } from './identity-allocation.js';
import { validateActiveIdentityInventory } from './identity-verification.js';
// D01: one bounded, session-only history of accepted city transactions.
// Exact snapshots deliberately protect cross-editor metadata and identities.
// Visual-only workspace changes are not transactions.
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { reconcileRoadWorkspace } from '../editor/road-workspace.js';
import { historyWorkspaceForReplay } from './accepted-history-workspace-a5.js';

const d01Same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const d01Bytes=project=>JSON.stringify(project).length*2; // conservative UTF-16 estimate

// The coordinator owns and freezes validated project snapshots before staging
// its private history. This opt-in is never inferred from a shallow freeze
// or caller-provided commit metadata. Public D01 still copies by default.
function d01RequireFrozenProject(project){
  if(project?.schemaVersion!==11||!project.city)
    throw Error('Immutable history snapshots require Schema 11 projects.');
  const stack=[project],seen=new Set();
  while(stack.length){
    const value=stack.pop();
    if(!value||typeof value!=='object'||seen.has(value))continue;
    seen.add(value);
    if(!Object.isFrozen(value))throw Error('History snapshot is not deeply frozen.');
    for(const child of Object.values(value))
      if(child&&typeof child==='object')stack.push(child);
  }
  return project;
}

// The accepted allocator, not a historical snapshot, owns high-water marks.
// Compare every historical namespace/counter; do not repair a rollback by
// guessing from live IDs or by merging untrusted historical counter values.
function d01AllocationCovers(current, historical){
  validateIdentityAllocationState(current);
  validateIdentityAllocationState(historical);
  for(const [ns,counters] of Object.entries(historical.namespaces)){
    if(!Object.hasOwn(current.namespaces,ns))return false;
    for(const [type,value] of Object.entries(counters))
      if((current.namespaces[ns][type]??0)<value)return false;
  }
  return true;
}
function d01ReplayMatches(current,expected,target,currentJson){
  if(current?.schemaVersion!==11)return d01Same(current,expected);
  if(expected?.schemaVersion!==11||target?.schemaVersion!==11)return false;
  if((currentJson??JSON.stringify(current))!==JSON.stringify({...expected,identityAllocation:current.identityAllocation}))
    return false;
  return d01AllocationCovers(current.identityAllocation,expected.identityAllocation)&&
    d01AllocationCovers(current.identityAllocation,target.identityAllocation);
}
function d01ReplayTarget(current,target){
  if(current?.schemaVersion!==11)return copyJson(target);
  // Reject a malformed historical inventory before substituting counters:
  // current high-water marks must not conceal invalid recorded state.
  validateActiveIdentityInventory(target.identityAllocation,target.city);
  return copyJson({...target,identityAllocation:current.identityAllocation});
}

export class AcceptedEditHistoryD01 {
  constructor({maxEntries=20,maxBytes=64*1024*1024}={}) {
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>200||
      !Number.isSafeInteger(maxBytes)||maxBytes<1024)
      throw Error('Invalid bounded accepted-history limits.');
    this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.past=[];this.future=[];
    this.serial=0;this.baseline=null;this.notice='Session-only history: no accepted edits yet.';
  }
  get bytes(){return [...this.past,...this.future].reduce((n,x)=>n+x.bytes,0);}
  get length(){return this.past.length+this.future.length;}
  fits(before,after,editorHistory){return d01Bytes(before)+d01Bytes(after)+(editorHistory?d01Bytes(editorHistory):0)<=this.maxBytes;}
  canRecord(before,after,editorHistory){
    if(before?.schemaVersion!==11||after?.schemaVersion!==11)
      return Boolean(this.baseline&&d01Same(this.baseline,before)&&!d01Same(before,after)&&this.fits(before,after,editorHistory));
    if(!this.baseline)return false;
    // These are synchronous, validated JSON project inputs. Reuse the
    // exact text within this invocation only; never cache a mutable object.
    const baselineJson=JSON.stringify(this.baseline),beforeJson=JSON.stringify(before);
    if(baselineJson!==beforeJson)return false;
    const afterJson=JSON.stringify(after);
    if(beforeJson===afterJson)return false;
    return (beforeJson.length+afterJson.length)*2+
      (editorHistory?d01Bytes(editorHistory):0)<=this.maxBytes;
  }
  entry(direction){return direction==='undo'?this.past.at(-1):
    direction==='redo'?this.future.at(-1):null;}
  clear(project=null,notice='Accepted history cleared for this city.') {
    this.past=[];this.future=[];this.baseline=project?copyJson(project):null;
    this.notice=notice;
  }
  observe(project, transaction) {
    if(!project?.city)return {status:'no-city'};
    if(!this.baseline){this.baseline=copyJson(project);return {status:'baseline'};}
    const before=this.baseline;
    if(d01Same(before.city,project.city)){
      // Mutable non-city settings and visual-only updates do not start a transaction.
      this.baseline=copyJson(project);
      return {status:'unchanged'};
    }
    if (!transaction) {
      this.clear(project, 'A city change without a history transaction cleared session Undo/Redo.');
      return { status: 'barrier', reason: this.notice };
    }
    return this.record(before, project, transaction);
  }
  record(before,after,{family,operation,label,targetIds,editorHistory}={}, {immutableSnapshots=false}={}) {
    if (!before?.city || !after?.city || ![family, operation, label].every(value =>
      typeof value === 'string' && value.trim()) || !Array.isArray(targetIds) ||
      !targetIds.every(id => typeof id === 'string' && id))
      throw Error('An accepted-history transaction requires a family, operation, label, and target IDs.');
    let exactSnapshotBytes;
    if(before.schemaVersion===11&&after.schemaVersion===11){
      const beforeJson=JSON.stringify(before),afterJson=JSON.stringify(after);
      if(immutableSnapshots)exactSnapshotBytes=(beforeJson.length+afterJson.length)*2;
      if(beforeJson===afterJson){this.baseline=copyJson(after);return {status:'no-op'};}
      if(this.baseline&&JSON.stringify(this.baseline)!==beforeJson)
        return {status:'stale',reason:'The accepted city changed before history recording.'};
    }else{
      if(d01Same(before,after)){this.baseline=copyJson(after);return {status:'no-op'};}
      if(this.baseline&&!d01Same(this.baseline,before))
        return {status:'stale',reason:'The accepted city changed before history recording.'};
    }
    const from=immutableSnapshots?d01RequireFrozenProject(before):copyJson(before);
    const to=immutableSnapshots?d01RequireFrozenProject(after):copyJson(after);
    // Frozen owned snapshots retain the exact text measured above; the
    // public detached path continues to measure its actual copied values.
    const bytes=(exactSnapshotBytes??(d01Bytes(from)+d01Bytes(to)))+
      (editorHistory ? d01Bytes(editorHistory) : 0);
    // The accepted edit itself remains valid even if its history does not fit.
    if(bytes>this.maxBytes) {
      if(immutableSnapshots){
        this.past=[];this.future=[];this.baseline=to;
        this.notice='Last accepted edit exceeded the session history budget. Undo is unavailable.';
      }else this.clear(after,'Last accepted edit exceeded the session history budget. Undo is unavailable.');
      return {status:'oversize',bytes};
    }
    this.future=[]; // A new accepted edit cuts the redo branch.
    const item={serial:++this.serial,family,operation,label,
      targetIds:[...new Set(targetIds)],from,to,bytes,
      ...(editorHistory ? { editorHistory: copyJson(editorHistory) } : {})};
    this.past.push(item);
    let pruned=0;
    while(this.length>this.maxEntries||this.bytes>this.maxBytes){
      if(this.past.length){this.past.shift();pruned++;}
      else if(this.future.length){this.future.shift();pruned++;}
      else break;
    }
    this.baseline=immutableSnapshots?to:copyJson(after);
    this.notice=pruned?`History capacity reached: ${pruned} oldest transaction(s) expired.`
      :`Accepted: ${label} · session only.`;
    return {status:'recorded',entry:item,pruned};
  }
  can(direction,project){
    const item=this.entry(direction);
    const expected=direction==='undo'?item?.to:item?.from;
    const target=direction==='undo'?item?.from:item?.to;
    if(!item)return false;
    const currentJson=project?.schemaVersion===11?JSON.stringify(project):undefined;
    if(currentJson!==undefined?JSON.stringify(this.baseline)!==currentJson:!d01Same(this.baseline,project))return false;
    try{return d01ReplayMatches(project,expected,target,currentJson);}
    catch{return false;}
  }
  prepare(direction,project,workspace){
    const item=this.entry(direction);
    if(!item)return {ok:false,reason:'No accepted '+direction+' transaction is available.'};
    if(!this.can(direction,project))
      return {ok:false,reason:'Session history is stale. Undo/Redo cannot overwrite newer city edits.'};
    try{
      const candidate=d01ReplayTarget(project,direction==='undo'?item.from:item.to);
      validateStoredProject(candidate);
      let nextWorkspace=copyJson(workspace);
      // Full road transactions may change face, selection and district IDs.
      if (item.family === 'road' && !item.editorHistory)
        nextWorkspace=reconcileRoadWorkspace(nextWorkspace,project.city,candidate.city);
      nextWorkspace = historyWorkspaceForReplay(nextWorkspace, candidate.city, item.editorHistory, direction);
      const ref=nextWorkspace?.ui?.selection;
      if(ref?.kind==='property'&&!candidate.city.properties.some(p=>p.id===ref.id))
        nextWorkspace.ui.selection=null;
      if(ref?.kind==='building'&&!candidate.city.buildings.some(b=>b.id===ref.id))
        nextWorkspace.ui.selection=null;
      const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,nextWorkspace)));
      if(!d01Same(decoded.project,candidate)||
         !d01Same(decoded.workspace,nextWorkspace))
        throw Error('Portable project verification changed the history restore.');
      return {ok:true,candidate:decoded.project,workspace:nextWorkspace,entry:item};
    }catch(error){return {ok:false,reason:'History '+direction+' rejected: '+error.message};}
  }
  accept(direction,item,candidate,{immutableSnapshot=false}={}){
    const from=direction==='undo'?this.past:this.future;
    const into=direction==='undo'?this.future:this.past;
    if(!item||from.at(-1)!==item||!this.can(direction,this.baseline)||
      !d01Same(candidate,d01ReplayTarget(this.baseline,direction==='undo'?item.from:item.to)))
      throw Error('History cursor or candidate changed during replay.');
    // Complete copying before moving the cursor.
    const baseline=immutableSnapshot?d01RequireFrozenProject(candidate):copyJson(candidate);
    from.pop();into.push(item);
    this.baseline=baseline;
    this.notice=(direction==='undo'?'Undid: ':'Redid: ')+item.label+'.';
  }
  summaries(){
    const rows=[...this.past.map(x=>({...x,direction:'undo'})),
      ...this.future.map(x=>({...x,direction:'redo'}))];
    return rows.sort((a,b)=>a.serial-b.serial).map(x=>({
      serial:x.serial,family:x.family,operation:x.operation,
      label:x.label,targetIds:x.targetIds.slice(),direction:x.direction,bytes:x.bytes
    }));
  }
}

export function forkAcceptedHistoryD01(history,detach=false){
  if(!(history instanceof AcceptedEditHistoryD01))
    throw Error('An accepted D01 history is required');
  if(!Number.isSafeInteger(history.serial)||history.serial<0||
    !Array.isArray(history.past)||!Array.isArray(history.future))
    throw Error('Invalid accepted history cursor');
  const fork=new AcceptedEditHistoryD01({
    maxEntries:history.maxEntries,maxBytes:history.maxBytes
  });
  // Entries are treated as immutable inside the coordinator. record() only
  // replaces arrays, appends a new entry and replaces baseline/notice.
  // Import/export boundaries detach entries; staging shares private entries.
  fork.past=detach?copyJson(history.past):history.past.slice();
  fork.future=detach?copyJson(history.future):history.future.slice();
  fork.serial=history.serial;
  fork.baseline=detach?copyJson(history.baseline):history.baseline;
  fork.notice=history.notice;
  return fork;
}

// Stage the existing D01 policies, not a competing history system. Normal
// legacy edits retain their existing oversize barrier behavior; road-group
// transactions still require a complete reversible entry.
export function stageAcceptedPublicationD01(history,previous,candidate,transaction,{requireRecorded=false}={}){
  if(!history.baseline||!d01Same(history.baseline,previous))
    throw Error('Accepted project history baseline changed before publication.');
  const staged=forkAcceptedHistoryD01(history);
  const result=staged.observe(candidate,transaction);
  if(requireRecorded?result.status!=='recorded':!['recorded','unchanged','oversize'].includes(result.status))
    throw Error('Accepted project transaction could not be recorded: '+result.status);
  if(!d01Same(staged.baseline,candidate))throw Error('Accepted history publication baseline mismatch.');
  return {history:staged,status:result.status};
}
export function stageAcceptedReplayD01(history,previous,direction,receipt){
  if(!history.can(direction,previous)||!receipt?.ok)
    throw Error('Accepted history replay is stale or invalid.');
  const staged=forkAcceptedHistoryD01(history);
  staged.accept(direction,receipt.entry,receipt.candidate);
  return {history:staged,status:'replayed'};
}
export function stageAcceptedReplacementD01(history,candidate,notice){
  const staged=forkAcceptedHistoryD01(history);
  staged.clear(candidate,notice);
  return {history:staged,status:'replaced'};
}
