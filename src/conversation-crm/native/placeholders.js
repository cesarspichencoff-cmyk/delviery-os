'use strict';

const { loadRuntimeCatalogs, validateOperationalCatalogs, deepFreeze } = require('./catalogs/operational');
const { nativeError } = require('./errors');

const QUESTIONNAIRE_ORDER = Object.freeze([
  '{{TATA_UNITS}}','{{ANIMO_SYSTEM_IDENTITY}}','{{STORE_UNIT_CONFIG}}','{{TATA_OPENING_HOURS}}','{{HUMAN_SERVICE_HOURS}}','{{TATA_ADDRESS}}','{{HUMAN_SERVICE_CHANNEL}}','{{TATA_MENU_URL}}','{{PAYMENT_METHODS}}','{{GETIN_RESERVATION_URL}}','{{RESERVATION_POLICY}}','{{GETIN_INTEGRATION_CONFIG}}','{{GETIN_WAITLIST_URL}}','{{WAITLIST_POLICY}}','{{LARGE_GROUP_POLICY}}','{{DELIVERY_URL}}','{{IFOOD_MERCHANT_CONFIG}}','{{CORKAGE_FEE}}','{{OPERATIONAL_RESPONSE_TARGET}}','{{COMMERCIAL_OPERATIONAL_RESPONSE_TARGET}}','{{MANAGEMENT_RESPONSE_TARGET}}','{{FOOD_SAFETY_RESPONSE_TARGET}}','{{PRIVACY_RESPONSE_TARGET}}','{{COMPENSATION_POLICY}}','{{REFUND_POLICY}}','{{REPLACEMENT_POLICY}}','{{LOCAL_HEALTH_SURVEILLANCE_CONTACT}}','{{FOOD_SAFETY_TECHNICAL_OWNER}}','{{HUMAN_HANDOFF_OWNERS}}','{{WHATSAPP_PROVIDER_CONFIG}}','{{NOTIFICATION_POLICY}}','{{PRIVACY_NOTICE_URL}}','{{DATA_SUBJECT_CHANNEL}}','{{EVIDENCE_RETENTION_POLICY}}','{{ODHEN_TEKNISA_CONFIG}}','{{NEEMO_CONFIG}}','{{DELIVERYOS_DRIVER_FLAGS}}','{{DELIVERYOS_LOCAL_SERVICE_ENDPOINTS}}','{{DRIVER_READ_MODE}}','{{DRIVER_WRITE_MODE}}','{{DRIVER_TIMEOUT_MS}}','{{DRIVER_RETRY_POLICY}}','{{DRIVER_CIRCUIT_BREAKER}}','{{DRIVER_HEALTH_CHECK}}','{{IDEMPOTENCY_RETENTION_POLICY}}','{{CONVERSATION_NATIVE_FEATURE_FLAGS}}','{{SIMULATED_DRIVER_CONFIG}}'
]);
const CLASSIFICATIONS = deepFreeze({
  CONFIRMADO: ['{{TATA_OPENING_HOURS}}','{{TATA_ADDRESS}}','{{TATA_MENU_URL}}','{{PAYMENT_METHODS}}','{{GETIN_RESERVATION_URL}}','{{GETIN_WAITLIST_URL}}','{{DELIVERY_URL}}','{{CORKAGE_FEE}}','{{LARGE_GROUP_POLICY}}','{{SIMULATED_DRIVER_CONFIG}}'],
  CONFIRMADO_COM_RESSALVA: ['{{TATA_UNITS}}','{{STORE_UNIT_CONFIG}}','{{RESERVATION_POLICY}}','{{WAITLIST_POLICY}}','{{REFUND_POLICY}}','{{NOTIFICATION_POLICY}}','{{HUMAN_SERVICE_CHANNEL}}','{{COMPENSATION_POLICY}}','{{FOOD_SAFETY_TECHNICAL_OWNER}}'],
  CONFLITO: [],
  NAO_DEFINIDO: ['{{ANIMO_SYSTEM_IDENTITY}}','{{HUMAN_SERVICE_HOURS}}','{{OPERATIONAL_RESPONSE_TARGET}}','{{COMMERCIAL_OPERATIONAL_RESPONSE_TARGET}}','{{MANAGEMENT_RESPONSE_TARGET}}','{{FOOD_SAFETY_RESPONSE_TARGET}}','{{PRIVACY_RESPONSE_TARGET}}','{{REPLACEMENT_POLICY}}','{{LOCAL_HEALTH_SURVEILLANCE_CONTACT}}','{{HUMAN_HANDOFF_OWNERS}}','{{PRIVACY_NOTICE_URL}}','{{DATA_SUBJECT_CHANNEL}}','{{EVIDENCE_RETENTION_POLICY}}'],
  TECNICO_RECOMENDADO: ['{{DELIVERYOS_DRIVER_FLAGS}}','{{DRIVER_READ_MODE}}','{{DRIVER_WRITE_MODE}}','{{DRIVER_TIMEOUT_MS}}','{{DRIVER_RETRY_POLICY}}','{{DRIVER_CIRCUIT_BREAKER}}','{{DRIVER_HEALTH_CHECK}}','{{IDEMPOTENCY_RETENTION_POLICY}}','{{CONVERSATION_NATIVE_FEATURE_FLAGS}}'],
  SENSIVEL_PRESENTE: ['{{GETIN_INTEGRATION_CONFIG}}','{{IFOOD_MERCHANT_CONFIG}}','{{WHATSAPP_PROVIDER_CONFIG}}','{{ODHEN_TEKNISA_CONFIG}}','{{NEEMO_CONFIG}}'],
  SENSIVEL_NAO_CONFIRMADO: ['{{DELIVERYOS_LOCAL_SERVICE_ENDPOINTS}}']
});

