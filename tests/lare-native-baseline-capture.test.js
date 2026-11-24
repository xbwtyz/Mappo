// Opt-in acceptance capture through the existing changed-test Fast Checks path.
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const configurations={"feature/lare-budget-2m-experiment":[2000000,4096],"feature/lare-budget-4m-experiment":[4000000,8192],"feature/lare-budget-8m-experiment":[8000000,16384],"feature/lare-budget-16m-experiment":[16000000,32768]};
const config=configurations[process.env.GITHUB_REF_NAME]??(process.env.MAPPO_LARE_CAPTURE==='1'?[Number(process.env.MAPPO_LARE_WORK),Number(process.env.MAPPO_LARE_EXPANSIONS)]:null);
test('B1R native frozen baseline and candidate comparison — detached budget scaling experiment', {skip: !config || !(process.env.MAPPO_LARE_CAPTURE==='1'||(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_WORKFLOW==='Mappo Fast Checks')),timeout: 600000},()=>{
 const root=mkdtempSync(join(tmpdir(),'mappo-lare-'));
 const baseline=join(root,'baseline'),out=join(root,'corpus'),experiment=join(root,'experiment');
 const sha='e5f1cf83dcdcc75e52911aa717035955b40569d0';
 try {
  execFileSync('git',['fetch','--no-tags','origin',sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',baseline,sha],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-baseline.mjs',baseline,out,'0','4'],{stdio:'inherit',timeout:540000});
  execFileSync('git',['worktree','add','--detach',experiment,'HEAD'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-experiment-budget.mjs',experiment,...config.map(String)],{stdio:'inherit'});
  execFileSync(process.execPath,[join(experiment,'scripts/lare-compare.mjs'),out],{cwd:experiment,stdio:'inherit',timeout:540000});
 } finally {
  try {execFileSync('git',['worktree','remove','--force',baseline],{stdio:'inherit'});} catch {}
  try {execFileSync('git',['worktree','remove','--force',experiment],{stdio:'inherit'});} catch {}
  rmSync(root,{recursive:true,force:true});
 }
});
