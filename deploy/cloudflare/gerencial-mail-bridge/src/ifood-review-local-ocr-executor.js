import { createHash } from "node:crypto";
import { parseIfoodReviewOcr } from "./ifood-review-ocr-parse.js";

export const IFOOD_LOCAL_OCR_EXECUTOR_VERSION =
  "ifood-local-ocr-executor@0.1.0";

export const IFOOD_OCR_SOURCE_CLASSES = Object.freeze({
  AUTHORIZED_TEAM_MAIL: "AUTHORIZED_TEAM_MAIL",
  CESAR_SELF_SENT_REFERENCE_BATCH: "CESAR_SELF_SENT_REFERENCE_BATCH",
});

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SAFE_MAILBOX_KEY = /^[1-9]\d*:[1-9]\d*$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;

export class IfoodLocalOcrExecutorError extends Error {
  constructor(code) {
    super(code);
    this.name = "IfoodLocalOcrExecutorError";
    this.code = code;
  }
}

function assertSourceRef(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_SOURCE_REF_REQUIRED");
  }
  const keys = Object.keys(ref).sort();
  const expected = ["attachment_index", "expected_sha256", "mailbox_key"].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_SOURCE_REF_SHAPE_INVALID");
  }
  if (!SAFE_MAILBOX_KEY.test(String(ref.mailbox_key ?? ""))) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_MAILBOX_KEY_INVALID");
  }
  if (!Number.isInteger(ref.attachment_index) || ref.attachment_index < 0) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_ATTACHMENT_INDEX_INVALID");
  }
  if (!SAFE_SHA256.test(String(ref.expected_sha256 ?? ""))) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_EXPECTED_SHA256_INVALID");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertAttachment(attachment, expectedSourceClass, ref) {
  if (!attachment || typeof attachment !== "object") {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_ATTACHMENT_REQUIRED");
  }
  if (attachment.source_class !== expectedSourceClass) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_SOURCE_CLASS_MISMATCH");
  }
  if (!ALLOWED_MIME_TYPES.has(String(attachment.mime_type ?? ""))) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_MIME_TYPE_FORBIDDEN");
  }
  if (!(attachment.bytes instanceof Uint8Array)) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_BYTES_REQUIRED");
  }
  if (
    attachment.bytes.byteLength === 0 ||
    attachment.bytes.byteLength > MAX_IMAGE_BYTES
  ) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_IMAGE_SIZE_INVALID");
  }
  const actualHash = sha256(attachment.bytes);
  if (actualHash !== ref.expected_sha256) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_SOURCE_HASH_MISMATCH");
  }
}

function assertOcrText(value, code) {
  if (typeof value !== "string") {
    throw new IfoodLocalOcrExecutorError(code);
  }
  if (value.length > 250000) {
    throw new IfoodLocalOcrExecutorError("IFOOD_OCR_TEXT_TOO_LARGE");
  }
}

export class IfoodLocalOcrExecutor {
  constructor({
    attachmentSource,
    ocrEngine,
    expectedSourceClass = IFOOD_OCR_SOURCE_CLASSES.AUTHORIZED_TEAM_MAIL,
  }) {
    if (!attachmentSource || typeof attachmentSource.load !== "function") {
      throw new IfoodLocalOcrExecutorError("IFOOD_OCR_ATTACHMENT_SOURCE_INVALID");
    }
    if (!ocrEngine || typeof ocrEngine.recognize !== "function") {
      throw new IfoodLocalOcrExecutorError("IFOOD_OCR_ENGINE_INVALID");
    }
    if (!Object.values(IFOOD_OCR_SOURCE_CLASSES).includes(expectedSourceClass)) {
      throw new IfoodLocalOcrExecutorError("IFOOD_OCR_EXPECTED_SOURCE_CLASS_INVALID");
    }
    this.attachmentSource = attachmentSource;
    this.ocrEngine = ocrEngine;
    this.expectedSourceClass = expectedSourceClass;
  }

  async extract(ref) {
    assertSourceRef(ref);
    const attachment = await this.attachmentSource.load({
      mailbox_key: ref.mailbox_key,
      attachment_index: ref.attachment_index,
    });
    assertAttachment(attachment, this.expectedSourceClass, ref);

    const fullText = await this.ocrEngine.recognize({
      bytes: attachment.bytes,
      region: "FULL_PAGE",
    });
    assertOcrText(fullText, "IFOOD_OCR_FULL_PAGE_TEXT_INVALID");

    const orderHeaderText = await this.ocrEngine.recognize({
      bytes: attachment.bytes,
      region: "ORDER_HEADER",
    });
    assertOcrText(orderHeaderText, "IFOOD_OCR_ORDER_HEADER_TEXT_INVALID");

    const candidate = parseIfoodReviewOcr({
      attachment_index: ref.attachment_index,
      full_text: fullText,
      order_header_text: orderHeaderText,
    });

    return {
      executor_version: IFOOD_LOCAL_OCR_EXECUTOR_VERSION,
      engine_id: String(this.ocrEngine.id ?? "UNKNOWN_ENGINE"),
      source_ref: {
        mailbox_key: ref.mailbox_key,
        attachment_index: ref.attachment_index,
        sha256: ref.expected_sha256,
        source_class: this.expectedSourceClass,
      },
      candidate,
      execution_mode: "LOCAL_READ_ONLY",
      persistence_authorized: false,
      notification_authorized: false,
      external_effect_authorized: false,
      raw_image_returned: false,
    };
  }
}
