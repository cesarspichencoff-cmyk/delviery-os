export const TALLY_FORM_RESPONSE_EVENT = "FORM_RESPONSE";

export const BARRIER_ANSWER_MAP = Object.freeze({
  "Sim": "REPORTED_DONE",
  "Não": "REPORTED_NOT_DONE",
  "Não consegui confirmar": "UNABLE_TO_CONFIRM",
  "Não se aplica": "REPORTED_NOT_APPLICABLE",
});

export const ITEM_MISSING_ROWS = Object.freeze([
  "Item identificado antes de seguir",
  "Todos os volumes reunidos",
  "Conferência física após impressão/ajuste",
  "Conferência final antes da saída",
]);

export const WRONG_ITEM_ROWS = Object.freeze([
  "Produto e quantidade conferiam",
  "Observações do cliente conferidas",
  "Correção manual conferida fisicamente quando aplicável",
  "Conferência final antes da saída",
]);

export const OCCURRENCE_TYPES = Object.freeze([
  "Problema no Delivery",
  "Item pausado",
  "Reclamação de cliente",
  "Desconto suspeito",
  "Divergência de caixa",
  "Quebra de equipamento",
  "Problema no salão",
  "Problema com motoboy",
  "Falha no iFood",
  "Falha no app próprio",
]);

export const SHIFT_OPTIONS = Object.freeze(["Manhã", "Noite"]);

export const STATUS_OPTIONS = Object.freeze([
  "Em Andamento",
  "Concluído",
  "Necessário Revisão",
]);

