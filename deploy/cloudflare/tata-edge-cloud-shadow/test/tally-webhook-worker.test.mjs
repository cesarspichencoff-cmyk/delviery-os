import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";
import {
  tallySignatureForBody,
  ITEM_MISSING_ROWS,
} from "../src/tally-webhook-core.mjs";

function choice(label, selected, options) {
  const mapped = options.map((text, index) => ({ id: `opt_${index}`, text }));
  const option = mapped.find((item) => item.text === selected);
  return {
    label,
    type: "MULTIPLE_CHOICE",
    value: option ? [option.id] : [],
    options: mapped,
  };
}

function matrix(label, rows, answers) {
  const rowDefs = rows.map((text, index) => ({ id: `row_${index}`, text }));
  const columns = [
    "Sim",
    "Não",
    "Não consegui confirmar",
    "Não se aplica",
  ].map((text, index) => ({ id: `col_${index}`, text }));
  const value = {};
  rowDefs.forEach((row, index) => {
    const column = columns.find((item) => item.text === answers[index]);
    value[row.id] = column ? [column.id] : [];
  });
  return { label, type: "MATRIX", rows: rowDefs, columns, value };
}

function payload(overrides = {}) {
  return {
    eventId: overrides.eventId ?? "evt-shadow-1",
    eventType: "FORM_RESPONSE",
    createdAt: "2026-09-26T10:00:00.000Z",
    data: {
      submissionId: overrides.submissionId ?? "sub-shadow-1",
      respondentId: "resp-shadow-1",
      formId: overrides.formId ?? "eq4lae",
      formName: "Caixa Pulse | Ocorrência de Turno",
      createdAt: "2026-09-26T09:59:59.000Z",
      fields: [
        { label: "Operador", type: "INPUT_TEXT", value: "VERTICE SHADOW" },
        { label: "Data", type: "INPUT_DATE", value: "2026-09-26" },
        choice("Turno", "Manhã", ["Manhã", "Noite"]),
        choice("Tipo de Ocorrência", "Problema no Delivery", [
          "Problema no Delivery",
          "Item pausado",
        ]),
        choice("Subtipo operacional", "Item faltando", [
          "Item faltando",
          "Item errado",
          "Outro",
        ]),
        matrix(
          "Verificações - Item faltando",
          ITEM_MISSING_ROWS,
          ["Sim", "Não", "Não consegui confirmar", "Não se aplica"],
        ),
        { label: "Pedido / Mesa / Referência", type: "INPUT_TEXT", value: "REF-SHADOW" },
        { label: "O que aconteceu?\n", type: "TEXTAREA", value: overrides.happened ?? "Teste shadow" },
        { label: "Ação Tomada?", type: "TEXTAREA", value: "Nenhuma ação operacional" },
        choice("Status", "Em Andamento", ["Em Andamento", "Concluído"]),
      ],
    },
  };
}

function fakeCaptureDb() {
  const rows = [];
  let mutationCalls = 0;
  return {
    rows,
    get mutationCalls() { return mutationCalls; },
    prepare(sql) {
      const isInsert = /^\s*INSERT\s+OR\s+IGNORE/i.test(sql);
      const isSelect = /^\s*SELECT\b/i.test(sql);
      if (!isInsert && !isSelect) throw new Error("UNEXPECTED_SQL");
      return {
        bind(...values) {
          return {
            async run() {
              if (!isInsert) throw new Error("RUN_ON_SELECT");
              mutationCalls += 1;
              const [
                event_id, submission_id, form_id, source_created_at,
                operator_name, business_date, shift, category,
                reference_text, happened_text, action_text, status, subtype,
                item_missing_barriers_json, wrong_item_barriers_json,
                truth_class, payload_sha256, received_at,
              ] = values;
              const conflict = rows.find(
                (row) => row.event_id === event_id || row.submission_id === submission_id,
              );
              if (conflict) return { meta: { changes: 0 } };
              rows.push({
                event_id, submission_id, form_id, source_created_at,
                operator_name, business_date, shift, category,
                reference_text, happened_text, action_text, status, subtype,
                item_missing_barriers_json, wrong_item_barriers_json,
                truth_class, payload_sha256, received_at,
              });
              return { meta: { changes: 1 } };
            },
            async first() {
              if (!isSelect) throw new Error("FIRST_ON_INSERT");
              const [eventId, submissionId] = values;
              return rows.find(
                (row) => row.event_id === eventId || row.submission_id === submissionId,
              ) ?? null;
            },
          };
        },
      };
    },
  };
}

