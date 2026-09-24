/**
 * TATÁ OS bridge boundary. Observation only; no inherited print authority.
 */
import type { EdgeSourceObservation } from "../simulator";

export type TataOsReceiptType =
  | "agent_heartbeat"
  | "print_job_requested"
  | "lease_accepted"
  | "evidence_appended"
  | "software_print_status";

export interface TataOsSafeReceipt {
  receipt_id: string;
  type: TataOsReceiptType;
  unit_id: string;
  observed_at: string;
  job_id?: string;
  operation_id?: string;
  software_state?: string;
  payload?: Record<string, unknown>;
}

export interface TataOsBridgeObservation {
  observation: EdgeSourceObservation;
  inherited_print_authority: false;
  physical_effect: "UNKNOWN";
}

export function tataOsReceiptToObservation(receipt: TataOsSafeReceipt): TataOsBridgeObservation {
  return {
    observation: {
      observation_id: ["tata-os", receipt.type, receipt.receipt_id].join(":"),
      kind: "tata_os_receipt",
      source_ref: {
        source: "tata_os",
        kind: receipt.type,
        id: receipt.job_id ?? receipt.operation_id ?? receipt.receipt_id,
        unit_id: receipt.unit_id,
      },
      observed_at: receipt.observed_at,
      payload: { operation_id: receipt.operation_id, software_state: receipt.software_state, ...(receipt.payload ?? {}) },
    },
    inherited_print_authority: false,
    physical_effect: "UNKNOWN",
  };
}

export const TATA_OS_BRIDGE_CAPABILITIES = Object.freeze([
  "observe_agent_heartbeat",
  "observe_print_receipt",
] as const);