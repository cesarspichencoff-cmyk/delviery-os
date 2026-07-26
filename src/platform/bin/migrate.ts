/**
 * Aplica migrations pendentes e sai.
 *
 * Existe separado dos runtimes porque em piloto e produção o schema NÃO deve
 * ser aplicado no boot: N réplicas subindo juntas fazem N processos correrem a
 * mesma migration ao mesmo tempo, e um deploy vira uma corrida. O caminho
 * correto é um passo explícito, antes de trocar as instâncias.
 *
 * Sai com 0 quando não havia nada a fazer — não ter migration pendente é
 * sucesso, e não um caso especial.
 */

import { loadPlatformConfig, describe, ConfigError } from "../config/platform-config";
import { diretorioDeMigrations } from "../migrations/localizar";
import { runMigrations } from "../migrations/runner";
import { createPgClient } from "../persistence/sql-client";

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadPlatformConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`[migrate] configuração recusada: ${e.message}`);
      process.exit(78);
    }
    throw e;
  }

  console.log("[migrate] alvo", JSON.stringify(describe(cfg)));
  const cliente = await createPgClient({ url: cfg.database_url, ssl: cfg.database_ssl, max: 2 });

  try {
    const dir = diretorioDeMigrations();
    console.log(`[migrate] lendo ${dir}`);
    const r = await runMigrations(cliente, dir);

    if (r.mismatch) {
      console.error(
        `[migrate] PARADO: ${r.mismatch.version} mudou depois de aplicada ` +
          `(registrado ${r.mismatch.esperado}, arquivo ${r.mismatch.encontrado}).`,
      );
      console.error(
        "[migrate] duas máquinas estão com schemas diferentes achando que têm o mesmo. " +
          "Continuar seria escolher qual delas quebra primeiro.",
      );
      process.exit(65); // EX_DATAERR
    }

    for (const v of r.applied) console.log(`[migrate] aplicada: ${v}`);
    console.log(`[migrate] ${r.applied.length} aplicada(s), ${r.skipped.length} já estavam`);
  } finally {
    await cliente.close();
  }
}

void main().catch((e) => {
  console.error("[migrate] falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
