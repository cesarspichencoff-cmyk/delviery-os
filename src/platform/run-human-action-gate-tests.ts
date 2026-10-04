import assert from "node:assert/strict";

import {
  evaluateHumanActionGate,
  productSystemHumanActionBoundary,
  type HumanActor,
  type HumanActionEnvironment,
  type HumanActionSubject,
} from "../product/actions/human-action-gate";

const NOW = new Date("2026-10-04T10:00:00.000Z");

function subject(
  overrides: Partial<HumanActionSubject> = {},
): HumanActionSubject {
  return {
    recommendation_id: "rec-real-001",
    unit_id: "ITAIM",
    source_mode: "real",
    status: "proposed",
    requires_human: true,
    expires_at: "2026-10-04T11:00:00.000Z",
    ...overrides,
  };
}

function actor(overrides: Partial<HumanActor> = {}): HumanActor {
  return {
    actor_id: "human.cesar",
    auth_context_id: "session.test-001",
    authenticated_at: "2026-10-04T09:55:00.000Z",
    expires_at: "2026-10-04T11:00:00.000Z",
    unit_ids: ["ITAIM"],
    permissions: ["copilot.recommendation.dismiss"],
    ...overrides,
  };
}

const disconnected: HumanActionEnvironment = {
  executor_connected: false,
  audit_sink_connected: false,
};

const connected: HumanActionEnvironment = {
  executor_connected: true,
  audit_sink_connected: true,
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("PASS", name);
}

test("HAG1 boundary atual do Product System continua fail-closed", () => {
  const r = productSystemHumanActionBoundary(
    "dismiss_recommendation",
    subject(),
    NOW,
  );
  assert.equal(r.identity_proven, false);
  assert.equal(r.eligible_to_request, false);
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("identity_missing"));
  assert.ok(r.reasons.includes("executor_not_connected"));
  assert.ok(r.reasons.includes("audit_sink_not_connected"));
});

test("HAG2 ator valido pode ser elegivel sem tornar execucao pronta", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor(),
    environment: disconnected,
    now: NOW,
  });
  assert.equal(r.identity_proven, true);
  assert.equal(r.permission_granted, true);
  assert.equal(r.unit_scope_granted, true);
  assert.equal(r.eligible_to_request, true);
  assert.equal(r.execution_ready, false);
  assert.deepEqual(r.reasons, [
    "executor_not_connected",
    "audit_sink_not_connected",
  ]);
});

test("HAG3 contrato permite execution_ready apenas com executor e auditoria", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor(),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.eligible_to_request, true);
  assert.equal(r.execution_ready, true);
  assert.deepEqual(r.reasons, []);
});

test("HAG4 simulated nunca pode virar acao humana real", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject({ source_mode: "simulated" }),
    actor: actor(),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("non_real_source"));
});

test("HAG5 control nunca pode virar acao humana real", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject({ source_mode: "control" }),
    actor: actor(),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("non_real_source"));
});

test("HAG6 recomendacao terminal nao pode ser acionada de novo", () => {
  for (const status of ["dismissed", "expired", "invalidated"] as const) {
    const r = evaluateHumanActionGate({
      kind: "dismiss_recommendation",
      subject: subject({ status }),
      actor: actor(),
      environment: connected,
      now: NOW,
    });
    assert.equal(r.execution_ready, false, status);
    assert.ok(r.reasons.includes("recommendation_not_active"), status);
  }
});

test("HAG7 recomendacao vencida bloqueia mesmo se status ainda diz proposed", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject({ expires_at: "2026-10-04T09:59:59.000Z" }),
    actor: actor(),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("recommendation_expired"));
});

test("HAG8 unidade fora do escopo do humano bloqueia", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor({ unit_ids: ["PINHEIROS"] }),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.unit_scope_granted, false);
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("unit_scope_missing"));
});

test("HAG9 permissao errada bloqueia", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor({
      permissions: ["copilot.recommendation.accept_future"],
    }),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.permission_granted, false);
  assert.ok(r.reasons.includes("permission_missing"));
});

test("HAG10 sessao humana vencida bloqueia", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor({ expires_at: "2026-10-04T09:59:00.000Z" }),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.identity_proven, true);
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("session_expired"));
});

test("HAG11 identidade malformada bloqueia antes de permissao", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject(),
    actor: actor({ actor_id: "x" }),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.identity_proven, false);
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("identity_invalid"));
});

test("HAG12 aceite futuro exige permissao propria e continua sem executar mundo", () => {
  const r = evaluateHumanActionGate({
    kind: "accept_for_future",
    subject: subject(),
    actor: actor({
      permissions: ["copilot.recommendation.accept_future"],
    }),
    environment: disconnected,
    now: NOW,
  });
  assert.equal(
    r.required_permission,
    "copilot.recommendation.accept_future",
  );
  assert.equal(r.eligible_to_request, true);
  assert.equal(r.execution_ready, false);
});

test("HAG13 recomendacao que nao exige humano nao vira acao por conveniencia", () => {
  const r = evaluateHumanActionGate({
    kind: "dismiss_recommendation",
    subject: subject({ requires_human: false }),
    actor: actor(),
    environment: connected,
    now: NOW,
  });
  assert.equal(r.execution_ready, false);
  assert.ok(r.reasons.includes("human_decision_not_required"));
});

console.log(`HUMAN_ACTION_GATE: ${passed}/13 PASS`);
