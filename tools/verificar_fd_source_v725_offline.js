"use strict";
/**
 * V7.25 -- real filesystem adversarial test of the offline read boundary.
 * The production Windows service is NOT accessed; fixtures live under tmp.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 {spawnSync}=require("node:child_process");
const {readBound}=require("./gerar_tres_vias_v2_gate_v720_offline.js");
assert.equal(process.platform,"linux","Linux-only source boundary");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v725-fd-"));
const source=path.join(dir,"source.json");
const leak=path.join(dir,"secret-canary.json");
const oversized=path.join(dir,"oversized.json");
const symlink=path.join(dir,"link.json");
const fifo=path.join(dir,"pipe.json");
const small=Buffer.from('{"fixture":"safe"}');
let n=0;
function check(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
function reset(){fs.writeFileSync(source,small);}
try{
 reset();
 fs.writeFileSync(leak,Buffer.from('{"never":"follow"}'));
 check("normal regular fixture returns exact bounded bytes",()=>{
  assert.deepEqual(readBound(source),small);
 });
 check("zero-length regular file never invents content",()=>{
  const empty=path.join(dir,"empty.json");fs.writeFileSync(empty,"");
  assert.equal(readBound(empty).length,0);
 });
 check("missing source fails closed",()=>{
  assert.throws(()=>readBound(path.join(dir,"missing.json")));
 });
 check("directory cannot be read as a file",()=>{
  assert.throws(()=>readBound(dir),/SOURCE_FILE_BUDGET_EXCEEDED/);
 });
 check("1 MiB plus one byte fails before allocation",()=>{
  fs.writeFileSync(oversized,Buffer.alloc(1024*1024+1));
  assert.throws(()=>readBound(oversized),/SOURCE_FILE_BUDGET_EXCEEDED/);
 });
 check("real symlink to a canary cannot be followed",()=>{
  fs.symlinkSync(leak,symlink);
  assert.throws(()=>readBound(symlink));
 });
 check("path replaced by symlink at open boundary is rejected",()=>{
  reset();
  const original=fs.openSync;
  let intercepted=false;
  fs.openSync=function(file,flags,...args){
   if(!intercepted&&file===source){
    intercepted=true;
    fs.rmSync(source);
    fs.symlinkSync(leak,source);
   }
   return original.call(fs,file,flags,...args);
  };
  try{assert.throws(()=>readBound(source));assert.equal(intercepted,true);}
  finally{
   fs.openSync=original;
   fs.rmSync(source);
   reset();
  }
 });
 check("same-size in-place rewrite during read invalidates fd metadata",()=>{
  reset();
  const original=fs.readSync;
  let intercepted=false;
  fs.readSync=function(fd,buffer,offset,length,position){
   const count=original.call(fs,fd,buffer,offset,length,position);
   if(!intercepted){
    intercepted=true;
    const other=Buffer.from(small.toString().replace("safe","fail"));
    assert.equal(other.length,small.length);
    fs.writeFileSync(source,other);
   }
   return count;
  };
  try{
   assert.throws(()=>readBound(source),/SOURCE_FILE_CHANGED_DURING_READ/);
   assert.equal(intercepted,true);
  }finally{fs.readSync=original;reset();}
 });
 check("early EOF cannot return a partial source buffer",()=>{
  reset();
  const original=fs.readSync;
  fs.readSync=()=>0;
  try{assert.throws(()=>readBound(source),/SOURCE_FILE_CHANGED_DURING_READ/);}
  finally{fs.readSync=original;}
 });
 check("opened fd is closed even on rejected regular-file identity",()=>{
  const close=fs.closeSync;
  let closes=0;
  fs.closeSync=function(...a){closes++;return close.apply(fs,a);};
  try{assert.throws(()=>readBound(dir));assert.equal(closes,1);}
  finally{fs.closeSync=close;}
 });
 check("FIFO substituted for file does not hang execution",()=>{
  const mk=spawnSync("mkfifo",[fifo],{timeout:2000,encoding:"utf8"});
  assert.equal(mk.status,0,"test runner requires mkfifo");
  assert.throws(()=>readBound(fifo),/SOURCE_FILE_BUDGET_EXCEEDED/);
 });
 console.log("THERMAL_FD_SOURCE_READER_V725="+n+"/"+n+
  " NOFOLLOW NONBLOCK SAME_INODE BOUNDED_BYTES NO_WINDOWS_NO_PRINT");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
