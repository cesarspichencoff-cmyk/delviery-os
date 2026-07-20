import { ENTREGAS_MODULE_MANIFEST } from "../contracts/module-manifest";
import {
  buildIntegrationHealth,
  type EntregasIntegrationHealth,
  type IntegrationConsumerState,
} from "../contracts/health";
import {
  computePublicSchemasHash,
  PUBLIC_CATALOG_VERSION,
} from "../contracts/events/freeze-manifest";
import { PUBLIC_EVENTS_SCHEMA_VERSION } from "../contracts/events/types";
import type { InMemoryTransactionalOutbox } from "./outbox";

export function healthFromOutbox(
  outbox: InMemoryTransactionalOutbox,
  consumer_state: IntegrationConsumerState = "simulated",
  now?: string,
): EntregasIntegrationHealth {
  const all = outbox.all();
  const pending = all.filter((r) => r.status === "pending");
  const failed = all.filter((r) => r.status === "failed");
  const dead = all.filter((r) => r.status === "dead_letter");
  const published = all.filter((r) => r.status === "published");
  const lastPub = published[published.length - 1];

  const retriable = [...pending, ...failed];
  let oldest: string | null = null;
  for (const r of retriable) {
    if (!oldest || r.event.occurred_at < oldest) oldest = r.event.occurred_at;
  }

  const lastFailed = [...all].reverse().find((r) => r.last_error);

  return buildIntegrationHealth({
    producer_version: ENTREGAS_MODULE_MANIFEST.version,
    catalog_version: PUBLIC_CATALOG_VERSION,
    schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
    schemas_hash: computePublicSchemasHash(),
    last_published_event_id: lastPub?.event.event_id ?? null,
    last_published_event_type: lastPub?.event.event_type ?? null,
    last_published_at: lastPub?.published_at ?? null,
    outbox_pending_count: pending.length,
    outbox_failed_count: failed.length,
    outbox_dead_letter_count: dead.length,
    last_error: lastFailed?.last_error ?? null,
    last_error_at: lastFailed?.last_attempt_at ?? null,
    consumer_state,
    oldest_pending_occurred_at: oldest,
    now,
  });
}
