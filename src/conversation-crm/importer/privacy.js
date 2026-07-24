'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

function assertAnonSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    const error = new Error('anon_secret_invalido');
    error.code = 'ANON_SECRET_INVALIDO';
    throw error;
  }
}

function token(secret, namespace, value, size = 24) {
  assertAnonSecret(secret);
  return `${namespace}_${crypto.createHmac('sha256', secret).update(`${namespace}\0${value}`).digest('hex').slice(0, size)}`;
}

function pathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertOutputOutsideRepository(outputPath, repositoryRoot) {
  if (pathInside(outputPath, repositoryRoot)) {
    const error = new Error('saida_dentro_repositorio');
    error.code = 'SAIDA_DENTRO_REPOSITORIO';
    throw error;
  }
}

function safeError(error) {
  const allowedCodes = new Set([
    'ANON_SECRET_INVALIDO',
    'SAIDA_DENTRO_REPOSITORIO',
    'ARQUIVO_ENTRADA_AUSENTE',
    'PLANILHA_INCOMPATIVEL',
    'COMANDO_INVALIDO',
    'ARGUMENTO_OBRIGATORIO_AUSENTE',
    'DEPENDENCIA_XLSX_INDISPONIVEL'
  ]);
  return {
    ok: false,
    error_code: allowedCodes.has(error?.code) ? error.code : 'FALHA_INTERNA_SANITIZADA'
  };
}

module.exports = {
  assertAnonSecret,
  token,
  pathInside,
  assertOutputOutsideRepository,
  safeError
};

