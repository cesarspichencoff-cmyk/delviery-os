'use strict';

const { NativeConversationEngine } = require('../../../src/conversation-crm/native/engine');
const { validateOperationalCatalogs } = require('../../../src/conversation-crm/native/catalogs/operational');

function createTestConversationEngine(options = {}) {
  const operationalCatalog = validateOperationalCatalogs(options.operationalCatalog);
  return new NativeConversationEngine({
    flags: options.flags,
    catalogs: operationalCatalog
  });
}

module.exports = { createTestConversationEngine };
