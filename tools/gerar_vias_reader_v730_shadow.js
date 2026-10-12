"use strict";
/**
 * TATA Comandas V7.30 — single-event V2 -> mandatory V6.8 -> three
 * semantic previews in memory. Candidate CLI, NEVER a service hook.
 *
 * On Windows, V2 reads its existing TATA sequence-state file READ ONLY.
 * This program never writes an order, an output file, a TATA sequence,
 * a service state, a database row or a printer job. Unlike the Linux
 * V7.20 offline sandbox it DOES NOT claim Windows filesystem isolation.
 */
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),
  crypto=require("node:crypto"),vm=require("node:vm");
const {spawnSync}=require("node:child_process");
const {verifyLiveReaderPairV68,projectVerifiedReaderPairV68}=
  require("../dist/src/production/stableReaderShadowPairV68.js");
const {renderOperationalTicketsProofV46}=
  require("../dist/src/production/operationalTicketEscposV46.js");
const {makeProduction,makeConference}=
  require("./gerar_prova_figma_v60_offline.js");
const {PACKAGING_SOURCE_SHA256_V78,PACKAGING_SOURCE_BLOB_V63}=
  require("../dist/src/production/currentPackagingBridgeV63.js");
const {exactOrderIdentity,readOnlyConsumerResult,lineageMatchesPinnedSources,
  withoutNodePreloads,RULE_FILES}=require("./gerar_tres_vias_v2_gate_v720_offline.js");
const {blob}=require("./gerar_tres_vias_par_leitor_v68_offline.js");
const MANIFEST=path.join(__dirname,
  "../runtime/shadow/thermal-consumer-release-hold.v1.json");
const SEQUENCE="C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";
const EFFECTS=Object.freeze({database_read:false,database_write:false,
  sequence_binding_write:false,service_state_write:false,print:false,
  spooler_write:false,deploy:false,fiscal:false,sefaz:false});
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const noData=x=>[...new Set(x)].sort();
function blocked(reasons,stage) {
  return {ok:false,report:{schema:"deliveryos.comandas-single-shadow-v730",
    status:"BLOCKED",stage,reasons:noData(reasons),vias:[],
    print_authorized:false,effects:EFFECTS}};
}
function argsOf(argv){
  const keys=["--event","--consumer","--proof","--motor","--sandbox-root"];
  if(argv.length%2||argv.length<8||argv.length>10)
    throw Error("FOUR_EXPLICIT_INPUTS_REQUIRED");
  const result={};
  for(let i=0;i<argv.length;i+=2) {
    if(!keys.includes(argv[i])||!argv[i+1]||
       Object.hasOwn(result,argv[i]))throw Error("INPUT_KEYS_INVALID");
    result[argv[i]]=path.resolve(argv[i+1]);
  }
  if(keys.slice(0,4).some(k=>!result[k]))throw Error("INPUT_KEYS_MISSING");
  return result;
}
/** Windows-compatible read check: no leaf links, bounded descriptor, double
 * fstat; does NOT prove no reparse/rename attack by a privileged peer. */
