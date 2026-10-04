/**
 * Product System — gate de ação humana.
 *
 * Isto NÃO executa ação. Ele só responde se uma intenção humana teria identidade,
 * escopo e permissão suficientes para chegar à próxima fronteira.
 *
 * CAN DO != AUTHORIZED != EXECUTED.
 */

export type HumanActionKind =
  | "dismiss_recommendation"
  | "accept_for_future";

export type HumanActionPermission =
  | "copilot.recommendation.dismiss"
  | "copilot.recommendation.accept_future";

export interface HumanActor {
  readonly actor_id: string;
  readonly auth_context_id: string;
  readonly authenticated_at: string;
  readonly expires_at: string;
  readonly unit_ids: readonly string[];
  readonly permissions: readonly HumanActionPermission[];
}

export interface HumanActionSubject {
  readonly recommendation_id: string;
  readonly unit_id: string;
  readonly source_mode: "real" | "simulated" | "control";
  readonly status:
    | "proposed"
    | "expired"
    | "dismissed"
    | "accepted_for_future"
    | "invalidated";
  readonly requires_human: boolean;
  readonly expires_at: string;
}

export interface HumanActionEnvironment {
  readonly executor_connected: boolean;
  readonly audit_sink_connected: boolean;
}

export type HumanActionBlockReason =
  | "identity_missing"
  | "identity_invalid"
  | "session_expired"
  | "unit_scope_missing"
  | "permission_missing"
  | "non_real_source"
  | "recommendation_not_active"
  | "recommendation_expired"
  | "human_decision_not_required"
  | "executor_not_connected"
  | "audit_sink_not_connected";

export interface HumanActionGateResult {
  readonly kind: HumanActionKind;
  readonly recommendation_id: string;
  readonly identity_proven: boolean;
  readonly permission_granted: boolean;
  readonly unit_scope_granted: boolean;
  readonly eligible_to_request: boolean;
  readonly execution_ready: boolean;
  readonly reasons: readonly HumanActionBlockReason[];
  readonly required_permission: HumanActionPermission;
  readonly actor_id: string | null;
  readonly auth_context_id: string | null;
}

const PERMISSION_BY_ACTION: Readonly<Record<HumanActionKind, HumanActionPermission>> = {
  dismiss_recommendation: "copilot.recommendation.dismiss",
  accept_for_future: "copilot.recommendation.accept_future",
};

function isoValido(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function idValido(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/.test(value);
}

export function evaluateHumanActionGate(args: {
  readonly kind: HumanActionKind;
  readonly subject: HumanActionSubject;
  readonly actor: HumanActor | null;
  readonly environment: HumanActionEnvironment;
  readonly now: Date;
}): HumanActionGateResult {
  const { kind, subject, actor, environment, now } = args;
  const required = PERMISSION_BY_ACTION[kind];
  const reasons: HumanActionBlockReason[] = [];

  let identity_proven = false;
  let permission_granted = false;
  let unit_scope_granted = false;

  if (!actor) {
    reasons.push("identity_missing");
  } else if (
    !idValido(actor.actor_id) ||
    !idValido(actor.auth_context_id) ||
    !isoValido(actor.authenticated_at) ||
    !isoValido(actor.expires_at)
  ) {
    reasons.push("identity_invalid");
  } else {
    identity_proven = true;
    if (Date.parse(actor.expires_at) <= now.getTime()) reasons.push("session_expired");
    unit_scope_granted = actor.unit_ids.includes(subject.unit_id);
    if (!unit_scope_granted) reasons.push("unit_scope_missing");
    permission_granted = actor.permissions.includes(required);
    if (!permission_granted) reasons.push("permission_missing");
  }

  if (subject.source_mode !== "real") reasons.push("non_real_source");
  if (subject.status !== "proposed") reasons.push("recommendation_not_active");
  if (!subject.requires_human) reasons.push("human_decision_not_required");

  const expires = Date.parse(subject.expires_at);
  if (!Number.isFinite(expires) || expires <= now.getTime()) {
    reasons.push("recommendation_expired");
  }

  const eligible_to_request =
    reasons.length === 0 &&
    identity_proven &&
    permission_granted &&
    unit_scope_granted;

  if (!environment.executor_connected) reasons.push("executor_not_connected");
  if (!environment.audit_sink_connected) reasons.push("audit_sink_not_connected");

  const execution_ready =
    eligible_to_request &&
    environment.executor_connected &&
    environment.audit_sink_connected;

  return {
    kind,
    recommendation_id: subject.recommendation_id,
    identity_proven,
    permission_granted,
    unit_scope_granted,
    eligible_to_request,
    execution_ready,
    reasons: [...new Set(reasons)],
    required_permission: required,
    actor_id: identity_proven ? actor!.actor_id : null,
    auth_context_id: identity_proven ? actor!.auth_context_id : null,
  };
}

export function productSystemHumanActionBoundary(
  kind: HumanActionKind,
  subject: HumanActionSubject,
  now: Date,
): HumanActionGateResult {
  return evaluateHumanActionGate({
    kind,
    subject,
    actor: null,
    environment: {
      executor_connected: false,
      audit_sink_connected: false,
    },
    now,
  });
}
