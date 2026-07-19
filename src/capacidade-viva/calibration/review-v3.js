/* ============================================================================
 * Review pack v3 — casos representativos por EPISÓDIO (não por tick).
 * Bucket = classificação do motor. Limítrofes em seção própria.
 * CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { stamp } = require("./labels");
const { toSaoPaulo } = require("./timezone");
const { operationalDayKey } = require("./operational-window");

const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const LOGISTIC_TYPES = new Set([
  "motoboy_na_loja",
  "entregador_alocado_sem_retirada",
  "pronto_sem_saida_excessivo",
  "aguardando_saida_causa_nao_confirmada",
  "pedido_atrasado_vs_prometido_operacional",
  "prontos_acumulando"
]);

function anonEpisodeId(id) {
  if (!id) return null;
  return "ep_" + crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 10);
}

function anonOrderToken(id) {
  if (!id) return null;
  return "ord_" + crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 10);
}

function hourBand(hour) {
  if (hour == null) return "desconhecida";
  if (hour < 11) return "manha";
  if (hour < 15) return "almoco";
  if (hour < 18) return "tarde";
  if (hour < 22) return "jantar";
  return "noite";
}

/**
 * Chave de unicidade operacional: order (ou episode) + dia operacional.
 * Impede vários ticks do mesmo problema no mesmo turno/dia.
 */
function episodeTurnKey(ep) {
  const day =
    ep.operational_day_start ||
    (ep.started_ms != null ? operationalDayKey(ep.started_ms).operational_day : null) ||
    String(ep.started_at || "").slice(0, 10);
  const entity = ep.order_id || ep.episode_id || "unknown";
  return `${entity}|${day}`;
}

/**
 * Normaliza confiança vs evidência.
 * Evidência ausente → confiança baixa (nunca média/alta).
 */
function normalizeConfidence(ep) {
  const epistemic = ep.epistemic || ep.evidence_kind || null;
  let conf = ep.confidence || "media";
  const evidenceText = Array.isArray(ep.evidence) ? ep.evidence.join(" ") : String(ep.evidence || "");
  const absent =
    !epistemic ||
    epistemic === "ausente" ||
    (epistemic === null && (!evidenceText || evidenceText === "atenção operacional"));

  if (absent || epistemic === "inferido_baixa_confianca") {
    conf = "baixa";
  } else if (epistemic === "confirmado") {
    conf = conf === "baixa" ? "media" : conf;
  } else if (epistemic === "inferido_alta_confianca") {
    if (conf === "alta") conf = "media"; // inferência alta ≠ certeza
  }

  // nunca média/alta sem evidência compatível
  if ((conf === "media" || conf === "alta") && (absent || !evidenceText.trim())) {
    conf = "baixa";
  }
  return { confianca: conf, epistemic: epistemic || "ausente", evidence_absent: !!absent };
}

/**
 * Classificação do motor a partir do episódio (sem inventar "crítico").
 */
function motorClassFromEpisode(ep) {
  if (ep.level === "excecao_critica") return "excecao_critica";
  if (ep.level === "atencao") return "atencao";
  if (ep.level === "sinal") return "sinal";
  if (ep.level === "quieto" || ep.level === "controlavel") return "controlavel";
  return ep.level || "desconhecido";
}

/**
 * Bucket = classificação do motor (1:1).
 * "critico" só se motor emitir isso (hoje não emite nos episódios).
 */
function bucketFromMotor(classificacao) {
  if (classificacao === "excecao_critica") return "excecao";
  if (classificacao === "atencao") return "atencao";
  if (classificacao === "sinal" || classificacao === "quieto" || classificacao === "controlavel")
    return "controlavel";
  if (classificacao === "critico") return "critico";
  return null;
}

/**
 * Caso limítrofe: não vai no pack principal.
 * - atenção com pressão muito baixa (parecer controlável)
 * - atenção com pressão muito alta (parecer crítico sem ser exceção)
 * - confiança baixa com classificação forte
 */
