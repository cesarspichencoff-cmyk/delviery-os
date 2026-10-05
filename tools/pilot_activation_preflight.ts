import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  evaluateActivationPreflight,
  type ActivationProbeInput,
} from "../src/platform/pilot-activation-preflight";

type Json = Record<string, any>;

function boolFlag(value: string | undefined): boolean | null {
  if (value === undefined || value.trim() === "") return false;
  const x = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(x)) return true;
  if (["0", "false", "no", "off"].includes(x)) return false;
  return null;
}

function adbPath(): string | null {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    join(homedir(), "AppData", "Local", "Android", "Sdk"),
    "C:\\Android\\Sdk",
  ].filter((x): x is string => Boolean(x));

  for (const root of candidates) {
    const p = join(root, "platform-tools", "adb.exe");
    if (existsSync(p)) return p;
  }

  const p = spawnSync("adb", ["version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return p.status === 0 ? "adb" : null;
}

function probeAdb(): {
  adb_available: boolean;
  physical_devices: number;
  emulator_devices: number;
  unauthorized_devices: number;
} {
  const adb = adbPath();
  if (!adb) {
    return {
      adb_available: false,
      physical_devices: 0,
      emulator_devices: 0,
      unauthorized_devices: 0,
    };
  }

  const out = spawnSync(adb, ["devices", "-l"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (out.status !== 0) {
    return {
      adb_available: true,
      physical_devices: 0,
      emulator_devices: 0,
      unauthorized_devices: 0,
    };
  }

  let physical = 0;
  let emulator = 0;
  let unauthorized = 0;
  for (const raw of String(out.stdout ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("List of devices")) continue;
    const parts = line.split(/\s+/);
    const serial = parts[0] ?? "";
    const status = parts[1] ?? "";
    if (status !== "device") {
      unauthorized += 1;
      continue;
    }
    const emu =
      serial.startsWith("emulator-") ||
      /model:sdk_|product:sdk_|device:emu/i.test(line);
    if (emu) emulator += 1;
    else physical += 1;
  }

  return {
    adb_available: true,
    physical_devices: physical,
    emulator_devices: emulator,
    unauthorized_devices: unauthorized,
  };
}

function dockerAvailable(): boolean {
  const r = spawnSync("docker", ["compose", "version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0;
}

const root = process.cwd();
const state = JSON.parse(
  readFileSync(join(root, "docs", "execution", "STATE.json"), "utf8"),
) as Json;

const adb = probeAdb();
const input: ActivationProbeInput = {
  ...adb,
  docker_available: dockerAvailable(),
  operational_db_url_present: Boolean(
    (process.env.DELIVERYOS_DATABASE_URL ?? process.env.DELIVERYOS_PG_URL)?.trim(),
  ),
  product_reader_password_present: Boolean(
    process.env.DELIVERYOS_PRODUCT_READER_DB_PASSWORD?.trim(),
  ),
  source_ingest_requested: boolFlag(
    process.env.DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED,
  ),
  source_ingest_production:
    state.source_ingest_pg_feed?.production ?? "NOT_ACTIVATED",
  consumer_live:
    state.source_ingest_pg_feed?.consumer_live ?? "OFF / NOT_AUTHORIZED",
  product_reader_credential:
    state.source_to_product_e2e_20261005?.product_reader?.credential ??
    "NOT_CREATED",
  deployment_status:
    state.pilot_readiness_20261005?.deployment_status ??
    state.source_to_product_e2e_20261005?.product_reader?.deploy ??
    "NOT_DEPLOYED",
};

const result = evaluateActivationPreflight(input);

console.log("\n=== DELIVERYOS PILOT ACTIVATION PREFLIGHT ===\n");
for (const c of result.checks) {
  console.log(c.status.padEnd(18), c.id, "—", c.detail);
}
console.log("\nDIAGNOSTICS (presence/counts only)");
console.log(JSON.stringify(result.diagnostics, null, 2));
console.log("\nEFFECT_ATTEMPTED=false");
