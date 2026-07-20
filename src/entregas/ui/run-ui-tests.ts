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
    assert.ok(t.includes("#22563c") || t.includes("#22563C"));
    assert.ok(t.includes("Sprint Visual") || t.includes("canônico"));
    assert.equal(t.includes("app-v1/style.css"), false);
  });

  await test("UI expedição: copy de conclusão e sem jargão Handoff no HTML", () => {
    const html = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/index.html"),
      "utf8",
    );
    const js = readFileSync(
      join(process.cwd(), "src/entregas/ui/ifood-handoff/handoff.js"),
      "utf8",
    );
    assert.ok(html.includes("Liberar pedido"));
    assert.equal(html.includes("Iniciar handoff"), false);
    assert.equal(html.toLowerCase().includes("external_courier_ref"), false);
    assert.ok(
      js.includes(
        "Expedição concluída. O andamento posterior é acompanhado pelo canal do iFood.",
      ),
    );
    assert.equal(js.includes("sai do cuidado da casa"), false);
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
    assert.ok(js.includes("Sem coordenadas") || html.includes("Sem coordenadas"));
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

  console.log(`\n=== ${passed} UI tests OK ===\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
