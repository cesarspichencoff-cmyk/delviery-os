"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message){ throw new Error("tata-reader-shadow-route-success: " + message); }
function load(rel){ return JSON.parse(fs.readFileSync(path.resolve(__dirname,"..",rel),"utf8")); }
function canon(raw){
  const v=String(raw??"").trim().toUpperCase().replace(/\./g,"");
  if(!/^[A-Z0-9]{10}$/.test(v)) fail("invalid product code "+raw);
  return [v.slice(0,1),v.slice(1,3),v.slice(3,5),v.slice(5,8),v.slice(8,10)].join(".");
}

const ev=load("data/tata_reader_shadow_route_success_20261005_v1.json");
const routing=load("data/odhen_product_routing_compact_v1.json");
const printers=load("data/runtime_printer_map_v1.json");

if(ev.status!=="PROVEN_REAL_ORDER_SHADOW_ROUTE") fail("status");
if(ev.ready!==true) fail("ready");
if((ev.blockers??[]).length!==0) fail("blockers");
if(ev.service_identity!=="NT SERVICE\\TataComandaReader") fail("service identity");
if(ev.config?.routing_sha256!=="7084771026CA54F10069F02E0BABCAA00F9C7666484CBAF80EC1ECDCDCAA165D") fail("routing hash");
if(ev.config?.printer_map_sha256!=="F37DAE40779C5A205A26CEB289CD748D1C7747C1947C278F534A2DCC2F296F4C") fail("printer hash");
if(ev.order?.CDFILIAL!=="0001"||ev.order?.CDLOJA!=="01") fail("store");

const pm=new Map(printers.mappings.map(p=>[String(p.printer_code),p]));
for(const item of ev.items){
  if(item.route_status!=="ROUTED") fail("unrouted "+item.NRPRODCOMVEN);
  if((item.blockers??[]).length) fail("item blockers "+item.NRPRODCOMVEN);
  const code=canon(item.CDARVPROD);
  if(code!==item.retail_product_code) fail("canonical mismatch "+item.NRPRODCOMVEN);
  const expected=routing.products[code];
  if(!Array.isArray(expected)||!expected.length) fail("missing route "+code);
  const actual=item.targets.map(t=>String(t.printer_code));
  if(JSON.stringify(actual)!==JSON.stringify(expected)) fail("target list mismatch "+code);
  for(const target of item.targets){
    const p=pm.get(String(target.printer_code));
    if(!p) fail("printer missing "+target.printer_code);
    if(p.printer_name!==target.printer_name) fail("printer name "+target.printer_code);
    if(p.printer_ip!==target.printer_ip) fail("printer ip "+target.printer_code);
  }
}
if(ev.restoration?.runtime_restored!==true||ev.restoration?.preflight_script_restored!==true||ev.restoration?.evidence_restored!==true||ev.restoration?.config_restored!==true||ev.restoration?.service_stopped!==true) fail("restoration");
for(const [k,v] of Object.entries(ev.effects??{})){
  if(k==="order_row_read"||k==="local_config_read"){
    if(v!==true) fail("expected read effect "+k);
  } else if(v!==false) fail("unexpected effect "+k);
}
process.stdout.write("TATA_READER_SHADOW_ROUTE_SUCCESS_PASS\n");
