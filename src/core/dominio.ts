/**
 * DeliveryOS — Camada 0 · Domínio (v2)
 *
 * Correções: idempotência (event_id determinístico) + separação de dimensões
 * (estado_fluxo × estado_desfecho) + cancelado como estado de fluxo final.
 * Camada 1 (lacre) permanece CONGELADA. Nada toca o chão.
 */
import { createHash } from "node:crypto";

/** Dimensão do fluxo operacional do pedido (onde ele está). */
export type EstadoFluxo =
  | "recebido"
  | "aceito"
  | "producao_opaca"      // não observável na C0
  | "conferido_lacrado"   // só Camada 1 (congelada) — NUNCA preenchido aqui
  | "pronto_expedicao"
  | "saiu_entrega"
  | "entregue"
  | "cancelado";          // estado de fluxo FINAL (muda a vida do pedido)

/** Dimensão do desfecho com o cliente (separada do fluxo). */
export type EstadoDesfecho = "sem_desfecho" | "reclamou" | "resolvido";

export type EstadoQualquer = EstadoFluxo | EstadoDesfecho;
export type Dimensao = "fluxo" | "desfecho";

export const OBSERVABILIDADE_C0: Record<EstadoFluxo, "observavel" | "nao_observavel_ainda"> = {
  recebido: "observavel",
  aceito: "observavel",
  producao_opaca: "nao_observavel_ainda",
  conferido_lacrado: "nao_observavel_ainda",
  pronto_expedicao: "observavel",
  saiu_entrega: "observavel",
  entregue: "observavel",
  cancelado: "observavel",
};

export const ESTADOS_FLUXO_FINAIS: EstadoFluxo[] = ["entregue", "cancelado"];

export type Fonte = "ifood" | "sac" | "review" | "interno";
export type Confianca = "alta" | "media" | "baixa";
export type Procedencia = "observado" | "inferido";

/** A TRANSIÇÃO — unidade do sistema, imutável. event_id torna a ingestão replay-safe. */
export interface Transicao {
  event_id: string;             // determinístico: dedup por fonte+pedido_id+tipo_evento+timestamp
  pedido_id: string;
  tipo_evento: string;
  fonte: Fonte;
  timestamp: string;            // ISO 8601
  dimensao: Dimensao;           // qual dimensão esta transição move
  payload_original: unknown;
  estado_anterior: EstadoQualquer | null;
  estado_novo: EstadoQualquer | null;
  confianca: Confianca;
  procedencia: Procedencia;
}

/** Chave de deduplicação + event_id determinístico (mesmo input → mesmo id). */
export function chaveDedup(
  fonte: Fonte,
  pedido_id: string,
  tipo_evento: string,
  timestamp: string,
): string {
  return `${fonte}|${pedido_id}|${tipo_evento}|${timestamp}`;
}
export function eventId(
  fonte: Fonte,
  pedido_id: string,
  tipo_evento: string,
  timestamp: string,
): string {
  return createHash("sha1").update(chaveDedup(fonte, pedido_id, tipo_evento, timestamp)).digest("hex");
}

export interface ItemRequerido {
  nome: string;
  qtd: number;
  critico: boolean;
}
