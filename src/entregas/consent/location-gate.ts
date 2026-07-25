/**
 * Portão de captura — decide se o GPS pode ligar.
 *
 * Existem DUAS autorizações diferentes e elas nunca se substituem (§4.7):
 *  - ciência do termo → ato do motoboy dentro do produto;
 *  - permissão do sistema → ato do motoboy no Android.
 *
 * Aceitar o termo não concede permissão. Conceder permissão não substitui o
 * termo. O portão exige as duas, mais viagem ativa e flag ligada. Qualquer
 * dúvida → não liga.
 */

import type { LocationTerm } from "./term";
import type { AcknowledgementStore } from "./acknowledgement";

/**
 * Estado da permissão do sistema operacional, registrado separadamente do
 * termo. `unknown` é estado real (ainda não perguntamos), não erro.
 */
export const PERMISSION_STATES = [
  "unknown",
  "not_requested",
  "granted_precise",
  "granted_approximate",
  "denied",
  "revoked",
] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

/** Permissão de segundo plano é separada — Android trata como outro pedido. */
export const BACKGROUND_PERMISSION_STATES = [
  "unknown",
  "not_requested",
  "granted",
  "denied",
] as const;
export type BackgroundPermissionState = (typeof BACKGROUND_PERMISSION_STATES)[number];

export interface PermissionSnapshot {
  foreground: PermissionState;
  background: BackgroundPermissionState;
  /** Última vez que o app observou o estado — permissão pode mudar fora dele. */
  observed_at: string;
}

/** Motivos de recusa — sempre explícitos, nunca "não deu certo". */
export const GATE_BLOCKS = [
  "capture_disabled",
  "no_active_trip",
  "term_not_publishable",
  "term_not_acknowledged",
  "term_version_outdated",
  "term_declined",
  "permission_missing",
  "permission_denied",
  "permission_revoked",
] as const;
export type GateBlock = (typeof GATE_BLOCKS)[number];

export interface GateDecision {
  allowed: boolean;
  blocks: GateBlock[];
  /** Frase curta e neutra para a tela do motoboy. */
  message: string;
  /** true quando a permissão só cobre posição aproximada. */
  approximate_only: boolean;
  /** true quando há aceite válido para o termo apresentado agora. */
  term_ok: boolean;
  permission: PermissionState;
}

const MESSAGES: Record<GateBlock, string> = {
  capture_disabled: "A localização está desligada na configuração do sistema.",
  no_active_trip: "GPS desligado — sem viagem ativa.",
  term_not_publishable:
    "O termo de localização ainda não foi liberado pelo responsável.",
  term_not_acknowledged: "Você precisa ler e aceitar o termo de localização.",
  term_version_outdated:
    "O termo de localização mudou. É preciso ler e aceitar a nova versão.",
  term_declined:
    "Você não aceitou o termo de localização. Procure o responsável pela operação.",
  permission_missing: "Falta permitir a localização nas configurações do aparelho.",
  permission_denied:
    "A permissão de localização está negada nas configurações do aparelho.",
  permission_revoked:
    "A permissão de localização foi retirada. É preciso permitir de novo.",
};

export interface GateInput {
  captureEnabled: boolean;
  activeTripId: string | null;
  rider_id: string;
  term: LocationTerm;
  termPublishable: boolean;
  store: AcknowledgementStore;
  permission: PermissionSnapshot;
}

/**
 * Avalia o portão. Ordem dos motivos importa para a tela: mostramos o
 * primeiro obstáculo real, não uma lista de tudo que falta.
 */
export function evaluateGate(input: GateInput): GateDecision {
  const blocks: GateBlock[] = [];

  if (!input.captureEnabled) blocks.push("capture_disabled");
  if (!input.activeTripId) blocks.push("no_active_trip");

  let term_ok = false;
  if (!input.termPublishable) {
    blocks.push("term_not_publishable");
  } else {
    const accepted = input.store.findAccepted(input.rider_id, input.term);
    if (accepted) {
      term_ok = true;
    } else {
      // Distingue "nunca aceitou" de "aceitou uma versão que já não vale" e de
      // "recusou" — cada um pede uma conversa diferente com o motoboy.
      const history = input.store.forRider(input.rider_id);
      const declinedThis = history.some(
        (r) =>
          r.status === "declined" &&
          r.term_material_version === input.term.material_version,
      );
      const acceptedOlder = history.some((r) => r.status === "accepted");
      if (declinedThis) blocks.push("term_declined");
      else if (acceptedOlder) blocks.push("term_version_outdated");
      else blocks.push("term_not_acknowledged");
    }
  }

  switch (input.permission.foreground) {
    case "granted_precise":
    case "granted_approximate":
      break;
    case "denied":
      blocks.push("permission_denied");
      break;
    case "revoked":
      blocks.push("permission_revoked");
      break;
    default:
      blocks.push("permission_missing");
  }

  return {
    allowed: blocks.length === 0,
    blocks,
    message: blocks.length ? MESSAGES[blocks[0]] : "GPS autorizado para esta viagem.",
    approximate_only: input.permission.foreground === "granted_approximate",
    term_ok,
    permission: input.permission.foreground,
  };
}

/**
 * Passos do primeiro acesso, na ordem obrigatória (§4.7). Existe como dado —
 * e não como comentário — para o teste poder afirmar que o pedido de permissão
 * do Android nunca vem antes do termo.
 */
export const FIRST_RUN_STEPS = [
  "explicacao_resumida",
  "termo_completo",
  "registro_da_ciencia",
  "permissao_localizacao_precisa",
  "explicacao_servico_em_viagem",
  "inicio_somente_com_viagem_ativa",
  "notificacao_persistente",
  "parada_ao_final",
] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

export function stepIndex(step: FirstRunStep): number {
  return FIRST_RUN_STEPS.indexOf(step);
}
