/* Quando a rider-mobile liga a captura nativa (Q-018). Função pura.
 *
 * Decisão do César (2026-09-25): "A captura só inicia após saída validamente
 * confirmada e consentimento/permissão válidos."
 *
 *  - saída confirmada = a viagem DESTE motoboy está em `em_rota` ou
 *    `retornando` no snapshot do servidor. É o domínio que diz, depois de
 *    aceitar `ConfirmTripDeparture` — nunca o clique no botão;
 *  - consentimento = o registro que o SERVIDOR guarda para este motoboy,
 *    este termo (hash) e este aparelho, com `status: accepted`;
 *  - permissão = o que o Android respondeu, lido pela ponte;
 *  - a flag de GPS e o termo publicável vêm de `/api/policies`, as mesmas
 *    políticas que a página repassa ao Kotlin.
 *
 * O portão do Kotlin (`CaptureGate`) continua sendo a última palavra no
 * aparelho: esta regra decide quando PEDIR; o nativo pode recusar.
 */

/** Estados em que a saída já foi confirmada pelo domínio. */
export const CAPTURE_TRIP_STATES = ["em_rota", "retornando"];

function off(reason) {
  return { capture: false, trip_id: null, reason };
}

export function captureDecision(ctx) {
  const { native, actor, policies, ack, deviceId, permission, trip } = ctx || {};
  if (!native) return off("sem_ponte");
  if (!actor || actor.role !== "motoboy_interno") return off("sem_motoboy");
  if (!policies || !policies.flags || policies.flags.gps_capture_enabled !== true) return off("gps_desligado");
  const term = policies.term;
  if (!term || term.publishable !== true || !term.hash) return off("termo_indisponivel");
  if (!ack) return off("sem_aceite");
  if (ack.rider_id !== actor.actor_id || !deviceId || ack.device_id !== deviceId) return off("sem_aceite");
  if (ack.term_hash !== term.hash) return off("termo_desatualizado");
  if (ack.status !== "accepted") return off("termo_recusado");
  if (permission !== "granted") return off("sem_permissao");
  if (!trip) return off("sem_viagem");
  if (trip.courier_actor_id !== actor.actor_id) return off("viagem_de_outro");
  if (!CAPTURE_TRIP_STATES.includes(trip.state)) return off("saida_nao_confirmada");
  return { capture: true, trip_id: trip.trip_id, reason: null };
}

/**
 * O complemento de "GPS DESLIGADO — …" no indicador que já existe. Com viagem
 * na tela, "SEM VIAGEM ATIVA" seria mentira; o indicador diz o porquê.
 * `sem_viagem` fica com o texto original.
 */
export const OFF_REASON_TEXT = {
  sem_ponte: "SÓ PELO APLICATIVO",
  ponte_incompativel: "APLICATIVO DESATUALIZADO",
  sem_motoboy: "ACESSO NÃO É DE MOTOBOY",
  gps_desligado: "DESLIGADO NA CONFIGURAÇÃO",
  termo_indisponivel: "TERMO AINDA NÃO LIBERADO",
  sem_aceite: "FALTA ACEITAR O TERMO",
  termo_desatualizado: "TERMO NOVO PARA ACEITAR",
  termo_recusado: "TERMO NÃO ACEITO",
  sem_permissao: "FALTA A PERMISSÃO DE LOCALIZAÇÃO",
  viagem_de_outro: "VIAGEM DE OUTRO MOTOBOY",
  saida_nao_confirmada: "AGUARDANDO A SAÍDA",
  ligando: "LIGANDO NO APARELHO",
  bloqueado_no_aparelho: "BLOQUEADO NO APARELHO",
  sem_viagem: null,
};
