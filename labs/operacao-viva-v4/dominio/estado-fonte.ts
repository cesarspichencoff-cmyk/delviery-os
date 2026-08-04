/**
 * LAB · OPERAÇÃO VIVA V4 — os oito estados de fonte
 * ============================================================================
 * EXPERIMENTAL. Este arquivo vive no Lab e não altera nada do produto.
 *
 * O produto canônico tem QUATRO estados de fonte
 * (`src/product/viewmodels/sinais.ts`: `saudavel | parcial | stale |
 * indisponivel`). A missão REVOLUTION 0-A pede OITO, e a diferença não é
 * cosmética: quatro dos oito descrevem situações que o produto hoje não
 * consegue observar.
 *
 * A regra desta camada, e ela é a única coisa que importa aqui:
 *
 *   traduzir o que existe          -> mapeamento TOTAL e declarado
 *   nomear o que ainda não existe  -> só em fixture, marcado como tal
 *
 * O que NUNCA acontece: um estado do Lab afirmar saúde que a fonte canônica
 * não sustentou. O mapeamento só pode perder confiança, nunca ganhar.
 */

import type { AmbienteId } from "../../../src/product/viewmodels/areas";
import type { EstadoDeFonte } from "../../../src/product/viewmodels/sinais";

/* ================================================================== *
 * O vocabulário
 * ================================================================== */

export type EstadoDeFonteV4 =
  | "desconhecida"
  | "conectada"
  | "saudavel"
  | "atrasada"
  | "indisponivel"
  | "divergente"
  | "recuperando"
  | "sem_medicao_automatica";

export const ESTADOS_DE_FONTE_V4: readonly EstadoDeFonteV4[] = [
  "desconhecida",
  "conectada",
  "saudavel",
  "atrasada",
  "indisponivel",
  "divergente",
  "recuperando",
  "sem_medicao_automatica",
] as const;

/**
 * Quanta confiança a leitura PODE receber sob este estado. É teto, não valor:
 * o Lab não apura confiança e não inventa número (D69/D70/D71). Ele apenas
 * declara até onde a leitura poderia ir se alguém a apurasse.
 */
export type ConfiancaPermitida = "plena" | "reduzida" | "nenhuma";

export interface DescricaoDeEstado {
  readonly estado: EstadoDeFonteV4;
  /** O nome que uma pessoa lê. Nunca o identificador. */
  readonly rotulo: string;
  /** O que este estado significa na operação, em uma frase. */
  readonly significado: string;
  /** O que ele faz com a leitura que depende desta fonte. */
  readonly consequencia: string;
  readonly confianca_permitida: ConfiancaPermitida;
  /** O que a equipe pode fazer. `null` quando não há ação humana útil. */
  readonly acao_recomendada: string | null;
  /**
   * Se este estado pode sustentar uma área "fluindo" e o modo Calmo.
   * **Somente `saudavel` sustenta.** Tudo o mais é ausência, atraso, dúvida ou
   * falta de fonte — e nenhuma dessas coisas é saúde.
   */
  readonly sustenta_calmo: boolean;
  /**
   * O estado canônico equivalente, ou `null` quando ele **não existe hoje** no
   * produto. Os quatro `null` são a fronteira honesta desta camada: eles só
   * aparecem em fixture do Lab, e o gate exige que continue assim.
   */
  readonly equivalente_canonico: EstadoDeFonte | null;
}

