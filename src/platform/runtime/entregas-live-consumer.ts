/**
 * Consumer live-capable do feed público de Entregas.
 *
 * IMPORTANTE: este módulo NÃO é ligado ao async-runtime nesta etapa.
 * Ele prova a mecânica que será usada quando existir um feed durável real.
 *
 * Barreiras independentes:
 *  1. feature flag enabled;
 *  2. kill switch dinâmico — fail-closed;
 *  3. procedência (opcional, desligada por padrão): cada registro é julgado
 *     contra o registro de produtores ANTES do adapter; recusa vira
 *     quarentena durável, indisponibilidade não avança nada;
 *  4. nenhum evento `real` é gravado por este processo, com ou sem (3);
 *  5. persistência transacional na plataforma antes de avançar checkpoint.
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
import type { EntregasPublicEvent } from "../../entregas/contracts/events/types";
import { adaptarEventoPublicoEntregas } from "../ingest/entregas-shadow-adapter";
import type {
  ItemAtestavel,
  ProcedenciaDoConsumidor,
  RegistroDeAdmissao,
  VereditoDeProcedencia,
} from "../ingest/fronteira-de-procedencia";
import {
  ingerir,
  type EscritorTransacional,
} from "../ingest/ingest-service";

export const ENTREGAS_LIVE_CONSUMER_VERSION =
  "entregas-live-consumer@0.2.0-shadow";

/** Motivo de isolamento de todo evento que declara `real` neste processo. */
export const MOTIVO_REAL_SEM_AUTORIDADE = "source_mode_real_sem_autoridade_de_mundo";

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
  /** Ausente em estado gravado antes da fronteira de procedência = 0. */
  readonly quarantined_count?: number;
  readonly last_quarantine?: ConsumerIsolation;
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
  if (
    x.quarantined_count !== undefined &&
    (!Number.isInteger(x.quarantined_count) || x.quarantined_count < 0)
  ) {
    throw new Error("entregas_consumer_state_quarantined_count");
  }
  return {
    version: 1,
    checkpoint: x.checkpoint ?? null,
    isolated_count: x.isolated_count ?? 0,
    updated_at: x.updated_at ?? null,
    ...(x.last_isolation ? { last_isolation: x.last_isolation } : {}),
    ...(x.quarantined_count !== undefined ? { quarantined_count: x.quarantined_count } : {}),
    ...(x.last_quarantine ? { last_quarantine: x.last_quarantine } : {}),
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
  /** Presente só quando a fronteira de procedência está ligada. */
  quarantined?: number;
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
  /**
   * Fronteira de procedência. Ausente = comportamento anterior (exceto que
   * `real` nunca é gravado). Presente = o feed é lido por `pollAtestavel` e
   * `feed` não é usado.
   */
  procedencia?: ProcedenciaDoConsumidor;
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

    // Sem procedência, o feed entrega o evento como veio. Com procedência,
    // cada item traz a atestação e é julgado ANTES do adapter.
    const procedencia = this.deps.procedencia;
    let itens: Array<{ cursor: string; publico: EntregasPublicEvent; atestavel?: ItemAtestavel }>;
    try {
      if (procedencia) {
        const lote = await procedencia.pollAtestavel(state.checkpoint, this.batchSize);
        itens = lote.itens.map((i) => ({ cursor: i.event.event_id, publico: i.event, atestavel: i }));
      } else {
        const lote = await this.deps.feed.poll(state.checkpoint, this.batchSize);
        itens = lote.events.map((e) => ({ cursor: e.event_id, publico: e }));
      }
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

    if (!itens.length) {
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
    let quarantined = 0;
    let checkpoint = state.checkpoint;
    let persistedCheckpoint = state.checkpoint;
    let isolatedTotal = state.isolated_count;
    let quarantinedTotal = state.quarantined_count ?? 0;
    let lastIsolation = state.last_isolation;
    let lastQuarantine = state.last_quarantine;

    const parcial = (
      status: LiveConsumerTickStatus,
      error?: string,
    ): LiveConsumerTickResult => ({
      status,
      pulled: itens.length,
      ingested,
      duplicates,
      isolated,
      ...(procedencia ? { quarantined } : {}),
      checkpoint: persistedCheckpoint,
      ...(error !== undefined ? { error } : {}),
    });

    // Persiste o checkpoint do evento já decidido. Erro devolvido, nunca
    // engolido: o fato pode estar durável e o cursor, não.
    const salvar = async (): Promise<string | null> => {
      try {
        await this.deps.state.save({
          version: 1,
          checkpoint,
          isolated_count: isolatedTotal,
          updated_at: this.now().toISOString(),
          ...(lastIsolation ? { last_isolation: lastIsolation } : {}),
          ...(procedencia || quarantinedTotal > 0 ? { quarantined_count: quarantinedTotal } : {}),
          ...(lastQuarantine ? { last_quarantine: lastQuarantine } : {}),
        });
        persistedCheckpoint = checkpoint;
        return null;
      } catch (e) {
        return "checkpoint_write_failed:" + (e instanceof Error ? e.message : String(e));
      }
    };

    const isolar = async (
      e: EntregasPublicEvent,
      reason: string,
    ): Promise<string | null> => {
      isolated += 1;
      isolatedTotal += 1;
      lastIsolation = {
        event_id: e.event_id,
        event_type: e.event_type,
        reason,
        at: this.now().toISOString(),
      };
      return salvar();
    };

    for (const item of itens) {
      if (this.stopping) return parcial("stopping");
      if (!(await this.deps.control.canRun())) return parcial("killed");

      let evento = item.publico;
      let escritor = this.deps.writer;
      let admissao: RegistroDeAdmissao | null = null;

      if (procedencia && item.atestavel) {
        let veredito: VereditoDeProcedencia;
        try {
          veredito = await procedencia.julgar(item.atestavel, this.now());
        } catch (e) {
          veredito = {
            tipo: "indisponivel",
            codigo: e instanceof Error ? e.message : String(e),
          };
        }

        // Não sabemos: não grava, não avança. Quarentena aqui descartaria
        // evento legítimo por causa de uma falha nossa.
        if (veredito.tipo === "indisponivel") {
          return parcial("failed", "procedencia_indisponivel:" + veredito.codigo);
        }

        if (veredito.tipo === "quarentena") {
          try {
            await procedencia.quarentenar(veredito.registro);
          } catch (e) {
            return parcial(
              "failed",
              "quarentena_write_failed:" + (e instanceof Error ? e.message : String(e)),
            );
          }
          quarantined += 1;
          quarantinedTotal += 1;
          lastQuarantine = {
            event_id: item.cursor,
            event_type: typeof item.publico.event_type === "string" ? item.publico.event_type : "",
            reason: veredito.registro.reason,
            at: this.now().toISOString(),
          };
          checkpoint = item.cursor;
          const erro = await salvar();
          if (erro) return parcial("failed", erro);
          continue;
        }

        evento = veredito.evento;
        admissao = veredito.registro;
        escritor = procedencia.escritor(admissao);
      }

      // Nenhum caminho deste processo grava `real`: com ou sem procedência,
      // não existe autoridade de mundo que o prove (contrato de 16/10, §3).
      if (evento.source_mode === "real") {
        checkpoint = item.cursor;
        const erro = await isolar(evento, MOTIVO_REAL_SEM_AUTORIDADE);
        if (erro) return parcial("failed", erro);
        continue;
      }

      const adaptado = adaptarEventoPublicoEntregas(evento);

      if (!adaptado.ok) {
        // Sinal independente admitido: a origem positiva fica registrada,
        // sem inventar domain_event nem fato de Trip.
        if (admissao && procedencia) {
          try {
            await procedencia.admitirSemFato(admissao);
          } catch (e) {
            return parcial(
              "failed",
              "admissao_write_failed:" + (e instanceof Error ? e.message : String(e)),
            );
          }
        }
        checkpoint = item.cursor;
        const erro = await isolar(evento, adaptado.motivo);
        if (erro) return parcial("failed", erro);
        continue;
      }

      const resultado = await ingerir([adaptado.evento], {
        escritor,
        recebido_em: this.now(),
      });

      // O adapter prometeu produzir envelope roteável e válido. Se a ingestão
      // o recusa, avançar o checkpoint esconderia uma regressão.
      if (!resultado.aceito || resultado.recusados.length > 0) {
        return parcial(
          "failed",
          resultado.erro?.code ??
            resultado.recusados[0]?.motivo ??
            "entregas_consumer_ingest_rejected",
        );
      }

      ingested += resultado.gravados;
      duplicates += resultado.duplicados;
      checkpoint = item.cursor;

      // O fato já pode estar durável. Não mentimos que o checkpoint avançou.
      // No restart ele será relido e a idempotência do event_log o absorve.
      const erro = await salvar();
      if (erro) return parcial("failed", erro);
    }

    return parcial("worked");
  }
}
