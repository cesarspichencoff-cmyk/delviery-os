/**
 * CATALOGO DE EVENTOS OPERACIONAIS — a fonte que a leitura ainda nao tem
 * ============================================================================
 * R5-D1. Esta unidade define os FATOS DE ORIGEM que, um dia, uma fonte real
 * poderia emitir para que a `LeituraOperacional` deixasse de nascer de fixture.
 *
 * **Nenhum produtor vivo e criado aqui.** Nao ha integracao, nao ha flag, nao ha
 * escrita automatica. O que existe e o contrato — validado, versionado e
 * exercitado por replay — esperando a fonte.
 *
 * A DECISAO ARQUITETURAL QUE GOVERNA TUDO: a `LeituraOperacional` e uma
 * PROJECAO deterministica destes eventos. Ela nao e persistida como verdade
 * primaria, nao e criada por adapter, e **nao existe evento
 * `leitura_operacional_criada`** — projecao nao e fato de origem. Ver D76.
 *
 * O catalogo existente (`src/platform/contracts/event-catalog.ts`) descreve
 * VIAGEM E ENTREGA: `trip_created`, `gps_batch_received`, `delivery_confirmed`.
 * Ele continua intocado. Este e um catalogo IRMAO, do chao da cozinha, e a
 * separacao e deliberada — os dois falam de operacoes diferentes e versionam
 * separado.
 *
 * O vocabulario de saude de fonte NAO foi inventado: ele espelha o
 * `LIVE_SOURCE_HEALTH` do Conference Brain e o `EstadoDeFonte` de `sinais.ts`.
 */

import type { PracaId } from "../viewmodels/areas";
import type { EstadoDeFonte } from "../viewmodels/sinais";

export const CATALOGO_OPERACIONAL_VERSAO = "evento-operacional@1";

/* ------------------------------------------------------------------ *
 * Tipos de evento                                                     *
 * ------------------------------------------------------------------ */

export const TIPOS_OPERACIONAIS = [
  "pedido_ciclo_observado",
  "trabalho_praca_observado",
  "capacidade_praca_observada",
  "source_health_changed",
] as const;

export type TipoOperacional = (typeof TIPOS_OPERACIONAIS)[number];

/** Versao suportada por tipo. Versao desconhecida NAO passa em silencio. */
export const VERSOES_SUPORTADAS: Readonly<Record<TipoOperacional, number>> = {
  pedido_ciclo_observado: 1,
  trabalho_praca_observado: 1,
  capacidade_praca_observada: 1,
  source_health_changed: 1,
};

/* ------------------------------------------------------------------ *
 * Payloads                                                            *
 * ------------------------------------------------------------------ */

