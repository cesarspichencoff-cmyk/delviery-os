/* DeliveryOS — Camada de Conhecimento do Cardápio
   Transforma a lista real da TATÁ (data/cardapio_fonte.txt) em registros estruturados,
   aplicando as REGRAS OFICIAIS de classificação por prioridade.
   NÃO faz tuning, NÃO ajusta baseline, NÃO mexe no motor. Só organiza o cardápio.
   Saídas: data/cardapio_knowledge_seed.json  +  docs/Auditoria_Cardapio_Conhecimento.md */
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
const SRC  = REPO + "/data/cardapio_fonte.txt";

// ---------- util ----------
const norm = s => (s||"").toString().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g,"")   // tira acentos (escape unicode)
  .replace(/\s+/g," ").trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,48);
const uniq = a => [...new Set(a)];
const splitList = s => (s||"").split(",").map(x=>x.trim()).filter(Boolean);

// ---------- vocabulário oficial de praças (motor.js linha 19 — fonte da verdade) ----------
// Bug corrigido (ver docs/Auditoria_Builder_Cardapio_PreCorrecao.md): este gerador produzia
// "bar"/"cozinha"/"montagem" (o seed commitado foi corrigido À MÃO no commit aa1df5d; este
// gerador nunca foi atualizado). Normalização agora CENTRALIZADA num único ponto de entrada
// (ver uso logo após `classify()`), nunca espalhada pelas regras de classificação.
const PRACAS_OFICIAIS = ["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros"];
const ALIASES_PRACA = { bar: "bar_bebidas", cozinha: "cozinha_quentes", montagem: "montagem_outros" };
function normalizarPracaOficial(p) {
  if (p == null) return null; // itens não-produtivos legitimamente não têm praça
  if (PRACAS_OFICIAIS.includes(p)) return p;
  if (ALIASES_PRACA[p]) return ALIASES_PRACA[p];
  // trava anti-regressão (Etapa 3): nenhuma praça fora do vocabulário oficial pode chegar ao seed.
  throw new Error(`Praça desconhecida "${p}" — fora do vocabulário oficial (${PRACAS_OFICIAIS.join(", ")}) e sem alias mapeado. Corrija ALIASES_PRACA ou a regra que a gerou.`);
}

// ---------- leitura ----------
const raw = fs.readFileSync(SRC,"utf8").split(/\r?\n/).filter(l=>l.trim().length);
const recs = raw.map((line,i)=>{
  const p = line.split("|");
  if(p.length!==4) throw new Error(`Linha ${i+1} com ${p.length} campos (esperado 4): ${line}`);
  return {
    nome: p[0].trim(),
    descricao: p[1].trim() || null,
    classificacao_original: splitList(p[2]),
    disponivel_em: splitList(p[3]),
  };
});

// ---------- dicionários de extração ----------
const PROTEINAS = ["salmao","atum","camarao","kani","polvo","lula","vieira","buri","robalo","carapau",
  "serra","beijupira","hamachi","centolla","unagui","enguia","uni","ikura","tobiko","massago","ovas",
  "foie gras","codorna","frango","carne","file mignon","lombo","peixe branco","peixe",
  "anchova","toro","akami","bluefin","spicy tuna","caranguejo","frutos do mar","suino","porco"];
const MOLHOS = ["tare","teriyaki","agridoce","ponzu","citrico","misso","shoyu","maionese","nikkei"];
const ACOMP  = ["gohan","legumes","gari","arroz"];
const COMPLEM= ["cream cheese","cream chesse","cebolinha","avocado","abacate","pepino","crispy","gergelim",
  "flor de sal","limao siciliano","tomate","cebola","shimeji","shitake","milho","nira",
  "wakame","soja","berinjela","cogumelo","macarrao","ovo","trufa","trufado","trufada"];
const RAWFISH = ["salmao","atum","polvo","camarao","lula","vieira","buri","robalo","carapau","serra",
  "beijupira","hamachi","centolla","unagui","uni","ikura","tobiko","massago","toro","akami","peixe","tuna"];
const PREMIUM = ["trufado","trufada","trufa","toro","uni","ikura","centolla","foie","bluefin","vieira",
  "unagui","hamachi","beijupira","robalo","carapau","serra","codorna","polvo espanhol","massago"];

const HOT_TERMS = ["ebiten","hot roll","skin","tartar de salmao","tuna shiso","ceviche"];
const ENROLADO_TERMS = ["uramaki","batera","hossomaki","temaki"];
const DUPLA_TERMS = ["dupla","sushi","niguiri","nigiri"," duo"," dyo","dyo ","sashimi","gunkan","tirashi","tataki"];
const COZINHA_TERMS = ["katsu","teriyaki","teppanyaki","tempura","yakissoba","yakisoba","guioza","grelhado",
  "beef","katsudon","nasu","shimeji","shitake","edamame","gyukatsu","tonkatsu","chicken","frango","milho doce","teppan"];
// métodos de cocção "duros" (excluem um item da bancada fria); garnish como shimeji/shitake NÃO entram aqui
const HOTPREP = ["katsu","teppanyaki","teppan","tempura","yakissoba","yakisoba","guioza","grelhad",
  "beef","katsudon","gyukatsu","tonkatsu","chicken","frango teriyaki"];

