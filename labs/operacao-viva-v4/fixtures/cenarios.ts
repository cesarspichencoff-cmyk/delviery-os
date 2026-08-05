/**
 * LAB · OPERAÇÃO VIVA V4 — as dezoito cenas
 * ============================================================================
 * FIXTURE. Toda cena carrega `SIMULAÇÃO` na tela e `procedencia: "simulado"` no
 * contrato. Nenhuma delas descreve a operação em nenhum momento.
 *
 * Catorze vêm da missão REVOLUTION 0-A §12. Quatro vêm da decisão do César de
 * 2026-08-04 sobre Sushi Quentes e sobre
 * `ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT`.
 *
 * As cargas usadas aqui são lidas contra os baselines REAIS do motor calibrado
 * (`combinados 3 · duplas 6 · enrolados 5 · enrolados_quentes 3 ·
 * cozinha_quentes 4`). Uma razão de 2,0 vira severidade 3 porque a REGRA do
 * motor diz isso, não porque a cena quis um vermelho.
 */

import type { PracaId } from "../../../src/product/viewmodels/areas";
import type { EstadoDeFonteV4 } from "../dominio/estado-fonte";
import type {
  FonteV4,
  LeituraV4,
  RitmoDeclarado,
} from "../dominio/leitura-v4";
import {
  AGORA,
  cena,
  FONTE_CAIXA,
  FONTE_CARDAPIO,
  FONTE_COMANDA,
  FONTE_CONFERENCIA,
  fonte,
  item,
  pedido,
  RITMO_NAO_OBSERVADO,
} from "./base";

/* ================================================================== *
 * Fontes recorrentes
 * ================================================================== */

/**
 * As duas faces da integração do iFood, separadas de propósito.
 *
 * A LISTA de pedidos e os TEMPOS de cada etapa chegam por caminhos diferentes e
 * podem atrasar em momentos diferentes. Juntá-las numa fonte só produzia uma
 * cena incoerente: os tempos atrasavam e o pulso sumia junto, embora a lista de
 * pedidos continuasse chegando. Separadas, cada uma responde pelo que sabe.
 */
const fPedidos = (
  estado: EstadoDeFonteV4,
  detalhe: string,
  ultima: string | null = AGORA,
): FonteV4 =>
  fonte(
    "ifood_pedidos",
    "Pedidos do iFood",
    estado,
    detalhe,
    // Não alimenta unidade nenhuma: ela conta pedidos, não mede bancada.
    [],
    true,
    ultima,
    // É a única fonte que conta pedidos. Sem ela, não há pulso.
    true,
  );

const fIfood = (estado: EstadoDeFonteV4, detalhe: string, ultima: string | null = AGORA): FonteV4 =>
  fonte(
    "ifood_tempos",
    "Tempos do iFood",
    estado,
    detalhe,
    ["motoboy", "conferencia"],
    true,
    ultima,
  );

const fSushi = (estado: EstadoDeFonteV4, detalhe: string, ultima: string | null = AGORA): FonteV4 =>
  fonte("carga_sushi", "Carga das praças do Sushi", estado, detalhe, ["sushi"], true, ultima);

const fSushiQuentes = (
  estado: EstadoDeFonteV4,
  detalhe: string,
  ultima: string | null = AGORA,
): FonteV4 =>
  fonte(
    "carga_sushi_quentes",
    "Carga do Sushi Quentes",
    estado,
    detalhe,
    ["sushi_quentes"],
    true,
    ultima,
  );

const fCozinha = (
  estado: EstadoDeFonteV4,
  detalhe: string,
  ultima: string | null = AGORA,
  id = "carga_cozinha",
  rotulo = "Carga da Cozinha",
): FonteV4 => fonte(id, rotulo, estado, detalhe, ["cozinha"], true, ultima);

const SAUDAVEIS = (): FonteV4[] => [
  fPedidos("saudavel", "A lista de pedidos abertos, atualizada a cada leitura."),
  fIfood("saudavel", "Recebido, pronto, saiu e cancelado — a única fonte de tempo real."),
  fSushi("saudavel", "Pedidos em produção por praça, contra o baseline calibrado."),
  fSushiQuentes("saudavel", "Contagem da bancada do salão, contra o baseline calibrado."),
  fCozinha("saudavel", "Pedidos em produção na cozinha, contra o baseline calibrado."),
  FONTE_CARDAPIO,
  FONTE_CAIXA,
  FONTE_CONFERENCIA,
  FONTE_COMANDA,
];

/* ================================================================== *
 * Cargas e ritmo
 * ================================================================== */

/** Todas as praças exatamente no baseline. Razão 1,0 — nenhum sinal de carga. */
const CARGA_NORMAL: Partial<Record<PracaId, number>> = {
  combinados: 3,
  duplas: 6,
  enrolados: 5,
  enrolados_quentes: 3,
  cozinha_quentes: 4,
};

