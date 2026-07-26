'use strict';

const { validateCapabilityRequest } = require('./contracts');
const { loadCanonicalCatalogs } = require('./catalogs');
const { assertFeature } = require('./feature-flags');

class CapabilityRouter {
  constructor(options = {}) {
    this.flags = options.flags; this.registry = options.registry; this.store = options.store; this.clock = options.clock;
    const catalogs = options.catalogs || loadCanonicalCatalogs();
    this.capabilities = new Map(catalogs.capabilities.capabilities.map((item) => [item.id, item]));
  }
  route(rawRequest) {
    assertFeature(this.flags, 'deliveryosCapabilityRouterV1');
    assertFeature(this.flags, 'simulatedDriversV1');
    const request = validateCapabilityRequest(rawRequest);
    const capability = this.capabilities.get(request.capability_id);
    if (!capability) return Object.freeze({ status: 'unavailable', reason: 'capability_unknown', request, driver: null, capability: null });
    if (capability.authority === 'A4' || capability.current_state === 'prohibited') return Object.freeze({ status: 'prohibited', reason: 'capability_prohibited', request, driver: null, capability });
    const candidates = this.registry.candidates(request.capability_id).filter((driver) => driver.manifest.availability === 'available' && driver.manifest.health !== 'unavailable');
    const driver = candidates[0] || null;
    const decision = { request_id: request.request_id, capability_id: request.capability_id, candidate_driver_ids: candidates.map((item) => item.manifest.id), selected_driver_id: driver?.manifest.id || null, mode: driver ? 'simulated' : 'disabled', reason: driver ? 'deterministic_first_healthy_simulated' : 'no_eligible_driver', synthetic: true };
    this.store.append({ event_id: `route_${request.request_id}`, idempotency_key: `route:${request.idempotency_key}`, type: 'capability_router.decision', occurred_at: this.clock.iso(), payload: decision });
    return Object.freeze({ status: driver ? 'available' : 'unavailable', reason: decision.reason, request, driver, capability, decision });
  }
}

module.exports = { CapabilityRouter };

