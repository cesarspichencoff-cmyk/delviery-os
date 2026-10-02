import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { loadM1bHomeCss } from "./m1b-precondition";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

async function withServer(
  status: number,
  body: string,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((_req, res) => {
    res.statusCode = status;
    res.setHeader("content-type", "text/css");
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function main(): Promise<void> {
  await test("M1BP1 conexao recusada vira precondicao indisponivel", async () => {
    const result = await loadM1bHomeCss("http://127.0.0.1:65534", 500);
    assert.deepEqual(result, { kind: "unavailable" });
  });

  await test("M1BP2 servidor presente com HTTP invalido continua vermelho", async () => {
    await withServer(404, "nao existe", async (base) => {
      await assert.rejects(
        () => loadM1bHomeCss(base, 1_000),
        /PRECONDICAO PRESENTE MAS INVALIDA: .* HTTP 404/,
      );
    });
  });

  await test("M1BP3 servidor valido devolve CSS para prova de procedencia", async () => {
    await withServer(200, "body { color: red; }", async (base) => {
      const result = await loadM1bHomeCss(base, 1_000);
      assert.deepEqual(result, {
        kind: "ready",
        css: "body { color: red; }",
      });
    });
  });

  console.log(`M1B_PRECONDITION: ${passed}/${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
