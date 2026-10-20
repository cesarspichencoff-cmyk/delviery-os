/**
 * Processo separado: feed público de Entregas -> event_log/outbox da plataforma.
 *
 * NÃO faz parte do async-runtime e NÃO é ativado por padrão.
 */
import {
  createFileEntregasAttestableFeed,
  createFileEntregasEventFeed,
} from "../../entregas/integration/durable-event-feed";
import { loadEntregasSourceIngestConfig } from "../config/entregas-source-ingest-config";
import { loadPlatformConfig, describe } from "../config/platform-config";
import { FronteiraDeProcedencia } from "../ingest/fronteira-de-procedencia";
import { createPgClient } from "../persistence/sql-client";
import { PgTransactionalWriter } from "../persistence/pg-repositories";
import {
  PgLivroDeAdmissoes,
  PgRegistroDeProdutores,
} from "../persistence/pg-producer-attestation";
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
      producer_attestation: source.producer_attestation,
    }),
  );

  const client = await createPgClient({
    url: platform.database_url,
    ssl: platform.database_ssl,
    host_privado: platform.database_private_host,
    max: 2,
  });

  // Exigida, a fronteira precisa existir ANTES do primeiro poll: tabelas da
  // 0010 e permissão do papel. Ausente = recusa o boot, nunca consumo sem ela.
  let procedencia: FronteiraDeProcedencia | undefined;
  if (source.producer_attestation === "required") {
    try {
      await client.query("SELECT producer_id FROM platform.producer_key LIMIT 0");
      await client.query("SELECT envelope_sha256 FROM platform.producer_admission LIMIT 0");
    } catch {
      console.error("[source-ingest] fronteira de procedencia exigida e indisponivel: boot recusado");
      await client.close();
      process.exit(78);
    }
    procedencia = new FronteiraDeProcedencia({
      feed: createFileEntregasAttestableFeed(source.source_file),
      registro: new PgRegistroDeProdutores(client),
      livro: new PgLivroDeAdmissoes(client),
    });
  }

  const consumer = new EntregasLiveConsumer({
    enabled: true,
    ...(procedencia ? { procedencia } : {}),
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
