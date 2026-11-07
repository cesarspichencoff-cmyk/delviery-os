"use strict";
/**
 * Offline gate for the print-provenance kit: field matrix, content-minimizing
 * census, LogIMP metadata reconciliation and the local runner's safety
 * properties. Synthetic print text only, plus already-committed METADATA
 * (file names/sizes/times, printer registry). No host, SQL, queue or print.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const Module=require("node:module");
const {execFileSync}=require("node:child_process");

const ROOT=path.join(__dirname,"..");
const Census=require("./comandas_print_document_census_v1_offline.cjs");
const Recon=require("./comandas_imp_bridge_reconciliation_v1_offline.cjs");
const Runner=require("./comandas_print_census_local_runner_v1.cjs");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");

let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
const ESC=0x1b,GS=0x1d;
const esc=(...b)=>Buffer.from(b);
const latin=s=>Buffer.from(s,"latin1");
const doc=(...parts)=>Buffer.concat([esc(ESC,0x40),esc(ESC,0x74,2),
 ...parts.map(p=>Buffer.isBuffer(p)?p:latin(p+"\n")),esc(GS,0x56,66,0)]);
// Canaries: structural PII and identifiers that must NEVER reach output.
const CANARIES=["PESSOA FICTICIA","11987654321","RUA DAS CANARIAS 77",
 "APTO 1203","PIX 87,90","170516","9632","SEM CEBOLINHA","Uramaki Canario"];
const noCanary=(obj,label)=>{
 const s=JSON.stringify(obj);
 for(const c of CANARIES)assert.equal(s.includes(c),false,label+" leaked "+c);
};
const deliveryReport=()=>doc("Relatorio De Entrega","PEDIDO: 170516  IFOOD: 9632",
 "CLIENTE: PESSOA FICTICIA","TELEFONE: 11987654321",
 "ENDERECO: RUA DAS CANARIAS 77 APTO 1203","1 x Uramaki Canario",
 "  SEM CEBOLINHA","OBS.: PORTARIA","PAGAMENTO: PIX 87,90");
const productionDlv=()=>doc("COMANDA.: DLV_170516",esc(ESC,0x45,1),
 "2 Uramaki Canario",esc(ESC,0x45,0),"  SEM CEBOLINHA");

// ---------------------------------------------------------------- matrix
const matrix=JSON.parse(fs.readFileSync(path.join(ROOT,
 "data/comandas_print_field_matrix_20261102_review_only.json"),"utf8"));
test("matrix: every claim is tethered to a literal anchor in its repository source",()=>{
 assert.equal(matrix.schema,"tata.comandas.print-field-matrix.v1.review-only");
 const ids=new Set();
 for(const f of matrix.fields){
  assert.equal(ids.has(f.id),false,"duplicate "+f.id);ids.add(f.id);
  assert.ok(matrix.status_vocabulary.includes(f.printed_status),f.id);
  assert.ok(matrix.identity_vocabulary.includes(f.identity_role),f.id);
  const text=fs.readFileSync(path.join(ROOT,f.anchor.path),"utf8");
  assert.ok(text.includes(f.anchor.contains),f.id+" anchor drifted: "+f.anchor.path);
 }
 assert.ok(matrix.fields.length>=30);
});
test("matrix: no paper claim, no strong key printed, iFood invoice layout stays unknown",()=>{
 assert.equal(matrix.invariants.physical_paper_claimed,false);
 assert.equal(matrix.invariants.strong_four_part_key_printed_by_any_native_channel,false);
 for(const f of matrix.fields){
  assert.doesNotMatch(f.printed_status,/PAPER_PROVEN|PHYSICAL|WORLD/);
  assert.notEqual(f.identity_role,"ORDER_REFERENCE_STRONG");
 }
 for(const ch of ["IFOOD_GP_HTTP","IFOOD_GESTOR_IPC"]){
  const content=matrix.fields.filter(f=>f.channel===ch&&f.source_field==="invoice");
  assert.equal(content.length,1,ch);
  assert.equal(content[0].printed_status,"UNKNOWN_NO_SOURCE");
 }
 const byId=Object.fromEntries(matrix.fields.map(f=>[f.id,f]));
 // The code path that prints DLV_<N> and the paper that refuted it coexist.
 assert.equal(byId.NP04.printed_status,"SOURCE_CODE_CONDITIONAL");
 assert.equal(byId.NP05.printed_status,"REFUTED_ON_OBSERVED_PAPER");
 assert.equal(byId.DR07.printed_status,"ABSENT_IN_SOURCE");
 assert.equal(byId.DR08.printed_status,"ABSENT_IN_SOURCE");
});
test("matrix: the missing link per native channel is computed, not asserted",()=>{
 const unconditional=f=>f.printed_status==="SOURCE_CODE_PROVEN";
 const refs=ch=>matrix.fields.filter(f=>f.channel===ch&&
  f.identity_role.startsWith("ORDER_REFERENCE")&&unconditional(f));
 // Native production prints NO unconditional order reference at all.
 assert.equal(refs("NATIVE_PRODUCTION").length,0);
 // The delivery report prints NRCOMANDA only: a partial key, never the four parts.
 assert.deepEqual(refs("NATIVE_DELIVERY_REPORT").map(f=>f.source_field),["NRCOMANDA"]);
 assert.equal(refs("IFOOD_GP_HTTP").length+refs("IFOOD_GESTOR_IPC").length,0);
});
test("matrix: TATA shadow fields are MEASURED from the renderer, and carry no customer PII",()=>{
 const proofs=renderOperationalTicketsProofV46(archivedResult());
 const all=[...proofs.production,proofs.conference];
 assert.equal(proofs.production.length,2);
 for(const p of all){
  assert.ok(p.text_trace.includes("TESTE - NAO PRODUZIR"));
  assert.match(p.text_trace,/IFOOD .* \| TEKNISA /);
  assert.doesNotMatch(p.text_trace,/ENDERE[CÇ]O|TELEFONE|PAGAMENTO|\bCPF\b|CLIENTE/i);
  assert.equal(p.ready_for_operational_print,false);
 }
 assert.ok(proofs.production.every(p=>/PRODUCAO /.test(p.text_trace)));
 assert.ok(proofs.conference.text_trace.includes("CONFERENCIA"));
});

// ---------------------------------------------------------------- census
test("census: decoder reproduces the TATA renderer trace byte-exactly, then says only TATA_SHADOW_TEST",()=>{
 const proofs=renderOperationalTicketsProofV46(archivedResult());
 for(const p of [...proofs.production,proofs.conference]){
  assert.ok(p.bytes.length>0);
  assert.equal(Census.decoderMatchesTraceV1(p.bytes,p.text_trace),true,p.name);
  const c=Census.censusSubmissionV1(p.bytes);
  assert.equal(c.kind,"TATA_SHADOW_TEST");
  assert.equal(c.decode_confidence,"FULL");
  assert.match(c.escpos.prologue_signature,/^ESC@\|ESCt16/);
  const out=JSON.stringify(c);
  for(const line of p.text_trace.split("\n").map(l=>l.trim()).filter(l=>l.length>=6))
   assert.equal(out.includes(line),false,"trace text leaked: "+line);
 }
});
test("census: delivery report recognized by its source-proven header, PII and ids never returned",()=>{
 const c=Census.censusSubmissionV1(deliveryReport());
 assert.equal(c.kind,"DELIVERY_REPORT");
 assert.equal(c.marker_counts.DELIVERY_REPORT_HEADER,1);
 assert.equal(c.marker_counts.ORDER_OBS_LABEL,1);
 assert.equal(c.escpos.cut,1);
 assert.deepEqual(c.privacy,{text_returned:false,raw_hash_returned:false,identifiers_returned:false});
 noCanary(c,"delivery");
});
test("census: DLV-marked production, table candidate, and Pedido-only stays UNKNOWN",()=>{
 const p=Census.censusSubmissionV1(productionDlv());
 assert.equal(p.kind,"PRODUCTION_TICKET_DLV_MARKED");noCanary(p,"production");
 assert.equal(Census.censusSubmissionV1(doc("Mesa: 12","1 Uramaki Canario")).kind,
  "TABLE_TICKET_CANDIDATE");
 // iFood layouts are unknown; a generic "Pedido" must not be guessed as anything.
 const unknown=Census.censusSubmissionV1(doc("Pedido #9632","1x Uramaki Canario"));
 assert.equal(unknown.kind,"UNKNOWN_FORMAT");
 assert.equal(unknown.claims.ifood_layout_recognized,false);noCanary(unknown,"unknown");
});
test("census: fiscal document is excluded with no structural detail",()=>{
 const c=Census.censusSubmissionV1(doc("DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletronica",
  "CPF: 000.000.000-00","PIX 87,90"));
 assert.equal(c.kind,"FISCAL_EXCLUDED");
 assert.equal(c.marker_counts,null);assert.equal(c.escpos,null);
 assert.equal(c.printable_lines,null);noCanary(c,"fiscal");
});
test("census: two documents in one unframed block are never silently merged",()=>{
 assert.equal(Census.censusSubmissionV1(Buffer.concat([deliveryReport(),deliveryReport()])).kind,
  "MULTIPLE_DOCUMENTS_FRAMING_UNPROVEN");
 assert.equal(Census.censusSubmissionV1(Buffer.concat([deliveryReport(),productionDlv()])).kind,
  "MULTIPLE_DOCUMENTS_FRAMING_UNPROVEN");
});
test("census: hostile bytes never throw and are flagged PARTIAL",()=>{
 const cases=[esc(GS,0x76,0x30,0,0xff,0xff,0xff,0xff,1,2),esc(ESC),esc(GS,0x28,0x6b,0xff),
  esc(ESC,0x2a,33,0xff,0xff),crypto.randomBytes(4096),Buffer.alloc(0)];
 for(const b of cases){
  const c=Census.censusSubmissionV1(b);
  assert.equal(c.status,"CENSUS_ONLY");
  assert.ok(Census.KINDS.includes(c.kind));
 }
 assert.equal(Census.censusSubmissionV1(esc(GS,0x76,0x30,0,0xff,0xff,0xff,0xff)).decode_confidence,"PARTIAL");
 assert.equal(Census.censusSubmissionV1(Buffer.alloc(0)).kind,"EMPTY");
 assert.equal(Census.censusSubmissionV1("Relatorio De Entrega").status,"HOLD");
});
test("census: aggregate mode counts markers without claiming documents",()=>{
 const a=Census.censusAggregateV1(Buffer.concat([deliveryReport(),productionDlv(),doc("Mesa: 3")]));
 assert.equal(a.unit,"AGGREGATE_NO_FRAMING");assert.equal(a.kind,null);
 assert.equal(a.marker_counts.DELIVERY_REPORT_HEADER,1);
 assert.equal(a.marker_counts.DLV_COMANDA,1);
 assert.equal(a.marker_counts.MESA_LABEL,1);
 assert.equal(a.claims.documents_counted,false);noCanary(a,"aggregate");
});

test("provenance: weak references never become identity; only a bound four-part key reaches candidate",()=>{
 const del=Census.censusSubmissionV1(deliveryReport());
 const V=(census,ref,dest="RESOLVED")=>Census.provenanceVerdictV1({census,order_reference:ref,destination_resolution:dest});
 for(const kind of ["NRCOMANDA_ONLY","SHORT_CODE","TIME_WINDOW","QUEUE_NAME","FILE_COUNTER","ITEM_CONTENT_MATCH"]){
  const v=V(del,{kind});
  assert.equal(v.verdict,"SOURCE_PRINT_FORMAT_PROVEN",kind);
  assert.equal(v.reason,"WEAK_REFERENCE_IS_NOT_IDENTITY");
 }
 assert.equal(V(del,{kind:"FOUR_PART_KEY",revision_bound:false}).reason,"ORDER_REFERENCE_UNBOUND");
 const top=V(del,{kind:"FOUR_PART_KEY",revision_bound:true});
 assert.equal(top.verdict,"ORDER_TO_SUBMISSION_CANDIDATE");
 assert.equal(top.identity.device_effect,"UNKNOWN");
 assert.equal(top.world_proven,false);assert.equal(top.paper_proven,false);
 assert.equal(V(del,{kind:"FOUR_PART_KEY",revision_bound:true},"AMBIGUOUS_BRIDGE_DESTINATION").verdict,"INSUFFICIENT_EVIDENCE");
});
test("provenance: unknown, table-candidate, fiscal and TATA test documents stay INSUFFICIENT",()=>{
 const ref={kind:"FOUR_PART_KEY",revision_bound:true};
 const proofs=renderOperationalTicketsProofV46(archivedResult());
 for(const [bytes,reason] of [
  [doc("Pedido #9632"),"DOCUMENT_FORMAT_NOT_SOURCE_PROVEN"],
  [doc("Mesa: 4"),"DOCUMENT_FORMAT_NOT_SOURCE_PROVEN"],
  [doc("DANFE NFC-e"),"FISCAL_CHANNEL_EXCLUDED"],
  [Buffer.from(proofs.conference.bytes),"TATA_TEST_DOCUMENT_IN_STREAM_ANOMALY"]]){
  const v=Census.provenanceVerdictV1({census:Census.censusSubmissionV1(bytes),order_reference:ref,destination_resolution:"RESOLVED"});
  assert.equal(v.verdict,"INSUFFICIENT_EVIDENCE");assert.equal(v.reason,reason);
 }
 // Aggregate (unframed) census can never feed a per-submission verdict.
 assert.equal(Census.provenanceVerdictV1({census:Census.censusAggregateV1(deliveryReport()),
  order_reference:ref,destination_resolution:"RESOLVED"}).reason,"SUBMISSION_CENSUS_REQUIRED");
 // Matrix consequence: no native document prints a four-part key, so a native
 // production submission tops out at SOURCE_PRINT_FORMAT_PROVEN.
 const prod=Census.provenanceVerdictV1({census:Census.censusSubmissionV1(productionDlv()),
  order_reference:{kind:"NRCOMANDA_ONLY"},destination_resolution:"RESOLVED"});
 assert.equal(prod.verdict,"SOURCE_PRINT_FORMAT_PROVEN");
});

// ---------------------------------------------------------- reconciliation
const sourceProof=JSON.parse(fs.readFileSync(path.join(ROOT,
 "data/tata_reader_passive_print_log_source_proof_20261005_v1.json"),"utf8"));
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,"data/runtime_printer_map_v1.json"),"utf8"));
test("reconciliation: committed 2026-10-04 metadata — generic log equals the sum of six destinations",()=>{
 const files=sourceProof.observed_files;
 const generic=files.find(f=>/_IMP\.txt$/.test(f.file)).size_bytes;
 const sum=files.filter(f=>/_IMP_/.test(f.file)).reduce((s,f)=>s+f.size_bytes,0);
 const r=Recon.reconcileImpBridgeDayV1(files,registry);
 assert.equal(r.status,"BRIDGE_DAY_RECONCILED_METADATA_ONLY");
 assert.equal(r.residual_bytes,generic-sum);
 assert.equal(r.residual_bytes,0);
 assert.equal(r.generic_last_write_equals_latest_destination,true);
 assert.deepEqual(r.destinations.map(d=>d.printer_code),["00002","00003","00004","00006","00007","00009"]);
 assert.ok(r.destinations.every(d=>d.resolution==="RESOLVED"));
 assert.deepEqual(r.bridge_served_printers_without_log.map(p=>p.printer_code),["00001","00005"]);
 assert.deepEqual(r.registry_address_collisions,[{printer_codes:["00007","00010"],bridge_served_codes:["00007"]}]);
 assert.deepEqual(r.destinations.find(d=>d.printer_code==="00007").address_shared_with,["00010"]);
 assert.equal(JSON.stringify(r).includes("192.168."),false);
 for(const v of Object.values(r.claims))assert.equal(v,false);
});
test("reconciliation: residual, missing generic, shared bridge address and unknown port all HOLD",()=>{
 const files=structuredClone(sourceProof.observed_files);
 const g=files.find(f=>/_IMP\.txt$/.test(f.file));
 const extra=structuredClone(files);extra.find(f=>f.file===g.file).size_bytes+=17;
 const r1=Recon.reconcileImpBridgeDayV1(extra,registry);
 assert.equal(r1.coverage,"UNATTRIBUTED_BRIDGE_BYTES");assert.equal(r1.residual_bytes,17);assert.equal(r1.status,"HOLD");
 const r2=Recon.reconcileImpBridgeDayV1(files.filter(f=>f!==g),registry);
 assert.equal(r2.coverage,"GENERIC_LOG_ABSENT_COVERAGE_UNKNOWN");assert.equal(r2.status,"HOLD");
 const reg=structuredClone(registry);
 reg.mappings.find(m=>m.printer_code==="00010").peripherals_server="192.168.0.24:3000";
 const r3=Recon.reconcileImpBridgeDayV1(files,reg);
 assert.equal(r3.status,"HOLD");assert.equal(r3.reason,"DESTINATION_NOT_UNIQUELY_RESOLVED");
 assert.equal(r3.destinations.find(d=>d.resolution==="AMBIGUOUS_BRIDGE_DESTINATION").printer_code,null);
 const unknown=structuredClone(files);unknown[1].file=unknown[1].file.replace(/_16_[\d.]+\.txt$/,"_16_10.9.9.9.txt");
 assert.equal(Recon.reconcileImpBridgeDayV1(unknown,registry).destinations.some(d=>d.resolution==="UNREGISTERED_DESTINATION"),true);
 const mixed=structuredClone(files);mixed[0].file=mixed[0].file.replace("2026_10_04","2026_10_03");
 assert.equal(Recon.reconcileImpBridgeDayV1(mixed,registry).reason,"MIXED_DAYS_NOT_RECONCILABLE");
 assert.equal(Recon.reconcileImpBridgeDayV1([],registry).status,"HOLD");
 assert.equal(Recon.reconcileImpBridgeDayV1(files,{}).reason,"PRINTER_REGISTRY_INVALID");
});

// ------------------------------------------------------------ runner safety
const AUTH="synthetic:offline-test-not-an-authorization";
function fixtureDir(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-census-"));
 const del=deliveryReport(),prod=productionDlv(),mesa=doc("Mesa: 5","1 Uramaki Canario");
 fs.writeFileSync(path.join(dir,"2026_10_04_IMP_16_192.168.0.116.txt"),Buffer.concat([prod,mesa]));
 fs.writeFileSync(path.join(dir,"2026_10_04_IMP_16_192.168.0.142.txt"),del);
 fs.writeFileSync(path.join(dir,"2026_10_04_IMP.txt"),Buffer.concat([prod,mesa,del]));
 fs.writeFileSync(path.join(dir,"notes.txt"),"CLIENTE: PESSOA FICTICIA");
 return dir;
}
function snapshot(dir){
 return fs.readdirSync(dir).sort().map(n=>{const p=path.join(dir,n),s=fs.statSync(p);
  return [n,s.size,s.mtimeMs,crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")];});
}
const READ_ONLY=new Set(["openSync","fstatSync","readSync","closeSync","readdirSync","lstatSync","realpathSync"]);
function spyIo(overrides={}){
 const calls=[];
 const io=new Proxy(fs,{get(t,k){
  if(typeof t[k]!=="function")return t[k];
  return (...a)=>{calls.push(String(k));
   if(k==="openSync"&&a[1]!=="r")throw new Error("WRITE_OPEN_ATTEMPT");
   if(overrides[k])return overrides[k](...a);
   return t[k](...a);};}});
 return {io,calls};
}
test("runner (i)(vi): read-only syscalls only, source bytes and times unchanged",()=>{
 const dir=fixtureDir(),before=snapshot(dir);
 const {io,calls}=spyIo();
 const out=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH,
  port_to_code:{"192.168.0.116":"00002","192.168.0.142":"00009"}},io);
 assert.equal(out.status,"CENSUS_COMPLETE");
 assert.ok(calls.every(c=>READ_ONLY.has(c)),[...new Set(calls)].join(","));
 assert.deepEqual(snapshot(dir),before);
 assert.equal(out.files_scanned,3);
 assert.equal(out.groups["00002"].marker_counts.DLV_COMANDA,1);
 assert.equal(out.groups["00002"].marker_counts.MESA_LABEL,1);
 assert.equal(out.groups["00009"].marker_counts.DELIVERY_REPORT_HEADER,1);
 assert.equal(out.groups.GENERIC.marker_counts.DELIVERY_REPORT_HEADER,1);
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner (ii)(iii)(vi): no network/process/printer module loaded, no text, paths or ids out",()=>{
 const dir=fixtureDir();
 const loaded=[];const orig=Module._load;
 Module._load=function(req,...rest){loaded.push(req);return orig.call(this,req,...rest);};
 let out;
 try{out=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH});}
 finally{Module._load=orig;}
 assert.deepEqual(loaded.filter(r=>/^(node:)?(net|http|https|http2|tls|dgram|child_process|worker_threads|cluster)$/.test(r)||/printer/i.test(r)),[]);
 noCanary(out,"runner");
 const s=JSON.stringify(out);
 assert.equal(s.includes(dir),false);assert.equal(s.includes("192.168."),false);
 assert.equal(s.includes("IMP_16"),false);
 for(const f of ["comandas_print_document_census_v1_offline.cjs",
  "comandas_imp_bridge_reconciliation_v1_offline.cjs","comandas_print_census_local_runner_v1.cjs"]){
  const src=fs.readFileSync(path.join(__dirname,f),"utf8");
  assert.doesNotMatch(src,/require\(["'](?:node:)?(?:net|http|https|http2|tls|dgram|child_process|worker_threads|cluster)["']\)/,f);
  // RegExp#exec is fine; a bare exec()/execFile()/spawn() call is not.
  assert.doesNotMatch(src,/writeFile|appendFile|createWriteStream|\.writeSync|unlink|rmSync|renameSync|printDirect|\bspawn(?:Sync)?\(|(?<![.\w])exec(?:File)?(?:Sync)?\(/,f);
 }
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner (iv): a read failure stops cleanly and never throws into the caller",()=>{
 const dir=fixtureDir();
 const {io}=spyIo({readSync:()=>{const e=new Error("io");e.code="EIO";throw e;}});
 const out=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH},io);
 assert.equal(out.status,"STOPPED");assert.equal(out.reason,"SOURCE_READ_ERROR");
 assert.equal(out.complete,false);
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner (iv): its read handle never blocks the logger from appending or rotating",()=>{
 const dir=fixtureDir(),p=path.join(dir,"2026_10_04_IMP.txt");
 const fd=fs.openSync(p,"r");
 try{
  fs.appendFileSync(p,"x");                  // logger appends while we hold the handle
  fs.renameSync(p,p+".rotated");             // logger rotates while we hold the handle
  assert.ok(fs.existsSync(p+".rotated"));
 }finally{fs.closeSync(fd);}
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner (v): access denied stops at once with no fallback; quotas stop with incomplete flag",()=>{
 const dir=fixtureDir();
 const denied=spyIo({readdirSync:()=>{const e=new Error("x");e.code="EACCES";throw e;}});
 const a=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH},denied.io);
 assert.equal(a.reason,"ACCESS_DENIED_NO_FALLBACK");
 assert.deepEqual(denied.calls,["realpathSync","readdirSync"]);
 let opens=0;
 const mid=spyIo({openSync:(...x)=>{if(++opens===2){const e=new Error("x");e.code="EPERM";throw e;}return fs.openSync(...x);}});
 const b=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH},mid.io);
 assert.equal(b.reason,"ACCESS_DENIED_NO_FALLBACK");assert.equal(b.files_scanned,1);
 assert.equal(mid.calls.lastIndexOf("openSync"),mid.calls.length-1,"no call after denial");
 assert.equal(Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH,caps:{max_files:2}}).reason,"QUOTA_FILE_COUNT");
 const q=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH,caps:{max_total_bytes:10}});
 assert.equal(q.status,"STOPPED");assert.equal(q.reason,"QUOTA_TOTAL_BYTES");assert.equal(q.complete,false);
 // A per-file cap skip is NOT complete: missing bytes must never read as zero.
 const p=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH,caps:{max_file_bytes:10}});
 assert.equal(p.status,"CENSUS_PARTIAL");assert.equal(p.complete,false);
 assert.equal(p.files_skipped.FILE_OVER_CAP,3);
 const h=spyIo({openSync:()=>{const e=new Error("x");e.code="EMFILE";throw e;}});
 assert.equal(Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH},h.io).reason,"QUOTA_OR_HANDLE_LIMIT");
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner: refuses without an authorization ref or a valid mode",()=>{
 assert.equal(Runner.runCensus({mode:"imp-log",root:os.tmpdir()}).reason,"AUTHORIZATION_REF_REQUIRED");
 assert.equal(Runner.runCensus({mode:"live-capture",authorization_ref:AUTH}).reason,"MODE_INVALID");
 assert.equal(Runner.runCensus({mode:"spool-job",authorization_ref:AUTH,files:[]}).reason,"FILES_REQUIRED");
});
test("runner: spool-job mode classifies each retained job on its own",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-spool-"));
 const proofs=renderOperationalTicketsProofV46(archivedResult());
 const jobs=[["FP00001.SPL",deliveryReport()],["FP00002.SPL",productionDlv()],
  ["FP00003.SPL",Buffer.from(proofs.conference.bytes)],["FP00004.SPL",doc("Pedido #9632")]];
 for(const [n,b] of jobs)fs.writeFileSync(path.join(dir,n),b);
 const before=snapshot(dir);
 const out=Runner.runCensus({mode:"spool-job",authorization_ref:AUTH,
  files:jobs.map(([n])=>path.join(dir,n))});
 assert.equal(out.status,"CENSUS_COMPLETE");
 assert.deepEqual(Object.keys(out.groups).sort(),["DELIVERY_REPORT","PRODUCTION_TICKET_DLV_MARKED",
  "TATA_SHADOW_TEST","UNKNOWN_FORMAT"]);
 assert.ok(Object.values(out.groups).every(g=>g.jobs===1));
 assert.deepEqual(snapshot(dir),before);noCanary(out,"spool");
 fs.rmSync(dir,{recursive:true,force:true});
});
test("runner: symlinks are skipped, never followed",()=>{
 const dir=fixtureDir(),outside=fs.mkdtempSync(path.join(os.tmpdir(),"tata-outside-"));
 fs.writeFileSync(path.join(outside,"secret.txt"),deliveryReport());
 let linked=true;
 try{fs.symlinkSync(path.join(outside,"secret.txt"),path.join(dir,"2026_10_04_IMP_16_10.0.0.9.txt"));}
 catch{linked=false;} // Windows without symlink privilege: nothing to follow.
 const out=Runner.runCensus({mode:"imp-log",root:dir,authorization_ref:AUTH});
 assert.equal(out.status,"CENSUS_COMPLETE");
 if(linked)assert.equal(out.files_skipped.SYMLINK,1);
 assert.equal(out.files_scanned,3);
 fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});
});
test("runner CLI: stdout only, exit 0, no file created next to the source",()=>{
 const dir=fixtureDir(),before=fs.readdirSync(dir).sort();
 const stdout=execFileSync(process.execPath,[path.join(__dirname,"comandas_print_census_local_runner_v1.cjs"),
  "--mode=imp-log","--root="+dir,"--authorization-ref="+AUTH,
  "--registry="+path.join(ROOT,"data/runtime_printer_map_v1.json")],{encoding:"utf8"});
 const out=JSON.parse(stdout);
 assert.equal(out.status,"CENSUS_COMPLETE");
 assert.deepEqual(Object.keys(out.groups).sort(),["00002","00009","GENERIC"]);
 assert.deepEqual(fs.readdirSync(dir).sort(),before);
 noCanary(out,"cli");
 fs.rmSync(dir,{recursive:true,force:true});
});

console.log("COMANDAS_PRINT_PROVENANCE_V1="+n+"/"+n+
 " MATRIX_ANCHORED CENSUS_ENUMS_ONLY RECON_METADATA_ONLY RUNNER_READ_ONLY NO_PRINT NO_HOST");
