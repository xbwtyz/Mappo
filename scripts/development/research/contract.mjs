// DEV-OPT P3a: closed, versioned research contract. No application authority.
import {createHash} from 'node:crypto';
const fail=(ok,msg)=>{if(!ok)throw Error(msg);};
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const gateNames=['storedProject','topology','nonmutation','permissions','authoredPreservation','deterministicReplay'];
export const strategies=['production','selective-adaptive','enhanced-adaptive'];
export function validateResearchManifest(m){
  fail(exact(m,['version','sourceRevision','adapter','environment','budget','cases','strategies']),'Invalid manifest fields.');
  fail(m.version===1&&/^[a-f0-9]{40}$/.test(m.sourceRevision)&&m.adapter==='lare-road-preservation-v1','Unsupported manifest identity.');
  fail(exact(m.environment,['nodeMajor','platform'])&&int(m.environment.nodeMajor,22,22)&&['linux','win32','darwin'].includes(m.environment.platform),'Unsupported environment.');
  fail(exact(m.budget,['timeoutMs','concurrency'])&&int(m.budget.timeoutMs,100,120000)&&int(m.budget.concurrency,1,4),'Invalid execution budget.');
  fail(Array.isArray(m.strategies)&&m.strategies.length>=2&&m.strategies.length<=strategies.length&&new Set(m.strategies).size===m.strategies.length&&m.strategies.every(s=>strategies.includes(s)),'Invalid strategy inventory.');
  fail(Array.isArray(m.cases)&&int(m.cases.length,2,32),'Invalid case inventory.');
  const ids=new Set(),inputs=new Set();
  for(const c of m.cases){
    fail(exact(c,['id','partition','project','roadIds','offset'])&&id(c.id)&&!ids.has(c.id)&&['development','held-out'].includes(c.partition),'Invalid case identity.');
    fail(exact(c.project,['seed','size','morphology','irregularProperties'])&&typeof c.project.seed==='string'&&c.project.seed.length>0&&c.project.seed.length<=128&&['small','medium'].includes(c.project.size)&&['organic','linear','planned','radial'].includes(c.project.morphology)&&typeof c.project.irregularProperties==='boolean','Invalid project fixture.');
    fail(Array.isArray(c.roadIds)&&int(c.roadIds.length,2,16)&&new Set(c.roadIds).size===c.roadIds.length&&c.roadIds.every(r=>typeof r==='string'&&/^RD-[0-9]{4,}$/.test(r)),'Invalid road IDs.');
    fail(exact(c.offset,['x','y'])&&finite(c.offset.x)&&finite(c.offset.y)&&Math.abs(c.offset.x)<=100&&Math.abs(c.offset.y)<=100&&(c.offset.x!==0||c.offset.y!==0),'Invalid movement.');
    const k=digest([c.project,c.roadIds.slice().sort(),c.offset.x,c.offset.y]);
    fail(!inputs.has(k),'Duplicate fixture/movement across partitions.');inputs.add(k);ids.add(c.id);
  }
  fail(m.cases.some(c=>c.partition==='development')&&m.cases.some(c=>c.partition==='held-out'),'Both corpus partitions required.');
  return m;
}
export function expandResearchManifest(m){
  validateResearchManifest(m);
  return m.cases.flatMap(c=>m.strategies.map(strategy=>({version:1,manifestDigest:digest(m),sourceRevision:m.sourceRevision,adapter:m.adapter,environment:m.environment,case:c,strategy,key:c.id+':'+strategy})));
}
export function aggregateResearch(m,rows){
  const expected=expandResearchManifest(m),byKey=new Map(),unknown=[];
  fail(Array.isArray(rows),'Invalid result inventory.');
  for(const row of rows){
    fail(row&&typeof row.key==='string'&&!byKey.has(row.key),'Duplicate result.');
    byKey.set(row.key,row);
  }
  const results=expected.map(e=>{
    const r=byKey.get(e.key);
    if(!r)return {key:e.key,status:'missing'};
    byKey.delete(e.key);
    if(r.sourceRevision!==e.sourceRevision||r.manifestDigest!==e.manifestDigest||r.inputDigest!==digest(e)||!['verified','refused','failed','timeout','cancelled','incomplete'].includes(r.status))return {key:e.key,status:'invalid-evidence',original:r};
    if(r.status==='verified'){
      if(!exact(r.gates,gateNames)||!gateNames.every(g=>r.gates[g]===true)||!/^[a-f0-9]{64}$/.test(r.candidateFingerprint)||!Number.isFinite(r.elapsedMs)||r.elapsedMs<0||!int(r.retired,0,0))return {...r,status:'invalid-evidence'};
    }
    if(r.status==='refused'&&(!r.gates||r.gates.nonmutation!==true||r.gates.deterministicReplay!==true||r.candidateFingerprint!==null))return {...r,status:'invalid-evidence'};
    return r;
  });
  unknown.push(...byKey.keys());
  const complete=unknown.length===0&&results.every(r=>['verified','refused'].includes(r.status));
  const summary=m.strategies.map(strategy=>{
    const subset=results.filter(r=>r.key.endsWith(':'+strategy));
    const count=partition=>m.cases.filter(c=>c.partition===partition&&subset.some(r=>r.key===c.id+':'+strategy&&r.status==='verified')).length;
    return {strategy,verified:subset.filter(r=>r.status==='verified').length,refused:subset.filter(r=>r.status==='refused').length,developmentVerified:count('development'),heldOutVerified:count('held-out'),eligibleForComparison:complete};
  });
  return {version:1,manifestDigest:digest(m),sourceRevision:m.sourceRevision,complete,unknown,results,summary,productionAdoptionAuthorized:false};
}
