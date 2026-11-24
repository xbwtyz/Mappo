import { syncDraftControls } from './draft-controls.js';
import { distanceToSegment } from '../core/boundary.js';
import { PropertySplitSessionE2,PropertySplitHistoryE2,inspectPropertySplitE2,
  preparePropertySplitE2 } from '../editor/property-split-e2.js';

// Standalone adapter around the shared Property Inspector and map canvas.
// No separate model/history implementation: E2 uses the same reversible
// whole-project snapshot rules as E1, and the existing 3I plot primitives.
export class PropertySplitControlsE2 {
  constructor({drafts,getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed,historyMove=null,historyCan=null}) {
    Object.assign(this,{drafts,getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed,historyMove,historyCan});
    this.session=new PropertySplitSessionE2(()=>this.changed());
    this.history=new PropertySplitHistoryE2(20);
    this.boundProject=null;
    this.bind();
    this.refresh();
  }
  get active(){return this.session.active;}
  start(id) {
    if(this.canEnter()!==true)return false;
    const project=this.getProject();
    if(!this.session.start(project?.city,id))return false;
    this.boundProject=project;
    this.refresh();
    return true;
  }
  reset() { return this.drafts.reset('property-split', () => this.session.reset()); }
  stop(){const previous=this.session.stop();this.boundProject=null;this.refresh();return previous;}
  cancel() { return this.drafts.cancel('property-split', () => this.stop()); }
  clear(){this.stop();this.history.clear();this.refresh();}
  candidate() {
    const project=this.getProject(),result=inspectPropertySplitE2(project,this.session);
    this.session.validation=result;
    return result;
  }
  refresh(){
    const $=this.getElement,session=this.session,active=session.active;
    $('propertySplitPanelE2').hidden=!active;
    $('propertySplitPercentE2').disabled=!active;
    $('propertySplitFlexible025').disabled=!active||session.vertexCount!==4;
    $('propertySplitFlexible025').checked=active&&session.flexible;
    $('propertySplitExit025').hidden=!active||!session.flexible;
    $('propertySplitResetE2').disabled=!active||(Math.abs(session.t-.5)<1e-9&&
      (!session.flexible||(Math.abs(session.exitT-.5)<1e-9&&session.exitEdge===Math.max(1,Math.floor(session.vertexCount/2)))));
    const busy=active;
    for(const [dir,id] of [['undo','propertySplitUndoE2'],['redo','propertySplitRedoE2']]){
      const available=!busy&&(this.historyCan?this.historyCan(dir):this.history.can(dir,this.getProject()));
      $(id).disabled=!available;
      $(id).title=available?'Restore the complete before/after property split.':'No compatible split history.';
    }
    if (!active) { this.drafts.close('property-split'); return; }
    const result=this.candidate(),info=result.preview;
    $('propertySplitTargetE2').textContent=session.propertyId;
    if(document.activeElement!==$('propertySplitPercentE2'))$('propertySplitPercentE2').value=String(Number((session.t*100).toFixed(2)));
    const exitSelect=$('propertySplitExitEdge025');
    const currentExit=exitSelect.value;
    exitSelect.replaceChildren();
    for(let i=1;i<session.vertexCount;i++){
      const option=document.createElement('option');
      option.value=String(i);option.textContent='Edge '+(i+1)+' (vertex '+(i+1)+' → '+((i+1)%session.vertexCount+1)+')';
      exitSelect.append(option);
    }
    exitSelect.value=String(session.exitEdge);
    if(document.activeElement!==$('propertySplitExitPercent025'))
      $('propertySplitExitPercent025').value=String(Number((session.exitT*100).toFixed(2)));
    $('propertySplitSummaryE2').textContent=info
      ?'Left: '+info.areaLeft.toFixed(1)+' sq units / '+info.frontageLengthLeft.toFixed(1)+' frontage. Right: '+
        info.areaRight.toFixed(1)+' sq units / '+info.frontageLengthRight.toFixed(1)+' frontage. '+
        info.plotFragmentCount+' resulting plot fragments; '+info.buildingsLeft+' buildings left, '+
        info.buildingsRight+' right. Original ID stays on the frontage-start side.'
      :'Adjust the divider until both successor properties are valid.';
    const status=$('propertySplitStatusE2');
    status.textContent=this.boundProject!==this.getProject()
      ?'BLOCKED · Accepted city changed. Cancel and start a new split.'
      :result.ok?'CANDIDATE READY · Apply independently verifies project and saved-data integrity.'
        :'BLOCKED · '+(result.issues[0]?.message??'Please adjust the divider.');

    syncDraftControls(this.drafts, 'property-split', {
      key: session.propertyId, baseline: (this.boundProject ?? this.getProject())?.city,
      intent: JSON.stringify([session.t, session.flexible, session.exitEdge, session.exitT, [...session.approved], Boolean(session.drag)]),
      dirty: true, checking: Boolean(session.drag), ready: result.ok, issues: result.issues,
      target: { kind: 'property', id: session.propertyId },
    }, $('propertySplitPanelE2'), $('propertySplitApplyE2'));
    $('propertySplitIssuesE2').replaceChildren(...result.issues.map(row=>{
      const li=document.createElement('li');li.textContent=row.message;return li;
    }));
    const transfers=$('propertySplitTransfersE2');
    transfers.replaceChildren();
    for(const transfer of info?.transfers??[]){
      const label=document.createElement('label');
      label.className='property-split-transfer-e2';
      if(transfer.protected){
        const box=document.createElement('input');
        box.type='checkbox';box.checked=transfer.approved;
        box.setAttribute('aria-label','Authorize ownership transfer for '+transfer.name);
        box.addEventListener('change',()=>session.approve(transfer.buildingId,box.checked));
        label.append(box);
      }
      const desc=document.createElement('span');
      desc.textContent=(transfer.protected?'Authorize protected transfer · ':'Verified transfer · ')+transfer.name;
      label.append(desc);transfers.append(label);
    }
  }
  apply() {
    return this.drafts.apply('property-split', current => this.commitDraft(current));
  }
  commitDraft(current) {
    if(!this.active||this.session.drag)return false;
    const previous=this.getProject(),revision=this.getRevision(),
      signature=JSON.stringify({id:this.session.propertyId,t:this.session.t,
        flexible:this.session.flexible,exitEdge:this.session.exitEdge,exitT:this.session.exitT,
        approved:[...this.session.approved].sort()});
    if(previous!==this.boundProject)return false;
    const result=preparePropertySplitE2(previous,this.getWorkspace(),this.session);
    if(!result.ok){
      this.session.validation=result;
      this.getElement('propertySplitStatusE2').textContent=result.issues[0]?.message??'Split was rejected.';
      return false;
    }
    if(!current()||previous!==this.getProject()||revision!==this.getRevision()||
      signature!==JSON.stringify({id:this.session.propertyId,t:this.session.t,
        flexible:this.session.flexible,exitEdge:this.session.exitEdge,exitT:this.session.exitT,
        approved:[...this.session.approved].sort()}))
      return false;
    if(!this.history.record(previous,result.candidate,result.sourcePropertyId))return false;
    this.onCommit(result.candidate,result.sourcePropertyId,'apply',result);
    this.stop();this.changed();
    return true;
  }
  moveHistory(direction){
    if (this.historyMove) return this.historyMove(direction);
    if(this.active||this.canEnter()!==true)return false;
    const current=this.getProject();
    const receipt=this.history.prepare(direction,current,this.getWorkspace());
    if(!receipt.ok){this.getElement('propertySplitStatusE2').textContent=receipt.reason;return false;}
    const id=receipt.entry.id;
    this.onCommit(receipt.candidate,id,direction,receipt);
    this.history.accept(direction,receipt.entry);
    this.refresh();this.changed();return true;
  }
  begin(point,zoom){
    const geometry=this.session.geometry(this.getProject()?.city);
    if(!geometry||!point)return false;
    const tolerance=12/Math.max(.18,zoom);
    if(this.session.flexible){
      const from=geometry.cut[0],to=geometry.cut[1];
      const first=Math.hypot(point.x-from.x,point.y-from.y),last=Math.hypot(point.x-to.x,point.y-to.y);
      if(Math.min(first,last)<=tolerance){
        this.session.drag={part:first<=last?'front':'exit',startT:this.session.t,
          startExitT:this.session.exitT};return true;
      }
    }
    if(distanceToSegment(point,...geometry.cut)>10/Math.max(.18,zoom))return false;
    this.session.drag={part:'front',startT:this.session.t,startExitT:this.session.exitT};return true;
  }
  move(point){
    if(!this.session.drag||!point)return false;
    const geometry=this.session.geometry(this.getProject()?.city);
    if(!geometry)return false;
    const edge=this.session.drag.part==='exit'?this.session.exitEdge:0;
    const a=geometry.boundary[edge],b=geometry.boundary[(edge+1)%geometry.boundary.length];
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1);
    return this.session.drag.part==='exit'
      ?this.session.setExitT(Math.max(.001,Math.min(.999,t)))
      :this.session.setT(Math.max(.001,Math.min(.999,t)));
  }
  end(cancelled){
    const drag=this.session.drag;if(!drag)return false;
    this.session.drag=null;
    if(cancelled){
      this.session.setT(drag.startT);
      if(this.session.flexible)this.session.setExitT(drag.startExitT);
    }
    this.refresh();return true;
  }
  bind(){
    const $=this.getElement;
    $('propertySplitPercentE2').addEventListener('change',()=>{
      const raw=$('propertySplitPercentE2').value,t=Number(raw)/100;
      if(raw!==''&&Number.isFinite(t)&&t>0&&t<1)this.session.setT(t);
      else this.refresh();
    });
    $('propertySplitFlexible025').addEventListener('change',()=>{
      this.session.setFlexible($('propertySplitFlexible025').checked);this.refresh();
    });
    $('propertySplitExitEdge025').addEventListener('change',()=>{
      this.session.setExitEdge(Number($('propertySplitExitEdge025').value));this.refresh();
    });
    $('propertySplitExitPercent025').addEventListener('change',()=>{
      const input=$('propertySplitExitPercent025'),value=Number(input.value)/100;
      if(input.value!==''&&Number.isFinite(value)&&value>0&&value<1)this.session.setExitT(value);
      else this.refresh();
    });
    $('propertySplitResetE2').addEventListener('click',()=>this.reset());
    $('propertySplitCancelE2').addEventListener('click', () => this.cancel());
    $('propertySplitApplyE2').addEventListener('click',()=>this.apply());
    $('propertySplitUndoE2').addEventListener('click',()=>this.historyMove?this.historyMove('undo'):this.moveHistory('undo'));
    $('propertySplitRedoE2').addEventListener('click',()=>this.historyMove?this.historyMove('redo'):this.moveHistory('redo'));
  }
}
