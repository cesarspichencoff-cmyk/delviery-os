'use strict';

const { validateCapabilityResult, validateDriverManifest } = require('../contracts');
const { nativeError } = require('../errors');

const OUTCOME_MAP = Object.freeze({
  healthy: 'confirmed', success: 'confirmed', processing: 'processing', unavailable: 'unavailable', degraded: 'degraded', conflict: 'conflict',
  unknown: 'unknown', timeout: 'failed', failed: 'failed', retryable_failure: 'failed', non_retryable_failure: 'failed', confirmation_lost: 'unknown',
  duplicate: 'confirmed', structural_change: 'degraded', session_expired: 'failed', recovered: 'confirmed', authorization_missing: 'requires_human',
  write_disabled: 'requires_human', human_required: 'requires_human', prohibited: 'prohibited'
});

class SimulatedDriver {
  constructor(options = {}) {
    this.manifest = validateDriverManifest(options.manifest);
    this.clock = options.clock;
    this.calls = [];
  }

  supports(capabilityId) { return this.manifest.capabilities.includes(capabilityId); }

  execute(request, simulation = {}) {
    if (!request.synthetic) throw nativeError('REAL_DATA_NOT_ALLOWED');
    if (!this.supports(request.capability_id)) throw nativeError('DRIVER_CAPABILITY_UNSUPPORTED');
    if (this.manifest.read_mode !== 'simulated' || this.manifest.write_mode !== 'simulated') throw nativeError('DRIVER_MODE_NOT_SIMULATED');
    const requested = simulation.status || OUTCOME_MAP[simulation.outcome] || 'unknown';
    let status = requested;
    if (this.manifest.health === 'unavailable') status = 'unavailable';
    if (this.manifest.health === 'degraded' && status === 'confirmed') status = 'degraded';
    const retryable = simulation.retryable === true || simulation.outcome === 'timeout' || simulation.outcome === 'retryable_failure';
    const result = validateCapabilityResult({
      synthetic: true, request_id: request.request_id, capability: request.capability_id, status, source: this.manifest.id,
      performed_at: this.clock.iso(), confidence: status === 'confirmed' ? 1 : (status === 'conflict' ? 0.4 : 0.6),
      freshness: { state: status === 'confirmed' ? 'current' : (status === 'degraded' ? 'stale' : 'unknown'), observed_at: this.clock.iso(), age_ms: 0 },
      evidence_id: null, retryable, payload: { synthetic: true, operation: request.capability_id, scenario_id: simulation.scenario_id || null, outcome: simulation.outcome || status },
      confirmation: status === 'confirmed' ? 'synthetic_confirmed' : 'not_confirmed'
    });
    this.calls.push(Object.freeze({ request_id: request.request_id, capability_id: request.capability_id, status }));
    return result;
  }
}

module.exports = { OUTCOME_MAP, SimulatedDriver };
