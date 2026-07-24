#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { loadPortableConfig, resolveProjectRelative, validateConfig, LOCAL_CONFIG_FILE } = require('../../src/conversation-crm/config');
const { loadFlowBundle } = require('../../src/conversation-crm/flows/loader');

const PACKAGE_FILES = Object.freeze(['portable-config.json', 'flows.v0.json', 'rules.v0.json', 'policies.v0.json']);

function cliError(code) {
  const error = new Error(code.toLowerCase());
  error.code = code;
  return error;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    if (!rest[index].startsWith('--')) continue;
    const key = rest[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[++index] : true;
  }
  return args;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function atomicWrite(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const partial = `${filePath}.partial`;
  await fsp.writeFile(partial, content, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(partial, filePath);
}

function publicConfig(config, flowRoot = config.paths.flow_config_root.relative) {
  return {
    schema_version: config.schema_version,
    server: { host: config.server.host, port: config.server.port },
    paths: {
      flow_config_root: flowRoot,
      runtime_dir: config.paths.runtime_dir.relative,
      import_dir: config.paths.import_dir.relative,
      backup_dir: config.paths.backup_dir.relative
    },
    privacy: { anon_secret_env: config.privacy.anon_secret_env }
  };
}

function resolveUnder(relativeValue, config, allowedRoot) {
  const candidate = resolveProjectRelative(relativeValue, { projectRoot: config.project_root });
  const relation = path.relative(allowedRoot.resolved, candidate.resolved);
  if (relation === '' || relation.startsWith('..') || path.isAbsolute(relation)) {
    throw cliError('DESTINO_CONFIG_NAO_PERMITIDO');
  }
  return candidate;
}

async function exportConfig(config, outputRelative) {
  const output = resolveUnder(outputRelative || `${config.paths.backup_dir.relative}/config-export-v0`, config, config.paths.backup_dir);
  await fsp.rm(output.resolved, { recursive: true, force: true });
  await fsp.mkdir(output.resolved, { recursive: true });
  await atomicWrite(path.join(output.resolved, 'portable-config.json'), `${JSON.stringify(publicConfig(config), null, 2)}\n`);
  for (const fileName of PACKAGE_FILES.slice(1)) {
    await fsp.copyFile(path.join(config.paths.flow_config_root.resolved, fileName), path.join(output.resolved, fileName));
  }
  const manifest = {
    schema_version: 'conversation-crm-config-package-v0',
    files: Object.fromEntries(PACKAGE_FILES.map((fileName) => [fileName, hashFile(path.join(output.resolved, fileName))]))
  };
  await atomicWrite(path.join(output.resolved, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { command: 'export', package_dir: output.relative, file_count: PACKAGE_FILES.length + 1 };
}

function validatePackage(inputPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(inputPath, 'manifest.json'), 'utf8'));
  } catch {
    throw cliError('PACOTE_CONFIG_INVALIDO');
  }
  if (manifest.schema_version !== 'conversation-crm-config-package-v0') throw cliError('PACOTE_CONFIG_INVALIDO');
  for (const fileName of PACKAGE_FILES) {
    if (manifest.files?.[fileName] !== hashFile(path.join(inputPath, fileName))) throw cliError('HASH_CONFIG_INVALIDO');
  }
  loadFlowBundle({ root: inputPath });
  return JSON.parse(fs.readFileSync(path.join(inputPath, 'portable-config.json'), 'utf8'));
}

async function importConfig(config, inputRelative, outputRelative) {
  const input = resolveUnder(inputRelative || `${config.paths.backup_dir.relative}/config-export-v0`, config, config.paths.backup_dir);
  const output = resolveUnder(outputRelative || `${config.paths.runtime_dir.relative}/restored-config-v0`, config, config.paths.runtime_dir);
  const imported = validatePackage(input.resolved);
  validateConfig(imported);
  for (const value of Object.values(imported.paths)) {
    resolveProjectRelative(value, { projectRoot: config.project_root });
  }
  await fsp.rm(output.resolved, { recursive: true, force: true });
  await fsp.mkdir(output.resolved, { recursive: true });
  for (const fileName of PACKAGE_FILES.slice(1)) {
    await fsp.copyFile(path.join(input.resolved, fileName), path.join(output.resolved, fileName));
  }
  const activated = {
    ...imported,
    paths: { ...imported.paths, flow_config_root: output.relative }
  };
  const localConfig = resolveProjectRelative(LOCAL_CONFIG_FILE, { projectRoot: config.project_root });
  await atomicWrite(localConfig.resolved, `${JSON.stringify(activated, null, 2)}\n`);
  loadPortableConfig({ projectRoot: config.project_root, env: {} });
  return { command: 'import', package_dir: input.relative, activated_config: localConfig.relative, flow_root: output.relative };
}

async function run(argv = process.argv.slice(2), env = process.env, options = {}) {
  const args = parseArgs(argv);
  const config = options.config || loadPortableConfig({ env, projectRoot: options.projectRoot });
  if (args.command === 'export') return exportConfig(config, args.output);
  if (args.command === 'import') return importConfig(config, args.input, args.output);
  throw cliError('COMANDO_CONFIG_INVALIDO');
}

if (require.main === module) {
  run().then((result) => process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)).catch((error) => {
    const allowed = new Set(['COMANDO_CONFIG_INVALIDO', 'DESTINO_CONFIG_NAO_PERMITIDO', 'PACOTE_CONFIG_INVALIDO', 'HASH_CONFIG_INVALIDO', 'CAMINHO_RELATIVO_INVALIDO', 'CAMINHO_FORA_DO_PROJETO', 'CONFIGURACAO_INVALIDA']);
    process.stderr.write(`${JSON.stringify({ ok: false, error_code: allowed.has(error.code) ? error.code : 'FALHA_CONFIG_SANITIZADA' })}\n`);
    process.exitCode = 1;
  });
}

module.exports = { PACKAGE_FILES, parseArgs, hashFile, publicConfig, exportConfig, validatePackage, importConfig, run };
