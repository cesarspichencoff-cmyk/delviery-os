/**
 * Processo separado: feed público de Entregas -> event_log/outbox da plataforma.
 *
 * NÃO faz parte do async-runtime e NÃO é ativado por padrão.
 */
import { createFileEntregasEventFeed } from "../../entregas/integration/durable-event-feed";
import { loadEntregasSourceIngestConfig } from "../config/entregas-source-ingest-config";
import { loadPlatformConfig, describe } from "../config/platform-config";
import { createPgClient } from "../persistence/sql-client";
import { PgTransactionalWriter } from "../persistence/pg-repositories";
import {
  EntregasLiveConsumer,
  FileConsumerStateStore,
  FileLiveConsumerControl,
} from "../runtime/entregas-live-consumer";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitDisabled(): Promise<void> {
  let running = true;
  const stop = () => { running = false; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  // Só anuncia "DESLIGADO" depois de estar pronto para encerrar graciosamente.
  console.log("[source-ingest] DESLIGADO — nenhuma fonte ou banco foi aberto");
  while (running) await sleep(250);
}

async function main(): Promise<void> {
  const source = loadEntregasSourceIngestConfig(process.env);
  if (!source.enabled) {
    await waitDisabled();
    return;
  }

  const platform = loadPlatformConfig(process.env);
  console.log(
    "[source-ingest] iniciando",
    JSON.stringify({
      ...describe(platform),
      source_file: source.source_file,
      state_file: source.state_file,
      control_file: source.control_file,
      batch_size: source.batch_size,
    }),
  );

  const client = await createPgClient({
    url: platform.database_url,
    ssl: platform.database_ssl,
    host_privado: platform.database_private_host,
    max: 2,
  });

  const consumer = new EntregasLiveConsumer({
    enabled: true,
    feed: createFileEntregasEventFeed(source.source_file),
    writer: new PgTransactionalWriter(client),
    state: new FileConsumerStateStore(source.state_file),
    control: new FileLiveConsumerControl(source.control_file),
    batch_size: source.batch_size,
  });

  let running = true;
  const stop = () => {
    running = false;
    consumer.stop();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    while (running) {
      const result = await consumer.tick();
      if (result.status !== "idle") {
        console.log("[source-ingest] tick", JSON.stringify(result));
      }
      if (running) await sleep(source.tick_ms);
    }
  } finally {
    await client.close();
    console.log("[source-ingest] encerrado");
  }
}

void main().catch((e) => {
  console.error(
    "[source-ingest] falha fatal:",
    e instanceof Error ? e.message : String(e),
  );
  process.exit(78);
});
