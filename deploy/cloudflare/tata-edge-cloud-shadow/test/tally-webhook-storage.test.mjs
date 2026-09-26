import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  storeTallyObservation,
} from "../src/tally-webhook-storage.mjs";

function fakeDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      const isInsert = /^\s*INSERT\s+OR\s+IGNORE/i.test(sql);
      const isSelect = /^\s*SELECT\b/i.test(sql);
      if (!isInsert && !isSelect) throw new Error("UNEXPECTED_SQL");
      return {
        bind(...values) {
          return {
            async run() {
              if (!isInsert) throw new Error("RUN_ON_SELECT");
              const [
                event_id, submission_id, form_id, source_created_at,
                operator_name, business_date, shift, category,
                reference_text, happened_text, action_text, status, subtype,
                item_missing_barriers_json, wrong_item_barriers_json,
                truth_class, payload_sha256, received_at,
              ] = values;
              const conflict = rows.find(
                (row) => row.event_id === event_id || row.submission_id === submission_id,
              );
              if (conflict) return { meta: { changes: 0 } };
              rows.push({
                event_id, submission_id, form_id, source_created_at,
                operator_name, business_date, shift, category,
                reference_text, happened_text, action_text, status, subtype,
                item_missing_barriers_json, wrong_item_barriers_json,
                truth_class, payload_sha256, received_at,
              });
              return { meta: { changes: 1 } };
            },
            async first() {
              if (!isSelect) throw new Error("FIRST_ON_INSERT");
              const [eventId, submissionId] = values;
              return rows.find(
                (row) => row.event_id === eventId || row.submission_id === submissionId,
              ) ?? null;
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

test("migration contract pins replay and truth constraints", () => {
  const sql = readFileSync(
    new URL("../migration-001-tally-barrier-shadow.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /event_id\s+TEXT\s+PRIMARY\s+KEY/i);
  assert.match(sql, /submission_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(
    sql,
    /subtype\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(subtype\s+IN\s*\('Item faltando','Item errado','Outro'\)\)/i,
  );
  assert.match(
    sql,
    /truth_class\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(truth_class\s*=\s*'OPERATOR_SELF_REPORT'\)/i,
  );
});

test("storage admits one observation and makes exact replay idempotent", async () => {
  const db = fakeDb();
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
  assert.equal(db.rows.length, 1);
});

test("same source ids with different payload hash fail closed", async () => {
  const db = fakeDb();
  await storeTallyObservation(db, observation(), "a".repeat(64));
  await assert.rejects(
    storeTallyObservation(db, observation(), "b".repeat(64)),
    /tally_replay_conflict/,
  );
  assert.equal(db.rows.length, 1);
});
