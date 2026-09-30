/**
 * Q-003 — reconciliação causal ponta a ponta, ainda em shadow.
 *
 * Esta camada não escolhe Foco e não inventa identidade. Ela apenas compõe:
 *   recomendação Shadow
 *     -> resolverAncoraCausalDaRecomendacao()
 *     -> avaliarCandidataShadowNoFoco()
 *
 * O resultado "elegivel" significa somente "pode ser considerado dentro do
 * Foco já ativo". Não significa exibido, aceito nem executado.
 */

import type { Projecao } from "../projections/operacao-viva";
import {
  avaliarCandidataShadowNoFoco,
  type FocoCanonico,
  type MotivoRetencaoShadow,
} from "./attention-authority";
import {
  resolverAncoraCausalDaRecomendacao,
  type IndiceIdentidadeCausal,
  type MotivoSemAncoraCausal,
} from "./causal-identity-bridge";
import type { Recomendacao } from "./shadow";

export type EtapaRetencaoCausal = "identidade" | "foco";

export interface RetencaoCausal {
  readonly recomendacao: Recomendacao;
  readonly etapa: EtapaRetencaoCausal;
  readonly motivo: MotivoSemAncoraCausal | MotivoRetencaoShadow;
}

export interface ResultadoReconciliacaoCausal {
  readonly elegiveis: readonly Recomendacao[];
  readonly retidas: readonly RetencaoCausal[];
}

export function reconciliarRecomendacoesCausais(
  recomendacoes: readonly Recomendacao[],
  projecao: Projecao,
  indice: IndiceIdentidadeCausal,
  foco: FocoCanonico | null,
): ResultadoReconciliacaoCausal {
  const elegiveis: Recomendacao[] = [];
  const retidas: RetencaoCausal[] = [];

  for (const recomendacao of recomendacoes) {
    const identidade = resolverAncoraCausalDaRecomendacao(
      recomendacao,
      projecao,
      indice,
    );

    if (!identidade.ok) {
      retidas.push({
        recomendacao,
        etapa: "identidade",
        motivo: identidade.motivo,
      });
      continue;
    }

    const noFoco = avaliarCandidataShadowNoFoco(
      { recomendacao, ancora: identidade.ancora },
      foco,
    );

    if (!noFoco.elegivel) {
      retidas.push({
        recomendacao,
        etapa: "foco",
        motivo: noFoco.motivo,
      });
      continue;
    }

    elegiveis.push(recomendacao);
  }

  return { elegiveis, retidas };
}
