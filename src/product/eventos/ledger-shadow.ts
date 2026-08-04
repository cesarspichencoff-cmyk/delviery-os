/**
 * LEDGER DE SHADOW MODE — isolado, e desligado por padrao
 * ============================================================================
 * R5-D3. Onde os fatos dos produtores novos pousam ENQUANTO ninguem confia
 * neles.
 *
 * TRES SEPARACOES QUE NAO SE NEGOCIAM:
 *
 *   1. **Desligado por padrao.** `habilitado` nasce `false`, e com ele desligado
 *      `registrar()` nao escreve — devolve `ignorado_shadow_desligado`. Ligar e
 *      decisao explicita de quem chama, nunca padrao de construcao.
 *   2. **Arquivo proprio.** Ele nunca aponta para o ledger oficial, e a guarda
 *      recusa caminho que contenha `official`/`oficial`. Um shadow que grava no
 *      log de verdade nao e shadow.
 *   3. **So fatos.** Nao ha recomendacao, nao ha projecao, nao ha escrita em
 *      sistema externo. O que entra e envelope validado; o que sai e replay.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { validarEvento, type EnvelopeOperacional } from "./catalogo-operacional";

export const LEDGER_SHADOW_VERSAO = "ledger-shadow@1";

export interface OpcoesLedgerShadow {
  readonly arquivo: string;
  /** Desligado por padrao. Ligar e decisao de quem chama. */
  readonly habilitado?: boolean;
}

export type ResultadoRegistro =
  | { readonly tipo: "gravado"; readonly event_id: string }
  | { readonly tipo: "duplicata_identica"; readonly event_id: string }
  | { readonly tipo: "conflito"; readonly chave: string; readonly detalhe: string }
  | { readonly tipo: "recusado"; readonly motivo: string; readonly detalhe: string }
  | { readonly tipo: "ignorado_shadow_desligado" };

export interface LedgerShadow {
  readonly habilitado: boolean;
  readonly arquivo: string;
  registrar(bruto: unknown): ResultadoRegistro;
  /** Replay: le o arquivo e devolve os eventos validos, na ordem gravada. */
  replay(): readonly EnvelopeOperacional[];
  /** Linhas que o replay recusou, com motivo. Nunca somem em silencio. */
  recusadas(): readonly { readonly linha: number; readonly motivo: string }[];
}

/** A impressao do fato, para distinguir duplicata identica de divergente. */
function impressao(e: EnvelopeOperacional): string {
  return JSON.stringify({ t: e.event_type, o: e.occurred_at, p: e.payload });
}

export function criarLedgerShadow(o: OpcoesLedgerShadow): LedgerShadow {
  const habilitado = o.habilitado === true;
  if (/oficial|official/i.test(o.arquivo)) {
    throw new Error("ledger de shadow nao pode apontar para o ledger oficial");
  }
  // Chave idempotente -> impressao do fato. Em memoria: o replay reconstroi.
  const vistos = new Map<string, string>();
  const recusas: { linha: number; motivo: string }[] = [];

  function registrar(bruto: unknown): ResultadoRegistro {
    // A PRIMEIRA guarda, antes de validar qualquer coisa: desligado nao escreve.
    if (!habilitado) return { tipo: "ignorado_shadow_desligado" };
    const v = validarEvento(bruto);
    if (!v.ok) return { tipo: "recusado", motivo: v.motivo, detalhe: v.detalhe };
    const e = v.evento;
    const chave = `${e.source}|${e.source_event_id}`;
    const marca = impressao(e);
    const anterior = vistos.get(chave);
    if (anterior !== undefined) {
      if (anterior === marca) return { tipo: "duplicata_identica", event_id: e.event_id };
      return {
        tipo: "conflito",
        chave,
        detalhe: "mesma chave idempotente com conteudo diferente",
      };
    }
    vistos.set(chave, marca);
    const dir = dirname(o.arquivo);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(o.arquivo, JSON.stringify(e) + "\n");
    return { tipo: "gravado", event_id: e.event_id };
  }

  function replay(): readonly EnvelopeOperacional[] {
    recusas.length = 0;
    if (!existsSync(o.arquivo)) return [];
    const eventos: EnvelopeOperacional[] = [];
    const linhas = readFileSync(o.arquivo, "utf8").split("\n");
    for (let i = 0; i < linhas.length; i += 1) {
      const linha = linhas[i]!;
      if (linha.trim() === "") continue;
      let bruto: unknown;
      try {
        bruto = JSON.parse(linha);
      } catch {
        recusas.push({ linha: i + 1, motivo: "linha_corrompida" });
        continue;
      }
      const v = validarEvento(bruto);
      if (!v.ok) {
        recusas.push({ linha: i + 1, motivo: v.motivo });
        continue;
      }
      eventos.push(v.evento);
    }
    return eventos;
  }

  return {
    habilitado,
    arquivo: o.arquivo,
    registrar,
    replay,
    recusadas: () => [...recusas],
  };
}
