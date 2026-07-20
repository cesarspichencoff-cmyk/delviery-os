/**
 * Expedição iFood — experiência aprovada + finalização
 * - Aviso de novo pedido TEMPORÁRIO; depois FIFO (mais antigo primeiro)
 * - Checkboxes acessíveis; Entregar bloqueado de verdade se faltar confirmação
 * Domínio: StartHandoff / ConfirmHandoff (intacto)
 */
import { snapshot, command, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);
const app = () => document.getElementById("app");

const STORAGE_SOUND = "entregas_ifood_sound";
const ALERT_MS = 4500;
const nowIso = () => new Date().toISOString();
let seq = 1;
const cid = (p) => `${p}-${seq++}`;

/** @typedef {'ready'|'in_hand'|'checking'|'done'} OrderUiState */

/**
 * @typedef {object} ExpOrder
 * @property {string} id
 * @property {string} local_number
 * @property {string} customer_name
 * @property {string} ifood_code
 * @property {number} bags
 * @property {string} ready_at
 * @property {number} ready_at_ts  epoch ms — prioridade FIFO
 * @property {string} platform_ref
 * @property {string|null} rider_name
 * @property {OrderUiState} state
 * @property {string|null} expedition_id
 * @property {boolean} alerted
 * @property {boolean} just_ready  aviso temporário na home
 * @property {string} responsible
 * @property {boolean} [_chkBags]
 * @property {boolean} [_chkName]
 * @property {boolean} [_chkIfood]
 */

/** @type {ExpOrder[]} */
let orders = [];
/** @type {string|null} */
let activeId = null;
let prepCount = 2;
/** @type {string|null} */
let lastPulseId = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let alertTimer = null;

function bagsLabel(n) {
  return n === 1 ? "1 sacola" : `${n} sacolas`;
}

function seedOrders() {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  const base = Date.now() - 20 * 60 * 1000;
  orders = [
    {
      id: "o-8635",
      local_number: "8635",
      customer_name: "Ana Costa",
      ifood_code: "3302",
      bags: 3,
      ready_at: "19:28",
      ready_at_ts: base,
      platform_ref: "IF-8990",
      rider_name: "Rafael",
      state: "ready",
      expedition_id: null,
      alerted: true,
      just_ready: false,
      responsible: "Juliana",
    },
    {
      id: "o-8638",
      local_number: "8638",
      customer_name: "Pedro Lima",
      ifood_code: "7710",
      bags: 1,
      ready_at: "19:35",
      ready_at_ts: base + 7 * 60 * 1000,
      platform_ref: "IF-8998",
      rider_name: null,
      state: "ready",
      expedition_id: null,
      alerted: true,
      just_ready: false,
      responsible: "Juliana",
    },
    {
      id: "o-8640",
      local_number: "8640",
      customer_name: "Marina Alves",
      ifood_code: "4821",
      bags: 2,
      ready_at: "19:42",
      ready_at_ts: base + 14 * 60 * 1000,
      platform_ref: "IF-9001",
      rider_name: "Lucas",
      state: "ready",
      expedition_id: null,
      alerted: false,
      just_ready: true,
      responsible: "Juliana",
    },
  ];
  prepCount = 2;
  activeId = null;
  lastPulseId = null;
}

/** Prontos ordenados do mais antigo → mais novo (FIFO) */
function readyOrdersFifo() {
  return orders
    .filter((o) => o.state === "ready")
    .slice()
    .sort((a, b) => a.ready_at_ts - b.ready_at_ts);
}

function waitingOrders() {
  return orders.filter((o) => o.state === "in_hand" || o.state === "checking");
}

function find(id) {
  return orders.find((o) => o.id === id);
}

/** Pedido que a ação principal deve atender: sempre o mais antigo pronto */
function primaryReadyOrder() {
  const fifo = readyOrdersFifo();
  return fifo[0] || null;
}

/** Pedido em destaque só durante o aviso temporário */
function temporaryAlertOrder() {
  return readyOrdersFifo().find((o) => o.just_ready) || null;
}

function soundEnabled() {
  const el = $("soundEnabled");
  if (el) return el.checked;
  return localStorage.getItem(STORAGE_SOUND) !== "0";
}

