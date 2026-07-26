/**
 * Contrato de configuração para hospedagem — variáveis de ambiente.
 *
 * O piloto local lê `config/entregas-pilot.json`, um arquivo com TOKENS EM
 * TEXTO CLARO. Isso funciona numa máquina só; num contêiner, significa uma de
 * duas coisas ruins: assar o segredo na imagem, ou montar um arquivo secreto
 * a mais para gerenciar. Nenhuma das duas é como se entrega serviço.
 *
 * Aqui o ambiente **sobrepõe** o arquivo. O arquivo continua valendo para o
 * uso local (nada quebra); em nuvem, `ENTREGAS_USERS` manda.
 *
 * Duas regras que este módulo aplica e o carregamento antigo não aplicava:
 *
 *  - **falha fechada de verdade.** Token `CHANGE_ME` hoje só emite um aviso
 *    no console e o servidor sobe. Num piloto local, alguém lê o aviso. Numa
 *    máquina remota, ninguém está olhando o terminal — e o sistema fica no ar
 *    com credencial de exemplo. Em `ENTREGAS_ENV=cloud`, isso derruba o boot;
 *
 *  - **origem declarada.** `Access-Control-Allow-Origin: *` é aceitável em
 *    localhost e inaceitável exposto: qualquer página da internet passa a
 *    poder falar com a API a partir do navegador de quem estiver logado.
 *
 * Nenhum segredo é impresso. `describe()` existe para o boot poder dizer o
 * que carregou sem dizer o que é.
 */

export const CLOUD_CONFIG_VERSION = "cloud-config@1.0.0";

export type EntregasEnv = "local" | "pilot" | "cloud";

export interface CloudConfigIssue {
  variable: string;
  message: string;
}

export interface ParsedUser {
  actor_id: string;
  role: string;
  label: string;
  token: string;
}

export interface CloudConfig {
  env: EntregasEnv;
  /** true quando o processo está exposto além do loopback. */
  remote: boolean;
  port: number;
  bind: string;
  /** URL pública, quando houver — usada para montar links e o alvo do APK. */
  publicUrl?: string;
  dataDir: string;
  backupDir: string;
  /** Origens permitidas. Vazio em `local` significa `*`. */
  allowedOrigins: string[];
  /** Usuários vindos do ambiente; vazio significa "use o arquivo". */
  users: ParsedUser[];
  unitId?: string;
  logLevel: "debug" | "info" | "warn" | "error";
  /** SHA-256 do APK que a página de distribuição deve oferecer. */
  apkSha256?: string;
  apkVersion?: string;
}

/** Papéis aceitos — espelha `OperationalRole`, validado na borda. */
const VALID_ROLES = [
  "gerente",
  "lider_delivery",
  "operador_expedicao",
  "motoboy_interno",
  "sistema",
] as const;

/** Marcadores de exemplo que jamais podem virar credencial real. */
const PLACEHOLDER_TOKENS = ["CHANGE_ME", "TROQUE", "EXEMPLO", "SEU_TOKEN", "TODO"];

/** Tamanho mínimo de token para exposição remota. */
const MIN_REMOTE_TOKEN_LENGTH = 24;

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined || v.trim() === "") return dflt;
  return v === "1" || v.toLowerCase() === "true";
}

/**
 * Interpreta `ENTREGAS_USERS`.
 *
 * Formato: `actor_id:role:label:token`, separados por `;`. Escolhi texto
 * simples em vez de JSON porque a variável passa por painel de nuvem, YAML e
 * shell — JSON aninhado vira um inferno de escape e alguém acaba colando
 * aspas quebradas sem perceber.
 */
export function parseUsers(raw: string | undefined): {
  users: ParsedUser[];
  issues: CloudConfigIssue[];
} {
  const issues: CloudConfigIssue[] = [];
  if (!raw || !raw.trim()) return { users: [], issues };

  const users: ParsedUser[] = [];
  const seenTokens = new Set<string>();
  const seenActors = new Set<string>();

  for (const entry of raw.split(";")) {
    const item = entry.trim();
    if (!item) continue;
    const parts = item.split(":");
    if (parts.length < 4) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: "cada usuário precisa de actor_id:role:label:token",
      });
      continue;
    }
    // O token é a última parte; o label pode conter ':'.
    const actor_id = parts[0].trim();
    const role = parts[1].trim();
    const token = parts[parts.length - 1].trim();
    const label = parts.slice(2, parts.length - 1).join(":").trim();

    if (!actor_id) {
      issues.push({ variable: "ENTREGAS_USERS", message: "actor_id vazio" });
      continue;
    }
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: `papel desconhecido "${role}" para ${actor_id}`,
      });
      continue;
    }
    if (!token) {
      issues.push({ variable: "ENTREGAS_USERS", message: `token vazio para ${actor_id}` });
      continue;
    }
    // Token repetido faria dois papéis compartilharem credencial — e o de
    // maior privilégio venceria na busca. Silencioso e grave.
    if (seenTokens.has(token)) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: "dois usuários com o mesmo token",
      });
      continue;
    }
    if (seenActors.has(actor_id)) {
      issues.push({ variable: "ENTREGAS_USERS", message: `actor_id repetido: ${actor_id}` });
      continue;
    }
    seenTokens.add(token);
    seenActors.add(actor_id);
    users.push({ actor_id, role, label: label || actor_id, token });
  }

  return { users, issues };
}

export type CloudConfigResult =
  | { ok: true; config: CloudConfig }
  | { ok: false; issues: CloudConfigIssue[] };

/**
 * Lê e valida o ambiente. Falha fechada: qualquer problema em modo remoto
 * impede o boot, em vez de subir degradado.
 */
