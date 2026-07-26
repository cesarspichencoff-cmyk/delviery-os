'use strict';

const operational = require('./operational');
const oracle = require('./oracle');

module.exports = {
  ...operational,
  ...oracle,
  readCatalog: operational.readOperationalCatalog
};
