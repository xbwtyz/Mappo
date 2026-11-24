// Opt-in acceptance capture through the existing changed-test Fast Checks path.
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const configs={"feature/lare-compact-parcel-pilot-experiment":{"branch":"feature/lare-compact-parcel-pilot-experiment","strategies":["clear-all"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[5,5,9]]}};
const config=configs[process.env.GITHUB_REF_NAME]??(process.env.MAPPO_LARE_CAPTURE==='1'&&process.env.MAPPO_LARE_INSET_CONFIG?JSON.parse(process.env.MAPPO_LARE_INSET_CONFIG):null);
test('B1R native frozen baseline and candidate comparison — detached compact parcel pilot', {skip: !config || !(process.env.MAPPO_LARE_CAPTURE==='1'||(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='Mappo Fast Checks')),timeout: 600000},()=>{
 const root=mkdtempSync(join(tmpdir(),'mappo-lare-'));
 const baseline=join(root,'baseline'),out=join(root,'corpus'),experiment=join(root,'experiment');
 const sha='e5f1cf83dcdcc75e52911aa717035955b40569d0';
 try {
  execFileSync('git',['fetch','--no-tags','origin',sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',baseline,sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',experiment,'HEAD'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-inset-integration.mjs',experiment,JSON.stringify(config)],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-parcel-diagnostics.mjs',experiment],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-compact-parcels.mjs',experiment],{stdio:'inherit'});
  for(const [first,count,expected] of config.ranges){
   const corpus=join(out,String(first));
   execFileSync(process.execPath,['scripts/lare-baseline.mjs',baseline,corpus,String(first),String(count)],{stdio:'inherit',timeout:540000});
   for(const strategy of config.strategies)
     execFileSync(process.execPath,[join(experiment,'scripts/lare-experiment-demolition.mjs'),corpus,strategy,String(expected)],{cwd:experiment,stdio:'inherit',timeout:540000});
  }
 } finally {
  try {execFileSync('git',['worktree','remove','--force',baseline],{stdio:'inherit'});} catch {}
  try {execFileSync('git',['worktree','remove','--force',experiment],{stdio:'inherit'});} catch {}
  rmSync(root,{recursive:true,force:true});
 }
});
