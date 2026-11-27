// Isolated experiment: never import this into the application or production
// worker. Compare fixed binary64 arithmetic in a dedicated disposable realm.
// Bounded trigonometric kernels use the fdlibm polynomial/reduction method.
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// Algorithm reference: https://www.netlib.org/fdlibm/
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { chromium,firefox } from 'playwright';
import { createProject } from '../../../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../../../src/core/spatial-recovery-road-adapter.js';

const engine=process.argv[2],locked='bbcbad96e73f85b19a2afd51743c9b6f00485daba564ee800576c5239bb80ec1';
assert.ok(['node','chromium','firefox'].includes(engine));
const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:true});
const operation=normalizeSpatialRoadGroup(project,0,['RD-0184','RD-0186'],
  {x:3.005274072121821,y:37.39896113564458},
  {destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(sha(project),'0be10579c05835e0ceeaae37845bc47979c156cdc0eb4825e3d7ecc253f807cc');
const request={version:1,requestId:1,sessionId:'isolated-math-pilot',projectJson:JSON.stringify(project),
  operation,quality:'high'};
const html=await readFile(new URL('../../../index.html',import.meta.url),'utf8');
const marker='const SRE_ROAD_WORKER_SOURCE_V1 = ';
const lines=html.split('\n').filter(s=>s.startsWith(marker));
assert.equal(lines.length,1);assert.ok(lines[0].endsWith(';'));
const source=JSON.parse(lines[0].slice(marker.length,-1));

// This prototype is deliberately limited to the finite geometry angle
// domain. It must not silently fall back to a native approximation.
function installPilotMath(mode){
  const native={hypot:Math.hypot,sin:Math.sin,cos:Math.cos,atan2:Math.atan2};
  const stats={hypot:0,sin:0,cos:0,atan2:0,outOfRange:0};
  const bits=new DataView(new ArrayBuffer(8));
  const word=x=>{bits.setFloat64(0,x,false);return bits.getUint32(0,false)&0x7fffffff;};
  const highDouble=h=>{bits.setUint32(0,h,false);bits.setUint32(4,0,false);return bits.getFloat64(0,false);};
  const negative=x=>x<0||Object.is(x,-0);
  function norm(...v){
    stats.hypot++;
    const m=Math.max(0,...v.map(Math.abs));
    if(v.some(x=>Math.abs(x)===Infinity))return Infinity;
    if(m===0||Number.isNaN(m))return m;
    let sum=0,correction=0;
    for(const x of v){const p=x/m,q=p*p-correction,t=sum+q;correction=(t-sum)-q;sum=t;}
    return m*Math.sqrt(sum);
  }
  // Fixed reduction of the small/medium angle range using split pi/2.
  const p1=1.57079632673412561417,p1t=6.07710050650619224932e-11;
  const p2=6.07710050630396597660e-11,p2t=2.02226624879595063154e-21;
  const p3=2.02226624871116645580e-21,p3t=8.47842766036889956997e-32;
  function reduce(x){
    if(!Number.isFinite(x)||Math.abs(x)>1024){stats.outOfRange++;throw Error('Math pilot angle outside qualified domain');}
    if(word(x)<=0x3fe921fb)return [0,x,0];
    const a=Math.abs(x),n=Math.floor(a*0.636619772367581382433+0.5);
    let r=a-n*p1,w=n*p1t,y=r-w;
    const exponent=word(a)>>>20;
    if(exponent-(word(y)>>>20)>16){
      const t=r;w=n*p2;r=t-w;w=n*p2t-((t-r)-w);y=r-w;
      if(exponent-(word(y)>>>20)>49){
        const t=r;w=n*p3;r=t-w;w=n*p3t-((t-r)-w);y=r-w;
      }
    }
    const tail=(r-y)-w;
    return negative(x)?[-n,-y,-tail]:[n,y,tail];
  }
  function sinSmall(x,y,hasTail){
    if(Math.abs(x)<2**-27)return x;
    const z=x*x,v=z*x;
    const p=8.33333333332248946124e-3+z*(-1.98412698298579493134e-4+
      z*(2.75573137070700676789e-6+z*(-2.50507602534068634195e-8+z*1.58969099521155010221e-10)));
    const s=-1.66666666666666324348e-1;
    return hasTail?x-((z*(0.5*y-v*p)-y)-v*s):x+v*(s+z*p);
  }
  function cosSmall(x,y){
    if(Math.abs(x)<2**-27)return 1;
    const z=x*x,r=z*(4.16666666666666019037e-2+z*(-1.38888888888741095749e-3+
      z*(2.48015872894767294178e-5+z*(-2.75573143513906633035e-7+
      z*(2.08757232129817482790e-9+z*-1.13596475577881948265e-11)))));
    const hi=word(x),correction=z*r-x*y;
    if(hi<0x3fd33333)return 1-(0.5*z-correction);
    const q=hi>0x3fe90000?0.28125:highDouble(hi-0x00200000);
    return (1-q)-((0.5*z-q)-correction);
  }
  function trig(x,cos){
    const [n,a,b]=reduce(x),q=(n+(cos?1:0))&3;
    if(q===0)return sinSmall(a,b,n!==0);
    if(q===1)return cosSmall(a,b);
    if(q===2)return -sinSmall(a,b,n!==0);
    return -cosSmall(a,b);
  }
  const hi=[4.63647609000806093515e-1,7.85398163397448278999e-1,9.82793723247329054082e-1,1.57079632679489655800];
  const lo=[2.26987774529616870924e-17,3.06161699786838301793e-17,1.39033110312309984516e-17,6.12323399573676603587e-17];
  const c=[3.33333333333329318027e-1,-1.99999999998764832476e-1,1.42857142725034663711e-1,
    -1.11111104054623557880e-1,9.09088713343650656196e-2,-7.69187620504482999495e-2,
    6.66107313738753120669e-2,-5.83357013379057348645e-2,4.97687799461593236017e-2,
    -3.65315727442169155270e-2,1.62858201153657823623e-2];
  function atanPositive(x){
    if(x<2**-27)return x;
    if(x>=2**66)return hi[3]+lo[3];
    let id=-1;
    if(x>=0.4375){
      if(x<0.6875){id=0;x=(2*x-1)/(2+x);}
      else if(x<1.1875){id=1;x=(x-1)/(x+1);}
      else if(x<2.4375){id=2;x=(x-1.5)/(1+1.5*x);}
      else{id=3;x=-1/x;}
    }
    const z=x*x,w=z*z;
    const s=z*(c[0]+w*(c[2]+w*(c[4]+w*(c[6]+w*(c[8]+w*c[10])))))+
      w*(c[1]+w*(c[3]+w*(c[5]+w*(c[7]+w*c[9]))));
    return id<0?x-x*s:hi[id]-((x*s-lo[id])-x);
  }
  function angle(y,x){
    if(!Number.isFinite(x)||!Number.isFinite(y)){stats.outOfRange++;throw Error('Nonfinite pilot atan2 input');}
    const negY=negative(y),negX=negative(x),sgn=negY?-1:1;
    if(y===0)return negX?sgn*Math.PI:y;
    if(x===0)return sgn*Math.PI/2;
    const k=(word(y)-word(x))>>20;
    if(k>60)return sgn*(Math.PI/2+0.5*1.2246467991473531772e-16);
    const z=negX&&k< -60?0:atanPositive(Math.abs(y/x));
    return negX?sgn*(Math.PI-(z-1.2246467991473531772e-16)):sgn*z;
  }
  // Compare raw math on the exact failing building rotation and a bounded
  // dense grid; no golden expectations are changed.
  const a=-4.627327488789011;
  const probe={angle:a,nativeSin:native.sin(a),nativeCos:native.cos(a),fixedSin:trig(a,false),fixedCos:trig(a,true),
    maxSinError:0,maxCosError:0,maxAtanError:0};
  for(let i=-4096;i<=4096;i++){
    const x=i/256;
    probe.maxSinError=Math.max(probe.maxSinError,Math.abs(trig(x,false)-native.sin(x)));
    probe.maxCosError=Math.max(probe.maxCosError,Math.abs(trig(x,true)-native.cos(x)));
    probe.maxAtanError=Math.max(probe.maxAtanError,Math.abs(angle(x,1-i/2048)-native.atan2(x,1-i/2048)));
  }
  if(Math.max(probe.maxSinError,probe.maxCosError,probe.maxAtanError)>2e-15)throw Error('Pilot kernel accuracy failed');
  if(mode!=='baseline')Math.hypot=norm;
  if(mode==='norm-trig'){
    Math.sin=x=>{stats.sin++;return trig(x,false);};
    Math.cos=x=>{stats.cos++;return trig(x,true);};
    Math.atan2=(y,x)=>{stats.atan2++;return angle(y,x);};
  }
  globalThis.__mathPilot={stats,probe};
}
const out=[];
async function nodeRun(program){
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    globalThis.WorkerGlobalScope=class {};
    globalThis.self=new WorkerGlobalScope();
    self.addEventListener=(_,fn)=>parentPort.on('message',data=>fn({data}));
    self.postMessage=data=>parentPort.postMessage({data,pilot:globalThis.__mathPilot});
    (0,eval)(workerData);
  `,{eval:true,workerData:program});
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Pilot Node timeout')),480000);
    worker.once('message',v=>{clearTimeout(timer);resolve(v);});
    worker.once('error',e=>{clearTimeout(timer);reject(e);});
    worker.postMessage(request);
  });}finally{await worker.terminate();}
}
async function browserRun(browser,program){
  const page=await browser.newPage({offline:true});
  try{return await page.evaluate(({program,request})=>new Promise((resolve,reject)=>{
    const wrap=program+'\n;'; // install wrapper before worker implementation
    const transport='const mathPilotPost=self.postMessage.bind(self);self.postMessage=data=>mathPilotPost({data,pilot:globalThis.__mathPilot});\n';
    const url=URL.createObjectURL(new Blob([transport,wrap],{type:'text/javascript'}));
    const worker=new Worker(url);URL.revokeObjectURL(url);
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Pilot browser timeout'));},480000);
    worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
    worker.postMessage(request);
  }),{program,request});}finally{await page.close();}
}
const browser=engine==='node'?null:await (engine==='chromium'?chromium:firefox).launch({headless:true});
try{
  for(const mode of ['norm','norm-trig']){
    const start=performance.now();
    try{
      const program='('+installPilotMath.toString()+')('+JSON.stringify(mode)+');\n'+source;
      const {data,pilot}=await (browser?browserRun(browser,program):nodeRun(program));
      if(data.error)throw Error(data.error);
      const result=data.result;
      const row={engine,mode,status:result.status,fingerprint:result.delta?.candidateFingerprint??null,
        matchesLocked:result.delta?.candidateFingerprint===locked,retired:result.delta?.retired??[],
        added:result.delta?.added?.map(x=>x.ref)??[],work:result.stats,pilot,
        seconds:(performance.now()-start)/1000};
      out.push(row);console.log('SRE_MATH_PILOT '+JSON.stringify(row));
    }catch(error){const row={engine,mode,status:'error',error:String(error),seconds:(performance.now()-start)/1000};out.push(row);console.log('SRE_MATH_PILOT '+JSON.stringify(row));}
  }
}finally{await browser?.close();}
await mkdir('artifacts/sre-math-pilot',{recursive:true});
await writeFile('artifacts/sre-math-pilot/'+engine+'.json',JSON.stringify({engine,locked,source:process.env.GITHUB_SHA,input:sha(project),operation,out},null,2)+'\n');
// This is evidence collection, not the mandatory product acceptance gate.
if(out.length!==2||out.some(x=>x.status!=='verified-witness'||x.pilot?.stats?.outOfRange))process.exitCode=1;
