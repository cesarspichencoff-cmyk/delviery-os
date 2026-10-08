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

import { readFile, stat } from "node:fs/promises";
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

/** Só o que esta leitura usa do sistema de arquivos — injetável para teste. */
export interface ArquivosDoLeitor {
  readonly readFile: (p: string, enc: "utf8") => Promise<string>;
  readonly stat: (p: string) => Promise<{ readonly mtimeMs: number }>;
}
const ARQUIVOS_REAIS: ArquivosDoLeitor = { readFile: (p, enc) => readFile(p, enc), stat: (p) => stat(p) };

/**
 * No Windows, File.Replace são dois renames (alvo -> backup, temporário -> alvo):
 * entre eles o caminho NÃO existe. `existsSync` seguido de `statSync` caía nessa
 * janela — o stat lançava e a rota respondia 500 com o caminho local; o
 * `existsSync` falso virava "sinal ausente" e um DOWN espúrio. Agora cada leitura
 * tenta de novo com pausa curta antes de decidir, e nunca lança. Mesma regra do
 * avaliador (`readSignalDoc`/`readMtimeMs` em tata_reader_health_v1.cjs), mas
 * assíncrona: a pausa nunca bloqueia o laço de eventos do servidor.
 */
const TENTATIVAS = 3;
const PAUSA_MS = 15;
const pausa = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/** Documento ausente = sinal ausente (null). Presente e ilegível = sinal inválido. */
async function lerDoc(p: string, fsx: ArquivosDoLeitor, pausaMs: number): Promise<unknown> {
  let ultimo: "AUSENTE" | "ILEGIVEL" = "AUSENTE";
  for (let i = 0; i < TENTATIVAS; i += 1) {
    if (i > 0 && pausaMs > 0) await pausa(pausaMs);
    let texto: string;
    try {
      texto = await fsx.readFile(p, "utf8");
    } catch (e) {
      ultimo = (e as NodeJS.ErrnoException | null)?.code === "ENOENT" ? "AUSENTE" : "ILEGIVEL";
      continue;
    }
    try {
      return JSON.parse(String(texto).replace(/^\uFEFF/, ""));
    } catch {
      ultimo = "ILEGIVEL";
    }
  }
  return ultimo === "AUSENTE" ? null : { schema: "ILEGIVEL" };
}

async function lerMtimeMs(p: string, fsx: ArquivosDoLeitor, pausaMs: number): Promise<number | null> {
  for (let i = 0; i < TENTATIVAS; i += 1) {
    if (i > 0 && pausaMs > 0) await pausa(pausaMs);
    try {
      const m = (await fsx.stat(p)).mtimeMs;
      if (Number.isFinite(m)) return m;
    } catch {
      // janela da troca, ausente ou sem acesso: tenta de novo
    }
  }
  return null;
}

export async function lerSaudeDaFonteTata(
  raiz: string | null,
  agoraMs: number,
  avaliar: AvaliadorDeSaude,
  fsx: ArquivosDoLeitor = ARQUIVOS_REAIS,
  pausaMs: number = PAUSA_MS,
): Promise<SaudeDaFonteTata> {
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
  const [ck, hb, hostStatus, consumerStatus] = await Promise.all([
    lerMtimeMs(c.checkpoint, fsx, pausaMs),
    lerDoc(c.heartbeat, fsx, pausaMs),
    lerDoc(c.host_status, fsx, pausaMs),
    lerDoc(c.consumer_status, fsx, pausaMs),
  ]);
  const v = avaliar({ nowMs: agoraMs, heartbeat: hb, hostStatus, consumerStatus, checkpointMtimeMs: ck });
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