function playReadyChime() {
  if (!soundEnabled()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 660;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {
    /* */
  }
}

/**
 * Aviso único e TEMPORÁRIO por pedido.
 * Após ALERT_MS, just_ready=false e a home volta a priorizar o mais antigo.
 */
function maybeAlertReady(order) {
  if (order.state !== "ready" || order.alerted) return;
  order.alerted = true;
  order.just_ready = true;
  lastPulseId = order.id;
  playReadyChime();
  const live = document.getElementById("srLive");
  if (live) {
    live.textContent = `Pedido ${order.local_number} ficou pronto. Vá buscar na conferência.`;
  }
  if (alertTimer) clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    order.just_ready = false;
    lastPulseId = null;
    alertTimer = null;
    if (!activeId) renderHome();
  }, ALERT_MS);
}

function statusLabel(state) {
  const map = {
    ready: "Pronto para buscar",
    in_hand: "Aguardando motoboy",
    checking: "Confira antes de entregar",
    done: "Expedição concluída",
  };
  return map[state] || state;
}

function render() {
  renderError($("errorBox"), null);
  if (activeId) {
    const o = find(activeId);
    if (!o) {
      activeId = null;
      renderHome();
      return;
    }
    if (o.state === "done") {
      renderDone(o);
      return;
    }
    if (o.state === "ready") renderReadyDetail(o);
    else if (o.state === "in_hand") renderInHand(o);
    else if (o.state === "checking") renderChecking(o);
    return;
  }
  renderHome();
}

function renderHome() {
  const fifo = readyOrdersFifo();
  const waiting = waitingOrders();
  const count = fifo.length;
  const alert = temporaryAlertOrder();
  const primary = primaryReadyOrder();
  const pulse = !!(alert && lastPulseId === alert.id);

  // Durante o aviso: mostra o novo; a ação principal permanece no mais antigo
  // (ou no único pedido se for o mesmo)
  const showAlertBanner = !!alert;
  const actionTarget = primary;

  let focusHtml = "";
  if (!count) {
    focusHtml = `
      <div class="empty-focus">
        <p class="home-count-label">Expedição iFood</p>
        <h1 class="title-sov">Nenhum pedido pronto agora.</h1>
        <p class="sub-human">Os novos pedidos aparecerão aqui assim que forem finalizados.</p>
        ${prepCount > 0 ? `<p class="prep-line">${prepCount} pedido${prepCount === 1 ? "" : "s"} em preparo</p>` : ""}
      </div>`;
  } else {
    let banner = "";
    if (showAlertBanner && alert) {
      banner = `
        <div class="alert-banner ${pulse ? "pulse-in" : ""}" role="status" aria-live="polite">
          <p class="label-meta">Acabou de ficar pronto</p>
          <p class="alert-title">Pedido #${escapeHtml(alert.local_number)} ficou pronto.</p>
          <p class="sub-human">Vá buscar na conferência.</p>
          <p class="alert-fifo muted">A fila segue pelo pedido pronto há mais tempo.</p>
        </div>`;
    }

    const focusOrder = actionTarget;
    focusHtml = `
      <p class="home-count-label">Prontos para buscar</p>
      <p class="home-count" id="readyCount">${count} pedido${count === 1 ? "" : "s"} pronto${count === 1 ? "" : "s"}</p>
      ${prepCount > 0 ? `<p class="prep-line">${prepCount} em preparo</p>` : ""}
      ${banner}
      <div class="focus-card" data-order="${focusOrder.id}">
        <p class="label-meta">Próximo da fila</p>
        <h2 class="title-sov">Pedido #${escapeHtml(focusOrder.local_number)}</h2>
        <p class="sub-human">${
          showAlertBanner && alert && alert.id !== focusOrder.id
            ? `Pronto desde ${escapeHtml(focusOrder.ready_at)} · prioridade da fila`
            : `Pronto · ${escapeHtml(focusOrder.customer_name)} · vá buscar na conferência.`
        }</p>
        <button type="button" class="primary btn-sovereign" data-act="fetch" data-id="${focusOrder.id}">
          Buscar pedido
        </button>
      </div>`;
  }

  // Fila: todos os prontos em ordem FIFO (mais antigo primeiro), exceto o da ação principal
  const queueReady = fifo.filter((o) => o.id !== actionTarget?.id);
  const queueBlocks = [];
  if (queueReady.length) {
    queueBlocks.push(`
      <div class="queue-section">
        <p class="label-meta">Fila · do mais antigo ao mais novo</p>
        <ul class="queue-list">
          ${queueReady
            .map(
              (o) => `
            <li>
              <button type="button" class="queue-item ${o.just_ready ? "is-highlight" : ""}" data-act="open" data-id="${o.id}">
                <span>#${escapeHtml(o.local_number)} · ${escapeHtml(o.customer_name)}
                  <span class="meta-inline"> · desde ${escapeHtml(o.ready_at)}</span>
                </span>
                <span class="meta">${bagsLabel(o.bags)}</span>
              </button>
            </li>`,
            )
            .join("")}
        </ul>
      </div>`);
  }
  if (waiting.length) {
    queueBlocks.push(`
      <div class="queue-section">
        <p class="label-meta">Com a equipe / aguardando motoboy</p>
        <ul class="queue-list">
          ${waiting
            .map(
              (o) => `
            <li>
              <button type="button" class="queue-item is-highlight" data-act="open" data-id="${o.id}">
                <span>#${escapeHtml(o.local_number)}</span>
                <span class="meta">${statusLabel(o.state)}</span>
              </button>
            </li>`,
            )
            .join("")}
        </ul>
      </div>`);
  }

  app().innerHTML = `
    <div class="home" id="homeView">
      <span class="sr-live" id="srLive" aria-live="polite"></span>
      ${focusHtml}
      ${queueBlocks.join("")}
    </div>`;

  if (pulse) lastPulseId = null;
  bindAppClicks();
}

