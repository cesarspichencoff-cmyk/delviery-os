import {
  snapshot,
  command,
  chip,
  renderError,
  connectionState,
  api,
} from "../shared/client.js";
import {
  createConsentScreen,
  renderConsentScreen,
  CONSENT_LABELS,
  DECLINE_CONSEQUENCE,
} from "./consent-screen.js";
import { createGpsStatus, renderGpsStatus } from "./gps-status.js";
import {
  detectNativeBridge,
  listenNative,
  createNativeGeolocation,
  permissionFromNative,
  permissionFromStatus,
} from "./native-bridge.js";
import { captureDecision, OFF_REASON_TEXT } from "./capture-rule.js";

const $ = (id) => document.getElementById(id);
let snap = null;
let seq = 1;
const now = () => new Date().toISOString();
const cid = (p) => `${p}-${seq++}`;

/* ---------------- Captura nativa (Q-018) ----------------
 * A página decide quando PEDIR a captura (capture-rule.js) e mostra o que o
 * aparelho respondeu; o Kotlin captura, guarda e sincroniza. A página nunca
 * manda ponto ao servidor e nunca liga o GPS do navegador. */
const nativeFound = detectNativeBridge(window);
const native = nativeFound.bridge;
const nativeGeo = createNativeGeolocation();
// `send` fica no padrão (não envia nada): quem sincroniza é o Kotlin.
const gps = createGpsStatus({
  geolocation: nativeGeo,
  onRender: (st) => renderGpsStatus($("gpsStatus"), st),
});
const cap = {
  ready: false,
  initializing: false,
  initError: null,
  me: null,
  deviceId: null,
  appVersion: null,
  policies: null,
  ack: null,
  consent: null,
  permission: "unknown",
  permissionAsked: false,
  requestedTrip: null, // pedida ao nativo nesta página
  runningTrip: null, // confirmada pelo nativo (service_state)
  blockedTrip: null, // o portão nativo recusou; tenta de novo só com fato novo
  nativeDetail: null, // a frase do portão nativo, como veio
};
const POLL_MS = 15000;
let pollTimer = null;

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
  syncCapture(t);

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
      // "Cheguei" e' ato humano: relato, nao deteccao de sensor.
      type: "RecordArrivalReported",
      command_id: cid("arr"),
      occurred_at: now(),
      unit_id: "demo-unit",
      trip_id: t.trip_id,
      delivery_id: s.delivery_id,
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

/* ---------------- Captura nativa (Q-018) ---------------- */

/** Liga, desliga e mostra — sempre a partir da regra e do que o nativo disse. */
function syncCapture(t) {
  if (!native) {
    // Navegador comum (ou aplicativo sem a ponte nova): não há GPS nenhum.
    gps.setOffReason(t ? OFF_REASON_TEXT[nativeFound.present ? "ponte_incompativel" : "sem_ponte"] : null);
    $("locLine").textContent = nativeFound.present
      ? "Atualize o aplicativo para a localização funcionar."
      : "A localização é capturada só pelo aplicativo Android, durante a viagem.";
    return;
  }
  if (!cap.ready) {
    if (!cap.initializing) void initCapture();
    return;
  }
  const d = captureDecision({
    native: true,
    actor: cap.me,
    policies: cap.policies,
    ack: cap.ack,
    deviceId: cap.deviceId,
    permission: cap.permission,
    trip: t || null,
  });

  // Desligar: o que foi pedido ou está rodando não vale mais — a viagem
  // acabou, trocou, ou a permissão caiu. GPS só durante viagem ativa (L6).
  const bound = cap.requestedTrip || cap.runningTrip;
  if (bound && (!d.capture || d.trip_id !== bound)) {
    cap.requestedTrip = null;
    cap.runningTrip = null;
    native.stopTripCapture();
  }
  // Ligar: uma vez por viagem nesta página. Recusa do portão nativo só é
  // tentada de novo com fato novo (permissão relida, volta das configurações).
  if (d.capture && cap.requestedTrip !== d.trip_id && cap.blockedTrip !== d.trip_id) {
    cap.requestedTrip = d.trip_id;
    cap.nativeDetail = null;
    native.startTripCapture(d.trip_id);
  }
  renderCapture(t, d);
  schedulePoll();
}

