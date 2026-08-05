/**
 * LAB · OPERAÇÃO VIVA V4 — a oficina das cenas
 * ============================================================================
 * FIXTURE. Nada aqui é dado de operação.
 *
 * O que é REAL nas cenas: o cardápio (`data/cardapio_knowledge_seed.json`, 199
 * itens em 8 praças), o mapa praça → ambiente, os baselines calibrados em 30
 * dias reais (`src/perfil-delivery/motor.js`) e as REGRAS dos sinais.
 * O que é FIXTURE: os pedidos, os tempos, as cargas e os estados de fonte.
 *
 * Toda leitura produzida aqui nasce com `procedencia: "simulado"`, e a view
 * model recusa `real` — não existe caminho por onde uma cena daqui atravesse
 * como leitura de operação.
 *
 * Este módulo NÃO é importado por `critical.ts` nem por `async-runtime.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import type { AmbienteId, PracaId } from "../../../src/product/viewmodels/areas";
import type {
  FonteLeitura,
  ItemDoPedido,
  LeituraOperacional,
  PedidoLeitura,
} from "../../../src/product/viewmodels/sinais";
import {
  paraEstadoCanonico,
  type DivergenciaDeclarada,
  type EstadoDeFonteV4,
} from "../dominio/estado-fonte";
import {
  ambienteCanonicoDaUnidade,
  type AusenciaMaterial,
  type ContornoDoSinal,
  type FonteV4,
  type LeituraV4,
  type RitmoDeclarado,
  type SinalRetirado,
  type ValidacaoEsperada,
} from "../dominio/leitura-v4";
import type {
  DeclaracaoDeCondicoes,
  UnidadeOperacionalId,
} from "../dominio/unidade-operacional";

const requireCJS = createRequire(__filename);

/**
 * Instante fixo. Cena de demonstração não pode depender do relógio da máquina.
 *
 * Em UTC porque é assim que carimbo se escreve; a tela renderiza no fuso da
 * LOJA (`America/Sao_Paulo`), e não no de quem abriu a página — senão o mesmo
 * instante viraria duas leituras diferentes, e nenhuma captura de tela seria
 * reproduzível. `23:40Z` é **20h40 em São Paulo**: uma sexta no pico do jantar.
 */
export const AGORA = "2026-08-04T23:40:00.000Z";

/** Versão da fixture. Toda validação registrada guarda este valor. */
export const VERSAO_FIXTURE = "lab-v4-fixtures@1.0.0";

interface ItemSeed {
  id: string;
  nome: string;
  praca_principal: string | null;
  categoria_operacional: string | null;
}

const SEED = JSON.parse(
  readFileSync(join(process.cwd(), "data", "cardapio_knowledge_seed.json"), "utf8"),
) as { itens: ItemSeed[] };

const MOTOR = requireCJS(
  join(process.cwd(), "src", "perfil-delivery", "motor.js"),
) as { BASELINE: Partial<Record<PracaId, number>> };

/** Os baselines REAIS do motor calibrado. Não são reescritos aqui. */
export const BASELINE_REAL: Partial<Record<PracaId, number>> = { ...MOTOR.BASELINE };

/** Busca um item REAL do cardápio pelo nome. Falha alto se o item sumir. */
export function item(nome: string, qtd = 1): ItemDoPedido {
  const s = SEED.itens.find((x) => x.nome === nome);
  if (!s) throw new Error(`Item de demonstração ausente do cardápio real: ${nome}`);
  return {
    item_id: s.id,
    nome: s.nome,
    praca: (s.praca_principal as PracaId | null) ?? null,
    qtd,
    categoria: s.categoria_operacional,
  };
}