function factsHtml(o, { editableResponsible = false } = {}) {
  const riderLine = o.rider_name
    ? `<div class="fact">
        <dt>Entregador esperado</dt>
        <dd>${escapeHtml(o.rider_name)} · <span class="inline-hint">nome informado pelo iFood</span></dd>
      </div>`
    : `<div class="fact">
        <dt>Entregador esperado</dt>
        <dd>Nome do motoboy não informado pelo iFood
          <span class="hint">Confirme pelo número do pedido e pelo código apresentado.</span>
        </dd>
      </div>`;

  return `
    <dl class="facts">
      <div class="fact"><dt>Pedido</dt><dd>#${escapeHtml(o.local_number)}</dd></div>
      <div class="fact"><dt>Nome no pedido</dt><dd>${escapeHtml(o.customer_name)}</dd></div>
      <div class="fact"><dt>Número iFood</dt><dd class="mono">${escapeHtml(o.ifood_code)}</dd></div>
      <div class="fact"><dt>Quantidade de sacolas</dt><dd>${bagsLabel(o.bags)}</dd></div>
      <div class="fact"><dt>Ficou pronto</dt><dd>${escapeHtml(o.ready_at)}</dd></div>
      ${riderLine}
      <div class="fact">
        <dt>Responsável pela entrega</dt>
        <dd>
          ${
            editableResponsible
              ? `<input id="fldResponsible" value="${escapeAttr(o.responsible)}" autocomplete="name" aria-label="Responsável pela entrega" />`
              : escapeHtml(o.responsible)
          }
        </dd>
      </div>
    </dl>`;
}

function renderReadyDetail(o) {
  app().innerHTML = `
    <div class="detail">
      <button type="button" class="detail-back" data-act="home">← Voltar</button>
      <p class="detail-stage">Pronto para buscar</p>
      <h1 class="detail-title">Pedido #${escapeHtml(o.local_number)}</h1>
      <p class="detail-sub">Vá buscar na conferência.</p>
      ${factsHtml(o, { editableResponsible: true })}
      <p class="note-ops">O motoboy do iFood não confere itens nem abre a embalagem. A conferência do conteúdo é da casa, antes do repasse.</p>
      <button type="button" class="primary btn-sovereign wide" data-act="fetch" data-id="${o.id}" style="margin-top:1.1rem">
        Buscar pedido
      </button>
    </div>`;
  bindAppClicks();
}

