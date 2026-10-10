/**
 * Q-026 — o conjunto de cenarios ADVERSARIAIS da projecao, e o comparador.
 *
 * Um conjunto so, usado pela prova de equivalencia e pela bateria de
 * mutantes: se um mutante passa por estes cenarios, a prova e cega para ele.
 *
 * O que cada familia ataca:
 *  - LOJA: o log com a distribuicao de uma loja (viagens, GPS, atrasados,
 *    relogio adiantado, empates), embaralhado como o banco pode devolver.
 *  - DUP: chave de idempotencia repetida no mesmo escopo e em outro escopo.
 *  - ATRASO: terminal/GPS que chegam fora de ordem; ranque nao retrocede.
 *  - EMPATE: mesmo instante, sequencia e id decidindo — inclusive ids cuja
 *    ordem por `localeCompare` difere da ordem por codigo de caractere.
 *  - TEXTO: o mesmo instante escrito de jeitos diferentes (a grafia que sai).
 *  - RELOGIO: suspect, unknown, fora da ingestao, futuro, recebido ilegivel.
 *  - VERSAO: quarentena por versao, e a dedup que acontece ANTES dela.
 *  - CURSOR: fatos sem viagem, quarentenados e duplicados no fim.
 *  - MALFORMADO: instante ilegivel em OUTRO escopo (comparador inconsistente),
 *    sequencia NaN/Infinity/texto, id nao-texto — o caminho antigo, literal.
 *  - FUZZ: milhares de logs pequenos de pools pequenos (colisao forcada).
 */
import { isDeepStrictEqual } from "node:util";
import type { EventEnvelope, EventType, SourceMode } from "../../src/platform/contracts/event-catalog";
import type { OpcoesProjecao } from "../../src/platform/projections/operacao-viva";
import type { Projetar } from "./q026-referencias";
import { embaralhar, envelopeDaLinha, gerarLinhas, PERFIL_LOJA, prng } from "./q026-replay-fixture";

export interface Cenario {
  familia: string;
  nome: string;
  eventos: readonly EventEnvelope[];
  opcoes: readonly OpcoesProjecao[];
}

const AGORA = new Date("2026-10-09T23:00:00.000Z");
const MODOS: readonly SourceMode[] = ["real", "simulated", "control"];
const TIPOS: readonly EventType[] = [
  "trip_created", "trip_started", "gps_batch_received", "arrival_detected", "delivery_confirmed",
  "occurrence_created", "trip_return_started", "trip_returned", "trip_closed",
];

function ev(p: Partial<EventEnvelope> & { event_id: string }): EventEnvelope {
  const tipo = (p.event_type ?? "gps_batch_received") as EventType;
  return {
    event_type: tipo,
    event_version: `${tipo}@1.0.0`,
    unit_id: "ITAIM",
    trip_id: "T-1",
    device_id: "DEV-1",
    occurred_at: "2026-10-09T22:58:00.000Z",
    received_at: "2026-10-09T22:58:01.000Z",
    clock_trust: "trusted",
    origin: "device",
    source_mode: "simulated",
    idempotency_key: `k-${p.event_id}`,
    payload: {},
    ...p,
  } as EventEnvelope;
}

function opcoesDe(eventos: readonly EventEnvelope[], extra: Partial<OpcoesProjecao> = {}): OpcoesProjecao[] {
  const unidades = [...new Set(eventos.map((e) => String(e.unit_id)))];
  if (!unidades.includes("ITAIM")) unidades.push("ITAIM");
  const r: OpcoesProjecao[] = [];
  for (const unit_id of unidades) for (const source_mode of MODOS) r.push({ agora: AGORA, unit_id, source_mode, ...extra });
  return r;
}

/** Congela fundo: projetar nao pode escrever em nada que recebeu. */
export function congelar<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}

