/**
 * Serviço de ingestão — o caminho que um fato percorre antes de ser aceito.
 *
 * A ordem é o desenho:
 *
 *   autenticar → validar envelope → validar payload → validar roteabilidade
 *   → gravar fato + mensagem na MESMA transação → só então responder aceito
 *
 * Duas coisas que este módulo existe para impedir:
 *
 * **1. Dual-write.** `PlatformUnitOfWork.commit()` grava fatos e mensagens em
 * sequência, e NÃO abre transação — a atomicidade depende inteiramente de quem
 * o constrói. Passar um sink do pool e um outbox do pool produz duas
 * transações separadas, e nenhum teste existente notaria. Aqui a transação é
 * obrigatória por construção: o escritor recebe um cliente com `transaction` e
 * não há caminho que não passe por ela.
 *
 * **2. Aceitar o que não tem para onde ir.** `checkEvent` aceita os onze tipos
 * declarados, mas só nove têm consumidor. Um dos outros dois, gravado hoje,
 * entraria na outbox, não acharia handler, e queimaria as tentativas até
 * dead-letter — um ciclo invisível que só aparece quando alguém vai olhar a
 * fila. Roteabilidade é verificada ANTES de gravar.
 */

import {
  checkEvent,
  streamDe,
  type EventEnvelope,
  type EventType,
  type SourceMode,
} from "../contracts/event-catalog";
import { validarPayload, tiposComContrato } from "../contracts/event-schema";
import type { OutboxMessage } from "../contracts/messaging";
import { classificarRelogio, type ConfiancaDoRelogio } from "../contracts/relogio";

export const INGEST_SERVICE_VERSION = "ingest-service@1.0.0";

/* ------------------------------------------------------------------ *
 * Roteabilidade
 * ------------------------------------------------------------------ */

/**
 * Um tipo é roteável quando existe consumidor que o entende.
 *
 * A fonte é o contrato: `tiposComContrato()` lê o mesmo arquivo que documenta
 * produtor e consumidores. Manter uma segunda lista aqui seria criar a
 * oportunidade de as duas divergirem — e a que divergisse seria justamente a
 * que decide o que entra.
 */
export function ehRoteavel(tipo: string, raiz = process.cwd()): boolean {
  return tiposComContrato(raiz).includes(tipo);
}

/* ------------------------------------------------------------------ *
 * Escritor transacional
 * ------------------------------------------------------------------ */

export interface FatoParaGravar {
  event_id: string;
  unit_id: string;
  object_type: string;
  object_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  recorded_at?: string;
  origin: string;
  actor_id?: string;
  device_id?: string;
  idempotency_key: string;
  correlation_id?: string;
  sequence_local?: number;
  contract_version: string;
  /**
   * Obrigatório, e sem padrão. O banco recusa fato novo sem ele desde a
   * migration 0003 — mas o tipo recusa antes, em tempo de compilação, para que
   * nenhum escritor chegue ao banco podendo esquecer.
   */
  source_mode: SourceMode;
  /**
   * Obrigatório, e sem padrão no tipo. A coluna ainda tem o padrão `trusted`
   * da 0001 — é assim que todo fato do crítico nascia "confiável" sem ninguém
   * ter olhado o relógio. O escritor passa o julgamento, sempre.
   */
  clock_trust: ConfiancaDoRelogio;
}

/**
 * Quem sabe gravar fato e mensagem atomicamente.
 *
 * A interface exige os dois JUNTOS, de propósito. Um escritor com
 * `gravarFato()` e `enfileirar()` separados convidaria a chamá-los em
 * sequência, e a garantia se perderia sem ninguém escrever uma linha errada.
 */
export interface EscritorTransacional {
  commit(
    fatos: readonly FatoParaGravar[],
    mensagens: readonly OutboxMessage[],
  ): Promise<
    | { ok: true; facts: number; messages: number }
    | { ok: false; code: string; detail: string }
  >;
}

/* ------------------------------------------------------------------ *
 * Resultado
 * ------------------------------------------------------------------ */

