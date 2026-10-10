"use strict";
/** Offline consumer of captured stable event + decision + independently
 * reconciled proof packet. Deliberately NOT a Windows service hook.
 * No live reader/database access, prints, spooler, fiscal or sequence writes.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto"),vm=require("node:vm");
const {projectVerifiedReaderPairV68}=
 require("../dist/src/production/stableReaderShadowPairV68.js");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {makeProduction,makeConference}=
 require("./gerar_prova_figma_v60_offline.js");
function sha(buf){return crypto.createHash("sha256").update(buf).digest("hex");}
function blob(buf){return crypto.createHash("sha1")
 .update(Buffer.from("blob "+buf.length+"\0")).update(buf).digest("hex");}
function getArgs(args){
 const out={},required=new Set(["--event","--decision","--proof","--motor"]);
 for(let i=0;i<args.length;i+=2){
  if(!required.has(args[i])||!args[i+1]||out[args[i]])
   throw Error("USAGE: --event stable.json --decision decision.json --proof reconciled.json --motor canonical.js");
  out[args[i]]=args[i+1];
 }
 if(Object.keys(out).length!==4)throw Error("FOUR_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 return out;
}
function readBound(p){
 const absolute=path.resolve(p),stat=fs.statSync(absolute);
 if(!stat.isFile()||stat.size>1024*1024)throw Error("SOURCE_FILE_BUDGET_EXCEEDED");
 return fs.readFileSync(absolute);
}
function run(args=process.argv.slice(2)){
 const locations=getArgs(args);
 const source=readBound(locations["--motor"]);
 if(blob(source)!==PACKAGING_SOURCE_BLOB_V63)
  throw Error("CANONICAL_PACKAGING_MOTOR_SOURCE_DRIFT");
 const context=Object.create(null);
 vm.runInNewContext(source.toString("utf8"),context,{timeout:1500});
 const motor=context.TATAPackaging;
 if(typeof motor?.packComanda!=="function"||typeof motor.kitVerdict!=="function")
   throw Error("PINNED_PACKAGING_MOTOR_EXPORTS_ABSENT");
 const files=["--event","--decision","--proof"].map(a=>readBound(locations[a]));
 const [event,decision,proof]=files.map(b=>JSON.parse(b.toString("utf8").replace(/^\uFEFF/,"")));
 if(proof?.schema!=="deliveryos.reconciled-reader-pair-proof.v68.offline"||
   !proof.delivery||!proof.production||!proof.production_plan||
   !Array.isArray(proof.current_product_identities)||
   !Array.isArray(proof.item_observation_proofs))
   throw Error("RECONCILED_READONLY_PROOF_ENVELOPE_MALFORMED");
 const result=projectVerifiedReaderPairV68(event,decision,{
  delivery:proof.delivery,production:proof.production,
  production_plan:proof.production_plan,
  identities:proof.current_product_identities,
  observation_proofs:proof.item_observation_proofs,
  motor,motor_blob_sha:blob(source)});
 const origin={event_sha256:sha(files[0]),decision_sha256:sha(files[1]),proof_sha256:sha(files[2]),
  motor_blob_sha:blob(source)};
 if(!result.tickets){
  console.log(JSON.stringify({schema:"deliveryos.stable-reader-shadow-v68.proof",
   status:"BLOCKED",reasons:result.reasons,origin,
   effects:{reader_access:false,print:false,spooler_write:false,
    database_write:false,sequence_binding_write:false,deploy:false,fiscal:false}}));
  return {ok:false};
 }
 const tickets=result.tickets;
 const traces=renderOperationalTicketsProofV46(tickets);
 const pictures=[...tickets.production.map(makeProduction),makeConference(tickets.conference)];
 const rendered=[...traces.production,traces.conference];
 if(!tickets.ready_for_semantic_preview||pictures.length!==rendered.length||
    !rendered.every(t=>t.ready_for_offline_preview&&!t.ready_for_operational_print)||
    !pictures.every(t=>t.ready_for_visual_review&&!t.ready_for_operational_print))
   throw Error("SOURCE_VERIFIED_BUT_THERMAL_PREVIEW_BLOCKED");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v68-reader-pair-"));
 const outputs=pictures.map((p,i)=>{
  const filename=String(i+1).padStart(2,"0")+"-"+p.kind.toLowerCase()+
   "-"+String(p.station).toLowerCase().replace(/[^a-z0-9]+/g,"-")+".svg";
  fs.writeFileSync(path.join(dir,filename),p.svg);
  return {filename,boxes:p.boxes,product_lines:p.items,svg_sha256:sha(Buffer.from(p.svg)),
   escpos_trace_sha256:sha(Buffer.from(rendered[i].text_trace))};
 });
 const manifest={schema:"deliveryos.stable-reader-shadow-v68.proof",
  status:"OFFLINE_VERIFIED_NO_PHYSICAL_EFFECT",origin,outputs,
  effects:{reader_access:false,print:false,spooler_write:false,
   database_write:false,sequence_binding_write:false,deploy:false,fiscal:false,
   temporary_artifact_write:true}};
 fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log(JSON.stringify({proof_dir:dir,...manifest},null,2));
 return {ok:true,manifest};
}
if(require.main===module)try {if(!run().ok)process.exitCode=2;}
catch(err){console.error("READER_PAIR_V68_BLOCKED:"+err.message);process.exitCode=1;}
module.exports={run,blob,getArgs};