function resolvePublicReference(publicInfo, reference) {
  const prefix = 'TATA_OPERATIONAL_PUBLIC_INFO_V1.';
  if (typeof reference !== 'string' || !reference.startsWith(prefix)) throw nativeError('PLACEHOLDER_VALUE_REF_INVALID');
  let value = publicInfo;
  for (const part of reference.slice(prefix.length).split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) throw nativeError('PLACEHOLDER_VALUE_REF_INVALID');
    value = value[part];
  }
  return value;
}

function loadPlaceholderRegistry(catalogs = loadRuntimeCatalogs()) {
  validateOperationalCatalogs(catalogs);
  const sourceByKey = new Map(catalogs.placeholders.placeholders.map((item) => [item.key, item]));
  const classificationByKey = new Map();
  for (const [classification, keys] of Object.entries(CLASSIFICATIONS)) for (const key of keys) classificationByKey.set(key, classification);
  if (sourceByKey.size !== 47 || classificationByKey.size !== 47 || QUESTIONNAIRE_ORDER.length !== 47) throw nativeError('PLACEHOLDER_REGISTRY_INCOMPLETE');
  const records = QUESTIONNAIRE_ORDER.map((key, index) => {
    const item = sourceByKey.get(key);
    if (!item) throw nativeError('PLACEHOLDER_REGISTRY_INCOMPLETE');
    const publicValueAvailable = typeof item.value_ref === 'string';
    if (publicValueAvailable) resolvePublicReference(catalogs.publicInfo, item.value_ref);
    return deepFreeze({
      ...item,
      item_number: index + 1,
      preliminary_classification: classificationByKey.get(key),
      implementation_available: key === '{{SIMULATED_DRIVER_CONFIG}}' || publicValueAvailable,
      production_available: publicValueAvailable
    });
  });
  return deepFreeze({
    records,
    byKey: new Map(records.map((item) => [item.key, item])),
    publicInfo: catalogs.publicInfo,
    implementation_blockers_open: records.filter((item) => item.blocks_implementation && !item.implementation_available).length,
    production_blockers_open: records.filter((item) => item.blocks_production && !item.production_available).length
  });
}

function resolvePlaceholder(registry, key, fixture = null) {
  const record = registry.byKey.get(key);
  if (!record) throw nativeError('PLACEHOLDER_UNKNOWN');
  if (fixture?.synthetic === true) return deepFreeze({ status: 'synthetic_fixture', key, value: fixture, institutional_fact: false, classification: record.preliminary_classification });
  if (record.value_ref) return deepFreeze({
    status: record.preliminary_classification === 'CONFIRMADO' ? 'confirmed' : 'confirmed_with_caveat',
    key,
    value: resolvePublicReference(registry.publicInfo, record.value_ref),
    institutional_fact: true,
    classification: record.preliminary_classification,
    source: record.source,
    observed_at: record.observed_at
  });
  if (record.preliminary_classification === 'CONFLITO') return deepFreeze({ status: 'conflict', key, value: null, institutional_fact: false, classification: record.preliminary_classification });
  return deepFreeze({ status: 'unavailable', key, value: null, institutional_fact: false, classification: record.preliminary_classification });
}

module.exports = { QUESTIONNAIRE_ORDER, CLASSIFICATIONS, resolvePublicReference, loadPlaceholderRegistry, resolvePlaceholder };
