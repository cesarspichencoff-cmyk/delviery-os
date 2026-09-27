/**
 * Mode-aware Attention Delivery Policy.
 *
 * No hidden thresholds, cooldowns or default urgency ranking.
 * Every positive "Precisa de mim?" reason must have an explicit policy entry
 * for the current mode before a delivery action can be proposed.
 *
 * This module proposes delivery only. It performs no notification effect.
 */
import type { ContextMode } from "./modeCompiler";
import type {
  NeedsMeProjection,
  NeedsMeReason,
  NeedsMeReasonKind,
} from "./needsMe";

export type DeliveryDisposition =
  | "SHOW_NOW"
  | "HOLD"
  | "SILENT_LOG"
  | "UNCONFIGURED";

export interface AttentionPolicyEntry {
  mode: Exclude<ContextMode, "UNKNOWN">;
  reason_kind: NeedsMeReasonKind;
  disposition: Exclude<DeliveryDisposition, "UNCONFIGURED">;
}

export interface ReasonDeliveryDecision {
  reason: NeedsMeReason;
  disposition: DeliveryDisposition;
  policy_matched: boolean;
}

export interface AttentionDeliveryPlan {
  mode: ContextMode;
  needs_me_state: NeedsMeProjection["state"];
  reason_decisions: ReasonDeliveryDecision[];
  fully_configured: boolean;
  effect_authorized: false;
}

export function buildAttentionDeliveryPlan(args: {
  needs_me: NeedsMeProjection;
  policy: readonly AttentionPolicyEntry[];
}): AttentionDeliveryPlan {
  if (args.needs_me.state !== "YES") {
    return {
      mode: args.needs_me.mode,
      needs_me_state: args.needs_me.state,
      reason_decisions: [],
      fully_configured: true,
      effect_authorized: false,
    };
  }

  if (args.needs_me.mode === "UNKNOWN") {
    return {
      mode: "UNKNOWN",
      needs_me_state: args.needs_me.state,
      reason_decisions: args.needs_me.reasons.map((reason) => ({
        reason,
        disposition: "UNCONFIGURED",
        policy_matched: false,
      })),
      fully_configured: false,
      effect_authorized: false,
    };
  }

  const decisions = args.needs_me.reasons.map((reason) => {
    const matches = args.policy.filter(
      (entry) =>
        entry.mode === args.needs_me.mode &&
        entry.reason_kind === reason.kind,
    );

    if (matches.length > 1) {
      const dispositions = new Set(matches.map((entry) => entry.disposition));
      if (dispositions.size > 1) {
        throw new Error("attention_policy_conflict");
      }
    }

    const match = matches[0];
    if (!match) {
      return {
        reason,
        disposition: "UNCONFIGURED" as const,
        policy_matched: false,
      };
    }

    return {
      reason,
      disposition: match.disposition,
      policy_matched: true,
    };
  });

  return {
    mode: args.needs_me.mode,
    needs_me_state: args.needs_me.state,
    reason_decisions: decisions,
    fully_configured: decisions.every((decision) => decision.policy_matched),
    effect_authorized: false,
  };
}
