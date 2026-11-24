import test from 'node:test';
import assert from 'node:assert/strict';
import {InspectorPresentationA3,inspectorFactsA3} from '../src/ui/workspace.js';
function harness(){
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{hidden:false,attrs:{},textContent:'',
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    addEventListener(k,fn){this[k]=fn;},closest(){return this.hidden?this:null;}});
    return elements.get(id);};
  return {el,c:new InspectorPresentationA3(el)};
}
test('A3 presentation keeps view for same context and invalidates replaced context',()=>{
  const {el,c}=harness(),host=el('host'),config={key:'building:1',kind:'building',host,
    views:['Details','Edit','Review'],initial:'Edit',buttons:{Details:'details',Edit:'edit',Review:'review'}};
  c.present('place',config);
  assert.equal(c.select('place','Review'),true);
  assert.equal(c.present('place',config).view,'Review');
  assert.equal(el('review').attrs['aria-pressed'],'true');
  assert.equal(c.present('place',{...config,key:'building:2'}).view,'Edit');
  assert.equal(c.select('place','Details',{key:'building:1'}),false);
  assert.equal(c.select('place','Unknown'),false);
  c.release('place');assert.equal(c.current('place'),null);
  assert.equal(host.attrs['data-inspector-view'],undefined);
});
test('A3 higher-priority visible owner guards callbacks and group writes',()=>{
  const {el,c}=harness();let called=0;
  c.present('selection',{key:'property:1',kind:'property',host:el('selection'),views:['Details','Edit'],priority:10,onView:()=>called++});
  c.present('road',{key:'group:1',kind:'road-group',host:el('road'),priority:40});
  assert.equal(c.active().owner,'road');
  assert.equal(c.select('road','Edit',{notify:true}),false);
  assert.equal(c.select('selection','Edit',{notify:true}),false);
  el('road').hidden=true;
  assert.equal(c.select('selection','Edit',{notify:true}),true);
  assert.equal(called,1);
});
test('A3 renders domain facts as literal text and no actions or mutation',()=>{
  const {el,c}=harness(),descriptor={sections:[{rows:[['Name','<script>unsafe</script>']],actions:[{run:()=>assert.fail()}]}]};
  c.present('selection',{key:'property:1',kind:'property',host:el('host'),factsId:'facts',rows:inspectorFactsA3(descriptor)});
  assert.equal(el('facts').textContent,'Name: <script>unsafe</script>');
});
