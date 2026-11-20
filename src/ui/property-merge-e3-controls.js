import { PropertyMergeSessionE3,PropertyMergeHistoryE3,
  inspectPropertyMergeE3,preparePropertyMergeE3 } from '../editor/property-merge-e3.js';

export class PropertyMergeControlsE3 {
  constructor({getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed}){
    Object.assign(this,{getElement,getProject,getWorkspace,getRevision,canEnter,onCommit,changed});
    this.session=new PropertyMergeSessionE3(()=>this.changed());
    this.history=new PropertyMergeHistoryE3(20);
    this.boundProject=null;
    this.bind();
    this.refresh();
  }
  get active(){return this.session.active;}
  start(id){
    if(this.canEnter()!==true)return false;
    const project=this.getProject();
    if(!this.session.start(project?.city,id))return false;
    this.boundProject=project;this.refresh();return true;
  }
  choose(id){
    if(!this.active||this.boundProject!==this.getProject())return false;
    const ok=this.session.choose(this.getProject()?.city,id);
    this.refresh();return ok;
  }
  reset(){const ok=this.session.reset();this.refresh();return ok;}
  stop(){const ok=this.session.stop();this.boundProject=null;this.refresh();return ok;}
  clear(){this.stop();this.history.clear();this.refresh();}
  candidate(){const r=inspectPropertyMergeE3(this.getProject(),this.session);this.session.validation=r;return r;}
  refresh(){
    const $=this.getElement,active=this.active,session=this.session;
    $('propertyMergePanelE3').hidden=!active;
    for(const [direction,id] of [['undo','propertyMergeUndoE3'],['redo','propertyMergeRedoE3']]){
      $(id).disabled=active||!this.history.can(direction,this.getProject());
      $(id).title=$(id).disabled?'No compatible merge history.':'Restore the complete property merge.';
    }
    if(!active)return;
    const neighbors=session.neighbors(this.getProject()?.city);
    const select=$('propertyMergeNeighborE3'),previous=select.value;
    select.replaceChildren();
    const placeholder=document.createElement('option');
    placeholder.value='';placeholder.textContent='Choose adjoining property';select.append(placeholder);
    for(const item of neighbors){
      const option=document.createElement('option');option.value=item.id;
      option.textContent=item.name+' ('+item.id+')';select.append(option);
    }
    select.value=neighbors.some(n=>n.id===session.secondaryId)?session.secondaryId:'';
    if(!select.value&&previous===session.secondaryId)select.value='';
    $('propertyMergePrimaryE3').textContent=session.primaryId;
    $('propertyMergeResetE3').disabled=!session.secondaryId;
    const result=this.candidate(),g=result.preview;
    $('propertyMergeSummaryE3').textContent=g
      ?'Keep '+g.primary.id+'; retire '+g.secondary.id+'. Combined '+g.area.toFixed(1)+
       ' sq units / '+g.frontageLength.toFixed(1)+' frontage; '+g.plotIds.length+
       ' unchanged plot IDs and '+g.buildingIds.length+' unchanged building footprints.'
      :'Select a compatible neighbor (or click it on the map). Eligible neighbors: '+neighbors.length+'.';
    const consent=$('propertyMergeConsentWrapE3');
    consent.hidden=!g?.protectedSecondary;
    $('propertyMergeConsentE3').checked=session.approved;
    $('propertyMergeConsentLabelE3').textContent=g?.protectedSecondary
      ?'I authorize retiring '+(g.secondary.customName||g.secondary.id)+
       ' and recording its entire property identity in the merged parcel lineage.':'';
    const stale=this.boundProject!==this.getProject();
    $('propertyMergeStatusE3').textContent=stale
      ?'BLOCKED · Accepted city changed; cancel and restart the merge.'
      :result.ok?'READY · Apply revalidates the entire city, plot ownership and portable save.'
       :result.issues[0]?.message??'Choose a second property.';
    $('propertyMergeIssuesE3').replaceChildren(...result.issues.map(item=>{
      const li=document.createElement('li');li.textContent=item.message;return li;
    }));
    $('propertyMergeApplyE3').disabled=stale||!result.ok;
  }
  apply(){
    if(!this.active||!this.session.secondaryId)return false;
    const before=this.getProject(),rev=this.getRevision(),
      signature=JSON.stringify([this.session.primaryId,this.session.secondaryId,this.session.approved]);
    if(before!==this.boundProject)return false;
    const receipt=preparePropertyMergeE3(before,this.getWorkspace(),this.session);
    if(!receipt.ok){this.getElement('propertyMergeStatusE3').textContent=receipt.issues[0]?.message??'Merge rejected.';return false;}
    if(before!==this.getProject()||rev!==this.getRevision()||
      signature!==JSON.stringify([this.session.primaryId,this.session.secondaryId,this.session.approved]))return false;
    if(!this.history.record(before,receipt.candidate,receipt.retainedId))return false;
    this.onCommit(receipt.candidate,receipt.retainedId,'apply',receipt);
    this.stop();this.changed();return true;
  }
  moveHistory(direction){
    if(this.active||this.canEnter()!==true)return false;
    const receipt=this.history.prepare(direction,this.getProject(),this.getWorkspace());
    if(!receipt.ok)return false;
    this.onCommit(receipt.candidate,receipt.entry.id,direction,receipt);
    this.history.accept(direction,receipt.entry);this.refresh();this.changed();return true;
  }
  bind(){
    const $=this.getElement;
    $('propertyMergeNeighborE3').addEventListener('change',()=>this.choose($('propertyMergeNeighborE3').value));
    $('propertyMergeConsentE3').addEventListener('change',()=>{this.session.approve($('propertyMergeConsentE3').checked);this.refresh();});
    $('propertyMergeResetE3').addEventListener('click',()=>this.reset());
    $('propertyMergeCancelE3').addEventListener('click',()=>this.stop());
    $('propertyMergeApplyE3').addEventListener('click',()=>this.apply());
    $('propertyMergeUndoE3').addEventListener('click',()=>this.moveHistory('undo'));
    $('propertyMergeRedoE3').addEventListener('click',()=>this.moveHistory('redo'));
  }
}
