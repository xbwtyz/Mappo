// Opt-in acceptance capture through the existing changed-test Fast Checks path.
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const configurations={"feature/lare-combined-2m-experiment":{"branch":"feature/lare-combined-2m-experiment","work":2000000,"expansions":4096,"beam":8,"parcels":24,"buildings":24,"combined":true},"feature/lare-combined-4m-experiment":{"branch":"feature/lare-combined-4m-experiment","work":4000000,"expansions":8192,"beam":8,"parcels":24,"buildings":24,"combined":true},"feature/lare-combined-8m-experiment":{"branch":"feature/lare-combined-8m-experiment","work":8000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":true},"feature/lare-expansion-16k-experiment":{"branch":"feature/lare-expansion-16k-experiment","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false},"feature/lare-beam-16-experiment":{"branch":"feature/lare-beam-16-experiment","work":8000000,"expansions":16384,"beam":16,"parcels":24,"buildings":24,"combined":false},"feature/lare-beam-32-experiment":{"branch":"feature/lare-beam-32-experiment","work":8000000,"expansions":16384,"beam":32,"parcels":24,"buildings":24,"combined":false},"feature/lare-inventory-48-experiment":{"branch":"feature/lare-inventory-48-experiment","work":8000000,"expansions":16384,"beam":8,"parcels":48,"buildings":48,"combined":false},"feature/lare-inventory-96-experiment":{"branch":"feature/lare-inventory-96-experiment","work":8000000,"expansions":16384,"beam":8,"parcels":96,"buildings":96,"combined":false}};
const config=configurations[process.env.GITHUB_REF_NAME]??(process.env.MAPPO_LARE_CAPTURE==='1'&&process.env.MAPPO_LARE_SEARCH_CONFIG?JSON.parse(process.env.MAPPO_LARE_SEARCH_CONFIG):null);
test('B1R native frozen baseline and candidate comparison — detached search capacity and diversity experiment', {skip: !config || !(process.env.MAPPO_LARE_CAPTURE==='1'||(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='Mappo Fast Checks')),timeout: 600000},()=>{
 const root=mkdtempSync(join(tmpdir(),'mappo-lare-'));
 const baseline=join(root,'baseline'),out=join(root,'corpus'),experiment=join(root,'experiment');
 const sha='e5f1cf83dcdcc75e52911aa717035955b40569d0';
 try {
  execFileSync('git',['fetch','--no-tags','origin',sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',baseline,sha],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-baseline.mjs',baseline,out,'0','4'],{stdio:'inherit',timeout:540000});
  execFileSync('git',['worktree','add','--detach',experiment,'HEAD'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-search-capacity.mjs',experiment,JSON.stringify(config)],{stdio:'inherit'});
  execFileSync(process.execPath,[join(experiment,'scripts/lare-compare.mjs'),out],{cwd:experiment,stdio:'inherit',timeout:540000});
 } finally {
  try {execFileSync('git',['worktree','remove','--force',baseline],{stdio:'inherit'});} catch {}
  try {execFileSync('git',['worktree','remove','--force',experiment],{stdio:'inherit'});} catch {}
  rmSync(root,{recursive:true,force:true});
 }
});
