"use strict";
/** ESC/POS OFFLINE byte inspector — independent from the production renderer.
 * Source of dimensions/commands: Epson ESC/POS Command Reference, TM-T20 80mm.
 * Character bitmap rendering, hardware density, installed paper are NOT proven.
 * No network, printer, serial, USB, spooler, device API or cut effects.
 */
const PRINT_WIDTH_DOTS=576;
const FONT_DOTS={A:{width:12,height:24},B:{width:9,height:17}};
function inspectEscPos(bytes,opts={}){
 const raw=Buffer.from(bytes??[]);
 const errors=[];
 const lines=[];
 const commands=[];
 const profile={dpi:203,nominal_mm:80,printable_width_dots:PRINT_WIDTH_DOTS};
 let font="A", width=1,height=1,bold=false,align="LEFT",page=0;
 let bodyStarted=false;
 let x=0, rowHeight=0, text="", runs=[],lineNo=0;
 const add=(e)=>errors.push(String(e));
 function reset(){
  font="A";width=1;height=1;bold=false;align="LEFT";page=0;
 }
 function finish(){
  lines.push({index:lineNo++, text, width_dots:x,
   effective_height_dots:Math.max(30,rowHeight), alignment:align,
   segments:runs, max_observed_width_dots:PRINT_WIDTH_DOTS});
  if(x>PRINT_WIDTH_DOTS)add("PRINTABLE_WIDTH_OVERFLOW:"+lines.length+":"+x);
  x=0;rowHeight=0;text="";runs=[];
 }
 for(let i=0;i<raw.length;i++){
  const v=raw[i];
  if(v===0x0a){bodyStarted=true;finish();continue;}
  if(v===0x1b){
   if(i+1>=raw.length){add("TRUNCATED_ESC");break;}
   const cmd=raw[++i];
   if(![0x40,0x74,0x4d,0x61,0x45].includes(cmd)){
    add("UNEXPECTED_ESCAPE_COMMAND:"+cmd.toString(16));break;
   }
   if(cmd===0x40){
    if(i!==1 || bodyStarted)add("MID_DOCUMENT_RESET");
    reset();commands.push({type:"INIT"});continue;
   }
   if(i+1>=raw.length){add("TRUNCATED_ESC_ARG");break;}
   const n=raw[++i];
   if(cmd===0x74){
    if(bodyStarted)add("LATE_CODE_PAGE_SELECTION:"+n);
    page=n;commands.push({type:"CODE_PAGE",n});
    if(n!==16)add("UNEXPECTED_CODE_PAGE:"+n);
   }
   if(cmd===0x4d){
    font=n===0?"A":n===1?"B":"UNKNOWN";
    if(font==="UNKNOWN")add("UNEXPECTED_FONT:"+n);
    commands.push({type:"FONT",font});
   }
   if(cmd===0x61){
    align=n===0?"LEFT":n===1?"CENTER":n===2?"RIGHT":"UNKNOWN";
    if(align==="UNKNOWN")add("INVALID_ALIGN:"+n);
    commands.push({type:"ALIGN",value:align});
   }
   if(cmd===0x45){
    bold=n!==0;commands.push({type:"BOLD",value:bold});
   }
   continue;
  }
  if(v===0x1d){
   if(i+2>=raw.length){add("TRUNCATED_GS");break;}
   const cmd=raw[++i],n=raw[++i];
   if(cmd!==0x21){add("UNEXPECTED_GS_COMMAND:"+cmd.toString(16));break;}
   if(![0x00,0x01,0x10,0x11].includes(n))add("UNSUPPORTED_CHAR_SIZE:"+n);
   height=(n&7)+1;
   width=((n>>4)&7)+1;
   if(n&0x88)add("GS_RESERVED_BITS_SET:"+n);
   commands.push({type:"CHAR_SIZE",n,width,height});
   continue;
  }
  if(v<32 || v===0x7f || v===0xad || (v>=128&&v<160)){
   add("UNEXPECTED_CONTROL_BYTE:"+v.toString(16));continue;
  }
  if(font!=="A"&&font!=="B"){add("CHAR_WITHOUT_VALID_FONT");continue;}
  bodyStarted=true;
  const cw=FONT_DOTS[font].width*width;
  const ch=FONT_DOTS[font].height*height;
  const char=Buffer.from([v]).toString("latin1");
  const prev=runs[runs.length-1];
  if(prev && prev.font===font && prev.scale_width===width && prev.scale_height===height &&
     prev.bold===bold && prev.align===align && prev.code_page===page){
    prev.text+=char;prev.width_dots+=cw;
  }else{
    runs.push({font,bold,align,code_page:page,scale_width:width,scale_height:height,
      text:char,width_dots:cw,start_dot:x});
  }
  x+=cw;rowHeight=Math.max(rowHeight,ch);
  text+=char;
  if(x>PRINT_WIDTH_DOTS)add("TEXT_ADVANCES_PAST_PRINTABLE_DOTS:"+lineNo+":"+x);
 }
 if(text||x||runs.length)add("UNTERMINATED_LINE");
 if(!commands.some(c=>c.type==="INIT"))add("PRINTER_RESET_MISSING");
 if(!commands.some(c=>c.type==="CODE_PAGE"&&c.n===16))add("WPC1252_PAGE_SELECTION_MISSING");
 return {
  schema:"deliveryos.escpos-independent-byte-inspection.v51",
  page_width_dots:PRINT_WIDTH_DOTS,
  dpi:203,
  lines,commands,
  errors:[...new Set(errors)].sort(),
  pass:errors.length===0,
  note:"Approximate geometry from documented native fonts, not printed paper or raster preview.",
  effects:{print:false,cut:false,spooler_write:false},
 };
}
module.exports={inspectEscPos};
