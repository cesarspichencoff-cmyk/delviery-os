/* ============================================================================
 * Conjunto de validação humana — 40 casos anonimizados + itens pendentes.
 * Freeze 2D.3: confiança explícita, duração honesta, formulário César.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * Seleciona ~40 episódios/ticks equilibrados a partir do replay.
 */
function buildReviewCases(replay, catalog, opts) {
  const o = opts || {};
  const episodes = ((replay && replay.episodes) || {}).episodes || [];
  const ticks = (replay && replay.ticks) || [];

  const byLevel = {
    controlavel: [],
    atencao: [],
    critico: [],
    excecao: []
  };

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
      cases.push(caseFromItem(item, ticks, bucket, id));
      id++;
    }
  }

  while (cases.length < 40 && ticks.length) {
    const t = ticks[Math.floor((cases.length / 40) * ticks.length)];
    cases.push(
      caseFromItem({ kind: "tick", t }, ticks, "misto", id)
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
    freeze_version: o.freeze_version || "2D.3",
    frozen_at: new Date().toISOString(),
    n_cases: Math.min(40, cases.length),
    counts: {
      controlavel: cases.filter((c) => c.bucket_esperado_motor === "controlavel").length,
      atencao: cases.filter((c) => c.bucket_esperado_motor === "atencao").length,
      critico: cases.filter((c) => c.bucket_esperado_motor === "critico").length,
      excecao: cases.filter((c) => c.bucket_esperado_motor === "excecao").length
    },
    cases: cases.slice(0, 40),
    itens_pendentes: pendingItems,
    human_note:
      "Motor classificou em sombra. Quando dados forem insuficientes, use 'impossível avaliar'."
  });
}

function caseFromItem(item, ticks, bucket, id) {
  const t = item.t || findTickNear(ticks, item.ep && item.ep.started_ms);
  const sh = (t && t.shadow) || {};
  const ep = item.ep || null;
  const evidence = extractEvidence(t, ep);
  const humanSafe = canHumanConfirm(t, ep, evidence);

  const single =
    ep && (ep.single_tick || ep.observed_ticks === 1 || ep.tick_count === 1);
  const duration_label = ep
    ? ep.duration_label ||
      (single ? "observado em uma leitura" : ep.observed_span_min != null ? `duração mensurável · ${ep.observed_span_min} min` : "—")
    : "tick isolado (não episódio)";

  return stamp({
    case_id: `CV-H-${String(id).padStart(3, "0")}`,
    bucket_esperado_motor: bucket,
    data: (t && t.local_date) || null,
    horario_local: (t && t.local_iso) || null,
    timezone: "America/Sao_Paulo",
    episodio: ep
      ? {
          episode_id: ep.episode_id,
          type: ep.type,
          level: ep.level,
          operational_day: ep.operational_day_start || null
        }
      : null,
    uma_leitura_ou_mensuravel: single ? "uma_leitura" : ep ? "duracao_mensuravel" : "tick",
    duration_label,
    observed_span_min: ep ? ep.observed_span_min : null,
    observed_ticks: ep ? ep.observed_ticks || ep.tick_count : 1,
    sampling_interval_min: ep ? ep.sampling_interval_min : null,
    duracao_min: ep && !single ? ep.observed_span_min : null,
    pedidos_ativos: t ? t.active_orders : null,
    itens_complexidade: sh.sinais ? sh.sinais.complex_items : null,
    praca_provavel: sh.praca || (ep && ep.praca) || null,
    pedido_mais_antigo: "anonimizado",
    pedidos_prontos_aguardando: sh.sinais ? sh.sinais.ready : null,
    sinais_logisticos: summarizeLogistics(t),
    evidencia_explicita_ou_inferida: evidence.kind,
    epistemic: evidence.epistemic,
    confianca: sh.confianca || (ep && ep.confidence) || null,
    classificacao_motor: sh.estado || (t && t.tick_class && t.tick_class.tick_level),
    intervencao_sugerida: sh.menor_intervencao,
    dados_ausentes: listMissing(t),
    human_confirmation_safe: humanSafe.safe,
    human_confirmation_note: humanSafe.note,
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
  });
}

function extractEvidence(t, ep) {
  if (ep && ep.evidence_kind) {
    return { kind: ep.evidence_kind, epistemic: ep.epistemic || ep.evidence_kind };
  }
  const items = [];
  if (t && t.tick_class) {
    for (const x of t.tick_class.critical_items || []) items.push(x);
    for (const x of t.tick_class.attention_items || []) items.push(x);
  }
  if (!items.length) return { kind: "ausente", epistemic: "ausente" };
  const x = items[0];
  if (x.confirmed || x.epistemic === "confirmado") return { kind: "confirmado", epistemic: "confirmado" };
  if (x.epistemic === "inferido_alta_confianca") return { kind: "inferido_alta", epistemic: x.epistemic };
  if (x.epistemic === "inferido_baixa_confianca") return { kind: "inferido_baixa", epistemic: x.epistemic };
  return { kind: "inferido", epistemic: x.epistemic || "inferido" };
}