function renderCapture(t, d) {
  if (cap.runningTrip && d.capture && cap.runningTrip === d.trip_id) {
    gps.start(d.trip_id); // idempotente para a mesma viagem
    gps.setOffReason(null);
  } else {
    if (gps.isRunning()) gps.stop();
    let reason = d.reason;
    if (d.capture) reason = cap.blockedTrip === d.trip_id ? "bloqueado_no_aparelho" : "ligando";
    gps.setOffReason(t ? OFF_REASON_TEXT[reason] : null);
  }
  // A linha de apoio usa as frases que já existem (portão nativo, termo).
  let line = "";
  if (cap.initError) line = cap.initError;
  else if (cap.nativeDetail && !cap.runningTrip) line = cap.nativeDetail;
  else if (d.reason === "termo_recusado") line = DECLINE_CONSEQUENCE;
  else if (d.reason === "sem_permissao" && cap.permission === "denied")
    line = "A permissão de localização está negada nas configurações do aparelho.";
  else if (d.reason === "gps_desligado") line = "A localização está desligada na configuração do sistema.";
  else if (d.reason === "termo_indisponivel") line = "O termo de localização ainda não foi liberado pelo responsável.";
  else if (d.reason === "sem_aceite" || d.reason === "termo_desatualizado")
    line = "Você precisa ler e aceitar o termo de localização.";
  $("locLine").textContent = line;
  $("btnLocationSettings").hidden = !(d.reason === "sem_permissao" && cap.permission === "denied");
}

