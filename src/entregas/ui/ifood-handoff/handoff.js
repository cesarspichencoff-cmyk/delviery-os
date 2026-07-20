/**
 * Expedição iFood — experiência operacional de retirada.
 * Domínio: StartHandoff / ConfirmHandoff via ApplicationService.
 * UI não pede conferência de itens ao entregador externo.
 * Não cria perfil, histórico ou cadastro do motoboy do iFood.
 */
import { snapshot, command, chip, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);

/** @typedef {'ready'|'fetching'|'waiting_rider'|'checking'|'done'} Stage */

let stage = /** @type {Stage} */ ("ready");
let currentExpedition = null;
let seq = 1;
const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

function loadOrder() {
  try {
    return JSON.parse($("demoOrder").textContent || "{}");
  } catch {
    return {
      local_number: "8640",
      customer_name: "Marina Alves",
      ifood_code: "4821",
      bags: 2,
      ready_at: "19:42",
      platform_order_ref: "IF-9001",
      rider_display_name: "Lucas",
    };
  }
}

const order = loadOrder();

function riderNameAvailable() {
  return !$("toggleNoRiderName").checked && !!order.rider_display_name;
}

function bagsLabel() {
  const n = Number(order.bags) || 0;
  return n === 1 ? "1 sacola" : `${n} sacolas`;
}

function fillOrderSheet() {
  $("dispOrderNum").textContent = `Pedido #${order.local_number}`;
  $("dispCustomerName").textContent = order.customer_name;
  $("dispIfoodCode").textContent = order.ifood_code;
  $("dispBags").textContent = bagsLabel();
  $("dispReadyAt").textContent = order.ready_at;
  $("lblBags").textContent = bagsLabel();

  if (riderNameAvailable()) {
    $("dispRiderName").textContent = order.rider_display_name;
    $("dispRiderHint").textContent = "Nome exibido pelo iFood";
    $("dispRiderHint").hidden = false;
    $("checkRiderName").textContent = order.rider_display_name;
    $("checkRiderHint").textContent = "Informação exibida pelo iFood";
  } else {
    $("dispRiderName").textContent = "Nome do entregador não informado pelo iFood";
    $("dispRiderHint").textContent =
      "Confirme pelo número do pedido e pelo código apresentado.";
    $("dispRiderHint").hidden = false;
    $("checkRiderName").textContent = "Nome não informado pelo iFood";
    $("checkRiderHint").textContent =
      "Confirme pelo número do pedido e pelo código apresentado.";
  }
}

/**
 * Requisitos da UI (liberação).
 * Nome do entregador externo NÃO é obrigatório.
 * Mapeia para o domínio sem jargão na interface.
 */
function missingRequirements() {
  const missing = [];
  if (stage !== "checking" && stage !== "done") {
    missing.push("pedido em mãos e entregador na porta");
  }
  if (!currentExpedition) missing.push("pedido registrado na expedição");
  if (!$("chkBags").checked) missing.push("quantidade de sacolas conferida");
  if (!$("chkName").checked) missing.push("nome do pedido conferido");
  if (!$("chkIfood").checked) missing.push("número do iFood conferido");
  if (!$("handActor").value.trim()) missing.push("responsável interno identificado");
  const bags = Number(order.bags);
  if (!(bags >= 1)) missing.push("volumes definidos pela casa");
  return missing;
}

function updateDeliverGate() {
  const btn = $("btnDeliver");
  const box = $("pendingBox");
  if (stage !== "checking") {
    btn.disabled = true;
    return;
  }
  const missing = missingRequirements();
  if (missing.length === 0) {
    btn.disabled = false;
    box.classList.add("ready");
    box.textContent = "Tudo conferido. Pode entregar ao motoboy do iFood.";
  } else {
    btn.disabled = true;
    box.classList.remove("ready");
    box.textContent = "Para entregar, ainda falta: " + missing.join(" · ") + ".";
  }
}

function setStage(next) {
  stage = next;
  renderFocus();
  updateDeliverGate();
}

