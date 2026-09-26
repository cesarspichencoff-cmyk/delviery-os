import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  storeTallyObservation,
} from "../src/tally-webhook-storage.mjs";

function d1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            async run() {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes ?? 0) } };
            },
            async first() {
              return statement.get(...values) ?? null;
            },
          };
        },
      };
    },
  };
}

function observation(overrides = {}) {
  return {
    event_id: "evt-1",
    submission_id: "sub-1",
    form_id: "eq4lae",
    source_created_at: "2026-09-26T10:00:00.000Z",
    operator_name: "VERTICE SHADOW",
    business_date: "2026-09-26",
    shift: "Manhã",
    category: "Problema no Delivery",
    reference_text: "REF-1",
    happened_text: "Teste",
    action_text: "Nenhuma ação operacional",
    status: "Em Andamento",
    subtype: "Outro",
    item_missing_barriers: null,
    wrong_item_barriers: null,
    truth_class: "OPERATOR_SELF_REPORT",
    ...overrides,
  };
}

function setup() {
  const database = new DatabaseSync(":memory:");
  const migration = readFileSync(
    new URL("../migration-001-tally-barrier-shadow.sql", import.meta.url),
    "utf8",
  );
  database.exec(migration);
  return { database, db: d1Adapter(database) };
}

test("shadow migration + storage admit one observation and make replay idempotent", async () => {
  const { database, db } = setup();
  try {
    const first = await storeTallyObservation(
      db,
      observation(),
      "a".repeat(64),
      "2026-09-26T10:00:01.000Z",
    );
    assert.equal(first.accepted, true);
    assert.equal(first.duplicate, false);

    const replay = await storeTallyObservation(
      db,
      observation(),
      "a".repeat(64),
      "2026-09-26T10:00:02.000Z",
    );
    assert.equal(replay.accepted, true);
    assert.equal(replay.duplicate, true);

    const count = database
      .prepare("SELECT COUNT(*) AS count FROM tally_occurrence_barrier")
      .get();
    assert.equal(Number(count.count), 1);
  } finally {
    database.close();
  }
});

test("same source ids with different payload hash fail closed", async () => {
  const { database, db } = setup();
  try {
    await storeTallyObservation(db, observation(), "a".repeat(64));
    await assert.rejects(
      storeTallyObservation(db, observation(), "b".repeat(64)),
      /tally_replay_conflict/,
    );
    const count = database
      .prepare("SELECT COUNT(*) AS count FROM tally_occurrence_barrier")
      .get();
    assert.equal(Number(count.count), 1);
  } finally {
    database.close();
  }
});

test("schema constrains truth class and subtype", () => {
  const { database } = setup();
  try {
    const base = [
      "evt-x", "sub-x", "eq4lae", "2026-09-26T10:00:00.000Z",
      "", "", "", "", "", "", "", "",
    ];
    const sql = `INSERT INTO tally_occurrence_barrier (
      event_id, submission_id, form_id, source_created_at,
      operator_name, business_date, shift, category,
      reference_text, happened_text, action_text, status, subtype,
      item_missing_barriers_json, wrong_item_barriers_json,
      truth_class, payload_sha256, received_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    assert.throws(
      () => database.prepare(sql).run(
        ...base,
        "Outro", null, null, "FACT", "c".repeat(64),
        "2026-09-26T10:00:01.000Z",
      ),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => database.prepare(sql).run(
        "evt-y", "sub-y", ...base.slice(2),
        "Desconhecido", null, null, "OPERATOR_SELF_REPORT", "d".repeat(64),
        "2026-09-26T10:00:01.000Z",
      ),
      /CHECK constraint failed/,
    );
  } finally {
    database.close();
  }
});
