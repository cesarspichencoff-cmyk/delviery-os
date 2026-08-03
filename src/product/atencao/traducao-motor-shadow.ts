/**
 * TRADUCAO — motor original -> Copiloto Shadow
 * ============================================================================
 * R5-C. Fronteira PURA e TIPADA. Ela nao conecta os dois sistemas: nao chama
 * `recomendar()`, nao toca store, nao emite evento, nao persiste. D43 de pe.
 *
 * A REGRA QUE GOVERNA TUDO AQUI: a Operacao Viva JA elegeu a causa e o Foco
 * antes desta funcao ser chamada. O tradutor nao cria, nao troca, nao renova e
 * nao retira Foco. Ele le o Foco eleito e recusa quando nao consegue produzir
 * uma recomendacao honesta.
 *
 * AS TRES INCOMPATIBILIDADES QUE DECIDIRAM ESTE DESENHO — matriz completa em
 * `docs/product/CONTRATO_TRADUCAO_MOTOR_SHADOW.md` §1:
 *
 *   1. O motor NAO conhece o event log. `input_event_ids` e a evidencia que o
 *      Shadow exige, e o motor trabalha sobre a fotografia do minuto. Nenhuma
 *      evidencia e inventada: ela vem tipada do chamador, ou bloqueia.
 *   2. Confianca e ROTULO de um lado ("alta") e NUMERO do outro (0..1), e nao
 *      existe regra canonica ligando os dois. Inventar a escala seria fabricar
 *      precisao. O numero vem do chamador, com evidencia, ou nao existe.
 *   3. O Shadow NAO TEM SUJEITO — `recommended_action` e texto. Entao D29 nao e
 *      protegida pelo contrato do Shadow: ela e protegida AQUI, no
 *      `EscopoDoSujeito`, antes de o draft existir.
 *
 * Pureza exigida e cumprida: sem `Date.now()`, sem `Math.random()`, sem
 * `randomUUID()`, sem estado global, sem singleton, sem banco, sem rede, sem
 * variavel de ambiente. Relogio, versao e identidade vem do chamador.
 */

import type { SourceMode } from "../../platform/contracts/event-catalog";
import {
  POLICY_VERSION,
  exigirConfianca,
  validarDraftShadow,
  type MotivoRejeicaoShadow,
  type Recomendacao,
  type ResultadoValidacaoShadow,
  type RiskLevel,
} from "../../platform/copiloto/shadow";
import type { AmbienteId, PracaId } from "../viewmodels/areas";

/* ------------------------------------------------------------------ *
 * Versoes                                                             *
 * ------------------------------------------------------------------ */

/** Versao da REGRA de traducao. Muda quando o mapeamento muda. */
export const VERSAO_TRADUCAO = "motor-shadow@1.0.0";
/** Contrato de ENTRADA suportado: a forma da saida legada do motor. */
export const ENTRADA_SUPORTADA = "motor-decisao@1";
/** Contrato de SAIDA suportado: a politica do Shadow. */
export const SAIDA_SUPORTADA = POLICY_VERSION;

/* ------------------------------------------------------------------ *
 * Sujeito                                                             *
 * ------------------------------------------------------------------ */

/**
 * De quem a recomendacao fala. O Shadow nao tem este conceito — e por isso ele
 * mora aqui, onde D29 pode ser aplicada antes de o draft nascer.
 *
 * `pedido` exige `order_id` REAL observado. O id curto do iFood que o motor
 * carrega em `c.id` NAO e `order_id`: ele se repete entre dias e nao identifica
 * o pedido no log de eventos.
 */
export type EscopoDoSujeito =
  | { readonly tipo: "fonte"; readonly fonte_id: string }
  | { readonly tipo: "ambiente"; readonly ambiente: AmbienteId }
  | { readonly tipo: "subarea"; readonly subarea: PracaId }
  | { readonly tipo: "pedido"; readonly order_id: string };

/** Identidade estavel da causa, produzida pela politica temporal (R5-A). */
export type IdentidadeDaCausa = string;

/* ------------------------------------------------------------------ *
 * Saida legada do motor — adaptador de leitura                        *
 * ------------------------------------------------------------------ */

/**
 * A saida real de `decidir()`, representada fielmente e SEM promover texto a
 * verdade estrutural. `confianca_rotulo` continua rotulo: ele NAO vira numero
 * aqui, porque nao existe regra canonica para isso.
 */
