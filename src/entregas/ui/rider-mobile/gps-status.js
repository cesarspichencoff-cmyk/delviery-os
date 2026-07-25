/* Status de GPS do motoboy — liga o watcher REAL do navegador ao indicador
 * persistente da tela.
 *
 * Regras que esta camada obedece (COR §21.1 + Adendo GPS):
 *  - só liga com viagem ativa; sem viagem, o watcher não existe;
 *  - stop() chama clearWatch de verdade — não é só esconder o rótulo;
 *  - nunca apresenta posição velha como atual (freshness explícito);
 *  - não mostra coordenada ao motoboy (não é útil para ele) nem imprime
 *    coordenada em console;
 *  - sem velocidade média, sem ranking, sem produtividade.
 */

const FRESHNESS_TEXT = {
  current: "Localização atual",
  stale: "Posição antiga",
  inaccurate: "Localização imprecisa",
  offline: "Sem rede — pontos guardados",
  permission_denied: "Permissão de localização negada",
  unavailable: "Sem sinal de GPS",
  unknown: "Sem viagem ativa",
};

/** Espelha a política do servidor; os limites viajam no /api/config. */
const DEFAULTS = { freshness_window_s: 90, max_accuracy_good_m: 30, max_accuracy_usable_m: 100 };

export function createGpsStatus(opts = {}) {
  const policy = { ...DEFAULTS, ...(opts.policy || {}) };
  const send = opts.send || (async () => {});
  const onRender = opts.onRender || (() => {});
  const geo = opts.geolocation || (typeof navigator !== "undefined" ? navigator.geolocation : null);
  const now = opts.now || (() => new Date());

  let watchId = null;
  let tripId = null;
  let lastAt = null;      // ISO do último ponto aceito
  let lastAccuracy = null;
  let lastError = null;
  let pending = 0;
  let online = typeof navigator === "undefined" ? true : navigator.onLine !== false;

  function freshness() {
    if (!tripId) return "unknown";
    if (lastError === "permission_denied") return "permission_denied";
    if (!lastAt) return online ? "unavailable" : "offline";
    if (!online) return "offline";
    const age = (now().getTime() - Date.parse(lastAt)) / 1000;
    if (age > policy.freshness_window_s) return "stale";
    if (lastAccuracy != null && lastAccuracy > policy.max_accuracy_good_m) return "inaccurate";
    return "current";
  }

  function shortTrip(id) {
    if (!id) return "";
    return String(id).length > 10 ? `${String(id).slice(0, 8)}…` : String(id);
  }

  function ageLabel() {
    if (!lastAt) return "sem atualização";
    const s = Math.max(0, Math.round((now().getTime() - Date.parse(lastAt)) / 1000));
    if (s < 60) return `há ${s}s`;
    const m = Math.round(s / 60);
    return m < 60 ? `há ${m} min` : `há mais de 1 h`;
  }

  function state() {
    const f = freshness();
    return {
      running: watchId !== null,
      trip_id: tripId,
      // Indicador persistente exigido pelo contrato de tela.
      banner: tripId && watchId !== null
        ? `GPS ATIVO — VIAGEM ${shortTrip(tripId)}`
        : "GPS DESLIGADO — SEM VIAGEM ATIVA",
      freshness: f,
      freshness_text: FRESHNESS_TEXT[f],
      last_update_label: ageLabel(),
      accuracy_m: lastAccuracy,
      online,
      pending_sync: pending,
      error: lastError,
      // Aviso honesto sobre a limitação do runtime.
      foreground_notice: "O GPS depende deste aplicativo aberto durante a viagem.",
    };
  }

  function render() {
    onRender(state());
  }

  function handlePosition(pos) {
    lastError = null;
    const iso = new Date(pos.timestamp).toISOString();
    lastAt = iso;
    lastAccuracy = pos.coords.accuracy;
    pending += 1;
    render();
    // Envia; a fila real de retentativa vive no servidor/queue.
    Promise.resolve(
      send({
        trip_id: tripId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        speed_mps: pos.coords.speed == null ? undefined : pos.coords.speed,
        heading_deg: pos.coords.heading == null ? undefined : pos.coords.heading,
        occurred_at: iso,
      }),
    )
      .then(() => {
        pending = Math.max(0, pending - 1);
        render();
      })
      .catch(() => {
        // Mantém pendente: o ponto não se perde, sobe depois.
        render();
      });
  }

  function handleError(err) {
    const map = { 1: "permission_denied", 2: "position_unavailable", 3: "timeout" };
    lastError = map[err && err.code] || "position_unavailable";
    render();
  }

  return {
    /** Liga a captura para UMA viagem. Sem trip_id, não liga. */
    start(trip_id) {
      if (!trip_id) return { ok: false, error: "no_active_trip" };
      if (!geo) {
        lastError = "not_supported";
        render();
        return { ok: false, error: "not_supported" };
      }
      if (watchId !== null && tripId === trip_id) return { ok: true };
      if (watchId !== null) this.stop();
      tripId = trip_id;
      watchId = geo.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      });
      render();
      return { ok: true };
    },

    /** Desliga de verdade. Chamado ao encerrar/cancelar/abandonar a viagem. */
    stop() {
      if (watchId !== null && geo) geo.clearWatch(watchId);
      watchId = null;
      tripId = null;
      lastAt = null;
      lastAccuracy = null;
      render();
    },

    setOnline(v) {
      online = !!v;
      render();
    },
    setPending(n) {
      pending = Number(n) || 0;
      render();
    },
    state,
    isRunning: () => watchId !== null,
  };
}

/** Renderiza o status no DOM. Nunca escreve coordenada na tela. */
export function renderGpsStatus(el, s) {
  if (!el) return;
  el.dataset.freshness = s.freshness;
  el.dataset.running = String(s.running);
  const parts = [s.freshness_text];
  if (s.running && s.freshness !== "unknown") {
    parts.push(s.last_update_label);
    if (s.accuracy_m != null) parts.push(`precisão ~${Math.round(s.accuracy_m)} m`);
  }
  if (s.pending_sync > 0) parts.push(`${s.pending_sync} aguardando envio`);
  el.textContent = `${s.banner} · ${parts.join(" · ")}`;
}
