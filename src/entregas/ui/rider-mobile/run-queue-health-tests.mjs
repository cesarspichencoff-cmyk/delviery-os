/* Pure fixture and wiring checks for Android queue HOLD. No Android, GPS or network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const source = readFileSync(new URL("queue-health.js", dir), "utf8");
const exported = await import("data:text/javascript;base64," +
  Buffer.from(source).toString("base64"));
const { inspectOperationalEvents, queueHoldMessage,
  QUEUE_READ_BLOCK, QUEUE_WRITE_BLOCK,
  queuedOperationalActionsMessage, rejectedOperationalActionMessage,
  canRequestNativeQueueSync, confirmedNativeQueueTransition } = exported;
let pass = 0;
function test(label, fn) {
  fn();
  pass++;
  console.log("OK " + label);
}
const ev = {event_id:"evt-fixture",kind:"ConfirmDelivery",
  state:"pending",sequence_local:1};
test("empty native Room queue is valid, not a read failure", () => {
  assert.deepEqual(inspectOperationalEvents([]),
    {ok:true,events:[],code:null});
});
test("pending Room event remains observable", () => {
  const r=inspectOperationalEvents([ev]);
  assert.equal(r.ok,true);
  assert.equal(r.events[0].event_id,ev.event_id);
});
test("all established Room states are classified", () => {
  for(const state of ["pending","failed","sending","sent","rejected"])
    assert.equal(inspectOperationalEvents([{...ev,state}]).ok,true);
});
test("native parse failure never becomes empty trusted queue", () => {
  for(const value of [null,undefined,{},false,"[]",17])
    assert.equal(inspectOperationalEvents(value).code,QUEUE_READ_BLOCK);
});
test("unknown Room state is fail-closed", () => {
  assert.equal(inspectOperationalEvents([{...ev,state:"synced"}]).ok,false);
});
test("invalid event identity is not trusted", () => {
  assert.equal(inspectOperationalEvents([{...ev,event_id:""}]).ok,false);
});
test("invalid sequence is not trusted", () => {
  assert.equal(inspectOperationalEvents([{...ev,sequence_local:-1}]).ok,false);
  assert.equal(inspectOperationalEvents([{...ev,sequence_local:1.3}]).ok,false);
});
test("oversized response is rejected to prevent misleading partial trust", () => {
  const all=Array.from({length:1001},(_,i)=>({...ev,event_id:"e"+i}));
  assert.equal(inspectOperationalEvents(all).ok,false);
});
test("read HOLD does not invent a successful save", () => {
  const msg=queueHoldMessage(QUEUE_READ_BLOCK);
  assert.match(msg,/bloquead/i);
  assert.doesNotMatch(msg,/foi salv|enviado com sucesso/i);
});
test("write HOLD says explicitly that the action is unconfirmed", () => {
  const msg=queueHoldMessage(QUEUE_WRITE_BLOCK);
  assert.match(msg,/NÃO foi confirmada/i);
  assert.match(msg,/responsável/i);
});
test("unknown code does not invent a warning", () => {
  assert.equal(queueHoldMessage("SOMETHING_ELSE"),"");
});
test("pending is stored locally, never represented as server receipt", () => {
  const s=queuedOperationalActionsMessage([ev]);
  assert.match(s,/1 ação guardada/);
  assert.match(s,/sem confirmação do servidor/);
  assert.doesNotMatch(s,/entregue|confirmad[ao] pelo servidor/i);
});
test("sending is in flight, not necessarily received or accepted", () => {
  const s=queuedOperationalActionsMessage([{...ev,state:"sending"}]);
  assert.match(s,/Envio em andamento/);
  assert.match(s,/ainda não chegou ao aparelho/);
});
test("failed after HTTP 403, 409 and 422 never claims request did not reach server", () => {
  for(const code of [403,409,422]) {
    const s=queuedOperationalActionsMessage([{
      ...ev,state:"failed",last_error:`HTTP ${code}: token FICT_SECRET e cliente FICT_PERSON`,
    }]);
    assert.match(s,/pode ter chegado até ele/);
    assert.match(s,/Não repita a confirmação sem verificar/);
    assert.doesNotMatch(s,/não chegou ao servidor|FICT_SECRET|FICT_PERSON|HTTP 403|HTTP 409|HTTP 422/i);
  }
});
test("mixed pending and failed uses failure warning and exact local count", () => {
  const s=queuedOperationalActionsMessage([ev,{...ev,event_id:"evt-2",sequence_local:2,state:"failed"}]);
  assert.match(s,/2 ações guardadas/);
  assert.match(s,/Há tentativa sem confirmação do servidor/);
  assert.doesNotMatch(s,/aguardando envio/);
});
test("terminal sent and rejected are not miscounted as pending", () => {
  assert.equal(queuedOperationalActionsMessage([{...ev,state:"sent"}]),"");
  assert.equal(queuedOperationalActionsMessage([{...ev,state:"rejected"}]),"");
});
test("malformed native queue is not presented as empty successful queue", () => {
  assert.equal(queuedOperationalActionsMessage(null),"");
  assert.equal(queuedOperationalActionsMessage([{...ev,state:"unknown"}]),"");
});
test("terminal rejection remains visible without disclosing untrusted error text", () => {
  const s=rejectedOperationalActionMessage({
    ...ev,state:"rejected",last_error:"dominio_recusou: FICT_PRIVATE_SENTINEL TOKEN_ABCDE endereço do cliente",
  });
  assert.match(s,/Ação recusada pelo servidor/);
  assert.match(s,/responsável/);
  for(const v of ["FICT_PRIVATE_SENTINEL","TOKEN_ABCDE","endereço do cliente","dominio_recusou"])
    assert.equal(s.includes(v),false);
  assert.equal(rejectedOperationalActionMessage({...ev,state:"failed",last_error:"403"}),"");
});

test("native manual sync requires a valid open Room record and real bridge method",()=>{
  assert.equal(canRequestNativeQueueSync([ev],true),true);
  for (const state of ["pending","failed","sending"])
    assert.equal(canRequestNativeQueueSync([{...ev,state}],true),true);
  for (const state of ["sent","rejected"])
    assert.equal(canRequestNativeQueueSync([{...ev,state}],true),false);
  for (const invalid of [null,{},[{...ev,state:"unknown"}],[]])
    assert.equal(canRequestNativeQueueSync(invalid,true),false);
  assert.equal(canRequestNativeQueueSync([ev],false),false);
  assert.equal(canRequestNativeQueueSync([ev],undefined),false);
});
test("first sight of already sent event never announces a fresh server receipt",()=>{
  assert.equal(confirmedNativeQueueTransition(null,[{...ev,state:"sent"}]),"");
  assert.equal(confirmedNativeQueueTransition([], [{...ev,state:"sent"}]),"");
});
test("exact local identity pending to sent yields one receipt notice",()=>{
  const text=confirmedNativeQueueTransition([ev],[{...ev,state:"sent"}]);
  assert.match(text,/O aparelho registrou a confirmação do servidor para 1 ação/);
  assert.doesNotMatch(text,/entrega fisica|entrega concluida/i);
});
test("failed or sending to sent also counts exact receipt, but never a rejection",()=>{
  for (const start of ["failed","sending"]) {
    assert.match(confirmedNativeQueueTransition([{...ev,state:start}],
      [{...ev,state:"sent"}]),/1 ação/);
  }
  assert.equal(confirmedNativeQueueTransition([ev],[{...ev,state:"rejected"}]),"");
  assert.equal(confirmedNativeQueueTransition([ev],[]),"");
});
test("different event id or sequence cannot borrow another receipt",()=>{
  assert.equal(confirmedNativeQueueTransition([ev],[{...ev,event_id:"other",state:"sent"}]),"");
  assert.equal(confirmedNativeQueueTransition([ev],[{...ev,sequence_local:7,state:"sent"}]),"");
  assert.equal(confirmedNativeQueueTransition([ev],[{...ev,state:"failed"}]),"");
});
test("duplicate native identities and malformed reads never certify a receipt",()=>{
  assert.equal(confirmedNativeQueueTransition([ev,ev],[{...ev,state:"sent"}]),"");
  assert.equal(confirmedNativeQueueTransition([ev],[{...ev,state:"sent"},{...ev,state:"sent"}]),"");
  assert.equal(confirmedNativeQueueTransition([ev],null),"");
  assert.equal(confirmedNativeQueueTransition(null,[ev]),"");
});
test("only proven transitioned event IDs are counted in mixed queue",()=>{
  const second={...ev,event_id:"evt-fixture-2",sequence_local:2};
  const text=confirmedNativeQueueTransition([ev,second],
    [{...ev,state:"sent"},{...second,state:"failed"}]);
  assert.match(text,/1 ação/);
  assert.doesNotMatch(text,/2 ações/);
});
const scopeSource = readFileSync(new URL("rider-trip-scope.js",dir),"utf8");
const { selectActiveRiderTrip } = await import("data:text/javascript;base64," +
  Buffer.from(scopeSource).toString("base64"));
const rider = id => ({role:"motoboy_interno",actor_id:id});
const trip = (id,owner,state="em_rota") => ({
  trip_id:id,courier_actor_id:owner,state,deliveries:[],
});
const own=trip("t-2","rider-2");
const foreign=trip("t-1","rider-1");
test("identity missing never reveals first trip from wide snapshot",()=>{
  assert.equal(selectActiveRiderTrip({trips:[foreign,own]}),null);
});
test("confirmed motoboy sees only own active trip",()=>{
  assert.equal(selectActiveRiderTrip({actor:rider("rider-2"),trips:[foreign,own]}),own);
});
test("non-motoboy actor cannot select a trip",()=>{
  assert.equal(selectActiveRiderTrip({actor:{role:"gerente",actor_id:"rider-1"},trips:[foreign]}),null);
});
test("native session conflict blocks even valid-looking snapshot",()=>{
  assert.equal(selectActiveRiderTrip({actor:rider("rider-2"),trips:[foreign,own]},rider("rider-1")),null);
});
test("native session can identify rider when snapshot has no actor",()=>{
  assert.equal(selectActiveRiderTrip({trips:[foreign,own]},rider("rider-2")),own);
});
test("native non-rider session blocks otherwise valid snapshot",()=>{
  assert.equal(selectActiveRiderTrip({actor:rider("rider-2"),trips:[own]},
    {role:"gerente",actor_id:"rider-2"}),null);
});
test("blank identity and malformed trips fail closed",()=>{
  assert.equal(selectActiveRiderTrip({actor:rider(" "),trips:[foreign]}),null);
  assert.equal(selectActiveRiderTrip({actor:rider("rider-2"),trips:"wrong"}),null);
});
test("completed, foreign and malformed trips are never selected",()=>{
  assert.equal(selectActiveRiderTrip({actor:rider("rider-2"),
    trips:[trip("done","rider-2","entregue"),foreign,null]}),null);
});
const ui=readFileSync(new URL("rider.js",dir),"utf8");
test("live rider page uses same fail-closed identity selector",()=>{
  assert.match(ui,/import \{ selectActiveRiderTrip \} from "\.\/rider-trip-scope\.js"/);
  assert.match(ui,/return selectActiveRiderTrip\(snap, cap\.me\)/);
});
const html=readFileSync(new URL("index.html",dir),"utf8");
const gpsReviewSource=readFileSync(new URL("gps-review-status.js",dir),"utf8");
const {gpsReviewNotice}=await import("data:text/javascript;base64,"+
  Buffer.from(gpsReviewSource).toString("base64"));
test("GPS held count is displayed without claiming a server receipt",()=>{
  for(const count of [1,3]){
    const r=gpsReviewNotice({pending_points:count+2,gps_review_required_points:count});
    assert.equal(r.kind,"held");
    assert.equal(r.message.startsWith(String(count)+" registro"),true);
    assert.match(r.message,/envio automático.*suspenso/);
    assert.doesNotMatch(r.message,/entregue|confirmad|sincronizado|longitude|latitude/i);
  }
});
test("GPS zero count clears notice, not a new server ACK",()=>{
  assert.deepEqual(gpsReviewNotice({pending_points:2,gps_review_required_points:0}),
    {kind:"clear",message:""});
});
test("older native Android bridge does not fabricate zero",()=>{
  assert.deepEqual(gpsReviewNotice({pending_points:5}),
    {kind:"unsupported",message:""});
});
test("malformed native GPS review count never appears as healthy",()=>{
  const invalid=[null,"{}",false,[],{pending_points:1,gps_review_required_points:2},
    {pending_points:1,gps_review_required_points:-1},
    {pending_points:1,gps_review_required_points:1.2},
    {pending_points:1,gps_review_required_points:"1"},
    {pending_points:NaN,gps_review_required_points:1},
    {pending_points:1,gps_review_required_points:Infinity},
    {pending_points:0,gps_review_required_points:1},
    {pending_points:1,gps_review_required_points:true}];
  for(const value of invalid){
    const r=gpsReviewNotice(value);
    assert.equal(r.kind,"unavailable");
    assert.match(r.message,/Não foi possível conferir/);
  }
});
test("GPS aggregate notice omits coordinates, raw errors, and identities",()=>{
  const raw={pending_points:10,gps_review_required_points:2,
    latitude:12.3456,longitude:65.4321,last_error:"TOKEN_DE_TESTE",
    payload:"<script>alert('x')</script>",point_id:"PRIVATE-001"};
  const notice=gpsReviewNotice(raw);
  assert.equal(notice.kind,"held");
  for(const secret of ["12.3456","65.4321","TOKEN_DE_TESTE","<script>","PRIVATE-001"])
    assert.equal(notice.message.includes(secret),false);
});
test("real rider page wires native GPS review, not network or manual release",()=>{
  assert.match(html,/id="gpsReviewLine"[^>]*role="alert"[^>]*hidden/);
  assert.match(ui,/import \{ gpsReviewNotice \} from "\.\/gps-review-status\.js"/);
  assert.match(ui,/notice = gpsReviewNotice\(native\.status\(\)\)/);
  assert.match(ui,/if \(line\.textContent !== notice\.message\) line\.textContent = notice\.message/);
  assert.match(ui,/line\.hidden = !notice\.message/);
  assert.match(ui,/function renderCapture\(t, d\) \{\s*renderGpsReview\(\)/);
  assert.doesNotMatch(gpsReviewSource,/fetch\(|XMLHttpRequest|navigator\.geolocation|innerHTML/);
});
test("real rider page imports HOLD classifier and keeps native queue gate", () => {
  assert.match(ui,/from "\.\/queue-health\.js"/);
  assert.match(ui,/cap\.policies\.flags\.offline_queue_enabled === true/);
});
test("native read failure creates HOLD, never silently guesses [] as valid", () => {
  assert.match(ui,/inspectOperationalEvents\(native\.operationalEvents\(\)\)/);
  assert.match(ui,/queueHold = QUEUE_READ_BLOCK/);
});
test("recording refusal latches write HOLD and blocks repeated commands", () => {
  assert.match(ui,/queueHold = QUEUE_WRITE_BLOCK/);
  assert.match(ui,/if \(queueHold\) \{[\s\S]*?throw new Error\(queueHoldMessage\(queueHold\)\)/);
});
test("native write receipt is checked via the pure identity guard", () => {
  assert.match(ui,/verifiedNativeQueueReceipt\(r, event_id\)/);
});
test("native write accepts exact identity and new Room entry", () => {
  assert.equal(exported.verifiedNativeQueueReceipt({
    ok: true, event_id: "e-1", duplicate: false, state: "pending"
  }, "e-1"), true);
});
test("native write rejects success without event identity", () => {
  assert.equal(exported.verifiedNativeQueueReceipt({
    ok: true, duplicate: false, state: "pending"
  }, "e-1"), false);
});
test("native write rejects identity collision and duplicate echo", () => {
  for (const r of [
    {ok:true,event_id:"another",duplicate:false},
    {ok:true,event_id:"e-1",duplicate:true},
    {ok:true,event_id:"e-1",duplicate:"false"},
  ]) assert.equal(exported.verifiedNativeQueueReceipt(r,"e-1"),false);
});
test("native write rejects uncertain or terminal receipts", () => {
  for (const r of [null,false,{ok:false,event_id:"e-1",duplicate:false},
    {ok:true,event_id:"e-1",duplicate:false,state:"rejected"}])
      assert.equal(exported.verifiedNativeQueueReceipt(r,"e-1"),false);
});

test("native manual sync uses bridge instead of demo connection and makes ACK visible only on transition",()=>{
  const bridge=readFileSync(new URL("native-bridge.js",dir),"utf8");
  assert.match(bridge,/syncNow: typeof n\.syncNow === "function" \? \(\) => n\.syncNow\(\) : null/);
  assert.match(ui,/if \(nativeFound\.present\) \{/);
  assert.match(ui,/native\.syncNow\(\)/);
  assert.match(ui,/confirmedNativeQueueTransition\(lastValidQueue, events\)/);
  assert.match(ui,/manualSyncRequested = true/);
  assert.match(ui,/nativeFound\.present \|\| !offline/);
  const html=readFileSync(new URL("index.html",dir),"utf8");
  assert.match(html,/id="syncRequestLine"/);
  assert.match(html,/id="confirmedLine"/);
});
test("live rider UI uses safe queue and rejection messages, never raw HTTP error", () => {
  assert.match(ui,/queuedOperationalActionsMessage\(events\)/);
  assert.match(ui,/rejectedOperationalActionMessage\(recusa\)/);
  assert.doesNotMatch(ui,/última tentativa não chegou ao servidor/);
  assert.doesNotMatch(ui,/String\(recusa\.last_error/);
});
test("page has accessible alert independent of the server rejection", () => {
  assert.match(html,/id="queueHoldLine"[^>]*role="alert"/);
  assert.match(html,/id="rejectedLine"[^>]*role="alert"/);
  assert.match(ui,/hold\.textContent = queueHoldMessage\(queueHold\)/);
});
test("rider controls become disabled on HOLD without waiting for a refresh", () => {
  assert.match(ui,/function blockQueueActionsImmediately\(\)/);
  assert.match(ui,/renderDeviceQueue\(activeTrip\(\)\);\s*blockQueueActionsImmediately\(\);/);
});
test("route action remains available when only local write is held", () => {
  assert.match(ui,/primary\.disabled = blocked && primary\.textContent !== "Abrir rota"/);
  assert.match(ui,/secondary\.disabled = blocked/);
});
// Rendering safety in the same real UI source that owns the Android bridge.
const clientSource = readFileSync(new URL("../shared/client.js", dir), "utf8");
const client = await import("data:text/javascript;base64," +
  Buffer.from(clientSource).toString("base64"));
test("untrusted order references are text, never executable HTML", () => {
  const forged = 'P-<img src=x onerror="window.__attack=1">&\'';
  const escaped = client.escapeHtml(forged);
  assert.equal(escaped, 'P-&lt;img src=x onerror=&quot;window.__attack=1&quot;&gt;&amp;&#39;');
  assert.doesNotMatch(escaped, /<img|<script|onerror="/i);
  assert.match(ui, /escapeHtml\(d\.order_ref\)/);
  assert.match(ui, /escapeHtml\(s\.order_ref\)/);
  assert.match(ui, /escapeHtml\(d\.planned_stop_order\)/);
});
test("unknown server status is escaped inside shared HTML chip", () => {
  const markup = client.chip('<svg onload="window.__attack=1">');
  assert.match(markup, /&lt;svg/);
  assert.doesNotMatch(markup, /<svg|onload="/i);
  // Inherited object keys are not legitimate states and must not crash UI.
  for (const inherited of ["__proto__", "constructor", "toString"]) {
    const rendered = client.chip(inherited);
    assert.ok(rendered.includes(inherited));
    assert.match(rendered, /class="chip neutral"/);
  }
});
test("rider CSP forbids inline scripts and nested frames", () => {
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /script-src-attr 'none'/);
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/i);
});
// This is the same pure function imported and executed by rider.js before
// any native Room write. It must reject mismatched field identities.
{
const guardSource = readFileSync(new URL("rider-command-context.js", dir), "utf8");
const { riderCommandContext } = await import("data:text/javascript;base64," +
  Buffer.from(guardSource).toString("base64"));
const actor = { actor_id: "rider-itaim-lab", role: "motoboy_interno" };
const trip = { trip_id: "LAB_TRIP_ITAIM", courier_actor_id: actor.actor_id };
const authenticated = {
  nativePresent: true,
  nativeAvailable: true,
  snapshot: { unit_id: "ITAIM", actor: { ...actor }, trips: [{ ...trip }] },
  sessionActor: { ...actor },
  trip: { ...trip },
};
test("actual native guard accepts only assigned authenticated Itaim rider", () => {
  assert.deepEqual(riderCommandContext(authenticated), {
    unit_id: "ITAIM", actor,
  });
  assert.match(ui, /import \{ riderCommandContext \} from "\.\/rider-command-context\.js"/);
  assert.match(ui, /function commandContext\(trip\) \{\s*return riderCommandContext\(/);
  assert.equal((ui.match(/\.\.\.commandContext\(t\)/g) || []).length, 5);
});
test("native identity guard rejects every other unit", () => {
  for (const unit_id of ["MOOCA", "PINHEIROS", "demo-unit", "", null]) {
    assert.throws(() => riderCommandContext({
      ...authenticated,
      snapshot: { ...authenticated.snapshot, unit_id },
    }), /confirmar sua unidade e viagem/);
  }
});
test("native identity guard rejects session actor or role mismatch", () => {
  const variants = [
    null,
    { actor_id: "rider-intruso", role: "motoboy_interno" },
    { actor_id: actor.actor_id, role: "admin" },
    { actor_id: " " + actor.actor_id, role: "motoboy_interno" },
    { actor_id: "", role: "motoboy_interno" },
  ];
  for (const sessionActor of variants)
    assert.throws(() => riderCommandContext({ ...authenticated, sessionActor }),
      /confirmar sua unidade e viagem/);
  for (const actorOverride of [
    null, { actor_id: "outro", role: "motoboy_interno" },
    { actor_id: actor.actor_id, role: "admin" },
  ]) {
    assert.throws(() => riderCommandContext({
      ...authenticated,
      snapshot: { ...authenticated.snapshot, actor: actorOverride },
    }), /confirmar sua unidade e viagem/);
  }
});
test("native identity guard rejects another rider's trip and missing trip", () => {
  for (const variant of [
    null,
    { trip_id: "LAB_TRIP_ITAIM", courier_actor_id: "outro" },
    { trip_id: "LAB_TRIP_OUTRO", courier_actor_id: actor.actor_id },
    { trip_id: "", courier_actor_id: actor.actor_id },
  ]) assert.throws(() => riderCommandContext({
    ...authenticated, trip: variant,
  }), /confirmar sua unidade e viagem/);
  for (const trips of [
    [], null,
    [{ trip_id: "LAB_TRIP_ITAIM", courier_actor_id: "outro" }],
    [{ trip_id: "LAB_TRIP_OUTRO", courier_actor_id: actor.actor_id }],
  ]) assert.throws(() => riderCommandContext({
    ...authenticated, snapshot: { ...authenticated.snapshot, trips },
  }), /confirmar sua unidade e viagem/);
});
test("native identity guard rejects bridge unavailability without demo fallback", () => {
  assert.throws(() => riderCommandContext({
    ...authenticated, nativeAvailable: false,
  }), /confirmar sua unidade e viagem/);
  assert.deepEqual(riderCommandContext({
    ...authenticated, nativePresent: false, nativeAvailable: false,
  }), {
    unit_id: "demo-unit",
    actor: { actor_id: "rid-demo", role: "motoboy_interno" },
  });
});
}
console.log("RIDER_NATIVE_QUEUE_HOLD_FIXTURE_PASS "+pass+"/"+pass+
  " (NO_NATIVE_DEVICE_OR_BROWSER)");