export interface AcaoCandidataDoMotor {
  readonly contrato: string;
  /** `priorizar_praca`, `fechar_simples`, `conferencia`, `olhar_pedido`… */
  readonly tipo: string;
  readonly acao: string;
  readonly porque: string;
  readonly impacto: string;
  /** Rotulo legado. Nunca convertido em `confidence`. */
  readonly confianca_rotulo: "alta" | "média" | "baixa";
  readonly praca: PracaId | null;
  /**
   * O `#id` que o motor exibe. E id CURTO do iFood, e nunca `order_id`.
   * O nome do campo diz isso para que ninguem o use por engano.
   */
  readonly id_curto_exibido: string | null;
  /** A causa sob a qual esta acao foi produzida (`sess.active.key`). */
  readonly causa_da_acao: IdentidadeDaCausa;
}

/* ------------------------------------------------------------------ *
 * Evidencia, procedencia, validade, retirada                          *
 * ------------------------------------------------------------------ */

/**
 * A evidencia que o Shadow exige. `evento_ids` sao ids do event log — o motor
 * nao os produz, entao eles chegam do chamador ou a traducao bloqueia.
 */
export interface PacoteDeEvidencias {
  readonly evento_ids: readonly string[];
  /** A causa que estas evidencias sustentam. Precisa bater com o Foco. */
  readonly vinculo_causa: IdentidadeDaCausa;
  /** O sujeito que estas evidencias sustentam. Precisa bater com o escopo. */
  readonly vinculo_sujeito: EscopoDoSujeito;
  readonly observado_em: string;
  readonly qualidade: "completa" | "parcial";
}

export type NaturezaDaProcedencia =
  | "real"
  | "derivada"
  | "demonstracao"
  | "fixture"
  | "indisponivel";

export interface ProcedenciaEstruturada {
  readonly natureza: NaturezaDaProcedencia;
  readonly source_mode: SourceMode;
  readonly projection_version: string;
  readonly transformacao: string;
  readonly regra: string;
  readonly limitacoes: readonly string[];
}

/**
 * Validade da RECOMENDACAO. Nunca derivada de DEBOUNCE, COOLDOWN, MAXFOCUS ou
 * STALE: sao semanticas diferentes, e `STALE 120` nem sequer mede frescor de
 * fonte (D62). Ela e fornecida ou vem de politica documentada, e e auditavel.
 */
export interface PoliticaDeValidade {
  readonly validade_s: number;
  readonly origem: "fornecida" | "politica_documentada";
  readonly politica_id: string;
}

export type MotivoDeRetirada =
  | "evidencia_deixou_de_existir"
  | "procedencia_incompativel"
  | "validade_expirou"
  | "causa_deixou_de_coincidir"
  | "sujeito_indisponivel"
  | "condicao_operacional_resolvida"
  | "versao_substituida";

/** O tradutor apenas REPRESENTA as condicoes. Ele nao executa retirada. */
export interface CondicoesDeRetirada {
  readonly quando: readonly MotivoDeRetirada[];
}

/* ------------------------------------------------------------------ *
 * Foco eleito — leitura, nunca escrita                                *
 * ------------------------------------------------------------------ */

export type ModoDaOperacaoViva = "calmo" | "ambiente" | "foco";

/**
 * O que o tradutor precisa saber do Foco. Deliberadamente uma COPIA DE LEITURA,
 * e nao o `EstadoTemporal`: se o estado inteiro entrasse aqui, alguem
 * eventualmente o mutaria, e a atencao deixaria de ter dono unico (C3).
 */
export interface FocoEleito {
  readonly modo: ModoDaOperacaoViva;
  readonly identidade: IdentidadeDaCausa | null;
  readonly orientacao_permitida: boolean;
}

/* ------------------------------------------------------------------ *
 * Entrada e resultado                                                 *
 * ------------------------------------------------------------------ */

