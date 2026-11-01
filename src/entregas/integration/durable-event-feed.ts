/**
 * Feed duravel de Entregas sobre a outbox publica commitada.
 *
 * A fronteira le somente `OutboxRepository.all()`; nao conhece JSON nem
 * agregados. No arquivo, o feed so reabre a loja quando ela MUDOU: o ciclo
 * ocioso do consumidor (cursor no fim, nada novo) relia, analisava e copiava o
 * `store.json` inteiro a cada segundo — custo que crescia com o historico.
 * E so o trecho devolvido e copiado, nunca a outbox inteira.
 */

import { statSync } from "node:fs";

import type { EntregasEventFeed } from "../contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../contracts/events/types";
import type { OutboxRecord } from "./outbox";
import type { OutboxRepository } from "../persistence/ports";
import { openFileUnitOfWork } from "../persistence/file-store";

export class EntregasFeedCursorNotFound extends Error {
  constructor(readonly cursor: string) {
    super(
      "cursor " +
        JSON.stringify(cursor) +
        " nao existe no snapshot duravel; recusado para nao pular historico",
    );
    this.name = "EntregasFeedCursorNotFound";
  }
}

/** O feed so chama `all()`: qualquer outbox completa serve. */
export type OutboxReader = Pick<OutboxRepository, "all">;

export type OutboxReaderFactory =
  () => OutboxReader | Promise<OutboxReader>;

export class CommittedOutboxEntregasEventFeed implements EntregasEventFeed {
  constructor(private readonly openOutbox: OutboxReaderFactory) {}

  async list(options?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    if (
      options?.limit !== undefined &&
      (!Number.isInteger(options.limit) || options.limit <= 0)
    ) {
      throw new Error("entregas_feed_limit_invalid");
    }
    const outbox = await this.openOutbox();
    const all = await outbox.all();
    let start = 0;

    if (options?.after_event_id) {
      const idx = all.findIndex(
        (r) => r.event.event_id === options.after_event_id,
      );
      if (idx < 0) {
        throw new EntregasFeedCursorNotFound(options.after_event_id);
      }
      start = idx + 1;
    }

    const end = options?.limit === undefined ? all.length : start + options.limit;
    // So o trecho devolvido e copiado: quem consome nao toca no que foi lido.
    return all.slice(start, end).map((r) => structuredClone(r.event));
  }

  async poll(
    cursor: string | null,
    limit = 50,
  ): Promise<{
    events: EntregasPublicEvent[];
    next_cursor: string | null;
  }> {
    const events = await this.list({
      after_event_id: cursor ?? undefined,
      limit,
    });
    return {
      events,
      next_cursor: events.length
        ? events[events.length - 1].event_id
        : cursor,
    };
  }
}

/**
 * Leitura com atestação, para a fronteira de procedência da plataforma.
 *
 * Mesmo snapshot, mesma ordem e mesmo cursor de `poll`; só acrescenta a
 * atestação e a identidade do registro (`outbox_id`). Nada aqui verifica:
 * quem consome decide.
 */
export interface ItemDoFeedAtestavel {
  readonly source_ref: string;
  readonly event: EntregasPublicEvent;
  readonly attestation: string | null;
}

export class CommittedOutboxAttestableFeed extends CommittedOutboxEntregasEventFeed {
  constructor(private readonly openRecords: OutboxReaderFactory) {
    super(openRecords);
  }

  async pollAtestavel(
    cursor: string | null,
    limit = 50,
  ): Promise<{ itens: ItemDoFeedAtestavel[]; next_cursor: string | null }> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("entregas_feed_limit_invalid");
    }
    const outbox = await this.openRecords();
    const all = await outbox.all();
    let start = 0;
    if (cursor !== null) {
      const idx = all.findIndex((r) => r.event.event_id === cursor);
      if (idx < 0) throw new EntregasFeedCursorNotFound(cursor);
      start = idx + 1;
    }
    const records = all.slice(start, start + limit).map((r) => structuredClone(r));
    const itens = records.map((r) => ({
      source_ref: r.outbox_id,
      event: r.event,
      attestation: typeof r.attestation === "string" ? r.attestation : null,
    }));
    return {
      itens,
      next_cursor: itens.length ? itens[itens.length - 1].event.event_id : cursor,
    };
  }
}

