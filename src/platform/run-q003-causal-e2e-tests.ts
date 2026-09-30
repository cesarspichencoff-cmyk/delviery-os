import assert from "node:assert/strict";

import { asInternalRiderActorId } from "../entregas/foundation/brands";
import { InMemoryEventLog } from "../entregas/foundation/event-log";
import { createPilotPolicy } from "../entregas/foundation/policy";
import { createTrip, startTrip } from "../entregas/foundation/trip-machine";
import type { EntregasPublicEvent, EntregasSourceMode } from "../entregas/contracts/events/types";
import { domainEventToPublic } from "../entregas/integration/public-event-builder";
import type { EventEnvelope, SourceMode } from "./contracts/event-catalog";
import { projetar } from "./projections/operacao-viva";
import { recomendar } from "./copiloto/shadow";
import { construirIndiceIdentidadeCausal } from "./copiloto/causal-identity-bridge";
import { adaptarLotePublicoEntregas } from "./ingest/entregas-shadow-adapter";
import { reconciliarRecomendacoesCausais } from "./copiloto/causal-attention-orchestrator";
import type { FocoCanonico } from "./copiloto/attention-authority";

const MOTOR = require("../perfil-delivery/motor.js") as {
  FLOORS: { DEBOUNCE: number };
  novaSessao(): {
    active: null | { key: string; sit: Record<string, unknown>; until: number };
    pending: unknown;
    firedAt: Record<string, number>;
  };
  step(
    t: number,
    night: Array<Record<string, unknown>>,
    info: Record<string, unknown>,
    sess: {
      active: null | { key: string; sit: Record<string, unknown>; until: number };
      pending: unknown;
      firedAt: Record<string, number>;
    },
  ): unknown;
};

const DECISAO = require("../perfil-delivery/decisao.js") as {
  focoCanonico(active: unknown): FocoCanonico | null;
};

let passed = 0;
function test(nome: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("  ok  " + nome);
}

const UNIT = "ITAIM";
const NOW = new Date("2026-09-30T18:30:00.000Z");
const mode: SourceMode = "simulated";

function platformEvent(
  event_id: string,
  event_type: "trip_created" | "trip_started",
  trip_id: string,
  occurred_at: string,
  source_mode: SourceMode = mode,
): EventEnvelope {
  return {
    event_id,
    event_type,
    event_version: event_type + "@1.0.0",
    unit_id: UNIT,
    trip_id,
    occurred_at,
    origin: "device",
    source_mode,
    idempotency_key: "idem-" + event_id,
    payload: {},
  };
}

function staleProjection(
  trips: Array<{ trip_id: string; suffix: string }>,
  source_mode: SourceMode = mode,
) {
  const events: EventEnvelope[] = [];
  trips.forEach((t, i) => {
    events.push(
      platformEvent(
        "created-" + t.suffix,
        "trip_created",
        t.trip_id,
        "2026-09-30T17:" + String(10 + i).padStart(2, "0") + ":00.000Z",
        source_mode,
      ),
      platformEvent(
        "started-" + t.suffix,
        "trip_started",
        t.trip_id,
        "2026-09-30T17:" + String(20 + i).padStart(2, "0") + ":00.000Z",
        source_mode,
      ),
    );
  });

  return projetar(events, {
    agora: NOW,
    unit_id: UNIT,
    source_mode,
  });
}

function publicEventsForTrip(
  trip_id: string,
  orders: Array<{ delivery_id: string; order_ref: string }>,
  source_mode: EntregasSourceMode | undefined = "simulated",
): EntregasPublicEvent[] {
  const log = new InMemoryEventLog();
  const result = createTrip(log, {
    trip_id,
    unit_id: UNIT,
    courier_actor_id: asInternalRiderActorId("rider-" + trip_id),
    created_by: "ops",
    occurred_at: "2026-09-30T17:00:00.000Z",
    policy: createPilotPolicy(),
    initial_deliveries: orders,
  });
  assert.equal(result.ok, true);

  return log
    .all()
    .map((e) =>
      domainEventToPublic(e, {
        unit_id: UNIT,
        ...(source_mode ? { source_mode } : {}),
      }),
    )
    .filter((e): e is EntregasPublicEvent => e !== null);
}


