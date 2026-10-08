"use strict";
/** Static font/readability coverage of the HISTORICAL July TATA catalog.
 * No silent alias, no truncation, no live item route inference, no print.
 */
const fs=require("node:fs");
const path=require("node:path");
const catalog=require("../data/cardapio_knowledge_seed.json");
const {OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const root=path.join(__dirname,"..");
function auditOne(product,q){
 const p=new OfflinePrinter();
 const item={quantity:q,print_name:product.nome,source_item_index:0,
 observations:[],finishing:[],kitchen_dependencies:[]};
 p.item(item);
 const out=p.result("PRODUCT_CHECK");
 if(!out.ready_for_offline_preview)return {
  quantity:q,status:"BLOCKED",font:null,
  reasons:out.blocking_reasons,
  printed_name:null,
 };
 const report=inspectEscPos(out.bytes);
 if(!report.pass)return {quantity:q,status:"BLOCKED",font:null,
  reasons:report.errors,printed_name:null};
 const line=report.lines.find(x=>x.text.startsWith(q+"  "));
 return {quantity:q,status:line.segments[0].font==="A"?"FONT_A_LEGIBLE":"FONT_B_REVIEW",
  font:line.segments[0].font,printed_name:line.text,reason:[],
  printed_width_dots:line.width_dots,
  double_height_dots:line.segments[0].font==="A"?48:34};
}
function build(){
 const items=catalog.itens.filter(x=>typeof x.nome==="string"&&x.nome.trim());
 const results=items.map(product=>({
  id:product.id,name:product.nome,historical_station:product.praca_principal??null,
  quantity_1:auditOne(product,1),quantity_12:auditOne(product,12),
 }));
 const tally=(field,status)=>results.filter(x=>x[field].status===status).length;
 return {
  schema:"deliveryos.thermal-legibility-audit.v51.history.v1",
  historic_catalogue_date:catalog._meta.gerado_em,
  total_historical_products:results.length,
  analysis:"Offline native Epson Font A/B selection; not installed printer, active menu, nor physical darkness proof",
  policy:"Reject, never truncate, a product exceeding native line or code page; human-approved alias needed",
  result_counts:{
   single:{A:tally("quantity_1","FONT_A_LEGIBLE"),B:tally("quantity_1","FONT_B_REVIEW"),
    BLOCKED:tally("quantity_1","BLOCKED")},
   double_digit:{A:tally("quantity_12","FONT_A_LEGIBLE"),B:tally("quantity_12","FONT_B_REVIEW"),
    BLOCKED:tally("quantity_12","BLOCKED")},
  },
  watchlist:results.filter(x=>x.quantity_1.status!=="FONT_A_LEGIBLE"||
    x.quantity_12.status!=="FONT_A_LEGIBLE"),
  effects:{print:false,spooler:false,stock:false},
 };
}
function markdown(r){
 const l=[
  "# Auditoria de legibilidade das comandas — catálogo histórico",
  "",
  "Fonte histórica de "+r.historic_catalogue_date+"; não é prova de cardápio ou roteamento ativo.",
  "",
  "A impressão usa fonte nativa A (maior) se a linha cabe em 48 colunas; B (menor) se cabe apenas em 64; caso contrário, bloqueia os bytes. Ainda requer teste físico Epson no ambiente escuro.",
  "",
  "| Quantidade do produto | Fonte A | Fonte B (revisar no papel) | Bloqueados |",
  "|---|---:|---:|---:|",
  "| 1 | "+r.result_counts.single.A+" | "+r.result_counts.single.B+" | "+r.result_counts.single.BLOCKED+" |",
  "| 12 | "+r.result_counts.double_digit.A+" | "+r.result_counts.double_digit.B+" | "+r.result_counts.double_digit.BLOCKED+" |",
  "","## Exceções e revisão humana","",
  "| Produto | Praça histórica | 1x | 12x | Motivo bloqueio |",
  "|---|---|---|---|---|",
 ];
 for(const x of r.watchlist){
  l.push("| "+x.name.replace(/\|/g,"/")+" | "+String(x.historical_station??"Não informada")+
    " | "+x.quantity_1.status+" | "+x.quantity_12.status+" | "+
    [...(x.quantity_1.reasons??[]),...(x.quantity_12.reasons??[])].join(";").replace(/\|/g,"/")+" |");
 }
 l.push("","## Condição para aprovação",
 "","Fonte B exige prova de leitura em baixa luz. Item bloqueado exige abreviação humana aprovada ou outra solução previamente verificada: NUNCA cortar o nome silenciosamente.",
 "","As comprovações de 576 dots e fonte nativa são apenas nominais: as seis impressoras ainda requerem largura/variante/driver calibrados fisicamente.");
 return l.join("\n")+"\n";
}
function run(){
 const r=build(),folder=path.join(root,"docs","evidence");
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"thermal_font_legibility_v51_20261008.json"),JSON.stringify(r,null,2)+"\n");
 fs.writeFileSync(path.join(folder,"thermal_font_legibility_v51_20261008.md"),markdown(r));
 return r;
}
if(require.main===module){
 const r=run();console.log(JSON.stringify({
  count:r.total_historical_products,by_qty:r.result_counts,
  watchlist:r.watchlist.length,
  preview:r.watchlist.slice(0,7).map(x=>x.name),
 },null,2));
}
module.exports={build,run,markdown};
