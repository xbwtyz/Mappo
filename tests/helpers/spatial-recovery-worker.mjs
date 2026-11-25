// Node transport pilot. Browser bundle integration is explicitly out of scope.
import {parentPort} from 'node:worker_threads';
import {createRoadRecoveryService} from './spatial-recovery-road-service.mjs';
let service,busy=false;
const cleanup=[];
parentPort.on('message',async input=>{
  const requestId=input?.requestId;
  if(busy){parentPort.postMessage({requestId,error:'Recovery worker busy'});return;}
  busy=true;
  try{
    service??=await createRoadRecoveryService({after:fn=>cleanup.push(fn)});
    const result=await service.execute(input,event=>parentPort.postMessage({requestId,revision:input.revision,
      acceptedFingerprint:input.acceptedFingerprint,progress:event}));
    parentPort.postMessage({requestId,result});
  }catch(error){parentPort.postMessage({requestId,error:error.message});}
  finally{busy=false;}
});
// Host owns a disposable temp root and removes it after worker termination,
// including hard cancellation before an in-worker cleanup can run.
