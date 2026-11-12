import * as crypto from "node:crypto";
import { buildDailyStoreTataSequenceScope } from "./tataSequence";

/**
 * TATÁ number attestation V1 — how a persisted binding becomes LIVE_ATTESTED.
 *
 * The writer binds (order key, store day) -> number in the store ledger. An
 * INDEPENDENT attester — another process and identity, its own Ed25519 key,
 * read-only access to the ledger — re-checks the whole day with the V2 policy
 * (contiguous 001..n, one number per order, one order per number) and signs a
 * statement. Whoever uses the number verifies, outside the signed input:
 *   - the attester key is in the trusted set (role, scope, validity, key id),
 *   - the attester is not a writer (separation of duties),
 *   - the clock is inside the statement window (<= 36 h),
 *   - the statement matches this order and Itaim day,
 *   - and, separately, the day ledger still holds the same history prefix.
 * Only an attester whose trusted scope is PRODUCTION_ITAIM can make a number
 * operational; TEST_ISOLATED keys prove the protocol and never reach paper.
 * Pure: verification only; no file, network, ledger, spooler or print.
 */
export const TATA_ATTESTATION_SCHEMA_V1 = "tata.sequence.attestation.v1";
export const TATA_ATTESTERS_SCHEMA_V1 = "tata.sequence.attesters.v1";
const DOMAIN = "TATA-SEQUENCE-ATTESTATION-V1\n";
export const ATTESTATION_FIELDS_V1 = Object.freeze([
  "schema", "store", "day", "scope_id", "order_key", "tata_sequence", "ledger_day_rows",
  "ledger_day_digest", "writer_key_id", "attester_key_id", "issued_at_s", "expires_at_s", "nonce",
] as const);
const MAX_WINDOW_S = 36 * 3600;
const HEX64 = /^[a-f0-9]{64}$/;
const SIG = /^(?:[A-Za-z0-9+/]{4}){21}(?:[A-Za-z0-9+/]{2}==)$/;

export type AttesterScopeV1 = "PRODUCTION_ITAIM" | "TEST_ISOLATED";
export interface TataAttestationStatementV1 {
  schema: string; store: string; day: string; scope_id: string; order_key: string; tata_sequence: string;
  ledger_day_rows: number; ledger_day_digest: string; writer_key_id: string; attester_key_id: string;
  issued_at_s: number; expires_at_s: number; nonce: string;
}
export interface TataAttestationV1 extends TataAttestationStatementV1 { signature_base64: string }
export interface TataAttesterAnchorV1 {
  key_id: string; public_key_spki_base64: string; role: "TATA_SEQUENCE_ATTESTER";
  scope: AttesterScopeV1; not_before_s: number; not_after_s: number;
}
export interface TataAttesterSetV1 {
  schema: string; store: string; attesters: TataAttesterAnchorV1[]; writer_key_ids: string[];
}
export interface AttestationCheckV1 {
  ok: boolean; reasons: string[]; scope: AttesterScopeV1 | null; statement: TataAttestationStatementV1 | null;
}

/** Domain-separated canonical bytes: fixed field order, no implicit coercion. */
export function attestationPayloadV1(statement: Record<string, unknown>): Buffer {
  return Buffer.from(DOMAIN + JSON.stringify(ATTESTATION_FIELDS_V1.map((k) => [k, statement[k]])), "utf8");
}
/** sha256 of the SPKI DER of an Ed25519 public key. */
export function publicKeyIdV1(publicKey: crypto.KeyObject | string): string {
  const key = typeof publicKey === "string"
    ? crypto.createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" })
    : publicKey;
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw Error("ED25519_PUBLIC_KEY_REQUIRED");
  return crypto.createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}
/** Digest of the day ledger's first `upTo` numbers (001..upTo), or null when
 * that prefix is not contiguous. Rows are V2 bindings of ONE store day. */
export function tataLedgerDayDigestV1(
  rows: ReadonlyArray<{ native_order_key: string; tata_sequence: string }>, upTo: number,
): string | null {
  if (!Array.isArray(rows) || !Number.isSafeInteger(upTo) || upTo < 1 || upTo > 999) return null;
  const sorted = [...rows].sort((a, b) => Number(a.tata_sequence) - Number(b.tata_sequence)).slice(0, upTo);
  if (sorted.length !== upTo || sorted.some((r, i) => r?.tata_sequence !== String(i + 1).padStart(3, "0")))
    return null;
  return crypto.createHash("sha256").update(JSON.stringify(sorted.map((r) => [r.native_order_key, r.tata_sequence])))
    .digest("hex");
}

