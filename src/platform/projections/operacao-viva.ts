/**
 * Operação Viva — projeção derivada do event stream.
 *
 * É uma FUNÇÃO dos eventos, não um estado que alguém mantém. `projetar(eventos)`
 * com a mesma lista devolve sempre o mesmo resultado, e reprocessar o log
 * inteiro reconstrói tudo. Isso é o que a torna descartável: se a projeção
 * corromper, apaga e recalcula — o event log é a verdade.
 *
 * A regra que dá o caráter dela: **ausência é estado, não silêncio.**
 *
 * Uma projeção que guarda o último valor conhecido para sempre é confortável e
 * mentirosa. Um motoboy sem sinal há quarenta minutos não está "em rota a
 * 30 km/h" — ele está desconhecido, e é essa a informação que alguém precisa
 * para agir. Por isso todo sinal daqui envelhece sozinho e vira `stale`, e
 * `unknown` NUNCA vira `healthy`.
 */

import type { EventEnvelope, EventType, SourceMode } from "../contracts/event-catalog";
import { instanteConfiavel } from "../contracts/relogio";

export const PROJECTION_VERSION = "operacao-viva@1.0.0";

/* ------------------------------------------------------------------ *
 * Estados
 * ------------------------------------------------------------------ */

/**
 * Frescor de um sinal. É sobre a INFORMAÇÃO, não sobre a operação.
 *
 * `unknown` e `stale` são diferentes de propósito: nunca observado não é o
 * mesmo que observado e envelhecido. Quem nunca reportou pode nem ter começado;
 * quem parou de reportar estava andando e sumiu.
 */
export type Frescor = "fresh" | "aging" | "stale" | "unknown";

/** Estado operacional de uma viagem, derivado só de fatos. */
export type EstadoViagem =
  | "criada"
  | "em_rota"
  | "chegou"
  | "entregue"
  | "retornando"
  | "retornou"
  | "encerrada"
  | "desconhecido";

/** As nove dimensões. Cada uma responde a uma pergunta diferente. */
export interface Dimensoes {
  /** quantas viagens abertas ao mesmo tempo */
  carga: number;
  /** viagens passadas do tempo esperado */
  atraso: number;
  /** viagens com posição recente */
  mobilidade: number;
  /** qualidade do sinal que está chegando */
  integridade_sinal: Frescor;
  /** o aparelho está conseguindo sincronizar */
  saude_sincronizacao: Frescor;
  /** o quanto a evidência sustenta a leitura */
  confianca_evidencia: "alta" | "media" | "baixa";
  /** viagens que a operação ainda aguenta antes de saturar */
  capacidade_operacional: number | "desconhecida";
  /** ocorrências abertas */
  ocorrencias: number;
  /** risco de estar decidindo com dado velho */
  risco_envelhecimento: "baixo" | "medio" | "alto";
}

/**
 * O que os fatos dizem sobre uma viagem, sem nenhuma leitura de relógio.
 *
 * Esta parte é pura função dos eventos: reprocessar o mesmo log amanhã produz
 * exatamente isto de novo.
 */
export interface ViagemAcumulada {
  trip_id: string;
  unit_id: string;
  estado: EstadoViagem;
  device_id?: string;
  /** Último instante de QUALQUER fato desta viagem. */
  ultimo_fato_em: string;
  /**
   * Último instante CONFIÁVEL de posição — a base do frescor. É o `occurred_at`
   * quando o relógio do aparelho tem autoridade; sem ela, a hora em que o
   * servidor recebeu (`instanteConfiavel`). O `occurred_at` enviado segue
   * intacto no event log e em `ultimo_fato_em`. Ausente quando nunca houve.
   */
  ultima_posicao_em?: string;
  ocorrencias_abertas: number;
  source_mode: SourceMode;
  /** Eventos que a compuseram — para auditar de onde veio cada conclusão. */
  eventos: readonly string[];
}

/**
 * A viagem acumulada mais o frescor.
 *
 * `frescor` fica separado de propósito: ele NÃO é um fato, é uma leitura feita
 * contra um relógio. Os mesmos eventos produzem `fresh` agora e `stale` daqui a
 * dez minutos, sem nada ter mudado no mundo.
 *
 * Guardá-lo junto do acumulado convidaria alguém a persistir a projeção com o
 * frescor dentro — e um `fresh` salvo em disco é uma mentira com data de
 * validade vencida.
 */
