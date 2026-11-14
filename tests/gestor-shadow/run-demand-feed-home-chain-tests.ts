/**
 * Cadeia inteira, sintetica: executor REAL do sensor (pagina falsa) -> feed ->
 * leitor estrito -> contratos e projetor existentes -> homeVM -> /api/home.
 * Nada aqui toca o Gestor, o caixa ou um pedido real.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import {
  ARQUIVO_DO_FEED,
  LIMITE_FEED_PARADO_MS,
  LIMITE_JANELA_MS,
  lerDemandaDoGestor,
  validarFeedDoGestor,
  type DemandaDoGestor,
} from "../../src/platform/leitura/demanda-do-gestor";
import {
  DEMANDA_GESTOR_VERSAO,
  eventosDaDemanda,
  leituraDaDemanda,
  motivoLegivel,
} from "../../src/product/eventos/demanda-gestor";
import { validarEvento } from "../../src/product/eventos/catalogo-operacional";
import { homeVM, TRANSFORMACAO_DEMANDA_OBSERVADA } from "../../src/product/viewmodels/home-vm";
import { cena } from "../../src/product/demo/seed-home-demonstracao";
import { criarServidor } from "../../tools/product_system_server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runner = require("../../runtime/reporting/gestor_mounted_demand_feed_v1.cjs") as {
  EXPEDITION: string;
  buildExpression: (sensor: string, mode: string) => string;
  createDemandFeed: (o: Record<string, unknown>) => { tick: () => Promise<Record<string, unknown>> };
};
const SENSOR = readFileSync(join(__dirname, "../../runtime/reporting/gestor_v3_visible_sensor.js"), "utf8");

type Linha = { name: string; quantity: number; observations: string; options: { name: string; quantity: number }[]; externalCode: string | null };
type Pedido = Record<string, unknown> & { items: Linha[] };
const item = (name: string, quantity: number, observations = "", options: Linha["options"] = []): Linha =>
  ({ name, quantity, observations, options, externalCode: null });
const pedido = (n: number, items: Linha[], extra: Record<string, unknown> = {}): Pedido => ({
  id: "PRIVATE-ORDER-UUID-" + String(n), displayId: String(n).padStart(4, "0"),
  merchant: { id: "PRIVATE-MERCHANT-UUID" }, items,
  customer: { name: "NOME_SECRETO" }, createdAt: `2026-11-13T19:0${String(n % 10)}:00-03:00`, ...extra,
});

/** Um executor real sobre uma pagina falsa, com relogio controlado. */
function bancada(modo: "FIELD" | "FIXTURE", inicioMs: number) {
  const hostname = modo === "FIELD" ? "gestordepedidos.ifood.com.br" : "127.0.0.1";
  const url = modo === "FIELD" ? runner.EXPEDITION : "http://127.0.0.1:5399/gestor.html";
  const s = { pedidos: [] as Pedido[], agora: inicioMs };
  const feed = runner.createDemandFeed({
    mode: modo, pageUrl: modo === "FIXTURE" ? url : null, sensorSha: "teste",
    edgePort: () => 9222,
    targets: async () => ({ kind: "reply", value: [{ type: "page", url, webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/ABCDEF0123456789" }] }),
    evaluate: async () => {
      const doc = {
        location: { hostname }, visibilityState: "hidden", readyState: "complete",
        querySelectorAll: () => s.pedidos.map((o) => ({
          get innerText() { return "Pedido #" + String(o["displayId"]); },
          isConnected: true, parentElement: null, getClientRects: () => [{}],
          __reactFiber$lab: { memoizedProps: {}, return: { memoizedProps: { order: o }, return: null } },
        })),
      };
      const value = vm.runInNewContext(
        runner.buildExpression(SENSOR, modo === "FIELD" ? "FIELD_REVIEW" : "FIXTURE"),
        { document: doc, location: doc.location },
      ) as unknown;
      return { kind: "value", value: JSON.parse(JSON.stringify(value)) as unknown };
    },
    clock: () => s.agora,
    writeFeed: () => undefined,
  });
  return { s, passo: async (ms = 10_000) => { s.agora += ms; return feed.tick(); } };
}
const T0 = Date.parse("2026-11-13T22:00:00.000Z");
const CTX = { tenant: "tata", agora_iso: new Date(T0 + 12_000).toISOString() };

async function feedDeDoisPedidos(modo: "FIELD" | "FIXTURE" = "FIELD", inicio = T0) {
  const b = bancada(modo, inicio);
  b.s.pedidos = [
    pedido(2, [item("Combinado Especial 1 Pessoa", 1)]),
    pedido(1, [item("Hot Roll", 2, "Sem cebolinha"), item("Temaki Salmao", 1, "", [{ name: "Cream cheese", quantity: 1 }])]),
  ];
  return { b, doc: await b.passo() };
}
const observada = (d: DemandaDoGestor) => {
  assert.equal(d.estado, "observada");
  return d as Extract<DemandaDoGestor, { estado: "observada" }>;
};

const testes: [string, () => Promise<void> | void][] = [];
const teste = (nome: string, fn: () => Promise<void> | void) => { testes.push([nome, fn]); };

teste("o leitor aceita exatamente o que o executor escreve", async () => {
  const { doc } = await feedDeDoisPedidos();
  const d = observada(validarFeedDoGestor(doc, T0 + 12_000));
  assert.equal(d.modo, "real");
  assert.equal(d.janela.cartoes, 2);
  assert.equal(d.janela.linhas, 3);
  assert.equal(d.janela.unidades, 4);
  assert.equal(d.pagina_oculta, true);
  assert.equal(d.em_retencao, null);
  assert.equal(d.janela.pedidos[1]!.itens[0]!.observacao, "Sem cebolinha");
  assert.deepEqual(d.janela.pedidos[1]!.itens[1]!.opcoes, [{ nome: "Cream cheese", quantidade: 1 }]);
});

teste("ausencia tem nome: sem configuracao, sem arquivo, parado, retido, relogio adiantado", async () => {
  assert.deepEqual(lerDemandaDoGestor(null, T0), { estado: "nao_configurada" });
  const dir = mkdtempSync(join(tmpdir(), "demanda-"));
  try {
    assert.deepEqual(lerDemandaDoGestor(dir, T0), { estado: "indisponivel", motivo: "arquivo_ausente" });
    writeFileSync(join(dir, ARQUIVO_DO_FEED), "{ partido");
    assert.deepEqual(lerDemandaDoGestor(dir, T0), { estado: "indisponivel", motivo: "arquivo_invalido" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const { b, doc } = await feedDeDoisPedidos();
  const escrito = Date.parse(String(doc["written_at"]));
  assert.equal(validarFeedDoGestor(doc, escrito + LIMITE_FEED_PARADO_MS + 1).estado, "parada");
  assert.equal(validarFeedDoGestor(doc, escrito + LIMITE_FEED_PARADO_MS).estado, "observada");
  assert.deepEqual(validarFeedDoGestor(doc, escrito - 6_000), { estado: "indisponivel", motivo: "relogio_adiantado" });
  // Executor vivo, pagina retida: a ultima janela vale por um prazo curto, declarada.
  b.s.pedidos.push({ ...b.s.pedidos[0]! });
  const retido = await b.passo();
  const emGraca = observada(validarFeedDoGestor(retido, b.s.agora + 1_000));
  assert.equal(emGraca.em_retencao, "SENSOR_DUPLICATE_MOUNTED_ORDER");
  let ultimo = retido;
  for (let i = 0; i < 9; i++) ultimo = await b.passo();
  const depois = validarFeedDoGestor(ultimo, b.s.agora + 1_000);
  assert.equal(depois.estado, "retida");
  assert.ok(Date.parse(String((ultimo["window"] as { observed_at: string }).observed_at)) + LIMITE_JANELA_MS < b.s.agora + 1_000);
  // Nunca houve janela: retida sem ultima janela, e nunca uma lista vazia.
  const vazia = bancada("FIELD", T0);
  const semCartao = validarFeedDoGestor(await vazia.passo(), vazia.s.agora);
  assert.deepEqual(
    { estado: semCartao.estado, ultima: (semCartao as { ultima_janela_em?: unknown }).ultima_janela_em },
    { estado: "retida", ultima: null },
  );
});

teste("feed adulterado fecha fechado: contrato, agregados, duplicata, controle, modo", async () => {
  const { doc } = await feedDeDoisPedidos();
  const agora = T0 + 12_000;
  const mutar = (fn: (d: Record<string, any>) => void) => {
    const copia = JSON.parse(JSON.stringify(doc)) as Record<string, any>;
    fn(copia);
    return validarFeedDoGestor(copia, agora);
  };
  const contrato = { estado: "indisponivel", motivo: "contrato_violado" };
  const janela = { estado: "indisponivel", motivo: "janela_inconsistente" };
  const invalido = { estado: "indisponivel", motivo: "arquivo_invalido" };
  assert.deepEqual(mutar((d) => { d.physical_state_claimed = true; }), contrato);
  assert.deepEqual(mutar((d) => { d.disappearance_means_cancellation = true; }), contrato);
  assert.deepEqual(mutar((d) => { d.customer_data_exported = true; }), contrato);
  assert.deepEqual(mutar((d) => { d.actions_executed = 1; }), contrato);
  assert.deepEqual(mutar((d) => { d.coverage = "FULL"; }), contrato);
  assert.deepEqual(mutar((d) => { d.window.units += 1; }), janela);
  assert.deepEqual(mutar((d) => { d.window.visible_cards = 3; }), janela);
  assert.deepEqual(mutar((d) => { d.window.orders[1].short_code = d.window.orders[0].short_code; }), janela);
  assert.deepEqual(mutar((d) => { d.window.orders[0].items[0].name = "Hot\u0000Roll"; }), janela);
  assert.deepEqual(mutar((d) => { d.window.orders[0].items[0].quantity = 0; }), janela);
  assert.deepEqual(mutar((d) => { d.window.orders[0].ref = "PRIVATE-ORDER-UUID-1"; }), janela);
  assert.deepEqual(mutar((d) => { d.window.orders[0].first_seen_at = "2026-11-13T19:00:00"; }), janela);
  assert.deepEqual(mutar((d) => { d.window = null; }), janela);
  assert.deepEqual(mutar((d) => { d.source_mode = "control"; }), invalido);
  assert.deepEqual(mutar((d) => { delete d.source_mode; }), invalido);
  assert.deepEqual(mutar((d) => { d.schema = "outro"; }), invalido);
  assert.deepEqual(mutar((d) => { d.scan = { state: "OBSERVED", reason: "X" }; }), invalido);
  assert.equal(validarFeedDoGestor(null, agora).estado, "indisponivel");
  // Link simbolico no lugar do feed nao e seguido (quando o sistema permite cria-lo).
  const dir = mkdtempSync(join(tmpdir(), "demanda-"));
  try {
    writeFileSync(join(dir, "real.json"), JSON.stringify(doc));
    try {
      symlinkSync(join(dir, "real.json"), join(dir, ARQUIVO_DO_FEED));
      assert.deepEqual(lerDemandaDoGestor(dir, agora), invalido);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EPERM") throw e;
      console.log("  (link simbolico sem privilegio neste host: controle nao exercitado)");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

teste("cada pedido vira UM fato do catalogo existente, idempotente por pedido+revisao", async () => {
  const { b, doc } = await feedDeDoisPedidos();
  const d = observada(validarFeedDoGestor(doc, T0 + 12_000));
  const a = eventosDaDemanda(d, CTX);
  assert.equal(a.recusados, 0);
  assert.deepEqual(a.eventos.map((e) => e.event_type).sort(), ["pedido_ciclo_observado", "pedido_ciclo_observado", "source_health_changed"]);
  for (const e of a.eventos) {
    assert.equal(validarEvento(e).ok, true);
    assert.equal(e.unit_id, "ITAIM");
    assert.ok(!e.source.startsWith("fixture"));
  }
  const pedidos = a.eventos.filter((e) => e.event_type === "pedido_ciclo_observado");
  assert.ok(pedidos.every((e) => (e.payload as { estado: string }).estado === "aceito"));
  // A mesma janela relida: as mesmas chaves idempotentes.
  const releitura = eventosDaDemanda(observada(validarFeedDoGestor(await b.passo(), b.s.agora)), CTX);
  assert.deepEqual(
    releitura.eventos.filter((e) => e.event_type === "pedido_ciclo_observado").map((e) => e.source_event_id).sort(),
    pedidos.map((e) => e.source_event_id).sort(),
  );
  // Revisao de conteudo: chave nova so para o pedido que mudou.
  b.s.pedidos[1]!.items[0]!.quantity = 3;
  const revisto = eventosDaDemanda(observada(validarFeedDoGestor(await b.passo(), b.s.agora)), CTX);
  const novas = revisto.eventos.filter((e) => e.event_type === "pedido_ciclo_observado")
    .filter((e) => !pedidos.some((p) => p.source_event_id === e.source_event_id));
  assert.equal(novas.length, 1);
  assert.equal((novas[0]!.payload as { source_revision: number }).source_revision, 2);
  // Nenhum identificador bruto do provedor em nenhum fato.
  assert.ok(!JSON.stringify(revisto.eventos).includes("PRIVATE-"));
});

teste("a leitura real chega a Home como LEITURA PARCIAL, com itens, sem contagem da casa e sem Foco", async () => {
  const { doc } = await feedDeDoisPedidos();
  const l = leituraDaDemanda(validarFeedDoGestor(doc, T0 + 12_000), CTX);
  assert.equal(l.origem, "DEMANDA_OBSERVADA_NO_GESTOR");
  assert.equal(l.procedencia, "real");
  assert.equal(l.fonte.estado, "parcial");
  assert.equal(l.linhagem?.natureza, "real");
  assert.ok(l.linhagem?.transformacoes.includes(DEMANDA_GESTOR_VERSAO));
  assert.equal(DEMANDA_GESTOR_VERSAO, TRANSFORMACAO_DEMANDA_OBSERVADA);
  assert.equal(l.eventos_aplicados, 3);
  // Ordem pela hora do pedido, e praca/categoria AUSENTES — nada classificado por nome.
  assert.deepEqual(l.pedidos.map((p) => p.id), ["0001", "0002"]);
  assert.ok(l.pedidos.every((p) => p.itens.every((i) => i.praca === null && i.categoria === null)));
  const dm = l.demanda!;
  assert.equal(dm.nivel, "demanda_observada");
  assert.deepEqual([dm.total, dm.linhas, dm.unidades], [2, 3, 4]);
  assert.deepEqual(dm.pedidos[0]!.itens[0], { quantidade: 2, nome: "Hot Roll", observacao: "Sem cebolinha", opcoes: [] });
  assert.deepEqual(dm.pedidos[0]!.itens[1]!.opcoes, [{ nome: "Cream cheese", quantidade: 1 }]);
  assert.equal(dm.retencao, null);
  const leitura = {
    procedencia: l.procedencia, observado_em: l.observado_em!, pedidos: l.pedidos,
    carga_por_praca: {}, baseline_por_praca: {}, chegadas_na_hora: null, chegadas_normais: null,
    fontes: [l.fonte], linhagem: l.linhagem!,
  };
  const home = homeVM(leitura, { tipo: "real", temporal: { modo: "ambiente", orientacao_permitida: false, identidade: null, causa: null } });
  assert.equal(home.titulo, "Leitura parcial");
  assert.equal(home.leitura_parcial_de_pedidos, true);
  assert.equal(home.pulso.observado, false);
  assert.equal(home.foco, null);
  assert.equal(home.demonstracao, false);
  assert.equal(home.total_de_sinais, 0);
  assert.ok(home.ambientes.every((a) => a.cor === "sem_medicao"), "area sem medicao apareceu colorida");
  // Sem o carimbo de linhagem, fonte parcial com pedidos continua sendo so degradacao.
  const semCarimbo = homeVM({ ...leitura, linhagem: { ...l.linhagem!, transformacoes: ["projetor-leitura@1"] } },
    { tipo: "real", temporal: { modo: "ambiente", orientacao_permitida: false, identidade: null, causa: null } });
  assert.equal(semCarimbo.titulo, "Sem leitura");
  assert.equal(semCarimbo.leitura_parcial_de_pedidos, false);
});

teste("feed de laboratorio nunca vira real: fatos fixture, natureza demonstracao, Home marcada", async () => {
  const { doc } = await feedDeDoisPedidos("FIXTURE");
  const d = observada(validarFeedDoGestor(doc, T0 + 12_000));
  assert.equal(d.modo, "simulated");
  assert.ok(eventosDaDemanda(d, CTX).eventos.every((e) => e.source.startsWith("fixture:")));
  const l = leituraDaDemanda(d, CTX);
  assert.equal(l.procedencia, "simulado");
  assert.equal(l.linhagem?.natureza, "demonstracao");
  assert.equal(l.demanda?.procedencia, "simulado");
  const home = homeVM({
    procedencia: l.procedencia, observado_em: l.observado_em!, pedidos: l.pedidos, carga_por_praca: {},
    baseline_por_praca: {}, chegadas_na_hora: null, chegadas_normais: null, fontes: [l.fonte], linhagem: l.linhagem!,
  }, { tipo: "demonstracao", motivo: "teste" });
  assert.equal(home.demonstracao, true);
  assert.equal(home.titulo, "Leitura parcial");
  assert.equal(home.pulso.observado, false, "demonstracao parcial sustentou a contagem da casa");
});

teste("alegacao de cancelamento do provedor retira o pedido da demanda, e a retirada e contada", async () => {
  const b = bancada("FIELD", T0);
  b.s.pedidos = [
    pedido(1, [item("Hot Roll", 2)], { currentStatus: "CANCELLATION_REQUESTED" }),
    pedido(2, [item("Temaki", 1)], { currentStatus: { code: "READY_TO_PICKUP" } }),
  ];
  const l = leituraDaDemanda(validarFeedDoGestor(await b.passo(), b.s.agora), CTX);
  assert.deepEqual(l.pedidos.map((p) => p.id), ["0002"]);
  assert.equal(l.demanda?.ocultos_por_cancelamento_alegado, 1);
  assert.equal(l.demanda?.total, 1);
  // "Pronto" do provedor continua opaco: nenhum estado fisico e nenhum sinal nasce dele.
  assert.ok(!JSON.stringify(l).includes("READY_TO_PICKUP"));
  assert.ok(l.pedidos.every((p) => p.minutos_pronto_sem_sair === null && p.minutos_sem_ficar_pronto === null));
});

teste("parado, retido e invalido: fonte com estado e motivo humano, zero pedido, nunca leitura parcial", async () => {
  const { doc } = await feedDeDoisPedidos();
  const escrito = Date.parse(String(doc["written_at"]));
  const parada = leituraDaDemanda(validarFeedDoGestor(doc, escrito + LIMITE_FEED_PARADO_MS + 1), CTX);
  assert.equal(parada.fonte.estado, "stale");
  assert.match(parada.fonte.detalhe, /parou de escrever as \d\dh\d\d/);
  const vazia = bancada("FIELD", T0);
  const retida = leituraDaDemanda(validarFeedDoGestor(await vazia.passo(), vazia.s.agora), CTX);
  assert.equal(retida.fonte.estado, "indisponivel");
  assert.match(retida.fonte.detalhe, /nenhum cartao montado na tela/);
  const invalida = leituraDaDemanda({ estado: "indisponivel", motivo: "contrato_violado" }, CTX);
  for (const l of [parada, retida, invalida]) {
    assert.equal(l.origem, "SAUDE_DAS_FONTES_SEM_PEDIDOS");
    assert.deepEqual(l.pedidos, []);
    assert.equal(l.demanda, null);
    assert.equal(l.linhagem, null);
    assert.match(l.fonte.detalhe, /[Aa]usencia nao significa zero/);
  }
  // O codigo tecnico do executor nunca chega cru a quem opera.
  for (const m of ["EDGE_DEVTOOLS_PORT_UNREADABLE", "EXPEDITION_PAGE_NOT_FOUND", "CDP_EVALUATE_TIMEOUT",
    "SENSOR_NOTE_CONTENT_UNSAFE", "MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT", "SENSOR_ITEM_LIST_UNREADABLE", "QUALQUER"])
    assert.doesNotMatch(motivoLegivel(m), /[A-Z]{3,}_/);
});

teste("as cenas de demonstracao existentes nao mudaram de titulo nem de pulso", () => {
  const esperado: Record<string, string> = { calmo: "Em fluxo", ambiente: "Ambiente", foco: "Foco" };
  for (const [nome, titulo] of Object.entries(esperado)) {
    const h = homeVM(cena(nome as "calmo"));
    assert.equal(h.titulo, titulo);
    assert.equal(h.leitura_parcial_de_pedidos, false);
    assert.equal(h.pulso.observado, true);
  }
  assert.equal(homeVM(cena("degradado")).leitura_parcial_de_pedidos, false);
});

function pedir(s: http.Server, caminho: string): Promise<{ status: number; corpo: string }> {
  return new Promise((resolve, reject) => {
    const e = s.address();
    if (typeof e === "string" || e === null) { reject(new Error("sem porta")); return; }
    http.get({ host: "127.0.0.1", port: e.port, path: caminho }, (res) => {
      let corpo = "";
      res.on("data", (c) => { corpo += String(c); });
      res.on("end", () => resolve({ status: res.statusCode || 0, corpo }));
    }).on("error", reject);
  });
}

teste("HTTP: /api/home segue o feed — observado, parado, ausente — sem reiniciar o servidor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "demanda-http-"));
  const anterior = process.env["DELIVERYOS_GESTOR_DEMAND_DIR"];
  process.env["DELIVERYOS_GESTOR_DEMAND_DIR"] = dir;
  const s = await criarServidor();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  try {
    // 1. Configurado e ainda sem arquivo: indisponivel, nunca zero.
    const semArquivo = JSON.parse((await pedir(s, "/api/home")).corpo) as Record<string, any>;
    assert.equal(semArquivo.titulo, "Sem leitura");
    assert.equal(semArquivo.demanda_observada, null);
    assert.equal(semArquivo.pedidos_publicaveis, false);
    // 2. Feed fresco (relogio real): pedidos com itens na resposta.
    const { doc } = await feedDeDoisPedidos("FIELD", Date.now() - 10_000);
    writeFileSync(join(dir, ARQUIVO_DO_FEED), JSON.stringify(doc));
    const r = await pedir(s, "/api/home");
    assert.equal(r.status, 200);
    const home = JSON.parse(r.corpo) as Record<string, any>;
    assert.equal(home.titulo, "Leitura parcial");
    assert.equal(home.origem_desta_resposta, "DEMANDA_OBSERVADA_NO_GESTOR");
    assert.equal(home.nivel_de_evidencia, "demanda_observada");
    assert.equal(home.pedidos_publicaveis, true);
    // Ha janela, mas esta maquina de teste nao tem Reader: cruzamento tentado e nao feito.
    assert.equal(home.estado_do_join, "NAO_CRUZADO");
    assert.match(home.demanda_observada.conciliacao, /Sem cruzamento com o Reader/);
    assert.equal(home.identidade_de_cada_pedido_verificada, false);
    assert.equal(home.impressao_autorizada, false);
    assert.equal(home.demonstracao, false);
    assert.equal(home.pulso.observado, false);
    assert.equal(home.foco, null);
    assert.equal(home.demanda_observada.total, 2);
    assert.deepEqual(home.demanda_observada.pedidos.map((p: { codigo: string }) => p.codigo), ["0001", "0002"]);
    assert.equal(home.demanda_observada.pedidos[0].itens[0].observacao, "Sem cebolinha");
    assert.equal(home.fontes.find((f: { id: string }) => f.id === "ifood_tempos").estado, "parcial");
    assert.ok(!r.corpo.includes("PRIVATE-") && !r.corpo.includes("NOME_SECRETO"));
    // 3. O executor para: mesmo arquivo, relogio adiante -> a Home deixa de exibir.
    const velho = JSON.parse(JSON.stringify(doc)) as Record<string, any>;
    const atras = new Date(Date.now() - 5 * 60_000).toISOString();
    velho.written_at = atras; velho.window.observed_at = atras; velho.window.content_changed_at = atras;
    for (const o of velho.window.orders) { o.first_seen_at = atras; o.revised_at = atras; }
    writeFileSync(join(dir, ARQUIVO_DO_FEED), JSON.stringify(velho));
    const parado = JSON.parse((await pedir(s, "/api/home")).corpo) as Record<string, any>;
    assert.equal(parado.titulo, "Sem leitura");
    assert.equal(parado.demanda_observada, null);
    assert.equal(parado.fontes.find((f: { id: string }) => f.id === "ifood_tempos").estado, "stale");
    assert.ok(!JSON.stringify(parado).includes("Hot Roll"), "pedido velho continuou na tela");
    // 4. Feed de laboratorio: aparece, marcado como demonstracao.
    const lab = await feedDeDoisPedidos("FIXTURE", Date.now() - 10_000);
    writeFileSync(join(dir, ARQUIVO_DO_FEED), JSON.stringify(lab.doc));
    const sim = JSON.parse((await pedir(s, "/api/home")).corpo) as Record<string, any>;
    assert.equal(sim.demonstracao, true);
    assert.equal(sim.demanda_observada.procedencia, "simulado");
    // 5. A cena explicita de demonstracao continua separada do feed.
    const demo = JSON.parse((await pedir(s, "/api/home?cena=ambiente")).corpo) as Record<string, any>;
    assert.equal(demo.demonstracao, true);
    assert.equal(demo.demanda_observada, undefined);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
    if (anterior === undefined) delete process.env["DELIVERYOS_GESTOR_DEMAND_DIR"];
    else process.env["DELIVERYOS_GESTOR_DEMAND_DIR"] = anterior;
    rmSync(dir, { recursive: true, force: true });
  }
  // Caminho relativo e recusado no boot, e nao ignorado em silencio.
  process.env["DELIVERYOS_GESTOR_DEMAND_DIR"] = "relativo";
  try { await assert.rejects(criarServidor(), /caminho absoluto/); }
  finally { delete process.env["DELIVERYOS_GESTOR_DEMAND_DIR"]; }
});

void (async () => {
  let n = 0;
  for (const [nome, fn] of testes) {
    try { await fn(); n += 1; console.log("PASS " + nome); }
    catch (e) { console.error("FAIL " + nome + "\n" + String((e as Error).stack ?? e)); process.exit(1); }
  }
  console.log(`DELIVERYOS_GESTOR_DEMAND_HOME_CHAIN_PASS ${String(n)}/${String(testes.length)} SYNTHETIC_ONLY`);
  process.exit(0);
})();
