export type NativeFiscalReconciliationState =
  | "WAIT_NATIVE_SALE"
  | "AUTHORIZED_RECONCILED"
  | "NATIVE_CONTINGENCY_REPORTED"
  | "ERROR_REQUIRES_OPERATOR"
  | "AMBIGUOUS_RECONCILIATION_REQUIRED";

export interface NativeFiscalObservation {
  order_id: string;
  sale_exists: boolean;
  nfce_status: string | null;
  protocol: string | null;
  qr_present: boolean;
  danfe_print_observed?: boolean;
  native_error?: string | null;
}

export interface NativeFiscalPolicy {
  expected_protocol_length: number;
  authorized_status: string;
  contingency_status: string;
}

export interface NativeFiscalReconciliationDecision {
  schema: "deliveryos.native-fiscal-reconciliation.v1";
  order_id: string;
  state: NativeFiscalReconciliationState;
  blocking_reasons: string[];
  observed: {
    sale_exists: boolean;
    nfce_status: string | null;
    protocol_present: boolean;
    protocol_length: number | null;
    qr_present: boolean;
    danfe_print_observed: boolean;
    native_error_present: boolean;
  };
  next_action:
    | "OBSERVE_NATIVE_STATE"
    | "NO_FISCAL_ACTION"
    | "RECONCILE_BEFORE_ANY_EFFECT"
    | "OPERATOR_REVIEW";
  policy: {
    blind_retry_forbidden: true;
    authorized_is_not_danfe_printed: true;
    reprint_requires_separate_effect_gate: true;
    custom_sefaz_emitter_forbidden: true;
  };
  effects: {
    fiscal_action: false;
    sefaz_call: false;
    danfe_print: false;
    reprint: false;
    database_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export const DEFAULT_SP_NFCE_POLICY_2026_10_05: NativeFiscalPolicy = {
  expected_protocol_length: 17,
  authorized_status: "A",
  contingency_status: "P",
};

export function reconcileNativeFiscalState(
  observation: NativeFiscalObservation,
  policy: NativeFiscalPolicy = DEFAULT_SP_NFCE_POLICY_2026_10_05,
): NativeFiscalReconciliationDecision {
  const orderId = clean(observation.order_id);
  if (!orderId) throw new Error("ORDER_ID_REQUIRED");

  const status = clean(observation.nfce_status).toUpperCase() || null;
  const protocol = clean(observation.protocol) || null;
  const nativeError = clean(observation.native_error) || null;
  const protocolLength = protocol ? protocol.length : null;
  const observed = {
    sale_exists: Boolean(observation.sale_exists),
    nfce_status: status,
    protocol_present: protocol !== null,
    protocol_length: protocolLength,
    qr_present: Boolean(observation.qr_present),
    danfe_print_observed: Boolean(observation.danfe_print_observed),
    native_error_present: nativeError !== null,
  };

  const base = {
    schema: "deliveryos.native-fiscal-reconciliation.v1" as const,
    order_id: orderId,
    observed,
    policy: {
      blind_retry_forbidden: true as const,
      authorized_is_not_danfe_printed: true as const,
      reprint_requires_separate_effect_gate: true as const,
      custom_sefaz_emitter_forbidden: true as const,
    },
    effects: {
      fiscal_action: false as const,
      sefaz_call: false as const,
      danfe_print: false as const,
      reprint: false as const,
      database_write: false as const,
    },
  };

  if (nativeError) {
    return {
      ...base,
      state: "ERROR_REQUIRES_OPERATOR",
      blocking_reasons: ["NATIVE_FISCAL_ERROR_PRESENT"],
      next_action: "OPERATOR_REVIEW",
    };
  }

  if (!observation.sale_exists) {
    if (status || protocol || observation.qr_present) {
      return {
        ...base,
        state: "AMBIGUOUS_RECONCILIATION_REQUIRED",
        blocking_reasons: ["FISCAL_ARTIFACT_WITHOUT_NATIVE_SALE"],
        next_action: "RECONCILE_BEFORE_ANY_EFFECT",
      };
    }
    return {
      ...base,
      state: "WAIT_NATIVE_SALE",
      blocking_reasons: [],
      next_action: "OBSERVE_NATIVE_STATE",
    };
  }

  if (status === policy.contingency_status) {
    return {
      ...base,
      state: "NATIVE_CONTINGENCY_REPORTED",
      blocking_reasons: ["NATIVE_CONTINGENCY_REQUIRES_RECONCILIATION"],
      next_action: "RECONCILE_BEFORE_ANY_EFFECT",
    };
  }

  if (status === policy.authorized_status) {
    const blockers: string[] = [];
    if (!protocol) blockers.push("AUTHORIZED_PROTOCOL_MISSING");
    if (protocol && protocol.length !== policy.expected_protocol_length) {
      blockers.push(`AUTHORIZED_PROTOCOL_LENGTH_UNEXPECTED:${protocol.length}`);
    }
    if (!observation.qr_present) blockers.push("AUTHORIZED_QR_DATA_MISSING");

    if (blockers.length > 0) {
      return {
        ...base,
        state: "AMBIGUOUS_RECONCILIATION_REQUIRED",
        blocking_reasons: blockers.sort(),
        next_action: "RECONCILE_BEFORE_ANY_EFFECT",
      };
    }

    return {
      ...base,
      state: "AUTHORIZED_RECONCILED",
      blocking_reasons: [],
      next_action: "NO_FISCAL_ACTION",
    };
  }

  if (!status) {
    return {
      ...base,
      state: "AMBIGUOUS_RECONCILIATION_REQUIRED",
      blocking_reasons: ["NATIVE_SALE_EXISTS_WITHOUT_NFCE_STATUS"],
      next_action: "RECONCILE_BEFORE_ANY_EFFECT",
    };
  }

  return {
    ...base,
    state: "ERROR_REQUIRES_OPERATOR",
    blocking_reasons: [`UNRECOGNIZED_NATIVE_NFCE_STATUS:${status}`],
    next_action: "OPERATOR_REVIEW",
  };
}