export interface ViagemProjetada extends ViagemAcumulada {
  frescor: Frescor;
}

export interface Projecao {
  projection_version: string;
  /** Instante em que a projeção foi CALCULADA, não em que os fatos ocorreram. */
  calculada_em: string;
  unit_id: string;
  source_mode: SourceMode;
  viagens: readonly ViagemProjetada[];
  dimensoes: Dimensoes;
  /** Eventos recusados por incompatibilidade, com o motivo. */
  quarentena: readonly { event_id: string; motivo: string }[];
  /** Último evento aplicado — permite retomar sem reprocessar tudo. */
  cursor?: { event_id: string; occurred_at: string };
}

/* ------------------------------------------------------------------ *
 * Janelas de envelhecimento
 * ------------------------------------------------------------------ */

/**
 * Quanto tempo um sinal continua confiável.
 *
 * Números da operação real, não do que é fácil de testar: um motoboy manda
 * posição a cada poucos segundos; dois minutos de silêncio já é anormal, cinco
 * minutos é problema.
 */
export const JANELAS = {
  fresh_ate_s: 120,
  aging_ate_s: 300,
} as const;

export function classificarFrescor(
  ultimoEm: string | undefined,
  agora: Date,
  janelas: Readonly<{ fresh_ate_s: number; aging_ate_s: number }> = JANELAS,
): Frescor {
  if (!ultimoEm) return "unknown";
  const idade = (agora.getTime() - Date.parse(ultimoEm)) / 1000;
  if (!Number.isFinite(idade)) return "unknown";
  // Carimbo no futuro é relógio errado, não frescor extra. Tratar como fresco
  // deixaria um aparelho com data adiantada parecer eternamente atualizado.
  if (idade < -60) return "unknown";
  if (idade <= janelas.fresh_ate_s) return "fresh";
  if (idade <= janelas.aging_ate_s) return "aging";
  return "stale";
}

/* ------------------------------------------------------------------ *
 * Transições
 * ------------------------------------------------------------------ */

const TRANSICAO: Partial<Record<EventType, EstadoViagem>> = {
  trip_created: "criada",
  trip_started: "em_rota",
  arrival_detected: "chegou",
  delivery_confirmed: "entregue",
  trip_return_started: "retornando",
  trip_returned: "retornou",
  trip_closed: "encerrada",
};

/**
 * Ordem de avanço. Evento fora de ordem NÃO retrocede o estado.
 *
 * Rede reordena: um `trip_started` atrasado chegando depois de
 * `delivery_confirmed` faria a viagem "voltar a sair" se a projeção obedecesse
 * à ordem de chegada. O fato antigo é registrado, mas não desfaz o novo.
 */
const RANK: Record<EstadoViagem, number> = {
  desconhecido: 0,
  criada: 1,
  em_rota: 2,
  chegou: 3,
  entregue: 4,
  retornando: 5,
  retornou: 6,
  encerrada: 7,
};

/* ------------------------------------------------------------------ *
 * Projeção
 * ------------------------------------------------------------------ */

export interface OpcoesProjecao {
  agora: Date;
  unit_id: string;
  source_mode: SourceMode;
  /** Versão que este consumidor sabe ler. */
  consumer_version?: string;
  janelas?: typeof JANELAS;
  /** Quantas viagens simultâneas a unidade sustenta. */
  capacidade_maxima?: number;
}

/**
 * A ordem de aplicação: instante, depois sequência local, depois id.
 *
 * Sem desempate estável, duas execuções sobre o mesmo conjunto poderiam
 * divergir — e a projeção deixaria de ser reconstruível. Este comparador é o
 * CONTRATO da ordem: a versão rápida abaixo devolve, par a par, exatamente o
 * que ele devolve.
 */
function compararEventos(a: EventEnvelope, b: EventEnvelope): number {
  const ta = Date.parse(a.occurred_at) - Date.parse(b.occurred_at);
  if (ta !== 0) return ta;
  const sa = (a.sequence ?? 0) - (b.sequence ?? 0);
  if (sa !== 0) return sa;
  return a.event_id.localeCompare(b.event_id);
}

