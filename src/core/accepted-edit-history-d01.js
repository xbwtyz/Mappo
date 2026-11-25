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
function d01ReplayMatches(current,expected,target){
  if(current?.schemaVersion!==11)return d01Same(current,expected);
  if(expected?.schemaVersion!==11||target?.schemaVersion!==11)return false;
  if(!d01Same(current,{...expected,identityAllocation:current.identityAllocation}))
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
  canRecord(before,after,editorHistory){return Boolean(this.baseline&&d01Same(this.baseline,before)&&!d01Same(before,after)&&this.fits(before,after,editorHistory));}
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
  record(before,after,{family,operation,label,targetIds,editorHistory}={}) {
    if (!before?.city || !after?.city || ![family, operation, label].every(value =>
      typeof value === 'string' && value.trim()) || !Array.isArray(targetIds) ||
      !targetIds.every(id => typeof id === 'string' && id))
      throw Error('An accepted-history transaction requires a family, operation, label, and target IDs.');
    if(d01Same(before,after)){this.baseline=copyJson(after);return {status:'no-op'};}
    if(this.baseline&&!d01Same(this.baseline,before))
      return {status:'stale',reason:'The accepted city changed before history recording.'};
    const from=copyJson(before),to=copyJson(after);
    const bytes=d01Bytes(from)+d01Bytes(to)+(editorHistory ? d01Bytes(editorHistory) : 0);
    // The accepted edit itself remains valid even if its history does not fit.
    if(bytes>this.maxBytes) {
      this.clear(after,'Last accepted edit exceeded the session history budget. Undo is unavailable.');
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
    this.baseline=copyJson(after);
    this.notice=pruned?`History capacity reached: ${pruned} oldest transaction(s) expired.`
      :`Accepted: ${label} · session only.`;
    return {status:'recorded',entry:item,pruned};
  }
  can(direction,project){
    const item=this.entry(direction);
    const expected=direction==='undo'?item?.to:item?.from;
    const target=direction==='undo'?item?.from:item?.to;
    if(!item||!d01Same(this.baseline,project))return false;
    try{return d01ReplayMatches(project,expected,target);}
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
  accept(direction,item,candidate){
    const from=direction==='undo'?this.past:this.future;
    const into=direction==='undo'?this.future:this.past;
    if(!item||from.at(-1)!==item||!this.can(direction,this.baseline)||
      !d01Same(candidate,d01ReplayTarget(this.baseline,direction==='undo'?item.from:item.to)))
      throw Error('History cursor or candidate changed during replay.');
    // Complete copying before moving the cursor.
    const baseline=copyJson(candidate);
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
