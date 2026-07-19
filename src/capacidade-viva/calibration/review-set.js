/* ============================================================================
 * Conjunto de validação humana — 40 casos anonimizados + itens pendentes.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * Seleciona ~40 episódios equilibrados a partir do replay.
 */
function buildReviewCases(replay, catalog, opts) {
  const episodes = ((replay && replay.episodes) || {}).episodes || [];
  const ticks = (replay && replay.ticks) || [];

  const byLevel = {
    controlavel: [],
    atencao: [],
    critico: [],
    excecao: []
  };

  // quiet ticks as controláveis
  for (const t of ticks) {
    if (!t.tick_class) continue;
    if (t.tick_class.tick_level === "quieto" || (t.tick_class.tick_level === "sinal" && !t.tick_class.has_attention)) {
      byLevel.controlavel.push({ kind: "tick", t });
    } else if (t.tick_class.tick_level === "atencao" && !t.tick_class.has_critical) {
      byLevel.atencao.push({ kind: "tick", t });
    } else if (t.tick_class.has_critical) {
      byLevel.excecao.push({ kind: "tick", t });
    } else if (t.shadow && t.shadow.isf_estado === "acima_capacidade") {
      byLevel.critico.push({ kind: "tick", t });
    }
  }

  // also use episodes
  for (const ep of episodes) {
    if (ep.level === "excecao_critica") byLevel.excecao.push({ kind: "episode", ep });
    else if (ep.level === "atencao") byLevel.atencao.push({ kind: "episode", ep });
  }

  function sample(arr, n) {
    if (!arr.length) return [];
    const step = Math.max(1, Math.floor(arr.length / n));
    const out = [];
    for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]);
    return out.slice(0, n);
  }

  const picked = {
    controlavel: sample(byLevel.controlavel, 10),
    atencao: sample(byLevel.atencao, 10),
    critico: sample(byLevel.critico.length ? byLevel.critico : byLevel.atencao, 10),
    excecao: sample(byLevel.excecao, 10)
  };

  const cases = [];
  let id = 1;
  for (const [bucket, list] of Object.entries(picked)) {
    for (const item of list) {
      const t = item.t || findTickNear(ticks, item.ep && item.ep.started_ms);
      const sh = (t && t.shadow) || {};
      cases.push(
        stamp({
          case_id: `CV-H-${String(id).padStart(3, "0")}`,
          bucket_esperado_motor: bucket,
          data: (t && t.local_date) || (sh.local_date) || null,
          horario_local: (t && t.local_iso) || sh.horario_local || null,
          duracao_min: item.ep ? item.ep.duration_min : null,
          pedidos_ativos: t ? t.active_orders : null,
          itens_complexidade: sh.sinais ? sh.sinais.complex_items : null,
          praca_provavel: sh.praca || (item.ep && item.ep.praca) || null,
          pedido_mais_antigo: "anonimizado",
          pedidos_prontos_aguardando: sh.sinais ? sh.sinais.ready : null,
          sinais_logisticos: summarizeLogistics(t),
          confianca: sh.confianca,
          classificacao_motor: sh.estado || (t && t.tick_class && t.tick_class.tick_level),
          intervencao_sugerida: sh.menor_intervencao,
          dados_ausentes: listMissing(t),
          pii: false,
          order_ids: "redacted",
          opcoes_validador: [
            "controlavel",
            "atencao",
            "critico",
            "nao_e_possivel_avaliar",
            "praca_correta",
            "praca_incorreta",
            "recomendacao_adequada",
            "recomendacao_inadequada",
            "observacao"
          ]
        })
      );
      id++;
    }
  }

  // pad to 40 if short
  while (cases.length < 40 && ticks.length) {
    const t = ticks[Math.floor((cases.length / 40) * ticks.length)];
    cases.push(
      stamp({
        case_id: `CV-H-${String(id).padStart(3, "0")}`,
        bucket_esperado_motor: "misto",
        data: t.local_date,
        horario_local: t.local_iso,
        pedidos_ativos: t.active_orders,
        classificacao_motor: t.shadow && t.shadow.estado,
        intervencao_sugerida: t.shadow && t.shadow.menor_intervencao,
        pii: false
      })
    );
    id++;
  }

  const pendingItems = ((catalog && catalog.items) || [])
    .filter((i) => i.pendente_validacao)
    .map((i) => ({
      nome: i.item,
      praca_sugerida: i.praca,
      complexidade_sugerida: i.complexidade_inicial,
      evidencia: i.motivo,
      confianca: i.confianca_classificacao,
      opcoes_correcao: ["confirmar", "corrigir_praca", "corrigir_complexidade", "marcar_indefinido"]
    }));

  return stamp({
    n_cases: cases.length,
    counts: {
      controlavel: cases.filter((c) => c.bucket_esperado_motor === "controlavel").length,
      atencao: cases.filter((c) => c.bucket_esperado_motor === "atencao").length,
      critico: cases.filter((c) => c.bucket_esperado_motor === "critico").length,
      excecao: cases.filter((c) => c.bucket_esperado_motor === "excecao").length
    },
    cases: cases.slice(0, 40),
    itens_pendentes: pendingItems
  });
}

