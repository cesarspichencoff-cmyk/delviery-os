/**
 * LINHAGEM DE EVENTOS — identidade real, da origem ate a causa eleita
 * ============================================================================
 * R5-D0-L. Esta unidade nao conecta nada e nao inicia R5-D.
 *
 * O ACHADO QUE DECIDE ESTA MISSAO, e ele e mais duro do que "falta propagar":
 *
 *   O UNICO produtor de `LeituraOperacional` neste repositorio e
 *   `src/product/demo/seed-home-demonstracao.ts` — quatro cenas de fixture.
 *   **Nao existe produtor real.**
 *
 * E nao e so ausencia de codigo. O catalogo de eventos
 * (`contracts/event-catalog.ts`) tem `trip_created`, `gps_batch_received`,
 * `arrival_detected`, `delivery_confirmed`, `occurrence_created`,
 * `trip_closed` — **eventos de viagem e entrega**. Nenhum deles descreve carga
 * por praca, baseline, chegadas na hora ou estado de producao de pedido, que e
 * exatamente o que `LeituraOperacional` carrega. Os dois que poderiam
 * (`source_event_received`, `order_state_changed`) sao **recusados no
 * roteamento** por nao terem produtor nem consumidor (B4).
 *
 * Consequencia declarada: esta missao constroi o MECANISMO inteiro e o prova
 * ponta a ponta — mas nenhum sinal fica elegivel, porque elegibilidade exige
 * **produtor real comprovado**, e nao ha um. Um tipo que aceita ids nao produz
 * ids. Ver D72.
 *
 * O que NAO foi feito, de proposito: fabricar evento retroativo, criar tipo de
 * evento so para satisfazer o Shadow, ou adaptar as viagens fingindo que elas
 * descrevem a cozinha.
 */

import type { EventEnvelope } from "../../platform/contracts/event-catalog";

/** Id de evento do log canonico. */
export type EventId = string;

export type NaturezaDaLinhagem = "real" | "demonstracao" | "fixture";

/**
 * A linhagem que uma leitura carrega. Serializavel, deterministica e replayable:
 * JSON puro, sem classe, sem `Date`, sem `Map`.
 */
export interface LinhagemDeEventos {
  readonly input_event_ids: readonly EventId[];
  readonly natureza: NaturezaDaLinhagem;
  readonly observado_em: string;
  readonly transformacoes: readonly string[];
  /** Quem emitiu. Produtor nao autorizado nao sustenta recomendacao. */
  readonly produtor: string;
  readonly event_catalog_version: string;
}

/** Produtores autorizados a sustentar recomendacao Shadow. */
export const PRODUTORES_REAIS: readonly string[] = ["operacao-viva", "device-ingest"];

/** Versoes de catalogo aceitas. Desconhecida nao passa em silencio. */
export const CATALOGOS_SUPORTADOS: readonly string[] = ["event-catalog@1.0.0"];

/**
 * O que NAO pode ocupar o lugar de um event id. E a lista do que o contrato
 * PROIBE — nao uma heuristica de "parece id". Cada um destes ja apareceu em
 * algum lugar do projeto fazendo as vezes de identidade.
 */
