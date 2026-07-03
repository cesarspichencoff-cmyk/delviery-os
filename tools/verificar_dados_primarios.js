/* Checagem rápida de segurança para data/raw/ e seus lotes em data/raw/incoming/.
 * Não lê nem interpreta o conteúdo dos arquivos — só confirma:
 *   1) o que existe fisicamente em cada lote;
 *   2) que NADA ali está rastreado pelo Git (a proteção real é o .gitignore; isto é
 *      uma segunda checagem, útil antes de um `git add` acidental).
 * Rodar: node tools/verificar_dados_primarios.js */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const RAW = path.join(REPO, "data", "raw");
const INCOMING = path.join(RAW, "incoming");

function listar(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f !== ".gitkeep");
}

function tamanho(p) {
  const kb = fs.statSync(p).size / 1024;
  return kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : kb.toFixed(0) + " KB";
}

console.log("=== data/raw/ (arquivos soltos, convenção fixa) ===");
for (const f of listar(RAW)) {
  if (f === "incoming") continue;
  console.log(`  ${f}  (${tamanho(path.join(RAW, f))})`);
}

console.log("\n=== data/raw/incoming/ (lotes recebidos, aguardando classificação/aprovação) ===");
for (const lote of listar(INCOMING)) {
  const dirLote = path.join(INCOMING, lote);
  if (!fs.statSync(dirLote).isDirectory()) continue;
  console.log(`  ${lote}/`);
  for (const f of listar(dirLote)) {
    console.log(`    ${f}  (${tamanho(path.join(dirLote, f))})`);
  }
}

console.log("\n=== checagem: nada em data/raw/ pode estar rastreado pelo Git ===");
let rastreado = "";
try {
  rastreado = execSync('git ls-files "data/raw"', { cwd: REPO, encoding: "utf8" });
} catch (e) {
  console.log("  (não foi possível checar — rode dentro de um clone git)");
}
const linhas = rastreado.split("\n").filter((l) => l.trim() && !l.endsWith(".gitkeep"));
if (linhas.length) {
  console.log("  ⚠ ATENÇÃO — arquivo de dado rastreado pelo Git dentro de data/raw/:");
  linhas.forEach((l) => console.log("    " + l));
  console.log("  Isso não deveria acontecer. Veja docs/Politica_Dados.md antes de commitar.");
} else {
  console.log("  OK — só .gitkeep (ou nada) rastreado dentro de data/raw/.");
}

console.log("\nPróximo passo (se ainda não feito): registrar cada lote em docs/Inventario_Dados_Primarios.md");
console.log("antes de escrever qualquer parser — ver docs/Politica_Dados.md.");
