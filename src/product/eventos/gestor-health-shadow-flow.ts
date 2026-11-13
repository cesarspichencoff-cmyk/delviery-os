/**
 * O unico caminho deste review: Gestor montado -> observador-saude R5-D3
 * -> ledger-shadow existente -> projetor de leitura existente.
 *
 * Nenhum order_id/item/nota, nenhuma declaracao de loja atestada; so saude.
 * Por contrato, aceita APENAS envelopes com source "fixture:observador-interno".
 * Nunca escreve no ledger oficial; o ledger shadow ja protege o caminho e
 * permanece desligado por padrao. Nao cria outro motor ou interface.
 */
import { adaptarSaudeReviewGestor, type RevisaoSaudeGestor } from "./gestor-health-review-bridge";
import { projetarLeitura, type LeituraProjetada } from "./projetar-leitura";
import type { LedgerShadow, ResultadoRegistro } from "./ledger-shadow";
export const GESTOR_HEALTH_SHADOW_FLOW_V1 = "gestor-health-shadow-flow@1" as const;
type Resultado =
 | Readonly<{state:"HOLD"|"SHADOW_DISABLED";reason:string;registration:null|ResultadoRegistro;
   projection:null;home_publish_authorized:false;orders_publishable:0;production_effects_authorized:false}>
 | Readonly<{state:"SHADOW_PROJECTED";reason:"HEALTH_FIXTURE_ONLY";
   registration:ResultadoRegistro;projection:LeituraProjetada;
   home_publish_authorized:false;orders_publishable:0;production_effects_authorized:false}>;
const hold=(reason:string,registration:null|ResultadoRegistro=null):Resultado=>({
 state:"HOLD",reason,registration,projection:null,home_publish_authorized:false,
 orders_publishable:0,production_effects_authorized:false
});
export function executarSaudeGestorEmShadow(
  input: RevisaoSaudeGestor,
  ledger: LedgerShadow,
): Resultado {
  if (!ledger || typeof ledger.registrar!=="function" ||
      typeof ledger.replay!=="function" || typeof ledger.habilitado!=="boolean")
    return hold("LEDGER_SHADOW_INVALID");
  const obs=adaptarSaudeReviewGestor(input);
  if(obs.state!=="REVIEW_ONLY_FIXTURE" || obs.event===null)
    return hold("REVIEW_HEALTH_NOT_QUALIFIED");
  if(obs.event.source!=="fixture:observador-interno" ||
     obs.event.event_type!=="source_health_changed")
    return hold("NON_FIXTURE_SOURCE_DENIED");
  if(!ledger.habilitado)return {state:"SHADOW_DISABLED",reason:"EXPLICIT_OPT_IN_REQUIRED",
    registration:null,projection:null,home_publish_authorized:false,
    orders_publishable:0,production_effects_authorized:false};
  const registration=ledger.registrar(obs.event);
  if(registration.tipo!=="gravado" && registration.tipo!=="duplicata_identica")
    return hold("LEDGER_REJECTED_"+registration.tipo,registration);
  const events=ledger.replay();
  if(ledger.recusadas().length || events.length>1000 ||
     events.some(e=>e.source!=="fixture:observador-interno" ||
       e.event_type!=="source_health_changed" ||
       e.tenant_id!==input.tenant_id || e.unit_id!=="ITAIM" ||
       e.payload.source_id!=="gestor_ifood_mounted_view"))
    return hold("LEDGER_CONTENT_NOT_ISOLATED",registration);
  const projection=projetarLeitura(events,{
    tenant_id:input.tenant_id,unit_id:"ITAIM",agora_iso:input.now
  });
  if(projection.linhagem.natureza!=="demonstracao" ||
     projection.pedidos_ativos.length!==0 || projection.carga_por_praca.length!==0 ||
     projection.conflitos.length!==0 || projection.lacunas.length!==0 ||
     projection.fontes.length!==1 ||
     projection.fontes[0].id!=="gestor_ifood_mounted_view" ||
     projection.fontes[0].estado==="saudavel")
    return hold("PROJECTED_CONTENT_NOT_HEALTH_ONLY",registration);
  return {state:"SHADOW_PROJECTED",reason:"HEALTH_FIXTURE_ONLY",
    registration,projection,home_publish_authorized:false,
    orders_publishable:0,production_effects_authorized:false};
}
