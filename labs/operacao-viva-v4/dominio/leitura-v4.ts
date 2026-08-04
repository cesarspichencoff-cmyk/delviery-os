/**
 * LAB · OPERAÇÃO VIVA V4 — o envelope da leitura
 * ============================================================================
 * EXPERIMENTAL. Nada aqui é dado de operação.
 *
 * A leitura do Lab ENVOLVE a leitura canônica (`LeituraOperacional`) em vez de
 * substituí-la. O motor de sinais continua sendo `sinaisDe()`, do produto; a
 * eleição de Calmo/Ambiente/Foco continua saindo de `homeVM()`. O que este
 * envelope acrescenta é só o que o produto ainda não sabe representar:
 *
 *   - os oito estados de fonte, com divergência declarada;
 *   - Sushi Quentes como unidade operacional própria;
 *   - ritmo, tendência e sinais retirados;
 *   - validade e condição de retirada de cada sinal;
 *   - as condições de consolidação por pedido;
 *   - a ausência material que não pode ficar escondida.
 *
 * TUDO isso é DECLARADO pela fixture. Nada é derivado, inferido ou estimado —
 * um envelope que calculasse essas coisas seria um segundo motor, e a
 * Constituição proíbe criar outro motor.
 */

import type { AmbienteId } from "../../../src/product/viewmodels/areas";
import type { Procedencia } from "../../../src/product/viewmodels/estados";
import type {
  EstadoDeFonte,
  LeituraOperacional,
} from "../../../src/product/viewmodels/sinais";
import type { DivergenciaDeclarada, EstadoDeFonteV4 } from "./estado-fonte";
import type {
  DeclaracaoDeCondicoes,
  UnidadeOperacionalId,
} from "./unidade-operacional";

/* ================================================================== *
 * Fonte
 * ================================================================== */

export interface FonteV4 {
  readonly id: string;
  readonly rotulo: string;
  /**
   * O estado no vocabulário do Lab. Quando a fonte também existe na leitura
   * canônica, `canonico` traz o estado de lá e o gate exige que a tradução
   * bata — o Lab não pode afirmar saúde que o canônico não sustentou.
   */
  readonly estado: EstadoDeFonteV4;
  readonly canonico: EstadoDeFonte | null;
  readonly detalhe: string;
  /** Quando esta fonte foi lida pela última vez. `null` = nunca. */
  readonly ultima_atualizacao: string | null;
  readonly unidades: readonly UnidadeOperacionalId[];
  /**
   * Se o modo Calmo depende desta fonte estar saudável.
   *
   * É DECLARADO, e não derivado de `medicao`, porque "necessária" é julgamento
   * operacional, não propriedade calculável. A Caixa, por exemplo, nunca teve
   * fonte: exigir que ela esteja saudável proibiria Calmo para sempre, o que
   * tornaria a regra decorativa. O que a ausência estrutural exige é ficar
   * VISÍVEL — e isso é outra coisa.
   */
  readonly necessaria_para_calmo: boolean;
}

/* ================================================================== *
 * Ritmo, tendência e o que já foi retirado
 * ================================================================== */

/** Para onde a pressão está indo. Declarado, nunca calculado por regressão. */
export type Tendencia = "subindo" | "estavel" | "cedendo" | "nao_observada";

export interface RitmoDeclarado {
  readonly tendencia: Tendencia;
  /** Uma frase humana. Ex.: "chegando mais rápido do que sai há 20 minutos." */
  readonly texto: string;
  /** O que sustenta a afirmação, ou por que ela não pode ser feita. */
  readonly lastro: string;
}

/**
 * Um sinal que ESTAVA ativo e saiu. Ele continua visível por um tempo porque
 * "sumiu da tela" e "deixou de ser verdade" são coisas diferentes, e a equipe
 * precisa conseguir distinguir as duas.
 */
export interface SinalRetirado {
  readonly codigo: string;
  readonly nome: string;
  readonly alvo_rotulo: string;
  readonly retirado_em: string;
  readonly motivo: string;
}

/* ================================================================== *
 * Validade e retirada — o que o Shadow exige e o motor não tem
 * ================================================================== */

