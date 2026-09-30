/** Consulta a plataforma para atestar um Bearer de aparelho. */

export interface DeviceIdentity {
  device_id: string;
  unit_id: string;
  actor_id: string | null;
}

export type DeviceIdentityResult =
  | { ok: true; identity: DeviceIdentity }
  | {
      ok: false;
      kind: "renew" | "terminal" | "unavailable";
      status: number;
      human: string;
    };

export interface DeviceIdentityClientOptions {
  platformBaseUrl: string;
  authorization: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function consultarIdentidadeDoAparelho(
  o: DeviceIdentityClientOptions,
): Promise<DeviceIdentityResult> {
  const base = o.platformBaseUrl.trim().replace(/\/$/, "");
  if (!base) return { ok: false, kind: "unavailable", status: 503, human: "plataforma não configurada" };
  if (!o.authorization?.trim()) return { ok: false, kind: "renew", status: 401, human: "credencial ausente" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 2_000);
  try {
    const r = await (o.fetchImpl ?? fetch)(`${base}/api/device/identity`, {
      method: "GET",
      headers: {
        Authorization: o.authorization,
        "X-Entregas-Client": "pilot-capture-control@1.0.0",
      },
      signal: controller.signal,
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;

    if (r.status === 200) {
      const device_id = typeof body.device_id === "string" ? body.device_id : "";
      const unit_id = typeof body.unit_id === "string" ? body.unit_id : "";
      const actor_id = typeof body.actor_id === "string" ? body.actor_id : null;
      if (!device_id || !unit_id) {
        return { ok: false, kind: "unavailable", status: 503, human: "identidade incompleta" };
      }
      return { ok: true, identity: { device_id, unit_id, actor_id } };
    }

    const instrucao = typeof body.instrucao === "string" ? body.instrucao : "";
    const human = typeof body.humano === "string" ? body.humano : "credencial recusada";
    if (r.status === 401 || instrucao === "renovar_e_repetir") {
      return { ok: false, kind: "renew", status: 401, human };
    }
    // 403 isolado pode vir de proxy/WAF. Só a instrução assinada pelo contrato
    // da plataforma prova revogação terminal.
    if (instrucao === "parar_e_avisar") {
      return { ok: false, kind: "terminal", status: 403, human };
    }
    return {
      ok: false,
      kind: "unavailable",
      status: r.status,
      human: "não foi possível validar o aparelho agora",
    };
  } catch {
    return {
      ok: false,
      kind: "unavailable",
      status: 503,
      human: "não foi possível validar o aparelho agora",
    };
  } finally {
    clearTimeout(timer);
  }
}
