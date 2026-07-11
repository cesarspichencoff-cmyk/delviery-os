/* ============================================================================
 * DeliveryOS · src/live · FRESHNESS E GATE DE STALENESS
 * ----------------------------------------------------------------------------
 * Gate INDEPENDENTE de atualidade, anterior a qualquer recomendação
 * (Addendum §4 — confComp NÃO cobre staleness; premissa contrária foi
 * retratada na Fase 1). Este módulo NÃO toca motor.js/decisao.js: ele decide
 * SE o cérebro pode ser consultado para ação e COMO apresentar o resultado.
 *
 * Estados por fonte: atualizada | atrasada | vencida | desconectada | desconhecida
 *   (Nota de vocabulário: o Addendum §4 chamava o primeiro estado de "atual";
 *    a autorização da Fase 2 do César fixou "atualizada" — divergência
 *    registrada no Contrato do Núcleo §12.)
 *
 * CONTRATO DE "ATRASADA" (fecha F3-03):
 *  - Preserva fatos observados (nada é apagado ou escondido).
 *  - Reduz a confiança temporal (confianca_temporal: "reduzida").
 *  - NÃO pode parecer plenamente atual (aparenta_atual: false).
 *  - Recomendações sensíveis a tempo: bloqueadas (padrão conservador) ou
 *    marcadas como não confiáveis — configurável (config.freshness.
 *    comportamentoAtrasada), porque o comportamento exato depende da Fase
 *    Sombra. Não eleva severidade artificialmente.
 *
 * Limiares: configuráveis, chutes declarados de desenvolvimento — os valores
 * definitivos dependem da Fase Sombra (nunca tratar como verdade).
 * ==========================================================================*/
"use strict";

const ESTADOS_FRESHNESS = Object.freeze([
  "atualizada", "atrasada", "vencida", "desconectada", "desconhecida"
]);

/**
 * Classifica a atualidade de UMA fonte.
 * @param {object} fonte  { ultimo_evento_em, desconectada_em, conectada }
 * @param {number} agoraMs relógio injetado (nunca Date.now() implícito)
 * @param {object} config  criarConfig().freshness
 */
function classificarFonte(fonte, agoraMs, config) {
  const f = fonte || {};
  if (f.desconectada_em && !f.reconectada_em) {
    return montar("desconectada", f, agoraMs, "fonte_declarou_desconexao");
  }
  if (!f.ultimo_evento_em) {
    return montar("desconhecida", f, agoraMs, "sem_evidencia_suficiente");
  }
  const ultimoMs = Date.parse(f.ultimo_evento_em);
  if (Number.isNaN(ultimoMs)) {
    return montar("desconhecida", f, agoraMs, "carimbo_ilegivel");
  }
  // F2-03: carimbo no FUTURO além da tolerância de relógio não pode manter a
  // fonte artificialmente fresca — vira "desconhecida" com motivo explícito.
  const tolerancia = Number.isFinite(config.clockSkewToleranceMs) ? config.clockSkewToleranceMs : 0;
  if (ultimoMs - agoraMs > tolerancia) {
    return montar("desconhecida", f, agoraMs, "relogio_inconsistente_carimbo_no_futuro");
  }
  const idade = Math.max(0, agoraMs - ultimoMs);
  if (idade >= config.vencidaAposMs) return montar("vencida", f, agoraMs, "idade_acima_do_limite_de_vencimento");
  if (idade >= config.atrasadaAposMs) return montar("atrasada", f, agoraMs, "idade_acima_do_intervalo_esperado");
  return montar("atualizada", f, agoraMs, "dentro_do_intervalo_esperado");
}

function montar(estado, f, agoraMs, motivo) {
  const ultimoMs = f.ultimo_evento_em ? Date.parse(f.ultimo_evento_em) : NaN;
  return {
    freshness_state: estado,
    // Math.max garante: freshness_age_ms NUNCA é negativo (F2-03)
    freshness_age_ms: Number.isNaN(ultimoMs) ? null : Math.max(0, agoraMs - ultimoMs),
    last_trusted_at: f.last_trusted_at || null,
    freshness_reason: motivo,
    // contrato F3-03: como o estado se comporta perante o resto do sistema
    aparenta_atual: estado === "atualizada",
    confianca_temporal: estado === "atualizada" ? "plena"
      : estado === "atrasada" ? "reduzida"
      : "nenhuma",
    pode_participar_do_snapshot: true // fatos observados nunca somem; a idade fica explícita
  };
}

/**
 * Gate de staleness (matriz do Addendum §4) — avaliado ANTES de qualquer
 * recomendação. Nunca chama o cérebro; só diz se ele PODERIA ser consultado.
 * @param {object} porFonte { status: <classificarFonte>, composicao: <classificarFonte> }
 * @param {object} config   criarConfig().freshness
 */
function avaliarGateStaleness(porFonte, config) {
  const st = (porFonte.status && porFonte.status.freshness_state) || "desconhecida";
  const co = (porFonte.composicao && porFonte.composicao.freshness_state) || "desconhecida";

  const morta = (e) => e === "vencida" || e === "desconectada" || e === "desconhecida";
  const atrasada = (e) => e === "atrasada";

  // vencida × vencida (ou pior): nenhuma recomendação nova.
  if (morta(st) && morta(co)) {
    return decisao(false, false, false, "fontes_vencidas_ou_desconectadas",
      "preservar ultimo snapshot confiavel com horario explicito");
  }
  // status morto: não criar recomendação baseada em tempo/atraso.
  if (morta(st)) {
    return decisao(false, false, !morta(co), "fonte_de_status_vencida_ou_desconectada",
      "composicao segue como dado observado, claramente parcial; foco por tempo nao nasce");
  }
  // composição morta: pode acompanhar tempo, não decidir praça/embalagem.
  if (morta(co)) {
    return decisao(false, true, false, "fonte_de_composicao_vencida_ou_desconectada",
      "acompanhar estado e tempo; nenhuma decisao de praca/embalagem/composicao como atual");
  }
  // atrasada em qualquer fonte: contrato F3-03.
  if (atrasada(st) || atrasada(co)) {
    if (config.comportamentoAtrasada === "bloquear") {
      return decisao(false, true, true, "fonte_atrasada_comportamento_bloquear",
        "fatos preservados com idade explicita; recomendacoes sensiveis a tempo bloqueadas");
    }
    return {
      permitir_acao_dominante: true,
      acao_dominante_confiavel: false, // marca de não confiável obrigatória
      permitir_acompanhar_tempo: true,
      permitir_decisao_composicao: true,
      motivo: "fonte_atrasada_comportamento_marcar",
      apresentacao: "recomendacao permitida somente com marca de nao confiavel e idade explicita"
    };
  }
  // atualizada × atualizada: operação normal.
  return {
    permitir_acao_dominante: true,
    acao_dominante_confiavel: true,
    permitir_acompanhar_tempo: true,
    permitir_decisao_composicao: true,
    motivo: "fontes_atualizadas",
    apresentacao: "operacao normal"
  };
}

function decisao(acao, tempo, composicao, motivo, apresentacao) {
  return {
    permitir_acao_dominante: acao,
    acao_dominante_confiavel: acao,
    permitir_acompanhar_tempo: tempo,
    permitir_decisao_composicao: composicao,
    motivo,
    apresentacao
  };
}

module.exports = { ESTADOS_FRESHNESS, classificarFonte, avaliarGateStaleness };