function canHumanConfirm(t, ep, evidence) {
  if (!t && !ep) {
    return {
      safe: false,
      note: "Motor classificou, mas os dados não permitem confirmação humana segura."
    };
  }
  if (evidence.kind === "inferido_baixa" || evidence.kind === "ausente") {
    return {
      safe: false,
      note: "Motor classificou, mas os dados não permitem confirmação humana segura."
    };
  }
  if (t && t.shadow && t.shadow.confianca === "baixa") {
    return {
      safe: false,
      note: "Motor classificou, mas os dados não permitem confirmação humana segura."
    };
  }
  return { safe: true, note: null };
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

/**
 * Preserva classificações de um pack anterior e só enriquece apresentação.
 * Usado no freeze quando não se quer reamostrar.
 */
function enrichExistingCases(review, replay) {
  const ticks = (replay && replay.ticks) || [];
  const episodes = ((replay && replay.episodes) || {}).episodes || [];
  const byId = new Map(episodes.map((e) => [e.episode_id, e]));
  const cases = (review.cases || []).map((c) => {
    const t = findTickNear(ticks, c.horario_local ? Date.parse(c.horario_local) : null);
    const ep =
      (c.episodio && c.episodio.episode_id && byId.get(c.episodio.episode_id)) ||
      null;
    // re-build presentation fields without changing case_id / bucket / classificacao if set
    const base = caseFromItem(ep ? { kind: "episode", ep } : { kind: "tick", t: t || { tick_class: {}, shadow: {} } }, ticks, c.bucket_esperado_motor, Number(String(c.case_id).replace(/\D/g, "")) || 1);
    return Object.assign({}, base, {
      case_id: c.case_id,
      bucket_esperado_motor: c.bucket_esperado_motor,
      // preserve motor labels if present
      classificacao_motor: c.classificacao_motor || base.classificacao_motor,
      intervencao_sugerida: c.intervencao_sugerida || base.intervencao_sugerida,
      confianca: c.confianca || base.confianca,
      data: c.data || base.data,
      horario_local: c.horario_local || base.horario_local,
      pedidos_ativos: c.pedidos_ativos != null ? c.pedidos_ativos : base.pedidos_ativos,
      praca_provavel: c.praca_provavel || base.praca_provavel,
      sinais_logisticos: c.sinais_logisticos || base.sinais_logisticos,
      dados_ausentes: c.dados_ausentes || base.dados_ausentes,
      pii: false,
      order_ids: "redacted"
    });
  });
  return stamp({
    freeze_version: "2D.3",
    frozen_at: new Date().toISOString(),
    n_cases: cases.length,
    counts: review.counts,
    cases,
    itens_pendentes: review.itens_pendentes || [],
    cases_regenerated: false,
    enrichment: "presentation_only"
  });
}

function toMarkdown(review) {
  const lines = [];
  lines.push("# Casos de validação humana — Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push(`Freeze: **${review.freeze_version || "2D.3"}** · ${review.frozen_at || ""}`);
  lines.push("");
  lines.push("Timezone de referência: **America/Sao_Paulo**.");
  lines.push("");
  lines.push("Instruções para César / equipe:");
  lines.push("1. Leia o caso (campos do motor) sem inventar dados ausentes.");
  lines.push("2. Se o motor classificou mas os dados não permitem confirmação segura, marque **impossível avaliar**.");
  lines.push("3. Duração: **uma leitura** ≠ **0 min**. Só use minutos quando houver duração mensurável (≥2 ticks).");
  lines.push("4. Confiança: confirme se a evidência é **confirmada**, **inferida alta** ou **inferida baixa**.");
  lines.push("5. Nenhum dado pessoal de cliente/entregador deve aparecer.");
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const c of review.cases || []) {
    lines.push(`## ${c.case_id}`);
    lines.push("");
    lines.push("### Contexto (motor — somente leitura)");
    lines.push(`- Número do caso: ${c.case_id}`);
    lines.push(`- Data: ${fmt(c.data)}`);
    lines.push(`- Horário local (America/Sao_Paulo): ${fmt(c.horario_local)}`);
    lines.push(`- Episódio: ${c.episodio ? `${c.episodio.episode_id} · ${c.episodio.type || "—"} · ${c.episodio.level || "—"}` : "— (tick)"}`);
    lines.push(`- Uma leitura ou duração mensurável: ${fmt(c.uma_leitura_ou_mensuravel)}`);
    lines.push(`- Duração (label): ${fmt(c.duration_label)}`);
    lines.push(`- Span observado (min, técnico): ${fmtNum(c.observed_span_min)}`);
    lines.push(`- Ticks observados: ${fmtNum(c.observed_ticks)}`);
    lines.push(`- Praça: ${fmt(c.praca_provavel)}`);
    lines.push(`- Volume de pedidos: ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Itens (proxy complexidade > simples): ${fmtNum(c.itens_complexidade)}`);
    lines.push(`- Pedido mais antigo: ${fmt(c.pedido_mais_antigo)}`);
    lines.push(`- Pedidos prontos aguardando: ${fmtNum(c.pedidos_prontos_aguardando)}`);
    lines.push(`- Sinais logísticos: ${fmtList(c.sinais_logisticos)}`);
    lines.push(`- Evidência: ${fmt(c.evidencia_explicita_ou_inferida)} (${fmt(c.epistemic)})`);
    lines.push(`- Confiança do motor: ${fmt(c.confianca)}`);
    lines.push(`- Classificação do motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Intervenção sugerida (sombra): ${fmt(c.intervencao_sugerida)}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push(`- Bucket de amostragem: ${fmt(c.bucket_esperado_motor)}`);
    if (c.human_confirmation_safe === false) {
      lines.push(`- ⚠ ${c.human_confirmation_note || "Motor classificou, mas os dados não permitem confirmação humana segura."}`);
    }
    lines.push("");
    lines.push("### Sua avaliação (preencher)");
    lines.push("- Estado real: [ ] controlável  [ ] atenção  [ ] crítico  [ ] impossível avaliar");
    lines.push("- Praça correta: [ ] sim  [ ] não  [ ] outra: _______________");
    lines.push("- Recomendação adequada: [ ] sim  [ ] parcialmente  [ ] não");
    lines.push("- Evidência (na sua visão): [ ] confirmada  [ ] inferida  [ ] insuficiente");
    lines.push("- O que você faria: _______________________________________________");
    lines.push("- Observação: ___________________________________________________");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("# Itens pendentes de validação (cardápio)");
  lines.push("");
  lines.push("Classificação automática com confiança baixa — confirmar ou corrigir.");
  lines.push("");
  const pending = review.itens_pendentes || [];
  lines.push(`Total: **${pending.length}** itens.`);
  lines.push("");
  pending.forEach((it, i) => {
    lines.push(`## Item ${i + 1}: ${it.nome}`);
    lines.push(`- Nome: ${fmt(it.nome)}`);
    lines.push(`- Praça sugerida: ${fmt(it.praca_sugerida)}`);
    lines.push(`- Complexidade sugerida: ${fmt(it.complexidade_sugerida)}`);
    lines.push(`- Evidências: ${fmt(it.evidencia)}`);
    lines.push(`- Confiança: ${fmt(it.confianca)}`);
    lines.push("");
    lines.push("### Correção (preencher)");
    lines.push("- [ ] confirmar");
    lines.push("- [ ] corrigir praça → _______________");
    lines.push("- [ ] corrigir complexidade → _______________");
    lines.push("- [ ] marcar indefinido");
    lines.push("- Observação: ___________________________________________________");
    lines.push("");
  });
  return lines.join("\n");
}

function fmt(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function fmtNum(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && !Number.isFinite(v)) return "—";
  return String(v);
}

function fmtList(v) {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

/** Auditoria estática das regras logísticas (não altera taxonomia). */
function logisticConfidenceAudit() {
  return {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    types: {
      motoboy_na_loja: {
        opens_attention: false,
        opens_critical: true,
        requires: "courier_wait_store_min ≥ limiar + evidência de espera na loja",
        explicit_data: "campo TEMPO DO ENTREGADOR ESPERANDO NA LOJA (MIN)",
        inference: "inferido_alta quando campo existe; NÃO abrir com só ausência de saída",
        weak_alone: false
      },
      entregador_alocado_sem_retirada: {
        opens_attention: true,
        opens_critical: true,
        requires: "alocado + pronto + readyWait ≥ limiar",
        explicit_data: "tempo de alocação / flags",
        inference: "inferido_baixa → só atenção (não exceção sozinha)",
        weak_alone: "não abre exceção se epistemic=inferido_baixa"
      },
      pronto_sem_saida_excessivo: {
        opens_attention: false,
        opens_critical: true,
        requires: "pronto sem saída e readyWait ≥ 2× limiar",
        explicit_data: "timestamps pronto/saída",
        inference: "inferido_baixa — motivo desconhecido",
        weak_alone: "não rotular como motoboy"
      },
      aguardando_saida_causa_nao_confirmada: {
        opens_attention: true,
        opens_critical: false,
        requires: "pronto sem saída e readyWait ≥ limiar sem evidência de motoboy",
        explicit_data: "timestamps",
        inference: "inferido_baixa",
        weak_alone: "permanece causa não confirmada"
      }
    },
    note: "Auditoria documental — classificação do motor 2D.1/2D.2 preservada; apenas exibição de confiança no pack humano."
  };
}

module.exports = {
  buildReviewCases,
  enrichExistingCases,
  toMarkdown,
  logisticConfidenceAudit
};
