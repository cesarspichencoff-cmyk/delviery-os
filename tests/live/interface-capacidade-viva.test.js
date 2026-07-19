/* ============================================================================
 * Fase 2C — Capacidade Viva conectada à superfície V3.3: ORDEM DE VERDADE.
 * Sobe o servidor real e prova, pelo mesmo caminho do browser:
 *   fonte saudável → Calmo · fonte ausente ≠ Calmo · confiança insuficiente
 *   bloqueia recomendação · exceção crítica → intervenção específica · pausa
 *   seletiva antes da geral · pausa nunca automática · recuperação · feedback
 *   · previsão honesta · QA de Capacidade Viva só em modo dev.
 * ==========================================================================*/
"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..");
const PORT = 5430 + (process.pid % 200);
const BASE = `http://127.0.0.1:${PORT}`;

let servidor = null;

async function esperarServidor(tentativas) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(BASE + "/api/config");
      if (r.ok) return await r.json();
    } catch { /* subindo */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("servidor_v1_nao_subiu");
}

const postJson = async (rota, body) => {
  const r = await fetch(BASE + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  servidor = spawn(process.execPath, [path.join(RAIZ, "tools", "servir_v1.js")], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORT), DELIVERYOS_LIVE_SOURCE: "simulator" },
    stdio: "ignore"
  });
  await esperarServidor(40);
});

after(() => {
  if (servidor) servidor.kill();
});

test("ordem de verdade: fonte saudável produz janela ready (Calmo possível)", async () => {
  const pl = await (await fetch(BASE + "/api/fonte?cenario=foco")).json();
  assert.equal(pl.source_status, "ready");
  assert.ok(pl.janela && pl.janela.NIGHT.length > 0);
});

test("ordem de verdade: fonte fora de ready NUNCA entrega janela como atual", async () => {
  for (const estado of ["degraded", "stale", "disconnected", "failed", "stopped", "initializing"]) {
    const pl = await (await fetch(BASE + "/api/fonte?estado=" + estado)).json();
    assert.notEqual(pl.source_status, "ready", estado);
    assert.equal(pl.janela, null, "janela vazou como atual em " + estado);
  }
  // degradado com snapshot: último confiável aparece DATADO, nunca como janela
  const deg = await (await fetch(BASE + "/api/fonte?estado=degraded")).json();
  assert.ok(deg.ultimo_confiavel && deg.ultimo_confiavel.dia_local);
  assert.match(deg.ultimo_confiavel.aviso, /antigo|nao representa/i);
});

test("leitura viva: operação controlável → observar (nada de pausa)", async () => {
  const { body } = await postJson("/api/capacidade-viva/leitura", {
    pracas: { quentes: { sev: 0 }, sushi: { sev: 0 } }, orders: [], confianca: "media"
  });
  assert.equal(body.intervencao.action, "observar");
  assert.equal(body.excecoes.count, 0);
  assert.equal(body.complexidade_itens, "nao_avaliada_v01");
});

test("leitura viva: exceção crítica gera intervenção específica mesmo com volume controlável", async () => {
  const { body } = await postJson("/api/capacidade-viva/leitura", {
    pracas: { quentes: { sev: 0 } },
    orders: [{ id: "X1", pronto: true, age_min: 11 }],
    confianca: "media"
  });
  assert.ok(body.excecoes.count > 0, "exceção não detectada");
  assert.equal(body.excecoes.items[0].type, "pronto_parado");
  assert.equal(body.intervencao.action, "finalizar_pedidos_motoboy_esperando");
});

test("leitura viva: pausa seletiva antes da geral, nunca automática", async () => {
  const { body } = await postJson("/api/capacidade-viva/leitura", {
    pracas: { quentes: { sev: 3 } }, orders: [], confianca: "media"
  });
  assert.equal(body.intervencao.action, "pausa_seletiva");
  assert.equal(body.intervencao.next_if_fails, "pausa_geral");
  assert.equal(body.intervencao.auto_apply, false);
  assert.equal(body.intervencao.requires_human_confirmation, true);
});

test("leitura viva: confiança insuficiente BLOQUEIA recomendação", async () => {
  const { body } = await postJson("/api/capacidade-viva/leitura", {
    pracas: { quentes: { sev: 2 } }, orders: [], confianca: "baixa"
  });
  assert.equal(body.intervencao.bloqueio_confianca, true);
  assert.match(body.intervencao.reason, /leitura suficiente/i);
  assert.equal(body.intervencao.action, "observar");
});

test("avaliar: pausa geral só como última alternativa configurada, nunca automática", async () => {
  const p = await (await fetch(BASE + "/api/capacidade-viva/avaliar?quentes=1&env=40&seletiva=0")).json();
  assert.equal(p.avaliacao.intervencao.action, "pausa_geral");
  assert.equal(p.avaliacao.intervencao.auto_apply, false);
  const pSel = await (await fetch(BASE + "/api/capacidade-viva/avaliar?quentes=1&env=40")).json();
  assert.equal(pSel.avaliacao.intervencao.action, "pausa_seletiva", "seletiva vem antes da geral");
});

