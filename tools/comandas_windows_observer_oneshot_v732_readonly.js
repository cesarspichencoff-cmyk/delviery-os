"use strict";
/**
 * TATÁ Comandas V7.32: zero-effect, one-shot observation entrypoint.
 * No printer imports, service handles, process spawn or file writes.
 * This is NOT an installer and NEVER invokes V2. A future V2 process
 * requires independent OS isolation, verified rollback and approval.
 */
const fs=require("node:fs"),path=require("node:path");
const {preflight}=require("./comandas_windows_sidecar_preflight_v731_readonly.js");
const EVENT=/^[0-9]{10}_[0-9a-f]{64}\.json$/i;
const EFFECTS=Object.freeze({install:false,service_change:false,source_write:false,
  sequence_write:false,spooler:false,printer:false,print:false,
  consumer_v2:false,validator_v68:false,network:false});
const DEADLINE="2026-10-13T11:14:00-03:00";
const MAX_EVENTS=25;
function onetime(root,now=new Date()){
  if(typeof root!=="string"||!path.isAbsolute(root)||!(now instanceof Date)||
    !Number.isFinite(now.getTime()))throw Error("INVALID_READONLY_INPUT");
  const result={schema:"tata.comandas.windows-observer-oneshot.v732",
    status:"HOLD",reason_codes:[],checked:0,consistent:0,eligible:0,
    first_delivery_protected:true,external_operational_authority:false,
    effects:EFFECTS};
  if(now.getTime()>=new Date(DEADLINE).getTime()){
    result.reason_codes=["OPERATIONS_FREEZE_DEADLINE_REACHED"];
    return result;
  }
  let filenames;
  try{filenames=fs.readdirSync(path.join(root,"state","reader-events-v1"))
    .filter(n=>EVENT.test(n)).sort().slice(-MAX_EVENTS);}
  catch{result.reason_codes=["READER_DIRECTORY_UNAVAILABLE"];return result;}
  if(filenames.length===0){result.reason_codes=["NO_LOCAL_WATCHER_EVENTS"];return result;}
  const reasons=new Set();
  for(const name of filenames){
    const p=preflight(root,name);
    result.checked++;
    if(p.event_reconciled)result.consistent++;
    if(p.status==="ELIGIBLE_FOR_SEPARATE_ISOLATED_REPLAY")
      result.eligible++;
    for(const x of p.blockers||[])if(/^[A-Z][A-Z0-9_]{2,100}$/.test(x))reasons.add(x);
  }
  result.reason_codes=[...reasons].sort();
  // This observer NEVER hands live execution permissions to V2 or V6.8.
  result.status="HOLD";
  result.reason_codes.push("OS_ISOLATION_AND_VALIDATED_ROLLBACK_REQUIRED");
  result.reason_codes=[...new Set(result.reason_codes)].sort();
  return result;
}
function cli(argv=process.argv.slice(2)){
  if(argv.length!==2||argv[0]!=="--root"||typeof argv[1]!=="string")
    throw Error("ROOT_ONLY_REQUIRED");
  return argv[1];
}
if(require.main===module){
  try{process.stdout.write(JSON.stringify(onetime(cli()))+"\n");}
  catch{process.stdout.write(JSON.stringify({schema:"tata.comandas.windows-observer-oneshot.v732",
    status:"HOLD",reason_codes:["OBSERVATION_EXCEPTION"],effects:EFFECTS})+"\n");}
}
module.exports={onetime,EFFECTS,DEADLINE,MAX_EVENTS};