/** Identidade do arquivo naquele instante, e o `mtime` em milissegundos. */
interface AssinaturaDoArquivo {
  readonly chave: string;
  readonly mtimeMs: number;
}

/**
 * A loja grava por `rename` (inode novo a cada commit), e qualquer escrita no
 * lugar muda tamanho ou `ctime`/`mtime`. Sem `stat` legível: null, e o feed relê.
 */
function assinaturaDoArquivo(path: string): AssinaturaDoArquivo | null {
  try {
    const s = statSync(path, { bigint: true });
    return {
      chave: [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":"),
      mtimeMs: Number(s.mtimeNs / 1_000_000n),
    };
  } catch {
    return null;
  }
}

/**
 * Quanto tempo o arquivo precisa estar PARADO para a leitura ficar em memória.
 * O relógio de arquivo é grosso — milissegundos no Linux, 2 s no FAT: duas
 * escritas no mesmo tique, no mesmo lugar e com o mesmo tamanho, deixariam a
 * mesma assinatura. Arquivo mexido há menos que isto é sempre relido (a regra
 * das entradas "racy" do Git). O ciclo ocioso de verdade — nada novo há mais
 * de alguns segundos — é o caso que importa, e ele fica em memória.
 */
export const ESTABILIDADE_DO_ARQUIVO_MS = 3_000;

/**
 * Leitor da outbox do arquivo que só reabre a loja quando ela mudou. A memória
 * só vale se a assinatura for a MESMA antes e depois da leitura e se o arquivo
 * estiver parado há `estabilidade_ms` — um commit no meio da leitura, ou logo
 * antes dela, descarta o que foi lido da memória.
 */
export function leitorDaOutboxDoArquivo(
  dataFile: string,
  opcoes: {
    abrir?: () => OutboxReader;
    estabilidade_ms?: number;
    agora?: () => number;
  } = {},
): OutboxReaderFactory {
  const abrir = opcoes.abrir ?? (() => openFileUnitOfWork(dataFile).outbox);
  const estabilidade = opcoes.estabilidade_ms ?? ESTABILIDADE_DO_ARQUIVO_MS;
  const agora = opcoes.agora ?? Date.now;
  let memoria: { chave: string; registros: readonly OutboxRecord[] } | null = null;
  return async () => {
    const antes = assinaturaDoArquivo(dataFile);
    if (antes !== null && memoria !== null && memoria.chave === antes.chave) {
      const registros = memoria.registros;
      return { all: async () => [...registros] };
    }
    memoria = null;
    const registros = await abrir().all();
    const depois = assinaturaDoArquivo(dataFile);
    if (antes !== null && depois !== null && depois.chave === antes.chave
        && agora() - antes.mtimeMs >= estabilidade) {
      memoria = { chave: antes.chave, registros };
    }
    return { all: async () => [...registros] };
  };
}

export interface OpcoesDoFeedDoArquivo {
  /** Teste: quem abre a outbox (padrão: uma `FileUnitOfWork` nova). */
  readonly abrir?: () => OutboxReader;
  readonly estabilidade_ms?: number;
  readonly agora?: () => number;
}

export function createFileEntregasAttestableFeed(
  dataFile: string,
  opcoes?: OpcoesDoFeedDoArquivo,
): CommittedOutboxAttestableFeed {
  return new CommittedOutboxAttestableFeed(leitorDaOutboxDoArquivo(dataFile, opcoes));
}

export function createFileEntregasEventFeed(
  dataFile: string,
  opcoes?: OpcoesDoFeedDoArquivo,
): EntregasEventFeed {
  return new CommittedOutboxEntregasEventFeed(leitorDaOutboxDoArquivo(dataFile, opcoes));
}