function readStable(file,max=1024*1024){
  let fd;
  try{
    const st=fs.lstatSync(file,{bigint:true});
    if(!st.isFile()||st.isSymbolicLink()||st.size<=0n||
       st.size>BigInt(max))throw Error("SOURCE_NOT_REGULAR_OR_BOUNDED");
    fd=fs.openSync(file,fs.constants.O_RDONLY);
    const a=fs.fstatSync(fd,{bigint:true});
    if(!a.isFile()||a.size!==st.size||
       a.ino!==st.ino||a.dev!==st.dev)throw Error("SOURCE_SWAP");
    const bytes=Buffer.alloc(Number(a.size));
    let n=0;
    while(n<bytes.length){
      const got=fs.readSync(fd,bytes,n,bytes.length-n,n);
      if(got<=0)throw Error("SOURCE_SHORT_READ");
      n+=got;
    }
    const b=fs.fstatSync(fd,{bigint:true});
    const end=fs.lstatSync(file,{bigint:true});
    if(!end.isFile()||end.isSymbolicLink()||
       [b,end].some(s=>s.dev!==a.dev||s.ino!==a.ino||
         s.size!==a.size||s.mtimeNs!==a.mtimeNs||
         s.ctimeNs!==a.ctimeNs))throw Error("SOURCE_CHANGED");
    return bytes;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function parseObject(bytes){
  const v=JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/,""));
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error("OBJECT_REQUIRED");
  return v;
}
function sequencePreflight(sandbox){
  let seqPath;
  if(process.platform==="win32"){
    if(sandbox)return false;
    seqPath=SEQUENCE;
  }else{
    if(!sandbox)return false;
    const root=fs.realpathSync(sandbox);
    const tmp=fs.realpathSync(os.tmpdir());
    if(!(root.startsWith(tmp+path.sep))||root===tmp||
       fs.lstatSync(sandbox).isSymbolicLink())return false;
    seqPath=path.join(root,SEQUENCE);
  }
  const s=parseObject(readStable(seqPath,4096));
  return s.schema==="deliveryos.tata-sequence-state.v1"&&
    Number.isSafeInteger(s.next_value)&&s.next_value>0&&s.next_value<=999;
}
function run(argv){
  let a;
  try{a=argsOf(argv);}
  catch{return blocked(["INPUT_CONTRACT_INVALID"],"ARGUMENTS");}
  // This runner is deliberately a one-shot candidate, not a watcher/daemon.
  try{
    const hold=parseObject(readStable(MANIFEST,65536));
    if(hold.status!=="DRAFT_HOLD_NOT_INSTALLED"||
       hold.preferred_future_candidate?.installed!==false||
       hold.preferred_future_candidate?.print_authorized!==false||
       hold.effect_boundaries?.printer!==false||
       hold.effect_boundaries?.deploy!==false)
      return blocked(["HOLD_MANIFEST_INVALID"],"SOURCE_PREFLIGHT");
    const consumer=readStable(a["--consumer"]);
    if(blob(consumer)!==hold.preferred_future_candidate.git_blob_sha1)
      return blocked(["V2_EXECUTABLE_NOT_PINNED"],"SOURCE_PREFLIGHT");
    const consumerDir=path.dirname(a["--consumer"]);
    if(fs.lstatSync(consumerDir).isSymbolicLink())
      return blocked(["CONSUMER_DIRECTORY_UNTRUSTED"],"SOURCE_PREFLIGHT");
    const motor=readStable(a["--motor"]);
    const installedMotor=readStable(path.join(consumerDir,"packaging-current.js"));
    if(blob(motor)!==PACKAGING_SOURCE_BLOB_V63||
       sha(motor)!==PACKAGING_SOURCE_SHA256_V78||
       !motor.equals(installedMotor))
      return blocked(["ACADEMIA_MOTOR_NOT_PINNED"],"SOURCE_PREFLIGHT");
    const rules=new Map([["packaging-current.js",installedMotor]]);
    for(const f of ["app-data.json",...RULE_FILES.slice(1)])
      rules.set(f,readStable(path.join(consumerDir,f),12*1024*1024));
    const eventBytes=readStable(a["--event"]);
    const event=parseObject(eventBytes);
    if(!exactOrderIdentity(event))
      return blocked(["EVENT_IDENTITY_NOT_BOUND_TO_RAW_KEYS"],"EVENT_GATE");
    if(event.ready_for_downstream_shadow!==true||
       !Array.isArray(event.blockers)||event.blockers.length!==0)
      return blocked(["UPSTREAM_WATCHER_BLOCKED"],"EVENT_GATE");
    if(event.order?.observation_scan_complete!==true)
      return blocked(["OBSERVATION_SCAN_NOT_COMPLETE"],"EVENT_GATE");
    if(!sequencePreflight(a["--sandbox-root"]))
      return blocked(["READONLY_SEQUENCE_PREFLIGHT_NOT_PROVEN"],"SOURCE_PREFLIGHT");
    const proofBytes=readStable(a["--proof"],12*1024*1024);
    const proof=parseObject(proofBytes);
    if(proof.schema!=="deliveryos.reconciled-reader-pair-proof.v68.offline"||
       !proof.delivery||!proof.production||!proof.production_plan||
       !Array.isArray(proof.current_product_identities)||
       !Array.isArray(proof.item_observation_proofs))
      return blocked(["INDEPENDENT_PROOF_INCOMPLETE"],"PROOF_PREFLIGHT");
    // Pinned candidate: pass ONLY the event path, never V2's optional
    // decision output path; no write of customer JSON to disk.
    const child=spawnSync(process.execPath,[a["--consumer"],a["--event"]],{
      cwd:process.platform==="win32"?os.tmpdir():a["--sandbox-root"],
      encoding:"utf8",timeout:15000,windowsHide:true,maxBuffer:1024*1024,
      env:withoutNodePreloads(process.env)
    });
    if(child.error||![0,5].includes(child.status)||
       !child.stdout||Buffer.byteLength(child.stdout)>1024*1024)
      return blocked(["V2_PROCESS_INVALID"],"V2");
    let decision;
    try{decision=parseObject(Buffer.from(child.stdout));}
    catch{return blocked(["V2_OUTPUT_INVALID"],"V2");}
    if(!readOnlyConsumerResult(decision,child.status))
      return blocked(["V2_EFFECTS_OR_EXIT_INVALID"],"V2");
    if(!lineageMatchesPinnedSources(decision,rules))
      return blocked(["V2_EIGHT_SOURCE_LINEAGE_MISMATCH"],"V2");
    const pair=verifyLiveReaderPairV68(event,decision);
    if(pair.status!=="PAIRED_SOURCE_VERIFIED")
      return blocked(["V68_PAIR_BLOCKED"],"V68");
    // The same bytes must still be present after V2 consumed them.
    if(!readStable(a["--event"]).equals(eventBytes)||
       !readStable(a["--consumer"]).equals(consumer)||
       !readStable(a["--motor"]).equals(motor)||
       !readStable(a["--proof"],12*1024*1024).equals(proofBytes)||
       [...rules].some(([name,bytes])=>
         !readStable(path.join(consumerDir,name),12*1024*1024).equals(bytes)))
      return blocked(["INPUT_CHANGED_DURING_EXECUTION"],"IDENTITY");
    const context=Object.create(null);
    vm.runInNewContext(motor.toString("utf8"),context,{timeout:1500});
    const engine=context.TATAPackaging;
    if(typeof engine?.packComanda!=="function"||
       typeof engine?.kitVerdict!=="function")
      return blocked(["ACADEMIA_ENGINE_EXPORT_MISSING"],"ENGINE");
    const projection=projectVerifiedReaderPairV68(event,decision,{
      delivery:proof.delivery,production:proof.production,
      production_plan:proof.production_plan,
      identities:proof.current_product_identities,
      observation_proofs:proof.item_observation_proofs,
      motor:engine,motor_blob_sha:blob(motor)
    });
    if(!projection.tickets)
      return blocked(["V68_RECONCILED_PROJECTION_BLOCKED"],"PROJECTION");
    const tickets=projection.tickets;
    if(tickets.production.length!==2||!tickets.ready_for_semantic_preview)
      return blocked(["THREE_VIAS_SEMANTICALLY_INCOMPLETE"],"RENDER");
    const traces=renderOperationalTicketsProofV46(tickets);
    const draw=[...tickets.production.map(makeProduction),
      makeConference(tickets.conference)];
    const rendered=[...traces.production,traces.conference];
    if(draw.length!==3||rendered.length!==3||
       !draw.every(p=>p.ready_for_visual_review===true&&
         p.ready_for_operational_print===false)||
       !rendered.every(p=>p.ready_for_offline_preview===true&&
         p.ready_for_operational_print===false))
      return blocked(["RENDERER_NOT_OFFLINE_ONLY"],"RENDER");
    const vias=draw.map((p,i)=>({
      kind:p.kind,station:p.station,
      boxes:p.boxes,product_lines:p.items,
      svg_sha256:sha(Buffer.from(p.svg)),
      escpos_text_sha256:sha(Buffer.from(rendered[i].text_trace))
    }));
    return {ok:true,report:{
      schema:"deliveryos.comandas-single-shadow-v730",
      status:"SHADOW_THREE_VIAS_IN_MEMORY_NO_PRINT",
      stage:"COMPLETE_OFFLINE_SEMANTIC_ONLY",
      reasons:[],vias,
      evidence:{event_sha256:sha(eventBytes),proof_sha256:sha(proofBytes),
        consumer_git_blob:blob(consumer),motor_git_blob:blob(motor)},
      windows_isolation_proven:false,service_hook_installed:false,
      print_authorized:false,effects:EFFECTS
    }};
  }catch{
    // Paths, free-text notes and child stderr never enter diagnostics.
    return blocked(["SHADOW_PIPELINE_FAIL_CLOSED"],"EXCEPTION");
  }
}
if(require.main===module){
  const result=run(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result.report)+"\n");
  if(!result.ok)process.exitCode=2;
}
module.exports={run,argsOf,readStable,sequencePreflight,EFFECTS};
