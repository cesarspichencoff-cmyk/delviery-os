/**
 * PRONTIDAO PARA R5-D — linhagem de evidencia, confianca e validador
 * ============================================================================
 * R5-D0. Esta unidade NAO conecta nada. Ela responde a tres perguntas com
 * valor executavel, e o resultado nao liga flag, nao emite recomendacao e nao
 * registra nada:
 *
 *   1. De quais eventos reais virao os `input_event_ids`?
 *   2. Como a confianca sera representada sem precisao inventada?
 *   3. O harness e o runtime Shadow usam exatamente o mesmo validador?
 *
 * O ACHADO CENTRAL, medido e nao suposto: existem DOIS caminhos no repositorio,
 * e so um deles preserva identidade de evento.
 *
 *   Caminho A — event log -> `projetar()` -> `ViagemProjetada.eventos[]`
 *               -> `eventosDe()` -> `input_event_ids`.       IDENTIDADE PRESERVADA
 *
 *   Caminho B — `LeituraOperacional` -> `sinaisDe()` -> causa -> politica
 *               temporal -> `decidir()` -> tradutor.          IDENTIDADE INEXISTENTE
 *
 * O Caminho B e o que produz o Foco. `LeituraOperacional` nunca carregou
 * `event_id`: ela tem pedidos, carga por praca e fontes. `sinais.ts` nao cita
 * evento em nenhuma linha. Entao a identidade nao e "perdida" em algum ponto —
 * **ela nunca entra**. Ver `docs/product/CONTRATO_LINHAGEM_EVIDENCIA.md`.
 *
 * Consequencia: um sinal do Caminho B **nao e elegivel** para recomendacao
 * Shadow hoje, e a recusa e tipada — melhor que evidencia falsa.
 */

import type { SourceMode } from "../../platform/contracts/event-catalog";
import type { EscopoDoSujeito, IdentidadeDaCausa } from "./traducao-motor-shadow";

/* ------------------------------------------------------------------ *
 * Linhagem                                                            *
 * ------------------------------------------------------------------ */

/** De onde a linhagem vem. Fixture NUNCA vale no caminho real. */
export type NaturezaDoDado = "real" | "derivada" | "fixture" | "demonstracao";

/**
 * A linhagem de uma evidencia, do evento persistido ate a causa eleita.
 *
 * Serializavel, deterministica e auditavel. Ela NAO consulta o event log: quem
 * a monta e o chamador, que ja provou a origem. O tradutor continua incapaz de
 * buscar evento — essa e a fronteira de R5-C e ela nao se moveu.
 */
export interface LinhagemDeEvidencia {
  readonly input_event_ids: readonly string[];
  readonly signal_id: string;
  readonly cause_id: IdentidadeDaCausa;
  readonly observed_at: string;
  /** Quem emitiu os eventos. Produtor nao autorizado invalida a linhagem. */
  readonly producer: string;
  readonly event_schema_version: string;
  readonly transformations: readonly string[];
  readonly data_nature: NaturezaDoDado;
  readonly source_mode: SourceMode;
  readonly subject_scope: EscopoDoSujeito;
  readonly limitations: readonly string[];
}

/** Versoes de envelope aceitas. Desconhecida nao passa em silencio. */
export const VERSOES_DE_EVENTO_SUPORTADAS: readonly string[] = ["1"];

/** Produtores autorizados a sustentar recomendacao. */
export const PRODUTORES_AUTORIZADOS: readonly string[] = [
  "operacao-viva",
  "device-ingest",
];

export type MotivoLinhagem =
  | "event_lineage_unavailable"
  | "event_not_persisted"
  | "event_subject_mismatch"
  | "fixture_in_real_path"
  | "unsupported_event_version"
  | "producer_not_authorized"
  | "cause_mismatch"
  | "signal_link_missing";

export type ResultadoLinhagem =
  | { readonly elegivel: true; readonly input_event_ids: readonly string[] }
  | { readonly elegivel: false; readonly motivo: MotivoLinhagem };

/**
 * Um id de evento so vale se PARECE um id de evento do catalogo. Esta funcao e
 * a lista do que o contrato PROIBE — nao uma heuristica de "parece id". Cada um
 * destes ja apareceu em algum lugar do projeto ocupando o lugar de identidade.
 */