/** Enquanto houver captura pedida ou rodando, relê a viagem: é assim que o fim chega. */
function schedulePoll() {
  const need = Boolean(cap.requestedTrip || cap.runningTrip);
  if (need && !pollTimer) {
    pollTimer = setInterval(() => {
      refresh().catch(() => {
        /* sem leitura não há prova de fim: a captura segue até ler de novo */
      });
    }, POLL_MS);
  } else if (!need && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onNativeMessage(m) {
  if (m.type === "service_state") {
    // Do MainActivity (onResume, resultado do pedido): só a permissão.
    if (typeof m.permission_state === "string") {
      cap.permission = permissionFromNative(m.permission_state);
      cap.blockedTrip = null; // fato novo: vale tentar de novo
    } else if (m.foreground_service_running === true && m.bound_trip_id) {
      cap.runningTrip = String(m.bound_trip_id);
      cap.blockedTrip = null;
      cap.nativeDetail = null;
    } else if (m.foreground_service_running === false && "stop_reason" in m) {
      cap.runningTrip = null; // o serviço parou (encerramento ou portão)
    }
  } else if (m.type === "error") {
    // O portão do Kotlin recusou: a frase é a dele (CaptureGate).
    cap.nativeDetail = m.detail ? String(m.detail) : null;
    if (cap.requestedTrip) cap.blockedTrip = cap.requestedTrip;
    cap.requestedTrip = null;
  }
  nativeGeo.feed(m);
  syncCapture(activeTrip());
}

async function initCapture() {
  cap.initializing = true;
  try {
    const sess = await api("/api/session");
    cap.me = sess.actor || null;
    const caps = native.capabilities() || {};
    cap.deviceId = typeof caps.device_id === "string" && caps.device_id ? caps.device_id : null;
    cap.appVersion = typeof caps.app_version === "string" ? caps.app_version : null;
    const st = native.status();
    cap.permission = permissionFromStatus(st);
    cap.runningTrip = st && st.active_trip_id ? String(st.active_trip_id) : null;
    if (cap.me && cap.me.role === "motoboy_interno") {
      // Políticas: busca com a sessão do motoboy e repassa ao Kotlin o corpo
      // EXATO que o servidor deu — a página não reconstrói política.
      const res = await fetch("/api/policies");
      const body = await res.text();
      if (!res.ok) throw new Error("Não foi possível ler a configuração de localização.");
      native.applyServerPolicies(body);
      cap.policies = JSON.parse(body);
      const flagOn = cap.policies.flags && cap.policies.flags.gps_capture_enabled === true;
      const publishable = cap.policies.term && cap.policies.term.publishable === true;
      if (flagOn && publishable && cap.deviceId) {
        const tr = await api(`/api/term?device_id=${encodeURIComponent(cap.deviceId)}`);
        if (tr.acknowledgement) adoptAck(tr.acknowledgement);
        else if (tr.term) showConsent(tr.term);
      }
    }
    cap.initError = null;
    cap.ready = true;
  } catch (e) {
    cap.initError = e && e.message ? e.message : "Não foi possível preparar a localização.";
    $("locLine").textContent = cap.initError;
  } finally {
    cap.initializing = false;
  }
  if (cap.ready) syncCapture(activeTrip());
}

/** O registro é do servidor; o Kotlin guarda a cópia e confere o aparelho. */
function adoptAck(record) {
  const r = native.recordTermAcknowledgement(record);
  if (!r || r.ok !== true) throw new Error("O aparelho não aceitou o registro do termo.");
  cap.ack = record;
  $("consent").hidden = true;
  // Permissão só DEPOIS do termo registrado (ordem do primeiro acesso).
  if (record.status === "accepted" && cap.permission !== "granted" && !cap.permissionAsked) {
    cap.permissionAsked = true;
    native.requestLocationPermission();
  }
}

function showConsent(term) {
  cap.consent = createConsentScreen({
    term,
    summary: term.summary || "",
    onAccept: () => answerTerm("accepted"),
    onDecline: () => answerTerm("declined"),
    onRender: renderConsent,
  });
  $("consent").hidden = false;
  renderConsent(cap.consent.state());
}

function renderConsent(st) {
  renderConsentScreen($("consentText"), st);
  $("btnConsentFull").textContent = CONSENT_LABELS.read_full;
  $("consentCheckLabel").textContent = CONSENT_LABELS.checkbox;
  $("consentCheck").checked = st.checked;
  $("btnConsentAccept").textContent = CONSENT_LABELS.accept;
  $("btnConsentAccept").disabled = !st.can_accept;
  $("btnConsentDecline").textContent = CONSENT_LABELS.decline;
  $("btnConsentDecline").disabled = !st.can_decline;
}

/** A página manda só a escolha e o aparelho; o servidor monta o registro. */
async function answerTerm(status) {
  const res = await fetch("/api/term/acknowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, device_id: cap.deviceId, app_version: cap.appVersion || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true || !data.record) {
    throw new Error(data.human || "Não foi possível registrar a resposta ao termo.");
  }
  adoptAck(data.record);
  syncCapture(activeTrip());
  return { ok: true };
}

$("consentCheck").addEventListener("change", (e) => {
  if (cap.consent) cap.consent.setChecked(e.target.checked === true);
});
$("btnConsentFull").addEventListener("click", () => {
  if (cap.consent) cap.consent.toggleFull();
});
$("btnConsentAccept").addEventListener("click", () => {
  if (cap.consent) void cap.consent.accept({});
});
$("btnConsentDecline").addEventListener("click", () => {
  if (cap.consent) cap.consent.decline({}).catch((e) => renderError($("errorBox"), e.message));
});
$("btnLocationSettings").addEventListener("click", () => {
  if (native) native.openAppSettings();
});
document.addEventListener("visibilitychange", () => {
  // Volta do mapa ou das configurações: relê a viagem na hora.
  if (native && document.visibilityState === "visible") refresh().catch(() => {});
});

if (native) listenNative(window, onNativeMessage);
refresh().catch((e) => renderError($("errorBox"), e.message));
