import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import type { SqlClient, SqlRow } from "../../platform/persistence/sql-client";

export interface PilotReadyOrder {
  order_ref: string;
  label: string;
  channel?: string;
  created_at: string;
}

export interface PilotReadyOrderStore {
  list(): Promise<PilotReadyOrder[]>;
  add(order: PilotReadyOrder): Promise<{ duplicate: boolean }>;
  removeByOrderRefs(orderRefs: readonly string[]): Promise<number>;
}

function validate(order: PilotReadyOrder): void {
  if (!order.order_ref?.trim()) throw new Error("ready_order: order_ref obrigatório");
  if (!order.label?.trim()) throw new Error("ready_order: label obrigatório");
  if (!order.created_at?.trim()) throw new Error("ready_order: created_at obrigatório");
}

interface FileReadyData {
  orders: PilotReadyOrder[];
}

function readFileStore(path: string): FileReadyData {
  if (!existsSync(path)) return { orders: [] };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<FileReadyData>;
  return {
    orders: Array.isArray(raw.orders)
      ? raw.orders.map((o) => structuredClone(o))
      : [],
  };
}

function writeFileStore(path: string, data: FileReadyData): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, path);
}

export class FilePilotReadyOrderStore implements PilotReadyOrderStore {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) writeFileStore(path, { orders: [] });
  }

  async list(): Promise<PilotReadyOrder[]> {
    return readFileStore(this.path).orders;
  }

  async add(order: PilotReadyOrder): Promise<{ duplicate: boolean }> {
    validate(order);
    const data = readFileStore(this.path);
    if (data.orders.some((o) => o.order_ref === order.order_ref)) {
      return { duplicate: true };
    }
    data.orders.push(structuredClone(order));
    writeFileStore(this.path, data);
    return { duplicate: false };
  }

  async removeByOrderRefs(orderRefs: readonly string[]): Promise<number> {
    const refs = new Set(orderRefs.filter((x) => x?.trim()));
    if (!refs.size) return 0;
    const data = readFileStore(this.path);
    const before = data.orders.length;
    data.orders = data.orders.filter((o) => !refs.has(o.order_ref));
    const removed = before - data.orders.length;
    if (removed) writeFileStore(this.path, data);
    return removed;
  }
}

export class MemoryPilotReadyOrderStore implements PilotReadyOrderStore {
  private readonly orders = new Map<string, PilotReadyOrder>();

  async list(): Promise<PilotReadyOrder[]> {
    return [...this.orders.values()].map((o) => structuredClone(o));
  }

  async add(order: PilotReadyOrder): Promise<{ duplicate: boolean }> {
    validate(order);
    if (this.orders.has(order.order_ref)) return { duplicate: true };
    this.orders.set(order.order_ref, structuredClone(order));
    return { duplicate: false };
  }

  async removeByOrderRefs(orderRefs: readonly string[]): Promise<number> {
    let removed = 0;
    for (const ref of new Set(orderRefs)) {
      if (this.orders.delete(ref)) removed += 1;
    }
    return removed;
  }
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

export class PgPilotReadyOrderStore implements PilotReadyOrderStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly unitId: string,
  ) {
    if (!unitId.trim()) throw new Error("ready_order: unit_id obrigatório");
  }

  async list(): Promise<PilotReadyOrder[]> {
    const rows = await this.sql.query<SqlRow>(
      `SELECT order_ref, label, channel, created_at
         FROM entregas.ready_order
        WHERE unit_id=$1
        ORDER BY created_at, order_ref`,
      [this.unitId],
    );
    return rows.map((r) => ({
      order_ref: String(r.order_ref),
      label: String(r.label),
      channel:
        r.channel === null || r.channel === undefined
          ? undefined
          : String(r.channel),
      created_at: iso(r.created_at),
    }));
  }

  async add(order: PilotReadyOrder): Promise<{ duplicate: boolean }> {
    validate(order);
    const rows = await this.sql.query<SqlRow>(
      `INSERT INTO entregas.ready_order
         (unit_id, order_ref, label, channel, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (unit_id, order_ref) DO NOTHING
       RETURNING order_ref`,
      [
        this.unitId,
        order.order_ref,
        order.label,
        order.channel ?? null,
        order.created_at,
      ],
    );
    return { duplicate: rows.length === 0 };
  }

  async removeByOrderRefs(orderRefs: readonly string[]): Promise<number> {
    const refs = [...new Set(orderRefs.filter((x) => x?.trim()))];
    if (!refs.length) return 0;
    const rows = await this.sql.query<SqlRow>(
      `DELETE FROM entregas.ready_order
        WHERE unit_id=$1 AND order_ref = ANY($2::text[])
        RETURNING order_ref`,
      [this.unitId, refs],
    );
    return rows.length;
  }
}

export function createFilePilotReadyOrderStore(
  path: string,
): PilotReadyOrderStore {
  return new FilePilotReadyOrderStore(path);
}