const has = (hay, terms) => terms.some(t => hay.includes(t.trim()) );
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const wordHit = (hay, t) => new RegExp("\\b"+esc(t)+"\\b").test(hay);
const extract = (hay, dict) => {
  let out = uniq(dict.filter(t => wordHit(hay, t)));
  if(out.includes("peixe branco")) out = out.filter(x=>x!=="peixe"); // evita "peixe branco, peixe"
  if(out.includes("trufado")||out.includes("trufada")) out = out.filter(x=>x!=="trufa");
  return out;
};

// ---------- classificação por prioridade (regras oficiais) ----------
function classify(r){
  const nomeN = norm(r.nome);
  const descN = norm(r.descricao||"");
  const avN   = norm(r.disponivel_em.join(" "));
  const classN= norm(r.classificacao_original.join(" "));
  const H = [nomeN, descN, avN, classN].join(" | ");
  const obs = [];
  let conf = "alta";
  let revisao = false;

  const hot = HOT_TERMS.some(t => H.includes(t));

  // helper p/ dependências internas dos combinados/menus
  function depsFrom(text){
    const d=[];
    if(/sashimi|nigiri|niguiri|\bsushi\b|\bdyo\b|gunkan/.test(text)) d.push("duplas");
    if(/roll|rolls|uramaki|hossomaki|temaki|batera/.test(text)) d.push("enrolados");
    if(/hot roll|ebiten|empan|empand/.test(text)) d.push("enrolados_quentes");
    if(/tempura|grelhad|katsu|teppan|yakisoba|yakissoba|guioza/.test(text)) d.push("cozinha");
    if(/carpaccio|tartar|ceviche|entrada/.test(text)) d.push("montagem");
    if(/mochi|sorvete|cookie|sobremesa|choux|torta/.test(text)) d.push("sobremesa");
    if(/vinho|sake|cerveja|refrigerante|bebida/.test(text)) d.push("bar");
    return uniq(d);
  }

  // 0/1) MENU COMPOSTO (checado antes p/ preservar menu_composto; ainda pesa em combinados)
  if(/^menu\b/.test(nomeN)){
    const deps = depsFrom(descN.length?descN:H);
    return { praca_principal:"combinados", categoria_operacional:"menu_composto",
      subcategoria_operacional:"menu", temperatura:"misto",
      pracas_dependentes: uniq(["combinados", ...deps]).filter(x=>x!=="combinados").length? uniq(deps.concat("combinados")) : uniq(deps),
      confianca:"alta", revisao:false,
      observacoes:["Menu composto: depende de várias praças; centro é um combinado. Sacola dupla provável."] };
  }

  // 1) COMBINADOS
  if(H.includes("combinado")){
    const deps = depsFrom(descN.length?descN:H);
    let sub="combinado";
    if(nomeN.includes("especial")) sub="especial";
    else if(nomeN.includes("executivo")) sub="executivo";
    else if(nomeN.includes("tradicional")) sub="tradicional";
    else if(nomeN.includes("kids")) sub="kids";
    else if(nomeN.includes("salmao")) sub="salmao";
    return { praca_principal:"combinados", categoria_operacional:"combinado",
      subcategoria_operacional:sub, temperatura:"misto",
      pracas_dependentes: deps.length?deps:["duplas","enrolados"],
      confianca:"alta", revisao:false,
      observacoes:["Combinado é praça própria; dependências internas parseadas da descrição."] };
  }

  // 2) SOBREMESAS  (categoria disponível 'Sobremesa*' OU nome-item de sobremesa; NUNCA os 'Sabores'/Complemento)
  const ehSabor = classN.includes("complemento") && avN.includes("sabores");
  const nomeSobremesa = /(cookie|mochi|sorvete|choux|torta|brownie|tata chocolate)/.test(nomeN);
  if(!ehSabor && (avN.includes("sobremesa") || nomeSobremesa)){
    let sub="sobremesa";
    if(nomeN.includes("cookie")) sub="cookie";
    else if(nomeN.includes("sorvete")) sub="sorvete";
    else if(nomeN.includes("mochi")) sub="mochi";
    else if(nomeN.includes("choux")) sub="choux";
    else if(nomeN.includes("chocolate")||nomeN.includes("torta")) sub="torta";
    const temp = /(sorvete|mochi)/.test(nomeN) ? "frio" : "ambiente";
    return { praca_principal:"sobremesa", categoria_operacional:"sobremesa",
      subcategoria_operacional:sub, temperatura:temp, pracas_dependentes:[],
      confianca:"alta", revisao:false, observacoes:[] };
  }

  // 3) BEBIDAS / BAR
  const ehBebida = ["bebidas","cervejas","vinhos","sakes"].some(c=>avN.includes(c))
                 || /agua mineral|coca|fanta|sprite|ice tea|heineken|sapporo|cerveja|vinho|sake|saque/.test(nomeN);
  if(ehBebida){
    let sub="refrigerante";
    if(avN.includes("vinho")||/vinho|guaspari|leyda|nederburg|estandon|barone|norton/.test(nomeN)) sub="vinho";
    else if(avN.includes("sake")||/sake|saque|hakushika|hakutsuru|kizakura|yauemon|yuaemon|kurabitono/.test(nomeN)) sub="sake";
    else if(avN.includes("cerveja")||/heineken|sapporo|blue moon|cerveja/.test(nomeN)) sub="cerveja";
    else if(/agua mineral/.test(nomeN)) sub="agua";
    else if(/ice tea/.test(nomeN)) sub="cha";
    const temp = (sub==="vinho"||sub==="sake") ? "ambiente" : "frio";
    return { praca_principal:"bar", categoria_operacional:"bebida",
      subcategoria_operacional:sub, temperatura:temp, pracas_dependentes:[],
      confianca:"alta", revisao:false, observacoes:[] };
  }

  // 4) ENROLADOS QUENTES (vence enrolados)
  if(hot){
    let motivo = HOT_TERMS.filter(t=>H.includes(t));
    // EXCEÇÃO NOMEADA (histórica, ver docs/Auditoria_Builder_Cardapio_PreCorrecao.md): Ceviche,
    // Tartar de Salmão e Tuna Shisô Tartar foram revisados manualmente no seed (media/revisão
    // manual=true, com nota sobre a regra operacional do César) — o gerador nunca refletia isso.
    // Restrita aos 3 nomes exatos; NÃO se aplica a nenhum outro item que contenha os mesmos termos.
    const EXCECAO_REVISAO_MANUAL = {
      "ceviche": "Item frio (marinado/cru) enviado para enrolados_quentes pela REGRA OPERACIONAL atual do César. A regra vence — NÃO cai em duplas/sushi. Revalidar com a equipe de qual bancada realmente sai; corrigível no cadastro sem quebrar a arquitetura.",
      "tartar de salmao": "Item frio (marinado/cru) enviado para enrolados_quentes pela REGRA OPERACIONAL atual do César. A regra vence — NÃO cai em duplas/sushi. Revalidar com a equipe de qual bancada realmente sai; corrigível no cadastro sem quebrar a arquitetura.",
      "tuna shiso tartar": "Item frio (marinado/cru) enviado para enrolados_quentes pela REGRA OPERACIONAL atual do César. A regra vence — NÃO cai em duplas/sushi. Revalidar com a equipe de qual bancada realmente sai; corrigível no cadastro sem quebrar a arquitetura.",
    };
    if (EXCECAO_REVISAO_MANUAL[nomeN]) {
      conf = "media"; revisao = true; obs.push(EXCECAO_REVISAO_MANUAL[nomeN]);
    } else if(motivo.some(m=>["ceviche","tartar de salmao","tuna shiso"].includes(m))) {
      conf="alta"; obs.push("Entrada classificada como enrolados_quentes por regra explícita de termo ("+motivo.join(", ")+").");
    }
    return { praca_principal:"enrolados_quentes", categoria_operacional:"enrolado_quente",
      subcategoria_operacional: nomeN.includes("temaki")?"temaki":nomeN.includes("uramaki")||nomeN.includes("hot roll")?"uramaki":"entrada_quente",
      temperatura:"quente", pracas_dependentes:[],
      confianca:conf, revisao, observacoes:obs.concat(["Termo quente: "+motivo.join(", ")+"."]) };
  }

  // 5) ENROLADOS
  if(ENROLADO_TERMS.some(t=>H.includes(t))){
    let sub="enrolado";
    if(nomeN.includes("temaki")) sub="temaki";
    else if(nomeN.includes("uramaki")) sub="uramaki";
    else if(nomeN.includes("hossomaki")) sub="hossomaki";
    else if(nomeN.includes("batera")) sub="batera";
    return { praca_principal:"enrolados", categoria_operacional:"enrolado",
      subcategoria_operacional:sub, temperatura:"frio", pracas_dependentes:[],
      confianca:"alta", revisao:false, observacoes:[] };
  }

  // 6) DUPLAS  (keyword de dupla/sushi/sashimi/dyo/nigiri  OU  categoria de sushi/sashimi/dyo
  //             OU  entrada fria de peixe cru — carpaccio/tartar não-salmão — inferido)
  const catSushi = ["sushis","sashimis","dyos"].some(c=>avN.includes(c));
  const duplaKw = DUPLA_TERMS.some(t=>H.includes(t));
  const entradaFriaPeixe = avN.includes("entradas") && RAWFISH.some(f=>descN.includes(f)||nomeN.includes(f)) && !HOTPREP.some(t=>H.includes(t));
  const carpaccioTartar = /carpaccio|tartar/.test(nomeN);
  if(duplaKw || catSushi || (entradaFriaPeixe && !duplaKw)){
    let sub="dupla";
    if(nomeN.includes("sashimi")) sub="sashimi";
    else if(nomeN.startsWith("sushi")) sub="sushi";
    else if(nomeN.includes("dyo")) sub="dyo";
    else if(nomeN.includes("nigiri")||nomeN.includes("niguiri")) sub="nigiri";
    else if(nomeN.includes("tirashi")) sub="tirashi";
    else if(carpaccioTartar){ sub="entrada_fria"; conf="inferido_com_baixa_confianca"; revisao=true;
      obs.push("Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem."); }
    if(nomeN.includes("tataki")){ sub="tataki"; }
    return { praca_principal:"duplas", categoria_operacional: carpaccioTartar?"entrada":"dupla",
      subcategoria_operacional:sub, temperatura:"frio", pracas_dependentes:[],
      confianca:conf, revisao, observacoes:obs };
  }

  // 7) COZINHA / QUENTES
  if(COZINHA_TERMS.some(t=>H.includes(t))){
    let sub="prato_quente";
    if(H.includes("tempura")) sub="tempura";
    else if(H.includes("teppanyaki")||H.includes("teppan")) sub="teppanyaki";
    else if(H.includes("yakisoba")||H.includes("yakissoba")) sub="yakissoba";
    else if(H.includes("katsu")) sub="katsu";
    else if(H.includes("grelhad")) sub="grelhado";
    else if(H.includes("guioza")) sub="guioza";
    else if(/shimeji|shitake|edamame|nasu|milho doce/.test(H)) sub="entrada_quente";
    // Edamame: user pediu marcar dependência da cozinha; Missoshiro tratado abaixo (não cai aqui)
    if(nomeN.includes("edamame")) obs.push("Assumido preparo pela cozinha (cozido no vapor).");
    return { praca_principal:"cozinha", categoria_operacional: sub==="entrada_quente"?"entrada":"prato_quente",
      subcategoria_operacional:sub, temperatura:"quente", pracas_dependentes:[],
      confianca:"alta", revisao:false, observacoes:obs };
  }

  // 8) MONTAGEM / OUTROS  (+ casos ambíguos explícitos)
  // Missoshiro: ambíguo (cozinha se produção quente / montagem se acompanhamento) -> revisao_manual
  if(nomeN==="missoshiro"){
    return { praca_principal:"cozinha", categoria_operacional:"acompanhamento", subcategoria_operacional:"sopa",
      temperatura:"quente", pracas_dependentes:[], confianca:"inferido_com_baixa_confianca", revisao:true,
      observacoes:["Ambíguo: cozinha (se produção quente) x montagem (se só servido). Confirmar fluxo real."] };
  }
  // Sabores (Baunilha/Melão/Pistache) -> complemento/sabor, NÃO produção
  if(ehSabor){
    return { praca_principal:null, categoria_operacional:"complemento", subcategoria_operacional:"sabor",
      temperatura:"desconhecido", pracas_dependentes:[], confianca:"alta", revisao:false,
      observacoes:["Sabor/complemento associado a outro item; não é prato de produção nem gera sinal de praça."] };
  }
  // Merch / meta (boné, número de pessoas, Tatá Especial container)
  if(/bone|numero de pessoas/.test(nomeN)){
    return { praca_principal:null, categoria_operacional:"nao_producao", subcategoria_operacional: nomeN.includes("bone")?"merchandise":"meta",
      temperatura:"desconhecido", pracas_dependentes:[], confianca:"alta", revisao:false,
      observacoes:["Item não-produtivo (não gera sinal operacional de praça)."] };
  }
  if(nomeN.includes("club vip")){
    return { praca_principal:null, categoria_operacional:"outros", subcategoria_operacional:"programa",
      temperatura:"desconhecido", pracas_dependentes:[], confianca:"inferido_com_baixa_confianca", revisao:true,
      observacoes:["Sem descrição; parece rótulo/programa (Club Vip Gourmet), não item de produção. Confirmar."] };
  }
  // Acompanhamentos de montagem (gengibre/gari, gohan, tarê, wasabi, sunomono)
  const montagemConhecidos = /gengibre|gari|gohan|tare|wasabi|sunomono/;
  if(montagemConhecidos.test(nomeN)){
    const temp = nomeN.includes("gohan")?"quente":"frio";
    return { praca_principal:"montagem", categoria_operacional:"acompanhamento",
      subcategoria_operacional:"guarnicao", temperatura:temp, pracas_dependentes:[],
      confianca:"alta", revisao:false,
      observacoes:["Guarnição/montagem; fácil de esquecer na conferência."] };
  }
  // fallback final -> montagem, revisão manual
  return { praca_principal:"montagem", categoria_operacional:"outros", subcategoria_operacional:"desconhecido",
    temperatura:"desconhecido", pracas_dependentes:[], confianca:"inferido_com_baixa_confianca", revisao:true,
    observacoes:["Não casou com nenhuma regra explícita. Revisar manualmente."] };
}

