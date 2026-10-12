/**
 * Células V3.3 no Product System: mapa de COBERTURA, não motor de pressão.
 *
 * Origem do vocabulário: docs/copiloto/CELULAS_OPERACIONAIS_V1.md da linha
 * integration/copiloto-celulas-shadow-v1. A linha antiga mede severidade
 * usando default zero; isso seria falso aqui sem produtor operacional vivo.
 * Este adaptador é deliberadamente fail-closed e não importa app-v1/motor.
 *
 * D45/D46: Quentes = enrolados_quentes; Cozinha = cozinha_quentes;
 * Sushi representa combinados + duplas + enrolados, enquanto o ambiente
 * maior de Sushi também inclui Sushi Quentes. Nunca duplicar quantidade.
 */
import type { PracaId } from "./areas";
import type { CopilotoEntregasLeitura } from "./copiloto-entregas-leitura";

export const CELULAS_V33_SHADOW_VERSION = "celulas-v33-shadow@1" as const;

export type CelulaV33Id =
  | "caixa"
  | "sushi"
  | "quentes"
  | "cozinha"
  | "conferencia"
  | "entregas";

export type EstadoCelulaV33 =
  | "nao_conectada"
  | "sem_evidencia"
  | "historico_sintetico"
  | "historico_real_parcial";

export interface CelulaV33Shadow {
  readonly id: CelulaV33Id;
  readonly nome: string;
  readonly pracas: readonly PracaId[];
  readonly estado: EstadoCelulaV33;
  readonly descricao: string;
  /** Fonte exibida só quando o servidor realmente retornou a leitura. */
  readonly fonte: "platform.event_log" | null;
  readonly modos: readonly ("real" | "simulated" | "control")[];
  readonly pressao: null;
  readonly cor_operacional: null;
  readonly fila: null;
  readonly nenhuma_acao_executada: true;
}

export interface CelulasV33Shadow {
  readonly versao: typeof CELULAS_V33_SHADOW_VERSION;
  readonly modo: "somente_leitura_sem_motor_operacional";
  readonly celulas: readonly CelulaV33Shadow[];
  readonly nenhuma_acao_executada: true;
}

/**
 * Seis células exatas do V3.3. Sushi usa três subpraças nessa célula,
 * Quentes a quarta; isto NÃO redefine o ambiente Sushi canônico.
 */
const MAPA: readonly {
  id: CelulaV33Id;
  nome: string;
  pracas: readonly PracaId[];
  indisponibilidade: string;
}[] = [
  {
    id: "caixa", nome: "Caixa", pracas: [],
    indisponibilidade: "Pedidos recebidos, prontos e cancelados ainda não chegam como fatos operacionais aptos para medir o Caixa.",
  },
  {
    id: "sushi", nome: "Sushi", pracas: ["combinados", "duplas", "enrolados"],
    indisponibilidade: "Sem observações por praça de Combinados, Duplas e Enrolados; não é possível medir pressão.",
  },
  {
    id: "quentes", nome: "Quentes", pracas: ["enrolados_quentes"],
    indisponibilidade: "Sushi Quentes ainda não tem fonte de trabalhos por praça habilitada nesta superfície.",
  },
  {
    id: "cozinha", nome: "Cozinha", pracas: ["cozinha_quentes"],
    indisponibilidade: "Cozinha ainda não tem fonte de trabalhos por praça habilitada nesta superfície.",
  },
  {
    id: "conferencia", nome: "Conferência", pracas: [],
    indisponibilidade: "Saúde de fonte do Conference Brain não equivale a observação de pedidos na bancada.",
  },
  {
    id: "entregas", nome: "Entregas", pracas: [],
    indisponibilidade: "A fonte de viagens não foi conectada ou ainda não contém fatos neste recorte.",
  },
];

/** Projeta SOMENTE proveniência de viagens já lidas na porta comum. */
export function celulasCopilotoV33(
  entregas: CopilotoEntregasLeitura,
): CelulasV33Shadow {
  const modos = (["real", "simulated", "control"] as const)
    .filter((m) => entregas.grupos.some((g) => g.source_mode === m));
  const comFonte = entregas.fonte === "platform.event_log";
  const comHistorico = entregas.estado === "observado" && modos.length > 0;
  const haReal = modos.includes("real");

  const celulas: CelulaV33Shadow[] = MAPA.map((c) => {
    const eEntregas = c.id === "entregas";
    const estado: EstadoCelulaV33 = !eEntregas || !comFonte
      ? "nao_conectada"
      : comHistorico
        ? haReal ? "historico_real_parcial" : "historico_sintetico"
        : "sem_evidencia";
    const descricao = !eEntregas ? c.indisponibilidade
      : estado === "historico_real_parcial"
        ? "Há registros de viagem com modo real na projeção histórica. Isso não mede viagens ativas, fila, SLA, GPS nem atraso."
        : estado === "historico_sintetico"
          ? "Há apenas registros simulados/de controle. Nenhuma conclusão sobre a operação real é autorizada."
          : estado === "sem_evidencia"
            ? "O log foi consultado, mas não houve projeção de viagens neste recorte. Isso não prova zero entregas."
            : c.indisponibilidade;
    return {
      id: c.id,
      nome: c.nome,
      pracas: [...c.pracas],
      estado,
      descricao,
      fonte: eEntregas && comFonte ? "platform.event_log" : null,
      modos: eEntregas && comHistorico ? modos : [],
      pressao: null,
      cor_operacional: null,
      fila: null,
      nenhuma_acao_executada: true,
    };
  });
  return {
    versao: CELULAS_V33_SHADOW_VERSION,
    modo: "somente_leitura_sem_motor_operacional",
    celulas,
    nenhuma_acao_executada: true,
  };
}
