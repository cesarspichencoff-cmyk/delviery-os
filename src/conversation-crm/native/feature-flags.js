'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveProjectRelative, PROJECT_ROOT } = require('../config');
const { nativeError } = require('./errors');
const { deepFreeze } = require('./catalogs');

const FLAG_NAMES = Object.freeze([
  'conversationNativeV1','conversationGatewayV1','conversationEngineV1','conversationCrmV1','deliveryosCapabilityRouterV1','deliveryosStateHubV1',
  'deliveryosActionExecutorV1','deliveryosEvidenceStoreV1','deliveryosHumanQueueV1','deliveryosNotificationEngineV1','simulatedDriversV1','realDriversReadV1','realDriversWriteV1'
]);
const DEFAULT_FLAGS = deepFreeze(Object.fromEntries(FLAG_NAMES.map((name) => [name, false])));

function validateFeatureFlags(raw) {
  if (!raw || raw.schema_version !== 'conversation-native-feature-flags-v1' || !['disabled','test'].includes(raw.environment) || !raw.flags) throw nativeError('FEATURE_FLAGS_INVALID');
  const keys = Object.keys(raw.flags).sort();
  if (keys.join('|') !== [...FLAG_NAMES].sort().join('|')) throw nativeError('FEATURE_FLAGS_INVALID');
  for (const name of FLAG_NAMES) if (typeof raw.flags[name] !== 'boolean') throw nativeError('FEATURE_FLAGS_INVALID');
  if (raw.flags.realDriversReadV1 || raw.flags.realDriversWriteV1) throw nativeError('REAL_DRIVER_FLAGS_PROHIBITED');
  const anyEnabled = FLAG_NAMES.some((name) => raw.flags[name]);
  if (anyEnabled && raw.environment !== 'test') throw nativeError('NATIVE_FLAGS_REQUIRE_TEST_ENVIRONMENT');
  if (anyEnabled && !raw.flags.simulatedDriversV1) throw nativeError('SIMULATED_DRIVER_FLAG_REQUIRED');
  return deepFreeze({ schema_version: raw.schema_version, environment: raw.environment, flags: { ...raw.flags } });
}

function loadFeatureFlags(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const selected = options.file || 'config/conversation-crm/native-flags.example.json';
  const file = resolveProjectRelative(selected, { projectRoot, label: 'native_flags_file' });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file.resolved, 'utf8')); } catch { throw nativeError('FEATURE_FLAGS_INVALID'); }
  return validateFeatureFlags(raw);
}

function assertFeature(flags, name) {
  if (!FLAG_NAMES.includes(name) || flags?.flags?.[name] !== true) throw nativeError('FEATURE_DISABLED', { feature: name });
}

module.exports = { FLAG_NAMES, DEFAULT_FLAGS, validateFeatureFlags, loadFeatureFlags, assertFeature };