export function identidadeDeEventoLegitima(id: string): boolean {
  if (typeof id !== "string") return false;
  const v = id.trim();
  if (v === "") return false;
  // Timestamp ou minuto operacional.
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return false;
  if (/^\d{1,6}$/.test(v)) return false;
  if (/^(t|min|minuto)[-_:]?\d+$/i.test(v)) return false;
  // Posicao ou indice.
  if (/^(indice|index|posicao|pos)[-_:]?\d+$/i.test(v)) return false;
  // Chave de fixture, demonstracao ou semente.
  if (/^(fixture|demo|seed|tmp|temp|sim)[-_:]/i.test(v)) return false;
  // Id visual de pedido, do jeito que o motor exibe.
  if (/^#/.test(v)) return false;
  if (/^[A-Z]-\d{1,6}$/.test(v)) return false;
  // Hash improvisado de conteudo.
  if (/^(sha\d*|md5|hash)[-_:]/i.test(v)) return false;
  return true;
}

/**
 * Confere a linhagem contra a causa eleita e contra o sujeito declarado.
 *
 * `existeNoLog` e injetado: esta funcao NAO le banco nem event log. Quem sabe
 * se o evento foi persistido e quem tem o log — aqui so mora a regra.
 */
export function conferirLinhagem(
  l: LinhagemDeEvidencia,
  contexto: {
    readonly causa_eleita: IdentidadeDaCausa;
    readonly escopo: EscopoDoSujeito;
    readonly destino: "real" | "demonstracao";
    readonly existeNoLog: (id: string) => boolean;
  },
): ResultadoLinhagem {
  if (l.input_event_ids.length === 0) {
    return { elegivel: false, motivo: "event_lineage_unavailable" };
  }
  if (!VERSOES_DE_EVENTO_SUPORTADAS.includes(l.event_schema_version)) {
    return { elegivel: false, motivo: "unsupported_event_version" };
  }
  if (!PRODUTORES_AUTORIZADOS.includes(l.producer)) {
    return { elegivel: false, motivo: "producer_not_authorized" };
  }
  if (contexto.destino === "real" && (l.data_nature === "fixture" || l.data_nature === "demonstracao")) {
    return { elegivel: false, motivo: "fixture_in_real_path" };
  }
  if (contexto.destino === "real" && l.source_mode !== "real") {
    return { elegivel: false, motivo: "fixture_in_real_path" };
  }
  if (l.signal_id.trim() === "") return { elegivel: false, motivo: "signal_link_missing" };
  if (l.cause_id !== contexto.causa_eleita) {
    return { elegivel: false, motivo: "cause_mismatch" };
  }
  if (JSON.stringify(l.subject_scope) !== JSON.stringify(contexto.escopo)) {
    return { elegivel: false, motivo: "event_subject_mismatch" };
  }
  for (const id of l.input_event_ids) {
    if (!identidadeDeEventoLegitima(id)) {
      return { elegivel: false, motivo: "event_lineage_unavailable" };
    }
    if (!contexto.existeNoLog(id)) {
      return { elegivel: false, motivo: "event_not_persisted" };
    }
  }
  // Ordem deterministica e duplicata resolvida por regra EXPLICITA: a primeira
  // ocorrencia vence, e a ordem final e a de chegada. Deduplicar sem ordenar
  // deixaria o mesmo conjunto produzir ids diferentes em execucoes diferentes.
  const vistos = new Set<string>();
  const unicos: string[] = [];
  for (const id of l.input_event_ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    unicos.push(id);
  }
  return { elegivel: true, input_event_ids: unicos };
}

/* ------------------------------------------------------------------ *
 * Confianca                                                           *
 * ------------------------------------------------------------------ */

/**
 * Como a confianca chega. O rotulo do motor NAO vira numero: nao existe regra
 * canonica ligando `"alta"` a um valor, e inventa-la seria fabricar precisao.
 *
 * `nao_estimada` e a ausencia EXPLICITA. Ela nao e zero — zero e uma confianca
 * legitima de valor zero, e confundir os dois e a mentira que I9 existe para
 * impedir.
 */
export type ConfiancaDeclarada =
  | { readonly tipo: "nao_estimada"; readonly motivo: string }
  | { readonly tipo: "apurada"; readonly valor: number; readonly regra: string };

export type MotivoConfianca =
  | "confidence_contract_missing"
  | "confidence_without_evidence"
  | "confidence_out_of_range"
  | "qualitative_label_not_convertible"
  | "severity_used_as_confidence";

export type ResultadoConfianca =
  /** `valor: null` = nao estimada. NUNCA zero: zero e uma apuracao de valor zero. */
  | { readonly suportada: true; readonly valor: number | null }
  | { readonly suportada: false; readonly motivo: MotivoConfianca };

/**
 * A confianca so e suportada quando foi APURADA por uma regra declarada e ha
 * evidencia sustentando. Nem o rotulo do motor nem a severidade viram numero.
 */
export function conferirConfianca(
  c: ConfiancaDeclarada,
  evidencias: number,
): ResultadoConfianca {
  // R5-D0-C: `nao_estimada` passou a ser SUPORTADA. Uma recomendacao nao precisa
  // inventar numero para existir — e o contrato do Shadow agora sabe representar
  // a recusa de afirmar. O que continua recusado e numero sem lastro (D70).
  if (c.tipo === "nao_estimada") {
    return { suportada: true, valor: null };
  }
  if (evidencias === 0) {
    return { suportada: false, motivo: "confidence_without_evidence" };
  }
  if (c.regra.trim() === "") {
    return { suportada: false, motivo: "confidence_contract_missing" };
  }
  // Uma "regra" que so repete a severidade nao e regra: e severidade com outro
  // nome. `severidade != confianca` — §10 da missao, e a divergencia real
  // registrada em `home-vm.ts:474`.
  if (/severidade|severity/i.test(c.regra)) {
    return { suportada: false, motivo: "severity_used_as_confidence" };
  }
  if (/r[oó]tulo|label|alta|m[ée]dia|baixa/i.test(c.regra)) {
    return { suportada: false, motivo: "qualitative_label_not_convertible" };
  }
  if (typeof c.valor !== "number" || !Number.isFinite(c.valor)) {
    return { suportada: false, motivo: "confidence_out_of_range" };
  }
  if (c.valor < 0 || c.valor > 1) {
    return { suportada: false, motivo: "confidence_out_of_range" };
  }
  return { suportada: true, valor: c.valor };
}

/* ------------------------------------------------------------------ *
 * Preflight                                                           *
 * ------------------------------------------------------------------ */

export type MotivoBloqueioR5D =
  | MotivoLinhagem
  | MotivoConfianca
  | "shadow_validator_divergent"
  | "durable_confidence_incompatible";

export interface BloqueioR5D {
  readonly motivo: MotivoBloqueioR5D;
  readonly detalhe: string;
}

/**
 * As QUATRO condicoes, verificadas separadamente. Sao quatro e nao tres porque
 * R5-D0-C resolveu a confianca no contrato em memoria e deixou uma consequencia
 * viva: o **schema duravel** do store continua exigindo numero, entao uma
 * recomendacao `nao_estimada` seria aceita pelo validador e recusada no registro.
 * Fundir as duas verificacoes esconderia exatamente esse degrau. Ver D73.
 */
export type ProntidaoR5D =
  | {
      readonly status: "ready";
      readonly event_lineage: "proven";
      readonly confidence_contract: "supported";
      readonly durable_confidence_compatibility: "compatible";
      readonly shadow_validator: "shared";
    }
  | { readonly status: "blocked"; readonly bloqueios: readonly BloqueioR5D[] };

/**
 * O preflight. Ele NAO ativa nada: devolve um veredito.
 *
 * `ready` exige as TRES condicoes juntas. Duas verdes e uma vermelha continua
 * bloqueado — foi para isso que a missao pediu um resultado unico em vez de
 * tres indicadores soltos que alguem leria pela metade.
 */
export function avaliarProntidaoR5D(entrada: {
  readonly linhagem: ResultadoLinhagem;
  readonly confianca: ResultadoConfianca;
  readonly validador_compartilhado: boolean;
  /**
   * O schema duravel aceita confianca `nao_estimada`? Enquanto nao aceitar, uma
   * recomendacao sem numero passa no validador e morre no registro — e isso e
   * bloqueio, nao detalhe. Padrao `false`: o schema nao foi alterado.
   */
  readonly confianca_duravel_compativel?: boolean;
}): ProntidaoR5D {
  const bloqueios: BloqueioR5D[] = [];
  if (!entrada.linhagem.elegivel) {
    bloqueios.push({
      motivo: entrada.linhagem.motivo,
      detalhe: "a evidencia nao tem linhagem comprovada ate o event log",
    });
  }
  if (!entrada.confianca.suportada) {
    bloqueios.push({
      motivo: entrada.confianca.motivo,
      detalhe: "a confianca nao tem lastro que o contrato aceite",
    });
  }
  if (!entrada.validador_compartilhado) {
    bloqueios.push({
      motivo: "shadow_validator_divergent",
      detalhe: "runtime e harness precisam chamar a MESMA validarDraftShadow",
    });
  }
  if (entrada.confianca_duravel_compativel !== true) {
    bloqueios.push({
      motivo: "durable_confidence_incompatible",
      detalhe:
        "o schema duravel ainda exige confianca numerica: `nao_estimada` passaria no validador e morreria no registro",
    });
  }
  if (bloqueios.length > 0) return { status: "blocked", bloqueios };
  return {
    status: "ready",
    event_lineage: "proven",
    confidence_contract: "supported",
    durable_confidence_compatibility: "compatible",
    shadow_validator: "shared",
  };
}