export const DESCRICOES: Readonly<Record<EstadoDeFonteV4, DescricaoDeEstado>> = {
  desconhecida: {
    estado: "desconhecida",
    rotulo: "Desconhecida",
    significado:
      "O sistema nunca falou com esta fonte nesta sessão. Não se sabe se ela existe, responde ou está parada.",
    consequencia:
      "Nada que dependa desta fonte pode ser afirmado. A ausência aqui não é zero e não é normalidade.",
    confianca_permitida: "nenhuma",
    acao_recomendada: "Conferir no olho o que esta fonte deveria estar contando.",
    sustenta_calmo: false,
    equivalente_canonico: null,
  },
  conectada: {
    estado: "conectada",
    rotulo: "Conectada, sem leitura",
    significado:
      "A fonte respondeu ao contato, mas ainda não entregou leitura utilizável.",
    consequencia:
      "Conexão não é dado. A área continua sem medição até a primeira leitura chegar.",
    confianca_permitida: "nenhuma",
    acao_recomendada: null,
    sustenta_calmo: false,
    equivalente_canonico: null,
  },
  saudavel: {
    estado: "saudavel",
    rotulo: "Saudável",
    significado: "A fonte está entregando leitura dentro do prazo esperado.",
    consequencia: "A leitura que depende dela pode ser apresentada normalmente.",
    confianca_permitida: "plena",
    acao_recomendada: null,
    sustenta_calmo: true,
    equivalente_canonico: "saudavel",
  },
  atrasada: {
    estado: "atrasada",
    rotulo: "Atrasada",
    significado:
      "A última leitura é mais velha do que o aceitável para decidir agora.",
    consequencia:
      "O que ela sustenta descreve o passado. Nenhum sinal de urgência nasce daqui enquanto estiver assim.",
    confianca_permitida: "reduzida",
    acao_recomendada: "Confirmar no olho antes de agir sobre o que veio desta fonte.",
    sustenta_calmo: false,
    equivalente_canonico: "stale",
  },
  indisponivel: {
    estado: "indisponivel",
    rotulo: "Indisponível",
    significado: "A fonte não responde.",
    consequencia:
      "A área que depende dela fica sem medição. Ausência não vira zero, nem verde, nem 'sem ocorrências'.",
    confianca_permitida: "nenhuma",
    acao_recomendada: "Assumir que esta área está sendo lida por pessoas, não pelo sistema.",
    sustenta_calmo: false,
    equivalente_canonico: "indisponivel",
  },
  divergente: {
    estado: "divergente",
    rotulo: "Divergente",
    significado:
      "Duas fontes contam a mesma área de formas incompatíveis, e a divergência foi declarada — nunca deduzida por proximidade.",
    consequencia:
      "Enquanto discordarem, nenhuma das duas decide sozinha. O sistema mostra as duas leituras e não escolhe.",
    confianca_permitida: "nenhuma",
    acao_recomendada: "Decidir no olho qual leitura vale, e registrar qual foi.",
    sustenta_calmo: false,
    equivalente_canonico: null,
  },
  recuperando: {
    estado: "recuperando",
    rotulo: "Recuperando",
    significado:
      "A fonte voltou a responder e ainda está reconstruindo o que perdeu. A leitura é parcial e está crescendo.",
    consequencia:
      "O que aparece é menos do que existe. Um número baixo aqui pode ser recuperação, não calma.",
    confianca_permitida: "reduzida",
    acao_recomendada: null,
    sustenta_calmo: false,
    equivalente_canonico: null,
  },
  sem_medicao_automatica: {
    estado: "sem_medicao_automatica",
    rotulo: "Sem medição automática",
    significado:
      "Não existe fonte que meça isto. Não é falha: é ausência estrutural, conhecida e declarada.",
    consequencia:
      "Esta área nunca aparece verde. O que se sabe dela vem de pessoas, e o sistema não finge o contrário.",
    confianca_permitida: "nenhuma",
    acao_recomendada: null,
    sustenta_calmo: false,
    equivalente_canonico: null,
  },
};

export function descricao(estado: EstadoDeFonteV4): DescricaoDeEstado {
  const d = DESCRICOES[estado];
  if (!d) throw new Error(`Estado de fonte sem descrição canônica: ${String(estado)}`);
  return d;
}

/** Somente `saudavel`. Escrito como função para que o gate consiga mutá-la. */
export function sustentaCalmo(estado: EstadoDeFonteV4): boolean {
  return descricao(estado).sustenta_calmo;
}

/**
 * Os estados que **não têm origem canônica** — existem só em fixture do Lab.
 * Derivado das descrições, nunca de uma segunda lista escrita à mão: duas
 * listas divergem, uma lista derivada não consegue.
 */
export const SEM_ORIGEM_CANONICA: readonly EstadoDeFonteV4[] =
  ESTADOS_DE_FONTE_V4.filter((e) => DESCRICOES[e].equivalente_canonico === null);

/* ================================================================== *
 * A tradução do canônico
 * ================================================================== */

/**
 * O resultado da tradução, com a procedência junto. `declarado: false` significa
 * que o Lab **rebaixou por falta de informação**, e não que a fonte informou
 * aquilo — a diferença importa na hora de auditar a tela.
 */
export interface TraducaoDeEstado {
  readonly estado: EstadoDeFonteV4;
  readonly declarado: boolean;
  readonly motivo: string;
}