/**
 * Os eventos DE UM ESCOPO (unidade + modo), na ordem exata em que a projeção
 * os aplica — com o instante de cada um já lido.
 *
 * Por que existe (Q-026, medido): a versão anterior ordenava a lista INTEIRA,
 * de todas as unidades e modos, e só depois descartava o que era de outro
 * escopo; e o comparador relia `Date.parse` duas vezes por comparação. Com
 * 1,03 milhão de fatos sintéticos, só a ordenação custava ~3 s, repetida a
 * cada escopo pedido.
 *
 * Duas otimizações, e por que cada uma preserva o resultado:
 *
 * 1. **Instante lido uma vez por evento.** `Date.parse` é pura: o comparador
 *    com o instante pré-lido devolve, par a par, o mesmo número que
 *    `compararEventos`.
 *
 * 2. **Filtrar o escopo antes de ordenar.** A ordenação do JavaScript é
 *    estável, e com um comparador CONSISTENTE o resultado é único: os eventos
 *    em ordem de chave, empates na ordem de entrada. Filtrar preserva a ordem
 *    de entrada, então ordenar-depois-filtrar e filtrar-depois-ordenar dão a
 *    mesma sequência. O comparador só é consistente quando todo instante é
 *    número finito, toda sequência é número finito e todo id é texto — em
 *    TODA a lista, porque um instante ilegível de OUTRO escopo já embaralhava
 *    a ordem deste na versão anterior. Fora disso, o caminho é o antigo,
 *    literalmente: lista inteira, `compararEventos`, filtro depois.
 *
 * A ingestão recusa `occurred_at` ilegível e o replay reconstrói o instante
 * com `toISOString()`: pelos caminhos canônicos, o caminho antigo não roda.
 */
function ordenarDoEscopo(
  eventos: readonly EventEnvelope[],
  unit_id: string,
  source_mode: SourceMode,
): { ordenados: EventEnvelope[]; instantes: Float64Array } {
  const n = eventos.length;
  const instantes = new Float64Array(n);
  const sequencias = new Float64Array(n);
  let consistente = true;
  for (let i = 0; i < n; i++) {
    const e = eventos[i];
    const t = Date.parse(e.occurred_at);
    instantes[i] = t;
    const s: unknown = e.sequence ?? 0;
    if (typeof s === "number" && Number.isFinite(s)) sequencias[i] = s;
    else consistente = false;
    if (!Number.isFinite(t) || typeof e.event_id !== "string") consistente = false;
  }

  if (!consistente) {
    const ordenados = [...eventos]
      .sort(compararEventos)
      .filter((e) => e.unit_id === unit_id && e.source_mode === source_mode);
    const tOrd = new Float64Array(ordenados.length);
    for (let k = 0; k < ordenados.length; k++) tOrd[k] = Date.parse(ordenados[k].occurred_at);
    return { ordenados, instantes: tOrd };
  }

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = eventos[i];
    if (e.unit_id === unit_id && e.source_mode === source_mode) indices.push(i);
  }
  indices.sort((x, y) => {
    const ta = instantes[x] - instantes[y];
    if (ta !== 0) return ta;
    const sa = sequencias[x] - sequencias[y];
    if (sa !== 0) return sa;
    return eventos[x].event_id.localeCompare(eventos[y].event_id);
  });
  const ordenados = new Array<EventEnvelope>(indices.length);
  const tOrd = new Float64Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    ordenados[k] = eventos[indices[k]];
    tOrd[k] = instantes[indices[k]];
  }
  return { ordenados, instantes: tOrd };
}

/**
 * O acumulador INTERNO de uma viagem. Nunca sai de `projetar`: a saída é
 * montada no fim, campo a campo, na mesma ordem de chaves de sempre.
 *
 * `*_ms` guardam `Date.parse` do texto ao lado, para `maisRecente` não reler
 * o texto a cada fato. O texto é o que sai; o número é só cache dele.
 */
interface AcumuloDaViagem {
  trip_id: string;
  unit_id: string;
  estado: EstadoViagem;
  device_id?: string;
  ultimo_fato_em: string;
  ultimo_fato_ms: number;
  ocorrencias_abertas: number;
  source_mode: SourceMode;
  eventos: string[];
  ultima_posicao_em?: string;
  ultima_posicao_ms: number;
}

/**
 * Constrói a projeção a partir dos eventos.
 *
 * Pura: mesma entrada, mesma saída. Não lê relógio (recebe `agora`), não lê
 * banco, não guarda nada entre chamadas. É o que permite ao teste comparar
 * duas reconstruções byte a byte.
 *
 * Q-026: a saída é idêntica à de `d0716fd` (mesmas chaves, na mesma ordem,
 * mesmos valores) — provado por `tests/product/run-q026-replay-adversarial-tests.ts`.
 * O que mudou é só o custo: ordenação do escopo com instante pré-lido, e
 * acumulador mutável local em vez de recriar objeto e lista a cada fato.
 */
