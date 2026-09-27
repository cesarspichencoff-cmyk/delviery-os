import assert from "node:assert/strict";
import test from "node:test";
import {
  IfoodReviewVisualExtractionError,
  validateIfoodReviewVisualExtraction,
} from "./ifood-review-visual-extraction.js";

function base(overrides = {}) {
  return {
    attachment_index: 0,
    extraction_method: "MODEL_VISION",
    verification_status: "VISUAL_REFERENCE",
    visible_fields: [
      "order_id",
      "order_date",
      "rating",
      "improvement_tags",
      "customer_name",
      "review_date",
      "visibility",
      "review_text",
    ],
    order_id: "4787",
    order_date: "2026-08-29",
    rating: 1,
    improvement_tags: ["Aparência", "Temperatura"],
    customer_name: "Daniel",
    review_date: "2026-08-29",
    visibility: "Pública",
    review_text: "Texto visível no screenshot.",
    merchant_response_date: null,
    merchant_response_text: null,
    completion_date: null,
    ...overrides,
  };
}

test("accepts visibly supported extraction without promoting it to source fact", () => {
  const row = validateIfoodReviewVisualExtraction(base());
  assert.equal(row.order_id, "4787");
  assert.deepEqual(row.inferred_fields, []);
  assert.equal(row.source_fact_promotion_allowed, false);
  assert.equal(row.cause_proven, false);
  assert.equal(row.blame_allowed, false);
  assert.equal(row.external_effect_authorized, false);
});

test("cropped order/date remain null and are accepted when not visible", () => {
  const row = validateIfoodReviewVisualExtraction(base({
    attachment_index: 4,
    visible_fields: [
      "rating",
      "improvement_tags",
      "customer_name",
      "review_date",
      "visibility",
      "review_text",
      "merchant_response_date",
      "merchant_response_text",
      "completion_date",
    ],
    order_id: null,
    order_date: null,
    rating: 4,
    improvement_tags: ["Quantidade"],
    customer_name: "Patrik",
    review_date: "2026-08-21",
    visibility: "Pública",
    review_text: "Yakisoba excelente.",
    merchant_response_date: "2026-08-25",
    merchant_response_text: "Resposta visível.",
    completion_date: "2026-08-30",
  }));
  assert.equal(row.order_id, null);
  assert.equal(row.order_date, null);
});

test("fails closed when an invisible cropped field is guessed", () => {
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({
      visible_fields: [
        "rating",
        "improvement_tags",
        "customer_name",
        "review_date",
        "visibility",
        "review_text",
      ],
      order_id: "9999",
      order_date: null,
    })),
    (error) =>
      error instanceof IfoodReviewVisualExtractionError &&
      error.code === "IFOOD_VISUAL_INVISIBLE_FIELD_MUST_BE_NULL",
  );
});

test("fails closed when a declared visible field has no value", () => {
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({ review_text: null })),
    /IFOOD_VISUAL_VISIBLE_FIELD_MUST_HAVE_VALUE/,
  );
});

test("rejects invalid stars, dates and visibility", () => {
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({ rating: 6 })),
    /IFOOD_VISUAL_RATING_INVALID/,
  );
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({ order_date: "29\/08\/2026" })),
    /IFOOD_VISUAL_ORDER_DATE_INVALID/,
  );
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({ visibility: "Aberta" })),
    /IFOOD_VISUAL_VISIBILITY_INVALID/,
  );
});

test("rejects unknown or duplicate visible-field declarations", () => {
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({
      visible_fields: [...base().visible_fields, "culpado"],
    })),
    /IFOOD_VISUAL_VISIBLE_FIELD_UNKNOWN/,
  );
  assert.throws(
    () => validateIfoodReviewVisualExtraction(base({
      visible_fields: [...base().visible_fields, "order_id"],
    })),
    /IFOOD_VISUAL_VISIBLE_FIELDS_DUPLICATED/,
  );
});

test("rejects extra fields such as causal or blame labels", () => {
  assert.throws(
    () => validateIfoodReviewVisualExtraction({
      ...base(),
      culpado: "delivery",
    }),
    /IFOOD_VISUAL_EXTRACTION_SHAPE_INVALID/,
  );
});