export type RecusaDeIngestao =
  | "envelope_invalido"
  | "payload_invalido"
  | "nao_roteavel"
  | "falha_de_persistencia";

export interface FatoRecusado {
  idempotency_key: string;
  motivo: RecusaDeIngestao;
  detalhe: string;
}

export interface ResultadoIngestao {
  /** Verdadeiro somente DEPOIS do commit. Nunca antes. */
  aceito: boolean;
  gravados: number;
  duplicados: number;
  mensagens: number;
  recusados: readonly FatoRecusado[];
  /** Preenchido quando a transação falhou por inteiro. */
  erro?: { code: string; detail: string };
}

/* ------------------------------------------------------------------ *
 * Ingestão
 * ------------------------------------------------------------------ */

export interface OpcoesIngestao {
  escritor: EscritorTransacional;
  recebido_em: Date;
  /** Raiz para achar o schema — o teste aponta para outro lugar. */
  raiz?: string;
}

function objetoDe(e: EventEnvelope): { tipo: string; id: string } {
  if (e.trip_id) return { tipo: "trip", id: e.trip_id };
  if (e.order_id) return { tipo: "order", id: e.order_id };
  if (e.device_id) return { tipo: "device", id: e.device_id };
  return { tipo: "unit", id: e.unit_id };
}

/**
 * Recebe fatos já autenticados e os torna duráveis.
 *
 * A autenticação acontece ANTES daqui (`autenticarDispositivo`), porque quem
 * decide se o aparelho pode falar não é quem grava. Este módulo recebe fatos
 * de origem já estabelecida.
 *
 * Recusa individual NÃO derruba o lote: um ponto inválido no meio de cinquenta
 * não pode fazer os outros quarenta e nove voltarem para a fila do aparelho.
 * Falha de PERSISTÊNCIA, essa sim, derruba tudo — é a única forma de o
 * aparelho saber que não pode apagar nada.
 */
