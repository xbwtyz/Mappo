import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCanvasInteraction } from '../src/ui/controllers.js';

test('only the owning pointer moves, releases, or cancels the map gesture', () => {
  const events = {}, globalEvents = {};
  const canvas = {
    handlers:events, focus(){}, setPointerCapture(){},
    classList:{add(){},remove(){}},
    addEventListener(name, fn){events[name]=fn},
    getBoundingClientRect(){return {left:0,top:0}}
  };
  const editor = {mode:'edit',downs:0,moves:0,ups:[],
    down(){this.downs++},move(){this.moves++},up(zoom,cancel){this.ups.push(Boolean(cancel))},addPoint(){}};
  const camera = {zoom:1,screenToWorld:p=>p,pan(){},zoomAt(){}};
  const savedWindow=globalThis.window,savedDocument=globalThis.document;
  globalThis.window={addEventListener(n,fn){globalEvents[n]=fn}};
  globalThis.document={activeElement:{tagName:'CANVAS'}};
  try {
    bindCanvasInteraction(canvas,camera,()=>{},()=>{},editor);
    const ev=(id=1)=>({pointerId:id,button:0,clientX:42,clientY:46,preventDefault(){}});
    events.pointerdown(ev());
    events.pointerdown(ev(2));
    events.pointermove(ev(2));
    events.pointerup(ev(2));
    assert.equal(editor.downs,1);
    assert.equal(editor.moves,0);
    assert.equal(editor.ups.length,0);
    events.pointermove(ev());
    events.pointercancel(ev());
    assert.equal(editor.moves,1);
    assert.deepEqual(editor.ups,[true]);
    events.pointerdown(ev(2));
    events.pointerup(ev(2));
    assert.deepEqual(editor.ups,[true,false]);
    events.dblclick({...ev(),preventDefault(){}});
    assert.equal(editor.ups.length,2);
  } finally {
    globalThis.window=savedWindow;globalThis.document=savedDocument;
  }
});