function findTickNear(ticks, ms) {
  if (!ms || !ticks.length) return ticks[0];
  let best = ticks[0];
  let bestD = Infinity;
  for (const t of ticks) {
    const d = Math.abs((t.t_ms || 0) - ms);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function summarizeLogistics(t) {
  if (!t || !t.tick_class) return [];
  const out = [];
  for (const x of t.tick_class.critical_items || []) out.push(x.type);
  for (const x of t.tick_class.attention_items || []) out.push(x.type);
  return [...new Set(out)].slice(0, 8);
}

function listMissing(t) {
  const m = ["equipe_real_por_turno"];
  if (!t || !t.components) m.push("componentes_isf_detalhados");
  if (t && t.tick_class && t.tick_class.n_critical_orders === 0) m.push("nenhuma_excecao_critica_neste_tick");
  return m;
}

function toMarkdown(review) {
  const lines = [];
  lines.push("# Casos de validação humana — Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Instruções: para cada caso, marque a opção que melhor descreve a situação real da operação.");
  lines.push("Não há resposta “certa” automática — sua leitura calibra o motor.");
  lines.push("");
  lines.push("Opções: controlável · atenção · crítico · não é possível avaliar · praça correta/incorreta · recomendação adequada/inadequada · observação.");
  lines.push("");
  for (const c of review.cases || []) {
    lines.push(`## ${c.case_id}`);
    lines.push(`- Data: ${c.data || "—"}`);
    lines.push(`- Horário local: ${c.horario_local || "—"}`);
    lines.push(`- Duração (se episódio): ${c.duracao_min != null ? c.duracao_min + " min" : "—"}`);
    lines.push(`- Pedidos ativos: ${c.pedidos_ativos != null ? c.pedidos_ativos : "—"}`);
    lines.push(`- Itens com complexidade > simples (proxy): ${c.itens_complexidade != null ? c.itens_complexidade : "—"}`);
    lines.push(`- Praça provável: ${c.praca_provavel || "—"}`);
    lines.push(`- Pedidos prontos aguardando (proxy): ${c.pedidos_prontos_aguardando != null ? c.pedidos_prontos_aguardando : "—"}`);
    lines.push(`- Sinais logísticos: ${(c.sinais_logisticos || []).join(", ") || "—"}`);
    lines.push(`- Confiança do motor: ${c.confianca || "—"}`);
    lines.push(`- Classificação do motor: ${c.classificacao_motor || "—"}`);
    lines.push(`- Intervenção sugerida: ${c.intervencao_sugerida || "—"}`);
    lines.push(`- Dados ausentes: ${(c.dados_ausentes || []).join(", ") || "—"}`);
    lines.push(`- Sua avaliação: _______________`);
    lines.push("");
  }
  lines.push("# Itens pendentes de validação (cardápio)");
  lines.push("");
  for (const it of review.itens_pendentes || []) {
    lines.push(`## ${it.nome}`);
    lines.push(`- Praça sugerida: ${it.praca_sugerida || "—"}`);
    lines.push(`- Complexidade sugerida: ${it.complexidade_sugerida || "—"}`);
    lines.push(`- Evidência: ${it.evidencia || "—"}`);
    lines.push(`- Confiança: ${it.confianca || "—"}`);
    lines.push(`- Correção: confirmar / corrigir praça / corrigir complexidade / indefinido`);
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = { buildReviewCases, toMarkdown };
