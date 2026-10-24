'use strict';
/**
 * V1 offline intake: prove exact bytes for ten original V1 event/decision pairs
 * and the pinned V2 rules, without parsing or emitting observation contents.
 * This NEVER executes consumer V2, invokes a printer, or authorizes effects.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const EXPECTED_FILES=Object.freeze([
 'packaging-current.js','app-data.json','routing.json','printer-map.json',
 'non-production.json','product-identity-cache-v1.json',
 'product-aliases-v1.json','human-order-overrides-v1.json',
 'live_shadow_consumer_v2_candidate_v714.cjs'
]);
const HEX=/^[a-f0-9]{64}$/i;
const MAX_BYTES=1024*1024;
const NO_EFFECTS=Object.freeze({write:false,print:false,spooler:false,
 sequence:false,service:false,network:false,execute_consumer:false});
function reject(reason){
 return {schema:'deliveryos.ten-original-pairs-intake.v1',status:'HOLD',
  source_bytes_verified:false,v2_replayed:false,v68_reconciled:false,
  release_authorized:false,reason,counts:{events:0,decisions:0,rules:0},effects:NO_EFFECTS};
}
function hashRegular(file){
 // Each path may refer only to an ordinary leaf file, never a symlink/pipe.
 if(fs.lstatSync(file).isSymbolicLink())throw Error('UNSAFE_FILE_TYPE');
 const flags=fs.constants.O_RDONLY | (process.platform==='linux' ?
     fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK : 0);
 let fd;
 try{
  fd=fs.openSync(file,flags);
  const before=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.size<1n||before.size>BigInt(MAX_BYTES))
   throw Error('UNSAFE_FILE_TYPE_OR_SIZE');
  const sha=crypto.createHash('sha256');
  const block=Buffer.alloc(64*1024);
  let remaining=Number(before.size),position=0;
  while(remaining>0){
   const n=fs.readSync(fd,block,0,Math.min(block.length,remaining),position);
   if(n<=0)throw Error('SOURCE_CHANGED');
   sha.update(block.subarray(0,n));remaining-=n;position+=n;
  }
  const after=fs.fstatSync(fd,{bigint:true});
  if(!after.isFile()||before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeNs!==after.mtimeNs||
     before.ctimeNs!==after.ctimeNs)
   throw Error('SOURCE_CHANGED');
  return sha.digest('hex');
 }finally{if(fd!==undefined)fs.closeSync(fd)}
}
function folderEntries(root,name){
 const folder=path.join(root,name),s=fs.lstatSync(folder);
 if(s.isSymbolicLink()||!s.isDirectory())throw Error('UNSAFE_DIRECTORY');
 const entries=fs.readdirSync(folder);
 if(entries.length>32)throw Error('UNEXPECTED_FILE_COUNT');
 return {folder,entries};
}
function exactFileMap(root,dir,ending){
 const {folder,entries}=folderEntries(root,dir);
 if(entries.length!==10)throw Error('TEN_FILES_REQUIRED');
 const regex=ending==='decision'?/^\d{10}_([a-f0-9]{64})\.decision\.json$/i:
  /^\d{10}_([a-f0-9]{64})\.json$/i;
 const mapped=new Map();
 for(const name of entries){
  const hit=name.match(regex);
  if(!hit||mapped.has(hit[1].toLowerCase()))throw Error('UNEXPECTED_EVENT_IDENTITY');
  mapped.set(hit[1].toLowerCase(),path.join(folder,name));
 }
 return mapped;
}
function verify(manifest,root){
 try{
  if(typeof root!=='string'||!path.isAbsolute(root)||
     fs.lstatSync(root).isSymbolicLink()||!fs.statSync(root).isDirectory())
    throw Error('UNSAFE_ROOT');
  if(!manifest||manifest.schema!=='tata-comandas-private-ten-original-pair-evidence.v2'||
     !Array.isArray(manifest.ten_cases)||manifest.ten_cases.length!==10)
    throw Error('MANIFEST_SCHEMA_OR_COUNT');
  const sourceHashes=manifest.staged_v2_sources_readonly_sha256;
  if(!sourceHashes||Object.keys(sourceHashes).length!==EXPECTED_FILES.length||
     EXPECTED_FILES.some(x=>!HEX.test(sourceHashes[x]||'')))
    throw Error('NINE_SOURCE_HASHES_REQUIRED');
  const mapE=exactFileMap(root,'events','event');
  const mapD=exactFileMap(root,'decisions','decision');
  const source=folderEntries(root,'rules');
  if(source.entries.length!==EXPECTED_FILES.length||
    source.entries.some(name=>!EXPECTED_FILES.includes(name)))
   throw Error('EXACT_SOURCE_FILES_REQUIRED');
  const seen=new Set();
  for(const x of manifest.ten_cases){
    if(!x||!HEX.test(x.snapshot_hash||'')||
       !HEX.test(x.event_file_sha256||'')||
       !HEX.test(x.legacy_decision_file_sha256||'')||
       x.legacy_decision_ready!==false||
       JSON.stringify(x.legacy_blockers)!=='["BAG_SIZE_NOT_FACT"]')
      throw Error('INVALID_CASE_CONTRACT');
    const key=x.snapshot_hash.toLowerCase();
    if(seen.has(key)||!mapE.has(key)||!mapD.has(key))
      throw Error('SNAPSHOT_NOT_UNIQUE_OR_MISSING');
    seen.add(key);
    if(hashRegular(mapE.get(key))!==x.event_file_sha256.toLowerCase()||
       hashRegular(mapD.get(key))!==x.legacy_decision_file_sha256.toLowerCase())
      throw Error('EVENT_OR_DECISION_DIGEST_MISMATCH');
  }
  for(const file of EXPECTED_FILES){
   if(hashRegular(path.join(source.folder,file))!==sourceHashes[file].toLowerCase())
    throw Error('RULE_DIGEST_MISMATCH');
  }
  return {schema:'deliveryos.ten-original-pairs-intake.v1',
    status:'SOURCE_BYTES_VERIFIED_REPLAY_STILL_HOLD',
    source_bytes_verified:true,v2_replayed:false,v68_reconciled:false,
    release_authorized:false,reason:'ISOLATION_AND_EFFECT_GATE_SEPARATE',
    counts:{events:10,decisions:10,rules:9},effects:NO_EFFECTS};
 }catch(e){
  const allowed=['UNSAFE_ROOT','MANIFEST_SCHEMA_OR_COUNT','NINE_SOURCE_HASHES_REQUIRED',
   'TEN_FILES_REQUIRED','UNEXPECTED_EVENT_IDENTITY','EXACT_SOURCE_FILES_REQUIRED',
   'INVALID_CASE_CONTRACT','SNAPSHOT_NOT_UNIQUE_OR_MISSING',
   'EVENT_OR_DECISION_DIGEST_MISMATCH','RULE_DIGEST_MISMATCH',
   'UNSAFE_FILE_TYPE','UNSAFE_FILE_TYPE_OR_SIZE','UNSAFE_DIRECTORY',
   'UNEXPECTED_FILE_COUNT','SOURCE_CHANGED'];
  return reject(allowed.includes(e.message)?e.message:'INPUT_UNAVAILABLE_OR_INVALID');
 }
}
if(require.main===module){
 // Private manifest must never be checked in to Git. Only a sanitized verdict
 // appears on stdout, including in error handling.
 const args=process.argv.slice(2);
 if(args.length!==2){console.log(JSON.stringify(reject('EXACT_TWO_ARGUMENTS_REQUIRED')));process.exitCode=2}
 else{
  let manifest=null;
  try{manifest=JSON.parse(fs.readFileSync(args[0],'utf8'))}catch{}
  const result=verify(manifest,args[1]);
  console.log(JSON.stringify(result));
  process.exitCode=result.source_bytes_verified?0:2;
 }
}
module.exports={verify,EXPECTED_FILES,NO_EFFECTS};
