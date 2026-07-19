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
  lines.push("Timezone de referência: **America/Sao_Paulo**.");
  lines.push("");
  lines.push("Instruções para César / equipe:");
  lines.push("1. Leia o caso (campos do motor) sem inventar dados ausentes.");
  lines.push("2. Preencha os campos **Sua avaliação** em cada caso.");
  lines.push("3. Não há resposta automática “certa” — sua leitura calibra o motor.");
  lines.push("4. Nenhum dado pessoal de cliente/entregador deve aparecer; se vir, marque e ignore.");
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
    lines.push(`- Duração do episódio (min): ${fmtNum(c.duracao_min)}`);
    lines.push(`- Praça provável: ${fmt(c.praca_provavel)}`);
    lines.push(`- Volume de pedidos (ativos no tick): ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Quantidade de itens (proxy complexidade > simples): ${fmtNum(c.itens_complexidade)}`);
    lines.push(`- Complexidade (proxy): ${fmt(c.complexidade || c.itens_complexidade)}`);
    lines.push(`- Pedido mais antigo: ${fmt(c.pedido_mais_antigo)}`);
    lines.push(`- Pedidos prontos aguardando: ${fmtNum(c.pedidos_prontos_aguardando)}`);
    lines.push(`- Sinal logístico: ${fmtList(c.sinais_logisticos)}`);
    lines.push(`- Confiança do motor: ${fmt(c.confianca)}`);
    lines.push(`- Classificação do motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Ação sugerida (sombra): ${fmt(c.intervencao_sugerida)}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push(`- Bucket de amostragem: ${fmt(c.bucket_esperado_motor)}`);
    lines.push("");
    lines.push("### Sua avaliação (preencher)");
    lines.push("- Estado real: [ ] controlável  [ ] atenção  [ ] crítico  [ ] impossível avaliar");
    lines.push("- Praça correta: [ ] sim  [ ] não  [ ] outra: _______________");
    lines.push("- Recomendação adequada: [ ] sim  [ ] parcialmente  [ ] não");
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

module.exports = { buildReviewCases, toMarkdown };
