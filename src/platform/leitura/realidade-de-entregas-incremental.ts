/**
 * Leitura INCREMENTAL da realidade de Entregas — o contrato de
 * `lerRealidadeDeEntregas` sem carregar o event log inteiro na memória.
 *
 * Q-026 (aberta): esta porta NÃO decide janela, retenção nem o bloco legado.
 * Com opt-in HTTP explícito ela relê o MESMO histórico que a porta canônica, com memória limitada
 * pelo número de viagens em vez do número de fatos. Não está ligada a rota
 * nenhuma: quem a liga é uma decisão separada.
 *
 * O QUE ELA GARANTE, E POR QUAL MECANISMO
 *
 * - **Um instante só.** Fatos, cadastro de aparelhos, último lote e contagens
 *   saem de UMA transação `REPEATABLE READ, READ ONLY`, aberta por este módulo
 *   (o `SET TRANSACTION` é o primeiro comando). Escrita nesta conexão é
 *   recusada pelo PostgreSQL. Falha em qualquer ponto: o cliente faz ROLLBACK
 *   (o cursor fecha junto) e nada parcial é devolvido.
 *
 * - **Memória limitada pelo lote, não pelo log.** Os fatos chegam por cursor,
 *   em `FETCH FORWARD n` com `n` validado. Cada lote passa pelo decodificador
 *   CANÔNICO da Q-016 (`lerFatosParaReplayNaTransacao`, sem cópia nem
 *   alteração) e alimenta um acumulador de tamanho fixo por viagem. Sem
 *   `ORDER BY`: o acumulador não depende da ordem, então não há ordenação no
 *   banco nem dependência de colação.
 *
 * - **Os campos da viagem são os de `projetar`.** Estado (maior posto de
 *   transição), último fato, última posição confiável, aparelho (o do ÚLTIMO
 *   fato na ordem de aplicação, empate para o que chegou depois), ocorrências,
 *   contagem e frescor seguem a mesma regra da projeção — e um teste compara
 *   o acumulador com a função `projetar` real, por propriedade.
 *
 * O QUE ELA NÃO ENTREGA — declarado, não escondido
 *
 * - `eventos` de cada viagem é um CONTADOR: só `length` responde. Ler um id,
 *   iterar ou serializar lança `IDS_FORENSES_NAO_CARREGADOS`. Os ids continuam
 *   no replay da Q-016 (`lerFatosParaReplay`), que este módulo não substitui.
 * - `versao` é `realidade-de-entregas-incremental@…`: a saída nunca se passa
 *   pela da porta canônica.
 * - Memória NÃO é O(1): um acumulador por viagem, e o número de viagens cresce
 *   com o histórico. O instante fica aberto do primeiro comando ao COMMIT e,
 *   nesse tempo, segura o horizonte do VACUUM (`backend_xmin`).
 *
 * Precondição herdada do schema: `idempotency_key` é UNIQUE no event log, por
 * isso o acumulador não precisa deduplicar (a projeção deduplica por ela).
 */

import { performance } from "node:perf_hooks";

import type { SqlClient, SqlRow, TransactionalSqlClient } from "../persistence/sql-client";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../contracts/event-catalog";
import { instanteConfiavel, relogioEfetivo } from "../contracts/relogio";
import { lerFatosParaReplayNaTransacao, type LeituraParaReplay } from "../projections/replay-do-event-log";
import { classificarFrescor, type EstadoViagem, type ViagemProjetada } from "../projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "../runtime/handler-operacao-viva";
import { PORTA_DE_REALIDADE_VERSION, type AparelhoReal, type RealidadeDeEntregas, type UltimoLote } from "./realidade-de-entregas";

/** Maintain the presentation-only narrow type of the clean candidate. */
export type ViagemParaApresentacao = Omit<ViagemProjetada,"eventos"> & {
  readonly eventos: Readonly<{ length: number }>;
};
export type RealidadeParaApresentacao = Omit<RealidadeDeEntregas,"projecoes"> & {
  readonly projecoes: readonly {
    readonly unit_id: string;
    readonly source_mode: SourceMode;
    readonly viagens: readonly ViagemParaApresentacao[];
  }[];
};

