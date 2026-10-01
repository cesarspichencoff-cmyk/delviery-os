import type { ProductionPrintIntent } from "./productionPrintPlan";
import type { StationProductionTicketV2 } from "./productionTicketV2";

export interface TataOsPrintRequestCandidate {
  operation_id: string;
  request_id: string;
  object_id: string;
  template_version_id: string;
  template_hash: string;
  printer_profile_id: string;
  variables_snapshot: {
    schema: "deliveryos.production-ticket-variables.v1";
    ticket: StationProductionTicketV2;
    printer_code: string;
    printer_name: string;
    semantic_key_material: string;
  };
  requested_by: string;
  requested_at: string;
  reason: "PRODUCTION_TICKET" | "REPRINT";
  reprint_of: string | null;
  copies: number;
}

export interface TataOsPrintHandoff {
  schema: "deliveryos.tata-os-print-handoff.v1";
  contract_complete: boolean;
  submission_authorized: false;
  blocking_reasons: string[];
  request: TataOsPrintRequestCandidate | null;
  effect_boundary: {
    create_request_is_not_print: true;
    provider_acceptance_is_not_physical_confirmation: true;
    spooler_acceptance_is_not_physical_confirmation: true;
    ambiguous_effect_requires_reconciliation: true;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Adapts a calibrated DeliveryOS print intent to the provider-neutral TATÁ OS
 * print contract. It never submits the request.
 *
 * operation_id must be minted by the caller at the human/system intention
 * boundary, not regenerated per retry.
 */
export function buildTataOsPrintHandoff(input: {
  intent: ProductionPrintIntent;
  ticket: StationProductionTicketV2;
  operation_id: string;
  request_id: string;
  object_id: string;
  template_version_id: string;
  template_hash: string;
  printer_profile_id: string;
  requested_by: string;
  requested_at: string;
  reason?: "PRODUCTION_TICKET" | "REPRINT";
  reprint_of?: string | null;
  copies?: number;
}): TataOsPrintHandoff {
  const blocking = new Set<string>();
  const copies = positiveInteger(input.copies ?? 1);

  if (input.intent.calibration_status !== "READY_FOR_RENDER_CALIBRATION_PROVEN") {
    blocking.add("PRINTER_CALIBRATION_NOT_PROVEN");
  }
  if (input.intent.printer.printer_code !== input.ticket.destination.printer_code) {
    blocking.add("INTENT_TICKET_PRINTER_CODE_MISMATCH");
  }
  if (input.intent.printer.printer_name !== input.ticket.destination.printer_name) {
    blocking.add("INTENT_TICKET_PRINTER_NAME_MISMATCH");
  }

  for (const [field, value] of Object.entries({
    operation_id: input.operation_id,
    request_id: input.request_id,
    object_id: input.object_id,
    template_version_id: input.template_version_id,
    template_hash: input.template_hash,
    printer_profile_id: input.printer_profile_id,
    requested_by: input.requested_by,
    requested_at: input.requested_at,
  })) {
    if (!clean(value)) blocking.add(`MISSING_${field.toUpperCase()}`);
  }

  const reason = input.reason ?? "PRODUCTION_TICKET";
  const reprintOf = clean(input.reprint_of) || null;

  if (reason === "REPRINT" && !reprintOf) {
    blocking.add("REPRINT_REQUIRES_REPRINT_OF");
  }
  if (reason === "PRODUCTION_TICKET" && reprintOf) {
    blocking.add("INITIAL_PRINT_CANNOT_HAVE_REPRINT_OF");
  }
  if (copies === null) blocking.add("INVALID_COPIES");

  const request: TataOsPrintRequestCandidate | null =
    blocking.size === 0 && copies !== null
      ? {
          operation_id: input.operation_id,
          request_id: input.request_id,
          object_id: input.object_id,
          template_version_id: input.template_version_id,
          template_hash: input.template_hash,
          printer_profile_id: input.printer_profile_id,
          variables_snapshot: {
            schema: "deliveryos.production-ticket-variables.v1",
            ticket: input.ticket,
            printer_code: input.intent.printer.printer_code,
            printer_name: input.intent.printer.printer_name,
            semantic_key_material: input.intent.semantic_key_material,
          },
          requested_by: input.requested_by,
          requested_at: input.requested_at,
          reason,
          reprint_of: reprintOf,
          copies,
        }
      : null;

  return {
    schema: "deliveryos.tata-os-print-handoff.v1",
    contract_complete: request !== null,
    submission_authorized: false,
    blocking_reasons: [...blocking].sort(),
    request,
    effect_boundary: {
      create_request_is_not_print: true,
      provider_acceptance_is_not_physical_confirmation: true,
      spooler_acceptance_is_not_physical_confirmation: true,
      ambiguous_effect_requires_reconciliation: true,
    },
  };
}
