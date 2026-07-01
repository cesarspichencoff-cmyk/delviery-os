/* PROVA: o motor troca composição sintética → composição REAL sem mudar nenhuma regra.
   Lê data/exemplo_noite_real.csv com makeFonteItensFromCsv e roda o MESMO resolver. */
const fs=require("fs");
const MOTOR=require("../src/perfil-delivery/motor.js");
const SEED=require("../data/cardapio_knowledge_seed.json").itens;
const csv=fs.readFileSync(__dirname+"/../data/exemplo_noite_real.csv","utf8");

MOTOR.setNomes(Object.fromEntries(SEED.map(i=>[i.id,i.nome])));
const FONTE = MOTOR.makeFonteItensFromCsv(csv, SEED);   // ← única troca vs sintética

console.log("=== PROVA: FONTE REAL (CSV) → resolver ===");
console.log("stats:", JSON.stringify(FONTE.stats), "| não-casados:", JSON.stringify(FONTE.unmatched));
const D=MOTOR.DISPLAY;
for(const id of FONTE.ids){
  const itens=FONTE(id);                 // já adaptados
  const I=MOTOR.resolver(itens);
  const sinais=[];
  if(I.ancora) sinais.push("combinado âncora");
  if(I.pracaUnica) sinais.push("praça única ("+D[I.pracaUnica]+") → fechável quando ela sair");
  if(I.segundaSacola) sinais.push("2 sacolas");
  if(I.contemBebida) sinais.push("bebida");
  if(I.contemSobremesa) sinais.push("sobremesa");
  if(I.contemKit) sinais.push("kit");
  if(I.temObservacao) sinais.push("observação especial");
  if(I.riscoConfAlto) sinais.push("conferência reforçada");
  if(I.soQuentes) sinais.push("só quentes");
  console.log("\n#"+id+"  ("+I.nItens+" itens, "+I.sacolas+" sacola(s))");
  console.log("  itens: "+itens.map(x=>x.nome+(x.qtd>1?" x"+x.qtd:"")).join(" · "));
  console.log("  praças produção: "+(I.benches.map(p=>D[p]).join(", ")||"—")+"  | conferência: "+(I.confPr.map(p=>D[p]).join(", ")||"—"));
  console.log("  sinais: "+sinais.join(" · "));
  if(I.temObservacao) console.log("  ⚠ obs: "+I.observacoes.join(" | "));
}
console.log("\nOK — mesma API (resolver/step/buildFoco) usada com itens REAIS. Nenhuma regra alterada.");
