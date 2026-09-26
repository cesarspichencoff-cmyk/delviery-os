import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildIfoodReviewRecord,
  matchesIfoodReviewMail,
  matchesIfoodSubject,
} from "./ifood-intake.js";

test("matches iFood in every capitalization style used by the team", () => {
  for (const subject of [
    "Avaliações iFood 01/09",
    "Avaliações IFOOD 01/09",
    "Avaliações ifood 01/09",
    "Avaliações IfOoD 01/09",
    "IFOOD",
    "relatorio-ifood-semanal",
  ]) {
    assert.equal(matchesIfoodSubject(subject), true, subject);
  }
  assert.equal(matchesIfoodSubject("Avaliações delivery 01/09"), false);
  assert.equal(matchesIfoodSubject(""), false);
});

test("requires Atendimento sender, iFood subject and Cesar recipient", () => {
  assert.equal(
    matchesIfoodReviewMail({
      subject: "Avaliações IFOOD 01/09",
      from: "Atendimento <atendimento@tatasushi.com.br>",
      to: "César <cesar@tatasushi.com.br>",
    }),
    true,
  );
  assert.equal(
    matchesIfoodReviewMail({
      subject: "Avaliações ifood 01/09",
      from: "atendimento@tatasushi.com.br",
      to: "outra-pessoa@tatasushi.com.br",
    }),
    false,
  );
  assert.equal(
    matchesIfoodReviewMail({
      subject: "Avaliações delivery 01/09",
      from: "atendimento@tatasushi.com.br",
      to: "cesar@tatasushi.com.br",
    }),
    false,
  );
  assert.equal(
    matchesIfoodReviewMail({
      subject: "Avaliações ifood 01/09",
      from: "outra-conta@tatasushi.com.br",
      to: "cesar@tatasushi.com.br",
    }),
    false,
  );
});

test("plain email body becomes TEXT_READY", () => {
  const row = buildIfoodReviewRecord({
    uid: 801,
    uidValidity: "123456",
    subject: "Avaliações iFood 01/09",
    sentAt: "2026-09-23T12:00:00Z",
    from: "atendimento@tatasushi.com.br",
    to: "cesar@tatasushi.com.br",
    messageId: "<801@test>",
    rawSize: 1000,
    readOnlyVerified: true,
    parsed: { text: "Cliente reclamou do atraso.", attachments: [] },
  });
  assert.equal(row.mailbox_key, "123456:801");
  assert.equal(row.extraction_status, "TEXT_READY");
  assert.equal(row.body_text, "Cliente reclamou do atraso.");
  assert.deepEqual(row.quality_flags, []);
});

test("image-only email is preserved as ATTACHMENT_ONLY without pretending OCR", () => {
  const row = buildIfoodReviewRecord({
    uid: 802,
    uidValidity: "123456",
    subject: "IFOOD avaliações",
    sentAt: "2026-09-23T12:00:00Z",
    from: "atendimento@tatasushi.com.br",
    to: "cesar@tatasushi.com.br",
    readOnlyVerified: true,
    parsed: {
      text: "",
      attachments: [{
        filename: "avaliacoes.png",
        mimeType: "image/png",
        content: new Uint8Array([1, 2, 3, 4]),
      }],
    },
  });
  assert.equal(row.extraction_status, "ATTACHMENT_ONLY");
  assert.equal(row.attachment_count, 1);
  assert.equal(row.attachment_payloads.length, 1);
  assert.equal(row.attachment_payloads[0].content.byteLength, 4);
  assert.ok(row.quality_flags.includes("HAS_UNEXTRACTED_ATTACHMENTS"));
  assert.ok(row.quality_flags.includes("NO_TEXT_CONTENT"));
});

test("text attachment is extracted into searchable body", () => {
  const row = buildIfoodReviewRecord({
    uid: 803,
    uidValidity: "123456",
    subject: "ifood lote semanal",
    sentAt: "2026-09-23T12:00:00Z",
    from: "atendimento@tatasushi.com.br",
    to: "cesar@tatasushi.com.br",
    readOnlyVerified: true,
    parsed: {
      text: "Segue lote.",
      attachments: [{
        filename: "avaliacoes.csv",
        mimeType: "text/csv",
        content: new TextEncoder().encode("nota,comentario\n1,atrasou"),
      }],
    },
  });
  assert.equal(row.extraction_status, "TEXT_READY");
  assert.match(row.body_text, /nota,comentario/);
  assert.equal(row.attachment_manifest[0].textExtracted, true);
});

test("non-iFood subject is rejected even if body mentions iFood", () => {
  assert.throws(() => buildIfoodReviewRecord({
    uid: 804,
    uidValidity: "123456",
    subject: "Relatório semanal",
    sentAt: "2026-09-23T12:00:00Z",
    from: "atendimento@tatasushi.com.br",
    to: "cesar@tatasushi.com.br",
    readOnlyVerified: true,
    parsed: { text: "iFood", attachments: [] },
  }), /IFOOD_SUBJECT_REQUIRED/);
});

test("invalid UIDVALIDITY is rejected", () => {
  assert.throws(() => buildIfoodReviewRecord({
    uid: 805,
    uidValidity: "",
    subject: "Avaliações iFood",
    sentAt: "2026-09-23T12:00:00Z",
    readOnlyVerified: true,
    parsed: { text: "ok", attachments: [] },
  }), /INVALID_UIDVALIDITY/);
});

test("production ingestion is pinned to Atendimento Sent -> Cesar and UIDVALIDITY", () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function runIfoodReviewIngestion");
  const end = source.indexOf("\nexport default", start);
  const intake = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(intake, /findSentFolder\(list\.raw\)/);
  assert.match(intake, /EXAMINE \$\{quote\(sent\)\}/);
  assert.match(intake, /TO "cesar@tatasushi\.com\.br"/);
  assert.match(intake, /matchesIfoodReviewMail\(\{/);
  assert.match(intake, /uidValidity/);
  assert.doesNotMatch(intake, /EXAMINE "INBOX"/);
});