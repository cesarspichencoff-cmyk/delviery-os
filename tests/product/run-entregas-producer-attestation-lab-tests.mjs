/**
 * LAB ONLY — assinaturas Ed25519 e concessoes FICTICIAS, criadas em memoria.
 * NAO e autenticacao de origem real. NAO importa codigo de runtime nem toca I/O.
 * Nao conecta produtor real, HTTP externo, feed, banco, usuario ou loja.
 *
 * Hipotese testada: identidade criptografica verificada ANTES de confiar em
 * unit_id, event_type ou source_mode do payload, com permissao fora do payload.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

const CHANNEL = "deliveryos.lab.producer-attestation.v1";
const now = 1_800_000_000_000;
const allowedModes = new Set(["real", "simulated", "control"]);
const allowedTypes = new Set(["trip_started", "delivery_ready"]);
const state = { enabled: true, killSwitch: false };
const registry = new Map();
const seen = new Set();
const memoryOnlyAudit = [];
const memoryOnlyFacts = [];
let count = 0;

function check(condition, description) {
  assert.ok(condition, description);
  count++;
  console.log("ok PRODUCER-" + count + " " + description);
}
function identity(producer_id, unit_id, modes, event_types, expiry = now + 60_000) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const item = {
    producer_id, unit_id, publicKey, active: true, expiry,
    allowed_modes: new Set(modes), allowed_event_types: new Set(event_types)
  };
  registry.set(producer_id, item);
  return { producer_id, privateKey, publicKey, grant: item };
}
function event(event_id, unit_id = "ITAIM", source_mode = "simulated", event_type = "trip_started") {
  return { event_id, unit_id, source_mode, event_type };
}
function signedEnvelope(sender, payload, issued_at = now) {
  const signed = {
    channel: CHANNEL,
    producer_id: sender.producer_id,
    issued_at,
    nonce: randomBytes(16).toString("hex"),
    event: payload
  };
  return { signed, signature: sign(null, Buffer.from(JSON.stringify(signed)), sender.privateKey).toString("base64url") };
}
function deny(reason) {
  memoryOnlyAudit.push({ outcome: "DENY", reason });
  return { admitted: false, reason };
}
function admit(envelope, received_at = now) {
  if (!state.enabled || state.killSwitch) return deny("ingest_disabled");
  if (!envelope || typeof envelope !== "object" ||
      !envelope.signed || typeof envelope.signed !== "object" ||
      typeof envelope.signature !== "string" ||
      !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) return deny("signature_absent_or_invalid");
  const s = envelope.signed;
  if (s.channel !== CHANNEL || typeof s.producer_id !== "string" ||
      typeof s.issued_at !== "number" ||
      !Number.isSafeInteger(s.issued_at) ||
      !Number.isSafeInteger(received_at) ||
      s.issued_at < received_at - 120_000 ||
      s.issued_at > received_at + 30_000 ||
      typeof s.nonce !== "string" || !/^[0-9a-f]{32}$/.test(s.nonce)) {
    return deny("envelope_invalid_or_stale");
  }
  const grant = registry.get(s.producer_id);
  if (!grant || !grant.active || received_at >= grant.expiry) return deny("producer_unknown_revoked_or_expired");
  // O id recebido e somente uma chave de busca. O vinculo so existe
  // APOS a assinatura ser verificada com a chave controlada pelo registro.
  let signatureValid = false;
  try {
    signatureValid = verify(null, Buffer.from(JSON.stringify(s)), grant.publicKey,
      Buffer.from(envelope.signature, "base64url"));
  } catch { /* fail closed */ }
  if (!signatureValid) return deny("producer_signature_invalid");
  const e = s.event;
  if (!e || typeof e !== "object" ||
      typeof e.event_id !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(e.event_id) ||
      typeof e.unit_id !== "string" || typeof e.event_type !== "string" ||
      !allowedModes.has(e.source_mode) || !allowedTypes.has(e.event_type)) {
    return deny("event_contract_invalid_or_unknown");
  }
  if (e.unit_id !== grant.unit_id) return deny("unit_not_granted");
  if (!grant.allowed_modes.has(e.source_mode)) return deny("mode_not_granted");
  if (!grant.allowed_event_types.has(e.event_type)) return deny("type_not_granted");
  const replayId = s.producer_id + "/" + s.nonce;
  const eventId = s.producer_id + "/" + e.event_id;
  if (seen.has(replayId) || seen.has(eventId)) return deny("replay_or_duplicate");
  seen.add(replayId);
  seen.add(eventId);
  // A permissao para um ROTULO "real" num cadastro ficticio NAO comprova fonte real.
  // Este sink nao escreve source_mode='real', nao atualiza checkpoint produtivo.
  const receipt = Object.freeze({
    lab_only: true, producer_id: grant.producer_id, unit_id: grant.unit_id,
    allowed_label: e.source_mode, event_type: e.event_type, event_id: e.event_id,
    provenance: "LAB_SIGNED_SYNTHETIC_NOT_REAL",
    world_real_source_proven: false
  });
  memoryOnlyFacts.push(receipt);
  memoryOnlyAudit.push({ outcome: "LAB_ADMIT", producer_id: grant.producer_id, event_id: e.event_id });
  return { admitted: true, receipt };
}
function clone(e) { return structuredClone(e); }

