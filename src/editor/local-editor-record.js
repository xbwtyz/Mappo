// Non-authoritative editor feedback ledgers use the existing record methods
// on a detached cursor. The canonical D01 transaction can refuse without
// advancing local history, expiring entries, or cutting its redo branch.
// Entries are immutable for record(): all six legacy record methods only
// replace/append/prune array membership and create fresh snapshot entries.
const idaLocalRecordTokens=new WeakMap();
const idaLocalArrayMatches=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function stageLocalEditorRecord(history,...args){
  if(!history||!Array.isArray(history.past)||!Array.isArray(history.future)||typeof history.record!=='function')
    throw Error('Invalid local editor history.');
  const old={past:history.past.slice(),future:history.future.slice(),serial:history.serial,limit:history.limit};
  const fork=Object.assign(Object.create(Object.getPrototypeOf(history)),history,{
    past:old.past.slice(),future:old.future.slice()
  });
  // Deletion record returns undefined on success; other histories return true.
  if(fork.record(...args)===false)return null;
  const token=Object.freeze({});
  idaLocalRecordTokens.set(token,{history,old,fork});
  return token;
}
export function checkLocalEditorRecord(token){
  const s=idaLocalRecordTokens.get(token);
  if(!s)throw Error('Unknown or consumed local editor history stage.');
  const {history,old}=s;
  if(history.limit!==old.limit||history.serial!==old.serial||
    !idaLocalArrayMatches(history.past,old.past)||!idaLocalArrayMatches(history.future,old.future))
    throw Error('Local editor history changed before accepted publication.');
  return true;
}
// Call only in the same synchronous boundary immediately after accepted
// publication. No editor callbacks or fallible snapshot creation occur here.
export function publishLocalEditorRecord(token){
  const s=idaLocalRecordTokens.get(token);
  if(!s)throw Error('Unknown or consumed local editor history stage.');
  idaLocalRecordTokens.delete(token);
  s.history.past=s.fork.past;s.history.future=s.fork.future;
  if(Object.hasOwn(s.fork,'serial'))s.history.serial=s.fork.serial;
}