// ---------- campos derivados + sinais ----------
function derive(rec, cls){
  const nomeN = norm(rec.nome), descN = norm(rec.descricao||""), H=(nomeN+" "+descN);
  const praca = cls.praca_principal;
  const comboOuMenu = ["combinado","menu_composto"].includes(cls.categoria_operacional);
  const quente = cls.temperatura==="quente";
  const frio   = cls.temperatura==="frio";
  const premium = PREMIUM.some(t=>H.includes(t));
  const bebida = cls.categoria_operacional==="bebida";
  const sobremesa = cls.categoria_operacional==="sobremesa";
  const naoProd = ["nao_producao","complemento","outros"].includes(cls.categoria_operacional) && (praca===null);

  // ingredientes — proteínas/molhos varrem nome+descrição (a identidade da proteína costuma estar no nome);
  // acompanhamentos/complementos só da descrição. Onde não há descrição, não inventa.
  const proteinas = extract(H, PROTEINAS);
  const molhos = extract(H, MOLHOS);
  const acomp = rec.descricao ? extract(descN, ACOMP) : [];
  const complem = (rec.descricao ? extract(descN, COMPLEM) : []).filter(c=>!proteinas.includes(c)&&!molhos.includes(c)&&!acomp.includes(c));
  const ingr = uniq([...proteinas, ...molhos, ...acomp, ...complem]);

  // quantidades
  let qpecas=null;
  if(rec.descricao){
    const m = descN.match(/(\d+)\s*(unid|unidades|pecas|peça|pecas|fatias|bola|un\.)/);
    if(m) qpecas = parseInt(m[1],10);
    if(comboOuMenu) qpecas = null; // composto: não faz sentido nº único
  }
  let qpessoas=null;
  const mp = nomeN.match(/(\d+)\s*pessoa/); if(mp) qpessoas=parseInt(mp[1],10);
  if(nomeN.includes("kids")) qpessoas = qpessoas||1;

  const contem_bebida = comboOuMenu ? /vinho|bebida|refrigerante|cerveja|sake/.test(descN) && !/nao faz parte/.test(descN) : (bebida?true:false);
  const contem_sobremesa = comboOuMenu ? /mochi|sorvete|cookie|sobremesa|choux|torta/.test(descN) : (sobremesa?true:false);
  const contem_kit = /kit\b/.test(H) ? true : false;

  const sacolas_esperadas = cls.categoria_operacional==="menu_composto" ? 2
    : (qpessoas && qpessoas>=2) ? 1 : 1; // set-once; multi-sacola real é decidido no pedido (soma de itens)

  const produz_sozinho = naoProd ? null : !comboOuMenu && (cls.pracas_dependentes.length===0);
  const depende_de_outra_praca = comboOuMenu || cls.pracas_dependentes.length>0;
  const trava_fechamento = comboOuMenu || quente; // combos/menus e quentes fresquinhos "seguram" o fechamento
  const pausavel = naoProd ? false : true;
  const substituivel = comboOuMenu ? false : (naoProd?null:true);

  let risco_de_erro = "baixo";
  if(comboOuMenu) risco_de_erro="alto";
  else if(premium) risco_de_erro="alto";
  else if(/spicy|skin|trufad|especial|maçaricad|macaricad/.test(H)) risco_de_erro="medio";
  else if(ingr.length>=4) risco_de_erro="medio";

  // sinais_que_pode_gerar
  const S=[];
  if(praca) S.push(praca+" sobrecarregada");
  if(depende_de_outra_praca) S.push("depende de outra praça");
  if(trava_fechamento) S.push("trava fechamento");
  if(quente) S.push("pedido só de quente");
  if(frio && !comboOuMenu) S.push("pedido só de frio");
  if(contem_bebida) S.push("pedido com bebida");
  if(contem_sobremesa) S.push("pedido com sobremesa");
  if(contem_kit) S.push("pedido com kit");
  if(comboOuMenu || sacolas_esperadas>=2) S.push("risco de segunda sacola");
  if(risco_de_erro==="alto") S.push("risco de conferência");
  if(premium) S.push("risco de ruptura");
  if(quente || comboOuMenu) S.push("alto tempo de produção");
  if(frio && !premium && !comboOuMenu) S.push("pode ser adiantado");
  if(pausavel) S.push("item pausado");
  if(cls.categoria_operacional==="acompanhamento"||cls.subcategoria_operacional==="guarnicao") S.push("item de montagem fácil de esquecer");

  return { ingredientes_extraidos:ingr, proteinas, molhos, acompanhamentos:acomp, complementos:complem,
    quantidade_pecas:qpecas, quantidade_pessoas:qpessoas,
    contem_bebida, contem_sobremesa, contem_kit, sacolas_esperadas,
    produz_sozinho, depende_de_outra_praca, trava_fechamento, pausavel, substituivel,
    risco_de_erro, sinais_que_pode_gerar: uniq(S) };
}

