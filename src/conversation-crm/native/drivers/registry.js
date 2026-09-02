'use strict';

const { loadRuntimeCatalogs, validateOperationalCatalogs } = require('../catalogs/operational');
const { SimulatedDriver } = require('./simulated-driver');
const { nativeError } = require('../errors');

const DRIVER_GROUPS = Object.freeze([
  ['simulated-information-driver','information',(id) => id.startsWith('information.') || id === 'menu.read'],
  ['simulated-reservation-driver','reservation',(id) => id.startsWith('reservation.')],
  ['simulated-waitlist-driver','waitlist',(id) => id.startsWith('waitlist.')],
  ['simulated-order-driver','order',(id) => id.startsWith('order.') && !['order.print_state.read','order.production_state.read'].includes(id)],
  ['simulated-production-driver','production',(id) => id === 'order.print_state.read' || id === 'order.production_state.read'],
  ['simulated-courier-driver','courier',(id) => id.startsWith('delivery.') || id === 'courier.read'],
  ['simulated-crm-driver','crm',(id) => id.startsWith('occurrence.') || id.startsWith('evidence.') || id.startsWith('customer.') || id.startsWith('promise.')],
  ['simulated-human-queue-driver','human_queue',(id) => id.startsWith('human.queue.')],
  ['simulated-notification-driver','notification',(id) => id === 'notification.send'],
  ['simulated-food-safety-driver','food_safety',(id) => id === 'health.incident.create'],
  ['simulated-governance-driver','governance',(id) => id.startsWith('compensation.') || id.startsWith('review.') || id.startsWith('abuse.') || id.startsWith('legal.') || id.startsWith('medical.') || id.startsWith('external.')],
  ['simulated-system-driver','system',(id) => id === 'system.health.read']
]);

class DriverRegistry {
  constructor(options = {}) {
    this.clock = options.clock;
    this.drivers = [];
    this.byId = new Map();
  }
  register(driver) {
    if (this.byId.has(driver.manifest.id)) throw nativeError('DRIVER_DUPLICATE');
    this.drivers.push(driver); this.byId.set(driver.manifest.id, driver); return driver;
  }
  candidates(capabilityId) { return this.drivers.filter((driver) => driver.supports(capabilityId)).sort((a,b) => a.manifest.id.localeCompare(b.manifest.id)); }
  coverage() { return new Set(this.drivers.flatMap((driver) => driver.manifest.capabilities)); }
  manifests() { return this.drivers.map((driver) => driver.manifest); }
}

function createSimulatedDriverRegistry(options = {}) {
  const catalogs = validateOperationalCatalogs(options.catalogs || loadRuntimeCatalogs());
  const capabilityIds = catalogs.capabilities.capabilities.map((item) => item.id);
  const assigned = new Set();
  const registry = new DriverRegistry({ clock: options.clock });
  for (const [id,type,match] of DRIVER_GROUPS) {
    const capabilities = capabilityIds.filter((capabilityId) => match(capabilityId) && !assigned.has(capabilityId));
    if (!capabilities.length) continue;
    capabilities.forEach((capabilityId) => assigned.add(capabilityId));
    registry.register(new SimulatedDriver({ clock: options.clock, manifest: { synthetic: true, id, version: '1.0.0', type, capabilities, read_mode: 'simulated', write_mode: 'simulated', availability: 'available', health: 'healthy', reversible: true, confirmation_mechanism: 'deterministic_synthetic_event', timeout_ms: 500, retryable_operations: capabilities.filter((capabilityId) => capabilityId.endsWith('.read')), risk_class: type === 'governance' || type === 'food_safety' ? 'high' : 'controlled', input_schema: 'deliveryos-capability-request-v1', output_schema: 'deliveryos-capability-result-v1' } }));
  }
  const missing = capabilityIds.filter((id) => !assigned.has(id));
  if (missing.length) throw nativeError('DRIVER_CAPABILITY_COVERAGE_INCOMPLETE', { count: missing.length });
  return registry;
}

module.exports = { DRIVER_GROUPS, DriverRegistry, createSimulatedDriverRegistry };

