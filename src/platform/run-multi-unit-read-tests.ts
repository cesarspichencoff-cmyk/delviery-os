import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { lerUnidadesOperacionais } from "./leitura/unidades-operacionais";
import { lerUnidadesParaNavegacao } from "../../tools/product_system_server";
import type { PgSqlClient } from "./persistence/sql-client";

let passed = 0;
function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log("PASS", name);
    });
}

const fakeRows = [
  { unit_id: "ITAIM", display_name: "Itaim", timezone: "America/Sao_Paulo" },
  { unit_id: "PINHEIROS", display_name: "Pinheiros", timezone: "America/Sao_Paulo" },
];

function fakeClient(options: { fail?: boolean } = {}): PgSqlClient {
  return {
    query: async () => [],
    close: async () => undefined,
    transaction: async (fn: (tx: { query: (sql: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]> }) => Promise<unknown>) => {
      if (options.fail) throw new Error("banco_indisponivel");
      const calls: string[] = [];
      const tx = {
        query: async (sql: string) => {
          calls.push(sql);
          if (/SET TRANSACTION READ ONLY/.test(sql)) return [];
          if (/FROM identity\.unit/.test(sql)) return fakeRows;
          throw new Error("consulta inesperada");
        },
      };
      const result = await fn(tx);
      (result as { __calls?: string[] } | undefined);
      return result;
    },
  } as unknown as PgSqlClient;
}

async function main(): Promise<void> {
  await test("MU1 sem PostgreSQL usa somente fallback demo explícito", async () => {
    const r = await lerUnidadesParaNavegacao(null);
    assert.equal(r.fonte_unidades, "demonstracao");
    assert.equal(r.unidades_disponiveis, true);
    assert.deepEqual(r.unidades.map((u) => [u.unit_id, u.origem]), [
      ["demo-unit", "demonstracao"],
    ]);
  });

  await test("MU2 leitura de identity.unit é READ ONLY e só pede unidades ativas", async () => {
    const calls: string[] = [];
    const client = {
      transaction: async (fn: (tx: { query: (sql: string) => Promise<Record<string, unknown>[]> }) => Promise<unknown>) =>
        fn({
          query: async (sql: string) => {
            calls.push(sql);
            if (/SET TRANSACTION READ ONLY/.test(sql)) return [];
            return fakeRows;
          },
        }),
    } as unknown as Parameters<typeof lerUnidadesOperacionais>[0];

    const r = await lerUnidadesOperacionais(client);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /SET TRANSACTION READ ONLY/);
    assert.match(calls[1], /FROM identity\.unit/);
    assert.match(calls[1], /WHERE active = TRUE/);
    assert.match(calls[1], /ORDER BY display_name, unit_id/);
    assert.deepEqual(r.map((u) => u.unit_id), ["ITAIM", "PINHEIROS"]);
  });

  await test("MU3 banco real mapeia unidades como identity.unit e nunca injeta demo-unit", async () => {
    const r = await lerUnidadesParaNavegacao(fakeClient());
    assert.equal(r.fonte_unidades, "identity.unit");
    assert.equal(r.unidades_disponiveis, true);
    assert.deepEqual(r.unidades.map((u) => [u.unit_id, u.origem]), [
      ["ITAIM", "identity.unit"],
      ["PINHEIROS", "identity.unit"],
    ]);
    assert.equal(r.unidades.some((u) => u.unit_id === "demo-unit"), false);
  });

  await test("MU4 falha do banco real não cai silenciosamente para demo", async () => {
    const r = await lerUnidadesParaNavegacao(fakeClient({ fail: true }));
    assert.equal(r.fonte_unidades, "indisponivel");
    assert.equal(r.unidades_disponiveis, false);
    assert.deepEqual(r.unidades, []);
  });

  await test("MU5 UI envia unit_id para as três superfícies dependentes de unidade", () => {
    const js = readFileSync(join(process.cwd(), "src/product/ui/app.js"), "utf8");
    assert.match(js, /rota === "\/entregas"/);
    assert.match(js, /rota === "\/operacao-viva"/);
    assert.match(js, /rota === "\/copiloto"/);
    assert.match(js, /unit_id=\$\{encodeURIComponent\(estado\.unidade\)\}/);
    assert.match(js, /unidades_disponiveis === false/);
  });

  await test("MU6 servidor usa a fonte de unidades na rota de navegação", () => {
    const server = readFileSync(join(process.cwd(), "tools/product_system_server.ts"), "utf8");
    assert.match(server, /lerUnidadesParaNavegacao\(clientePlataforma\)/);
    assert.match(server, /fonte_unidades: "indisponivel"/);
    assert.match(server, /unidades_disponiveis: false/);
    assert.match(server, /lerRealidade\([\s\S]*url\.searchParams\.get\("unit_id"\)/);
  });

  console.log(`MULTI_UNIT_READ: ${passed}/6 PASS`);
}

void main().catch((e) => {
  console.error("MULTI_UNIT_READ_RED", e);
  process.exit(1);
});