// ---------- montar registros ----------
let itens = recs.map(r=>{
  const cls = classify(r);
  // único ponto de entrada da normalização — nada de praça entra no seed sem passar aqui
  cls.praca_principal = normalizarPracaOficial(cls.praca_principal);
  cls.pracas_dependentes = (cls.pracas_dependentes||[]).map(normalizarPracaOficial);
  const der = derive(r, cls);
  return {
    id: slug(r.nome),
    nome: r.nome,
    nome_normalizado: norm(r.nome),
    descricao: r.descricao,
    classificacao_original: r.classificacao_original,
    disponivel_em: r.disponivel_em,
    categoria_operacional: cls.categoria_operacional,
    subcategoria_operacional: cls.subcategoria_operacional,
    praca_principal: cls.praca_principal,
    pracas_dependentes: cls.pracas_dependentes,
    temperatura: cls.temperatura,
    ingredientes_extraidos: der.ingredientes_extraidos,
    proteinas: der.proteinas,
    molhos: der.molhos,
    acompanhamentos: der.acompanhamentos,
    complementos: der.complementos,
    quantidade_pecas: der.quantidade_pecas,
    quantidade_pessoas: der.quantidade_pessoas,
    contem_bebida: der.contem_bebida,
    contem_sobremesa: der.contem_sobremesa,
    contem_kit: der.contem_kit,
    sacolas_esperadas: der.sacolas_esperadas,
    produz_sozinho: der.produz_sozinho,
    depende_de_outra_praca: der.depende_de_outra_praca,
    trava_fechamento: der.trava_fechamento,
    pausavel: der.pausavel,
    substituivel: der.substituivel,
    risco_de_erro: der.risco_de_erro,
    sinais_que_pode_gerar: der.sinais_que_pode_gerar,
    confianca_classificacao: cls.confianca,
    revisao_manual: cls.revisao,
    observacoes: cls.observacoes,
  };
});

