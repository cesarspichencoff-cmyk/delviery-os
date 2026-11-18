"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {reconcile,SCHEMA}=require("./reconcile.cjs");
let checks=0;const check=(name,p)=>{assert.ok(p,name);checks++;console.log("PASS "+name)};
const now="2026-11-02T01:59:55.000Z",day="2026-11-01",key="f".repeat(64);
const sha=x=>crypto.createHash("sha256").update(String(x)).digest("hex");
const order=(short,extra={})=>({shortId:short,day,seenAt:now,status:"Em preparo",...extra});
const native=(short,serial,extra={})=>({shortId:short,day,seenAt:now,
 nativeKey:"0001|01|"+serial+"|"+serial,revisionHash:sha("r"+serial),
 origin:"DLV_IFO",nativeStatus:"P",items:[{index:1,productCode:"9.10.05.050.00",quantity:2,nativeItemStatus:"4"}],...extra});
const base=()=>({schema:SCHEMA,scope:{unit:"ITAIM",day,ifoodStore:"53069",nativeFilial:"0001",
 nativeLoja:"01",mappingRef:"HISTORICAL_CANDIDATE_20261025",mappingIndependentlyVerified:false},
 ifood:{source:"GESTOR_WEB",mode:"SIMULATED",store:"53069",capturedAt:now,sourceAttested:false,
 orders:[order("4821")]},
 native:{source:"TEKNISA_READER_V2",mode:"SIMULATED",filial:"0001",loja:"01",
 capturedAt:now,sourceAttested:false,orders:[native("4821",456)]},
 now,privateKey:key});
function run(fn){const x=base();fn(x);return reconcile(x)}
const defaultResult=reconcile(base());
check("matches short id on same unit and local day",defaultResult.counts.candidate===1);
check("does not promote simulation",defaultResult.status==="SIMULATION_ONLY");
check("opaque reference hides raw ids",!JSON.stringify(defaultResult).includes("4821")&&!JSON.stringify(defaultResult).includes("0001|01|"));
check("items quantity is two not pieces",defaultResult.matches[0].itemLines===1&&defaultResult.matches[0].itemUnits===2);
check("one opaque item reference per native product line",defaultResult.matches[0].itemRefs.length===1&&defaultResult.matches[0].itemRefs[0].itemIndex===1);
check("item reference preserves quantity without product/customer IDs",defaultResult.matches[0].itemRefs[0].quantity===2&&/^[0-9a-f]{24}$/.test(defaultResult.matches[0].itemRefs[0].opaqueItemRef));
check("item state is unknown even with native status 4",defaultResult.matches[0].itemRefs[0].operationalState==="UNKNOWN"&&defaultResult.matches[0].itemRefs[0].nativeItemStatusSemantics==="UNVERIFIED");
check("real item progress never inferred from native P or 4",defaultResult.matches[0].itemProgress==="UNKNOWN"&&defaultResult.matches[0].physicalReady===false);
check("never authorizes printing, dispatch, ready, delivery",!defaultResult.readyForCopilot&&!defaultResult.printAuthorized&&!defaultResult.deliveryEventsEnabled&&Object.values(defaultResult.effects).every(v=>v===false));
check("mapping remains unverified",!defaultResult.merchantVerified&&defaultResult.reasons.includes("STORE_MAPPING_NOT_INDEPENDENTLY_ATTESTED"));
check("key stable under deterministic replay",reconcile(base()).matches[0].opaqueRef===defaultResult.matches[0].opaqueRef);
check("different privateKey produces different tokens",run(i=>{i.privateKey="a".repeat(64)}).matches[0].opaqueRef!==defaultResult.matches[0].opaqueRef);
check("preparing count cannot be used as per-order data",run(i=>{i.ifood.orders=[];i.ifood.preparing=23}).status==="HOLD");
check("empty native blocks match",run(i=>i.native.orders=[]).status==="HOLD");
check("cross-store refused",run(i=>i.ifood.store="0001").status==="HOLD");
check("native wrong unit refused",run(i=>i.native.filial="0002").status==="HOLD");
check("source stale refused",run(i=>i.ifood.capturedAt="2026-11-02T01:57:00.000Z").reasons.includes("SOURCE_STALE_OR_CLOCK_SKEW"));
check("future clock skew refused",run(i=>i.native.capturedAt="2026-11-02T02:00:15.000Z").status==="HOLD");
check("source simulation/live not mixed",run(i=>i.ifood.mode="LIVE_SHADOW").reasons.includes("LIVE_SIMULATION_MIXED"));
check("stated live is still shadow and not operational",run(i=>{i.native.mode="LIVE_SHADOW";i.ifood.mode="LIVE_SHADOW";i.ifood.sourceAttested=true;i.native.sourceAttested=true;i.scope.mappingIndependentlyVerified=true}).status==="CANDIDATES_SHADOW_ONLY");
const allClaims=run(i=>{
 i.ifood.mode="LIVE_SHADOW";i.native.mode="LIVE_SHADOW";
 i.ifood.sourceAttested=true;i.native.sourceAttested=true;
 i.scope.mappingIndependentlyVerified=true;
});
check("self-claimed source and store flags never constitute merchant proof",
 allClaims.status==="CANDIDATES_SHADOW_ONLY"&&allClaims.merchantVerified===false&&
 allClaims.reasons.includes("ATTESTATION_FLAGS_ARE_UNBOUND_INPUT_CLAIMS")&&
 allClaims.readyForCopilot===false);
