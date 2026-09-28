import assert from "node:assert/strict";
import test from "node:test";
import { parseIfoodReviewOcr } from "./ifood-review-ocr-parse.js";

const BASE = `
Detalhes da avaliagao
Pedido feito em
4787 50/08/2026 Ver detalhes
Sobre o pedido
Nota de avaliagao O que pode melhorar?
1 * Aparéncia Temperatura
Daniel disse Publica
em 29/08/2026
Tempura chegou gelado e baguncado na embalagem.
Sua resposta foi enviada
em 03/09/2026
Obrigado pelo feedback. Editar
Avaliagao concluida
em 05/09/2026
`;

test("uses isolated order-header OCR instead of repairing bad full-page date", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: BASE,
    order_header_text: "Pedido feito em\n4787 29/08/2026",
  });
  assert.equal(row.order_id, "4787");
  assert.equal(row.order_date, "2026-08-29");
  assert.equal(row.rating, 1);
  assert.deepEqual(row.improvement_tags, ["Aparência", "Temperatura"]);
  assert.equal(row.review_date, "2026-08-29");
  assert.equal(row.visibility, "Pública");
  assert.equal(row.merchant_response_date, "2026-09-03");
  assert.equal(row.completion_date, "2026-09-05");
  assert.equal(row.source_fact_promotion_allowed, false);
  assert.equal(row.automatic_promotion_allowed, false);
});

test("cropped order header stays null even when other dates exist", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 4,
    full_text: `
Sobre o pedido
4 Quantidade
Patrik disse Publica
em 21/08/2026
Yakisoba excelente.
Sua resposta foi enviada
em 25/08/2026
Resposta.
Avaliagao concluida
em 30/08/2026
`,
    order_header_text: "",
  });
  assert.equal(row.order_id, null);
  assert.equal(row.order_date, null);
  assert.equal(row.review_date, "2026-08-21");
  assert.equal(row.merchant_response_date, "2026-08-25");
  assert.equal(row.completion_date, "2026-08-30");
});

test("invalid isolated order date remains null and is never repaired from review date", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: BASE,
    order_header_text: "4787 50/08/2026",
  });
  assert.equal(row.order_id, "4787");
  assert.equal(row.order_date, null);
  assert.ok(row.quality_flags.includes("INVALID_ORDER_DATE_OCR"));
});

test("tag matching is scoped before the customer line", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: `
Sobre o pedido
1 Aparéncia Temperatura
Daniel disse Publica
em 29/08/2026
A embalagem chegou ruim.
`,
    order_header_text: "4787 29/08/2026",
  });
  assert.deepEqual(row.improvement_tags, ["Aparência", "Temperatura"]);
  assert.equal(row.improvement_tags.includes("Embalagem"), false);
});

test("response text and edit control are separated", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: BASE,
    order_header_text: "4787 29/08/2026",
  });
  assert.equal(row.merchant_response_text, "Obrigado pelo feedback.");
});

test("unmapped tags do not get guessed into known taxonomy", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: `
Sobre o pedido
5 CategoriaNova
Cliente disse Privada
em 01/09/2026
Tudo certo.
`,
    order_header_text: "1234 01/09/2026",
  });
  assert.equal(row.improvement_tags, null);
  assert.ok(row.quality_flags.includes("TAGS_NOT_MAPPED"));
  assert.equal(row.visibility, "Privada");
});

test("parser never promotes OCR to cause, blame, source fact or external effect", () => {
  const row = parseIfoodReviewOcr({
    attachment_index: 0,
    full_text: BASE,
    order_header_text: "4787 29/08/2026",
  });
  assert.equal(row.source_fact_promotion_allowed, false);
  assert.equal(row.cause_proven, false);
  assert.equal(row.blame_allowed, false);
  assert.equal(row.external_effect_authorized, false);
});
