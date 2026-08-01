/**
 * DeliveryOS — Product System · vocabulario de estado
 *
 * Este arquivo define os NOMES dos estados e a forma de representar ausencia.
 * Ele NAO define rotulo, cor, glifo nem texto acessivel: isso vive em
 * docs/figma/DESIGN_TOKENS.json e chega ao navegador por /api/estados. Ha um so
 * lugar onde a palavra que o usuario le e escrita, e nao e aqui.
 *
 * O teste "estados: o vocabulario TS e o JSON sao a mesma lista" impede que os
 * dois lados divirjam.
 */

/** As 21 especies exigidas pela Unidade 6, em seis eixos independentes. */
export type EstadoSemantico =
  // procedencia
  | "real"
  | "simulado"
  | "controle"
  | "controle_positivo_sintetico"
  // observacao
  | "saudavel"
  | "parcial"
  | "degradado"
  | "stale"
  | "evidencia_insuficiente"
  | "indisponivel"
  // ciclo de vida
  | "shadow"
  | "expirado"
  | "retirado"
  | "invalidado"
  | "acao_humana_necessaria"
  // conexao
  | "offline"
  | "sincronizando"
  | "conflito"
  // erro
  | "erro_recuperavel"
  | "erro_bloqueante"
  // disponibilidade
  | "futuro"
  | "somente_demonstracao";

export const ESTADOS: readonly EstadoSemantico[] = [
  "real",
  "simulado",
  "controle",
  "controle_positivo_sintetico",
  "saudavel",
  "parcial",
  "degradado",
  "stale",
  "evidencia_insuficiente",
  "indisponivel",
  "shadow",
  "expirado",
  "retirado",
  "invalidado",
  "acao_humana_necessaria",
  "offline",
  "sincronizando",
  "conflito",
  "erro_recuperavel",
  "erro_bloqueante",
  "futuro",
  "somente_demonstracao",
] as const;

/**
 * Eixos que NAO compartilham campo. Um dado pode ser `real` e `stale` ao mesmo
 * tempo; nao pode ser `expirado` e `retirado` ao mesmo tempo. Fundir os eixos
 * repetiria o erro que o modelo multidimensional do Brain existe para corrigir
 * (D34).
 */
export const EIXOS = {
  procedencia: ["real", "simulado", "controle", "controle_positivo_sintetico"],
  observacao: [
    "saudavel",
    "parcial",
    "degradado",
    "stale",
    "evidencia_insuficiente",
    "indisponivel",
  ],
  ciclo_de_vida: [
    "shadow",
    "expirado",
    "retirado",
    "invalidado",
    "acao_humana_necessaria",
  ],
  conexao: ["offline", "sincronizando", "conflito"],
  erro: ["erro_recuperavel", "erro_bloqueante"],
  disponibilidade: ["futuro", "somente_demonstracao"],
} as const satisfies Record<string, readonly EstadoSemantico[]>;

/** Procedencia do dado. Nunca inferida: sempre carregada de quem o produziu. */
export type Procedencia =
  | "real"
  | "simulado"
  | "controle"
  | "controle_positivo_sintetico";

/**
 * Por que um campo nao tem valor. Sao motivos DIFERENTES e a interface nao pode
 * fundi-los: "ninguem observou" nao e "a integracao nao existe".
 */
export type MotivoAusencia =
  | "indisponivel"
  | "evidencia_insuficiente"
  | "integracao_pendente"
  | "nao_observado";

/**
 * A trava estrutural desta unidade: um numero so existe na view model se ele foi
 * observado. Nao ha caminho de tipo que produza `0` a partir de `null` — para
 * ler o valor e preciso primeiro provar `observado === true`.
 */
export type Campo<T> =
  | {
      readonly observado: true;
      readonly valor: T;
      readonly origem: Procedencia;
      readonly observado_em: string;
    }
  | {
      readonly observado: false;
      readonly motivo: MotivoAusencia;
      readonly explicacao: string;
    };

export function observado<T>(
  valor: T,
  origem: Procedencia,
  observado_em: string,
): Campo<T> {
  return { observado: true, valor, origem, observado_em };
}

export function ausente<T>(
  motivo: MotivoAusencia,
  explicacao: string,
): Campo<T> {
  return { observado: false, motivo, explicacao };
}

/**
 * `null`, `undefined` e `"desconhecida"` viram AUSENCIA, nunca zero.
 * Zero legitimo (uma contagem realmente medida como 0) continua sendo zero — e
 * por isso a funcao exige que quem chama diga qual e o valor sentinela.
 */
export function deValorPossivelmenteAusente<T>(
  valor: T | null | undefined,
  origem: Procedencia,
  observado_em: string,
  explicacaoSeAusente: string,
  motivo: MotivoAusencia = "nao_observado",
): Campo<T> {
  if (valor === null || valor === undefined) {
    return ausente<T>(motivo, explicacaoSeAusente);
  }
  return observado(valor, origem, observado_em);
}

/** Contrato de badge que a superficie renderiza. So o NOME do estado viaja. */
export interface Selo {
  readonly estado: EstadoSemantico;
  /** Frase curta especifica deste uso; o rotulo generico vem do JSON. */
  readonly detalhe?: string;
}

export function selo(estado: EstadoSemantico, detalhe?: string): Selo {
  return detalhe === undefined ? { estado } : { estado, detalhe };
}

/** Uma evidencia rastreavel. Sem isto, confianca nao pode ser apresentada. */
export interface Evidencia {
  readonly tipo: string;
  readonly referencia: string;
  readonly observado_em: string;
}

/**
 * Confianca so existe acompanhada de evidencia. A regra vem do Copiloto
 * (`exigirConfianca`) e e reafirmada aqui porque a interface e o ultimo lugar
 * onde um numero sem lastro poderia escapar.
 */
export function confiancaApresentavel(
  confianca: number | null | undefined,
  evidencias: readonly Evidencia[],
): Campo<number> {
  if (evidencias.length === 0) {
    return ausente<number>(
      "evidencia_insuficiente",
      "Nao ha evidencia rastreavel, entao nenhuma confianca e apresentada.",
    );
  }
  if (typeof confianca !== "number" || Number.isNaN(confianca)) {
    return ausente<number>(
      "nao_observado",
      "A confianca nao foi apurada nesta leitura.",
    );
  }
  if (confianca < 0 || confianca > 1) {
    return ausente<number>(
      "evidencia_insuficiente",
      "Confianca fora da faixa valida foi recusada.",
    );
  }
  return observado(
    confianca,
    "real",
    evidencias[0]?.observado_em ?? new Date(0).toISOString(),
  );
}

/** Bloco de limitacao: o que esta superficie explicitamente NAO prova. */
export interface Limitacao {
  readonly titulo: string;
  readonly texto: string;
}
