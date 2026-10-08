"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const vm=require("node:vm");

// CI clones public TATÁ Academia at a pinned commit; no customer data here.
const academyRoot=process.env.ACADEMIA_ROOT;
assert.ok(academyRoot,"ACADEMIA_ROOT must point to pinned Academy checkout");
const engineSource=fs.readFileSync(path.join(academyRoot,"lib/packaging-current.js"),"utf8");
const consumerSource=fs.readFileSync(path.join(__dirname,"../runtime/shadow/candidates/CAIXA_MOOCA_consumer_bar_exact_20261007.cjs"),"utf8");
const examples={
  combo:{canonical:"9.10.05.090.00",name:"COMB SUSHI TRAD 1 PESSOA",route:["00009"]},
  water:{canonical:"8.00.00.010.00",name:"AGUA MINERAL C/GAS - UN",route:["00007"]},
  coke:{canonical:"8.00.05.000.00",name:"COCA COLA 350ML - UN",route:["00007"]},
  zero:{canonical:"8.00.05.010.00",name:"COCA COLA ZERO 350ML - UN",route:["00007"]},
  tea:{canonical:"8.00.05.100.00",name:"CHA GELADO DE LIMAO ICE TEA 450ML - UN",route:["00007"]}
};
function evaluate(keys,opts={}) {
  const products=keys.map((key,i)=>{
    const p={...examples[key]};
    if(key===opts.rename) p.name=opts.newName;
    if(key===opts.reroute) p.route=opts.route;
    return {id:"SYN"+i,...p};
  });
  const event={
    schema:"deliveryos.tata-reader-stable-order-event.v1",
    ready_for_downstream_shadow:opts.upstreamReady??true,
    blockers:opts.upstreamBlockers||[],
    order_key:"synthetic-academy-engine",
    snapshot_hash:"synthetic-not-a-real-ticket",
    service_resolution:{service:"DINNER"},
    order:{
      NRCOMANDA:"SYN0001",NRCOMANDAEXT:"SYN0001",IDSTCOMANDA:"X",
      observation_scan_complete:opts.scanComplete??true,
      observation_rows:opts.observations||[],
      items:products.map(p=>({
        CDPRODUTO:p.id,CDARVPROD:p.canonical.replaceAll(".",""),
        QTPRODCOMVEN:1
      }))
    }
  };
  const docs={
    "fixture-event.json":event,
    "product-identity-cache-v1.json":{
      schema:"deliveryos.product-identity-cache.v1",
      rows:products.map(p=>({CDPRODUTO:p.id,canonical:p.canonical,NMPRODUTO:p.name}))
    },
    "routing.json":{
      schema:"deliveryos.odhen.product-routing.compact.v1",
      products:Object.fromEntries(products.map(p=>[p.canonical,p.route]))
    },
    "printer-map.json":{
      schema:"deliveryos.runtime-printer-map.v1",
      mappings:[
        {printer_code:"00007",printer_name:"BAR SYNTHETIC",printer_ip:"127.0.0.7"},
        {printer_code:"00009",printer_name:"COMBINADOS SYNTHETIC",printer_ip:"127.0.0.9"},
        {printer_code:"00002",printer_name:"COZINHA SYNTHETIC",printer_ip:"127.0.0.2"}
      ]
    },
    "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]},
    "human-order-overrides-v1.json":{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]},
    "app-data.json":{products:[]},
    "non-production.json":{items:{}},
    "tata-sequence-state.json":{schema:"deliveryos.tata-sequence-state.v1",next_value:123}
  };
  const safetyCalls=[];
  const virtualFs={
    readFileSync(p) {
      const name=String(p).split(/[\\/]/).pop();
      if(!(name in docs))throw Error("UNEXPECTED_READ:"+name);
      return Buffer.from(JSON.stringify(docs[name]),"utf8");
    },
    existsSync:p=>String(p).includes("tata-sequence-state.json"),
    writeFileSync:()=>{safetyCalls.push("WRITE");throw Error("UNEXPECTED_WRITE");},
    renameSync:()=>{safetyCalls.push("RENAME");throw Error("UNEXPECTED_RENAME");}
  };
  const messages=[],stop={kind:"EXIT"};
  const fakeProcess={
    argv:["node","shadow","fixture-event.json"],pid:31337,
    stdout:{write:x=>messages.push(x)},
    exit:code=>{throw {...stop,code}}
  };
  const context=vm.createContext({Buffer,console,process:fakeProcess});
  const load=id=>{
    if(id==="node:fs")return virtualFs;
    if(id==="node:path")return path;
    if(id==="node:crypto")return crypto;
    if(String(id).endsWith("packaging-current.js"))return {};
    throw Error("UNEXPECTED_IMPORT "+id);
  };
  context.require=load;
  context.__dirname="/virtual/shadow";
  vm.runInContext(engineSource,context,{timeout:1500,filename:"real-academy-engine.js"});
  assert.ok(context.TATAPackaging?.packComanda,"Academy engine not loaded");
  try{vm.runInContext(consumerSource,context,{timeout:1500,filename:"consumer-candidate.cjs"});}
  catch(e){if(e.kind!=="EXIT")throw e;}
  assert.deepEqual(safetyCalls,[],"no filesystem effects from candidate");
  assert.equal(messages.length,1);
  const d=JSON.parse(messages[0]);
  assert.equal(d.effects.print,false);
  assert.equal(d.effects.fiscal_action,false);
  assert.equal(d.effects.spooler_write,false);
  assert.equal(d.effects.sefaz_call,false);
  return d;
}
let n=0;
function verify(keys,options,expectation){
  const d=evaluate(keys,options);
  for(const code of expectation.blockers||[]){
    assert.ok(d.blocking_reasons.includes(code),keys+": missing "+code+" ("+d.blocking_reasons+")");
  }
  for(const code of expectation.absent||[]){
    assert.ok(!d.blocking_reasons.includes(code),keys+": unexpected "+code);
  }
  if("ready" in expectation)assert.equal(d.ready,expectation.ready,keys+": unexpected ready");
  n++;return d;
}
const combo=verify(["combo"],{},{ready:true,absent:["BAG_SIZE_NOT_FACT","KITS_NOT_FACT"]});
assert.equal(combo.packaging.bags.size,"M");
assert.ok(combo.kits.kits.some(x=>x.kit==="Kit p/1"&&x.quantidade===1));
const mixed=verify(["combo","water"],{},{
  ready:false,blockers:["BAG_SIZE_NOT_FACT"],
  absent:["CLASSIFICATION_UNKNOWN_8.00.00.010.00","KITS_NOT_FACT"]
});
assert.equal(mixed.items[1].classification.family,"bebida");
verify(["combo","coke"],{},{
  ready:false,blockers:["BAG_SIZE_NOT_FACT"],
  absent:["CLASSIFICATION_UNKNOWN_8.00.05.000.00"]
});
verify(["combo","zero"],{},{
  ready:false,blockers:["BAG_SIZE_NOT_FACT"],
  absent:["CLASSIFICATION_UNKNOWN_8.00.05.010.00"]
});
verify(["combo","tea"],{},{
  ready:false,blockers:["CLASSIFICATION_UNKNOWN_8.00.05.100.00"]
});
verify(["combo","coke"],{rename:"coke",newName:"COCA COLA 500ML - UN"},{
  ready:false,blockers:["CLASSIFICATION_UNKNOWN_8.00.05.000.00"]
});
verify(["combo","water"],{reroute:"water",route:["00002"]},{
  ready:false,blockers:["CLASSIFICATION_UNKNOWN_8.00.00.010.00"]
});
verify(["combo"],{observations:[{source_field:"PEDIDO",value:"ALERGIA A CAMARAO",join_proven:true,scope_hint:"order"}]},{
  ready:false,blockers:["ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"]
});
verify(["combo"],{scanComplete:false},{
  ready:false,blockers:["OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE"]
});
verify(["combo"],{upstreamReady:false,upstreamBlockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"]},{
  ready:false,blockers:["UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER"]
});
console.log("academy-engine x deliveryos: "+n+"/"+n+" synthetic integration cases passed (real pinned packaging engine, no effects)");
