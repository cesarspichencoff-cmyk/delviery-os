/**
 * Consumidor da outbox → projeção da Operação Viva.
 *
 * O consumidor é o oposto do crítico: ele pode cair, demorar, ser reiniciado e
 * processar em ordem trocada, e nada disso pode corromper o estado. A projeção
 * é derivada, então a estratégia é simples e forte — **guardar os fatos, e
 * recalcular**.
 *
 * A alternativa comum, aplicar o efeito de cada mensagem sobre um estado
 * mutável, é mais rápida e frágil: exige que cada aplicação seja idempotente
 * *e* comutativa, e uma mensagem fora de ordem vira estado que ninguém
 * consegue explicar depois. Guardar fato e recomputar torna as duas
 * propriedades consequência da estrutura, não disciplina de quem escreve.
 *
 * O que este módulo NÃO faz: gravar fato de viagem. Ele lê a mensagem, guarda
 * o que precisa para recomputar, e recalcula. A verdade continua no event log.
 */

import type { EventEnvelope, EventType, SourceMode } from "../contracts/event-catalog";
import { projetar, type Projecao, type OpcoesProjecao } from "./operacao-viva";

export const CONSUMER_VERSION = "operacao-viva-consumidor@1.0.0";

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */

/** O que a mensagem de outbox carrega, do ponto de vista do consumidor. */
export interface MensagemDaPonte {
  outbox_id: string;
  kind: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
}

/**
 * Como o processamento aconteceu.
 *
 * `replay` é distinguido de `normal` porque a diferença importa na
 * observabilidade: um pico de processamento durante uma reconstrução é
 * esperado, e o mesmo pico no fluxo normal é incidente.
 */
export type ModoDeProcessamento = "normal" | "replay";

export interface ResultadoDoConsumo {
  aplicados: number;
  /** Já conhecidos. Não é erro — é o reenvio esperado. */
  duplicados: number;
  /** Mensagem cujo tipo o consumidor não entende. */
  ignorados: readonly { outbox_id: string; motivo: string }[];
  modo: ModoDeProcessamento;
}

/* ------------------------------------------------------------------ *
 * Estado do consumidor
 * ------------------------------------------------------------------ */

/**
 * Os fatos que o consumidor já viu, por unidade e por modo.
 *
 * Real, simulado e controle NUNCA compartilham a mesma caixa. Se
 * compartilhassem, um número de teste entraria na conta da operação — e o
 * modo do evento seria só um rótulo que ninguém aplica.
 */
export class MemoriaDaProjecao {
  private readonly porEscopo = new Map<string, Map<string, EventEnvelope>>();

  private escopo(unit: string, modo: SourceMode): string {
    return `${unit}|${modo}`;
  }

  /** Devolve true quando o fato era novo. */
  registrar(e: EventEnvelope): boolean {
    const chave = this.escopo(e.unit_id, e.source_mode);
    const caixa = this.porEscopo.get(chave) ?? new Map<string, EventEnvelope>();
    // A identidade é a chave de idempotência do próprio evento. Não se cria
    // uma segunda definição de identidade quando já existe uma — duas
    // definições é como o mesmo fato vira dois.
    if (caixa.has(e.idempotency_key)) return false;
    caixa.set(e.idempotency_key, e);
    this.porEscopo.set(chave, caixa);
    return true;
  }

  fatos(unit: string, modo: SourceMode): EventEnvelope[] {
    return [...(this.porEscopo.get(this.escopo(unit, modo))?.values() ?? [])];
  }

  conhece(e: EventEnvelope): boolean {
    return this.porEscopo.get(this.escopo(e.unit_id, e.source_mode))?.has(e.idempotency_key) ?? false;
  }

  get tamanho(): number {
    let n = 0;
    for (const c of this.porEscopo.values()) n += c.size;
    return n;
  }

  /** Descarta tudo. Usado antes de uma reconstrução por replay. */
  limpar(): void {
    this.porEscopo.clear();
  }
}

/* ------------------------------------------------------------------ *
 * Reconstrução do envelope
 * ------------------------------------------------------------------ */

const CAMPOS_MINIMOS = ["event_id", "event_type", "unit_id", "occurred_at", "source_mode"] as const;

/**
 * Reconstrói o envelope a partir do payload da mensagem.
 *
 * A mensagem não carrega o payload do fato — carrega o que o consumidor
 * precisa para projetar. Mandar o payload inteiro duplicaria o event log
 * dentro da fila e faria uma coordenada de GPS existir em dois lugares com
 * ciclos de vida diferentes.
 */
