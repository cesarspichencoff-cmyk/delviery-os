import {
  snapshot,
  command,
  api,
  chip,
  renderError,
  connectionLabel,
} from "../shared/client.js";

const $ = (id) => document.getElementById(id);
let snap = null;
let filter = "all";
let selected = new Set();
let focusTripId = null;
let seq = 1;

const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

/** Rótulos de endereço só a partir de dados conhecidos (order label) — sem coordenadas inventadas */
function addressLabel(orderRef) {
  const o = (snap?.ready_orders || []).find((x) => x.order_ref === orderRef);
  if (o?.label) {
    const parts = o.label.split("·").map((s) => s.trim());
    return parts[parts.length - 1] || orderRef;
  }
  return orderRef;
}

function riderName(id) {
  if (id === "rid-demo") return "Carlos";
  return id;
}

async function refresh() {
  try {
    snap = await snapshot();
    $("maxStops").textContent = String(snap.policy.max_stops);
    $("conn").textContent = connectionLabel(snap.connection, snap.pending_sync);
    $("conn").className =
      "chip " +
      (snap.connection === "offline"
        ? "warn"
        : snap.pending_sync > 0
          ? "warn"
          : "neutral");
    const roleLabel = {
      operador_expedicao: "Operador",
      lider_delivery: "Líder",
      gerente: "Gerente",
      motoboy_interno: "Motoboy",
    }[snap.actor.role] || snap.actor.role;
    $("statusLine").textContent =
      snap.pending_sync > 0
        ? `${roleLabel} · envio automático pendente (${snap.pending_sync})`
        : `${roleLabel} · sincronizado`;
    renderError($("errorBox"), snap.last_error);
    renderReady();
    renderTrips();
    renderRiders();
    renderExpeditions();
    renderOcc();
    renderFocus();
  } catch (e) {
    renderError($("errorBox"), e.message || "Falha ao carregar");
    $("statusLine").textContent = "Erro técnico";
  }
}

function renderReady() {
  const box = $("readyList");
  const own = (snap.ready_orders || []).filter((o) => !o.order_ref.startsWith("IF-"));
  if (!own.length) {
    box.innerHTML = `<div class="empty">Nenhum pedido próprio pronto.</div>`;
    return;
  }
  box.innerHTML = own
    .map(
      (o) => `
    <div class="item" role="listitem">
      <label>
        <input type="checkbox" data-order="${o.order_ref}" ${selected.has(o.order_ref) ? "checked" : ""} />
        <span><strong>${o.label}</strong><div class="meta">Próprio · pronto para formação</div></span>
      </label>
    </div>`,
    )
    .join("");
  box.querySelectorAll("input[type=checkbox]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-order");
      if (el.checked) selected.add(id);
      else selected.delete(id);
    });
  });
}

function tripMatches(t) {
  if (filter === "all") return true;
  if (filter === "pendencias") {
    return t.deliveries.some(
      (d) =>
        d.active &&
        (d.state === "entrega_sem_confirmacao" || d.state === "cliente_nao_encontrado"),
    );
  }
  return t.state === filter;
}

function renderTrips() {
  const list = (snap.trips || []).filter(tripMatches);
  $("emptyTrips").hidden = list.length > 0;
  $("tripsList").innerHTML = list
    .map((t) => {
      const pend = t.deliveries.some(
        (d) => d.active && d.state === "entrega_sem_confirmacao",
      );
      const dels = t.deliveries
        .map(
          (d) =>
            `<div class="meta">${d.active ? "●" : "○"} ${d.order_ref} · ${chip(d.state)}${d.active ? "" : " (fora do ativo)"}</div>`,
        )
        .join("");
      return `<div class="item ${focusTripId === t.trip_id ? "active" : ""} ${pend ? "pend" : ""}" role="listitem" data-focus="${t.trip_id}">
        <div style="width:100%;cursor:pointer">
          <div><strong>Viagem</strong> ${chip(t.state)} <span class="trip-id">${t.trip_id}</span></div>
          <div class="meta">Motoboy: ${riderName(t.courier_actor_id)}</div>
          ${dels}
        </div>
      </div>`;
    })
    .join("");
  $("tripsList").querySelectorAll("[data-focus]").forEach((el) => {
    el.addEventListener("click", () => {
      focusTripId = el.getAttribute("data-focus");
      renderFocus();
      renderTrips();
    });
  });
}

