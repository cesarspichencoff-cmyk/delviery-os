import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthorizedIfoodReviewAttachmentD1 } from "./ifood-storage.js";

function fakeDb(row) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ type: "prepare", sql });
      return {
        bind(...args) {
          calls.push({ type: "bind", args });
          return {
            async first() {
              calls.push({ type: "first" });
              return row;
            },
          };
        },
      };
    },
  };
}

const bytes = new Uint8Array([1, 2, 3, 4]);

test("loads only one exact authorized read-only review attachment", async () => {
  const db = fakeDb({
    mailbox_key: "123456:801",
    attachment_index: 2,
    mime_type: "image/png",
    size_bytes: 4,
    content_blob: bytes.buffer,
    sender: "Atendimento <atendimento@tatasushi.com.br>",
    recipient: "César <cesar@tatasushi.com.br>",
    subject: "Avaliações IFOOD 01/09",
    readonly_verified: 1,
  });

  const loaded = await loadAuthorizedIfoodReviewAttachmentD1(db, {
    mailbox_key: "123456:801",
    attachment_index: 2,
  });

  assert.equal(loaded.source_class, "AUTHORIZED_TEAM_MAIL");
  assert.equal(loaded.mime_type, "image/png");
  assert.deepEqual([...loaded.bytes], [1, 2, 3, 4]);
  const sql = db.calls.find((call) => call.type === "prepare").sql;
  assert.match(sql, /^\s*SELECT\b/i);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.deepEqual(
    db.calls.find((call) => call.type === "bind").args,
    ["123456:801", 2],
  );
});

test("missing attachment returns null", async () => {
  const db = fakeDb(null);
  assert.equal(
    await loadAuthorizedIfoodReviewAttachmentD1(db, {
      mailbox_key: "123456:801",
      attachment_index: 0,
    }),
    null,
  );
});

test("rejects non-authorized sender/recipient/subject route", async () => {
  for (const row of [
    {
      sender: "cesar@gmail.com",
      recipient: "cesar@tatasushi.com.br",
      subject: "Avaliações iFood",
    },
    {
      sender: "atendimento@tatasushi.com.br",
      recipient: "outra@tatasushi.com.br",
      subject: "Avaliações iFood",
    },
    {
      sender: "atendimento@tatasushi.com.br",
      recipient: "cesar@tatasushi.com.br",
      subject: "Avaliações delivery",
    },
  ]) {
    const db = fakeDb({
      mailbox_key: "123456:801",
      attachment_index: 0,
      mime_type: "image/png",
      size_bytes: 4,
      content_blob: bytes,
      readonly_verified: 1,
      ...row,
    });
    await assert.rejects(
      () => loadAuthorizedIfoodReviewAttachmentD1(db, {
        mailbox_key: "123456:801",
        attachment_index: 0,
      }),
      /IFOOD_ATTACHMENT_SOURCE_NOT_AUTHORIZED/,
    );
  }
});

test("rejects unverified source and size mismatch", async () => {
  const base = {
    mailbox_key: "123456:801",
    attachment_index: 0,
    mime_type: "image/png",
    size_bytes: 4,
    content_blob: bytes,
    sender: "atendimento@tatasushi.com.br",
    recipient: "cesar@tatasushi.com.br",
    subject: "Avaliações iFood",
  };

  await assert.rejects(
    () => loadAuthorizedIfoodReviewAttachmentD1(
      fakeDb({ ...base, readonly_verified: 0 }),
      { mailbox_key: "123456:801", attachment_index: 0 },
    ),
    /IFOOD_ATTACHMENT_SOURCE_NOT_AUTHORIZED/,
  );

  await assert.rejects(
    () => loadAuthorizedIfoodReviewAttachmentD1(
      fakeDb({ ...base, readonly_verified: 1, size_bytes: 99 }),
      { mailbox_key: "123456:801", attachment_index: 0 },
    ),
    /IFOOD_ATTACHMENT_SIZE_MISMATCH/,
  );
});

test("rejects malformed lookup before querying D1", async () => {
  const db = fakeDb(null);
  await assert.rejects(
    () => loadAuthorizedIfoodReviewAttachmentD1(db, {
      mailbox_key: "bad",
      attachment_index: 0,
    }),
    /INVALID_IFOOD_ATTACHMENT_MAILBOX_KEY/,
  );
  assert.equal(db.calls.length, 0);
});