export const LEITURA_INCREMENTAL_VERSION = "realidade-de-entregas-incremental@1.0.0";

/** Linhas por `FETCH`. Ver o relatório da medição antes de mudar. */
export const LOTE_PADRAO = 257;
export const LOTE_MAXIMO = 20_000;

/** Prefixo do erro de quem tenta ler um id de evento desta leitura. */
export const IDS_FORENSES_NAO_CARREGADOS = "IDS_FORENSES_NAO_CARREGADOS";

const CURSOR = "q026_leitura_incremental";

// As MESMAS colunas que a porta da Q-016 lê, para o MESMO decodificador.
const SQL_CURSOR = `DECLARE ${CURSOR} NO SCROLL CURSOR FOR
  SELECT event_id, unit_id, object_type, object_id, event_type, occurred_at, origin,
         device_id, sequence_local, idempotency_key, contract_version, source_mode,
         recorded_at, clock_trust
    FROM platform.event_log
   WHERE event_type = ANY($1)`;

export interface OpcoesDaLeituraIncremental {
  agora: Date;
  unit_id?: string;
  /** Linhas por `FETCH`, inteiro de 1 a `LOTE_MAXIMO`. Padrão: `LOTE_PADRAO`. */
  lote?: number;
  /** Recebe as medidas depois de uma leitura bem-sucedida. */
  medir?: (m: MedidasDaLeituraIncremental) => void;
}

export interface MedidasDaLeituraIncremental {
  lote: number;
  /** `FETCH` que trouxeram linhas. */
  lotes: number;
  maior_lote: number;
  /** Linhas dos tipos da Operação Viva que o cursor devolveu. */
  linhas: number;
  aptos: number;
  sem_modo: number;
  /** Linhas que o decodificador da Q-016 pôs em quarentena (a porta não as expõe; aqui só a contagem). */
  corrompidas: number;
  escopos: number;
  viagens: number;
  aparelhos: number;
  /** Do primeiro comando ao último SELECT: o tempo em que o instante MVCC fica aberto. */
  instantaneo_ms: number;
  /** A chamada inteira de `transaction()`: espera de conexão, BEGIN, leitura e COMMIT. */
  transacao_ms: number;
  /** CPU depois do COMMIT: mapear aparelhos e montar escopos. */
  montagem_ms: number;
}

/* ------------------------------------------------------------------ *
 * O acumulador de uma viagem — espelho de `projetar`, campo a campo
 * ------------------------------------------------------------------ */

// Espelho de `TRANSICAO` e `RANK` de `projections/operacao-viva.ts`, que não
// os exporta. `Record<EstadoViagem, …>` faz o compilador acusar estado novo;
// transição nova é acusada pelo teste de equivalência com `projetar`.
const TRANSICAO: Readonly<Record<string, EstadoViagem>> = {
  trip_created: "criada",
  trip_started: "em_rota",
  arrival_detected: "chegou",
  delivery_confirmed: "entregue",
  trip_return_started: "retornando",
  trip_returned: "retornou",
  trip_closed: "encerrada",
};
const RANK: Readonly<Record<EstadoViagem, number>> = {
  desconhecido: 0,
  criada: 1,
  em_rota: 2,
  chegou: 3,
  entregue: 4,
  retornando: 5,
  retornou: 6,
  encerrada: 7,
};

/** A posição de um fato na ordem de aplicação de `projetar`. */
interface Ordem {
  t: number;
  s: number;
  id: string;
}

/** O mesmo contrato de `compararEventos`: instante, sequência (`?? 0`), id por `localeCompare`. */
function compararOrdem(a: Ordem, b: Ordem): number {
  const ta = a.t - b.t;
  if (ta !== 0) return ta;
  const sa = a.s - b.s;
  if (sa !== 0) return sa;
  return a.id.localeCompare(b.id);
}

