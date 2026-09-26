import test from "node:test";
import assert from "node:assert/strict";
import {
  findKnownCaixaPulseUidsD1,
  upsertCaixaPulseMessageD1,
} from "./caixa-pulse-storage.js";

function fakeStatement(sql, calls) {
  return {
    sql,
    values: [],
    bind(...values) {
      this.values = values;
      return this;
    },
    async all() {
      calls.push({ kind: "all", sql, values: this.values });
      return { results: [{ mailbox_uid: 10 }, { mailbox_uid: 12 }] };
    },
  };
}

test("known lookup is bounded by UIDVALIDITY and candidate UID set", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return fakeStatement(sql, calls);
    },
  };

  const result = await findKnownCaixaPulseUidsD1(
    db,
    "1641920722",
    [10, 11, 12],
  );

  assert.deepEqual(result, ["10", "12"]);
  assert.match(calls[0].sql, /uid_validity = \?/);
  assert.deepEqual(
    calls[0].values,
    ["1641920722", 10, 11, 12],
  );
});

test("storage batch preserves sibling occurrences and canonicalizes by source time", async () => {
  const prepared = [];
  let batch = null;
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batch = statements;
      return statements.map(() => ({ success: true }));
    },
  };

  await upsertCaixaPulseMessageD1(db, {
    mailbox_key: "1641920722:200",
    uid_validity: "1641920722",
    mailbox_uid: 200,
    business_date: "2026-09-24",
    shift: "NOITE",
    message_sent_at: "2026-09-25T03:01:13.000Z",
    reported_total: 2,
    parsed_total: 2,
    open_total: 0,
    explicit_none: false,
    source_health: "HEALTHY",
    readonly_verified: true,
    body_char_count: 100,
    quality_flags: [],
    occurrences: [
      {
        occurrence_index: 0,
        domain: "DELIVERY",
        category: "Problema no Delivery",
        operator: "A",
        status: "Concluído",
        reference: "1",
        happened_text: "x",
        action_text: "y",
      },
      {
        occurrence_index: 1,
        domain: "CUSTOMER_VOICE",
        category: "Reclamação de cliente",
        operator: "B",
        status: "Concluído",
        reference: "2",
        happened_text: "z",
        action_text: "w",
      },
    ],
  });

  assert.ok(batch);
  assert.equal(
    batch.filter((s) => /INSERT INTO caixa_pulse_occurrence/.test(s.sql)).length,
    2,
  );
  assert.ok(
    batch.some((s) => /ORDER BY message_sent_at DESC, mailbox_uid DESC/.test(s.sql)),
  );
  assert.ok(
    batch.some((s) => /SET is_canonical = 0/.test(s.sql)),
  );
});
