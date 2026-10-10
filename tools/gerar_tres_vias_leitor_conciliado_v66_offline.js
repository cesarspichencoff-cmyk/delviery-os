"use strict";
/**
 * Reader reconciled snapshot -> exact pinned motor -> production + conference
 * OFFLINE ONLY. Takes pre-sanitized JSON; it NEVER contacts the Windows service,
 * database, local print queue, native fiscal process, or production reader.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto"),vm=require("node:vm");
const {projectJoinedReaderTicketsV66}=
 require("../dist/src/production/readerIngressV66.js");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {makeProduction,makeConference}=
 require("./gerar_prova_figma_v60_offline.js");
const blobSha=(b)=>crypto.createHash("sha1")
 .update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const hash=(v)=>crypto.createHash("sha256").update(v).digest("hex");
function run(argv=process.argv.slice(2)) {
 if(argv.length!==4||argv[0]!=="--motor"||argv[2]!=="--snapshot")
  throw Error("USAGE: --motor PINNED_PACKAGING_JS --snapshot SANITIZED_RECONCILED_JSON");
 const bytes=fs.readFileSync(path.resolve(argv[1]));
 const sha=blobSha(bytes);
 if(sha!==PACKAGING_SOURCE_BLOB_V63)throw Error("PACKAGING_SOURCE_DRIFT_NO_REPLAY");
 // Exact pinned source only; do not use vm to execute arbitrary inputs.
 const sandbox=Object.create(null);
 vm.runInNewContext(bytes.toString("utf8"),sandbox,{timeout:1500});
 const motor=sandbox.TATAPackaging;
 if(!motor ||typeof motor.packComanda!=="function"||typeof motor.kitVerdict!=="function")
  throw Error("PINNED_MOTOR_ABSENT");
 const packetBuffer=fs.readFileSync(path.resolve(argv[3]));
 if(packetBuffer.length>1024*1024)throw Error("READER_PACKET_BUDGET_EXCEEDED");
 const snap=JSON.parse(packetBuffer.toString("utf8"));
 if(!snap || snap.schema!=="deliveryos.reader-reconciled-snapshot.v66.offline" ||
    !snap.delivery || !snap.production || !snap.production_plan ||
    !Array.isArray(snap.current_product_identities))
  throw Error("READER_RECONCILED_SNAPSHOT_SCHEMA_MISMATCH");
 const result=projectJoinedReaderTicketsV66(snap.delivery,snap.production,
  snap.production_plan,snap.current_product_identities,motor,sha);
 if(!result.tickets) {
  console.log(JSON.stringify({status:"BLOCKED",reasons:result.reasons,
   ingress:result.ingress.blockers,bridge:result.bridge?.reasons??[],
   effects:{print:false,spooler:false,odhen:false,fiscal:false,deploy:false}}));
  return false;
 }
 const ticket=result.tickets;
 const traces=renderOperationalTicketsProofV46(ticket);
 const visuals=[...ticket.production.map(makeProduction),makeConference(ticket.conference)];
 const proofs=[...traces.production,traces.conference];
 if(!ticket.ready_for_semantic_preview||proofs.length!==visuals.length||
    !proofs.every(x=>x.ready_for_offline_preview===true)||
    !visuals.every(x=>x.ready_for_visual_review===true)||
    proofs.some(x=>x.ready_for_operational_print)||visuals.some(x=>x.ready_for_operational_print))
  throw Error("READER_THREE_WAY_PREVIEW_NOT_PROVEN");
 const dest=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-reader-v66-shadow-"));
 const outputs=visuals.map((v,i)=>{
  const filename=String(i+1).padStart(2,"0")+"-"+v.kind.toLowerCase()+
   "-"+String(v.station).toLowerCase().replace(/[^a-z0-9]+/g,"-")+".svg";
  fs.writeFileSync(path.join(dest,filename),v.svg,"utf8");
  return {filename,boxes:v.boxes,products:v.items,
   svg_sha256:hash(v.svg),escpos_text_trace_sha256:hash(proofs[i].text_trace)};
 });
 const report={schema:"deliveryos.reader-three-way-shadow-proof.v66",
  source_motor_blob_sha:sha,packet_sha256:hash(packetBuffer),
  status:"OFFLINE_PREVIEW_PROVEN_NOT_OPERATIONAL",outputs,
  effects:{reader_access:false,db_read:false,db_write:false,
   print:false,spooler:false,cut:false,deploy:false,fiscal:false}};
 fs.writeFileSync(path.join(dest,"manifest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({output_dir:dest,...report},null,2));
 return true;
}
if(require.main===module)try {if(!run())process.exitCode=2;}
 catch(error){console.error("READER_OFFLINE_BLOCKED:"+error.message);process.exitCode=1;}
module.exports={run,blobSha};
