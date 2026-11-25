// Audit actual Node TAP output from the two exact-head full CI shards.
// This is a qualification reporting tool, not a replacement for full CI.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const manifest=JSON.parse(readFileSync(new URL('./identity-qualification-corpus.json',import.meta.url),'utf8'));
export function verifyCorpus(logs,inventory=manifest){
 const wanted=new Map(),counts={},errors=[];
 for(const [category,names] of Object.entries(inventory.cases)){
  counts[category]={required:inventory.minimum[category],registered:names.length,passed:0};
  if(!Number.isInteger(inventory.minimum[category])||names.length<inventory.minimum[category])errors.push('Underfilled category: '+category);
  for(const name of names){
   if(wanted.has(name))errors.push('Duplicate corpus case: '+name);
   wanted.set(name,category);
  }
 }
 for(const category of Object.keys(inventory.minimum))if(!Object.hasOwn(counts,category))errors.push('Missing category: '+category);
 const seen=new Map();
 for(const log of logs)for(const line of log.split(/\r?\n/)){
  const clean=line.replace(/^\d{4}-\d\d-\d\dT\S+\s+/,'').trim();
  const match=/^(not ok|ok) \d+ - (.+?)(?:\s+#\s+(SKIP|TODO)\b.*)?$/i.exec(clean);
  if(!match||!wanted.has(match[2]))continue;
  const [,status,name,directive]=match;
  if(seen.has(name))errors.push('Repeated execution evidence: '+name);
  else if(status==='ok'&&!directive)counts[wanted.get(name)].passed++;
  else errors.push('Unqualified execution: '+name);
  seen.set(name,status);
 }
 for(const name of wanted.keys())if(!seen.has(name))errors.push('Missing execution evidence: '+name);
 return {ok:errors.length===0,counts,totalRegistered:wanted.size,totalPassed:Object.values(counts).reduce((n,x)=>n+x.passed,0),errors};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const paths=process.argv.slice(2);
 if(paths.length!==2)throw Error('Usage: node scripts/verify-identity-qualification.mjs node-shard-1.log node-shard-2.log');
 const result=verifyCorpus(paths.map(p=>readFileSync(p,'utf8')));
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
