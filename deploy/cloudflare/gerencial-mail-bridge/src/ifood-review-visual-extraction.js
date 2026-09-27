export const IFOOD_REVIEW_VISUAL_EXTRACTION_VERSION =
  "ifood-review-visual-extraction@0.1.0";

export class IfoodReviewVisualExtractionError extends Error {
  constructor(code) {
    super(code);
    this.name = "IfoodReviewVisualExtractionError";
    this.code = code;
  }
}

const VALUE_FIELDS = Object.freeze([
  "order_id",
  "order_date",
  "rating",
  "improvement_tags",
  "customer_name",
  "review_date",
  "visibility",
  "review_text",
  "merchant_response_date",
  "merchant_response_text",
  "completion_date",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "attachment_index",
  "extraction_method",
  "verification_status",
  "visible_fields",
  ...VALUE_FIELDS,
]);

const EXTRACTION_METHODS = new Set([
  "MODEL_VISION",
  "OCR",
  "HUMAN_TRANSCRIPTION",
]);

const VERIFICATION_STATUSES = new Set([
  "UNVERIFIED",
  "VISUAL_REFERENCE",
  "HUMAN_VERIFIED",
]);

const VISIBILITIES = new Set(["Pública", "Privada"]);

function assertExactKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_EXTRACTION_OBJECT_REQUIRED");
  }
  const actual = Object.keys(value).sort();
  const wanted = [...TOP_LEVEL_KEYS].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_EXTRACTION_SHAPE_INVALID");
  }
}

function assertDateOrNull(value, code) {
  if (value === null) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new IfoodReviewVisualExtractionError(code);
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new IfoodReviewVisualExtractionError(code);
  }
}

function assertStringOrNull(value, code) {
  if (value === null) return;
  if (typeof value !== "string" || !value.length) {
    throw new IfoodReviewVisualExtractionError(code);
  }
}

function assertVisibilityOrNull(value) {
  if (value === null) return;
  if (!VISIBILITIES.has(value)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_VISIBILITY_INVALID");
  }
}

function assertRatingOrNull(value) {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_RATING_INVALID");
  }
}

function assertTagsOrNull(value) {
  if (value === null) return;
  if (
    !Array.isArray(value) ||
    value.some((tag) => typeof tag !== "string" || !tag.length)
  ) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_TAGS_INVALID");
  }
}

export function validateIfoodReviewVisualExtraction(input) {
  assertExactKeys(input);

  if (!Number.isInteger(input.attachment_index) || input.attachment_index < 0) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_ATTACHMENT_INDEX_INVALID");
  }
  if (!EXTRACTION_METHODS.has(input.extraction_method)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_METHOD_INVALID");
  }
  if (!VERIFICATION_STATUSES.has(input.verification_status)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_VERIFICATION_INVALID");
  }
  if (!Array.isArray(input.visible_fields)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_VISIBLE_FIELDS_INVALID");
  }

  const visible = new Set(input.visible_fields);
  if (visible.size !== input.visible_fields.length) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_VISIBLE_FIELDS_DUPLICATED");
  }
  for (const field of visible) {
    if (!VALUE_FIELDS.includes(field)) {
      throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_VISIBLE_FIELD_UNKNOWN");
    }
  }

  for (const field of VALUE_FIELDS) {
    if (!visible.has(field) && input[field] !== null) {
      throw new IfoodReviewVisualExtractionError(
        "IFOOD_VISUAL_INVISIBLE_FIELD_MUST_BE_NULL",
      );
    }
    if (visible.has(field) && input[field] === null) {
      throw new IfoodReviewVisualExtractionError(
        "IFOOD_VISUAL_VISIBLE_FIELD_MUST_HAVE_VALUE",
      );
    }
  }

  assertStringOrNull(input.order_id, "IFOOD_VISUAL_ORDER_ID_INVALID");
  if (input.order_id !== null && !/^\d{1,30}$/.test(input.order_id)) {
    throw new IfoodReviewVisualExtractionError("IFOOD_VISUAL_ORDER_ID_INVALID");
  }
  assertDateOrNull(input.order_date, "IFOOD_VISUAL_ORDER_DATE_INVALID");
  assertRatingOrNull(input.rating);
  assertTagsOrNull(input.improvement_tags);
  assertStringOrNull(input.customer_name, "IFOOD_VISUAL_CUSTOMER_NAME_INVALID");
  assertDateOrNull(input.review_date, "IFOOD_VISUAL_REVIEW_DATE_INVALID");
  assertVisibilityOrNull(input.visibility);
  assertStringOrNull(input.review_text, "IFOOD_VISUAL_REVIEW_TEXT_INVALID");
  assertDateOrNull(
    input.merchant_response_date,
    "IFOOD_VISUAL_RESPONSE_DATE_INVALID",
  );
  assertStringOrNull(
    input.merchant_response_text,
    "IFOOD_VISUAL_RESPONSE_TEXT_INVALID",
  );
  assertDateOrNull(
    input.completion_date,
    "IFOOD_VISUAL_COMPLETION_DATE_INVALID",
  );

  return {
    schema_version: IFOOD_REVIEW_VISUAL_EXTRACTION_VERSION,
    ...input,
    inferred_fields: [],
    source_fact_promotion_allowed: false,
    cause_proven: false,
    blame_allowed: false,
    external_effect_authorized: false,
  };
}
