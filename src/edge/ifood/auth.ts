/**
 * iFood Portal authentication boundary for shadow mode.
 *
 * The OTP may exist transiently in memory but must never become an Edge event,
 * persisted payload, log field or learning input.
 */

export type PortalAuthState =
  | "AUTH_HEALTHY"
  | "AUTH_RECOVERING"
  | "AUTH_HUMAN_REQUIRED";

export type AuthReason =
  | "session_valid"
  | "session_expired"
  | "otp_requested"
  | "otp_received"
  | "otp_rejected"
  | "captcha_or_mfa"
  | "unexpected_flow";

export interface AuthMetadataEvent {
  event_id: string;
  at: string;
  state: PortalAuthState;
  reason: AuthReason;
  /** Metadata only. Never put OTP/token/cookie/password here. */
  detail?: string;
}

export interface AuthMessageCandidate {
  message_id: string;
  sender: string;
  subject: string;
  received_at: string;
  body_text: string;
}

export interface OtpPolicy {
  allowed_sender_suffixes: string[];
  subject_pattern: RegExp;
  code_pattern: RegExp;
  max_age_seconds: number;
}

export interface EphemeralOtp {
  /** Deliberately non-serializable by project convention. */
  readonly code: string;
  readonly message_id: string;
  readonly received_at: string;
}

const SECRET_KEYS = new Set([
  "otp",
  "otp_code",
  "auth_code",
  "verification_code",
  "login_code",
  "password",
  "senha",
  "token",
  "access_token",
  "refresh_token",
  "cookie",
  "authorization",
  "jwt",
  "secret",
]);

function isAuthSecretKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (SECRET_KEYS.has(normalized)) return true;
  return [
    "otp",
    "password",
    "senha",
    "token",
    "cookie",
    "authorization",
    "jwt",
    "secret",
  ].some((suffix) => normalized.endsWith(`_${suffix}`));
}

function testRegex(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0;
  return regex.test(value);
}

export function findEphemeralOtp(
  messages: readonly AuthMessageCandidate[],
  policy: OtpPolicy,
  now: Date,
): EphemeralOtp | null {
  const candidates = messages
    .filter((message) => senderAllowed(message.sender, policy.allowed_sender_suffixes))
    .filter((message) => testRegex(policy.subject_pattern, message.subject))
    .filter((message) => {
      const age = (now.getTime() - Date.parse(message.received_at)) / 1000;
      return Number.isFinite(age) && age >= 0 && age <= policy.max_age_seconds;
    })
    .sort((a, b) => b.received_at.localeCompare(a.received_at));

  for (const message of candidates) {
    // Reset stateful regexp before every execution.
    policy.code_pattern.lastIndex = 0;
    const match = policy.code_pattern.exec(message.body_text);
    const code = match?.[1] ?? match?.[0];
    if (code) {
      return Object.freeze({
        code,
        message_id: message.message_id,
        received_at: message.received_at,
      });
    }
  }

  return null;
}

export function authTransition(
  current: PortalAuthState,
  signal:
    | "SESSION_OK"
    | "SESSION_EXPIRED"
    | "OTP_REQUESTED"
    | "OTP_FOUND"
    | "OTP_REJECTED"
    | "HUMAN_CHALLENGE"
    | "UNEXPECTED",
): PortalAuthState {
  if (signal === "SESSION_OK") return "AUTH_HEALTHY";
  if (signal === "HUMAN_CHALLENGE" || signal === "UNEXPECTED") {
    return "AUTH_HUMAN_REQUIRED";
  }
  if (signal === "OTP_REJECTED") return "AUTH_HUMAN_REQUIRED";
  if (
    signal === "SESSION_EXPIRED" ||
    signal === "OTP_REQUESTED" ||
    signal === "OTP_FOUND"
  ) {
    return "AUTH_RECOVERING";
  }
  return current;
}

export function assertMetadataSafe(value: unknown, depth = 0): void {
  if (depth > 10 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertMetadataSafe(item, depth + 1);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isAuthSecretKey(key)) {
      throw new Error(`auth secret-like field forbidden in metadata: ${key}`);
    }
    assertMetadataSafe(nested, depth + 1);
  }
}

function senderAllowed(sender: string, suffixes: readonly string[]): boolean {
  const normalized = sender.trim().toLowerCase();
  return suffixes.some((suffix) => normalized.endsWith(suffix.toLowerCase()));
}
