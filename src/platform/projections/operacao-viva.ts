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
  /** Último instante de posição. Ausente quando nunca houve. */
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
  janelas = JANELAS,
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
 * Constrói a projeção a partir dos eventos.
 *
 * Pura: mesma entrada, mesma saída. Não lê relógio (recebe `agora`), não lê
 * banco, não guarda nada entre chamadas. É o que permite ao teste comparar
 * duas reconstruções byte a byte.
 */
export function projetar(
  eventos: readonly EventEnvelope[],
  opcoes: OpcoesProjecao,
): Projecao {
  const { agora, unit_id, source_mode } = opcoes;
  const janelas = opcoes.janelas ?? JANELAS;

  const porViagem = new Map<string, ViagemAcumulada>();
  const quarentena: { event_id: string; motivo: string }[] = [];
  const vistos = new Set<string>();
  let cursor: Projecao["cursor"];

  // Ordena por occurred_at, desempatando por sequence e depois por id. Sem
  // desempate estável, duas execuções sobre o mesmo conjunto poderiam divergir
  // — e a projeção deixaria de ser reconstruível.
  const ordenados = [...eventos].sort((a, b) => {
    const ta = Date.parse(a.occurred_at) - Date.parse(b.occurred_at);
    if (ta !== 0) return ta;
    const sa = (a.sequence ?? 0) - (b.sequence ?? 0);
    if (sa !== 0) return sa;
    return a.event_id.localeCompare(b.event_id);
  });

  for (const ev of ordenados) {
    // Unidade diferente não entra: misturar duas lojas na mesma projeção faz a
    // carga de uma aparecer como pressão da outra.
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
      const majCo = Number.parseInt(
        (opcoes.consumer_version.split("@").pop() ?? "0").split(".")[0],
        10,
      );
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
      cursor = { event_id: ev.event_id, occurred_at: ev.occurred_at };
      continue;
    }

    const atual: ViagemAcumulada = porViagem.get(tripId) ?? {
      trip_id: tripId,
      unit_id: ev.unit_id,
      estado: "desconhecido",
      device_id: ev.device_id,
      ultimo_fato_em: ev.occurred_at,
      ocorrencias_abertas: 0,
      source_mode: ev.source_mode,
      eventos: [],
    };

    const destino = TRANSICAO[ev.event_type];
    const estado =
      destino && RANK[destino] > RANK[atual.estado] ? destino : atual.estado;

    const ultimaPosicao =
      ev.event_type === "gps_batch_received"
        ? maisRecente(atual.ultima_posicao_em, ev.occurred_at)
        : atual.ultima_posicao_em;

    porViagem.set(tripId, {
      ...atual,
      estado,
      device_id: ev.device_id ?? atual.device_id,
      ultimo_fato_em: maisRecente(atual.ultimo_fato_em, ev.occurred_at) ?? ev.occurred_at,
      ultima_posicao_em: ultimaPosicao,
      ocorrencias_abertas:
        atual.ocorrencias_abertas + (ev.event_type === "occurrence_created" ? 1 : 0),
      eventos: [...atual.eventos, ev.event_id],
    });

    cursor = { event_id: ev.event_id, occurred_at: ev.occurred_at };
  }

  const viagens = [...porViagem.values()]
    .map((v) => ({ ...v, frescor: classificarFrescor(v.ultima_posicao_em, agora, janelas) }))
    .sort((a, b) => a.trip_id.localeCompare(b.trip_id));

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

function maisRecente(a: string | undefined, b: string): string | undefined {
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
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
