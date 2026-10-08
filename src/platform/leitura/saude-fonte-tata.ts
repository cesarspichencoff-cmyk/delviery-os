/**
 * Saúde REAL da fonte TATÁ Comanda (leitor da CAIXA), para a superfície de leitura.
 *
 * O avaliador é UM só — `runtime/tata-reader/tata_reader_health_v1.cjs`, o mesmo
 * que o cutover usa na CAIXA — e chega aqui injetado: este módulo não decide
 * saúde, só lê os quatro arquivos do leitor e devolve o veredito no vocabulário
 * canônico de fonte do produto (`saudavel | parcial | stale | indisponivel`).
 *
 * Três verdades separadas, nunca misturadas:
 *  - NÃO CONFIGURADA: a superfície não sabe onde o leitor grava. Estado
 *    `indisponivel`, motivo explícito. Nunca demonstração no lugar.
 *  - CONFIGURADA: veredito do avaliador sobre arquivos reais.
 *  - HISTÓRICO 05/10: continua sendo histórico (`ao_vivo: false`), em outra rota.
 *
 * Relógio: o avaliador compara horários gravados pela máquina do leitor com o
 * "agora" de quem lê. Só é honesto na MESMA máquina (ou por um canal que
 * preserve o relógio da CAIXA) — e isso vai declarado na resposta. Heartbeat
 * "do futuro" além de dois minutos já sai UNKNOWN no avaliador.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type EstadoCanonicoDeFonte = "saudavel" | "parcial" | "stale" | "indisponivel";

export interface VereditoDoAvaliador {
  readonly verdict: string;
  readonly source_state: EstadoCanonicoDeFonte;
  readonly reasons: readonly string[];
  readonly ages_seconds: Readonly<Record<string, number | null>>;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export type AvaliadorDeSaude = (entrada: {
  nowMs: number;
  heartbeat: unknown;
  hostStatus: unknown;
  consumerStatus: unknown;
  checkpointMtimeMs: number | null;
}) => VereditoDoAvaliador;

export interface CaminhosDoLeitorTata {
  readonly heartbeat: string;
  readonly host_status: string;
  readonly consumer_status: string;
  readonly checkpoint: string;
}

/** O layout que o host do serviço grava em `C:\ProgramData\TataComandaReader`. */
export function caminhosDoLeitorTata(raiz: string): CaminhosDoLeitorTata {
  return {
    heartbeat: join(raiz, "state", "reader-heartbeat-v1.json"),
    host_status: join(raiz, "evidence", "continuous-host-status.json"),
    consumer_status: join(raiz, "evidence", "shadow-consumer-status.json"),
    checkpoint: join(raiz, "state", "reader-watch-checkpoint-v1.json"),
  };
}

export interface SaudeDaFonteTata {
  readonly id: "tata_comanda_reader";
  readonly rotulo: string;
  readonly configurada: boolean;
  readonly estado: EstadoCanonicoDeFonte;
  readonly veredito: string;
  readonly ao_vivo: boolean;
  readonly motivos: readonly string[];
  readonly idades_s: Readonly<Record<string, number | null>>;
  readonly ultimo_lote: {
    readonly desfecho: string | null;
    readonly classe_de_erro: string | null;
  } | null;
  readonly avaliado_em: string;
  readonly relogio: "mesma_maquina_do_leitor";
  readonly privacidade: { readonly customer_pii: false; readonly identificador_de_pedido: false; readonly texto_bruto_de_erro: false };
}

const ROTULO = "Leitor TATÁ Comanda (CAIXA)";
const PRIVACIDADE = Object.freeze({ customer_pii: false, identificador_de_pedido: false, texto_bruto_de_erro: false } as const);

/** Documento ausente = sinal ausente (null). Presente e ilegível = sinal inválido. */
function lerDoc(p: string): unknown {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return { schema: "ILEGIVEL" };
  }
}

export function lerSaudeDaFonteTata(
  raiz: string | null,
  agoraMs: number,
  avaliar: AvaliadorDeSaude,
): SaudeDaFonteTata {
  const avaliado_em = new Date(agoraMs).toISOString();
  if (!raiz || !raiz.trim()) {
    return Object.freeze({
      id: "tata_comanda_reader",
      rotulo: ROTULO,
      configurada: false,
      estado: "indisponivel",
      veredito: "NAO_CONFIGURADA",
      ao_vivo: false,
      motivos: Object.freeze(["FONTE_NAO_CONFIGURADA"]),
      idades_s: Object.freeze({}),
      ultimo_lote: null,
      avaliado_em,
      relogio: "mesma_maquina_do_leitor",
      privacidade: PRIVACIDADE,
    });
  }
  const c = caminhosDoLeitorTata(raiz.trim());
  const ck = existsSync(c.checkpoint) ? statSync(c.checkpoint).mtimeMs : null;
  const hb = lerDoc(c.heartbeat);
  const v = avaliar({
    nowMs: agoraMs,
    heartbeat: hb,
    hostStatus: lerDoc(c.host_status),
    consumerStatus: lerDoc(c.consumer_status),
    checkpointMtimeMs: ck,
  });
  const ev = v.evidence as { last_batch_outcome?: unknown; last_error_class?: unknown };
  return Object.freeze({
    id: "tata_comanda_reader",
    rotulo: ROTULO,
    configurada: true,
    estado: v.source_state,
    veredito: v.verdict,
    ao_vivo: v.source_state === "saudavel",
    motivos: Object.freeze([...v.reasons]),
    idades_s: Object.freeze({ ...v.ages_seconds }),
    ultimo_lote:
      hb === null
        ? null
        : Object.freeze({
            desfecho: typeof ev.last_batch_outcome === "string" ? ev.last_batch_outcome : null,
            classe_de_erro: typeof ev.last_error_class === "string" ? ev.last_error_class : null,
          }),
    avaliado_em,
    relogio: "mesma_maquina_do_leitor",
    privacidade: PRIVACIDADE,
  });
}
