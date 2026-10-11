/**
 * Operacao Viva <- comandas: diagnostico puro e desidentificado.
 *
 * A prova termica em SHADOW NAO e um fato de origem observado. Nao a
 * promova para pedido pronto, trabalho iniciado, Foco ou impressao autorizada.
 * Este contrato pode ser consumido somente em visualizacao/QA de diagnostico.
 * Nao importa adaptadores de impressora, dispositivos, rede ou estado global.
 */
import type { KitchenSeparatedBundleV47 } from "./kitchenSeparatedOfflineBundleV47";

export const CANAIS_COMANDA_SHADOW = [
  "OTHER_PRODUCTION", "KITCHEN_COMPONENTS", "KITCHEN_DISHES", "CONFERENCE",
] as const;

export type CanalComandaShadow = typeof CANAIS_COMANDA_SHADOW[number];
export type EstadoCanalShadow =
  | "DISPONIVEL_OFFLINE"
  | "BLOQUEADO_OFFLINE"
  | "MISTO_OFFLINE"
  | "NAO_GERADO_NA_AMOSTRA";

export interface DiagnosticoComandaOperacaoVivaV1 {
  readonly schema: "deliveryos.operacao-viva-comandas-diagnostico.v1";
  readonly fonte: "PROVA_SHADOW_OFFLINE_NAO_AUTORITATIVA";
  readonly integridade_estrutura: "VALIDA" | "INDETERMINADA";
  readonly motivo_indisponibilidade: "PACOTE_INVALIDO" | null;
  readonly canais: Readonly<Record<CanalComandaShadow, EstadoCanalShadow>>;
  readonly exige_revisao: boolean;
  readonly identidade_pedido: null;
  readonly estado_pedido_observado: null;
  readonly ocorrido_em_origem: null;
  readonly comprova_papel_fisico: false;
  readonly emite_fato_operacional: false;
  readonly define_foco: false;
  readonly autoriza_impressao: false;
  readonly autoriza_integracao_produtiva: false;
  readonly effects: Readonly<{
    print: false;
    spooler_write: false;
    odhen_write: false;
    stock_write: false;
    persistence_write: false;
  }>;
}

type RecordLike = Record<string, unknown>;
function record(value: unknown): value is RecordLike {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function noEffects(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keys.every((key) => value[key] === false);
}
function proofValid(raw: unknown, blocked: boolean): boolean {
  if (!record(raw) || !Array.isArray(raw.bytes) ||
      !Array.isArray(raw.blocking_reasons) ||
      !raw.blocking_reasons.every((x: unknown) => typeof x === "string") ||
      typeof raw.text_trace !== "string" ||
      !Number.isSafeInteger(raw.byte_count) ||
      raw.byte_count !== raw.bytes.length ||
      !raw.bytes.every((x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) <= 255) ||
      raw.ready_for_operational_print !== false ||
      !noEffects(raw.effects, ["print", "spooler_write", "odhen_write", "cut"])) {
    return false;
  }
  return blocked
    ? raw.ready_for_offline_preview === false && raw.byte_count === 0
    : raw.ready_for_offline_preview === true && Number(raw.byte_count) > 0 &&
      raw.blocking_reasons.length === 0;
}

function emptyChannels(): Record<CanalComandaShadow, EstadoCanalShadow> {
  return {
    OTHER_PRODUCTION: "NAO_GERADO_NA_AMOSTRA",
    KITCHEN_COMPONENTS: "NAO_GERADO_NA_AMOSTRA",
    KITCHEN_DISHES: "NAO_GERADO_NA_AMOSTRA",
    CONFERENCE: "NAO_GERADO_NA_AMOSTRA",
  };
}
const effects: DiagnosticoComandaOperacaoVivaV1["effects"] = Object.freeze({
  print: false, spooler_write: false, odhen_write: false,
  stock_write: false, persistence_write: false,
});

function result(
  valido: boolean,
  canais: Record<CanalComandaShadow, EstadoCanalShadow>,
  exigeRevisao: boolean,
): DiagnosticoComandaOperacaoVivaV1 {
  return {
    schema: "deliveryos.operacao-viva-comandas-diagnostico.v1",
    fonte: "PROVA_SHADOW_OFFLINE_NAO_AUTORITATIVA",
    integridade_estrutura: valido ? "VALIDA" : "INDETERMINADA",
    motivo_indisponibilidade: valido ? null : "PACOTE_INVALIDO",
    canais,
    exige_revisao: exigeRevisao,
    identidade_pedido: null,
    estado_pedido_observado: null,
    ocorrido_em_origem: null,
    comprova_papel_fisico: false,
    emite_fato_operacional: false,
    define_foco: false,
    autoriza_impressao: false,
    autoriza_integracao_produtiva: false,
    effects,
  };
}

/**
 * Recebe um bundle de provas OFFLINE e produz apenas um diagnostico estrutural.
 * Nem valores provenientes de campos de pedido nem blocking_reasons sao copiados
 * para fora: podem conter observacoes, identificadores ou texto sensivel.
 *
 * A tipagem do argumento documenta a interface; a validacao de runtime aceita
 * unknown para nao promover objetos adulterados a fatos.
 */
export function diagnosticarComandasParaOperacaoVivaV1(
  input: KitchenSeparatedBundleV47 | unknown,
): DiagnosticoComandaOperacaoVivaV1 {
  const ausente = () => result(false, emptyChannels(), true);
  if (!record(input) ||
      input.schema !== "deliveryos.kitchen-separated-offline-bundle.v47" ||
      input.ready_for_automatic_operational_print !== false ||
      !noEffects(input.effects, ["print", "spooler_write", "odhen_write", "stock_write"]) ||
      !Array.isArray(input.jobs) || !Array.isArray(input.blocked_proofs) ||
      !Array.isArray(input.review_reasons) ||
      !input.review_reasons.every((x: unknown) => typeof x === "string") ||
      input.jobs.length + input.blocked_proofs.length === 0) {
    return ausente();
  }
  const canais = emptyChannels();
  const known = new Set<string>(CANAIS_COMANDA_SHADOW);
  for (const [list, blocked] of [[input.jobs, false], [input.blocked_proofs, true]] as const) {
    for (const raw of list) {
      if (!record(raw) || typeof raw.channel !== "string" ||
          !known.has(raw.channel) || !proofValid(raw.proof, blocked)) return ausente();
      const channel = raw.channel as CanalComandaShadow;
      const current = canais[channel];
      const expected = blocked ? "BLOQUEADO_OFFLINE" : "DISPONIVEL_OFFLINE";
      if (current === "MISTO_OFFLINE") continue;
      if (current !== "NAO_GERADO_NA_AMOSTRA" && current !== expected) {
        canais[channel] = "MISTO_OFFLINE";
      } else {
        canais[channel] = expected;
      }
    }
  }
  return result(
    true, canais,
    input.review_reasons.length > 0 || input.blocked_proofs.length > 0,
  );
}
