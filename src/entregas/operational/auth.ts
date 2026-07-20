/**
 * Papéis operacionais — COR + decisões piloto.
 * Autenticação real = adapter futuro; domínio exige ActorContext válido.
 */

export type OperationalRole =
  | "operador_expedicao"
  | "motoboy_interno"
  | "lider_delivery"
  | "gerente"
  | "sistema"
  | "integracao_futura";

export interface ActorContext {
  /** Identificador operacional opaco — sem PII */
  actor_id: string;
  role: OperationalRole;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function requireActor(actor: ActorContext | null | undefined): ActorContext {
  if (!actor?.actor_id?.trim()) {
    throw new AuthError("Operação crítica exige ator identificado (não anônimo)");
  }
  if (!actor.role) {
    throw new AuthError("Operação crítica exige papel válido");
  }
  return actor;
}

const MANUAL_CLOSE: OperationalRole[] = ["lider_delivery", "gerente"];
const OPS_MUTATE: OperationalRole[] = [
  "operador_expedicao",
  "lider_delivery",
  "gerente",
  "sistema",
];
const RIDER_ACTIONS: OperationalRole[] = [
  "motoboy_interno",
  "sistema",
  "lider_delivery",
  "gerente",
];
const HANDOFF: OperationalRole[] = [
  "operador_expedicao",
  "lider_delivery",
  "gerente",
  "sistema",
];
const OCCURRENCE_CLOSE: OperationalRole[] = ["lider_delivery", "gerente"];

export function assertCan(
  actor: ActorContext,
  action:
    | "trip_mutate"
    | "trip_start"
    | "trip_return"
    | "trip_close_manual"
    | "delivery_confirm"
    | "handoff"
    | "occurrence_open"
    | "occurrence_close"
    | "add_after_start",
): void {
  requireActor(actor);
  const role = actor.role;
  const ok = (list: OperationalRole[]) => {
    if (!list.includes(role)) {
      throw new AuthError(`Papel ${role} não autorizado para ${action}`);
    }
  };
  switch (action) {
    case "trip_mutate":
    case "occurrence_open":
      return ok(OPS_MUTATE.concat(["motoboy_interno"]));
    case "trip_start":
    case "trip_return":
    case "delivery_confirm":
      return ok(RIDER_ACTIONS);
    case "trip_close_manual":
      return ok(MANUAL_CLOSE);
    case "handoff":
      return ok(HANDOFF);
    case "occurrence_close":
      return ok(OCCURRENCE_CLOSE);
    case "add_after_start":
      return ok(["lider_delivery", "gerente", "operador_expedicao", "sistema"]);
    default:
      throw new AuthError(`Ação desconhecida: ${action}`);
  }
}

export const MANUAL_CLOSE_ROLES = MANUAL_CLOSE;
