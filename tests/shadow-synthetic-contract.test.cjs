"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

// Entire consumer pipeline, but all inputs are synthetic and reads stay in memory.
// A lightweight FACT/UNKNOWN packaging stub tests propagation, NOT physical fit.
const source = fs.readFileSync(path.join(__dirname, "../runtime/shadow/candidates/CAIXA_MOOCA_consumer_bar_exact_20261007.cjs"), "utf8");
const products = {
  coke: {code:"8.00.05.000.00",name:"COCA COLA 350ML - UN"},
  zero: {code:"8.00.05.010.00",name:"COCA COLA ZERO 350ML - UN"},
  water: {code:"8.00.00.010.00",name:"AGUA MINERAL C/GAS - UN"},
  still: {code:"8.00.00.000.00",name:"AGUA MINERAL S/GAS - UN"},
  tea: {code:"8.00.05.100.00",name:"CHA GELADO DE LIMAO ICE TEA 450ML - UN"}
};
const structural = {
  "product-aliases-v1.json": {schema:"deliveryos.academia-live-product-aliases.v1", aliases:[]},
  "human-order-overrides-v1.json": {schema:"deliveryos.human-exact-order-overrides.v1", orders:[]},
  "printer-map.json": {schema:"deliveryos.runtime-printer-map.v1", mappings:[
    {printer_code:"00007",printer_name:"BAR TESTE",printer_ip:"127.0.0.7"},
    {printer_code:"00002",printer_name:"COZINHA TESTE",printer_ip:"127.0.0.2"}
  ]},
  "app-data.json": {products:[]},
  "non-production.json": {items:{}},
  "tata-sequence-state.json": {schema:"deliveryos.tata-sequence-state.v1",next_value:100}
};
function run(productKey, opts={}) {
  const product={...products[productKey],...(opts.overrideProduct||{})};
  const code=product.code;
  const route=opts.routes ?? ["00007"];
  const event={
    schema:"deliveryos.tata-reader-stable-order-event.v1",
    ready_for_downstream_shadow:opts.upstreamReady ?? true,
    blockers:opts.upstreamBlockers ?? [],
    order_key:"synthetic-only",
    snapshot_hash:"synthetic-untrusted",
    service_resolution:{service:"DINNER"},
    order:{
      NRCOMANDA:"SYN-0001",NRCOMANDAEXT:"SYN-0001",
      IDSTCOMANDA:"X", observation_scan_complete:opts.scanComplete ?? true,
      observation_rows:opts.observations ?? [],
      items:[{CDPRODUTO:"SYN-ITEM-1",CDARVPROD:code.replaceAll(".",""),QTPRODCOMVEN:1}]
    }
  };
  const records={
    ...structural,
    "test-event.json":event,
    "product-identity-cache-v1.json":{
      schema:"deliveryos.product-identity-cache.v1",
      rows:[{CDPRODUTO:"SYN-ITEM-1",canonical:code,NMPRODUTO:product.name}]
    },
    "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",products:{[code]:route}}
  };
  const safetyCalls=[];
  const stubFs={
    readFileSync(file) {
      const name=String(file).split(/[\\/]/).pop();
      if(!(name in records)) throw new Error("UNEXPECTED_READ:"+name);
      return Buffer.from(JSON.stringify(records[name]),"utf8");
    },
    existsSync(file){return String(file).includes("tata-sequence-state.json");},
    writeFileSync(){safetyCalls.push("WRITE");throw Error("FILE_WRITE_FORBIDDEN");},
    renameSync(){safetyCalls.push("RENAME");throw Error("RENAME_FORBIDDEN");}
  };
  const mockP={
    FACT:"FACT",
    categoryOf:()=>({status:"UNKNOWN"}),
    packComanda:()=>({
      has_unknown:false,
      groups:[],
      bags:opts.packagingFact
        ? {size:"P",size_status:"FACT",exact_bag_count:1,exact_bag_count_status:"FACT"}
        : {size:null,size_status:"UNKNOWN",exact_bag_count:null,exact_bag_count_status:"UNKNOWN"}
    }),
    kitVerdict:()=>({status:"FACT",kits:[{kit:"Kit Simples",quantidade:1}]})
  };
  const emitted=[];
  const sentinel={kind:"PROCESS_EXIT"};
  const processMock={
    argv:["node","consumer","test-event.json"],pid:43210,
    stdout:{write:s=>emitted.push(s)},
    exit:code=>{throw {...sentinel,code}}
  };
  const sandbox={Buffer,console,process:processMock};
  sandbox.globalThis=sandbox;
  const requireMock=id=>{
    if(id==="node:fs") return stubFs;
    if(id==="node:path") return path;
    if(id==="node:crypto") return crypto;
    if(String(id).endsWith("packaging-current.js")){
      sandbox.TATAPackaging=mockP;
      return {};
    }
    throw Error("UNEXPECTED_IMPORT:"+id);
  };
  sandbox.require=requireMock;
  sandbox.__dirname="/virtual/shadow";
  try{vm.runInNewContext(source,sandbox,{timeout:1000,filename:"candidate-shadow.cjs"});}
  catch(e){if(e.kind!=="PROCESS_EXIT")throw e;}
  assert.equal(emitted.length,1,"consumer emits one JSON decision");
  assert.deepEqual(safetyCalls,[],"consumer made no writes");
  const result=JSON.parse(emitted[0]);
  assert.equal(result.effects.print,false);
  assert.equal(result.effects.fiscal_action,false);
  assert.equal(result.effects.spooler_write,false);
  assert.equal(result.effects.sefaz_call,false);
  return result;
}
let count=0;
const expect=(key,opts,required,forbidden=[])=>{
  const d=run(key,opts);
  for(const b of required)assert.ok(d.blocking_reasons.includes(b),"missing "+b+" for "+key);
  for(const b of forbidden)assert.ok(!d.blocking_reasons.includes(b),"unexpected "+b+" for "+key);
  count++;return d;
};
const unknown = "BAG_SIZE_NOT_FACT";
const classified = "CLASSIFICATION_UNKNOWN_";
for(const key of ["coke","water","still","zero"]){
  const d=expect(key,{},[unknown],[classified+products[key].code]);
  assert.equal(d.items[0].classification.family,"bebida");
  assert.equal(d.items[0].classification.station,"bar_bebidas");
}
const tea=expect("tea",{},[classified+products.tea.code]);
assert.equal(tea.items[0].classification,null);
expect("coke",{overrideProduct:{name:"COCA COLA 500ML - UN"}},[classified+products.coke.code]);
expect("water",{routes:["00002"]},[classified+products.water.code]);
expect("water",{routes:["00007","00002"]},[classified+products.water.code]);
const ordinary=expect("water",{packagingFact:true},[]);
assert.equal(ordinary.ready,true,"synthetic fully proven pipeline should be ready");
const allergyObs=[{value:"ALERGIA A CAMARÃO",source_field:"PEDIDO",scope_hint:"order",join_proven:true}];
const allergy=expect("water",{packagingFact:true,observations:allergyObs},["ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"]);
assert.equal(allergy.ready,false);
expect("water",{packagingFact:true,scanComplete:false},["OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE"]);
expect("water",{packagingFact:true,observations:[{...allergyObs[0],join_proven:false}]},["OBSERVATION_JOIN_NOT_PROVEN:PEDIDO"]);
expect("water",{packagingFact:true,upstreamReady:false,upstreamBlockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"]},["UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER"]);
const fingerprint1=run("water",{packagingFact:true}).fingerprint;
const fingerprint2=run("water",{packagingFact:true}).fingerprint;
assert.equal(fingerprint1,fingerprint2,"synthetic deterministic decision core fingerprint");
console.log("shadow synthetic contract: "+count+"/"+count+" cases passed; identity, routes, observation safety, upstream, no effects, deterministic fingerprint");