export function pedido(
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

/* ================================================================== *
 * Fontes
 * ================================================================== */

export function fonte(
  id: string,
  rotulo: string,
  estado: EstadoDeFonteV4,
  detalhe: string,
  unidades: readonly UnidadeOperacionalId[],
  necessaria_para_calmo: boolean,
  ultima_atualizacao: string | null = AGORA,
  conta_pedidos = false,
): FonteV4 {
  return {
    id,
    rotulo,
    estado,
    canonico: paraEstadoCanonico(estado),
    detalhe,
    ultima_atualizacao,
    unidades,
    necessaria_para_calmo,
    conta_pedidos,
  };
}

/** As três fontes de ausência ESTRUTURAL. Presentes em toda cena, sempre. */
export const FONTE_CAIXA = fonte(
  "fila_caixa",
  "Fila da Caixa",
  "sem_medicao_automatica",
  "Nenhuma fonte mede esta fila. A área nunca aparece saudável por ausência de dado.",
  ["caixa"],
  false,
  null,
);

export const FONTE_CONFERENCIA = fonte(
  "carga_conferencia",
  "Carga da Conferência",
  "sem_medicao_automatica",
  "Sem medição da área. O risco POR PEDIDO continua existindo e é mostrado.",
  ["conferencia"],
  false,
  null,
);

export const FONTE_COMANDA = fonte(
  "comanda_odhen",
  "Comanda (Odhen/Teknisa)",
  "sem_medicao_automatica",
  "Fonte externa não integrada. Observação e alergia ficam sem leitura.",
  ["conferencia"],
  false,
  null,
);

export const FONTE_CARDAPIO = fonte(
  "cardapio_seed",
  "Cardápio",
  "saudavel",
  "199 itens em 8 praças. Sustenta composição e roteamento — NÃO é fonte de carga de área.",
  [],
  true,
);

export const AUSENCIAS_ESTRUTURAIS: readonly AusenciaMaterial[] = [
  {
    o_que: "A fila da Caixa não é medida por nenhuma fonte",
    por_que: "Não existe integração que conte quantos pedidos esperam ali.",
    consequencia:
      "A Caixa nunca aparece verde. O que se sabe dela vem de quem está na bancada.",
    natureza: "estrutural",
    unidades: ["caixa"],
  },
  {
    o_que: "A carga da Conferência não é medida",
    por_que: "Nenhuma fonte conta a fila da bancada de fechamento.",
    consequencia:
      "O risco POR PEDIDO continua sendo mostrado; a carga da área, não. Uma coisa não substitui a outra.",
    natureza: "estrutural",
    unidades: ["conferencia"],
  },
  {
    o_que: "A comanda do Odhen não é capturada",
    por_que: "Fonte externa não integrada, e a comanda é única, sem separação por praça.",
    consequencia:
      "Observação e alergia do cliente não chegam. Ausência aqui não significa que não existem.",
    natureza: "estrutural",
    unidades: ["conferencia"],
  },
];

/* ================================================================== *
 * O montador
 * ================================================================== */

export interface EntradaDeCena {
  readonly id: string;
  readonly titulo: string;
  readonly demonstra: string;
  readonly pedidos: readonly PedidoLeitura[];
  readonly carga: Partial<Record<PracaId, number>>;
  readonly chegadas_na_hora: number | null;
  readonly chegadas_normais: number | null;
  readonly fontes: readonly FonteV4[];
  readonly ritmo: RitmoDeclarado;
  readonly divergencias?: readonly DivergenciaDeclarada[];
  readonly sinais_retirados?: readonly SinalRetirado[];
  readonly contornos?: readonly ContornoDoSinal[];
  /** Ausências ALÉM das estruturais, que já entram sozinhas. */
  readonly ausencias?: readonly AusenciaMaterial[];
  readonly condicoes_por_pedido?: Readonly<Record<string, DeclaracaoDeCondicoes>>;
  readonly validacao_esperada: ValidacaoEsperada;
}

/**
 * Converte a fonte do Lab para a fonte canônica que `homeVM()` consome.
 *
 * O estado desce por `paraEstadoCanonico`, que nunca inventa saúde. Os
 * ambientes vêm das unidades, e `sushi_quentes` volta a cair em `sushi` —
 * porque do lado canônico ele é subárea, e o Lab não reescreve o domínio.
 */
function paraFonteCanonica(f: FonteV4): FonteLeitura {
  const ambientes = [
    ...new Set(f.unidades.map(ambienteCanonicoDaUnidade)),
  ] as AmbienteId[];
  return {
    id: f.id,
    rotulo: f.rotulo,
    estado: paraEstadoCanonico(f.estado),
    detalhe: f.detalhe,
    ambientes,
  };
}

export function cena(e: EntradaDeCena): LeituraV4 {
  const base: LeituraOperacional = {
    procedencia: "simulado",
    observado_em: AGORA,
    pedidos: e.pedidos,
    carga_por_praca: e.carga,
    baseline_por_praca: BASELINE_REAL,
    chegadas_na_hora: e.chegadas_na_hora,
    chegadas_normais: e.chegadas_normais,
    fontes: e.fontes.map(paraFonteCanonica),
  };

  return {
    cenario_id: e.id,
    titulo: e.titulo,
    demonstra: e.demonstra,
    versao_fixture: VERSAO_FIXTURE,
    procedencia: "simulado",
    observado_em: AGORA,
    base,
    fontes: e.fontes,
    divergencias: e.divergencias ?? [],
    ritmo: e.ritmo,
    sinais_retirados: e.sinais_retirados ?? [],
    contornos: e.contornos ?? [],
    ausencias_materiais: [...AUSENCIAS_ESTRUTURAIS, ...(e.ausencias ?? [])],
    condicoes_por_pedido: e.condicoes_por_pedido ?? {},
    validacao_esperada: e.validacao_esperada,
  };
}

/** Ritmo sem lastro. Usado quando a fonte de chegadas não respondeu. */
export const RITMO_NAO_OBSERVADO: RitmoDeclarado = {
  tendencia: "nao_observada",
  texto: "Não dá para dizer se o movimento está subindo ou cedendo.",
  lastro:
    "A contagem de chegadas não foi observada nesta leitura. Ausência de tendência não é estabilidade.",
};
