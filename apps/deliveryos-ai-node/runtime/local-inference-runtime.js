'use strict';

class LocalInferenceRuntime {
  health() { throw new Error('NOT_IMPLEMENTED'); }
  start() { throw new Error('NOT_IMPLEMENTED'); }
  stop() { throw new Error('NOT_IMPLEMENTED'); }
  loadModel() { throw new Error('NOT_IMPLEMENTED'); }
  unloadModel() { throw new Error('NOT_IMPLEMENTED'); }
  generateStructured() { throw new Error('NOT_IMPLEMENTED'); }
  generateText() { throw new Error('NOT_IMPLEMENTED'); }
  cancel() { throw new Error('NOT_IMPLEMENTED'); }
  metrics() { throw new Error('NOT_IMPLEMENTED'); }
  shutdown() { throw new Error('NOT_IMPLEMENTED'); }
}

module.exports = { LocalInferenceRuntime };
