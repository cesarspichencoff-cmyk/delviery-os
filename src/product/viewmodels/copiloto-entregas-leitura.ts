/**
 * Leitura comum Entregas -> Copiloto (apresentação somente leitura).
 *
 * NÃO cria um segundo leitor, NÃO consulta SQL, NÃO gera recomendação ou
 * comando e NÃO promove dados simulados a fatos reais. Reusa a MESMA
 * LeituraDeRealidade já oferecida à superfície Entregas.
 *
 * Uma contagem aqui significa "viagens presentes na projeção do log";
 * NÃO significa viagens ativas, prontidão, atraso, SLA ou carga da operação.
 */
import type { LeituraDeRealidade } from "./entregas-vm";
import type { SourceMode } from "../../platform/contracts/event-catalog";

export const COPILOTO_ENTREGAS_LEITURA_VERSAO =
  "copiloto-entregas-leitura@1" as const;

export interface CopilotoEntregasLeitura {
  readonly contrato: typeof COPILOTO_ENTREGAS_LEITURA_VERSAO;
  readonly estado: "indisponivel" | "sem_evidencia" | "observado";
  readonly fonte: "platform.event_log" | null;
  readonly lida_em: string | null;
  readonly unidade_solicitada: string | null;
  readonly grupos: readonly {
    readonly unit_id: string;
    readonly source_mode: SourceMode;
    /** Quantidade de registros de viagem NA projeção histórica (não simultâneos). */
    readonly viagens_na_projecao: number;
  }[];
  readonly historico_sem_modo: number | null;
  readonly motivo: string;
  readonly nenhuma_acao_executada: true;
}

export function copilotoEntregasLeitura(
  entrada: LeituraDeRealidade,
  unidadeSolicitada: string | null = null,
): CopilotoEntregasLeitura {
  const unidade = unidadeSolicitada?.trim() || null;
  if (!entrada.disponivel) {
    return {
      contrato: COPILOTO_ENTREGAS_LEITURA_VERSAO,
      estado: "indisponivel",
      fonte: null,
      lida_em: null,
      unidade_solicitada: unidade,
      grupos: [],
      historico_sem_modo: null,
      motivo: entrada.motivo === "integracao_pendente"
        ? "A fonte da plataforma ainda não foi configurada; não há leitura atual de Entregas."
        : "A fonte da plataforma está indisponível; não é possível confirmar o estado atual.",
      nenhuma_acao_executada: true,
    };
  }

  const realidade = entrada.realidade;
  const grupos = realidade.projecoes
    .filter((p) => unidade === null || p.unit_id === unidade)
    .map((p) => ({
      unit_id: p.unit_id,
      source_mode: p.source_mode,
      viagens_na_projecao: p.viagens.length,
    }))
    .sort((a, b) =>
      a.unit_id.localeCompare(b.unit_id) ||
      a.source_mode.localeCompare(b.source_mode));

  return {
    contrato: COPILOTO_ENTREGAS_LEITURA_VERSAO,
    estado: grupos.length ? "observado" : "sem_evidencia",
    fonte: "platform.event_log",
    lida_em: realidade.lida_em,
    unidade_solicitada: unidade,
    grupos,
    // Contagem do log INTEIRO não pertence a um recorte de unidade.
    historico_sem_modo: unidade === null ? realidade.historico_sem_modo : null,
    motivo: grupos.length
      ? "Projeção histórica separada por unidade e modo. Não comprova operação ativa nem autoriza recomendações."
      : "Não há projeção de viagens para este recorte. Ausência de fato não significa zero entregas.",
    nenhuma_acao_executada: true,
  };
}
