/**
 * Q-026 — a loja sintética das provas do leitor incremental. Somente teste.
 *
 * Mesma base do PR #52 (`run-q026-full-rr-memory-isolated-shadow.ts`), para os
 * números serem comparáveis: 6.000 fatos mistos de `gerarLinhas` (16
 * aparelhos, duas unidades, três modos, empates, atrasos, relógio suspeito),
 * um fato UNKNOWN gravado ANTES da 0003, uma sequência corrompida, um GPS de
 * aparelho sem viagem, um aparelho autorizado sem telemetria e uma viagem
 * longa misturada no mesmo escopo das curtas. Datas fixas: bancos semeados em
 * processos diferentes produzem o MESMO conteúdo.
 *
 * Acréscimos desta prova: um aparelho revogado, um fato com `occurred_at`
 * infinito (quarentena; fora do último lote de qualquer aparelho) e, quando
 * pedido, muitas viagens curtas e distintas.
 */

import { bancoIsolado, type BancoIsolado } from "../../src/platform/banco-isolado";
import { gerarLinhas, gravarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";

export const AGORA_DA_LOJA = PERFIL_LOJA.agora;
export const FATOS_MISTOS = 6000;

export interface OpcoesDaLoja {
  /** Fatos da viagem longa (0 = sem viagem longa). */
  longa: number;
  /** Viagens curtas distintas a mais, com 3 fatos cada (0 = nenhuma). */
  viagens_curtas?: number;
  prefixo?: string;
}

export interface Loja {
  banco: BancoIsolado;
  /** Fatos dos tipos da Operação Viva gravados, contando UNKNOWN e quarentena. */
  linhas: number;
  /** Aparelhos no cadastro: os do log misto, o silencioso e o revogado. */
  aparelhos: number;
}

export async function semearLoja(url: string, o: OpcoesDaLoja): Promise<Loja> {
  const b = await bancoIsolado(url, "0002_event_log_contexto_dispositivo", o.prefixo ?? "q026inc");
  try {
    // Antes da 0003: sem `source_mode` — UNKNOWN de verdade.
    await b.cliente.query(
      `INSERT INTO platform.event_log
         (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at,
          origin, idempotency_key, contract_version, device_id, sequence_local)
       VALUES ('old-mode-null','ITAIM','trip','T-OLD','trip_started','{}',
               '2026-09-01T10:00:00Z','device','old-mode-null','trip_started@1.0.0','DEV-01',1)`,
    );
    await b.migrarTudo();
    await b.cliente.query(
      `INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim'),('LAB-BANCADA','Lab'),('CURTAS','Curtas')`,
    );
    const dados = gerarLinhas({
      ...PERFIL_LOJA,
      fatos: FATOS_MISTOS,
      semente: 1347,
      aparelhos: 16,
      pontos_por_viagem: 80,
      unidades: ["ITAIM", "LAB-BANCADA"],
      empates: 0.06,
      atrasados: 0.07,
      suspeitos: 0.04,
    });
    const aparelhos = new Set(dados.map((d) => JSON.stringify([d.device_id, d.unit_id])));
    for (const x of [...aparelhos].sort()) {
      const [id, unit] = JSON.parse(x) as [string, string];
      await b.cliente.query(
        `INSERT INTO identity.device(device_id, unit_id, label, registered_at) VALUES ($1,$2,$1,'2026-10-09T00:00:00Z')`,
        [id, unit],
      );
    }
    await gravarLinhas(b.cliente, [...dados].sort((a, c) => a.recorded_at.localeCompare(c.recorded_at)));
    await b.cliente.query(
      `INSERT INTO identity.device(device_id, unit_id, label, registered_at) VALUES
         ('DEV-NO-GPS','ITAIM','No telemetry','2026-10-09T00:00:00Z'),
         ('DEV-REVOGADO','LAB-BANCADA','Revogado','2026-10-08T00:00:00Z')`,
    );
    await b.cliente.query(`UPDATE identity.device SET revoked_at = '2026-10-09T12:00:00Z' WHERE device_id = 'DEV-REVOGADO'`);
    await b.cliente.query(
      `UPDATE identity.device SET app_version='2026.10-shadow', secret_bound_at=$1,
              queue_pending_points=3, queue_pending_events=2, queue_depth_reported_at=$1
        WHERE device_id='DEV-01' AND unit_id='ITAIM'`,
      ["2026-10-09T22:00:00Z"],
    );
    await b.cliente.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
         occurred_at, recorded_at, origin, idempotency_key, contract_version, source_mode, sequence_local, device_id)
       VALUES ('bad-sequence-ui','ITAIM','trip','T-BAD','trip_started','{}',
               '2026-10-09T13:00:00Z','2026-10-09T13:00:01Z','device','bad-sequence-ui','trip_started@1.0.0','real',
               9223372036854775807,'DEV-01'),
              ('device-without-trip','ITAIM','device','DEV-01','gps_batch_received','{}',
               '2026-09-01T09:00:00Z','2026-09-01T09:00:01Z','device','device-without-trip',
               'gps_batch_received@1.0.0','real',9,'DEV-01'),
              ('instante-infinito','LAB-BANCADA','trip','T-INF','trip_created','{}',
               'infinity','2026-10-09T13:00:02Z','device','instante-infinito','trip_created@1.0.0','control',1,NULL)`,
    );
    let linhas = 1 + FATOS_MISTOS + 3;

    if (o.longa > 0) {
      // A viagem longa no MESMO escopo (ITAIM, simulated) das curtas.
      const sql = `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
           occurred_at, recorded_at, origin, idempotency_key, contract_version, source_mode, sequence_local, device_id, clock_trust)
         SELECT 'extra-'||g, 'ITAIM', 'trip', 'Q026-ONE-LONG',
           CASE WHEN g=1 THEN 'trip_started' WHEN g%201=0 THEN 'trip_closed'
                WHEN g%37=0 THEN 'occurrence_created' WHEN g%17=0 THEN 'trip_return_started'
                ELSE 'gps_batch_received' END, '{}'::jsonb,
           TIMESTAMPTZ '2026-10-09T18:00:00Z' + ((g%500)::double precision * interval '0.2 second'),
           TIMESTAMPTZ '2026-10-09T18:00:00Z' + ((g%500)::double precision * interval '0.2 second') +
             (CASE WHEN g%23=0 THEN interval '300 second' ELSE interval '0 second' END),
           'device', 'extra-key-'||g,
           (CASE WHEN g=1 THEN 'trip_started' WHEN g%201=0 THEN 'trip_closed'
                 WHEN g%37=0 THEN 'occurrence_created' WHEN g%17=0 THEN 'trip_return_started'
                 ELSE 'gps_batch_received' END)||'@1.0.0', 'simulated',
           CASE WHEN g%13=0 THEN NULL ELSE (g%5)::bigint END,
           CASE WHEN g%11=0 THEN NULL ELSE 'DEV-01' END,
           CASE WHEN g%23=0 THEN 'suspect' ELSE 'trusted' END
         FROM generate_series($1::integer, $2::integer) g`;
      for (let g = 1; g <= o.longa; g += 30000) await b.cliente.query(sql, [g, Math.min(o.longa, g + 29999)]);
      linhas += o.longa;
    }

    const curtas = o.viagens_curtas ?? 0;
    if (curtas > 0) {
      // Viagens curtas e distintas nos três modos, numa unidade própria (assim o
      // escopo ITAIM/real continua só com o fato sem viagem): o número de
      // viagens é o que a memória do leitor incremental acompanha.
      const sql = `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
           occurred_at, recorded_at, origin, idempotency_key, contract_version, source_mode, sequence_local, device_id, clock_trust)
         SELECT 'curta-'||v||'-'||k, 'CURTAS', 'trip', 'CURTA-'||v,
           (ARRAY['trip_created','trip_started','gps_batch_received'])[k], '{}'::jsonb,
           TIMESTAMPTZ '2026-10-09T08:00:00Z' + (v * interval '1 second') + (k * interval '20 second'),
           TIMESTAMPTZ '2026-10-09T08:00:00Z' + (v * interval '1 second') + (k * interval '20 second') + interval '1 second',
           'device', 'curta-key-'||v||'-'||k, (ARRAY['trip_created','trip_started','gps_batch_received'])[k]||'@1.0.0',
           (ARRAY['real','simulated','control'])[1 + v%3], k, 'DEV-0'||(1 + v%9), 'trusted'
         FROM generate_series($1::integer, $2::integer) v, generate_series(1, 3) k`;
      for (let v = 1; v <= curtas; v += 10000) await b.cliente.query(sql, [v, Math.min(curtas, v + 9999)]);
      linhas += curtas * 3;
    }
    return { banco: b, linhas, aparelhos: aparelhos.size + 2 };
  } catch (e) {
    await b.descartar();
    throw e;
  }
}