/** Ciclo do pedido. Estados OBSERVADOS — nenhum e inferido. */
export const ESTADOS_PEDIDO = [
  "aceito",
  "em_producao",
  "pronto",
  "despachado",
  "cancelado",
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/**
 * Ordem de avanco do ciclo. Existe para que um evento ATRASADO nao regrida o
 * estado projetado — e para que a regressao, quando o dado realmente disser
 * isso, seja registrada como conflito em vez de aplicada em silencio.
 *
 * `cancelado` fica fora da escala: cancelamento nao e "mais avancado" que
 * despacho, e comparar os dois numa reta produziria a decisao errada.
 */
export const AVANCO_PEDIDO: Readonly<Record<EstadoPedido, number>> = {
  aceito: 1,
  em_producao: 2,
  pronto: 3,
  despachado: 4,
  cancelado: 0,
};

export interface PayloadPedidoCiclo {
  readonly pedido_id: string;
  readonly estado: EstadoPedido;
  /** Revisao da ORIGEM. Duas revisoes iguais com conteudo diferente = conflito. */
  readonly source_revision: number;
}

export const ESTADOS_TRABALHO = [
  "criado",
  "aguardando",
  "iniciado",
  "concluido",
  "cancelado",
] as const;
export type EstadoTrabalho = (typeof ESTADOS_TRABALHO)[number];

export const AVANCO_TRABALHO: Readonly<Record<EstadoTrabalho, number>> = {
  criado: 1,
  aguardando: 2,
  iniciado: 3,
  concluido: 4,
  cancelado: 0,
};

/**
 * Trabalho de uma praca. A CARGA POR PRACA nasce daqui — de trabalhos abertos
 * contados —, e nunca chega como numero solto. Um numero sem linhagem e
 * exatamente o que R5-D0 provou que a leitura antiga tinha.
 */
export interface PayloadTrabalhoPraca {
  readonly trabalho_id: string;
  readonly pedido_id: string;
  /** `null` e ACEITO no payload e RECUSADO na projecao: a ausencia e visivel. */
  readonly praca_id: PracaId | null;
  /** Item ou agrupamento a que este trabalho se refere. */
  readonly referencia: string;
  /** Quantidade operacional, quando observada. `null` = nao observada. */
  readonly quantidade: number | null;
  readonly estado: EstadoTrabalho;
  readonly source_revision: number;
}

/**
 * Capacidade. Os cinco casos sao DISTINTOS de proposito — fundir qualquer par
 * deles faz ausencia virar numero em algum ponto.
 */
export const MODOS_CAPACIDADE = [
  "observada",
  "indisponivel",
  "nao_fornecida",
  "praca_temporariamente_indisponivel",
  "observacao_expirada",
] as const;
export type ModoCapacidade = (typeof MODOS_CAPACIDADE)[number];

export interface PayloadCapacidadePraca {
  readonly praca_id: PracaId | null;
  readonly modo: ModoCapacidade;
  /** SOMENTE quando `modo === "observada"`. Nunca derivado de pessoas ou itens. */
  readonly capacidade: number | null;
  /** Ate quando esta observacao vale. `null` = sem validade declarada. */
  readonly valido_ate: string | null;
  readonly source_revision: number;
}

export interface PayloadSourceHealth {
  readonly source_id: string;
  /** Espelha `EstadoDeFonte` de `sinais.ts` — vocabulario existente. */
  readonly estado: EstadoDeFonte;
  readonly detalhe: string;
  readonly source_revision: number;
}

export type PayloadOperacional =
  | PayloadPedidoCiclo
  | PayloadTrabalhoPraca
  | PayloadCapacidadePraca
  | PayloadSourceHealth;

/* ------------------------------------------------------------------ *
 * Envelope                                                            *
 * ------------------------------------------------------------------ */

export interface EnvelopeOperacional {
  readonly event_id: string;
  readonly event_type: TipoOperacional;
  readonly event_version: number;
  readonly tenant_id: string;
  readonly unit_id: string;
  readonly source: string;
  /** Chave idempotente da ORIGEM. Duas iguais precisam ser o mesmo fato. */
  readonly source_event_id: string;
  readonly occurred_at: string;
  readonly observed_at: string;
  readonly ingested_at: string;
  readonly correlation_id: string;
  /** Só quando existe causa identificavel. NUNCA inventado. */
  readonly causation_id?: string;
  readonly payload: PayloadOperacional;
}

export type MotivoInvalido =
  | "campo_obrigatorio_ausente"
  | "tipo_desconhecido"
  | "versao_desconhecida"
  | "carimbo_invalido"
  | "occurred_at_posterior_a_observed_at"
  | "payload_invalido"
  | "estado_desconhecido"
  | "capacidade_sem_modo_observada"
  | "capacidade_observada_sem_valor";

export type ResultadoValidacao =
  | { readonly ok: true; readonly evento: EnvelopeOperacional }
  | { readonly ok: false; readonly motivo: MotivoInvalido; readonly detalhe: string };

const OBRIGATORIOS = [
  "event_id",
  "event_type",
  "event_version",
  "tenant_id",
  "unit_id",
  "source",
  "source_event_id",
  "occurred_at",
  "observed_at",
  "ingested_at",
  "correlation_id",
  "payload",
] as const;

const instante = (v: unknown): number =>
  typeof v === "string" ? Date.parse(v) : Number.NaN;

/** Valida envelope e payload. Nunca lanca por dado — devolve motivo tipado. */
export function validarEvento(bruto: unknown): ResultadoValidacao {
  if (bruto === null || typeof bruto !== "object") {
    return { ok: false, motivo: "payload_invalido", detalhe: "envelope nao e objeto" };
  }
  const e = bruto as Record<string, unknown>;
  for (const campo of OBRIGATORIOS) {
    const v = e[campo];
    if (v === undefined || v === null || v === "") {
      return { ok: false, motivo: "campo_obrigatorio_ausente", detalhe: campo };
    }
  }
  const tipo = e["event_type"];
  if (!TIPOS_OPERACIONAIS.includes(tipo as TipoOperacional)) {
    return { ok: false, motivo: "tipo_desconhecido", detalhe: String(tipo) };
  }
  const t = tipo as TipoOperacional;
  if (e["event_version"] !== VERSOES_SUPORTADAS[t]) {
    return {
      ok: false,
      motivo: "versao_desconhecida",
      detalhe: `${t}@${String(e["event_version"])}`,
    };
  }
  const oc = instante(e["occurred_at"]);
  const ob = instante(e["observed_at"]);
  const ing = instante(e["ingested_at"]);
  if (!Number.isFinite(oc) || !Number.isFinite(ob) || !Number.isFinite(ing)) {
    return { ok: false, motivo: "carimbo_invalido", detalhe: "occurred/observed/ingested" };
  }
  // Um fato nao pode ter acontecido DEPOIS de ter sido observado. Aceitar isso
  // deixaria o relogio da origem contaminar a ordenacao da projecao.
  if (oc > ob) {
    return {
      ok: false,
      motivo: "occurred_at_posterior_a_observed_at",
      detalhe: `${String(e["occurred_at"])} > ${String(e["observed_at"])}`,
    };
  }
  if (e["causation_id"] !== undefined && typeof e["causation_id"] !== "string") {
    return { ok: false, motivo: "payload_invalido", detalhe: "causation_id" };
  }

  const p = e["payload"];
  if (p === null || typeof p !== "object") {
    return { ok: false, motivo: "payload_invalido", detalhe: "payload nao e objeto" };
  }
  const d = p as Record<string, unknown>;
  if (typeof d["source_revision"] !== "number" || !Number.isFinite(d["source_revision"])) {
    return { ok: false, motivo: "payload_invalido", detalhe: "source_revision" };
  }

  if (t === "pedido_ciclo_observado") {
    if (typeof d["pedido_id"] !== "string" || d["pedido_id"] === "") {
      return { ok: false, motivo: "payload_invalido", detalhe: "pedido_id" };
    }
    if (!ESTADOS_PEDIDO.includes(d["estado"] as EstadoPedido)) {
      return { ok: false, motivo: "estado_desconhecido", detalhe: String(d["estado"]) };
    }
  } else if (t === "trabalho_praca_observado") {
    for (const campo of ["trabalho_id", "pedido_id", "referencia"]) {
      if (typeof d[campo] !== "string" || d[campo] === "") {
        return { ok: false, motivo: "payload_invalido", detalhe: campo };
      }
    }
    if (!ESTADOS_TRABALHO.includes(d["estado"] as EstadoTrabalho)) {
      return { ok: false, motivo: "estado_desconhecido", detalhe: String(d["estado"]) };
    }
    // `praca_id: null` NAO invalida o evento. Ele e um fato observado sem praca,
    // e a projecao o recusa em voz alta — recusar aqui esconderia a lacuna da
    // fonte dentro de "evento invalido".
    if (d["quantidade"] !== null && typeof d["quantidade"] !== "number") {
      return { ok: false, motivo: "payload_invalido", detalhe: "quantidade" };
    }
  } else if (t === "capacidade_praca_observada") {
    if (!MODOS_CAPACIDADE.includes(d["modo"] as ModoCapacidade)) {
      return { ok: false, motivo: "capacidade_sem_modo_observada", detalhe: String(d["modo"]) };
    }
    if (d["modo"] === "observada") {
      if (typeof d["capacidade"] !== "number" || !Number.isFinite(d["capacidade"])) {
        return { ok: false, motivo: "capacidade_observada_sem_valor", detalhe: "capacidade" };
      }
    } else if (d["capacidade"] !== null) {
      // Capacidade indisponivel, nao fornecida ou expirada NAO carrega numero.
      return { ok: false, motivo: "payload_invalido", detalhe: "capacidade sem modo observada" };
    }
  } else {
    if (typeof d["source_id"] !== "string" || d["source_id"] === "") {
      return { ok: false, motivo: "payload_invalido", detalhe: "source_id" };
    }
    if (!["saudavel", "parcial", "stale", "indisponivel"].includes(String(d["estado"]))) {
      return { ok: false, motivo: "estado_desconhecido", detalhe: String(d["estado"]) };
    }
  }

  return { ok: true, evento: e as unknown as EnvelopeOperacional };
}

/* ------------------------------------------------------------------ *
 * Idempotencia e conflito                                             *
 * ------------------------------------------------------------------ */

/** Chave idempotente: origem + id da origem. Nao inclui carimbo de ingestao. */
export function chaveIdempotente(e: EnvelopeOperacional): string {
  return `${e.source}|${e.source_event_id}`;
}

/**
 * A identidade do CONTEUDO de um fato. Exclui deliberadamente `event_id`,
 * `ingested_at` e `correlation_id`: dois envelopes diferentes que descrevem o
 * MESMO fato precisam colidir aqui, senao reingerir vira duplicata divergente.
 */
export function impressaoDoFato(e: EnvelopeOperacional): string {
  return JSON.stringify({
    tipo: e.event_type,
    versao: e.event_version,
    tenant: e.tenant_id,
    unidade: e.unit_id,
    ocorrido: e.occurred_at,
    payload: e.payload,
  });
}
