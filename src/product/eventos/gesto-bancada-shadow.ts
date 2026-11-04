/**
 * Candidato minimo de UMA acao da bancada, sem novo motor de pronto.
 * Reusa a classificacao por linha + o produtor R5-D3 existente.
 * A autorizacao DEVE ser callback da camada confiavel do servidor; nunca
 * receber 'authorized=true' ou papel da requisicao do navegador.
 * Mesmo um callback positivo significa apenas que a acao foi autorizada,
 * NAO que o produto realmente ficou pronto. So produz evento DEMONSTRATIVO.
 * Nenhuma rota, I/O, banco, impressora, Home ou escrita foi ligada aqui.
 */
import { produzirTrabalhoPraca } from "./produtor-trabalho-praca";
import { validarEvento, type EnvelopeOperacional } from "./catalogo-operacional";
import type { PracaId } from "../viewmodels/areas";
import type { RevisaoVinculoReaderTrabalho } from "./vinculo-reader-trabalho-praca";
import type { CruzamentoClassificacaoTrabalhoReview } from "./revisar-classificacao-trabalho-praca";

export const GESTO_BANCADA_SHADOW_V1="gesto-bancada-shadow@1" as const;
export interface PedidoGestoBancada {
 readonly line_ref:string;
 readonly praca:PracaId;
 readonly estado:"iniciado"|"concluido";
 readonly revisao:number;
 readonly ocorrido_em:string;
}
export interface ConsultaAutorizacaoBancada {
 readonly unit:"ITAIM";
 readonly tenant:string;
 readonly line_ref:string;
 readonly praca:PracaId;
 readonly estado:PedidoGestoBancada["estado"];
}
/** Chamada apenas pelo servidor, com sessao/terminal independentes da requisicao. */
export type ConsultarAutorizacaoBancada=(
 consulta:ConsultaAutorizacaoBancada
)=>Promise<
 |{readonly decisao:"permitir";readonly terminal_opaco:string;readonly unidade:"ITAIM";
   readonly praca:PracaId}
 |{readonly decisao:"negar"|"indisponivel"}
>;
export type ResultadoGestoBancada =
 | { readonly status:"HOLD";readonly motivo:string;readonly evento:null;
     readonly physical_ready_proven:false;readonly live_home_authorized:false }
 | { readonly status:"SHADOW_PREVIEW";readonly motivo:"SERVER_AUTHORIZED_ACTION_PREVIEW_ONLY";
     readonly evento:EnvelopeOperacional;readonly physical_ready_proven:false;
     readonly live_home_authorized:false };
const hold=(motivo:string):ResultadoGestoBancada=>({
 status:"HOLD",motivo,evento:null,physical_ready_proven:false,live_home_authorized:false,
});
const SHA=/^reader-line:[a-f0-9]{64}$/;
const opaco=(v:unknown):v is string=>
 typeof v==="string"&&/^[a-z0-9_.:-]{1,64}$/i.test(v)&&
 !v.includes("@")&&!/^[0-9]{11,}$/.test(v);
export async function prepararGestoBancadaShadow(input:Readonly<{
 tenant:string;
 unidade:"ITAIM";
 server_now:string;
 binding:RevisaoVinculoReaderTrabalho;
 classificacao:CruzamentoClassificacaoTrabalhoReview;
 pedido:PedidoGestoBancada;
 autorizar:ConsultarAutorizacaoBancada;
}>):Promise<ResultadoGestoBancada>{
 if(!input||!opaco(input.tenant)||input.unidade!=="ITAIM"||
   typeof input.autorizar!=="function"||!input.pedido||!input.binding||
   !input.classificacao)return hold("REQUEST_OR_TRUSTED_AUTHORIZER_MISSING");
 const p=input.pedido,b=input.binding,c=input.classificacao;
 if(b.state==="HOLD"||!b.opaque_order_ref||b.live_home_authorized!==false||
    b.ready_for_dispatch!==null||b.no_action_executed!==true||
    c.status!=="REVIEW_CANDIDATE_ONLY"||c.live_home_authorized!==false||
    c.ready_for_dispatch!==null||c.station_physically_attested!==false)
   return hold("UPSTREAM_REVIEW_NOT_ELIGIBLE");
 if(!SHA.test(p.line_ref)||!["iniciado","concluido"].includes(p.estado)||
    !Number.isSafeInteger(p.revisao)||p.revisao<1||
    !Number.isFinite(Date.parse(input.server_now))||
    !Number.isFinite(Date.parse(p.ocorrido_em)))
   return hold("MALFORMED_STATION_ACTION");
 const delta=Date.parse(input.server_now)-Date.parse(p.ocorrido_em);
 if(delta<0||delta>90_000)return hold("STATION_ACTION_OUTSIDE_SERVER_WINDOW");
 const line=b.lines.filter(x=>x.line_ref===p.line_ref);
 const classified=c.declared_station_candidates.filter(x=>x.line_ref===p.line_ref);
 if(line.length!==1||classified.length!==1||
   classified[0]!.station!==p.praca||
   line[0]!.pracas_declaradas.some(x=>x!==p.praca)||
   !Number.isSafeInteger(line[0]!.quantity)||line[0]!.quantity<=0)
   return hold("STATION_LINE_NOT_EXACTLY_CLASSIFIED");
 let permission:Awaited<ReturnType<ConsultarAutorizacaoBancada>>;
 try{
  permission=await input.autorizar({unit:"ITAIM",tenant:input.tenant,
   line_ref:p.line_ref,praca:p.praca,estado:p.estado});
 }catch{return hold("STATION_AUTHORIZER_UNAVAILABLE");}
 if(permission.decisao!=="permitir"||permission.unidade!=="ITAIM"||
    permission.praca!==p.praca||!opaco(permission.terminal_opaco))
   return hold("SERVER_PERMISSION_NOT_CONFIRMED");
 const emitted=produzirTrabalhoPraca({
  tenant:input.tenant,unidade:"ITAIM",praca:p.praca,
  pedido_id:b.opaque_order_ref,grupo:p.line_ref,estado:p.estado,
  ocorrido_em:p.ocorrido_em,observado_em:input.server_now,
  operador:permission.terminal_opaco,revisao:p.revisao,
  quantidade:line[0]!.quantity,
 });
 if(!emitted.ok)return hold("EXISTING_WORK_PRODUCER_REJECTED");
 // A fonte fixture previne que um simples 'allow' do callback/teste pareca
 // proveniencia fisica. Nunca registrar esta pre-visualizacao no ledger oficial.
 const preview={...emitted.evento,source:"fixture:registro-operacao"};
 const checked=validarEvento(preview);
 if(!checked.ok)return hold("SHADOW_PREVIEW_ENVELOPE_REJECTED");
 return {status:"SHADOW_PREVIEW",motivo:"SERVER_AUTHORIZED_ACTION_PREVIEW_ONLY",
  evento:checked.evento,physical_ready_proven:false,live_home_authorized:false};
}
