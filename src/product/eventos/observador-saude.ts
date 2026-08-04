/**
 * OBSERVADOR DE SAUDE DE FONTE — o unico produtor qualificado em R5-D2
 * ============================================================================
 * R5-D3. Emite `source_health_changed@1`, e so isso. Ele nao depende de
 * credencial, de rede nem da maquina da loja — e por isso foi o unico que R5-D2
 * conseguiu qualificar.
 *
 * A REGRA QUE ELE EXISTE PARA PROTEGER: **ausencia de sinal nunca vira
 * saudavel.** Uma fonte que parou de responder e `indisponivel`; uma que
 * responde velho e `stale`. Nenhuma das duas e saude, e o silencio nao vira
 * verde por omissao.
 */

import {
  VERSOES_SUPORTADAS,
  validarEvento,
  type EnvelopeOperacional,
} from "./catalogo-operacional";
import type { EstadoDeFonte } from "../viewmodels/sinais";

export const OBSERVADOR_SAUDE_VERSAO = "observador-saude@1";
export const FONTE_OBSERVADOR = "observador-interno";

/** O que se observa de uma fonte. `respondeu: false` NUNCA produz `saudavel`. */
export interface ObservacaoDeFonte {
  readonly fonte_id: string;
  readonly respondeu: boolean;
  /** Idade da ultima resposta, em minutos. `null` = nao observada. */
  readonly idade_min: number | null;
  /** Resposta veio completa? `false` => `parcial`. */
  readonly completa: boolean;
  readonly observado_em: string;
  readonly revisao: number;
}

export interface ContextoSaude {
  readonly tenant: string;
  readonly unidade: string;
  /** Acima de quantos minutos a resposta e considerada velha. Explicito. */
  readonly limite_stale_min: number;
}

/**
 * Deriva o estado. A ordem das guardas e a decisao: nao responder domina tudo, e
 * so depois vem idade e completude. Inverter isso deixaria uma fonte muda passar
 * por parcial.
 */
export function estadoDaFonte(o: ObservacaoDeFonte, ctx: ContextoSaude): EstadoDeFonte {
  if (!o.respondeu) return "indisponivel";
  if (o.idade_min !== null && o.idade_min > ctx.limite_stale_min) return "stale";
  if (!o.completa) return "parcial";
  // Idade NAO observada com resposta completa nao vira `saudavel` por otimismo:
  // sem saber quando ela respondeu, o maximo honesto e `parcial`.
  if (o.idade_min === null) return "parcial";
  return "saudavel";
}

export type ResultadoSaude =
  | { readonly ok: true; readonly evento: EnvelopeOperacional }
  | { readonly ok: false; readonly motivo: string; readonly detalhe: string };

/** Observacao -> evento. PURA: sem relogio, sem rede, sem I/O. */
export function observarSaude(o: ObservacaoDeFonte, ctx: ContextoSaude): ResultadoSaude {
  if (o.fonte_id.trim() === "") {
    return { ok: false, motivo: "fonte_ausente", detalhe: "fonte_id vazio" };
  }
  const estado = estadoDaFonte(o, ctx);
  const chave = `${o.fonte_id}|${estado}|${String(o.revisao)}`;
  const envelope = {
    event_id: `saude-${chave}`,
    event_type: "source_health_changed" as const,
    event_version: VERSOES_SUPORTADAS.source_health_changed,
    tenant_id: ctx.tenant,
    unit_id: ctx.unidade,
    source: FONTE_OBSERVADOR,
    source_event_id: chave,
    occurred_at: o.observado_em,
    observed_at: o.observado_em,
    ingested_at: o.observado_em,
    correlation_id: `saude:${o.fonte_id}`,
    payload: {
      source_id: o.fonte_id,
      estado,
      detalhe: o.respondeu
        ? `idade ${o.idade_min === null ? "nao observada" : `${String(o.idade_min)} min`}`
        : "sem resposta",
      source_revision: o.revisao,
    },
  };
  const v = validarEvento(envelope);
  if (!v.ok) return { ok: false, motivo: "envelope_invalido", detalhe: v.motivo };
  return { ok: true, evento: v.evento };
}