/**
 * Os campos que o contrato do Copiloto Shadow exige de uma recomendação e que o
 * motor de sinais **não produz**: até quando a leitura vale, e o que faria o
 * sinal ser retirado.
 *
 * Eles são DECLARADOS na fixture, marcados `SIMULAÇÃO`, e **não** vêm de
 * tradução entre os dois motores — D43 continua de pé, e este Lab não conecta
 * nada.
 */
export interface ContornoDoSinal {
  /** Código do sinal ao qual isto se aplica (`S1`, `S5`, …). */
  readonly codigo: string;
  /** Alvo, para desambiguar quando o mesmo código aparece mais de uma vez. */
  readonly alvo_rotulo: string;
  readonly validade_ate: string;
  readonly condicao_de_retirada: string;
  /** Por que esta leitura foi eleita, em uma frase. */
  readonly motivo_da_escolha: string;
  readonly impacto_esperado: string;
}

/* ================================================================== *
 * Ausência material
 * ================================================================== */

/**
 * De onde vem a ausência. A distinção decide se ela proíbe Calmo ou não.
 *
 * `estrutural` — nunca houve fonte. É conhecida, permanente e **sempre
 * declarada na tela**. Não proíbe Calmo: a missão proíbe ausência *escondida*,
 * e esta é o oposto de escondida. Se proibisse, Calmo nunca existiria e a regra
 * viraria enfeite.
 *
 * `superveniente` — havia leitura e ela parou. **Proíbe Calmo**, porque a tela
 * passaria a mostrar calma que é só falta de notícia.
 */
export type NaturezaDaAusencia = "estrutural" | "superveniente";

/**
 * Algo que a leitura NÃO enxerga e que muda o que ela significa. Ausência
 * material não é rodapé.
 */
export interface AusenciaMaterial {
  readonly o_que: string;
  readonly por_que: string;
  readonly consequencia: string;
  readonly natureza: NaturezaDaAusencia;
  /** As unidades afetadas. Vazio quando afeta a casa inteira. */
  readonly unidades: readonly UnidadeOperacionalId[];
}

/* ================================================================== *
 * A leitura do Lab
 * ================================================================== */

export interface ValidacaoEsperada {
  /** O que o DeliveryOS entendeu — texto que a tela mostra do lado esquerdo. */
  readonly deliveryos_entendeu: string;
  /**
   * O que realmente aconteceu, quando a cena existe para demonstrar validação
   * já registrada (recomendação validada, corrigida ou expirada). `null` quando
   * a cena não pré-carrega nenhum veredito.
   */
  readonly realidade_demonstrada: string | null;
}

export interface LeituraV4 {
  readonly cenario_id: string;
  readonly titulo: string;
  /** Uma frase: o que esta cena existe para demonstrar. */
  readonly demonstra: string;
  readonly versao_fixture: string;
  /** Sempre `simulado` neste Lab. O gate proíbe `real`. */
  readonly procedencia: Procedencia;
  readonly observado_em: string;
  /** A leitura canônica, que alimenta `sinaisDe()` e `homeVM()` sem alteração. */
  readonly base: LeituraOperacional;
  readonly fontes: readonly FonteV4[];
  readonly divergencias: readonly DivergenciaDeclarada[];
  readonly ritmo: RitmoDeclarado;
  readonly sinais_retirados: readonly SinalRetirado[];
  readonly contornos: readonly ContornoDoSinal[];
  readonly ausencias_materiais: readonly AusenciaMaterial[];
  /** Condições do Caixa declaradas por pedido. Ausente = não observada. */
  readonly condicoes_por_pedido: Readonly<Record<string, DeclaracaoDeCondicoes>>;
  readonly validacao_esperada: ValidacaoEsperada;
}

/**
 * As unidades que uma fonte alimenta, traduzidas para ambiente canônico. Existe
 * porque a leitura canônica fala em `AmbienteId` e o Lab fala em
 * `UnidadeOperacionalId` — e `sushi_quentes` cai em `sushi` do lado de lá.
 */
export function ambienteCanonicoDaUnidade(
  unidade: UnidadeOperacionalId,
): AmbienteId {
  return unidade === "sushi_quentes" ? "sushi" : (unidade as AmbienteId);
}