export function envelopeDaMensagem(m: MensagemDaPonte): EventEnvelope | null {
  const p = m.payload ?? {};
  for (const c of CAMPOS_MINIMOS) {
    if (typeof p[c] !== "string" || !(p[c] as string).trim()) return null;
  }
  return {
    event_id: String(p.event_id),
    event_type: String(p.event_type) as EventType,
    event_version: String(p.event_version ?? `${String(p.event_type)}@1.0.0`),
    unit_id: String(p.unit_id),
    trip_id: p.trip_id ? String(p.trip_id) : undefined,
    device_id: p.device_id ? String(p.device_id) : undefined,
    occurred_at: String(p.occurred_at),
    origin: (p.origin ?? "system") as EventEnvelope["origin"],
    source_mode: String(p.source_mode) as SourceMode,
    sequence: typeof p.sequence === "number" ? p.sequence : undefined,
    idempotency_key: m.idempotency_key,
    payload: {},
  };
}

/* ------------------------------------------------------------------ *
 * Consumo
 * ------------------------------------------------------------------ */

export interface OpcoesConsumo {
  memoria: MemoriaDaProjecao;
  modo?: ModoDeProcessamento;
  /** Tipos que este consumidor entende. */
  suportados?: readonly string[];
}

const SUPORTADOS_PADRAO: readonly string[] = [
  "trip_created", "trip_started", "gps_batch_received", "arrival_detected",
  "delivery_confirmed", "occurrence_created", "trip_return_started",
  "trip_returned", "trip_closed",
];

/**
 * Consome um lote de mensagens.
 *
 * Idempotente por construção: a mensagem já conhecida não é reaplicada, e o
 * resultado da projeção não depende de quantas vezes ela chegou. Isso é o que
 * torna seguro o caso mais incômodo — o worker que morre DEPOIS de aplicar o
 * efeito e ANTES de confirmar: na retomada a mensagem volta, é reconhecida, e
 * o estado não muda.
 */
export function consumir(
  mensagens: readonly MensagemDaPonte[],
  o: OpcoesConsumo,
): ResultadoDoConsumo {
  const suportados = o.suportados ?? SUPORTADOS_PADRAO;
  const ignorados: { outbox_id: string; motivo: string }[] = [];
  let aplicados = 0;
  let duplicados = 0;

  for (const m of mensagens) {
    if (!suportados.includes(m.kind)) {
      // Ignorar aqui é correto e diferente de ignorar na ingestão: a ingestão
      // recusa o que não tem consumidor NENHUM; aqui é uma mensagem que outro
      // consumidor entende. Ela segue o caminho dela.
      ignorados.push({ outbox_id: m.outbox_id, motivo: `tipo "${m.kind}" não é desta projeção` });
      continue;
    }
    const e = envelopeDaMensagem(m);
    if (!e) {
      ignorados.push({ outbox_id: m.outbox_id, motivo: "mensagem sem os campos mínimos" });
      continue;
    }
    if (o.memoria.registrar(e)) aplicados += 1;
    else duplicados += 1;
  }

  return { aplicados, duplicados, ignorados, modo: o.modo ?? "normal" };
}

/**
 * Calcula a projeção a partir do que o consumidor guardou.
 *
 * Recalcular do zero a cada leitura parece caro e é o que dá as garantias de
 * graça: ordem, duplicata e expiração deixam de ser casos a tratar e viram
 * consequência de `projetar` ser função pura.
 */
export function projecaoAtual(
  memoria: MemoriaDaProjecao,
  o: OpcoesProjecao,
): Projecao {
  return projetar(memoria.fatos(o.unit_id, o.source_mode), o);
}

/* ------------------------------------------------------------------ *
 * Replay
 * ------------------------------------------------------------------ */

export interface ResultadoDoReplay {
  modo: "replay";
  fatos_relidos: number;
  aplicados: number;
  duplicados: number;
  /** Estado antes e depois, para provar que a reconstrução equivale. */
  reconstruida: Projecao;
}

/**
 * Reconstrói a projeção a partir do event log, sem tocar nos fatos.
 *
 * Explícito (é uma função com nome próprio), observável (devolve contagens e
 * `modo: "replay"`) e idempotente (limpa antes de reconstruir, então rodar
 * duas vezes dá o mesmo resultado).
 *
 * Não cria mensagem de outbox: replay reconstrói estado DERIVADO, e emitir
 * mensagem crítica de novo faria um fato antigo disparar efeito novo.
 */
export function reconstruirPorReplay(
  eventLog: readonly EventEnvelope[],
  memoria: MemoriaDaProjecao,
  o: OpcoesProjecao,
): ResultadoDoReplay {
  memoria.limpar();

  let aplicados = 0;
  let duplicados = 0;
  for (const e of eventLog) {
    if (memoria.registrar(e)) aplicados += 1;
    else duplicados += 1;
  }

  return {
    modo: "replay",
    fatos_relidos: eventLog.length,
    aplicados,
    duplicados,
    // A expiração é recalculada contra o relógio de AGORA, não contra o do
    // evento. Um sinal que já estava velho continua velho depois do replay —
    // reconstruir não pode ressuscitar estado vencido.
    reconstruida: projecaoAtual(memoria, o),
  };
}
