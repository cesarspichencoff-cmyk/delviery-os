/** Q026 safety preflight adversarial properties, no live PG required. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { verificarOrcamentoQ026 } from "../../tools/q026-preview-capacity-gate";

const base={
  workers:4,
  admissionPerWorker:2,
  pgMaxConnections:100,
  pgReservedConnections:5,
  otherServicesConnections:20,
  safetyHeadroomConnections:15,
  otherConnectionsPerWorker:1,
};
const x=verificarOrcamentoQ026(base);
assert.equal(x.sufficient_on_declared_assumptions,true);
assert.equal(x.max_pool_connections_across_workers,16); // 4*(2+1+1)
assert.equal(x.total_budgeted_connections,56); // 16+5+20+15
assert.equal(x.capacity_remaining,44);
assert.equal(x.potential_http_admitted_across_workers,8);
assert.equal(x.reader_pool_limit_per_worker,2);
assert.equal(x.canceller_pool_limit_per_worker,1);
assert.ok(x.warning.includes("NAO AUTORIZA DEPLOY"));

const crowded=verificarOrcamentoQ026({...base,workers:25});
assert.equal(crowded.sufficient_on_declared_assumptions,false);
assert.equal(crowded.capacity_remaining,-40);
assert.equal(crowded.total_budgeted_connections,140);
const atExact=verificarOrcamentoQ026({...base,pgMaxConnections:56});
assert.equal(atExact.sufficient_on_declared_assumptions,true);
assert.equal(atExact.capacity_remaining,0);
const oneMore=verificarOrcamentoQ026({...base,pgMaxConnections:55});
assert.equal(oneMore.sufficient_on_declared_assumptions,false);

const required=[
  "workers","admissionPerWorker","pgMaxConnections","pgReservedConnections",
  "otherServicesConnections","safetyHeadroomConnections","otherConnectionsPerWorker",
];
for(const key of required){
  const missing={...base} as Record<string,unknown>;
  delete missing[key];
  assert.throws(()=>verificarOrcamentoQ026(missing),/Q026_CAPACITY_/);
}
for(const value of [null,undefined,"4",4.5,-1,Infinity,NaN]){
  assert.throws(()=>verificarOrcamentoQ026({...base,workers:value}),/Q026_CAPACITY_/);
}
for(const admission of [0,3,5,"2",null]){
  assert.throws(()=>verificarOrcamentoQ026({...base,admissionPerWorker:admission}),/Q026_CAPACITY_/);
}
for(const [key,val] of [
 ["pgMaxConnections",0],["pgReservedConnections",-1],
 ["otherServicesConnections",-3],["safetyHeadroomConnections",0],
 ["otherConnectionsPerWorker",1.5]
] as const){
  assert.throws(()=>verificarOrcamentoQ026({...base,[key]:val}),/Q026_CAPACITY_/);
}
assert.throws(()=>verificarOrcamentoQ026({...base,databaseUrl:"postgres://secret"}),/Q026_CAPACITY_/);
assert.throws(()=>verificarOrcamentoQ026({}),/Q026_CAPACITY_/);
assert.throws(()=>verificarOrcamentoQ026(null),/Q026_CAPACITY_/);

const monotone=(workers:number)=>{
 const v=verificarOrcamentoQ026({...base,workers});
 assert.equal(v.max_pool_connections_across_workers,workers*4);
 assert.equal(v.potential_http_admitted_across_workers,workers*2);
 return v.capacity_remaining;
};
for(let n=2;n<=100;n++){
 assert.equal(monotone(n)-monotone(n-1),-4,
   "adding a worker must never increase PostgreSQL safety headroom");
}
const path="tools/q026-preview-capacity-cli.ts";
function cli(argv:string[]){
 return spawnSync("npx",["--no-install","tsx",path,...argv],{
  cwd:process.cwd(),encoding:"utf8",timeout:15000
 });
}
const ok=cli([JSON.stringify(base)]);
assert.equal(ok.status,0,"valid declared budget must be accepted "+ok.stderr);
assert.ok(ok.stdout.includes("Q026_PREVIEW_CAPACITY_BUDGET "));
assert.ok(ok.stdout.includes('"capacity_remaining":44'));
const bad=cli([JSON.stringify({...base,workers:25})]);
assert.equal(bad.status,2,"insufficient budget must exit 2");
assert.ok(bad.stdout.includes('"sufficient_on_declared_assumptions":false'));
const missing=cli([]);
assert.equal(missing.status,2,"no ungrounded default values allowed");
assert.ok(missing.stderr.includes("Q026_PREVIEW_CAPACITY_BLOCKED "));
console.log("Q026_PREVIEW_CAPACITY_PROPERTIES_PASS "+JSON.stringify({
  exact_budget:true,over_budget_rejected:true,missing_fields_rejected:true,
  credentials_rejected:true,monotonic_worker_count:true,
  cli_success_0_and_failure_2:true,
  boundary:"pure declared-capacity gate only; no live PostgreSQL or topology proof"
}));
