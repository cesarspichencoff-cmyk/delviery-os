/**
 * PR #135 Reader/catalog/classification REVIEW -> PR #137 physical work REVIEW.
 *
 * Important: checks cross-surface consistency, never grants station authority.
 * A September route, self-declared October catalogue, or a worker event alone
 * cannot prove that a current product belongs to that physical station.
 * Pure and read-only; no new classifier, event, persistence or Home decision.
 */
import { PRACAS, type PracaId } from "../viewmodels/areas";
import {
  referenciaOpacaPedidoReader, referenciaOpacaLinhaReader,
  type RevisaoNativaParaTrabalho, type RevisaoVinculoReaderTrabalho,
} from "./vinculo-reader-trabalho-praca";

export const CLASSIFICACAO_TRABALHO_REVIEW_V1 =
  "reader-classification-work-review@1" as const;
const PRACAS_VALIDAS = new Set<string>(PRACAS.map(p => p.id));
const SHA=/^[a-f0-9]{64}$/;
const CANONICAL=/^[0-9]\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}\.[0-9]{2}$/;
type Classe = Readonly<{
  source_item_index:number;
  quantity:number;
  station_proof:string;
  product:Readonly<{nome:string;classification:Readonly<{station:string|null;family:string}>}>;
}>;
export interface RevisaoClassificacaoPR135 {
  readonly status:string;
  readonly native_pair_self_consistency_checked:boolean;
  readonly exact_native_items_bound:boolean;
  readonly independent_source_attested:boolean;
  readonly classification_approved:boolean;
  readonly revision_binding:Readonly<{native_snapshot_sha256:string;binding_sha256:string}>|null;
  readonly review:Readonly<{
    status:string;
    current_catalog_homologation_proven:boolean;
    provenance_independently_attested:boolean;
    entries:readonly Classe[];
  }>|null;
}
export interface ClaimClassificacaoPR135 {
  readonly source_item_index:number;
  readonly product_code:string;
  readonly product_name:string;
  readonly quantity:number;
  readonly station:string|null;
  readonly family:string;
}
export interface ConvergenciaCatalogoPR135 {
  readonly status:string;
  readonly identity_match_count:number;
  readonly unresolved_line_count:number|null;
  readonly receipt_sha256:string|null;
  readonly catalog_independently_attested:boolean;
  readonly classification_approved:boolean;
}
export interface CruzamentoClassificacaoTrabalhoReview {
  readonly schema:typeof CLASSIFICACAO_TRABALHO_REVIEW_V1;
  readonly status:"HOLD"|"REVIEW_CANDIDATE_ONLY";
  readonly reasons:readonly string[];
  readonly checked_lines:number;
  readonly declared_station_candidates:readonly {
    readonly line_ref:string;
    readonly station:PracaId|null;
    readonly work_event_count:number;
  }[];
  readonly current_catalog_homologation_proven:false;
  readonly station_physically_attested:false;
  readonly work_producer_authorized:false;
  readonly ready_for_dispatch:null;
  readonly live_home_authorized:false;
  readonly source_modified:false;
}
function hold(reason:string):CruzamentoClassificacaoTrabalhoReview{
  return {schema:CLASSIFICACAO_TRABALHO_REVIEW_V1,status:"HOLD",
    reasons:[reason],checked_lines:0,declared_station_candidates:[],
    current_catalog_homologation_proven:false,
    station_physically_attested:false,work_producer_authorized:false,
    ready_for_dispatch:null,live_home_authorized:false,source_modified:false};
}
function text(v:unknown):v is string{
  return typeof v==="string"&&v.trim()===v&&v.length>0&&v.length<=160;
}
function all<T>(v:unknown):v is readonly T[]{return Array.isArray(v)&&v.length<=200;}
export function revisarClassificacaoTrabalhoPraca(input:Readonly<{
  revision:RevisaoNativaParaTrabalho;
  binding:RevisaoVinculoReaderTrabalho;
  classification:RevisaoClassificacaoPR135;
  claims:readonly ClaimClassificacaoPR135[];
  catalog:ConvergenciaCatalogoPR135;
}>):CruzamentoClassificacaoTrabalhoReview {
  if(!input||!input.revision||!input.binding||!input.classification||!input.catalog)
    return hold("CLASSIFICATION_CROSS_SURFACE_INPUT_MISSING");
  const {revision,binding,classification,claims,catalog}=input;
  if(binding.state==="HOLD"||!binding.opaque_order_ref||
     binding.reader_transaction_attested!==false||
     binding.physical_event_attested!==false||
     binding.ready_for_dispatch!==null||binding.live_home_authorized!==false||
     binding.no_action_executed!==true)
    return hold("READER_LINE_BINDING_UNQUALIFIED");
  const id=revision.identity;
  if(!id||id.unit_id!=="0001"||id.store_id!=="01"||id.origin!=="DLV_IFO"||
     !SHA.test(id.snapshot_hash)||
     !all(revision.items)||!revision.items.length||
     !all(binding.lines)||binding.lines.length!==revision.items.length||
     !all(claims)||claims.length!==revision.items.length)
    return hold("NATIVE_REVISION_SCOPE_OR_ITEMS_INVALID");
  // A review binding for another native order cannot be accepted even
  // if its line count, product codes and quantities happen to be identical.
  if(binding.opaque_order_ref!==referenciaOpacaPedidoReader(id))
    return hold("READER_ORDER_BINDING_IDENTITY_DRIFT");
  if(classification.status!=="REVIEW_CANDIDATE_ONLY"||
     classification.native_pair_self_consistency_checked!==true||
     classification.exact_native_items_bound!==true||
     classification.independent_source_attested!==false||
     classification.classification_approved!==false||
     !classification.review||
     classification.review.status!=="REVIEW_CANDIDATE_ONLY"||
     classification.review.current_catalog_homologation_proven!==false||
     classification.review.provenance_independently_attested!==false||
     !all<Classe>(classification.review.entries)||
     classification.review.entries.length!==revision.items.length||
     !classification.revision_binding||
     classification.revision_binding.native_snapshot_sha256!==id.snapshot_hash||
     !SHA.test(classification.revision_binding.binding_sha256))
    return hold("CLASSIFICATION_SOURCE_OR_REVISION_NOT_QUALIFIED");
  if(catalog.status!=="JOINT_SELF_CONSISTENCY_REVIEW_ONLY"||
     catalog.catalog_independently_attested!==false||
     catalog.classification_approved!==false||
     !SHA.test(catalog.receipt_sha256||"")||
     catalog.identity_match_count!==revision.items.length||
     catalog.unresolved_line_count!==0)
    return hold("CATALOG_IDENTITY_NOT_CONVERGENT");
  const used=new Set<number>();
  const assignments: {
    line_ref:string;station:PracaId|null;work_event_count:number;
  }[]=[];
  for(const claim of claims){
    const idx=claim?.source_item_index;
    if(!Number.isSafeInteger(idx)||idx<0||idx>=revision.items.length||
       used.has(idx))return hold("CLASSIFICATION_CLAIM_INDEX_INVALID");
    used.add(idx);
    const native=revision.items[idx],line=binding.lines[idx],
      e=classification.review.entries.find(x=>x.source_item_index===idx);
    // Matching SKU + quantity cannot distinguish two native lines. Require
    // the exact line identifier from THIS order and THIS snapshot.
    if(!native||!line||!e)
      return hold("CLASSIFICATION_LINE_CODE_OR_QUANTITY_DRIFT");
    if(line.line_ref!==referenciaOpacaLinhaReader(id,native))
      return hold("READER_NATIVE_LINE_REFERENCE_DRIFT");
    if(
       !text(native.product_code)||!text(native.line_no)||
       !text(line.product_code)||line.product_code!==native.product_code||

       !text(claim.product_name)||claim.product_name!==e.product.nome||
       !text(claim.product_code)||!CANONICAL.test(claim.product_code)||
       !text(native.route_code)||native.route_code!==claim.product_code.replace(/\./g,"")||
       !Number.isSafeInteger(claim.quantity)||claim.quantity<1||
       claim.quantity!==native.quantity||claim.quantity!==line.quantity||
       claim.quantity!==e.quantity||e.station_proof!=="UNKNOWN"||
       claim.station!==e.product.classification.station||
       claim.family!==e.product.classification.family)
      return hold("CLASSIFICATION_LINE_CODE_OR_QUANTITY_DRIFT");
    if(claim.station!==null&&!PRACAS_VALIDAS.has(claim.station))
      return hold("CLASSIFICATION_STATION_NOT_CANONICAL");
    const declared=claim.station as PracaId|null;
    if(line.pracas_declaradas.length>1||
       line.pracas_declaradas.some(x=>x!==declared))
      return hold("WORK_EVENT_STATION_CONTRADICTS_CLASSIFICATION");
    // No event for a line does not prove readiness, even if station is known.
    if(!Number.isSafeInteger(line.event_ids.length)||line.event_ids.length>3000)
      return hold("WORK_EVENT_CARDINALITY_INVALID");
    assignments.push({line_ref:line.line_ref,station:declared,
      work_event_count:line.event_ids.length});
  }
  if(used.size!==revision.items.length)
    return hold("CLASSIFICATION_LINE_COVERAGE_MISSING");
  return {schema:CLASSIFICACAO_TRABALHO_REVIEW_V1,status:"REVIEW_CANDIDATE_ONLY",
    reasons:["CATALOG_AND_STATION_AUTHORITY_NOT_ATTESTED",
      "PHYSICAL_READY_NOT_PROVEN"],
    checked_lines:assignments.length,declared_station_candidates:assignments,
    current_catalog_homologation_proven:false,
    station_physically_attested:false,work_producer_authorized:false,
    ready_for_dispatch:null,live_home_authorized:false,source_modified:false};
}