export class TallyWebhookError extends Error {
  constructor(code) {
    super(code);
    this.name = "TallyWebhookError";
    this.code = code;
  }
}
function requiredText(value, code) {
  const text = String(value ?? "").trim();
  if (!text) throw new TallyWebhookError(code);
  return text;
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertIso(value, code) {
  const text = requiredText(value, code);
  if (!Number.isFinite(Date.parse(text))) throw new TallyWebhookError(code);
  return text;
}

function normalizedFieldLabel(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function findField(fields, label) {
  const expected = normalizedFieldLabel(label);
  return fields.find(
    (field) => normalizedFieldLabel(field?.label) === expected,
  ) ?? null;
}

function resolveChoice(field, required = false) {
  if (!field) {
    if (required) throw new TallyWebhookError("tally_choice_missing");
    return null;
  }
  const values = Array.isArray(field.value) ? field.value : [];
  if (values.length === 0) {
    if (required) throw new TallyWebhookError("tally_choice_value_missing");
    return null;
  }
  if (values.length !== 1) throw new TallyWebhookError("tally_choice_not_single");
  const options = Array.isArray(field.options) ? field.options : [];
  const option = options.find((item) => item?.id === values[0]);
  if (!option || typeof option.text !== "string") {
    throw new TallyWebhookError("tally_choice_option_unknown");
  }
  return option.text.trim();
}
function matrixHasAnswers(field) {
  if (!field || !field.value || typeof field.value !== "object") return false;
  return Object.values(field.value).some(
    (value) => Array.isArray(value) && value.length > 0,
  );
}

function parseMatrix(field, expectedRows, required) {
  if (!field) {
    if (required) throw new TallyWebhookError("tally_matrix_missing");
    return null;
  }
  if (field.type !== "MATRIX") throw new TallyWebhookError("tally_matrix_type_invalid");

  const rows = Array.isArray(field.rows) ? field.rows : [];
  const columns = Array.isArray(field.columns) ? field.columns : [];
  const value = field.value && typeof field.value === "object" ? field.value : {};

  const rowByText = new Map(rows.map((row) => [row?.text, row]));
  const columnById = new Map(columns.map((column) => [column?.id, column]));

  const result = {};
  for (const expected of expectedRows) {
    const row = rowByText.get(expected);
    if (!row?.id) throw new TallyWebhookError("tally_matrix_row_missing");
    const selected = Array.isArray(value[row.id]) ? value[row.id] : [];
    if (required && selected.length !== 1) {
      throw new TallyWebhookError("tally_matrix_answer_missing");
    }
    if (!required && selected.length === 0) {
      result[expected] = null;
      continue;
    }
    if (selected.length !== 1) throw new TallyWebhookError("tally_matrix_answer_not_single");
    const column = columnById.get(selected[0]);
    const answer = column?.text;
    if (!Object.hasOwn(BARRIER_ANSWER_MAP, answer)) {
      throw new TallyWebhookError("tally_matrix_answer_unknown");
    }
    result[expected] = BARRIER_ANSWER_MAP[answer];
  }
  return result;
}
function textValue(field) {
  if (!field) return "";
  return optionalText(field.value);
}

function selectedText(fields, label) {
  const field = findField(fields, label);
  return resolveChoice(field, false) ?? "";
}

function selectedTextAllowed(fields, label, allowed, code, required = false) {
  const field = findField(fields, label);
  const value = resolveChoice(field, required);
  if (value == null) return "";
  if (!allowed.includes(value)) throw new TallyWebhookError(code);
  return value;
}

export function parseTallyOccurrenceWebhook(payload, expectedFormId) {
  if (!payload || typeof payload !== "object") {
    throw new TallyWebhookError("tally_payload_invalid");
  }
  if (payload.eventType !== TALLY_FORM_RESPONSE_EVENT) {
    throw new TallyWebhookError("tally_event_type_invalid");
  }

  const eventId = requiredText(payload.eventId, "tally_event_id_missing");
  const data = payload.data;
  if (!data || typeof data !== "object") {
    throw new TallyWebhookError("tally_data_missing");
  }

  const formId = requiredText(data.formId, "tally_form_id_missing");
  if (formId !== expectedFormId) {
    throw new TallyWebhookError("tally_form_id_mismatch");
  }

  const submissionId = requiredText(
    data.submissionId ?? data.responseId,
    "tally_submission_id_missing",
  );
  const sourceCreatedAt = assertIso(
    data.createdAt ?? payload.createdAt,
    "tally_created_at_invalid",
  );
  const fields = Array.isArray(data.fields) ? data.fields : null;
  if (!fields) throw new TallyWebhookError("tally_fields_missing");

  const subtypeField = findField(fields, "Subtipo operacional");
  const subtype = resolveChoice(subtypeField, true);
  if (!["Item faltando", "Item errado", "Outro"].includes(subtype)) {
    throw new TallyWebhookError("tally_subtype_unknown");
  }
  const missingField = findField(fields, "Verificações - Item faltando");
  const wrongField = findField(fields, "Verificações - Item errado");

  const missingActive = subtype === "Item faltando";
  const wrongActive = subtype === "Item errado";

  if (!missingActive && matrixHasAnswers(missingField)) {
    throw new TallyWebhookError("tally_inactive_missing_matrix_answered");
  }
  if (!wrongActive && matrixHasAnswers(wrongField)) {
    throw new TallyWebhookError("tally_inactive_wrong_matrix_answered");
  }

  const itemMissing = missingActive
    ? parseMatrix(missingField, ITEM_MISSING_ROWS, true)
    : null;
  const wrongItem = wrongActive
    ? parseMatrix(wrongField, WRONG_ITEM_ROWS, true)
    : null;

  return {
    source: "tally_occurrence_barrier",
    truth_class: "OPERATOR_SELF_REPORT",
    event_id: eventId,
    submission_id: submissionId,
    respondent_id: optionalText(data.respondentId),
    form_id: formId,
    source_created_at: sourceCreatedAt,
    operator_name: textValue(findField(fields, "Operador")),
    business_date: textValue(findField(fields, "Data")),
    shift: selectedTextAllowed(
      fields,
      "Turno",
      SHIFT_OPTIONS,
      "tally_shift_unknown",
      false,
    ),
    category: selectedTextAllowed(
      fields,
      "Tipo de Ocorrência",
      OCCURRENCE_TYPES,
      "tally_category_unknown",
      true,
    ),
    reference_text: textValue(findField(fields, "Pedido / Mesa / Referência")),
    happened_text: textValue(findField(fields, "O que aconteceu?")),
    action_text: textValue(findField(fields, "Ação Tomada?")),
    status: selectedTextAllowed(
      fields,
      "Status",
      STATUS_OPTIONS,
      "tally_status_unknown",
      true,
    ),
    subtype,
    item_missing_barriers: itemMissing,
    wrong_item_barriers: wrongItem,
    attention_authority: "NONE",
    external_effect_authorized: false,
  };
}
function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export async function tallySignatureForBody(rawBody, secret) {
  const keyText = requiredText(secret, "tally_signing_secret_missing");
  const body = String(rawBody ?? "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return base64(new Uint8Array(signature));
}

export async function verifyTallySignature(rawBody, received, secret) {
  if (!received) return false;
  const expected = await tallySignatureForBody(rawBody, secret);
  return constantTimeEqual(expected, String(received).trim());
}