// ---------- dedup canônico ----------
const totalRecebidos = itens.length;
const byKey = new Map();
const dupInfo = [];
for(const it of itens){
  const k = it.nome_normalizado;
  if(!byKey.has(k)){ byKey.set(k, {...it, _fontes:1, _descricoes:it.descricao?[it.descricao]:[]}); }
  else {
    const c = byKey.get(k);
    c._fontes++;
    c.disponivel_em = uniq(c.disponivel_em.concat(it.disponivel_em));
    c.classificacao_original = uniq(c.classificacao_original.concat(it.classificacao_original));
    if(it.descricao){
      if(!c._descricoes.includes(it.descricao)) c._descricoes.push(it.descricao);
      if(!c.descricao || it.descricao.length>c.descricao.length) c.descricao = it.descricao; // mantém a mais informativa
    }
  }
}
const canon = [...byKey.values()].map(c=>{
  const o={...c};
  o.descricoes_alternativas = c._descricoes.filter(d=>d!==c.descricao);
  delete o._fontes; delete o._descricoes;
  // registrar duplicados p/ relatório
  return o;
});
// contagem de duplicados
for(const [k,c] of byKey){ if(c._fontes>1) dupInfo.push({nome:c.nome, fontes:c._fontes, disponivel_em:c.disponivel_em}); }
const totalCanon = canon.length;