function isLimitrofe(ep, classificacao) {
  const peak = ep.peak_active_orders || 0;
  const conf = normalizeConfidence(ep).confianca;
  if (classificacao === "atencao" && peak > 0 && peak <= 5) return true; // quase controlável
  if (classificacao === "atencao" && peak >= 45) return true; // parece crítico
  if (classificacao === "excecao_critica" && conf === "baixa") return true;
  if (classificacao === "atencao" && conf === "baixa" && (!ep.evidence || !ep.evidence.length))
    return true;
  return false;
}

function isPureLogistic(ep) {
  return LOGISTIC_TYPES.has(ep.type);
}

/**
 * Converte episódio em caso de review.
 */
function caseFromEpisode(ep, opts) {
  const o = opts || {};
  const spStart = toSaoPaulo(ep.started_ms || ep.started_at);
  const spEnd = toSaoPaulo(ep.last_seen_ms || ep.last_seen_at || ep.started_ms);
  const confN = normalizeConfidence(ep);
  const classificacao = motorClassFromEpisode(ep);
  const bucket = bucketFromMotor(classificacao);
  const pureLog = isPureLogistic(ep);
  const peak = ep.peak_active_orders || 0;

  // itens: episódio não carrega itens — honesto
  const itens_totais = null;
  const complexidade = null;

  const fonte =
    peak > 0
      ? confN.evidence_absent
        ? "parcial"
        : "saudavel_ou_conhecida"
      : "sem_cobertura";

  const razao =
    (Array.isArray(ep.evidence) && ep.evidence[0]) ||
    ep.type ||
    "sinal de episódio";

  return stamp({
    episode_id_anon: anonEpisodeId(ep.episode_id),
    order_token: anonOrderToken(ep.order_id),
    episode_turn_key: episodeTurnKey(ep),
    type: ep.type,
    pure_logistic: pureLog,
    productive_load: !pureLog && ep.type === "atencao_operacional",
    data: spStart.local_date,
    horario_local: ep.started_at || spStart.local_iso,
    horario_fim_local: ep.last_seen_at || spEnd.local_iso,
    dia_semana: DOW_PT[spStart.local_dow] || null,
    faixa_horario: hourBand(spStart.local_hour),
    praca: ep.praca || null,
    intervalo_episodio: {
      started_at: ep.started_at,
      last_seen_at: ep.last_seen_at,
      duration_label: ep.duration_label || null,
      observed_span_min: ep.observed_span_min != null ? ep.observed_span_min : ep.duration_min,
      observed_ticks: ep.observed_ticks || ep.tick_count,
      operational_day: ep.operational_day_start || spStart.local_date
    },
    pedidos_ativos: peak,
    itens_totais,
    complexidade,
    pedido_mais_antigo_min: null, // não inventar
    pedidos_prontos_aguardando: pureLog ? 1 : null,
    maior_espera_min: pureLog && ep.observed_span_min != null ? ep.observed_span_min : null,
    ritmo: null,
    sinais: ep.type ? [ep.type] : [],
    fonte_saude: fonte,
    confianca: confN.confianca,
    epistemic: confN.epistemic,
    classificacao_motor: classificacao,
    bucket_amostragem: bucket,
    razao,
    intervencao_sugerida: o.intervencao || "observar",
    dados_ausentes: buildMissing(ep, pureLog),
    capacidade_hipotetica: true,
    capacidade_hipotetica_nota:
      "CAPACIDADE HIPOTÉTICA — perfil de equipe simulado; não usar como escala real",
    perfil_equipe: o.team_profile || "estrutura_media",
    pii: false,
    started_ms: ep.started_ms,
    _raw_episode_id: ep.episode_id,
    _raw_order_id: ep.order_id || null
  });
}

