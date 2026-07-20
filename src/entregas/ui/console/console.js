import { snapshot, command, api, chip, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);
let snap = null;
let filter = "all";
let selected = new Set();
let seq = 1;

function now() {
  return new Date().toISOString();
}
function cid(p) {
  return `${p}-${seq++}`;
}

async function refresh() {
  try {
    snap = await snapshot();
    $("maxStops").textContent = String(snap.policy.max_stops);
    $("conn").textContent =
      snap.connection === "online"
        ? "Online"
        : snap.connection === "offline"
          ? "Offline"
          : "Sincronizando";
    $("statusLine").textContent = `Ator ${snap.actor.role} · sync pendente ${snap.pending_sync}`;
    renderError($("errorBox"), snap.last_error);
    renderReady();
    renderTrips();
    renderRiders();
    renderHandoffs();
    renderOcc();
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
    return t.deliveries.some((d) => d.state === "entrega_sem_confirmacao");
  }
  return t.state === filter;
}

function renderTrips() {
  const list = (snap.trips || []).filter(tripMatches);
  $("emptyTrips").hidden = list.length > 0;
  $("tripsList").innerHTML = list
    .map((t) => {
      const dels = t.deliveries
        .map(
          (d) =>
            `<div class="meta">${d.active ? "●" : "○"} ${d.order_ref} · ${chip(d.state)} ${d.active ? "" : "(removida do ativo)"}</div>`,
        )
        .join("");
      return `<div class="item" role="listitem">
        <div>
          <div><strong>Viagem</strong> ${chip(t.state)} <span class="trip-id" title="Identificador técnico">${t.trip_id}</span></div>
          <div class="meta">Motoboy interno: ${t.courier_actor_id}</div>
          ${dels}
          <div class="actions" style="margin-top:0.5rem">
            <button type="button" data-act="depart" data-trip="${t.trip_id}">Confirmar saída</button>
            <button type="button" data-act="return" data-trip="${t.trip_id}">Iniciar retorno</button>
            <button type="button" data-act="close" data-trip="${t.trip_id}">Encerrar viagem</button>
            <button type="button" data-act="remove" data-trip="${t.trip_id}">Tirar um pedido</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
  $("tripsList").querySelectorAll("button[data-act]").forEach((btn) => {
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
        reason: "Demonstração de fechamento manual",
        actor: { actor_id: "lid-demo", role: "lider_delivery" },
      });
    } else if (act === "remove") {
      const t = snap.trips.find((x) => x.trip_id === tripId);
      const d = t?.deliveries.find((x) => x.active);
      if (!d) throw new Error("Nenhuma delivery ativa");
      await command({
        type: "RemoveDeliveryFromTrip",
        command_id: cid("rm"),
        occurred_at: now(),
        unit_id: "demo-unit",
        trip_id: tripId,
        delivery_id: d.delivery_id,
        reason: "Remoção demonstrativa",
      });
    }
    await refresh();
  } catch (e) {
    const msg = e.payload?.result?.error || e.message;
    renderError($("errorBox"), msg);
  }
}

function renderRiders() {
  const list = snap.riders || [];
  $("emptyRiders").hidden = list.length > 0;
  $("ridersList").innerHTML = list
    .map(
      (r) => `<div class="item" role="listitem">
      <div>
        <strong>${r.rider_id}</strong> ${chip(r.availability)}
        <div class="meta">${r.active_trip_id ? "Viagem " + r.active_trip_id : "Sem viagem ativa"}
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

function renderHandoffs() {
  const list = snap.handoffs || [];
  $("handoffList").innerHTML = list.length
    ? list
        .map(
          (h) => `<div class="item"><div>
      <strong>${h.external_order_ref}</strong> ${chip(h.state)}
      <div class="meta">verified=${h.courier_verified} · confirmed=${h.confirmed}</div>
    </div></div>`,
        )
        .join("")
    : `<div class="empty">Nenhum handoff nesta sessão de demo.</div>`;
}

function renderOcc() {
  const list = snap.occurrences || [];
  $("occList").innerHTML = list.length
    ? list
        .map(
          (o) => `<div class="item"><div>
      <strong>${o.occurrence_id}</strong> ${chip(o.state)}
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
  if (orders.length > max) {
    // ainda envia ao domínio para mensagem real da política
  }
  const tripId = `T-DEMO-${Date.now().toString(36)}`;
  const deliveries = orders.map((order_ref, i) => ({
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
      renderError($("errorBox"), res.result?.error || "Rejeitado pelo domínio");
    } else {
      orders.forEach((o) => selected.delete(o));
      $("tripHint").textContent = `Viagem criada ${tripId} (limite política ${max}).`;
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