export function loadCloudConfig(env: Record<string, string | undefined>): CloudConfigResult {
  const issues: CloudConfigIssue[] = [];

  const rawEnv = (env.ENTREGAS_ENV || "local").trim().toLowerCase();
  if (!["local", "pilot", "cloud"].includes(rawEnv)) {
    issues.push({
      variable: "ENTREGAS_ENV",
      message: `valor inválido "${rawEnv}" — use local, pilot ou cloud`,
    });
  }
  const entregasEnv = (["local", "pilot", "cloud"].includes(rawEnv) ? rawEnv : "local") as EntregasEnv;

  const bind = (env.ENTREGAS_BIND || "127.0.0.1").trim();
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(bind);
  // "Remoto" é o que decide o rigor: ou o operador declarou cloud, ou o
  // processo está escutando além do loopback. Qualquer um dos dois basta.
  const remote = entregasEnv === "cloud" || !loopback;

  const port = Number(env.ENTREGAS_UI_PORT || env.PORT || 5193);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push({ variable: "ENTREGAS_UI_PORT", message: "porta inválida" });
  }

  const { users, issues: userIssues } = parseUsers(env.ENTREGAS_USERS);
  issues.push(...userIssues);

  for (const u of users) {
    if (PLACEHOLDER_TOKENS.some((p) => u.token.toUpperCase().includes(p))) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: `token de exemplo para ${u.actor_id} — troque antes de expor`,
      });
    }
    if (remote && u.token.length < MIN_REMOTE_TOKEN_LENGTH) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: `token de ${u.actor_id} curto demais para exposição remota (mínimo ${MIN_REMOTE_TOKEN_LENGTH})`,
      });
    }
  }

  const allowedOrigins = (env.ENTREGAS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (remote) {
    // Em exposição remota o ambiente precisa se declarar por inteiro.
    if (!users.length) {
      issues.push({
        variable: "ENTREGAS_USERS",
        message: "obrigatório em modo remoto — não deixe credencial em arquivo",
      });
    }
    if (!allowedOrigins.length) {
      issues.push({
        variable: "ENTREGAS_ALLOWED_ORIGINS",
        message: "obrigatório em modo remoto — CORS aberto expõe a API a qualquer site",
      });
    }
    if (allowedOrigins.includes("*")) {
      issues.push({
        variable: "ENTREGAS_ALLOWED_ORIGINS",
        message: '"*" não é aceito em modo remoto',
      });
    }
    if (!env.ENTREGAS_DATA_DIR?.trim()) {
      issues.push({
        variable: "ENTREGAS_DATA_DIR",
        message: "obrigatório em modo remoto — precisa apontar para volume persistente",
      });
    }
    const publicUrl = (env.ENTREGAS_PUBLIC_URL || "").trim();
    if (publicUrl && !publicUrl.startsWith("https://")) {
      issues.push({
        variable: "ENTREGAS_PUBLIC_URL",
        message: "precisa ser https:// — o GPS do aparelho não liga sem contexto seguro",
      });
    }
  }

  if (issues.length) return { ok: false, issues };

  const dataDir = (env.ENTREGAS_DATA_DIR || "data/entregas-pilot").trim();
  return {
    ok: true,
    config: {
      env: entregasEnv,
      remote,
      port,
      bind,
      publicUrl: (env.ENTREGAS_PUBLIC_URL || "").trim() || undefined,
      dataDir,
      backupDir: (env.ENTREGAS_BACKUP_DIR || "").trim() || "backups",
      allowedOrigins,
      users,
      unitId: (env.ENTREGAS_UNIT_ID || "").trim() || undefined,
      logLevel: (["debug", "info", "warn", "error"].includes(env.ENTREGAS_LOG_LEVEL || "")
        ? env.ENTREGAS_LOG_LEVEL
        : "info") as CloudConfig["logLevel"],
      apkSha256: (env.ENTREGAS_APK_SHA256 || "").trim() || undefined,
      apkVersion: (env.ENTREGAS_APK_VERSION || "").trim() || undefined,
    },
  };
}

/**
 * Resumo para o log de boot. Conta usuários e papéis; **nunca** token.
 * É o que permite diagnosticar configuração sem vazar credencial no log da
 * plataforma de nuvem, que costuma ser retido e indexado.
 */
export function describe(config: CloudConfig): Record<string, unknown> {
  return {
    config_version: CLOUD_CONFIG_VERSION,
    env: config.env,
    remote: config.remote,
    bind: config.bind,
    port: config.port,
    public_url: config.publicUrl ?? null,
    data_dir: config.dataDir,
    backup_dir: config.backupDir,
    allowed_origins: config.allowedOrigins.length ? config.allowedOrigins : ["(qualquer — modo local)"],
    users_count: config.users.length,
    roles: [...new Set(config.users.map((u) => u.role))].sort(),
    unit_id: config.unitId ?? null,
    log_level: config.logLevel,
    apk_sha256: config.apkSha256 ? `${config.apkSha256.slice(0, 12)}…` : null,
  };
}

/**
 * Decide o cabeçalho `Access-Control-Allow-Origin` para a requisição.
 *
 * Em modo local devolve `*`, que é o comportamento que os testes e o uso na
 * máquina do operador já esperam. Em modo remoto só devolve a origem quando
 * ela está na lista — e devolve `null` quando não está, para o chamador
 * simplesmente omitir o cabeçalho e o navegador barrar.
 */
export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  config: Pick<CloudConfig, "remote" | "allowedOrigins">,
): string | null {
  if (!config.remote) return "*";
  if (!requestOrigin) return null;
  return config.allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}
