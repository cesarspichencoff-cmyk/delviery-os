"use strict";
/* Offline Microsoft Edge fixture: no real Gestor, account, order, network or cashier. */
const assert=require("node:assert/strict"),path=require("node:path");
const {chromium}=require("playwright-core");
const SENSOR=path.resolve(__dirname,"../../runtime/reporting/gestor_v3_visible_sensor.js");
const CFG={mode:"FIXTURE",selectors:{
 root:"#orders",card:".card",reference:".ref",status:".status",
 detail:"dialog[open]",detailReference:".detail-ref",item:".line",
 itemName:".name",itemQuantity:".qty",option:".option"
}};
const html=(one=false)=>`<!doctype html><html><body>
 <input id="focus-marker" value="preserve focus"><main id="orders">
 <div class="card"><span class="ref">#1234</span><span class="status">Em preparo</span></div>
 ${one?"":'<div class="card"><span class="ref">#1235</span><span class="status">Aceito</span></div>'}
 </main>
 <dialog open><span class="detail-ref">#1234</span>
 <div class="line"><span class="name">Combinado sushi</span><span class="qty">2</span>
   <span class="option">Sem cebolinha</span></div>
 <div class="line"><span class="name">Hot roll</span><span class="qty">1</span></div>
 </dialog></body></html>`;