const itaim = identity("LAB_PRODUCER_ITAIM", "ITAIM", ["simulated"], ["trip_started", "delivery_ready"]);
const vila = identity("LAB_PRODUCER_VILA", "VILA-LAB", ["simulated", "control"], ["trip_started"]);
const labRealPolicy = identity("LAB_REAL_LABEL_POLICY_ONLY", "ITAIM", ["real"], ["delivery_ready"]);
const inactive = identity("LAB_REVOKED", "ITAIM", ["simulated"], ["trip_started"]);
inactive.grant.active = false;
const expired = identity("LAB_EXPIRED", "ITAIM", ["simulated"], ["trip_started"], now - 1);
const viewOnly = identity("LAB_READ_ONLY", "ITAIM", [], []);

check(admit({ signed: { producer_id: itaim.producer_id }, signature: "" }).admitted === false,
  "id declarado sem assinatura nao comprova origem");
check(admit(signedEnvelope({ ...itaim, producer_id: "NAO_REGISTRADO" }, event("EV_UNKNOWN"))).admitted === false,
  "credencial ausente do registro nao cria produtor");
const forgedId = signedEnvelope(itaim, event("EV_FORGED_ID"));
forgedId.signed.producer_id = vila.producer_id;
check(admit(forgedId).reason === "producer_signature_invalid",
  "alterar identidade declarada invalida assinatura");
const first = signedEnvelope(itaim, event("EV_FIRST"));
const allowed = admit(first);
check(allowed.admitted && allowed.receipt.producer_id === "LAB_PRODUCER_ITAIM" &&
      allowed.receipt.unit_id === "ITAIM", "assinatura + registro vinculam emissor e unidade ficticios");
check(memoryOnlyFacts.length === 1 && memoryOnlyFacts[0].provenance === "LAB_SIGNED_SYNTHETIC_NOT_REAL",
  "admissao sintetica nao vira prova de fonte real");
check(admit(first).reason === "replay_or_duplicate", "mesmo envelope nao reaplica evento");
check(admit(signedEnvelope(itaim, event("EV_FIRST"))).reason === "replay_or_duplicate",
  "nonce novo nao burla idempotencia de event_id");
const editedUnit = signedEnvelope(itaim, event("EV_TAMPER_UNIT"));
editedUnit.signed.event.unit_id = "VILA-LAB";
check(admit(editedUnit).reason === "producer_signature_invalid",
  "alteracao de unidade assinada detectada");
const editedMode = signedEnvelope(itaim, event("EV_TAMPER_MODE"));
editedMode.signed.event.source_mode = "real";
check(admit(editedMode).reason === "producer_signature_invalid",
  "alteracao do modo depois da assinatura detectada");
check(admit(signedEnvelope(itaim, event("EV_CROSS", "VILA-LAB"))).reason === "unit_not_granted",
  "assinatura valida de Itaim nao autoriza unidade alheia");
