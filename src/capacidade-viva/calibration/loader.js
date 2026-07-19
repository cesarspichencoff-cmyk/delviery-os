/* ============================================================================
 * Loader somente-leitura de fontes DeliveryOS (nunca modifica origem).
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { stamp } = require("./labels");

async function loadJsonl(filePath, opts) {
  const limit = (opts && opts.limit) || Infinity;
  const rows = [];
  if (!fs.existsSync(filePath)) {
    return stamp({ ok: false, error: "file_not_found", path: filePath, rows: [] });
  }
  const st = fs.statSync(filePath);
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let n = 0;
  let parseErrors = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
      n++;
      if (n >= limit) break;
    } catch (e) {
      parseErrors++;
    }
  }
  return stamp({
    ok: true,
    path: path.resolve(filePath),
    bytes: st.size,
    rows,
    count: rows.length,
    parse_errors: parseErrors,
    modified_source: false
  });
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return stamp({ ok: false, error: "file_not_found", path: filePath });
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return stamp({
    ok: true,
    path: path.resolve(filePath),
    bytes: Buffer.byteLength(raw),
    data: JSON.parse(raw),
    modified_source: false
  });
}

/**
 * Inventário estático das fontes conhecidas (caminhos absolutos opcionais).
 */
function inventoryKnownSources(paths) {
  const p = paths || {};
  const candidates = [
    {
      id: "ifood_real_jsonl",
      path: p.ifood_real || "C:\\Users\\italo\\Desktop\\Claude\\delviery-os\\data\\ifood_real.jsonl",
      format: "jsonl",
      expected_kind: "real_transitions",
      description: "Transições Camada 0 derivadas do relatório iFood"
    },
    {
      id: "itens_jun20_30",
      path:
        p.itens ||
        "C:\\Users\\italo\\Desktop\\Claude\\delviery-os\\data\\generated\\itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl",
      format: "jsonl",
      expected_kind: "real_items",
      description: "Itens por pedido (parser HTML/export) jun/20–30"
    },
    {
      id: "itens_2026_07_01",
      path:
        p.itens_0701 ||
        "C:\\Users\\italo\\Desktop\\Claude\\delviery-os\\data\\generated\\itens_pedido_reais_2026-07-01.jsonl",
      format: "jsonl",
      expected_kind: "real_items",
      description: "Itens por pedido 2026-07-01"
    },
    {
      id: "cardapio_seed",
      path: p.cardapio || path.join(__dirname, "..", "..", "..", "data", "cardapio_knowledge_seed.json"),
      format: "json",
      expected_kind: "real_menu_knowledge",
      description: "Cardápio knowledge seed (199 itens, praças)"
    },
    {
      id: "v1_janela_real",
      path:
        p.janela ||
        "C:\\Users\\italo\\Desktop\\Claude\\delviery-os\\data\\generated\\v1_janela_real.json",
      format: "json",
      expected_kind: "real_window",
      description: "Janela real V1 (replay interface)"
    },
    {
      id: "raw_ifood_xlsx",
      path: p.raw_xlsx || "C:\\Users\\italo\\Desktop\\Claude\\delviery-os\\data\\raw\\relatorio_pedidos_ifood.xlsx",
      format: "xlsx",
      expected_kind: "real_raw",
      description: "Export bruto iFood (não parseado nesta fase sem xlsx)"
    },
    {
      id: "cv_items_demo",
      path: path.join(__dirname, "..", "..", "..", "data", "capacidade-viva", "fixtures", "items-demo.json"),
      format: "json",
      expected_kind: "synthetic_fixture",
      description: "Fixture Capacidade Viva (sintético rotulado)"
    },
    {
      id: "copiloto_fixtures",
      path: path.join(__dirname, "..", "..", "..", "mocks", "copiloto", "fixtures"),
      format: "dir",
      expected_kind: "synthetic_fixture",
      description: "Fixtures inteligência Copiloto (sintético)"
    }
  ];

  return stamp({
    sources: candidates.map((c) => {
      const exists = fs.existsSync(c.path);
      let size = null;
      let mtime = null;
      if (exists) {
        try {
          const st = fs.statSync(c.path);
          size = st.size;
          mtime = st.mtime.toISOString();
        } catch (e) {
          /* ignore */
        }
      }
      return Object.assign({}, c, { exists, size_bytes: size, mtime });
    }),
    six_months_local: false,
    note: "Histórico local encontrado é de ~1 mês (maio–jun/2026), não seis meses completos. Sem fabricação."
  });
}

module.exports = {
  loadJsonl,
  loadJson,
  inventoryKnownSources
};
