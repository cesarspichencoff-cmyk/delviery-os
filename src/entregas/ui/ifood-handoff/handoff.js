/**
 * Expedição iFood — experiência reconstruída
 * Home simples · uma atenção · uma ação
 * Domínio: StartHandoff / ConfirmHandoff (sem alterar regras)
 * Sem perfil de motoboy externo · sem jargão na UI
 */
import { snapshot, command, renderError } from "../shared/client.js";

const $ = (id) => document.getElementById(id);
const app = () => $("app") || document.getElementById("app");

const STORAGE_SOUND = "entregas_ifood_sound";
const nowIso = () => new Date().toISOString();
let seq = 1;
const cid = (p) => `${p}-${seq++}`;

/**
 * Estados visíveis (UI)
 * ready | in_hand | checking | done
 * prep = só contagem secundária na home
 */
/** @typedef {'ready'|'in_hand'|'checking'|'done'} OrderUiState */

/**
 * @typedef {object} ExpOrder
 * @property {string} id
 * @property {string} local_number
 * @property {string} customer_name
 * @property {string} ifood_code
 * @property {number} bags
 * @property {string} ready_at
 * @property {string} platform_ref
 * @property {string|null} rider_name
 * @property {OrderUiState} state
 * @property {string|null} expedition_id
 * @property {boolean} alerted
 * @property {boolean} just_ready
 * @property {string} responsible
 */

/** @type {ExpOrder[]} */
let orders = [];
/** @type {string|null} */
let activeId = null;
let prepCount = 2;
let lastPulseId = null;

function bagsLabel(n) {
  return n === 1 ? "1 sacola" : `${n} sacolas`;
}

function seedOrders() {
  orders = [
    {
      id: "o-8640",
      local_number: "8640",
      customer_name: "Marina Alves",
      ifood_code: "4821",
      bags: 2,
      ready_at: "19:42",
      platform_ref: "IF-9001",
      rider_name: "Lucas",
      state: "ready",
      expedition_id: null,
      alerted: false,
      just_ready: true,
      responsible: "Juliana",
    },
    {
      id: "o-8638",
      local_number: "8638",
      customer_name: "Pedro Lima",
      ifood_code: "7710",
      bags: 1,
      ready_at: "19:35",
      platform_ref: "IF-8998",
      rider_name: null,
      state: "ready",
      expedition_id: null,
      alerted: true,
      just_ready: false,
      responsible: "Juliana",
    },
    {
      id: "o-8635",
      local_number: "8635",
      customer_name: "Ana Costa",
      ifood_code: "3302",
      bags: 3,
      ready_at: "19:28",
      platform_ref: "IF-8990",
      rider_name: "Rafael",
      state: "ready",
      expedition_id: null,
      alerted: true,
      just_ready: false,
      responsible: "Juliana",
    },
  ];
  prepCount = 2;
  activeId = null;
  lastPulseId = null;
}

function readyOrders() {
  return orders.filter((o) => o.state === "ready");
}

function waitingOrders() {
  return orders.filter((o) => o.state === "in_hand" || o.state === "checking");
}

function find(id) {
  return orders.find((o) => o.id === id);
}

function soundEnabled() {
  const el = $("soundEnabled");
  if (el) return el.checked;
  return localStorage.getItem(STORAGE_SOUND) !== "0";
}

function playReadyChime() {
  if (!soundEnabled()) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    /* ainda pode tocar um bip curto; se reduced-motion, skip */
  }
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
    /* silencioso se bloqueado */
  }
}

