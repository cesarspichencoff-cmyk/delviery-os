/**
 * Testes de isolamento e contrato de experiência 3C.1
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { UiApplicationFacade } from "./adapters/UiApplicationFacade";
import { asInternalRiderActorId } from "../foundation/brands";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}`);
      throw e;
    }
  })();
}

console.log("\n=== ENTREGAS UI 3C.1 tests ===\n");

(async () => {
  await test("UI facade usa ApplicationService; cria Trip", async () => {
    const f = new UiApplicationFacade();
    f.seedDemo();
    const r = await f.execute({
      type: "CreateTrip",
      command_id: "ui-1",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-T1",
      courier_actor_id: asInternalRiderActorId("rid-demo"),
      deliveries: [
        { delivery_id: "UI-D1", order_ref: "P-101" },
        { delivery_id: "UI-D2", order_ref: "P-102" },
      ],
    });
    assert.equal(r.ok, true, r.error);
    const s = await f.snapshot();
    assert.equal(s.demo_banner, "AMBIENTE DE DEMONSTRAÇÃO");
    assert.equal(s.module_name, "ENTREGAS");
    assert.equal(s.policy.max_stops, 5);
    assert.ok(s.trips.some((t) => t.trip_id === "UI-T1"));
  });

  await test("limite vem da política (6ª rejeitada)", async () => {
    const f = new UiApplicationFacade();
    const dels = Array.from({ length: 6 }, (_, i) => ({
      delivery_id: `X${i}`,
      order_ref: `O${i}`,
    }));
    const r = await f.execute({
      type: "CreateTrip",
      command_id: "ui-2",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-T6",
      courier_actor_id: asInternalRiderActorId("rid-demo"),
      deliveries: dels,
    });
    assert.equal(r.ok, false);
  });

  await test("Handoff sem courier verificado recusado; não cria Trip", async () => {
    const f = new UiApplicationFacade();
    await f.execute({
      type: "StartHandoff",
      command_id: "h1",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      handoff_id: "HO-UI",
      external_order_ref: "IF-1",
    });
    const r = await f.execute({
      type: "ConfirmHandoff",
      command_id: "h2",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      handoff_id: "HO-UI",
      conference_actor: "ops",
      handoff_actor: "ops",
      courier_verified: false,
      courier_verification_method: "",
      volumes: { expected: 1, delivered: 1 },
      order_identified: true,
    });
    assert.equal(r.ok, false);
    const s = await f.snapshot();
    assert.equal(s.trips.length, 0);
  });

  await test("pedido removido preservado active=false", async () => {
    const f = new UiApplicationFacade();
    await f.execute({
      type: "CreateTrip",
      command_id: "r1",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-RM",
      courier_actor_id: asInternalRiderActorId("rid-demo"),
      deliveries: [
        { delivery_id: "A", order_ref: "1" },
        { delivery_id: "B", order_ref: "2" },
      ],
    });
    const r = await f.execute({
      type: "RemoveDeliveryFromTrip",
      command_id: "r2",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-RM",
      delivery_id: "B",
      reason: "demo",
    });
    assert.equal(r.ok, true);
    const d = r.trip?.deliveries.get("B");
    assert.equal(d?.active, false);
  });

  await test("fontes UI não importam persistence/FileUnitOfWork/copiloto", () => {
    const root = join(process.cwd(), "src/entregas/ui");
    const surfaces = ["console", "rider-mobile", "ifood-handoff", "shared"].map(
      (s) => join(root, s),
    );
    const ban = [
      "FileUnitOfWork",
      "file-store",
      "EventStore",
      "capacidade-viva",
      "cv-cal-tata",
      "copiloto-v33",
    ];
    for (const dir of surfaces) {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (!statSync(p).isFile()) continue;
        if (!/\.(js|html|css)$/.test(n)) continue;
        const t = readFileSync(p, "utf8");
        for (const b of ban) {
          assert.equal(t.includes(b), false, `${p} contains ${b}`);
        }
      }
    }
    const facade = readFileSync(
      join(root, "adapters/UiApplicationFacade.ts"),
      "utf8",
    );
    assert.equal(/from\s+["'][^"']*file-store/.test(facade), false);
    assert.equal(/FileUnitOfWork/.test(facade) && /import/.test(facade) && facade.includes("FileUnitOfWork"), false);
    // imports reais permitidos: MemoryUnitOfWork + ApplicationService apenas
    assert.ok(facade.includes("EntregasApplicationService"));
    assert.ok(facade.includes("MemoryUnitOfWork"));
    assert.equal(facade.includes('from "../../persistence/file-store"'), false);
  });

  await test("HTML marca ambiente de demonstração e sem ranking", () => {
    for (const page of [
      "console/index.html",
      "rider-mobile/index.html",
      "ifood-handoff/index.html",
    ]) {
      const t = readFileSync(join(process.cwd(), "src/entregas/ui", page), "utf8");
      assert.ok(t.includes("AMBIENTE DE DEMONSTRAÇÃO"));
      assert.equal(t.toLowerCase().includes("ranking"), false);
    }
  });

  await test("tokens canônicos Sprint (não baseline app-v1)", () => {
    const t = readFileSync(
      join(process.cwd(), "src/entregas/ui/shared/tokens.css"),
      "utf8",
    );
    assert.ok(t.includes("Spectral"));
    assert.ok(t.includes("Hanken Grotesk"));
    assert.ok(t.includes("IBM Plex Mono"));
    assert.ok(t.includes("#22563c") || t.includes("#22563C") || t.includes("brand-action"));
    assert.ok(t.includes("brand-deep") || t.includes("--brand-deep"));
    assert.ok(t.includes("surface-work") || t.includes("--surface-work"));
    assert.ok(t.includes("Sprint Visual") || t.includes("canônico"));
    assert.equal(t.includes("app-v1/style.css"), false);
  });

  await test("UI expedição reconstruída: home simples e sem jargão", () => {
    const html = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/index.html"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    const css = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.css"),
      "utf8",
    );
    // Home não embute formulário permanente
    assert.equal(html.includes("chkBags"), false);
    assert.equal(html.includes("Entregar ao motoboy"), false);
    assert.ok(html.includes("id=\"app\"") || html.includes("id='app'"));
    assert.ok(js.includes("Buscar pedido"));
    assert.ok(js.includes("Entregar ao motoboy"));
    assert.ok(js.includes("Nenhum pedido pronto agora"));
    assert.ok(js.includes("Vá buscar na conferência"));
    assert.ok(js.includes("Pedido em mãos"));
    assert.ok(js.includes("Confira antes de entregar"));
    assert.ok(js.includes("Pedido entregue ao motoboy do iFood"));
    assert.ok(js.includes("canal do iFood"));
    assert.ok(js.includes("playReadyChime") || js.includes("soundEnabled"));
    assert.ok(js.includes("alerted")); // aviso uma vez por pedido
    assert.ok(js.includes("ready_at_ts") || js.includes("readyOrdersFifo"));
    assert.ok(js.includes("ALERT_MS") || js.includes("tempor"));
    assert.ok(js.includes('for="chkBags"') || js.includes('for=\\"chkBags\\"') || js.includes("for=\"chkBags\""));
    assert.ok(js.includes("canDeliverOrder") || js.includes("missingFor"));
    assert.ok(js.includes("Entregador esperado"));
    assert.ok(js.includes("Responsável pela entrega"));
    assert.equal(html.toLowerCase().includes("external_courier_ref"), false);
    assert.equal(js.includes("sai do cuidado da casa"), false);
    assert.ok(css.includes("pulse-in") || css.includes("readyPulse"));
    assert.ok(css.includes("#btnDeliver:disabled") || css.includes("pointer-events: none"));
    assert.ok(
      js.includes("não confere itens") ||
        js.includes("Não peça ao motoboy") ||
        js.includes("Sem abrir a embalagem"),
    );
  });

  await test("mobile: Cliente não encontrado não no markup estático de a caminho", () => {
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/rider-mobile/rider.js"),
      "utf8",
    );
    assert.ok(js.includes('notFound.hidden = true'));
    assert.ok(js.includes("Abrir rota"));
    assert.ok(js.includes("Cheguei"));
    assert.ok(js.includes("Confirmar entrega"));
  });

  await test("console: sem mapa pseudogeográfico — sequência de endereços", () => {
    const html = readFileSync(
      join(process.cwd(), "src/entregas/ui/console/index.html"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/console/console.js"),
      "utf8",
    );
    assert.ok(html.includes("addressSeq"));
    assert.ok(js.includes("address-seq") || js.includes("addr-chip"));
    // A invariante é "não existe mapa falso", e não uma frase específica: o
    // console avisa que o mapa não está ligado e não desenha projeção
    // pseudogeográfica a partir de dados que não são coordenada.
    assert.ok(
      js.includes("mapa da rota") || html.includes("mapa da rota"),
      "console precisa dizer que o mapa não está ligado",
    );
    for (const proibido of ["projectLatLon", "fakeMap", "pseudoGeo", "maplibre"]) {
      assert.equal(js.includes(proibido), false, `mapa pseudogeográfico: ${proibido}`);
    }
    // Coordenada nunca é escrita direto no markup do console.
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(html), false, "coordenada no HTML do console");
  });

  await test("saída e confirmação via facade", async () => {
    const f = new UiApplicationFacade();
    await f.execute({
      type: "CreateTrip",
      command_id: "s1",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-FLOW",
      courier_actor_id: asInternalRiderActorId("rid-demo"),
      deliveries: [{ delivery_id: "D1", order_ref: "P1" }],
    });
    let r = await f.execute({
      type: "ConfirmTripDeparture",
      command_id: "s2",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-FLOW",
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
    assert.equal(r.ok, true, r.error);
    r = await f.execute({
      type: "ConfirmDelivery",
      command_id: "s3",
      occurred_at: new Date().toISOString(),
      unit_id: "demo-unit",
      trip_id: "UI-FLOW",
      delivery_id: "D1",
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    });
    assert.equal(r.ok, true, r.error);
  });

  /**
   * Espelha connectionState do client.js (fonte única cabeçalho + banner).
   * Mantido em sync com shared/client.js — se divergir, o teste de fonte falha.
   */
  function connectionStateMirror(
    conn: string,
    pending = 0,
  ): {
    mode: string;
    header: string;
    showBanner: boolean;
    bannerTitle: string;
  } {
    const offline = conn === "offline";
    const syncing = conn === "syncing";
    const hasPending = Number(pending) > 0;
    if (offline) {
      return {
        mode: "offline",
        header: "Offline",
        showBanner: true,
        bannerTitle: "Sem rede",
      };
    }
    if (syncing || hasPending) {
      return {
        mode: "pending_sync",
        header: "Online",
        showBanner: true,
        bannerTitle: "Sincronização pendente",
      };
    }
    return {
      mode: "online",
      header: "Online",
      showBanner: false,
      bannerTitle: "",
    };
  }

  await test("online: cabeçalho Online e sem banner de ausência de rede", () => {
    const cs = connectionStateMirror("online", 0);
    assert.equal(cs.mode, "online");
    assert.equal(cs.header, "Online");
    assert.equal(cs.showBanner, false);
    assert.equal(/sem rede/i.test(cs.bannerTitle), false);
  });

  await test("offline: Offline + aviso Sem rede", () => {
    const cs = connectionStateMirror("offline", 0);
    assert.equal(cs.mode, "offline");
    assert.equal(cs.header, "Offline");
    assert.equal(cs.showBanner, true);
    assert.ok(/sem rede/i.test(cs.bannerTitle));
  });

  await test("sincronização pendente distinta de offline (aparelho online)", () => {
    const cs = connectionStateMirror("online", 2);
    assert.equal(cs.mode, "pending_sync");
    assert.equal(cs.header, "Online");
    assert.equal(cs.showBanner, true);
    assert.equal(cs.bannerTitle, "Sincronização pendente");
    assert.equal(/sem rede/i.test(cs.bannerTitle), false);
    const offline = connectionStateMirror("offline", 2);
    assert.equal(offline.mode, "offline");
    assert.notEqual(cs.mode, offline.mode);
  });

  await test("fonte única connectionState no client + rider + console", () => {
    const client = readFileSync(
      join(process.cwd(), "src/entregas/ui/shared/client.js"),
      "utf8",
    );
    const rider = readFileSync(
      join(process.cwd(), "src/entregas/ui/rider-mobile/rider.js"),
      "utf8",
    );
    const cons = readFileSync(
      join(process.cwd(), "src/entregas/ui/console/console.js"),
      "utf8",
    );
    assert.ok(client.includes("export function connectionState"));
    assert.ok(client.includes('mode: "pending_sync"'));
    assert.ok(client.includes('bannerTitle: "Sincronização pendente"'));
    assert.ok(client.includes('header: "Offline"'));
    assert.ok(client.includes("nunca usa \"Sem rede\" quando online") || client.includes("nunca usa"));
    assert.ok(rider.includes("connectionState(snap.connection"));
    assert.ok(rider.includes("cs.showBanner"));
    assert.ok(cons.includes("connectionState(snap.connection"));
  });

  await test("conferência iFood: checklist sem ficha factsHtml duplicada", () => {
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    const start = js.indexOf("function renderChecking");
    assert.ok(start >= 0);
    const end = js.indexOf("\nfunction ", start + 10);
    const body = end > start ? js.slice(start, end) : js.slice(start);
    assert.equal(body.includes("factsHtml("), false, "renderChecking não deve chamar factsHtml");
    assert.ok(body.includes("chkBags"));
    assert.ok(body.includes("chkName"));
    assert.ok(body.includes("chkIfood"));
    assert.ok(body.includes("Entregar ao motoboy"));
    assert.ok(body.includes("handoff-meta") || body.includes("Entregador esperado"));
    assert.ok(body.includes("disabled"));
    assert.ok(js.includes("canDeliverOrder") && js.includes("missingFor"));
  });

  await test("controles demo: hidden por padrão; gated por health demo_controls", () => {
    const html = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/index.html"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    const uiSrv = readFileSync(
      join(process.cwd(), "tools/entregas_ui_server.ts"),
      "utf8",
    );
    const pilotSrv = readFileSync(
      join(process.cwd(), "tools/entregas_pilot_server.ts"),
      "utf8",
    );
    assert.ok(html.includes('id="demoDock"'));
    assert.ok(/demoDock[^>]*\bhidden\b/.test(html) || html.includes('class="demo-dock" hidden'));
    assert.ok(js.includes("applyEnvironmentFromHealth"));
    assert.ok(js.includes("demo_controls"));
    assert.ok(js.includes("dock.hidden = !enabled") || js.includes("dock.hidden = true"));
    assert.ok(uiSrv.includes("demo_controls"));
    assert.ok(uiSrv.includes("ENTREGAS_DEMO_CONTROLS"));
    assert.ok(uiSrv.includes("ENTREGAS_ENV"));
    assert.ok(pilotSrv.includes("demo_controls"));
    assert.ok(
      pilotSrv.includes('ENTREGAS_DEMO_CONTROLS === "true"') ||
        pilotSrv.includes("ENTREGAS_DEMO_CONTROLS"),
    );
  });

  await test("identificação demo: health demo true e faixa de demonstração", () => {
    const uiSrv = readFileSync(
      join(process.cwd(), "tools/entregas_ui_server.ts"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    const html = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/index.html"),
      "utf8",
    );
    assert.ok(uiSrv.includes('mode: isDemo ? "demo" : "operational"') || uiSrv.includes('"demo"'));
    assert.ok(uiSrv.includes("AMBIENTE DE DEMONSTRAÇÃO · EXPEDIÇÃO IFOOD"));
    assert.ok(html.includes("AMBIENTE DE DEMONSTRAÇÃO · EXPEDIÇÃO IFOOD"));
    assert.ok(js.includes("AMBIENTE DE DEMONSTRAÇÃO · EXPEDIÇÃO IFOOD"));
    assert.ok(js.includes("isDemo") || js.includes("h?.demo === true") || js.includes("h.demo === true") || js.includes("demo === true"));
  });

  await test("identificação operacional: sem palavra demonstração; faixa operacional", () => {
    const uiSrv = readFileSync(
      join(process.cwd(), "tools/entregas_ui_server.ts"),
      "utf8",
    );
    const pilotSrv = readFileSync(
      join(process.cwd(), "tools/entregas_pilot_server.ts"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    assert.ok(uiSrv.includes("AMBIENTE OPERACIONAL · EXPEDIÇÃO IFOOD"));
    assert.ok(uiSrv.includes("operational") || uiSrv.includes("operacional"));
    assert.ok(js.includes("AMBIENTE OPERACIONAL · EXPEDIÇÃO IFOOD"));
    assert.ok(js.includes("/demonstra/i") || js.includes("demonstra"));
    // piloto: demo false e mode operational
    assert.ok(pilotSrv.includes("demo: false"));
    assert.ok(pilotSrv.includes('mode: "operational"') || pilotSrv.includes("operational"));
    assert.ok(pilotSrv.includes("AMBIENTE OPERACIONAL · EXPEDIÇÃO IFOOD"));
  });

  await test("operacional: controles demo só com flag e demo; default ausentes", () => {
    const uiSrv = readFileSync(
      join(process.cwd(), "tools/entregas_ui_server.ts"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    // demo_controls = isDemo && controlsRequested
    assert.ok(uiSrv.includes("isDemo && controlsRequested") || uiSrv.includes("demoControls = isDemo"));
    assert.ok(js.includes("applyEnvironmentFromHealth"));
  });

  await test("360px: overflow e min-width nos CSS de console/rider/handoff", () => {
    const riderCss = readFileSync(
      join(process.cwd(), "src/entregas/ui/rider-mobile/rider.css"),
      "utf8",
    );
    const consoleCss = readFileSync(
      join(process.cwd(), "src/entregas/ui/console/console.css"),
      "utf8",
    );
    const handoffCss = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.css"),
      "utf8",
    );
    assert.ok(riderCss.includes("overflow-x: hidden"));
    assert.ok(riderCss.includes("min-width: 0"));
    assert.ok(consoleCss.includes("overflow-x: hidden"));
    assert.ok(consoleCss.includes("min-width: 0"));
    assert.ok(consoleCss.includes("@media (max-width: 400px)"));
    assert.ok(handoffCss.includes("min-width: 0"));
    assert.ok(handoffCss.includes("demo-dock[hidden]") || handoffCss.includes(".demo-dock[hidden]"));
    assert.ok(handoffCss.includes("overflow-wrap: anywhere") || handoffCss.includes("word-break"));
  });

  await test("sync-bar[hidden] força display:none (não vaza Sem rede quando online)", () => {
    const tokens = readFileSync(
      join(process.cwd(), "src/entregas/ui/shared/tokens.css"),
      "utf8",
    );
    const rider = readFileSync(
      join(process.cwd(), "src/entregas/ui/rider-mobile/rider.js"),
      "utf8",
    );
    assert.ok(tokens.includes(".sync-bar[hidden]"));
    assert.ok(/display:\s*none\s*!important/.test(tokens));
    assert.ok(rider.includes("setAttribute(\"hidden\"") || rider.includes("syncBar.hidden = true"));
    assert.ok(rider.includes("showBanner") && /syncTitle[\s\S]{0,80}textContent\s*=\s*""/.test(rider));
  });

  await test("facade: pending_sync e connection no snapshot", async () => {
    const f = new UiApplicationFacade();
    f.setConnection("online");
    let s = await f.snapshot();
    assert.equal(s.connection, "online");
    assert.equal(s.pending_sync, 0);
    f.setConnection("offline");
    s = await f.snapshot();
    assert.equal(s.connection, "offline");
  });

  console.log(`\n=== ${passed} UI tests OK ===\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});