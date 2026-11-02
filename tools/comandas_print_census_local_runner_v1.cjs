"use strict";
/**
 * LOCAL census runner — prepared for a future, separately authorized run on
 * the store computer. NOT executed on any operational host by this change.
 *
 * Reads existing print artifacts READ-ONLY and prints ONE aggregate JSON to
 * stdout. It never writes a file, never opens a socket, never spawns a
 * process, never touches a print queue, never retries after an access
 * failure and never returns text, file paths, identifiers or content hashes.
 *
 *   --mode=imp-log   one directory of Odhen LogIMP files (<day>_IMP_*.txt);
 *                    framing unproven -> aggregate marker counts per file.
 *   --mode=spool-job explicit list of retained spool job files (one job each);
 *                    per-job document kind + ESC/POS prologue signature.
 *
 * Required: --authorization-ref=<ref> naming the human authorization record.
 * The ref is echoed in the output so the run is attributable; the code does
 * not and cannot verify that authorization exists.
 */
const nodeFs=require("node:fs");
const nodePath=require("node:path");
const {censusSubmissionV1,censusAggregateV1}=
 require("./comandas_print_document_census_v1_offline.cjs");
const {FILE_RE}=require("./comandas_imp_bridge_reconciliation_v1_offline.cjs");

const SCHEMA="tata.comandas.print-census-local-run.v1.review-only";
const DEFAULT_CAPS=Object.freeze({max_files:2000,max_file_bytes:64*1024*1024,
 max_total_bytes:512*1024*1024});
const CHUNK=1024*1024;
const EFFECTS=Object.freeze({filesystem_write:false,network:false,
 child_process:false,spooler:false,print:false,sql:false,source_lock:false,
 retry_after_access_failure:false});
const ACCESS_CODES=new Set(["EACCES","EPERM"]);
const QUOTA_CODES=new Set(["EDQUOT","ENOSPC","EMFILE","ENFILE"]);

function result(status,reason,body){
 return {schema:SCHEMA,status,reason,...body,
  claims:{paper_proven:false,device_effect_proven:false,
   order_identity_proven:false,first_native_dispatch_proven:false},
  privacy:{text_returned:false,paths_returned:false,raw_hash_returned:false,
   identifiers_returned:false},
  effects:EFFECTS};
}
function addCounts(into,counts){
 if(!counts)return;
 for(const [k,v] of Object.entries(counts))into[k]=(into[k]||0)+v;
}

/** Read one regular file into memory with a read-only, non-exclusive fd. */
function readBounded(io,file,maxBytes){
 const fd=io.openSync(file,"r");
 try{
  const st=io.fstatSync(fd);
  if(!st.isFile())return {skip:"NOT_REGULAR_FILE"};
  if(st.size>maxBytes)return {skip:"FILE_OVER_CAP"};
  const buf=Buffer.alloc(st.size);let off=0;
  while(off<st.size){
   const n=io.readSync(fd,buf,off,Math.min(CHUNK,st.size-off),off);
   if(n===0)break;off+=n;
  }
  return {bytes:off===st.size?buf:buf.subarray(0,off),
   grew_or_shrank_during_read:off!==st.size};
 }finally{io.closeSync(fd);}
}

/**
 * In-process entry point. `io` defaults to node:fs; tests inject spies.
 * Only openSync/fstatSync/readSync/closeSync/readdirSync/lstatSync/
 * realpathSync are ever used.
 */
