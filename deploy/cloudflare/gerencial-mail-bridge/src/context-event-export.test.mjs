import assert from "node:assert/strict";
import test from "node:test";
import { mailRowToContextEvent } from "./context-event-export.js";

function row(overrides = {}) {
  return {
    uid_validity: "1641920722",
    mailbox_uid: 711,
    message_id: "<711@test>",
    message_sent_at: "2026-09-24T10:00:00Z",
    sender: "TATÁ Atendimento <atendimento@tatasushi.com.br>",
    recipient: "César <cesar@tatasushi.com.br>",
    subject: "Avaliações IFOOD 24/09",
    body_text: "",
    attachment_count: 2,
    attachment_manifest_json: JSON.stringify([
      { filename: "image.png", mimeType: "image/png", bytes: 100 },
      { filename: "image.png", mimeType: "image/png", bytes: 120 },
    ]),
    extraction_status: "ATTACHMENT_ONLY",
    readonly_verified: 1,
    quality_flags_json: JSON.stringify(["NO_TEXT_CONTENT"]),
    created_at: "2026-09-24T10:01:00Z",
    updated_at: "2026-09-24T10:01:00Z",
    ...overrides,
  };
}

test("maps Atendimento Sent mail into deterministic Context Event", () => {
  const a = mailRowToContextEvent(row());
  const b = mailRowToContextEvent(row());
  assert.equal(a.event_id, "mail:atendimento:sent:1641920722:711");
  assert.deepEqual(a, b);
  assert.equal(a.domain, "WORK_TATA");
});

test("transport fact never becomes root-cause proof", () => {
  const event = mailRowToContextEvent(row());
  assert.equal(event.epistemic.event_fact, "EMAIL_SENT_FROM_OPERATIONAL_MAILBOX");
  assert.equal(event.epistemic.content_claim_status, "UNVERIFIED_CLAIMS");
  assert.equal(event.epistemic.causal_status, "UNPROVEN");
  assert.equal(event.permissions.blame_assignment_allowed, false);
});

test("attachment-only mail stays valid but content remains unresolved", () => {
  const event = mailRowToContextEvent(row());
  assert.equal(event.payload.extraction_status, "ATTACHMENT_ONLY");
  assert.ok(event.payload.missing_fields.includes("REVIEW_CONTENT_UNEXTRACTED"));
  assert.equal(event.payload.attachments.length, 2);
});

test("read-only verification is carried as source proof", () => {
  const event = mailRowToContextEvent(row());
  assert.equal(event.source.read_only_verified, true);
  assert.ok(!event.payload.missing_fields.includes("READ_ONLY_PROOF"));
});

test("missing read-only proof remains explicit", () => {
  const event = mailRowToContextEvent(row({ readonly_verified: 0 }));
  assert.equal(event.source.read_only_verified, false);
  assert.ok(event.payload.missing_fields.includes("READ_ONLY_PROOF"));
});

test("rejects mail outside the authorized Atendimento -> Cesar route", () => {
  assert.throws(
    () => mailRowToContextEvent(row({ sender: "outra@tatasushi.com.br" })),
    /UNTRUSTED_MAIL_SENDER/,
  );
  assert.throws(
    () => mailRowToContextEvent(row({ recipient: "financeiro@tatasushi.com.br" })),
    /UNEXPECTED_MAIL_RECIPIENT/,
  );
});

test("rejects non-iFood subject and malformed mailbox identity", () => {
  assert.throws(
    () => mailRowToContextEvent(row({ subject: "Fechamento 24/09" })),
    /IFOOD_SUBJECT_REQUIRED/,
  );
  assert.throws(
    () => mailRowToContextEvent(row({ uid_validity: "" })),
    /INVALID_UIDVALIDITY/,
  );
  assert.throws(
    () => mailRowToContextEvent(row({ mailbox_uid: 0 })),
    /INVALID_MAILBOX_UID/,
  );
});

test("source adapter never grants external action authority", () => {
  const event = mailRowToContextEvent(row({ body_text: "Foi culpa do motoboy." }));
  assert.equal(event.permissions.external_action_allowed, false);
  assert.equal(event.permissions.customer_reply_allowed, false);
  assert.equal(event.epistemic.causal_status, "UNPROVEN");
});
