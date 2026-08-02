/**
 * DeliveryOS — Product System · contrato de exibicao das areas operacionais
 * ============================================================================
 * Este arquivo e o UNICO lugar onde um identificador interno de praca vira o nome
 * que uma pessoa le. Ele existe porque a nomenclatura ja tinha divergido uma vez:
 * `DISPLAY.cozinha_quentes` exibia a **Cozinha** com "Quentes", que e o nome que a
 * operacao usa para OUTRA praca (`enrolados_quentes` = Sushi Quentes).
 *
 * FONTE CANONICA — nao reabrir:
 *   D45 · `enrolados_quentes` = Sushi Quentes (subarea de Sushi)
 *         `cozinha_quentes`   = Cozinha (ambiente proprio)
 *         O nome e de PRACA e FLUXO, nunca de temperatura.
 *   D46 · Sushi e ambiente GERAL, com Combinados, Duplas, Enrolados e Sushi Quentes
 *         visiveis como subareas. "Sushi carregado" nunca esconde qual subarea causa
 *         o congestionamento.
 *   Ver docs/product/RECOVERY_MAP.md §1 e docs/execution/DECISIONS.md D45/D46.
 *
 * O que este arquivo deliberadamente NAO faz: renomear identificador interno. As
 * chaves `enrolados_quentes` e `cozinha_quentes` continuam sendo as chaves do seed
 * (`data/cardapio_knowledge_seed.json`), do BASELINE e dos replays historicos. A
 * correcao vive na camada de apresentacao, que e onde o defeito vivia.
 */

/** As 8 pracas do motor. Identificadores internos — nunca exibidos crus. */
export type PracaId =
  | "combinados"
  | "duplas"
  | "enrolados"
  | "enrolados_quentes"
  | "cozinha_quentes"
  | "sobremesa"
  | "bar_bebidas"
  | "montagem_outros";

/** Os ambientes que a home representa. Ordem de leitura da operacao. */
export type AmbienteId =
  | "caixa"
  | "sushi"
  | "cozinha"
  | "conferencia"
  | "motoboy";

/**
 * Como a area e medida hoje. `sem_medicao_automatica` NAO e um estado de saude:
 * e a declaracao de que nao existe fonte. Uma area assim nunca pode aparecer verde.
 */
export type ModoDeMedicao =
  | "carga_por_praca"
  | "sinal_por_pedido"
  | "expedicao"
  | "sem_medicao_automatica";

export interface Praca {
  readonly id: PracaId;
  /** O nome que a operacao usa. Unico rotulo humano legitimo. */
  readonly rotulo: string;
  /** A que ambiente esta praca pertence. */
  readonly ambiente: AmbienteId;
  /** Se e subarea visivel dentro do ambiente (D46) ou apoio de conferencia. */
  readonly papel: "subarea" | "producao" | "apoio_conferencia";
}

export const PRACAS: readonly Praca[] = [
  { id: "combinados", rotulo: "Combinados", ambiente: "sushi", papel: "subarea" },
  { id: "duplas", rotulo: "Duplas", ambiente: "sushi", papel: "subarea" },
  { id: "enrolados", rotulo: "Enrolados", ambiente: "sushi", papel: "subarea" },
  {
    id: "enrolados_quentes",
    rotulo: "Sushi Quentes",
    ambiente: "sushi",
    papel: "subarea",
  },
  {
    id: "cozinha_quentes",
    rotulo: "Cozinha",
    ambiente: "cozinha",
    papel: "producao",
  },
  {
    id: "sobremesa",
    rotulo: "Sobremesa",
    ambiente: "conferencia",
    papel: "apoio_conferencia",
  },
  {
    id: "bar_bebidas",
    rotulo: "Bar",
    ambiente: "conferencia",
    papel: "apoio_conferencia",
  },
  {
    id: "montagem_outros",
    rotulo: "Montagem",
    ambiente: "conferencia",
    papel: "apoio_conferencia",
  },
];

