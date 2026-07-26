'use strict';

function nativeError(code, details = null) {
  const error = new Error(String(code || 'NATIVE_ERROR').toLowerCase());
  error.code = String(code || 'NATIVE_ERROR');
  if (details && typeof details === 'object') error.details = Object.freeze({ ...details });
  return error;
}

function safeError(error) {
  return Object.freeze({
    error_code: typeof error?.code === 'string' ? error.code : 'NATIVE_OPERATION_FAILED',
    retryable: error?.retryable === true
  });
}

module.exports = { nativeError, safeError };
