"""Isolated SQLite test of candidate D1 bulk plan: no Cloudflare access, no writes outside memory."""
import json
import sqlite3
import subprocess
import unittest

COLUMNS = (
    "observation_id source_id external_ref signal_type observed_at ingested_at domain "
    "privacy_scope truth_class authority sensitivity subject_type subject_ref fact_summary "
    "possible_commitment due_at confidence evidence_ref content_fingerprint attention_candidate metadata_json"
).split()

def load_node_plan(count=100):
    js = """
import {packWorkObservationInserts} from './tools/cesar-os-ci/d1-bulk-plan.mjs';
const cols='observation_id source_id external_ref signal_type observed_at ingested_at domain privacy_scope truth_class authority sensitivity subject_type subject_ref fact_summary possible_commitment due_at confidence evidence_ref content_fingerprint attention_candidate metadata_json'.split(' ');
const rows=Array.from({length:COUNT},(_,i)=>Object.fromEntries(cols.map(k=>[k,
k==='observation_id'?'obs_'+String(i+1).padStart(16,'0'):
k==='source_id'?'github-actions-public-deliveryos':
k==='domain'?'WORK':
k==='truth_class'?'SOURCE_CLAIM':
k==='possible_commitment'?false:
k==='confidence'?1:
k==='metadata_json'?'{}':'CI PUBLIC SOURCE_CLAIM'
])));
console.log(JSON.stringify(packWorkObservationInserts(rows).observations));
""".replace("COUNT",str(count))
    p = subprocess.run(["node","--input-type=module","-e",js],capture_output=True,
                       text=True,timeout=15,check=True)
    return json.loads(p.stdout)

def database():
    db=sqlite3.connect(":memory:",isolation_level=None)
    cols=[]
    for c in COLUMNS:
        if c=="observation_id":
            cols.append("observation_id TEXT PRIMARY KEY")
        elif c=="possible_commitment":
            cols.append("possible_commitment INTEGER NOT NULL CHECK(possible_commitment=0)")
        elif c=="source_id":
            cols.append("source_id TEXT NOT NULL CHECK(source_id='github-actions-public-deliveryos')")
        elif c=="domain":
            cols.append("domain TEXT NOT NULL CHECK(domain='WORK')")
        else:
            cols.append(f"{c} TEXT")
    db.execute("CREATE TABLE source_observations ("+",".join(cols)+")")
    db.execute("CREATE TABLE source_ingestion_receipts (batch_id TEXT PRIMARY KEY,items_seen INTEGER NOT NULL)")
    return db

class FreeTierBulkSqliteTests(unittest.TestCase):
    def test_real_sqlite_accepts_all_100_in_one_transaction(self):
        stmts=load_node_plan(100)
        self.assertEqual(len(stmts),25)
        db=database()
        try:
            db.execute("BEGIN")
            for st in stmts:
                db.execute(st["sql"],st["params"])
            db.execute("INSERT INTO source_ingestion_receipts VALUES (?,?)",("batch-fixture",100))
            db.execute("COMMIT")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM source_observations").fetchone()[0],100)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM source_ingestion_receipts").fetchone()[0],1)
            for st in stmts:
                self.assertLessEqual(len(st["params"]),100)
        finally:
            db.close()
    def test_duplicate_observations_do_not_create_new_rows(self):
        stmts=load_node_plan(8)
        db=database()
        try:
            for _ in range(2):
                db.execute("BEGIN")
                for st in stmts:
                    db.execute(st["sql"],st["params"])
                db.execute("COMMIT")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM source_observations").fetchone()[0],8)
        finally:
            db.close()
    def test_mid_batch_failure_rolls_back_every_observation(self):
        stmts=load_node_plan(8)
        db=database()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                with db:
                    db.execute(stmts[0]["sql"],stmts[0]["params"])
                    db.execute("INSERT INTO source_observations (observation_id,source_id,domain,possible_commitment) VALUES (?,?,?,?)",
                               ("obs_bad","not-deliveryos","WORK",0))
                    db.execute(stmts[1]["sql"],stmts[1]["params"])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM source_observations").fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM source_ingestion_receipts").fetchone()[0],0)
        finally:
            db.close()

if __name__=="__main__":
    unittest.main()
