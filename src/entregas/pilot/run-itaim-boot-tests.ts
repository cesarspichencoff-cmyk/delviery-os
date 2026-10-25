/** Laboratório sintético: o servidor implantável só pode iniciar no Itaim. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
// Não herdar URLs/credenciais de plataforma ou banco do executor da CI.
// Somente loopback + backend arquivo com dados e tokens sintéticos.
function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    HOME: process.env.HOME,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
    TMPDIR: process.env.TMPDIR,
    ENTREGAS_ENV: "local",
    ENTREGAS_BIND: "127.0.0.1",
    ENTREGAS_STORAGE_BACKEND: "file",
  };
}
const fixture = JSON.parse(readFileSync(join(root, "config/entregas-pilot.example.json"), "utf8")) as Record<string, unknown>;
assert.equal(fixture.unit_id, "ITAIM", "fixture deve usar ITAIM");

function bootDenied(name: string, options: {
  unitId?: string; envId?: string; unitFile?: string | null; termFile?: string;
  expected: string;
}): void {
  const dir = mkdtempSync(join(tmpdir(), "deliveryos-itaim-only-"));
  const config = join(dir, "pilot.json");
  const data = join(dir, "dados");
  const env: NodeJS.ProcessEnv = {
    ...isolatedEnv(),
    ENTREGAS_PILOT_CONFIG: config,
    ENTREGAS_DATA_DIR: data,
  };
  delete env.ENTREGAS_UNIT_ID;
  delete env.ENTREGAS_UNIT_CONFIG;
  try {
    writeFileSync(config, JSON.stringify({ ...fixture, unit_id: options.unitId ?? "ITAIM" }));
    if (options.envId !== undefined) env.ENTREGAS_UNIT_ID = options.envId;
    if (options.unitFile !== undefined) {
      const file = join(dir, "unit.json");
      if (options.unitFile !== null) writeFileSync(file, options.unitFile);
      env.ENTREGAS_UNIT_CONFIG = file;
    }
    if (options.termFile !== undefined) {
      const file = join(dir, "term.json");
      writeFileSync(file, options.termFile);
      env.ENTREGAS_TERM_CONFIG = file;
    }
    const result = spawnSync(process.execPath, [join(root, "dist/tools/entregas_pilot_server.js")], {
      cwd: root, env, encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.error, undefined, `${name}: erro ao executar processo: ${result.error}`);
    assert.notEqual(result.status, 0, `${name}: servidor aceitou configuração inválida`);
    assert.match(String(result.stderr) + String(result.stdout), new RegExp(options.expected),
      `${name}: deve recusar pelo motivo correto`);
    assert.equal(existsSync(data), false, `${name}: criou diretório antes de validar unidade`);
    console.log(`OK ${name}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

bootDenied("JSON de outra unidade", { unitId: "OUTRA_UNIDADE_FICTICIA", expected: "ITAIM_ONLY_UNIT_MISMATCH" });
bootDenied("env de outra unidade", { envId: "OUTRA_UNIDADE_FICTICIA", expected: "ITAIM_ONLY_ENV_MISMATCH" });
bootDenied("env vazio explícito", { envId: "", expected: "ITAIM_ONLY_ENV_MISMATCH" });
bootDenied("GPS de outra unidade", { unitFile: JSON.stringify({ unit_id: "OUTRA_UNIDADE_FICTICIA" }), expected: "ITAIM_ONLY_UNIT_CONFIG_MISMATCH" });
bootDenied("GPS JSON inválido", { unitFile: "{errado", expected: "ITAIM_ONLY_UNIT_CONFIG_INVALID" });
bootDenied("GPS declarado ausente", { unitFile: null, expected: "ITAIM_ONLY_UNIT_CONFIG_MISSING" });
bootDenied("termo de unidade diferente", { termFile: JSON.stringify({ unit_id: "OUTRA_UNIDADE_FICTICIA" }), expected: "ITAIM_ONLY_TERM_UNIT_MISMATCH" });
bootDenied("termo JSON inválido", { termFile: "[", expected: "ITAIM_ONLY_TERM_CONFIG_INVALID" });
console.log("ITAIM_ONLY_BOOT_REJECTIONS_OK 8/8");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      if (!address || typeof address === "string") return reject(new Error("porta invalida"));
      s.close(() => resolve(address.port));
    });
  });
}

async function bootAccepted(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "deliveryos-itaim-accepted-"));
  const config = join(dir, "pilot.json");
  const data = join(dir, "dados");
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...isolatedEnv(),
    ENTREGAS_PILOT_CONFIG: config,
    ENTREGAS_DATA_DIR: data,
    ENTREGAS_UI_PORT: String(port),
    ENTREGAS_UNIT_ID: "ITAIM",
    ENTREGAS_TERM_CONFIG: join(dir, "termo-ausente.json"),
  };
  writeFileSync(config, JSON.stringify(fixture));
  const child = spawn(process.execPath, [join(root, "dist/tools/entregas_pilot_server.js")], {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (data) => { output += String(data).slice(0, 1000); });
  child.stderr?.on("data", (data) => { output += String(data).slice(0, 1000); });
  try {
    let success = false;
    for (let i = 0; i < 120; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(400),
        });
        if (response.ok) {
          const health = (await response.json()) as Record<string, unknown>;
          assert.equal(health.unit, "TATÁ Itaim");
          assert.equal(health.storage_backend, "file");
          assert.equal(health.multi_instance, false);
          assert.equal(health.unit_configured, false, "GPS sem coordenadas aprovadas deve permanecer desligado");
          assert.equal(health.term_publishable, false, "sem termo aprovado não publicar texto-base");
          assert.equal(existsSync(data), true, "backend nao criou diretorio de persistencia");
          success = true;
          break;
        }
      } catch { /* ainda subindo no localhost */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(success, true, "ITAIM valido nao iniciou em localhost: " + output.slice(-700));
    console.log("ITAIM_ONLY_BOOT_ACCEPTANCE_OK 1/1");
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      const timeout = setTimeout(resolve, 2500);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
    rmSync(dir, { recursive: true, force: true });
  }
}

void bootAccepted().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