const RITMO_ESTAVEL: RitmoDeclarado = {
  tendencia: "estavel",
  texto: "Entra e sai no mesmo passo há cerca de uma hora.",
  lastro: "12 pedidos na última hora, contra 12 de costume.",
};

const RITMO_SUBINDO: RitmoDeclarado = {
  tendencia: "subindo",
  texto: "Está chegando mais rápido do que sai.",
  lastro: "18 pedidos na última hora, contra 12 de costume.",
};

/* ================================================================== *
 * 1 — CALMA REAL
 * ================================================================== */

const calmaReal = (): LeituraV4 =>
  cena({
    id: "calma-real",
    titulo: "Operação calma, com lastro",
    demonstra:
      "Calmo legítimo: todas as fontes necessárias saudáveis, nenhum sinal acima do piso, e a tela continua útil — pulso, unidades, itens e o que segue sem medição.",
    pedidos: [
      pedido("A-101", [item("Hot Roll", 2)]),
      pedido("A-102", [item("Guioza", 1), item("Coca-Cola Lata 350ml", 1)]),
      pedido("A-103", [item("Temaki de Salmão", 1)]),
      pedido("A-104", [item("Combinado Executivo Sushi", 1)]),
      pedido("A-105", [item("Edamame", 2)]),
      pedido("A-106", [item("Hot Roll Tatá", 2)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    validacao_esperada: {
      deliveryos_entendeu:
        "A operação está fluindo. Nada precisa de decisão agora, e as fontes necessárias estão respondendo.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 2 — AUSÊNCIA DE DADOS
 * ================================================================== */

const ausenciaDeDados = (): LeituraV4 =>
  cena({
    id: "ausencia-de-dados",
    titulo: "Sem leitura nenhuma",
    demonstra:
      "Ausência não vira zero, normal, sem ocorrências nem Calmo. A fonte de pedidos apenas conectou, as de carga nunca responderam, e o pulso se recusa a virar `0`.",
    pedidos: [],
    carga: {},
    chegadas_na_hora: null,
    chegadas_normais: null,
    fontes: [
      fPedidos(
        "conectada",
        "Respondeu ao contato e ainda não entregou nenhuma lista de pedidos.",
        null,
      ),
      fIfood("desconhecida", "Nunca respondeu nesta sessão.", null),
      fSushi("desconhecida", "Nunca respondeu nesta sessão.", null),
      fSushiQuentes("desconhecida", "Nunca respondeu nesta sessão.", null),
      fCozinha("desconhecida", "Nunca respondeu nesta sessão.", null),
      FONTE_CARDAPIO,
      FONTE_CAIXA,
      FONTE_CONFERENCIA,
      FONTE_COMANDA,
    ],
    ritmo: RITMO_NAO_OBSERVADO,
    ausencias: [
      {
        o_que: "Nenhuma carga de praça foi observada",
        por_que: "As três fontes de carga nunca responderam nesta sessão.",
        consequencia:
          "Nenhuma unidade pode ser chamada de saudável. A tela não sabe se a casa está calma ou lotada.",
        natureza: "superveniente",
        unidades: ["sushi", "sushi_quentes", "cozinha"],
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "Não há leitura suficiente para dizer como a operação está. O que falta está nomeado.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 3 — FONTE ATRASADA
 * ================================================================== */

const fonteAtrasada = (): LeituraV4 =>
  cena({
    id: "fonte-atrasada",
    titulo: "Os tempos do iFood atrasaram",
    demonstra:
      "Fonte atrasada descreve o passado. Nenhum sinal de urgência nasce dela, o sinal que existia é mostrado como RETIRADO, e o Calmo é recusado.",
    pedidos: [
      pedido("B-201", [item("Hot Roll", 1)]),
      pedido("B-202", [item("Uramaki Ebiten", 2)]),
      pedido("B-203", [item("Yakissoba de Frango", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: [
      fPedidos("saudavel", "A lista de pedidos abertos continua chegando normalmente."),
      fIfood(
        "atrasada",
        "Última leitura às 20:05, mais velha do que o aceitável para decidir agora.",
        "2026-08-04T23:05:00.000Z",
      ),
      fSushi("saudavel", "Pedidos em produção por praça, contra o baseline calibrado."),
      fSushiQuentes("saudavel", "Contagem da bancada do salão, contra o baseline calibrado."),
      fCozinha("saudavel", "Pedidos em produção na cozinha, contra o baseline calibrado."),
      FONTE_CARDAPIO,
      FONTE_CAIXA,
      FONTE_CONFERENCIA,
      FONTE_COMANDA,
    ],
    ritmo: RITMO_ESTAVEL,
    ausencias: [
      {
        o_que: "Os tempos de pronto, saída e entrega pararam de chegar",
        por_que: "A fonte de tempos do iFood está atrasada desde as 20:05.",
        consequencia:
          "Nenhum atraso de pedido pode ser afirmado agora. Não é que não haja atraso: é que não dá para ver.",
        natureza: "superveniente",
        unidades: ["motoboy", "conferencia"],
      },
    ],
    sinais_retirados: [
      {
        codigo: "S1",
        nome: "Pronto sem sair",
        alvo_rotulo: "Pedido B-198",
        retirado_em: "2026-08-04T23:06:00.000Z",
        motivo:
          "A fonte que sustentava o tempo atrasou. O sinal saiu por falta de lastro, não porque o pedido saiu.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "As praças estão em ritmo normal, mas os tempos do iFood atrasaram e nada sobre atraso pode ser afirmado.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 4 — FONTE INDISPONÍVEL, E OUTRA RECUPERANDO
 * ================================================================== */

const fonteIndisponivel = (): LeituraV4 =>
  cena({
    id: "fonte-indisponivel",
    titulo: "Sushi mudo, Sushi Quentes voltando",
    demonstra:
      "Indisponível e recuperando são estados diferentes. A carga baixa do Sushi Quentes é reconstrução, não calma — e por isso a unidade não fica verde.",
    pedidos: [
      pedido("C-301", [item("Hot Roll", 1)]),
      pedido("C-302", [item("Guioza", 1)]),
    ],
    // As praças do Sushi somem da leitura. Praça AUSENTE do mapa não vira 0.
    carga: { enrolados_quentes: 2, cozinha_quentes: 4 },
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: [
      fPedidos("saudavel", "A lista de pedidos abertos, atualizada a cada leitura."),
      fIfood("saudavel", "Recebido, pronto, saiu e cancelado — a única fonte de tempo real."),
      fSushi("indisponivel", "Não responde desde as 20:12.", "2026-08-04T23:12:00.000Z"),
      fSushiQuentes(
        "recuperando",
        "Voltou às 20:37 e ainda está reconstruindo. O que aparece é menos do que existe.",
        "2026-08-04T23:37:00.000Z",
      ),
      fCozinha("saudavel", "Pedidos em produção na cozinha, contra o baseline calibrado."),
      FONTE_CARDAPIO,
      FONTE_CAIXA,
      FONTE_CONFERENCIA,
      FONTE_COMANDA,
    ],
    ritmo: RITMO_ESTAVEL,
    ausencias: [
      {
        o_que: "A carga de Combinados, Duplas e Enrolados não é observada",
        por_que: "A fonte de carga do Sushi não responde desde as 20:12.",
        consequencia:
          "O Sushi não pode aparecer verde nem vermelho. Ele aparece sem medição, com a hora da última leitura.",
        natureza: "superveniente",
        unidades: ["sushi"],
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "O Sushi está sem medição e o Sushi Quentes está reconstruindo a leitura. Nenhum dos dois pode ser lido como calmo.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 5 — FONTE DIVERGENTE
 * ================================================================== */

const fonteDivergente = (): LeituraV4 =>
  cena({
    id: "fonte-divergente",
    titulo: "Duas fontes contam a Cozinha de formas incompatíveis",
    demonstra:
      "Divergência é DECLARADA, nunca deduzida por proximidade. Enquanto as duas discordam, nenhuma decide sozinha — e o sistema não escolhe por conta própria.",
    pedidos: [
      pedido("D-401", [item("Yakissoba de Carne", 1)]),
      pedido("D-402", [item("Guioza", 2)]),
    ],
    carga: { combinados: 3, duplas: 6, enrolados: 5, enrolados_quentes: 3 },
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: [
      fPedidos("saudavel", "A lista de pedidos abertos, atualizada a cada leitura."),
      fIfood("saudavel", "Recebido, pronto, saiu e cancelado — a única fonte de tempo real."),
      fSushi("saudavel", "Pedidos em produção por praça, contra o baseline calibrado."),
      fSushiQuentes("saudavel", "Contagem da bancada do salão, contra o baseline calibrado."),
      fCozinha(
        "divergente",
        "Conta 9 pedidos abertos na Cozinha.",
        AGORA,
        "carga_cozinha_odhen",
        "Cozinha (Odhen)",
      ),
      fCozinha(
        "divergente",
        "Conta 3 pedidos abertos na Cozinha, no mesmo minuto.",
        AGORA,
        "carga_cozinha_ifood",
        "Cozinha (iFood)",
      ),
      FONTE_CARDAPIO,
      FONTE_CAIXA,
      FONTE_CONFERENCIA,
      FONTE_COMANDA,
    ],
    ritmo: RITMO_ESTAVEL,
    divergencias: [
      {
        ambiente: "cozinha",
        fonte_a: "Cozinha (Odhen)",
        leitura_a: "9 pedidos abertos às 20:40",
        fonte_b: "Cozinha (iFood)",
        leitura_b: "3 pedidos abertos às 20:40",
        incompatibilidade:
          "Três vezes de diferença no mesmo minuto. Uma das duas está contando outra coisa, e não dá para saber qual sem olhar a bancada.",
      },
    ],
    ausencias: [
      {
        o_que: "A carga da Cozinha não tem leitura confiável",
        por_que: "As duas fontes que a contam discordam por um fator de três.",
        consequencia:
          "Nenhum sinal de carga da Cozinha é produzido. As duas leituras aparecem lado a lado, sem uma vencer.",
        natureza: "superveniente",
        unidades: ["cozinha"],
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "Duas fontes contam a Cozinha de formas incompatíveis. O sistema mostra as duas e não escolhe.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 6 — UM FOCO, COM SECUNDÁRIOS VIVOS
 * ================================================================== */

const focoComSecundarios = (): LeituraV4 =>
  cena({
    id: "foco-com-secundarios",
    titulo: "Um Foco, e o que continua acontecendo atrás dele",
    demonstra:
      "Exclusividade de slot governa a AÇÃO, não a visibilidade. Uma orientação principal, e os demais problemas seguem visíveis, com severidade própria.",
    pedidos: [
      pedido("E-501", [item("Yakissoba de Carne", 1), item("Guioza", 1)]),
      pedido("E-502", [item("Dyo de Salmão", 2)]),
      pedido("E-503", [item("Hot Roll", 1)], { minutos_pronto_sem_sair: 40 }),
      pedido("E-504", [item("Combinado Especial Sushi 2 pessoas", 1)]),
      pedido("E-505", [item("Temaki de Salmão", 1)]),
    ],
    // Cozinha em 2,0 do baseline (severidade 3). Duplas em 1,83 (severidade 2).
    // 10/6 daria 1,666… e cairia em severidade 1 — o piso do motor é `>= 1.67`,
    // e um número que quase alcança o piso não alcança o piso.
    carga: {
      combinados: 3,
      duplas: 11,
      enrolados: 5,
      enrolados_quentes: 3,
      cozinha_quentes: 8,
    },
    chegadas_na_hora: 18,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_SUBINDO,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Cozinha",
        validade_ate: "2026-08-05T00:10:00.000Z",
        condicao_de_retirada:
          "A carga da Cozinha voltar abaixo de 1,3 vez o baseline por três leituras seguidas.",
        motivo_da_escolha:
          "É a única situação em severidade 3 e está no caminho de todo pedido que passa pela Conferência. Duplas está pressionada, mas ainda absorve.",
        impacto_esperado:
          "Reforçar a Cozinha agora tende a soltar a fila da Conferência antes que ela alcance o despacho.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "A Cozinha está no dobro do normal e é o que merece decisão agora. Duplas e um pedido parado no despacho continuam visíveis.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 7 — DOIS CRÍTICOS, E NENHUM SOME
 * ================================================================== */

const ambienteCriticoPersistente = (): LeituraV4 =>
  cena({
    id: "ambiente-critico-persistente",
    titulo: "Dois críticos ao mesmo tempo",
    demonstra:
      "Um ambiente crítico nunca desaparece porque outro virou Foco. Sushi Quentes ocupa o Foco; a Cozinha continua vermelha, com o mesmo peso, fora dele.",
    pedidos: [
      pedido("F-601", [item("Uramaki Ebiten", 2)]),
      pedido("F-602", [item("Yakissoba de Carne", 1)]),
      pedido("F-603", [item("Hot Roll com Shimeji", 1)]),
      pedido("F-604", [item("Gyukatsu", 1)]),
    ],
    // A ordem das chaves decide o desempate entre dois sinais de mesma
    // severidade e mesmo código. Sushi Quentes primeiro, e a Cozinha continua
    // vermelha ao lado — que é exatamente o que esta cena existe para provar.
    carga: {
      enrolados_quentes: 6,
      cozinha_quentes: 8,
      combinados: 3,
      duplas: 6,
      enrolados: 5,
    },
    chegadas_na_hora: 18,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_SUBINDO,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Sushi Quentes",
        validade_ate: "2026-08-05T00:05:00.000Z",
        condicao_de_retirada:
          "A carga do Sushi Quentes voltar abaixo de 1,3 vez o baseline por três leituras seguidas.",
        motivo_da_escolha:
          "Duas unidades estão em severidade 3. O Sushi Quentes foi eleito por ordem estável de leitura — não por ser mais grave que a Cozinha.",
        impacto_esperado:
          "Reforçar a bancada do salão solta os pedidos que dependem só dela. A Cozinha continua exigindo decisão própria.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "Sushi Quentes e Cozinha estão os dois no dobro do normal. Um ocupa o Foco; o outro continua vermelho e visível.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 8 — PEDIDO SOMENTE QUENTE, E A DIVERGÊNCIA QUE ELE REVELA
 * ================================================================== */

const pedidoSoQuente = (): LeituraV4 =>
  cena({
    id: "pedido-so-quente",
    titulo: "Só quente — e onde o motor canônico e o Lab discordam",
    demonstra:
      "G-701 não passa pelo Sushi e o motor canônico emite o sinal de roteamento. G-702 é só Sushi Quentes: para o canônico ele é Sushi e o sinal NÃO nasce; para o Lab, Sushi Quentes é unidade própria e o pedido é candidato. A divergência aparece, não é escondida.",
    pedidos: [
      pedido("G-701", [item("Yakissoba de Frango", 1), item("Edamame", 1)]),
      pedido("G-702", [item("Hot Roll", 2)]),
      pedido("G-703", [item("Temaki de Salmão", 1), item("Guioza", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    validacao_esperada: {
      deliveryos_entendeu:
        "G-701 pode ser montado na bancada do caixa. G-702 também não depende do Sushi, mas o motor canônico não diz isso — porque para ele Sushi Quentes ainda é Sushi.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 9 — DUAS SACOLAS COM MOTIVO SUSTENTADO
 * ================================================================== */

const duasSacolasSustentada = (): LeituraV4 =>
  cena({
    id: "duas-sacolas-sustentada",
    titulo: "Duas sacolas, com motivo verificável",
    demonstra:
      "O sinal só nasce com motivo comprovado no pedido. H-801 tem item quente e item frio, e isso é verificável — não é estatística de tamanho.",
    pedidos: [
      pedido("H-801", [item("Yakissoba de Carne", 1), item("Temaki de Salmão", 2)], {
        motivo_duas_sacolas: "quente_e_frio_no_mesmo_pedido",
      }),
      pedido("H-802", [item("Coca-Cola Lata 350ml", 6), item("Guioza", 1)], {
        motivo_duas_sacolas: "seis_ou_mais_latas",
      }),
      pedido("H-803", [item("Hot Roll", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    validacao_esperada: {
      deliveryos_entendeu:
        "Dois pedidos vão em duas sacolas, e o motivo de cada um está dito: quente com frio, e seis latas.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 10 — SEM EVIDÊNCIA, SEM SINAL
 * ================================================================== */

const duasSacolasSemEvidencia = (): LeituraV4 =>
  cena({
    id: "duas-sacolas-sem-evidencia",
    titulo: "Pedido grande, e nenhuma sacola afirmada",
    demonstra:
      "A heurística antiga (combo ou 8+ itens) marcaria I-901 na hora, e ela acerta em 47 a 61% dos pedidos — comum demais para ser sinal. Sem motivo verificável, o sinal simplesmente não nasce.",
    pedidos: [
      pedido(
        "I-901",
        [
          item("Combinado Especial Sushi 2 pessoas", 1),
          item("Temaki de Salmão", 2),
          item("Dyo de Salmão", 4),
          item("Gengibre", 2),
        ],
        { motivo_duas_sacolas: null },
      ),
      pedido("I-902", [item("Hot Roll", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    validacao_esperada: {
      deliveryos_entendeu:
        "I-901 é grande e mesmo assim nada é afirmado sobre sacolas — nenhuma regra verificável foi satisfeita. Ausência aqui não significa uma sacola só.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 11 — RISCO DE CONFERÊNCIA
 * ================================================================== */

const riscoDeConferencia = (): LeituraV4 =>
  cena({
    id: "risco-de-conferencia",
    titulo: "Risco por pedido, com a área ainda sem medição",
    demonstra:
      "A Conferência não tem medição de carga e continua assim. O risco POR PEDIDO existe, é mostrado, e uma coisa não substitui a outra.",
    pedidos: [
      pedido("J-011", [item("Coca-Cola Lata 350ml", 6), item("Tempurá de Camarão", 1)], {
        risco_de_conferencia: "seis latas conferidas uma a uma",
      }),
      pedido("J-012", [item("Combinado Kids", 1), item("Sorvete de Chocolate", 1)], {
        risco_de_conferencia: "sobremesa que sai do freezer no último momento",
      }),
      pedido("J-013", [item("Hot Roll", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    validacao_esperada: {
      deliveryos_entendeu:
        "Dois pedidos pedem conferência reforçada. A carga da bancada de fechamento continua sem medição automática.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 12 — RECOMENDAÇÃO VALIDADA
 * ================================================================== */

const recomendacaoValidada = (): LeituraV4 =>
  cena({
    id: "recomendacao-validada",
    titulo: "A leitura estava certa",
    demonstra:
      "Comparação sistema × realidade quando o sistema acertou. O que o DeliveryOS entendeu e o que realmente aconteceu ficam lado a lado, sem o acerto virar propaganda.",
    pedidos: [
      pedido("K-101", [item("Yakissoba de Carne", 1)]),
      pedido("K-102", [item("Katsudon", 1)]),
      pedido("K-103", [item("Hot Roll", 1)]),
    ],
    carga: { ...CARGA_NORMAL, cozinha_quentes: 8 },
    chegadas_na_hora: 15,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_SUBINDO,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Cozinha",
        validade_ate: "2026-08-05T00:10:00.000Z",
        condicao_de_retirada:
          "A carga da Cozinha voltar abaixo de 1,3 vez o baseline por três leituras seguidas.",
        motivo_da_escolha:
          "É a única situação em severidade 3, e ela está no caminho de todo pedido que passa pela Conferência.",
        impacto_esperado:
          "Reforçar a Cozinha agora tende a soltar a fila da Conferência antes que ela alcance o despacho.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "A Cozinha está no dobro do normal e segura o fluxo que chega na Conferência. Vale reforçar agora.",
      realidade_demonstrada:
        "Confirmado pela bancada: dois pedidos grandes de yakisoba entraram juntos. O reforço foi feito e a fila voltou ao normal em 12 minutos.",
    },
  });

/* ================================================================== *
 * 13 — RECOMENDAÇÃO CORRIGIDA
 * ================================================================== */

const recomendacaoCorrigida = (): LeituraV4 =>
  cena({
    id: "recomendacao-corrigida",
    titulo: "A leitura estava parcialmente certa, e a correção fica registrada",
    demonstra:
      "O sistema viu carga; a operação viu falta de reposição. As duas coisas convivem na tela, e a correção humana é o dado mais valioso da cena.",
    pedidos: [
      pedido("L-201", [item("Uramaki Ebiten", 2)]),
      pedido("L-202", [item("Hot Roll com Shimeji", 1)]),
      pedido("L-203", [item("Temaki Ebiten", 1)]),
    ],
    carga: { ...CARGA_NORMAL, enrolados_quentes: 6 },
    chegadas_na_hora: 13,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Sushi Quentes",
        validade_ate: "2026-08-05T00:15:00.000Z",
        condicao_de_retirada:
          "A carga do Sushi Quentes voltar abaixo de 1,3 vez o baseline por três leituras seguidas.",
        motivo_da_escolha:
          "É a única situação em severidade 3 nesta leitura, e a bancada do salão não tem folga para absorver.",
        impacto_esperado:
          "Reforçar a bancada solta os pedidos que dependem só dela.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "O Sushi Quentes está no dobro do normal. Vale reforçar a bancada do salão.",
      realidade_demonstrada:
        "Parcialmente certo. A bancada estava parada esperando reposição de salmão, e não sobrecarregada de gente. Reforçar mão de obra não resolveria; repor o insumo resolveu.",
    },
  });

/* ================================================================== *
 * 14 — RECOMENDAÇÃO EXPIRADA
 * ================================================================== */

const recomendacaoExpirada = (): LeituraV4 =>
  cena({
    id: "recomendacao-expirada",
    titulo: "A leitura venceu sem ninguém confirmar",
    demonstra:
      "Validade vencida não é acerto nem erro: é expiração. Uma recomendação que ninguém confirmou sai da tela dizendo isso, e não em silêncio.",
    pedidos: [
      pedido("M-301", [item("Yakissoba de Frango", 1)]),
      pedido("M-302", [item("Frango Teriyaki", 1)]),
      pedido("M-303", [item("Hot Roll", 1)]),
    ],
    carga: { ...CARGA_NORMAL, cozinha_quentes: 8 },
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Cozinha",
        // Anterior a `observado_em`: a leitura já venceu quando esta tela abriu.
        validade_ate: "2026-08-04T23:25:00.000Z",
        condicao_de_retirada:
          "Já retirada: a validade venceu às 20:25 e ninguém confirmou a leitura.",
        motivo_da_escolha:
          "Foi eleita às 20:10 por ser a única situação em severidade 3 daquela leitura.",
        impacto_esperado:
          "O impacto não pode mais ser afirmado: a janela em que ele valia passou.",
      },
    ],
    sinais_retirados: [
      {
        codigo: "S5",
        nome: "Praça sobrecarregada",
        alvo_rotulo: "Duplas",
        retirado_em: "2026-08-04T23:22:00.000Z",
        motivo: "A carga voltou ao baseline por três leituras seguidas.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "A Cozinha estava no dobro do normal às 20:10 e valia reforçar até as 20:25.",
      realidade_demonstrada:
        "Ninguém confirmou dentro da validade. A leitura expirou às 20:25 — não foi julgada certa nem errada.",
    },
  });

/* ================================================================== *
 * 15 — SUSHI QUENTES SOZINHO NO VERMELHO
 * ================================================================== */

const sushiQuentesIsolado = (): LeituraV4 =>
  cena({
    id: "sushi-quentes-isolado",
    titulo: "Sushi Quentes lotado, Sushi tranquilo",
    demonstra:
      "A cena que justifica a unidade experimental: no domínio canônico esta pressão seria agregada dentro de Sushi. Aqui ela tem nome, carga e Foco próprios — e o Sushi frio continua verde ao lado, sem ser puxado junto.",
    pedidos: [
      pedido("N-401", [item("Hot Roll", 2)]),
      pedido("N-402", [item("Uramaki Ebiten Especial", 1)]),
      pedido("N-403", [item("Temaki Ebiten", 2)]),
      pedido("N-404", [item("Combinado Executivo Sushi", 1)]),
      pedido("N-405", [item("Dyo de Salmão", 1)]),
    ],
    carga: { ...CARGA_NORMAL, enrolados_quentes: 6 },
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    contornos: [
      {
        codigo: "S5",
        alvo_rotulo: "Sushi Quentes",
        validade_ate: "2026-08-05T00:20:00.000Z",
        condicao_de_retirada:
          "A carga do Sushi Quentes voltar abaixo de 1,3 vez o baseline por três leituras seguidas.",
        motivo_da_escolha:
          "É a única unidade em severidade 3. Combinados, Duplas e Enrolados estão no baseline e não sustentam pressão.",
        impacto_esperado:
          "A bancada do salão é o gargalo isolado. Mexer no Sushi frio não muda nada aqui.",
      },
    ],
    validacao_esperada: {
      deliveryos_entendeu:
        "O Sushi Quentes está no dobro do normal, sozinho. O Sushi frio está fluindo e não precisa de nada.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 16 — CONSOLIDAÇÃO OBRIGATÓRIA NO DELIVERY
 * ================================================================== */

const consolidacaoComSushi = (): LeituraV4 =>
  cena({
    id: "consolidacao-com-sushi",
    titulo: "Tem Sushi: consolida no Delivery, e ponto",
    demonstra:
      "ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT. O-501 passa por Sushi, Sushi Quentes e Cozinha, e mesmo assim abre UMA sacola só, no Delivery. Independência produtiva não é independência de consolidação.",
    pedidos: [
      pedido("O-501", [
        item("Temaki de Salmão", 1),
        item("Hot Roll", 1),
        item("Guioza", 1),
      ]),
      pedido("O-502", [item("Combinado Executivo Sushi", 1), item("Yakissoba de Carne", 1)]),
      pedido("O-503", [item("Dyo de Salmão", 2)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    // Declaradas de propósito, e ainda assim irrelevantes: com item de Sushi o
    // fluxo é obrigatório e as condições do Caixa nem chegam a ser avaliadas.
    condicoes_por_pedido: {
      "O-501": {
        composicao_completa_conhecida: {
          estado: "comprovada",
          detalhe: "Composição fechada na entrada do pedido.",
        },
        capacidade_do_caixa: {
          estado: "comprovada",
          detalhe: "Declarado pela fixture — nenhuma fonte real mede esta fila.",
        },
      },
    },
    validacao_esperada: {
      deliveryos_entendeu:
        "O-501 tem item do Sushi, então abre e fecha inteiro no Delivery. Os itens de Sushi Quentes e Cozinha convergem para a sacola aberta ali.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 17 — CAIXA COM AS SEIS CONDIÇÕES COMPROVADAS
 * ================================================================== */

const consolidacaoCaixaComprovada = (): LeituraV4 =>
  cena({
    id: "consolidacao-caixa-comprovada",
    titulo: "Sem Sushi, e as seis condições comprovadas antes de abrir",
    demonstra:
      "O único caminho até o Caixa. P-601 não tem Sushi E as seis condições foram positivamente comprovadas antes da abertura da sacola. Fora de fixture, a capacidade da Caixa não é mensurável — e por isso esta rota é inalcançável hoje.",
    pedidos: [
      pedido("P-601", [item("Yakissoba de Frango", 1), item("Edamame", 1)]),
      pedido("P-602", [item("Hot Roll", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    condicoes_por_pedido: {
      "P-601": {
        composicao_completa_conhecida: {
          estado: "comprovada",
          detalhe: "Os dois itens estavam no pedido desde a entrada; nada foi acrescentado depois.",
        },
        capacidade_do_caixa: {
          estado: "comprovada",
          detalhe:
            "DECLARADO PELA FIXTURE. Nenhuma fonte real mede a fila da Caixa — em operação, esta condição não seria comprovável.",
        },
        materiais_e_acompanhamentos: {
          estado: "comprovada",
          detalhe: "Embalagem, hashi e molhos disponíveis na bancada do caixa.",
        },
        conferencia_integral_ali: {
          estado: "comprovada",
          detalhe: "Dois itens, ambos da Cozinha, conferíveis no próprio balcão.",
        },
        beneficio_operacional: {
          estado: "comprovada",
          detalhe: "Evita atravessar o salão com o pedido enquanto a Conferência está ocupada.",
        },
        permanencia_integral: {
          estado: "comprovada",
          detalhe: "Nada deste pedido depende do Delivery em nenhum momento.",
        },
      },
    },
    validacao_esperada: {
      deliveryos_entendeu:
        "P-601 pode ser aberto, montado e conferido inteiro no Caixa. As seis condições foram comprovadas antes de abrir a sacola.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * 18 — SEM SUSHI, E MESMO ASSIM NO FLUXO NORMAL
 * ================================================================== */

const consolidacaoCaixaNaoObservada = (): LeituraV4 =>
  cena({
    id: "consolidacao-caixa-nao-observada",
    titulo: "Sem Sushi não é passe livre para o Caixa",
    demonstra:
      "Q-701 é candidato e permanece no Delivery. Duas condições não foram observadas e uma não foi comprovada — e nenhuma delas vira elegibilidade por omissão. O Caixa nunca é rota padrão.",
    pedidos: [
      pedido("Q-701", [item("Katsudon", 1), item("Guioza", 1)]),
      pedido("Q-702", [item("Hot Roll", 1)]),
    ],
    carga: CARGA_NORMAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: SAUDAVEIS(),
    ritmo: RITMO_ESTAVEL,
    condicoes_por_pedido: {
      "Q-701": {
        composicao_completa_conhecida: {
          estado: "comprovada",
          detalhe: "Os dois itens estavam no pedido desde a entrada.",
        },
        capacidade_do_caixa: {
          estado: "nao_observada",
          detalhe: "Nenhuma fonte mede a fila da Caixa. Ninguém olhou, e o sistema não supõe.",
        },
        materiais_e_acompanhamentos: {
          estado: "nao_observada",
          detalhe: "Não há registro do que a bancada do caixa tem agora.",
        },
        conferencia_integral_ali: {
          estado: "comprovada",
          detalhe: "Dois itens da Cozinha, conferíveis no balcão.",
        },
        beneficio_operacional: {
          estado: "nao_comprovada",
          detalhe:
            "A Conferência está livre. Trocar de ponto não economiza passo nenhum agora.",
        },
        permanencia_integral: {
          estado: "comprovada",
          detalhe: "Nada deste pedido depende do Delivery.",
        },
      },
    },
    validacao_esperada: {
      deliveryos_entendeu:
        "Q-701 não tem Sushi e foi avaliado para o Caixa. Ele segue no fluxo normal porque três das seis condições não estão comprovadas.",
      realidade_demonstrada: null,
    },
  });

/* ================================================================== *
 * O catálogo
 * ================================================================== */

export const CENAS = {
  "calma-real": calmaReal,
  "ausencia-de-dados": ausenciaDeDados,
  "fonte-atrasada": fonteAtrasada,
  "fonte-indisponivel": fonteIndisponivel,
  "fonte-divergente": fonteDivergente,
  "foco-com-secundarios": focoComSecundarios,
  "ambiente-critico-persistente": ambienteCriticoPersistente,
  "pedido-so-quente": pedidoSoQuente,
  "duas-sacolas-sustentada": duasSacolasSustentada,
  "duas-sacolas-sem-evidencia": duasSacolasSemEvidencia,
  "risco-de-conferencia": riscoDeConferencia,
  "recomendacao-validada": recomendacaoValidada,
  "recomendacao-corrigida": recomendacaoCorrigida,
  "recomendacao-expirada": recomendacaoExpirada,
  "sushi-quentes-isolado": sushiQuentesIsolado,
  "consolidacao-com-sushi": consolidacaoComSushi,
  "consolidacao-caixa-comprovada": consolidacaoCaixaComprovada,
  "consolidacao-caixa-nao-observada": consolidacaoCaixaNaoObservada,
} as const;

export type CenaId = keyof typeof CENAS;

export const IDS_DAS_CENAS = Object.keys(CENAS) as CenaId[];

export function leitura(id: CenaId): LeituraV4 {
  const f = CENAS[id];
  if (!f) throw new Error(`Cena desconhecida no Lab: ${String(id)}`);
  return f();
}

/** Agrupamento só para a navegação da tela. Não tem efeito no domínio. */
export const GRUPOS_DE_CENA: readonly {
  readonly titulo: string;
  readonly cenas: readonly CenaId[];
}[] = [
  {
    titulo: "Como a operação está",
    cenas: ["calma-real", "foco-com-secundarios", "ambiente-critico-persistente"],
  },
  {
    titulo: "Quando a fonte falha",
    cenas: [
      "ausencia-de-dados",
      "fonte-atrasada",
      "fonte-indisponivel",
      "fonte-divergente",
    ],
  },
  {
    titulo: "O que o pedido carrega",
    cenas: [
      "pedido-so-quente",
      "duas-sacolas-sustentada",
      "duas-sacolas-sem-evidencia",
      "risco-de-conferencia",
    ],
  },
  {
    titulo: "Sushi Quentes e a sacola",
    cenas: [
      "sushi-quentes-isolado",
      "consolidacao-com-sushi",
      "consolidacao-caixa-comprovada",
      "consolidacao-caixa-nao-observada",
    ],
  },
  {
    titulo: "O que a validação humana devolve",
    cenas: ["recomendacao-validada", "recomendacao-corrigida", "recomendacao-expirada"],
  },
];
