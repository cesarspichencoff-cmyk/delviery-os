import test from "node:test";
import assert from "node:assert/strict";
import {
  BARRIER_ANSWER_MAP,
  ITEM_MISSING_ROWS,
  WRONG_ITEM_ROWS,
  TallyWebhookError,
  parseTallyOccurrenceWebhook,
  tallySignatureForBody,
  verifyTallySignature,
} from "../src/tally-webhook-core.mjs";

function choice(label, selected, options) {
  const mapped = options.map((text, index) => ({
    id: label.replace(/\W+/g, "_") + "_" + index,
    text,
  }));
  const option = mapped.find((item) => item.text === selected);
  return {
    key: "question_" + label,
    label,
    type: "MULTIPLE_CHOICE",
    value: option ? [option.id] : [],
    options: mapped,
  };
}

const ANSWERS = Object.keys(BARRIER_ANSWER_MAP);

function matrix(label, rows, answers = []) {
  const rowDefs = rows.map((text, index) => ({
    id: "row_" + label.replace(/\W+/g, "_") + "_" + index,
    text,
  }));
  const columns = ANSWERS.map((text, index) => ({
    id: "col_" + index,
    text,
  }));
  const value = {};
  rowDefs.forEach((row, index) => {
    value[row.id] = answers[index] === undefined
      ? []
      : [columns.find((column) => column.text === answers[index]).id];
  });
  return { key: "matrix_" + label, label, type: "MATRIX", value, rows: rowDefs, columns };
}
function baseFields(subtype) {
  return [
    { label: "Operador", type: "INPUT_TEXT", value: "VERTICE TEST" },
    { label: "Data", type: "INPUT_DATE", value: "2026-09-26" },
    choice("Turno", "Noite", ["Manhã", "Noite"]),
    choice("Tipo de Ocorrência", "Problema no Delivery", [
      "Problema no Delivery",
      "Reclamação de cliente",
    ]),
    choice("Subtipo operacional", subtype, [
      "Item faltando",
      "Item errado",
      "Outro",
    ]),
    { label: "Pedido / Mesa / Referência", type: "INPUT_TEXT", value: "REF-1" },
    { label: "O que aconteceu?", type: "TEXTAREA", value: "Teste controlado" },
    { label: "Ação Tomada?", type: "TEXTAREA", value: "Nenhuma ação operacional" },
    choice("Status", "Em Andamento", ["Em Andamento", "Concluído"]),
  ];
}

function payload(subtype, {
  missingAnswers = [],
  wrongAnswers = [],
  formId = "eq4lae",
} = {}) {
  const fields = baseFields(subtype);
  if (subtype === "Item faltando" || missingAnswers.length) {
    fields.splice(5, 0, matrix(
      "Verificações - Item faltando",
      ITEM_MISSING_ROWS,
      missingAnswers,
    ));
  }
  if (subtype === "Item errado" || wrongAnswers.length) {
    fields.splice(5, 0, matrix(
      "Verificações - Item errado",
      WRONG_ITEM_ROWS,
      wrongAnswers,
    ));
  }
  return {
    eventId: "evt-1",
    eventType: "FORM_RESPONSE",
    createdAt: "2026-09-26T09:30:00.000Z",
    data: {
      submissionId: "sub-1",
      respondentId: "resp-1",
      formId,
      formName: "Caixa Pulse | Ocorrência de Turno",
      createdAt: "2026-09-26T09:29:59.000Z",
      fields,
    },
  };
}
test("Item faltando becomes operator-self-report evidence only", () => {
  const parsed = parseTallyOccurrenceWebhook(payload("Item faltando", {
    missingAnswers: ANSWERS,
  }), "eq4lae");

  assert.equal(parsed.truth_class, "OPERATOR_SELF_REPORT");
  assert.equal(parsed.subtype, "Item faltando");
  assert.deepEqual(
    Object.values(parsed.item_missing_barriers),
    Object.values(BARRIER_ANSWER_MAP),
  );
  assert.equal(parsed.wrong_item_barriers, null);
  assert.equal(parsed.operator_name, "VERTICE TEST");
  assert.equal(parsed.business_date, "2026-09-26");
  assert.equal(parsed.shift, "Noite");
  assert.equal(parsed.reference_text, "REF-1");
  assert.equal(parsed.attention_authority, "NONE");
  assert.equal(parsed.external_effect_authorized, false);
});

