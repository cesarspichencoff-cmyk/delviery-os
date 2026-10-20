/**
 * Ciclo de vida das chaves de produtor do feed público (migration 0010).
 *
 * Mesmo rito do device-admin: plano sem escrita -> impressão digital ->
 * aplicação só com o fingerprint revisado, dentro de uma transação que refaz
 * o plano e recusa se o estado mudou. Roda com a credencial do DONO do banco;
 * nenhum runtime recebe escrita em platform.producer_key.
 *
 * Recusas que nenhum plano consegue contornar:
 *   - `real` em allowed_modes (o CHECK da 0010 recusaria de qualquer forma);
 *   - chave pública já usada por outro produtor ou outra versão;
 *   - tipo de evento fora do catálogo público de Entregas;
 *   - validade invertida ou acima do teto.
 * Rotação é registrar um key_id novo; a chave antiga é revogada à parte.
 */
import { createHash, createPublicKey } from "node:crypto";

import { isPublicEventType } from "../../entregas/contracts/events/catalog";
import {
  bytesDaChavePublicaEd25519,
  idDeProdutorValido,
} from "../../entregas/contracts/producer-attestation";
import type { SqlClient } from "../persistence/sql-client";

/** Teto de validade de uma chave: força rotação periódica. */
export const VALIDADE_MAXIMA_DIAS = 400;

export interface ProducerKeyRow {
  producer_id: string;
  key_id: string;
  unit_id: string;
  public_key_sha256: string;
  allowed_event_types: string[];
  allowed_modes: string[];
  not_before: string;
  not_after: string;
  revoked_at?: string;
}

export interface ProducerAdminStore {
  currentUser(): Promise<string>;
  unitActive(unitId: string): Promise<boolean | null>;
  key(producer_id: string, key_id: string): Promise<ProducerKeyRow | null>;
  keyByPublic(raw: Buffer): Promise<{ producer_id: string; key_id: string } | null>;
  register(input: ProducerRegisterTarget & { public_key: Buffer }): Promise<boolean>;
  revoke(input: { producer_id: string; key_id: string; revoked_by: string; reason: string }): Promise<boolean>;
}

export interface ProducerRegisterTarget {
  producer_id: string;
  key_id: string;
  unit_id: string;
  allowed_event_types: string[];
  allowed_modes: string[];
  not_before: string;
  not_after: string;
  registered_by: string;
}

export interface ProducerAdminPlan {
  schema: "deliveryos-producer-admin-plan@1";
  action: "register" | "revoke";
  database_user: string;
  producer_id: string;
  key_id: string;
  current: ProducerKeyRow | null;
  target: Record<string, unknown>;
  can_apply: boolean;
  no_op: boolean;
  conflicts: string[];
}

function iso(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  return d.toISOString();
}

export class PgProducerAdminStore implements ProducerAdminStore {
  constructor(private readonly sql: SqlClient) {}

  async currentUser(): Promise<string> {
    const r = await this.sql.query<{ u: unknown }>("SELECT current_user AS u");
    return String(r[0]?.u ?? "");
  }

  async unitActive(unitId: string): Promise<boolean | null> {
    const r = await this.sql.query<{ active: unknown }>(
      "SELECT active FROM identity.unit WHERE unit_id = $1",
      [unitId],
    );
    return r.length ? r[0].active === true : null;
  }

  async key(producer_id: string, key_id: string): Promise<ProducerKeyRow | null> {
    const r = await this.sql.query<Record<string, unknown>>(
      `SELECT producer_id, key_id, unit_id, encode(sha256(public_key),'hex') AS pk,
              allowed_event_types, allowed_modes, not_before, not_after, revoked_at
         FROM platform.producer_key WHERE producer_id = $1 AND key_id = $2`,
      [producer_id, key_id],
    );
    if (!r.length) return null;
    const l = r[0];
    return {
      producer_id: String(l.producer_id),
      key_id: String(l.key_id),
      unit_id: String(l.unit_id),
      public_key_sha256: String(l.pk),
      allowed_event_types: (l.allowed_event_types as string[]) ?? [],
      allowed_modes: (l.allowed_modes as string[]) ?? [],
      not_before: iso(l.not_before),
      not_after: iso(l.not_after),
      ...(l.revoked_at == null ? {} : { revoked_at: iso(l.revoked_at) }),
    };
  }

  async keyByPublic(raw: Buffer) {
    const r = await this.sql.query<{ producer_id: unknown; key_id: unknown }>(
      "SELECT producer_id, key_id FROM platform.producer_key WHERE public_key = $1",
      [raw],
    );
    return r.length ? { producer_id: String(r[0].producer_id), key_id: String(r[0].key_id) } : null;
  }

  async register(i: ProducerRegisterTarget & { public_key: Buffer }): Promise<boolean> {
    const r = await this.sql.query(
      `INSERT INTO platform.producer_key
         (producer_id, key_id, unit_id, public_key, allowed_event_types, allowed_modes,
          not_before, not_after, registered_by)
       VALUES ($1,$2,$3,$4,$5::text[],$6::text[],$7,$8,$9)
       ON CONFLICT DO NOTHING
       RETURNING 1 AS inserted`,
      [i.producer_id, i.key_id, i.unit_id, i.public_key, i.allowed_event_types,
        i.allowed_modes, i.not_before, i.not_after, i.registered_by],
    );
    return r.length === 1;
  }

