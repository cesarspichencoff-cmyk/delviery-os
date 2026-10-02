import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { shutdown } from "./contracts/runtime";

type ExitResult = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(
  read: () => string,
  marker: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (read().includes(marker)) return;
    await sleep(25);
  }
  throw new Error(`timeout aguardando marcador ${marker}:\n${read()}`);
}

async function exercise(
  file: string,
  env: NodeJS.ProcessEnv,
  ready: string,
): Promise<ExitResult> {
  const child = spawn(process.execPath, [file], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  try {
    await waitFor(() => output, ready);
    assert.equal(child.kill("SIGTERM"), true, "SIGTERM não foi enviado");
    return await new Promise<ExitResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`processo não encerrou após SIGTERM:\n${output}`));
      }, 4_000);
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, output });
      });
    });
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  }
}

async function shutdownChild(mode: string): Promise<void> {
  let closing = false;
  process.once("SIGTERM", async () => {
    if (closing) return;
    closing = true;
    console.log("SIGNAL:SIGTERM");
    const result = await shutdown({
      drain: async () => {
        console.log("DRAIN:START");
        await sleep(mode === "timeout" ? 800 : 80);
        console.log("DRAIN:END");
      },
      close: async () => {
        console.log("CLOSE:START");
        await sleep(40);
        console.log("CLOSE:END");
      },
    }, 300);
    console.log("RESULT:" + JSON.stringify(result));
    process.exit(result.graceful ? 0 : 1);
  });
  console.log("READY:" + mode);
  setInterval(() => {}, 1_000);
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}
async function main(): Promise<void> {
  const childMode = process.env["DELIVERYOS_SIGTERM_TEST_CHILD"];
  if (childMode) {
    await shutdownChild(childMode);
    return;
  }

  if (process.platform !== "linux") {
    console.log(
      "PULADO: gate SIGTERM exige kernel Linux; nenhum sinal externo foi provado.",
    );
    return;
  }

  await test("SIG1 Linux entrega SIGTERM e shutdown drena antes de fechar", async () => {
    const r = await exercise(__filename, {
      DELIVERYOS_SIGTERM_TEST_CHILD: "graceful",
    }, "READY:graceful");
    assert.equal(r.code, 0, r.output);
    assert.equal(r.signal, null);
    assert.match(r.output, /SIGNAL:SIGTERM/);
    assert.match(r.output, /DRAIN:START[\s\S]*DRAIN:END[\s\S]*CLOSE:START[\s\S]*CLOSE:END/);
    assert.match(r.output, /"graceful":true/);
  });
  await test("SIG2 timeout real não finge fechamento gracioso", async () => {
    const r = await exercise(__filename, {
      DELIVERYOS_SIGTERM_TEST_CHILD: "timeout",
    }, "READY:timeout");
    assert.equal(r.code, 1, r.output);
    assert.equal(r.signal, null);
    assert.match(r.output, /SIGNAL:SIGTERM/);
    assert.match(r.output, /DRAIN:START/);
    assert.doesNotMatch(r.output, /CLOSE:START/);
    assert.match(r.output, /"graceful":false/);
    assert.match(r.output, /tempo esgotado após 300ms/);
  });

  await test("SIG3 source-ingest real desligado recebe SIGTERM e sai limpo", async () => {
    const binary = join(__dirname, "bin", "entregas-source-ingest.js");
    const r = await exercise(binary, {
      DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "false",
    }, "[source-ingest] DESLIGADO");
    assert.equal(r.code, 0, r.output);
    assert.equal(r.signal, null);
    assert.match(r.output, /DESLIGADO — nenhuma fonte ou banco foi aberto/);
  });

  console.log(`LINUX_SIGTERM: ${passed}/${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
