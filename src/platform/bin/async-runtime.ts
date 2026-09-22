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
import { montarEspinhaDeInteligencia } from "../runtime/intelligence-spine";

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

  /**
   * A espinha de inteligência.
   *
   * Só é montada quando a flag liga — desligada, nem o módulo do Conference
   * Brain é exigido do disco, e o worker sobe exatamente como subia antes.
   *
   * Ela roda DEPOIS do `tick()`, fora do `try` dele e fora dos handlers da
   * outbox. Essa posição é o desenho inteiro: é o que garante que uma falha
   * da inteligência não faça um fato operacional já processado voltar para
   * retry ou dead-letter.
   */
  const espinha = cfg.spine_enabled ? montarEspinhaDeInteligencia({ ponte: ponteOperacaoViva }) : null;
  if (espinha) console.log("[assincrono] espinha de inteligência LIGADA (não crítica)");

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

      // Fora do `try` do tick, de propósito: o resultado operacional acima já
      // está decidido e nada daqui pode revisá-lo. `executar()` não lança —
      // devolve o próprio estado, e é nele que a falha da inteligência mora.
      if (espinha) {
        const s = await espinha.executar();
        if (s.ultimo_erro && s.ultima_em === s.ultimo_erro.em) {
          console.error(
            "[assincrono] espinha falhou (contida)",
            JSON.stringify({ classe: s.ultimo_erro.classe, escopo: s.ultimo_erro.escopo, falhas: s.falhas }),
          );
        } else if (s.escopos_vistos > 0) {
          console.log(
            "[assincrono] espinha",
            JSON.stringify({
              escopos: s.escopos_vistos,
              conclusoes: s.conclusoes_lidas,
              recusas: s.recusas,
              recomendacoes_ativas: s.recomendacoes_ativas,
            }),
          );
        }
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
