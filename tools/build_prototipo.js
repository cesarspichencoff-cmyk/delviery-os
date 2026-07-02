/* Monta o protótipo a partir das FONTES ÚNICAS (nada de cardápio inline inventado):
 *   window.NIGHT (dado da noite, já embutido) + cardapio_knowledge_seed.json + motor.js + app.js
 * O index.html vira uma casca: <head/style/body> + night-data + [SEED + MOTOR + APP] injetados.
 * Idempotente (marcadores APP:START/END). Rode sempre que motor.js/app.js/seed mudarem. */
const fs = require("fs");
const REPO = "C:/Users/italo/Desktop/Claude/delviery-os";
const IDX  = REPO + "/prototipos/parados-agora/index.html";
const seed  = fs.readFileSync(REPO + "/data/cardapio_knowledge_seed.json", "utf8");
const motor = fs.readFileSync(REPO + "/src/perfil-delivery/motor.js", "utf8");
const dec   = fs.readFileSync(REPO + "/src/perfil-delivery/decisao.js", "utf8");
const app   = fs.readFileSync(REPO + "/prototipos/parados-agora/app.js", "utf8");
for (const [n,s] of [["motor",motor],["decisao",dec],["app",app]]) if (s.indexOf("</script>")>=0) throw new Error(n+" contém </script> — abortando injeção");

const block =
  "<!--APP:START (gerado por tools/build_prototipo.js — NÃO editar aqui; editar as fontes)-->\n" +
  "<script>window.CARDAPIO_SEED=" + seed + ";</script>\n" +
  "<script>/* cérebro: src/perfil-delivery/motor.js */\n" + motor + "\n</script>\n" +
  "<script>/* camada de decisão: src/perfil-delivery/decisao.js */\n" + dec + "\n</script>\n" +
  "<script>/* casca: prototipos/parados-agora/app.js */\n" + app + "\n</script>\n" +
  "<!--APP:END-->";

let html = fs.readFileSync(IDX, "utf8");
if (html.indexOf("<!--APP:START") >= 0) {
  html = html.replace(/<!--APP:START[\s\S]*?<!--APP:END-->/, block);
} else {
  // primeira vez: remove o <script> principal antigo (o que contém "const NIGHT=(window.NIGHT")
  const anchor = html.indexOf("const NIGHT=(window.NIGHT");
  if (anchor < 0) throw new Error("âncora do script principal não encontrada");
  const open  = html.lastIndexOf("<script>", anchor);
  const close = html.indexOf("</script>", anchor) + "</script>".length;
  html = html.slice(0, open) + block + html.slice(close);
}
fs.writeFileSync(IDX, html, "utf8");
console.log("PROTÓTIPO montado. index.html agora " + html.length + " bytes.");
console.log("inline CARDAPIO antigo presente? ", /const CARDAPIO=\[/.test(html));
console.log("window.CARDAPIO_SEED presente? ", /window\.CARDAPIO_SEED=/.test(html));
console.log("MOTOR presente? ", /root\.MOTOR = API/.test(html));
