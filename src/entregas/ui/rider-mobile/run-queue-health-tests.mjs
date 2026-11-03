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
const ui=readFileSync(new URL("rider.js",dir),"utf8");
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
test("page has accessible alert independent of the server rejection", () => {
  assert.match(html,/id="queueHoldLine"[^>]*role="alert"/);
  assert.match(html,/id="rejectedLine"[^>]*role="alert"/);
  assert.match(ui,/hold\.textContent = queueHoldMessage\(queueHold\)/);
});
test("route action remains available when only local write is held", () => {
  assert.match(ui,/primary\.disabled = blocked && primary\.textContent !== "Abrir rota"/);
  assert.match(ui,/secondary\.disabled = blocked/);
});
console.log("RIDER_NATIVE_QUEUE_HOLD_FIXTURE_PASS "+pass+"/"+pass+
  " (NO_NATIVE_DEVICE_OR_BROWSER)");
