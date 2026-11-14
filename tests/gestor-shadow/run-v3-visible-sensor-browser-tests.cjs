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
const GROUP_CFG={mode:"FIXTURE",layout:"GROUPED",selectors:{
 root:"#groups",card:".group-card",detail:"dialog[open]",
 detailOrder:".detail-order",detailOrderReference:".detail-ref",
 item:".line",itemName:".name",itemQuantity:".qty",option:".option"
}};
const groupedHtml=()=>`<!doctype html><html><body>
 <input id="focus-marker" value="preserve focus">
 <main id="groups"><div class="group-card">Grupo com dois pedidos</div>
 <div class="group-card">Outro grupo sem detalhes abertos</div></main>
 <dialog open>
   <section class="detail-order"><span class="detail-ref">#1234</span>
     <div class="line"><span class="name">Hot roll</span><span class="qty">3</span>
       <span class="option">Sem cebolinha</span></div>
   </section>
   <section class="detail-order"><span class="detail-ref">#1235</span>
     <div class="line"><span class="name">Combinado sushi</span><span class="qty">2</span></div>
     <div class="line"><span class="name">Refrigerante</span><span class="qty">1</span></div>
   </section>
 </dialog></body></html>`;
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
  await test("unchanged local scan does not claim source freshness or new visible content",async()=>{
    const result=await page.evaluate(()=>{
      const before=globalThis.v3Watch.current();
      globalThis.v3Watch.reconcile();
      return {before,after:globalThis.v3Watch.current()};
    });
    assert.equal(result.after.visibleContentChangedAt,result.before.visibleContentChangedAt);
    assert.equal(result.after.freshnessBasis,"LOCAL_DOM_SCAN_ONLY");
    assert.equal(result.after.sourceFreshnessVerified,false);
    assert.equal(result.after.sourceUpdatedAt,null);
    assert.equal(result.after.ordersPublishable,0);
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
  await setup(groupedHtml());
  await test("grouped card counts are never order counts",async()=>{
    const a=await scan(GROUP_CFG);
    assert.equal(a.state,"REVIEW_ONLY");
    assert.equal(a.groupCount,2);
    assert.equal(a.orders.length,2);
    assert.equal(a.orderCountScope,"OPEN_DETAIL_ONLY");
    assert.equal(a.coverage,"OPEN_GROUP_DETAIL_ONLY");
    assert.equal(a.groupLinkVerified,false);
  });
  await test("group details preserve each reference and its own items",async()=>{
    const a=await scan(GROUP_CFG);
    assert.equal(a.detail.state,"VISIBLE_GROUP_DETAIL_CANDIDATES");
    assert.equal(a.detail.orders[0].reference_candidate,"#1234");
    assert.deepEqual(a.detail.orders[0].items[0],{
      name:"Hot roll",quantity:3,options:["Sem cebolinha"]});
    assert.equal(a.detail.orders[1].reference_candidate,"#1235");
    assert.equal(a.detail.orders[1].items.length,2);
  });
  await test("grouped review does not infer status, merchant or publishability",async()=>{
    const a=await scan(GROUP_CFG);
    assert.equal(a.orders[0].header_status,null);
    assert.equal(a.merchantVerified,false);
    assert.equal(a.coverageVerified,false);
    assert.equal(a.ordersPublishable,0);
    assert.equal(a.actionsExecuted,0);
  });
  await test("duplicate references inside grouped details fail closed",async()=>{
    await mutate(".detail-order:nth-child(2) .detail-ref","#1234");
    assert.equal((await scan(GROUP_CFG)).state,"HOLD_AMBIGUOUS_ORDER");
    assert.equal((await scan(GROUP_CFG)).ordersPublishable,0);
  });
  await setup(groupedHtml());
  await test("hidden individual order blocks fail grouped review",async()=>{
    await page.locator(".detail-order").last().evaluate(el=>el.hidden=true);
    assert.equal((await scan(GROUP_CFG)).state,"HOLD_GROUP_DETAIL_INCOMPLETE");
  });
  await setup(groupedHtml());
  await test("unopened group is not mistaken for zero orders",async()=>{
    await page.locator("dialog").evaluate(el=>el.removeAttribute("open"));
    const a=await scan(GROUP_CFG);
    assert.equal(a.state,"HOLD_GROUP_DETAIL_NOT_OPEN");
    assert.equal(a.groupCount,2);
    assert.equal(a.orders.length,0);
    assert.equal(a.ordersPublishable,0);
  });
  await setup(groupedHtml());
  await test("invalid grouped item quantity blocks the entire group",async()=>{
    await mutate(".detail-order:nth-child(2) .qty","indefinido");
    assert.equal((await scan(GROUP_CFG)).state,"HOLD_ITEM_INVALID");
  });
  await setup(groupedHtml());
  await test("grouped review does not click, scroll, mutate DOM or focus",async()=>{
    await page.locator("#focus-marker").focus();
    const before=await page.evaluate(()=>({html:document.documentElement.outerHTML,focus:document.activeElement?.id,scrollX,scrollY}));
    await scan(GROUP_CFG);
    const after=await page.evaluate(()=>({html:document.documentElement.outerHTML,focus:document.activeElement?.id,scrollX,scrollY}));
    assert.deepEqual(after,before);
  });
  await setup(groupedHtml());
  await test("unassigned grouped item blocks the review",async()=>{
    await page.locator("dialog").evaluate(d=>{
      const item=document.createElement("div");
      item.className="line";
      item.innerHTML='<span class="name">Loose item</span><span class="qty">1</span>';
      d.appendChild(item);
    });
    const a=await scan(GROUP_CFG);
    assert.equal(a.state,"HOLD_ITEM_SCOPE_AMBIGUOUS");
    assert.equal(a.ordersPublishable,0);
  });
  await setup(groupedHtml());
  await test("nested order blocks cannot duplicate item quantities",async()=>{
    await page.locator(".detail-order").first().evaluate(block=>{
      const nested=document.createElement("section");
      nested.className="detail-order";
      nested.innerHTML='<span class="detail-ref">#1236</span>';
      block.appendChild(nested);
    });
    const a=await scan(GROUP_CFG);
    assert.equal(a.state,"HOLD_OVERLAPPING_ORDER_SCOPE");
    assert.equal(a.ordersPublishable,0);
  });
  await setup(groupedHtml());
  await test("grouped watch tracks changed item quantities without navigation",async()=>{
    await page.evaluate(cfg=>{
      globalThis.groupEvents=[];
      globalThis.groupWatch=globalThis.DeliveryGestorV3Review.watch(
        document,cfg,e=>globalThis.groupEvents.push(e));
    },GROUP_CFG);
    await page.waitForFunction(()=>globalThis.groupEvents?.length===1);
    await mutate(".detail-order:first-child .qty","4");
    await page.waitForFunction(()=>globalThis.groupEvents?.length===2);
    const events=await page.evaluate(()=>globalThis.groupEvents);
    assert.equal(events[0].detail.orders[0].items[0].quantity,3);
    assert.equal(events[1].detail.orders[0].items[0].quantity,4);
    assert.equal(events[1].ordersPublishable,0);
    await page.evaluate(()=>globalThis.groupWatch.stop());
  });
  await setup(groupedHtml());
  await test("grouped watch closing detail removes old item evidence",async()=>{
    await page.evaluate(cfg=>{
      globalThis.closeEvents=[];
      globalThis.closeWatch=globalThis.DeliveryGestorV3Review.watch(
        document,cfg,e=>globalThis.closeEvents.push(e));
    },GROUP_CFG);
    await page.waitForFunction(()=>globalThis.closeEvents?.length===1);
    await page.locator("dialog").evaluate(d=>d.removeAttribute("open"));
    await page.waitForFunction(()=>globalThis.closeEvents?.length===2);
    const events=await page.evaluate(()=>globalThis.closeEvents);
    assert.equal(events[0].state,"REVIEW_ONLY");
    assert.equal(events[1].state,"HOLD_GROUP_DETAIL_NOT_OPEN");
    assert.equal(events[1].orders.length,0);
    assert.equal(events[1].ordersPublishable,0);
    await page.evaluate(()=>globalThis.closeWatch.stop());
  });
  await setup(groupedHtml());
  await test("grouped watch quarantines orphan item inserted live",async()=>{
    await page.evaluate(cfg=>{
      globalThis.orphanEvents=[];
      globalThis.orphanWatch=globalThis.DeliveryGestorV3Review.watch(
        document,cfg,e=>globalThis.orphanEvents.push(e));
    },GROUP_CFG);
    await page.waitForFunction(()=>globalThis.orphanEvents?.length===1);
    await page.locator("dialog").evaluate(d=>{
      const item=document.createElement("div");
      item.className="line";
      item.innerHTML='<span class="name">Missing association</span><span class="qty">2</span>';
      d.appendChild(item);
    });
    await page.waitForFunction(()=>globalThis.orphanEvents?.length===2);
    const events=await page.evaluate(()=>globalThis.orphanEvents);
    assert.equal(events[1].state,"HOLD_ITEM_SCOPE_AMBIGUOUS");
    assert.equal(events[1].ordersPublishable,0);
    await page.evaluate(()=>globalThis.orphanWatch.stop());
  });
  await setup(groupedHtml());
  await test("grouped visual update remains unverified by upstream source",async()=>{
    await page.evaluate(cfg=>{
      globalThis.freshEvents=[];
      globalThis.freshWatch=globalThis.DeliveryGestorV3Review.watch(
        document,cfg,e=>globalThis.freshEvents.push(e));
    },GROUP_CFG);
    await page.waitForFunction(()=>globalThis.freshEvents?.length===1);
    await page.waitForTimeout(20);
    await mutate(".detail-order:first-child .qty","5");
    await page.waitForFunction(()=>globalThis.freshEvents?.length===2);
    const events=await page.evaluate(()=>globalThis.freshEvents);
    assert.equal(events[0].sourceFreshnessVerified,false);
    assert.equal(events[1].sourceFreshnessVerified,false);
    assert.equal(events[1].sourceUpdatedAt,null);
    assert.equal(events[1].freshnessBasis,"LOCAL_DOM_SCAN_ONLY");
    assert.ok(new Date(events[1].visibleContentChangedAt)>=new Date(events[0].visibleContentChangedAt));
    assert.equal(events[1].ordersPublishable,0);
    await page.evaluate(()=>globalThis.freshWatch.stop());
  });
  await test("no external requests during the entire fixture",async()=>assert.equal(network,0));
  console.log("GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_PASS "+pass+"/"+pass+
    " (SYNTHETIC_ONLY; NO_ORDERS_FROM_IFOOD)");
 }finally{await ctx.close();}
})().catch(e=>{console.error("GESTOR_V3_VISIBLE_SENSOR_EDGE_FIXTURE_FAIL",e.stack||e);process.exitCode=1});
