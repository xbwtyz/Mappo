// Opt-in acceptance capture through the existing changed-test Fast Checks path.
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const configs={"feature/lare-demolition-corpus-4-experiment":{"branch":"feature/lare-demolition-corpus-4-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[4,2]],"expected":15},"feature/lare-demolition-corpus-6-experiment":{"branch":"feature/lare-demolition-corpus-6-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[6,2]],"expected":17},"feature/lare-demolition-corpus-8-experiment":{"branch":"feature/lare-demolition-corpus-8-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[8,2]],"expected":15},"feature/lare-demolition-corpus-10-experiment":{"branch":"feature/lare-demolition-corpus-10-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[10,2]],"expected":24},"feature/lare-demolition-corpus-12-experiment":{"branch":"feature/lare-demolition-corpus-12-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[12,2]],"expected":19},"feature/lare-demolition-corpus-14-experiment":{"branch":"feature/lare-demolition-corpus-14-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[14,2]],"expected":22},"feature/lare-demolition-corpus-16-experiment":{"branch":"feature/lare-demolition-corpus-16-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[16,2]],"expected":13},"feature/lare-demolition-corpus-18-experiment":{"branch":"feature/lare-demolition-corpus-18-experiment","strategies":["largest","smallest","obstructive","minimum"],"mode":"selective","work":4000000,"expansions":16384,"beam":8,"parcels":24,"buildings":24,"combined":false,"ranges":[[18,2]],"expected":18}};
const config=configs[process.env.GITHUB_REF_NAME]??(process.env.MAPPO_LARE_CAPTURE==='1'&&process.env.MAPPO_LARE_INSET_CONFIG?JSON.parse(process.env.MAPPO_LARE_INSET_CONFIG):null);
test('B1R native frozen baseline and candidate comparison — detached full-corpus demolition counterfactuals', {skip: !config || !(process.env.MAPPO_LARE_CAPTURE==='1'||(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='Mappo Fast Checks')),timeout: 600000},()=>{
 const root=mkdtempSync(join(tmpdir(),'mappo-lare-'));
 const baseline=join(root,'baseline'),out=join(root,'corpus'),experiment=join(root,'experiment');
 const sha='e5f1cf83dcdcc75e52911aa717035955b40569d0';
 try {
  execFileSync('git',['fetch','--no-tags','origin',sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',baseline,sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',experiment,'HEAD'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-inset-integration.mjs',experiment,JSON.stringify(config)],{stdio:'inherit'});
  for(const [first,count] of config.ranges){
   const corpus=join(out,String(first));
   execFileSync(process.execPath,['scripts/lare-baseline.mjs',baseline,corpus,String(first),String(count)],{stdio:'inherit',timeout:540000});
   for(const strategy of config.strategies)
     execFileSync(process.execPath,[join(experiment,'scripts/lare-experiment-demolition.mjs'),corpus,strategy,String(config.expected)],{cwd:experiment,stdio:'inherit',timeout:540000});
  }
 } finally {
  try {execFileSync('git',['worktree','remove','--force',baseline],{stdio:'inherit'});} catch {}
  try {execFileSync('git',['worktree','remove','--force',experiment],{stdio:'inherit'});} catch {}
  rmSync(root,{recursive:true,force:true});
 }
});
