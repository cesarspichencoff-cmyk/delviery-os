'use strict';
// Explicitly LAB-ONLY; never read or alter the live cash register.
// One synthetic fixture -> one bounded, no-PII N2/N3 HOLD receipt.
// The production host must stay untouched until a separate field authorization.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {selectOne,reviewOne}=
 require('../../runtime/reporting/native_reader_existing_event_binding_v1.cjs');

const MARKER='DELIVERYOS_READER_PROOF_LAB_ONLY_V1';
const LAB_NAME='deliveryos-reader-proof-lab';
const MAX_INPUT=256*1024;
function safeLabDirectory(argv){
 if(os.hostname().toUpperCase()==='CAIXA_MOOCA')return null;
 if(argv.length!==1||!argv[0].startsWith('--lab-dir='))return null;
 const dir=argv[0].slice('--lab-dir='.length);
 try{
  if(!path.isAbsolute(dir)||path.basename(dir)!==LAB_NAME)return null;
  if(fs.realpathSync(dir)!==path.resolve(dir))return null;
  const info=fs.lstatSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink())return null;
  const markerFile=path.join(dir,'LAB_ONLY.txt');
  const markerInfo=fs.lstatSync(markerFile);
  if(!markerInfo.isFile()||markerInfo.isSymbolicLink()||markerInfo.size>80)return null;
  if(fs.readFileSync(markerFile,'utf8').trim()!==MARKER)return null;
  return dir;
 }catch{return null;}
}
function boundedRead(file){
 const first=fs.lstatSync(file);
 if(!first.isFile()||first.isSymbolicLink()||first.size<1||
    first.size>MAX_INPUT||fs.realpathSync(file)!==path.resolve(file))
  throw Error('SOURCE_BOUNDARY');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const open=fs.fstatSync(fd);
  if(!open.isFile()||open.size!==first.size||open.mtimeMs!==first.mtimeMs||
     open.ino!==first.ino||open.dev!==first.dev)throw Error('SOURCE_CHANGED');
  const buf=Buffer.alloc(open.size+1);
  try{
   const n=fs.readSync(fd,buf,0,buf.length,0);
   const close=fs.fstatSync(fd);
   if(n!==open.size||close.size!==open.size||close.mtimeMs!==open.mtimeMs)
    throw Error('SOURCE_CHANGED');
   return JSON.parse(buf.subarray(0,n).toString('utf8').replace(/^\uFEFF/,''));
  }finally{buf.fill(0);}
 }finally{fs.closeSync(fd);}
}
function main(){
 const lab=safeLabDirectory(process.argv.slice(2));
 if(!lab)return 77;
 const dest=path.join(lab,'receipt.json');
 // Refuse to overwrite any existing receipt, including links.
 if(fs.existsSync(dest))return 78;
 let result;
 try{
  // LAB only: select one emitted revision from the fixture checkpoint.
  // No raw copy. The event stays under its canonical, pre-existing filename.
  const checkpoint=boundedRead(path.join(lab,'synthetic-checkpoint.json'));
  const choice=selectOne(checkpoint);
  if(choice.state!=='CANDIDATE_PRIVATE_UNVERIFIED')
   throw Error('CHECKPOINT_HOLD');
  const dir=path.join(lab,'reader-events-v1');
  const d=fs.lstatSync(dir);
  if(!d.isDirectory()||d.isSymbolicLink()||
     fs.realpathSync(dir)!==path.resolve(dir))
   throw Error('EVENT_DIRECTORY_INVALID');
  const file=choice.privateDescriptor.event_filename;
  if(!/^[A-Za-z0-9_-]{1,64}_[0-9A-F]{64}\.json$/.test(file))
   throw Error('EVENT_FILENAME_INVALID');
  result=reviewOne(checkpoint,boundedRead(path.join(dir,file)));
 }catch{
  result={schema:'deliveryos.native-reader-existing-event-binding.v1',
   state:'HOLD',reason:'LAB_INPUT_UNREADABLE_OR_CHANGED',
   sourceIdentityVerified:false,sourceFreshnessVerified:false,
   n2ObservationReadIndependentlyComplete:false,
   ordersPublishable:0,homePublishAuthorized:false,
   customerDataExported:false,rawOrderIdsExported:0,rawHashExported:false,
   actionsExecuted:0};
 }
 // Fixed schema check before writing: reviewer itself NEVER returns raw fields.
 if(result.state!=='HOLD'||result.ordersPublishable!==0||
    result.homePublishAuthorized!==false||result.customerDataExported!==false||
    result.rawOrderIdsExported!==0||result.rawHashExported!==false)return 79;
 const json=JSON.stringify(result)+'\n';
 if(Buffer.byteLength(json,'utf8')>2048)return 80;
 try{
  fs.writeFileSync(dest,json,{encoding:'utf8',flag:'wx',mode:0o600});
  // Only a fixed, bounded hold in disposable CI permits window/focus sampling.
  if(process.env.DELIVERYOS_READER_LAB_HOLD_MS==='2500'){
   const wait=new SharedArrayBuffer(4);
   Atomics.wait(new Int32Array(wait),0,0,2500);
  }
  return 0;
 }catch{return 81;}
}
try{process.exitCode=main();}
catch{process.exitCode=82;}
// No stdout, stderr, log of source, exception details, IDs, notes or hash.