(async()=>{
 const ctx=await chromium.launchPersistentContext("",{headless:true,
  executablePath:process.env.EDGE_EXE||"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args:["--disable-extensions"],acceptDownloads:false});
 let pass=0,network=0;
 const page=ctx.pages()[0]||await ctx.newPage();
 ctx.on("request",()=>{network++});
 const test=async(label,fn)=>{await fn();pass++;console.log("OK "+label)};
 const setup=async(str=html())=>{await page.setContent(str);await page.addScriptTag({path:SENSOR})};
 const scan=async(c=CFG)=>page.evaluate(cfg=>globalThis.DeliveryGestorV3Review.scan(document,cfg),c);
 const mutate=async(sel,value)=>page.locator(sel).first().evaluate((el,s)=>{el.textContent=s},value);
 try {
  await setup();
  await test("two visible candidate orders",async()=>{const a=await scan();assert.equal(a.state,"REVIEW_ONLY");assert.equal(a.orders.length,2)});
  await test("one selected detail with two item lines",async()=>{const a=await scan();assert.equal(a.detail.items.length,2);assert.equal(a.detail.items[0].quantity,2)});
  await test("modifier is retained only as review",async()=>{const a=await scan();assert.deepEqual(a.detail.items[0].options,["Sem cebolinha"])});
  await test("never authorizes live publishing or full coverage",async()=>{const a=await scan();assert.equal(a.merchantVerified,false);assert.equal(a.coverageVerified,false);assert.equal(a.ordersPublishable,0);assert.equal(a.coverage,"VISIBLE_ONLY")});
  await test("header READY never asserts physical station ready",async()=>{await mutate(".status","Pronto");const a=await scan();assert.equal(a.orders[0].header_status,"READY_HEADER_VISIBLE")});
  await test("observable cancellation on the same candidate",async()=>{await mutate(".status","Cancelado");const a=await scan();assert.equal(a.orders[0].header_status,"CANCELLED_HEADER_VISIBLE")});
  await test("unknown state quarantines the entire review",async()=>{await mutate(".status","Enviando");const a=await scan();assert.equal(a.state,"HOLD_AMBIGUOUS_ORDER");assert.equal(a.orders.length,0)});
  await test("duplicate short ID cannot masquerade as two orders",async()=>{await mutate(".status","Aceito");await mutate(".card:nth-child(2) .ref","#1234");assert.equal((await scan()).state,"HOLD_AMBIGUOUS_ORDER")});
  await setup();
  await test("missing open detail stays explicitly unknown",async()=>{await page.locator("dialog").evaluate(d=>d.removeAttribute("open"));const a=await scan();assert.equal(a.state,"REVIEW_ONLY");assert.equal(a.detail.state,"NOT_OPEN")});
  await test("unlinked detail blocks item assertions",async()=>{await page.locator("dialog").evaluate(d=>d.setAttribute("open",""));await mutate(".detail-ref","#9999");assert.equal((await scan()).state,"HOLD_DETAIL_UNBOUND")});
  await setup();
  await test("untrusted free-text with phone number is refused",async()=>{await mutate(".name","Cliente 11999998888");assert.equal((await scan()).state,"HOLD_ITEM_INVALID")});
  await setup();
  await test("hidden item cannot silently disappear",async()=>{await page.locator(".line:nth-of-type(2)").evaluate(x=>x.hidden=true);assert.equal((await scan()).state,"HOLD_DETAIL_INCOMPLETE")});
  await setup();
  await test("hidden option cannot silently disappear",async()=>{await page.locator(".option").evaluate(x=>x.hidden=true);assert.equal((await scan()).state,"HOLD_OPTION_INCOMPLETE")});
  await setup();
  await test("invalid quantities refuse item detail",async()=>{await mutate(".qty","zero");assert.equal((await scan()).state,"HOLD_ITEM_INVALID")});
  await setup();
  await test("two open details block ambiguous extraction",async()=>{await page.evaluate(()=>{const d=document.querySelector("dialog");document.body.appendChild(d.cloneNode(true))});assert.equal((await scan()).state,"HOLD_MULTIPLE_DETAILS")});
  await setup();
  await test("empty visible list is not treated as zero verified orders",async()=>{await page.locator(".card").evaluateAll(xs=>xs.forEach(x=>x.remove()));assert.equal((await scan()).state,"HOLD_EMPTY_NOT_ZERO")});
  await setup();
  await test("wrong host/mode is strictly blocked",async()=>{const a=await scan({...CFG,mode:"FIELD_REVIEW"});assert.equal(a.state,"HOLD_SCOPE")});
  await test("missing selector mapping is blocked",async()=>{const a=await scan({mode:"FIXTURE",selectors:{root:"#orders"}});assert.equal(a.state,"HOLD_CONFIG")});
  await test("no fallthrough of multiple candidate references",async()=>{await page.locator(".card:first-child").evaluate(x=>{const r=x.querySelector(".ref");x.appendChild(r.cloneNode(true))});assert.equal((await scan()).state,"HOLD_AMBIGUOUS_ORDER")});
  await setup();
  await page.locator("#focus-marker").focus();
  const before=await page.evaluate(()=>({html:document.documentElement.outerHTML,focus:document.activeElement?.id,scrollX,scrollY}));
  await test("scan does not mutate DOM, scroll or focus",async()=>{await scan();const after=await page.evaluate(()=>({html:document.documentElement.outerHTML,focus:document.activeElement?.id,scrollX,scrollY}));assert.deepEqual(after,before)});
  await test("watch emits initial review and detects changes",async()=>{
    await page.evaluate(cfg=>{globalThis.v3Events=[];globalThis.v3Watch=globalThis.DeliveryGestorV3Review.watch(document,cfg,e=>globalThis.v3Events.push(e))},CFG);
    await page.waitForFunction(()=>globalThis.v3Events?.length===1);
    await mutate(".status","Pronto");
    await page.waitForFunction(()=>globalThis.v3Events?.length===2);
    const s=await page.evaluate(()=>globalThis.v3Events);
    assert.equal(s[1].orders[0].header_status,"READY_HEADER_VISIBLE");
  });
  await test("unchanged reconcile is deduplicated",async()=>{
    await page.evaluate(()=>globalThis.v3Watch.reconcile());
    const n=await page.evaluate(()=>globalThis.v3Events.length);
    assert.equal(n,2);
  });
  await test("timestamp TTL never presents stale facts as current",async()=>{
    const a=await page.evaluate(()=>globalThis.v3Watch.current(Date.now()+61000));
    assert.equal(a.state,"HOLD_STALE");assert.equal(a.ordersPublishable,0);
  });
  await test("observer stops without emitting further changes",async()=>{
    await page.evaluate(()=>globalThis.v3Watch.stop());
    await mutate(".status","Aceito");
    await page.waitForTimeout(50);
    const n=await page.evaluate(()=>globalThis.v3Events.length);
    assert.equal(n,2);
  });
  await setup();
  await test("attribute-only card hiding triggers fail-closed review",async()=>{
    await page.evaluate(cfg=>{
      globalThis.v3AttributeEvents=[];
      globalThis.v3AttributeWatch=globalThis.DeliveryGestorV3Review.watch(document,cfg,e=>globalThis.v3AttributeEvents.push(e));
    },CFG);
    await page.waitForFunction(()=>globalThis.v3AttributeEvents?.length===1);
    await page.locator(".card").first().evaluate(el=>el.setAttribute("hidden",""));
    await page.waitForFunction(()=>globalThis.v3AttributeEvents?.length===2);
    const state=await page.evaluate(()=>globalThis.v3AttributeEvents.at(-1));
    assert.equal(state.state,"HOLD_HIDDEN_CARD");
    assert.equal(state.ordersPublishable,0);
    await page.evaluate(()=>globalThis.v3AttributeWatch.stop());
  });
  await setup();
  await test("attribute-only detail closure invalidates selected detail",async()=>{
    await page.evaluate(cfg=>{
      globalThis.v3DialogEvents=[];
      globalThis.v3DialogWatch=globalThis.DeliveryGestorV3Review.watch(document,cfg,e=>globalThis.v3DialogEvents.push(e));
    },CFG);
    await page.waitForFunction(()=>globalThis.v3DialogEvents?.length===1);
    await page.locator("dialog").evaluate(el=>el.removeAttribute("open"));
    await page.waitForFunction(()=>globalThis.v3DialogEvents?.length===2);
    const state=await page.evaluate(()=>globalThis.v3DialogEvents.at(-1));
    assert.equal(state.state,"REVIEW_ONLY");
    assert.equal(state.detail.state,"NOT_OPEN");
    assert.equal(state.ordersPublishable,0);
    await page.evaluate(()=>globalThis.v3DialogWatch.stop());
  });
  await test("no external requests during the entire fixture",async()=>assert.equal(network,0));
  console.log("GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_PASS "+pass+"/"+pass+
    " (SYNTHETIC_ONLY; NO_ORDERS_FROM_IFOOD)");
 }finally{await ctx.close();}
})().catch(e=>{console.error("GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_FAIL",e.stack||e);process.exitCode=1});
