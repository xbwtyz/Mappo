import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
// E/F: shared identity inventory contract, NOT a candidate generator or
// verification token. Call inside an independent audit's existing root.
// Geometry, provenance, scope, permissions and domain checks remain the
// operation-specific auditor's responsibility. No new search/root here.
class Invalid extends Error{}
const need=(ok,reason)=>{if(!ok)throw new Invalid(reason);};
const ordered=(ids,b)=>{b.spend(Math.max(1,ids.length*Math.ceil(Math.log2(ids.length+1))));return [...ids].sort(riCompare);};
const unique=(ids,b)=>{b.spend(Math.max(1,ids.length));return new Set(ids).size===ids.length;};
function inventory(rows,b){
  const m=new Map();
  for(const row of rows){b.spend();need(row&&typeof row.id==='string'&&!m.has(row.id),'duplicate-or-invalid-identity');m.set(row.id,row);}
  return m;
}
const same=(a,c)=>a&&c&&Object.is(a.x,c.x)&&Object.is(a.y,c.y);
function difference(a,c,b){const out=[];for(const id of a.keys()){b.spend();if(!c.has(id))out.push(id);}return ordered(out,b);}
function retained(a,c,b){const out=[];for(const id of a.keys()){b.spend();if(c.has(id))out.push(id);}return ordered(out,b);}
export function inspectP5IdentityLedger({kind,original,candidate,splitChains=[],junctionAliases=[]},b){
  try{
    need(['split','synthetic-merge'].includes(kind),'unsupported-operation');
    const n0=inventory(original.nodes,b),r0=inventory(original.roads,b),n1=inventory(candidate.nodes,b),r1=inventory(candidate.roads,b);
    const nodes={retained:retained(n0,n1,b),created:difference(n1,n0,b),retired:difference(n0,n1,b)};
    const roads={retained:retained(r0,r1,b),created:difference(r1,r0,b),retired:difference(r0,r1,b)};
    need(!roads.retired.length,'road-retirement-held');
    const fresh=[...nodes.created,...roads.created];
    need(unique(fresh,b)&&fresh.every(id=>{b.spend();return !n0.has(id)&&!r0.has(id);}), 'reservation-collision');
    for(const e of r1.values()){b.spend();need(n1.has(e.a)&&n1.has(e.b)&&e.a!==e.b,'invalid-endpoint-reference');}
    const aliases=[],chains=[],claimed=new Set(),parents=new Set(),redirected=[];
    if(kind==='split'){
      need(!nodes.retired.length&&!junctionAliases.length&&splitChains.length>0,'split-retirement-or-empty');
      const junctionUses=new Map(nodes.created.map(id=>[id,0]));
      for(const chain of splitChains){
        b.spend();const parent=r0.get(chain.parent),children=chain.children;
        need(parent&&!parents.has(chain.parent)&&Array.isArray(children)&&children.length>=2&&children[0]===chain.parent,'split-parent');
        parents.add(chain.parent);
        let end=parent.a;
        for(let i=0;i<children.length;i++){
          b.spend();const id=children[i],child=r1.get(id);
          need(child&&!claimed.has(id)&&child.a===end&&child.kind===parent.kind,'split-chain');
          if(i)need(!r0.has(id),'split-child-not-reserved');
          claimed.add(id);end=child.b;
          if(i<children.length-1){need(junctionUses.has(end),'split-junction-not-reserved');junctionUses.set(end,junctionUses.get(end)+1);}
        }
        need(end===parent.b,'split-chain-end');
        chains.push({parent:chain.parent,children:[...children]});
      }
      for(const id of roads.created){b.spend();need(claimed.has(id),'unclaimed-new-road');}
      for(const count of junctionUses.values()){b.spend();need(count>=2,'unclaimed-new-junction');}
      for(const [id,e] of r0){b.spend();if(!parents.has(id)){const next=r1.get(id);need(next.a===e.a&&next.b===e.b&&next.kind===e.kind,'unrelated-road-rewire');}}
    }else{
      need(!splitChains.length&&!nodes.created.length&&!roads.created.length&&junctionAliases.length===1&&nodes.retired.length===1,'merge-inventory');
      const alias=junctionAliases[0];
      need(alias.retired===nodes.retired[0]&&alias.retired!==alias.survives&&n0.has(alias.survives)&&n1.has(alias.survives)&&same(n0.get(alias.retired),n1.get(alias.survives)),'merge-alias');
      aliases.push({...alias});
      const replace=id=>id===alias.retired?alias.survives:id;
      for(const [id,e] of r0){
        b.spend();const next=r1.get(id);
        need(next.a===replace(e.a)&&next.b===replace(e.b)&&next.kind===e.kind,'merge-rewire');
        if(next.a!==e.a||next.b!==e.b)redirected.push(id);
      }
      need(redirected.length>0,'unused-alias');
    }
    return riFreeze({status:'complete',kind,nodes,roads,splitChains:chains,junctionAliases:aliases,redirectedRoadIds:ordered(redirected,b),authority:'none'});
  }catch(e){if(e instanceof Invalid)return riFreeze({status:'rejected',reason:e.message,authority:'none'});throw e;}
}
