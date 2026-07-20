import { snapshot, command, chip, renderError } from "../shared/client.js";

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

function currentStop(t) {
  if (!t) return null;
  return t.deliveries.find(
    (d) =>
      d.active &&
      ["em_rota", "chegada_detectada", "aguardando_saida"].includes(d.state),
  );
}

async function refresh() {
  snap = await snapshot();
  $("connLine").textContent =
    snap.connection === "offline"
      ? "Offline — eventos ficam pendentes"
      : snap.connection === "syncing"
        ? "Sincronizando…"
        : "Online";
  $("syncLine").textContent =
    snap.pending_sync > 0
      ? `${snap.pending_sync} evento(s) aguardando sincronização (occurred_at preservado no domínio)`
      : "Sem fila de sincronização";
  const t = activeTrip();
  // Ações por estado — evita botão morto / erro técnico
  const canDepart = t && t.state === "preparando_saida";
  const canArrive = t && t.state === "em_rota";
  const canConfirm =
    t &&
    t.deliveries.some(
      (d) =>
        d.active &&
        ["em_rota", "chegada_detectada", "entrega_sem_confirmacao"].includes(
          d.state,
        ),
    );
  const canReturn = t && t.state === "em_rota";
  $("btnDepart").disabled = !canDepart;
  $("btnArrive").disabled = !canArrive;
  $("btnConfirm").disabled = !canConfirm;
  $("btnNotFound").disabled = !canArrive;
  $("btnReturn").disabled = !canReturn;
  $("btnNav").disabled = !t;
  $("btnProblem").disabled = !t;

  if (!t) {
    $("tripBody").innerHTML = `<div class="empty">Nenhuma viagem ativa. Peça ao console para criar e atribuir.</div>`;
    $("stopBody").innerHTML = `<div class="empty">Sem parada</div>`;
    return;
  }
  $("tripBody").innerHTML = `
    <div><strong>${chip(t.state)}</strong></div>
    <div class="muted" style="margin-top:0.35rem">Você: ${t.courier_actor_id}</div>
    <div class="muted trip-id" style="font-size:0.75rem;margin-top:0.25rem">Cód. viagem ${t.trip_id}</div>
    <div style="margin-top:0.5rem">${t.deliveries
      .map(
        (d) =>
          `<div class="muted">${d.planned_stop_order}. ${d.order_ref} ${chip(d.state)} ${d.active ? "" : "· removida"}</div>`,
      )
      .join("")}</div>`;
  const s = currentStop(t);
  $("stopBody").innerHTML = s
    ? `<strong>${s.order_ref}</strong> ${chip(s.state)}<div class="muted">Parada ${s.planned_stop_order}</div>`
    : `<div class="empty">Nenhuma parada em andamento agora</div>`;
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

$("btnDepart").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    if (!t) throw new Error("Sem viagem");
    if (!confirm("Confirmar saída da loja?")) return;
    await command({
      type: "ConfirmTripDeparture",
      command_id: cid("dep"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  }),
);

$("btnNav").addEventListener("click", () => {
  // Navegação externa — não inventa mapa interno
  window.open("https://www.openstreetmap.org/search?query=São%20Paulo", "_blank", "noopener");
});

$("btnArrive").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    const s = currentStop(t);
    if (!t || !s) throw new Error("Sem parada");
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
  }),
);

$("btnConfirm").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    const s =
      t?.deliveries.find((d) => d.active && d.state === "chegada_detectada") ||
      t?.deliveries.find((d) => d.active && d.state === "em_rota") ||
      t?.deliveries.find((d) => d.active && d.state === "entrega_sem_confirmacao");
    if (!t || !s) throw new Error("Sem entrega para confirmar");
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
  }),
);

$("btnNotFound").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    const s = currentStop(t);
    if (!t || !s) throw new Error("Sem parada");
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

$("btnReturn").addEventListener("click", () =>
  act(async () => {
    const t = activeTrip();
    if (!t) throw new Error("Sem viagem");
    if (!confirm("Iniciar retorno à loja?")) return;
    await command({
      type: "StartTripReturn",
      command_id: cid("rt"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
  }),
);

refresh().catch((e) => renderError($("errorBox"), e.message));