check(admit(signedEnvelope(itaim, event("EV_REAL_SPOOF", "ITAIM", "real"))).reason === "mode_not_granted",
  "assinatura valida de simulador nao autoriza modo real");
check(admit(signedEnvelope(viewOnly, event("EV_VIEW_ONLY"))).reason === "mode_not_granted",
  "identidade so de leitura nao publica evento");
check(admit(signedEnvelope(itaim, event("EV_UNKNOWN_TYPE", "ITAIM", "simulated", "admin_override"))).reason ===
      "event_contract_invalid_or_unknown", "tipo desconhecido nao ganha autoridade");
check(admit(signedEnvelope(vila, event("EV_VILA", "VILA-LAB", "control"))).admitted,
  "emissor ficticio de segunda unidade preserva modo control");
check(admit(signedEnvelope(expired, event("EV_EXPIRED"))).reason === "producer_unknown_revoked_or_expired",
  "concessao expirada e bloqueada");
check(admit(signedEnvelope(inactive, event("EV_REVOKED"))).reason === "producer_unknown_revoked_or_expired",
  "produtor revogado e bloqueado");
const priorRotation = signedEnvelope(vila, event("EV_ROTATED", "VILA-LAB"));
vila.grant.publicKey = generateKeyPairSync("ed25519").publicKey;
check(admit(priorRotation).reason === "producer_signature_invalid",
  "troca de chave de registro invalida assinatura da chave anterior");
const wrongChannel = signedEnvelope(itaim, event("EV_CHANNEL"));
wrongChannel.signed.channel = "deliveryos.other-channel";
check(admit(wrongChannel).reason === "envelope_invalid_or_stale",
  "canal diferente nao herda autorizacao de publicacao");
check(admit(signedEnvelope(itaim, event("EV_OLD"), now - 120_001)).reason === "envelope_invalid_or_stale",
  "janela vencida bloqueia assinatura autentica");
check(admit(signedEnvelope(itaim, event("EV_FUTURE"), now + 30_001)).reason === "envelope_invalid_or_stale",
  "carimbo futuro excessivo bloqueia assinatura autentica");
check(admit(signedEnvelope(itaim, { ...event("EV_NO_MODE"), source_mode: undefined })).reason ===
      "event_contract_invalid_or_unknown", "modo ausente fica UNKNOWN e nao vira real");
const independent = admit(signedEnvelope(itaim, event("EV_SIGNAL", "ITAIM", "simulated", "delivery_ready")));
check(independent.admitted && independent.receipt.event_type === "delivery_ready",
  "sinal independente autorizado sem domain_event artificial");
check(admit(signedEnvelope(viewOnly, event("EV_SIGNAL_FORGED", "ITAIM", "simulated", "delivery_ready"))).admitted === false,
  "sinal independente assinado por emissor sem concessao e bloqueado");
const policyProbe = admit(signedEnvelope(labRealPolicy,
  event("EV_REAL_LABEL_ONLY", "ITAIM", "real", "delivery_ready")));
check(policyProbe.admitted && policyProbe.receipt.allowed_label === "real" &&
      policyProbe.receipt.world_real_source_proven === false &&
      !("source_mode" in policyProbe.receipt),
  "permissao LAB do rotulo real nao equivale a fonte real nem gera fato real");
state.killSwitch = true;
check(admit(signedEnvelope(itaim, event("EV_KILLED"))).reason === "ingest_disabled",
  "kill switch nega antes da verificacao ou escrita");
state.killSwitch = false; state.enabled = false;
check(admit(signedEnvelope(itaim, event("EV_DISABLED"))).reason === "ingest_disabled",
  "flag OFF nega antes de qualquer consumo");
check(memoryOnlyFacts.every(x => x.lab_only === true && x.world_real_source_proven === false &&
      x.provenance === "LAB_SIGNED_SYNTHETIC_NOT_REAL" && !("source_mode" in x)),
  "nenhum recibo e gravado como fato real, mesmo no ensaio de permissao");
console.log("DELIVERYOS_PRODUCER_ATTESTATION_LAB: " + count + "/" + count +
  " PASS (FAKE KEYS, LAB-ONLY SINK, NO REAL SOURCE, NO PRODUCTION)");