function publicLifecycleForTrip(
  trip_id: string,
  order_ref: string,
): EntregasPublicEvent[] {
  const log = new InMemoryEventLog();
  const rider = asInternalRiderActorId("rider-" + trip_id);
  const created = createTrip(log, {
    trip_id,
    unit_id: UNIT,
    courier_actor_id: rider,
    created_by: "ops",
    occurred_at: "2026-09-30T17:00:00.000Z",
    policy: createPilotPolicy(),
    initial_deliveries: [{ delivery_id: "D-" + trip_id, order_ref }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return [];

  const started = startTrip(
    log,
    created.state,
    "2026-09-30T17:20:00.000Z",
    rider,
  );
  assert.equal(started.ok, true);

  return log
    .all()
    .map((e) =>
      domainEventToPublic(e, {
        unit_id: UNIT,
        source_mode: "simulated",
      }),
    )
    .filter((e): e is EntregasPublicEvent => e !== null);
}

function focoRealDePedido(orderId: string): FocoCanonico {
  const sess = MOTOR.novaSessao();
  const t0 = 100;
  const night = [
    {
      id: orderId,
      r: 0,
      p: 10_000,
    },
  ];

  MOTOR.step(t0, night, {}, sess);
  MOTOR.step(t0 + MOTOR.FLOORS.DEBOUNCE, night, {}, sess);

  const foco = DECISAO.focoCanonico(sess.active);
  assert.ok(foco, "MOTOR não abriu Foco");
  assert.equal(foco?.kind, "order");
  assert.equal(foco?.id, orderId);
  return foco!;
}

function recomendacoesDaRua(projecao: ReturnType<typeof staleProjection>) {
  const recs = recomendar(projecao, { agora: NOW });
  const sinalVelho = recs.filter((r) => r.policy_id === "sinal-velho");
  assert.ok(sinalVelho.length >= 1, "Shadow real não gerou política sinal-velho");
  return sinalVelho;
}

console.log("\n=== Q-003 — E2E SHADOW -> IDENTIDADE -> FOCO ===\n");

test("E2E1 caminho positivo usa motores reais e entra no MESMO Foco", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  assert.deepEqual(recs[0].input_event_ids, ["started-t1"]);

  const indice = construirIndiceIdentidadeCausal(
    publicEventsForTrip("T1", [{ delivery_id: "D1", order_ref: "P100" }]),
  );
  const foco = focoRealDePedido("P100");

  const r = reconciliarRecomendacoesCausais(recs, projecao, indice, foco);
  assert.equal(r.elegiveis.length, 1);
  assert.equal(r.retidas.length, 0);
  assert.equal(r.elegiveis[0].policy_id, "sinal-velho");
  assert.equal(r.elegiveis[0].requires_human, true);
  assert.equal(r.elegiveis[0].status, "proposed");
});

test("E2E2 mesmo dado com Foco de outro pedido fica invisível", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal(
    publicEventsForTrip("T1", [{ delivery_id: "D1", order_ref: "P100" }]),
  );

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P999"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas.length, 1);
  assert.equal(r.retidas[0].etapa, "foco");
  assert.equal(r.retidas[0].motivo, "causa_raiz_divergente");
});

test("E2E3 sem Foco ativo Shadow não cria atenção", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal(
    publicEventsForTrip("T1", [{ delivery_id: "D1", order_ref: "P100" }]),
  );

  const r = reconciliarRecomendacoesCausais(recs, projecao, indice, null);

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "foco");
  assert.equal(r.retidas[0].motivo, "sem_foco_ativo");
});

test("E2E4 Trip com dois pedidos não escolhe um deles", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal(
    publicEventsForTrip("T1", [
      { delivery_id: "D1", order_ref: "P100" },
      { delivery_id: "D2", order_ref: "P200" },
    ]),
  );

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "identidade");
  assert.equal(r.retidas[0].motivo, "viagem_multi_pedido");
});