/** Aviso uma vez por pedido */
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
    if (!o || o.state === "done") {
      // concluído: mostrar conclusão e depois home
      if (o?.state === "done") renderDone(o);
      else {
        activeId = null;
        renderHome();
      }
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
  const ready = readyOrders();
  const waiting = waitingOrders();
  const highlight =
    ready.find((o) => o.just_ready) || ready[0] || null;
  const count = ready.length;
  const pulse = highlight && lastPulseId === highlight.id;

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
    focusHtml = `
      <p class="home-count-label">Prontos para buscar</p>
      <p class="home-count" id="readyCount">${count} pedido${count === 1 ? "" : "s"} pronto${count === 1 ? "" : "s"}</p>
      ${prepCount > 0 ? `<p class="prep-line">${prepCount} em preparo</p>` : ""}
      <div class="focus-card ${pulse ? "pulse-in" : ""}" data-order="${highlight.id}">
        <p class="label-meta">Acabou de ficar pronto</p>
        <h2 class="title-sov">Pedido #${highlight.local_number} ficou pronto.</h2>
        <p class="sub-human">Vá buscar na conferência.</p>
        <button type="button" class="primary btn-sovereign" data-act="fetch" data-id="${highlight.id}">
          Buscar pedido
        </button>
      </div>`;
  }

  const queueReady = ready.filter((o) => o.id !== highlight?.id);
  const queueBlocks = [];
  if (queueReady.length) {
    queueBlocks.push(`
      <div class="queue-section">
        <p class="label-meta">Ainda aguardam retirada</p>
        <ul class="queue-list">
          ${queueReady
            .map(
              (o) => `
            <li>
              <button type="button" class="queue-item" data-act="open" data-id="${o.id}">
                <span>#${o.local_number} · ${o.customer_name}</span>
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
                <span>#${o.local_number}</span>
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

  if (pulse && highlight) {
    lastPulseId = null;
    highlight.just_ready = false;
  }
  bindAppClicks();
}

function factsHtml(o, { editableResponsible = false } = {}) {
  const riderBlock = o.rider_name
    ? `<div class="fact">
        <dt>Motoboy esperado</dt>
        <dd>${escapeHtml(o.rider_name)}
          <span class="hint">Nome informado pelo iFood</span>
        </dd>
      </div>`
    : `<div class="fact">
        <dt>Motoboy esperado</dt>
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
      ${riderBlock}
      <div class="fact">
        <dt>Responsável interno pela entrega</dt>
        <dd>
          ${
            editableResponsible
              ? `<input id="fldResponsible" value="${escapeAttr(o.responsible)}" autocomplete="name" aria-label="Responsável interno" />`
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
      <h1 class="detail-title">Pedido #${escapeHtml(o.local_number)} ficou pronto.</h1>
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

function renderChecking(o) {
  const missing = missingFor(o);
  const ready = missing.length === 0;
  app().innerHTML = `
    <div class="detail">
      <button type="button" class="detail-back" data-act="home">← Voltar</button>
      <p class="detail-stage">${ready ? "Pronto para entregar" : "Confira antes de entregar"}</p>
      <h1 class="detail-title">Confira antes de entregar</h1>
      <p class="detail-sub">Só sacolas, nome e número. Sem abrir a embalagem.</p>

      <div class="check-block">
        <ul class="check-list">
          <li>
            <label>
              <input type="checkbox" id="chkBags" ${o._chkBags ? "checked" : ""} />
              ${bagsLabel(o.bags)}
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" id="chkName" ${o._chkName ? "checked" : ""} />
              Nome do pedido correto
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" id="chkIfood" ${o._chkIfood ? "checked" : ""} />
              Número do iFood correto
            </label>
          </li>
        </ul>
      </div>

      <div class="rider-soft">
        <p class="label-meta">Motoboy esperado</p>
        ${
          o.rider_name
            ? `<p class="name">${escapeHtml(o.rider_name)}</p>
               <p class="hint">Nome informado pelo iFood</p>`
            : `<p class="name">Nome do motoboy não informado pelo iFood</p>
               <p class="hint">Confirme pelo número do pedido e pelo código apresentado.</p>`
        }
      </div>

      ${factsHtml(o, { editableResponsible: true })}

      <div class="pending-box ${ready ? "ready" : ""}" id="pendingBox" role="status">
        ${
          ready
            ? "Tudo conferido. Pode entregar ao motoboy do iFood."
            : "Para entregar, ainda falta: " + missing.join(" · ") + "."
        }
      </div>
      <button type="button" class="primary btn-sovereign wide" id="btnDeliver" data-act="deliver" data-id="${o.id}" ${ready ? "" : "disabled"}>
        Entregar ao motoboy
      </button>
    </div>`;

  ["chkBags", "chkName", "chkIfood"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      o._chkBags = $("chkBags")?.checked;
      o._chkName = $("chkName")?.checked;
      o._chkIfood = $("chkIfood")?.checked;
      const resp = $("fldResponsible");
      if (resp) o.responsible = resp.value;
      renderChecking(o);
    });
  });
  $("fldResponsible")?.addEventListener("input", () => {
    o.responsible = $("fldResponsible").value;
    renderChecking(o);
  });
  bindAppClicks();
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
  if (!o._chkBags) missing.push("quantidade de sacolas conferida");
  if (!o._chkName) missing.push("nome do pedido conferido");
  if (!o._chkIfood) missing.push("número do iFood conferido");
  const resp = ($("fldResponsible")?.value ?? o.responsible ?? "").trim();
  if (!resp) missing.push("responsável interno identificado");
  // rider name NEVER required
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
  const btn = ev.currentTarget;
  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");
  if (act === "home") {
    // se done, remove da fila ativa
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
    const o = find(id);
    if (o?.state === "ready") {
      /* detail ready */
    }
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
    return;
  }
  if (act === "deliver" && id) {
    await deliverOrder(id);
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
  const respEl = $("fldResponsible");
  if (respEl) o.responsible = respEl.value.trim();
  o._chkBags = $("chkBags")?.checked;
  o._chkName = $("chkName")?.checked;
  o._chkIfood = $("chkIfood")?.checked;
  const missing = missingFor(o);
  if (missing.length) {
    renderError($("errorBox"), "Ainda falta: " + missing.join(", "));
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

/* —— Demo controls —— */
function demoNewReady() {
  const n = 8600 + Math.floor(Math.random() * 90);
  const o = {
    id: `o-${n}-${Date.now().toString(36)}`,
    local_number: String(n),
    customer_name: "Cliente demo",
    ifood_code: String(1000 + (n % 9000)),
    bags: 1 + (n % 3),
    ready_at: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    platform_ref: `IF-${n}`,
    rider_name: n % 2 === 0 ? "Camila" : null,
    state: "ready",
    expedition_id: null,
    alerted: false,
    just_ready: true,
    responsible: "Juliana",
  };
  orders.unshift(o);
  if (prepCount > 0) prepCount -= 1;
  maybeAlertReady(o);
  activeId = null;
  render();
}

function demoEmpty() {
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

// boot
seedOrders();
// alerta só no destaque inicial (uma vez)
const first = orders.find((o) => o.just_ready);
if (first) maybeAlertReady(first);
initSoundToggle();
$("btnDemoReady")?.addEventListener("click", demoNewReady);
$("btnDemoEmpty")?.addEventListener("click", demoEmpty);
$("btnDemoReset")?.addEventListener("click", () => {
  seedOrders();
  const f = orders.find((o) => o.just_ready);
  if (f) {
    f.alerted = false;
    maybeAlertReady(f);
  }
  render();
});
render();

// snapshot opcional (sessão domínio) — não bloqueia UI
snapshot().catch(() => {});
