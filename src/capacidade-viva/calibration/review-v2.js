/* ============================================================================
 * Review pack v2 — validação humana operacional (A) + qualidade da fonte (B).
 * Não altera motor/ISF/config. CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { stamp } = require("./labels");
const { toSaoPaulo } = require("./timezone");

const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Fingerprint estável para unicidade (sem PII). */
function caseFingerprint(c) {
  const parts = [
    c.horario_local || c.timestamp_local || "",
    c.praca || "",
    String(c.pedidos_ativos != null ? c.pedidos_ativos : ""),
    String(c.itens_totais != null ? c.itens_totais : ""),
    String(c.pedidos_prontos_aguardando != null ? c.pedidos_prontos_aguardando : ""),
    (c.sinais_logisticos || []).slice().sort().join(","),
    c.classificacao_motor || "",
    c.episodio_id_anon || c.order_token || ""
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function anonToken(id) {
  if (!id) return null;
  return "ord_" + crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 10);
}

/**
 * Avalia se um candidato tem contexto mínimo para julgamento operacional.
 */
function hasMinimumOperationalContext(c) {
  if (!c) return false;
  if (c.pedidos_ativos == null || c.pedidos_ativos <= 0) return false;
  if (!c.praca && !(c.sinais_logisticos && c.sinais_logisticos.length)) return false;
  if (c.fonte_saude === "ausente" || c.fonte_saude === "sem_cobertura") return false;
  if (c.confianca === "baixa" && (!c.sinais_logisticos || !c.sinais_logisticos.length) && c.pedidos_ativos < 3)
    return false;
  // classificação quieta com zero evidência → qualidade da fonte
  if (
    (c.classificacao_motor === "quieto" || c.classificacao_motor === "insufficient") &&
    c.pedidos_ativos === 0
  )
    return false;
  return true;
}

/**
 * Pressão baixa o suficiente para amostrar como controlável operacional.
 * Motor raramente emite quieto com volume — pode ser limítrofe se motor=atencao.
 */
function isLowPressureOperational(c) {
  if (!hasMinimumOperationalContext(c)) return false;
  if ((c.pedidos_ativos || 0) < 1) return false;
  if (c.tem_excecao_critica || c.classificacao_motor === "excecao_critica") return false;
  if (c.fonte_saude === "ausente" || c.fonte_saude === "sem_cobertura") return false;
  if ((c.sinais_logisticos || []).some((s) =>
    /motoboy_na_loja|pronto_sem_saida_excessivo|entregador_alocado_sem_retirada/.test(s)
  ))
    return false;
  if ((c.pedidos_atrasados || 0) > 2) return false;
  if ((c.pedidos_prontos_aguardando || 0) > 4) return false;
  if (c.isf_estado === "acima_capacidade") return false;
  return true;
}

/**
 * Controlável operacional: leitura real, sem exceção crítica, baixa pressão.
 * - Ideal: motor quieto|sinal
 * - Limítrofe: motor atencao com baixa pressão (rótulo obrigatório)
 */
function isOperationalControlavel(c) {
  if (!isLowPressureOperational(c)) return false;
  const cl = c.classificacao_motor;
  if (cl === "quieto" || cl === "sinal" || cl === "controlavel") return true;
  // atencao só se pressão realmente baixa (volume moderado)
  if (cl === "atencao" && (c.pedidos_ativos || 0) <= 18 && (c.pedidos_atrasados || 0) <= 1)
    return true;
  return false;
}

function isControlavelLimitrofe(c) {
  return (
    isOperationalControlavel(c) &&
    c.classificacao_motor === "atencao"
  );
}

function isAtencao(c) {
  if (!hasMinimumOperationalContext(c)) return false;
  if (c.tem_excecao_critica || c.classificacao_motor === "excecao_critica") return false;
  return c.classificacao_motor === "atencao" || (c.sinais_logisticos || []).some((s) =>
    /atrasado|prontos_acumulando|aguardando_saida|proximo/.test(s)
  );
}

function isCriticoOperacional(c) {
  if (!hasMinimumOperationalContext(c)) return false;
  if (c.classificacao_motor === "excecao_critica") return false; // exceções vão ao bucket excecao
  // pressão alta: isf acima, muitos atrasados, volume alto + atenção
  const pressure =
    c.isf_estado === "acima_capacidade" ||
    c.isf_estado === "proximo_limite" ||
    (c.pedidos_ativos || 0) >= 40 ||
    (c.pedidos_atrasados || 0) >= 5 ||
    (c.pedidos_prontos_aguardando || 0) >= 8;
  return (
    pressure &&
    (c.classificacao_motor === "atencao" || c.classificacao_motor === "sinal" || c.isf_estado === "acima_capacidade")
  );
}

function isExcecao(c) {
  if (!hasMinimumOperationalContext(c)) return false;
  return c.tem_excecao_critica || c.classificacao_motor === "excecao_critica";
}

function isSourceQuality(c) {
  if (!c) return true;
  if (c.pedidos_ativos == null || c.pedidos_ativos === 0) return true;
  if (c.fonte_saude === "ausente" || c.fonte_saude === "sem_cobertura" || c.fonte_saude === "parcial")
    return true;
  if (c.confianca === "baixa" && !(c.sinais_logisticos && c.sinais_logisticos.length) && !c.praca)
    return true;
  if (c.classificacao_motor === "insufficient") return true;
  if (c.evidencia_kind === "ausente" && c.pedidos_ativos === 0) return true;
  if (!hasMinimumOperationalContext(c) && c.pedidos_ativos === 0) return true;
  return false;
}

/**
 * Converte tick de replay (enriquecido) em candidato de caso.
 */
function candidateFromEnrichedTick(tick, opts) {
  const o = opts || {};
  const teamProfile = o.team_profile || "estrutura_media";
  const sp = tick.local_iso
    ? { local_iso: tick.local_iso, local_date: tick.local_date, local_hour: tick.local_hour, local_dow: tick.local_dow }
    : toSaoPaulo(tick.t_ms);
  const sh = tick.shadow || {};
  const tc = tick.tick_class || {};
  const ctx = tick.context || {};
  const sinais = [];
  for (const x of tc.critical_items || []) if (x.type) sinais.push(x.type);
  for (const x of tc.attention_items || []) if (x.type) sinais.push(x.type);
  const uniqueSinais = [...new Set(sinais)];

  const orderToken = anonToken(
    (tc.critical_items && tc.critical_items[0] && tc.critical_items[0].order_id) ||
      (tc.attention_items && tc.attention_items[0] && tc.attention_items[0].order_id) ||
      null
  );

  const primaryContribution = derivePrimaryContribution(tc, sh, ctx);

  const c = {
    horario_local: sp.local_iso || tick.local_iso,
    data: sp.local_date || tick.local_date,
    dia_semana: DOW_PT[sp.local_dow != null ? sp.local_dow : tick.local_dow] || null,
    hora_local: sp.local_hour != null ? sp.local_hour : tick.local_hour,
    praca: sh.praca || tick.praca_critica || null,
    pedidos_ativos: tick.active_orders != null ? tick.active_orders : (sh.sinais && sh.sinais.ativos) || 0,
    itens_totais: ctx.itens_totais != null ? ctx.itens_totais : null,
    itens_simples: ctx.itens_simples != null ? ctx.itens_simples : null,
    itens_moderados: ctx.itens_moderados != null ? ctx.itens_moderados : null,
    itens_complexos: ctx.itens_complexos != null ? ctx.itens_complexos : null,
    itens_muito_complexos: ctx.itens_muito_complexos != null ? ctx.itens_muito_complexos : null,
    pedido_mais_antigo_min: ctx.pedido_mais_antigo_min != null ? ctx.pedido_mais_antigo_min : null,
    pedidos_proximos_atraso: ctx.pedidos_proximos_atraso != null ? ctx.pedidos_proximos_atraso : null,
    pedidos_atrasados: ctx.pedidos_atrasados != null ? ctx.pedidos_atrasados : null,
    pedidos_prontos_aguardando: (sh.sinais && sh.sinais.ready) != null ? sh.sinais.ready : ctx.ready || 0,
    maior_tempo_pronto_aguardando_min:
      ctx.maior_tempo_pronto_aguardando_min != null ? ctx.maior_tempo_pronto_aguardando_min : null,
    sinais_logisticos: uniqueSinais,
    ritmo_ultimos_15_min: ctx.ritmo_ultimos_15_min != null ? ctx.ritmo_ultimos_15_min : null,
    perfil_equipe: teamProfile,
    capacidade_hipotetica: true,
    capacidade_hipotetica_nota: "CAPACIDADE HIPOTÉTICA — perfil de equipe simulado, não escala real",
    fonte_saude: deriveFonteSaude(tick, ctx),
    confianca: sh.confianca || "media",
    classificacao_motor: sh.estado || tc.tick_level || null,
    isf_estado: sh.isf_estado || null,
    contribuicao_principal: primaryContribution,
    intervencao_sugerida: sh.menor_intervencao || "observar",
    tem_excecao_critica: !!(tc.has_critical || sh.excecao_critica),
    evidencia_kind: deriveEvidenceKind(tc),
    episodio_id_anon: orderToken,
    order_token: orderToken,
    dados_ausentes: listMissing(tick, ctx),
    t_ms: tick.t_ms,
    pii: false
  };
  c.fingerprint = caseFingerprint(c);
  return c;
}

/**
 * Candidato a partir de episódio serializado (fallback parcial).
 */
function candidateFromEpisode(ep, opts) {
  const o = opts || {};
  const sp = toSaoPaulo(ep.started_ms || ep.started_at);
  const c = {
    horario_local: ep.started_at || sp.local_iso,
    data: sp.local_date,
    dia_semana: DOW_PT[sp.local_dow] || null,
    hora_local: sp.local_hour,
    praca: ep.praca || null,
    pedidos_ativos: ep.peak_active_orders || 0,
    itens_totais: null,
    itens_simples: null,
    itens_moderados: null,
    itens_complexos: null,
    itens_muito_complexos: null,
    pedido_mais_antigo_min: null,
    pedidos_proximos_atraso: null,
    pedidos_atrasados: ep.type && /atrasado/.test(ep.type) ? 1 : null,
    pedidos_prontos_aguardando: /pronto|aguardando|motoboy|alocado/.test(ep.type || "") ? 1 : null,
    maior_tempo_pronto_aguardando_min: null,
    sinais_logisticos: ep.type ? [ep.type] : [],
    ritmo_ultimos_15_min: null,
    perfil_equipe: o.team_profile || "estrutura_media",
    capacidade_hipotetica: true,
    capacidade_hipotetica_nota: "CAPACIDADE HIPOTÉTICA — perfil de equipe simulado, não escala real",
    fonte_saude: ep.peak_active_orders > 0 ? "parcial" : "sem_cobertura",
    confianca: ep.confidence || "media",
    classificacao_motor: ep.level === "excecao_critica" ? "excecao_critica" : ep.level || "atencao",
    isf_estado: null,
    contribuicao_principal: ep.type || "episodio",
    intervencao_sugerida: "observar",
    tem_excecao_critica: ep.level === "excecao_critica",
    evidencia_kind: ep.evidence_kind || ep.epistemic || "inferido",
    episodio_id_anon: ep.episode_id || anonToken(ep.order_id),
    order_token: anonToken(ep.order_id),
    dados_ausentes: [
      "distribuicao_complexidade",
      "ritmo_15min",
      "maior_tempo_pronto",
      "equipe_real_por_turno"
    ],
    t_ms: ep.started_ms,
    pii: false,
    from_episode_only: true
  };
  c.fingerprint = caseFingerprint(c);
  return c;
}

function deriveFonteSaude(tick, ctx) {
  if (!tick) return "ausente";
  if ((tick.active_orders || 0) === 0) return "sem_cobertura";
  if (ctx && ctx.orders_without_items > 0 && ctx.orders_without_items === tick.active_orders)
    return "parcial";
  if (tick.shadow && tick.shadow.confianca === "baixa") return "parcial";
  return "saudavel_ou_conhecida";
}

function deriveEvidenceKind(tc) {
  const items = [...(tc.critical_items || []), ...(tc.attention_items || [])];
  if (!items.length) return "ausente";
  if (items.some((x) => x.confirmed || x.epistemic === "confirmado")) return "confirmado";
  if (items.some((x) => x.epistemic === "inferido_alta_confianca")) return "inferido_alta";
  if (items.some((x) => x.epistemic === "inferido_baixa_confianca")) return "inferido_baixa";
  return "inferido";
}

function derivePrimaryContribution(tc, sh, ctx) {
  if (tc.has_critical && tc.critical_items && tc.critical_items[0])
    return `exceção: ${tc.critical_items[0].type}`;
  if (tc.has_attention && tc.attention_items && tc.attention_items[0])
    return `atenção: ${tc.attention_items[0].type}`;
  if (sh.isf_estado === "acima_capacidade") return "ISF acima da capacidade (hipotética)";
  if (ctx && ctx.pedido_mais_antigo_min >= 50) return "envelhecimento de pedidos";
  if (sh.sinais && sh.sinais.ready >= 4) return "prontos aguardando saída";
  if (sh.sinais && sh.sinais.ativos > 0) return "carga/volume de pedidos ativos";
  return "sem sinal dominante";
}

function listMissing(tick, ctx) {
  const m = ["equipe_real_por_turno"];
  if (!tick || !tick.components) m.push("componentes_isf_detalhados");
  if (!ctx || ctx.itens_totais == null) m.push("contagem_itens_completa");
  if (!ctx || ctx.pedido_mais_antigo_min == null) m.push("idade_pedido_mais_antigo");
  if (!ctx || ctx.ritmo_ultimos_15_min == null) m.push("ritmo_15min");
  return m;
}

/**
 * Seleciona 40 casos únicos balanceados + pack B de qualidade.
 */
function buildPacks(candidates, opts) {
  const o = opts || {};
  const perBucket = o.per_bucket || 10;
  const usedFp = new Set();
  const packs = {
    controlavel: [],
    atencao: [],
    critico: [],
    excecao: []
  };
  const quality = [];
  const rejected_empty_as_controlavel = [];

  // Prioriza: controláveis primeiro (baixa pressão), depois exceção, crítico, atenção
  // Dentro de cada grupo, espalha no tempo
  const sorted = candidates.slice().sort((a, b) => (a.t_ms || 0) - (b.t_ms || 0));

  function tryAdd(c, bucket, limítrofe) {
    if (packs[bucket].length >= perBucket) return false;
    if (usedFp.has(c.fingerprint)) return false;
    const soft = `${c.horario_local}|${c.praca}|${c.pedidos_ativos}|${c.classificacao_motor}|${(c.sinais_logisticos || []).join(",")}`;
    if (usedFp.has("soft:" + soft)) return false;
    if (bucketContradicts(bucket, c, limítrofe)) {
      if (bucket === "controlavel" && c.pedidos_ativos === 0) {
        quality.push(annotateQuality(c, "vazio_nao_e_controlavel"));
        rejected_empty_as_controlavel.push(c.fingerprint);
      }
      return false;
    }
    usedFp.add(c.fingerprint);
    usedFp.add("soft:" + soft);
    packs[bucket].push(finalizeCase(c, bucket, packs[bucket].length + 1, limítrofe));
    return true;
  }

  // Pass 1: controláveis (incl. limítrofes de baixa pressão)
  const controlPool = sorted
    .filter((c) => isOperationalControlavel(c))
    .sort((a, b) => (a.pedidos_ativos || 0) - (b.pedidos_ativos || 0) || (a.t_ms || 0) - (b.t_ms || 0));
  for (const raw of controlPool) {
    if (packs.controlavel.length >= perBucket) break;
    const c = Object.assign({}, raw);
    tryAdd(c, "controlavel", isControlavelLimitrofe(c));
  }

  // Pass 2: exceções
  for (const raw of sorted) {
    if (packs.excecao.length >= perBucket) break;
    const c = Object.assign({}, raw);
    if (isSourceQuality(c) && !hasMinimumOperationalContext(c)) continue;
    if (isExcecao(c)) tryAdd(c, "excecao", false);
  }

  // Pass 3: críticos (alta pressão, sem exceção)
  for (const raw of sorted) {
    if (packs.critico.length >= perBucket) break;
    const c = Object.assign({}, raw);
    if (isExcecao(c)) continue;
    if (isCriticoOperacional(c)) tryAdd(c, "critico", c.classificacao_motor === "atencao");
  }

  // Pass 4: atenção (não reutilizar já usados)
  for (const raw of sorted) {
    if (packs.atencao.length >= perBucket) break;
    const c = Object.assign({}, raw);
    if (isExcecao(c) || isCriticoOperacional(c)) continue;
    if (isAtencao(c)) tryAdd(c, "atencao", false);
  }

  // Qualidade da fonte
  for (const raw of sorted) {
    const c = Object.assign({}, raw);
    if (isSourceQuality(c) && !hasMinimumOperationalContext(c)) {
      quality.push(annotateQuality(c, "contexto_insuficiente_ou_fonte"));
      if (c.pedidos_ativos === 0 && (c.classificacao_motor === "quieto" || !c.classificacao_motor)) {
        rejected_empty_as_controlavel.push(c.fingerprint);
      }
    }
  }

  // fill remaining from leftovers with strict rules
  fillRemaining(packs, sorted, usedFp, perBucket);

  const operational = []
    .concat(packs.controlavel, packs.atencao, packs.critico, packs.excecao)
    .sort((a, b) => String(a.case_id).localeCompare(String(b.case_id)));

  // renumber sequential CV-O-001
  operational.forEach((c, i) => {
    c.case_id = `CV-O-${String(i + 1).padStart(3, "0")}`;
  });

  // quality pack sample (up to 30) unique
  const qUsed = new Set();
  const qualityOut = [];
  for (const q of quality) {
    if (qUsed.has(q.fingerprint)) continue;
    qUsed.add(q.fingerprint);
    q.case_id = `CV-Q-${String(qualityOut.length + 1).padStart(3, "0")}`;
    q.pack = "qualidade_fonte";
    qualityOut.push(q);
    if (qualityOut.length >= 30) break;
  }

  const fps = operational.map((c) => c.fingerprint);
  const unique = new Set(fps);

  return stamp({
    version: "2D.4",
    generated_at: new Date().toISOString(),
    pack_a: {
      name: "operacional",
      n: operational.length,
      counts: {
        controlavel: packs.controlavel.length,
        atencao: packs.atencao.length,
        critico: packs.critico.length,
        excecao: packs.excecao.length
      },
      cases: operational,
      fingerprints_unique: unique.size === operational.length,
      duplicates: operational.length - unique.size
    },
    pack_b: {
      name: "qualidade_fonte",
      n: qualityOut.length,
      cases: qualityOut,
      note: "Não entra no cálculo de concordância operacional"
    },
    stats: {
      rejected_empty_as_controlavel: rejected_empty_as_controlavel.length,
      bucket_contradictions_blocked: true
    }
  });
}

function fillRemaining(packs, sorted, usedFp, perBucket) {
  const need = () =>
    ["controlavel", "atencao", "critico", "excecao"].filter((b) => packs[b].length < perBucket);

  for (const bucket of need()) {
    for (const raw of sorted) {
      if (packs[bucket].length >= perBucket) break;
      const c = Object.assign({}, raw);
      if (usedFp.has(c.fingerprint)) continue;
      const soft = `${c.horario_local}|${c.praca}|${c.pedidos_ativos}|${c.classificacao_motor}|${(c.sinais_logisticos || []).join(",")}`;
      if (usedFp.has("soft:" + soft)) continue;
      if (!hasMinimumOperationalContext(c)) continue;

      let ok = false;
      let limítrofe = false;
      if (bucket === "controlavel") {
        ok = isOperationalControlavel(c);
        limítrofe = isControlavelLimitrofe(c);
      }
      if (bucket === "atencao") ok = isAtencao(c) && !isExcecao(c) && !isCriticoOperacional(c);
      if (bucket === "critico") {
        ok = isCriticoOperacional(c) || (isAtencao(c) && (c.pedidos_ativos || 0) >= 30);
        limítrofe = ok && c.classificacao_motor === "atencao";
      }
      if (bucket === "excecao") ok = isExcecao(c);
      if (!ok) continue;
      if (bucketContradicts(bucket, c, limítrofe)) continue;

      usedFp.add(c.fingerprint);
      usedFp.add("soft:" + soft);
      packs[bucket].push(finalizeCase(c, bucket, packs[bucket].length + 1, limítrofe));
    }
  }
}

function bucketContradicts(bucket, c, limítrofe) {
  if (bucket === "controlavel") {
    if (c.tem_excecao_critica || c.classificacao_motor === "excecao_critica") return true;
    if ((c.pedidos_ativos || 0) === 0) return true;
    if (c.fonte_saude === "ausente" || c.fonte_saude === "sem_cobertura") return true;
    // motor atencao só se limítrofe explícito (baixa pressão)
    if (c.classificacao_motor === "atencao" && !limítrofe && !isControlavelLimitrofe(c)) return true;
    if (c.classificacao_motor === "excecao_critica") return true;
  }
  if (bucket === "excecao") {
    if (!c.tem_excecao_critica && c.classificacao_motor !== "excecao_critica") return true;
  }
  if (bucket === "atencao") {
    if (c.classificacao_motor === "excecao_critica") return true;
    if (c.classificacao_motor === "quieto" && !(c.sinais_logisticos || []).length) return true;
  }
  if (bucket === "critico") {
    if (c.classificacao_motor === "quieto" && (c.pedidos_ativos || 0) < 10) return true;
    if (c.classificacao_motor === "excecao_critica") return true;
  }
  return false;
}

function finalizeCase(c, bucket, n, limítrofe) {
  return stamp({
    case_id: `TMP-${bucket}-${n}`,
    pack: "operacional",
    bucket_amostragem: bucket,
    caso_limitrofe: !!limítrofe,
    caso_limitrofe_nota: limítrofe
      ? bucket === "controlavel"
        ? "caso limítrofe para revisão — motor em atenção com baixa pressão; amostrado como controlável relativo (não é quieto/ausência de dados)"
        : "caso limítrofe para revisão — classificação motor não é exceção_critica; pressão operacional elevada"
      : null,
    fingerprint: c.fingerprint,
    data: c.data,
    horario_local: c.horario_local,
    dia_semana: c.dia_semana,
    timezone: "America/Sao_Paulo",
    praca: c.praca,
    pedidos_ativos: c.pedidos_ativos,
    itens_totais: c.itens_totais,
    complexidade: {
      simples: c.itens_simples,
      moderados: c.itens_moderados,
      complexos: c.itens_complexos,
      muito_complexos: c.itens_muito_complexos
    },
    pedido_mais_antigo_min: c.pedido_mais_antigo_min,
    pedidos_proximos_atraso: c.pedidos_proximos_atraso,
    pedidos_atrasados: c.pedidos_atrasados,
    pedidos_prontos_aguardando: c.pedidos_prontos_aguardando,
    maior_tempo_pronto_aguardando_min: c.maior_tempo_pronto_aguardando_min,
    sinais_logisticos: c.sinais_logisticos,
    ritmo_ultimos_15_min: c.ritmo_ultimos_15_min,
    perfil_equipe: c.perfil_equipe,
    capacidade_hipotetica: true,
    capacidade_hipotetica_nota: c.capacidade_hipotetica_nota,
    fonte_saude: c.fonte_saude,
    confianca: c.confianca,
    classificacao_motor: c.classificacao_motor,
    contribuicao_principal: c.contribuicao_principal,
    intervencao_sugerida: c.intervencao_sugerida,
    evidencia_kind: c.evidencia_kind,
    dados_ausentes: c.dados_ausentes,
    episodio_token: c.episodio_id_anon,
    order_token: c.order_token,
    pii: false,
    human_confirmation_safe: c.fonte_saude === "saudavel_ou_conhecida" && c.confianca !== "baixa",
    human_confirmation_note:
      c.fonte_saude !== "saudavel_ou_conhecida" || c.confianca === "baixa"
        ? "Motor classificou; confirme se a leitura da fonte é suficiente para julgar a operação."
        : null
  });
}

function annotateQuality(c, reason) {
  return stamp({
    fingerprint: c.fingerprint || caseFingerprint(c),
    reason,
    data: c.data,
    horario_local: c.horario_local,
    pedidos_ativos: c.pedidos_ativos,
    praca: c.praca,
    classificacao_motor: c.classificacao_motor,
    confianca: c.confianca,
    fonte_saude: c.fonte_saude || "ausente",
    sinais_logisticos: c.sinais_logisticos || [],
    dados_ausentes: c.dados_ausentes || [],
    note:
      reason === "vazio_nao_e_controlavel" || reason === "contexto_insuficiente_ou_fonte"
        ? "Ausência de leitura não é operação calma. Caso de qualidade da fonte — fora do ground truth operacional."
        : reason,
    pii: false
  });
}

/* ---------- Item type classification (pending catalog) ---------- */

function classifyPendingItemRecord(item) {
  const nome = (item.nome || item.item || "").trim();
  const lower = nome.toLowerCase();
  const praca = item.praca_sugerida || item.praca || null;
  const cx = item.complexidade_sugerida || item.complexidade_inicial || null;

  let tipo = "unknown";
  let motivo = "sem regra forte — permanece pendente";

  // metadata
  if (
    /n[uú]mero de pessoas|utens[ií]lio|talher|guardanapo|embalagem gen|sacola|taxa|gorjeta|obs\b|observ/i.test(
      lower
    )
  ) {
    tipo = "metadata";
    motivo = "metadado operacional / não é item de produção";
  } else if (/bon[eé]|camiseta|roupa|merchand|chaveiro|caneca|produto f[ií]sico/i.test(lower)) {
    tipo = "merchandise";
    motivo = "mercadoria / retail — fora da carga produtiva de cozinha";
  } else if (/promo|desconto|cupom|combo vip|club vip|frete gr[aá]tis/i.test(lower)) {
    tipo = "promotion";
    motivo = "promoção / benefício — não é produção";
  } else if (
    /baunilha|pistache|mel[aã]o|molho|creme|extra |adicional |sem |com |taste|tempero/i.test(lower) ||
    (praca === "conferencia" && /sabor|cobertura/.test(lower))
  ) {
    // modifiers / flavors often pendentes
    if (/^baunilha$|^pistache$|^mel[aã]o$/i.test(lower)) {
      tipo = "modifier";
      motivo = "modificador/sabor — só entra na carga se alterar trabalho real";
    }
  }

  // production candidates
  if (tipo === "unknown") {
    if (
      /carpaccio|ceviche|tartar|missoshiro|hot roll|temaki|uramaki|sashimi|niguiri|yakisoba|guioza/i.test(
        lower
      )
    ) {
      tipo = "production_item";
      motivo = "parece item de produção culinária; validar praça/complexidade";
    } else if (/tat[aá] especial|club vip gourmet/i.test(lower)) {
      tipo = "promotion";
      motivo = "nome de promoção/clube — não classificar como produção sem confirmação";
    }
  }

  const entra_carga_produtiva =
    tipo === "production_item" || (tipo === "modifier" && false); /* modifier só com flag futura */

  return {
    nome,
    tipo_sugerido: tipo,
    entra_carga_produtiva,
    praca_sugerida: tipo === "production_item" ? praca : null,
    complexidade_sugerida: tipo === "production_item" ? cx : null,
    motivo,
    confianca: tipo === "unknown" ? "baixa" : tipo === "production_item" ? "media" : "alta",
    evidencia: item.evidencia || item.motivo || null,
    opcoes_correcao: [
      "confirmar_tipo",
      "corrigir_tipo",
      "corrigir_praca",
      "corrigir_complexidade",
      "marcar_unknown"
    ],
    note:
      tipo !== "production_item"
        ? "Não atribuir praça/complexidade produtiva até César confirmar o tipo"
        : "Somente production_item recebe praça e complexidade diretamente"
  };
}

function classifyAllPending(pendingList) {
  const rows = (pendingList || []).map(classifyPendingItemRecord);
  const counts = {
    production_item: 0,
    modifier: 0,
    merchandise: 0,
    metadata: 0,
    promotion: 0,
    unknown: 0
  };
  for (const r of rows) {
    if (counts[r.tipo_sugerido] != null) counts[r.tipo_sugerido]++;
    else counts.unknown++;
  }
  return stamp({ n: rows.length, counts, items: rows });
}

/* ---------- Markdown ---------- */

function operationalToMarkdown(pack) {
  const lines = [];
  lines.push("# Casos operacionais — validação humana Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Pack **A** — somente casos com leitura suficiente para julgar a **operação**.");
  lines.push("Não use este pack para avaliar qualidade da fonte (ver CASOS_QUALIDADE_FONTE.md).");
  lines.push("");
  lines.push(`Versão: **2D.4** · gerado: ${pack.generated_at || ""}`);
  lines.push("");
  lines.push(
    `Totais: ${pack.pack_a.n} casos · controlável ${pack.pack_a.counts.controlavel} · atenção ${pack.pack_a.counts.atencao} · crítico ${pack.pack_a.counts.critico} · exceção ${pack.pack_a.counts.excecao}`
  );
  lines.push(`Fingerprints únicos: ${pack.pack_a.fingerprints_unique ? "SIM" : "NÃO"}`);
  lines.push("");
  lines.push("Equipe nos casos: **CAPACIDADE HIPOTÉTICA** (perfil simulado).");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const c of pack.pack_a.cases || []) {
    lines.push(`## ${c.case_id}`);
    lines.push("");
    lines.push("### Contexto");
    lines.push(`- Data: ${fmt(c.data)}`);
    lines.push(`- Horário local (America/Sao_Paulo): ${fmt(c.horario_local)}`);
    lines.push(`- Dia da semana: ${fmt(c.dia_semana)}`);
    lines.push(`- Praça: ${fmt(c.praca)}`);
    lines.push(`- Pedidos ativos: ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Itens totais: ${fmtNum(c.itens_totais)}`);
    lines.push(
      `- Complexidade: simples ${fmtNum(c.complexidade && c.complexidade.simples)} · moderados ${fmtNum(c.complexidade && c.complexidade.moderados)} · complexos ${fmtNum(c.complexidade && c.complexidade.complexos)} · muito complexos ${fmtNum(c.complexidade && c.complexidade.muito_complexos)}`
    );
    lines.push(`- Pedido mais antigo (min): ${fmtNum(c.pedido_mais_antigo_min)}`);
    lines.push(`- Pedidos próximos de atraso: ${fmtNum(c.pedidos_proximos_atraso)}`);
    lines.push(`- Pedidos atrasados: ${fmtNum(c.pedidos_atrasados)}`);
    lines.push(`- Pedidos prontos aguardando: ${fmtNum(c.pedidos_prontos_aguardando)}`);
    lines.push(`- Maior tempo pronto aguardando (min): ${fmtNum(c.maior_tempo_pronto_aguardando_min)}`);
    lines.push(`- Sinais logísticos: ${fmtList(c.sinais_logisticos)}`);
    lines.push(`- Ritmo últimos 15 min (Δ pedidos): ${fmtNum(c.ritmo_ultimos_15_min)}`);
    lines.push(`- Perfil de equipe: ${fmt(c.perfil_equipe)} (**capacidade hipotética**)`);
    lines.push(`- Saúde da fonte: ${fmt(c.fonte_saude)}`);
    lines.push(`- Confiança: ${fmt(c.confianca)}`);
    lines.push(`- Classificação do motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Contribuição principal: ${fmt(c.contribuicao_principal)}`);
    lines.push(`- Intervenção sugerida (sombra): ${fmt(c.intervencao_sugerida)}`);
    lines.push(`- Evidência: ${fmt(c.evidencia_kind)}`);
    lines.push(`- Bucket de amostragem: ${fmt(c.bucket_amostragem)}`);
    if (c.caso_limitrofe) lines.push(`- ⚠ ${c.caso_limitrofe_nota}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push(`- Fingerprint: ${c.fingerprint}`);
    lines.push("");
    lines.push("### Sua avaliação");
    lines.push("- Estado real: [ ] controlável  [ ] atenção  [ ] crítico  [ ] impossível avaliar");
    lines.push("- Praça correta: [ ] sim  [ ] não  [ ] outra: _______________");
    lines.push("- Recomendação adequada: [ ] sim  [ ] parcialmente  [ ] não");
    lines.push("- O que você faria: _______________________________________________");
    lines.push("- Observação: ___________________________________________________");
    lines.push("");
  }
  return lines.join("\n");
}

function qualityToMarkdown(pack) {
  const lines = [];
  lines.push("# Casos de qualidade da fonte — Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Pack **B** — **não** entra no cálculo de concordância operacional.");
  lines.push("Ausência de leitura **não** é operação calma.");
  lines.push("");
  lines.push(`n=${pack.pack_b.n}`);
  lines.push("");
  for (const c of pack.pack_b.cases || []) {
    lines.push(`## ${c.case_id}`);
    lines.push(`- Motivo: ${fmt(c.reason)}`);
    lines.push(`- Nota: ${fmt(c.note)}`);
    lines.push(`- Horário local: ${fmt(c.horario_local)}`);
    lines.push(`- Pedidos ativos: ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Praça: ${fmt(c.praca)}`);
    lines.push(`- Classificação motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Confiança: ${fmt(c.confianca)}`);
    lines.push(`- Saúde da fonte: ${fmt(c.fonte_saude)}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push("");
  }
  return lines.join("\n");
}

function itemsToMarkdown(itemsPack) {
  const lines = [];
  lines.push("# Itens pendentes — tipagem antes de praça/complexidade");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Regra: classificar **tipo** antes de praça/complexidade.");
  lines.push("- merchandise / metadata / promotion → **fora** da carga produtiva");
  lines.push("- modifier → só entra se alterar trabalho real");
  lines.push("- production_item → pode receber praça e complexidade");
  lines.push("- unknown → permanece pendente");
  lines.push("");
  lines.push(`Totais: ${JSON.stringify(itemsPack.counts)}`);
  lines.push("");
  (itemsPack.items || []).forEach((it, i) => {
    lines.push(`## Item ${i + 1}: ${it.nome}`);
    lines.push(`- Tipo sugerido: **${it.tipo_sugerido}**`);
    lines.push(`- Entra na carga produtiva: ${it.entra_carga_produtiva ? "sim" : "não"}`);
    lines.push(`- Praça sugerida: ${fmt(it.praca_sugerida)}`);
    lines.push(`- Complexidade sugerida: ${fmt(it.complexidade_sugerida)}`);
    lines.push(`- Motivo: ${fmt(it.motivo)}`);
    lines.push(`- Confiança: ${fmt(it.confianca)}`);
    lines.push(`- Evidência: ${fmt(it.evidencia)}`);
    lines.push("");
    lines.push("### Correção César");
    lines.push("- Tipo: [ ] production_item  [ ] modifier  [ ] merchandise  [ ] metadata  [ ] promotion  [ ] unknown");
    lines.push("- Praça (se production): _______________");
    lines.push("- Complexidade (se production): _______________");
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

/**
 * Valida invariantes do pack A.
 */
function validateOperationalPack(packA) {
  const cases = packA.cases || [];
  const fps = cases.map((c) => c.fingerprint);
  const uniq = new Set(fps);
  const counts = { controlavel: 0, atencao: 0, critico: 0, excecao: 0 };
  const errors = [];
  for (const c of cases) {
    counts[c.bucket_amostragem] = (counts[c.bucket_amostragem] || 0) + 1;
    if (c.bucket_amostragem === "controlavel") {
      if (c.pedidos_ativos === 0) errors.push(`${c.case_id}: controlável com 0 pedidos`);
      if (c.fonte_saude === "ausente" || c.fonte_saude === "sem_cobertura")
        errors.push(`${c.case_id}: controlável com fonte ausente`);
    }
    if (
      bucketContradicts(
        c.bucket_amostragem,
        {
          tem_excecao_critica: c.classificacao_motor === "excecao_critica",
          classificacao_motor: c.classificacao_motor,
          pedidos_ativos: c.pedidos_ativos,
          fonte_saude: c.fonte_saude,
          sinais_logisticos: c.sinais_logisticos
        },
        c.caso_limitrofe
      )
    ) {
      errors.push(`${c.case_id}: bucket contradiz classificação`);
    }
    if (c.pii) errors.push(`${c.case_id}: PII`);
    if (c.pedidos_ativos == null || c.horario_local == null)
      errors.push(`${c.case_id}: contexto mínimo incompleto`);
  }
  if (uniq.size !== fps.length) errors.push("duplicatas de fingerprint");
  if (cases.length !== 40) errors.push(`esperados 40 casos, obtidos ${cases.length}`);
  for (const b of ["controlavel", "atencao", "critico", "excecao"]) {
    if ((counts[b] || 0) !== 10) errors.push(`bucket ${b}: ${counts[b] || 0} (esperado 10)`);
  }
  return { ok: errors.length === 0, errors, counts, unique: uniq.size, n: cases.length };
}

module.exports = {
  caseFingerprint,
  anonToken,
  hasMinimumOperationalContext,
  isOperationalControlavel,
  isControlavelLimitrofe,
  isLowPressureOperational,
  isSourceQuality,
  candidateFromEnrichedTick,
  candidateFromEpisode,
  buildPacks,
  classifyPendingItemRecord,
  classifyAllPending,
  operationalToMarkdown,
  qualityToMarkdown,
  itemsToMarkdown,
  validateOperationalPack,
  bucketContradicts
};
