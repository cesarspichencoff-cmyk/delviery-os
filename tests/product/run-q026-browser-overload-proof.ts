/**
 * Q-026 browser evidence (real Chromium) on actual Product System server.
 * No deployment: local HTTP, isolated PostgreSQL16 and fictional devices.
 * Test UI's 503 behavior when backpressure occurs during a reload.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { chromium, type Browser } from "playwright";
import { bancoIsolado } from "../../src/platform/banco-isolado";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_BROWSER_PG_REQUIRED");process.exit(78)}
void(async()=>{
 const db=await bancoIsolado(url,undefined,"q026browser");
 let server:http.Server|null=null;
 let browser:Browser|null=null;
 let releaseLock:()=>void=()=>undefined;
 let locked:Promise<unknown>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at) "+
   "VALUES ('Q026-UI-PHONE','ITAIM','Aparelho de teste Q026','2026-10-09T00:00:00Z','2026-10-09T00:00:00Z')");
  const insert=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-ui-'||g,'ITAIM','trip','Q026-UI-TRIP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-10T18:00:00Z'+(g*interval '0.1 second'),",
   "TIMESTAMPTZ '2026-10-10T18:00:00Z'+(g*interval '0.1 second'),",
   "'device','q026-ui-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-UI-PHONE','trusted'",
   "FROM generate_series(1,2000) g"
  ].join(" ");
  await db.cliente.query(insert);
  process.env.DELIVERYOS_DATABASE_URL=db.url;
  process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS="3000";
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="1";
  process.env.DELIVERYOS_ENTREGAS_INCREMENTAL_RR="1";
  const { criarServidor }=await import("../../tools/product_system_server");
  server=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve);
  });
  const addr=server.address();assert.ok(addr&&typeof addr!=="string");
  const root=`http://127.0.0.1:${addr.port}`;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  const statuses:number[]=[];
  page.on("response",res=>{if(res.url().includes("/api/entregas"))statuses.push(res.status())});
  await page.goto(root+"/#/entregas",{waitUntil:"networkidle"});
  const original=page.locator('[data-territorio="rua"][data-lida-as]');
  await original.waitFor({timeout:15000});
  const originalTime=await original.getAttribute("data-lida-as");
  assert.ok(originalTime,"real initial reading missing its timestamp");
  assert.ok((await page.locator("#superficie").innerText()).includes("Aparelho de teste Q026"),
   "real device not rendered in browser");
  await page.screenshot({path:"q026-browser-before.png",fullPage:true});

  // A separate PG session blocks the SELECT in the guarded GET but leaves
  // server health + static assets responsive.
  let lockStarted:()=>void=()=>undefined;
  const entered=new Promise<void>(resolve=>{lockStarted=resolve});
  const gate=new Promise<void>(resolve=>{releaseLock=resolve});
  locked=db.cliente.transaction(async tx=>{
   await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
   lockStarted();await gate;
  });
  await entered;
  await page.locator('[data-territorio="rua"] [data-reler]').first().click();
  await page.waitForFunction(()=>{
   const aviso=document.querySelector('[data-territorio="rua"] [data-releitura]');
   return Boolean(aviso?.textContent?.includes("temporariamente ocupada"));
  },undefined,{timeout:15000});
  const oldAfter=page.locator('[data-territorio="rua"][data-lida-as]');
  assert.equal(await oldAfter.getAttribute("data-lida-as"),originalTime,
    "failed reload erased the timestamp of the previous reading");
  const aviso=await page.locator('[data-territorio="rua"] [data-releitura]').innerText();
  assert.match(aviso,/temporariamente ocupada/i);
  assert.match(aviso,/leitura anterior continua visível/i);
  assert.ok((await page.locator("#superficie").innerText()).includes("Aparelho de teste Q026"),
   "failed reload erased the previous real device");
  assert.equal(await page.locator('[data-territorio="rua"] [data-reler]').first().getAttribute("aria-disabled"),null,
    "reload control remained disabled after 503");
  await page.screenshot({path:"q026-browser-overloaded-preserved.png",fullPage:true});
  console.log("Q026_BROWSER_STALE_READING_503_PASS "+JSON.stringify({
   chromium:true,initial_status:statuses[0],refresh_503:statuses.includes(503),
   old_timestamp_preserved:true,device_still_visible:true,
   polite_status_text:true,reload_control_reenabled:true
  }));
  assert.ok(statuses.includes(503),"actual browser did not observe a 503");

  const context2=await browser.newContext({viewport:{width:375,height:812}});
  const first=await context2.newPage();
  const firstStatuses:number[]=[];
  first.on("response",res=>{if(res.url().includes("/api/entregas"))firstStatuses.push(res.status())});
  // A blocked PostgreSQL read can delay background fetches during initial load.
  // DOM readiness is independent of API completion; wait for the actual UI state below.
  await first.goto(root+"/#/entregas",{waitUntil:"domcontentloaded"});
  await first.waitForFunction(()=>{
   return document.querySelector("#superficie")?.textContent?.includes("Leitura temporariamente ocupada");
  },undefined,{timeout:15000});
  const initialFailure=await first.locator("#superficie").innerText();
  assert.match(initialFailure,/Não foi possível consultar os dados atuais|Nao foi possivel consultar os dados atuais/);
  assert.ok(!initialFailure.includes("zero entregas"),"initial failure was mislabeled as no deliveries");
  assert.ok(firstStatuses.includes(503),"first load under lock not reported as 503");
  await first.screenshot({path:"q026-browser-first-load-503-mobile.png",fullPage:true});
  await context2.close();

  releaseLock();await locked;
  const recoveredResponse=page.waitForResponse(res=>
    res.url().includes("/api/entregas")&&res.status()===200,{timeout:15000});
  await page.locator('[data-territorio="rua"] [data-reler]').first().click();
  await recoveredResponse;
  await page.locator('[data-territorio="rua"][data-lida-as]').waitFor({timeout:15000});
  assert.ok((await page.locator("#superficie").innerText()).includes("Aparelho de teste Q026"));
  await page.screenshot({path:"q026-browser-recovered.png",fullPage:true});
  console.log("Q026_BROWSER_503_FIRST_LOAD_AND_RECOVERY_PASS "+JSON.stringify({
    mobile_initial_503:true,no_false_zero:true,after_pg_unlock_http_200:true,
    prior_device_returned:true,screenshots:4,
    proof_boundary:"Playwright Chromium in CI, disposable PG16, not field device or production"
  }));
 }finally{
  releaseLock();
  if(locked)await locked.catch(()=>undefined);
  if(browser)await browser.close();
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await db.descartar();
 }
})().catch(e=>{console.error("Q026_BROWSER_OVERLOAD_FAILED",e);process.exitCode=1});
