// Opt-in full baseline. Use a clean detached worktree at the exact B1 commit.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const BASELINE='e5f1cf83dcdcc75e52911aa717035955b40569d0';
const [rootArg,outArg,firstArg='0',countArg='20']=process.argv.slice(2);
const first=Number(firstArg),count=Number(countArg);
if(!Number.isInteger(first)||!Number.isInteger(count)||first<0||count<1||first+count>20)throw Error('Invalid project range');
if(!rootArg||!outArg)throw Error('Usage: node scripts/lare-baseline.mjs BASELINE_CHECKOUT OUTPUT_DIRECTORY');
const root=resolve(rootArg),out=resolve(outArg);
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==BASELINE||git('status','--porcelain','--untracked-files=no'))
  throw Error('Baseline checkout must be the exact clean B1 merge commit.');
const load=p=>import(pathToFileURL(join(root,p)).href);
const [{createProject},{buildRoadGraph},{resolveRoadGroupB1},{prepareRoadGroupReflowB1},
  {validateRoadGroupApplyB1},{defaultWorkspace},{validateStoredProject}]=await Promise.all([
  load('src/core/city-model.js'),load('src/core/road-graph.js'),load('src/core/road-group-b1.js'),
  load('src/core/neighborhood-reflow.js'),load('src/editor/road-application.js'),
  load('src/data/project-format.js'),load('src/data/project-validation.js')]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const offsets=[{x:.05,y:0},{x:0,y:.05},{x:.5,y:-.5},{x:-.5,y:.5},
  {x:2,y:0},{x:0,y:-2},{x:4,y:3},{x:-8,y:-5}];
const initialSeeds={planned:'c2-planned',organic:'b1-organic',radial:'b1-radial',linear:'b1-linear'};
await mkdir(join(out,'projects'),{recursive:true});
function selectGroups(project){
  const graph=buildRoadGraph(project.city),groups=new Map();
  if(!graph.valid)throw Error('Invalid baseline graph');
  const add=(ids,kind)=>{
    const sorted=[...new Set(ids)].sort(cmp),key=sorted.join('|');
    if(sorted.length<2||groups.has(key))return;
    if(resolveRoadGroupB1(graph,sorted).eligible)groups.set(key,{ids:sorted,kind,key});
  };
  const edges=new Map(project.city.roads.map(r=>[[r.a,r.b].sort(cmp).join('|'),r.id]));
  for(const b of project.city.blocks.slice().sort((a,b)=>cmp(a.id,b.id))){
    const ids=b.vertices.map((id,i)=>edges.get([id,b.vertices[(i+1)%b.vertices.length]].sort(cmp).join('|')));
    if(ids.every(Boolean))add(ids,'loop');
  }
  for(const n of project.city.nodes.slice().sort((a,b)=>cmp(a.id,b.id))){
    const ids=[...(graph.incidentRoads.get(n.id)??[])].sort(cmp);
    if(ids.length>=3)add(ids.slice(0,3),'branch');
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)add([ids[i],ids[j]],'chain');
  }
  const selected=[];
  for(const kind of ['chain','branch','loop']){
    const list=[...groups.values()].filter(g=>g.kind===kind).sort((a,b)=>cmp(a.key,b.key));
    if(list.length)selected.push(list[Math.floor(list.length/2)]);
  }
  const rest=[...groups.values()].filter(g=>!selected.some(s=>s.key===g.key)).sort((a,b)=>cmp(a.key,b.key));
  while(selected.length<5&&rest.length)selected.push(rest.splice(Math.floor(rest.length/2),1)[0]);
  if(selected.length!==5)throw Error('Fewer than five eligible groups: '+project.seed);
  return selected;
}
const rows=[],projects=[];
for(const morphology of Object.keys(initialSeeds))for(let index=0;index<5;index++){
  const ordinal=Object.keys(initialSeeds).indexOf(morphology)*5+index;
  if(ordinal<first||ordinal>=first+count)continue;
  const options={seed:index===0?initialSeeds[morphology]:'lare-'+morphology+'-'+index,
    morphology,size:index===4?'medium':'small',irregularProperties:index%2===0};
  const project=createProject(options);validateStoredProject(project);
  const serialized=JSON.stringify(project),fingerprint=hash(serialized),projectId=morphology+'-'+index;
  await writeFile(join(out,'projects',projectId+'.json'),serialized+'\n');
  projects.push({projectId,options,fingerprint});
  const workspace=defaultWorkspace(project);
  for(const group of selectGroups(project))for(let vector=0;vector<offsets.length;vector++){
    const offset=offsets[vector],started=performance.now();
    const preview=prepareRoadGroupReflowB1(project,group.ids,offset);
    const previewMs=performance.now()-started;
    const receipt=preview.candidateProject?validateRoadGroupApplyB1(project,workspace,
      {selectedRoadIds:group.ids,offset},preview):null;
    const accepted=Boolean(receipt?.ok),candidate=accepted?receipt.candidate:null;
    if(candidate)validateStoredProject(candidate);
    if(JSON.stringify(project)!==serialized)throw Error('Baseline mutated input: '+projectId);
    const issues=preview.candidateProject?(receipt?.issues??[]):preview.unresolved;
    rows.push({projectId,fingerprint,groupKind:group.kind,roadIds:group.ids,vector,offset,accepted,
      candidateFingerprint:candidate?hash(JSON.stringify(candidate)):null,
      issues:issues.map(i=>({code:i.code,kind:i.kind??null,id:i.id??null,relatedIds:i.relatedIds??[],message:i.message})),
      changed:accepted?receipt.changed:[],previewMs});
  }
  await writeFile(join(out,'baseline.partial.json'),JSON.stringify({baseline:BASELINE,projects,rows},null,2)+'\n');
  console.log(projectId+': '+rows.length+'/'+(40*count));
}
if(rows.length!==40*count||projects.length!==count)throw Error('Incomplete baseline corpus');
const accepted=rows.filter(r=>r.accepted).length;
await writeFile(join(out,'baseline.json'),JSON.stringify({baseline:BASELINE,node:process.version,projects,rows,
  summary:{attempted:rows.length,accepted,rejected:rows.length-accepted}},null,2)+'\n');
console.log(JSON.stringify({attempted:rows.length,accepted,rejected:rows.length-accepted}));
