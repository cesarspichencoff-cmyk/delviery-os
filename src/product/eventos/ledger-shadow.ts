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
  // O indice anterior era SOMENTE em memoria. Ao reabrir o mesmo arquivo,
  // um reenvio identico virava uma SEGUNDA linha. Reconstituir ANTES do append.
  // Corrompido/conflitante = nao escrever; jamais truncar ou auto-reparar.
  let indiceRestaurado = false;
  let falhaDoIndice: string | null = null;
  function restaurarIndice(): string | null {
    if (indiceRestaurado) return falhaDoIndice;
    indiceRestaurado = true;
    if (!existsSync(o.arquivo)) return null;
    let texto: string;
    try { texto = readFileSync(o.arquivo, "utf8"); }
    catch { falhaDoIndice = "shadow_recovery_read_failed"; return falhaDoIndice; }
    if (texto !== "" && !texto.endsWith(String.fromCharCode(10))) {
      falhaDoIndice = "shadow_recovery_incomplete_tail";
      return falhaDoIndice;
    }
    const entradas = texto.split(String.fromCharCode(10));
    for (let i = 0; i < entradas.length; i += 1) {
      const linha = entradas[i]!;
      if (linha === "") continue;
      let value: unknown;
      try { value = JSON.parse(linha); }
      catch { falhaDoIndice = "shadow_recovery_corrupt_line"; return falhaDoIndice; }
      const valid = validarEvento(value);
      if (!valid.ok) {
        falhaDoIndice = "shadow_recovery_invalid_event";
        return falhaDoIndice;
      }
      const evento = valid.evento;
      const chave = `${evento.source}|${evento.source_event_id}`;
      const marca = impressao(evento);
      const anterior = vistos.get(chave);
      if (anterior !== undefined && anterior !== marca) {
        falhaDoIndice = "shadow_recovery_conflicting_event";
        return falhaDoIndice;
      }
      vistos.set(chave, marca);
    }
    return null;
  }

  function registrar(bruto: unknown): ResultadoRegistro {
    // A PRIMEIRA guarda, antes de validar qualquer coisa: desligado nao escreve.
    if (!habilitado) return { tipo: "ignorado_shadow_desligado" };
    const v = validarEvento(bruto);
    if (!v.ok) return { tipo: "recusado", motivo: v.motivo, detalhe: v.detalhe };
    const e = v.evento;
    const recuperacao = restaurarIndice();
    if (recuperacao !== null)
      return { tipo: "recusado", motivo: recuperacao,
        detalhe: "shadow requer recuperacao supervisionada" };
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
    const dir = dirname(o.arquivo);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(o.arquivo, JSON.stringify(e) + "\n");
    vistos.set(chave, marca);
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
