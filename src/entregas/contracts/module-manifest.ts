/**
 * Manifesto de módulo ENTREGAS — registro futuro no shell.
 * NÃO integrar ao shell principal nesta fase.
 */

export const ENTREGAS_MODULE_MANIFEST = {
  id: "entregas",
  name: "Entregas",
  version: "0.1.0-foundation",
  display_name: "Entregas",
  description:
    "Logística de entregas próprias e Expedição iFood (Handoff). Emite fatos para o DeliveryOS Copiloto.",
  route_future: "/entregas",
  availability: "foundation_only" as const,
  enabled_in_shell: false,
  capabilities: [
    "trip.own_delivery",
    "handoff.ifood_expedition",
    "occurrence.lifecycle",
    "events.public_feed",
    "events.outbox",
  ],
  permissions_required: [
    "entregas.trip.read",
    "entregas.trip.write",
    "entregas.handoff.write",
    "entregas.occurrence.write",
    "entregas.events.read",
  ],
  health_check: {
    path_future: "/api/entregas/health",
    checks: ["domain", "outbox", "event_feed"],
  },
  public_contracts: [
    {
      id: "entregas.public.events",
      schema_version: "1.0.0",
      path: "src/entregas/contracts/events/",
    },
    {
      id: "entregas.event_feed",
      interface: "EntregasEventFeed",
    },
    {
      id: "entregas.operational_adapter",
      interface: "EntregasOperationalEventAdapter",
    },
  ],
  feature_flags: {
    "entregas.public_events_publish": true,
    "entregas.shell_integration": false,
    "entregas.copiloto_live_connection": false,
    "entregas.gps_production": false,
    "entregas.auto_assignment": false,
  },
  boundaries: {
    must_not_import: [
      "capacidade-viva",
      "copiloto",
      "calmo",
      "ambiente",
      "foco",
      "cv-cal-tata-human-v2",
    ],
    copiloto_must_not_import: [
      "src/entregas/foundation",
      "internal_tables",
      "entregas_ui",
    ],
  },
  contract_domain: "COR-ENTREGAS-V1@1.0.3",
} as const;

export type EntregasModuleManifest = typeof ENTREGAS_MODULE_MANIFEST;

export function validateModuleManifest(
  m: typeof ENTREGAS_MODULE_MANIFEST,
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (m.id !== "entregas") issues.push("id deve ser entregas");
  if (!m.version) issues.push("version obrigatória");
  if (m.enabled_in_shell !== false) {
    issues.push("enabled_in_shell deve ser false nesta fase");
  }
  if (m.feature_flags["entregas.copiloto_live_connection"] !== false) {
    issues.push("copiloto_live_connection deve estar false");
  }
  if (m.feature_flags["entregas.shell_integration"] !== false) {
    issues.push("shell_integration deve estar false");
  }
  if (!m.public_contracts.length) issues.push("public_contracts vazio");
  if (issues.length) return { ok: false, issues };
  return { ok: true };
}
