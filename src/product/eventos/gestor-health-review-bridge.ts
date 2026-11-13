/**
 * V1 — sinal local de visibilidade do Gestor para o produtor de saude R5-D3.
 *
 * Este adapter nao converte cards em pedidos: fonte incompleta/sem merchant
 * verificado pode informar apenas saude PARCIAL/STALE/INDISPONIVEL.
 * Todo envelope gerado aqui usa 'fixture:' e nao pode ser persistido no
 * journal oficial. Reusa observarSaude + validarEvento + projetor existente.
 * Funcao pura: nenhum relogio, rede, I/O, navegador ou pedido real.
 */
import { observarSaude } from "./observador-saude";
import { validarEvento, type EnvelopeOperacional } from "./catalogo-operacional";

export const GESTOR_SAUDE_REVIEW_V1 = "gestor-health-review-bridge@1" as const;
const SCHEMA = "deliveryos.gestor-mounted-window-differential.v1";
const FONTE = "gestor_ifood_mounted_view";
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
export type RevisaoSaudeGestor = Readonly<{
  review: unknown;
  now: string;
  captured_at: string;
  source_revision: number;
  tenant_id: string;
  unit_id: "ITAIM";
}>;
export type ResultadoSaudeGestor =
  | Readonly<{state:"HOLD";reason:string;event:null;home_publish_authorized:false;
      orders_publishable:0;upstream_proven:false;no_external_effects:true}>
  | Readonly<{state:"REVIEW_ONLY_FIXTURE";reason:"HEALTH_NOT_ORDER_AUTHORITY";
      event:EnvelopeOperacional;home_publish_authorized:false;
      orders_publishable:0;upstream_proven:false;no_external_effects:true}>;

function hold(reason:string): ResultadoSaudeGestor {
  return {state:"HOLD",reason,event:null,home_publish_authorized:false,
    orders_publishable:0,upstream_proven:false,no_external_effects:true};
}
function validDate(v:unknown): number | null {
  if (typeof v!=="string" || !ISO.test(v)) return null;
  const n=Date.parse(v);
  return Number.isFinite(n)?n:null;
}
function reviewIsLocallyVisible(raw:unknown): boolean {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return false;
  const r=raw as Record<string,unknown>;
  return r.schema===SCHEMA && r.state==="PRIVATE_DIFFERENTIAL_REVIEW_ONLY" &&
    r.source==="MOUNTED_CARDS_ONLY" && r.merchantVerified===false &&
    r.fullCoverageVerified===false && r.upstreamFreshnessVerified===false &&
    r.ordersPublishable===0 && r.homePublishAuthorized===false &&
    Number.isSafeInteger(r.candidateOrders) && (r.candidateOrders as number)>0 &&
    Number.isSafeInteger(r.candidateLines) && (r.candidateLines as number)>0 &&
    Number.isSafeInteger(r.candidateUnits) && (r.candidateUnits as number)>0 &&
    r.disappearanceMeansCancellation===false;
}
/** Produz SOMENTE um evento de saude de DEMONSTRACAO, nunca pedido. */
export function adaptarSaudeReviewGestor(x: RevisaoSaudeGestor): ResultadoSaudeGestor {
  if (!x || x.unit_id!=="ITAIM" ||
      typeof x.tenant_id!=="string" || !/^[A-Z0-9_-]{2,32}$/.test(x.tenant_id) ||
      !Number.isSafeInteger(x.source_revision) ||
      x.source_revision<0 || x.source_revision>100000000)
    return hold("REVIEW_SCOPE_INVALID");
  const now=validDate(x.now),captured=validDate(x.captured_at);
  if(now===null || captured===null || captured>now)
    return hold("LOCAL_CLOCK_INVALID");
  const age=(now-captured)/60000;
  const visible=reviewIsLocallyVisible(x.review);
  const health=observarSaude({
    fonte_id:FONTE,respondeu:visible,
    idade_min:visible?age:null,
    completa:false, // mounted cards never prove full coverage.
    observado_em:x.now,revisao:x.source_revision,
  },{
    tenant:x.tenant_id,unidade:x.unit_id,
    limite_stale_min:2, // local DOM capture age, NOT source-server heartbeat.
  });
  if(!health.ok)return hold("CATALOG_HEALTH_REJECTED");
  const candidate={...health.evento,source:"fixture:"+health.evento.source};
  const valid=validarEvento(candidate);
  if(!valid.ok)return hold("EVENT_ENVELOPE_REJECTED");
  return {state:"REVIEW_ONLY_FIXTURE",reason:"HEALTH_NOT_ORDER_AUTHORITY",
    event:valid.evento,home_publish_authorized:false,orders_publishable:0,
    upstream_proven:false,no_external_effects:true};
}
