'use strict';

module.exports = {
  ...require('./contracts'),
  ...require('./identity-resolver'),
  ...require('./store'),
  ...require('./consent'),
  ...require('./import-pipeline')
};

