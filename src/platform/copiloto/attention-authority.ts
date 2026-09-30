/**
 * Q-003 — autoridade da atenção.
 *
 * O MOTOR escolhe a tensão ativa (sess.active.sit). `decisao.js` pode
 * refinar a ação DENTRO dessa causa-raiz. O Copiloto Shadow não ganha um
 * segundo slot de atenção: ele só pode ser considerado para o Foco quando um
 * consumidor apresenta uma âncora causal explícita e compatível.
 *
 * Regra de segurança: ausência de Foco, ausência de âncora ou identidade
 * divergente => permanece sombra. Nunca inferir identidade para "ajudar".
 */

import type { Recomendacao } from "./shadow";

export type KindFocoCanonico = "praca" | "saida" | "fechamento" | "conferencia" | "order";

export interface FocoCanonico {
  readonly key: string;
  readonly kind: KindFocoCanonico;
  readonly praca?: string;
  readonly id?: string;
}

export type AncoraCausalShadow =
  | { readonly kind: "praca"; readonly praca: string }
  | { readonly kind: "saida" }
  | { readonly kind: "pedido"; readonly id: string };

export interface CandidataShadowAtencao {
  readonly recomendacao: Recomendacao;
  /** Nula até existir identidade legitimamente provada entre Shadow e MOTOR. */
  readonly ancora: AncoraCausalShadow | null;
}

export type MotivoRetencaoShadow =
  | "sem_foco_ativo"
  | "sem_ancora_causal"
  | "foco_sem_identidade"
  | "causa_raiz_divergente";

export type ResultadoAtencao =
  | { readonly elegivel: true; readonly recomendacao: Recomendacao }
  | {
      readonly elegivel: false;
      readonly recomendacao: Recomendacao;
      readonly motivo: MotivoRetencaoShadow;
    };

function mesmaCausa(foco: FocoCanonico, ancora: AncoraCausalShadow): boolean | null {
  switch (foco.kind) {
    case "praca":
      if (!foco.praca) return null;
      return ancora.kind === "praca" && ancora.praca === foco.praca;
    case "saida":
      return ancora.kind === "saida";
    case "order":
    case "fechamento":
    case "conferencia":
      if (!foco.id) return null;
      return ancora.kind === "pedido" && ancora.id === foco.id;
  }
}

export function avaliarCandidataShadowNoFoco(
  candidata: CandidataShadowAtencao,
  foco: FocoCanonico | null,
): ResultadoAtencao {
  if (!foco) return { elegivel: false, recomendacao: candidata.recomendacao, motivo: "sem_foco_ativo" };
  if (!candidata.ancora) return { elegivel: false, recomendacao: candidata.recomendacao, motivo: "sem_ancora_causal" };
  const compativel = mesmaCausa(foco, candidata.ancora);
  if (compativel === null) return { elegivel: false, recomendacao: candidata.recomendacao, motivo: "foco_sem_identidade" };
  if (!compativel) return { elegivel: false, recomendacao: candidata.recomendacao, motivo: "causa_raiz_divergente" };
  return { elegivel: true, recomendacao: candidata.recomendacao };
}

export function reconciliarShadowComFoco(
  candidatas: readonly CandidataShadowAtencao[],
  foco: FocoCanonico | null,
): { readonly elegiveis: readonly Recomendacao[]; readonly retidas: readonly Exclude<ResultadoAtencao, { elegivel: true }>[] } {
  const avaliadas = candidatas.map((c) => avaliarCandidataShadowNoFoco(c, foco));
  return {
    elegiveis: avaliadas.filter((r): r is Extract<ResultadoAtencao, { elegivel: true }> => r.elegivel).map((r) => r.recomendacao),
    retidas: avaliadas.filter((r): r is Exclude<ResultadoAtencao, { elegivel: true }> => !r.elegivel),
  };
}
