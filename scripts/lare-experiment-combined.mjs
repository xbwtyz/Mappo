// Detached combined experiment: isolate the interaction of the two promising strategies.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=process.argv[2];if(!root)throw Error('Detached checkout required');
for(const file of ['lare-experiment-progressive.mjs','lare-experiment-rank-pruning.mjs']){
  execFileSync(process.execPath,[fileURLToPath(new URL(file,import.meta.url)),root],{stdio:'inherit'});
}
console.log('EXPERIMENT combined progressive inventory and rank-first pruning; original global limits and independent validation unchanged');
