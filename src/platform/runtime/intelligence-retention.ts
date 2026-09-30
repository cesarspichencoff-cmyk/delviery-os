/**
 * Q-015 — retenção da Intelligence Spine.
 *
 * A política foi aprovada pelo César em 2026-09-30:
 * - Spine: 60 s;
 * - ciclos de saúde: 7 dias;
 * - evidência de pedido terminal: 30 dias;
 * - recomendações/decisões terminais: 90 dias.
 *
 * Retenção nunca decide fato operacional. Ela só compacta o store derivado
 * da inteligência, e falha deve permanecer contida no runtime assíncrono.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export const INTELLIGENCE_SPINE_INTERVAL_MS = 60_000;
export const INTELLIGENCE_COMPACTION_INTERVAL_MS = 60 * 60 * 1000;

export const INTELLIGENCE_RETENTION = Object.freeze({
  live_cycle_runs_ms: 7 * DIA_MS,
  terminal_order_ms: 30 * DIA_MS,
  terminal_recommendation_ms: 90 * DIA_MS,
});

type Registro = Record<string, unknown>;

export interface IntelligenceStore {
  all(entity: string): Registro[];
  load(entity: string): number;
  put(entity: string, record: Registro): { ok: boolean; action: string; errors?: string[] };
  rewrite(
    entity: string,
    records: Registro[],
  ): { ok: boolean; action: string; records?: number; errors?: string[] };
}

export interface RetentionSummary {
  live_cycle_runs: { antes: number; depois: number };
  live_observations: { antes: number; depois: number };
  conference_clock_events: { antes: number; depois: number };
  copilot_recommendations: { antes: number; depois: number };
  pedidos_terminais_expirados: number;
}

const TERMINAL_ORDER_STATUS = new Set(["completed", "cancelled"]);
const TERMINAL_RECOMMENDATION_STATUS = new Set([
  "expired",
  "dismissed",
  "invalidated",
  "accepted_for_future",
]);

function instante(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function reescrever(store: IntelligenceStore, entity: string, records: Registro[]): void {
  const r = store.rewrite(entity, records);
  if (!r.ok) {
    throw new Error(`intelligence_retention_rewrite_failed:${entity}:${r.action}`);
  }
}

/**
 * Mantém toda a história de pedido enquanto ele não for comprovadamente
 * terminal. Ambiguidade conserva; retenção nunca transforma UNKNOWN em fim.
 */
export function aplicarRetencaoDaInteligencia(
  store: IntelligenceStore,
  agora: Date,
): RetentionSummary {
  const agoraMs = agora.getTime();
  const ciclos = store.all("live_cycle_runs");
  const observacoes = store.all("live_observations");
  const relogio = store.all("conference_clock_events");
  const recomendacoes = store.all("copilot_recommendations");

  const recomendacoesDepois = recomendacoes.filter((r) => {
    const status = typeof r["status"] === "string" ? r["status"] : "";
    if (status === "proposed") return true;
    if (!TERMINAL_RECOMMENDATION_STATUS.has(status)) return true;

    // Registro legado sem terminal_at fica. A próxima avaliação lhe dará um
    // carimbo determinístico; apagar sem saber quando terminou seria chute.
    const terminalEm = instante(r["terminal_at"]);
    if (terminalEm === null) return true;
    return terminalEm >= agoraMs - INTELLIGENCE_RETENTION.terminal_recommendation_ms;
  });

  // Uma recomendação preservada precisa continuar apontando para evidência que
  // existe. A janela maior (90 dias) fixa os registros referenciados mesmo
  // quando a janela bruta da entidade seria menor.
  const ciclosFixados = new Set<string>();
  const observacoesFixadas = new Set<string>();
  const relogioFixado = new Set<string>();
  for (const r of recomendacoesDepois) {
    const evidencias = Array.isArray(r["evidencias"]) ? r["evidencias"] : [];
    for (const e of evidencias) {
      if (!e || typeof e !== "object") continue;
      const tipo = String((e as Registro)["tipo"] ?? "");
      const ref = String((e as Registro)["ref"] ?? "");
      if (!ref) continue;
      if (tipo === "live_cycle_run") ciclosFixados.add(ref);
      if (tipo === "live_observation") {
        observacoesFixadas.add(ref);
        const partes = ref.split("|");
        if (partes.length >= 2) ciclosFixados.add(partes.slice(0, 2).join("|"));
      }
      if (tipo === "conference_clock_event") relogioFixado.add(ref);
    }
  }

  const ciclosDepois = ciclos.filter((r) => {
    const t = instante(r["finished_at"]) ?? instante(r["started_at"]);
    const ref = `${String(r["run_id"] ?? "")}|${String(r["cycle_id"] ?? "")}`;
    return (
      ciclosFixados.has(ref) ||
      t === null ||
      t >= agoraMs - INTELLIGENCE_RETENTION.live_cycle_runs_ms
    );
  });

  const ultimaPorPedido = new Map<string, Registro>();
  for (const r of observacoes) {
    const id = typeof r["external_id"] === "string" ? r["external_id"] : "";
    if (!id) continue;
    const atual = ultimaPorPedido.get(id);
    const t = instante(r["observed_at"]) ?? Number.NEGATIVE_INFINITY;
    const ta = atual ? (instante(atual["observed_at"]) ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
    if (!atual || t >= ta) ultimaPorPedido.set(id, r);
  }

  const pedidosTerminadosExpirados = new Set<string>();
  for (const [id, r] of ultimaPorPedido) {
    const status = typeof r["status"] === "string" ? r["status"] : "";
    const terminouEm = instante(r["observed_at"]);
    if (
      TERMINAL_ORDER_STATUS.has(status) &&
      terminouEm !== null &&
      terminouEm < agoraMs - INTELLIGENCE_RETENTION.terminal_order_ms
    ) {
      pedidosTerminadosExpirados.add(id);
    }
  }

  const observacoesDepois = observacoes.filter((r) => {
    const id = typeof r["external_id"] === "string" ? r["external_id"] : "";
    const ref = `${String(r["run_id"] ?? "")}|${String(r["cycle_id"] ?? "")}|${id}`;
    return !id || !pedidosTerminadosExpirados.has(id) || observacoesFixadas.has(ref);
  });

  const relogioDepois = relogio.filter((r) => {
    const id = typeof r["order_id"] === "string" ? r["order_id"] : "";
    const ref = String(r["event_id"] ?? "");
    return !id || !pedidosTerminadosExpirados.has(id) || relogioFixado.has(ref);
  });

  // Reescreve mesmo quando a contagem não muda: isto remove linhas históricas
  // duplicadas do JSONL, mantendo só a última versão por chave natural.
  reescrever(store, "live_cycle_runs", ciclosDepois);
  reescrever(store, "live_observations", observacoesDepois);
  reescrever(store, "conference_clock_events", relogioDepois);
  reescrever(store, "copilot_recommendations", recomendacoesDepois);

  return {
    live_cycle_runs: { antes: ciclos.length, depois: ciclosDepois.length },
    live_observations: { antes: observacoes.length, depois: observacoesDepois.length },
    conference_clock_events: { antes: relogio.length, depois: relogioDepois.length },
    copilot_recommendations: { antes: recomendacoes.length, depois: recomendacoesDepois.length },
    pedidos_terminais_expirados: pedidosTerminadosExpirados.size,
  };
}
