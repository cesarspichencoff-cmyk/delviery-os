import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotApplicationFacade } from "../../../../src/entregas/pilot/pilot-facade";
import type { PilotConfig } from "../../../../src/entregas/pilot/pilot-config";
import type { PilotLogger } from "../../../../src/entregas/pilot/pilot-log";
const data_dir = mkdtempSync(join(tmpdir(),"deliveryos-actor-request-lab-"));
const log = {info(){},warn(){},error(){}} as unknown as PilotLogger;
const cfg: PilotConfig = {
 mode:"test",unit_id:"LAB-ACTOR-REQUEST",unit_name:"LAB",timezone:"America/Sao_Paulo",port:0,
 bind:"127.0.0.1",data_dir,source_mode:"simulated",max_stops:3,banner:"LAB ISOLADO",
 users:[{actor_id:"LAB-RIDER",role:"motoboy_interno",label:"TEST",token:"test-A"},
 {actor_id:"LAB-MANAGER",role:"gerente",label:"TEST",token:"test-B"}],
 features:{demo_seed:false,demo_controls:false,map_poc:false,gps_production:false,auto_assignment:false,copiloto:false,shell:false},
 backup:{auto_interval_minutes:600,retain_count:1,dir:"backup"}
};
(async()=>{
 try{
  const facade=new PilotApplicationFacade(cfg,log);
  facade.bindActor({actor_id:"LAB-RIDER",role:"motoboy_interno"});
  const firstRequest = facade.snapshot();
  facade.bindActor({actor_id:"LAB-MANAGER",role:"gerente"});
  const result=await firstRequest;
  const observed=result.actor?.actor_id;
  console.log("REQUEST_A_EXPECTED_ACTOR=LAB-RIDER");
  console.log("REQUEST_A_RETURNED_ACTOR="+observed);
  console.log("SOURCE_USES_MUTABLE_SHARED_ACTOR="+(observed!=="LAB-RIDER"));
  assert.equal(observed,"LAB-RIDER","a response must retain the initiating request actor");
  console.log("ACTOR_CONTEXT_PER_REQUEST_ISOLATED");
 }finally{rmSync(data_dir,{recursive:true,force:true});}
})().catch(e=>{console.error("TEST_FAILED",String(e));process.exitCode=1});