export interface EntradaTraducaoMotorShadow {
  readonly versao_entrada: string;
  readonly versao_saida: string;
  readonly foco: FocoEleito;
  /** `null` = o motor nao devolveu candidato dentro do escopo (foco puro). */
  readonly acao: AcaoCandidataDoMotor | null;
  readonly escopo: EscopoDoSujeito;
  readonly evidencias: PacoteDeEvidencias | null;
  readonly procedencia: ProcedenciaEstruturada | null;
  /** 0..1, sustentada por evidencia. `null` = nao observada — nunca zero. */
  readonly confianca: number | null;
  readonly risco: RiskLevel;
  readonly validade: PoliticaDeValidade | null;
  readonly retirada: CondicoesDeRetirada | null;
  /** Relogio do chamador. O tradutor nao le relogio. */
  readonly agora_iso: string;
  /** Identidade da recomendacao, fornecida pelo chamador. */
  readonly recommendation_id: string;
  readonly policy_id: string;
  /** Para onde este draft vai. Demonstracao nunca entra no caminho real. */
  readonly destino: "real" | "demonstracao";
  readonly indisponivel: readonly string[];
}

export type MotivoRetencao =
  | "modo_sem_orientacao"
  | "ambiente_informa_sem_orientar"
  | "foco_puro_sem_acao_candidata";

export type MotivoBloqueio =
  | "causa_raiz_divergente"
  | "identidade_de_causa_ausente"
  | "identidade_de_pedido_ausente"
  | "identidade_de_pedido_improvisada"
  | "evidencia_insuficiente"
  | "evidencia_sem_vinculo_com_a_causa"
  | "evidencia_sem_vinculo_com_o_sujeito"
  | "confianca_sem_evidencia"
  | "confianca_fora_de_faixa"
  | "procedencia_ausente"
  | "procedencia_incompativel"
  | "validade_ausente"
  | "validade_expirada"
  | "retirada_ausente"
  | "escopo_invalido";

export type MotivoIncompatibilidade = "versao_nao_suportada";

export interface AuditoriaDaTraducao {
  readonly versao_traducao: string;
  readonly causa_do_foco: IdentidadeDaCausa | null;
  readonly causa_da_acao: IdentidadeDaCausa | null;
  readonly escopo: EscopoDoSujeito;
  readonly destino: "real" | "demonstracao";
  readonly evidencias_recebidas: number;
}

export type ResultadoTraducaoMotorShadow =
  | { readonly tipo: "traduzida"; readonly draft: Recomendacao; readonly auditoria: AuditoriaDaTraducao }
  | { readonly tipo: "retida"; readonly motivo: MotivoRetencao; readonly auditoria: AuditoriaDaTraducao }
  | { readonly tipo: "bloqueada"; readonly motivo: MotivoBloqueio; readonly auditoria: AuditoriaDaTraducao }
  | {
      readonly tipo: "incompativel";
      readonly motivo: MotivoIncompatibilidade;
      readonly divergencia: string;
    };

/* ------------------------------------------------------------------ *
 * D29 — o que NAO pode ser um `order_id`                              *
 * ------------------------------------------------------------------ */

/**
 * Recusa identificador improvisado. Nao e uma heuristica de "parece id": e a
 * lista do que o contrato PROIBE, e ela existe porque cada um destes ja apareceu
 * em algum lugar do projeto como se fosse identidade.
 */
