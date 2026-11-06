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
    // Deliberate >128 KB in EACH redirected pipe. Write the receipt ONLY
    // after every byte is written; prevents a vacuous no-deadlock "pass".
    let bytesPerPipe=0;
    const stress=process.env.GETIN_LAB_STDIO_STRESS==='1';
    if(stress){
      const line='LAB_STDIO_STRESS_ONLY_'+'.'.repeat(2030)+'\n';
      for(let i=0;i<80;i++){
        fs.writeSync(1,line);
        fs.writeSync(2,line);
      }
      bytesPerPipe=Buffer.byteLength(line,'utf8')*80;
    }
    fs.writeFileSync(path.join(lab,mode+'.child.receipt.json'),JSON.stringify({
     schema:'deliveryos.getin-synthetic-job.v1',state:'FIXTURE_ONLY',mode,
     customerDataExported:false,networkRequests:0,ordersPublishable:0,
     shellExecuted:false,recordsProcessed:0,
     stressCompleted:stress&&bytesPerPipe>131072,streamedBytesPerPipe:bytesPerPipe
    })+'\n',{flag:'wx'});
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2300);
   }
  }
 }
}catch{deny();}
