/**
 * PORTAS DOS PRODUTORES — contrato sem implementacao viva
 * ============================================================================
 * R5-D2. Define COMO uma fonte entregaria fatos de origem, sem que nenhuma
 * fonte esteja conectada. Nao ha polling, nao ha consumer, nao ha conexao
 * permanente, nao ha escrita, e nada aqui grava no ledger oficial.
 *
 * A REGRA QUE DECIDE O DESENHO: **um produtor nunca entrega
 * `LeituraOperacional`.** O unico resultado permitido e evento de origem
 * validavel — ou diagnostico de indisponibilidade. A leitura e projecao (D76),
 * e deixar um adapter produzi-la faria a projecao nascer pronta de um lugar que
 * nao sabe reconstrui-la.
 *
 * A porta tambem nao conhece Odhen nem iFood. Ela conhece CURSOR, LOTE,
 * WATERMARK e SAUDE — se ela mencionasse um sistema, trocar de fonte exigiria
 * trocar o contrato, e a qualificacao de R5-D2 mostrou que **cada evento tem um
 * produtor autoritativo diferente**.
 */

import type { EnvelopeOperacional, TipoOperacional } from "./catalogo-operacional";
import type { EstadoDeFonte } from "../viewmodels/sinais";

export const CONTRATO_PORTA_VERSAO = "porta-produtor@1";

/* ------------------------------------------------------------------ *
 * Cursor e watermark                                                  *
 * ------------------------------------------------------------------ */

/**
 * Onde a leitura parou. Opaco de proposito: quem interpreta e a fonte, e um
 * cursor que o chamador soubesse decompor viraria uma segunda verdade sobre a
 * posicao.
 */
export interface Cursor {
  readonly valor: string;
  readonly fonte_id: string;
  readonly contrato: string;
}

/**
 * Ate onde a fonte garante ter entregue tudo. Diferente do cursor: o cursor diz
 * onde EU parei, o watermark diz ate onde ELA se compromete. Um lote pode
 * avancar o cursor sem avancar o watermark — e nesse intervalo nao existe
 * garantia de completude.
 */
export interface Watermark {
  readonly completo_ate: string;
  readonly parcial_apos: boolean;
}

/* ------------------------------------------------------------------ *
 * Falhas e diagnostico                                                *
 * ------------------------------------------------------------------ */

export type MotivoIndisponibilidade =
  | "credencial_ausente"
  | "endpoint_ausente"
  | "fonte_inacessivel"
  | "schema_inesperado"
  | "campo_obrigatorio_ausente"
  | "sem_timestamp_de_origem"
  | "estado_atual_sem_historico"
  | "duplicata_sem_chave_estavel"
  | "reimpressao_indistinguivel"
  | "cancelamento_nao_observado"
  | "praca_inferida_nao_declarada"
  | "relogios_divergentes"
  | "cursor_expirado"
  | "paginacao_incompleta"
  | "resposta_parcial"
  | "timeout"
  | "rate_limit"
  | "fonte_degradada"
  | "dados_antigos"
  | "pii_presente"
  | "probe_nao_qualificado";

export interface Diagnostico {
  readonly motivo: MotivoIndisponibilidade;
  readonly detalhe: string;
  readonly fonte_id: string;
  /** Saude observada no momento do diagnostico, quando ha o que observar. */
  readonly saude: EstadoDeFonte | null;
}

/* ------------------------------------------------------------------ *
 * Resultado de leitura                                                *
 * ------------------------------------------------------------------ */

export interface Conflito {
  readonly chave: string;
  readonly detalhe: string;
}

/**
 * O que um produtor devolve. Note o que NAO esta aqui: `LeituraOperacional`,
 * carga, capacidade derivada, confianca. Um lote e um punhado de FATOS.
 */
export interface Lote {
  readonly eventos: readonly EnvelopeOperacional[];
  readonly cursor: Cursor;
  readonly watermark: Watermark;
  readonly conflitos: readonly Conflito[];
  readonly saude: EstadoDeFonte;
  readonly fonte_id: string;
  readonly contrato: string;
}

export type ResultadoLeitura =
  | { readonly tipo: "lote"; readonly lote: Lote }
  | { readonly tipo: "indisponivel"; readonly diagnostico: Diagnostico };

/* ------------------------------------------------------------------ *
 * As portas                                                           *
 * ------------------------------------------------------------------ */

/**
 * A porta comum. `ler` e incremental a partir de um cursor; `replay` reprocessa
 * uma janela fechada. As duas devolvem FATOS ou diagnostico — nunca projecao.
 */
export interface PortaDeProdutor {
  readonly fonte_id: string;
  readonly contrato: string;
  /** Os tipos que ESTA fonte tem autoridade para emitir. Nunca todos por padrao. */
  readonly emite: readonly TipoOperacional[];
  ler(cursor: Cursor | null, limite: number): Promise<ResultadoLeitura>;
  replay(de: string, ate: string, limite: number): Promise<ResultadoLeitura>;
  saude(): Promise<EstadoDeFonte | Diagnostico>;
}

/** Ciclo do pedido. */
export interface ProdutorEventosPedido extends PortaDeProdutor {
  readonly emite: readonly ["pedido_ciclo_observado"];
}

/** Trabalho por praca. */
export interface ProdutorEventosTrabalhoPraca extends PortaDeProdutor {
  readonly emite: readonly ["trabalho_praca_observado"];
}

/** Capacidade e disponibilidade de praca. */
export interface ProdutorEventosCapacidade extends PortaDeProdutor {
  readonly emite: readonly ["capacidade_praca_observada"];
}

/** Saude de fonte. Observa, e nao produz fato operacional. */
export interface ObservadorSaudeFonte {
  readonly fonte_id: string;
  readonly contrato: string;
  readonly emite: readonly ["source_health_changed"];
  observar(): Promise<ResultadoLeitura>;
}