function renderInHand(o) {
  app().innerHTML = `
    <div class="detail">
      <button type="button" class="detail-back" data-act="home">← Voltar</button>
      <p class="detail-stage">Aguardando motoboy</p>
      <h1 class="detail-title">Pedido em mãos.</h1>
      <p class="detail-sub">Aguardando entregador do iFood.</p>
      ${factsHtml(o, { editableResponsible: true })}
      <p class="note-ops">Não peça ao motoboy para abrir sacolas ou conferir o conteúdo.</p>
      <button type="button" class="primary btn-sovereign wide" data-act="rider-here" data-id="${o.id}" style="margin-top:1.1rem">
        Motoboy chegou — conferir
      </button>
    </div>`;
  bindAppClicks();
}

/**
 * Conferência com controles nativos acessíveis (label+input associados).
 * Botão com disabled real + validação no clique (não só aparência).
 */
function renderChecking(o) {
  const missing = missingFor(o);
  const canDeliver = missing.length === 0;

  app().innerHTML = `
    <div class="detail">
      <button type="button" class="detail-back" data-act="home">← Voltar</button>
      <p class="detail-stage">${canDeliver ? "Pronto para entregar" : "Confira antes de entregar"}</p>
      <h1 class="detail-title">Confira antes de entregar</h1>
      <p class="detail-sub">Só sacolas, nome e número. Sem abrir a embalagem.</p>

      <fieldset class="check-fieldset">
        <legend class="sr-only">Confirmações obrigatórias da retirada</legend>
        <ul class="check-list" role="list">
          <li>
            <div class="check-row">
              <input type="checkbox" id="chkBags" name="chkBags"
                ${o._chkBags ? "checked" : ""}
                aria-describedby="hintBags" />
              <label for="chkBags">${bagsLabel(o.bags)}</label>
            </div>
            <p class="check-hint" id="hintBags">Confirme a quantidade de sacolas do pedido.</p>
          </li>
          <li>
            <div class="check-row">
              <input type="checkbox" id="chkName" name="chkName"
                ${o._chkName ? "checked" : ""}
                aria-describedby="hintName" />
              <label for="chkName">Nome do pedido correto</label>
            </div>
            <p class="check-hint" id="hintName">Confirme o nome identificado no pedido.</p>
          </li>
          <li>
            <div class="check-row">
              <input type="checkbox" id="chkIfood" name="chkIfood"
                ${o._chkIfood ? "checked" : ""}
                aria-describedby="hintIfood" />
              <label for="chkIfood">Número do iFood correto</label>
            </div>
            <p class="check-hint" id="hintIfood">Confirme o número ou código do iFood.</p>
          </li>
        </ul>
      </fieldset>

      <div class="rider-soft" role="group" aria-label="Entregador esperado">
        <p class="label-meta">Entregador esperado</p>
        ${
          o.rider_name
            ? `<p class="name">${escapeHtml(o.rider_name)} · <span class="inline-hint">nome informado pelo iFood</span></p>`
            : `<p class="name">Nome do motoboy não informado pelo iFood</p>
               <p class="hint">Confirme pelo número do pedido e pelo código apresentado.</p>`
        }
      </div>

      ${factsHtml(o, { editableResponsible: true })}

      <div class="pending-box ${canDeliver ? "ready" : ""}" id="pendingBox" role="status" aria-live="polite">
        ${
          canDeliver
            ? "Tudo conferido. Pode entregar ao motoboy do iFood."
            : "Para entregar, ainda falta: " + missing.join(" · ") + "."
        }
      </div>
      <button type="button"
        class="primary btn-sovereign wide"
        id="btnDeliver"
        data-act="deliver"
        data-id="${o.id}"
        ${canDeliver ? "" : "disabled"}
        aria-disabled="${canDeliver ? "false" : "true"}"
        aria-describedby="pendingBox">
        Entregar ao motoboy
      </button>
    </div>`;

  const syncChecks = () => {
    o._chkBags = !!$("chkBags")?.checked;
    o._chkName = !!$("chkName")?.checked;
    o._chkIfood = !!$("chkIfood")?.checked;
    const resp = $("fldResponsible");
    if (resp) o.responsible = resp.value;
    // Atualiza gate sem recriar o DOM inteiro (mantém foco acessível)
    updateDeliverButton(o);
  };

  ["chkBags", "chkName", "chkIfood"].forEach((id) => {
    $(id)?.addEventListener("change", syncChecks);
  });
  $("fldResponsible")?.addEventListener("input", syncChecks);

  // Bloqueio funcional no clique mesmo se disabled for contornado
  $("btnDeliver")?.addEventListener("click", (ev) => {
    if (!canDeliverOrder(o)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const m = missingFor(o);
      renderError(
        $("errorBox"),
        m.length
          ? "Ainda falta: " + m.join(", ")
          : "Complete as confirmações antes de entregar.",
      );
      return;
    }
  });

  bindAppClicks();
}

