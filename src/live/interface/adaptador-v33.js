/* ============================================================================
 * DeliveryOS · src/live/interface · ADAPTADOR → VIEW-MODEL V3.3
 * ----------------------------------------------------------------------------
 * Transporta a projeção do motor (mode, ambientes, foco, rec, fonte) para o
 * shape visual do organismo V3.3. NUNCA decide Calmo/Ambiente/Foco, NUNCA
 * recalcula score, NUNCA inventa severidade.
 *
 * Usado por: superfície app-v1 (browser) e testes de contrato.
 * ==========================================================================*/
"use strict";

const AREA_ORDER = ["Caixa", "Sushi", "Quentes", "Cozinha", "Conferência", "Motoboy"];

/**
 * Mapeia cor V1 (mapaAmbientes) → tom visual V3.3 (não decide; só apresenta).
 * validacao = área sem integração / técnica.
 */
function toneFromCor(cor) {
  if (cor === "vermelho") return "tense";
  if (cor === "amarelo") return "watch";
  if (cor === "verde") return "calm";
  if (cor === "validacao") return "tech";
  return "calm";
}

function gravityFromMode(mode, sev) {
  if (mode === "foco") return sev >= 3 ? "high" : "elevated";
  if (mode === "ambiente") return "watch";
  return "none";
}

/**
 * @param {object} input
 * @param {string} input.mode - calmo|ambiente|foco (do motor)
 * @param {Array}  input.ambientes - saída de mapaAmbientes (ou equivalente)
 * @param {object|null} input.foco - { sev, head, impactos, conseq, cmd }
 * @param {object|null} input.rec - recomendação traduzida
 * @param {object|null} input.evid - evidências
 * @param {string|null} input.sitKind
 * @param {string|null} input.alvoId
 * @param {number} input.emand
 * @param {object|null} input.source - { status, motivo }
 * @param {object|null} input.mocks - blocos simulados (forecast, action, …)
 */
function montarViewModelV33(input) {
  const mode = input.mode || "calmo";
  const ambientes = Array.isArray(input.ambientes) ? input.ambientes : [];
  const byName = Object.fromEntries(ambientes.map((a) => [a.nome, a]));

  const areas = AREA_ORDER.map((nome) => {
    const a = byName[nome] || {
      nome,
      cor: "validacao",
      pressao: null,
      estadoTxt: "Em validação",
      motivo: "Fonte atual ainda não mede esta área"
    };
    const tone = toneFromCor(a.cor);
    const dominant =
      mode === "foco" &&
      input.focoDominantArea &&
      input.focoDominantArea === nome;
    return {
      id: nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      nome,
      tone,
      pressao: a.pressao,
      estadoTxt: a.estadoTxt,
      motivo: a.motivo,
      tech: tone === "tech",
      dominant: !!dominant,
      elevated: tone === "tense" || tone === "watch"
    };
  });

  // destacar área do foco por sitKind / sitPraca se informado
  if (mode === "foco" && input.focoAreaHint) {
    const hint = input.focoAreaHint;
    for (const ar of areas) {
      if (ar.nome === hint || ar.id === hint) ar.dominant = true;
    }
  }

  const situation = input.situation || null;
  const consequence = input.consequence || null;
  const evidences = input.evidences || [];
  const actionLabel = input.actionLabel || null;
  const secondaryAction = input.secondaryAction || null;

  const source = input.source || null;
  const techState = source
    ? {
        status: source.status || "ready",
        label: source.label || source.status || "pronto",
        form: source.form || "solid", // solid | dashed | pulse
        text: source.text || "",
        isTechnical: true
      }
    : null;

  return {
    version: "v3.3",
    mode,
    emand: input.emand == null ? 0 : input.emand,
    calmCopy:
      mode === "calmo"
        ? input.calmCopy || "Nada exige você agora."
        : null,
    areas,
    attention: mode === "foco"
      ? {
          eyebrow: input.eyebrow || "Atenção agora",
          situation,
          consequence,
          evidences,
          actionLabel,
          secondaryAction,
          gravity: gravityFromMode(mode, (input.foco && input.foco.sev) || 1),
          pure: !input.rec
        }
      : null,
    climateNote:
      mode === "ambiente"
        ? input.climateNote || "Pressão surgindo no organismo."
        : null,
    forecast: input.mocks && input.mocks.forecast ? input.mocks.forecast : null,
    actionTrack: input.mocks && input.mocks.actionTrack ? input.mocks.actionTrack : null,
    voice: input.mocks && input.mocks.voice ? input.mocks.voice : null,
    closing: input.mocks && input.mocks.closing ? input.mocks.closing : null,
    techState,
    demo: !!(input.mocks && input.mocks.demo),
    meta: input.meta || {}
  };
}

/** Mapeia status D4A da fonte → apresentação técnica V3.3 (texto + forma). */
function mapearEstadoFonteV33(sourceStatus, motivo) {
  const map = {
    initializing: {
      status: "initializing",
      label: "sincronizando",
      form: "pulse",
      text: "Fonte iniciando. Ainda sem estado operacional confiável."
    },
    replaying: {
      status: "replaying",
      label: "reprocessando",
      form: "pulse",
      text: "Reprocessando histórico. O que aparece não é o estado final."
    },
    stale: {
      status: "stale",
      label: "dado atrasado",
      form: "dashed",
      text: "Dado envelhecido. Sem estado atual confiável."
    },
    disconnected: {
      status: "disconnected",
      label: "conexão perdida",
      form: "dashed",
      text: "Conexão com a fonte perdida."
    },
    degraded: {
      status: "degraded",
      label: "dado parcial",
      form: "dashed",
      text: "Fonte em modo degradado" + (motivo ? ": " + motivo : ".")
    },
    failed: {
      status: "failed",
      label: "falha técnica",
      form: "dashed",
      text: "Falha persistente na fonte" + (motivo ? ": " + motivo : ".")
    },
    stopped: {
      status: "stopped",
      label: "sem integração",
      form: "dashed",
      text: "Fonte parada."
    },
    ready: {
      status: "ready",
      label: "atualizado",
      form: "solid",
      text: "Fonte pronta."
    }
  };
  return map[sourceStatus] || {
    status: sourceStatus || "unknown",
    label: "estado técnico",
    form: "dashed",
    text: "Estado da fonte: " + (sourceStatus || "desconhecido")
  };
}

/**
 * Inferência de apresentação (não decisão): qual área do organismo enfatizar
 * a partir do sitKind/sitPraca já decididos pelo motor.
 */
function areaHintFromSit(sitKind, sitPraca, displayMap) {
  if (sitKind === "saida") return "Motoboy";
  if (sitKind === "conferencia") return "Conferência";
  if (sitKind === "praca" && sitPraca) {
    if (["combinados", "duplas", "enrolados"].indexOf(sitPraca) >= 0) return "Sushi";
    if (sitPraca === "enrolados_quentes") return "Quentes";
    if (sitPraca === "cozinha_quentes") return "Cozinha";
    if (displayMap && displayMap[sitPraca]) {
      const d = displayMap[sitPraca];
      if (/quentes/i.test(d)) return "Quentes";
    }
  }
  if (sitKind === "fechamento" || sitKind === "order") return "Conferência";
  return null;
}

const api = {
  AREA_ORDER,
  toneFromCor,
  gravityFromMode,
  montarViewModelV33,
  mapearEstadoFonteV33,
  areaHintFromSit
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.V33_ADAPTER = api;
}
