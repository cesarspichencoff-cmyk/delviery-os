import { snapshot, command, chip, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);
let currentHandoff = null;
let seq = 1;
const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

async function refreshList() {
  const snap = await snapshot();
  const list = snap.handoffs || [];
  $("list").innerHTML = list.length
    ? list
        .map(
          (h) => `<div class="item">
      <strong>${h.external_order_ref}</strong> ${chip(h.state)}
      <div class="muted" style="font-size:0.8rem">${h.handoff_id} · verified=${h.courier_verified} · confirmed=${h.confirmed}</div>
    </div>`,
        )
        .join("")
    : `<div class="empty">Nenhum handoff ainda.</div>`;
}

$("btnStart").addEventListener("click", async () => {
  renderError($("errorBox"), null);
  try {
    const hid = `HO-${Date.now().toString(36)}`;
    const res = await command({
      type: "StartHandoff",
      command_id: cid("hs"),
      occurred_at: now(),
      unit_id: "demo-unit",
      handoff_id: hid,
      external_order_ref: $("orderRef").value.trim(),
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) throw new Error(res.result?.error || "falha");
    currentHandoff = hid;
    $("result").textContent = `Handoff iniciado ${hid}. Courier ainda não é usuário do sistema.`;
    await refreshList();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
});

$("btnConfirm").addEventListener("click", async () => {
  renderError($("errorBox"), null);
  if (!currentHandoff) {
    renderError($("errorBox"), "Inicie o handoff primeiro.");
    return;
  }
  try {
    const res = await command({
      type: "ConfirmHandoff",
      command_id: cid("hc"),
      occurred_at: now(),
      unit_id: "demo-unit",
      handoff_id: currentHandoff,
      conference_actor: $("confActor").value.trim(),
      handoff_actor: $("handActor").value.trim(),
      courier_verified: $("verified").checked,
      courier_verification_method: $("method").value,
      external_courier_ref: $("courierRef").value.trim() || undefined,
      volumes: {
        expected: Number($("volExp").value),
        delivered: Number($("volDel").value),
      },
      order_identified: $("orderOk").checked,
      printed_entregador_field: "3004 - DELIVERY (ignorado para rider)",
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) {
      renderError($("errorBox"), res.result?.error || "Rejeitado");
    } else {
      $("result").textContent =
        "Handoff confirmado. Responsabilidade física da loja encerrada. Sem Trip. Sem GPS do courier.";
    }
    await refreshList();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
});

refreshList().catch(() => {});