export function eventIdLegitimo(id: unknown): id is EventId {
  if (typeof id !== "string") return false;
  const v = id.trim();
  if (v === "") return false;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return false; // timestamp ISO
  if (/^\d{1,6}$/.test(v)) return false; // minuto operacional / numero visual
  if (/^(t|min|minuto)[-_:]?\d+$/i.test(v)) return false;
  if (/^(indice|index|posicao|pos)[-_:]?\d+$/i.test(v)) return false;
  if (/^(fixture|demo|seed|tmp|temp|sim)[-_:]/i.test(v)) return false;
  if (/^#/.test(v)) return false; // id visual do motor
  if (/^[A-Z]-\d{1,6}$/.test(v)) return false;
  if (/^(sha\d*|md5|hash)[-_:]/i.test(v)) return false;
  return true;
}

/**
 * Constroi linhagem a partir de envelopes REAIS do event log.
 *
 * A ordem e a do LOG — nao ha reordenacao improvisada aqui. Duplicata segue
 * regra explicita: **a primeira ocorrencia vence e a ordem de chegada se
 * mantem**. Deduplicar sem preservar ordem faria o mesmo conjunto de eventos
 * produzir linhagens diferentes em execucoes diferentes.
 */
export function linhagemDeEventos(
  eventos: readonly EventEnvelope[],
  meta: { readonly observado_em: string; readonly produtor: string; readonly transformacoes: readonly string[] },
): LinhagemDeEventos {
  const vistos = new Set<string>();
  const ids: EventId[] = [];
  let natureza: NaturezaDaLinhagem = "real";
  let catalogo = CATALOGOS_SUPORTADOS[0]!;
  for (const e of eventos) {
    if (!eventIdLegitimo(e.event_id)) continue;
    if (vistos.has(e.event_id)) continue;
    vistos.add(e.event_id);
    ids.push(e.event_id);
    // Uma unica leitura simulada ou de controle contamina a natureza inteira:
    // misturar real com simulado e a forma mais silenciosa de mentir.
    if (e.source_mode !== "real") natureza = "demonstracao";
  }
  return {
    input_event_ids: ids,
    natureza,
    observado_em: meta.observado_em,
    transformacoes: meta.transformacoes,
    produtor: meta.produtor,
    event_catalog_version: catalogo,
  };
}

/** A linhagem de uma cena de fixture. Nunca elegivel no caminho real. */
export function linhagemDeFixture(observado_em: string): LinhagemDeEventos {
  return {
    input_event_ids: [],
    natureza: "fixture",
    observado_em,
    transformacoes: ["seed-home-demonstracao"],
    produtor: "seed-home-demonstracao",
    event_catalog_version: CATALOGOS_SUPORTADOS[0]!,
  };
}

/* ------------------------------------------------------------------ *
 * Elegibilidade                                                       *
 * ------------------------------------------------------------------ */

export type MotivoInelegibilidade =
  | "event_lineage_unavailable"
  | "event_not_persisted"
  | "fixture_in_real_path"
  | "unsupported_event_version"
  | "producer_not_authorized"
  | "cause_without_event_link";

export type Elegibilidade =
  | { readonly eligible_for_shadow: true; readonly input_event_ids: readonly EventId[] }
  | { readonly eligible_for_shadow: false; readonly reason: MotivoInelegibilidade };

/**
 * Um sinal so e elegivel com **produtor real comprovado**. O tipo aceitar ids
 * nao basta: sem produtor, `linhagem` chega `null` ou vazia, e a resposta e a
 * mesma de antes desta missao — `event_lineage_unavailable`.
 *
 * `existeNoLog` e injetado: esta funcao nao le banco nem event log.
 */
export function elegibilidadeParaShadow(
  linhagem: LinhagemDeEventos | null,
  contexto: {
    readonly destino: "real" | "demonstracao";
    readonly existeNoLog: (id: EventId) => boolean;
    /** A causa eleita, para provar que os eventos sustentam ESTA causa. */
    readonly vinculo_causa: string | null;
    readonly causa_da_linhagem: string | null;
  },
): Elegibilidade {
  if (linhagem === null || linhagem.input_event_ids.length === 0) {
    return { eligible_for_shadow: false, reason: "event_lineage_unavailable" };
  }
  if (!CATALOGOS_SUPORTADOS.includes(linhagem.event_catalog_version)) {
    return { eligible_for_shadow: false, reason: "unsupported_event_version" };
  }
  if (contexto.destino === "real" && linhagem.natureza !== "real") {
    return { eligible_for_shadow: false, reason: "fixture_in_real_path" };
  }
  if (!PRODUTORES_REAIS.includes(linhagem.produtor)) {
    return { eligible_for_shadow: false, reason: "producer_not_authorized" };
  }
  if (contexto.vinculo_causa !== contexto.causa_da_linhagem) {
    return { eligible_for_shadow: false, reason: "cause_without_event_link" };
  }
  for (const id of linhagem.input_event_ids) {
    if (!eventIdLegitimo(id)) {
      return { eligible_for_shadow: false, reason: "event_lineage_unavailable" };
    }
    if (!contexto.existeNoLog(id)) {
      return { eligible_for_shadow: false, reason: "event_not_persisted" };
    }
  }
  return { eligible_for_shadow: true, input_event_ids: linhagem.input_event_ids };
}
