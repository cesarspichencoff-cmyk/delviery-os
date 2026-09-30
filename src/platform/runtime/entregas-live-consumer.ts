/**
 * Consumer live-capable do feed público de Entregas.
 *
 * IMPORTANTE: este módulo NÃO é ligado ao async-runtime nesta etapa.
 * Ele prova a mecânica que será usada quando existir um feed durável real.
 *
 * Três barreiras independentes:
 *  1. feature flag enabled;
 *  2. kill switch dinâmico — fail-closed;
 *  3. persistência transacional na plataforma antes de avançar checkpoint.
 *
 * O checkpoint não é a verdade da operação. Ele só marca até onde o feed foi
 * lido. A verdade derivada continua sendo reconstruída de platform.event_log.
 */

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import type { EntregasEventFeed } from "../../entregas/contracts/EntregasEventFeed";
import { adaptarEventoPublicoEntregas } from "../ingest/entregas-shadow-adapter";
import {
  ingerir,
  type EscritorTransacional,
} from "../ingest/ingest-service";

export const ENTREGAS_LIVE_CONSUMER_VERSION =
  "entregas-live-consumer@0.1.0-shadow";

export interface ConsumerIsolation {
  readonly event_id: string;
  readonly event_type: string;
  readonly reason: string;
  readonly at: string;
}

export interface ConsumerCheckpointState {
  readonly version: 1;
  readonly checkpoint: string | null;
  readonly isolated_count: number;
  readonly updated_at: string | null;
  readonly last_isolation?: ConsumerIsolation;
}

const ESTADO_INICIAL: ConsumerCheckpointState = {
  version: 1,
  checkpoint: null,
  isolated_count: 0,
  updated_at: null,
};

export interface ConsumerStateStore {
  load(): Promise<ConsumerCheckpointState>;
  save(state: ConsumerCheckpointState): Promise<void>;
}

function validarEstado(raw: unknown): ConsumerCheckpointState {
  if (!raw || typeof raw !== "object") {
    throw new Error("entregas_consumer_state_corrupt");
  }
  const x = raw as Partial<ConsumerCheckpointState>;
  if (x.version !== 1) throw new Error("entregas_consumer_state_version");
  if (x.checkpoint !== null && typeof x.checkpoint !== "string") {
    throw new Error("entregas_consumer_state_checkpoint");
  }
  if (!Number.isInteger(x.isolated_count) || (x.isolated_count ?? -1) < 0) {
    throw new Error("entregas_consumer_state_isolated_count");
  }
  if (x.updated_at !== null && typeof x.updated_at !== "string") {
    throw new Error("entregas_consumer_state_updated_at");
  }
  return {
    version: 1,
    checkpoint: x.checkpoint ?? null,
    isolated_count: x.isolated_count ?? 0,
    updated_at: x.updated_at ?? null,
    ...(x.last_isolation ? { last_isolation: x.last_isolation } : {}),
  };
}

/**
 * Estado pequeno, local e atômico.
 *
 * Escrita: temp -> rename. Se o processo morrer antes do rename, o estado
 * anterior continua inteiro. Se morrer depois, o novo está inteiro.
 */
export class FileConsumerStateStore implements ConsumerStateStore {
  private seq = 0;

  constructor(readonly file: string) {}

  async load(): Promise<ConsumerCheckpointState> {
    try {
      const texto = await readFile(this.file, "utf8");
      return validarEstado(JSON.parse(texto));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...ESTADO_INICIAL };
      }
      throw e;
    }
  }

  async save(state: ConsumerCheckpointState): Promise<void> {
    const valido = validarEstado(state);
    await mkdir(dirname(this.file), { recursive: true });
    const nome = this.file.split(/[\\/]/).pop() ?? "consumer.json";
    const temp = join(
      dirname(this.file),
      "." + nome + "." + process.pid + "." + (++this.seq) + ".tmp",
    );
    await writeFile(temp, JSON.stringify(valido) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temp, this.file);
  }
}

export interface LiveConsumerControl {
  canRun(): Promise<boolean>;
}

/**
 * Kill switch operacional, consultado a cada fronteira de evento.
 *
 * Somente o conteúdo exato RUN libera. Arquivo ausente, ilegível, vazio,
 * STOP ou qualquer outro conteúdo = parado. Portanto perder o volume de
 * controle não liga nada por acidente.
 */
export class FileLiveConsumerControl implements LiveConsumerControl {
  constructor(readonly file: string) {}

  async canRun(): Promise<boolean> {
    try {
      return (await readFile(this.file, "utf8")).trim() === "RUN";
    } catch {
      return false;
    }
  }
}

export type LiveConsumerTickStatus =
  | "disabled"
  | "killed"
  | "stopping"
  | "idle"
  | "worked"
  | "failed";

export interface LiveConsumerTickResult {
  status: LiveConsumerTickStatus;
  pulled: number;
  ingested: number;
  duplicates: number;
  isolated: number;
  checkpoint: string | null;
  error?: string;
}

export interface EntregasLiveConsumerDeps {
  enabled: boolean;
  feed: EntregasEventFeed;
  writer: EscritorTransacional;
  state: ConsumerStateStore;
  control: LiveConsumerControl;
  batch_size?: number;
  now?: () => Date;
}