function renderFocus() {
  const trips = snap?.trips || [];
  const pendTrip = trips.find((t) =>
    t.deliveries.some(
      (d) => d.active && d.state === "entrega_sem_confirmacao",
    ),
  );
  const active =
    (focusTripId && trips.find((t) => t.trip_id === focusTripId)) ||
    pendTrip ||
    trips.find((t) => t.state === "em_rota") ||
    trips.find((t) => t.state === "preparando_saida") ||
    trips[0];

  if (active) focusTripId = active.trip_id;

  const status = $("focusStatus");
  const title = $("focus-title");
  const sub = $("focusSub");
  const detail = $("focusDetail");
  const actions = $("focusActions");
  const seqBox = $("addressSeq");
  const mapNote = $("mapNote");

  if (!active) {
    status.innerHTML = `<span class="dot green"></span> Em fluxo`;
    title.textContent = "Nada pedindo você agora.";
    sub.textContent =
      "Quando houver viagem em montagem ou pendência, o foco aparece aqui.";
    detail.innerHTML = "";
    actions.innerHTML = "";
    seqBox.hidden = true;
    seqBox.innerHTML = "";
    mapNote.hidden = false;
    return;
  }

  const pendDel = active.deliveries.find(
    (d) => d.active && d.state === "entrega_sem_confirmacao",
  );
  const openDels = active.deliveries.filter((d) => d.active);

  if (pendDel) {
    status.innerHTML = `<span class="dot amber"></span> Atenção`;
    title.textContent = `Parada ${pendDel.planned_stop_order} ainda não foi confirmada.`;
    sub.textContent = `${riderName(active.courier_actor_id)} está com a viagem. Sabemos o endereço e o estado — não a posição agora.`;
    detail.innerHTML = `<div class="card edge-amber">
      <strong>${pendDel.order_ref} · ${addressLabel(pendDel.order_ref)}</strong>
      <div class="meta">Aguardando confirmação</div>
    </div>`;
  } else if (active.state === "preparando_saida") {
    status.innerHTML = `<span class="dot green"></span> Montagem`;
    title.textContent = `${openDels.length} pedido(s) com ${riderName(active.courier_actor_id)}.`;
    sub.textContent = "Confirme a saída quando a equipe estiver pronta.";
    detail.innerHTML = "";
  } else if (active.state === "em_rota") {
    status.innerHTML = `<span class="dot green"></span> Em rota`;
    title.textContent = `Viagem com ${riderName(active.courier_actor_id)}.`;
    sub.textContent = "Acompanhamento por confirmações de parada — sem localização ao vivo.";
    detail.innerHTML = "";
  } else if (active.state === "retornando") {
    status.innerHTML = `<span class="dot amber"></span> Retorno`;
    title.textContent = `${riderName(active.courier_actor_id)} retornando à casa.`;
    sub.textContent = "Aguarde o encerramento ou encerre manualmente se necessário.";
    detail.innerHTML = "";
  } else {
    status.innerHTML = `<span class="dot green"></span> Viagem`;
    title.textContent = chip(active.state).replace(/<[^>]+>/g, "") || "Viagem";
    title.textContent = `Viagem ${active.state.replace(/_/g, " ")}`;
    sub.textContent = riderName(active.courier_actor_id);
    detail.innerHTML = "";
  }

  // Sequência de endereços (nunca pins em mapa inventado)
  seqBox.hidden = false;
  seqBox.innerHTML = openDels
    .map((d) => {
      const st =
        d.state === "entregue_confirmado"
          ? "CONFIRMADA"
          : d.state === "entrega_sem_confirmacao"
            ? "AGUARDANDO CONFIRMAÇÃO"
            : d.state === "chegada_detectada"
              ? "CHEGADA REGISTRADA"
              : d.state === "em_rota"
                ? "NA SEQUÊNCIA"
                : d.state.replace(/_/g, " ").toUpperCase();
      const pend = d.state === "entrega_sem_confirmacao";
      return `<div class="addr-chip ${pend ? "pend" : ""}">
        <div class="n">${String(d.planned_stop_order).padStart(2, "0")} · ${st}</div>
        <div class="addr">${addressLabel(d.order_ref)} · ${d.order_ref}</div>
      </div>`;
    })
    .join("");

  mapNote.hidden = false;
  mapNote.textContent =
    "Sem coordenadas confiáveis — destinos em sequência de endereços. Mapa só com geocodificação real (experimental em /map-poc/).";

  const btns = [];
  if (active.state === "preparando_saida") {
    btns.push(
      `<button type="button" class="primary" data-act="depart" data-trip="${active.trip_id}">Confirmar saída</button>`,
    );
  }
  if (active.state === "em_rota") {
    btns.push(
      `<button type="button" class="primary" data-act="return" data-trip="${active.trip_id}">Iniciar retorno</button>`,
    );
  }
  if (["em_rota", "retornando", "preparando_saida"].includes(active.state)) {
    btns.push(
      `<button type="button" data-act="close" data-trip="${active.trip_id}">Encerrar viagem</button>`,
    );
    btns.push(
      `<button type="button" class="ghost" data-act="remove" data-trip="${active.trip_id}">Tirar um pedido</button>`,
    );
  }
  actions.innerHTML = btns.join("");
  actions.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => onTripAct(btn.dataset.act, btn.dataset.trip));
  });
}

