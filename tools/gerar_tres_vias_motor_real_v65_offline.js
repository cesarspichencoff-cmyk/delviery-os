"use strict";
/** Pinned real TATÁ packaging engine -> all three SHADOW previews.
 * Local JSON only. No order listener, network, printer, ESC/POS files,
 * spooler, fiscal writes or deployment.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto"),vm=require("node:vm");
const {projectTicketsFromCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {makeProduction,makeConference}=
 require("./gerar_prova_figma_v60_offline.js");
const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
const gitBlob=b=>crypto.createHash("sha1")
 .update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const REQUIRED=new Set(["--motor","--payload"]);
function args(v){
 const out={};
 for(let i=0;i<v.length;i+=2){
  if(!REQUIRED.has(v[i])||!v[i+1]||out[v[i]])throw Error("USAGE: --motor <pinned-js> --payload <sanitized-json>");
  out[v[i]]=v[i+1];
 }
 if(Object.keys(out).length!==2)throw Error("USAGE: --motor <pinned-js> --payload <sanitized-json>");
 return out;
}
function run(argv=process.argv.slice(2)){
 const a=args(argv);
 const bytes=fs.readFileSync(path.resolve(a["--motor"]));
 const blob=gitBlob(bytes);
 if(blob!==PACKAGING_SOURCE_BLOB_V63)throw Error("PINNED_MOTOR_BLOB_MISMATCH");
 // Only the EXACT verified source is evaluated in a context without require,
 // process, network or filesystem; do not treat a generic vm as sandbox for
 // arbitrary untrusted code.
 const sandbox=Object.create(null);
 vm.runInNewContext(bytes.toString("utf8"),sandbox,{timeout:1500});
 const api=sandbox.TATAPackaging;
 if(!api||typeof api.packComanda!=="function"||typeof api.kitVerdict!=="function")
  throw Error("PINNED_MOTOR_EXPORT_MISSING");
 const input=JSON.parse(fs.readFileSync(path.resolve(a["--payload"]),"utf8"));
 if(!input||!Array.isArray(input.source_items)||!Array.isArray(input.entries)||
    !input.production_plan||!input.resource_input||!input.order_id)
  throw Error("MOTOR_INPUT_CONTRACT_INVALID");
 const result=projectTicketsFromCurrentPackagingV63(
  input,input.entries,{packComanda:api.packComanda,kitVerdict:api.kitVerdict},blob);
 if(!result.tickets){
  console.log(JSON.stringify({result:"BLOCKED",motor_blob:blob,
   bridge_reasons:result.bridge.reasons,coherence_reasons:result.coherence_reasons,
   print:false,spooler:false,deploy:false}));
  return {ok:false};
 }
 const projected=result.tickets;
 const traces=renderOperationalTicketsProofV46(projected);
 const visuals=[...projected.production.map(makeProduction),
   makeConference(projected.conference)];
 const texts=[...traces.production,traces.conference];
 if(texts.length!==visuals.length||!texts.every(t=>t.ready_for_offline_preview)||
    !visuals.every(v=>v.ready_for_visual_review)||
    texts.some(t=>t.ready_for_operational_print)||visuals.some(v=>v.ready_for_operational_print))
  throw Error("SVG_ESC_POS_SEMANTIC_PREVIEW_NOT_RECONCILED");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-pinned-motor-v65-"));
 const manifest={
  schema:"deliveryos.pinned-motor-three-way-v65.offline",motor_blob:blob,
  payload_sha256:sha256(fs.readFileSync(path.resolve(a["--payload"]))),
  tickets:visuals.map((v,i)=>{
   const file=(i+1)+"-"+v.kind.toLowerCase()+"-"+v.station.toLowerCase().replace(/[^a-z0-9]+/g,"-")+".svg";
   fs.writeFileSync(path.join(dir,file),v.svg,"utf8");
   return {file,boxes:v.boxes,product_lines:v.items,svg_sha256:sha256(v.svg),
    escpos_text_trace_sha256:sha256(texts[i].text_trace),
    offline_preview:true,physical_print:false};
  }),
  print:false,spooler:false,network:false,deploy:false,cut:false,
  print_authorized:false,
 };
 fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log(JSON.stringify({result:"PASS_OFFLINE",proof_dir:dir,...manifest},null,2));
 return {ok:true,dir,manifest};
}
if(require.main===module)try {
 if(!run().ok)process.exitCode=2;
}catch(e){console.error("BLOCKED:"+e.message);process.exitCode=1;}
module.exports={run,gitBlob};
