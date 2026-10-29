/* Localização e linha do tempo na central de despacho.
 *
 * Duas regras que este módulo obedece, e que o teste cobra:
 *  - freshness aparece SEMPRE, para todo papel. Coordenada, só para papel
 *    autorizado. Saber que o motoboy está sem sinal há 10 minutos não expõe
 *    ninguém — e é o que faz o operador ligar para ele;
 *  - chegada detectada, chegada relatada e entrega confirmada são três linhas
 *    distintas, com autor distinto. Nenhuma chegada aparece como entrega.
 */

/** Ordem de gravidade: o que exige ação primeiro. */
const SEVERITY = {
  permission_denied: 0,
  unavailable: 1,
  offline: 2,
  stale: 3,
  inaccurate: 4,
  unknown: 5,
  current: 6,
};

export function createDispatchLocation(opts = {}) {
  const fetchJson = opts.fetchJson || (async () => null);
  const onRender = opts.onRender || (() => {});
  const now = opts.now || (() => new Date());

  let tripId = null;
  let location = null;
  let timeline = [];
  let arrivals = [];
  let error = null;
  let loading = false;
  let generation = 0;
  let receivedAt = 0;

  function ageLabel(age_s) {
    if (age_s == null) return "sem atualização";
    if (age_s < 60) return `há ${age_s}s`;
    const m = Math.round(age_s / 60);
    return m < 60 ? `há ${m} min` : "há mais de 1 h";
  }

  function state() {
    const elapsed = Math.max(0, (now().getTime() - receivedAt) / 1000);
    // Cache de tela: não altera os limiares do GPS calculados no servidor.
    const valid = location && elapsed < 30;
    const f = valid ? location.freshness : "unknown";
    return {
      trip_id: tripId,
      loading,
      error,
      freshness: f,
      severity: SEVERITY[f] ?? 5,
      // Frase sempre presente: a tela nunca fica muda sobre o estado do sinal.
      label: valid ? location.label : location ? "Posição aguardando atualização" : "Sem posição nesta viagem",
      age_label: ageLabel(location && location.age_s != null ? Math.floor(location.age_s + elapsed) : undefined),
      accuracy_m: location ? location.accuracy_m : undefined,
      point_count: location ? location.point_count : 0,
      usable: Boolean(valid && location.usable),
      coordinates_visible: Boolean(valid && location.coordinates_visible),
      // Só existe quando o papel pode ver. Ausência é o default.
      last_point: valid && location.coordinates_visible ? location.last_point : undefined,
      timeline,
      arrivals,
      // Contagem que interessa ao operador: quantas paradas chegaram mas não
      // foram confirmadas. É o buraco que gera ligação de cliente.
      pending_confirmation: arrivals.filter(
        (a) => (a.detected_at || a.reported_at) && !a.confirmed_at,
      ).length,
    };
  }

  function render() {
    onRender(state());
  }

  function clear() {
    location = null;
    timeline = [];
    arrivals = [];
    error = null;
    loading = false;
  }

  function setTrip(id) {
    generation += 1;
    tripId = id || null;
    clear();
    render();
  }

  async function refresh(id = tripId) {
    const request = ++generation;
    tripId = id || null;
    const requestedTrip = tripId;
    clear();
    if (!requestedTrip) { render(); return; }
    loading = true;
    render();
    try {
      const [loc, tl] = await Promise.all([
        fetchJson(`/api/trip/location?trip_id=${encodeURIComponent(requestedTrip)}`),
        fetchJson(`/api/trip/timeline?trip_id=${encodeURIComponent(requestedTrip)}`),
      ]);
      if (request !== generation) return;
      if (!loc?.ok || !tl?.ok || (loc.trip_id && loc.trip_id !== requestedTrip)) {
        throw new Error("Resposta indisponível ou fora da viagem");
      }
      location = loc;
      receivedAt = now().getTime();
      timeline = tl.timeline || [];
      arrivals = tl.arrivals || [];
    } catch (e) {
      if (request !== generation) return;
      clear();
      error = "Não foi possível atualizar agora.";
    } finally {
      if (request === generation) {
        loading = false;
        render();
      }
    }
  }

  return { refresh, state, setTrip };
}

/** Renderiza o estado do sinal. Nunca escreve coordenada. */
export function renderLocationLine(el, s) {
  if (!el) return;
  el.dataset.freshness = s.freshness;
  el.dataset.usable = String(s.usable);
  const parts = [s.label];
  if (s.point_count > 0) {
    parts.push(s.age_label);
    if (s.accuracy_m != null) parts.push(`precisão ~${s.accuracy_m} m`);
  }
  if (s.pending_confirmation > 0) {
    parts.push(`${s.pending_confirmation} parada(s) sem confirmação`);
  }
  if (s.error) parts.push(s.error);
  el.textContent = parts.join(" · ");
}

/** Renderiza a linha do tempo. Rotula autor e marca observação de sombra. */
export function renderTimeline(el, s) {
  if (!el) return;
  if (!s.timeline.length) {
    el.textContent = "Sem eventos nesta viagem ainda.";
    el.dataset.count = "0";
    return;
  }
  el.dataset.count = String(s.timeline.length);
  el.innerHTML = s.timeline
    .map((e) => {
      const hora = String(e.at).slice(11, 16);
      const autor =
        e.author === "sistema"
          ? "sistema"
          : e.author === "motoboy"
            ? "motoboy"
            : e.author === "operacao"
              ? "operação"
              : "—";
      const sombra = e.shadow ? ' <em class="shadow">(observação, não encerra)</em>' : "";
      return (
        `<div class="tl-row" data-author="${e.author}" data-confirms="${e.confirms_delivery}">` +
        `<span class="tl-time">${hora}</span>` +
        `<span class="tl-label">${e.label}</span>` +
        `<span class="tl-author">${autor}</span>${sombra}` +
        `</div>`
      );
    })
    .join("");
}
