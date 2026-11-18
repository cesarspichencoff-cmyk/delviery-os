/**
 * Nivel 2, sintetico: tela do Gestor (executor real, pagina falsa) x arquivos do
 * Reader (checkpoint + eventos fabricados num diretorio temporario), cruzados
 * pelo reconciliador de janela REAL que ja existia. Nenhum dado real.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { ARQUIVO_DO_FEED, validarFeedDoGestor, type DemandaDoGestor } from "../../src/platform/leitura/demanda-do-gestor";
import { lerPedidosDoReader } from "../../src/platform/leitura/pedidos-do-reader";
import { CONCILIACAO_READER_VERSAO, conciliarComReader, type Reconciliador } from "../../src/product/eventos/conciliacao-reader";
import { leituraDaDemanda } from "../../src/product/eventos/demanda-gestor";
import { criarServidor } from "../../tools/product_system_server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runner = require("../../runtime/reporting/gestor_mounted_demand_feed_v1.cjs") as {
  EXPEDITION: string;
  buildExpression: (sensor: string, mode: string) => string;
  createDemandFeed: (o: Record<string, unknown>) => { tick: () => Promise<Record<string, unknown>> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { reconcile } = require("../../tools/gestor-native-shadow-reconcile/reconcile.cjs") as { reconcile: Reconciliador };
const SENSOR = readFileSync(join(__dirname, "../../runtime/reporting/gestor_v3_visible_sensor.js"), "utf8");
const CHAVE = "ab".repeat(32);

type Linha = { name: string; quantity: number };
/** Feed real do executor sobre uma pagina falsa, no instante `agora`. */
async function janelaDoGestor(pedidos: { n: number; itens: Linha[]; criado?: string }[], agora: number, modo: "FIELD" | "FIXTURE" = "FIELD") {
  const hostname = modo === "FIELD" ? "gestordepedidos.ifood.com.br" : "127.0.0.1";
  const url = modo === "FIELD" ? runner.EXPEDITION : "http://127.0.0.1:5399/g.html";
  const ordens = pedidos.map((p) => ({
    id: "PRIVATE-UUID-" + String(p.n), displayId: String(p.n), merchant: { id: "PRIVATE-MERCHANT" },
    createdAt: p.criado ?? new Date(agora - 20 * 60_000).toISOString(),
    items: p.itens.map((i) => ({ ...i, observations: "", options: [], externalCode: null })),
  }));
  const feed = runner.createDemandFeed({
    mode: modo, pageUrl: modo === "FIXTURE" ? url : null, sensorSha: "t",
    edgePort: () => 9222,
    targets: async () => ({ kind: "reply", value: [{ type: "page", url, webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789" }] }),
    evaluate: async () => {
      const doc = {
        location: { hostname }, visibilityState: "hidden", readyState: "complete",
        querySelectorAll: () => ordens.map((o) => ({
          get innerText() { return "Pedido #" + o.displayId; },
          isConnected: true, parentElement: null, getClientRects: () => [{}],
          __reactFiber$lab: { memoizedProps: {}, return: { memoizedProps: { order: o }, return: null } },
        })),
      };
      const value = vm.runInNewContext(runner.buildExpression(SENSOR, modo === "FIELD" ? "FIELD_REVIEW" : "FIXTURE"), { document: doc, location: doc.location }) as unknown;
      return { kind: "value", value: JSON.parse(JSON.stringify(value)) as unknown };
    },
    clock: () => agora, writeFeed: () => undefined,
  });
  const doc = await feed.tick();
  const d = validarFeedDoGestor(doc, agora + 2_000);
  assert.equal(d.estado, "observada");
  return { doc, d: d as Extract<DemandaDoGestor, { estado: "observada" }> };
}

interface Nativo { venda: string; comanda: string; curto: string; aberto: string; qtds: string[]; origem?: string; retido?: boolean; maiusculo?: boolean }
/** Fabrica a raiz do Reader: checkpoint + um evento por pedido, como o Reader grava. */
function raizDoReader(nativos: Nativo[], observado: string): string {
  const raiz = mkdtempSync(join(tmpdir(), "reader-"));
  mkdirSync(join(raiz, "state", "reader-events-v1"), { recursive: true });
  const entries = nativos.map((n) => {
    const order = {
      CDFILIAL: "0001", CDLOJA: "01", NRVENDAREST: n.venda, NRCOMANDA: n.comanda, NRCOMANDAEXT: n.curto,
      IDORGCMDVENDA: n.origem ?? "DLV_IFO", IDSTCOMANDA: "3", DTHRABERMESA: n.aberto,
      items: n.qtds.map((q, i) => ({ NRPRODCOMVEN: "L" + String(i + 1), CDPRODUTO: String(1000 + i), CDARVPROD: "9200001000", IDSTPRCOMVEN: "4", QTPRODCOMVEN: q })),
    };
    let hash = createHash("sha256").update(JSON.stringify(order)).digest("hex");
    if (n.maiusculo) hash = hash.toUpperCase();
    const order_key = ["0001", "01", n.venda, n.comanda].join("|");
    writeFileSync(join(raiz, "state", "reader-events-v1", `${n.comanda}_${hash}.json`), JSON.stringify({
      schema: "deliveryos.tata-reader-stable-order-event.v1", order_key, snapshot_hash: hash, observed_at: observado,
      ready_for_downstream_shadow: !n.retido, blockers: n.retido ? ["OBSERVATION_SCAN_INCOMPLETE"] : [], order,
    }));
    return { order_key, snapshot_hash: hash, emitted_hash: hash, stable_count: 2 };
  });
  writeFileSync(join(raiz, "state", "reader-watch-checkpoint-v1.json"),
    JSON.stringify({ schema: "deliveryos.tata-reader-continuous-checkpoint.v1", bootstrap_complete: true, entries }));
  return raiz;
}

// 13/11/2026 19:00 em Sao Paulo.
const AGORA = Date.parse("2026-11-13T22:00:00.000Z");
const ISO = new Date(AGORA + 2_000).toISOString();
const DEP = { agora_iso: ISO, reconciliar: reconcile, chave_privada_hex: CHAVE };
const OBS = "2026-11-13T18:59:40.1234567-03:00";
const HOJE = "2026-11-13T18:40:09.0000000";
const raizes: string[] = [];
const novaRaiz = (n: Nativo[]) => { const r = raizDoReader(n, OBS); raizes.push(r); return r; };

const testes: [string, () => Promise<void> | void][] = [];
const teste = (nome: string, fn: () => Promise<void> | void) => { testes.push([nome, fn]); };

teste("o leitor estreito le o que o Reader grava: numero curto, dia, linhas — e nada de cliente", () => {
  const r = lerPedidosDoReader(novaRaiz([
    { venda: "501", comanda: "9001", curto: "4107", aberto: HOJE, qtds: ["1.000", "2.000"], maiusculo: true },
    { venda: "502", comanda: "9002", curto: "4108", aberto: HOJE, qtds: ["0.350"] },
    { venda: "503", comanda: "9003", curto: "0007", aberto: HOJE, qtds: ["1.000"], origem: "BALCAO" },
  ]));
  assert.equal(r.estado, "lido");
  if (r.estado !== "lido") return;
  assert.equal(r.fora_do_escopo, 1);
  assert.deepEqual(r.pedidos.map((p) => [p.codigo_curto, p.dia, p.linhas.map((l) => l.quantidade)]),
    [["4107", "2026-11-13", [1, 2]], ["4108", "2026-11-13", [null]]]);
  assert.match(r.pedidos[0]!.revisao, /^[a-f0-9]{64}$/);
  assert.equal(r.pedidos[0]!.observado_em, "2026-11-13T21:59:40.123Z");
  assert.deepEqual(lerPedidosDoReader(null), { estado: "nao_configurado" });
  assert.deepEqual(lerPedidosDoReader("relativo"), { estado: "indisponivel", motivo: "caminho_invalido" });
  assert.deepEqual(lerPedidosDoReader(mkdtempSync(join(tmpdir(), "vazio-"))), { estado: "indisponivel", motivo: "caminho_invalido" });
});

teste("checkpoint ou evento adulterado fecha fechado, sem leitura parcial", () => {
  const base: Nativo[] = [{ venda: "501", comanda: "9001", curto: "4107", aberto: HOJE, qtds: ["1.000"] }];
  const mutar = (fn: (raiz: string, ck: Record<string, any>) => void) => {
    const raiz = novaRaiz(base);
    const arq = join(raiz, "state", "reader-watch-checkpoint-v1.json");
    const ck = JSON.parse(readFileSync(arq, "utf8")) as Record<string, any>;
    fn(raiz, ck);
    writeFileSync(arq, JSON.stringify(ck));
    return lerPedidosDoReader(raiz);
  };
  const ckInvalido = { estado: "indisponivel", motivo: "checkpoint_invalido" };
  const evInvalido = { estado: "indisponivel", motivo: "evento_invalido" };
  assert.deepEqual(mutar((_r, ck) => { ck.bootstrap_complete = false; }), ckInvalido);
  assert.deepEqual(mutar((_r, ck) => { ck.entries[0].emitted_hash = "0".repeat(64); }), ckInvalido);
  assert.deepEqual(mutar((_r, ck) => { ck.entries.push({ ...ck.entries[0] }); }), ckInvalido);
  assert.deepEqual(mutar((_r, ck) => { ck.entries[0].order_key = "0001|01|501"; }), ckInvalido);
  // O checkpoint aponta uma revisao cujo arquivo nao existe.
  assert.deepEqual(mutar((_r, ck) => { ck.entries[0].snapshot_hash = ck.entries[0].emitted_hash = "c".repeat(64); }), evInvalido);
  // O arquivo existe mas descreve OUTRO pedido.
  assert.deepEqual(mutar((raiz, ck) => {
    const f = join(raiz, "state", "reader-events-v1", `9001_${String(ck.entries[0].snapshot_hash)}.json`);
    const ev = JSON.parse(readFileSync(f, "utf8")) as Record<string, any>;
    ev.order.NRCOMANDA = "9999";
    writeFileSync(f, JSON.stringify(ev));
  }), evInvalido);
});

teste("conciliado, divergente, nao encontrado e ambiguo — decididos pelo reconciliador existente", async () => {
  const { d } = await janelaDoGestor([
    { n: 4107, itens: [{ name: "Hot Roll", quantity: 2 }, { name: "Temaki", quantity: 1 }] },
    { n: 4108, itens: [{ name: "Combinado", quantity: 1 }] },
    { n: 4109, itens: [{ name: "Yakisoba", quantity: 1 }] },
    { n: 4110, itens: [{ name: "Guioza", quantity: 6 }] },
    { n: 4111, itens: [{ name: "Sashimi", quantity: 1 }] },
    { n: 4112, itens: [{ name: "Missoshiru", quantity: 1 }] },
  ], AGORA);
  const reader = lerPedidosDoReader(novaRaiz([
    { venda: "501", comanda: "9001", curto: "4107", aberto: HOJE, qtds: ["1.000", "2.000"] },      // mesma coisa, outra ordem
    { venda: "502", comanda: "9002", curto: "4108", aberto: HOJE, qtds: ["2.000"] },                // quantidade diferente
    // 4109 nao existe no Reader
    { venda: "504", comanda: "9004", curto: "4110", aberto: HOJE, qtds: ["6.000"] },                // dois registros,
    { venda: "505", comanda: "9005", curto: "4110", aberto: HOJE, qtds: ["6.000"] },                // mesmo numero curto
    { venda: "506", comanda: "9006", curto: "4111", aberto: HOJE, qtds: ["1.000"], retido: true },  // o Reader reteve
    { venda: "507", comanda: "9007", curto: "4112", aberto: "2026-11-12T23:10:00.0000000", qtds: ["1.000"] }, // outro dia
    { venda: "508", comanda: "9008", curto: "5555", aberto: HOJE, qtds: ["1.000"] },                // so no Reader
  ]));
  const c = conciliarComReader(d.janela, d.modo, reader, DEP);
  assert.equal(c.estado, "feita");
  if (c.estado !== "feita") return;
  const por = (curto: string) => c.por_pedido.get(d.janela.pedidos.find((p) => p.codigo === curto)!.ref)!.resultado;
  assert.deepEqual(["4107", "4108", "4109", "4110", "4111", "4112"].map(por),
    ["conciliado", "divergente", "nao_encontrado", "ambiguo", "ambiguo", "nao_encontrado"]);
  assert.deepEqual([c.conciliados, c.divergentes, c.nao_encontrados, c.ambiguos], [1, 1, 2, 2]);
  const l = leituraDaDemanda(d, { tenant: "tata", agora_iso: ISO }, c);
  assert.equal(l.estado_do_join, "CONCILIADO_1_DE_6");
  assert.equal(l.demanda!.conciliados, 1);
  assert.ok(l.linhagem!.transformacoes.includes(CONCILIACAO_READER_VERSAO));
  const vmDe = (curto: string) => l.demanda!.pedidos.find((p) => p.codigo === curto)!;
  assert.deepEqual([vmDe("4107").nivel, vmDe("4107").nivel_texto, vmDe("4107").conciliacao_detalhe],
    ["conciliado", "conciliado com o Reader", null]);
  assert.equal(vmDe("4108").nivel, "demanda_observada");
  assert.match(vmDe("4108").conciliacao_detalhe!, /Reader mostra 1 linha\(s\) e 2 unidade\(s\); a tela do Gestor mostra 1 e 1/);
  assert.equal(vmDe("4109").conciliacao_detalhe, null);
  assert.match(vmDe("4110").conciliacao_detalhe!, /mais de um registro/);
  // Conciliar nao muda o que a Home afirma sobre estado fisico nem sobre o total.
  assert.equal(l.fonte.estado, "parcial");
  assert.ok(l.pedidos.every((p) => p.minutos_pronto_sem_sair === null));
  assert.match(l.demanda!.conciliacao, /1 de 6 conciliado\(s\).*Conciliado nao e pronto nem saiu/);
  // Nada do Reader vaza: nem chave nativa, nem numero de venda.
  const corpo = JSON.stringify(l);
  for (const segredo of ["0001|01", "9001", "501", "PRIVATE-"]) assert.ok(!corpo.includes(segredo), "vazou " + segredo);
});

teste("sem Reader, com Reader ilegivel ou com janela velha: nada e conciliado, e o motivo aparece", async () => {
  const { d } = await janelaDoGestor([{ n: 4107, itens: [{ name: "Hot Roll", quantity: 2 }] }], AGORA);
  const nativos: Nativo[] = [{ venda: "501", comanda: "9001", curto: "4107", aberto: HOJE, qtds: ["2.000"] }];
  const sem = conciliarComReader(d.janela, d.modo, lerPedidosDoReader(null), DEP);
  assert.deepEqual(sem, { estado: "nao_cruzada", motivo: "o Reader nao esta configurado nesta maquina" });
  const l = leituraDaDemanda(d, { tenant: "tata", agora_iso: ISO }, sem);
  assert.equal(l.estado_do_join, "NAO_CRUZADO");
  assert.equal(l.demanda!.conciliados, 0);
  assert.match(l.demanda!.conciliacao, /Sem cruzamento com o Reader: o Reader nao esta configurado/);
  assert.equal(l.demanda!.pedidos[0]!.nivel, "demanda_observada");
  assert.ok(!l.linhagem!.transformacoes.includes(CONCILIACAO_READER_VERSAO));
  // Janela do Gestor com mais de 30 s: o reconciliador recusa por frescor.
  const velha = conciliarComReader(d.janela, d.modo, lerPedidosDoReader(novaRaiz(nativos)),
    { ...DEP, agora_iso: new Date(AGORA + 45_000).toISOString() });
  assert.equal(velha.estado, "nao_cruzada");
  assert.match((velha as { motivo: string }).motivo, /source stale or clock skew/);
  // Chave local ausente: nao cruza.
  assert.equal(conciliarComReader(d.janela, d.modo, lerPedidosDoReader(novaRaiz(nativos)), { ...DEP, chave_privada_hex: "" }).estado, "nao_cruzada");
  // Sem o parametro, o comportamento do nivel 1 nao muda.
  assert.equal(leituraDaDemanda(d, { tenant: "tata", agora_iso: ISO }).estado_do_join, "NAO_QUALIFICADO");
});

teste("pagina de laboratorio cruza em modo simulado e continua demonstracao", async () => {
  const { d } = await janelaDoGestor([{ n: 4107, itens: [{ name: "Hot Roll", quantity: 2 }] }], AGORA, "FIXTURE");
  let modoVisto = "";
  const espiao: Reconciliador = (entrada) => {
    modoVisto = (entrada as { ifood: { mode: string } }).ifood.mode;
    return reconcile(entrada);
  };
  const c = conciliarComReader(d.janela, d.modo, lerPedidosDoReader(novaRaiz(
    [{ venda: "501", comanda: "9001", curto: "4107", aberto: HOJE, qtds: ["2.000"] }])), { ...DEP, reconciliar: espiao });
  assert.equal(modoVisto, "SIMULATED");
  assert.equal(c.estado, "feita");
  const l = leituraDaDemanda(d, { tenant: "tata", agora_iso: ISO }, c);
  assert.equal(l.procedencia, "simulado");
  assert.equal(l.linhagem!.natureza, "demonstracao");
  assert.equal(l.demanda!.pedidos[0]!.nivel, "conciliado");
});

function pedir(s: http.Server, caminho: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const e = s.address();
    if (typeof e === "string" || e === null) { reject(new Error("sem porta")); return; }
    http.get({ host: "127.0.0.1", port: e.port, path: caminho }, (res) => {
      let corpo = "";
      res.on("data", (c) => { corpo += String(c); });
      res.on("end", () => resolve(corpo));
    }).on("error", reject);
  });
}

teste("HTTP: /api/home mostra o nivel de cada pedido quando o Reader esta na mesma maquina", async () => {
  const agora = Date.now();
  const hojeLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(agora));
  const dirFeed = mkdtempSync(join(tmpdir(), "feed-"));
  raizes.push(dirFeed);
  const raiz = raizDoReader([
    { venda: "501", comanda: "9001", curto: "4107", aberto: `${hojeLocal}T12:00:00.0000000`, qtds: ["2.000"] },
    { venda: "502", comanda: "9002", curto: "4108", aberto: `${hojeLocal}T12:05:00.0000000`, qtds: ["3.000"] },
  ], new Date(agora - 5_000).toISOString());
  raizes.push(raiz);
  const { doc } = await janelaDoGestor([
    { n: 4107, itens: [{ name: "Hot Roll", quantity: 2 }], criado: new Date(agora - 60_000).toISOString() },
    { n: 4108, itens: [{ name: "Temaki", quantity: 1 }], criado: new Date(agora - 30_000).toISOString() },
  ], agora - 3_000);
  writeFileSync(join(dirFeed, ARQUIVO_DO_FEED), JSON.stringify(doc));
  const antes = [process.env["DELIVERYOS_GESTOR_DEMAND_DIR"], process.env["TATA_READER_INSTALL_ROOT"]];
  process.env["DELIVERYOS_GESTOR_DEMAND_DIR"] = dirFeed;
  process.env["TATA_READER_INSTALL_ROOT"] = raiz;
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  try {
    const corpo = await pedir(s, "/api/home");
    const home = JSON.parse(corpo) as Record<string, any>;
    assert.equal(home.estado_do_join, "CONCILIADO_1_DE_2");
    assert.equal(home.titulo, "Leitura parcial");
    assert.equal(home.pulso.observado, false);
    assert.equal(home.identidade_de_cada_pedido_verificada, false);
    assert.deepEqual(home.demanda_observada.pedidos.map((p: { codigo: string; nivel: string }) => [p.codigo, p.nivel]),
      [["4107", "conciliado"], ["4108", "demanda_observada"]]);
    assert.match(home.demanda_observada.pedidos[1].conciliacao_detalhe, /Reader mostra 1 linha\(s\) e 3 unidade\(s\)/);
    assert.ok(!corpo.includes("0001|01") && !corpo.includes("PRIVATE-"));
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
    for (const [i, k] of ["DELIVERYOS_GESTOR_DEMAND_DIR", "TATA_READER_INSTALL_ROOT"].entries()) {
      if (antes[i] === undefined) delete process.env[k]; else process.env[k] = antes[i];
    }
  }
});

void (async () => {
  let n = 0;
  try {
    for (const [nome, fn] of testes) {
      try { await fn(); n += 1; console.log("PASS " + nome); }
      catch (e) { console.error("FAIL " + nome + "\n" + String((e as Error).stack ?? e)); process.exitCode = 1; return; }
    }
    console.log(`DELIVERYOS_READER_RECONCILIATION_PASS ${String(n)}/${String(testes.length)} SYNTHETIC_ONLY`);
  } finally {
    for (const r of raizes) rmSync(r, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
})();
