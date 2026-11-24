// Opt-in acceptance capture through the existing changed-test Fast Checks path.
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('B1R native frozen baseline and candidate comparison — partition 2', {skip: process.env.MAPPO_LARE_CAPTURE !== '1' && !(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_WORKFLOW === 'Mappo Fast Checks' && process.env.GITHUB_REF_NAME === 'feature/0.2.24-b1r-adaptive-reconciliation'),timeout: 600000},()=>{
 const root=mkdtempSync(join(tmpdir(),'mappo-lare-'));
 const baseline=join(root,'baseline'),out=join(root,'corpus');
 const sha='e5f1cf83dcdcc75e52911aa717035955b40569d0';
 try {
  execFileSync('git',['fetch','--no-tags','origin',sha],{stdio:'inherit'});
  execFileSync('git',['worktree','add','--detach',baseline,sha],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/lare-baseline.mjs',baseline,out,'2','2'],{stdio:'inherit',timeout:540000});
  execFileSync(process.execPath,['scripts/lare-compare.mjs',out],{stdio:'inherit',timeout:540000});
 } finally {
  try {execFileSync('git',['worktree','remove','--force',baseline],{stdio:'inherit'});} catch {}
  rmSync(root,{recursive:true,force:true});
 }
});
