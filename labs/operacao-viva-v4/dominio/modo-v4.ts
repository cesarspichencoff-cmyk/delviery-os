/**
 * LAB · OPERAÇÃO VIVA V4 — a trava do Calmo
 * ============================================================================
 * EXPERIMENTAL. Esta camada **só rebaixa**. Ela nunca promove nada.
 *
 * Quem elege Calmo, Ambiente e Foco é a Operação Viva (C3), e no código de hoje
 * isso sai de `homeVM()`. Este arquivo não reelege: ele recebe a eleição pronta
 * e pergunta uma coisa só —
 *
 *   "esta leitura tem lastro para dizer que está tudo bem?"
 *
 * Se não tiver, o Calmo cai para Ambiente e a tela passa a dizer QUAL fonte
 * falta, em vez de mostrar tudo verde. Foco e Ambiente atravessam intocados: um
 * problema real nunca é apagado por falta de fonte, e uma fonte saudável nunca
 * cria problema que não existe.
 *
 * A assimetria é a regra. Rebaixar por ausência é conservador; promover por
 * ausência seria inventar calma.
 */

import type { ModoOperacional } from "../../../src/product/viewmodels/home-vm";
import { sustentaCalmo, type DivergenciaDeclarada } from "./estado-fonte";
import type { AusenciaMaterial, FonteV4 } from "./leitura-v4";

export interface MotivoDeRebaixamento {
  readonly tipo: "fonte" | "ausencia" | "divergencia";
  readonly texto: string;
}

export interface EleicaoV4 {
  /** O modo que a tela usa. Igual ao canônico, ou Calmo rebaixado a Ambiente. */
  readonly modo: ModoOperacional;
  /** O que a Operação Viva elegeu, preservado para auditoria. */
  readonly modo_canonico: ModoOperacional;
  readonly rebaixado: boolean;
  /** Todos os motivos, não só o primeiro. A tela mostra os que couberem. */
  readonly motivos: readonly MotivoDeRebaixamento[];
}

/**
 * As três coisas que proíbem Calmo. Nenhuma delas é "tem sinal" — isso o modo
 * canônico já resolveu antes de chegar aqui.
 *
 *   1. fonte NECESSÁRIA que não sustenta calma (só `saudavel` sustenta);
 *   2. ausência material SUPERVENIENTE — havia leitura e parou;
 *   3. divergência declarada entre fontes.
 *
 * Ausência ESTRUTURAL não entra: ela é permanente, conhecida e fica visível na
 * tela. A missão proíbe ausência *escondida*, e a estrutural é o contrário
 * disso. Fosse proibitiva, Calmo nunca existiria — e uma regra que nunca deixa
 * nada passar não protege, só decora.
 */
export function motivosQueProibemCalmo(
  fontes: readonly FonteV4[],
  ausencias: readonly AusenciaMaterial[],
  divergencias: readonly DivergenciaDeclarada[],
): readonly MotivoDeRebaixamento[] {
  const motivos: MotivoDeRebaixamento[] = [];

  for (const f of fontes) {
    if (!f.necessaria_para_calmo) continue;
    if (sustentaCalmo(f.estado)) continue;
    motivos.push({
      tipo: "fonte",
      texto: `${f.rotulo} não está saudável: ${f.detalhe}`,
    });
  }

  for (const a of ausencias) {
    if (a.natureza !== "superveniente") continue;
    motivos.push({
      tipo: "ausencia",
      texto: `${a.o_que} — ${a.consequencia}`,
    });
  }

  for (const d of divergencias) {
    motivos.push({
      tipo: "divergencia",
      texto: `${d.fonte_a} e ${d.fonte_b} discordam sobre a mesma área: ${d.incompatibilidade}`,
    });
  }

  return motivos;
}

export function elegerModoV4(
  modoCanonico: ModoOperacional,
  fontes: readonly FonteV4[],
  ausencias: readonly AusenciaMaterial[],
  divergencias: readonly DivergenciaDeclarada[],
): EleicaoV4 {
  const motivos = motivosQueProibemCalmo(fontes, ausencias, divergencias);

  // A ÚNICA transição permitida. `foco` e `ambiente` passam intocados — mesmo
  // com dez fontes caídas, um problema real continua sendo um problema real.
  if (modoCanonico === "calmo" && motivos.length > 0) {
    return {
      modo: "ambiente",
      modo_canonico: "calmo",
      rebaixado: true,
      motivos,
    };
  }

  return {
    modo: modoCanonico,
    modo_canonico: modoCanonico,
    rebaixado: false,
    motivos: [],
  };
}

/** O texto de apoio da tela, coerente com o modo e com o rebaixamento. */
export function apoioDoModo(e: EleicaoV4): string {
  if (e.rebaixado) {
    return "Nada exige decisão agora, mas esta leitura não tem lastro para dizer que está tudo bem. O que falta está nomeado abaixo.";
  }
  switch (e.modo) {
    case "foco":
      return "Uma situação pede decisão agora. As demais continuam visíveis abaixo.";
    case "ambiente":
      return "Nada exige decisão imediata. Estes sinais merecem acompanhamento.";
    case "calmo":
      return "Operação fluindo, com as fontes necessárias respondendo. O que segue é o pulso da casa.";
  }
}

/** O título da tela. `Em fluxo` só aparece quando o Calmo é legítimo. */
export function tituloDoModo(e: EleicaoV4): string {
  if (e.modo === "foco") return "Foco";
  if (e.rebaixado) return "Sem leitura suficiente";
  return e.modo === "ambiente" ? "Ambiente" : "Em fluxo";
}
