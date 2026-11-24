import { isMapShortcutEvent } from '../core/shortcut-scope.js';

// Runtime routing registry: domain sessions remain authoritative for drafts.
export class ToolCoordinatorA2 {
  constructor(){this.tools=new Map();}
  register(tool){
    if(!tool||typeof tool.id!=='string'||!tool.id||typeof tool.active!=='function'||this.tools.has(tool.id))
      throw Error('Invalid or duplicate tool registration.');
    const descriptor=Object.freeze({...tool});this.tools.set(tool.id,descriptor);return descriptor;
  }
  resolve(context,group=null){
    return [...this.tools.values()].find(t=>(group===null||t.group===group)&&t.active(context))??null;
  }
  eligible(id,context){
    const t=this.tools.get(id);return Boolean(t&&(!t.canActivate||t.canActivate(context)));
  }
  requestLeave(context,leave,cancel){
    if(leave(context)===false)return false;
    cancel?.();return true;
  }
  requestActivation(id,context,{leave=()=>true,cancel=()=>{}}={}){
    if(!this.eligible(id,context)||!this.requestLeave(context,leave,cancel))return false;
    return this.tools.get(id).activate?.(context)!==false;
  }
}
export class GestureOwnerA2 {
  constructor(){this.owner=null;}
  claim(owner){
    if(this.owner||!owner||typeof owner.end!=='function')return false;
    this.owner=owner;return true;
  }
  move(...args){return this.owner?.move?.(...args);}
  finish(cancelled=false,event=null){
    const owner=this.owner;
    if(!owner)return false;
    this.owner=null;owner.end(cancelled,event);return true;
  }
}

export function bindCanvasInteraction(canvas,camera,requestDraw,updateViewport,editor,onTap=()=>{},onHover=()=>{},transform={}) {
  let active=false,panning=false,lastX=0,lastY=0,space=false,tapEligible=false,travel=0,
    tapPoint=null,tapModifiers={},activePointer=null,transforming=false;
  const owner=new GestureOwnerA2();
  const currentEditor=()=>editor.capture?.()??editor;
  const world=e=>{
    const r=canvas.getBoundingClientRect();
    return camera.screenToWorld({x:e.clientX-r.left,y:e.clientY-r.top});
  };
  function finish(cancelled=false,event=null){
    if(!active)return;
    const pointer=activePointer,wasPanning=panning,wasTap=tapEligible&&travel<=4;
    active=false;activePointer=null;panning=transforming=tapEligible=false;
    canvas.classList.remove('is-dragging');
    try{
      if(!owner.finish(cancelled,event)&&wasPanning&&!cancelled&&wasTap)onTap(tapPoint,tapModifiers);
    }finally{
      if(cancelled&&canvas.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);
    }
  }
  window.addEventListener('blur',()=>{space=false;finish(true);});
  canvas.addEventListener('pointerdown',event=>{
    if(active||(event.button!==0&&event.button!==1))return;
    event.preventDefault();canvas.focus();active=true;activePointer=event.pointerId;onHover(null);
    const target=currentEditor();
    panning=space||event.button===1||target.mode==='pan';
    lastX=event.clientX;lastY=event.clientY;travel=0;
    tapEligible=event.button===0&&!space&&target.mode==='pan';
    tapPoint=world(event);tapModifiers={shiftKey:Boolean(event.shiftKey)};
    const claimed=event.button===0&&!space&&target.mode==='pan'
      ?transform.begin?.(tapPoint,camera.zoom,event):null;
    if(!active){if(claimed)transform.end?.(true,event,claimed);return;}
    transforming=Boolean(claimed);
    if(transforming){
      owner.claim({move:(p,e)=>transform.move?.(p,e,claimed),end:(c,e)=>transform.end?.(c,e,claimed)});
      panning=false;tapEligible=false;
    }else if(!panning){
      owner.claim({move:p=>target.move(p,camera.zoom),end:c=>target.up(camera.zoom,c)});
    }
    canvas.setPointerCapture(event.pointerId);
    if(panning)canvas.classList.add('is-dragging');
    else if(!transforming)target.down(world(event),camera.zoom);
  });
  canvas.addEventListener('pointermove',event=>{
    if(active&&activePointer!==event.pointerId)return;
    if(!active){onHover(editor.mode==='pan'?world(event):null);return;}
    if(transforming){owner.move(world(event),event);requestDraw();}
    else if(panning){
      travel+=Math.hypot(event.clientX-lastX,event.clientY-lastY);
      camera.pan(event.clientX-lastX,event.clientY-lastY);
      lastX=event.clientX;lastY=event.clientY;requestDraw();updateViewport();
    }else owner.move(world(event),event);
  });
  canvas.addEventListener('pointerup',event=>{if(active&&activePointer===event.pointerId)finish(false,event);});
  canvas.addEventListener('pointerleave',()=>onHover(null));
  for(const type of ['pointercancel','lostpointercapture'])
    canvas.addEventListener(type,event=>{if(active&&activePointer===event.pointerId)finish(true);});
  canvas.addEventListener('dblclick',event=>{
    const target=currentEditor();if(active||target.mode==='pan')return;
    target.addPoint(world(event),camera.zoom);event.preventDefault();
  });
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();if(active)return;onHover(null);
    const r=canvas.getBoundingClientRect();
    camera.zoomAt(Math.exp(-event.deltaY*.0013),{x:event.clientX-r.left,y:event.clientY-r.top});
    requestDraw();updateViewport();
  },{passive:false});
  return Object.freeze({setSpace:value=>{space=Boolean(value);},
    cancel:()=>{const wasActive=active;finish(true);return wasActive;},
    get active(){return active;},get gestureOwner(){return owner.owner;}});
}