/**
 * Traduz um estado canônico para o vocabulário do Lab, **por ambiente**.
 *
 * Três dos quatro são diretos. `parcial` não é: ele diz "parte respondeu", e
 * fundi-lo num rótulo só apagaria justamente a informação que ele carrega. Por
 * isso a tradução pergunta QUAIS ambientes a fonte ainda cobre:
 *
 *   ambiente coberto      -> `saudavel`
 *   ambiente descoberto   -> `indisponivel`
 *   cobertura não informada -> `indisponivel`, rebaixado, com o motivo
 *
 * O último caso é a trava desta função. Não saber quais ambientes a fonte ainda
 * cobre **nunca** vira "coberto". Assumir cobertura por omissão seria inventar
 * saúde, que é o defeito que este produto inteiro existe para não cometer.
 */
export function deEstadoCanonico(
  canonico: EstadoDeFonte,
  ambiente: AmbienteId,
  ambientesAindaCobertos?: readonly AmbienteId[],
): TraducaoDeEstado {
  switch (canonico) {
    case "saudavel":
      return {
        estado: "saudavel",
        declarado: true,
        motivo: "A fonte canônica se declarou saudável.",
      };
    case "stale":
      return {
        estado: "atrasada",
        declarado: true,
        motivo: "A fonte canônica se declarou vencida (`stale`).",
      };
    case "indisponivel":
      return {
        estado: "indisponivel",
        declarado: true,
        motivo: "A fonte canônica se declarou indisponível.",
      };
    case "parcial":
      if (ambientesAindaCobertos === undefined) {
        return {
          estado: "indisponivel",
          declarado: false,
          motivo:
            "A fonte respondeu parcialmente e não informou quais áreas ainda cobre. Sem essa informação o Lab não afirma cobertura.",
        };
      }
      return ambientesAindaCobertos.includes(ambiente)
        ? {
            estado: "saudavel",
            declarado: true,
            motivo: "A fonte respondeu parcialmente e declarou que ainda cobre esta área.",
          }
        : {
            estado: "indisponivel",
            declarado: true,
            motivo: "A fonte respondeu parcialmente e esta área ficou de fora da leitura.",
          };
  }
}

/**
 * O caminho de volta: do vocabulário do Lab para o canônico.
 *
 * Serve para montar a leitura canônica que alimenta `sinaisDe()` e `homeVM()` a
 * partir de uma cena escrita em oito estados. É **conservador por construção**:
 * `saudavel` é o único que devolve `saudavel`. Todos os outros descem.
 *
 *   conectada              -> indisponivel   conexão não é leitura
 *   desconhecida           -> indisponivel   nunca respondeu
 *   divergente             -> indisponivel   enquanto discordam, nenhuma decide
 *   sem_medicao_automatica -> indisponivel   não existe fonte
 *   atrasada               -> stale
 *   recuperando            -> parcial        está voltando, e ainda falta
 *
 * A trava, e o gate a prova nos dois sentidos: **nenhum estado do Lab consegue
 * produzir `saudavel` canônico a não ser `saudavel`.** Se essa propriedade cair,
 * uma cena poderia pintar de verde uma área que nenhuma fonte sustenta.
 */
export function paraEstadoCanonico(estado: EstadoDeFonteV4): EstadoDeFonte {
  switch (estado) {
    case "saudavel":
      return "saudavel";
    case "atrasada":
      return "stale";
    case "recuperando":
      return "parcial";
    case "conectada":
    case "desconhecida":
    case "divergente":
    case "indisponivel":
    case "sem_medicao_automatica":
      return "indisponivel";
  }
}

/* ================================================================== *
 * Divergência
 * ================================================================== */

/**
 * Uma divergência entre duas fontes sobre a MESMA área.
 *
 * Ela é sempre DECLARADA por quem monta a leitura. O Lab não deduz divergência
 * comparando números parecidos nem carimbos próximos — é a mesma regra que o
 * núcleo de fonte viva já aplica ao casamento de eventos: proximidade não é
 * identidade, e discordância aparente não é discordância provada.
 */
export interface DivergenciaDeclarada {
  readonly ambiente: AmbienteId;
  readonly fonte_a: string;
  readonly leitura_a: string;
  readonly fonte_b: string;
  readonly leitura_b: string;
  /** Por que as duas não podem ser verdade ao mesmo tempo. */
  readonly incompatibilidade: string;
}