async function signedRequest(bodyValue, secret = "shadow-secret") {
  const raw = JSON.stringify(bodyValue);
  const signature = await tallySignatureForBody(raw, secret);
  return new Request("https://edge.example/sources/tally/occurrence-barrier", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tally-signature": signature,
    },
    body: raw,
  });
}

function env(db, overrides = {}) {
  return {
    TALLY_CAPTURE_ENABLED: "true",
    TALLY_EXPECTED_FORM_ID: "eq4lae",
    TALLY_SIGNING_SECRET: "shadow-secret",
    TALLY_CAPTURE_DB: db,
    ...overrides,
  };
}

test("Tally intake route is invisible while disabled", async () => {
  const db = fakeCaptureDb();
  const response = await worker.fetch(
    new Request("https://edge.example/sources/tally/occurrence-barrier", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { TALLY_CAPTURE_ENABLED: "false", TALLY_CAPTURE_DB: db },
  );
  assert.equal(response.status, 404);
  assert.equal(db.mutationCalls, 0);
});

test("signed shadow event is persisted as self-report and replay is idempotent", async () => {
  const db = fakeCaptureDb();
  const body = payload();
  const first = await worker.fetch(await signedRequest(body), env(db));
  assert.equal(first.status, 202);
  const firstReceipt = await first.json();
  assert.equal(firstReceipt.accepted, true);
  assert.equal(firstReceipt.duplicate, false);
  assert.equal(firstReceipt.truth_class, "OPERATOR_SELF_REPORT");
  assert.equal(firstReceipt.external_effects_authorized, false);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].form_id, "eq4lae");
  assert.equal(db.rows[0].truth_class, "OPERATOR_SELF_REPORT");
  assert.equal(db.rows[0].subtype, "Item faltando");

  const replay = await worker.fetch(await signedRequest(body), env(db));
  assert.equal(replay.status, 202);
  const replayReceipt = await replay.json();
  assert.equal(replayReceipt.duplicate, true);
  assert.equal(db.rows.length, 1);
});

test("tampered signature is rejected before persistence", async () => {
  const db = fakeCaptureDb();
  const body = JSON.stringify(payload());
  const response = await worker.fetch(
    new Request("https://edge.example/sources/tally/occurrence-barrier", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tally-signature": "invalid",
      },
      body,
    }),
    env(db),
  );
  assert.equal(response.status, 401);
  assert.equal(db.rows.length, 0);
  assert.equal(db.mutationCalls, 0);
});

test("same source ids with a different payload fail as replay conflict", async () => {
  const db = fakeCaptureDb();
  const firstBody = payload();
  const first = await worker.fetch(await signedRequest(firstBody), env(db));
  assert.equal(first.status, 202);

  const changed = payload({ happened: "conteúdo alterado" });
  const conflict = await worker.fetch(await signedRequest(changed), env(db));
  assert.equal(conflict.status, 409);
  const result = await conflict.json();
  assert.equal(result.error, "tally_replay_conflict");
  assert.equal(db.rows.length, 1);
});

test("wrong shadow form identity fails closed", async () => {
  const db = fakeCaptureDb();
  const response = await worker.fetch(
    await signedRequest(payload({ formId: "ZjVv1a" })),
    env(db),
  );
  assert.equal(response.status, 422);
  const result = await response.json();
  assert.equal(result.error, "tally_form_id_mismatch");
  assert.equal(db.rows.length, 0);
});