test("avaliar: exceções críticas dos cenários dev citam o pedido concreto", async () => {
  const casos = [["comanda", "verificar_comanda_ausente"], ["alocado", "chamar_ou_cobrar_motoboy"], ["motoboy", "finalizar_pedidos_motoboy_esperando"]];
  for (const [ex, acao] of casos) {
    const p = await (await fetch(BASE + "/api/capacidade-viva/avaliar?ex=" + ex + "&quentes=12&sushi=10&conferencia=8")).json();
    assert.equal(p.avaliacao.intervencao.action, acao, ex);
    assert.ok(p.avaliacao.excecoes.items[0].order_id, "exceção sem pedido concreto: " + ex);
    assert.equal(p.simulated_fixtures, true, "fixtures devem vir rotuladas");
  }
});

test("recuperação: classificador real produz as seis classes com tradução humana", async () => {
  const esperado = {
    liquida: ["recuperacao_liquida", /voltou ao ritmo/i],
    parcial: ["melhora_parcial", /ainda exige atenção/i],
    sem: ["sem_resultado", /não produziu/i],
    deslocou: ["deslocou_problema", /começou a pressionar/i],
    insuficiente: ["dados_insuficientes", /leitura suficiente/i],
    nao_executada: ["acao_nao_executada", /não chegou a ser executada/i]
  };
  for (const [caso, [outcome, re]] of Object.entries(esperado)) {
    const r = await (await fetch(BASE + "/api/capacidade-viva/recuperacao?caso=" + caso)).json();
    assert.equal(r.outcome, outcome, caso);
    assert.match(r.copy, re, caso);
    assert.equal(r.not_employee_evaluation, true);
  }
});

test("feedback humano: registra opções válidas e rejeita inválidas", async () => {
  const ok = await postJson("/api/capacidade-viva/feedback", { choice: "ajudou_parcialmente", observation: "teste 2C" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.persistence, "memoria_da_sessao_do_servidor");
  const ruim = await postJson("/api/capacidade-viva/feedback", { choice: "nota_10" });
  assert.equal(ruim.status, 400);
  assert.equal(ruim.body.ok, false);
});

test("previsão: histórico insuficiente nunca vira precisão falsa", async () => {
  const f = await (await fetch(BASE + "/api/inteligencia/forecast?area=quentes&hist=3")).json();
  assert.match(f.text, /leitura suficiente/i);
  assert.equal(f.confidence.level, "baixa");
});

test("previsão: com histórico real devolve intervalo condicional e confiança separada", async () => {
  const f = await (await fetch(BASE + "/api/inteligencia/forecast?area=quentes&hist=2,3,4,5,6,7,8")).json();
  assert.equal(f.conditional, "se nada mudar");
  assert.ok(f.confidence && f.confidence.visual === "confidence");
  assert.match(f.note, /estimativa, não certeza/);
});

test("ação acompanhada: engine real com responsável funcional, nunca ranking", async () => {
  const a = await (await fetch(BASE + "/api/inteligencia/action?area=quentes&state=aceita")).json();
  assert.equal(a.stateLabel, "Aceita");
  assert.equal(a.simulated, false);
  assert.equal(a.responsible.note, "função, não ranking");
  assert.equal(a.onlyCurrent, true);
});

test("QA de Capacidade Viva: 20 cenários no catálogo, oculto sem flag dev", () => {
  delete require.cache[require.resolve(path.join(RAIZ, "app-v1", "v33-mocks.js"))];
  require(path.join(RAIZ, "app-v1", "v33-mocks.js"));
  const cat = global.V33_MOCKS.QA_CATALOG;
  const cv = cat.filter((i) => i.id.indexOf("cv_") === 0);
  assert.equal(cv.length, 20, "esperados 20 cenários de Capacidade Viva");
  const fsx = require("node:fs");
  const appJs = fsx.readFileSync(path.join(RAIZ, "app-v1", "app.js"), "utf8");
  assert.match(appJs, /params\.get\("qa"\) === "1" \|\| params\.get\("dev"\) === "1"/,
    "gate ?qa=1/?dev=1 ausente");
  const indexHtml = fsx.readFileSync(path.join(RAIZ, "app-v1", "index.html"), "utf8");
  assert.match(indexHtml, /id="qaCatalog"[^>]*hidden/, "catálogo precisa nascer oculto");
});

test("microcopy: mensagem de produção sem comando de terminal; detalhe só em dev", () => {
  const fsx = require("node:fs");
  const appJs = fsx.readFileSync(path.join(RAIZ, "app-v1", "app.js"), "utf8");
  assert.match(appJs, /Ainda não estou recebendo dados da operação\./);
  assert.match(appJs, /Acompanhe o fluxo diretamente enquanto a leitura é restabelecida\./);
  // a dica técnica com comando só pode aparecer no ramo dev (QA_MODE)
  assert.match(appJs, /QA_MODE \? tech\.text : "Ainda não estou recebendo dados da operação\."/);
});
