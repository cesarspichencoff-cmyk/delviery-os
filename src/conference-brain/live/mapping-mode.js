/* ============================================================================
 * Modo de Mapeamento (Sprint 2, Fase 14).
 * ----------------------------------------------------------------------------
 * Modo seguro para descobrir/atualizar a estrutura real da tela: captura uma
 * ASSINATURA ESTRUTURAL sanitizada (contagens, nomes de classe, textos de
 * status curtos) a partir de HTML já carregado — NUNCA executa ação no
 * portal, NUNCA persiste texto que possa ser PII (nomes, telefone, endereço).
 *
 * Puro (recebe uma string HTML, não abre navegador). Funciona tanto sobre um
 * snapshot capturado do Modo de Mapeamento em produção quanto — como prova de
 * que a análise estrutural funciona de verdade — sobre os relatórios HTML
 * históricos já usados no Sprint 1 (ver docs/conference-brain/LIVE_VALIDATION_V1.md).
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");

const PII_LIKE_ATTRS = /(nome|name|telefone|phone|endereco|address|cpf|email)/i;

/** Extrai nomes de classe únicos de um HTML, sem levar nenhum texto de conteúdo junto. */
function extractClassNames(html) {
  const classes = new Set();
  const re = /class=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  }
  return Array.from(classes).sort();
}