function updateDeliverButton(o) {
  const btn = $("btnDeliver");
  const box = $("pendingBox");
  if (!btn) return;
  const missing = missingFor(o);
  const ok = missing.length === 0;
  btn.disabled = !ok;
  btn.setAttribute("aria-disabled", ok ? "false" : "true");
  if (box) {
    box.classList.toggle("ready", ok);
    box.textContent = ok
      ? "Tudo conferido. Pode entregar ao motoboy do iFood."
      : "Para entregar, ainda falta: " + missing.join(" · ") + ".";
  }
}

function canDeliverOrder(o) {
  return missingFor(o).length === 0;
}

function renderDone(o) {
  app().innerHTML = `
    <div class="detail">
      <p class="detail-stage">Expedição concluída</p>
      <div class="result-block">
        <h1 class="title-sov">Pedido entregue ao motoboy do iFood.</h1>
        <p>Expedição concluída.<br />O andamento posterior é acompanhado pelo canal do iFood.</p>
      </div>
      <button type="button" class="primary btn-sovereign wide" data-act="home" style="margin-top:1.25rem">
        Voltar à expedição
      </button>
    </div>`;
  bindAppClicks();
}

function missingFor(o) {
  const missing = [];
  if (o.state !== "checking") missing.push("pedido na etapa de conferência");
  if (!(o.bags >= 1)) missing.push("quantidade de sacolas definida");
  // Preferir estado do DOM se montado (fonte de verdade da UI)
  const bags = $("chkBags") ? !!$("chkBags").checked : !!o._chkBags;
  const name = $("chkName") ? !!$("chkName").checked : !!o._chkName;
  const ifood = $("chkIfood") ? !!$("chkIfood").checked : !!o._chkIfood;
  if (!bags) missing.push("quantidade de sacolas conferida");
  if (!name) missing.push("nome do pedido conferido");
  if (!ifood) missing.push("número do iFood conferido");
  const resp = ($("fldResponsible")?.value ?? o.responsible ?? "").trim();
  if (!resp) missing.push("responsável pela entrega");
  return missing;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function bindAppClicks() {
  app().querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", onAct);
  });
}

async function onAct(ev) {
  const btn = /** @type {HTMLElement} */ (ev.currentTarget);
  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");

  if (act === "deliver") {
    // Bloqueio funcional real
    const o = find(id || "");
    if (!o || !canDeliverOrder(o) || btn.hasAttribute("disabled") || btn.disabled) {
      ev.preventDefault();
      const m = o ? missingFor(o) : [];
      renderError(
        $("errorBox"),
        m.length
          ? "Ainda falta: " + m.join(", ")
          : "Complete as confirmações antes de entregar.",
      );
      return;
    }
    await deliverOrder(id);
    return;
  }

  if (act === "home") {
    if (activeId) {
      const o = find(activeId);
      if (o?.state === "done") {
        orders = orders.filter((x) => x.id !== o.id);
      }
    }
    activeId = null;
    render();
    return;
  }
  if (act === "open" && id) {
    activeId = id;
    render();
    return;
  }
  if (act === "fetch" && id) {
    await fetchOrder(id);
    return;
  }
  if (act === "rider-here" && id) {
    const o = find(id);
    if (!o) return;
    o.state = "checking";
    o._chkBags = false;
    o._chkName = false;
    o._chkIfood = false;
    render();
  }
}

