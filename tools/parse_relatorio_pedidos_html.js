/* ============================================================================
 * PARSER EXPLORATÓRIO — Relatório de Pedidos HTML (item-a-item) do iFood
 * ----------------------------------------------------------------------------
 * Status: EXPLORATÓRIO. Não integrado ao motor, não integrado ao backtest oficial,
 * não altera `data/cardapio_knowledge_seed.json` nem qualquer baseline.
 *
 * Lê um relatório HTML de "Todos os Pedidos do Dia" (o tipo `relatorio_pedidos_*.html`
 * recebido do iFood — ver docs/Inventario_Dados_Primarios.md) e extrai, por regex
 * (o arquivo não é gerado por JS dinâmico — todo o dado já está no HTML estático):
 *   pedido_id, data, horario, status, item_nome, quantidade, preco_unitario,
 *   total_item, observacao, origem, confianca, arquivo_origem
 *
 * Regra de honestidade (igual ao resto do projeto): campo que não existe na fonte
 * fica `null`, nunca inventado. Este relatório NÃO tem observação do cliente —
 * o campo é mantido no schema (compatibilidade com o formato-ponte já existente
 * em docs/Formato_Importacao_Itens_Reais.md) e sai sempre `null` aqui.
 *
 * Uso:
 *   node tools/parse_relatorio_pedidos_html.js [caminho.html] [caminho-saida.jsonl]
 *   sem argumentos: usa o lote padrão desta exploração (01/07/2026).
 * ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const IN = process.argv[2] || path.join(REPO, "data", "raw", "incoming", "ifood_2026-07-01", "relatorio_pedidos_01-07.html");
const OUT = process.argv[3] || path.join(REPO, "data", "generated", "itens_pedido_reais_2026-07-01.jsonl");
const ARQUIVO_ORIGEM = path.basename(IN);

if (!fs.existsSync(IN)) {
  console.log(`ERRO: arquivo não encontrado: ${IN}`);
  console.log("Coloque o relatório em data/raw/incoming/<lote>/ (ver docs/Politica_Dados.md) ou passe o caminho como argumento.");
  process.exit(1);
}

const html = fs.readFileSync(IN, "utf8");

// data do relatório (uma só, vale para todos os pedidos do arquivo)
const mData = html.match(/cover-title">Relat[oó]rio de Pedidos[^\d]*(\d{2}\/\d{2}\/\d{4})/);
const DATA_RELATORIO = mData ? mData[1] : null;
if (!DATA_RELATORIO) console.log("AVISO: não achei a data no cabeçalho (cover-title) — campo 'data' sairá null em tudo.");

function moeda(txt) {
  if (txt == null) return null;
  const n = Number(String(txt).replace(/[^\d,.-]/g, "").replace(".", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------- localizar cada order-card (blocos não aninhados, sequenciais) ----------
const inicios = [];
const reInicio = /<div class="order-card status-(\w+)">/g;
let m;
while ((m = reInicio.exec(html))) inicios.push({ idx: m.index, status_classe: m[1] });

const blocos = inicios.map((cur, i) => {
  const fim = i + 1 < inicios.length ? inicios[i + 1].idx : html.indexOf("<!-- ====== TOP", cur.idx);
  return { status_classe: cur.status_classe, texto: html.slice(cur.idx, fim > 0 ? fim : undefined) };
});

// ---------- extrair campos de cada bloco ----------
const STATUS_MAP = { concluded: "CONCLUDED", declined: "DECLINED", cancelled: "CANCELLED" };
const linhas = [];
const relatorioPedidos = []; // para validação: 1 registro por pedido, com contagem de itens

for (const b of blocos) {
  const idMatch = b.texto.match(/order-id-text">#([a-f0-9-]+)/);
  const horaMatch = b.texto.match(/order-time">[^\d]*(\d{2}:\d{2})/);
  const badgeMatch = b.texto.match(/badge badge-\w+">([A-Z]+)</);
  const totalMatch = b.texto.match(/order-total">R\$\s*([\d.,]+)/);

  const pedido_id = idMatch ? idMatch[1] : null;
  const horario = horaMatch ? horaMatch[1] : null;
  const status = badgeMatch ? badgeMatch[1] : (STATUS_MAP[b.status_classe] || null);
  const total_pedido = totalMatch ? moeda(totalMatch[1]) : null;

  if (!pedido_id) continue; // bloco inaproveitável — não deveria acontecer, mas nunca inventar ID

  const reItem = /<td class="col-num">\d+<\/td>\s*<td class="col-name">([^<]*)<\/td>\s*<td class="col-qty">([^<]*)<\/td>\s*<td class="col-price">([^<]*)<\/td>\s*<td class="col-total">([^<]*)<\/td>/g;
  let it, nItens = 0;
  while ((it = reItem.exec(b.texto))) {
    nItens++;
    const item_nome = it[1].trim();
    const quantidade = Number.isFinite(Number(it[2].trim())) ? Number(it[2].trim()) : null;
    const preco_unitario = moeda(it[3]);
    const total_item = moeda(it[4]);
    let confianca = "alta";
    if (quantidade == null || preco_unitario == null || !item_nome) confianca = "baixa";
    linhas.push({
      pedido_id, data: DATA_RELATORIO, horario, status,
      item_nome: item_nome || null, quantidade, preco_unitario, total_item,
      observacao: null, // confirmado ausente na fonte (ver Inventario_Dados_Primarios.md)
      origem: "relatorio_pedidos_html", confianca, arquivo_origem: ARQUIVO_ORIGEM,
    });
  }
  relatorioPedidos.push({ pedido_id, status, horario, total_pedido, n_itens: nItens });
}

// ---------- escrever JSONL ----------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, linhas.map((l) => JSON.stringify(l)).join("\n") + (linhas.length ? "\n" : ""), "utf8");

// ---------- validações (impressas no console; não gravam nada além do jsonl) ----------
const idsUnicos = new Set(relatorioPedidos.map((p) => p.pedido_id));
const duplicados = relatorioPedidos.length - idsUnicos.size;
const semItem = relatorioPedidos.filter((p) => p.n_itens === 0);
const itensSemQtd = linhas.filter((l) => l.quantidade == null);
const itensSemPreco = linhas.filter((l) => l.preco_unitario == null);
const porStatus = {};
relatorioPedidos.forEach((p) => (porStatus[p.status || "(desconhecido)"] = (porStatus[p.status || "(desconhecido)"] || 0) + 1));

console.log(`=== PARSER EXPLORATÓRIO — ${ARQUIVO_ORIGEM} ===`);
console.log(`data do relatório: ${DATA_RELATORIO}`);
console.log(`pedidos encontrados (order-card): ${relatorioPedidos.length}`);
console.log(`itens extraídos (linhas do jsonl): ${linhas.length}`);
console.log(`IDs de pedido únicos: ${idsUnicos.size} | duplicados: ${duplicados}`);
console.log(`status encontrados: ${JSON.stringify(porStatus)}`);
console.log(`pedidos sem nenhum item: ${semItem.length}${semItem.length ? " → " + semItem.map((p) => p.pedido_id).join(", ") : ""}`);
console.log(`itens sem quantidade (confiança baixa): ${itensSemQtd.length}`);
console.log(`itens sem preço unitário (confiança baixa): ${itensSemPreco.length}`);
console.log(`observações extraídas: 0 (campo não existe nesta fonte — sempre null)`);
console.log(`saída: ${OUT}`);
console.log("\nExemplos reais (3 primeiras linhas do jsonl):");
linhas.slice(0, 3).forEach((l) => console.log("  " + JSON.stringify(l)));