export function identidadeDePedidoLegitima(order_id: string): boolean {
  if (typeof order_id !== "string") return false;
  const v = order_id.trim();
  if (v === "") return false;
  // Numero visual do motor: `#123`, `123`, `B-205`. O id curto do iFood repete
  // entre dias — ele nunca identifica um pedido no log.
  if (/^#/.test(v)) return false;
  if (/^\d{1,6}$/.test(v)) return false;
  if (/^[A-Z]-\d{1,6}$/.test(v)) return false;
  // Indice ou posicao.
  if (/^(indice|index|posicao|pos)[-_:]?\d+$/i.test(v)) return false;
  // Horario usado como identidade.
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return false;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return false;
  // Hash improvisado de conteudo.
  if (/^(sha\d*|md5|hash)[-_:]/i.test(v)) return false;
  if (/^[0-9a-f]{32}$/i.test(v)) return false;
  // Chave de fixture ou identificador temporario.
  if (/^(fixture|demo|seed|tmp|temp|sim)[-_:]/i.test(v)) return false;
  return true;
}

/** Duas descricoes de sujeito sao o mesmo sujeito? Comparacao estrutural. */
function mesmoSujeito(a: EscopoDoSujeito, b: EscopoDoSujeito): boolean {
  if (a.tipo !== b.tipo) return false;
  switch (a.tipo) {
    case "fonte":
      return a.fonte_id === (b as { fonte_id: string }).fonte_id;
    case "ambiente":
      return a.ambiente === (b as { ambiente: AmbienteId }).ambiente;
    case "subarea":
      return a.subarea === (b as { subarea: PracaId }).subarea;
    case "pedido":
      return a.order_id === (b as { order_id: string }).order_id;
  }
}

/* ------------------------------------------------------------------ *
 * A traducao                                                          *
 * ------------------------------------------------------------------ */

/**
 * Traduz UMA acao candidata ja escolhida pelo motor, ou recusa com motivo
 * tipado. PURA: a mesma entrada devolve sempre o mesmo resultado.
 *
 * Nunca devolve `null` ambiguo e nunca aceita objeto parcial em silencio.
 */
export function traduzirParaShadow(
  e: EntradaTraducaoMotorShadow,
): ResultadoTraducaoMotorShadow {
  const auditoria: AuditoriaDaTraducao = {
    versao_traducao: VERSAO_TRADUCAO,
    causa_do_foco: e.foco.identidade,
    causa_da_acao: e.acao === null ? null : e.acao.causa_da_acao,
    escopo: e.escopo,
    destino: e.destino,
    evidencias_recebidas: e.evidencias === null ? 0 : e.evidencias.evento_ids.length,
  };
  const retida = (motivo: MotivoRetencao): ResultadoTraducaoMotorShadow => ({
    tipo: "retida",
    motivo,
    auditoria,
  });
  const bloqueada = (motivo: MotivoBloqueio): ResultadoTraducaoMotorShadow => ({
    tipo: "bloqueada",
    motivo,
    auditoria,
  });

  /* -- 0. Versao. Migracao implicita nao acontece aqui. ---------------- */
  if (e.versao_entrada !== ENTRADA_SUPORTADA || e.versao_saida !== SAIDA_SUPORTADA) {
    return {
      tipo: "incompativel",
      motivo: "versao_nao_suportada",
      divergencia: `entrada=${e.versao_entrada} (suportada ${ENTRADA_SUPORTADA}) · saida=${e.versao_saida} (suportada ${SAIDA_SUPORTADA})`,
    };
  }

  /* -- 1. Modo. Só Foco traduz (C1). ---------------------------------- */
  if (e.foco.modo === "calmo") return retida("modo_sem_orientacao");
  if (e.foco.modo === "ambiente") return retida("ambiente_informa_sem_orientar");
  if (!e.foco.orientacao_permitida) return retida("ambiente_informa_sem_orientar");

  /* -- 2. I2. Sem acao candidata, o Foco continua puro. ---------------- */
  if (e.acao === null) return retida("foco_puro_sem_acao_candidata");
  if (e.acao.contrato !== ENTRADA_SUPORTADA) {
    return {
      tipo: "incompativel",
      motivo: "versao_nao_suportada",
      divergencia: `acao.contrato=${e.acao.contrato} (suportada ${ENTRADA_SUPORTADA})`,
    };
  }

  /* -- 3. I1. A causa da acao E a causa do Foco. Defesa em profundidade.
     A causa NUNCA e alterada para tornar a recomendacao aceitavel, e
     similaridade textual nao e usada: a comparacao e de identidade. */
  if (e.foco.identidade === null || e.foco.identidade === "") {
    return bloqueada("identidade_de_causa_ausente");
  }
  if (e.acao.causa_da_acao === "" ) return bloqueada("identidade_de_causa_ausente");
  if (e.acao.causa_da_acao !== e.foco.identidade) {
    return bloqueada("causa_raiz_divergente");
  }

  /* -- 4. D29. Sujeito pedido exige `order_id` REAL. ------------------- */
  if (e.escopo.tipo === "pedido") {
    if (!identidadeDePedidoLegitima(e.escopo.order_id)) {
      // Um id improvisado e pior que a ausencia: ele parece verificavel.
      return bloqueada(
        e.escopo.order_id.trim() === ""
          ? "identidade_de_pedido_ausente"
          : "identidade_de_pedido_improvisada",
      );
    }
  }
  // O id curto exibido pelo motor NUNCA promove o sujeito a pedido. Sem
  // downgrade silencioso tambem: o sujeito e o que o chamador declarou.
  if (e.escopo.tipo !== "pedido" && e.acao.id_curto_exibido !== null) {
    // A acao fala de um pedido, mas o sujeito declarado nao e pedido. Trocar o
    // sujeito para caber seria exatamente o que D29 proibe.
    return bloqueada("identidade_de_pedido_ausente");
  }

  /* -- 5. Evidencia. O Shadow recusa `input_event_ids` vazio. ---------- */
  if (e.evidencias === null || e.evidencias.evento_ids.length === 0) {
    return bloqueada("evidencia_insuficiente");
  }
  if (e.evidencias.vinculo_causa !== e.foco.identidade) {
    return bloqueada("evidencia_sem_vinculo_com_a_causa");
  }
  if (!mesmoSujeito(e.evidencias.vinculo_sujeito, e.escopo)) {
    return bloqueada("evidencia_sem_vinculo_com_o_sujeito");
  }

  /* -- 6. Procedencia. Estrutura, nunca a string humana do motor. ------ */
  if (e.procedencia === null) return bloqueada("procedencia_ausente");
  const p = e.procedencia;
  if (p.natureza === "indisponivel") return bloqueada("procedencia_incompativel");
  if (e.destino === "real") {
    // Fixture e demonstracao nao chegam ao caminho real. Nunca.
    if (p.natureza === "fixture" || p.natureza === "demonstracao") {
      return bloqueada("procedencia_incompativel");
    }
    if (p.source_mode !== "real") return bloqueada("procedencia_incompativel");
  }
  // Natureza `real` com `source_mode` que nao e real e contradicao declarada.
  if (p.natureza === "real" && p.source_mode !== "real") {
    return bloqueada("procedencia_incompativel");
  }
  if (p.projection_version.trim() === "") return bloqueada("procedencia_ausente");

  /* -- 7. Confianca. Nunca criada aqui, nunca reduzida para passar. ---- */
  if (e.confianca === null) return bloqueada("confianca_sem_evidencia");
  const confianca = exigirConfianca(e.confianca);
  if (confianca === null) return bloqueada("confianca_fora_de_faixa");

  /* -- 8. Validade. Explicita, auditavel, e NUNCA derivada de DEBOUNCE,
     COOLDOWN, MAXFOCUS ou STALE — semanticas diferentes (D62). --------- */
  if (e.validade === null) return bloqueada("validade_ausente");
  if (!Number.isFinite(e.validade.validade_s) || e.validade.validade_s <= 0) {
    return bloqueada("validade_ausente");
  }
  const agora = Date.parse(e.agora_iso);
  if (!Number.isFinite(agora)) return bloqueada("validade_ausente");
  const expira = agora + e.validade.validade_s * 1000;
  if (expira <= agora) return bloqueada("validade_expirada");

  /* -- 9. Retirada. Condicoes representadas, nunca executadas. --------- */
  if (e.retirada === null || e.retirada.quando.length === 0) {
    return bloqueada("retirada_ausente");
  }

  /* -- 10. Identidade da recomendacao: do chamador. `recomendar()` a
     geraria — e chama-lo seria runtime, que esta fora desta missao. ---- */
  if (e.recommendation_id.trim() === "" || e.policy_id.trim() === "") {
    return bloqueada("escopo_invalido");
  }

  const draft: Recomendacao = {
    recommendation_id: e.recommendation_id,
    policy_id: e.policy_id,
    policy_version: e.versao_saida,
    input_event_ids: [...e.evidencias.evento_ids],
    projection_version: p.projection_version,
    source_mode: p.source_mode,
    confidence: confianca,
    risk_level: e.risco,
    recommended_action: e.acao.acao,
    reason: e.acao.porque,
    indisponivel: [...e.indisponivel],
    // I8: literal. Nao existe caminho neste arquivo que produza `false`.
    requires_human: true,
    created_at: new Date(agora).toISOString(),
    expires_at: new Date(expira).toISOString(),
    status: "proposed",
  };

  return { tipo: "traduzida", draft, auditoria };
}

/* ------------------------------------------------------------------ *
 * Validador de fronteira — REEXPORTADO, nunca reimplementado            *
 * ------------------------------------------------------------------ *
 * R5-C tinha aqui uma copia das recusas de `recomendar()`. R5-D0 apagou a
 * copia: a validacao canonica agora mora em `shadow.ts` e o runtime a chama.
 * Este reexport existe para que o chamador da traducao nao precise conhecer
 * dois modulos — e para que nunca mais existam duas verdades sobre o que o
 * Shadow aceita. Mudar a regra la muda os dois lados no mesmo commit.
 */

export { validarDraftShadow, type MotivoRejeicaoShadow, type ResultadoValidacaoShadow };
