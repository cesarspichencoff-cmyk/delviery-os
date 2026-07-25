/**
 * Registro de ciência do termo de localização — append-only e idempotente.
 *
 * O que este módulo garante (Adendo §4.5):
 *  - dá para provar DEPOIS qual texto exato o motoboy leu (`term_hash`);
 *  - o mesmo aceite registrado duas vezes não vira dois registros;
 *  - registro não é alterável retroativamente: só se acrescenta;
 *  - o motoboy consegue recuperar um recibo do que aceitou;
 *  - nada de coordenada, documento, foto, senha ou biometria entra aqui.
 */

import { createHash } from "node:crypto";
import type { LocationTerm } from "./term";
import { hashTerm, isPublishable } from "./term";

export const ACK_SCHEMA_VERSION = "consent@1.0.0";
export const ACK_EVENT_TYPE = "rider_location_notice_acknowledged";

/** Como o aceite chegou. `migration` nunca é aceite válido de versão nova. */
export const ACK_ORIGINS = ["rider_app", "supervised_device", "migration"] as const;
export type AckOrigin = (typeof ACK_ORIGINS)[number];

export const ACK_STATUSES = ["accepted", "declined"] as const;
export type AckStatus = (typeof ACK_STATUSES)[number];

export interface AcknowledgementRecord {
  acknowledgement_id: string;
  /** ID canônico e opaco do motoboy — nunca nome, telefone ou documento. */
  rider_id: string;
  unit_id: string;
  term_version: string;
  term_material_version: string;
  term_hash: string;
  status: AckStatus;
  accepted_at: string;
  recorded_at: string;
  /** Pseudonimizado — nunca IMEI, MAC ou número de telefone. */
  device_id: string;
  app_version: string;
  language: string;
  origin: AckOrigin;
  correlation_id: string;
  schema_version: string;
}

/**
 * Chaves que jamais podem aparecer no registro de aceite. Testado, não
 * confiado ao bom senso de quem for mexer depois.
 */
export const ACK_FORBIDDEN_KEYS = [
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "location",
  "senha",
  "password",
  "biometria",
  "biometric",
  "cpf",
  "rg",
  "documento",
  "document",
  "foto",
  "photo",
  "selfie",
  "endereco",
  "address",
  "endereco_residencial",
  "telefone",
  "phone",
  "nome",
  "full_name",
  "assinatura_imagem",
  "signature_image",
] as const;

export interface AckInput {
  rider_id: string;
  term: LocationTerm;
  status: AckStatus;
  accepted_at: string;
  device_id: string;
  app_version: string;
  origin: AckOrigin;
  correlation_id: string;
}

/**
 * Identidade determinística do aceite. O mesmo motoboy aceitando a mesma
 * versão material no mesmo aparelho produz o mesmo id — é isso que torna o
 * registro idempotente sem depender de coordenação.
 */
