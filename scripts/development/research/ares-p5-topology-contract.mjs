import {segmentCuts} from '../../../src/core/boundary.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';

// Diagnostic classifications, not topology proposals or authority tokens.
// Match the graph oracle's segmentCuts; use conservative endpoint handling.
export const P5_LIMITS=Object.freeze({maxObjects:10000,maxHops:6,work:8000000,stateExpansions:32768,maxCandidates:256});
const modes=['strict','adaptive','restructure'];
const flags=['intersection','split','merge','overlap'];
export function p5Permissions(input){
  const keys=['mode',...flags];
  if(!input||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input))||
    Reflect.ownKeys(input).length!==keys.length||
    !keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,k)??{},'value'))||
    !modes.includes(input.mode)||!flags.every(k=>typeof input[k]==='boolean'))throw Error('Explicit detached P5 mode and permissions required.');
  return Object.freeze(Object.fromEntries(keys.map(k=>[k,input[k]])));
}
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const end=t=>t<=1e-9?'a':t>=1-1e-9?'b':null;
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function classifyP5Contact(a,b,c,d){
  if(![a,b,c,d].every(point)||Math.hypot(b.x-a.x,b.y-a.y)<1e-6||Math.hypot(d.x-c.x,d.y-c.y)<1e-6)return riFreeze({kind:'indeterminate',required:[]});
  const ab=segmentCuts(a,b,c,d),ba=segmentCuts(c,d,a,b);
  const cross=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);
  if(!ab.length&&!ba.length)return riFreeze({kind:'none',required:[],ab,ba});
  if(Math.abs(cross)<=1e-9){
    // Collinear point contacts and positive-length overlaps are not
    // interchangeable. Report ambiguity instead of snapping coordinates.
    const same=(p,q)=>p.x===q.x&&p.y===q.y;
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    const t=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;
    const lo=Math.max(0,Math.min(t(c),t(d))),hi=Math.min(1,Math.max(t(c),t(d)));
    if(hi-lo>1e-9)return riFreeze({kind:'overlap',required:['overlap'],ab,ba});
    if(hi===lo&&[a,b].some(p=>[c,d].some(q=>same(p,q))))return riFreeze({kind:'endpoint-endpoint',required:['intersection','merge'],ab,ba});
    return riFreeze({kind:'indeterminate',required:[],ab,ba});
  }
  if(ab.length!==1||ba.length!==1)return riFreeze({kind:'indeterminate',required:[],ab,ba});
  const t=ab[0],u=ba[0],e=end(t),f=end(u),p=lerp(a,b,t),q=lerp(c,d,u);
  if(Math.hypot(p.x-q.x,p.y-q.y)>1e-7)return riFreeze({kind:'indeterminate',required:[],ab,ba});
  // Never treat a near-coincident pair of accepted endpoints as an exact merge.
  if(e&&f){
    const x=e==='a'?a:b,y=f==='a'?c:d;
    if(x.x!==y.x||x.y!==y.y)return riFreeze({kind:'indeterminate',required:[],ab,ba});
  }
  return riFreeze({kind:e&&f?'endpoint-endpoint':e||f?'endpoint-interior':'interior-interior',
    required:e&&f?['intersection','merge']:['intersection','split'],ab,ba,point:p});
}
export function p5PermissionReasons(input,contact){
  const p=p5Permissions(input),reasons=[];
  if(p.mode!=='restructure')reasons.push('restructure-required');
  if(!contact||!['interior-interior','endpoint-interior','endpoint-endpoint','overlap'].includes(contact.kind))reasons.push('unclassified-contact');
  else{
    const required=contact.kind==='overlap'?['overlap']:contact.kind==='endpoint-endpoint'?['intersection','merge']:['intersection','split'];
    for(const k of required)if(!p[k])reasons.push('permission-'+k);
    // A permission to investigate an overlap never grants road deletion.
    if(contact.kind==='overlap')reasons.push('overlap-resolution-held');
    if(contact.kind==='endpoint-endpoint')reasons.push('identity-consolidation-held');
  }
  return Object.freeze(reasons);
}
