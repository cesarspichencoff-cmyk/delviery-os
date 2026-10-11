/**
 * Q-026 — MVCC, VACUUM e concorrência: peças comuns do experimento. Somente teste.
 *
 * Tudo aqui é SINTÉTICO e determinístico: nenhum dado de cliente, nenhum banco
 * operacional. O banco é criado por `bancoIsolado` e apagado no fim.
 * Nenhum fato sintético é carimbado `real`: só `simulated` e `control`.
 *
 * Perfis de carga (fatos dos tipos da Operação Viva):
 *  - `longa`  : uma viagem com N fatos de GPS (o caso em que o incremental mais economiza memória);
 *  - `curtas` : V viagens de 3 fatos cada (o caso em que ele quase não economiza);
 *  - `mista`  : metade de cada.
 * Mais uma tabela `q026_churn` sem autovacuum, onde um escritor faz UPDATE
 * contínuo: é nela que se mede o que um instante MVCC aberto impede o VACUUM
 * de limpar. O horizonte é do banco inteiro; a tabela só torna isso medível.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

import type { SqlClient } from "../../src/platform/persistence/sql-client";

export type Perfil = "longa" | "curtas" | "mista";

export interface TamanhoDoPerfil {
  /** Fatos de GPS na viagem longa. */
  longa: number;
  /** Viagens curtas, 3 fatos cada. */
  curtas: number;
}

/** Tamanho base de cada perfil; `escala` multiplica. */
export function tamanhoDo(perfil: Perfil, escala: number): TamanhoDoPerfil {
  const base: Record<Perfil, TamanhoDoPerfil> = {
    longa: { longa: 200_000, curtas: 0 },
    curtas: { longa: 0, curtas: 60_000 },
    mista: { longa: 100_000, curtas: 30_000 },
  };
  const b = base[perfil];
  return { longa: Math.round(b.longa * escala), curtas: Math.round(b.curtas * escala) };
}

export const LINHAS_DE_CHURN = 10_000;
export const DISPOSITIVOS_CURTOS = 20;

const INSERT_FATO = `INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,
  occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)`;

/**
 * Semeia o perfil em lotes de SQL (generate_series), sem dado real.
 * Devolve o número de fatos inseridos.
 */
export async function semearPerfil(c: SqlClient, t: TamanhoDoPerfil): Promise<number> {
  await c.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Unidade sintetica Q-026 MVCC')");
  const aparelhos = ["('Q026-DEV-L','ITAIM','Moto sintetica longa','2026-10-09T00:00:00Z')", "('Q026-DEV-V','ITAIM','Moto sintetica viva','2026-10-09T00:00:00Z')"];
  for (let i = 1; i <= DISPOSITIVOS_CURTOS; i += 1) {
    aparelhos.push(`('Q026-DEV-${String(i).padStart(2, "0")}','ITAIM','Moto sintetica ${i}','2026-10-09T00:00:00Z')`);
  }
  await c.query(`INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES ${aparelhos.join(",")}`);
  let fatos = 0;
  const PEDACO = 50_000;
  for (let ini = 1; ini <= t.longa; ini += PEDACO) {
    const fim = Math.min(t.longa, ini + PEDACO - 1);
    await c.query(
      `${INSERT_FATO}
       SELECT 'q026m-l-'||g,'ITAIM','trip','Q026-LONGA','gps_batch_received','{}'::jsonb,
              TIMESTAMPTZ '2026-10-10T10:00:00Z'+(g*interval '10 millisecond'),
              TIMESTAMPTZ '2026-10-10T10:00:00Z'+(g*interval '10 millisecond'),
              'device','q026m-l-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-DEV-L','trusted'
         FROM generate_series($1::int,$2::int) AS g`,
      [ini, fim],
    );
    fatos += fim - ini + 1;
  }
  const TIPOS = ["trip_created", "trip_started", "gps_batch_received"];
  const PEDACO_V = 20_000;
  for (let ini = 1; ini <= t.curtas; ini += PEDACO_V) {
    const fim = Math.min(t.curtas, ini + PEDACO_V - 1);
    for (let k = 0; k < TIPOS.length; k += 1) {
      await c.query(
        `${INSERT_FATO}
         SELECT 'q026m-c-'||g||'-'||$3::int,'ITAIM','trip','Q026-CURTA-'||g,$4::text,'{}'::jsonb,
                TIMESTAMPTZ '2026-10-10T08:00:00Z'+(g*interval '1 second')+($3::int*interval '20 second'),
                TIMESTAMPTZ '2026-10-10T08:00:00Z'+(g*interval '1 second')+($3::int*interval '20 second'),
                'device','q026m-c-'||g||'-'||$3::int,$4::text||'@1.0.0',
                (ARRAY['simulated','control'])[1+(g%2)],$3::int+1,
                'Q026-DEV-'||lpad((1+(g%${DISPOSITIVOS_CURTOS}))::text,2,'0'),'trusted'
           FROM generate_series($1::int,$2::int) AS g`,
        [ini, fim, k, TIPOS[k]],
      );
      fatos += fim - ini + 1;
    }
  }
  return fatos;
}

/** A tabela de rotatividade: UPDATE contínuo gera versões mortas que só o VACUUM limpa. */
export async function criarChurn(c: SqlClient): Promise<void> {
  await c.query(
    `CREATE TABLE public.q026_churn (id int PRIMARY KEY, v bigint NOT NULL, pad text NOT NULL)
       WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false)`,
  );
  await c.query(
    `INSERT INTO public.q026_churn SELECT g, 0, repeat('x', 80) FROM generate_series(1, ${LINHAS_DE_CHURN}) AS g`,
  );
}