export function projetar(
  eventos: readonly EventEnvelope[],
  opcoes: OpcoesProjecao,
): Projecao {
  const { agora, unit_id, source_mode } = opcoes;
  const janelas = opcoes.janelas ?? JANELAS;

  const porViagem = new Map<string, AcumuloDaViagem>();
  const quarentena: { event_id: string; motivo: string }[] = [];
  const vistos = new Set<string>();
  let ultimoAplicado: EventEnvelope | undefined;
  let majCo = Number.NaN;
  let majCoLido = false;

  const { ordenados, instantes } = ordenarDoEscopo(eventos, unit_id, source_mode);

  for (let k = 0; k < ordenados.length; k++) {
    const ev = ordenados[k];
    // Unidade diferente não entra: misturar duas lojas na mesma projeção faz a
    // carga de uma aparecer como pressão da outra. (Já filtrado; a guarda fica.)
    if (ev.unit_id !== unit_id) continue;

    // `real` e `simulated` nunca se somam. Um número que mistura os dois não
    // descreve nem a operação nem o teste.
    if (ev.source_mode !== source_mode) continue;

    // Duplicata é esperada — o aparelho reenvia o que não teve recibo. Aplicar
    // duas vezes inflaria a contagem de ocorrências.
    if (vistos.has(ev.idempotency_key)) continue;
    vistos.add(ev.idempotency_key);

    if (opcoes.consumer_version) {
      const majEv = Number.parseInt((ev.event_version.split("@").pop() ?? "0").split(".")[0], 10);
      if (!majCoLido) {
        majCo = Number.parseInt((opcoes.consumer_version.split("@").pop() ?? "0").split(".")[0], 10);
        majCoLido = true;
      }
      if (majEv !== majCo) {
        quarentena.push({
          event_id: ev.event_id,
          motivo: `versão incompatível: ${ev.event_version}`,
        });
        continue;
      }
    }

    const tripId = ev.trip_id;
    if (!tripId) {
      // Evento sem viagem ainda conta para o cursor, mas não projeta viagem.
      ultimoAplicado = ev;
      continue;
    }

    let atual = porViagem.get(tripId);
    if (atual === undefined) {
      atual = {
        trip_id: tripId,
        unit_id: ev.unit_id,
        estado: "desconhecido",
        device_id: ev.device_id,
        ultimo_fato_em: ev.occurred_at,
        ultimo_fato_ms: instantes[k],
        ocorrencias_abertas: 0,
        source_mode: ev.source_mode,
        eventos: [],
        ultima_posicao_em: undefined,
        ultima_posicao_ms: Number.NaN,
      };
      porViagem.set(tripId, atual);
    }

    const destino = TRANSICAO[ev.event_type];
    if (destino && RANK[destino] > RANK[atual.estado]) atual.estado = destino;

    // Frescor só nasce de tempo com autoridade. O `occurred_at` de um relógio
    // adiantado não entra aqui — era ele que deixava um ponto de amanhã
    // fresco amanhã. Vale a hora em que o servidor recebeu. O ponto continua
    // contando: GPS recebido e horário confiável são coisas diferentes.
    const ehPosicao = ev.event_type === "gps_batch_received";
    const instante = ehPosicao ? instanteConfiavel(ev) : undefined;
    if (instante) {
      // maisRecente(atual.ultima_posicao_em, instante), com o cache do texto
      // atual. Relógio confiável devolve o próprio `occurred_at`: o mesmo texto,
      // o mesmo instante já lido.
      const t = instante === ev.occurred_at ? instantes[k] : Date.parse(instante);
      if (!atual.ultima_posicao_em || t > atual.ultima_posicao_ms) {
        atual.ultima_posicao_em = instante;
        atual.ultima_posicao_ms = t;
      }
    }

    atual.device_id = ev.device_id ?? atual.device_id;

    // maisRecente(atual.ultimo_fato_em, ev.occurred_at) ?? ev.occurred_at
    if (!atual.ultimo_fato_em) {
      atual.ultimo_fato_em = ev.occurred_at;
      atual.ultimo_fato_ms = instantes[k];
    } else if (instantes[k] > atual.ultimo_fato_ms) {
      atual.ultimo_fato_em = ev.occurred_at;
      atual.ultimo_fato_ms = instantes[k];
    }

    atual.ocorrencias_abertas += ev.event_type === "occurrence_created" ? 1 : 0;
    atual.eventos.push(ev.event_id);

    ultimoAplicado = ev;
  }

  const viagens: ViagemProjetada[] = [...porViagem.values()]
    .map((v) => ({
      trip_id: v.trip_id,
      unit_id: v.unit_id,
      estado: v.estado,
      device_id: v.device_id,
      ultimo_fato_em: v.ultimo_fato_em,
      ocorrencias_abertas: v.ocorrencias_abertas,
      source_mode: v.source_mode,
      eventos: v.eventos,
      ultima_posicao_em: v.ultima_posicao_em,
      frescor: classificarFrescor(v.ultima_posicao_em, agora, janelas),
    }))
    .sort((a, b) => a.trip_id.localeCompare(b.trip_id));

  const cursor: Projecao["cursor"] = ultimoAplicado
    ? { event_id: ultimoAplicado.event_id, occurred_at: ultimoAplicado.occurred_at }
    : undefined;

  return {
    projection_version: PROJECTION_VERSION,
    calculada_em: agora.toISOString(),
    unit_id,
    source_mode,
    viagens,
    dimensoes: calcularDimensoes(viagens, agora, opcoes),
    quarentena,
    cursor,
  };
}

