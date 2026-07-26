/**
 * Configuração dos runtimes — contrato de ambiente, `fail-closed`.
 *
 * A regra que organiza este arquivo: **o processo recusa subir quando a
 * configuração não sustenta a promessa que ele faz.** Subir "degradado" por
 * causa de variável faltando é pior que não subir: o balanceador manda
 * tráfego, a operação confia, e a descoberta acontece na sexta à noite.
 *
 * Nenhum valor sensível aparece em log. `describe()` existe para isso.
 */

import { isLocalUrl } from "../persistence/sql-client";

export type Ambiente = "local" | "pilot" | "production";

export interface PlatformConfig {
  ambiente: Ambiente;
  /** URL do PostgreSQL. Fora de local, exige TLS. */
  database_url: string;
  database_ssl: boolean;
  /** Porta HTTP do runtime. */
  port: number;
  /** Endereço de escuta. Fora de container, nunca 0.0.0.0 por acidente. */
  host: string;
  /** Commit da imagem. Sem isso, "qual código está no ar" vira arqueologia. */
  commit: string;
  version: string;
  instance_id: string;
  /** Intervalo do laço do worker assíncrono. */
  tick_ms: number;
  batch_size: number;
  /** Prazo do encerramento gracioso. */
  shutdown_timeout_ms: number;
  /** Aplica migrations pendentes no boot. */
  migrate_on_boot: boolean;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly variavel: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

function texto(env: NodeJS.ProcessEnv, nome: string, padrao?: string): string {
  const v = env[nome]?.trim();
  if (v) return v;
  if (padrao !== undefined) return padrao;
  throw new ConfigError(`variável obrigatória ausente: ${nome}`, nome);
}

function numero(env: NodeJS.ProcessEnv, nome: string, padrao: number): number {
  const bruto = env[nome]?.trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  // NaN silencioso vira timeout zero ou lote zero — o worker "roda" sem
  // processar nada e ninguém entende por quê.
  if (!Number.isFinite(n) || n <= 0) {
    throw new ConfigError(`${nome} precisa ser um número positivo (recebido: ${bruto})`, nome);
  }
  return n;
}

function booleano(env: NodeJS.ProcessEnv, nome: string, padrao: boolean): boolean {
  const v = env[nome]?.trim().toLowerCase();
  if (v === undefined || v === "") return padrao;
  if (["1", "true", "sim", "yes"].includes(v)) return true;
  if (["0", "false", "nao", "não", "no"].includes(v)) return false;
  throw new ConfigError(`${nome} precisa ser verdadeiro ou falso (recebido: ${v})`, nome);
}

const AMBIENTES: readonly Ambiente[] = ["local", "pilot", "production"];

export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const ambienteBruto = texto(env, "DELIVERYOS_ENV", "local");
  if (!AMBIENTES.includes(ambienteBruto as Ambiente)) {
    throw new ConfigError(
      `DELIVERYOS_ENV inválido: ${ambienteBruto} (esperado: ${AMBIENTES.join(", ")})`,
      "DELIVERYOS_ENV",
    );
  }
  const ambiente = ambienteBruto as Ambiente;

  const database_url = texto(env, "DELIVERYOS_DATABASE_URL");
  if (!/^postgres(ql)?:\/\//.test(database_url)) {
    throw new ConfigError(
      "DELIVERYOS_DATABASE_URL precisa ser uma URL postgres://",
      "DELIVERYOS_DATABASE_URL",
    );
  }

  const local = isLocalUrl(database_url);
  const database_ssl = booleano(env, "DELIVERYOS_DATABASE_SSL", !local);
  if (!local && !database_ssl) {
    throw new ConfigError(
      "banco remoto sem TLS: defina DELIVERYOS_DATABASE_SSL=true",
      "DELIVERYOS_DATABASE_SSL",
    );
  }

  const commit = texto(env, "DELIVERYOS_COMMIT", ambiente === "local" ? "local-dev" : "");
  if (ambiente !== "local" && commit.length < 7) {
    // Fora do desenvolvimento, imagem sem commit é imagem que ninguém
    // consegue reproduzir depois.
    throw new ConfigError(
      "DELIVERYOS_COMMIT obrigatório fora do ambiente local",
      "DELIVERYOS_COMMIT",
    );
  }

  // `migrate_on_boot` é ligado por padrão só em local. Em produção, aplicar
  // schema no boot faz N réplicas correrem a mesma migration ao mesmo tempo,
  // e transforma um deploy em uma corrida.
  const migrate_on_boot = booleano(env, "DELIVERYOS_MIGRATE_ON_BOOT", ambiente === "local");

  return {
    ambiente,
    database_url,
    database_ssl,
    port: numero(env, "DELIVERYOS_PORT", 8080),
    host: texto(env, "DELIVERYOS_HOST", ambiente === "local" ? "127.0.0.1" : "0.0.0.0"),
    commit,
    version: texto(env, "DELIVERYOS_VERSION", "0.0.0-dev"),
    instance_id: texto(env, "DELIVERYOS_INSTANCE_ID", `i-${process.pid}`),
    tick_ms: numero(env, "DELIVERYOS_TICK_MS", 1_000),
    batch_size: numero(env, "DELIVERYOS_BATCH_SIZE", 25),
    shutdown_timeout_ms: numero(env, "DELIVERYOS_SHUTDOWN_TIMEOUT_MS", 25_000),
    migrate_on_boot,
  };
}

/**
 * Resumo para log de boot.
 *
 * A URL do banco aparece SEM usuário e SEM senha. Credencial em log de boot é
 * credencial em toda ferramenta de observabilidade que coletar aquele log, e
 * em todo backup dele.
 */
export function describe(cfg: PlatformConfig): Record<string, string | number | boolean> {
  let bancoVisivel = "invalida";
  try {
    const u = new URL(cfg.database_url);
    bancoVisivel = `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    /* mantém "invalida" */
  }
  return {
    ambiente: cfg.ambiente,
    banco: bancoVisivel,
    tls: cfg.database_ssl,
    host: cfg.host,
    port: cfg.port,
    versao: cfg.version,
    commit: cfg.commit,
    instancia: cfg.instance_id,
    tick_ms: cfg.tick_ms,
    lote: cfg.batch_size,
    migra_no_boot: cfg.migrate_on_boot,
  };
}