// ---------- agregações p/ auditoria ----------
const porPraca = {}, porCat = {};
for(const it of canon){
  const p = it.praca_principal||"(sem praça / não-produção)";
  porPraca[p] = (porPraca[p]||[]); porPraca[p].push(it);
  porCat[it.categoria_operacional] = (porCat[it.categoria_operacional]||0)+1;
}
const semDescricao = canon.filter(it=>!it.descricao);
const baixaConf = canon.filter(it=>it.confianca_classificacao==="inferido_com_baixa_confianca");
const revisar = canon.filter(it=>it.revisao_manual);
const ambiguos = canon.filter(it=>it.confianca_classificacao!=="alta");

// ---------- escrever JSON ----------
const seed = {
  _meta: {
    projeto:"DeliveryOS — Camada de Conhecimento do Cardápio",
    natureza:"referência estrutural, set-once (NÃO é preenchimento por pedido)",
    fonte:"data/cardapio_fonte.txt (lista real da TATÁ)",
    gerado_em:new Date().toISOString().slice(0,10),
    total_produtos_recebidos: totalRecebidos,
    total_itens_canonicos: totalCanon,
    pracas: Object.keys(porPraca).sort(),
    aviso_honesto:"Ingredientes/molhos são extraídos da descrição por dicionário; onde a descrição falta ou é ambígua, os campos ficam vazios/null/baixa confiança. Popularidade (peso de venda) NÃO está aqui — deve vir de dados reais de venda, não de chute.",
    regras_prioridade:["combinados","menus_compostos","sobremesas","bebidas/bar","enrolados_quentes","enrolados","duplas","cozinha/quentes","montagem/outros"],
  },
  itens: canon
};
fs.writeFileSync(REPO+"/data/cardapio_knowledge_seed.json", JSON.stringify(seed,null,2), "utf8");

// ---------- escrever relatório ----------
const nz = o => Object.entries(o).sort((a,b)=>(b[1].length||b[1])-(a[1].length||a[1]));
function exemplos(list,n=10){ return list.slice(0,n).map(it=>`  - **${it.nome}** — _${it.subcategoria_operacional}_, ${it.temperatura}${it.proteinas.length?` · proteínas: ${it.proteinas.join(", ")}`:""}${it.confianca_classificacao!=="alta"?` · ⚠️ ${it.confianca_classificacao}`:""}`).join("\n"); }

