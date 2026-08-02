/**
 * DeliveryOS — Product System · leituras de DEMONSTRACAO da home
 * ============================================================================
 * FIXTURE. Nada aqui e dado de operacao.
 *
 * O que e REAL nestas cenas: o cardapio (`data/cardapio_knowledge_seed.json`,
 * 199 itens, 8 pracas), o mapa de pracas para ambientes e subareas, os baselines
 * calibrados em 30 dias reais (`motor.js`), e as REGRAS dos sinais.
 * O que e FIXTURE: os pedidos, os tempos e as cargas.
 *
 * Toda leitura produzida aqui carrega `procedencia: "simulado"`, e a home usa
 * isso para se declarar em demonstracao. Nao existe caminho por onde uma cena
 * daqui atravesse como leitura real: a procedencia e campo obrigatorio do
 * contrato, e o gate proibe `real` neste arquivo.
 *
 * Este modulo NAO e importado por `critical.ts` nem por `async-runtime.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import type { PracaId } from "../viewmodels/areas";
import type {
  FonteLeitura,
  ItemDoPedido,
  LeituraOperacional,
  PedidoLeitura,
} from "../viewmodels/sinais";

const requireCJS = createRequire(__filename);

/** Instante fixo. Cena de demonstracao nao pode depender do relogio da maquina. */
export const AGORA_HOME_DEMO = "2026-08-02T20:40:00.000Z";

interface ItemSeed {
  id: string;
  nome: string;
  praca_principal: string | null;
  categoria_operacional: string | null;
}

const SEED = JSON.parse(
  readFileSync(
    join(process.cwd(), "data", "cardapio_knowledge_seed.json"),
    "utf8",
  ),
) as { itens: ItemSeed[] };

const MOTOR = requireCJS(
  join(process.cwd(), "src", "perfil-delivery", "motor.js"),
) as { BASELINE: Partial<Record<PracaId, number>> };

/** Os baselines REAIS do motor calibrado. Nao sao reescritos aqui. */
export const BASELINE_REAL: Partial<Record<PracaId, number>> = {
  ...MOTOR.BASELINE,
};

/** Busca um item REAL do cardapio pelo nome. Falha alto se o item sumir. */
function item(nome: string, qtd = 1): ItemDoPedido {
  const s = SEED.itens.find((x) => x.nome === nome);
  if (!s) throw new Error(`Item de demonstracao ausente do cardapio real: ${nome}`);
  return {
    item_id: s.id,
    nome: s.nome,
    praca: (s.praca_principal as PracaId | null) ?? null,
    qtd,
    categoria: s.categoria_operacional,
  };
}

function pedido(
  id: string,
  itens: readonly ItemDoPedido[],
  extra: Partial<Omit<PedidoLeitura, "id" | "itens">> = {},
): PedidoLeitura {
  return {
    id,
    itens,
    minutos_pronto_sem_sair: null,
    minutos_sem_ficar_pronto: null,
    minutos_em_rua: null,
    motivo_duas_sacolas: null,
    risco_de_conferencia: null,
    ...extra,
  };
}

const FONTE_IFOOD_OK: FonteLeitura = {
  id: "ifood_tempos",
  rotulo: "Tempos do iFood",
  estado: "saudavel",
  detalhe: "Recebido, pronto, saiu e cancelado — a unica fonte de tempo real.",
  ambientes: ["motoboy", "conferencia"],
};
const FONTE_CARDAPIO: FonteLeitura = {
  id: "cardapio_seed",
  rotulo: "Cardapio",
  estado: "saudavel",
  detalhe:
    "199 itens em 8 pracas. Sustenta composicao e roteamento — NAO e fonte de carga de area.",
  ambientes: [],
};
const FONTE_CARGA_PRACAS: FonteLeitura = {
  id: "carga_pracas",
  rotulo: "Carga das pracas",
  estado: "saudavel",
  detalhe: "Pedidos em producao por praca, contra o baseline calibrado.",
  ambientes: ["sushi", "cozinha"],
};
const FONTE_CAIXA: FonteLeitura = {
  id: "fila_caixa",
  rotulo: "Fila da Caixa",
  estado: "indisponivel",
  detalhe: "Nenhuma fonte mede esta fila. A area nunca aparece saudavel por ausencia.",
  ambientes: ["caixa"],
};
const FONTE_CONFERENCIA: FonteLeitura = {
  id: "carga_conferencia",
  rotulo: "Carga da Conferencia",
  estado: "indisponivel",
  detalhe:
    "Sem medicao da area. O risco POR PEDIDO continua existindo e e mostrado.",
  ambientes: ["conferencia"],
};
const FONTE_COMANDA: FonteLeitura = {
  id: "comanda_odhen",
  rotulo: "Comanda (Odhen/Teknisa)",
  estado: "indisponivel",
  detalhe: "Fonte externa nao integrada. Observacao e alergia ficam sem leitura.",
  ambientes: ["conferencia"],
};

