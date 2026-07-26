/**
 * Contratos de runtime da plataforma híbrida.
 *
 * O DeliveryOS roda em dois processos com responsabilidades diferentes:
 *
 *  - **crítico**: o que a operação não pode perder. Viagem, GPS, ocorrência,
 *    event log, outbox. Nunca espera por CRM, Copiloto ou IA;
 *  - **assíncrono**: o que pode atrasar sem parar a rua. Consome a outbox e
 *    executa jobs. Pode cair, reiniciar e acumular backlog.
 *
 * A regra que organiza tudo: **o crítico grava, o assíncrono consome.** Se o
 * assíncrono sumir, a operação continua e o backlog espera. O contrário não
 * vale — se o crítico não persiste, nada mais importa.
 */

export const PLATFORM_CONTRACT_VERSION = "platform@1.0.0";

export const RUNTIME_KINDS = ["critical", "async"] as const;
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

/**
 * Estados de saúde, do melhor para o pior.
 *
 * `degraded` é o estado mais importante e o mais fácil de errar: significa
 * "atendo, mas com menos do que deveria". Um runtime crítico que perdeu o
 * consumidor assíncrono está degradado, não indisponível — a rua continua.
 * Um runtime crítico que não consegue gravar NÃO está degradado: está
 * bloqueado, e dizer `healthy` ali seria mentir para o balanceador.
 */
export const HEALTH_STATES = [
  "healthy",
  "degraded",
  "read_only",
  "blocked",
  "unavailable",
] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

/** Ordem de gravidade — usada para compor a saúde de várias dependências. */
const SEVERITY: Record<HealthState, number> = {
  healthy: 0,
  degraded: 1,
  read_only: 2,
  blocked: 3,
  unavailable: 4,
};

export function worstOf(states: readonly HealthState[]): HealthState {
  if (!states.length) return "unavailable";
  return states.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

/** Uma dependência declarada do runtime. */
export interface DependencyHealth {
  name: string;
  state: HealthState;
  /** true quando a ausência desta dependência impede persistir fatos. */
  essential: boolean;
  detail?: string;
  checked_at: string;
}

export interface RuntimeIdentity {
  kind: RuntimeKind;
  /** Versão do pacote. */
  version: string;
  /** Commit de onde a imagem foi construída — sem isso, "qual código está no
   *  ar?" vira arqueologia. */
  commit: string;
  /** Instância, para distinguir réplicas no log. */
  instance_id: string;
  started_at: string;
}

export interface RuntimeHealth {
  state: HealthState;
  identity: RuntimeIdentity;
  dependencies: DependencyHealth[];
  /** Frase curta e honesta para quem está olhando o painel. */
  summary: string;
  uptime_s: number;
}

/**
 * Compõe a saúde do runtime a partir das dependências.
 *
 * A regra dura: **se alguma dependência essencial não está saudável, o
 * runtime nunca reporta `healthy`.** É o ponto onde um health check descuidado
 * transforma perda de dados em "tudo verde" — o balanceador continua mandando
 * tráfego para um processo que não consegue gravar.
 */
export function composeHealth(args: {
  identity: RuntimeIdentity;
  dependencies: DependencyHealth[];
  now: Date;
}): RuntimeHealth {
  const essentials = args.dependencies.filter((d) => d.essential);
  const optionals = args.dependencies.filter((d) => !d.essential);

  let state: HealthState;
  if (!essentials.length) {
    // Runtime sem dependência essencial declarada: só pode ser o assíncrono,
    // que sobrevive sozinho. Ainda assim herda o pior dos opcionais.
    state = optionals.length ? worstOf(optionals.map((d) => d.state)) : "healthy";
  } else {
    const worstEssential = worstOf(essentials.map((d) => d.state));
    if (worstEssential !== "healthy") {
      state = worstEssential;
    } else {
      // Essenciais bem: opcional ruim degrada, mas não bloqueia.
      const worstOptional = optionals.length
        ? worstOf(optionals.map((d) => d.state))
        : "healthy";
      state = worstOptional === "healthy" ? "healthy" : "degraded";
    }
  }

  const ruins = args.dependencies.filter((d) => d.state !== "healthy");
  const summary =
    state === "healthy"
      ? "Operando normalmente."
      : ruins.length === 1
        ? `${ruins[0].name}: ${ruins[0].detail ?? ruins[0].state}`
        : `${ruins.length} dependências com problema: ${ruins.map((d) => d.name).join(", ")}`;

  return {
    state,
    identity: args.identity,
    dependencies: args.dependencies,
    summary,
    uptime_s: Math.max(
      0,
      Math.round((args.now.getTime() - Date.parse(args.identity.started_at)) / 1000),
    ),
  };
}

/**
 * Módulos que o runtime crítico NUNCA pode esperar de forma síncrona.
 *
 * Existe como dado, e não como comentário, para o teste estrutural poder
 * afirmar a regra sobre os imports reais do código.
 */
export const FORBIDDEN_IN_CRITICAL = [
  "crm",
  "conversation-crm",
  "chatbot",
  "copiloto",
  "conference-brain",
  "capacidade-viva",
  "embeddings",
] as const;

/** Módulos que o runtime assíncrono pode conter. */
export const ALLOWED_IN_ASYNC = [
  "crm",
  "chatbot",
  "copiloto",
  "conference-brain",
  "capacidade-viva",
  "notifications",
  "reports",
  "projections",
  "ai",
] as const;

/**
 * Encerramento gracioso.
 *
 * O contrato é: parar de aceitar trabalho novo, terminar o que está em curso
 * dentro do prazo, e só então sair. Um job interrompido no meio volta pela
 * expiração do lease — não é perdido, mas é retrabalho, e retrabalho em cima
 * de efeito externo pode duplicar.
 */
export interface ShutdownHooks {
  /** Para de aceitar trabalho novo. Chamado primeiro. */
  drain(): Promise<void> | void;
  /** Fecha recursos. Chamado depois do drain. */
  close(): Promise<void> | void;
}

export interface ShutdownResult {
  graceful: boolean;
  /** Motivo quando não foi gracioso — timeout, ou erro no fechamento. */
  reason?: string;
  elapsed_ms: number;
}

export async function shutdown(
  hooks: ShutdownHooks,
  timeoutMs: number,
  now: () => number = () => Date.now(),
): Promise<ShutdownResult> {
  const started = now();
  let timedOut = false;
  // O handle é guardado para ser limpo no fim. Sem isso, um shutdown rápido
  // deixaria um timer pendurado segurando o processo pelo prazo inteiro — e
  // marcá-lo `unref` resolveria isso ao custo de o processo poder morrer
  // ANTES do prazo, engolindo o resultado. Limpar é o caminho correto.
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<void>((resolve) => {
    handle = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([Promise.resolve(hooks.drain()), timer]);
    if (!timedOut) {
      await Promise.race([Promise.resolve(hooks.close()), timer]);
    }
  } catch (e) {
    if (handle) clearTimeout(handle);
    return {
      graceful: false,
      reason: e instanceof Error ? e.message : String(e),
      elapsed_ms: now() - started,
    };
  }
  if (handle) clearTimeout(handle);

  return {
    graceful: !timedOut,
    reason: timedOut ? `tempo esgotado após ${timeoutMs}ms` : undefined,
    elapsed_ms: now() - started,
  };
}
