"""SQLite contract validation for candidate D1 cursor. No real database access."""
from pathlib import Path
import json
import re
import sqlite3
import unittest

SOURCE = "github-actions-public-deliveryos"
ROOT = Path(__file__).resolve().parent.parent
SCRIPT = (ROOT / "tools" / "cesar-os-ci" / "cursor-store.mjs").read_text(encoding="utf-8")
SQL_MATCH = re.search(r"MIGRATION_SQL=`(.*?)`;", SCRIPT, re.S)
assert SQL_MATCH is not None, "candidate migration not found"
SQL = SQL_MATCH.group(1)


def cursor(revision):
    return json.dumps({
        "schema": "cesar-os-ci-replay-cursor-v1",
        "source_id": SOURCE,
        "revision": revision,
        "reconcile_offset": 0,
        "archives": {}
    }, separators=(",", ":"))


class CursorSQLiteContract(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:", isolation_level=None)
        self.conn.executescript(SQL)

    def tearDown(self):
        self.conn.close()

    def test_create_idempotent_and_schema(self):
        self.conn.executescript(SQL)
        fields = [row[1] for row in self.conn.execute("PRAGMA table_info(ci_archive_cursors)")]
        self.assertEqual(fields, ["source_id", "revision", "cursor_json", "updated_at"])

    def test_single_writer_and_stale_compare_and_swap(self):
        insert = "INSERT OR IGNORE INTO ci_archive_cursors(source_id,revision,cursor_json,updated_at) VALUES(?,?,?,?)"
        first = self.conn.execute(insert, (SOURCE, 1, cursor(1), "2026-10-10T23:00:00Z")).rowcount
        duplicate = self.conn.execute(insert, (SOURCE, 1, cursor(1), "2026-10-10T23:00:00Z")).rowcount
        update = "UPDATE ci_archive_cursors SET revision=?,cursor_json=?,updated_at=? WHERE source_id=? AND revision=?"
        valid = self.conn.execute(update, (2, cursor(2), "2026-10-10T23:01:00Z", SOURCE, 1)).rowcount
        stale = self.conn.execute(update, (2, cursor(2), "2026-10-10T23:01:00Z", SOURCE, 1)).rowcount
        value = self.conn.execute("SELECT revision,cursor_json FROM ci_archive_cursors WHERE source_id=?", (SOURCE,)).fetchone()
        self.assertEqual((first, duplicate, valid, stale), (1, 0, 1, 0))
        self.assertEqual((value[0], json.loads(value[1])["revision"]), (2, 2))

    def test_database_rejects_wrong_source_revision_and_large_blob(self):
        insert = "INSERT INTO ci_archive_cursors(source_id,revision,cursor_json,updated_at) VALUES(?,?,?,?)"
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(insert, ("other-source", 1, cursor(1), "2026-10-10T23:00:00Z"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(insert, (SOURCE, 0, cursor(0), "2026-10-10T23:00:00Z"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(insert, (SOURCE, 1, "\N{LATIN SMALL LETTER E WITH ACUTE}" * 33000, "2026-10-10T23:00:00Z"))
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM ci_archive_cursors").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
