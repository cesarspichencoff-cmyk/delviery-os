"use strict";
/**
 * Read-only triage of the historical July catalog against confirmed kitchen
 * dependency rules. Product names are SEARCH SIGNALS, NOT quantities.
 * Never writes data/kitchen_dependency_rules_v1.json.
 */
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const seed=require("../data/cardapio_knowledge_seed.json");
const rules=require("../data/kitchen_dependency_rules_v1.json");
function norm(v){
 return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
}
function getAudit(){
 const products=seed.itens.filter(x=>typeof x.nome==="string"&&x.nome.trim());
 const confirmed=rules.rules.filter(x=>x.proof==="HUMAN_CONFIRMED");
 const ruleByName=new Map(confirmed.map(r=>[norm(r.canonical_item_name),r]));
 const repeated=new Map();
 for(const rule of confirmed){
  const key=norm(rule.canonical_item_name);
  repeated.set(key,(repeated.get(key)??0)+1);
 }
 const duplicates=[...repeated].filter(([,count])=>count>1).map(([name])=>name);
 const candidates=[];
 for(const p of products){
  const key=norm(p.nome);
  const approved=ruleByName.get(key);
  const matches=[
   ["HOT",/(^| )HOT( |$)/],["EBITEN",/(^| )EBITEN( |$)/],
   ["SHISO",/(^| )SHISO( |$)/],["SHISSO",/(^| )SHISSO( |$)/]
  ].filter(([,regex])=>regex.test(key)).map(([kind])=>kind);
  if(approved||matches.length){
    candidates.push({
      product_id:p.id,
      product_name:p.nome,
      station_from_historical_seed:p.praca_principal??null,
      matching_name_terms:matches,
      confirmation:approved?"HUMAN_CONFIRMED_EXACT_RULE":"NEEDS_HUMAN_OPERATIONAL_VALIDATION",
      proven_yields:approved?approved.yields:null,
      proposed_yields:null,
    });
  }
 }
 return {
  schema:"deliveryos.kitchen-rule-triage.v48.read-only.v1",
  catalogue_ref:"data/cardapio_knowledge_seed.json",
  catalogue_date:seed._meta?.gerado_em??null,
  catalogue_is_historical:true,
  rules_ref:"data/kitchen_dependency_rules_v1.json",
  rules_coverage:rules.coverage,
  confirmed_rules:confirmed.length,
  confirmed_rules_not_fully_covered:rules.coverage!=="COMPLETE",
  catalogued_products:products.length,
  catalogue_rule_exact_matches:products.filter(p=>ruleByName.has(norm(p.nome))).length,
  candidate_count:candidates.length,
  candidates:candidates.sort((a,b)=>a.product_name.localeCompare(b.product_name,"pt-BR")),
  duplicate_confirmed_rule_names:duplicates,
  policy:{
   name_match_is_only_a_candidate:true,
   catalogue_ingredient_description_is_not_a_human_rule:true,
   absence_from_candidates_means_zero_dependencies:false,
   proposed_yields_are_not_authorized:true,
   no_rules_changed:true,
  },
 };
}
function markdown(a){
 const out=[
  "# Cozinha — revisão de dependências HOT / EBITEN / SHISO",
  "",
  "Estado: TRIAGEM DOCUMENTAL — nenhuma nova regra aprovada.",
  "",
  "O catálogo é histórico de "+a.catalogue_date+". Foram analisados "+a.catalogued_products+" produtos. Há "+a.confirmed_rules+" regra(s) nominal(is) comprovada(s) no registro, com cobertura declarada "+a.rules_coverage+".",
  "",
  "Um nome contendo HOT, EBITEN ou SHISÔ NÃO comprova que a cozinha deva preparar uma unidade desse tipo. Nenhum candidato foi promovido automaticamente.",
  "",
  "| Produto | Praça histórica | Evidência | HOT/unid. | EBITEN/unid. | SHISO/unid. |",
  "|---|---|---|---|---|---|",
 ];
 for(const c of a.candidates){
  const hit=c.confirmation==="HUMAN_CONFIRMED_EXACT_RULE"?"Regra humana registrada":"Nome sugere revisar";
  const qty=(kind)=>c.proven_yields&&Number.isInteger(c.proven_yields[kind])?String(c.proven_yields[kind]):"A validar";
  out.push("| "+c.product_name.replace(/\|/g,"/")+" | "+String(c.station_from_historical_seed??"não definida")+" | "+hit+" | "+qty("HOT")+" | "+qty("EBITEN")+" | "+qty("SHISO")+" |");
 }
 out.push("","## Como validar sem inventar","",
  "Para cada produto aplicável, confirmar com a equipe se gera preparação própria de HOT, EBITEN ou SHISO, quantas unidades **por porção vendida** e qual a praça de destino. Registrar referência e data da validação. Confirmar também quais itens geram ZERO de demanda; ausência de nome na tabela não é prova de zero.",
  "",
  "Apenas uma aprovação operacional explícita pode atualizar o arquivo ativo data/kitchen_dependency_rules_v1.json. Esta tabela NÃO é a fonte de impressão. A cobertura permanece PARTIAL.",
  "",
  "Análise também deve incluir produtos com dependência mas sem o termo no nome — detectar por observação real, ficha de preparo ou validação humana.",
 );
 return out.join("\n")+"\n";
}
function run(opts={}){
 const a=getAudit();
 if(opts.writeArtifacts){
  const folder=path.join(root,"docs","evidence");
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,"kitchen_rule_triage_v48_20261008.json"),
   JSON.stringify(a,null,2)+"\n","utf8");
  fs.writeFileSync(path.join(folder,"kitchen_rule_triage_v48_20261008.md"),markdown(a),"utf8");
 }
 return a;
}
if(require.main===module){
 const a=run({writeArtifacts:process.argv.includes("--write-artifacts")});
 console.log(JSON.stringify({catalogue:a.catalogued_products,candidates:a.candidate_count,
  confirmed:a.confirmed_rules,matched:a.catalogue_rule_exact_matches,
  coverage:a.rules_coverage,unchanged:a.policy.no_rules_changed,
  exampleNames:a.candidates.map(x=>x.product_name).slice(0,22)},null,2));
}
module.exports={run,getAudit,markdown};
