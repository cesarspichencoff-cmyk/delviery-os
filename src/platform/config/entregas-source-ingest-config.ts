/**
 * Configuração do processo Entregas -> Platform source-ingest.
 *
 * OFF é o default. Quando ON, o backend da fonte é obrigatório e explícito:
 * file ou postgres. A URL da fonte PG é separada da URL alvo da plataforma.
 */
export interface EntregasSourceIngestCommonConfig {
  state_file: string;
  control_file: string;
  tick_ms: number;
  batch_size: number;
}

export type EntregasSourceIngestConfig =
  | { enabled: false }
  | ({
      enabled: true;
      source_backend: "file";
      source_file: string;
    } & EntregasSourceIngestCommonConfig)
  | ({
      enabled: true;
      source_backend: "postgres";
      source_database_url: string;
      source_database_ssl?: boolean;
      source_database_private_host?: string;
    } & EntregasSourceIngestCommonConfig);

export class EntregasSourceIngestConfigError extends Error {
  constructor(message: string, readonly variavel: string) {
    super(message);
    this.name = "EntregasSourceIngestConfigError";
  }
}

function flag(env: NodeJS.ProcessEnv, nome: string): boolean {
  const v = env[nome]?.trim().toLowerCase();
  if (!v) return false;
  if (["1", "true", "sim", "yes"].includes(v)) return true;
  if (["0", "false", "nao", "não", "no"].includes(v)) return false;
  throw new EntregasSourceIngestConfigError(
    nome + " precisa ser verdadeiro ou falso",
    nome,
  );
}

function optionalFlag(
  env: NodeJS.ProcessEnv,
  nome: string,
): boolean | undefined {
  const raw = env[nome]?.trim();
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (["1", "true", "sim", "yes"].includes(v)) return true;
  if (["0", "false", "nao", "não", "no"].includes(v)) return false;
  throw new EntregasSourceIngestConfigError(
    nome + " precisa ser verdadeiro ou falso",
    nome,
  );
}

function required(env: NodeJS.ProcessEnv, nome: string): string {
  const v = env[nome]?.trim();
  if (v) return v;
  throw new EntregasSourceIngestConfigError(
    "variável obrigatória ausente: " + nome,
    nome,
  );
}

function positive(env: NodeJS.ProcessEnv, nome: string, padrao: number): number {
  const raw = env[nome]?.trim();
  if (!raw) return padrao;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new EntregasSourceIngestConfigError(
      nome + " precisa ser inteiro positivo",
      nome,
    );
  }
  return n;
}

export function loadEntregasSourceIngestConfig(
  env: NodeJS.ProcessEnv = process.env,
): EntregasSourceIngestConfig {
  const enabled = flag(env, "DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED");
  if (!enabled) return { enabled: false };

  const backendRaw = required(
    env,
    "DELIVERYOS_ENTREGAS_SOURCE_BACKEND",
  ).toLowerCase();
  if (backendRaw !== "file" && backendRaw !== "postgres") {
    throw new EntregasSourceIngestConfigError(
      "DELIVERYOS_ENTREGAS_SOURCE_BACKEND precisa ser file ou postgres",
      "DELIVERYOS_ENTREGAS_SOURCE_BACKEND",
    );
  }

  const common: EntregasSourceIngestCommonConfig = {
    state_file: required(env, "DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE"),
    control_file: required(env, "DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE"),
    tick_ms: positive(env, "DELIVERYOS_ENTREGAS_SOURCE_TICK_MS", 1_000),
    batch_size: positive(env, "DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE", 50),
  };

  if (backendRaw === "file") {
    return {
      enabled: true,
      source_backend: "file",
      source_file: required(env, "DELIVERYOS_ENTREGAS_SOURCE_FILE"),
      ...common,
    };
  }

  const privateHost =
    env.DELIVERYOS_ENTREGAS_SOURCE_DATABASE_PRIVATE_HOST?.trim() || undefined;
  return {
    enabled: true,
    source_backend: "postgres",
    source_database_url: required(
      env,
      "DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL",
    ),
    source_database_ssl: optionalFlag(
      env,
      "DELIVERYOS_ENTREGAS_SOURCE_DATABASE_SSL",
    ),
    source_database_private_host: privateHost,
    ...common,
  };
}
