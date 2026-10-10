/**
 * Q-026 — gerador DETERMINISTICO de event log sintetico para a revisao
 * adversarial do replay. Nenhum dado real: tudo aqui e `simulated`/`control`/
 * `real` de laboratorio, gerado por PRNG com semente fixa.
 *
 * Por que um gerador novo: o benchmark de 1.030.000 fatos (20,5 s na porta)
 * nao deixou gerador no repositorio, e os perfis existentes usam UMA viagem
 * com N eventos — o pior caso da copia quadratica, nao a distribuicao de uma
 * loja. Aqui a distribuicao e declarada e ajustavel: aparelhos, viagens com
 * ciclo de vida, GPS a cada poucos segundos, fatos atrasados (offline),
 * relogio adiantado (`suspect`), empates de instante, varias unidades e modos.
 *
 * O MESMO gerador alimenta as provas de equivalencia (em memoria) e o
 * benchmark com PostgreSQL (linhas do event log). Duas fixtures divergiriam.
 */
import type { EventEnvelope, EventType, SourceMode } from "../../src/platform/contracts/event-catalog";

/** PRNG pequeno e deterministico (mulberry32). Mesma semente, mesmo log. */
export function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(r: () => number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16);
  return s;
}

function uuid(r: () => number): string {
  return `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-${"89ab"[Math.floor(r() * 4)]}${hex(r, 3)}-${hex(r, 12)}`;
}

export interface PerfilDoLog {
  /** Total EXATO de fatos gerados. */
  fatos: number;
  semente: number;
  aparelhos: number;
  /** Unidade de cada aparelho, em rodizio. */
  unidades: readonly string[];
  /** Modo de cada aparelho, em rodizio (o modo e da instancia que ingeriu). */
  modos: readonly SourceMode[];
  /** Media de pontos de GPS por viagem (sem contar o ciclo de vida). */
  pontos_por_viagem: number;
  /** Intervalo medio entre pontos, em ms. */
  intervalo_ms: number;
  /** Fracao de pontos que chegam atrasados (offline): recorded_at minutos depois. */
  atrasados: number;
  /** Fracao de pontos com relogio do aparelho adiantado (> tolerancia): `suspect`. */
  suspeitos: number;
  /** Fracao de fatos que repetem o instante (ms) do fato anterior do aparelho. */
  empates: number;
  /** Fracao de viagens com ocorrencia aberta. */
  ocorrencias: number;
  /** Instante da leitura. Os fatos terminam pouco antes dele. */
  agora: Date;
}

export const PERFIL_LOJA: Omit<PerfilDoLog, "fatos"> = {
  semente: 20261009,
  aparelhos: 20,
  unidades: ["ITAIM"],
  modos: ["simulated", "simulated", "simulated", "simulated", "simulated", "simulated", "control", "real"],
  pontos_por_viagem: 240,
  intervalo_ms: 5_000,
  atrasados: 0.03,
  suspeitos: 0.01,
  empates: 0.02,
  ocorrencias: 0.05,
  agora: new Date("2026-10-09T23:00:00.000Z"),
};

/** O que vira uma linha de `platform.event_log`. */
export interface LinhaDoLog {
  event_id: string;
  unit_id: string;
  object_type: "trip";
  object_id: string;
  event_type: EventType;
  occurred_at: string;
  recorded_at: string;
  origin: "device";
  device_id: string;
  sequence_local: number;
  idempotency_key: string;
  contract_version: string;
  source_mode: SourceMode;
  clock_trust: "trusted" | "suspect";
}

const CICLO_IDA: readonly EventType[] = ["trip_created", "trip_started"];
const CICLO_VOLTA: readonly EventType[] = ["arrival_detected", "delivery_confirmed", "trip_return_started"];
const CICLO_FIM: readonly EventType[] = ["trip_returned", "trip_closed"];

/**
 * Gera o log. As viagens de cada aparelho andam em sequencia no tempo, de tras
 * para frente a partir de `agora`, para a ULTIMA de cada aparelho ficar aberta
 * e com GPS recente (frescor `fresh`), e as antigas encerradas.
 */
