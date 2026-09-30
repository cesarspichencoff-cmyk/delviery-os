import assert from "node:assert/strict";

import { InMemoryEventLog } from "../entregas/foundation/event-log";
import { createPilotPolicy } from "../entregas/foundation/policy";
import { asInternalRiderActorId } from "../entregas/foundation/brands";
import {
  createTrip,
  removeDeliveryFromTrip,
} from "../entregas/foundation/trip-machine";
import { domainEventToPublic } from "../entregas/integration/public-event-builder";
import {
  validatePublicEvent,
} from "../entregas/contracts/events/validate";
import type {
  EntregasPublicEvent,
  EntregasSourceMode,
} from "../entregas/contracts/events/types";
import type { Projecao } from "./projections/operacao-viva";
import type { Recomendacao } from "./copiloto/shadow";
import {
  construirIndiceIdentidadeCausal,
  orderRefsAtivosDaTrip,
  resolverAncoraCausalDaRecomendacao,
} from "./copiloto/causal-identity-bridge";
import { avaliarCandidataShadowNoFoco } from "./copiloto/attention-authority";

let passed = 0;
function test(nome: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("  ok  " + nome);
}

const t0 = "2026-09-30T18:00:00.000Z";
const mode: EntregasSourceMode = "simulated";

function pub(
  event_id: string,
  event_type: "delivery_added" | "delivery_removed",
  extra: {
    trip_id?: string;
    delivery_id?: string;
    order_ref?: string;
    source_mode?: EntregasSourceMode;
    active?: boolean;
    unit_id?: string;
  } = {},
): EntregasPublicEvent {
  return {
    event_id,
    event_type,
    schema_version: "1.0.0",
    occurred_at: t0,
    recorded_at: new Date(
      Date.parse(t0) + Number(event_id.replace(/\D/g, "") || "0"),
    ).toISOString(),
    idempotency_key: "idem-" + event_id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: extra.unit_id ?? "ITAIM",
    source_mode: extra.source_mode,
    trip_id: extra.trip_id,
    delivery_id: extra.delivery_id,
    payload: {
      ...(extra.order_ref ? { order_ref: extra.order_ref } : {}),
      ...(extra.active !== undefined ? { active: extra.active } : {}),
    },
    correlation_id: extra.trip_id ?? event_id,
  };
}

function rec(
  ids: string[],
  source_mode: "real" | "simulated" | "control" = "simulated",
): Recomendacao {
  return {
    recommendation_id: "rec-" + ids.join("-"),
    policy_id: "fixture",
    policy_version: "copiloto-shadow@1.0.0",
    input_event_ids: ids,
    projection_version: "operacao-viva@1.0.0",
    source_mode,
    confianca: {
      estado: "apurada",
      valor: 0.8,
      politica: "fixture",
      versao_da_politica: "1",
      evidencias: ids,
    },
    risk_level: "medio",
    recommended_action: "fixture",
    reason: "fixture",
    indisponivel: [],
    requires_human: true,
    created_at: t0,
    expires_at: "2026-09-30T18:05:00.000Z",
    status: "proposed",
  };
}

function projection(
  trips: Array<{ trip_id: string; eventos: string[] }>,
): Projecao {
  return {
    projection_version: "operacao-viva@1.0.0",
    calculada_em: t0,
    unit_id: "ITAIM",
    source_mode: "simulated",
    viagens: trips.map((t) => ({
      trip_id: t.trip_id,
      unit_id: "ITAIM",
      estado: "em_rota",
      ultimo_fato_em: t0,
      ocorrencias_abertas: 0,
      source_mode: "simulated",
      eventos: t.eventos,
      frescor: "fresh",
    })),
    dimensoes: {
      carga: trips.length,
      atraso: 0,
      mobilidade: trips.length,
      integridade_sinal: "fresh",
      saude_sincronizacao: "fresh",
      confianca_evidencia: "alta",
      capacidade_operacional: "desconhecida",
      ocorrencias: 0,
      risco_envelhecimento: "baixo",
    },
    quarentena: [],
  };
}

console.log("\n=== Q-003 — PONTE DE IDENTIDADE CAUSAL ===\n");

test("CI0 source_mode é opcional, validado e nunca defaulta real", () => {
  const sem = pub("e0", "delivery_added", {
    trip_id: "T0",
    delivery_id: "D0",
    order_ref: "P0",
  });
  assert.equal(validatePublicEvent(sem).ok, true);
  assert.equal(sem.source_mode, undefined);

  const ruim = {
    ...sem,
    source_mode: "REAL",
  };
  assert.equal(validatePublicEvent(ruim).ok, false);
});

test("CI1 domínio preserva order_ref no delivery_added público", () => {
  const log = new InMemoryEventLog();
  const r = createTrip(log, {
    trip_id: "T1",
    unit_id: "ITAIM",
    courier_actor_id: asInternalRiderActorId("r1"),
    created_by: "ops",
    occurred_at: t0,
    policy: createPilotPolicy(),
    initial_deliveries: [{ delivery_id: "D1", order_ref: "P100" }],
  });
  assert.equal(r.ok, true);

  const ev = log.all().find((e) => e.event_type === "delivery_added");
  assert.ok(ev);

  const publico = domainEventToPublic(ev!, {
    unit_id: "ITAIM",
    source_mode: mode,
  });
  assert.ok(publico);
  assert.equal(publico!.trip_id, "T1");
  assert.equal(publico!.delivery_id, "D1");
  assert.equal(publico!.payload.order_ref, "P100");
  assert.equal(publico!.source_mode, "simulated");

  const semModo = domainEventToPublic(ev!, { unit_id: "ITAIM" });
  assert.equal(semModo?.source_mode, undefined);
});

