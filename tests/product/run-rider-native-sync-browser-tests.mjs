/**
 * True Chromium DOM + real rider-mobile scripts with a fake native bridge.
 * HTTP server serves ONLY repository static files + synthetic JSON on
 * 127.0.0.1. Native queue is a lab fixture, not Android Room or Xiaomi.
 *
 * Proves visual acknowledgement after native queue transition; separate
 * Android/Room/HTTP CI proves the native producer of "sent" status.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, join, extname, relative, isAbsolute } from "node:path";
import { chromium } from "playwright";

if ((process.env.DELIVERYOS_DATABASE_URL || "").trim() ||
    (process.env.TATA_READER_ROOT || "").trim())
  throw Error("RIDER_BROWSER_FIXTURE_REFUSES_PRODUCTIVE_SOURCES");

const root = resolve(process.cwd(), "src/entregas/ui");
const evidences = process.env.RIDER_QA_ARTIFACTS || "";
if (evidences) mkdirSync(evidences, { recursive: true });
let demoConnectionPosts = 0;
let snapshotOffline = false;

const session = { actor_id:"rider-fixture", role:"motoboy_interno" };
const json = (res, body, status=200) => {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"});
  res.end(JSON.stringify(body));
};
const server = createServer((req, res) => {
  const u = new URL(req.url || "/", "http://127.0.0.1");
  if (u.pathname === "/api/session") return json(res,{actor:session});
  if (u.pathname === "/api/policies") return json(res,{
    flags:{offline_queue_enabled:true,gps_capture_enabled:false},
    term:{publishable:false},
  });
  if (u.pathname === "/api/snapshot") return json(res,{
    actor:session, connection:snapshotOffline?"offline":"online",
    pending_sync:0, trips:[],
  });
  if (u.pathname === "/api/connection" && req.method === "POST") {
    demoConnectionPosts += 1;
    return json(res,{error:"DEMO_MUTATION_FORBIDDEN_IN_ANDROID"},403);
  }
  if (u.pathname.startsWith("/api/")) return json(res,{error:"UNEXPECTED_ROUTE"},404);
  const relPath = u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname;
  const file = resolve(root, "." + relPath);
  const rel = relative(root,file);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    res.writeHead(403); res.end(); return;
  }
  try {
    const content = readFileSync(file);
    const ext = extname(file);
    const mime = ext === ".js" ? "application/javascript; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".html" ? "text/html; charset=utf-8" : "text/plain";
    res.writeHead(200,{"Content-Type":mime,"Cache-Control":"no-store"});
    res.end(content);
  } catch {
    res.writeHead(404);res.end();
  }
});
const makeEvent = (state="pending") => ({
  event_id:"LAB-EVENT-ONE",kind:"ConfirmDelivery",
  state,sequence_local:1,trip_id:"LAB-TRIP",
  last_error:"Authorization Bearer FICT_SECRET_CLIENT_PAYLOAD",
});
function nativeInit(initial,hasSync=true,badRead=false,throwSync=false) {
  const seed=JSON.stringify({queue:initial,calls:0,badRead,throwSync});
  return "(function(){const fixture="+seed+";window.__riderLab=fixture;"+
    "const bridge={"+
    "capabilities:()=>JSON.stringify({device_id:'DEVICE-LAB',app_version:'lab'}),"+
    "status:()=>JSON.stringify({blocks:'permission_missing',active_trip_id:null}),"+
    "requestLocationPermission:()=>{},openAppSettings:()=>{},"+
    "startTripCapture:()=>{},stopTripCapture:()=>{},"+
    "recordTermAcknowledgement:()=>JSON.stringify({ok:false}),"+
    "applyServerPolicies:()=>JSON.stringify({ok:true}),"+
    "recordOperationalEvent:()=>JSON.stringify({ok:false}),"+
    "operationalEvents:()=>fixture.badRead?'invalid':JSON.stringify(fixture.queue),"+
    "syncNow:()=>{fixture.calls++;if(fixture.throwSync)throw Error('SYNTHETIC_FAILURE');}"+
    "};if(!"+String(hasSync)+")delete bridge.syncNow;"+
    "window.EntregasNative=bridge;})();";
}
let browser;
let count=0;
const errors=[];
async function scenario(name,initial,opts,check) {
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route("**/*", route => {
    const url=new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    return route.continue();
  });
  const page=await ctx.newPage();
  const thrown=[];
  page.on("pageerror",e=>thrown.push(e.name+":"+e.message.split("\n")[0]));
  await page.addInitScript({content:nativeInit(initial,opts?.hasSync!==false,
    opts?.badRead===true,opts?.throwSync===true)});
  try {
    await page.goto("http://127.0.0.1:"+server.address().port+"/rider-mobile/",{
      waitUntil:"domcontentloaded",timeout:15000,
    });
    await page.waitForFunction(()=>{
      const e=document.getElementById("stopTitle");
      return e && e.textContent.includes("Nenhuma viagem ativa") &&
        document.getElementById("deviceIdValue")?.textContent==="DEVICE-LAB";
    },null,{timeout:15000});
    await check(page);
    assert.deepEqual(thrown,[],name+": PAGE_ERROR");
    assert.equal(demoConnectionPosts,0,name+": demo connection mutated");
    if (evidences) await page.screenshot({
      path:join(evidences,name+".png"),fullPage:true,
    });
    count++;
    console.log("PASS RIDER_NATIVE_BROWSER "+name);
  } finally {
    await ctx.close();
  }
}
try {
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  browser=await chromium.launch({headless:true});

  await scenario("pending-manual-native-to-receipt",[makeEvent()],{},async page=>{
    const button=page.locator("#btnSyncNow");
    await page.waitForFunction(()=>!document.getElementById("pendingLine")?.hidden,
      null,{timeout:10000});
    assert.equal(await button.isVisible(),true);
    assert.match(await button.innerText(),/Tentar sincronizar ações/);
    await button.click();
    assert.equal(await page.evaluate(()=>window.__riderLab.calls),1);
    assert.match(await page.locator("#syncRequestLine").innerText(),
      /Aguardando confirmação do servidor/);
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
    await page.evaluate(()=>{window.__riderLab.queue[0].state="sent";});
    await page.waitForFunction(()=>!document.getElementById("confirmedLine").hidden,
      null,{timeout:8000});
    assert.match(await page.locator("#confirmedLine").innerText(),
      /O aparelho registrou a confirmação do servidor para 1 ação/);
    assert.equal(await page.locator("#pendingLine").isVisible(),false);
    assert.equal(await button.isVisible(),false);
    assert.equal(await page.locator("#syncRequestLine").isVisible(),false);
  });

  await scenario("initial-sent-never-new-ack",[makeEvent("sent")],{},async page=>{
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
    assert.equal(await page.locator("#btnSyncNow").isVisible(),false);
    assert.equal(await page.locator("#pendingLine").isVisible(),false);
  });

  await scenario("failed-retry-visible-then-refused",[makeEvent("failed")],{},async page=>{
    const button=page.locator("#btnSyncNow");
    await page.waitForFunction(()=>!document.getElementById("pendingLine")?.hidden,
      null,{timeout:10000});
    assert.equal(await button.isVisible(),true);
    assert.match(await page.locator("#pendingLine").innerText(),/sem confirmação/);
    await button.click();
    await page.evaluate(()=>{window.__riderLab.queue[0].state="rejected";});
    await page.waitForFunction(()=>!document.getElementById("rejectedLine").hidden,
      null,{timeout:8000});
    assert.match(await page.locator("#rejectedLine").innerText(),
      /Ação recusada pelo servidor/);
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
    assert.doesNotMatch(await page.locator("body").innerText(),/FICT_SECRET_CLIENT_PAYLOAD/);
  });

  await scenario("invalid-native-read-is-hold",[makeEvent()],{badRead:true},async page=>{
    await page.waitForFunction(()=>!document.getElementById("queueHoldLine").hidden,
      null,{timeout:10000});
    assert.match(await page.locator("#queueHoldLine").innerText(),
      /Não foi possível conferir a fila/);
    assert.equal(await page.locator("#btnSyncNow").isVisible(),false);
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
  });

  await scenario("old-native-no-sync-method",[makeEvent()],{hasSync:false},async page=>{
    await page.waitForFunction(()=>!document.getElementById("pendingLine").hidden,
      null,{timeout:10000});
    assert.equal(await page.locator("#btnSyncNow").isVisible(),false);
  });

  snapshotOffline=true;
  await scenario("offline-facade-cannot-fake-android-sync",[makeEvent()],{},async page=>{
    const button=page.locator("#btnSyncNow");
    await page.waitForFunction(()=>!document.getElementById("pendingLine").hidden,
      null,{timeout:10000});
    assert.equal(await button.isVisible(),true);
    await button.click();
    assert.equal(await page.evaluate(()=>window.__riderLab.calls),1);
    assert.equal(demoConnectionPosts,0);
    assert.match(await page.locator("#pendingLine").innerText(),/sem confirmação/);
  });
  snapshotOffline=false;

  await scenario("sync-bridge-throws-no-ack",[makeEvent()],{throwSync:true},async page=>{
    await page.waitForFunction(()=>!document.getElementById("pendingLine").hidden,
      null,{timeout:10000});
    await page.locator("#btnSyncNow").click();
    assert.equal(await page.evaluate(()=>window.__riderLab.calls),1);
    assert.match(await page.locator("#errorBox").innerText(),
      /Não foi possível solicitar a sincronização no aparelho/);
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
  });

  await scenario("disappearing-record-is-not-server-ack",[makeEvent()],{},async page=>{
    await page.waitForFunction(()=>!document.getElementById("pendingLine").hidden,
      null,{timeout:10000});
    await page.locator("#btnSyncNow").click();
    await page.evaluate(()=>{window.__riderLab.queue=[];});
    await page.waitForFunction(()=>!document.getElementById("syncRequestLine").hidden &&
      document.getElementById("syncRequestLine").textContent.includes("Não foi possível comprovar"),
      null,{timeout:8000});
    assert.equal(await page.locator("#confirmedLine").isVisible(),false);
  });
  console.log("DELIVERYOS_RIDER_NATIVE_SYNC_BROWSER_PASS "+count+"/8 localhost-only no-production");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