const ORDEM_PRACA = ["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros","(sem praça / não-produção)"];
let md = `# Auditoria — Camada de Conhecimento do Cardápio (TATÁ)

> Base estrutural **set-once** do DeliveryOS. Não é preenchimento por pedido.
> Gerada por \`build_cardapio_knowledge.js\` a partir de \`data/cardapio_fonte.txt\` (lista real).
> **Não** houve tuning, ajuste de baseline, nem alteração do motor/visual.

## 1. Totais
- **Produtos recebidos (linhas):** ${totalRecebidos}
- **Itens canônicos (após dedup):** ${totalCanon}
- **Duplicados colapsados:** ${totalRecebidos-totalCanon} (em ${dupInfo.length} itens canônicos)
- **Itens sem descrição:** ${semDescricao.length}
- **Itens de baixa confiança / revisão manual:** ${revisar.length}

## 2. Quantidade por praça (praça principal)
| Praça | Itens |
|---|---|
${ORDEM_PRACA.filter(p=>porPraca[p]).map(p=>`| ${p} | ${porPraca[p].length} |`).join("\n")}

### Critério de sucesso (praças obrigatórias separadas e não-zeradas)
${["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros"].map(p=>{const n=(porPraca[p]||[]).length; return `- ${n>0?"✅":"❌"} **${p}**: ${n}`;}).join("\n")}

## 3. Quantidade por categoria operacional
| Categoria | Itens |
|---|---|
${Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`| ${c} | ${n} |`).join("\n")}

## 4. Até 10 exemplos por praça
${ORDEM_PRACA.filter(p=>porPraca[p]).map(p=>`### ${p} (${porPraca[p].length})\n${exemplos(porPraca[p])}`).join("\n\n")}

## 5. Itens ambíguos / baixa confiança (${ambiguos.length})
${ambiguos.length?ambiguos.map(it=>`- **${it.nome}** → praça \`${it.praca_principal}\` · ${it.observacoes.join(" ")}`).join("\n"):"_nenhum_"}

## 6. Itens que precisam de revisão manual (${revisar.length})
${revisar.length?revisar.map(it=>`- **${it.nome}** (${it.disponivel_em.join(", ")}) → \`${it.praca_principal}\` · ${it.observacoes.join(" ")}`).join("\n"):"_nenhum_"}

## 7. Itens sem descrição (${semDescricao.length})
${semDescricao.length?semDescricao.map(it=>`- ${it.nome} (${it.disponivel_em.join(", ")}) → \`${it.praca_principal||"—"}\``).join("\n"):"_nenhum_"}

## 8. Duplicados encontrados (${dupInfo.length})
${dupInfo.length?dupInfo.map(d=>`- **${d.nome}** — ${d.fontes}× · disponível em: ${d.disponivel_em.join(", ")}`).join("\n"):"_nenhum_"}

## 9. Regras aplicadas (prioridade)
1. **Combinados** — qualquer "combinado" no nome/descrição/categoria → praça própria \`combinados\` (dependências internas parseadas da descrição).
2. **Menus compostos** — nome começa com "Menu" → \`menu_composto\`, praça \`combinados\`, com \`pracas_dependentes\`.
3. **Sobremesas** — categoria "Sobremesa*" ou item-sobremesa → \`sobremesa\` (os "Sabores" Baunilha/Melão/Pistache ficam como **complemento**, não sobremesa).
4. **Bebidas/Bar** — Bebidas/Cervejas/Vinhos/Sakes/Água → \`bar\`.
5. **Enrolados quentes** — ebiten, hot roll, skin, tartar de salmão, tuna shisô, ceviche → \`enrolados_quentes\` (vence enrolados).
6. **Enrolados** — uramaki, baterá, hossomaki, temaki (sem termo quente) → \`enrolados\`.
7. **Duplas** — dupla/sushi/nigiri/dyo/sashimi ou categoria de sushi/sashimi/dyo → \`duplas\`. Peixe cru em "Entradas" (carpaccio/tartar não-salmão) foi **inferido** como bancada fria (duplas) com baixa confiança.
8. **Cozinha/Quentes** — katsu, teriyaki, teppanyaki, tempurá, yakissoba, guioza, grelhado, entradas quentes → \`cozinha\` (temperatura quente).
9. **Montagem/Outros** — gengibre, gohan, tarê, wasabi, sunomono → \`montagem\`; boné/nº de pessoas → não-produção; Missoshiro/Club Vip → revisão manual.

## 10. Observações honestas (limites desta base)
- **Ingredientes** vêm da descrição por dicionário — itens sem descrição ficam com listas vazias (não inventei).
- **Popularidade / peso de venda NÃO existe aqui** — deve vir de dados reais de venda (relatório iFood/PDV), não de chute. Sem isso, "quantos pedidos tocam cada praça" continua dependendo da fonte real de itens por pedido.
- **quantidade_pecas** dos combinados fica \`null\` (são compostos); a contagem detalhada está na descrição.
- **cozinha_quentes** aqui = a bancada de quentes (rótulo de interface "Quentes" no motor). Vocabulário já unificado com \`motor.js\` (ver \`normalizarPracaOficial\` — corrigido em jul/2026, ver \`docs/Auditoria_Builder_Cardapio_PreCorrecao.md\`).
- Peixe cru em Entradas (carpaccio/tartar de atum) e Missoshiro estão marcados para **revisão manual** — não force antes de confirmar o fluxo real.
`;
// ---------- Seção 11: sinais destravados pelo cardápio (entregável #3) ----------
const sigAgg = {};
for(const it of canon){ for(const s of it.sinais_que_pode_gerar){ (sigAgg[s]=sigAgg[s]||{n:0,pr:new Set()}); sigAgg[s].n++; if(it.praca_principal) sigAgg[s].pr.add(it.praca_principal); } }
const sigRows = Object.entries(sigAgg).sort((a,b)=>b[1].n-a[1].n)
  .map(([s,v])=>`| ${s} | ${v.n} | ${[...v.pr].join(", ")||"—"} |`).join("\n");
