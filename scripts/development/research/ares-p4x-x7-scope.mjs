import {readFileSync} from 'node:fs';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
export const X7_SCOPE=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4x-x7-minima.json',import.meta.url),'utf8')));
export const X7_IDS=Object.freeze(X7_SCOPE.rows.map(r=>r.id));
const histogram={};
for(const r of X7_SCOPE.rows){
  if(!Number.isInteger(r.minimum)||r.minimum<5||r.minimum>10||r.witness.length!==r.minimum||new Set(r.witness).size!==r.minimum)throw Error('Invalid X7 frozen minimum.');
  histogram[r.minimum]=(histogram[r.minimum]??0)+1;
}
if(X7_IDS.length!==17||new Set(X7_IDS).size!==17||JSON.stringify(histogram)!==JSON.stringify({5:4,6:6,7:2,9:4,10:1}))throw Error('Invalid X7 frozen inventory.');
export function x7Recipe(caseId){
  const r=typeof caseId==='string'&&caseId.startsWith('g:')?X7_SCOPE.rows.find(r=>r.id===caseId.slice(2)):null;
  if(!r)throw Error('Unapproved X7 research case.');
  return r;
}
export function x7Options(caseId){
  const r=x7Recipe(caseId);
  return Object.freeze({mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:256,maxNeighbors:r.minimum});
}
const order=(a,b)=>riCompare(a,b);
function sort(a,b){b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(order);}
function reachable(start,adj,allowed,b){
  const seen=new Set([start]),q=[start];
  for(let i=0;i<q.length;i++){b.spend();for(const n of adj.get(q[i])){b.spend();if(allowed.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}}}
  return seen;
}
// Read-only minimum group enumeration. The archive is a candidate seed,
// not authority: reconstruct allowed endpoints/paths from this fresh graph,
// check every baseline pair and verify all group members anew.
export function x7Groups(graph,rows,selected,pairs,budget,telemetry,recipe){
  const cap=recipe.minimum,eligible=new Set(rows.map(r=>r.ref.id)),direct=new Set(pairs.flatMap(p=>p.movable)),adj=new Map();
  if(cap<5||cap>10||!pairs.length||pairs.some(p=>!p.movable.length))throw Error('X7 invalid fresh scope.');
  for(const id of sort([...eligible],budget)){
    const reached=reachable(id,graph.adjacency,new Set([id,...selected]),budget),next=new Set();
    for(const n of reached)for(const v of graph.adjacency.get(n)){budget.spend();if(v!==id&&eligible.has(v))next.add(v);}
    adj.set(id,sort([...next],budget));
  }
  const unique=new Map();
  for(const p of pairs){budget.spend(1+p.movable.length);const ids=sort([...p.movable],budget);if(!ids.every(id=>eligible.has(id)))throw Error('X7 ineligible conflict endpoint.');unique.set(JSON.stringify(ids),ids);}
  const clauses=[...unique.values()];
  budget.spend(Math.max(1,clauses.length*Math.ceil(Math.log2(clauses.length+1))));
  clauses.sort((a,b)=>a.length-b.length||order(JSON.stringify(a),JSON.stringify(b)));
  const seed=sort([...recipe.witness],budget),seedSet=new Set(seed);
  function covers(set){for(const p of pairs){budget.spend(1+p.movable.length);if(!p.movable.some(id=>set.has(id)))return false;}return true;}
  function connected(set){return set.size>0&&reachable(set.values().next().value,adj,set,budget).size===set.size;}
  if(seed.length!==cap||seedSet.size!==cap||seed.some(id=>!eligible.has(id)||selected.has(id))||!covers(seedSet)||!connected(seedSet))throw Error('X7 historical minimum witness no longer matches fresh eligibility.');
  telemetry.seedValidated=true;
  const groups=[seed],keys=new Set([JSON.stringify(seed)]),seen=new Set();
  telemetry.coveringGroups=1;
  // An unmet clause must gain an endpoint; once covered, a disconnected
  // set must cross a component cut. Search only at the proven minimum.
  // Stop after 32 retained groups or 8192 charged states. Leave the
  // remaining shared budget to the existing geometric candidate oracle.
  function visit(chosen){
    budget.spend();
    if(telemetry.groupLimit||telemetry.enumerationLimit)return;
    const ids=sort([...chosen],budget),key=JSON.stringify(ids);budget.spend(1+ids.length);
    if(seen.has(key))return;
    if(seen.size>=8192){telemetry.enumerationLimit=true;return;}
    seen.add(key);budget.expand();telemetry.subsets++;
    let branch=null;
    for(const c of clauses){budget.spend(1+c.length);if(!c.some(id=>chosen.has(id))){branch=c;break;}}
    if(!branch){
      const reached=reachable(ids[0],adj,chosen,budget);
      if(reached.size===chosen.size){
        if(ids.length!==cap)throw Error('Fresh X7 group contradicts frozen minimum.');
        if(!keys.has(key)){keys.add(key);groups.push(ids);telemetry.coveringGroups++;if(groups.length===32)telemetry.groupLimit=true;}
        return;
      }
      const frontier=new Set();
      for(const n of reached)for(const v of adj.get(n)){budget.spend();if(!chosen.has(v))frontier.add(v);}
      branch=sort([...frontier],budget);
    }
    if(chosen.size>=cap)return;
    for(const id of branch){budget.spend(1+chosen.size);const next=new Set(chosen);next.add(id);visit(next);if(telemetry.groupLimit||telemetry.enumerationLimit)return;}
  }
  visit(new Set());
  telemetry.connectedGroups=groups.length;
  telemetry.connectorGroups=groups.filter(ids=>ids.some(id=>!direct.has(id))).length;
  return groups;
}
