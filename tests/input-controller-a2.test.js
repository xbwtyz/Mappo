import test from 'node:test';
import assert from 'node:assert/strict';
import {ToolCoordinatorA2,GestureOwnerA2,bindCanvasInteraction} from '../src/ui/controllers.js';
import {dispatchInputCommandA2} from '../src/core/shortcut-scope.js';
test('A2 registry priority, duplicate and ineligible activation',()=>{
  const c=new ToolCoordinatorA2();let activated=0,cancelled=0;
  c.register({id:'road',group:'edit',active:x=>x.road,canActivate:x=>x.road,activate:()=>activated++});
  c.register({id:'building',group:'edit',active:x=>x.building});
  assert.equal(c.resolve({road:true,building:true},'edit').id,'road');
  assert.equal(c.resolve({building:true}).id,'building');
  assert.throws(()=>c.register({id:'road',active:()=>true}));
  assert.equal(c.requestActivation('road',{road:true},{leave:()=>false,cancel:()=>cancelled++}),false);
  assert.equal(c.requestActivation('road',{road:false},{cancel:()=>cancelled++}),false);
  assert.equal(activated,0);assert.equal(cancelled,0);
  assert.equal(c.requestActivation('road',{road:true},{cancel:()=>cancelled++}),true);
  assert.equal(activated,1);assert.equal(cancelled,1);
});
test('A2 gesture has one owner and terminates exactly once',()=>{
  const g=new GestureOwnerA2(),events=[];
  assert.equal(g.claim({move:p=>events.push(p),end:c=>{events.push(c);assert.equal(g.finish(),false);}}),true);
  assert.equal(g.claim({end:()=>assert.fail()}),false);
  g.move('move');assert.equal(g.finish(true),true);assert.equal(g.finish(),false);
  g.move('late');assert.deepEqual(events,['move',true]);
});
test('A2 canvas captures direct editor across context changes and ignores late events',()=>{
  const events=[],handlers={};
  const w=globalThis.window,d=globalThis.document;
  globalThis.window={addEventListener(){}};globalThis.document={};
  try{
    let current='a';
    const make=id=>({mode:'edit',down:()=>events.push(id+' down'),move:()=>events.push(id+' move'),
      up:(z,c)=>events.push(id+' end '+c),addPoint(){}});
    const a=make('a'),b=make('b');
    const canvas={addEventListener:(k,f)=>handlers[k]=f,focus(){},classList:{add(){},remove(){}},
      setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0})};
    const camera={zoom:1,screenToWorld:p=>p,pan(){},zoomAt(){}};
    const control=bindCanvasInteraction(canvas,camera,()=>{},()=>{},{get mode(){return 'edit';},capture:()=>current==='a'?a:b});
    const fire=(key,id=1)=>handlers[key]({pointerId:id,button:0,clientX:5,clientY:5,preventDefault(){}});
    fire('pointerdown');current='b';fire('pointermove');fire('pointermove',2);fire('lostpointercapture');fire('pointerup');
    assert.deepEqual(events,['a down','a move','a end true']);assert.equal(control.active,false);
    fire('pointerdown');fire('pointerup');assert.deepEqual(events.slice(-2),['b down','b end false']);
  }finally{globalThis.window=w;globalThis.document=d;}
});
test('A2 dispatch preserves focus and consumed events, executes at most one command',()=>{
  const calls=[],commands=[{scope:'map',match:e=>e.key==='Delete',run:()=>calls.push('delete')},
    {scope:'map',match:()=>true,run:()=>calls.push('fallback')}];
  assert.equal(dispatchInputCommandA2({key:'Delete'},{tagName:'INPUT'},commands),false);
  assert.equal(dispatchInputCommandA2({key:'Delete',defaultPrevented:true},{tagName:'CANVAS'},commands),false);
  assert.equal(dispatchInputCommandA2({key:'Delete',isComposing:true},{tagName:'CANVAS'},commands),false);
  assert.equal(dispatchInputCommandA2({key:'Delete'},{tagName:'CANVAS'},commands),true);
  assert.deepEqual(calls,['delete']);
});