export class EntregasLiveConsumer {
  private readonly now: () => Date;
  private readonly batchSize: number;
  private stopping = false;
  private ticking = false;

  constructor(private readonly deps: EntregasLiveConsumerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.batchSize = deps.batch_size ?? 50;
    if (!Number.isInteger(this.batchSize) || this.batchSize <= 0) {
      throw new Error("entregas_consumer_batch_size_invalid");
    }
  }

  /**
   * Impede novo evento. Se um commit já começou, ele termina e o checkpoint
   * correspondente é salvo antes de o laço observar stopping.
   */
  stop(): void {
    this.stopping = true;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  async tick(): Promise<LiveConsumerTickResult> {
    if (this.ticking) {
      return {
        status: "failed",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: null,
        error: "entregas_consumer_tick_overlap",
      };
    }
    this.ticking = true;
    try {
      return await this.tickInner();
    } finally {
      this.ticking = false;
    }
  }

  private async tickInner(): Promise<LiveConsumerTickResult> {
    if (!this.deps.enabled) {
      return {
        status: "disabled",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: null,
      };
    }
    if (this.stopping) {
      return {
        status: "stopping",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: null,
      };
    }
    if (!(await this.deps.control.canRun())) {
      return {
        status: "killed",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: null,
      };
    }

    let state: ConsumerCheckpointState;
    try {
      state = await this.deps.state.load();
    } catch (e) {
      return {
        status: "failed",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    let lote: Awaited<ReturnType<EntregasEventFeed["poll"]>>;
    try {
      lote = await this.deps.feed.poll(state.checkpoint, this.batchSize);
    } catch (e) {
      return {
        status: "failed",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: state.checkpoint,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    if (!lote.events.length) {
      return {
        status: "idle",
        pulled: 0,
        ingested: 0,
        duplicates: 0,
        isolated: 0,
        checkpoint: state.checkpoint,
      };
    }

    let ingested = 0;
    let duplicates = 0;
    let isolated = 0;
    let checkpoint = state.checkpoint;
    let persistedCheckpoint = state.checkpoint;
    let isolatedTotal = state.isolated_count;
    let lastIsolation = state.last_isolation;

    for (const eventoPublico of lote.events) {
      if (this.stopping) {
        return {
          status: "stopping",
          pulled: lote.events.length,
          ingested,
          duplicates,
          isolated,
          checkpoint: persistedCheckpoint,
        };
      }
      if (!(await this.deps.control.canRun())) {
        return {
          status: "killed",
          pulled: lote.events.length,
          ingested,
          duplicates,
          isolated,
          checkpoint: persistedCheckpoint,
        };
      }

      const adaptado = adaptarEventoPublicoEntregas(eventoPublico);

      if (!adaptado.ok) {
        isolated += 1;
        isolatedTotal += 1;
        lastIsolation = {
          event_id: eventoPublico.event_id,
          event_type: eventoPublico.event_type,
          reason: adaptado.motivo,
          at: this.now().toISOString(),
        };
        checkpoint = eventoPublico.event_id;
        try {
          await this.deps.state.save({
            version: 1,
            checkpoint,
            isolated_count: isolatedTotal,
            updated_at: this.now().toISOString(),
            last_isolation: lastIsolation,
          });
          persistedCheckpoint = checkpoint;
        } catch (e) {
          return {
            status: "failed",
            pulled: lote.events.length,
            ingested,
            duplicates,
            isolated,
            checkpoint: persistedCheckpoint,
            error:
              "checkpoint_write_failed:" +
              (e instanceof Error ? e.message : String(e)),
          };
        }
        continue;
      }

      const resultado = await ingerir([adaptado.evento], {
        escritor: this.deps.writer,
        recebido_em: this.now(),
      });

      // O adapter prometeu produzir envelope roteável e válido. Se a ingestão
      // o recusa, avançar o checkpoint esconderia uma regressão.
      if (!resultado.aceito || resultado.recusados.length > 0) {
        return {
          status: "failed",
          pulled: lote.events.length,
          ingested,
          duplicates,
          isolated,
          checkpoint: persistedCheckpoint,
          error:
            resultado.erro?.code ??
            resultado.recusados[0]?.motivo ??
            "entregas_consumer_ingest_rejected",
        };
      }

      ingested += resultado.gravados;
      duplicates += resultado.duplicados;
      checkpoint = eventoPublico.event_id;

      try {
        await this.deps.state.save({
          version: 1,
          checkpoint,
          isolated_count: isolatedTotal,
          updated_at: this.now().toISOString(),
          ...(lastIsolation ? { last_isolation: lastIsolation } : {}),
        });
        persistedCheckpoint = checkpoint;
      } catch (e) {
        // O fato já pode estar durável. Não mentimos que o checkpoint avançou.
        // No restart ele será relido e a idempotência do event_log o absorve.
        return {
          status: "failed",
          pulled: lote.events.length,
          ingested,
          duplicates,
          isolated,
          checkpoint: persistedCheckpoint,
          error:
            "checkpoint_write_failed:" +
            (e instanceof Error ? e.message : String(e)),
        };
      }
    }

    return {
      status: "worked",
      pulled: lote.events.length,
      ingested,
      duplicates,
      isolated,
      checkpoint: persistedCheckpoint,
    };
  }
}
