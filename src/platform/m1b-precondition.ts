export type M1bPrecondition =
  | { readonly kind: "ready"; readonly css: string }
  | { readonly kind: "unavailable" };

function networkCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    code?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  if (typeof value.code === "string") return value.code;
  if (Array.isArray(value.errors)) {
    for (const nested of value.errors) {
      const code = networkCode(nested);
      if (code) return code;
    }
  }
  return networkCode(value.cause);
}

function unavailable(error: unknown): boolean {
  const code = networkCode(error);
  if (
    code &&
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(code)
  ) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export async function loadM1bHomeCss(
  base: string,
  timeoutMs = 2_000,
): Promise<M1bPrecondition> {
  try {
    const response = await fetch(`${base}/surfaces/home.css`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `PRECONDICAO PRESENTE MAS INVALIDA: ${base}/surfaces/home.css respondeu HTTP ${response.status}`,
      );
    }
    return { kind: "ready", css: await response.text() };
  } catch (error) {
    if (!unavailable(error)) throw error;
    return { kind: "unavailable" };
  }
}
