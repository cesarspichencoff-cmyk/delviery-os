"use strict";
/**
 * Metadata-only reconciliation of Odhen Periféricos LogIMP files against the
 * Retail printer registry. PURE: it consumes already-captured file NAMES,
 * SIZES and LAST-WRITE times plus the committed registry. It never reads log
 * content, a live host, SQL, a queue or a printer.
 *
 * What it can establish for one day:
 *   - whether every byte of the generic `<day>_IMP.txt` is accounted for by the
 *     per-destination `<day>_IMP_<model>_<port>.txt` files (size identity);
 *   - which registry printer each per-destination file belongs to, refusing
 *     to resolve an address shared by two bridge-served registry entries;
 *   - which bridge-served registry printers logged ZERO bytes that day.
 * What it can never establish: paper, device receipt, document type, order
 * identity, first native dispatch, or coverage of non-bridge emitters
 * (iFood GP/Gestor, ForSale/Delphi, Windows-queue printing, Epson backup).
 */
const SCHEMA="tata.comandas.imp-bridge-reconciliation.v1.review-only";
const EFFECTS=Object.freeze({log_content_read:false,host_access:false,
 network:false,sql:false,spooler:false,print:false,filesystem_write:false});
const CLAIMS=Object.freeze({paper_proven:false,device_effect_proven:false,
 document_type_proven:false,order_identity_proven:false,
 first_native_dispatch_proven:false,non_bridge_emitters_covered:false});
const FILE_RE=/^(\d{4}_\d{2}_\d{2})_IMP(?:_(\d{1,3})_((?:\d{1,3}\.){3}\d{1,3}|LPT\d|COM\d|USB\d*))?\.txt$/;
const STAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?-03:00$/;
const plain=v=>v&&typeof v==="object"&&!Array.isArray(v);

function hold(reason,extra={}){
 return {schema:SCHEMA,status:"HOLD",reason,claims:CLAIMS,effects:EFFECTS,...extra};
}

function reconcileImpBridgeDayV1(files,registry){
 if(!Array.isArray(files)||!files.length||files.length>256)
  return hold("FILE_METADATA_MISSING");
 if(!plain(registry)||registry.schema!=="deliveryos.runtime-printer-map.v1"||
    !Array.isArray(registry.mappings))
  return hold("PRINTER_REGISTRY_INVALID");
 const seen=new Set();let day=null,generic=null;const parts=[];
 for(const f of files){
  if(!plain(f)||typeof f.file!=="string"||seen.has(f.file))
   return hold("FILE_METADATA_INVALID_OR_DUPLICATED");
  seen.add(f.file);
  const m=FILE_RE.exec(f.file);
  if(!m||!Number.isSafeInteger(f.size_bytes)||f.size_bytes<0||
     typeof f.last_write_local!=="string"||!STAMP.test(f.last_write_local)||
     !Number.isFinite(Date.parse(f.last_write_local)))
   return hold("FILE_METADATA_INVALID_OR_DUPLICATED");
  if(day===null)day=m[1];
  if(m[1]!==day)return hold("MIXED_DAYS_NOT_RECONCILABLE");
  if(m[2]===undefined){
   if(generic)return hold("FILE_METADATA_INVALID_OR_DUPLICATED");
   generic=f;
  }else parts.push({file:f,model:m[2],port:m[3]});
 }
 // Registry identities. A destination port resolves only when EXACTLY one
 // bridge-served entry claims it; other entries sharing it are reported.
 const entries=registry.mappings.filter(plain);
 const served=entries.filter(e=>typeof e.peripherals_server==="string"&&e.peripherals_server);
 const destinations=[];
 for(const p of parts){
  const all=entries.filter(e=>e.printer_ip===p.port||e.printer_port===p.port);
  const bridge=all.filter(e=>served.includes(e));
  const resolution=bridge.length===1?"RESOLVED":
   bridge.length===0?"UNREGISTERED_DESTINATION":"AMBIGUOUS_BRIDGE_DESTINATION";
  destinations.push({
   printer_code:bridge.length===1?bridge[0].printer_code:null,
   printer_name:bridge.length===1?bridge[0].printer_name:null,
   model_code:p.model,resolution,
   // Every OTHER registry entry claiming the same address.
   address_shared_with:all.filter(e=>!(bridge.length===1&&e===bridge[0]))
    .map(e=>e.printer_code).sort(),
   size_bytes:p.file.size_bytes,
   last_write_local:p.file.last_write_local
  });
 }
 destinations.sort((a,b)=>String(a.printer_code).localeCompare(String(b.printer_code)));
 const loggedCodes=new Set(destinations.map(d=>d.printer_code).filter(Boolean));
 const silent=served.filter(e=>!loggedCodes.has(e.printer_code))
  .map(e=>({printer_code:e.printer_code,printer_name:e.printer_name,
   used_by_products:e.used_by_products===true}))
  .sort((a,b)=>a.printer_code.localeCompare(b.printer_code));
 const partSum=parts.reduce((s,p)=>s+p.file.size_bytes,0);
 const maxPart=parts.reduce((s,p)=>Math.max(s,Date.parse(p.file.last_write_local)),-Infinity);
 let coverage,residual=null,genericMirrorsLatest=null;
 if(!generic)coverage="GENERIC_LOG_ABSENT_COVERAGE_UNKNOWN";
 else{
  residual=generic.size_bytes-partSum;
  genericMirrorsLatest=parts.length>0&&Date.parse(generic.last_write_local)===maxPart;
  coverage=residual===0?"GENERIC_EQUALS_SUM_OF_DESTINATION_FILES":
   residual>0?"UNATTRIBUTED_BRIDGE_BYTES":"GENERIC_SMALLER_THAN_PARTS_CONTRADICTION";
 }
 const unresolved=destinations.filter(d=>d.resolution!=="RESOLVED").length;
 const status=coverage==="GENERIC_EQUALS_SUM_OF_DESTINATION_FILES"&&unresolved===0
  ?"BRIDGE_DAY_RECONCILED_METADATA_ONLY":"HOLD";
 return {schema:SCHEMA,status,
  reason:status==="HOLD"?(unresolved?"DESTINATION_NOT_UNIQUELY_RESOLVED":coverage):
   "SIZE_IDENTITY_AND_UNIQUE_DESTINATIONS",
  day:day.replace(/_/g,"-"),coverage,residual_bytes:residual,
  generic_last_write_equals_latest_destination:genericMirrorsLatest,
  destination_files:parts.length,destinations,
  bridge_served_printers_without_log:silent,
  registry_address_collisions:collisions(entries),
  interpretation:{
   residual_zero_means:"every logged bridge byte that day went to a listed destination file",
   silent_printer_means:"zero bytes logged by this bridge for it that day; not proof that nothing printed by another emitter"
  },
  claims:CLAIMS,effects:EFFECTS};
}
function collisions(entries){
 const by=new Map();
 for(const e of entries){
  if(typeof e.printer_ip!=="string"||!e.printer_ip)continue;
  if(!by.has(e.printer_ip))by.set(e.printer_ip,[]);
  by.get(e.printer_ip).push(e);
 }
 return [...by.values()].filter(v=>v.length>1).map(v=>({
  printer_codes:v.map(e=>e.printer_code).sort(),
  bridge_served_codes:v.filter(e=>typeof e.peripherals_server==="string"&&e.peripherals_server)
   .map(e=>e.printer_code).sort()
 }));
}
module.exports={SCHEMA,EFFECTS,CLAIMS,FILE_RE,reconcileImpBridgeDayV1};
