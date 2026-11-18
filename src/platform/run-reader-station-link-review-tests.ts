/**
 * Reader line -> R5-D3 existing producer/projector only.
 * Synthetic fixtures; cannot grant live source or physical completion.
 */
import assert from "node:assert/strict";
import { produzirTrabalhoPraca, type RegistroDeTrabalho } from "../product/eventos/produtor-trabalho-praca";
import {
  vincularReaderTrabalhoPraca,
  type RevisaoNativaParaTrabalho,
} from "../product/eventos/vinculo-reader-trabalho-praca";

const when="2026-11-04T16:03:00.000Z",tenant="tata",unit="ITAIM" as const;
const base: RevisaoNativaParaTrabalho={
  source_mode:"control",
  identity:{unit_id:"0001",store_id:"01",nr_venda_rest:"LAB-SALE",
    nr_comanda:"LAB-ORDER",origin:"DLV_IFO",opened_at:"2026-11-04T16:00:00.000Z",
    snapshot_hash:"a".repeat(64)},
  items:[
    {line_no:"L1",product_code:"PROD-01",quantity:1,route_code:null},
    {line_no:"L2",product_code:"PROD-01",quantity:2,route_code:null},
  ],
};
const run=(revision=base,workEvents:readonly unknown[]=[])=>vincularReaderTrabalhoPraca({
  revision,unit,tenant,now:when,workEvents,
});
const seed=run();
const order=seed.opaque_order_ref!;
const [first,second]=seed.lines;
function work(args:Partial<RegistroDeTrabalho>={}){
  const input:RegistroDeTrabalho={
    tenant,unidade:unit,praca:"combinados",pedido_id:order,grupo:first!.line_ref,
    estado:"aguardando",ocorrido_em:"2026-11-04T16:01:00.000Z",
    observado_em:"2026-11-04T16:01:00.000Z",
    operador:"term-3",revisao:1,quantidade:1,...args,
  };
  const result=produzirTrabalhoPraca(input);
  assert.equal(result.ok,true,result.ok ? "" : result.detalhe);
  return (result as Extract<typeof result,{ok:true}>).evento;
}
let passed=0;
const test=(name:string,fn:()=>void)=>{fn();passed++;console.log("PASS "+name);};
test("two same-SKU native rows keep distinct line identities and no invented readiness",()=>{
  assert.equal(seed.state,"NO_PHYSICAL_EVENTS");
  assert.equal(seed.lines.length,2);
  assert.notEqual(first!.line_ref,second!.line_ref);
  assert.equal(seed.ready_for_dispatch,null);
  assert.equal(seed.live_home_authorized,false);
  assert.equal(seed.reader_transaction_attested,false);
  assert.equal(seed.physical_event_attested,false);
  assert.equal(seed.projection!.carga_por_praca.length,0);
});
test("recorded work joins exact row using existing R5D3 producer and projector",()=>{
  const a=run(base,[work()]);
  assert.equal(a.state,"REVIEW_CANDIDATE_ONLY",a.reasons.join(","));
  assert.deepEqual(a.lines[0]!.event_ids.length,1);
  assert.equal(a.lines[1]!.event_ids.length,0);
  assert.deepEqual(a.lines[0]!.pracas_declaradas,["combinados"]);
  assert.equal(a.projection!.carga_por_praca[0]!.abertos,1);
  assert.equal(a.projection!.linhagem.natureza,"demonstracao");
  assert.equal(a.live_home_authorized,false);
  assert.equal(a.ready_for_dispatch,null);
});
test("a full started/concluded trace removes OPEN work but NEVER means physical ready",()=>{
  const events=[
    work(),
    work({estado:"iniciado",revisao:2,ocorrido_em:"2026-11-04T16:02:00.000Z",
      observado_em:"2026-11-04T16:02:00.000Z"}),
    work({estado:"concluido",revisao:3,ocorrido_em:"2026-11-04T16:03:00.000Z",
      observado_em:"2026-11-04T16:03:00.000Z"}),
  ];
  const a=run(base,events);
  assert.equal(a.state,"REVIEW_CANDIDATE_ONLY",a.reasons.join(","));
  assert.equal(a.projection!.carga_por_praca.length,0);
  assert.equal(a.lines[0]!.event_ids.length,3);
  assert.equal(a.lines[0]!.conclusao_fisica_comprovada,false);
  assert.equal(a.ready_for_dispatch,null);
});
test("changed native snapshot or changed SKU cannot inherit old work",()=>{
  for(const revision of [
    {...base,identity:{...base.identity,snapshot_hash:"b".repeat(64)}},
    {...base,items:[{...base.items[0]!,product_code:"DIFFERENT"},base.items[1]!]},
  ]){
    const r=run(revision,[work()]);
    assert.equal(r.state,"HOLD");
    assert.equal(r.projection,null);
  }
});
test("same SKU in another line cannot claim the first line work",()=>{
  const e=work({grupo:second!.line_ref,quantidade:1});
  const a=run(base,[e]);
  assert.equal(a.state,"HOLD");
  assert.ok(a.reasons.includes("WORK_EVENT_LINE_OR_QUANTITY_BINDING_INVALID"));
});
test("second line with exact native quantity binds independently",()=>{
  const a=run(base,[work(),work({grupo:second!.line_ref,quantidade:2,revisao:2})]);
  assert.equal(a.state,"REVIEW_CANDIDATE_ONLY",a.reasons.join(","));
  assert.deepEqual(a.lines.map(x=>x.event_ids.length),[1,1]);
});
test("other order, other tenant and other unit cannot inject a work event",()=>{
  for(const event of [
    work({pedido_id:"reader-order:OTHER"}),
    work({tenant:"other"}),
    work({unidade:"OTHER"}),
  ]){
    const a=run(base,[event]);
    assert.equal(a.state,"HOLD");
    assert.equal(a.projection,null);
  }
});
test("same native line declared by two different stations is a conflict",()=>{
  const a=run(base,[work(),work({praca:"duplas",revisao:2})]);
  assert.equal(a.state,"HOLD");
  assert.equal(a.projection,null);
  assert.ok(a.reasons.includes("WORK_PROJECTION_CONFLICT_OR_AMBIGUITY"));
});
test("R5D3 identical retry does not double count work",()=>{
  const e=work(),a=run(base,[e,e]);
  assert.equal(a.state,"REVIEW_CANDIDATE_ONLY",a.reasons.join(","));
  assert.equal(a.projection!.carga_por_praca[0]!.abertos,1);
  assert.equal(a.projection!.eventos_ignorados,1);
});
test("missing native row id, duplicated row id or other source fails closed",()=>{
  for(const r of [
    {...base,items:[base.items[0]!,{...base.items[1]!,line_no:"L1"}]},
    {...base,items:[{...base.items[0]!,line_no:""},base.items[1]!] },
    {...base,identity:{...base.identity,origin:"DLV_OUTRO"}},
  ])assert.equal(run(r).state,"HOLD");
});
test("source strings or structure alone never prove producer authority",()=>{
  const e=work();
  const a=run({...base,source_mode:"real"},[e]);
  assert.equal(a.state,"REVIEW_CANDIDATE_ONLY");
  assert.equal(a.projection!.linhagem.natureza,"demonstracao");
  assert.equal(a.reader_transaction_attested,false);
  assert.equal(a.physical_event_attested,false);
  assert.equal(a.live_home_authorized,false);
});
test("actual Reader adapter to item-line binding keeps two same-code rows separate",()=>{
  // Uses the existing CJS adapter, NOT a synthetic reimplementation of it.
  // Source is still control fixture, not actual service or independently
  // observed station. Private free text must not enter either model.
  const adapter=require(process.cwd()+"/runtime/reporting/copiloto_tata_reader_adapter_v1.cjs") as {
    adaptStableTataOrderV1:(
      event:unknown,scope:unknown
    )=>{state:string;revision:RevisaoNativaParaTrabalho|null;reason:string|null}
  };
  const raw={
    schema:"deliveryos.tata-reader-stable-order-event.v1",
    snapshot_hash:"a".repeat(64),
    observed_at:"2026-11-04T13:01:00-03:00",
    ready_for_downstream_shadow:true,blockers:[],
    service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
      source_ref:"SYNTHETIC",blockers:[]},
    effects:{database_read:true,database_write:false,network_call:false,
      odhen_write:false,print:false,spooler_write:false,
      fiscal_action:false,sefaz_call:false,cutover:false},
    order:{
      CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"LAB-SALE",NRCOMANDA:"LAB-ORDER",
      IDORGCMDVENDA:"DLV_IFO",IDSTCOMANDA:"3",
      DTHRABERMESA:"2026-11-04T13:00:00-03:00",
      customer_name:"PRIVATE_SENTINEL",observation_rows:["PRIVATE_SENTINEL"],
      items:[
        {NRPRODCOMVEN:"L1",CDPRODUTO:"PROD-01",QTPRODCOMVEN:"1.000"},
        {NRPRODCOMVEN:"L2",CDPRODUTO:"PROD-01",QTPRODCOMVEN:"2.000"},
      ],
    },
  };
  const a=adapter.adaptStableTataOrderV1(raw,{
    unitId:"ITAIM",sourceUnitId:"0001",sourceStoreId:"01",
    mappingEvidenceRef:"SYNTHETIC_ONLY",sourceMode:"control",
  });
  assert.equal(a.state,"adapted",a.reason??"");
  const r=run(a.revision!,[work()]);
  assert.equal(r.state,"REVIEW_CANDIDATE_ONLY",r.reasons.join(","));
  assert.equal(r.lines.length,2);
  assert.notEqual(r.lines[0]!.line_ref,r.lines[1]!.line_ref);
  assert.equal(r.lines[0]!.event_ids.length,1);
  assert.equal(r.lines[1]!.event_ids.length,0);
  assert.equal(r.live_home_authorized,false);
  assert.equal(r.ready_for_dispatch,null);
  assert.equal(JSON.stringify(r).includes("PRIVATE_SENTINEL"),false);
  assert.equal(JSON.stringify(a.revision).includes("PRIVATE_SENTINEL"),false);
});
console.log("READER_STATION_WORK_LINE_BINDING_REVIEW_PASS "+passed+"/"+passed+" SYNTHETIC_ONLY");