interface Acumulador {
  trip_id: string;
  unit_id: string;
  source_mode: SourceMode;
  estado: EstadoViagem;
  fatos: number;
  ocorrencias: number;
  ultimo_fato_em: string;
  ultimo_fato_ms: number;
  ultima_posicao_em: string | undefined;
  ultima_posicao_ms: number;
  /** O fato que fica por último na ordem de aplicação, entre os que nomeiam aparelho. */
  aparelho: { ordem: Ordem; device_id: string } | undefined;
  /** O primeiro fato na ordem de aplicação: decide a ordem entre viagens de `trip_id` empatado. */
  primeiro: Ordem;
}

function novoAcumulador(f: EventEnvelope, trip_id: string, ordem: Ordem): Acumulador {
  return {
    trip_id,
    unit_id: f.unit_id,
    source_mode: f.source_mode,
    estado: "desconhecido",
    fatos: 0,
    ocorrencias: 0,
    ultimo_fato_em: f.occurred_at,
    ultimo_fato_ms: ordem.t,
    ultima_posicao_em: undefined,
    ultima_posicao_ms: Number.NaN,
    aparelho: undefined,
    primeiro: ordem,
  };
}

function acumular(a: Acumulador, f: EventEnvelope, ordem: Ordem): void {
  const destino = TRANSICAO[f.event_type];
  if (destino && RANK[destino] > RANK[a.estado]) a.estado = destino;

  // Último fato: o maior instante; no empate fica o primeiro, como em `projetar`
  // (o texto é o mesmo: o decodificador reconstrói `occurred_at` por toISOString).
  if (ordem.t > a.ultimo_fato_ms) {
    a.ultimo_fato_em = f.occurred_at;
    a.ultimo_fato_ms = ordem.t;
  }

  // Frescor só nasce de tempo com autoridade — a mesma função da projeção.
  if (f.event_type === "gps_batch_received") {
    const instante = instanteConfiavel(f);
    if (instante) {
      const t = instante === f.occurred_at ? ordem.t : Date.parse(instante);
      if (a.ultima_posicao_em === undefined || t > a.ultima_posicao_ms) {
        a.ultima_posicao_em = instante;
        a.ultima_posicao_ms = t;
      }
    }
  }

  // `projetar` aplica `device_id ?? anterior` em ordem: vence o ÚLTIMO fato que
  // nomeia aparelho. Em empate total, a ordenação estável põe por último o que
  // chegou depois — por isso `>=`.
  if (f.device_id !== undefined && f.device_id !== null) {
    if (a.aparelho === undefined || compararOrdem(ordem, a.aparelho.ordem) >= 0) {
      a.aparelho = { ordem, device_id: f.device_id };
    }
  }

  if (compararOrdem(ordem, a.primeiro) < 0) a.primeiro = ordem;
  if (f.event_type === "occurrence_created") a.ocorrencias += 1;
  a.fatos += 1;
}

function recusaDeIds(n: number, p: PropertyKey): Error {
  return new Error(
    `${IDS_FORENSES_NAO_CARREGADOS}: a leitura incremental guarda só a contagem de eventos (${n}); ` +
      `os ids estão no replay da Q-016 (lerFatosParaReplay). Acesso pedido: ${String(p)}`,
  );
}

// UM manipulador para todas as viagens: com centenas de milhares de viagens
// curtas, um manipulador (e uma closure) por viagem pesava mais que os ids.
const SO_CONTAGEM: ProxyHandler<{ readonly length: number }> = {
  get(t, p) {
    if (p === "length") return t.length;
    throw recusaDeIds(t.length, p);
  },
  has(_t, p) {
    return p === "length";
  },
  ownKeys(t) {
    throw recusaDeIds(t.length, "ownKeys");
  },
  getOwnPropertyDescriptor(t, p) {
    throw recusaDeIds(t.length, p);
  },
};

/**
 * `eventos` desta leitura: só a contagem. Qualquer outro acesso falha alto —
 * um id faltando em silêncio seria pior que um erro. (`util.inspect` não
 * aciona armadilhas de Proxy: mostra `{ length: n }`.)
 */
function eventosSoContados(n: number): Readonly<{ length: number }> {
  return new Proxy(Object.freeze({ length: n }), SO_CONTAGEM);
}