export function acknowledgementId(input: {
  rider_id: string;
  unit_id: string;
  term_material_version: string;
  term_hash: string;
  device_id: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.rider_id,
        input.unit_id,
        input.term_material_version,
        input.term_hash,
        input.device_id,
      ].join("|"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

export type BuildAckResult =
  | { ok: true; record: AcknowledgementRecord }
  | { ok: false; error: string };

/** Constrói o registro. Recusa termo não publicável — falha fechada. */
export function buildAcknowledgement(
  input: AckInput,
  now: Date = new Date(),
): BuildAckResult {
  if (!input.rider_id || !input.rider_id.trim()) {
    return { ok: false, error: "rider_id obrigatório" };
  }
  if (!input.device_id || !input.device_id.trim()) {
    return { ok: false, error: "device_id obrigatório" };
  }
  if (!isPublishable(input.term)) {
    return {
      ok: false,
      error: "termo não publicável: há campos pendentes de decisão do responsável",
    };
  }

  const term_hash = hashTerm(input.term);
  return {
    ok: true,
    record: {
      acknowledgement_id: acknowledgementId({
        rider_id: input.rider_id,
        unit_id: input.term.unit_id,
        term_material_version: input.term.material_version,
        term_hash,
        device_id: input.device_id,
      }),
      rider_id: input.rider_id,
      unit_id: input.term.unit_id,
      term_version: input.term.version,
      term_material_version: input.term.material_version,
      term_hash,
      status: input.status,
      accepted_at: input.accepted_at,
      recorded_at: now.toISOString(),
      device_id: input.device_id,
      app_version: input.app_version,
      language: input.term.language,
      origin: input.origin,
      correlation_id: input.correlation_id,
      schema_version: ACK_SCHEMA_VERSION,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Armazenamento append-only
 * ------------------------------------------------------------------ */

/** Porta de IO — permite provar sobrevivência a reinício sem mockar `fs`. */
export interface AckStorage {
  appendLine(line: string): void;
  readLines(): string[];
}

/**
 * Store append-only. Não existe update nem delete por desenho: a única
 * operação é acrescentar. Reabrir a store relê o arquivo — é assim que o
 * aceite sobrevive ao reinício do aplicativo.
 */
export class AcknowledgementStore {
  private readonly records: AcknowledgementRecord[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly storage: AckStorage) {
    for (const line of storage.readLines()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as AcknowledgementRecord;
        // Primeiro registro de um id vence: reescrita posterior é ignorada.
        if (rec.acknowledgement_id && !this.seen.has(rec.acknowledgement_id)) {
          this.seen.add(rec.acknowledgement_id);
          this.records.push(rec);
        }
      } catch {
        // Linha corrompida não derruba a store nem apaga o resto.
      }
    }
  }

  /** Idempotente: o mesmo aceite duas vezes não gera dois registros. */
  append(record: AcknowledgementRecord): { stored: boolean; record: AcknowledgementRecord } {
    const existing = this.records.find(
      (r) => r.acknowledgement_id === record.acknowledgement_id,
    );
    if (existing) return { stored: false, record: existing };
    this.seen.add(record.acknowledgement_id);
    this.records.push(record);
    this.storage.appendLine(JSON.stringify(record));
    return { stored: true, record };
  }

  all(): readonly AcknowledgementRecord[] {
    return this.records.slice();
  }

  forRider(rider_id: string): readonly AcknowledgementRecord[] {
    return this.records.filter((r) => r.rider_id === rider_id);
  }

  /** Aceite válido para o termo exato apresentado agora. */
  findAccepted(rider_id: string, term: LocationTerm): AcknowledgementRecord | undefined {
    const hash = hashTerm(term);
    return this.records.find(
      (r) =>
        r.rider_id === rider_id &&
        r.status === "accepted" &&
        r.unit_id === term.unit_id &&
        r.term_hash === hash,
    );
  }

  /** Recibo do motoboy — o que ele aceitou, sem jargão. */
  receipt(acknowledgement_id: string): Record<string, unknown> | undefined {
    const r = this.records.find((x) => x.acknowledgement_id === acknowledgement_id);
    if (!r) return undefined;
    return {
      recibo: r.acknowledgement_id,
      unidade: r.unit_id,
      versao_do_termo: r.term_version,
      impressao_do_texto: r.term_hash,
      aceito_em: r.accepted_at,
      situacao: r.status === "accepted" ? "aceito" : "recusado",
      aparelho: r.device_id,
      aplicativo: r.app_version,
    };
  }
}

/** Store em memória — testes e sessão de demonstração. */
export class MemoryAckStorage implements AckStorage {
  private lines: string[] = [];
  constructor(seed: string[] = []) {
    this.lines = seed.slice();
  }
  appendLine(line: string): void {
    this.lines.push(line);
  }
  readLines(): string[] {
    return this.lines.slice();
  }
  /** Simula reinício: os bytes continuam lá, o objeto em memória some. */
  snapshot(): string[] {
    return this.lines.slice();
  }
}
