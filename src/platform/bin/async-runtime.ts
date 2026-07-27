/**
 * Entrypoint do runtime ASSÍNCRONO.
 *
 * Consome a outbox e executa jobs. Pode cair, reiniciar e acumular backlog sem
 * afetar a rua — é essa a razão de ele ser um processo separado.
 *
 * Duas escolhas que definem o comportamento:
 *
 *  - o laço é sequencial, com espera ENTRE as passadas. Um `setInterval` faria
 *    passadas se sobreporem quando uma demora, e dois ticks concorrentes do
 *    mesmo worker disputam a própria fila;
 *  - `kind` sem handler NÃO é ignorado: falha, tenta de novo e termina em
 *    dead-letter. Ignorar em silêncio faria mensagens sumirem toda vez que um
 *    deploy chegasse com um tipo novo antes do consumidor que o entende.
 */

import { loadPlatformConfig, describe, ConfigError } from "../config/platform-config";
import { runMigrations } from "../migrations/runner";
import { diretorioDeMigrations } from "../migrations/localizar";
import { createPgClient } from "../persistence/sql-client";
import { PgJobRepository, PgOutboxRepository } from "../persistence/pg-repositories";
import { AsyncRuntime, type JobHandler, type OutboxHandler } from "../runtime/async-worker";
import { montarPonteDaOperacaoViva } from "../runtime/handler-operacao-viva";

/**
 * Handlers registrados.
 *
 * A Operação Viva é o primeiro consumidor real. Os demais (Conference Brain,
 * Copiloto, notificações) entram do mesmo jeito: uma linha aqui.
 *
 * A memória da projeção vive no processo e é DESCARTÁVEL — o event log é a
 * verdade, e `reconstruirPorReplay` a recompõe. Um reinício do worker não
 * perde nada que não possa ser recalculado.
 */
const ponteOperacaoViva = montarPonteDaOperacaoViva();
const OUTBOX_HANDLERS: Record<string, OutboxHandler> = { ...ponteOperacaoViva.handlers };
const JOB_HANDLERS: Record<string, JobHandler> = {};

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadPlatformConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`[assincrono] configuração recusada: ${e.message}`);
      process.exit(78);
    }
    throw e;
  }

  console.log("[assincrono] iniciando", JSON.stringify(describe(cfg)));

  const cliente = await createPgClient({ url: cfg.database_url, ssl: cfg.database_ssl, max: 5 });

  if (cfg.migrate_on_boot) {
    const r = await runMigrations(cliente, diretorioDeMigrations());
    if (r.mismatch) {
      console.error(`[assincrono] migration divergente: ${r.mismatch.version}`);
      await cliente.close();
      process.exit(78);
    }
  }

  const runtime = new AsyncRuntime({
    identity: { version: cfg.version, commit: cfg.commit, instance_id: cfg.instance_id },
    outbox: new PgOutboxRepository(cliente),
    jobs: new PgJobRepository(cliente),
    outboxHandlers: OUTBOX_HANDLERS,
    jobHandlers: JOB_HANDLERS,
    batchSize: cfg.batch_size,
    worker_id: cfg.instance_id,
  });

  let rodando = true;

  const laco = async (): Promise<void> => {
    while (rodando) {
      try {
        const r = await runtime.tick();
        const houve =
          r.outbox_processed + r.outbox_failed + r.outbox_dead +
          r.jobs_processed + r.jobs_failed + r.jobs_dead + r.reclaimed;
        if (houve > 0) console.log("[assincrono] passada", JSON.stringify(r));
      } catch (e) {
        // Uma passada que explode não pode derrubar o worker: o próximo tick
        // pode encontrar o banco de volta. Cair aqui transformaria uma queda
        // de rede de dois segundos em backlog parado até alguém reiniciar.
        console.error("[assincrono] erro na passada:", e instanceof Error ? e.message : e);
      }
      // Espera DEPOIS de trabalhar: passadas nunca se sobrepõem.
      if (rodando) await dormir(cfg.tick_ms);
    }
  };

  const loop = laco();

  const encerrar = (sinal: string) => {
    console.log(`[assincrono] ${sinal} recebido, encerrando`);
    rodando = false;
    void runtime.stop(cfg.shutdown_timeout_ms).then(async (r) => {
      await loop;
      await cliente.close();
      console.log(
        `[assincrono] encerrado ${r.graceful ? "graciosamente" : `à força: ${r.reason}`}`,
      );
      process.exit(r.graceful ? 0 : 1);
    });
  };

  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGINT", () => encerrar("SIGINT"));

  await loop;
}

void main().catch((e) => {
  console.error("[assincrono] falha fatal no boot:", e);
  process.exit(1);
});
