/**
 * Q-026 — o ESCRITOR contínuo: o que acontece no banco enquanto alguém lê.
 * Somente teste, banco descartável, dados sintéticos.
 *
 *  - UPDATE em `q026_churn` a uma taxa fixa, uma transação por linha: cada
 *    UPDATE deixa uma versão morta e consome um XID — é o que permite medir o
 *    horizonte do VACUUM em XIDs e em versões não removíveis;
 *  - INSERT de fatos de GPS (`simulated`) numa viagem viva: o log continua
 *    crescendo durante as leituras, como na rua.
 *
 * A taxa é controlada por crédito (taxa × tempo decorrido − feito); se o
 * escritor atrasa, o atraso é reportado, não escondido.
 */

import { performance } from "node:perf_hooks";

import { createPgClient } from "../../src/platform/persistence/sql-client";
import { LINHAS_DE_CHURN } from "./q026-mvcc-comum";

const URL = (process.env.Q026_MVCC_URL ?? "").trim();
const UPDATES_S = Number(process.env.Q026_MVCC_UPDATES_S ?? 400);
const FATOS_S = Number(process.env.Q026_MVCC_FATOS_S ?? 20);
if (!URL || !Number.isFinite(UPDATES_S) || !Number.isFinite(FATOS_S)) {
  console.error("Q026_MVCC_ESCRITOR_ARGUMENTOS_INVALIDOS");
  process.exit(2);
}

const enviar = (m: Record<string, unknown>) => process.send?.(m);

void (async () => {
  const atualizador = await createPgClient({ url: URL, max: 1, statementTimeoutMs: 10_000 });
  const insertor = await createPgClient({ url: URL, max: 1, statementTimeoutMs: 10_000 });
  let parar = false;
  process.on("message", (m: { tipo?: string }) => {
    if (m.tipo === "parar") parar = true;
  });
  let updates = 0;
  let fatos = 0;
  let erros = 0;
  let semente = 12345;
  const proximo = () => {
    semente = (semente * 1103515245 + 12345) & 0x7fffffff;
    return 1 + (semente % LINHAS_DE_CHURN);
  };
  const inicio = performance.now();
  let maiorAtraso = 0;

  const laco = async (taxa: number, fazer: () => Promise<void>, contar: () => number) => {
    while (!parar) {
      const devido = Math.floor(((performance.now() - inicio) / 1000) * taxa);
      const atraso = devido - contar();
      if (atraso > 0) {
        maiorAtraso = Math.max(maiorAtraso, atraso);
        try {
          await fazer();
        } catch {
          erros += 1;
        }
      } else {
        await new Promise<void>((r) => setTimeout(r, 5));
      }
    }
  };

  const relatorio = setInterval(() => {
    enviar({ tipo: "escritor", t: Date.now(), updates, fatos, erros, maior_atraso: maiorAtraso });
    maiorAtraso = 0;
  }, 1000);

  await Promise.all([
    laco(
      UPDATES_S,
      async () => {
        await atualizador.query("UPDATE public.q026_churn SET v = v + 1 WHERE id = $1", [proximo()]);
        updates += 1;
      },
      () => updates,
    ),
    laco(
      FATOS_S,
      async () => {
        const n = fatos + 1;
        await insertor.query(
          `INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,
             occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)
           VALUES ($1,'ITAIM','trip','Q026-VIVA','gps_batch_received','{}'::jsonb, now(), now(),
                   'device',$1,'gps_batch_received@1.0.0','simulated',$2,'Q026-DEV-V','trusted')`,
          [`q026m-v-${process.pid}-${n}`, n],
        );
        fatos += 1;
      },
      () => fatos,
    ),
  ]);
  clearInterval(relatorio);
  enviar({ tipo: "escritor_fim", updates, fatos, erros, duracao_ms: Math.round(performance.now() - inicio) });
  await atualizador.close();
  await insertor.close();
  process.exit(0);
})().catch((e) => {
  console.error("Q026_MVCC_ESCRITOR_FALHOU", e);
  process.exit(1);
});