const FONTES_PADRAO: readonly FonteLeitura[] = [
  FONTE_IFOOD_OK,
  FONTE_CARDAPIO,
  FONTE_CARGA_PRACAS,
  FONTE_CAIXA,
  FONTE_CONFERENCIA,
  FONTE_COMANDA,
];

/* ================================================================== *
 * CALMO — nada acima do piso, e a tela continua util
 * ================================================================== */

export function cenaCalmo(): LeituraOperacional {
  return {
    procedencia: "simulado",
    observado_em: AGORA_HOME_DEMO,
    pedidos: [
      pedido("A-101", [item("Hot Roll", 2)]),
      pedido("A-102", [item("Guioza", 1), item("Coca-Cola Lata 350ml", 2)], {
        risco_de_conferencia: "bebida separada do prato",
      }),
      pedido("A-103", [item("Temaki de Salmão Skin", 1)]),
      pedido("A-104", [item("Hot Roll Tatá", 1), item("Yakissoba de Carne", 1)], {
        motivo_duas_sacolas: "quente_e_frio_no_mesmo_pedido",
      }),
      pedido("A-105", [item("Tempurá de Camarão", 3)]),
    ],
    carga_por_praca: {
      combinados: 2,
      duplas: 4,
      enrolados: 3,
      enrolados_quentes: 3,
      cozinha_quentes: 3,
    },
    baseline_por_praca: BASELINE_REAL,
    chegadas_na_hora: 12,
    chegadas_normais: 12,
    fontes: FONTES_PADRAO,
  };
}

/* ================================================================== *
 * AMBIENTE — problemas simultaneos em subareas diferentes, nenhum interrompe
 * ================================================================== */

export function cenaAmbiente(): LeituraOperacional {
  return {
    procedencia: "simulado",
    observado_em: AGORA_HOME_DEMO,
    pedidos: [
      pedido("B-201", [item("Hot Roll", 1)], { minutos_pronto_sem_sair: 38 }),
      pedido("B-202", [item("Uramaki Ebiten", 2)], { minutos_pronto_sem_sair: 34 }),
      pedido("B-203", [item("Yakissoba de Frango", 1)], {
        minutos_pronto_sem_sair: 41,
      }),
      pedido("B-204", [item("Guioza", 2)]),
      pedido("B-205", [item("Ceviche", 1), item("Coca-Cola Lata 350ml", 6)], {
        motivo_duas_sacolas: "seis_ou_mais_latas",
        risco_de_conferencia: "seis latas conferidas uma a uma",
      }),
      pedido("B-206", [item("Tartar de Salmão", 1)]),
    ],
    // Duas subareas pressionadas ao mesmo tempo, em ambientes DIFERENTES:
    // Sushi Quentes (dentro de Sushi) e Cozinha.
    carga_por_praca: {
      combinados: 3,
      duplas: 7,
      enrolados: 5,
      enrolados_quentes: 5,
      cozinha_quentes: 7,
    },
    baseline_por_praca: BASELINE_REAL,
    chegadas_na_hora: 19,
    chegadas_normais: 12,
    fontes: FONTES_PADRAO,
  };
}

