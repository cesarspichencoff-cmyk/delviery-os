/**
 * Q-026 Product UI SHADOW contract. Standalone Node test: the UI is browser
 * ESM even though repository package.json uses commonjs. Import a data: URL
 * so we test the real module code without changing package type or serving a
 * fake browser network. Assertions on app.js wiring guard integration.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {resolve}=require("node:path");
const load=async(file)=>{
 const src=fs.readFileSync(resolve(file),"utf8");
 return import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
};
void (async()=>{
 const {falhaDeLeituraHttp,mensagemDeSobrecarga}=await load("src/product/ui/http-leitura.js");
 const queued=falhaDeLeituraHttp(503,"1");
 assert.equal(queued.status,503);
 assert.equal(queued.retryAfterSegundos,1);
 const old=mensagemDeSobrecarga(queued,true);
 const first=mensagemDeSobrecarga(queued,false);
 assert.ok(old.includes("continua visível e envelhecendo"));
 assert.ok(!old.toLowerCase().includes("zero entregas"));
 assert.ok(!old.includes("http://"));
 assert.ok(old.includes("1 segundo(s)"));
 assert.ok(first.includes("Isso não significa que não haja entregas"));
 assert.ok(!first.includes("leitura anterior continua visível"));
 assert.equal(mensagemDeSobrecarga(falhaDeLeituraHttp(500,null),true),null);
 assert.equal(mensagemDeSobrecarga(falhaDeLeituraHttp(200,null),false),null);
 const invalid=falhaDeLeituraHttp(503,"hacked <script>alert(1)</script>");
 const invalidMessage=mensagemDeSobrecarga(invalid,false);
 assert.ok(invalidMessage.includes("Tente novamente em instantes"));
 assert.ok(!invalidMessage.includes("<script>"));
 assert.equal(falhaDeLeituraHttp(503,"9999").retryAfterSegundos,null);
 assert.equal(falhaDeLeituraHttp(503,"0").retryAfterSegundos,null);
 assert.equal(falhaDeLeituraHttp(429,"10").retryAfterSegundos,null);
 const app=fs.readFileSync("src/product/ui/app.js","utf8");
 assert.ok(app.includes('import { falhaDeLeituraHttp, mensagemDeSobrecarga } from "./http-leitura.js";'));
 assert.ok(app.includes('if (!r.ok) throw falhaDeLeituraHttp(r.status, r.headers.get("Retry-After"));'));
 assert.ok(app.includes('const sobrecarga = rota === "/entregas" ? mensagemDeSobrecarga(e, true) : null;'));
 assert.ok(app.includes('const sobrecarga = rota === "/entregas" ? mensagemDeSobrecarga(e, false) : null;'));
 assert.ok(app.includes('if (geracao !== estado.geracao) return;'));
 assert.ok(app.includes('delete rua.dataset.relendo;'));
 assert.ok(app.includes('botoes.forEach((b) => b.removeAttribute("aria-disabled"));'));
 assert.ok(app.includes('const vm = await obter(apiDaRota(rota));'));
 // Non-503/non-Entregas errors retain the existing fallback.
 assert.ok(app.includes("Nao foi possivel ler de novo"));
 console.log("Q026_PRODUCT_UI_503_SHADOW_PASS "+JSON.stringify({
   tests:24,overload_503:true,retry_after_validated:true,
   stale_reading_preserved:true,initial_error_no_false_zero:true,
   non_overload_unchanged:true,no_http_url_or_script_in_message:true,
   actual_product_ui_wiring_present:true,
   scope:"static browser ESM module + app.js wiring, not live browser"
 }));
})().catch(e=>{console.error("Q026_PRODUCT_UI_503_SHADOW_FAILED",e);process.exitCode=1});
