/**
 * Replay da Operação Viva no boot do runtime assíncrono (Q-016).
 *
 * Decisão do César: a fonte durável que governa a reconstrução é
 * `platform.event_log`, e o runtime assíncrono a executa no boot, ANTES de
 * entrar no laço da outbox. Sem isso, um worker reiniciado começava com a
 * memória da projeção vazia e voltava a acumular a partir do zero — o
 * comentário do `async-runtime` dizia que `reconstruirPorReplay` recompunha a
 * memória, e ele nunca era chamado.
 *
 * A ORDEM É O CONTRATO
 *
 *   banco → migrations → Operação Viva montada → fatos aptos lidos
 *   → reconstruirPorReplay → resultado registrado → SÓ ENTÃO o laço
 *
 * Replay depois de o consumo começar deixaria uma janela em que a projeção
 * contém só o que chegou pela fila desde o boot, apresentada como se fosse o
 * estado da operação.
 *
 * QUANDO O REPLAY FALHA — decidido por evidência, não por gosto
 *
 * **Log ilegível** (banco inacessível, schema sem a 0003, permissão): o replay
 * não produz nada. Subir e consumir mostraria uma projeção feita só de fatos
 * pós-reinício como se fosse completa — o "vazio fingindo de saudável" que a
 * missão proíbe. A condição é corrigível (aplicar migration, corrigir acesso),
 * a outbox guarda o backlog sem perder nada, e o crítico não depende deste
 * processo (L1). É o mesmo tratamento de migration divergente: **o boot é
 * recusado, com código 78 e o motivo**.
 *
 * **Linha corrompida** (log legível, alguma linha fora do contrato — só existe
 * se alguém removeu a restrição da 0003): o event log é append-only (L3), e a
 * linha NUNCA poderá ser corrigida. Recusar o boot por ela transformaria uma
 * linha ruim num worker permanentemente incapaz de subir. Os fatos válidos
 * reconstroem corretamente e os corrompidos ficam contados, com motivo. **O
 * worker sobe DEGRADADO**, e o estado é declarado em voz alta — no log e em
 * `estado`, que qualquer leitor da ponte consulta.
 *
 * **Histórico sem modo** não é falha. É o que a 0003 classificou como UNKNOWN:
 * fica fora do replay, contado em `sem_modo_unknown`, e o estado continua
 * `completo` — completo com o que o log PERMITE reconstruir sem inventar.
 *
 * Nada aqui escreve. A leitura roda em transação READ ONLY
 * (`lerFatosParaReplay`), e `reconstruirPorReplay` só toca a memória do
 * processo.
 */

import { createHash } from "node:crypto";

import type { EventEnvelope } from "../contracts/event-catalog";
import { reconstruirPorReplay, projecaoAtual, type MemoriaDaProjecao } from "../projections/consumidor";
import { lerFatosParaReplay, type LinhaFora } from "../projections/replay-do-event-log";
import type { TransactionalSqlClient } from "../persistence/sql-client";
import { TIPOS_DA_OPERACAO_VIVA, type PonteDaOperacaoViva } from "./handler-operacao-viva";

export const REPLAY_NO_BOOT_VERSION = "replay-no-boot@1.0.0";

/** Quantas linhas corrompidas o registro cita pelo nome. O total vai sempre. */
const CITADAS = 10;

/**
 * O que a memória da projeção CONTÉM, escopo a escopo — verificável por fora.
 *
 * `projetar` é função pura de (fatos, relógio). Então duas memórias com os
 * mesmos fatos por escopo produzem a mesma projeção para QUALQUER relógio, e
 * comparar a memória antes do desligamento com a memória depois do replay é
 * comparar as projeções — sem precisar que os dois processos calculem no mesmo
 * instante, o que eles nunca fazem.
 *
 * O digest normaliza `occurred_at` para instante (ms desde a época). É a
 * equivalência declarada em `replay-do-event-log.ts`: o log preserva o
 * instante, não a grafia do produtor.
 *
 * O histograma de frescor é calculado contra `agora`. É por ele que se vê, de
 * fora, se um sinal que envelheceu entre o desligamento e o boot chegou
 * envelhecido ou congelado.
 */
