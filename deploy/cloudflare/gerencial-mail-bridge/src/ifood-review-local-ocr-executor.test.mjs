import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  IfoodLocalOcrExecutor,
  IfoodLocalOcrExecutorError,
  IFOOD_OCR_SOURCE_CLASSES,
} from "./ifood-review-local-ocr-executor.js";

const bytes = new TextEncoder().encode("synthetic-image-bytes");
const hash = createHash("sha256").update(bytes).digest("hex");

function source(sourceClass = IFOOD_OCR_SOURCE_CLASSES.AUTHORIZED_TEAM_MAIL) {
  return {
    async load(ref) {
      assert.equal(ref.mailbox_key, "123456:801");
      assert.equal(ref.attachment_index, 0);
      return {
        source_class: sourceClass,
        mime_type: "image/png",
        bytes,
      };
    },
  };
}

function engine() {
  const calls = [];
  return {
    id: "fake-layout-ocr@1",
    calls,
    async recognize({ region }) {
      calls.push(region);
      if (region === "ORDER_HEADER") {
        return "Pedido feito em\n4787 29/08/2026";
      }
      return `
Detalhes da avaliagao
Pedido feito em
4787 50/08/2026
Sobre o pedido
1 Aparéncia Temperatura
Daniel disse Publica
em 29/08/2026
Texto da avaliacao.
Sua resposta foi enviada
em 03/09/2026
Resposta da loja. Editar
`;
    },
  };
}

test("authorized source runs exactly full-page plus order-header OCR", async () => {
  const ocr = engine();
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: source(),
    ocrEngine: ocr,
  });
  const result = await executor.extract({
    mailbox_key: "123456:801",
    attachment_index: 0,
    expected_sha256: hash,
  });

  assert.deepEqual(ocr.calls, ["FULL_PAGE", "ORDER_HEADER"]);
  assert.equal(result.candidate.order_id, "4787");
  assert.equal(result.candidate.order_date, "2026-08-29");
  assert.equal(result.candidate.rating, 1);
  assert.equal(result.candidate.verification_status, "UNVERIFIED");
  assert.equal(result.candidate.source_fact_promotion_allowed, false);
  assert.equal(result.persistence_authorized, false);
  assert.equal(result.notification_authorized, false);
  assert.equal(result.external_effect_authorized, false);
  assert.equal(result.raw_image_returned, false);
});

test("default executor rejects self-sent reference source", async () => {
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: source(
      IFOOD_OCR_SOURCE_CLASSES.CESAR_SELF_SENT_REFERENCE_BATCH,
    ),
    ocrEngine: engine(),
  });
  await assert.rejects(
    () => executor.extract({
      mailbox_key: "123456:801",
      attachment_index: 0,
      expected_sha256: hash,
    }),
    (error) =>
      error instanceof IfoodLocalOcrExecutorError &&
      error.code === "IFOOD_OCR_SOURCE_CLASS_MISMATCH",
  );
});

test("reference benchmark source requires explicit executor binding", async () => {
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: source(
      IFOOD_OCR_SOURCE_CLASSES.CESAR_SELF_SENT_REFERENCE_BATCH,
    ),
    ocrEngine: engine(),
    expectedSourceClass:
      IFOOD_OCR_SOURCE_CLASSES.CESAR_SELF_SENT_REFERENCE_BATCH,
  });
  const result = await executor.extract({
    mailbox_key: "123456:801",
    attachment_index: 0,
    expected_sha256: hash,
  });
  assert.equal(
    result.source_ref.source_class,
    IFOOD_OCR_SOURCE_CLASSES.CESAR_SELF_SENT_REFERENCE_BATCH,
  );
});

test("source hash mismatch fails before OCR", async () => {
  const ocr = engine();
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: source(),
    ocrEngine: ocr,
  });
  await assert.rejects(
    () => executor.extract({
      mailbox_key: "123456:801",
      attachment_index: 0,
      expected_sha256: "0".repeat(64),
    }),
    /IFOOD_OCR_SOURCE_HASH_MISMATCH/,
  );
  assert.deepEqual(ocr.calls, []);
});

test("non-image attachment fails before OCR", async () => {
  const ocr = engine();
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: {
      async load() {
        return {
          source_class: IFOOD_OCR_SOURCE_CLASSES.AUTHORIZED_TEAM_MAIL,
          mime_type: "text/plain",
          bytes,
        };
      },
    },
    ocrEngine: ocr,
  });
  await assert.rejects(
    () => executor.extract({
      mailbox_key: "123456:801",
      attachment_index: 0,
      expected_sha256: hash,
    }),
    /IFOOD_OCR_MIME_TYPE_FORBIDDEN/,
  );
  assert.deepEqual(ocr.calls, []);
});

test("source ref cannot inject extra fields", async () => {
  const executor = new IfoodLocalOcrExecutor({
    attachmentSource: source(),
    ocrEngine: engine(),
  });
  await assert.rejects(
    () => executor.extract({
      mailbox_key: "123456:801",
      attachment_index: 0,
      expected_sha256: hash,
      authorize_write: true,
    }),
    /IFOOD_OCR_SOURCE_REF_SHAPE_INVALID/,
  );
});