export async function ingerir(
  fatos: readonly EventEnvelope[],
  o: OpcoesIngestao,
): Promise<ResultadoIngestao> {
  // NÃO cai para `process.cwd()`: o contrato de eventos é resolvido
  // relativamente ao módulo que o lê (ver `RAIZ_DOS_CONTRATOS`), e inventar
  // uma raiz aqui reintroduziria a dependência do layout do checkout que o
  // PB19-D3b expôs. `undefined` significa "use o padrão de quem sabe".
  const raiz = o.raiz;
  const recusados: FatoRecusado[] = [];
  const aprovados: EventEnvelope[] = [];

  for (const f of fatos) {
    const chave = f?.idempotency_key ?? "(sem chave)";

    const envelope = checkEvent(f);
    if (!envelope.ok) {
      recusados.push({
        idempotency_key: chave,
        motivo: "envelope_invalido",
        detalhe: `${envelope.rejection}: ${envelope.detail}`,
      });
      continue;
    }

    if (!ehRoteavel(envelope.envelope.event_type, raiz)) {
      // Recusado ANTES de gravar, e com motivo próprio. Aceitá-lo criaria
      // trabalho que ninguém consegue concluir, e o sintoma apareceria dias
      // depois como uma dead-letter que ninguém sabe explicar.
      recusados.push({
        idempotency_key: chave,
        motivo: "nao_roteavel",
        detalhe: `tipo "${envelope.envelope.event_type}" é declarado mas não tem consumidor`,
      });
      continue;
    }

    const payload = validarPayload(envelope.envelope.event_type, envelope.envelope.payload, raiz);
    if (!payload.ok) {
      recusados.push({
        idempotency_key: chave,
        motivo: "payload_invalido",
        detalhe: payload.falhas.map((x) => `${x.campo}: ${x.motivo}`).join("; "),
      });
      continue;
    }

    aprovados.push(envelope.envelope);
  }

  if (!aprovados.length) {
    // Nada a gravar não é falha de persistência: o lote foi processado e o
    // resultado é conhecido. O aparelho pode limpar o que foi recusado por
    // conteúdo — reenviar não mudaria nada.
    return { aceito: true, gravados: 0, duplicados: 0, mensagens: 0, recusados };
  }

  const recebidoEm = o.recebido_em.toISOString();

  // O relógio do produtor é JULGADO aqui, contra a hora do servidor — o único
  // lugar que conhece as duas. Nunca aceito do produtor: um aparelho não diz
  // que o próprio relógio é confiável, como não diz quando o servidor recebeu.
  const relogioDe = (e: EventEnvelope): ConfiancaDoRelogio => classificarRelogio(e.occurred_at, recebidoEm);

  const paraGravar: FatoParaGravar[] = aprovados.map((e) => {
    const obj = objetoDe(e);
    return {
      event_id: e.event_id,
      unit_id: e.unit_id,
      object_type: obj.tipo,
      object_id: obj.id,
      event_type: e.event_type,
      payload: e.payload,
      occurred_at: e.occurred_at,
      // `recorded_at` é do SERVIDOR e nunca do produtor: é o carimbo que
      // permite medir a latência de sincronização depois. Deixar o produtor
      // preenchê-lo permitiria a ele mentir sobre a própria demora.
      recorded_at: recebidoEm,
      origin: e.origin,
      actor_id: e.actor_id,
      device_id: e.device_id,
      idempotency_key: e.idempotency_key,
      correlation_id: e.correlation_id,
      sequence_local: e.sequence,
      contract_version: e.event_version,
      // O modo vai para o FATO, não só para a mensagem. Até a Q-016 ele ia só
      // para a outbox, e o log — que é a verdade — guardava o fato real e o
      // simulado como a mesma linha (provado em run-q016-replay-tests.ts).
      source_mode: e.source_mode,
      clock_trust: relogioDe(e),
    };
  });

  const mensagens: OutboxMessage[] = aprovados.map((e) => ({
    outbox_id: `ob-${e.event_id}`,
    stream: streamDe(e.event_type as EventType),
    kind: e.event_type,
    payload: {
      event_id: e.event_id,
      event_type: e.event_type,
      event_version: e.event_version,
      unit_id: e.unit_id,
      trip_id: e.trip_id,
      device_id: e.device_id,
      occurred_at: e.occurred_at,
      // A hora do servidor e o julgamento do relógio viajam com a mensagem: são
      // eles que decidem o frescor. O replay devolve os mesmos dois do event log
      // (`recorded_at`, `clock_trust`) — sem isso, a projeção ao vivo e a
      // reconstruída divergiriam.
      received_at: recebidoEm,
      clock_trust: relogioDe(e),
      // O modo viaja com a mensagem. Sem ele, o consumidor não teria como
      // manter simulado separado de real, e um número de teste entraria na
      // conta da operação.
      source_mode: e.source_mode,
      origin: e.origin,
      sequence: e.sequence,
    },
    // A mesma chave do fato. É ela que liga a mensagem ao que a causou, e o
    // que faz a deduplicação do fato deduplicar a mensagem junto.
    idempotency_key: e.idempotency_key,
    correlation_id: e.correlation_id ?? "",
    state: "pending",
    attempts: 0,
    created_at: recebidoEm,
    available_at: recebidoEm,
  }));

  const r = await o.escritor.commit(paraGravar, mensagens);

  if (!r.ok) {
    // NADA foi gravado. Devolver aceito aqui seria o pior resultado possível:
    // o aparelho apagaria a fila local de um ponto que nunca chegou.
    return {
      aceito: false,
      gravados: 0,
      duplicados: 0,
      mensagens: 0,
      recusados,
      erro: { code: r.code, detail: r.detail },
    };
  }

  return {
    aceito: true,
    gravados: r.facts,
    // O que não gravou e não foi recusado é duplicata — o reenvio esperado.
    duplicados: aprovados.length - r.facts,
    mensagens: r.messages,
    recusados,
  };
}