async function fetchOrder(id) {
  const o = find(id);
  if (!o || o.state !== "ready") return;
  renderError($("errorBox"), null);
  const resp = $("fldResponsible");
  if (resp) o.responsible = resp.value.trim() || o.responsible;
  try {
    const hid = `HO-${Date.now().toString(36)}`;
    const res = await command({
      type: "StartHandoff",
      command_id: cid("hs"),
      occurred_at: nowIso(),
      unit_id: "demo-unit",
      handoff_id: hid,
      external_order_ref: o.platform_ref,
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) throw new Error(res.result?.error || "falha");
    o.expedition_id = hid;
    o.state = "in_hand";
    o.just_ready = false;
    activeId = id;
    render();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

async function deliverOrder(id) {
  const o = find(id);
  if (!o || o.state !== "checking") return;

  // Revalidação obrigatória (não confiar só em disabled visual)
  o._chkBags = !!$("chkBags")?.checked;
  o._chkName = !!$("chkName")?.checked;
  o._chkIfood = !!$("chkIfood")?.checked;
  const respEl = $("fldResponsible");
  if (respEl) o.responsible = respEl.value.trim();

  if (!canDeliverOrder(o)) {
    renderError(
      $("errorBox"),
      "Ainda falta: " + missingFor(o).join(", "),
    );
    updateDeliverButton(o);
    return;
  }
  if (!o.expedition_id) {
    renderError($("errorBox"), "Pedido ainda não foi buscado na conferência.");
    return;
  }
  renderError($("errorBox"), null);
  try {
    const res = await command({
      type: "ConfirmHandoff",
      command_id: cid("hc"),
      occurred_at: nowIso(),
      unit_id: "demo-unit",
      handoff_id: o.expedition_id,
      conference_actor: o.responsible,
      handoff_actor: o.responsible,
      courier_verified: true,
      courier_verification_method: o.rider_name
        ? "nome_e_codigo_plataforma"
        : "numero_pedido_e_codigo",
      volumes: { expected: o.bags, delivered: o.bags },
      order_identified: true,
      actor: { actor_id: "ops-demo", role: "operador_expedicao" },
    });
    if (!res.result?.ok) {
      renderError($("errorBox"), res.result?.error || "Não foi possível concluir");
      return;
    }
    o.state = "done";
    activeId = id;
    render();
  } catch (e) {
    renderError($("errorBox"), e.payload?.result?.error || e.message);
  }
}

/* —— Demo —— */
function demoNewReady() {
  const n = 8600 + Math.floor(Math.random() * 90);
  const ts = Date.now();
  const o = {
    id: `o-${n}-${ts.toString(36)}`,
    local_number: String(n),
    customer_name: "Cliente demo",
    ifood_code: String(1000 + (n % 9000)),
    bags: 1 + (n % 3),
    ready_at: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ready_at_ts: ts,
    platform_ref: `IF-${n}`,
    rider_name: n % 2 === 0 ? "Camila" : null,
    state: "ready",
    expedition_id: null,
    alerted: false,
    just_ready: true,
    responsible: "Juliana",
  };
  orders.push(o); // mais novo no fim; FIFO usa ready_at_ts
  if (prepCount > 0) prepCount -= 1;
  maybeAlertReady(o);
  activeId = null;
  render();
}

function demoEmpty() {
  if (alertTimer) clearTimeout(alertTimer);
  orders = orders.filter((o) => o.state !== "ready");
  orders.forEach((o) => {
    o.just_ready = false;
  });
  prepCount = 2;
  activeId = null;
  render();
}

function initSoundToggle() {
  const el = $("soundEnabled");
  if (!el) return;
  el.checked = localStorage.getItem(STORAGE_SOUND) !== "0";
  el.addEventListener("change", () => {
    localStorage.setItem(STORAGE_SOUND, el.checked ? "1" : "0");
  });
}

// boot — seed com aviso temporário no pedido mais novo; ação FIFO no mais antigo
seedOrders();
const newestReady = readyOrdersFifo().slice(-1)[0];
if (newestReady && !newestReady.alerted) {
  maybeAlertReady(newestReady);
} else if (newestReady?.just_ready) {
  lastPulseId = newestReady.id;
  if (alertTimer) clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    newestReady.just_ready = false;
    lastPulseId = null;
    alertTimer = null;
    if (!activeId) renderHome();
  }, ALERT_MS);
}

initSoundToggle();
$("btnDemoReady")?.addEventListener("click", demoNewReady);
$("btnDemoEmpty")?.addEventListener("click", demoEmpty);
$("btnDemoReset")?.addEventListener("click", () => {
  seedOrders();
  const f = find("o-8640");
  if (f) {
    f.alerted = false;
    f.just_ready = true;
    maybeAlertReady(f);
  }
  render();
});
render();
snapshot().catch(() => {});
