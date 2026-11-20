import { distanceToSegment } from '../core/boundary.js';
import { PropertySplitSessionE2,PropertySplitHistoryE2,inspectPropertySplitE2,
  preparePropertySplitE2 } from '../editor/property-split-e2.js';

// Standalone adapter around the shared Property Inspector and map canvas.
// No separate model/history implementation: E2 uses the same reversible
// whole-project snapshot rules as E1, and the existing 3I plot primitives.
export class PropertySplitControlsE2 {
  constructor({getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed}) {
    Object.assign(this,{getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed});
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
  reset(){return this.session.reset();}
  stop(){const previous=this.session.stop();this.boundProject=null;this.refresh();return previous;}
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
    $('propertySplitResetE2').disabled=!active||Math.abs(session.t-.5)<1e-9;
    const busy=active;
    for(const [dir,id] of [['undo','propertySplitUndoE2'],['redo','propertySplitRedoE2']]){
      const available=!busy&&this.history.can(dir,this.getProject());
      $(id).disabled=!available;
      $(id).title=available?'Restore the complete before/after property split.':'No compatible split history.';
    }
    if(!active)return;
    const result=this.candidate(),info=result.preview;
    $('propertySplitTargetE2').textContent=session.propertyId;
    if(document.activeElement!==$('propertySplitPercentE2'))$('propertySplitPercentE2').value=String(Number((session.t*100).toFixed(2)));
    $('propertySplitSummaryE2').textContent=info
      ?'Left: '+info.areaLeft.toFixed(1)+' sq units / '+info.frontageLengthLeft.toFixed(1)+' frontage. Right: '+
        info.areaRight.toFixed(1)+' sq units / '+info.frontageLengthRight.toFixed(1)+' frontage. '+
        info.plotFragmentCount+' resulting plot fragments; '+info.buildingsLeft+' buildings left, '+
        info.buildingsRight+' right. Original ID stays on the frontage-start side.'
      :'Adjust the dividing line inside a valid four-corner property.';
    const status=$('propertySplitStatusE2');
    status.textContent=this.boundProject!==this.getProject()
      ?'BLOCKED · Accepted city changed. Cancel and start a new split.'
      :result.ok?'CANDIDATE READY · Apply independently verifies project and saved-data integrity.'
        :'BLOCKED · '+(result.issues[0]?.message??'Please adjust the divider.');
    $('propertySplitApplyE2').disabled=!result.ok||!!session.drag||
      this.boundProject!==this.getProject();
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
  apply(){
    if(!this.active||this.session.drag)return false;
    const previous=this.getProject(),revision=this.getRevision(),
      signature=JSON.stringify({id:this.session.propertyId,t:this.session.t,approved:[...this.session.approved].sort()});
    if(previous!==this.boundProject)return false;
    const result=preparePropertySplitE2(previous,this.getWorkspace(),this.session);
    if(!result.ok){
      this.session.validation=result;
      this.getElement('propertySplitStatusE2').textContent=result.issues[0]?.message??'Split was rejected.';
      return false;
    }
    if(previous!==this.getProject()||revision!==this.getRevision()||
      signature!==JSON.stringify({id:this.session.propertyId,t:this.session.t,approved:[...this.session.approved].sort()}))
      return false;
    if(!this.history.record(previous,result.candidate,result.sourcePropertyId))return false;
    this.onCommit(result.candidate,result.sourcePropertyId,'apply',result);
    this.stop();this.changed();
    return true;
  }
  moveHistory(direction){
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
    const distance=distanceToSegment(point,...geometry.cut);
    if(distance>10/Math.max(.18,zoom))return false;
    this.session.drag={startT:this.session.t};return true;
  }
  move(point){
    if(!this.session.drag||!point)return false;
    const geometry=this.session.geometry(this.getProject()?.city);
    if(!geometry)return false;
    const a=geometry.boundary[0],b=geometry.boundary[1],dx=b.x-a.x,dy=b.y-a.y;
    const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1);
    return this.session.setT(Math.max(.001,Math.min(.999,t)));
  }
  end(cancelled){
    const drag=this.session.drag;if(!drag)return false;
    this.session.drag=null;
    if(cancelled)this.session.setT(drag.startT);
    this.refresh();return true;
  }
  bind(){
    const $=this.getElement;
    $('propertySplitPercentE2').addEventListener('change',()=>{
      const raw=$('propertySplitPercentE2').value,t=Number(raw)/100;
      if(raw!==''&&Number.isFinite(t)&&t>0&&t<1)this.session.setT(t);
      else this.refresh();
    });
    $('propertySplitResetE2').addEventListener('click',()=>this.reset());
    $('propertySplitCancelE2').addEventListener('click',()=>this.stop());
    $('propertySplitApplyE2').addEventListener('click',()=>this.apply());
    $('propertySplitUndoE2').addEventListener('click',()=>this.moveHistory('undo'));
    $('propertySplitRedoE2').addEventListener('click',()=>this.moveHistory('redo'));
  }
}
