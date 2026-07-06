/* Servidor estático mínimo p/ a Interface V1 (app-v1). Zero dependências.
   Serve a RAIZ do repo porque o app carrega o cérebro real de src/perfil-delivery/
   e os dados de data/ — nada é duplicado dentro da interface.
   Uso: node tools/servir_v1.js  →  http://localhost:5179/  (celular: IP da máquina) */
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const DIR = path.join(__dirname, "..");
const PORT = 5179;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jsonl": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") { res.writeHead(302, { Location: "/app-v1/index.html" }); res.end(); return; }
  const f = path.join(DIR, p);
  if (!f.startsWith(DIR)) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(d);
  });
}).listen(PORT, "0.0.0.0", () => {
  const ips = [].concat(...Object.values(os.networkInterfaces())).filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("Interface V1: http://localhost:" + PORT + "/" + (ips.length ? "  ·  no celular: http://" + ips[0] + ":" + PORT + "/" : ""));
});