export function verifyTataSequenceAttestationV1(
  attestation: unknown, attesters: unknown, nowS: unknown,
): AttestationCheckV1 {
  const reasons = new Set<string>();
  const answer = (scope: AttesterScopeV1 | null, statement: TataAttestationStatementV1 | null): AttestationCheckV1 =>
    ({ ok: reasons.size === 0, reasons: [...reasons].sort(), scope: reasons.size ? null : scope,
      statement: reasons.size ? null : statement });
  const a = attestation as Record<string, unknown> | null;
  const keys = [...ATTESTATION_FIELDS_V1, "signature_base64"];
  if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).length !== keys.length ||
      keys.some((k) => !Object.prototype.hasOwnProperty.call(a, k)) || a.schema !== TATA_ATTESTATION_SCHEMA_V1) {
    reasons.add("ENVELOPE_INVALID");
    return answer(null, null);
  }
  const st = a as unknown as TataAttestationV1;
  if (!Number.isSafeInteger(nowS)) reasons.add("CLOCK_MISSING");
  const set = attesters as Partial<TataAttesterSetV1> | null;
  if (!set || typeof set !== "object" || set.schema !== TATA_ATTESTERS_SCHEMA_V1 || set.store !== st.store ||
      !Array.isArray(set.attesters) || !Array.isArray(set.writer_key_ids)) {
    reasons.add("ATTESTER_NOT_TRUSTED");
    return answer(null, null);
  }
  // Statement fields: Itaim store/day scope from tataSequence.ts, never a new format.
  const scope = /^\d{4}\|\d{2}$/.test(String(st.store)) && typeof st.day === "string"
    ? buildDailyStoreTataSequenceScope({ store_id: st.store, operational_date: st.day }).scope_id : null;
  const seq = String(st.tata_sequence);
  if (!scope || st.scope_id !== scope || typeof st.order_key !== "string" ||
      !st.order_key.startsWith(st.store + "|") || st.order_key.split("|").length !== 4 ||
      !/^\d{3}$/.test(seq) || seq === "000" || !Number.isSafeInteger(st.ledger_day_rows) ||
      st.ledger_day_rows < Number(seq) || st.ledger_day_rows > 999 ||
      !HEX64.test(String(st.ledger_day_digest)) || !/^[a-f0-9]{32}$/.test(String(st.nonce)))
    reasons.add("STATEMENT_INVALID");
  if (!HEX64.test(String(st.writer_key_id)) || !HEX64.test(String(st.attester_key_id)) ||
      st.writer_key_id === st.attester_key_id || set.writer_key_ids.includes(st.attester_key_id))
    reasons.add("SEPARATION_OF_DUTIES");
  // A claimed writer identity is not proof of an authorized writer.
  // Accept numbers only from a writer pinned by this independent trust set.
  if (!set.writer_key_ids.includes(st.writer_key_id))
    reasons.add("WRITER_NOT_TRUSTED");
  if (!Number.isSafeInteger(st.issued_at_s) || !Number.isSafeInteger(st.expires_at_s) ||
      st.expires_at_s <= st.issued_at_s || st.expires_at_s - st.issued_at_s > MAX_WINDOW_S ||
      (Number.isSafeInteger(nowS) && ((nowS as number) < st.issued_at_s || (nowS as number) > st.expires_at_s)))
    reasons.add("WINDOW_INVALID");
  const anchor = set.attesters.find((x) => x && x.key_id === st.attester_key_id);
  if (!anchor || anchor.role !== "TATA_SEQUENCE_ATTESTER" ||
      (anchor.scope !== "PRODUCTION_ITAIM" && anchor.scope !== "TEST_ISOLATED") ||
      !Number.isSafeInteger(anchor.not_before_s) || !Number.isSafeInteger(anchor.not_after_s) ||
      !Number.isSafeInteger(st.issued_at_s) || st.issued_at_s < anchor.not_before_s || st.issued_at_s > anchor.not_after_s ||
      (Number.isSafeInteger(nowS) && ((nowS as number) < anchor.not_before_s || (nowS as number) > anchor.not_after_s))) {
    reasons.add("ATTESTER_NOT_TRUSTED");
    return answer(null, null);
  }
  let key: crypto.KeyObject;
  try {
    key = crypto.createPublicKey({ key: Buffer.from(String(anchor.public_key_spki_base64), "base64"), format: "der", type: "spki" });
    if (publicKeyIdV1(key) !== anchor.key_id) throw Error("KEY_ID");
  } catch {
    reasons.add("ANCHOR_INVALID");
    return answer(null, null);
  }
  const signature = String(st.signature_base64);
  let valid = false;
  try {
    valid = SIG.test(signature) && crypto.verify(null, attestationPayloadV1(st as unknown as Record<string, unknown>),
      key, Buffer.from(signature, "base64"));
  } catch { valid = false; }
  if (!valid) reasons.add("SIGNATURE_INVALID");
  const statement = Object.fromEntries(ATTESTATION_FIELDS_V1.map((k) => [k, st[k]])) as unknown as TataAttestationStatementV1;
  return answer(anchor.scope, statement);
}