  async revoke(i: { producer_id: string; key_id: string; revoked_by: string; reason: string }) {
    const r = await this.sql.query(
      `UPDATE platform.producer_key
          SET revoked_at = now(), revoked_by = $3, revoked_reason = $4
        WHERE producer_id = $1 AND key_id = $2 AND revoked_at IS NULL
        RETURNING 1 AS revoked`,
      [i.producer_id, i.key_id, i.revoked_by, i.reason],
    );
    return r.length === 1;
  }
}

function requiredId(campo: string, v: string): string {
  if (!idDeProdutorValido(v)) throw new Error(campo + " invalido");
  return v;
}

function requiredText(campo: string, v: string, max: number): string {
  const t = (v ?? "").trim();
  if (!t || t.length > max) throw new Error(campo + " obrigatorio (ate " + max + " caracteres)");
  return t;
}

function lista(v: string): string[] {
  return [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))].sort();
}

/** Chave pública Ed25519 em SPKI DER base64 (saída de `openssl pkey -pubout -outform DER`). */
export function lerChavePublica(spkiB64: string): Buffer {
  const der = Buffer.from(spkiB64, "base64");
  if (der.length === 0 || der.length > 512 || der.toString("base64") !== spkiB64) {
    throw new Error("public_key: base64 padrao canonico de SPKI DER exigido");
  }
  return bytesDaChavePublicaEd25519(createPublicKey({ key: der, format: "der", type: "spki" }));
}

export async function planRegister(
  store: ProducerAdminStore,
  raw: {
    producer_id: string; key_id: string; unit_id: string; public_key_spki_b64: string;
    event_types: string; modes: string; not_before: string; not_after: string; registered_by: string;
  },
): Promise<{ plan: ProducerAdminPlan; public_key: Buffer }> {
  const producer_id = requiredId("producer_id", raw.producer_id);
  const key_id = requiredId("key_id", raw.key_id);
  const unit_id = requiredText("unit_id", raw.unit_id, 64);
  const registered_by = requiredText("registered_by", raw.registered_by, 128);
  const public_key = lerChavePublica(raw.public_key_spki_b64);
  const allowed_event_types = lista(raw.event_types);
  const allowed_modes = lista(raw.modes);
  const inicio = new Date(raw.not_before);
  const fim = new Date(raw.not_after);

  const conflicts: string[] = [];
  if (!allowed_event_types.length) conflicts.push("event_types_vazio");
  for (const t of allowed_event_types) if (!isPublicEventType(t)) conflicts.push("tipo_desconhecido:" + t);
  if (!allowed_modes.length) conflicts.push("modes_vazio");
  if (allowed_modes.includes("real")) conflicts.push("real_nao_concedivel");
  for (const m of allowed_modes) {
    if (m !== "real" && m !== "simulated" && m !== "control") conflicts.push("modo_invalido:" + m);
  }
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) conflicts.push("validade_invalida");
  else if (fim <= inicio) conflicts.push("validade_invertida");
  else if (fim.getTime() - inicio.getTime() > VALIDADE_MAXIMA_DIAS * 86_400_000) {
    conflicts.push("validade_acima_do_teto");
  }

  const [database_user, ativa, current, emUso] = await Promise.all([
    store.currentUser(),
    store.unitActive(unit_id),
    store.key(producer_id, key_id),
    store.keyByPublic(public_key),
  ]);
  if (ativa === null) conflicts.push("unit_not_found");
  else if (!ativa) conflicts.push("unit_inactive");
  if (current) conflicts.push("key_id_ja_registrado");
  if (emUso) conflicts.push("chave_publica_ja_em_uso");

  return {
    public_key,
    plan: {
      schema: "deliveryos-producer-admin-plan@1",
      action: "register",
      database_user,
      producer_id,
      key_id,
      current,
      target: {
        unit_id,
        public_key_sha256: createHash("sha256").update(public_key).digest("hex"),
        allowed_event_types,
        allowed_modes,
        not_before: Number.isNaN(inicio.getTime()) ? raw.not_before : inicio.toISOString(),
        not_after: Number.isNaN(fim.getTime()) ? raw.not_after : fim.toISOString(),
        registered_by,
      },
      can_apply: conflicts.length === 0,
      no_op: false,
      conflicts,
    },
  };
}

export async function planRevokeProducer(
  store: ProducerAdminStore,
  raw: { producer_id: string; key_id: string; revoked_by: string; reason: string },
): Promise<ProducerAdminPlan> {
  const producer_id = requiredId("producer_id", raw.producer_id);
  const key_id = requiredId("key_id", raw.key_id);
  const revoked_by = requiredText("revoked_by", raw.revoked_by, 128);
  const reason = requiredText("reason", raw.reason, 500);
  const [database_user, current] = await Promise.all([
    store.currentUser(),
    store.key(producer_id, key_id),
  ]);
  const conflicts: string[] = [];
  let no_op = false;
  if (!current) conflicts.push("key_not_found");
  else if (current.revoked_at) no_op = true;
  return {
    schema: "deliveryos-producer-admin-plan@1",
    action: "revoke",
    database_user,
    producer_id,
    key_id,
    current,
    target: { revoked_by, reason },
    can_apply: conflicts.length === 0,
    no_op,
    conflicts,
  };
}

export function producerPlanFingerprint(plan: ProducerAdminPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
