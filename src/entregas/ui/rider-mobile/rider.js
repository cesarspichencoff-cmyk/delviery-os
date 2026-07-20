import {
  snapshot,
  command,
  chip,
  renderError,
  connectionState,
  api,
} from "../shared/client.js";

const $ = (id) => document.getElementById(id);
let snap = null;
let seq = 1;
const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

function activeTrip() {
  return (snap?.trips || []).find((t) =>
    ["preparando_saida", "em_rota", "retornando"].includes(t.state),
  );
}

/**
 * Parada atual na sequência:
 * - primeira ativa não confirmada / não removida
 */
function currentStop(t) {
  if (!t) return null;
  return t.deliveries.find(
    (d) =>
      d.active &&
      !["entregue_confirmado", "cliente_nao_encontrado"].includes(d.state),
  );
}

/**
 * Fase visual da parada (sem inventar GPS):
 * - depart: viagem preparando saída
 * - en_route: delivery em_rota → ação Abrir rota (+ Cheguei)
 * - arrived: chegada_detectada | entrega_sem_confirmacao → Confirmar entrega
 * - returning: viagem retornando
 */
function stopPhase(t, s) {
  if (!t) return "idle";
  if (t.state === "preparando_saida") return "depart";
  if (t.state === "retornando") return "returning";
  if (!s) return "idle";
  if (s.state === "chegada_detectada" || s.state === "entrega_sem_confirmacao")
    return "arrived";
  if (s.state === "em_rota" || s.state === "aguardando_saida") return "en_route";
  return "idle";
}

function addressHint(orderRef) {
  const o = (snap?.ready_orders || []).find((x) => x.order_ref === orderRef);
  if (o?.label) {
    const parts = o.label.split("·").map((x) => x.trim());
    return parts[parts.length - 1] || orderRef;
  }
  return orderRef;
}

async function refresh() {
  snap = await snapshot();
  // Uma única fonte: snap.connection + pending_sync (nunca misturar com outro canal)
  const cs = connectionState(snap.connection, snap.pending_sync || 0);
  const offline = cs.mode === "offline";

  $("connLine").textContent = cs.header;
  $("connLine").dataset.mode = cs.mode;

  const syncBar = $("syncBar");
  if (cs.showBanner) {
    syncBar.hidden = false;
    syncBar.removeAttribute("hidden");
    $("syncTitle").textContent = cs.bannerTitle;
    $("syncDetail").textContent = cs.bannerDetail;
    // Guardrail: se cabeçalho é Online, título do banner não pode ser "Sem rede"
    if (cs.header === "Online" && /sem rede/i.test(cs.bannerTitle)) {
      $("syncTitle").textContent = "Sincronização pendente";
    }
  } else {
    // Ausência real: hidden + limpar texto residual (CSS display:flex não pode vazar o aviso)
    syncBar.hidden = true;
    syncBar.setAttribute("hidden", "");
    $("syncTitle").textContent = "";
    $("syncDetail").textContent = "";
  }
  // Link secundário só em offline real — não em sync pendente online
  $("btnSyncNow").hidden = !offline;

  const t = activeTrip();
  const s = currentStop(t);
  const phase = stopPhase(t, s);

  // Reset actions
  const primary = $("btnPrimary");
  const secondary = $("btnSecondary");
  const notFound = $("btnNotFound");
  const problemRow = $("problemRow");
  const btnProblem = $("btnProblem");

  primary.hidden = true;
  secondary.hidden = true;
  notFound.hidden = true;
  problemRow.hidden = true;
  primary.onclick = null;
  secondary.onclick = null;

  if (!t) {
    $("stageRail").innerHTML = "";
    $("stopMeta").textContent = "Viagem";
    $("stopTitle").textContent = "Nenhuma viagem ativa";
    $("stopSub").textContent = "Peça ao console para montar e atribuir uma viagem.";
    $("stopCard").hidden = true;
    $("nextLine").textContent = "";
    $("tripFoot").textContent = "";
    return;
  }

  const total = t.deliveries.filter((d) => d.active).length;
  const order = s?.planned_stop_order;

  if (phase === "depart") {
    $("stageRail").innerHTML = `<span class="stage on">Saída</span><span class="stage">A caminho</span><span class="stage">Entregar</span>`;
    $("stopMeta").textContent = "Preparando saída";
    $("stopTitle").textContent = "Confirme a saída da casa";
    $("stopSub").textContent = `${total} parada(s) nesta viagem.`;
    $("stopCard").hidden = false;
    $("stopCard").innerHTML = t.deliveries
      .map(
        (d) =>
          `<div class="meta">${d.planned_stop_order}. ${d.order_ref} ${chip(d.state)}</div>`,
      )
      .join("");
    $("nextLine").textContent = "";
    primary.hidden = false;
    primary.textContent = "Confirmar saída";
    primary.onclick = () => actDepart(t);
    problemRow.hidden = false;
    btnProblem.hidden = false;
  } else if (phase === "en_route") {
    // A caminho → Abrir rota (soberana). Cheguei disponível para registrar chegada.
    // NÃO mostrar Cliente não encontrado.
    $("stageRail").innerHTML = `<span class="stage on">A caminho</span><span class="stage">No local</span><span class="stage">Entregar</span>`;
    $("stopMeta").textContent = `Parada ${order} de ${total}`;
    $("stopTitle").textContent = addressHint(s.order_ref);
    $("stopSub").textContent = `Pedido ${s.order_ref}`;
    $("stopCard").hidden = false;
    $("stopCard").className = "card stop-card";
    $("stopCard").innerHTML = `<div style="font-weight:600">Pedido ${s.order_ref}</div>
      <div class="meta">${chip(s.state)}</div>`;
    const next = t.deliveries.find(
      (d) => d.active && d.planned_stop_order === order + 1,
    );
    $("nextLine").textContent = next
      ? `Próxima: ${addressHint(next.order_ref)} · ${next.order_ref}`
      : "Última parada desta viagem";

    primary.hidden = false;
    primary.textContent = "Abrir rota";
    primary.onclick = () => openRoute(s);

    secondary.hidden = false;
    secondary.textContent = "Cheguei";
    secondary.onclick = () => actArrive(t, s);

    problemRow.hidden = false;
    notFound.hidden = true; // obrigatório: não no estado a caminho
    btnProblem.hidden = false;
  } else if (phase === "arrived") {
    // Chegada registrada → Confirmar entrega; Cliente não encontrado aplicável
    $("stageRail").innerHTML = `<span class="stage done">A caminho</span><span class="stage done">Cheguei</span><span class="stage on">Entregar</span>`;
    $("stopMeta").textContent = `Parada ${order} de ${total} · chegada registrada`;
    $("stopTitle").textContent = addressHint(s.order_ref);
    $("stopSub").textContent = "Entregue o pedido e confirme quando o cliente receber.";
    $("stopCard").hidden = false;
    $("stopCard").className = "card stop-card edge-green";
    $("stopCard").innerHTML = `<div style="font-weight:600">Pedido ${s.order_ref}</div>
      <div class="meta">${chip(s.state)}</div>
      <div class="mark">CHEGADA REGISTRADA</div>`;
    $("nextLine").textContent = "";

    primary.hidden = false;
    primary.textContent = "Confirmar entrega";
    primary.onclick = () => actConfirm(t, s);

    problemRow.hidden = false;
    notFound.hidden = false;
    btnProblem.hidden = false;
  } else if (phase === "returning") {
    $("stageRail").innerHTML = `<span class="stage done">Rota</span><span class="stage on">Retorno</span>`;
    $("stopMeta").textContent = "Retorno";
    $("stopTitle").textContent = "Voltando para a casa";
    $("stopSub").textContent = "Quando chegar, o console pode encerrar a viagem.";
    $("stopCard").hidden = true;
    $("nextLine").textContent = "";
    problemRow.hidden = false;
    btnProblem.hidden = false;
  } else {
    $("stageRail").innerHTML = "";
    $("stopMeta").textContent = "Viagem";
    $("stopTitle").textContent = chip(t.state).replace(/<[^>]+>/g, t.state);
    $("stopSub").textContent = "";
    $("stopCard").hidden = true;
  }

  $("tripFoot").textContent = `Viagem · ${t.deliveries.filter((d) => d.active).length} parada(s)`;
}

