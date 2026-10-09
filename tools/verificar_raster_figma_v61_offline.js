"use strict";
const assert=require("node:assert/strict");
const {readP4,toGsV0Raster}=require("./gerar_raster_figma_v61_offline.js");
let n=0;
function check(label,fn){fn();n++;console.log("PASS "+label);}
function sample(height=20,width=576){
  const stride=Math.ceil(width/8),pixels=Buffer.alloc(height*stride);
  for(let row=0;row<height;row++){pixels[row*stride+10]=0x81;pixels[row*stride+11]=0x08;}
  return Buffer.concat([Buffer.from("P4\n"+width+" "+height+"\n"),pixels]);
}
check("fixed 576-dot reference",()=>assert.equal(readP4(sample()).width,576));
check("single GS v0 frame",()=>{
  const x=toGsV0Raster(readP4(sample()));
  assert.equal(x.bands,1);assert.deepEqual([...x.bytes.subarray(0,4)],[29,118,48,0]);
  assert.equal(x.bytes.length,8+72*20);
});
check("multi-band raster roundtrip",()=>{
  const x=toGsV0Raster(readP4(sample(515)));
  assert.equal(x.bands,3);assert.equal(x.bytes.length,72*515+8*3);
});
check("explicit zero effects",()=>{
  const x=toGsV0Raster(readP4(sample()));
  assert.equal(x.ready_for_operational_print,false);
  assert.deepEqual(x.effects,{print:false,spooler_write:false,cut:false,network:false,fiscal:false});
});
check("reject incorrect width",()=>assert.throws(()=>readP4(sample(20,600)),/576/));
check("reject truncated payload",()=>assert.throws(()=>readP4(sample().subarray(0,-2)),/LENGTH/));
check("reject wrong PBM magic",()=>assert.throws(()=>readP4(Buffer.from("P6\n576 20\n")),/P4/));
check("reject blank paper",()=>{
  const blank=Buffer.concat([Buffer.from("P4\n576 20\n"),Buffer.alloc(72*20)]);
  assert.throws(()=>toGsV0Raster(readP4(blank)),/MISSING/);
});
check("reject ink on edge",()=>{
  const x=sample();x[x.length-72]=0xff;
  assert.throws(()=>toGsV0Raster(readP4(x)),/EDGE/);
});
check("reject huge height",()=>assert.throws(()=>readP4(sample(2401)),/HEIGHT/));
check("reject malformed pixel array",()=>{
  const x=readP4(sample());x.data=Buffer.alloc(1);
  assert.throws(()=>toGsV0Raster(x),/BYTES/);
});
check("PBM binary whitespace is preserved",()=>{
  const b=sample(20),header=Buffer.from("P4\\n576 20\\n");
  b[header.length]=0x0a;
  const x=readP4(b);
  assert.equal(x.data[0],0x0a);
  assert.equal(x.data.length,72*20);
});
console.log("FIGMA_RASTER_V61_TEST_PASS="+n+"/"+n);