async function onTripAct(act, tripId) {
  renderError($("errorBox"), null);
  try {
    if (act === "depart") {
      await command({
        type: "ConfirmTripDeparture",
        command_id: cid("dep"),
        occurred_at: now(),
        unit_id: "demo-unit",
        trip_id: tripId,
        actor: { actor_id: "rid-demo", role: "motoboy_interno" },
      });
    } else if (act === "return") {
      await command({
        type: "StartTripReturn",
        command_id: cid("ret"),
        occurred_at: now(),
        unit_id: "demo-unit",
        trip_id: tripId,
        actor: { actor_id: "rid-demo", role: "motoboy_interno" },
      });
    } else if (act === "close") {
      await command({
        type: "CloseTripManually",
        command_id: cid("cls"),
        occurred_at: now(),
        unit_id: "demo-unit",
        trip_id: tripId,
        reason: "Encerramento pelo console",
        actor: { actor_id: "lid-demo", role: "lider_delivery" },
      });
    } else if (act === "remove") {
      const t = snap.trips.find((x) => x.trip_id === tripId);
      const d = t?.deliveries.find((x) => x.active);
      if (!d) throw new Error("Nenhuma entrega ativa");
      await command({
        type: "RemoveDeliveryFromTrip",
        command_id: cid("rm"),
        occurred_at: now(),
        unit_id: "demo-unit",
        trip_id: tripId,
        delivery_id: d.delivery_id,
        reason: "Remoção pelo console",
      });
    }
    await refresh();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

function renderRiders() {
  const list = snap.riders || [];
  $("emptyRiders").hidden = list.length > 0;
  $("ridersList").innerHTML = list
    .map(
      (r) => `<div class="item" role="listitem">
      <div>
        <strong>${riderName(r.rider_id)}</strong> ${chip(r.availability)}
        <div class="meta">${r.active_trip_id ? "Em viagem" : "Sem viagem ativa"}
        ${r.occurrence_blocking_availability ? " · ocorrência bloqueia disponibilidade" : ""}</div>
      </div>
      <div class="actions">
        <button type="button" data-rider="${r.rider_id}" data-pause="1">Pausa</button>
        <button type="button" data-rider="${r.rider_id}" data-support="1">Apoio</button>
      </div>
    </div>`,
    )
    .join("");
  $("ridersList").querySelectorAll("button[data-rider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        if (btn.dataset.pause) {
          await command({
            type: "SetRiderPause",
            command_id: cid("p"),
            occurred_at: now(),
            unit_id: "demo-unit",
            rider_id: btn.dataset.rider,
            paused: true,
            actor: { actor_id: btn.dataset.rider, role: "motoboy_interno" },
          });
        } else {
          await command({
            type: "SetRiderSupport",
            command_id: cid("s"),
            occurred_at: now(),
            unit_id: "demo-unit",
            rider_id: btn.dataset.rider,
            support: true,
            actor: { actor_id: btn.dataset.rider, role: "motoboy_interno" },
          });
        }
        await refresh();
      } catch (e) {
        renderError($("errorBox"), e.payload?.result?.error || e.message);
      }
    });
  });
}

