/**
 * Configuração do processo Entregas -> Platform source-ingest.
 *
 * Desligado por padrão e, desligado, não exige banco, feed nem arquivos.
 */
export type EntregasSourceIngestConfig =
  | { enabled: false }
  | {
      enabled: true;
      source_file: string;
      state_file: string;
      control_file: string;
      tick_ms: number;
      batch_size: number;
    };

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

  return {
    enabled: true,
    source_file: required(env, "DELIVERYOS_ENTREGAS_SOURCE_FILE"),
    state_file: required(env, "DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE"),
    control_file: required(env, "DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE"),
    tick_ms: positive(env, "DELIVERYOS_ENTREGAS_SOURCE_TICK_MS", 1_000),
    batch_size: positive(env, "DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE", 50),
  };
}
