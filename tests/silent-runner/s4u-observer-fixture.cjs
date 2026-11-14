'use strict';
// Disposable CI Windows Scheduled Task S4U fixture only.
// No operational Reader files, no shell, no network, no customer information.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {Atomics,SharedArrayBuffer,Int32Array}=globalThis;
const LAB_NAME='deliveryos-s4u-lab';
const MARKER='DELIVERYOS_S4U_DISPOSABLE_WIN_RUNNER_ONLY_V1';
const deny=()=>{process.exitCode=77;};
function main(){
 if(os.hostname().toUpperCase()==='CAIXA_MOOCA')return deny();
 const argv=process.argv.slice(2);
 if(argv.length!==1||!argv[0].startsWith('--lab-dir='))return deny();
 const dir=argv[0].slice(10);
 if(!path.isAbsolute(dir)||path.basename(dir)!==LAB_NAME)return deny();
 if(fs.realpathSync(dir)!==path.resolve(dir))return deny();
 const folder=fs.lstatSync(dir);
 if(!folder.isDirectory()||folder.isSymbolicLink())return deny();
 const mark=path.join(dir,'LAB_ONLY.txt');
 if(fs.lstatSync(mark).isSymbolicLink()||
    fs.readFileSync(mark,'utf8').trim()!==MARKER)return deny();
 const fixture=path.join(dir,'synthetic-input.txt');
 if(fs.lstatSync(fixture).isSymbolicLink()||
    fs.readFileSync(fixture,'utf8').trim()!=='FICTIONAL_LOCAL_IO_ONLY')return deny();
 const begun=path.join(dir,'started.json');
 const done=path.join(dir,'completed.json');
 // The only outputs: a CI-local process identifier and sanitized proof.
 fs.writeFileSync(begun,JSON.stringify({
  schema:'deliveryos.s4u-observer-fixture-start.v1',
  pid:process.pid,source:'FICTIONAL_ONLY',ordersPublishable:0
 })+'\n',{flag:'wx'});
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2700);
 fs.writeFileSync(done,JSON.stringify({
  schema:'deliveryos.s4u-observer-fixture-result.v1',
  state:'LAB_LOCAL_READ_WRITE_OK',source:'FICTIONAL_ONLY',
  filesRead:1,filesWritten:2,ordersPublishable:0,
  customerDataExported:false,cmdExecuted:false,processChildren:0
 })+'\n',{flag:'wx'});
}
try{main();}catch{deny();}
// No stdout/stderr, no operational paths or order content.