function renderExpeditions() {
  const list = snap.handoffs || [];
  $("handoffList").innerHTML = list.length
    ? list
        .map(
          (h) => `<div class="item"><div>
      <strong>${h.external_order_ref}</strong> ${chip(h.state)}
      <div class="meta">${h.confirmed ? "Entregue ao motoboy do iFood" : "Aguardando entregador / conferência"}</div>
    </div></div>`,
        )
        .join("")
    : `<div class="empty">Nenhuma expedição iFood nesta sessão.</div>`;
}

function renderOcc() {
  const list = snap.occurrences || [];
  $("occList").innerHTML = list.length
    ? list
        .map(
          (o) => `<div class="item"><div>
      <strong>Ocorrência</strong> ${chip(o.state)}
      <div class="meta">${o.report}${o.blocks_availability ? " · bloqueia disponibilidade" : ""}</div>
    </div></div>`,
        )
        .join("")
    : `<div class="empty">Nenhuma ocorrência aberta.</div>`;
}

$("btnCreateTrip").addEventListener("click", async () => {
  renderError($("errorBox"), null);
  const orders = [...selected];
  if (!orders.length) {
    renderError($("errorBox"), "Selecione ao menos um pedido próprio.");
    return;
  }
  const max = snap.policy.max_stops;
  const tripId = `T-DEMO-${Date.now().toString(36)}`;
  const deliveries = orders.map((order_ref) => ({
    delivery_id: `D-${order_ref}`,
    order_ref,
  }));
  try {
    const res = await command({
      type: "CreateTrip",
      command_id: cid("ct"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: tripId,
      courier_actor_id: "rid-demo",
      deliveries,
      actor: { actor_id: "ops-demo", role: $("role").value },
    });
    if (!res.result?.ok) {
      renderError($("errorBox"), res.result?.error || "Rejeitado");
    } else {
      orders.forEach((o) => selected.delete(o));
      focusTripId = tripId;
      $("tripHint").textContent = `Viagem montada (limite ${max} paradas).`;
    }
    await refresh();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
    await refresh();
  }
});

$("btnOcc").addEventListener("click", async () => {
  try {
    await command({
      type: "CreateOccurrence",
      command_id: cid("occ"),
      occurred_at: now(),
      unit_id: "demo-unit",
      occurrence_id: `OCC-${Date.now().toString(36)}`,
      occurrence_type: "demo",
      report: "Relato simulado de demonstração",
      blocks_availability: false,
    });
    await refresh();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
});

$("role").addEventListener("change", async () => {
  await api("/api/actor", {
    method: "POST",
    body: JSON.stringify({ actor_id: "ops-demo", role: $("role").value }),
  });
  await refresh();
});

document.querySelectorAll(".tabs [role=tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    filter = tab.dataset.filter;
    document.querySelectorAll(".tabs [role=tab]").forEach((t) =>
      t.setAttribute("aria-selected", t === tab ? "true" : "false"),
    );
    renderTrips();
  });
});

refresh();