function viagemDe(a: Acumulador, agora: Date): ViagemParaApresentacao {
  // As chaves na MESMA ordem em que `projetar` monta a viagem.
  return {
    trip_id: a.trip_id,
    unit_id: a.unit_id,
    estado: a.estado,
    device_id: a.aparelho?.device_id,
    ultimo_fato_em: a.ultimo_fato_em,
    ocorrencias_abertas: a.ocorrencias,
    source_mode: a.source_mode,
    eventos: eventosSoContados(a.fatos),
    ultima_posicao_em: a.ultima_posicao_em,
    frescor: classificarFrescor(a.ultima_posicao_em, agora),
  };
}

/* ------------------------------------------------------------------ *
 * O decodificador da Q-016, aplicado a um lote
 * ------------------------------------------------------------------ */

/**
 * Passa as linhas de UM lote pelo decodificador canônico, sem copiá-lo: ele
 * recebe um cliente que responde ao seu único SELECT com o lote. Se a porta
 * da Q-016 mudar de forma (outra consulta, contagem diferente), isto falha
 * fechado em vez de decodificar pela metade.
 */
async function decodificarLote(linhasDoLote: readonly SqlRow[]): Promise<LeituraParaReplay> {
  let consultas = 0;
  const doLote: SqlClient = {
    query: async <T extends SqlRow = SqlRow>(sql: string): Promise<T[]> => {
      consultas += 1;
      if (consultas !== 1 || !/^\s*SELECT\b[\s\S]*\bFROM\s+platform\.event_log\b/i.test(sql)) {
        throw new Error("DECODIFICADOR_Q016_MUDOU: a porta de replay passou a fazer outra consulta");
      }
      return linhasDoLote as T[];
    },
  };
  const d = await lerFatosParaReplayNaTransacao(doLote, TIPOS_DA_OPERACAO_VIVA);
  const n = linhasDoLote.length;
  if (consultas !== 1 || d.lidas !== n || d.aptos.length + d.sem_modo + d.corrompidas.length !== n) {
    throw new Error("DECODIFICADOR_Q016_MUDOU: o lote não foi contado inteiro");
  }
  return d;
}

/* ------------------------------------------------------------------ *
 * Aparelhos — o mesmo SQL e o mesmo mapeamento da porta canônica
 * ------------------------------------------------------------------ */

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function modo(v: unknown): SourceMode | null {
  return typeof v === "string" && (SOURCE_MODES as readonly string[]).includes(v) ? (v as SourceMode) : null;
}

function aparelhosDe(linhas: readonly SqlRow[], ultimos: readonly SqlRow[], contagens: readonly SqlRow[]): AparelhoReal[] {
  const ultimoPor = new Map<string, UltimoLote>();
  for (const u of ultimos) {
    ultimoPor.set(String(u.device_id), {
      occurred_at: iso(u.occurred_at)!,
      recorded_at: iso(u.recorded_at)!,
      relogio: relogioEfetivo({ occurred_at: u.occurred_at, received_at: u.recorded_at, clock_trust: u.clock_trust }),
      trip_id: u.object_type === "trip" ? String(u.object_id) : null,
      source_mode: modo(u.source_mode),
      correlation_id: u.correlation_id === null ? null : String(u.correlation_id),
    });
  }
  const contagemPor = new Map<string, Record<SourceMode, number>>();
  for (const c of contagens) {
    const id = String(c.device_id);
    const atual = contagemPor.get(id) ?? { real: 0, simulated: 0, control: 0 };
    const m = modo(c.source_mode);
    if (m) atual[m] += Number(c.n);
    contagemPor.set(id, atual);
  }
  return linhas.map((l) => ({
    device_id: String(l.device_id),
    unit_id: String(l.unit_id),
    actor_id: l.actor_id === null ? null : String(l.actor_id),
    label: String(l.label),
    autorizado_em: iso(l.registered_at)!,
    credencial_vinculada_em: iso(l.secret_bound_at),
    ultima_sessao_em: iso(l.last_session_at),
    app_version: l.app_version === null ? null : String(l.app_version),
    revogado_em: iso(l.revoked_at),
    fila_offline:
      l.queue_depth_reported_at !== null &&
      l.queue_depth_reported_at !== undefined &&
      l.queue_pending_points !== null &&
      l.queue_pending_points !== undefined &&
      l.queue_pending_events !== null &&
      l.queue_pending_events !== undefined
        ? {
            pending_points: Number(l.queue_pending_points),
            pending_events: Number(l.queue_pending_events),
            reportada_em: iso(l.queue_depth_reported_at)!,
          }
        : null,
    fatos_por_modo: contagemPor.get(String(l.device_id)) ?? { real: 0, simulated: 0, control: 0 },
    ultimo_lote: ultimoPor.get(String(l.device_id)) ?? null,
  }));
}

