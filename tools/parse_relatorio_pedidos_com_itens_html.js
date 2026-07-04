/* ============================================================================
 * PARSER EXPLORATÓRIO — relatorio_pedidos_com_itens (formato ALL_ROWS)
 * ----------------------------------------------------------------------------
 * Formato NOVO, diferente do relatorio_pedidos_01-07.html (order-cards):
 * aqui os dados vivem num array JS `const ALL_ROWS = [...]`, um objeto por
 * PEDIDO, com itens embutidos em `itens_html` ("1x Item\n2x Item <em>(obs)</em>").
 *
 * DESCOBERTA: este formato TEM observação do cliente (o de 01/07 não tinha).
 * NÃO TEM preço por item (só valor total do pedido) — preco_unitario: null,
 * motivo explícito, nunca inventado.
 * `oid_short` do arquivo é PREFIXO do uuid, NÃO o ID curto do iFood.
 *
 * Uso:  node tools/parse_relatorio_pedidos_com_itens_html.js [caminho.html]
 * Padrão: data/raw/incoming/ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html
 * Saída: data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl (fora do Git)
 * Valida contra os KPIs do próprio HTML e ABORTA se não bater exato.
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const REPO = path.join(__dirname, "..");
const PARSER_VERSAO = "parse_relatorio_pedidos_com_itens_html v1 (2026-07-03)";

const ARQ = process.argv[2] || path.join(REPO, "data/raw/incoming/ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html");
const OUT = path.join(REPO, "data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl");
const html = fs.readFileSync(ARQ, "utf8");
const hashOrigem = crypto.createHash("md5").update(html).digest("hex");

// ---------- extrair KPIs do header (verdade do próprio arquivo) ----------
const kpiNums = [...html.matchAll(/<div class="num">([\d,.]+)<\/div>\s*<div class="lbl">([^<]+)<\/div>/g)]
  .map(m => ({ n: parseInt(m[1].replace(/[,.]/g, ""), 10), lbl: m[2].trim() }));
const KPI = {};
for (const k of kpiNums) KPI[k.lbl] = k.n;
console.log("KPIs do próprio HTML:", JSON.stringify(KPI));

// ---------- extrair ALL_ROWS ----------
const iniMark = "const ALL_ROWS = ";
const i0 = html.indexOf(iniMark);
if (i0 < 0) { console.log("ERRO: ALL_ROWS não encontrado — formato inesperado."); process.exit(1); }
const iArr = html.indexOf("[", i0);
const iEnd = html.indexOf("}];", iArr);
if (iEnd < 0) { console.log("ERRO: fim do ALL_ROWS não encontrado."); process.exit(1); }
const rows = JSON.parse(html.slice(iArr, iEnd + 2));
console.log("ALL_ROWS parseado:", rows.length, "pedidos");

// ---------- explodir itens ----------
// linha de item: "2x Nome do Item" + opcional " <em>(observação)</em>"
function parseItens(itensHtml) {
  const out = [];
  // observações podem ter \n DENTRO de <em>(...)</em> — proteger antes de dividir por linha
  // (bug pego na validação com o seed: 3 obs multilinha viravam pseudo-itens)
  const protegido = String(itensHtml || "").replace(/<em>\(([\s\S]*?)\)<\/em>/g, (_, o) => "<em>(" + o.replace(/\n/g, " ") + ")</em>");
  for (const linha of protegido.split("\n")) {
    const l = linha.trim();
    if (!l) continue;
    const m = l.match(/^(\d+)x\s+(.*)$/);
    if (!m) { out.push({ qtd: null, nome: l.replace(/<em>\((.*)\)<\/em>/, "").trim(), obs: null, linha_crua: l, aviso: "linha sem padrão Nx" }); continue; }
    let resto = m[2];
    let obs = null;
    const mObs = resto.match(/<em>\((.*)\)<\/em>\s*$/s);
    if (mObs) { obs = mObs[1].trim(); resto = resto.slice(0, mObs.index).trim(); }
    out.push({ qtd: parseInt(m[1], 10), nome: resto.trim(), obs });
  }
  return out;
}
function parseValor(tv) { // "R$ 90,99" → 90.99
  const m = String(tv || "").match(/R\$\s*([\d.]+),(\d{2})/);
  return m ? parseFloat(m[1].replace(/\./g, "") + "." + m[2]) : null;
}

const linhas = [];
let semItem = 0, semQtd = 0, comObs = 0;
const pedComObs = new Set();
for (const r of rows) {
  const itens = parseItens(r.itens_html);
  if (!itens.length) { semItem++; continue; }
  for (const it of itens) {
    if (it.qtd == null) semQtd++;
    if (it.obs) { comObs++; pedComObs.add(r.oid); }
    linhas.push({
      pedido_id: r.oid,
      pedido_id_curto: null, // oid_short do arquivo é prefixo do uuid, NÃO o ID curto do iFood — não confundir
      data_hora: r.dt,
      status: r.status,
      valor_total: parseValor(r.tv),
      item_nome: it.nome,
      quantidade: it.qtd,
      preco_unitario: null,
      total_item: null,
      motivo_preco_nulo: "arquivo não contém preço por item",
      observacao: it.obs,
      origem: "relatorio_pedidos_com_itens_html",
      arquivo_origem: path.basename(ARQ),
      hash_origem: hashOrigem,
      confianca: it.qtd == null ? "baixa" : "alta",
      parser_versao: PARSER_VERSAO,
    });
  }
}

// ---------- validação contra os KPIs do próprio arquivo ----------
const porStatus = {}; const idsVistos = new Set(); let dup = 0;
for (const r of rows) { porStatus[r.status] = (porStatus[r.status] || 0) + 1; if (idsVistos.has(r.oid)) dup++; idsVistos.add(r.oid); }
const okTotal = rows.length === KPI["Total Pedidos"];
const okConc = (porStatus["CONCLUDED"] || 0) === KPI["Concluídos"];
const okCanc = (porStatus["CANCELLED"] || 0) === KPI["Cancelados"];
const okDecl = (porStatus["DECLINED"] || 0) === KPI["Recusados"];
console.log("\n=== VALIDAÇÃO contra KPIs do HTML ===");
console.log("total:", rows.length, okTotal ? "✓" : "✗ ESPERADO " + KPI["Total Pedidos"]);
console.log("concluídos:", porStatus["CONCLUDED"] || 0, okConc ? "✓" : "✗");
console.log("cancelados:", porStatus["CANCELLED"] || 0, okCanc ? "✓" : "✗");
console.log("recusados:", porStatus["DECLINED"] || 0, okDecl ? "✓" : "✗");
console.log("status desconhecidos:", Object.keys(porStatus).filter(s => !["CONCLUDED", "CANCELLED", "DECLINED"].includes(s)));
console.log("IDs duplicados:", dup);
if (!(okTotal && okConc && okCanc && okDecl) || dup > 0) { console.log("\nABORTADO: extração não bate com os KPIs do próprio arquivo."); process.exit(1); }

// datas dentro do período?
let foraPeriodo = 0;
for (const r of rows) { const m = String(r.dt).match(/^(\d{2})\/(\d{2})\/2026/); if (!m || m[2] !== "06" || +m[1] < 20 || +m[1] > 30) foraPeriodo++; }
// valores
const semValor = rows.filter(r => parseValor(r.tv) == null).length;

const unidades = linhas.reduce((a, l) => a + (l.quantidade || 0), 0);
const cancComItens = rows.filter(r => r.status === "CANCELLED" && parseItens(r.itens_html).length).length;
const declComItens = rows.filter(r => r.status === "DECLINED" && parseItens(r.itens_html).length).length;
console.log("\n=== NÚMEROS DA EXTRAÇÃO ===");
console.log("itens (linhas jsonl):", linhas.length, "| unidades:", unidades);
console.log("pedidos sem item:", semItem, "| itens sem quantidade:", semQtd);
console.log("observações extraídas:", comObs, "| pedidos com observação:", pedComObs.size, "(" + (100 * pedComObs.size / rows.length).toFixed(1) + "%)");
console.log("cancelados com itens:", cancComItens + "/" + (porStatus["CANCELLED"] || 0), "| recusados com itens:", declComItens + "/" + (porStatus["DECLINED"] || 0));
console.log("datas fora do período 20-30/06:", foraPeriodo, "| pedidos sem valor total:", semValor);

fs.writeFileSync(OUT, linhas.map(l => JSON.stringify(l)).join("\n") + "\n", "utf8");
console.log("\nsaída:", path.relative(REPO, OUT), "(" + linhas.length + " linhas, fora do Git)");
