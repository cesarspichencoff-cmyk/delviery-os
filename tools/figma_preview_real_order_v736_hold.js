"use strict";
// V7.36 -- PRIVATE real-order visual review only; NO print and NO operational approval.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const {checkEvent}=require("../auditar_eventos_watcher_v730_readonly.js");
const {makeProduction,makeConference}=require("./gerar_prova_figma_v60_offline.js");
const root="C:\\ProgramData\\TataComandaReader";
const pilot=path.join(root,"pilot-readonly-20261013");
const eventDir=path.join(root,"state","reader-events-v1");
const v2=path.join(pilot,"shadow-v2","live_shadow_consumer_v2_candidate_v714.cjs");
const NO_EFFECTS={teknisa_write:false,print:false,spooler:false,sequence_write:false,service_change:false,fiscal:false};
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const blob=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
function run(prefix){
 if(!/^[0-9]{10}$/.test(prefix))throw Error("INVALID_ORDER_ID");
 const names=fs.readdirSync(eventDir).filter(n=>n.startsWith(prefix+"_")&&/^[0-9]{10}_[0-9a-f]{64}\.json$/i.test(n)).sort();
 if(names.length!==2)throw Error("TWO_REVISIONS_REQUIRED");
 const events=names.map(n=>JSON.parse(fs.readFileSync(path.join(eventDir,n),"utf8")));
 for(const e of events)if(checkEvent(e).length||!e.ready_for_downstream_shadow||
  e.order.NRCOMANDA!==prefix||e.order.IDORGCMDVENDA!=="DLV_IFO"||
  e.service_resolution?.service!=="LUNCH")throw Error("SOURCE_NOT_CURRENT_AND_VERIFIED");
 const statuses=events.map(x=>x.order.IDSTCOMANDA).sort();
 if(JSON.stringify(statuses)!==JSON.stringify(["3","X"]))throw Error("UNKNOWN_ORDER_STATUS_TRANSITION");
 if(JSON.stringify(events[0].order.items)!==JSON.stringify(events[1].order.items)||
  JSON.stringify(events[0].order.observation_rows)!==JSON.stringify(events[1].order.observation_rows))
  throw Error("SOURCE_NOTES_OR_QUANTITY_CHANGED");
 const baseline=events.find(x=>x.order.IDSTCOMANDA==="3");
 const source=names[events.indexOf(baseline)];
 const b=fs.readFileSync(v2);
 if(blob(b)!=="f7f06fd4827d577bc3fc83bb2d04f9c17141bdc4")throw Error("V2_SOURCE_DRIFT");
 const child=spawnSync(process.execPath,[v2,path.join(eventDir,source)],{
  encoding:"utf8",timeout:15000,maxBuffer:1024*1024,windowsHide:true,
  env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
 if(child.error||![0,5].includes(child.status))throw Error("CANDIDATE_SUBPROCESS_FAILED");
 const result=JSON.parse(child.stdout);
 const allowed=["CLASSIFICATION_UNKNOWN_9.10.05.050.00","CLASSIFICATION_UNKNOWN_9.15.00.060.00"];
 if(result.ready||result.effects?.print!==false||result.effects?.spooler_write!==false||
  result.items?.length!==baseline.order.items.length||
  result.blocking_reasons?.length!==2||
  result.blocking_reasons.some(x=>!allowed.includes(x)))throw Error("BLOCKED_DECISION_REQUIRED");
 const ids={ifood:String(baseline.order.NRCOMANDAEXT),teknisa:prefix,tata:"000",
  hour:baseline.order.DTHRABERMESA.slice(11,16)};
 const general=(result.order_observations||[]).map(x=>String(x.value||""));
 const item=x=>({print_name:x.product_name,quantity:x.quantity,
  observations:[...(x.observations||[]).map(o=>String(o.value||"")),
   ...general.map(n=>"OBS GERAL - REVISAR: "+n)]});
 const stations=new Map();
 for(const x of result.items){
  if(x.targets?.length!==1||x.routing_status!=="ROUTED"||!Number.isSafeInteger(x.quantity)||
    x.quantity<=0)throw Error("SOURCE_STATION_NOT_PROVEN");
  const t=x.targets[0];
  if(!/^[0-9]{5}$/.test(t.printer_code)||!t.printer_name)throw Error("PRINTER_NOT_PROVEN");
  if(!stations.has(t.printer_code))stations.set(t.printer_code,{station:t.printer_name,items:[]});
  stations.get(t.printer_code).items.push(item(x));
 }
 if(stations.size!==2)throw Error("EXPECTED_TWO_STATIONS");
 const views=[...stations.values()].map(x=>makeProduction({
  station:x.station,identifiers:ids,boxes:[],items_without_proven_box:x.items
 }));
 views.push(makeConference({identifiers:ids,boxes:[],
  items_without_proven_box:result.items.map(item),items_without_physical_box:[],
  bags:[],kits:[],accompaniments:[],warnings:["PACKAGING_PLAN_UNVERIFIED","KIT_PLAN_UNVERIFIED"]}));
 if(views.length!==3)throw Error("THREE_FORMS_REQUIRED");
 const out=path.join(pilot,"figma-preview","review-"+prefix);
 fs.mkdirSync(out,{recursive:true});
 const docs=views.map((p,i)=>{
  const banner='<text x="16" y="12" font-size="9" font-family="monospace">PREVIA - NAO IMPRIMIR / NAO PRODUZIR</text>';
  const svg=p.svg.replace("</svg>",banner+"</svg>");
  const filename=String(i+1).padStart(2,"0")+"-"+p.kind.toLowerCase()+".svg";
  fs.writeFileSync(path.join(out,filename),svg,{flag:"wx"});
  return {filename,station:p.station,items:p.items,boxes:p.boxes,
   visual_review_pass:p.ready_for_visual_review,
   issue_count:p.blocking_reasons.length,sha256:sha(svg)};
 });
 const manifest={schema:"tata.comandas.real-figma-hold.v736",status:"VISUAL_REVIEW_HOLD_NO_PRINT",
  order_internal:prefix,source_hashes:events.map(e=>e.snapshot_hash),status_codes:statuses,
  unreviewed_classes:result.blocking_reasons,order_level_note_count:general.length,
  no_tata_sequence_allocated:true,boxes_unproven:true,documents:docs,effects:NO_EFFECTS};
 fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
 return {status:manifest.status,forms:docs.length,items:docs.map(d=>d.items),
  issues:docs.map(d=>d.issue_count),unknowns:manifest.unreviewed_classes,effects:NO_EFFECTS};
}
if(require.main===module){
 try{console.log(JSON.stringify(run(process.argv[2])))}
 catch(e){console.log(JSON.stringify({status:"BLOCKED",reason:String(e.message).slice(0,90),effects:NO_EFFECTS}));process.exitCode=2;}
}
module.exports={run};
