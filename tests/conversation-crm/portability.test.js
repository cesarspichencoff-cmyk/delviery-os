'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { tempDirectory, removeDirectory } = require('./helpers');
const {
  PROJECT_ROOT,
  resolveProjectRelative,
  loadPortableConfig
} = require('../../src/conversation-crm/config');
const { resolveCliPath } = require('../../tools/conversation-crm/crm-importer');
const { exportConfig, importConfig } = require('../../tools/conversation-crm/config-cli');

function copyTree(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function portableCopy(destination) {
  for (const relative of [
    'config/conversation-crm',
    'src/conversation-crm',
    'tools/conversation-crm',
    'package.json',
    'package-lock.json',
    '.gitignore'
  ]) {
    copyTree(path.join(PROJECT_ROOT, relative), path.join(destination, relative));
  }
}

test('resolvedor aceita caminho relativo e rejeita absoluto ou travessia', () => {
  assert.equal(resolveProjectRelative('runtime/conversation-crm/state.json').relative, 'runtime/conversation-crm/state.json');
  assert.throws(() => resolveProjectRelative(path.resolve(PROJECT_ROOT, 'runtime')), { code: 'CAMINHO_RELATIVO_INVALIDO' });
  assert.throws(() => resolveProjectRelative('../outside'), { code: 'CAMINHO_FORA_DO_PROJETO' });
});

test('configuração de exemplo não contém segredo nem caminho de máquina', () => {
  const filePath = path.join(PROJECT_ROOT, 'config', 'conversation-crm', 'config.example.json');
  const text = fs.readFileSync(filePath, 'utf8');
  const config = JSON.parse(text);
  assert.equal(Object.hasOwn(config.privacy, 'secret'), false);
  for (const value of Object.values(config.paths)) {
    assert.equal(path.isAbsolute(value), false);
    assert.equal(/^[a-z]:[\\/]/i.test(value), false);
  }
});

test('diretórios configuráveis continuam relativos à raiz do projeto', () => {
  const config = loadPortableConfig({ env: { DELIVERYOS_CRM_RUNTIME_DIR: 'state/private-runtime' } });
  assert.equal(config.paths.runtime_dir.relative, 'state/private-runtime');
  assert.equal(config.paths.runtime_dir.resolved, path.join(PROJECT_ROOT, 'state', 'private-runtime'));
  assert.throws(
    () => loadPortableConfig({ env: { DELIVERYOS_CRM_RUNTIME_DIR: path.resolve(PROJECT_ROOT, 'runtime') } }),
    { code: 'CAMINHO_RELATIVO_INVALIDO' }
  );
});

test('importador limita entrada e saída às pastas privadas configuradas', () => {
  const config = loadPortableConfig({ env: {} });
  assert.equal(
    resolveCliPath('imports/conversation-crm/source.xlsx', config, config.paths.import_dir, 'CAMINHO_IMPORTACAO_NAO_PERMITIDO'),
    path.join(PROJECT_ROOT, 'imports', 'conversation-crm', 'source.xlsx')
  );
  assert.throws(
    () => resolveCliPath('docs/source.xlsx', config, config.paths.import_dir, 'CAMINHO_IMPORTACAO_NAO_PERMITIDO'),
    { code: 'CAMINHO_IMPORTACAO_NAO_PERMITIDO' }
  );
});

test('exportação e importação restauram configuração validada sem segredo', async (t) => {
  const root = tempDirectory('deliveryos-portable-config-');
  t.after(() => removeDirectory(root));
  portableCopy(root);
  const config = loadPortableConfig({ projectRoot: root, env: {} });
  const exported = await exportConfig(config);
  assert.equal(exported.file_count, 5);
  const imported = await importConfig(config);
  const activated = JSON.parse(fs.readFileSync(path.join(root, imported.activated_config), 'utf8'));
  assert.equal(activated.paths.flow_config_root, 'src/conversation-crm/flows');
  assert.equal(JSON.stringify(activated).includes('synthetic-test-secret'), false);
  assert.equal(loadPortableConfig({ projectRoot: root, env: {} }).paths.flow_config_root.relative, activated.paths.flow_config_root);
});

test('manifesto aceita newline equivalente e bloqueia alteração semântica', async (t) => {
  const root = tempDirectory('deliveryos-portable-tamper-');
  t.after(() => removeDirectory(root));
  portableCopy(root);
  const config = loadPortableConfig({ projectRoot: root, env: {} });
  await exportConfig(config);
  const rulesFile = path.join(root, 'backups', 'conversation-crm', 'config-export-v0', 'rules.v0.json');
  fs.writeFileSync(rulesFile, `\uFEFF${fs.readFileSync(rulesFile, 'utf8').replace(/\r?\n/g, '\r\n').trimEnd()}\r\n`, 'utf8');
  await importConfig(config);
  const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8').replace(/^\uFEFF/u, ''));
  rules.schema_version = `${rules.schema_version}-tampered`;
  fs.writeFileSync(rulesFile, JSON.stringify(rules), 'utf8');
  await assert.rejects(() => importConfig(config), { code: 'HASH_CONFIG_INVALIDO' });
});

test('dois round-trips preservam configuração semanticamente equivalente', async (t) => {
  const root = tempDirectory('deliveryos-portable-double-roundtrip-');
  t.after(() => removeDirectory(root));
  portableCopy(root);
  let config = loadPortableConfig({ projectRoot: root, env: {} });
  await exportConfig(config, 'backups/conversation-crm/config-export-v0');
  await importConfig(config, 'backups/conversation-crm/config-export-v0', 'runtime/conversation-crm/restored-config-v0');
  const first = JSON.parse(fs.readFileSync(path.join(root, 'config', 'conversation-crm', 'config.json'), 'utf8'));
  config = loadPortableConfig({ projectRoot: root, env: {} });
  await exportConfig(config, 'backups/conversation-crm/config-export-v1');
  await importConfig(config, 'backups/conversation-crm/config-export-v1', 'runtime/conversation-crm/restored-config-v1');
  const second = JSON.parse(fs.readFileSync(path.join(root, 'config', 'conversation-crm', 'config.json'), 'utf8'));
  assert.deepEqual(second, first);
  const firstManifest = JSON.parse(fs.readFileSync(path.join(root, 'backups', 'conversation-crm', 'config-export-v0', 'manifest.json'), 'utf8'));
  const secondManifest = JSON.parse(fs.readFileSync(path.join(root, 'backups', 'conversation-crm', 'config-export-v1', 'manifest.json'), 'utf8'));
  assert.deepEqual(secondManifest.files, firstManifest.files);
});

test('exportação não pode apagar a raiz inteira de backups', async () => {
  const config = loadPortableConfig({ env: {} });
  await assert.rejects(
    () => exportConfig(config, config.paths.backup_dir.relative),
    { code: 'DESTINO_CONFIG_NAO_PERMITIDO' }
  );
});

test('simulador inicia em cópia renomeada e usa somente recursos relativos', (t) => {
  const root = tempDirectory('deliveryos-renamed-folder-');
  t.after(() => removeDirectory(root));
  portableCopy(root);
  const script = [
    "const { once } = require('node:events');",
    "const { createServer } = require('./tools/conversation-crm/simulator/server');",
    "(async () => { const server = createServer(); server.listen(0, '127.0.0.1');",
    "await once(server, 'listening'); const port = server.address().port;",
    "const health = await (await fetch('http://127.0.0.1:' + port + '/api/health')).json();",
    "server.close(); process.stdout.write(JSON.stringify(health)); })().catch((error) => { console.error(error.code || 'FAILED'); process.exit(1); });"
  ].join(' ');
  const output = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), { ok: true, mode: 'synthetic_local_only' });
});

test('manifesto npm oferece instalação, execução, teste e transporte de configuração', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['conversation-crm:start'], 'node tools/conversation-crm/simulator/server.js');
  assert.equal(packageJson.scripts['conversation-crm:test'], 'node --test tests/conversation-crm/*.test.js');
  assert.ok(packageJson.scripts['conversation-crm:config:export']);
  assert.ok(packageJson.scripts['conversation-crm:config:import']);
  const lock = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 3);
  assert.ok(lock.packages['node_modules/xlsx'].version);
});

test('Git ignora runtime, imports, backups, uploads e configuração privada', () => {
  const ignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf8');
  for (const marker of [
    '/runtime/', '/imports/conversation-crm/', '/backups/conversation-crm/',
    '/uploads/conversation-crm/', '/.cache/conversation-crm/', '/config/conversation-crm/config.json'
  ]) assert.equal(ignore.includes(marker), true);
});
