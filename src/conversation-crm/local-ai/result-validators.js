'use strict';

const { validateDirectorOutput } = require('../../../apps/deliveryos-ai-node/dialogue/director-contract');
const { validateWriterOutput } = require('../../../apps/deliveryos-ai-node/dialogue/writer-contract');

function createLocalAiResultValidators() {
  return Object.freeze({
    conversation_director: (output) => validateDirectorOutput(output),
    response_writer: (output, context = {}) => validateWriterOutput(output, context.job?.payload || {})
  });
}

module.exports = { createLocalAiResultValidators };

