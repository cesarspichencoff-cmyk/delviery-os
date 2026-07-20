import { snapshot, command, chip, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);
let currentExpedition = null;
let seq = 1;
const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

/**
 * Requisitos de liberação (espelham o domínio + conferência física na UI).
 * Não persiste perfil do entregador externo.
 */
function missingRequirements() {
  const missing = [];
  if (!currentExpedition) missing.push("iniciar a expedição do pedido");
  if (!$("orderOk").checked) missing.push("pedido identificado e correto");
  if (!$("verified").checked) missing.push("entregador verificado");
  if (!$("method").value.trim()) missing.push("método de verificação");
  const exp = Number($("volExp").value);
  const del = Number($("volDel").value);
  if (!(exp >= 1)) missing.push("volumes esperados (≥ 1)");
  if (del !== exp) missing.push("volumes conferidos iguais aos esperados");
  if (!$("physicalOk").checked) missing.push("conferência física");
  if (!$("confActor").value.trim()) missing.push("responsável pela conferência");
  if (!$("handActor").value.trim()) missing.push("quem faz a liberação física");
  return missing;
}

function updateReleaseGate() {
  const missing = missingRequirements();
  const btn = $("btnConfirm");
  const box = $("pendingBox");
  if (missing.length === 0) {
    btn.disabled = false;
    box.classList.add("ready");
    box.textContent = "Tudo certo. Você pode liberar o pedido.";
  } else {
    btn.disabled = true;
    box.classList.remove("ready");
    box.textContent = "Para liberar, ainda falta: " + missing.join(" · ") + ".";
  }
}

async function refreshList() {
  const snap = await snapshot();
  const list = snap.handoffs || [];
  $("list").innerHTML = list.length
    ? list
        .map(
          (h) => `<div class="item">
      <strong>${h.external_order_ref}</strong> ${chip(h.state)}
      <div class="meta">${h.courier_verified ? "Entregador verificado" : "Sem verificação"}
        ${h.confirmed ? " · liberado" : ""}</div>
    </div>`,
        )
        .join("")
    : `<div class="empty">Nenhuma expedição ainda.</div>`;
}

[
  "orderOk",
  "verified",
  "method",
  "volExp",
  "volDel",
  "physicalOk",
  "confActor",
  "handActor",
  "orderRef",
].forEach((id) => {
  const el = $(id);
  el.addEventListener("input", updateReleaseGate);
  el.addEventListener("change", updateReleaseGate);
});

$("btnStart").addEventListener("click", async () => {
  renderError($("errorBox"), null);
  $("result").hidden = true;
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
    currentExpedition = hid;
    $("sessionLine").textContent = `Expedição em andamento para ${$("orderRef").value.trim()}.`;
    updateReleaseGate();
    await refreshList();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
});

$("btnConfirm").addEventListener("click", async () => {
  renderError($("errorBox"), null);
  $("result").hidden = true;
  const missing = missingRequirements();
  if (missing.length) {
    renderError($("errorBox"), "Ainda falta: " + missing.join(", "));
    return;
  }
  try {
    const ref = $("courierRef").value.trim();
    const res = await command({
      type: "ConfirmHandoff",
      command_id: cid("hc"),
      occurred_at: now(),
      unit_id: "demo-unit",
      handoff_id: currentExpedition,
      conference_actor: $("confActor").value.trim(),
      handoff_actor: $("handActor").value.trim(),
      courier_verified: true,
      courier_verification_method: $("method").value,
      // ref opcional só do ato — sem perfil/histórico/PII desnecessária
      external_courier_ref: ref || undefined,
      volumes: {
        expected: Number($("volExp").value),
        delivered: Number($("volDel").value),
      },
      order_identified: true,
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) {
      renderError($("errorBox"), res.result?.error || "Rejeitado");
    } else {
      $("result").hidden = false;
      $("result").textContent =
        "Expedição concluída. O andamento posterior é acompanhado pelo canal do iFood.";
      currentExpedition = null;
      $("sessionLine").textContent = "Expedição concluída. Inicie outra se precisar.";
      updateReleaseGate();
    }
    await refreshList();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
});

updateReleaseGate();
refreshList().catch(() => {});