function buildMissing(ep, pureLog) {
  const m = ["equipe_real_por_turno"];
  if (!pureLog) m.push("distribuicao_itens_complexidade");
  else m.push("itens_nao_aplicaveis_caso_logistico");
  m.push("pedido_mais_antigo_min");
  m.push("ritmo_15min");
  if (!ep.evidence || !ep.evidence.length) m.push("evidencia_detalhada");
  return m;
}

/**
 * Seleciona pack representativo a partir da lista de episódios.
 * @returns {{ representativos, limitrofes, stats }}
 */
function selectRepresentativePack(episodes, opts) {
  const o = opts || {};
  const minN = o.min_n != null ? o.min_n : 16;
  const maxN = o.max_n != null ? o.max_n : 24;
  const list = Array.isArray(episodes) ? episodes : [];

  // 1) um por (order|episode)+dia operacional — pega o de maior peak/severity
  const byTurn = new Map();
  for (const ep of list) {
    if (!ep || !ep.episode_id) continue;
    const key = episodeTurnKey(ep);
    const prev = byTurn.get(key);
    if (!prev) {
      byTurn.set(key, ep);
      continue;
    }
    const score = (e) =>
      (e.peak_severity || 0) * 1000 + (e.peak_active_orders || 0) + (e.tick_count || 0);
    if (score(ep) > score(prev)) byTurn.set(key, ep);
  }

  const uniqueEps = [...byTurn.values()];
  const representativos = [];
  const limitrofes = [];
  const usedTurn = new Set();
  const usedEntityDay = new Set();

  // diversity trackers
  const usedDays = new Set();
  const usedDow = new Set();
  const usedBands = new Set();
  const usedPracas = new Set();
  const usedTypes = new Set();
  const bucketCounts = { controlavel: 0, atencao: 0, critico: 0, excecao: 0 };

  function diversityScore(c) {
    let s = 0;
    if (c.data && !usedDays.has(c.data)) s += 5;
    if (c.dia_semana && !usedDow.has(c.dia_semana)) s += 4;
    if (c.faixa_horario && !usedBands.has(c.faixa_horario)) s += 3;
    if (c.praca && !usedPracas.has(c.praca)) s += 4;
    if (c.type && !usedTypes.has(c.type)) s += 3;
    // prefer multi-tick measurable
    if ((c.intervalo_episodio.observed_ticks || 0) >= 2) s += 2;
    if (c.confianca !== "baixa") s += 1;
    if (c.praca) s += 1;
    if (c.pedidos_ativos > 0) s += 1;
    return s;
  }

  const candidates = uniqueEps
    .map((ep) => {
      const c = caseFromEpisode(ep, o);
      c._limitrofe = isLimitrofe(ep, c.classificacao_motor);
      return c;
    })
    .filter((c) => {
      // fonte insuficiente → limítrofe ou drop do principal
      if (c.fonte_saude === "sem_cobertura" || c.pedidos_ativos <= 0) {
        c._limitrofe = true;
        c._limitrofe_reason = "fonte_insuficiente_ou_sem_volume";
      }
      // itens 0 (null) só OK se logístico
      if (!c.pure_logistic && c.itens_totais == null) {
        // episódios não têm itens — marcar ausente, aceitar se logístico; se atencao_operacional genérica, limítrofe
        if (c.type === "atencao_operacional") {
          c._limitrofe = true;
          c._limitrofe_reason = "atencao_generica_sem_itens";
        }
      }
      // bucket null
      if (!c.bucket_amostragem) {
        c._limitrofe = true;
        c._limitrofe_reason = "classificacao_sem_bucket";
      }
      return true;
    });

  // split
  const mainPool = candidates.filter((c) => !c._limitrofe);
  const limPool = candidates.filter((c) => c._limitrofe);

  // greedy diversity pick for main — balance buckets without forcing 10
  const byBucket = { controlavel: [], atencao: [], critico: [], excecao: [] };
  for (const c of mainPool) {
    if (byBucket[c.bucket_amostragem]) byBucket[c.bucket_amostragem].push(c);
  }
  for (const b of Object.keys(byBucket)) {
    byBucket[b].sort((a, b2) => diversityScore(b2) - diversityScore(a) || (a.started_ms || 0) - (b2.started_ms || 0));
  }

  // target soft: prefer mix, max ~6-8 per available bucket
  const softMaxPerBucket = 8;

  function tryPick(c) {
    if (representativos.length >= maxN) return false;
    if (usedTurn.has(c.episode_turn_key)) return false;
    if (c._raw_order_id) {
      const od =
        c.intervalo_episodio.operational_day + "|" + c._raw_order_id;
      if (usedEntityDay.has(od)) return false;
    }
    // no consecutive same type+praca within 30 min of already picked
    for (const p of representativos) {
      if (p.type === c.type && p.praca === c.praca) {
        const dt = Math.abs((p.started_ms || 0) - (c.started_ms || 0));
        if (dt < 30 * 60000) return false;
      }
    }
    if ((bucketCounts[c.bucket_amostragem] || 0) >= softMaxPerBucket) return false;

    // validate hard rules
    if (c.bucket_amostragem !== bucketFromMotor(c.classificacao_motor)) return false;
    if (c.bucket_amostragem === "controlavel" && (c.fonte_saude === "sem_cobertura" || c.pedidos_ativos <= 0))
      return false;
    if (c.bucket_amostragem === "critico" && !(c.sinais && c.sinais.length)) return false;
    if ((c.confianca === "media" || c.confianca === "alta") && c.epistemic === "ausente") return false;

    representativos.push(c);
    usedTurn.add(c.episode_turn_key);
    if (c._raw_order_id)
      usedEntityDay.add(c.intervalo_episodio.operational_day + "|" + c._raw_order_id);
    bucketCounts[c.bucket_amostragem] = (bucketCounts[c.bucket_amostragem] || 0) + 1;
    if (c.data) usedDays.add(c.data);
    if (c.dia_semana) usedDow.add(c.dia_semana);
    if (c.faixa_horario) usedBands.add(c.faixa_horario);
    if (c.praca) usedPracas.add(c.praca);
    if (c.type) usedTypes.add(c.type);
    return true;
  }

  // round-robin across non-empty buckets for fairness
  const order = ["excecao", "atencao", "controlavel", "critico"].filter(
    (b) => byBucket[b] && byBucket[b].length
  );
  let progress = true;
  while (representativos.length < maxN && progress) {
    progress = false;
    for (const b of order) {
      if (representativos.length >= maxN) break;
      // pick highest remaining diversity score not used
      byBucket[b].sort((a, b2) => diversityScore(b2) - diversityScore(a));
      for (const c of byBucket[b]) {
        if (usedTurn.has(c.episode_turn_key)) continue;
        if (tryPick(c)) {
          progress = true;
          break;
        }
      }
    }
  }

  // if below min, relax softMax slightly
  if (representativos.length < minN) {
    for (const c of mainPool) {
      if (representativos.length >= minN) break;
      if (usedTurn.has(c.episode_turn_key)) continue;
      // temporary raise soft max
      const prev = softMaxPerBucket;
      // ignore soft max for fill
      if (c.bucket_amostragem === "controlavel" && (c.fonte_saude === "sem_cobertura" || c.pedidos_ativos <= 0))
        continue;
      if ((c.confianca === "media" || c.confianca === "alta") && c.epistemic === "ausente") continue;
      if (c.bucket_amostragem !== bucketFromMotor(c.classificacao_motor)) continue;
      // consecutive check
      let nearDup = false;
      for (const p of representativos) {
        if (p.type === c.type && p.praca === c.praca) {
          if (Math.abs((p.started_ms || 0) - (c.started_ms || 0)) < 30 * 60000) nearDup = true;
        }
      }
      if (nearDup) continue;
      representativos.push(c);
      usedTurn.add(c.episode_turn_key);
      bucketCounts[c.bucket_amostragem] = (bucketCounts[c.bucket_amostragem] || 0) + 1;
      if (c.data) usedDays.add(c.data);
      if (c.dia_semana) usedDow.add(c.dia_semana);
      if (c.faixa_horario) usedBands.add(c.faixa_horario);
      if (c.praca) usedPracas.add(c.praca);
      if (c.type) usedTypes.add(c.type);
    }
  }

  // limítrofes: diversify sample up to 12
  const limOut = [];
  const limUsed = new Set();
  limPool.sort((a, b) => (b.pedidos_ativos || 0) - (a.pedidos_ativos || 0));
  for (const c of limPool) {
    if (limOut.length >= 12) break;
    if (limUsed.has(c.episode_turn_key)) continue;
    // not already in main
    if (usedTurn.has(c.episode_turn_key)) continue;
    limUsed.add(c.episode_turn_key);
    limOut.push(c);
  }

  // finalize IDs and strip internals
  function finalize(list, prefix) {
    return list.map((c, i) => {
      const out = Object.assign({}, c);
      delete out._raw_episode_id;
      delete out._raw_order_id;
      delete out._limitrofe;
      delete out._limitrofe_reason;
      delete out.started_ms;
      out.case_id = `${prefix}-${String(i + 1).padStart(3, "0")}`;
      out.pack = prefix === "CV-R" ? "representativos" : "limitrofes";
      return stamp(out);
    });
  }

  const repFinal = finalize(
    representativos.sort((a, b) => (a.started_ms || 0) - (b.started_ms || 0)),
    "CV-R"
  );
  const limFinal = finalize(
    limOut.sort((a, b) => (a.started_ms || 0) - (b.started_ms || 0)),
    "CV-L"
  );

  const stats = {
    n_representativos: repFinal.length,
    n_limitrofes: limFinal.length,
    bucket_counts: countBuckets(repFinal),
    dates: [...new Set(repFinal.map((c) => c.data))].sort(),
    dias_semana: [...new Set(repFinal.map((c) => c.dia_semana).filter(Boolean))],
    faixas: [...new Set(repFinal.map((c) => c.faixa_horario).filter(Boolean))],
    pracas: [...new Set(repFinal.map((c) => c.praca).filter(Boolean))],
    types: [...new Set(repFinal.map((c) => c.type).filter(Boolean))],
    unique_turn_keys: new Set(repFinal.map((c) => c.episode_turn_key)).size,
    n_episodes_source: list.length,
    n_after_turn_dedup: uniqueEps.length
  };

  return stamp({
    version: "2D.5",
    generated_at: new Date().toISOString(),
    representativos: repFinal,
    limitrofes: limFinal,
    stats
  });
}

