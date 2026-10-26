'use strict';
// Run beside private-local.json on the isolated Windows lab host. No secret output.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = __dirname;
const app = path.join(root, 'app');
const address = '100.107.78.202';
const publicUrl = 'https://deliveryos-piloto.eu1.netbird.services';
const secrets = JSON.parse(fs.readFileSync(path.join(root, 'private-local.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'pilot-local.json'), 'utf8'));
const flags = JSON.parse(fs.readFileSync(path.join(root, 'gps-disabled.json'), 'utf8'));
if (cfg.unit_id !== 'ITAIM' || cfg.mode !== 'test' || cfg.source_mode !== 'simulated' ||
    flags.gps_capture_enabled !== false || Object.values(cfg.features).some(Boolean)) {
  throw Error('REMOTE_LAB_REFUSED: isolated test configuration required');
}
const users = secrets.users.map(u => {
  if (!/^lab-mooca-\d+$/.test(u.actor_id) || !/^[a-f0-9]{64}$/.test(u.token) ||
      [u.actor_id, u.role, u.label].some(v => typeof v !== 'string' || /[;:]/.test(v))) {
    throw Error('REMOTE_LAB_REFUSED: invalid synthetic account');
  }
  return [u.actor_id, u.role, u.label, u.token].join(':');
}).join(';');
const base = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !k.startsWith('DELIVERYOS_') && !k.startsWith('ENTREGAS_')));
const env = {
  ...base, ENTREGAS_ENV: 'cloud', ENTREGAS_BIND: address, ENTREGAS_UI_PORT: '5193',
  ENTREGAS_UNIT_ID: 'ITAIM', ENTREGAS_PILOT_CONFIG: path.join(root, 'pilot-local.json'),
  ENTREGAS_DATA_DIR: path.join(root, 'data', 'pilot'),
  ENTREGAS_GPS_FLAGS_CONFIG: path.join(root, 'gps-disabled.json'),
  ENTREGAS_PLATFORM_URL: 'http://127.0.0.1:8080', ENTREGAS_PLATFORM_READ_SECRET: secrets.read,
  ENTREGAS_USERS: users, ENTREGAS_ALLOWED_ORIGINS: publicUrl, ENTREGAS_PUBLIC_URL: publicUrl,
};
const {loadCloudConfig} = require(path.join(app, 'dist/src/entregas/pilot/cloud-config.js'));
const parsed = loadCloudConfig(env);
if (!parsed.ok) throw Error('REMOTE_LAB_REFUSED: cloud configuration invalid');
if (process.argv[2] === 'check') {
  console.log('REMOTE_LAB_CONFIG_PASS', JSON.stringify({bind: address, port: 5193,
    publicUrl, remote: parsed.config.remote, users: parsed.config.users.length,
    gps: false, mode: cfg.mode, source: cfg.source_mode}));
} else if (['start', 'start-local'].includes(process.argv[2])) {
  // The PowerShell controller verifies and stops only the previously recorded pilot.
  const record = JSON.parse(fs.readFileSync(path.join(root, 'runtime-pids.json'), 'utf8'));
  try { process.kill(record.pilot, 0); throw Error('Previous pilot still alive'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
  const out = fs.openSync(path.join(root, 'logs', 'pilot-remote.out.log'), 'a');
  const err = fs.openSync(path.join(root, 'logs', 'pilot-remote.err.log'), 'a');
  const local = process.argv[2] === 'start-local';
  const launchEnv = {...env};
  if (local) {
    launchEnv.ENTREGAS_ENV = 'local'; launchEnv.ENTREGAS_BIND = '127.0.0.1';
    for (const k of ['ENTREGAS_USERS', 'ENTREGAS_ALLOWED_ORIGINS', 'ENTREGAS_PUBLIC_URL']) delete launchEnv[k];
  }
  const child = cp.spawn(process.execPath, ['dist/tools/entregas_pilot_server.js'],
    {cwd: app, env: launchEnv, stdio: ['ignore', out, err], detached: true, windowsHide: true});
  fs.closeSync(out); fs.closeSync(err); child.unref();
  record.pilot = child.pid;
  record.pilotMode = local ? 'local' : 'remote-lab';
  const pending = path.join(root, 'runtime-pids.pending.json');
  fs.writeFileSync(pending, JSON.stringify(record));
  fs.renameSync(pending, path.join(root, 'runtime-pids.json'));
  console.log('REMOTE_LAB_PILOT_STARTED', child.pid);
} else {
  throw Error('Expected check, start or start-local');
}