test("E2E5 recomendação sustentada por duas Trips não escolhe uma", () => {
  const projecao = staleProjection([
    { trip_id: "T1", suffix: "t1" },
    { trip_id: "T2", suffix: "t2" },
  ]);
  const recs = recomendacoesDaRua(projecao);
  assert.ok(recs.some((r) => r.input_event_ids.length === 2));

  const indice = construirIndiceIdentidadeCausal([
    ...publicEventsForTrip("T1", [{ delivery_id: "D1", order_ref: "P100" }]),
    ...publicEventsForTrip("T2", [{ delivery_id: "D2", order_ref: "P200" }]),
  ]);

  const alvo = recs.filter((r) => r.input_event_ids.length === 2);
  const r = reconciliarRecomendacoesCausais(
    alvo,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "identidade");
  assert.equal(r.retidas[0].motivo, "evidencia_multi_viagem");
});

test("E2E6 source_mode ausente continua UNKNOWN e invisível", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  const comModo = publicEventsForTrip(
    "T1",
    [{ delivery_id: "D1", order_ref: "P100" }],
    "simulated",
  );
  const semModo = comModo.map((e) => {
    const { source_mode: _removido, ...resto } = e;
    return resto as EntregasPublicEvent;
  });
  const indice = construirIndiceIdentidadeCausal(semModo);

  assert.ok(indice.problemas.some((p) => p.codigo === "source_mode_ausente"));

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "identidade");
  assert.equal(r.retidas[0].motivo, "viagem_sem_order_ref_univoco");
});

test("E2E7 vínculo REAL nunca alimenta projeção SIMULATED", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }], "simulated");
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal(
    publicEventsForTrip(
      "T1",
      [{ delivery_id: "D1", order_ref: "P100" }],
      "real",
    ),
  );

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "identidade");
  assert.equal(r.retidas[0].motivo, "viagem_sem_order_ref_univoco");
});

test("E2E8 order_ref duplicado ativo em duas Trips nunca vira Foco", () => {
  const projecao = staleProjection([{ trip_id: "T1", suffix: "t1" }]);
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal([
    ...publicEventsForTrip("T1", [{ delivery_id: "D1", order_ref: "P100" }]),
    ...publicEventsForTrip("T2", [{ delivery_id: "D2", order_ref: "P100" }]),
  ]);

  assert.ok(
    indice.problemas.some((p) => p.codigo === "order_ref_duplicado_ativo"),
  );

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 0);
  assert.equal(r.retidas[0].etapa, "identidade");
});


test("E2E9 um único feed público sustenta projeção, identidade e Foco", () => {
  const publicos = publicLifecycleForTrip("T1", "P100");
  const adaptado = adaptarLotePublicoEntregas(publicos);

  assert.deepEqual(
    adaptado.eventos.map((e) => e.event_type),
    ["trip_created", "trip_started"],
  );
  assert.ok(
    adaptado.recusados.some(
      (r) =>
        r.source_event_type === "delivery_added" &&
        r.motivo === "tipo_sem_equivalencia_segura",
    ),
  );

  const projecao = projetar(adaptado.eventos, {
    agora: NOW,
    unit_id: UNIT,
    source_mode: "simulated",
  });
  const recs = recomendacoesDaRua(projecao);
  const indice = construirIndiceIdentidadeCausal(publicos);

  const r = reconciliarRecomendacoesCausais(
    recs,
    projecao,
    indice,
    focoRealDePedido("P100"),
  );

  assert.equal(r.elegiveis.length, 1);
  assert.equal(r.retidas.length, 0);
  assert.deepEqual(r.elegiveis[0].input_event_ids, [
    publicos.find((e) => e.event_type === "trip_started")!.event_id,
  ]);
});

console.log("\nQ003_CAUSAL_E2E: " + passed + "/9 PASS");