export interface ResumoDoEscopo {
  unit_id: string;
  source_mode: string;
  fatos: number;
  digest: string;
  viagens: number;
  frescor: Record<"fresh" | "aging" | "stale" | "unknown", number>;
}

function canonico(e: EventEnvelope): string {
  return JSON.stringify([
    e.idempotency_key,
    e.event_id,
    e.event_type,
    e.event_version,
    e.unit_id,
    e.source_mode,
    e.trip_id ?? null,
    e.device_id ?? null,
    e.origin,
    e.sequence ?? null,
    Date.parse(e.occurred_at),
  ]);
}

export function resumoDaMemoria(memoria: MemoriaDaProjecao, agora: Date): ResumoDoEscopo[] {
  return memoria.escopos().map((e) => {
    const fatos = memoria.fatos(e.unit_id, e.source_mode);
    const h = createHash("sha256");
    for (const linha of fatos.map(canonico).sort()) h.update(linha).update("\n");
    const projecao = projecaoAtual(memoria, { agora, ...e });
    const frescor = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
    for (const v of projecao.viagens) frescor[v.frescor] += 1;
    return {
      unit_id: e.unit_id,
      source_mode: e.source_mode,
      fatos: fatos.length,
      digest: h.digest("hex").slice(0, 16),
      viagens: projecao.viagens.length,
      frescor,
    };
  });
}

export interface ResultadoDoReplayNoBoot {
  fonte: "platform.event_log";
  estado: "completo" | "degradado";
  lidas: number;
  aptos: number;
  sem_modo_unknown: number;
  corrompidas: number;
  corrompidas_citadas: readonly LinhaFora[];
  aplicados: number;
  duplicados: number;
  escopos: readonly ResumoDoEscopo[];
  ms: number;
}

/**
 * Reconstrói a memória da ponte a partir do event log.
 *
 * **Lança** quando o log não pode ser lido — quem chama recusa o boot. Não
 * lança por linha corrompida: devolve `estado: "degradado"`.
 */
export async function reconstruirNoBoot(
  cliente: TransactionalSqlClient,
  ponte: PonteDaOperacaoViva,
  agora: Date,
): Promise<ResultadoDoReplayNoBoot> {
  const inicio = Date.now();
  const leitura = await lerFatosParaReplay(cliente, TIPOS_DA_OPERACAO_VIVA);

  let aplicados = 0;
  let duplicados = 0;
  if (leitura.aptos.length > 0) {
    // `reconstruirPorReplay` pede um escopo para devolver UMA projeção de
    // conferência; a memória, essa, é reconstruída para TODOS os escopos. O
    // escopo passado é o do primeiro fato apto — real, não um padrão: com zero
    // fatos a função nem é chamada, e nenhum modo precisa ser escolhido.
    const primeiro = leitura.aptos[0];
    const r = reconstruirPorReplay(leitura.aptos, ponte.memoria, {
      agora,
      unit_id: primeiro.unit_id,
      source_mode: primeiro.source_mode,
    });
    aplicados = r.aplicados;
    duplicados = r.duplicados;
  } else {
    ponte.memoria.limpar();
  }

  // O frescor é recalculado contra o relógio de AGORA: um sinal que envelheceu
  // entre o desligamento e o boot chega envelhecido, nunca congelado.
  const escopos = resumoDaMemoria(ponte.memoria, agora);

  return {
    fonte: "platform.event_log",
    estado: leitura.corrompidas.length > 0 ? "degradado" : "completo",
    lidas: leitura.lidas,
    aptos: leitura.aptos.length,
    sem_modo_unknown: leitura.sem_modo,
    corrompidas: leitura.corrompidas.length,
    corrompidas_citadas: leitura.corrompidas.slice(0, CITADAS),
    aplicados,
    duplicados,
    escopos,
    ms: Date.now() - inicio,
  };
}
