'use strict';
// Synthetic-only, no integrations, credentials, network, personal information,
// browser or external commands. Never runs on CAIXA_MOOCA.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const deny=()=>{process.exitCode=77;};
try{
 if(os.hostname().toUpperCase()==='CAIXA_MOOCA'||
    process.env.GITHUB_ACTIONS!=='true'||
    process.env.GITHUB_REPOSITORY!=='cesarspichencoff-cmyk/delviery-os')deny();
 else {
  const args=process.argv.slice(2);
  if(args.length!==2||!args[0].startsWith('--lab-dir=')||
     !['--mode=collector','--mode=visual'].includes(args[1]))deny();
  else{
   const lab=path.resolve(args[0].slice(10));
   const mode=args[1].slice(7);
   if(path.basename(lab)!=='deliveryos-getin-silent-lab'||
      fs.readFileSync(path.join(lab,'LAB_ONLY.txt'),'utf8').trim()!=='DELIVERYOS_GETIN_SILENT_DISPOSABLE_LAB_V1')deny();
   else{
    fs.writeFileSync(path.join(lab,mode+'.child.receipt.json'),JSON.stringify({
     schema:'deliveryos.getin-synthetic-job.v1',state:'FIXTURE_ONLY',mode,
     customerDataExported:false,networkRequests:0,ordersPublishable:0,
     shellExecuted:false,recordsProcessed:0
    })+'\n',{flag:'wx'});
    // Deliberate >128 KB for each redirected pipe to catch deadlocks in the
    // candidate GUI launcher. CI only; no user data is printed or retained.
    if(process.env.GETIN_LAB_STDIO_STRESS==='1'){
      const line='LAB_STDIO_STRESS_ONLY_'+'.'.repeat(2030)+'\n';
      for(let i=0;i<80;i++){
        fs.writeSync(1,line);
        fs.writeSync(2,line);
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2300);
   }
  }
 }
}catch{deny();}