function renderFocus() {
  const primary = $("btnPrimary");
  const checkSheet = $("checkSheet");
  const btnRider = $("btnRiderArrived");
  $("result").hidden = true;
  checkSheet.hidden = true;
  btnRider.hidden = true;
  primary.hidden = false;

  fillOrderSheet();

  if (stage === "ready") {
    $("focusStage").textContent = "Pedido pronto";
    $("focusTitle").textContent = `Pedido #${order.local_number} ficou pronto.`;
    $("focusSub").textContent = "Vá buscar na conferência.";
    $("dispStatus").textContent = "Pedido pronto";
    $("dispStatus").className = "chip warn";
    primary.textContent = "Buscar pedido";
    primary.disabled = false;
  } else if (stage === "fetching") {
    $("focusStage").textContent = "Conferência";
    $("focusTitle").textContent = "Buscando o pedido…";
    $("focusSub").textContent = "Confira se está pronto, embalado, fechado e identificado.";
    $("dispStatus").textContent = "Buscando";
    $("dispStatus").className = "chip warn";
    primary.hidden = true;
  } else if (stage === "waiting_rider") {
    $("focusStage").textContent = "Aguardando entregador";
    $("focusTitle").textContent = "Pedido em mãos.";
    $("focusSub").textContent = "Aguardando entregador do iFood.";
    $("dispStatus").textContent = "Aguardando entregador";
    $("dispStatus").className = "chip warn";
    primary.hidden = true;
    btnRider.hidden = false;
  } else if (stage === "checking") {
    $("focusStage").textContent = "Confira antes de entregar";
    $("focusTitle").textContent = "Entregador na porta.";
    $("focusSub").textContent =
      "Confira sacolas, nome e número. Não abra a embalagem.";
    $("dispStatus").textContent = "Na retirada";
    $("dispStatus").className = "chip";
    primary.hidden = true;
    checkSheet.hidden = false;
  } else if (stage === "done") {
    $("focusStage").textContent = "Expedição concluída";
    $("focusTitle").textContent = "Pedido entregue ao motoboy do iFood.";
    $("focusSub").textContent =
      "O andamento posterior é acompanhado pelo canal do iFood.";
    $("dispStatus").textContent = "Expedição concluída";
    $("dispStatus").className = "chip";
    primary.hidden = true;
    $("result").hidden = false;
    $("result").innerHTML = `
      <strong>Pedido entregue ao motoboy do iFood.</strong>
      Expedição concluída.<br />
      O andamento posterior é acompanhado pelo canal do iFood.`;
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
      <div class="meta">${h.confirmed ? "Entregue ao motoboy do iFood" : "Em andamento"}</div>
    </div>`,
        )
        .join("")
    : `<div class="empty">Nenhuma expedição nesta sessão ainda.</div>`;
}

/** Buscar pedido: inicia registro no domínio + etapa “em mãos” */
async function onBuscarPedido() {
  renderError($("errorBox"), null);
  setStage("fetching");
  try {
    const hid = `HO-${Date.now().toString(36)}`;
    const res = await command({
      type: "StartHandoff",
      command_id: cid("hs"),
      occurred_at: now(),
      unit_id: "demo-unit",
      handoff_id: hid,
      external_order_ref: order.platform_order_ref || `IF-${order.local_number}`,
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) throw new Error(res.result?.error || "falha");
    currentExpedition = hid;
    // UI: pedido já embalado/fechado pela casa — em mãos
    setStage("waiting_rider");
    await refreshList();
  } catch (e) {
    setStage("ready");
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

function onRiderArrived() {
  renderError($("errorBox"), null);
  $("chkBags").checked = false;
  $("chkName").checked = false;
  $("chkIfood").checked = false;
  setStage("checking");
}

/**
 * Confirma no domínio com campos técnicos mapeados.
 * courier_verified = conferência operacional da retirada (sacolas/nome/código),
 * não “validação de identidade” nem conferência de itens pelo entregador.
 */
async function onEntregar() {
  renderError($("errorBox"), null);
  const missing = missingRequirements();
  if (missing.length) {
    renderError($("errorBox"), "Ainda falta: " + missing.join(", "));
    return;
  }
  const actor = $("handActor").value.trim();
  const bags = Number(order.bags);
  try {
    const res = await command({
      type: "ConfirmHandoff",
      command_id: cid("hc"),
      occurred_at: now(),
      unit_id: "demo-unit",
      handoff_id: currentExpedition,
      conference_actor: actor,
      handoff_actor: actor,
      courier_verified: true,
      courier_verification_method: riderNameAvailable()
        ? "nome_e_codigo_plataforma"
        : "numero_pedido_e_codigo",
      // Sem perfil: não envia ref permanente; opcional omitido
      volumes: { expected: bags, delivered: bags },
      order_identified: true,
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) {
      renderError($("errorBox"), res.result?.error || "Não foi possível concluir");
      return;
    }
    currentExpedition = null;
    setStage("done");
    await refreshList();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

function resetDemo() {
  currentExpedition = null;
  $("chkBags").checked = false;
  $("chkName").checked = false;
  $("chkIfood").checked = false;
  $("toggleNoRiderName").checked = false;
  renderError($("errorBox"), null);
  setStage("ready");
  refreshList().catch(() => {});
}

$("btnPrimary").addEventListener("click", () => {
  if (stage === "ready") onBuscarPedido();
});
$("btnRiderArrived").addEventListener("click", onRiderArrived);
$("btnDeliver").addEventListener("click", onEntregar);
$("btnResetDemo").addEventListener("click", resetDemo);

["chkBags", "chkName", "chkIfood", "handActor"].forEach((id) => {
  $(id).addEventListener("change", updateDeliverGate);
  $(id).addEventListener("input", updateDeliverGate);
});
$("toggleNoRiderName").addEventListener("change", () => {
  fillOrderSheet();
  updateDeliverGate();
});

fillOrderSheet();
setStage("ready");
refreshList().catch(() => {});