/* ================================================================== *
 * FOCO — uma situacao eleita, os demais problemas seguem visiveis
 * ================================================================== */

export function cenaFoco(): LeituraOperacional {
  return {
    procedencia: "simulado",
    observado_em: AGORA_HOME_DEMO,
    pedidos: [
      pedido("C-301", [item("Hot Roll com Shimeji", 1)], {
        minutos_sem_ficar_pronto: 71,
      }),
      pedido("C-302", [item("Uramaki Ebiten Especial", 2)], {
        minutos_pronto_sem_sair: 47,
      }),
      pedido("C-303", [item("Yakissoba de Carne", 1), item("Guioza", 1)]),
      pedido("C-304", [item("Tuna Shisô Tartar", 1)], {
        minutos_sem_ficar_pronto: 52,
      }),
      pedido("C-305", [item("Tempurá de Camarão", 2), item("Coca-Cola Lata 350ml", 1)], {
        risco_de_conferencia: "bebida e porcao em embalagens separadas",
      }),
      pedido("C-306", [item("Hot Roll", 3)], { minutos_pronto_sem_sair: 33 }),
      pedido("C-307", [item("Yakissoba de Frango", 1)], { minutos_em_rua: 58 }),
    ],
    // Sushi Quentes no vermelho (2x baseline) E Cozinha no vermelho ao mesmo
    // tempo: a cena existe para provar que o segundo vermelho nao some.
    carga_por_praca: {
      combinados: 4,
      duplas: 8,
      enrolados: 6,
      enrolados_quentes: 6,
      cozinha_quentes: 8,
    },
    baseline_por_praca: BASELINE_REAL,
    chegadas_na_hora: 24,
    chegadas_normais: 12,
    fontes: FONTES_PADRAO,
  };
}

/* ================================================================== *
 * DEGRADADO — a fonte de tempo cai; a home diz isso em vez de ficar verde
 * ================================================================== */

export function cenaDegradado(): LeituraOperacional {
  return {
    procedencia: "simulado",
    observado_em: AGORA_HOME_DEMO,
    pedidos: [
      pedido("D-401", [item("Hot Roll", 1)]),
      pedido("D-402", [item("Guioza", 1)]),
    ],
    // A carga do Sushi some da leitura. Praca AUSENTE do mapa nao vira 0:
    // ela nao tem pressao observada, e a subarea aparece `sem medicao`.
    carga_por_praca: {
      cozinha_quentes: 4,
    },
    baseline_por_praca: BASELINE_REAL,
    chegadas_na_hora: null,
    chegadas_normais: null,
    fontes: [
      {
        id: "ifood_tempos",
        rotulo: "Tempos do iFood",
        estado: "stale",
        detalhe:
          "Ultima leitura ha mais tempo que o aceitavel. Os tempos nao sustentam sinal de atraso agora.",
  ambientes: ["motoboy", "conferencia"],
      },
      {
        id: "carga_sushi",
        rotulo: "Carga das pracas do Sushi",
        estado: "indisponivel",
        detalhe: "Sem leitura de carga nesta janela. Ausencia nao e zero.",
        ambientes: ["sushi"],
      },
      FONTE_CARDAPIO,
      {
        id: "carga_pracas",
        rotulo: "Carga das pracas",
        estado: "parcial",
        detalhe: "So a Cozinha respondeu nesta janela.",
        ambientes: ["cozinha"],
      },
      FONTE_CAIXA,
      FONTE_CONFERENCIA,
      FONTE_COMANDA,
    ],
  };
}

export type CenaHome = "calmo" | "ambiente" | "foco" | "degradado";

export const CENAS: Record<CenaHome, () => LeituraOperacional> = {
  calmo: cenaCalmo,
  ambiente: cenaAmbiente,
  foco: cenaFoco,
  degradado: cenaDegradado,
};

export function cena(nome: CenaHome): LeituraOperacional {
  const f = CENAS[nome];
  if (!f) throw new Error(`Cena de demonstracao desconhecida: ${nome}`);
  return f();
}
