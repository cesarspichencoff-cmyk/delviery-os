/* ============================================================================
 * Adaptador: relatório histórico de pedidos com itens (HTML já salvo).
 * ----------------------------------------------------------------------------
 * Lê arquivos que JÁ EXISTEM no projeto (exportados manualmente da sessão
 * autorizada do lojista). NÃO acessa a rede, NÃO automatiza a interface do
 * iFood, NÃO contorna autenticação — apenas lê arquivo local.
 *
 * Formato real observado (verificado):
 *   const ALL_ROWS = [ { dt, oid, oid_short, status, tv, nitens, itens_html, itens_search }, ... ]
 *   dt      "20/06/2026 11:05"
 *   status  CONCLUDED | DECLINED | CANCELLED
 *   tv      "R$ 90,99"
 *   nitens  "5 dist. / 7 un."
 *   itens_html "1x Nome\n1x Outro <em>(observacao)</em>"
 *
 * LIMITAÇÃO ESTRUTURAL: esta fonte não traz carimbo de "pronto" nem de "saída".
 * Por isso a saúde reportada é PARCIAL e snapshots derivados dela não podem
 * afirmar pedidos ativos nem convergência — só ritmo de chegada e composição.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const { normalizeHistoricalRow, PARSER_VERSION } = require("../../normalize/normalizer");

const COLLECTOR_VERSION = "historical-html-v1";

/** Estratégia 1: array JS embutido (formato "ALL_ROWS"). Não executa script. */
function extractRows(html) {
  const m = String(html).match(/(?:const|var|let)\s+ALL_ROWS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) {
    const g = String(html).match(/(?:const|var|let)\s+\w+\s*=\s*(\[\s*\{[\s\S]{200,}?\}\s*\])\s*;/);
    if (!g) return { rows: [], error: "array_de_dados_nao_encontrado" };
    try { return { rows: JSON.parse(g[1]) }; } catch (e) { return { rows: [], error: "json_invalido:" + e.message }; }
  }
  try { return { rows: JSON.parse(m[1]) }; }
  catch (e) { return { rows: [], error: "json_invalido:" + e.message }; }
}

const unescapeHtml = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();

/**
 * Estratégia 2: cards `order-card` (relatório diário).
 * O card traz apenas a HORA; a DATA vem do contexto do relatório (parâmetro
 * `reportDate`). Sem `reportDate` a linha é devolvida com `dt` nulo, para que a
 * normalização a rejeite explicitamente em vez de inventar um dia.
 */
function extractOrderCards(html, reportDate) {
  const rows = [];
  const text = String(html);
  const cards = text.split(/<div class="order-card/).slice(1);
  for (const card of cards) {
    const id = (card.match(/order-id-text"[^>]*>\s*#?([^<]+)</) || [])[1];
    if (!id) continue;
    const time = (card.match(/order-time"[^>]*>[^0-9]*(\d{1,2}:\d{2})/) || [])[1] || null;
    const status = (card.match(/badge badge-[a-z]+"[^>]*>\s*([A-Za-z]+)\s*</) || [])[1] || null;
    const total = (card.match(/order-total"[^>]*>\s*([^<]+)</) || [])[1] || null;

    const items = [];
    const re = /<td class="col-name">([^<]*)<\/td>\s*<td class="col-qty">\s*(\d+)\s*<\/td>/g;
    let it;
    while ((it = re.exec(card)) !== null) {
      items.push({ name: unescapeHtml(it[1]), qty: Number(it[2]) });
    }
    const obs = [];
    const reObs = /obs-text"[^>]*>([^<]*)</g;
    let ob;
    while ((ob = reObs.exec(card)) !== null) { const t = unescapeHtml(ob[1]); if (t) obs.push(t); }

    const units = items.reduce((a, x) => a + x.qty, 0);
    rows.push({
      dt: reportDate && time ? `${reportDate} ${time}` : null,
      oid: unescapeHtml(id),
      status,
      tv: total,
      nitens: items.length ? `${items.length} dist. / ${units} un.` : null,
      itens_html: items.map((x, i) => {
        const o = obs[i] ? ` <em>(${obs[i]})</em>` : "";
        return `${x.qty}x ${x.name}${o}`;
      }).join("\n")
    });
  }
  return { rows, error: rows.length ? null : "nenhum_order_card_encontrado" };
}

/** Deduz a data do relatório a partir do nome do arquivo/diretório (DD-MM ou YYYY-MM-DD). */
function inferReportDate(filePath) {
  const p = String(filePath).replace(/\\/g, "/");
  const iso = p.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = p.match(/_(\d{2})-(\d{2})\.html$/);
  if (br) {
    const y = (p.match(/(\d{4})/) || [])[1];
    if (y) return `${br[1]}/${br[2]}/${y}`;
  }
  return null;
}

/**
 * @param {string|string[]} files caminho(s) do HTML histórico
 * @param {object} [opts] { channel }
 */
function createHistoricalHtmlAdapter(files, opts) {
  const list = Array.isArray(files) ? files : [files];
  const options = opts || {};
  const issues = [];

  return {
    source: options.source || "historico_html",
    channel: options.channel || "iFood",
    collectorVersion: COLLECTOR_VERSION,
    parserVersion: PARSER_VERSION,
    files: list,
    issues,

    observe() {
      const out = [];
      for (const f of list) {
        if (!fs.existsSync(f)) { issues.push({ file: f, error: "arquivo_inexistente" }); continue; }
        let html;
        try { html = fs.readFileSync(f, "utf8"); }
        catch (e) { issues.push({ file: f, error: "falha_leitura:" + e.message }); continue; }
        // Estratégia 1: array embutido. Se não houver, tenta os cards do relatório diário.
        let { rows, error } = extractRows(html);
        if (error || !rows.length) {
          const reportDate = (options.reportDates && options.reportDates[f]) || inferReportDate(f);
          const cards = extractOrderCards(html, reportDate);
          if (cards.rows.length) {
            rows = cards.rows;
            error = null;
            if (!reportDate) issues.push({ file: f, error: "data_do_relatorio_desconhecida" });
          } else {
            issues.push({ file: f, error: error || cards.error });
            continue;
          }
        }
        for (const r of rows) out.push(Object.assign({ __file: f }, r));
      }
      return out;
    },

    normalizeRow(row, ctx) {
      return normalizeHistoricalRow(row, Object.assign({}, ctx, { source: this.source }));
    }
  };
}

module.exports = { createHistoricalHtmlAdapter, extractRows, extractOrderCards, inferReportDate, COLLECTOR_VERSION };
