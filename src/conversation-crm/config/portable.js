'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_SCHEMA = 'conversation-crm-portable-config-v0';
const DEFAULT_CONFIG_FILE = 'config/conversation-crm/config.example.json';
const LOCAL_CONFIG_FILE = 'config/conversation-crm/config.json';

function portableError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
}

function resolveProjectRelative(value, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const label = options.label || 'path';
  if (typeof value !== 'string' || value.trim() === '' || path.isAbsolute(value)) {
    throw portableError('CAMINHO_RELATIVO_INVALIDO');
  }
  const resolved = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' && options.allowRoot !== true) throw portableError('CAMINHO_RELATIVO_INVALIDO');
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw portableError('CAMINHO_FORA_DO_PROJETO');
  return Object.freeze({ label, relative: normalizeRelative(relative), resolved });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw portableError('CONFIGURACAO_INVALIDA');
  }
}

function validateConfig(raw) {
  if (!raw || raw.schema_version !== CONFIG_SCHEMA || !raw.server || !raw.paths || !raw.privacy) {
    throw portableError('CONFIGURACAO_INVALIDA');
  }
  if (raw.server.host !== '127.0.0.1') throw portableError('HOST_NAO_PERMITIDO');
  const port = Number(raw.server.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw portableError('PORTA_INVALIDA');
  if (raw.privacy.anon_secret_env !== 'DELIVERYOS_CRM_ANON_SECRET') {
    throw portableError('CONFIGURACAO_PRIVACIDADE_INVALIDA');
  }
  for (const key of ['flow_config_root', 'runtime_dir', 'import_dir', 'backup_dir']) {
    if (typeof raw.paths[key] !== 'string') throw portableError('CONFIGURACAO_INVALIDA');
  }
  return true;
}

function loadPortableConfig(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const env = options.env || process.env;
  const requestedFile = options.configFile || env.DELIVERYOS_CRM_CONFIG_FILE;
  const localConfig = resolveProjectRelative(LOCAL_CONFIG_FILE, { projectRoot });
  const selectedFile = requestedFile || (fs.existsSync(localConfig.resolved) ? LOCAL_CONFIG_FILE : DEFAULT_CONFIG_FILE);
  const configPath = resolveProjectRelative(selectedFile, { projectRoot, label: 'config_file' });
  const raw = readJson(configPath.resolved);
  validateConfig(raw);

  const pathValues = {
    flow_config_root: env.DELIVERYOS_CRM_CONFIG_ROOT || raw.paths.flow_config_root,
    runtime_dir: env.DELIVERYOS_CRM_RUNTIME_DIR || raw.paths.runtime_dir,
    import_dir: env.DELIVERYOS_CRM_IMPORT_DIR || raw.paths.import_dir,
    backup_dir: env.DELIVERYOS_CRM_BACKUP_DIR || raw.paths.backup_dir
  };
  const paths = Object.fromEntries(Object.entries(pathValues).map(([key, value]) => [
    key,
    resolveProjectRelative(value, { projectRoot, label: key })
  ]));
  const flowFiles = ['flows.v0.json', 'rules.v0.json', 'policies.v0.json'];
  const flowRootAvailable = flowFiles.every((fileName) => fs.existsSync(path.join(paths.flow_config_root.resolved, fileName)));
  if (!flowRootAvailable && selectedFile === LOCAL_CONFIG_FILE && !requestedFile) {
    return loadPortableConfig({ ...options, projectRoot, configFile: DEFAULT_CONFIG_FILE, env: { ...env, DELIVERYOS_CRM_CONFIG_FILE: undefined } });
  }
  if (!flowRootAvailable) throw portableError('CONFIGURACAO_INVALIDA');
  const envPort = env.DELIVERYOS_CRM_SIMULATOR_PORT;
  const port = envPort === undefined ? Number(raw.server.port) : Number(envPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw portableError('PORTA_INVALIDA');

  return Object.freeze({
    schema_version: CONFIG_SCHEMA,
    project_root: projectRoot,
    config_file: configPath,
    server: Object.freeze({ host: '127.0.0.1', port }),
    paths: Object.freeze(paths),
    privacy: Object.freeze({ anon_secret_env: 'DELIVERYOS_CRM_ANON_SECRET' })
  });
}

module.exports = {
  PROJECT_ROOT,
  CONFIG_SCHEMA,
  DEFAULT_CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  portableError,
  resolveProjectRelative,
  validateConfig,
  loadPortableConfig
};