function runCensus(options,io=nodeFs){
 const o=options&&typeof options==="object"?options:{};
 const caps={...DEFAULT_CAPS,...(o.caps||{})};
 if(typeof o.authorization_ref!=="string"||!/^[A-Za-z0-9:._#/-]{8,160}$/.test(o.authorization_ref))
  return result("REFUSED","AUTHORIZATION_REF_REQUIRED",{});
 if(o.mode!=="imp-log"&&o.mode!=="spool-job")
  return result("REFUSED","MODE_INVALID",{});
 const body={mode:o.mode,authorization_ref:o.authorization_ref,
  files_scanned:0,bytes_scanned:0,files_skipped:{},complete:false};
 const skip=r=>{body.files_skipped[r]=(body.files_skipped[r]||0)+1;};
 let files;
 try{
  if(o.mode==="imp-log"){
   if(typeof o.root!=="string")return result("REFUSED","ROOT_REQUIRED",{});
   const root=io.realpathSync(o.root);
   files=io.readdirSync(root).filter(n=>FILE_RE.test(n)).sort()
    .map(n=>({name:n,path:nodePath.join(root,n),root}));
  }else{
   if(!Array.isArray(o.files)||!o.files.length)
    return result("REFUSED","FILES_REQUIRED",{});
   files=o.files.map(p=>({name:null,path:String(p),root:null}));
  }
 }catch(e){
  if(ACCESS_CODES.has(e&&e.code))return result("STOPPED","ACCESS_DENIED_NO_FALLBACK",body);
  return result("STOPPED","SOURCE_UNAVAILABLE",body);
 }
 if(files.length>caps.max_files)
  return result("STOPPED","QUOTA_FILE_COUNT",{...body,files_found:files.length});
 const groups={};
 for(const f of files){
  if(body.bytes_scanned>=caps.max_total_bytes)
   return result("STOPPED","QUOTA_TOTAL_BYTES",body);
  let read;
  try{
   const st=io.lstatSync(f.path);
   if(st.isSymbolicLink()){skip("SYMLINK");continue;}
   if(f.root){
    const real=io.realpathSync(f.path);
    if(nodePath.dirname(real)!==f.root){skip("OUTSIDE_ROOT");continue;}
   }
   // A file that would exceed the TOTAL budget stops the run: skipping it
   // and reporting "complete" would turn missing data into zero counts.
   if(st.size>caps.max_total_bytes-body.bytes_scanned)
    return result("STOPPED","QUOTA_TOTAL_BYTES",body);
   read=readBounded(io,f.path,caps.max_file_bytes);
  }catch(e){
   const code=e&&e.code;
   if(ACCESS_CODES.has(code))return result("STOPPED","ACCESS_DENIED_NO_FALLBACK",body);
   if(QUOTA_CODES.has(code))return result("STOPPED","QUOTA_OR_HANDLE_LIMIT",body);
   if(code==="ENOENT"){skip("VANISHED");continue;}
   return result("STOPPED","SOURCE_READ_ERROR",body);
  }
  if(read.skip){skip(read.skip);continue;}
  body.files_scanned++;body.bytes_scanned+=read.bytes.length;
  if(read.grew_or_shrank_during_read)skip("CHANGED_DURING_READ_COUNTED_PARTIAL");
  if(o.mode==="imp-log"){
   const m=FILE_RE.exec(f.name);
   const key=m[2]===undefined?"GENERIC":(o.port_to_code&&o.port_to_code[m[3]])||"UNMAPPED_DESTINATION";
   const day=m[1].replace(/_/g,"-");
   const c=censusAggregateV1(read.bytes);
   const g=groups[key]||(groups[key]={files:0,days:[],bytes:0,marker_counts:{},
    fiscal_marker_present:false,printable_lines:0});
   g.files++;g.bytes+=c.byte_length;g.printable_lines+=c.printable_lines;
   if(!g.days.includes(day))g.days.push(day);
   g.fiscal_marker_present=g.fiscal_marker_present||c.fiscal_marker_present;
   addCounts(g.marker_counts,c.marker_counts);
  }else{
   const c=censusSubmissionV1(read.bytes);
   const g=groups[c.kind]||(groups[c.kind]={jobs:0,bytes:0,
    prologue_signatures:{},decode_partial:0});
   g.jobs++;g.bytes+=c.byte_length;
   if(c.decode_confidence==="PARTIAL")g.decode_partial++;
   if(c.escpos){const s=c.escpos.prologue_signature;
    g.prologue_signatures[s]=(g.prologue_signatures[s]||0)+1;}
  }
 }
 for(const g of Object.values(groups))if(g.days)g.days.sort();
 // Only policy exclusions keep a census complete; any other skip means some
 // existing bytes were not counted, so zero cannot be read as "none".
 body.complete=Object.keys(body.files_skipped)
  .every(k=>k==="SYMLINK"||k==="OUTSIDE_ROOT");
 return result(body.complete?"CENSUS_COMPLETE":"CENSUS_PARTIAL",
  "AGGREGATE_ONLY",{...body,groups});
}

function parseArgs(argv){
 const o={files:[]};
 for(const a of argv){
  const m=/^--([a-z-]+)=(.*)$/.exec(a);
  if(!m){o.files.push(a);continue;}
  const k=m[1].replace(/-/g,"_");
  if(k==="registry")o.registry=m[2];else o[k]=m[2];
 }
 return o;
}
if(require.main===module){
 const o=parseArgs(process.argv.slice(2));
 if(o.registry){
  // Registry is the committed printer map (config, not order data).
  const reg=JSON.parse(nodeFs.readFileSync(o.registry,"utf8"));
  o.port_to_code={};
  for(const e of reg.mappings||[]){
   if(!e.peripherals_server||!e.printer_ip)continue;
   const prev=o.port_to_code[e.printer_ip];
   // Two bridge-served printers on one address: never pick one silently.
   o.port_to_code[e.printer_ip]=prev&&prev!==e.printer_code?"AMBIGUOUS_DESTINATION":e.printer_code;
  }
 }
 const out=runCensus(o);
 process.stdout.write(JSON.stringify(out,null,1)+"\n");
 process.exitCode=out.status==="CENSUS_COMPLETE"?0:out.status==="REFUSED"?2:3;
}
module.exports={SCHEMA,EFFECTS,DEFAULT_CAPS,runCensus};
