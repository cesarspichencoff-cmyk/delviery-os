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

  // faixas, não números exatos, para não invalidar a assinatura a cada pedido novo/removido
  const bucket = (n) => (n === 0 ? "0" : n < 10 ? "1-9" : n < 50 ? "10-49" : n < 200 ? "50-199" : "200+");
  const stable = {
    class_count_bucket: bucket(classNames.length),
    counts_bucket: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, bucket(v)])),
    known_status_texts: statusTexts
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
  captureStructuralSignature, signaturesMatch
};
