"use strict";
/**
 * A visual-only, side-effect-free proof of the APPROVED TATA Figma 80mm masters.
 * Production V4.4 (30:2), conference V4.3 (20:2).
 * Source: a previously archived, reconciled real order; NEVER a live order.
 * Does not create printer bytes, spool jobs, a cut, a network request or a deployment.
 * SVG browser typography is NOT physical Epson bitmap parity.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {archivedResult} = require("./verificar_real_order_tickets_v46.js");

const FIGMA = "https://www.figma.com/design/nEjHuoJg2dMOqOzyutxXZ4";
const W = 302, LEFT = 16, RIGHT = 288;
const escapeXml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const canon = s => String(s ?? "").trim().replace(/\s+/g," ").toLocaleUpperCase("pt-BR");
const isPositiveInt = n => Number.isSafeInteger(n) && n>0;

class Receipt {
  constructor(kind, ids, station) {
    this.kind=kind; this.ids=ids; this.station=station;
    this.lines=[]; this.blockers=[]; this.y=16;
    this.boxCount=0; this.itemCount=0;
    if(!ids || !ids.ifood || !ids.teknisa || !/^\d{3}$/.test(ids.tata || "")) {
      this.blockers.push("IDENTIFIERS_NOT_PROVEN");
    }
    if(kind==="PRODUCAO") {
      this.text(LEFT,this.y+10,"SIMULAÇÃO · NÃO PRODUZIR",8,"mono",500);
      this.y+=16;
      this.text(LEFT,this.y+21,station,18,"condensed",700);
      this.y+=28;
      this.text(LEFT,this.y+11,this.meta(),9.5,"mono",500);
      this.y+=18;
    } else {
      this.text(LEFT,this.y+15,"CONFERÊNCIA",12,"mono",700);
      this.y+=20;
      this.text(LEFT,this.y+14,this.meta(),10.1,"mono",500);
      this.y+=19;
    }
    this.rule();
  }
  meta() {
    if(!this.ids) return "IDENTIFICADORES A CONFERIR";
    const s="iFood #"+this.ids.ifood+"  |  TEKNISA "+this.ids.teknisa+
      (this.ids.hour?"  |  "+this.ids.hour:"");
    if(s.length>49) this.blockers.push("META_EXCEEDS_REFERENCE_WIDTH");
    return s;
  }
  text(x,y,value,size,face="mono",weight=500,align="start") {
    const name=face==="condensed"?"Barlow Condensed":"Atkinson Hyperlegible Mono";
    const fallback=face==="condensed"?"Arial Narrow, sans-serif":"Consolas, monospace";
    const family="'"+name+"', "+fallback;
    this.lines.push('<text x="'+x+'" y="'+y+'" font-family="'+escapeXml(family)+
      '" font-size="'+size+'" font-weight="'+weight+'" text-anchor="'+align+
      '" fill="#000">'+escapeXml(value)+'</text>');
  }
  rule() {
    this.lines.push('<line x1="'+LEFT+'" y1="'+this.y+'" x2="'+RIGHT+
      '" y2="'+this.y+'" stroke="#000" stroke-width="1"/>');
    this.y+=6;
  }
  item(item) {
    const qty=item.quantity, label=canon(item.print_name);
    if(!isPositiveInt(qty)) this.blockers.push("INVALID_ITEM_QUANTITY");
    if(!label) this.blockers.push("ITEM_NAME_MISSING");
    if(String(qty).length>2) this.blockers.push("QTY_NEEDS_FIGMA_VALIDATION");
    // The Figma master reserves 240-242 px for the full name on ONE line.
    // Reject evidently long cases for review. NEVER abbreviate or clip.
    if([...label].length>32) this.blockers.push("FULL_NAME_WIDTH_NEEDS_REVIEW:"+label);
    this.text(LEFT,this.y+23,qty,this.kind==="PRODUCAO"?21:19,"mono",700);
    this.text(LEFT+32,this.y+21,label,18,"condensed",700);
    this.itemCount++;
    this.y+=29;
    const notes=[
      ...(item.observations||[]).map(v=>"OBS: "+canon(v)),
      ...(item.finishing||[]).map(v=>"FINALIZAR: "+canon(v)),
      ...(item.kitchen_dependencies||[]).map(v=>"AGUARDAR COZINHA: "+canon(v)),
    ];
    for(const note of notes) {
      if([...note].length>43) this.blockers.push("NOTE_WIDTH_NEEDS_REVIEW:"+note);
      this.text(LEFT,this.y+11,note,this.kind==="PRODUCAO"?10.5:11.3,
        "mono",this.kind==="PRODUCAO"?700:500);
      this.y+=18;
    }
  }
  box(model,position,items) {
    this.text(LEFT,this.y+12,position+"  CAIXA "+canon(model),10.5,"mono",700);
    if(this.kind==="CONFERENCIA")
      this.text(RIGHT,this.y+12,"Op. ________",10.5,"mono",700,"end");
    this.y+=17;
    for(const item of items) this.item(item);
    this.boxCount++;
    this.rule();
  }
  unknown(items) {
    if(!items.length)return;
    this.text(LEFT,this.y+11,"EMBALAGEM A CONFERIR",10.5,"mono",700);
    this.y+=18;
    for(const item of items)this.item(item);
    this.rule();
  }
  resources(bags,kits,accompaniments,warnings) {
    const groups=[["Sacola",bags],["Kit",kits],["Acomp.",accompaniments]];
    for(const [label,entries] of groups) {
      if(!entries.length) {
        if((label==="Sacola" && warnings.some(w=>/BAG_SIZE|EXACT_BAG|PACKAGING_PLAN/.test(w))) ||
           (label==="Kit" && warnings.some(w=>/KIT_PLAN|KIT_ASSIGNMENT/.test(w)))) {
          this.text(LEFT,this.y+11,label+": A CONFERIR",10.1);
          this.y+=17;
        }
        continue;
      }
      const words=entries.map(e=>String(e.quantity)+" "+canon(e.label));
      // No elision of resources: split only between complete resource labels.
      let row=label+": ";
      for(const word of words) {
        if(!isPositiveInt(entries[words.indexOf(word)].quantity))
          this.blockers.push("RESOURCE_QUANTITY_INVALID:"+label);
        const candidate=row.endsWith(": ")?row+word:row+"  |  "+word;
        if(candidate.length>42 && !row.endsWith(": ")) {
          this.text(LEFT,this.y+11,row,10.1);this.y+=17;
          row=label+": "+word;
        } else row=candidate;
        if(row.length>42)this.blockers.push("RESOURCE_LABEL_WIDTH_NEEDS_REVIEW:"+row);
      }
      this.text(LEFT,this.y+11,row,10.1);this.y+=17;
    }
    this.rule();
  }
  finish() {
    const seq=this.ids?.tata || "---";
    this.text(RIGHT,this.y+30,seq,30,"mono",700,"end");
    const height=this.y+47;
    const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+height+
      '" viewBox="0 0 '+W+' '+height+'">\n'+
      '<rect x=".5" y=".5" width="301" height="'+(height-1)+
      '" fill="#fff" stroke="#ccc"/>\n'+this.lines.join("\n")+'\n</svg>\n';
    return {kind:this.kind,station:this.station,width:W,height,svg:xml,
      boxes:this.boxCount,items:this.itemCount,
      ready_for_visual_review:this.blockers.length===0,
      blocking_reasons:[...new Set(this.blockers)],
      ready_for_operational_print:false,
      effects:{print:false,spooler_write:false,cut:false,network:false}};
  }
}
function makeProduction(ticket) {
  const name=/BALCAOSUSHI/i.test(ticket.station)?"SUSHI":canon(ticket.station);
  const r=new Receipt("PRODUCAO",ticket.identifiers,name);
  let physicalNumber=0;
  for(const box of ticket.boxes) {
    const repetitions=box.physical_box_count||1;
    if(!isPositiveInt(repetitions))r.blockers.push("INVALID_PHYSICAL_BOX_COUNT");
    // Expand repeated CLOSED_COMBO only if each physical box is proven.
    const split=repetitions>1 && box.items.length===1 &&
      box.items[0].quantity===repetitions && box.status==="PROVEN";
    if(repetitions>1&&!split)r.blockers.push("PER_BOX_DISTRIBUTION_NOT_PROVEN");
    for(let i=0;i<(split?repetitions:1);i++) {
      physicalNumber++;
      r.box(box.model||"A CONFERIR","C"+physicalNumber,
        split?[{...box.items[0],quantity:1}]:box.items);
    }
  }
  r.unknown(ticket.items_without_proven_box||[]);
  return r.finish();
}
function makeConference(ticket) {
  const r=new Receipt("CONFERENCIA",ticket.identifiers,"CONFERÊNCIA");
  for(const box of ticket.boxes) r.box(box.model||"A CONFERIR",
    box.position,box.items);
  r.unknown(ticket.items_without_proven_box||[]);
  r.resources(ticket.bags||[],ticket.kits||[],
    ticket.accompaniments||[],ticket.warnings||[]);
  return r.finish();
}
function render() {
  const source=archivedResult();
  assert.equal(source.ready_for_semantic_preview,true);
  assert.equal(source.production.length,2);
  assert.equal(source.conference.boxes.length,6);
  const tickets=[...source.production.map(makeProduction),
    makeConference(source.conference)];
  assert.equal(tickets.length,3);
  assert.ok(tickets.every(t=>t.ready_for_visual_review && !t.ready_for_operational_print));
  assert.equal(tickets.reduce((n,t)=>n+t.boxes,0),12);
  assert.equal(tickets.find(t=>t.kind==="CONFERENCIA").boxes,6);
  assert.ok(tickets.every(t=>t.svg.includes("Barlow Condensed") &&
    t.svg.includes("Atkinson Hyperlegible Mono")));
  assert.ok(!tickets.some(t=>/GS V|<script|<image|socket|spooler/i.test(t.svg)));
  return tickets;
}
function run(write=true) {
  const tickets=render();
  if(!write) {
    console.log("FIGMA_OFFLINE_VISUAL_CHECK=PASS");
    console.log("TICKETS="+tickets.length+" BOXES="+tickets.map(t=>t.boxes).join(","));
    console.log("PRINT=false FIGMA_PIXEL_PARITY=false DEVICE_CALIBRATED=false");
    return tickets;
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-figma-v60-offline-"));
  const outputs=[];
  for(const [i,t] of tickets.entries()) {
    const file=String(i+1).padStart(2,"0")+"-"+t.kind.toLowerCase()+
      "-"+t.station.toLowerCase().replace(/[^a-z0-9]/g,"-")+".svg";
    fs.writeFileSync(path.join(dir,file),t.svg,"utf8");
    outputs.push({file,sha256:crypto.createHash("sha256").update(t.svg).digest("hex"),
      boxes:t.boxes,items:t.items,width_px:t.width,height_px:t.height});
  }
  const manifest={schema:"deliveryos.figma-v60-visual-only-proof.v1",
    master:{production:FIGMA+"?node-id=30-2",conference:FIGMA+"?node-id=20-2"},
    source:"historical-reconciled-order-replay-2026-10-04",
    assets:outputs,uses_fully_validated_finishing_rules_only:true,
    ready_for_printer:false,figma_pixel_parity_proven:false,
    epson_bitmap_parity_proven:false,physical_print:false,
    effects:{print:false,spooler_write:false,cut:false,network:false,
      production_activation:false}};
  fs.writeFileSync(path.join(dir,"manifest.json"),
    JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("PROOF_DIR="+dir);
  console.log("FIGMA_VISUAL_PROOF_FILES="+outputs.length);
  console.log("PRINT=false");
  return {dir,manifest};
}
if(require.main===module)run(!process.argv.includes("--verify"));
module.exports={makeProduction,makeConference,render,run};