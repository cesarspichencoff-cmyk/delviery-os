'use strict';

const { NativeConversationEngine } = require('./engine');
const { loadRuntimeCatalogs, validateOperationalCatalogs } = require('./catalogs/operational');

function createRuntimeConversationEngine(options = {}) {
  const operationalCatalog = options.operationalCatalog || loadRuntimeCatalogs();
  validateOperationalCatalogs(operationalCatalog);
  return new NativeConversationEngine({
    flags: options.flags,
    catalogs: operationalCatalog
  });
}

module.exports = { createRuntimeConversationEngine };
