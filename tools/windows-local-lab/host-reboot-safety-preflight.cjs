'use strict';
// Read-only safety gate for the old simulated DeliveryOS ITAIM lab on CAIXA_MOOCA.
// Never starts/stops a process, repairs PID files, connects to DB, reads secrets,
// changes services, permits field GPS, installs, or authorizes a cutover.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LAB_ROOT = 'C:\\Users\\Tata\\DeliveryOS-Ensaio';
const EXPECTED_HOST = 'CAIXA_MOOCA';

function inspect(root, { hostname, bootTimeMs } = {}) {
  const result = {
    schema: 'deliveryos.lab-reboot-readonly.v1',
    status: 'NO_GO',
    activationAllowed: false,
    modificationsExecuted: false,
    sourceRead: false,
    credentialsRead: false,
    liveDatabaseChecked: false,
    processIdentityVerified: false,
    gpsEnabledByAudit: false,
    reasons: [],
  };
  const reasons = result.reasons;
  const name = String(hostname || '').toUpperCase();
  if (name !== EXPECTED_HOST) reasons.push('WRONG_HOST');
  const cleanRoot = path.resolve(root);
  const readJson = (relative) => {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(cleanRoot, relative), 'utf8'));
      return value && typeof value === 'object' ? value : null;
    } catch {
      reasons.push('MISSING_OR_INVALID_' + relative.replace(/[^a-z0-9]/gi, '_').toUpperCase());
      return null;
    }
  };
  const safeStat = (relative) => {
    try { return fs.statSync(path.join(cleanRoot, relative)); }
    catch { return null; }
  };
  const cfg = readJson('pilot-local.json');
  const storage = readJson('pilot-storage.json');
  const gps = readJson('gps-disabled.json');
  const stamp = readJson(path.join('app', 'dist', 'build-stamp.json'));
  const pidFile = readJson('runtime-pids.json');

  if (!cfg || cfg.mode !== 'test' || cfg.source_mode !== 'simulated' ||
      cfg.unit_id !== 'ITAIM' || !cfg.features ||
      typeof cfg.features !== 'object' ||
      Object.values(cfg.features).some(v => v !== false)) {
    reasons.push('TEST_SIMULATED_SCOPE_NOT_PROVEN');
  }
  if (!storage || storage.schema !== 'deliveryos.lab-pilot-storage.v1' ||
      storage.kind !== 'postgres' || storage.unitId !== 'ITAIM' ||
      storage.sourceMode !== 'simulated' ||
      storage.scope !== 'isolated_legacy_console_only') {
    reasons.push('PRIVATE_LAB_STORAGE_SCOPE_NOT_PROVEN');
  }
  if (!gps || gps.gps_capture_enabled !== false) reasons.push('GPS_FLAG_NOT_PROVEN_DISABLED');
  if (!stamp || typeof stamp.commit !== 'string') reasons.push('APP_BUILD_NOT_ATTESTED');
  else result.installedBuild = stamp.commit.slice(0, 12);
  const dataDir = safeStat('pgdata');
  if (!dataDir || !dataDir.isDirectory()) reasons.push('PG_DATA_DIRECTORY_UNKNOWN');
  const postgresPid = safeStat(path.join('pgdata', 'postmaster.pid'));
  const priorPids = safeStat('runtime-pids.json');
  const normalBoot = Number.isFinite(bootTimeMs) && bootTimeMs > 0;
  if (!normalBoot) reasons.push('BOOT_TIME_UNKNOWN');
  result.pidsRecordExists = !!priorPids;
  result.postmasterRecordExists = !!postgresPid;
  result.pidsRecordOlderThanBoot = !!(normalBoot && priorPids && priorPids.mtimeMs < bootTimeMs);
  result.postmasterRecordOlderThanBoot = !!(normalBoot && postgresPid && postgresPid.mtimeMs < bootTimeMs);
  if (!pidFile || !['critical', 'async', 'pilot'].every(k => Number.isInteger(pidFile[k]) && pidFile[k] > 0)) {
    reasons.push('PID_RECORD_NOT_ATTESTED');
  }
  if (result.pidsRecordOlderThanBoot) reasons.push('RECORDED_SERVICE_PIDS_PRE_BOOT');
  if (result.postmasterRecordOlderThanBoot) reasons.push('POSTMASTER_RECORD_PRE_BOOT');
  // A stale-looking PID file must NEVER be deleted based on modification times.
  reasons.push('LIVE_PROCESS_IDENTITY_NOT_PROVEN');
  reasons.push('DATABASE_BACKUP_AND_RECOVERY_NOT_PROVEN_TODAY');
  reasons.push('PORTS_AND_LOCAL_HEALTH_NOT_PROVEN');
  reasons.push('NO_SERVICE_ACTION_PERMITTED_FROM_THIS_REPORT');
  result.status = reasons.some(r =>
    /WRONG_HOST|SCOPE_NOT_PROVEN|GPS_FLAG_NOT_PROVEN/.test(r)
  ) ? 'UNSAFE_SCOPE_NO_GO' : 'PREFLIGHT_ONLY_NO_GO';
  return result;
}

if (require.main === module) {
  const root = process.argv[2] || LAB_ROOT;
  if (process.platform !== 'win32' ||
      path.normalize(path.resolve(root)).toLowerCase() !==
      path.normalize(path.resolve(LAB_ROOT)).toLowerCase()) {
    console.error('HOST_PREFLIGHT_REFUSED: lab root or operating system mismatch');
    process.exitCode = 2;
  } else {
    const boot = Date.now() - os.uptime() * 1000;
    // All printed data is bounded metadata; neither raw PIDs nor credentials.
    console.log('LAB_REBOOT_PREFLIGHT', JSON.stringify(inspect(root, {
      hostname: os.hostname(), bootTimeMs: boot,
    })));
  }
}

module.exports = { inspect };