export interface Ambiente {
  readonly id: AmbienteId;
  readonly rotulo: string;
  /** Uma frase: o que esta area faz na operacao. */
  readonly descricao: string;
  readonly medicao: ModoDeMedicao;
  /**
   * Por que a area nao tem medicao propria. Obrigatorio quando
   * `medicao === "sem_medicao_automatica"` — ausencia sem motivo vira normalidade.
   */
  readonly motivo_sem_medicao?: string;
}

export const AMBIENTES: readonly Ambiente[] = [
  {
    id: "caixa",
    rotulo: "Caixa",
    descricao: "Entrada do pedido e bancada onde a montagem simples acontece.",
    medicao: "sem_medicao_automatica",
    motivo_sem_medicao:
      "Nenhuma fonte atual mede a fila da caixa. O sistema nao afirma que ela esta saudavel.",
  },
  {
    id: "sushi",
    rotulo: "Sushi",
    descricao:
      "Ambiente geral do sushi. Combinados, Duplas, Enrolados e Sushi Quentes ficam visiveis dentro dele.",
    medicao: "carga_por_praca",
  },
  {
    id: "cozinha",
    rotulo: "Cozinha",
    descricao: "Pratos quentes de cozinha, com producao propria.",
    medicao: "carga_por_praca",
  },
  {
    id: "conferencia",
    rotulo: "Conferencia",
    descricao: "Fechamento e conferencia do pedido antes de sair.",
    medicao: "sinal_por_pedido",
  },
  {
    id: "motoboy",
    rotulo: "Motoboy",
    descricao: "Despacho: prontos esperando para sair.",
    medicao: "expedicao",
  },
];

const PORCA: ReadonlyMap<PracaId, Praca> = new Map(PRACAS.map((p) => [p.id, p]));
const PORAMB: ReadonlyMap<AmbienteId, Ambiente> = new Map(
  AMBIENTES.map((a) => [a.id, a]),
);

/**
 * O rotulo humano de uma praca. Lanca quando o id nao existe — devolver o proprio
 * id seria exibir `cozinha_quentes` para uma pessoa, que e exatamente o defeito
 * que este arquivo fecha.
 */
export function rotuloDaPraca(id: PracaId): string {
  const p = PORCA.get(id);
  if (!p) throw new Error(`Praca sem rotulo canonico: ${String(id)}`);
  return p.rotulo;
}

export function ambienteDaPraca(id: PracaId): AmbienteId {
  const p = PORCA.get(id);
  if (!p) throw new Error(`Praca sem ambiente canonico: ${String(id)}`);
  return p.ambiente;
}

export function rotuloDoAmbiente(id: AmbienteId): string {
  const a = PORAMB.get(id);
  if (!a) throw new Error(`Ambiente sem rotulo canonico: ${String(id)}`);
  return a.rotulo;
}

export function ambientePorId(id: AmbienteId): Ambiente {
  const a = PORAMB.get(id);
  if (!a) throw new Error(`Ambiente desconhecido: ${String(id)}`);
  return a;
}

/** As subareas visiveis de um ambiente, na ordem de leitura da operacao (D46). */
export function subareasDe(ambiente: AmbienteId): readonly Praca[] {
  return PRACAS.filter((p) => p.ambiente === ambiente && p.papel === "subarea");
}

/** As pracas que alimentam um ambiente, incluindo producao e apoio. */
export function pracasDe(ambiente: AmbienteId): readonly Praca[] {
  return PRACAS.filter((p) => p.ambiente === ambiente);
}

/**
 * Areas que hoje nao tem fonte propria de carga. Existe para que a home nao
 * precise repetir a lista — e para que um teste possa exigir que nenhuma delas
 * apareca como saudavel.
 */
export function ambientesSemMedicao(): readonly Ambiente[] {
  return AMBIENTES.filter((a) => a.medicao === "sem_medicao_automatica");
}