export function cenarios(): Cenario[] {
  const c: Cenario[] = [];
  const add = (familia: string, nome: string, eventos: EventEnvelope[], opcoes?: OpcoesProjecao[]) =>
    c.push({ familia, nome, eventos: congelar(eventos), opcoes: opcoes ?? opcoesDe(eventos) });

  /* ---------------- LOJA ---------------- */
  for (const [fatos, semente] of [[300, 1], [2_000, 2], [6_000, 3]] as const) {
    const base = gerarLinhas({ ...PERFIL_LOJA, fatos, semente, aparelhos: 6, pontos_por_viagem: 40,
      unidades: ["ITAIM", "LAB-BANCADA"], empates: 0.15, atrasados: 0.1, suspeitos: 0.05 }).map(envelopeDaLinha);
    add("LOJA", `loja ${fatos} na ordem de chegada`, base);
    add("LOJA", `loja ${fatos} embaralhada`, embaralhar(base, semente * 7));
    add("LOJA", `loja ${fatos} invertida`, [...base].reverse());
  }

  /* ---------------- DUP ---------------- */
  add("DUP", "mesma chave, conteudo diferente, no mesmo escopo", [
    ev({ event_id: "e2", event_type: "trip_closed", idempotency_key: "K", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "e1", event_type: "occurrence_created", idempotency_key: "K", occurred_at: "2026-10-09T22:40:00.000Z" }),
    ev({ event_id: "e3", event_type: "trip_started", occurred_at: "2026-10-09T22:30:00.000Z" }),
  ]);
  add("DUP", "mesma chave em modos diferentes: cada escopo conta a sua", [
    ev({ event_id: "s1", idempotency_key: "K", source_mode: "simulated", event_type: "occurrence_created" }),
    ev({ event_id: "r1", idempotency_key: "K", source_mode: "real", event_type: "occurrence_created" }),
    ev({ event_id: "s0", idempotency_key: "K", source_mode: "simulated", event_type: "occurrence_created", occurred_at: "2026-10-09T22:57:00.000Z" }),
  ]);
  add("DUP", "reenvio identico (mesmo objeto 3x)", (() => { const e = ev({ event_id: "x" }); return [e, e, e]; })());

  /* ---------------- ATRASO ---------------- */
  add("ATRASO", "terminal chega antes do inicio; inicio atrasado nao reabre", [
    ev({ event_id: "c", event_type: "trip_closed", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "s", event_type: "trip_started", occurred_at: "2026-10-09T22:55:00.000Z" }),
    ev({ event_id: "d", event_type: "delivery_confirmed", occurred_at: "2026-10-09T22:40:00.000Z" }),
  ]);
  add("ATRASO", "GPS offline mais velho que a ultima posicao chega por ultimo", [
    ev({ event_id: "g1", occurred_at: "2026-10-09T22:59:00.000Z", received_at: "2026-10-09T22:59:01.000Z" }),
    ev({ event_id: "g0", occurred_at: "2026-10-09T22:10:00.000Z", received_at: "2026-10-09T22:59:30.000Z" }),
    ev({ event_id: "t", event_type: "trip_started", occurred_at: "2026-10-09T22:00:00.000Z" }),
  ]);
  add("ATRASO", "viagem aberta ha 80 h sem sinal + viagem nova", [
    ev({ event_id: "a0", trip_id: "VELHA", event_type: "trip_started", occurred_at: "2026-10-06T15:00:00.000Z", received_at: "2026-10-06T15:00:02.000Z" }),
    ev({ event_id: "a1", trip_id: "VELHA", occurred_at: "2026-10-06T15:05:00.000Z", received_at: "2026-10-06T15:05:02.000Z" }),
    ev({ event_id: "n0", trip_id: "NOVA", event_type: "trip_started", occurred_at: "2026-10-09T22:59:00.000Z" }),
  ]);

  /* ---------------- EMPATE ---------------- */
  const T = "2026-10-09T22:58:30.000Z";
  add("EMPATE", "mesmo instante: sequencia decide (negativa, ausente, zero)", [
    ev({ event_id: "z1", occurred_at: T, sequence: 2, device_id: "D-2" }),
    ev({ event_id: "z2", occurred_at: T, device_id: "D-0" }),
    ev({ event_id: "z3", occurred_at: T, sequence: 1, device_id: "D-1" }),
    ev({ event_id: "z4", occurred_at: T, sequence: -1, device_id: "D-M" }),
    ev({ event_id: "z5", occurred_at: T, sequence: 0, device_id: "D-Z" }),
  ]);
  const ids = ["evt-b", "evt-B", "evt-a", "evt_A", "evt-ä", "EVT-0", "evt-10", "evt-9", "evt-Ä"];
  add("EMPATE", "mesmo instante e sequencia: id por localeCompare (difere de codigo de caractere)",
    ids.map((id, i) => ev({ event_id: id, occurred_at: T, sequence: 5, device_id: `D-${i}`, idempotency_key: `k-${i}` })));
  add("EMPATE", "mesmo segundo, milissegundos diferentes, sequencia invertida", [
    ev({ event_id: "ms9", occurred_at: "2026-10-09T22:58:00.900Z", sequence: 1, device_id: "D-9" }),
    ev({ event_id: "ms1", occurred_at: "2026-10-09T22:58:00.100Z", sequence: 2, device_id: "D-1" }),
    ev({ event_id: "ms5", occurred_at: "2026-10-09T22:58:00.500Z", sequence: 0, device_id: "D-5" }),
  ]);
  add("EMPATE", "empate de id entre viagens diferentes", ids.map((id, i) =>
    ev({ event_id: id, occurred_at: T, trip_id: i % 2 ? "T-B" : "T-a", event_type: i === 3 ? "trip_closed" : "gps_batch_received", idempotency_key: `kk-${i}` })));

  /* ---------------- TEXTO ---------------- */
  add("TEXTO", "mesmo instante, grafias diferentes: a primeira aplicada fica", [
    ev({ event_id: "p1", occurred_at: "2026-10-09T22:00:00Z", received_at: "2026-10-09T22:00:00.500Z" }),
    ev({ event_id: "p2", occurred_at: "2026-10-09T19:00:00-03:00", received_at: "2026-10-09T22:00:00.500Z" }),
    ev({ event_id: "p3", occurred_at: "2026-10-09T22:00:00.000Z", received_at: "2026-10-09T22:00:00.500Z" }),
    ev({ event_id: "p4", occurred_at: "2026-10-09T22:00:00.000+00:00", received_at: "2026-10-09T22:00:00.500Z", event_type: "trip_started" }),
  ]);

  /* ---------------- RELOGIO ---------------- */
  add("RELOGIO", "suspeito, sem carimbo, sem recebido, futuro, recebido ilegivel", [
    ev({ event_id: "r1", occurred_at: "2026-10-09T23:30:00.000Z", received_at: "2026-10-09T22:58:00.000Z", clock_trust: "suspect" }),
    ev({ event_id: "r2", occurred_at: "2026-10-09T23:10:00.000Z", received_at: "2026-10-09T22:57:00.000Z", clock_trust: "trusted" }),
    ev({ event_id: "r3", occurred_at: "2026-10-09T22:56:00.000Z", received_at: undefined, clock_trust: "trusted" }),
    ev({ event_id: "r4", occurred_at: "2026-10-09T22:55:00.000Z", received_at: undefined, clock_trust: undefined }),
    ev({ event_id: "r5", occurred_at: "2026-10-09T22:54:00.000Z", received_at: "ontem", clock_trust: "unknown" }),
    ev({ event_id: "r6", trip_id: "T-2", occurred_at: "2026-10-09T22:53:00.000Z", received_at: "2026-10-09T22:53:00.200Z", clock_trust: "unknown" }),
  ]);
  for (const s of [-61, -60, 0, 120, 121, 300, 301]) {
    const t = new Date(AGORA.getTime() - s * 1000).toISOString();
    add("RELOGIO", `fronteira de frescor ${s}s`, [ev({ event_id: `f${s}`, occurred_at: t, received_at: t })]);
  }

  /* ---------------- VERSAO ---------------- */
  const versionados = [
    ev({ event_id: "v1", event_version: "gps_batch_received@2.0.0", idempotency_key: "KV", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "v2", event_version: "gps_batch_received@1.4.0", idempotency_key: "KV", occurred_at: "2026-10-09T22:51:00.000Z" }),
    ev({ event_id: "v3", event_version: "trip_started@1.0.0", event_type: "trip_started", occurred_at: "2026-10-09T22:52:00.000Z" }),
    ev({ event_id: "v4", event_version: "sem-arroba", occurred_at: "2026-10-09T22:53:00.000Z" }),
  ];
  add("VERSAO", "quarentena e dedup antes dela", versionados, [
    ...opcoesDe(versionados, { consumer_version: "operacao-viva@1.2.0" }),
    ...opcoesDe(versionados, { consumer_version: "2.0.0" }),
    ...opcoesDe(versionados),
  ]);

  /* ---------------- CURSOR ---------------- */
  add("CURSOR", "fato sem viagem por ultimo; viagem vazia; null", [
    ev({ event_id: "c1", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "c2", trip_id: undefined, occurred_at: "2026-10-09T22:59:00.000Z" }),
    ev({ event_id: "c3", trip_id: "", occurred_at: "2026-10-09T22:55:00.000Z" }),
    ev({ event_id: "c4", trip_id: null as unknown as string, occurred_at: "2026-10-09T22:56:00.000Z" }),
  ]);
  add("CURSOR", "ultimo fato e duplicata: cursor fica no anterior", [
    ev({ event_id: "d1", idempotency_key: "KD", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "d2", idempotency_key: "KD", occurred_at: "2026-10-09T22:59:00.000Z" }),
  ]);
  add("CURSOR", "lista vazia", []);
  add("CURSOR", "so outro escopo", [ev({ event_id: "o1", unit_id: "OUTRA", source_mode: "real" })]);

  /* ---------------- OUTROS CAMPOS ---------------- */
  add("CAMPOS", "aparelho muda e some no meio da viagem; ocorrencias", [
    ev({ event_id: "m1", device_id: "A", event_type: "trip_started", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "m2", device_id: "B", event_type: "occurrence_created", occurred_at: "2026-10-09T22:51:00.000Z" }),
    ev({ event_id: "m3", device_id: undefined, event_type: "occurrence_created", occurred_at: "2026-10-09T22:52:00.000Z" }),
    ev({ event_id: "m4", device_id: undefined, occurred_at: "2026-10-09T22:53:00.000Z" }),
  ], [
    ...opcoesDe([], { capacidade_maxima: 3 }),
    ...opcoesDe([], { janelas: { fresh_ate_s: 30, aging_ate_s: 60 } as never }),
    ...opcoesDe([]),
  ]);
  add("CAMPOS", "tipo desconhecido e chaves do prototipo", [
    ev({ event_id: "x1", event_type: "trip_started", occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "x2", event_type: "__proto__" as EventType, occurred_at: "2026-10-09T22:51:00.000Z" }),
    ev({ event_id: "x3", event_type: "constructor" as EventType, occurred_at: "2026-10-09T22:52:00.000Z" }),
    ev({ event_id: "x4", event_type: "toString" as EventType, occurred_at: "2026-10-09T22:53:00.000Z" }),
    ev({ event_id: "x5", event_type: "trip_teleported" as EventType, occurred_at: "2026-10-09T22:54:00.000Z" }),
  ]);

  /* ---------------- MALFORMADO ---------------- */
  // Instante ilegivel em OUTRO escopo: a versao anterior ordenava a lista inteira
  // com comparador inconsistente; a ordem DESTE escopo dependia desse fato.
  const pref = ["2026-10-09T22:59:00.000Z", "nao-e-data", "2026-10-09T22:10:00.000Z", "2026-10-09T22:40:00.000Z",
    "2026-10-09T22:20:00.000Z", "2026-10-09T22:30:00.000Z"];
  add("MALFORMADO", "instante ilegivel em outro escopo altera a ordem deste (caminho antigo)", pref.map((t, i) =>
    ev({ event_id: `mf${i}`, occurred_at: t, source_mode: i === 1 ? "real" : "simulated",
      device_id: `D${i}`, trip_id: "T-MF", event_type: i === 5 ? "trip_closed" : "gps_batch_received",
      received_at: i === 1 ? "2026-10-09T22:59:00.000Z" : t })));
  add("MALFORMADO", "instante ilegivel no proprio escopo", pref.map((t, i) => ev({ event_id: `mi${i}`, occurred_at: t, device_id: `D${i}` })));
  add("MALFORMADO", "sequencias NaN, Infinity, texto e null", [
    ev({ event_id: "q1", sequence: Number.NaN, occurred_at: T }),
    ev({ event_id: "q2", sequence: Number.POSITIVE_INFINITY, occurred_at: T }),
    ev({ event_id: "q3", sequence: "7" as unknown as number, occurred_at: T }),
    ev({ event_id: "q4", sequence: null as unknown as number, occurred_at: T }),
    ev({ event_id: "q5", sequence: 3, occurred_at: T }),
  ]);
  add("MALFORMADO", "sequencia NaN em OUTRO escopo, no mesmo instante, entre dois fatos deste", [
    ev({ event_id: "na", occurred_at: T, sequence: 2, device_id: "D-A" }),
    ev({ event_id: "nx", occurred_at: T, sequence: Number.NaN, source_mode: "real", device_id: "D-X" }),
    ev({ event_id: "nb", occurred_at: T, sequence: 1, device_id: "D-B" }),
  ]);
  add("MALFORMADO", "id nao-texto sem empate", [
    ev({ event_id: 42 as unknown as string, occurred_at: "2026-10-09T22:50:00.000Z" }),
    ev({ event_id: "ok", occurred_at: "2026-10-09T22:51:00.000Z" }),
  ]);
  add("MALFORMADO", "id nao-texto COM empate, ordem que nao lanca", [
    ev({ event_id: 42 as unknown as string, occurred_at: T }),
    ev({ event_id: "ok", occurred_at: T }),
  ]);
  add("MALFORMADO", "id nao-texto COM empate, ordem que lanca (as duas lancam o mesmo erro)", [
    ev({ event_id: "ok", occurred_at: T }),
    ev({ event_id: 42 as unknown as string, occurred_at: T }),
  ]);
  add("MALFORMADO", "instante ausente", [
    ev({ event_id: "u1", occurred_at: undefined as unknown as string }),
    ev({ event_id: "u2", occurred_at: "2026-10-09T22:51:00.000Z" }),
  ]);

  /* ---------------- FUZZ ---------------- */
  const r = prng(4242);
  const pega = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)];
  const instantes = ["2026-10-09T22:58:00.000Z", "2026-10-09T22:58:00Z", "2026-10-09T19:58:00-03:00",
    "2026-10-09T22:58:00.250Z", "2026-10-09T22:58:00.750Z",
    "2026-10-09T22:59:30.000Z", "2026-10-09T22:01:00.000Z", "2026-10-09T23:20:00.000Z", "2026-10-08T10:00:00.000Z"];
  for (let k = 0; k < 2_500; k++) {
    const n = Math.floor(r() * 30);
    const lista: EventEnvelope[] = [];
    const raro = r() < 0.12;
    for (let i = 0; i < n; i++) {
      const tipo = r() < 0.04 ? ("__proto__" as EventType) : pega(TIPOS);
      lista.push(ev({
        event_id: pega(["a", "B", "b", "A", "_a", "a-1", "a10", "a9", "á", `id${i}`]),
        event_type: tipo,
        event_version: r() < 0.1 ? `${tipo}@2.0.0` : `${tipo}@1.0.0`,
        unit_id: pega(["ITAIM", "ITAIM", "LAB"]),
        source_mode: pega(MODOS),
        trip_id: pega(["T1", "T2", "t1", "T3", "", undefined]) as string,
        device_id: pega(["D1", "D2", undefined]) as string,
        occurred_at: raro && r() < 0.2 ? pega(["ontem", "", "2026-13-40T00:00:00Z"]) : pega(instantes),
        received_at: pega(["2026-10-09T22:58:01.000Z", "2026-10-09T22:30:00.000Z", undefined, "lixo"]) as string,
        clock_trust: pega(["trusted", "suspect", "unknown", undefined, "bogus"]) as never,
        sequence: raro && r() < 0.2 ? pega([Number.NaN, "2"] as unknown as number[]) : pega([undefined, 0, 1, 2, -1]) as number,
        idempotency_key: pega(["k1", "k2", "k3", `k${i}`, `k${i}`, `k${i}`]),
      }));
    }
    const opcoes: OpcoesProjecao[] = [];
    for (const unit_id of ["ITAIM", "LAB"]) for (const source_mode of MODOS) {
      opcoes.push({ agora: AGORA, unit_id, source_mode, ...(r() < 0.25 ? { consumer_version: "x@1.0.0" } : {}) });
    }
    add("FUZZ", `fuzz #${k}`, lista, opcoes);
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * Comparador
 * ------------------------------------------------------------------ */

type Saida = { ok: true; valor: unknown; json: string } | { ok: false; erro: string };

function rodar(p: Projetar, eventos: readonly EventEnvelope[], o: OpcoesProjecao): Saida {
  try {
    const valor = p(eventos, o);
    return { ok: true, valor, json: JSON.stringify(valor) };
  } catch (e) {
    const err = e as Error;
    return { ok: false, erro: `${err?.constructor?.name ?? typeof e}: ${err?.message ?? String(e)}` };
  }
}

export interface Divergencia {
  familia: string;
  cenario: string;
  escopo: string;
  motivo: string;
}

export interface Relatorio {
  comparacoes: number;
  por_familia: Record<string, number>;
  /** Total de comparacoes divergentes; `divergencias` guarda so as primeiras. */
  total_divergencias: number;
  divergencias: Divergencia[];
  /** Comparacoes em que a referencia lancou (e a candidata lancou igual). */
  excecoes_iguais: number;
}

/**
 * Compara `candidata` contra `referencia` em todos os cenarios e escopos:
 * igualdade profunda ESTRITA (chave ausente != chave com undefined) E JSON
 * byte a byte (ordem das chaves, que a resposta HTTP carrega). Excecao conta
 * como saida: as duas tem de lancar o mesmo erro.
 */
export function comparar(referencia: Projetar, candidata: Projetar, lista: readonly Cenario[], limite = 20): Relatorio {
  const rel: Relatorio = { comparacoes: 0, por_familia: {}, total_divergencias: 0, divergencias: [], excecoes_iguais: 0 };
  for (const c of lista) {
    for (const o of c.opcoes) {
      rel.comparacoes += 1;
      rel.por_familia[c.familia] = (rel.por_familia[c.familia] ?? 0) + 1;
      const esc = `${o.unit_id}|${o.source_mode}${o.consumer_version ? `|cv=${o.consumer_version}` : ""}`;
      const a = rodar(referencia, c.eventos, o);
      const b = rodar(candidata, c.eventos, o);
      let motivo: string | null = null;
      if (a.ok !== b.ok) motivo = `uma lancou e a outra nao: ref=${a.ok ? "ok" : a.erro} cand=${b.ok ? "ok" : b.erro}`;
      else if (!a.ok && !b.ok) {
        if (a.erro !== b.erro) motivo = `erros diferentes: ref=${a.erro} cand=${b.erro}`;
        else rel.excecoes_iguais += 1;
      } else if (a.ok && b.ok) {
        if (!isDeepStrictEqual(a.valor, b.valor)) motivo = "deepStrictEqual falhou";
        else if (a.json !== b.json) motivo = "JSON difere (ordem de chaves ou grafia)";
      }
      if (motivo) {
        rel.total_divergencias += 1;
        if (rel.divergencias.length < limite) rel.divergencias.push({ familia: c.familia, cenario: c.nome, escopo: esc, motivo });
      }
    }
  }
  return rel;
}
