"use strict";
/** V7.15 direct fail-closed guard: isolated synthetic CI on Linux/Windows. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const ROOT=path.resolve(__dirname,"..");
const V714=path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs");
const V715=path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v715_REVIEW_ONLY.cjs");
const bytes=fs.readFileSync(V714);
const blob=crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
assert.equal(blob,"8e75fea85437d063c2f6ee2df09ee33962d42ce6");
const v715=fs.readFileSync(V715,"utf8");
assert.ok(v715.indexOf("const nativeScopeReasonV715=")<v715.indexOf('const cache = readJson('));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"v715-scope-review-")),dir=path.join(temp,"sources");
fs.mkdirSync(dir);fs.copyFileSync(V715,path.join(dir,"consumer.cjs"));
fs.copyFileSync(path.join(ROOT,"tools/fixtures/canonical-packaging-v63-pinned.js"),path.join(dir,"packaging-current.js"));
const event=()=>({
 schema:"deliveryos.tata-reader-stable-order-event.v1",order_key:"0001|01|FAKESALE|FAKECMD",
 ready_for_downstream_shadow:true,blockers:[],service_resolution:{blockers:[]},
 print_authorized:true,effects:{print:true},
 order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"FAKESALE",NRCOMANDA:"FAKECMD",
 NRCOMANDAEXT:"FAKEIFO",IDORGCMDVENDA:"DLV_IFO",IDSTCOMANDA:"P",
 DTHRABERMESA:"2026-11-06T11:00:00",items:[],observation_rows:[],observation_scan_complete:true}
});
let cases=0;
const run=(e)=>{
 const n=cases,inp=path.join(temp,"in-"+n+".json"),out=path.join(temp,"out-"+n+".json");
 fs.writeFileSync(inp,JSON.stringify(e));
 const r=spawnSync(process.execPath,[path.join(dir,"consumer.cjs"),inp,out],{encoding:"utf8",timeout:12000,windowsHide:true});
 assert.equal(r.error,undefined);
 return {r,out};
};
const test=(label,fn)=>{fn();cases++;console.log("PASS "+cases+" "+label);};
const reject=(label,edit,code)=>test(label,()=>{
 const e=event();edit(e);
 const {r,out}=run(e);
 assert.equal(r.status,1,JSON.stringify({label,status:r.status,stderr:r.stderr.slice(0,500)}));
 assert.equal(r.stdout,"");
 assert.ok(r.stderr.includes("Error: "+code),r.stderr.slice(0,500));
 assert.ok(!fs.existsSync(out));
 for(const s of ["FAKESALE","FAKECMD","FAKEIFO"]) assert.ok(!r.stderr.includes(s));
});
try {
 test("V714 source bytes unchanged",()=>assert.equal(blob,"8e75fea85437d063c2f6ee2df09ee33962d42ce6"));
 reject("wrong native source",e=>e.order.IDORGCMDVENDA="DLV_NMO","NATIVE_IFOOD_ORIGIN_NOT_EXACT");
 reject("other DLV source",e=>e.order.IDORGCMDVENDA="DLV_CPD","NATIVE_IFOOD_ORIGIN_NOT_EXACT");
 reject("missing source",e=>delete e.order.IDORGCMDVENDA,"NATIVE_IFOOD_ORIGIN_NOT_EXACT");
 reject("case-mutated source",e=>e.order.IDORGCMDVENDA="dlv_ifo","NATIVE_IFOOD_ORIGIN_NOT_EXACT");
 reject("wrong filial",e=>e.order.CDFILIAL="0002","NATIVE_ITAIM_SCOPE_NOT_EXACT");
 reject("wrong loja",e=>e.order.CDLOJA="02","NATIVE_ITAIM_SCOPE_NOT_EXACT");
 reject("nonstring loja",e=>e.order.CDLOJA=1,"NATIVE_ITAIM_SCOPE_NOT_EXACT");
 reject("missing header",e=>delete e.order,"NATIVE_EVENT_ENVELOPE_INVALID");
 reject("array header",e=>e.order=[],"NATIVE_EVENT_ENVELOPE_INVALID");
 reject("four-part mismatch",e=>e.order_key="0001|01|FAKESALE|OTHER","NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("missing key",e=>delete e.order_key,"NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("injected separator",e=>{e.order.NRCOMANDA="FA|KE";e.order_key="0001|01|FAKESALE|FA|KE";},"NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("control newline",e=>{e.order.NRCOMANDA="FA\nKE";e.order_key="0001|01|FAKESALE|FA\nKE";},"NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("varchar10 exceeded",e=>{e.order.NRCOMANDA="12345678901";e.order_key="0001|01|FAKESALE|12345678901";},"NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("nonstring command key",e=>e.order.NRCOMANDA=null,"NATIVE_FOUR_PART_ORDER_KEY_MISMATCH");
 reject("malformed event schema",e=>e.schema="synthetic.invalid","EVENT_SCHEMA_MISMATCH");
 test("valid synthetic scope reaches shadow decision but does not authorize print",()=>{
   const put=(k,v)=>fs.writeFileSync(path.join(dir,k),JSON.stringify(v));
   put("app-data.json",{products:[]});
   put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",rows:[]});
   put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]});
   put("human-order-overrides-v1.json",{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
   put("routing.json",{schema:"deliveryos.odhen.product-routing.compact.v1",products:{}});
   put("printer-map.json",{schema:"deliveryos.runtime-printer-map.v1",mappings:[]});
   put("non-production.json",{items:{}});
   const {r,out}=run(event());
   assert.ok(r.status===0||r.status===5,r.stderr.slice(0,600));
   assert.equal(r.stderr,"");
   const decision=JSON.parse(r.stdout);
   assert.equal(decision.schema,"deliveryos.live-shadow-decision.v1");
   assert.equal(decision.ready,false);
   assert.equal(decision.effects.print,false);
   assert.equal(decision.effects.database_write,false);
   assert.equal(decision.effects.spooler_write,false);
   assert.ok(fs.existsSync(out));
 });
 console.log("COMANDAS_V715_DIRECT_SCOPE="+cases+"/"+cases+" SYNTHETIC_ONLY NO_HOST NO_PRINT");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
