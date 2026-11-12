"use strict";
/**
 * Virtual paper for the V4.6 ESC/POS bytes — reads the BYTES the chain
 * would send, never the text trace, and lays them out on the TM-T20 dot grid:
 * 203 dpi, 576 printable dots (72 mm) on 80 mm paper, Font A 12x24 and
 * Font B 9x17 cells, GS ! width/height multipliers, ESC a alignment.
 *
 * Geometry is exact on the cell grid; glyph shapes are NOT Epson bitmaps and
 * the vertical feed is modelled as max(30 dots, tallest cell in the line)
 * (an assumption to be confirmed on paper). Any byte outside the command set
 * the V4.6 renderer emits is refused: an unknown command is never guessed.
 *
 * Pure: no device, spooler, file or network.
 */
const DPI=203,PAPER_DOTS=Math.round(80/25.4*DPI),PRINTABLE=576,LEFT=Math.floor((PAPER_DOTS-PRINTABLE)/2);
const CELL={A:{w:12,h:24},B:{w:9,h:17}};
const FEED_MIN=30;
const mm=dots=>Math.round(dots/DPI*25.4*100)/100;

function decodeEscposV46(bytes){
 const b=Array.from(bytes||[]),lines=[],errors=[];
 const st={font:"A",bold:false,align:"LEFT",wmul:1,hmul:1};
 let runs=[],text="";
 const flush=()=>{if(text){runs.push({...st,text});text="";}};
 for(let i=0;i<b.length;i++){
  const c=b[i];
  if(c===0x1b){
   const op=b[i+1],n=b[i+2];
   if(op===0x40){flush();Object.assign(st,{font:"A",bold:false,align:"LEFT",wmul:1,hmul:1});i+=1;continue;}
   if(op===0x74&&n===0x10){i+=2;continue;} // WPC1252, the only table V4.6 selects
   if(op===0x4d&&(n===0||n===1)){flush();st.font=n?"B":"A";i+=2;continue;}
   if(op===0x61&&[0,1,2].includes(n)){flush();st.align=["LEFT","CENTER","RIGHT"][n];i+=2;continue;}
   if(op===0x45&&(n===0||n===1)){flush();st.bold=n===1;i+=2;continue;}
   errors.push("UNSUPPORTED_ESC_0x"+Number(op).toString(16)+"@"+i);break;
  }
  if(c===0x1d){
   const op=b[i+1],n=b[i+2];
   if(op===0x21&&n!==undefined){flush();st.wmul=1+((n>>4)&7);st.hmul=1+(n&7);i+=2;continue;}
   errors.push("UNSUPPORTED_GS_0x"+Number(op).toString(16)+"@"+i);break;
  }
  if(c===0x0a){flush();lines.push(runs);runs=[];continue;}
  if(c<0x20||c===0x7f){errors.push("UNSUPPORTED_CONTROL_0x"+c.toString(16)+"@"+i);break;}
  text+=Buffer.from([c]).toString("latin1");
 }
 flush();if(runs.length)lines.push(runs);
 return {lines,errors};
}

/** Lines -> dot geometry. Alignment applies to the whole line (V4.6 never mixes). */
function layoutVirtualPaperV1(bytes){
 const {lines,errors}=decodeEscposV46(bytes);
 let y=0;const out=[];
 for(const runs of lines){
  const width=runs.reduce((s,r)=>s+[...r.text].length*CELL[r.font].w*r.wmul,0);
  const height=runs.reduce((h,r)=>Math.max(h,CELL[r.font].h*r.hmul),0);
  const feed=Math.max(FEED_MIN,height);
  const align=runs[0]?.align??"LEFT";
  const x=align==="RIGHT"?PRINTABLE-width:align==="CENTER"?Math.floor((PRINTABLE-width)/2):0;
  out.push({y,feed,x,width,height,align,
   text:runs.map(r=>r.text).join(""),
   runs:runs.map(r=>({text:r.text,font:r.font,bold:r.bold,wmul:r.wmul,hmul:r.hmul}))});
  y+=feed;
 }
 const overflow=out.filter(l=>l.width>PRINTABLE||l.x<0).map(l=>l.text);
 return {schema:"tata.comandas.virtual-paper-escpos.v1",dpi:DPI,paper_dots:PAPER_DOTS,
  printable_dots:PRINTABLE,length_dots:y,length_mm:mm(y),lines:out,errors,overflow,
  assumptions:["FEED=max(30 dots, tallest cell)","GLYPHS_NOT_EPSON_BITMAPS","CP1252_CANDIDATE"],
  effects:{print:false,spooler:false,device:false,network:false,file_write:false}};
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
/** SVG at a chosen pixel density (96 = same physical scale as the Figma masters). */
function virtualPaperSvgV1(layout,{pxPerInch=96,label=""}={}){
 const k=pxPerInch/DPI,W=Math.round(PAPER_DOTS*k),pad=Math.round(16*k*DPI/96);
 const H=Math.round((layout.length_dots+2*pad)*k)+(label?Math.round(18*k*DPI/96):0);
 const parts=[`<rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="#fff" stroke="#bbb"/>`,
  `<rect x="${(LEFT*k).toFixed(2)}" y="0" width="${(PRINTABLE*k).toFixed(2)}" height="${H}" fill="none" stroke="#e6e6e6" stroke-dasharray="3 3"/>`];
 for(const l of layout.lines){
  let x=LEFT+l.x;
  for(const r of l.runs){
   const cw=CELL[r.font].w*r.wmul,ch=CELL[r.font].h*r.hmul,n=[...r.text].length;
   const top=pad+l.y+(l.feed-ch);
   parts.push(`<text x="${(x*k).toFixed(2)}" y="${((top+ch*0.82)*k).toFixed(2)}" `+
    `font-family="DejaVu Sans Mono, Consolas, monospace" font-size="${(ch*0.92*k).toFixed(2)}" `+
    `font-weight="${r.bold?700:400}" textLength="${(n*cw*k).toFixed(2)}" lengthAdjust="spacingAndGlyphs" `+
    `xml:space="preserve">${esc(r.text)}</text>`);
   x+=n*cw;
  }
 }
 if(label)parts.push(`<text x="${(4*k*DPI/96).toFixed(1)}" y="${H-Math.round(5*k*DPI/96)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${(9*k*DPI/96).toFixed(1)}" fill="#a00">${esc(label)}</text>`);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}
module.exports={DPI,PAPER_DOTS,PRINTABLE,CELL,mm,decodeEscposV46,layoutVirtualPaperV1,virtualPaperSvgV1};
