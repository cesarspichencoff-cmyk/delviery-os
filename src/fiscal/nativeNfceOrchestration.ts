import type { ProductionPrintEvidenceState } from "../production/productionPrintPlan";

export type FiscalEvidence = "HUMAN_CONFIRMED_RULE" | "REAL_OBSERVED" | "UNKNOWN";

export interface ProvenBoolean {
  value: boolean;
  evidence: FiscalEvidence;
  source_ref: string | null;
}

export interface ProductionDispatchEvidence {
  intent_fingerprint: string;
  printer_code: string;
  state: ProductionPrintEvidenceState;
}

export interface NativeNfceReadiness {
  native_teknisa_nfce_path: ProvenBoolean;
  sales_channel_eligible_for_native_nfce: ProvenBoolean;
  fiscal_trigger_ready: ProvenBoolean;
  fiscal_timing_compatible_with_after_production_dispatch: ProvenBoolean;
  nfce_cash_register_configured: ProvenBoolean;
  nfce_cash_register_open: ProvenBoolean;
  interface_api_ready: ProvenBoolean;
  fiscal_printer_mapping_observed: ProvenBoolean;
  nfce_qrcode_v3_compatible: ProvenBoolean;
  sp_authorization_protocol_17_compatible: ProvenBoolean;
}