// checklist do usuário
const totQuente = canon.filter(i=>i.temperatura==="quente").length;
const totFrio   = canon.filter(i=>i.temperatura==="frio").length;
const totTrava  = canon.filter(i=>i.trava_fechamento).length;
const totUnica  = canon.filter(i=>i.praca_principal && !i.depende_de_outra_praca).length;
const totAdiant = canon.filter(i=>i.sinais_que_pode_gerar.includes("pode ser adiantado")).length;
const totConf   = canon.filter(i=>i.risco_de_erro==="alto").length;
const totRupt   = canon.filter(i=>i.sinais_que_pode_gerar.includes("risco de ruptura")).length;
const check = (ok,txt)=>`- ${ok==="ok"?"✅ **destravado**":ok==="ordem"?"🟡 **destravável no pedido** (o cardápio dá os ingredientes; o resolver combina no pedido)":"⚠️ **falta dado real**"} — ${txt}`;
const sec11 = `

## 11. Sinais destravados pelo cardápio (entregável #3)

### 11.1 Contagem real dos sinais que os itens já emitem
| Sinal | Itens que emitem | Praças |
|---|---|---|
${sigRows}

### 11.2 Checklist da sua lista de sinais
${check("ok",`**praça dos combinados sobrecarregada** — ${(porPraca["combinados"]||[]).length} itens em \`combinados\``)}
${check("ok",`**praça das duplas sobrecarregada** — ${(porPraca["duplas"]||[]).length} itens em \`duplas\``)}
${check("ok",`**enrolados sobrecarregados** — ${(porPraca["enrolados"]||[]).length} itens em \`enrolados\``)}
${check("ok",`**enrolados quentes sobrecarregados** — ${(porPraca["enrolados_quentes"]||[]).length} itens em \`enrolados_quentes\``)}
${check("ok",`**cozinha/quentes sobrecarregada** — ${(porPraca["cozinha_quentes"]||[]).length} itens em \`cozinha_quentes\``)}
${check("ok",`**sobremesa pendente** — ${(porPraca["sobremesa"]||[]).length} itens em \`sobremesa\` (praça separada)`)}
${check("ok",`**bebida pendente** — ${(porPraca["bar_bebidas"]||[]).length} itens em \`bar_bebidas\``)}
${check("ok",`**pedido só de quente / só de frio** — ${totQuente} itens quentes, ${totFrio} frios marcados por temperatura`)}
${check("ordem",`**pedido fechável** — ${canon.length-totTrava} itens NÃO travam fechamento; o resolver marca o pedido fechável quando nenhum item pendente trava`)}
${check("ordem",`**pedido com mais de uma sacola** — sacolas_esperadas por item + soma no pedido (combos/menus já marcam risco de 2ª sacola)`)}
${check("ok",`**item pausado** — ${canon.filter(i=>i.pausavel).length} itens pausáveis (base para a camada de pausa/futuro)`)}
${check("falta",`**item com pico de saída** — precisa de **popularidade real de venda** (não está no cardápio; vem do histórico iFood/PDV)`)}
${check("ordem",`**pedido que depende de uma única praça** — ${totUnica} itens produzem sozinhos numa praça; o resolver detecta pedido de praça única`)}
${check("ok",`**pedido que pode ser adiantado** — ${totAdiant} itens frios estáveis marcados \`pode ser adiantado\``)}
${check("ok",`**risco maior de erro de conferência** — ${totConf} itens de risco alto + ${totRupt} com risco de ruptura`)}

> 🟡 = o cardápio fornece os campos (praça, trava_fechamento, sacolas, produz_sozinho); o **sinal final é do pedido**, calculado pelo resolver ao cruzar cardápio × pedido × estado. Nenhuma regra de decisão muda ao trocar a fonte de itens.
> ⚠️ = depende de dado que **não é do cardápio** (popularidade de venda) — set-once não resolve; vem do histórico real.
`;
md += sec11;
fs.writeFileSync(REPO+"/docs/Auditoria_Cardapio_Conhecimento.md", md, "utf8");

// ---------- resumo no console ----------
console.log("=== CARDÁPIO KNOWLEDGE — build ok ===");
console.log("recebidos:",totalRecebidos," canônicos:",totalCanon," duplicados colapsados:",totalRecebidos-totalCanon);
console.log("\npor praça:");
ORDEM_PRACA.filter(p=>porPraca[p]).forEach(p=>console.log("  "+p.padEnd(28)+porPraca[p].length));
console.log("\npor categoria:");
Object.entries(porCat).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>console.log("  "+c.padEnd(20)+n));
console.log("\nCRITÉRIO DE SUCESSO:");
["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros"].forEach(p=>{
  const n=(porPraca[p]||[]).length; console.log("  "+(n>0?"OK ":"FALHA ")+p+": "+n);
});
console.log("\nrevisão manual:",revisar.length," | sem descrição:",semDescricao.length," | baixa confiança:",baixaConf.length);
console.log("\namostras enrolados_quentes:", (porPraca["enrolados_quentes"]||[]).map(i=>i.nome).join(" | "));
console.log("\namostras combinados:", (porPraca["combinados"]||[]).slice(0,6).map(i=>i.nome).join(" | "));