export function gerarLinhas(p: PerfilDoLog): LinhaDoLog[] {
  const r = prng(p.semente);
  const linhas: LinhaDoLog[] = [];
  const porAparelho = Math.ceil(p.fatos / p.aparelhos);
  for (let d = 0; d < p.aparelhos && linhas.length < p.fatos; d++) {
    const device_id = `DEV-${String(d + 1).padStart(2, "0")}`;
    const unit_id = p.unidades[d % p.unidades.length];
    const source_mode = p.modos[d % p.modos.length];
    // Planeja as viagens deste aparelho: tamanhos variam +-50% em torno da media.
    const viagens: { pontos: number; ocorrencia: boolean }[] = [];
    let previstos = 0;
    while (previstos < porAparelho) {
      const pontos = Math.max(1, Math.round(p.pontos_por_viagem * (0.5 + r())));
      viagens.push({ pontos, ocorrencia: r() < p.ocorrencias });
      previstos += pontos + CICLO_IDA.length + CICLO_VOLTA.length + CICLO_FIM.length;
    }
    // Duracao total em ms, para comecar no passado e terminar perto de `agora`.
    const passo = p.intervalo_ms;
    let t = p.agora.getTime() - previstos * passo - 30_000;
    let seq = 0;
    for (let v = 0; v < viagens.length; v++) {
      const ultima = v === viagens.length - 1;
      const trip_id = `${unit_id}-T-${device_id}-${String(v).padStart(5, "0")}`;
      const tipos: EventType[] = [...CICLO_IDA];
      const meio = Math.floor(viagens[v].pontos / 2);
      for (let k = 0; k < viagens[v].pontos; k++) {
        tipos.push("gps_batch_received");
        if (k === meio && !ultima) tipos.push(...CICLO_VOLTA);
        if (k === meio && viagens[v].ocorrencia) tipos.push("occurrence_created");
      }
      if (!ultima) tipos.push(...CICLO_FIM);
      for (const tipo of tipos) {
        if (linhas.length >= p.fatos) break;
        seq += 1;
        const empata = seq > 1 && r() < p.empates;
        if (!empata) t += Math.max(1, Math.round(passo * (0.5 + r())));
        const ocorreu = t;
        let recebeu = ocorreu + 300 + Math.floor(r() * 2500);
        let ocorreuDeclarado = ocorreu;
        let clock_trust: LinhaDoLog["clock_trust"] = "trusted";
        if (tipo === "gps_batch_received") {
          const sorteio = r();
          if (sorteio < p.atrasados) {
            // Ponto offline: capturado na hora certa, recebido minutos depois.
            recebeu = ocorreu + 60_000 + Math.floor(r() * 900_000);
          } else if (sorteio < p.atrasados + p.suspeitos) {
            // Relogio adiantado alem da tolerancia: a ingestao carimba `suspect`.
            ocorreuDeclarado = recebeu + 180_000 + Math.floor(r() * 600_000);
            clock_trust = "suspect";
          }
        }
        linhas.push({
          event_id: uuid(r),
          unit_id,
          object_type: "trip",
          object_id: trip_id,
          event_type: tipo,
          occurred_at: new Date(ocorreuDeclarado).toISOString(),
          recorded_at: new Date(Math.min(recebeu, p.agora.getTime() - 1)).toISOString(),
          origin: "device",
          device_id,
          sequence_local: seq,
          idempotency_key: `${device_id}:${uuid(r)}`,
          contract_version: `${tipo}@1.0.0`,
          source_mode,
          clock_trust,
        });
      }
    }
  }
  return linhas.slice(0, p.fatos);
}

/** O envelope EXATO que `lerFatosParaReplay` reconstroi de cada linha. */
export function envelopeDaLinha(l: LinhaDoLog): EventEnvelope {
  return {
    event_id: l.event_id,
    event_type: l.event_type,
    event_version: l.contract_version,
    unit_id: l.unit_id,
    trip_id: l.object_id,
    device_id: l.device_id,
    occurred_at: l.occurred_at,
    received_at: l.recorded_at,
    clock_trust: l.clock_trust,
    origin: l.origin,
    source_mode: l.source_mode,
    sequence: l.sequence_local,
    idempotency_key: l.idempotency_key,
    payload: {},
  };
}

/** Embaralhamento deterministico (Fisher-Yates): a ordem do banco nao e contrato. */
export function embaralhar<T>(xs: readonly T[], semente: number): T[] {
  const r = prng(semente);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