/** Conta ocorrências de tags candidatas a "card de pedido" / "badge de status". */
function candidateCounts(html) {
  const counts = {};
  const patterns = {
    divs: /<div[\s>]/gi, tables: /<table[\s>]/gi, rows: /<tr[\s>]/gi,
    badges: /class=["'][^"']*badge[^"']*["']/gi,
    cards: /class=["'][^"']*card[^"']*["']/gi,
    buttons: /<button[\s>]/gi
  };
  for (const [name, re] of Object.entries(patterns)) {
    counts[name] = (html.match(re) || []).length;
  }
  return counts;
}

/**
 * Textos curtos que parecem rótulo de status (letras/espaços, poucas
 * palavras, sem dígitos longos) — heurística deliberadamente conservadora:
 * melhor perder um rótulo real do que capturar um trecho de PII por engano.
 */
function candidateStatusTexts(html) {
  const found = new Set();
  const re = /class=["'][^"']*(?:badge|status)[^"']*["'][^>]*>\s*([A-Za-zÀ-ÿ ]{2,24})\s*</gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim();
    if (t && !PII_LIKE_ATTRS.test(t)) found.add(t);
  }
  return Array.from(found).sort();
}

/** Sinaliza atributos com nome que parece PII — não extrai o valor, só avisa. */
function flagsPiiLikeAttributes(html) {
  const flags = new Set();
  const re = /(?:data-|id=["'])([a-zA-Z-]*)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (PII_LIKE_ATTRS.test(m[1])) flags.add(m[1]);
  }
  return Array.from(flags).sort();
}

/* ============================================================================
 * Sprint 2.1 (Fase 20) — candidatos funcionais além de card/badge genéricos.
 * Mesma disciplina: só PRESENÇA e CONTAGEM, nunca o texto de conteúdo real
 * (exceto rótulos curtos já cobertos pela heurística de `candidateStatusTexts`,
 * reaproveitada aqui). Nenhum destes vira seletor real — são candidatos para
 * um humano confirmar na sessão supervisionada (Fase 14 original).
 * ==========================================================================*/

/** Presença de tokens conhecidos (case-insensitive) em nomes de classe OU texto curto de badge/label. */
function tokenHints(html, tokenPatterns) {
  const classNames = extractClassNames(html).join(" ");
  const shortTexts = candidateStatusTexts(html).join(" ");
  const haystack = classNames + " " + shortTexts;
  const found = {};
  for (const [label, re] of Object.entries(tokenPatterns)) {
    found[label] = re.test(haystack);
  }
  return found;
}

/** `layout_mode` — pistas de Expedição vs Quadros no HTML (classe, rota sanitizada se fornecida). */
function candidateLayoutModeHints(html, sanitizedRoute) {
  const hints = tokenHints(html, {
    expedition: /expedi[cç][aã]o|expedition/i,
    boards: /quadros?|kanban|boards?/i
  });
  if (sanitizedRoute) {
    if (/expedition/i.test(sanitizedRoute)) hints.expedition = true;
    if (/kanban/i.test(sanitizedRoute)) hints.boards = true;
  }
  return hints;
}

/** Colunas candidatas (Quadros) — nomes de classe que sugerem coluna/lane. */
function candidateColumnHints(html) {
  const classes = extractClassNames(html);
  return classes.filter((c) => /column|coluna|lane|board-/i.test(c));
}

/** Rótulos de ação candidatos (ex.: "Avisar Pedido Pronto") — nunca clicados, só contados. */
function candidateActionLabels(html) {
  const found = new Set();
  const re = /<button[^>]*>\s*([A-Za-zÀ-ÿ ]{2,40})\s*<\/button>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim();
    if (t && !PII_LIKE_ATTRS.test(t)) found.add(t);
  }
  return Array.from(found).sort();
}

/** Tags de tempo candidatas (ex.: "12 min") perto de badge/tag — nunca o texto livre inteiro. */
function candidateTimeTags(html) {
  const found = [];
  const re = /class=["'][^"']*(?:tag|time|tempo)[^"']*["'][^>]*>\s*(\d{1,3}\s*min)\s*</gi;
  let m;
  while ((m = re.exec(html)) !== null) found.push(m[1]);
  return found;
}

/** Presença de vocabulário logístico, agrupamento, agendamento, estado da loja. */
function candidateSemanticHints(html) {
  return tokenHints(html, {
    courier_logistics: /entregador|courier|a caminho|na loja|procurando/i,
    grouped_delivery: /agrupad|grouped|link-icon/i,
    scheduled_order: /agendad|scheduled/i,
    store_state: /loja (aberta|fechada)|store (open|closed)/i,
    qr_code: /qr.?code|confirma[cç][aã]o de chegada/i
  });
}

/** Seletor de unidade — presença de vocabulário de troca de loja/unidade. */
function candidateUnitSelectorHints(html) {
  return tokenHints(html, { unit_selector: /unidade|unit-selector|troca de loja|select.?store/i });
}

/** Modais, chat e overlays que podem cobrir a lista de pedidos. */
function candidateOverlayHints(html) {
  return tokenHints(html, {
    modal: /modal|dialog|overlay/i,
    chat: /chat|mensagem/i,
    notification: /notifica[cç][aã]o|toast|snackbar/i
  });
}

/** Atributos de acessibilidade presentes — só o NOME do atributo/role, nunca o valor (pode ter PII). */
function candidateA11yAttributes(html) {
  const roles = new Set();
  const reRole = /role=["']([a-z-]+)["']/gi;
  let m;
  while ((m = reRole.exec(html)) !== null) roles.add(m[1]);
  const ariaAttrNames = new Set();
  const reAria = /\s(aria-[a-z-]+)=/gi;
  while ((m = reAria.exec(html)) !== null) ariaAttrNames.add(m[1]);
  return { roles: Array.from(roles).sort(), aria_attributes: Array.from(ariaAttrNames).sort() };
}

/** Reúne todos os candidatos funcionais num só objeto — usado por `captureStructuralSignature`. */
function captureFunctionalCandidates(html, sanitizedRoute) {
  return {
    layout_mode_hints: candidateLayoutModeHints(html, sanitizedRoute),
    column_hints: candidateColumnHints(html),
    action_labels: candidateActionLabels(html),
    time_tags: candidateTimeTags(html),
    semantic_hints: candidateSemanticHints(html),
    unit_selector_hints: candidateUnitSelectorHints(html),
    overlay_hints: candidateOverlayHints(html),
    a11y: candidateA11yAttributes(html)
  };
}

/**
 * Assinatura estrutural completa + hash estável. O hash muda se a estrutura
 * muda (classes somem/aparecem, contagens mudam de faixa) — NÃO muda por
 * causa de conteúdo variável (texto de pedido, valores).
 */
function captureStructuralSignature(html, meta) {
  const safeHtml = String(html || "");
  const classNames = extractClassNames(safeHtml);
  const counts = candidateCounts(safeHtml);
  const statusTexts = candidateStatusTexts(safeHtml);
  const piiFlags = flagsPiiLikeAttributes(safeHtml);
  const functional = captureFunctionalCandidates(safeHtml, meta && meta.sanitizedRoute);

  // faixas, não números exatos, para não invalidar a assinatura a cada pedido novo/removido
  const bucket = (n) => (n === 0 ? "0" : n < 10 ? "1-9" : n < 50 ? "10-49" : n < 200 ? "50-199" : "200+");
  const stable = {
    class_count_bucket: bucket(classNames.length),
    counts_bucket: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, bucket(v)])),
    known_status_texts: statusTexts,
    // Sprint 2.1 — a assinatura passa a reagir também à estrutura funcional
    // (modo, colunas, ações, sinais logísticos) e não só a card/badge genéricos.
    layout_mode_hints: functional.layout_mode_hints,
    column_hint_count_bucket: bucket(functional.column_hints.length),
    action_labels: functional.action_labels,
    semantic_hints: functional.semantic_hints
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");

  return {
    captured_at: (meta && meta.capturedAt) || new Date().toISOString(),
    source_label: (meta && meta.sourceLabel) || "desconhecida",
    hash,
    stable_signature: stable,
    class_names_sample: classNames.slice(0, 40),
    candidate_status_texts: statusTexts,
    pii_like_attributes_flagged: piiFlags,
    functional_candidates: functional,
    // nunca persiste HTML bruto nem texto de conteúdo — só o que foi extraído acima
    persists_no_html: true
  };
}

/** Compara duas assinaturas; diverge = provável mudança de layout. */
function signaturesMatch(a, b) {
  if (!a || !b) return null; // sem assinatura conhecida ainda — não é match nem miss
  return a.hash === b.hash;
}

module.exports = {
  extractClassNames, candidateCounts, candidateStatusTexts, flagsPiiLikeAttributes,
  captureStructuralSignature, signaturesMatch,
  // Sprint 2.1
  tokenHints, candidateLayoutModeHints, candidateColumnHints, candidateActionLabels,
  candidateTimeTags, candidateSemanticHints, candidateUnitSelectorHints,
  candidateOverlayHints, candidateA11yAttributes, captureFunctionalCandidates
};
