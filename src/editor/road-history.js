import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

// B4 history snapshots the entire coupled transaction. Session-only, bounded,
// and never allowed to overwrite subsequent unrelated edits.
const b4HistorySame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class RoadGeometryHistoryB4 {
  constructor(limit=6){
    if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Invalid road history bound.');
    this.limit=limit;this.past=[];this.future=[];this.serial=0;
  }
  clear(){this.past=[];this.future=[];this.serial=0;}
  record(before,after,junctionId){
    if(!junctionId||!before?.city||!after?.city)throw new Error('Missing road transaction.');
    if(b4HistorySame(before,after))return false;
    this.future=[];
    this.past.push({junctionId,from:copyJson(before),to:copyJson(after),serial:++this.serial});
    if(this.past.length>this.limit)this.past.shift();
    return true;
  }
  entry(direction){return direction==='undo'?this.past.at(-1):direction==='redo'?this.future.at(-1):null;}
  can(direction,project){
    const entry=this.entry(direction);
    return Boolean(entry&&b4HistorySame(project,direction==='undo'?entry.to:entry.from));
  }
  prepare(project,workspace,direction){
    const entry=this.entry(direction);
    if(!this.can(direction,project))
      return {ok:false,reason:'No compatible road edit to '+direction+'. Other accepted edits may have changed the city.'};
    try{
      const candidate=copyJson(direction==='undo'?entry.from:entry.to);
      validateStoredProject(candidate);
      const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
      if(!b4HistorySame(candidate,portable.project)||!b4HistorySame(workspace,portable.workspace))
        throw new Error('Portable save/load changed the restored project or workspace.');
      return {ok:true,candidate:portable.project,entry};
    }catch(error){return {ok:false,reason:'Road '+direction+' blocked: '+error.message};}
  }
  accept(entry,direction){
    const from=direction==='undo'?this.past:this.future;
    const to=direction==='undo'?this.future:this.past;
    if(from.at(-1)!==entry)throw new Error('Road edit history changed.');
    from.pop();to.push(entry);
    if(to.length>this.limit)to.shift();
  }
}
