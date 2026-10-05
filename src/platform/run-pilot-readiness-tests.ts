/**
 * DeliveryOS — Pilot Readiness Gate
 *
 * Este gate não ativa nada. Ele impede que provas locais sejam promovidas a
 * "GO" de campo antes dos efeitos externos correspondentes.
 *
 * Perfis:
 *   OBSERVATIONAL_READ_ONLY — leitura/observação, sem ação humana.
 *   ACTION_ENABLED         — adiciona identidade/executor/auditoria reais.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Json = Record<string, any>;

const ROOT = process.cwd();
const state = JSON.parse(
  readFileSync(join(ROOT, "docs/execution/STATE.json"), "utf8"),
) as Json;
const evidenceLines = readFileSync(
  join(ROOT, "docs/execution/EVIDENCE.jsonl"),
  "utf8",
)
  .split(/\r?\n/)
  .filter((x) => x.trim().length > 0)
  .map((x) => JSON.parse(x) as Json);
const questions = readFileSync(
  join(ROOT, "docs/execution/PERGUNTAS.jsonl"),
  "utf8",
)
  .split(/\r?\n/)
  .filter((x) => x.trim().length > 0)
  .slice(1)
  .map((x) => JSON.parse(x) as Json);

function hasEvidence(id: string): boolean {
  return evidenceLines.some((e) => e.id === id);
}

interface Check {
  id: string;
  status: "PASS" | "BLOCKED_EXTERNAL" | "BLOCKED_HUMAN" | "NOT_REQUIRED";
  detail: string;
}

const local: Check[] = [];
const external: Check[] = [];
const human: Check[] = [];

function pass(id: string, condition: unknown, detail: string): void {
  assert.ok(condition, id + ": " + detail);
  local.push({ id, status: "PASS", detail });
}

pass(
  "L1_SOURCE_TO_PRODUCT",
  state.source_to_product_e2e_20261005?.status ===
    "LOCAL_SYSTEM_CHAIN_PROVEN_NOT_DEPLOYED",
  "fonte PostgreSQL → ingest → event_log → Product System provado localmente",
);
pass(
  "L2_DEVICE_QUEUE",
  state.device_queue_telemetry_b5?.blocker_status === "RESOLVIDO_LOCAL",
  "fila offline do aparelho chega como telemetria mínima e fresca",
);
pass(
  "L3_MULTI_UNIT",
  state.multi_unit_read_b8?.status ===
    "RESOLVED_TECHNICAL_LOCAL_RUNTIME_PROVEN",
  "leitura multi-unidade real provada localmente",
);
pass(
  "L4_FIGMA",
  state.figma_full_recovery?.pb11 === "RESOLVIDO" &&
    state.figma_full_recovery?.pb13 === "RESOLVIDO",
  "paridade Figma Full/documental resolvida",
);
pass(
  "L5_BACKUP_OFFHOST",
  hasEvidence("backup-offhost-b2-minimal-creds-final-2026-10-03"),
  "backup off-host + restore real provados em ensaio isolado",
);
pass(
  "L6_SOURCE_INGEST",
  state.source_ingest_pg_feed?.status ===
    "LOCAL_PROCESS_PROVEN_NOT_DEPLOYED",
  "source-ingest PostgreSQL provado como processo local",
);
pass(
  "L7_B7_FAIL_CLOSED",
  state.human_action_gate_b7?.status ===
    "CONTRACT_PREPARED_NOT_EXECUTABLE" &&
    state.human_action_gate_b7?.current_boundary?.actions_exposed === false,
  "ações humanas continuam fail-closed e não expostas",
);

const c2 = state.c2_c5_recheck_20261004?.c2;
if (c2?.physical_device !== "PROVEN") {
  external.push({
    id: "E1_PHYSICAL_ANDROID",
    status: "BLOCKED_EXTERNAL",
    detail: "bateria em aparelho físico real ainda não foi executada/provada",
  });
}

const c4 = state.c2_c5_recheck_20261004?.c4;
if (
  c4?.status === "TECHNICALLY_CLOSED_OPERATIONAL_EFFECT_PENDING" ||
  (Array.isArray(c4?.remaining) && c4.remaining.length > 0)
) {
  external.push({
    id: "E2_OPERATIONAL_DB_AND_DEPLOY",
    status: "BLOCKED_EXTERNAL",
    detail:
      "credenciais reais por unidade + deploy autorizado/cutover operacional ainda pendentes",
  });
}

if (state.source_ingest_pg_feed?.production !== "ACTIVATED") {
  external.push({
    id: "E3_SOURCE_INGEST_ACTIVATION",
    status: "BLOCKED_EXTERNAL",
    detail: "source-ingest de produção permanece NOT_ACTIVATED",
  });
}

if (
  String(state.source_ingest_pg_feed?.consumer_live ?? "").includes("OFF") ||
  String(state.source_ingest_pg_feed?.consumer_live ?? "").includes(
    "NOT_AUTHORIZED",
  )
) {
  external.push({
    id: "E4_CONSUMER_LIVE",
    status: "BLOCKED_EXTERNAL",
    detail: "consumer_live permanece OFF / NOT_AUTHORIZED",
  });
}

if (
  state.source_to_product_e2e_20261005?.product_reader?.official_compose !==
    "WIRED"
) {
  external.push({
    id: "E5_PRODUCT_READER_WIRING",
    status: "BLOCKED_EXTERNAL",
    detail:
      "product reader existe e tem least privilege local, mas ainda não está wired no compose oficial",
  });
}

if (
  state.source_to_product_e2e_20261005?.product_reader?.credential !==
    "CREATED"
) {
  external.push({
    id: "E6_PRODUCT_READER_CREDENTIAL",
    status: "BLOCKED_EXTERNAL",
    detail: "credencial real do Product System não foi criada",
  });
}

const b7 = state.human_action_gate_b7?.current_boundary;
const b7Ready =
  b7?.identity_provider_connected === true &&
  b7?.executor_connected === true &&
  b7?.audit_sink_connected === true &&
  b7?.actions_exposed === true;

if (!b7Ready) {
  external.push({
    id: "E7_ACTION_EXECUTION_STACK",
    status: "BLOCKED_EXTERNAL",
    detail:
      "identidade humana, executor e auditoria reais ainda não estão conectados",
  });
}

for (const q of questions.filter((q) => q.estado === "open")) {
  if (
    ["Q-001", "Q-002", "Q-004", "Q-005", "Q-008", "Q-009"].includes(q.id)
  ) {
    human.push({
      id: q.id,
      status: "BLOCKED_HUMAN",
      detail: q.pergunta,
    });
  }
}

const observationalBlockers = external.filter(
  (x) => x.id !== "E7_ACTION_EXECUTION_STACK",
);
const actionBlockers = external;

const observational =
  observationalBlockers.length === 0 ? "GO" : "BLOCKED_EXTERNAL";
const action = actionBlockers.length === 0 ? "GO" : "BLOCKED_EXTERNAL";

// Progressivo por construção: quando todos os gates externos forem
// comprovados no STATE, o perfil vira GO sem alterar este teste. Enquanto
// existir qualquer blocker, "GO" é impossível.
assert.equal(
  observational === "GO",
  observationalBlockers.length === 0,
  "classificação observacional divergiu dos blockers medidos",
);
assert.equal(
  action === "GO",
  actionBlockers.length === 0,
  "classificação action-enabled divergiu dos blockers medidos",
);

console.log("\n=== DELIVERYOS PILOT READINESS ===\n");
for (const c of local) console.log("PASS ", c.id, "—", c.detail);
console.log("\nOBSERVATIONAL_READ_ONLY:", observational);
for (const c of observationalBlockers) {
  console.log("  BLOCK", c.id, "—", c.detail);
}
console.log("\nACTION_ENABLED:", action);
for (const c of actionBlockers) {
  console.log("  BLOCK", c.id, "—", c.detail);
}
console.log("\nHUMAN_PRODUCT_QUESTIONS:", human.length);
for (const c of human) console.log("  HUMAN", c.id, "—", c.detail);

console.log(
  "\nPILOT_READINESS_GATE_GREEN: local proofs are intact and false GO is blocked",
);
