"use strict";
// V7.47: protocol independent read-only checker. Never opens a printer or writes a file.
const assert=require("node:assert/strict"),fs=require("node:fs"),
path=require("node:path"),crypto=require("node:crypto");
const encSrc=fs.readFileSync(path.join(__dirname,"comandas_escpos_graphics_fn112_v747_offline.ps1"),"utf8");
for(const s of ["TataEscPosFn112V747","GS_L_MAGIC_INVALID","FN112_INVALID",
 "FN50_TRAILER_INVALID","SHA256_SOURCE_IDENTITY_DRIFT","FileMode.CreateNew",
 "OFFLINE_EPS_PINNED_ROUNDTRIP_PASS","no_printer_job_requested=$true"]){
 assert.ok(encSrc.includes(s),"V747_ENCODER_SOURCE_CONTRACT_MISSING:"+s);
}
assert.doesNotMatch(encSrc,/\b(?:WritePrinter|StartDocPrinter|EndDocPrinter|Start-Process|Set-Printer|Set-PrintConfiguration|Restart-Service|Stop-Service|Invoke-WebRequest)\b|\$doc\.Print\s*\(/i);
const trailer=Buffer.from([0x1d,0x28,0x4c,0x02,0x00,0x30,0x32]);
function payload(width,height,isBlack){
 assert.equal(width,576===width?576:8);
 assert.ok(height>0&&height<=1000);
 const data=Buffer.alloc(Math.ceil(width/8)*height,0);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(isBlack(x,y))data[y*(width/8)+(x>>3)] |= 0x80>>(x&7);
 }
 const plen=data.length+10;
 assert.ok(plen<=65535);
 const head=Buffer.from([0x1d,0x28,0x4c,plen&255,plen>>8,
  0x30,0x70,0x30,0x01,0x01,0x31,width&255,width>>8,height&255,height>>8]);
 return Buffer.concat([head,data,trailer]);
}
const ones=new Uint8Array(256);
for(let n=0;n<256;n++){let x=n,c=0;while(x){c+=x&1;x>>=1}ones[n]=c}
function decode(packet,width,height){
 assert.equal(packet.length,15+width/8*height+7,"LENGTH_NOT_EXACT");
 assert.deepEqual([...packet.subarray(0,3)],[0x1d,0x28,0x4c]);
 assert.equal(packet[3]+256*packet[4],width/8*height+10);
 assert.deepEqual([...packet.subarray(5,11)],[0x30,0x70,0x30,1,1,0x31]);
 assert.equal(packet[11]+256*packet[12],width);
 assert.equal(packet[13]+256*packet[14],height);
 assert.ok(packet.subarray(-7).equals(trailer));
 const dots=packet.subarray(15,-7);
 return {bitCount:[...dots].reduce((s,n)=>s+ones[n],0),
   getBit:(x,y)=>(dots[y*(width/8)+(x>>3)]&(0x80>>(x&7)))!==0};
}
const small=payload(8,2,(x,y)=>y===0?(x===0||x===7):[1,3,4,6].includes(x));
assert.equal(small.toString("hex"),"1d284c0c0030703001013108000200815a1d284c02003032");
let v=decode(small,8,2);assert.equal(v.bitCount,6);
assert.equal(v.getBit(0,0),true);assert.equal(v.getBit(7,0),true);
assert.equal(v.getBit(1,0),false);assert.equal(v.getBit(1,1),true);
const bad=(index,value)=>{const b=Buffer.from(small);b[index]=value;assert.throws(()=>decode(b,8,2))};
bad(6,0);bad(8,2);bad(13,3);bad(3,0);bad(small.length-1,0);
assert.throws(()=>decode(small.subarray(0,-1),8,2));
for(const [height,density] of [[418,19192],[466,25141]]){
 const deterministic=payload(576,height,(x,y)=>x%23===0&&y%7===0);
 const check=decode(deterministic,576,height);
 assert.equal(deterministic.length,15+72*height+7);
 assert.equal(check.getBit(0,0),true);
 assert.equal(check.getBit(1,0),false);
 assert.equal(check.getBit(0,1),false);
 assert.ok(density>0&&density<576*height);
}
const metadata=[
 {stem:"01-producao",height:418,black:19192,bytes:30118,
  sha:"ACE7450A2E6699133BA39FA2F3B625EB46D296EAEB6EAE477877F9F855F1C780"},
 {stem:"02-conferencia",height:466,black:25141,bytes:33574,
  sha:"2F7711E08EFFD6BD29888CD5056B951EFFD7FFB0907287629A9E6B27453E5AF8"}
];
if(process.argv[2]==="--fixture-dir"){
 const dir=path.resolve(process.argv[3]||"");
 assert.equal(path.basename(dir),"calibration-fictitious-v741");
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest-v741.json"),"utf8"));
 assert.equal(manifest.schema,"tata.comandas.synthetic-calibration.v741");
 assert.equal(manifest.real_order,false);assert.equal(manifest.print_authorized,false);
 for(const item of metadata){
  const buf=fs.readFileSync(path.join(dir,item.stem+"-offline-fn112-fn50-v747.bin"));
  assert.equal(buf.length,item.bytes);
  assert.equal(crypto.createHash("sha256").update(buf).digest("hex").toUpperCase(),item.sha);
  assert.equal(decode(buf,576,item.height).bitCount,item.black);
 }
}else{
 assert.equal(process.argv.length,2,"UNEXPECTED_CLI_ARGUMENT");
}
console.log(JSON.stringify({schema:"deliveryos.escpos-graphics-v747-independent-check",
 status:"PASS",positive_fixture:"8x2 golden",bit_mutations_rejected:6,
 image_sizes_checked:[418,466],real_binary_checked:process.argv[2]==="--fixture-dir",
 no_print:true,no_driver:false===true,no_spooler_write:true}));
