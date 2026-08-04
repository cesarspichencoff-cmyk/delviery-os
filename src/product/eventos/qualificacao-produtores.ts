/**
 * QUALIFICACAO DOS PRODUTORES — a MEDICAO de R5-D2
 * ============================================================================
 * Separado de `portas-produtores.ts` de proposito, e a separacao foi o gate que
 * pediu: a guarda "a porta nao conhece Odhen nem iFood" acusou o proprio arquivo,
 * porque a qualificacao cita `gestor_ifood_dom` e `relatorio_ifood_lote`.
 *
 * A guarda estava certa. **Contrato e medicao sao coisas diferentes**: a porta
 * precisa sobreviver a troca de fonte; a qualificacao e um retrato datado de
 * quais fontes existem hoje. Deixar as duas no mesmo arquivo faria a porta
 * envelhecer junto com o retrato.
 *
 * Nada aqui conecta nada. E dado sobre o que foi medido em R5-D2.
 */

import type { TipoOperacional } from "./catalogo-operacional";
import type { MotivoIndisponibilidade } from "./portas-produtores";

/* ------------------------------------------------------------------ *
 * Qualificacao — o resultado de R5-D2                                 *
 * ------------------------------------------------------------------ */

export type NivelDeAutoridade =
  | "autoritativa"
  | "observacional"
  | "derivada"
  | "indisponivel"
  | "desconhecida";

export type DecisaoDeFonte =
  | "qualificada"
  | "parcialmente_qualificada"
  | "rejeitada"
  | "ainda_inacessivel"
  | "combinacao_necessaria";

export interface QualificacaoDeProdutor {
  readonly evento: TipoOperacional;
  readonly produtor_primario: string | null;
  readonly produtor_secundario: string | null;
  readonly decisao: DecisaoDeFonte;
  readonly lacunas: readonly MotivoIndisponibilidade[];
  /** Probe executado? `null` = recusado por nao se poder provar que e seguro. */
  readonly probe: "read_only_executado" | "recusado" | null;
}

/**
 * A qualificacao medida em R5-D2. Ela e DADO, nao promessa: cada linha carrega a
 * decisao e as lacunas que a sustentam.
 *
 * Nenhuma linha esta `qualificada` sozinha — e esse e o resultado da missao.
 */
export const QUALIFICACAO_R5D2: readonly QualificacaoDeProdutor[] = [
  {
    evento: "pedido_ciclo_observado",
    produtor_primario: "gestor_ifood_dom",
    produtor_secundario: "relatorio_ifood_lote",
    decisao: "parcialmente_qualificada",
    lacunas: ["sem_timestamp_de_origem", "estado_atual_sem_historico", "duplicata_sem_chave_estavel"],
    probe: "recusado",
  },
  {
    evento: "trabalho_praca_observado",
    produtor_primario: null,
    produtor_secundario: null,
    decisao: "rejeitada",
    lacunas: [
      "praca_inferida_nao_declarada",
      "reimpressao_indistinguivel",
      "cancelamento_nao_observado",
      "estado_atual_sem_historico",
    ],
    probe: "recusado",
  },
  {
    evento: "capacidade_praca_observada",
    produtor_primario: null,
    produtor_secundario: null,
    decisao: "ainda_inacessivel",
    lacunas: ["endpoint_ausente", "campo_obrigatorio_ausente"],
    probe: null,
  },
  {
    evento: "source_health_changed",
    produtor_primario: "observador_interno",
    produtor_secundario: null,
    decisao: "qualificada",
    lacunas: [],
    probe: "read_only_executado",
  },
];

/**
 * Um produtor so esta pronto para virar adapter quando a decisao e
 * `qualificada` E nao ha lacuna aberta. Hoje isso vale para UM tipo — o de
 * saude —, que e justamente o que nao depende de fonte externa.
 */
export function prontoParaAdapter(q: QualificacaoDeProdutor): boolean {
  return q.decisao === "qualificada" && q.lacunas.length === 0;
}
