/**
 * PRODUTOR DE TRABALHO POR PRACA — registro explicito da operacao
 * ============================================================================
 * R5-D3. O primeiro produtor real de `trabalho_praca_observado@1`.
 *
 * POR QUE REGISTRO EXPLICITO, E NAO O ODHEN (D81). R5-D2 provou que a comanda do
 * Odhen e UNICA, sem separacao por praca: a praca so poderia ser INFERIDA do
 * item, e a impressao prova emissao, nunca inicio de preparo. Nenhum acesso
 * conserta isso — o dado nao existe na fonte.
 *
 * Entao a fonte passa a ser a propria bancada declarando o que fez. E menos
 * automatico e infinitamente mais honesto: quem registra sabe qual praca e sabe
 * quando comecou.
 *
 * O QUE ELE NAO FAZ: nao emite `LeituraOperacional`, nao emite recomendacao, nao
 * escreve em sistema externo, nao infere praca, nao infere estado. Uma unica
 * especie de fato sai daqui.
 *
 * PII: `operador` e pseudonimo OPACO fornecido pelo chamador — terminal, cracha
 * ou apelido de turno. Nome de pessoa nunca entra, e a guarda recusa o que
 * parecer nome.
 */

import {
  VERSOES_SUPORTADAS,
  validarEvento,
  type EnvelopeOperacional,
  type EstadoTrabalho,
} from "./catalogo-operacional";
import type { PracaId } from "../viewmodels/areas";

export const PRODUTOR_TRABALHO_VERSAO = "produtor-trabalho-praca@1";
export const FONTE_REGISTRO_EXPLICITO = "registro-operacao";

/** O que a bancada registra. Cada campo e observado por quem esta la. */
export interface RegistroDeTrabalho {
  readonly unidade: string;
  readonly tenant: string;
  readonly praca: PracaId;
  readonly pedido_id: string;
  /** Item ou grupo de trabalho. Nunca vazio: sem alvo nao ha trabalho. */
  readonly grupo: string;
  readonly estado: EstadoTrabalho;
  readonly ocorrido_em: string;
  readonly observado_em: string;
  /** Pseudonimo opaco: terminal, cracha ou apelido de turno. NUNCA nome. */
  readonly operador: string;
  /** Revisao da origem. Duas iguais com conteudo diferente = conflito. */
  readonly revisao: number;
  readonly quantidade: number | null;
}

export type MotivoRecusa =
  | "praca_ausente"
  | "pedido_ausente"
  | "grupo_ausente"
  | "estado_desconhecido"
  | "carimbo_invalido"
  | "operador_parece_identificavel"
  | "revisao_invalida"
  | "envelope_invalido";

export type ResultadoProducao =
  | { readonly ok: true; readonly evento: EnvelopeOperacional }
  | { readonly ok: false; readonly motivo: MotivoRecusa; readonly detalhe: string };

/**
 * Chave idempotente: identidade do TRABALHO mais a transicao registrada.
 *
 * O mesmo registro reenviado colide; um estado novo do mesmo trabalho nao colide.
 * `observado_em` fica de fora — reenviar o mesmo fato mais tarde continua sendo
 * o mesmo fato.
 */
export function chaveDoRegistro(r: RegistroDeTrabalho): string {
  return [r.unidade, r.praca, r.pedido_id, r.grupo, r.estado, String(r.revisao)].join("|");
}

/** O id do trabalho: a identidade que atravessa as transicoes. */
export function trabalhoId(r: RegistroDeTrabalho): string {
  return `w:${r.unidade}:${r.praca}:${r.pedido_id}:${r.grupo}`;
}

/**
 * Um pseudonimo aceitavel nao parece nome de pessoa. Nao e deteccao de PII — e a
 * recusa das formas que ja apareceram: nome com sobrenome, e-mail, telefone,
 * CPF.
 */
function operadorOpaco(v: string): boolean {
  const t = v.trim();
  if (t === "") return false;
  if (/@/.test(t)) return false;
  if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(t)) return false;
  if (/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/.test(t)) return false;
  // "Joao Silva" — duas palavras capitalizadas seguidas.
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ÿ]+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ÿ]+/.test(t)) return false;
  return true;
}

const instante = (v: string): number => Date.parse(v);

/**
 * Registro -> evento de origem. PURA: sem relogio, sem random, sem I/O. O
 * `event_id` e derivado da chave idempotente, entao reenviar o mesmo registro
 * produz o MESMO id — a idempotencia comeca aqui, nao no ledger.
 */
export function produzirTrabalhoPraca(r: RegistroDeTrabalho): ResultadoProducao {
  if ((r.praca as unknown as string | null) === null || String(r.praca).trim() === "") {
    return { ok: false, motivo: "praca_ausente", detalhe: "sem praca nao ha trabalho" };
  }
  if (r.pedido_id.trim() === "") {
    return { ok: false, motivo: "pedido_ausente", detalhe: "pedido_id vazio" };
  }
  if (r.grupo.trim() === "") {
    return { ok: false, motivo: "grupo_ausente", detalhe: "grupo vazio" };
  }
  if (!["criado", "aguardando", "iniciado", "concluido", "cancelado"].includes(r.estado)) {
    return { ok: false, motivo: "estado_desconhecido", detalhe: String(r.estado) };
  }
  const oc = instante(r.ocorrido_em);
  const ob = instante(r.observado_em);
  if (!Number.isFinite(oc) || !Number.isFinite(ob) || oc > ob) {
    return { ok: false, motivo: "carimbo_invalido", detalhe: `${r.ocorrido_em}/${r.observado_em}` };
  }
  if (!operadorOpaco(r.operador)) {
    return { ok: false, motivo: "operador_parece_identificavel", detalhe: "pseudonimo recusado" };
  }
  if (!Number.isInteger(r.revisao) || r.revisao < 0) {
    return { ok: false, motivo: "revisao_invalida", detalhe: String(r.revisao) };
  }

  const chave = chaveDoRegistro(r);
  const envelope = {
    event_id: `trab-${chave}`,
    event_type: "trabalho_praca_observado" as const,
    event_version: VERSOES_SUPORTADAS.trabalho_praca_observado,
    tenant_id: r.tenant,
    unit_id: r.unidade,
    source: FONTE_REGISTRO_EXPLICITO,
    source_event_id: chave,
    occurred_at: r.ocorrido_em,
    observed_at: r.observado_em,
    ingested_at: r.observado_em,
    correlation_id: trabalhoId(r),
    payload: {
      trabalho_id: trabalhoId(r),
      pedido_id: r.pedido_id,
      praca_id: r.praca,
      referencia: r.grupo,
      quantidade: r.quantidade,
      estado: r.estado,
      source_revision: r.revisao,
    },
  };

  // O produtor nao confia em si mesmo: o envelope passa pelo MESMO validador do
  // catalogo antes de sair. Uma segunda validacao aqui viraria uma segunda
  // verdade sobre o que e um evento valido.
  const v = validarEvento(envelope);
  if (!v.ok) return { ok: false, motivo: "envelope_invalido", detalhe: v.motivo };
  return { ok: true, evento: v.evento };
}
