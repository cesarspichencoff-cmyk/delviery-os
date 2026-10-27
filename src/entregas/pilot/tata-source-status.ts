import { isAbsolute, join } from "node:path";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

/** Metadata only. Does not grant order publication, source mode or human identity. */
export function criarLeitorStatusTata(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  const root = env.ENTREGAS_TATA_READER_ROOT?.trim();
  const bindingPath = env.ENTREGAS_TATA_BINDING_PATH?.trim();
  if (Boolean(root) !== Boolean(bindingPath) ||
      (root && (!isAbsolute(root) || !isAbsolute(bindingPath!)))) {
    throw Error("TATA_SOURCE_STATUS_CONFIG_INVALID");
  }
  const enabled = Boolean(root && bindingPath);
  let cached: unknown;
  let expires = 0;
  return { enabled, read: (): unknown => {
    const base = { schema: "deliveryos.copiloto-source-status.v1", unitId: "ITAIM",
      scope: "source_diagnostic_only", ordersEnabled: false,
      operationalOrderTotal: null, noActionExecuted: true };
    if (!enabled) return { ...base, state: "not_configured" };
    if (cached && Date.now() < expires) return cached;
    try {
      // Fixed, versioned implementation; neither request paths nor query select files.
      const { previewTataSource } = require(join(appRoot, "tools/windows-local-lab/tata-source-preview.cjs"));
      const binding = JSON.parse(readFileSync(bindingPath!, "utf8"));
      const preview = previewTataSource({ root, binding, hostName: hostname(), limit: 20 });
      cached = { ...base, state: preview.state, preview };
    } catch {
      // No exception messages, local paths or payload fragments in the public response.
      cached = { ...base, state: "unavailable" };
    }
    expires = Date.now() + 5000;
    return cached;
  }};
}
