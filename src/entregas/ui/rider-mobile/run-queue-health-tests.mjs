/* Pure fixture and wiring checks for Android queue HOLD. No Android, GPS or network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const source = readFileSync(new URL("queue-health.js", dir), "utf8");
const exported = await import("data:text/javascript;base64," +
  Buffer.from(source).toString("base64"));
const { inspectOperationalEvents, queueHoldMessage,
  QUEUE_READ_BLOCK, QUEUE_WRITE_BLOCK } = exported;
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
console.log("RIDER_NATIVE_QUEUE_HOLD_FIXTURE_PASS "+pass+"/"+pass+
  " (NO_NATIVE_DEVICE_OR_BROWSER)");