function countBuckets(cases) {
  const c = { controlavel: 0, atencao: 0, critico: 0, excecao: 0 };
  for (const x of cases) {
    if (c[x.bucket_amostragem] != null) c[x.bucket_amostragem]++;
  }
  return c;
}

/**
 * Validação de invariantes do pack representativo.
 */
function validateRepresentativePack(pack) {
  const cases = pack.representativos || pack.cases || [];
  const errors = [];
  const turnKeys = cases.map((c) => c.episode_turn_key);
  if (new Set(turnKeys).size !== turnKeys.length) errors.push("repeticao_episode_turn_key");

  const orderDay = cases
    .filter((c) => c.order_token)
    .map((c) => `${c.order_token}|${c.intervalo_episodio && c.intervalo_episodio.operational_day}`);
  if (new Set(orderDay).size !== orderDay.length) errors.push("repeticao_order_turno");

  // consecutive same type+praca within 30 min
  const sorted = cases.slice().sort((a, b) => String(a.horario_local).localeCompare(String(b.horario_local)));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.type === b.type && a.praca === b.praca && a.data === b.data) {
      const ta = Date.parse(a.horario_local);
      const tb = Date.parse(b.horario_local);
      if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(tb - ta) < 30 * 60000) {
        errors.push(`sequencia_ticks_independentes:${a.case_id}-${b.case_id}`);
      }
    }
  }

  const dates = new Set(cases.map((c) => c.data).filter(Boolean));
  if (dates.size < 2 && cases.length >= 8) errors.push("menos_de_2_datas");

  for (const c of cases) {
    if (c.bucket_amostragem !== bucketFromMotor(c.classificacao_motor)) {
      errors.push(`bucket_neq_motor:${c.case_id}`);
    }
    if ((c.confianca === "media" || c.confianca === "alta") && c.epistemic === "ausente") {
      errors.push(`confianca_sem_evidencia:${c.case_id}`);
    }
    if (c.bucket_amostragem === "controlavel") {
      if (c.fonte_saude === "sem_cobertura" || c.fonte_saude === "ausente" || (c.pedidos_ativos || 0) <= 0) {
        errors.push(`controlavel_fonte_insuficiente:${c.case_id}`);
      }
    }
    if (c.bucket_amostragem === "critico") {
      if (!c.sinais || !c.sinais.length) errors.push(`critico_sem_sinais:${c.case_id}`);
    }
    if (c.pii) errors.push(`pii:${c.case_id}`);
    if (!c.pure_logistic && c.itens_totais === 0 && c.itens_totais !== null) {
      // 0 explícito em não-logístico
      errors.push(`itens_zero_nao_logistico:${c.case_id}`);
    }
  }

  if (cases.length < 16 || cases.length > 24) {
    // soft warning only if outside range but still valid selection
    if (cases.length < 12 || cases.length > 28) errors.push(`n_fora_faixa_ampla:${cases.length}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    n: cases.length,
    dates: dates.size,
    buckets: countBuckets(cases)
  };
}

/* ---------- Markdown ---------- */

function representativosToMarkdown(pack) {
  const lines = [];
  lines.push("# Casos representativos por episódio — Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Pack **2D.5** — um caso por episódio/pedido no mesmo turno. **Não** usar ticks consecutivos.");
  lines.push("Bucket = classificação do motor. Casos limítrofes estão em `CASOS_LIMITROFES.md`.");
  lines.push("");
  lines.push(`Gerado: ${pack.generated_at || ""}`);
  lines.push(`n=${(pack.representativos || []).length}`);
  lines.push(`Buckets: ${JSON.stringify(pack.stats && pack.stats.bucket_counts)}`);
  lines.push(`Datas: ${(pack.stats && pack.stats.dates || []).join(", ")}`);
  lines.push(`Dias: ${(pack.stats && pack.stats.dias_semana || []).join(", ")}`);
  lines.push(`Praças: ${(pack.stats && pack.stats.pracas || []).join(", ")}`);
  lines.push("");
  lines.push("Equipe: **CAPACIDADE HIPOTÉTICA** (simulada).");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const c of pack.representativos || []) {
    lines.push(`## ${c.case_id}`);
    lines.push("");
    lines.push("### Contexto (episódio)");
    lines.push(`- Episode (anon): ${fmt(c.episode_id_anon)}`);
    lines.push(`- Order token: ${fmt(c.order_token)}`);
    lines.push(`- Data: ${fmt(c.data)}`);
    lines.push(`- Horário início (America/Sao_Paulo): ${fmt(c.horario_local)}`);
    lines.push(`- Horário fim: ${fmt(c.horario_fim_local)}`);
    lines.push(`- Dia da semana: ${fmt(c.dia_semana)}`);
    lines.push(`- Faixa: ${fmt(c.faixa_horario)}`);
    lines.push(`- Praça: ${fmt(c.praca)}`);
    lines.push(
      `- Intervalo: span ${fmtNum(c.intervalo_episodio && c.intervalo_episodio.observed_span_min)} min · ticks ${fmtNum(c.intervalo_episodio && c.intervalo_episodio.observed_ticks)} · ${fmt(c.intervalo_episodio && c.intervalo_episodio.duration_label)}`
    );
    lines.push(`- Pedidos ativos (pico): ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Itens totais: ${fmtNum(c.itens_totais)}${c.pure_logistic ? " (caso logístico — itens não exigidos)" : ""}`);
    lines.push(`- Complexidade: ${c.complexidade ? JSON.stringify(c.complexidade) : "—"}`);
    lines.push(`- Pedido mais antigo (min): ${fmtNum(c.pedido_mais_antigo_min)}`);
    lines.push(`- Prontos aguardando: ${fmtNum(c.pedidos_prontos_aguardando)}`);
    lines.push(`- Maior espera (min): ${fmtNum(c.maior_espera_min)}`);
    lines.push(`- Ritmo: ${fmtNum(c.ritmo)}`);
    lines.push(`- Sinais: ${fmtList(c.sinais)}`);
    lines.push(`- Tipo de carga: ${c.pure_logistic ? "exceção/sinal logístico" : "operacional"}`);
    lines.push(`- Saúde da fonte: ${fmt(c.fonte_saude)}`);
    lines.push(`- Confiança: ${fmt(c.confianca)} (${fmt(c.epistemic)})`);
    lines.push(`- Classificação do motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Bucket (= motor): ${fmt(c.bucket_amostragem)}`);
    lines.push(`- Razão: ${fmt(c.razao)}`);
    lines.push(`- Intervenção sugerida (sombra): ${fmt(c.intervencao_sugerida)}`);
    lines.push(`- Dados ausentes: ${fmtList(c.dados_ausentes)}`);
    lines.push(`- ${c.capacidade_hipotetica_nota}`);
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

function limitrofesToMarkdown(pack) {
  const lines = [];
  lines.push("# Casos limítrofes — Capacidade Viva");
  lines.push("");
  lines.push("**CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL**");
  lines.push("");
  lines.push("Seção **separada** — não usar como ground truth de controlável/crítico.");
  lines.push("Inclui: atenção de baixa pressão, atenção de altíssima pressão, exceção com confiança baixa, fonte parcial.");
  lines.push("");
  lines.push(`n=${(pack.limitrofes || []).length}`);
  lines.push("");
  for (const c of pack.limitrofes || []) {
    lines.push(`## ${c.case_id}`);
    lines.push(`- Episode: ${fmt(c.episode_id_anon)}`);
    lines.push(`- Data/hora: ${fmt(c.horario_local)} (${fmt(c.dia_semana)})`);
    lines.push(`- Praça: ${fmt(c.praca)}`);
    lines.push(`- Pedidos ativos (pico): ${fmtNum(c.pedidos_ativos)}`);
    lines.push(`- Classificação motor: ${fmt(c.classificacao_motor)}`);
    lines.push(`- Confiança: ${fmt(c.confianca)} / ${fmt(c.epistemic)}`);
    lines.push(`- Sinais: ${fmtList(c.sinais)}`);
    lines.push(`- Razão: ${fmt(c.razao)}`);
    lines.push(`- Fonte: ${fmt(c.fonte_saude)}`);
    lines.push(`- Por que limítrofe: pressão/confiança/fonte não sustenta bucket forçado`);
    lines.push("");
    lines.push("### Sua avaliação (opcional)");
    lines.push("- Observação: ___________________________________________________");
    lines.push("");
  }
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

module.exports = {
  anonEpisodeId,
  anonOrderToken,
  episodeTurnKey,
  normalizeConfidence,
  motorClassFromEpisode,
  bucketFromMotor,
  isLimitrofe,
  isPureLogistic,
  caseFromEpisode,
  selectRepresentativePack,
  validateRepresentativePack,
  representativosToMarkdown,
  limitrofesToMarkdown,
  LOGISTIC_TYPES
};