test("Item errado uses only the wrong-item matrix", () => {
  const parsed = parseTallyOccurrenceWebhook(payload("Item errado", {
    wrongAnswers: ANSWERS,
  }), "eq4lae");
  assert.equal(parsed.item_missing_barriers, null);
  assert.deepEqual(
    Object.values(parsed.wrong_item_barriers),
    Object.values(BARRIER_ANSWER_MAP),
  );
});

test("Outro admits no active matrix", () => {
  const parsed = parseTallyOccurrenceWebhook(payload("Outro"), "eq4lae");
  assert.equal(parsed.item_missing_barriers, null);
  assert.equal(parsed.wrong_item_barriers, null);
});
test("inactive matrix answers fail closed", () => {
  assert.throws(
    () => parseTallyOccurrenceWebhook(payload("Outro", {
      missingAnswers: ANSWERS,
    }), "eq4lae"),
    (error) => error instanceof TallyWebhookError &&
      error.code === "tally_inactive_missing_matrix_answered",
  );
});

test("missing active matrix answer fails closed", () => {
  assert.throws(
    () => parseTallyOccurrenceWebhook(payload("Item faltando", {
      missingAnswers: ["Sim", "Não"],
    }), "eq4lae"),
    /tally_matrix_answer_missing/,
  );
});

test("wrong form identity fails closed", () => {
  assert.throws(
    () => parseTallyOccurrenceWebhook(payload("Outro", {
      formId: "ZjVv1a",
    }), "eq4lae"),
    /tally_form_id_mismatch/,
  );
});

test("non-response event fails closed", () => {
  const value = payload("Outro");
  value.eventType = "FORM_CLOSED";
  assert.throws(
    () => parseTallyOccurrenceWebhook(value, "eq4lae"),
    /tally_event_type_invalid/,
  );
});

test("HMAC signature verification is exact and rejects tampering", async () => {
  const body = JSON.stringify(payload("Outro"));
  const secret = "shadow-signing-secret";
  const signature = await tallySignatureForBody(body, secret);
  assert.equal(await verifyTallySignature(body, signature, secret), true);
  assert.equal(
    await verifyTallySignature(body + " ", signature, secret),
    false,
  );
  assert.equal(await verifyTallySignature(body, "bad", secret), false);
});

test("field-label comparison tolerates the live trailing newline", () => {
  const value = payload("Outro");
  const happened = value.data.fields.find(
    (field) => field.label === "O que aconteceu?",
  );
  happened.label = "O que aconteceu?\n";
  const parsed = parseTallyOccurrenceWebhook(value, "eq4lae");
  assert.equal(parsed.happened_text, "Teste controlado");
});

test("unexpected category drift fails closed", () => {
  const value = payload("Outro");
  const field = value.data.fields.find(
    (item) => item.label === "Tipo de Ocorrência",
  );
  const selected = field.value[0];
  field.options.find((item) => item.id === selected).text = "Novo tipo inesperado";
  assert.throws(
    () => parseTallyOccurrenceWebhook(value, "eq4lae"),
    /tally_category_unknown/,
  );
});

test("unexpected shift drift fails closed when a shift is selected", () => {
  const value = payload("Outro");
  const field = value.data.fields.find((item) => item.label === "Turno");
  const selected = field.value[0];
  field.options.find((item) => item.id === selected).text = "Madrugada";
  assert.throws(
    () => parseTallyOccurrenceWebhook(value, "eq4lae"),
    /tally_shift_unknown/,
  );
});

test("unexpected status drift fails closed", () => {
  const value = payload("Outro");
  const field = value.data.fields.find((item) => item.label === "Status");
  const selected = field.value[0];
  field.options.find((item) => item.id === selected).text = "Novo status";
  assert.throws(
    () => parseTallyOccurrenceWebhook(value, "eq4lae"),
    /tally_status_unknown/,
  );
});

test("live status trailing space normalizes without changing truth semantics", () => {
  const value = payload("Outro");
  const index = value.data.fields.findIndex((item) => item.label === "Status");
  value.data.fields[index] = choice(
    "Status",
    "Necessário Revisão ",
    ["Em Andamento", "Concluído", "Necessário Revisão "],
  );
  const parsed = parseTallyOccurrenceWebhook(value, "eq4lae");
  assert.equal(parsed.status, "Necessário Revisão");
  assert.equal(parsed.truth_class, "OPERATOR_SELF_REPORT");
});
