// Instrument finalizer only; no changes to acceptance, validator or charged search work.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const f=join(process.argv[2],'src/core/reconciliation-road-group.js');let s=readFileSync(f,'utf8');
function replace(a,b){assert.equal(s.split(a).length,2,'Anchor mismatch '+a.slice(0,80));s=s.replace(a,b);}
replace("import { validateStoredProject } from '../data/project-validation.js';","import { validateStoredProject } from '../data/project-validation.js';\nimport { segmentDistance,STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK } from './placement.js';");
replace("        if(remaining.length){lastIssue=remaining[0];return null;}",`        if(remaining.length){
          for(const issue of remaining.filter(i=>i.kind==='property'&&i.code==='road-setback')){
            const p0=propertyIndex.get(issue.id),p1=next.properties.find(p=>p.id===issue.id);
            const roadId=issue.relatedIds.find(id=>city.roads.some(r=>r.id===id));
            const r0=city.roads.find(r=>r.id===roadId),r1=next.roads.find(r=>r.id===roadId);
            const endpoints=(c,r)=>[c.nodes.find(n=>n.id===r.a),c.nodes.find(n=>n.id===r.b)];
            if(!p0||!p1||!r0||!r1)continue;
            const [a0,b0]=endpoints(city,r0),[a1,b1]=endpoints(next,r1);
            const dist=(p,a,b)=>Math.min(...p.boundary.map((v,i)=>segmentDistance(v,p.boundary[(i+1)%p.boundary.length],a,b)));
            const margin=r=>(STREET_WIDTHS[r.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
            const oldBlock=city.blocks.find(b=>b.id===p0.blockId),newBlock=next.blocks.find(b=>b.id===p1.blockId);
            const boundaryRoad=(block,r)=>block?.vertices.some((v,i)=>[v,block.vertices[(i+1)%block.vertices.length]].sort().join(':')===[r.a,r.b].sort().join(':'));
            const obs={type:'setback-audit',propertyId:issue.id,roadId,blockId:p0.blockId,policy:parcelPermissions.get(issue.id)?.mode??null,active:activeIds.has(issue.id),roadChanged:roadsChanged.has(roadId),blockChanged:changedBlocks.has(p0.blockId),propertyUnchanged:riEqual(p0.boundary,p1.boundary),roadUnchanged:riEqual(r0,r1)&&riEqual(a0,a1)&&riEqual(b0,b1),oldBoundaryRoad:boundaryRoad(oldBlock,r0),newBoundaryRoad:boundaryRoad(newBlock,r1),oldDistance:dist(p0,a0,b0),newDistance:dist(p1,a1,b1),oldRequired:margin(r0),newRequired:margin(r1),reported:issue.metrics??null};
            const records=globalThis.__lareParcelDiagnostic;
            if(records&&!records.some(x=>x.type==='setback-audit'&&JSON.stringify(x)===JSON.stringify(obs)))records.push(obs);
          }
          lastIssue=remaining[0];return null;
        }`);
writeFileSync(f,s);
console.log('LARE_SETBACK_CONFIG '+JSON.stringify({instrumentationOnly:true,validator:'unchanged'}));