/* ------------------------------------------------------------------ *
 * A leitura
 * ------------------------------------------------------------------ */

function validarLote(lote: unknown): number {
  if (typeof lote !== "number" || !Number.isInteger(lote) || lote < 1 || lote > LOTE_MAXIMO) {
    throw new RangeError(`lote fora do contrato: ${String(lote)} (inteiro de 1 a ${LOTE_MAXIMO})`);
  }
  return lote;
}

interface Escopo {
  unit_id: string;
  source_mode: SourceMode;
  viagens: Map<string, Acumulador>;
}

export async function lerRealidadeDeEntregasIncremental(
  cliente: TransactionalSqlClient,
  opcoes: OpcoesDaLeituraIncremental,
): Promise<RealidadeParaApresentacao> {
  const lote = validarLote(opcoes.lote ?? LOTE_PADRAO);
  if (!(opcoes.agora instanceof Date) || !Number.isFinite(opcoes.agora.getTime())) {
    throw new RangeError("agora precisa ser uma data válida");
  }

  // Unidade -> modo -> escopo, e a lista na ordem do primeiro fato de cada um
  // (a ordem de entrada da porta canônica, antes da ordenação estável).
  const escoposPorUnidade = new Map<string, Map<SourceMode, Escopo>>();
  const escopos: Escopo[] = [];
  const conta = { lotes: 0, maior_lote: 0, linhas: 0, aptos: 0, sem_modo: 0, corrompidas: 0, viagens: 0 };
  let instantaneo_ms = 0;

  const t0 = performance.now();
  const { linhas, ultimos, contagens } = await cliente.transaction(async (tx) => {
    const inicio = performance.now();
    // Primeiro comando da transação: o instante MVCC é o do comando seguinte.
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await tx.query(SQL_CURSOR, [TIPOS_DA_OPERACAO_VIVA]);
    const buscar = () => tx.query(`FETCH FORWARD ${lote} FROM ${CURSOR}`);
    let emVoo: Promise<SqlRow[]> | null = buscar();
    try {
      for (;;) {
        const pagina: SqlRow[] = await emVoo;
        emVoo = null;
        if (pagina.length === 0) break;
        // Pede o próximo lote ANTES de processar este: o servidor prepara e
        // envia enquanto o Node decodifica (medido: ~27% da leitura era espera).
        // Mesma conexão, mesma transação, mesma ordem de comandos.
        emVoo = buscar();
        conta.lotes += 1;
        conta.linhas += pagina.length;
        if (pagina.length > conta.maior_lote) conta.maior_lote = pagina.length;

        const d = await decodificarLote(pagina);
        conta.sem_modo += d.sem_modo;
        conta.corrompidas += d.corrompidas.length;
        conta.aptos += d.aptos.length;
        for (const f of d.aptos) {
          // Mesmo filtro da porta canônica (inclusive a veracidade de `unit_id`).
          if (opcoes.unit_id && f.unit_id !== opcoes.unit_id) continue;
          let porModo = escoposPorUnidade.get(f.unit_id);
          if (porModo === undefined) {
            porModo = new Map();
            escoposPorUnidade.set(f.unit_id, porModo);
          }
          let escopo = porModo.get(f.source_mode);
          if (escopo === undefined) {
            // Fato sem viagem também abre escopo, como na porta canônica.
            escopo = { unit_id: f.unit_id, source_mode: f.source_mode, viagens: new Map() };
            porModo.set(f.source_mode, escopo);
            escopos.push(escopo);
          }
          const tripId = f.trip_id;
          if (!tripId) continue;
          const ordem: Ordem = { t: Date.parse(f.occurred_at), s: f.sequence ?? 0, id: f.event_id };
          let a = escopo.viagens.get(tripId);
          if (a === undefined) {
            a = novoAcumulador(f, tripId, ordem);
            escopo.viagens.set(tripId, a);
            conta.viagens += 1;
          }
          acumular(a, f, ordem);
        }
      }
    } finally {
      // Falha no meio de um lote com outro FETCH em voo: a promessa dele não pode
      // ficar sem dono. O erro que importa já está subindo; o ROLLBACK vem depois.
      void emVoo?.catch(() => undefined);
    }
    await tx.query(`CLOSE ${CURSOR}`);

    // O MESMO SQL da porta canônica, no MESMO instante.
    const filtro = opcoes.unit_id ? "WHERE d.unit_id = $1" : "";
    const params = opcoes.unit_id ? [opcoes.unit_id] : [];
    const linhas = await tx.query(
      `SELECT d.device_id, d.unit_id, d.actor_id, d.label, d.registered_at, d.secret_bound_at,
              d.last_session_at, d.app_version, d.revoked_at,
              d.queue_pending_points, d.queue_pending_events, d.queue_depth_reported_at
         FROM identity.device d ${filtro}
        ORDER BY d.unit_id, d.device_id`,
      params,
    );
    const ultimos = await tx.query(
      `SELECT DISTINCT ON (device_id) device_id, occurred_at, recorded_at, object_type, object_id,
              source_mode, correlation_id, clock_trust
         FROM platform.event_log
        WHERE event_type = 'gps_batch_received' AND device_id IS NOT NULL
        ORDER BY device_id, recorded_at DESC, sequence_local DESC NULLS LAST`,
    );
    const contagens = await tx.query(
      `SELECT device_id, source_mode, count(*)::int AS n
         FROM platform.event_log
        WHERE event_type = 'gps_batch_received' AND device_id IS NOT NULL
        GROUP BY device_id, source_mode`,
    );
    instantaneo_ms = performance.now() - inicio;
    return { linhas, ultimos, contagens };
  });
  const t1 = performance.now();

  // Depois do COMMIT: só CPU, nenhum SQL.
  const aparelhos = aparelhosDe(linhas, ultimos, contagens);
  const projecoes: RealidadeParaApresentacao["projecoes"] = [...escopos]
    .sort((a, b) => `${a.unit_id}|${a.source_mode}`.localeCompare(`${b.unit_id}|${b.source_mode}`))
    .map((e) => ({
      unit_id: e.unit_id,
      source_mode: e.source_mode,
      viagens: [...e.viagens.values()]
        // `projetar`: inserção na ordem do primeiro fato aplicado, depois
        // `localeCompare` de `trip_id` (ordenação estável).
        .sort((a, b) => compararOrdem(a.primeiro, b.primeiro))
        .sort((a, b) => a.trip_id.localeCompare(b.trip_id))
        .map((a) => viagemDe(a, opcoes.agora)),
    }));

  const realidade: RealidadeParaApresentacao = {
    versao: PORTA_DE_REALIDADE_VERSION,
    fonte: "postgresql",
    lida_em: opcoes.agora.toISOString(),
    aparelhos,
    projecoes,
    historico_sem_modo: conta.sem_modo,
  };

  opcoes.medir?.({
    lote,
    lotes: conta.lotes,
    maior_lote: conta.maior_lote,
    linhas: conta.linhas,
    aptos: conta.aptos,
    sem_modo: conta.sem_modo,
    corrompidas: conta.corrompidas,
    escopos: projecoes.length,
    viagens: conta.viagens,
    aparelhos: aparelhos.length,
    instantaneo_ms,
    transacao_ms: t1 - t0,
    montagem_ms: performance.now() - t1,
  });
  return realidade;
}