function openRoute(s) {
  const q = encodeURIComponent(addressHint(s.order_ref) + " São Paulo");
  window.open(`https://www.openstreetmap.org/search?query=${q}`, "_blank", "noopener");
}

async function act(fn) {
  renderError($("errorBox"), null);
  try {
    await fn();
    await refresh();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

function actDepart(t) {
  return act(async () => {
    if (!confirm("Confirmar saída da loja?")) return;
    await command({
      type: "ConfirmTripDeparture",
      command_id: cid("dep"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  });
}

function actArrive(t, s) {
  return act(async () => {
    await command({
      type: "RecordArrivalDetected",
      command_id: cid("arr"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      delivery_id: s.delivery_id,
      source: "manual",
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  });
}

function actConfirm(t, s) {
  return act(async () => {
    if (!confirm("Confirmar entrega ao cliente?")) return;
    await command({
      type: "ConfirmDelivery",
      command_id: cid("cf"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      delivery_id: s.delivery_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  });
}

$("btnNotFound").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    const s = currentStop(t);
    if (!t || !s) throw new Error("Sem parada");
    // Só permitido após chegada (UI); domínio valida o restante
    if (!["chegada_detectada", "entrega_sem_confirmacao", "em_rota"].includes(s.state)) {
      throw new Error("Só após registrar a chegada.");
    }
    if (s.state === "em_rota") {
      throw new Error("Registre a chegada (Cheguei) antes de informar cliente não encontrado.");
    }
    await command({
      type: "RecordCustomerNotFound",
      command_id: cid("nf"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      delivery_id: s.delivery_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  }),
);

$("btnProblem").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    await command({
      type: "CreateOccurrence",
      command_id: cid("oc"),
      occurred_at: now(),
      unit_id: "demo-unit",
      occurrence_id: `OCC-M-${Date.now().toString(36)}`,
      occurrence_type: "campo",
      report: "Problema registrado pelo motoboy (demo)",
      blocks_availability: false,
      related_trip_id: t?.trip_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  }),
);

$("btnSyncNow").addEventListener("click", async () => {
  // Apenas tenta marcar online — sync é automática no facade
  try {
    await api("/api/connection", {
      method: "POST",
      body: JSON.stringify({ connection: "online" }),
    });
    await refresh();
  } catch (e) {
    renderError($("errorBox"), e.message);
  }
});

// Demo: long-press status to toggle offline (não exposto como “admin de sync”)
$("connLine").addEventListener("dblclick", async () => {
  const next = snap?.connection === "offline" ? "online" : "offline";
  await api("/api/connection", {
    method: "POST",
    body: JSON.stringify({ connection: next }),
  });
  await refresh();
});

refresh().catch((e) => renderError($("errorBox"), e.message));
