/**
 * Porta de LEITURA da realidade de Entregas — a menor possível.
 *
 * Até aqui a superfície `/entregas` do Product System só tinha o facade de
 * demonstração: o aparelho em campo publicava por `POST /api/gps/batch` e
 * nada devolvia o estado dele. Esta porta lê o que a cadeia canônica
 * sustenta, e SÓ isso:
 *
 *  - `identity.device`: quem está autorizado, se a credencial está vinculada,
 *    quando falou pela última vez, se foi revogado;
 *  - `platform.event_log`: o último lote de cada aparelho e a projeção da
 *    Operação Viva por unidade e por modo, com a MESMA função do assíncrono.
 *
 * O que ela NÃO inventa: fila offline do aparelho, estado do GPS no telefone,
 * permissão de localização, viagem que não deixou fato. Quem não tem fonte
 * sai como ausência declarada, nunca como zero, nunca como "saudável".
 *
 * Somente leitura por CONSTRUÇÃO: a transação é `READ ONLY`, como na porta de
 * replay — qualquer escrita nesta conexão é recusada pelo PostgreSQL.
 */

import type { TransactionalSqlClient } from "../persistence/sql-client";
import type { SourceMode } from "../contracts/event-catalog";
import { SOURCE_MODES } from "../contracts/event-catalog";
import { relogioEfetivo, type ConfiancaDoRelogio } from "../contracts/relogio";
import { lerFatosParaReplay } from "../projections/replay-do-event-log";
import { projetar, type ViagemProjetada } from "../projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "../runtime/handler-operacao-viva";

export const PORTA_DE_REALIDADE_VERSION = "realidade-de-entregas@1.0.0";

export interface UltimoLote {
  /** Quando o aparelho disse que aconteceu. */
  occurred_at: string;
  /** Quando o servidor recebeu. A distância entre os dois é a latência de sincronização. */
  recorded_at: string;
  /**
   * O relógio EFETIVO deste lote (`relogioEfetivo`): o carimbo da ingestão
   * conferido contra `recorded_at`. Diferente de `trusted`, o `occurred_at`
   * acima é o que o aparelho disse — evidência, sem autoridade sobre o tempo.
   */
  relogio: ConfiancaDoRelogio;
  trip_id: string | null;
  source_mode: SourceMode | null;
  correlation_id: string | null;
}

export interface AparelhoReal {
  device_id: string;
  unit_id: string;
  actor_id: string | null;
  label: string;
  autorizado_em: string;
  /** NULL = autorizado, mas nunca fez o primeiro contato. */
  credencial_vinculada_em: string | null;
  ultima_sessao_em: string | null;
  app_version: string | null;
  revogado_em: string | null;
  /** Fatos `gps_batch_received` deste aparelho, por modo. Zero é zero medido. */
  fatos_por_modo: Record<SourceMode, number>;
  ultimo_lote: UltimoLote | null;
}

export interface ViagensDeUmModo {
  unit_id: string;
  source_mode: SourceMode;
  viagens: readonly ViagemProjetada[];
}

export interface RealidadeDeEntregas {
  versao: string;
  fonte: "postgresql";
  lida_em: string;
  aparelhos: AparelhoReal[];
  /** Uma projeção por (unidade, modo) que tenha fato. `real` e `simulated` nunca se somam. */
  projecoes: ViagensDeUmModo[];
  /** Fatos anteriores à 0003, sem modo: UNKNOWN, contados, fora de toda projeção. */
  historico_sem_modo: number;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function modo(v: unknown): SourceMode | null {
  return typeof v === "string" && (SOURCE_MODES as readonly string[]).includes(v) ? (v as SourceMode) : null;
}

export async function lerRealidadeDeEntregas(
  cliente: TransactionalSqlClient,
  opcoes: { agora: Date; unit_id?: string },
): Promise<RealidadeDeEntregas> {
  // Duas transações somente-leitura, não uma: a porta de replay abre a dela.
  // O cadastro e o último lote saem desta; os fatos da projeção, da outra.
  // Entre as duas pode entrar um fato novo — e o campo `lida_em` é um só
  // porque a leitura é UM ato para quem olha a tela, não porque as duas
  // consultas viram o mesmo instante.
  const leitura = await lerFatosParaReplay(cliente, TIPOS_DA_OPERACAO_VIVA);

  return cliente.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");

    const filtro = opcoes.unit_id ? "WHERE d.unit_id = $1" : "";
    const params = opcoes.unit_id ? [opcoes.unit_id] : [];
    const linhas = await tx.query(
      `SELECT d.device_id, d.unit_id, d.actor_id, d.label, d.registered_at, d.secret_bound_at,
              d.last_session_at, d.app_version, d.revoked_at
         FROM identity.device d ${filtro}
        ORDER BY d.unit_id, d.device_id`,
      params,
    );

    // O último lote e as contagens vêm do LOG, por aparelho. Uma consulta,
    // não uma por aparelho.
    const ultimos = await tx.query(
      // O último lote é o último RECEBIDO, no relógio do servidor. Ordenar pelo
      // `occurred_at` deixava um relógio adiantado prender o "último lote" num
      // ponto de amanhã, escondendo os que chegaram depois dele.
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

    const aparelhos: AparelhoReal[] = linhas.map((l) => ({
      device_id: String(l.device_id),
      unit_id: String(l.unit_id),
      actor_id: l.actor_id === null ? null : String(l.actor_id),
      label: String(l.label),
      autorizado_em: iso(l.registered_at)!,
      credencial_vinculada_em: iso(l.secret_bound_at),
      ultima_sessao_em: iso(l.last_session_at),
      app_version: l.app_version === null ? null : String(l.app_version),
      revogado_em: iso(l.revoked_at),
      fatos_por_modo: contagemPor.get(String(l.device_id)) ?? { real: 0, simulated: 0, control: 0 },
      ultimo_lote: ultimoPor.get(String(l.device_id)) ?? null,
    }));

    // A projeção é a MESMA do assíncrono, sobre a MESMA porta de leitura da
    // Q-016. Não existe uma segunda maneira de ler o log.
    const escopos = new Map<string, { unit_id: string; source_mode: SourceMode }>();
    for (const f of leitura.aptos) {
      if (opcoes.unit_id && f.unit_id !== opcoes.unit_id) continue;
      escopos.set(`${f.unit_id}|${f.source_mode}`, { unit_id: f.unit_id, source_mode: f.source_mode });
    }
    const projecoes: ViagensDeUmModo[] = [...escopos.values()]
      .sort((a, b) => `${a.unit_id}|${a.source_mode}`.localeCompare(`${b.unit_id}|${b.source_mode}`))
      .map((e) => ({
        unit_id: e.unit_id,
        source_mode: e.source_mode,
        viagens: projetar(leitura.aptos, { agora: opcoes.agora, unit_id: e.unit_id, source_mode: e.source_mode }).viagens,
      }));

    return {
      versao: PORTA_DE_REALIDADE_VERSION,
      fonte: "postgresql",
      lida_em: opcoes.agora.toISOString(),
      aparelhos,
      projecoes,
      historico_sem_modo: leitura.sem_modo,
    };
  });
}