/* ------------------------------------------------------------------ *
 * Dimensões
 * ------------------------------------------------------------------ */

const ABERTAS: readonly EstadoViagem[] = ["criada", "em_rota", "chegou", "retornando"];

function calcularDimensoes(
  viagens: readonly ViagemProjetada[],
  agora: Date,
  opcoes: OpcoesProjecao,
): Dimensoes {
  const abertas = viagens.filter((v) => ABERTAS.includes(v.estado));
  const comPosicaoFresca = abertas.filter((v) => v.frescor === "fresh");
  const desconhecidas = abertas.filter((v) => v.frescor === "unknown" || v.frescor === "stale");

  // Atraso é medido pelo tempo desde o último fato, não desde a criação: uma
  // viagem longa que continua reportando não está atrasada, está longe.
  const atrasadas = abertas.filter(
    (v) => (agora.getTime() - Date.parse(v.ultimo_fato_em)) / 1000 > JANELAS.aging_ate_s,
  );

  const integridade: Frescor =
    abertas.length === 0
      ? "unknown"
      : desconhecidas.length === 0
        ? "fresh"
        : desconhecidas.length < abertas.length
          ? "aging"
          : "stale";

  // Confiança cai com a proporção de sinal velho. Nunca sobe por ausência —
  // "nenhuma viagem aberta" não é evidência de nada.
  const confianca: Dimensoes["confianca_evidencia"] =
    abertas.length === 0
      ? "baixa"
      : desconhecidas.length === 0
        ? "alta"
        : desconhecidas.length * 2 <= abertas.length
          ? "media"
          : "baixa";

  const capacidade =
    opcoes.capacidade_maxima === undefined
      ? ("desconhecida" as const)
      : Math.max(0, opcoes.capacidade_maxima - abertas.length);

  const risco: Dimensoes["risco_envelhecimento"] =
    integridade === "stale" || confianca === "baixa"
      ? "alto"
      : integridade === "aging"
        ? "medio"
        : "baixo";

  return {
    carga: abertas.length,
    atraso: atrasadas.length,
    mobilidade: comPosicaoFresca.length,
    integridade_sinal: integridade,
    // A saúde da sincronização é a mesma evidência vista de outro ângulo:
    // aparelho que não sincroniza produz sinal velho.
    saude_sincronizacao: integridade,
    confianca_evidencia: confianca,
    capacidade_operacional: capacidade,
    ocorrencias: viagens.reduce((s, v) => s + v.ocorrencias_abertas, 0),
    risco_envelhecimento: risco,
  };
}

/* ------------------------------------------------------------------ *
 * Comparação
 * ------------------------------------------------------------------ */

/**
 * Duas projeções são logicamente iguais?
 *
 * Ignora `calculada_em`, que muda a cada execução por definição. É o que
 * permite provar que replay reconstrói o mesmo estado.
 */
export function mesmoEstadoLogico(a: Projecao, b: Projecao): boolean {
  const normal = (p: Projecao): string =>
    JSON.stringify({ ...p, calculada_em: "-" });
  return normal(a) === normal(b);
}