export interface NativeNfcePlan {
  schema: "deliveryos.native-nfce-after-production-plan.v1";
  order_identity: {
    teknisa_sequence: string;
    ifood_sequence: string;
    tata_sequence: string;
  };
  ordering: {
    policy: "PRODUCTION_DISPATCH_THEN_NATIVE_FISCAL_REQUEST";
    correlation_key: string;
    tata_sequence_is_operational_not_fiscal_number: true;
    physical_print_confirmation_required: false;
    production_dispatch_barrier:
      | "NO_PRODUCTION_TICKETS"
      | "PRODUCTION_DISPATCH_OBSERVED"
      | "BLOCKED";
  };
  ready_for_native_nfce_request_candidate: boolean;
  blocking_reasons: string[];
  provider_policy: {
    preferred_provider: "TEKNISA_ODHEN_NATIVE_NFCE";
    custom_sefaz_emitter_selected: false;
    tax_xml_generated_by_deliveryos: false;
    tax_calculation_owned_by_deliveryos: false;
  };
  effect_boundary: {
    fiscal_action: false;
    sefaz_submission: false;
    danfe_print: false;
    odhen_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function provenTrue(
  input: ProvenBoolean,
  blocker: string,
  blocking: Set<string>,
): void {
  if (!input.value) {
    blocking.add(blocker);
    return;
  }
  if (
    input.evidence !== "HUMAN_CONFIRMED_RULE" &&
    input.evidence !== "REAL_OBSERVED"
  ) {
    blocking.add(`${blocker}_EVIDENCE_REQUIRED`);
  }
  if (!clean(input.source_ref)) {
    blocking.add(`${blocker}_SOURCE_REF_REQUIRED`);
  }
}

function productionDispatchBarrier(
  production: readonly ProductionDispatchEvidence[],
  blocking: Set<string>,
): NativeNfcePlan["ordering"]["production_dispatch_barrier"] {
  if (production.length === 0) return "NO_PRODUCTION_TICKETS";

  for (const item of production) {
    if (!clean(item.intent_fingerprint) || !clean(item.printer_code)) {
      blocking.add("INVALID_PRODUCTION_DISPATCH_IDENTITY");
      continue;
    }

    if (
      item.state !== "SPOOLER_OBSERVED" &&
      item.state !== "PHYSICALLY_CONFIRMED"
    ) {
      blocking.add(
        `PRODUCTION_DISPATCH_NOT_OBSERVED:${item.printer_code}`,
      );
    }
  }

  return [...blocking].some((reason) =>
    reason.startsWith("PRODUCTION_DISPATCH_") ||
    reason === "INVALID_PRODUCTION_DISPATCH_IDENTITY",
  )
    ? "BLOCKED"
    : "PRODUCTION_DISPATCH_OBSERVED";
}

/**
 * Zero-effect orchestration candidate.
 *
 * This planner does not emit NFC-e, construct fiscal XML, submit to SEFAZ or
 * print DANFE. It only represents César's preferred operational ordering:
 * production dispatch first, native Teknisa/Odhen fiscal request afterwards.
 *
 * Activation remains blocked until the real Teknisa fiscal trigger/timing is
 * observed and proven compatible with that ordering.
 */
export function planNativeNfceAfterProduction(input: {
  teknisa_sequence: string;
  ifood_sequence: string;
  tata_sequence: string;
  production: readonly ProductionDispatchEvidence[];
  readiness: NativeNfceReadiness;
}): NativeNfcePlan {
  const blocking = new Set<string>();
  // Circuit breaker: the old "production dispatch then request NFC-e" policy was
  // superseded by observation-first reconciliation of the native Teknisa/Odhen
  // fiscal state. Keep this planner callable for compatibility, but never ready.
  blocking.add("LEGACY_AFTER_PRODUCTION_POLICY_SUPERSEDED");

  const teknisa = clean(input.teknisa_sequence);
  const ifood = clean(input.ifood_sequence);
  const tata = clean(input.tata_sequence);

  if (!teknisa) blocking.add("TEKNISA_SEQUENCE_REQUIRED");
  if (!ifood) blocking.add("IFOOD_SEQUENCE_REQUIRED");
  if (!tata) blocking.add("TATA_SEQUENCE_REQUIRED");

  const barrier = productionDispatchBarrier(input.production, blocking);

  provenTrue(
    input.readiness.native_teknisa_nfce_path,
    "NATIVE_TEKNISA_NFCE_PATH_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.sales_channel_eligible_for_native_nfce,
    "SALES_CHANNEL_NATIVE_NFCE_ELIGIBILITY_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.fiscal_trigger_ready,
    "FISCAL_TRIGGER_NOT_READY",
    blocking,
  );
  provenTrue(
    input.readiness.fiscal_timing_compatible_with_after_production_dispatch,
    "FISCAL_TIMING_COMPATIBILITY_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.nfce_cash_register_configured,
    "NFCE_CASH_REGISTER_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.nfce_cash_register_open,
    "NFCE_CASH_REGISTER_NOT_OPEN",
    blocking,
  );
  provenTrue(
    input.readiness.interface_api_ready,
    "TEKNISA_INTERFACE_API_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.fiscal_printer_mapping_observed,
    "FISCAL_PRINTER_MAPPING_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.nfce_qrcode_v3_compatible,
    "NFCE_QRCODE_V3_COMPATIBILITY_NOT_PROVEN",
    blocking,
  );
  provenTrue(
    input.readiness.sp_authorization_protocol_17_compatible,
    "SP_AUTHORIZATION_PROTOCOL_17_COMPATIBILITY_NOT_PROVEN",
    blocking,
  );

  return {
    schema: "deliveryos.native-nfce-after-production-plan.v1",
    order_identity: {
      teknisa_sequence: teknisa,
      ifood_sequence: ifood,
      tata_sequence: tata,
    },
    ordering: {
      policy: "PRODUCTION_DISPATCH_THEN_NATIVE_FISCAL_REQUEST",
      correlation_key: tata,
      tata_sequence_is_operational_not_fiscal_number: true,
      physical_print_confirmation_required: false,
      production_dispatch_barrier: barrier,
    },
    ready_for_native_nfce_request_candidate: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    provider_policy: {
      preferred_provider: "TEKNISA_ODHEN_NATIVE_NFCE",
      custom_sefaz_emitter_selected: false,
      tax_xml_generated_by_deliveryos: false,
      tax_calculation_owned_by_deliveryos: false,
    },
    effect_boundary: {
      fiscal_action: false,
      sefaz_submission: false,
      danfe_print: false,
      odhen_write: false,
    },
  };
}