check("partial source attestation cannot promote",!run(i=>{i.ifood.sourceAttested=true}).merchantVerified);
check("short code collision quarantined",run(i=>i.ifood.orders.push(order("4821"))).counts.collision===1);
check("two different native keys with same short quarantined",run(i=>i.native.orders.push(native("4821",457))).counts.collision===1);
check("native repeat snapshots deduplicated",run(i=>i.native.orders.push({...native("4821",456),seenAt:"2026-11-02T01:59:56.000Z"})).counts.candidate===1);
check("native revisions not double-counted",run(i=>i.native.orders.push({...native("4821",456),revisionHash:sha("new"),seenAt:"2026-11-02T01:59:57.000Z"})).counts.candidate===1);
check("native A-B-A return held",run(i=>i.native.orders.push(
 {...native("4821",456),revisionHash:sha("B"),seenAt:"2026-11-02T01:59:56.000Z"},
 {...native("4821",456),seenAt:"2026-11-02T01:59:57.000Z"})).counts.revisionHold===1);
check("same timestamp conflicting revisions held",run(i=>i.native.orders.push({...native("4821",456),revisionHash:sha("B")}))
 .counts.revisionHold===1);
check("day mismatch rejected",run(i=>i.native.orders[0].day="2026-10-31").status==="HOLD");
check("cross midnight UTC timestamp does not change operational day",run(i=>{i.ifood.orders[0].seenAt="2026-11-02T02:00:00.000Z";i.native.orders[0].seenAt="2026-11-02T02:00:00.000Z"}).counts.candidate===1);
check("client field rejected from input schema",run(i=>i.native.orders[0].customerName="SHOULD_NOT_PASS").status==="HOLD");
check("customer field rejected in item schema",run(i=>i.native.orders[0].items[0].note="SHOULD_NOT_PASS").status==="HOLD");
check("missing product list retained as unknown",run(i=>i.native.orders[0].items=[]).counts.noItems===1);
check("invalid quantity zero is refused",run(i=>i.native.orders[0].items[0].quantity=0).status==="HOLD");
check("invalid time is refused",run(i=>i.ifood.capturedAt="2026-02-31T01:59:55.000Z").status==="HOLD");
check("invalid short id refused",run(i=>i.ifood.orders[0].shortId="12345").status==="HOLD");
check("native origin must be DLV_IFO",run(i=>i.native.orders[0].origin="DLV_NMO").status==="HOLD");
const replay=run(i=>{
 const id=x=>String(x).padStart(4,"0");
 i.ifood.orders=[];i.native.orders=[];
 for(let n=0;n<314;n++)i.ifood.orders.push(order(id(n)));
 for(let n=0;n<311;n++)i.native.orders.push(native(id(n),n+1000));
 for(let n=314;n<320;n++)i.native.orders.push(native(id(n),n+1000));
});
check("historical 314 vs 317 fixture equals 311 candidate, 3 only iFood, 6 only native",
 replay.counts.ifood===314&&replay.counts.native===317&&
 replay.counts.candidate===311&&replay.counts.onlyIfood===3&&replay.counts.onlyNative===6);
check("historical replay not proof of live 311 correlations",replay.status==="SIMULATION_ONLY"&&!replay.readyForCopilot);
check("no individual code or product names from 314+317 fixture exposed",!JSON.stringify(replay).includes("SHOULD_NOT_PASS")&&replay.matches.every(x=>Object.keys(x).every(k=>!["shortId","nativeKey","productCode","customerName"].includes(k))));
console.log("CORRELATION_SHADOW_TEST_PASS "+checks+"/"+checks);