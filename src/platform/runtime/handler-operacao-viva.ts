/**
 * O handler que liga a outbox à projeção da Operação Viva.
 *
 * É deliberadamente fino: recebe a mensagem, entrega ao consumidor já
 * comprovado, e devolve. Toda a lógica — idempotência, ordem, expiração —
 * vive em `consumidor.ts` e foi provada lá. Reimplementar qualquer parte dela
 * aqui criaria uma segunda ponte, que é exatamente o que esta unidade não pode
 * produzir.
 *
 * O worker resolve o handler por `kind`. Um `kind` sem handler NÃO morre em
 * silêncio: o `AsyncRuntime` conta a tentativa, aplica backoff e leva a
 * dead-letter com motivo — comportamento já existente, que este módulo
 * preserva ao registrar apenas os tipos que a projeção realmente entende.
 */

import type { OutboxMessage } from "../contracts/messaging";
import type { OutboxHandler } from "./async-worker";
import {
  consumir,
  projecaoAtual,
  MemoriaDaProjecao,
  type MensagemDaPonte,
} from "../projections/consumidor";
import type { OpcoesProjecao, Projecao } from "../projections/operacao-viva";

export const HANDLER_VERSION = "handler-operacao-viva@1.0.0";

/** Os tipos que esta projeção consome. Fonte única para registro e roteamento. */
export const TIPOS_DA_OPERACAO_VIVA: readonly string[] = [
  "trip_created",
  "trip_started",
  "gps_batch_received",
  "arrival_detected",
  "delivery_confirmed",
  "occurrence_created",
  "trip_return_started",
  "trip_returned",
  "trip_closed",
];

function paraPonte(m: OutboxMessage): MensagemDaPonte {
  return {
    outbox_id: m.outbox_id,
    kind: m.kind,
    idempotency_key: m.idempotency_key,
    payload: m.payload ?? {},
  };
}

export interface PonteDaOperacaoViva {
  /** Handlers prontos para o `outboxHandlers` do runtime assíncrono. */
  handlers: Record<string, OutboxHandler>;
  /** Estado acumulado. Descartável: reconstrói por replay. */
  memoria: MemoriaDaProjecao;
  /** Projeção calculada no instante da leitura. */
  projecao(o: OpcoesProjecao): Projecao;
}

/**
 * Monta a ponte.
 *
 * A memória é injetável para o teste conseguir inspecioná-la, e porque um dia
 * ela virá de um snapshot em vez de começar vazia — sem que o handler mude.
 *
 * **Lança quando a mensagem não é aplicável.** Isso é intencional: o
 * `AsyncRuntime` traduz exceção em tentativa contada, backoff e dead-letter.
 * Engolir o erro aqui devolveria "processado" para uma mensagem que ninguém
 * processou, e o problema sumiria da fila sem nunca ter sido resolvido.
 */
export function montarPonteDaOperacaoViva(
  memoria: MemoriaDaProjecao = new MemoriaDaProjecao(),
): PonteDaOperacaoViva {
  const handler: OutboxHandler = (msg) => {
    const r = consumir([paraPonte(msg)], { memoria, suportados: TIPOS_DA_OPERACAO_VIVA });

    if (r.ignorados.length) {
      // Mensagem malformada ou de tipo alheio chegou a um handler registrado
      // para ela — é incoerência de roteamento, não dado ruim. Falhar aqui faz
      // o motivo aparecer no `last_error` da outbox, onde alguém consegue ver.
      throw new Error(`mensagem não aplicável: ${r.ignorados[0].motivo}`);
    }
    // `aplicados: 0` com `duplicados: 1` é sucesso — o reenvio esperado.
  };

  const handlers: Record<string, OutboxHandler> = {};
  for (const tipo of TIPOS_DA_OPERACAO_VIVA) handlers[tipo] = handler;

  return {
    handlers,
    memoria,
    projecao: (o) => projecaoAtual(memoria, o),
  };
}