/**
 * Papel de leitura mínimo, como o da candidata: só SELECT no que a rota lê.
 * Um papel por instância, para o amostrador distinguir as instâncias em
 * `pg_stat_activity.usename` (as instâncias usam o mesmo application_name).
 */
export async function criarPapeisDeLeitura(
  admin: SqlClient,
  noBanco: SqlClient,
  banco: string,
  quantos: number,
  prefixo: string,
): Promise<string[]> {
  const nomes: string[] = [];
  for (let i = 1; i <= quantos; i += 1) {
    const nome = `${prefixo}_${i}`;
    // Papel é do cluster; schema e tabela são do banco — cada GRANT na sua conexão.
    await admin.query(`CREATE ROLE ${nome} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    nomes.push(nome);
    await admin.query(`GRANT CONNECT ON DATABASE ${banco} TO ${nome}`);
    await noBanco.query(`GRANT USAGE ON SCHEMA identity, platform TO ${nome}`);
    await noBanco.query(`GRANT SELECT ON identity.device, platform.event_log TO ${nome}`);
  }
  return nomes;
}

export function urlComUsuario(url: string, usuario: string): string {
  const u = new URL(url);
  u.username = usuario;
  u.password = "";
  return u.toString();
}

/* ------------------------------------------------------------------ *
 * Estatística — nada é descartado; toda amostra vai para o JSON.
 * ------------------------------------------------------------------ */

export function quantil(ordenados: readonly number[], q: number): number | null {
  if (ordenados.length === 0) return null;
  const pos = (ordenados.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return ordenados[lo]! + (ordenados[hi]! - ordenados[lo]!) * (pos - lo);
}

export interface Resumo {
  n: number;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  media: number | null;
  /** p99 só é declarado com amostra suficiente; abaixo disso fica null e marcado. */
  p99_valido: boolean;
}

/** Abaixo disto o p99 é só o maior valor — não é declarado. */
export const N_MINIMO_P99 = 200;

export function resumir(xs: readonly number[]): Resumo {
  const o = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const r = (x: number | null) => (x === null ? null : +x.toFixed(2));
  return {
    n: o.length,
    min: r(o[0] ?? null),
    p50: r(quantil(o, 0.5)),
    p95: r(quantil(o, 0.95)),
    p99: o.length >= N_MINIMO_P99 ? r(quantil(o, 0.99)) : null,
    max: r(o[o.length - 1] ?? null),
    media: o.length ? r(o.reduce((s, x) => s + x, 0) / o.length) : null,
    p99_valido: o.length >= N_MINIMO_P99,
  };
}

/**
 * Intervalo de confiança do quantil por bootstrap (determinístico: semente fixa).
 * Serve para dizer, sem retórica, quanto um p95 de poucas amostras vale.
 */
export function icBootstrap(xs: readonly number[], q: number, reps = 1000): [number, number] | null {
  if (xs.length < 20) return null;
  let s = 0x9e3779b9;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
  const est: number[] = [];
  for (let r = 0; r < reps; r += 1) {
    const amostra: number[] = [];
    for (let i = 0; i < xs.length; i += 1) amostra.push(xs[Math.floor(rand() * xs.length)]!);
    amostra.sort((a, b) => a - b);
    est.push(quantil(amostra, q)!);
  }
  est.sort((a, b) => a - b);
  return [+quantil(est, 0.025)!.toFixed(2), +quantil(est, 0.975)!.toFixed(2)];
}

/* ------------------------------------------------------------------ *
 * Processos filhos — cada peça mede em processo próprio.
 * ------------------------------------------------------------------ */

export interface Filho {
  proc: ChildProcess;
  /** Mensagens IPC recebidas, na ordem. */
  mensagens: Array<Record<string, unknown>>;
  esperar(tipo: string, ms: number): Promise<Record<string, unknown>>;
  enviar(m: Record<string, unknown>): void;
  terminado: Promise<number | null>;
  saida: string[];
}

/** Sobe um .ts com o mesmo carregador tsx deste processo, com canal IPC. */
export function subirFilho(arquivo: string, env: Record<string, string | undefined>, rotulo: string): Filho {
  const proc = spawn(process.execPath, [...process.execArgv, arquivo], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const mensagens: Array<Record<string, unknown>> = [];
  const saida: string[] = [];
  const ouvintes: Array<(m: Record<string, unknown>) => void> = [];
  proc.on("message", (m) => {
    const msg = m as Record<string, unknown>;
    mensagens.push(msg);
    for (const o of [...ouvintes]) o(msg);
  });
  for (const fluxo of [proc.stdout!, proc.stderr!]) {
    createInterface({ input: fluxo }).on("line", (l) => {
      saida.push(l);
      if (saida.length > 400) saida.shift();
    });
  }
  const terminado = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
  return {
    proc,
    mensagens,
    saida,
    terminado,
    enviar: (m) => {
      if (proc.connected) proc.send(m);
    },
    esperar: (tipo, ms) =>
      new Promise((resolve, reject) => {
        const ja = mensagens.find((m) => m.tipo === tipo);
        if (ja) return resolve(ja);
        const timer = setTimeout(() => {
          reject(new Error(`${rotulo}: '${tipo}' não chegou em ${ms} ms. Saída: ${saida.slice(-15).join(" | ")}`));
        }, ms);
        const ouvinte = (m: Record<string, unknown>) => {
          if (m.tipo !== tipo) return;
          clearTimeout(timer);
          ouvintes.splice(ouvintes.indexOf(ouvinte), 1);
          resolve(m);
        };
        ouvintes.push(ouvinte);
        void terminado.then((code) => {
          clearTimeout(timer);
          reject(new Error(`${rotulo}: terminou (código ${String(code)}) antes de '${tipo}'. Saída: ${saida.slice(-15).join(" | ")}`));
        });
      }),
  };
}

export const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
