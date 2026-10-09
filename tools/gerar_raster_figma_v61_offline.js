"use strict";
/**
 * Encodes a FIXED 576-dot monochrome PBM/P4 visual proof as ESC/POS GS v 0
 * raster frames OFFLINE. No port, printer, driver, spooler, TCP, network,
 * device discovery, paper-cut or production integration.
 * Printable raster FILE is NOT authorization to send it to any device.
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const WIDTH=576, STRIDE=72, BAND_ROWS=256, MAX_HEIGHT=2400;

function readP4(input) {
  if(!Buffer.isBuffer(input))throw Error("PBM_INPUT_REQUIRED");
  const match=/^P4\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s/.exec(input.subarray(0,256).toString("latin1"));
  if(!match)throw Error("PBM_P4_HEADER_REQUIRED");
  const width=Number(match[1]),height=Number(match[2]);
  if(width!==WIDTH)throw Error("RASTER_WIDTH_NOT_576_DOTS");
  if(!Number.isSafeInteger(height)||height<1||height>MAX_HEIGHT)throw Error("RASTER_HEIGHT_OUT_OF_RANGE");
  const start=Buffer.byteLength(match[0],"latin1");
  if(input.length!==start+STRIDE*height)throw Error("RASTER_DATA_LENGTH_MISMATCH");
  return {width,height,data:input.subarray(start)};
}
function guardRaster({width,height,data}) {
  if(width!==WIDTH||!Number.isSafeInteger(height)||height<1||height>MAX_HEIGHT)
    throw Error("UNSAFE_RASTER_DIMENSIONS");
  if(!Buffer.isBuffer(data)||data.length!==STRIDE*height)throw Error("RASTER_BYTES_INVALID");
  let black=0,edge=0;
  for(let i=0;i<data.length;i++){
    const byte=data[i];let bits=byte;
    while(bits){bits&=bits-1;black++;}
    if(i%STRIDE===0&&(byte&0xc0))edge++;
    if(i%STRIDE===STRIDE-1&&(byte&0x03))edge++;
  }
  if(black<40)throw Error("RASTER_MISSING_VISIBLE_CONTENT");
  if(black>WIDTH*height*0.45)throw Error("RASTER_EXCESSIVE_INK");
  if(edge)throw Error("RASTER_CONTENT_AT_PAPER_EDGE");
  return {dark_pixels:black,ink_coverage:Number((black/(WIDTH*height)).toFixed(6)),edge_violations:0};
}
function toGsV0Raster(value) {
  const pbm=value?.width===WIDTH?value:readP4(value);
  const metrics=guardRaster(pbm);
  const chunks=[];
  for(let from=0;from<pbm.height;from+=BAND_ROWS){
    const rows=Math.min(BAND_ROWS,pbm.height-from);
    chunks.push(Buffer.from([0x1d,0x76,0x30,0x00,STRIDE,0,rows&255,rows>>8]),
      pbm.data.subarray(from*STRIDE,(from+rows)*STRIDE));
  }
  const bytes=Buffer.concat(chunks);
  let offset=0,rows=0,frames=0;
  const recovered=[];
  while(offset<bytes.length){
    const prefix=bytes.subarray(offset,offset+4);
    if(!prefix.equals(Buffer.from([0x1d,0x76,0x30,0x00])))throw Error("FRAME_NOT_GRAPHIC");
    const cols=bytes[offset+4]+256*bytes[offset+5];
    const height=bytes[offset+6]+256*bytes[offset+7];
    if(cols!==STRIDE||height<1||height>BAND_ROWS)throw Error("FRAME_DIMENSIONS_INVALID");
    if(offset+8+cols*height>bytes.length)throw Error("FRAME_TRUNCATED");
    recovered.push(bytes.subarray(offset+8,offset+8+cols*height));
    rows+=height;frames++;offset+=8+cols*height;
  }
  if(rows!==pbm.height||!Buffer.concat(recovered).equals(pbm.data))
    throw Error("FRAME_ROUNDTRIP_MISMATCH");
  return {bytes,width_dots:WIDTH,height_dots:pbm.height,bands:frames,metrics,
    ready_for_operational_print:false,
    effects:{print:false,spooler_write:false,cut:false,network:false,fiscal:false}};
}
function run(argv=process.argv.slice(2)){
  if(argv.length!==2||argv[0]!=="--pbm")throw Error("USAGE: --pbm <local-file>");
  const input=path.resolve(argv[1]);
  const proof=toGsV0Raster(readP4(fs.readFileSync(input)));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-figma-v61-escpos-offline-"));
  const filename=path.basename(input,".pbm").replace(/[^a-z0-9_-]/gi,"_")+".escpos";
  fs.writeFileSync(path.join(dir,filename),proof.bytes);
  const manifest={schema:"deliveryos.figma-raster-escpos-v61.offline.v1",
    source_local_pbm:input,master_figma:{production:"30:2",conference:"20:2"},
    file:filename,sha256:crypto.createHash("sha256").update(proof.bytes).digest("hex"),
    size_bytes:proof.bytes.length,width_dots:proof.width_dots,height_dots:proof.height_dots,
    bands:proof.bands,metrics:proof.metrics,ready_for_operational_print:false,
    physical_print:false,printer_calibrated:false,figma_pixel_parity_proven:false,
    effects:proof.effects};
  fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log("OFFLINE_RASTER_DIR="+dir);
  console.log("GS_V0_RASTER_PASS="+filename+" HEIGHT="+proof.height_dots+" BANDS="+proof.bands);
  console.log("PRINT=false SPOOLER=false CUT=false DEVICE_CALIBRATED=false");
  return {dir,manifest};
}
if(require.main===module)try{run();}catch(e){console.error("BLOCKED:"+e.message);process.exitCode=1;}
module.exports={readP4,guardRaster,toGsV0Raster,run};