test("CI2 delivery_removed preserva trip e order_ref", () => {
  const log = new InMemoryEventLog();
  const c = createTrip(log, {
    trip_id: "T1",
    unit_id: "ITAIM",
    courier_actor_id: asInternalRiderActorId("r1"),
    created_by: "ops",
    occurred_at: t0,
    policy: createPilotPolicy(),
    initial_deliveries: [{ delivery_id: "D1", order_ref: "P100" }],
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const rm = removeDeliveryFromTrip(
    log,
    c.state,
    "D1",
    t0,
    "teste",
    "ops",
    createPilotPolicy(),
  );
  assert.equal(rm.ok, true);

  const ev = log.all().find((e) => e.event_type === "delivery_removed");
  assert.ok(ev);

  const publico = domainEventToPublic(ev!, {
    unit_id: "ITAIM",
    source_mode: mode,
  });
  assert.equal(publico?.trip_id, "T1");
  assert.equal(publico?.payload.order_ref, "P100");
  assert.equal(publico?.payload.active, false);
});

test("CI3 source_mode ausente nunca entra no índice causal", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
    }),
  ]);
  assert.equal(idx.vinculos.length, 0);
  assert.equal(idx.problemas[0]?.codigo, "source_mode_ausente");
});

test("CI4 trip multi-pedido não colapsa identidade", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
      source_mode: mode,
    }),
    pub("e2", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D2",
      order_ref: "P2",
      source_mode: mode,
    }),
  ]);

  assert.deepEqual(
    orderRefsAtivosDaTrip(idx, {
      unit_id: "ITAIM",
      source_mode: mode,
      trip_id: "T1",
    }),
    ["P1", "P2"],
  );

  const r = resolverAncoraCausalDaRecomendacao(
    rec(["ov1"]),
    projection([{ trip_id: "T1", eventos: ["ov1"] }]),
    idx,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "viagem_multi_pedido");
});

test("CI5 remoção deixa somente o order_ref ainda ativo", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
      source_mode: mode,
    }),
    pub("e2", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D2",
      order_ref: "P2",
      source_mode: mode,
    }),
    pub("e3", "delivery_removed", {
      trip_id: "T1",
      delivery_id: "D2",
      source_mode: mode,
      active: false,
    }),
  ]);

  assert.deepEqual(
    orderRefsAtivosDaTrip(idx, {
      unit_id: "ITAIM",
      source_mode: mode,
      trip_id: "T1",
    }),
    ["P1"],
  );
});

test("CI6 mesma order_ref ativa em duas trips vira conflito", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
      source_mode: mode,
    }),
    pub("e2", "delivery_added", {
      trip_id: "T2",
      delivery_id: "D2",
      order_ref: "P1",
      source_mode: mode,
    }),
  ]);

  assert.ok(
    idx.problemas.some((p) => p.codigo === "order_ref_duplicado_ativo"),
  );
  assert.deepEqual(
    orderRefsAtivosDaTrip(idx, {
      unit_id: "ITAIM",
      source_mode: mode,
      trip_id: "T1",
    }),
    [],
  );
});

test("CI7 uma trip + um pedido produz âncora literal", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P100",
      source_mode: mode,
    }),
  ]);

  const recomendacao = rec(["ov1"]);
  const r = resolverAncoraCausalDaRecomendacao(
    recomendacao,
    projection([{ trip_id: "T1", eventos: ["ov0", "ov1"] }]),
    idx,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.ancora, { kind: "pedido", id: "P100" });

  assert.equal(
    avaliarCandidataShadowNoFoco(
      { recomendacao, ancora: r.ancora },
      { key: "od:P100", kind: "order", id: "P100" },
    ).elegivel,
    true,
  );

  assert.equal(
    avaliarCandidataShadowNoFoco(
      { recomendacao, ancora: r.ancora },
      { key: "od:P999", kind: "order", id: "P999" },
    ).elegivel,
    false,
  );
});

test("CI8 evidência de múltiplas trips nunca escolhe uma", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
      source_mode: mode,
    }),
    pub("e2", "delivery_added", {
      trip_id: "T2",
      delivery_id: "D2",
      order_ref: "P2",
      source_mode: mode,
    }),
  ]);

  const r = resolverAncoraCausalDaRecomendacao(
    rec(["ov1", "ov2"]),
    projection([
      { trip_id: "T1", eventos: ["ov1"] },
      { trip_id: "T2", eventos: ["ov2"] },
    ]),
    idx,
  );

  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "evidencia_multi_viagem");
});

test("CI9 source_mode divergente bloqueia promoção", () => {
  const idx = construirIndiceIdentidadeCausal([
    pub("e1", "delivery_added", {
      trip_id: "T1",
      delivery_id: "D1",
      order_ref: "P1",
      source_mode: mode,
    }),
  ]);

  const r = resolverAncoraCausalDaRecomendacao(
    rec(["ov1"], "real"),
    projection([{ trip_id: "T1", eventos: ["ov1"] }]),
    idx,
  );

  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "modo_divergente");
});

console.log("\nQ003_CAUSAL_IDENTITY: " + passed + "/10 PASS");
