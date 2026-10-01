/* TATÁ Academia — MOTOR DE EMBALAGEM VIGENTE · 2026-09-10
   Fonte humana mais fresca: César — caixa é NUMÉRICA; P/M/G é SACOLA.
   Fonte operacional: delviery-os@a441bc7e9ed209ca965be549dbbd0cd787867bd5
   docs/Logica_Embalagens_DeliveryOS_V0.md.

   Este arquivo substitui o runtime de lib/packaging.js, cujo modelo histórico
   promovia P/M/G a nomes de caixa. O arquivo antigo permanece apenas como
   evidência histórica; não deve ser carregado pelo produto.
*/
(function (root) {
  "use strict";

  var FACT = "FACT";
  var UNKNOWN = "UNKNOWN";
  var SOURCE = Object.freeze({
    human_current: "César · correções humanas vigentes até 2026-09-27: mesma praça compatível agrupa antes da caixa; 2 duplas + 1 sashimi = 450; menor sacola suficiente; sashimi 240/450/750/1500; kits por pessoas + shoyu",
    operational_repo: "cesarspichencoff-cmyk/delviery-os",
    operational_commit: "a1b203b07738125640f4953b71725b418584809d",
    operational_path: "docs/Logica_Embalagens_DeliveryOS_V0.md"
  });

  var CATEGORIES = {
    dupla_dyo: { label: "Duplas e Dyo", temp: "frio" },
    enrolado: { label: "Enrolados", temp: "frio" },
    temaki: { label: "Temaki", temp: "frio" },
    sashimi: { label: "Sashimi", temp: "frio" },
    combinado: { label: "Combinado", temp: "frio" },
    selada_650: { label: "650 selada", temp: "frio" },
    prato_quente: { label: "Prato da Cozinha", temp: "quente" },
    entrada_cozinha: { label: "Entrada da Cozinha", temp: "quente" },
    cozinha_outro: { label: "Item da Cozinha", temp: "quente" },
    sobremesa: { label: "Sobremesa", temp: "frio" },
    bebida: { label: "Bebida", temp: "neutro" },
    nao_producao: { label: "Fora de produção", temp: "neutro" },
    caixa_fixa: { label: "Caixa fixa", temp: "frio" }
  };

  var RULES = {
    dupla_dyo: {
      source: "HUMAN-CURRENT + PACKAGING-V0",
      status: "PROVEN_CURRENT_HUMAN_RULE",
      claim_ids: ["BOX-001", "BOX-002", "BOX-003"],
      bands: [[1, "240"], [2, "450"], [4, "750"], [6, "1.500"]]
    },
    enrolado: {
      source: "HUMAN-CURRENT + PACKAGING-V0",
      status: "PROVEN_CURRENT_HUMAN_RULE",
      claim_ids: ["BOX-004"],
      bands: [[1, "450"], [2, "750"], [3, "1.500"]],
      complement_from: 3,
      complement_note: "A partir de 3, a base é 1.500; se não couber fisicamente, complementar com caixas menores."
    },
    temaki: {
      source: "PACKAGING-V0",
      status: "PROVEN_OPERATIONAL_DOCUMENT",
      claim_ids: [],
      bands: [[1, "450"], [2, "750"], [4, "1.500"]],
      complement_after: 6,
      complement_note: "Acima de 6: 1.500 + complemento conforme volume físico."
    },
    sashimi: {
      source: "HUMAN-CURRENT 2026-09-26",
      status: "PROVEN_CURRENT_HUMAN_RULE",
      claim_ids: ["BOX-008"],
      bands: [[1, "240"], [2, "450"], [5, "750"], [8, "1.500"]]
    }
  };

  // Capacidade documentada por categoria para caixas menores.
  // Em 27/09/2026 César confirmou que itens compatíveis da MESMA PRAÇA
  // devem ser agrupados antes da escolha da caixa. Exemplo humano:
  // 2 duplas + 1 sashimi, todos em Duplas -> uma caixa 450.
  //
  // Para grupos mistos, 240/450/750 usam ocupação relativa às capacidades
  // documentadas. A menor caixa com soma(qty/capacidade) <= 1 vence.
  // 1.500 continua sendo o próximo tier vigente quando nenhuma menor fecha.
  var MIXED_CAPACITY = Object.freeze({
    "240": Object.freeze({ dupla_dyo:1, sashimi:1 }),
    "450": Object.freeze({ dupla_dyo:3, sashimi:4, enrolado:1, temaki:1 }),
    "750": Object.freeze({ dupla_dyo:5, sashimi:7, enrolado:2, temaki:3 })
  });

  var FIXED_BOX = {
    batera: { box: "750", source: "HUMAN-CURRENT + PACKAGING-V0", claim_ids: ["BOX-005"], status: "PROVEN_CURRENT_HUMAN_RULE" },
    tirashi: { box: "1.000", source: "HUMAN-CURRENT + PACKAGING-V0", claim_ids: ["BOX-005"], status: "PROVEN_CURRENT_HUMAN_RULE" },
    // Promovido em 2026-09-13 pela autoridade humana do Cesar, em resposta a
    // divergencia DIV-CARPACCIO-750 que estava aberta desde que o PACKAGING-V0
    // foi cruzado com o cardapio atual: "Carpaccio sempre na 750, nunca entra em
    // caixas maiores, assim como o batera." Vale para os DOIS carpaccios que o
    // cardapio publica (Salmao Trufado e Polvo Espanhol) — a regra foi dada para
    // o item, sem qualificar sabor, igual a do batera.
    carpaccio: { box: "750", source: "HUMAN-CURRENT 2026-09-27 (Cesar, reconfirmado) + PACKAGING-V0", claim_ids: ["BOX-005"], status: "PROVEN_CURRENT_HUMAN_RULE" }
  };

  var BAG_RULES = Object.freeze({
    P: {
      name: "pequena",
      proven: ["até 4 caixas 450", "até 3 caixas 650 seladas"],
      note: "Cervejas e saquês 300 ml podem usar P quando a montagem permanecer segura."
    },
    M: {
      name: "média",
      proven: ["até 4 caixas 650 seladas", "Tirashi 1.000 quando não estiver em composição fria maior"],
      note: "Carpaccio de Salmão Trufado e Carpaccio de Polvo Espanhol: 750 fixa + Sacola M, reconfirmado por César em 27/09/2026."
    },
    G: {
      name: "grande",
      proven: ["até 4 caixas 1.500", "até 4 caixas 1.600", "caixa 1.500 quente usa G"],
      note: "1.500/1.600 frias podem compartilhar espaço apenas nas combinações e condições de estabilidade documentadas."
    }
  });

  var SELADA_650 = [
    "guioza", "edamame", "missoshiro", "missoshiru", "tempura de milho doce",
    "tempura de milho", "tartar de salmao", "tartar de atum spicy",
    "tuna shiso tartar", "tuna shiso", "ceviche", "sunomono"
  ];

  var QUENTE_1500 = [
    "beef com nira", "salmao grelhado", "katsudon", "katsu don", "fish katsu",
    "tempura de legumes", "tempura de camarao", "tempura misto", "frango teriyaki"
  ];

  var DIVERGENCIAS = [
    {
      id: "SUPERSEDED-PMG-BOX",
      tema: "P/M/G usados historicamente como caixa interna",
      decisao: "SUPERSEDED pela correção humana de 2026-09-10. Caixa é numérica; P/M/G é sacola.",
      status: "RESOLVED_BY_HUMAN_AUTHORITY"
    },
    {
      id: "DIV-CARPACCIO-750",
      tema: "Carpaccio de salmão em 750 fixa",
      fonte: "PACKAGING-V0 declara Carpaccio de salmão 750; cardápio atual contém Carpaccio de Salmão Trufado e Carpaccio de Polvo Espanhol.",
      decisao: "RESOLVIDO pela autoridade humana do César em 2026-09-13: \"Carpaccio sempre na 750, nunca entra em caixas maiores, assim como o batera.\" Vale para os dois carpaccios publicados — a regra foi dada para o item, sem qualificar sabor.",
      status: "RESOLVED_BY_HUMAN_AUTHORITY"
    }
  ];

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  function listed(name, list) {
    return list.indexOf(name) >= 0;
  }

  function categoryOf(product) {
    var name = normalize(product && (product.nome || product.name));
    var family = normalize(product && product.classification && product.classification.family);
    var station = normalize(product && product.classification && product.classification.station);
    if (!name) return { category: null, status: UNKNOWN, why: "produto sem nome" };

    if (/^batera\b/.test(name)) return { category: "caixa_fixa", fixed: "batera", status: FACT, why: "Baterá usa caixa 750 fixa." };
    if (name === "tirashi") return { category: "caixa_fixa", fixed: "tirashi", status: FACT, why: "Tirashi usa caixa 1.000 fixa." };
    // Antes das regras de familia/praca de proposito: o carpaccio mora na praca
    // `duplas`, e sem esta linha ele cairia na matriz numerica das duplas — que e
    // exatamente a caixa maior que a regra proibe.
    if (/^carpaccio\b/.test(name)) return { category: "caixa_fixa", fixed: "carpaccio", status: FACT, why: "Carpaccio usa caixa 750 fixa." };
    if (/^combinado\b/.test(name)) return { category: "combinado", status: FACT, why: "Combinado é produto fechado." };
    if (/^sashimi\b/.test(name)) return { category: "sashimi", status: FACT, why: "Sashimi é categoria própria." };
    if (/^temaki\b/.test(name)) return { category: "temaki", status: FACT, why: "Temaki é categoria própria." };
    if (/^(uramaki|hossomaki|hosomaki|hot roll)\b/.test(name)) return { category: "enrolado", status: FACT, why: "Uramaki, Hossomaki/Hosomaki e Hot Roll são Enrolados." };
    if (/^(sushi|dyo)\b/.test(name)) return { category: "dupla_dyo", status: FACT, why: "Duplas de sushi e Dyo usam a matriz numérica de Duplas/Dyo." };
    // Regra específica do item vence a regra genérica de praça/família.
    if (listed(name, SELADA_650)) return { category: "selada_650", box: "650", per_unit: true, status: FACT, why: "Item com regra explícita de caixa 650 selada." };
    // Regra humana vigente de 26/09/2026: na Cozinha, PRATOS (não entradas) usam 1.500.
    if (family === "prato_quente" && station === "cozinha_quentes") return {
      category: "prato_quente", box: "1.500", per_unit: true, status: FACT,
      why: "Prato da Cozinha usa caixa 1.500 pela regra humana vigente de 26/09/2026."
    };
    // Fallback documental para aliases já provados.
    if (listed(name, QUENTE_1500) || /^yakis+soba\b/.test(name)) return { category: "prato_quente", box: "1.500", per_unit: true, status: FACT, why: "Prato quente documentado para caixa 1.500." };
    if (family === "nao_producao") return { category: "nao_producao", status: FACT, why: "Não é item de produção; não recebe caixa." };
    if (family === "bebida") return { category: "bebida", status: FACT, why: "Bebida segue regra de transporte, não matriz de caixa de sushi." };
    if (family === "sobremesa") return { category: "sobremesa", status: UNKNOWN, why: "A fonte não declara uma única caixa para todas as sobremesas." };
    if (station === "cozinha_quentes" && family === "entrada") return {
      category: "entrada_cozinha", status: UNKNOWN,
      why: "É entrada da Cozinha; entradas não herdam caixa 1.500 e este item não tem outra caixa explícita."
    };
    if (station === "cozinha_quentes") return {
      category: "cozinha_outro", status: UNKNOWN,
      why: "É item da Cozinha, mas não está classificado como prato nem possui caixa explícita."
    };
    return { category: null, status: UNKNOWN, why: "Nenhuma fonte autorizada declara a categoria de embalagem deste item." };
  }

  function tempOf(product) {
    var station = normalize(product && product.classification && product.classification.station);
    if (station === "cozinha_quentes") return "quente";
    var family = normalize(product && product.classification && product.classification.family);
    if (family === "bebida" || family === "nao_producao") return "neutro";
    // Confirmação humana 27/09/2026: combinado fechado é FRIO para transporte.
    // Este fallback já produz esse resultado para combinados; o comentário fixa a semântica.
    return "frio";
  }

  function bandBox(category, count) {
    var rule = RULES[category];
    if (!rule || count <= 0) return null;
    var chosen = null;
    for (var i = 0; i < rule.bands.length; i += 1) {
      if (count >= rule.bands[i][0]) chosen = rule.bands[i][1];
    }
    return chosen;
  }

  function mixedBandBox(counts) {
    var active = Object.keys(counts || {}).filter(function (k) { return Number(counts[k] || 0) > 0; });
    if (!active.length) return { box:null, status:UNKNOWN, load:null, why:"grupo misto vazio" };
    var candidates = ["240", "450", "750"];
    for (var i = 0; i < candidates.length; i += 1) {
      var box = candidates[i];
      var caps = MIXED_CAPACITY[box] || {};
      var load = 0;
      var supported = true;
      for (var j = 0; j < active.length; j += 1) {
        var cat = active[j];
        var cap = Number(caps[cat] || 0);
        if (!cap) { supported = false; break; }
        load += Number(counts[cat] || 0) / cap;
      }
      if (supported && load <= 1 + 1e-9) {
        return {
          box:box,
          status:"DERIVED_FROM_PROVEN_CAPACITIES",
          load:load,
          why:"Menor caixa suficiente para a ocupação combinada da mesma praça."
        };
      }
    }
    var allHave1500 = active.every(function (cat) {
      var rule = RULES[cat];
      return Boolean(rule && rule.bands && rule.bands.some(function (band) { return String(band[1]) === "1.500"; }));
    });
    return allHave1500
      ? { box:"1.500", status:"DERIVED_FROM_PROVEN_CAPACITIES", load:null,
          why:"Nenhuma caixa menor comporta o grupo misto; todas as famílias possuem tier 1.500 vigente." }
      : { box:null, status:UNKNOWN, load:null,
          why:"Não há capacidade comum documentada suficiente para este grupo misto." };
  }

  function comboBox(name) {
    var n = normalize(name);
    if (!/^combinado\b/.test(n)) return null;
    if (/2\s*pessoas?/.test(n)) {
      if (/sashimi/.test(n)) return { box: "1.500", status: FACT };
      return { box: "1.600", status: FACT };
    }
    if (/1\s*pessoas?/.test(n)) return { box: "750", status: FACT };
    return { box: null, status: UNKNOWN };
  }

  // ── TAMANHO DA SACOLA ─────────────────────────────────────────────────────
  // A REGRA EXISTIA E ESTE MOTOR DIZIA QUE NAO.
  // `size_status` ficou UNKNOWN ate 13/09/2026, e em 13/09 eu cheguei a pedir ao
  // Cesar "uma frase" sobre o que decide P, M e G. Ele respondeu que a regra ja
  // estava escrita — e estava, em PACKAGING_RULES_CURRENT_2026-09-10.md, na raiz
  // deste mesmo repositorio, secao "Sacolas — P / M / G". Erro de leitura meu,
  // nao ausencia de fonte.
  //
  // Transcricao da fonte, para ninguem precisar abrir o arquivo:
  //   P — ate 4 caixas 450; ate 3 caixas 650 seladas; cervejas e saques 300 ml
  //       podem ir nela quando separados ou com frios, se ficar seguro.
  //   M — ate 4 caixas 650 seladas; Tirashi em 1.000 quando nao estiver em
  //       composicao fria maior; Carpaccio 750.
  //   G — ate 4 caixas 1.500; ate 4 caixas 1.600; caixa 1.500 quente usa sacola
  //       grande.
  //
  // O que a fonte NAO resolve continua UNKNOWN, e ela mesma manda: "quando o
  // pedido nao prova volume/estabilidade, o sistema deve manter essa parte como
  // UNKNOWN em vez de chutar".
  // Política humana 27/09/2026: entre tamanhos comprovadamente suficientes,
  // usar SEMPRE a menor sacola que der (P < M < G). Sem capacidade provada,
  // permanece UNKNOWN; a regra não autoriza "subir para G por segurança".
  function bagSizeVerdict(groups) {
    var caixas = [];
    (groups || []).forEach(function (g) {
      var n = Number(String(g.box == null ? "" : g.box).replace(/[^\d]/g, ""));
      // O grupo pode conter vários itens dentro de UMA caixa. Para sacola,
      // conta caixa física (g.boxes), não quantidade de itens (g.count).
      if (n) for (var i = 0; i < Math.max(1, Number(g.boxes || 1)); i += 1) caixas.push({ n: n, temp: g.temp });
    });
    if (!caixas.length) {
      return { size: null, status: UNKNOWN, why: "Sem caixa provada, o tamanho da sacola nao se decide." };
    }
    var conta = function (n) { return caixas.filter(function (c) { return c.n === n; }).length; };
    var maior = Math.max.apply(null, caixas.map(function (c) { return c.n; }));
    var temQuenteGrande = caixas.some(function (c) { return c.n >= 1500 && c.temp === "quente"; });

    // G primeiro: a caixa grande manda, e quente de 1.500 manda sozinha.
    if (temQuenteGrande) {
      return { size: "G", status: FACT, why: "Caixa 1.500 quente usa sacola grande." };
    }
    if (maior >= 1500) {
      var grandes = caixas.filter(function (c) { return c.n >= 1500; }).length;
      if (grandes <= 4) {
        return { size: "G", status: FACT,
          why: "Sacola G leva ate 4 caixas de 1.500 ou 1.600. Aqui sao " + grandes + "." };
      }
      return { size: null, status: UNKNOWN,
        why: grandes + " caixas grandes passam do que a fonte declara para uma sacola G (ate 4). O volume real decide." };
    }
    if (maior >= 1000) {
      return { size: "M", status: FACT,
        why: "Tirashi em 1.000 vai na sacola M quando nao esta em composicao fria maior." };
    }
    if (maior === 750) {
      var onlyCarpaccio750 = (groups || []).length > 0 && (groups || []).every(function (g) {
        if (String(g.box) !== "750") return true;
        return g.category === "caixa_fixa" && (g.products || []).every(function (p) {
          return /^carpaccio\b/.test(normalize(p.name || ""));
        });
      });
      if (onlyCarpaccio750) {
        return { size: "M", status: FACT, why: "Carpaccio 750 usa sacola M pela regra específica." };
      }
      return { size: null, status: UNKNOWN,
        why: "Caixa 750 genérica não tem tamanho P/M/G provado. Apenas o Carpaccio 750 possui regra específica para M." };
    }
    if (maior === 650) {
      var seladas = conta(650);
      if (seladas <= 3) {
        return { size: "P", status: FACT,
          why: "Sacola P leva ate 3 caixas 650 seladas. Aqui sao " + seladas + "." };
      }
      if (seladas <= 4) {
        return { size: "M", status: FACT,
          why: "Sacola M leva ate 4 caixas 650 seladas. Aqui sao " + seladas + "." };
      }
      return { size: null, status: UNKNOWN,
        why: seladas + " caixas 650 passam do que a fonte declara (ate 4 na M). O volume real decide." };
    }
    if (maior <= 450) {
      var pequenas = caixas.length;
      if (pequenas <= 4) {
        return { size: "P", status: FACT,
          why: "Sacola P leva ate 4 caixas 450. Aqui sao " + pequenas + "." };
      }
      return { size: null, status: UNKNOWN,
        why: pequenas + " caixas 450 passam do que a fonte declara para a P (ate 4). O volume real decide." };
    }
    return { size: null, status: UNKNOWN, why: "Combinacao de caixas que a fonte nao cobre." };
  }

  function bagVerdict(groups) {
    var quente = groups.some(function (g) { return g.temp === "quente"; });
    var frio = groups.some(function (g) { return g.temp === "frio"; });
    var cannedDrinks = 0;
    var large720 = 0;
    var drinkQty = 0;
    var hasNonDrink = groups.some(function (g) { return g.category !== "bebida"; });
    (groups || []).forEach(function (g) {
      if (g.category !== "bebida") return;
      (g.products || []).forEach(function (p) {
        var n = normalize(p.name || "");
        var q = Math.max(1, Number(p.quantity || 1));
        drinkQty += q;
        if (/\blata\b|aluminum can/.test(n)) cannedDrinks += q;
        if (/\b(?:vinho|saque)\b/.test(n) && /\b720\s*ml\b/.test(n)) large720 += q;
      });
    });

    // Separação obrigatória é por GRUPO, não por quantidade bruta de itens.
    // 6+ latas formam um grupo separado do restante; vinho/saquê 720 ml forma
    // outro grupo e exige Sacola G. Capacidades exatas de ambos continuam UNKNOWN.
    var otherThanCans = hasNonDrink || (drinkQty - cannedDrinks) > 0;
    var otherThanLarge720 = hasNonDrink || (drinkQty - large720) > 0;
    var separatesCans = cannedDrinks >= 6 && otherThanCans;
    var separatesLarge720 = large720 > 0 && otherThanLarge720;
    var baseFoodBags = hasNonDrink ? (quente && frio ? 2 : 1) : 0;
    var beverageGroups = 0;
    if (hasNonDrink) {
      if (cannedDrinks >= 6) beverageGroups += 1;
      if (large720 > 0) beverageGroups += 1;
    } else if (drinkQty > 0) {
      beverageGroups = (large720 > 0 && drinkQty > large720) ? 2 : 1;
    }
    var minimum = Math.max(1, baseFoodBags + beverageGroups);
    var causes = [];
    if (quente && frio) causes.push("quente de cozinha + frio");
    if (separatesCans) causes.push("6 ou mais latas");
    if (separatesLarge720) causes.push("vinho/saque 720 ml");

    var tamanho = bagSizeVerdict(groups);
    var claimIds = quente && frio ? ["BAG-003"] : ["BAG-001", "BAG-002"];
    if (cannedDrinks >= 6 && claimIds.indexOf("BAG-009") < 0) claimIds.push("BAG-009");

    var groupSizes = [];
    if (hasNonDrink) {
      groupSizes.push({
        group:"food",
        size:tamanho.size,
        status:tamanho.status,
        why:tamanho.why
      });
    }
    if (cannedDrinks >= 6) {
      groupSizes.push({
        group:"beverage_cans_6_plus",
        size:null,
        status:UNKNOWN,
        separate_required:separatesCans,
        why:"A fonte exige grupo separado quando houver restante do pedido, mas nao define capacidade maxima de latas por sacola."
      });
    }
    if (large720 > 0) {
      groupSizes.push({
        group:"beverage_wine_or_sake_720ml",
        size:"G",
        status:FACT,
        separate_required:separatesLarge720,
        why:"Vinho/saque 720 ml exige Sacola G; com outro grupo, vai separado."
      });
    }

    return {
      minimum: minimum,
      status: "PROVEN_OPERATIONAL_DOCUMENT",
      claim_ids: claimIds,
      size_system: "P/M/G",
      // Campo legado: tamanho derivado apenas das caixas fisicas conhecidas.
      // Para pedidos multigrupo, consultar group_sizes para não aplicar um tamanho
      // de um grupo ao pedido inteiro.
      size: tamanho.size,
      size_status: tamanho.status,
      size_why: tamanho.why,
      size_source: "PACKAGING_RULES_CURRENT_2026-09-10.md · Sacolas — P / M / G",
      group_sizes: groupSizes,
      exact_bag_count: (cannedDrinks >= 6 || large720 > 1) ? null : minimum,
      exact_bag_count_status: (cannedDrinks >= 6 || large720 > 1) ? UNKNOWN : FACT,
      why: causes.length
        ? "Separação obrigatória: " + causes.join(" + ") + "."
        : "Sem gatilho de separação provado só pela comanda.",
      causes: causes
    };
  }

  // ── QUANTOS KITS, E QUAIS ─────────────────────────────────────────────────
  // Fonte humana vigente: Cesar · 22/09/2026.
  //
  // Regra operacional: kit nao e uma tabela universal de pecas.
  // Ele cobre duas necessidades ao mesmo tempo:
  //   1) quantas pessoas o pedido provavelmente alimenta;
  //   2) quanto shoyu a comida provavelmente exige.
  // Garrafinha = 50 ml; sache = 8 ml.
  // O motor usa FACT apenas nos limites julgados pelo Cesar. Fora deles,
  // generalizacoes ficam INFERENCE/UNKNOWN — nunca viram verdade por conveniencia.
  var KIT_SOURCE = "content-source/human-current/kits_2026-09-22_cesar.md";

  function mergeKits(list) {
    var order = ["Kit Kids", "Kit Quente", "Kit Sobremesa", "Kit Simples", "Kit p/1", "Kit p/2"];
    var map = {};
    (list || []).forEach(function (item) {
      if (!item || !item.kit || !item.quantidade) return;
      map[item.kit] = (map[item.kit] || 0) + Number(item.quantidade);
    });
    return order.filter(function (name) { return map[name]; })
      .map(function (name) { return { kit:name, quantidade:map[name] }; });
  }

  function kitsForPeople(people) {
    var out = [];
    var n = Math.max(0, Number(people) || 0);
    while (n >= 2) { out.push({ kit:"Kit p/2", quantidade:1 }); n -= 2; }
    if (n === 1) out.push({ kit:"Kit p/1", quantidade:1 });
    return out;
  }

  function coldKind(product) {
    var cat = categoryOf(product);
    var name = normalize(product && (product.nome || product.name));
    if (cat && cat.category === "temaki") return "temaki";
    if (cat && cat.category === "sashimi") return "sashimi";
    if (cat && cat.category === "enrolado") return "enrolado";
    if ((cat && cat.category === "dupla_dyo") || /\bdupla\b/.test(name)) return "dupla";
    return null;
  }

  function standaloneColdKit(kind, count) {
    var n = Math.max(0, Number(count) || 0);
    if (!n) return null;
    if (kind === "temaki") {
      if (n === 1) return [{ kit:"Kit Simples", quantidade:1 }];
      if (n <= 3) return [{ kit:"Kit p/1", quantidade:1 }];
      if (n <= 5) return [{ kit:"Kit p/2", quantidade:1 }];
    }
    if (kind === "sashimi") {
      if (n <= 2) return [{ kit:"Kit Simples", quantidade:1 }];
      if (n <= 4) return [{ kit:"Kit p/1", quantidade:1 }];
      if (n === 5) return [{ kit:"Kit p/2", quantidade:1 }];
    }
    if (kind === "dupla") {
      if (n <= 3) return [{ kit:"Kit Simples", quantidade:1 }];
      if (n <= 5) return [{ kit:"Kit p/1", quantidade:1 }];
    }
    if (kind === "enrolado") {
      if (n === 1) return [{ kit:"Kit Simples", quantidade:1 }];
      if (n === 2) return [{ kit:"Kit p/1", quantidade:1 }];
      if (n <= 4) return [{ kit:"Kit p/2", quantidade:1 }];
    }
    return null;
  }

  function coldSignature(counts) {
    return ["temaki","sashimi","dupla","enrolado"]
      .filter(function (k) { return counts[k] > 0; })
      .map(function (k) { return k + ":" + counts[k]; }).join("|");
  }

  var MIXED_COLD_FACTS = {
    "temaki:1|dupla:1": [{ kit:"Kit p/1", quantidade:1 }],
    "temaki:1|sashimi:1|dupla:1": [{ kit:"Kit p/1", quantidade:1 }],
    "temaki:1|enrolado:1": [{ kit:"Kit p/1", quantidade:1 }],
    "sashimi:1|enrolado:1": [{ kit:"Kit p/1", quantidade:1 }],
    "temaki:2|sashimi:1": [{ kit:"Kit p/1", quantidade:1 }],
    "temaki:2|sashimi:1|dupla:1": [{ kit:"Kit p/1", quantidade:1 }],
    "temaki:2|enrolado:2": [{ kit:"Kit p/2", quantidade:1 }],
    "sashimi:2|enrolado:2": [{ kit:"Kit p/2", quantidade:1 }]
  };

  function coldOnlyVerdict(counts) {
    var active = ["temaki","sashimi","dupla","enrolado"].filter(function (k) { return counts[k] > 0; });
    if (!active.length) return null;
    if (active.length === 1) {
      var direct = standaloneColdKit(active[0], counts[active[0]]);
      if (direct) return { kits:direct, status:FACT, why:"Faixa humana vigente da familia " + active[0] + "." };
      return { kits:[], status:UNKNOWN, why:"Quantidade de " + active[0] + " acima dos limites julgados pela fonte humana atual." };
    }
    var sig = coldSignature(counts);
    if (MIXED_COLD_FACTS[sig]) {
      return { kits:MIXED_COLD_FACTS[sig], status:FACT, why:"Combinacao fria julgada diretamente pelo Cesar em 22/09/2026." };
    }
    return { kits:[], status:UNKNOWN, why:"Mistura fria ainda nao julgada pela fonte humana atual: " + sig + "." };
  }

  function hotKitCount(mains, starters) {
    var main = Math.max(0, Number(mains) || 0);
    var starter = Math.max(0, Number(starters) || 0);
    return Math.max(main, Math.ceil((main + starter) / 2));
  }

  function kitVerdict(items) {
    var entries = (items || []).map(function (entry) {
      var product = entry.product || entry;
      return { product:product, quantity:Math.max(1, Number(entry.quantity || entry.qty || 1)) };
    }).filter(function (entry) { return normalize(entry.product.nome || entry.product.name); });

    if (!entries.length) return { kits:[], status:UNKNOWN, why:"Comanda sem item legivel." };

    var counts = { temaki:0, sashimi:0, dupla:0, enrolado:0 };
    var combos1 = 0;
    var combos2 = 0;
    var kids = 0;
    var hotMains = 0;
    var hotStarters = 0;
    var desserts = 0;
    var dessertSeen = 0;
    var beverages = 0;
    var yakisobaMains = 0;
    var evidence = [];
    var names = [];
    var totalQty = entries.reduce(function (sum, entry) { return sum + entry.quantity; }, 0);

    entries.forEach(function (entry) {
      var p = entry.product;
      var qty = entry.quantity;
      var name = normalize(p.nome || p.name);
      var cls = p.classification || {};
      var family = normalize(cls.family);
      var station = normalize(cls.station);
      var cat = categoryOf(p);
      names.push({ name:name, qty:qty });

      if (cat && cat.category === "combinado" && /kids/.test(name)) {
        kids += qty;
        evidence.push((p.nome || p.name) + " -> Kids x" + qty);
        return;
      }
      if (cat && cat.category === "combinado") {
        if (/\b2 pessoas?\b/.test(name)) combos2 += qty;
        else if (/\b1 pessoas?\b/.test(name)) combos1 += qty;
        else evidence.push((p.nome || p.name) + " -> combinado sem pessoas declaradas");
        return;
      }

      if (family === "sobremesa") {
        dessertSeen += qty;
        if (!/\b(?:mochi|choux|cookie)\b/.test(name)) desserts += qty;
        return;
      }
      if (family === "bebida") { beverages += qty; return; }
      if (family === "nao_producao") return;

      var ck = coldKind(p);
      if (ck) {
        counts[ck] += qty;
        evidence.push((p.nome || p.name) + " -> " + ck + " x" + qty);
        return;
      }

      if (station === "cozinha_quentes") {
        if (family === "prato_quente") {
          hotMains += qty;
          if (/yakis+soba/.test(name)) yakisobaMains += qty;
        } else {
          hotStarters += qty;
        }
        evidence.push((p.nome || p.name) + " -> quente x" + qty);
      }
    });

    var extras = [];
    if (kids) extras.push({ kit:"Kit Kids", quantidade:kids });
    if (desserts) extras.push({ kit:"Kit Sobremesa", quantidade:desserts });

    var coldTotal = counts.temaki + counts.sashimi + counts.dupla + counts.enrolado;
    var comboPeople = combos1 + (combos2 * 2);

    // FACT: sobremesa pura usa Kit Sobremesa somente quando precisa de colher.
    if (dessertSeen === totalQty) {
      return {
        kits:mergeKits(extras), status:FACT,
        why:desserts ? "Uma unidade de Kit Sobremesa por sobremesa que precisa de colher." : "Mochi, Choux e cookies nao usam Kit Sobremesa.",
        source:KIT_SOURCE
      };
    }

    // FACT: pedido so de bebida nao recebe kit de comida; canudo e tratado na camada de bebida.
    if (beverages === totalQty) {
      return { kits:[], status:FACT, why:"Pedido so de bebidas nao recebe kit de comida; aplicar a regra de canudo.", source:KIT_SOURCE };
    }

    // FACT: Kids puro conserva um Kit Kids por Kids.
    if (kids && kids === totalQty) {
      return { kits:mergeKits(extras), status:FACT, why:"Cada Kids recebe um Kit Kids.", source:KIT_SOURCE };
    }

    // FACT: combinado(s) sem avulsos frios seguem as pessoas declaradas.
    if (comboPeople && !coldTotal) {
      var base = kitsForPeople(comboPeople);
      if (hotMains || hotStarters) base.push({ kit:"Kit Quente", quantidade:hotKitCount(hotMains, hotStarters) });
      return {
        kits:mergeKits(extras.concat(base)), status:FACT,
        why:"Combinados cobrem as pessoas declaradas; quente adicional conserva sua propria cobertura.",
        principio:"Cobrir pessoas e shoyu com o menor conjunto de kits.",
        evidence:evidence, source:KIT_SOURCE
      };
    }

    // FACT: um unico combinado com avulsos julgados em 22/09/2026.
    if ((combos1 + combos2) === 1 && coldTotal) {
      var sig = coldSignature(counts);
      var comboKits = null;
      if (combos1 === 1) {
        if (sig === "temaki:1" || sig === "enrolado:1" || sig === "sashimi:1" || sig === "sashimi:2") comboKits = [{kit:"Kit p/1",quantidade:1}];
        else if (sig === "temaki:2") comboKits = [{kit:"Kit p/1",quantidade:1},{kit:"Kit Simples",quantidade:1}];
        else if (sig === "temaki:3" || sig === "enrolado:2") comboKits = [{kit:"Kit p/2",quantidade:1}];
      } else if (combos2 === 1) {
        if (sig === "temaki:1" || sig === "enrolado:1" || sig === "sashimi:1") comboKits = [{kit:"Kit p/2",quantidade:1}];
        else if (sig === "temaki:2") comboKits = [{kit:"Kit p/2",quantidade:1},{kit:"Kit Simples",quantidade:1}];
        else if (sig === "enrolado:2") comboKits = [{kit:"Kit p/2",quantidade:1},{kit:"Kit p/1",quantidade:1}];
        else if (sig === "sashimi:3") comboKits = [{kit:"Kit p/2",quantidade:1},{kit:"Kit Simples",quantidade:1}];
      }
      if (comboKits) {
        if (hotMains || hotStarters) comboKits.push({ kit:"Kit Quente", quantidade:hotKitCount(hotMains, hotStarters) });
        return {
          kits:mergeKits(extras.concat(comboKits)), status:FACT,
          why:"Combinado + avulsos aplicado pelos casos humanos julgados em 22/09/2026.",
          principio:"Cobrir pessoas e shoyu com o menor conjunto de kits.",
          evidence:evidence, source:KIT_SOURCE
        };
      }
      return { kits:mergeKits(extras), status:UNKNOWN, why:"Combinado + avulsos fora dos limites julgados: " + sig + ".", source:KIT_SOURCE };
    }

    // FACT: Kids + um temaki e absorvido pelo proprio Kids.
    if (kids === 1 && !comboPeople && !hotMains && !hotStarters
        && counts.temaki === 1 && counts.sashimi === 0 && counts.dupla === 0 && counts.enrolado === 0) {
      return { kits:mergeKits([{kit:"Kit Kids",quantidade:1}].concat(desserts ? [{kit:"Kit Sobremesa",quantidade:desserts}] : [])),
        status:FACT, why:"Kids + 1 temaki usa somente o Kit Kids.", source:KIT_SOURCE };
    }

    // FACT preservado de 24/08 e reiterado em 20/09:
    // Combinado Kids + Yakisoba + 1 dupla -> Kit Kids + Kit Quente.
    // A dupla e complemento do pedido e nao cria um terceiro kit.
    if (kids === 1 && !comboPeople && yakisobaMains === 1 && hotMains === 1 && hotStarters === 0
        && counts.dupla === 1 && counts.temaki === 0 && counts.sashimi === 0 && counts.enrolado === 0
        && dessertSeen === 0 && beverages === 0 && totalQty === 3) {
      return {
        kits:mergeKits(extras.concat([{kit:"Kit Quente",quantidade:1}])),
        status:FACT,
        why:"Combinado Kids + Yakisoba + 1 dupla usa Kit Kids + Kit Quente; a dupla e complemento e nao cria kit proprio.",
        source:"content-source/human-current/kits_2026-08-24_cesar.md + content-source/human-current/kits_2026-09-20_cesar.md",
        evidence:evidence
      };
    }

    // FACT: misturas quente + frio julgadas. O padrao vale como FACT para
    // Yakisoba; outros pratos quentes equivalentes continuam INFERENCE ate
    // receberem julgamento humano direto.
    if (!comboPeople && !kids && hotMains === 1 && hotStarters === 0 && coldTotal) {
      var hs = coldSignature(counts);
      var hk = null;
      if (hs === "enrolado:1" || hs === "temaki:1" || hs === "temaki:2") hk = [{kit:"Kit p/1",quantidade:1}];
      else if (hs === "temaki:3" || hs === "enrolado:2" || hs === "sashimi:3") hk = [{kit:"Kit p/1",quantidade:1},{kit:"Kit Quente",quantidade:1}];
      else if (hs === "sashimi:2") hk = [{kit:"Kit Simples",quantidade:1},{kit:"Kit Quente",quantidade:1}];
      if (hk) {
        return {
          kits:mergeKits(extras.concat(hk)),
          status:yakisobaMains === 1 ? FACT : "INFERENCE_HUMAN_RULE_EXTENSION",
          why:yakisobaMains === 1
            ? "Mistura Yakisoba + frio julgada diretamente em 22/09/2026."
            : "Extensao da logica julgada de Yakisoba para outro prato quente; precisa de validacao humana se virar conteudo.",
          source:KIT_SOURCE, evidence:evidence
        };
      }
    }

    // FACT: Shimeji + um enrolado/uramaki -> p/1.
    var hasShimeji = names.some(function (x) { return /\bshimeji\b/.test(x.name); });
    if (!comboPeople && !kids && hasShimeji && hotStarters === 1
        && counts.enrolado === 1 && coldTotal === 1) {
      return { kits:mergeKits(extras.concat([{kit:"Kit p/1",quantidade:1}])), status:FACT,
        why:"Shimeji + 1 Uramaki usa Kit p/1 pela regra humana de 22/09/2026.", source:KIT_SOURCE };
    }

    // FACT: quente sem frio. A familia observada fecha pela cobertura:
    // max(pratos principais, ceil(total quente/2)).
    if (!comboPeople && !coldTotal && (hotMains || hotStarters)) {
      var q = hotKitCount(hotMains, hotStarters);
      return {
        kits:mergeKits(extras.concat([{kit:"Kit Quente",quantidade:q}])),
        status:FACT,
        why:"Cobertura quente vigente: cada prato principal precisa de cobertura e entradas podem compartilhar um kit a cada duas.",
        hot_main:hotMains, hot_starter:hotStarters, source:KIT_SOURCE
      };
    }

    // FACT: pedido apenas frio avulso dentro dos limites julgados.
    if (!comboPeople && !kids && !hotMains && !hotStarters && coldTotal) {
      var cv = coldOnlyVerdict(counts);
      return {
        kits:mergeKits(extras.concat(cv.kits)), status:cv.status, why:cv.why,
        principio:"Cobrir pessoas e shoyu com o menor conjunto de kits.",
        evidence:evidence, source:KIT_SOURCE
      };
    }

    // Kids + combinado e aditivo por pessoa.
    if (kids && comboPeople && !coldTotal) {
      var persons = kitsForPeople(comboPeople);
      if (hotMains || hotStarters) persons.push({kit:"Kit Quente",quantidade:hotKitCount(hotMains, hotStarters)});
      return { kits:mergeKits(extras.concat(persons)), status:FACT,
        why:"Kids permanece proprio e o combinado cobre suas pessoas declaradas.", source:KIT_SOURCE };
    }

    return {
      kits:mergeKits(extras), status:UNKNOWN,
      why:"Combinacao ainda nao coberta por um julgamento humano vigente; o motor nao chuta.",
      principio:"Pessoas + necessidade de shoyu; generalizacao nao vira FACT automaticamente.",
      evidence:evidence, source:KIT_SOURCE
    };
  }

  function TEMP_BY_CATEGORY(cat) {
    if (!cat || !cat.category) return null;
    if (cat.category === "caixa_fixa") return "frio";
    var def = CATEGORIES[cat.category];
    return def ? def.temp : null;
  }

  function packComanda(items) {
    var groups = [];
    var unknowns = [];
    var byKey = {};

    (items || []).forEach(function (entry) {
      var product = entry.product || entry;
      var qty = Math.max(1, Number(entry.quantity || entry.qty || 1));
      var cat = categoryOf(product);
      var station = (product.classification && product.classification.station) || null;
      var name = product.nome || product.name || "";

      if (cat.category === "caixa_fixa") {
        var fx = FIXED_BOX[cat.fixed];
        groups.push({
          kind: "fixa", category: "caixa_fixa", label: CATEGORIES.caixa_fixa.label,
          station: station, products: [{ name: name, quantity: qty }], count: qty,
          boxes: qty, box: fx.box, temp: tempOf(product), status: fx.status,
          source: fx.source, claim_ids: fx.claim_ids,
          why: name + " usa caixa " + fx.box + " fixa: " + qty + " item(ns) = " + qty + " caixa(s)."
        });
        return;
      }

      if (cat.category === "combinado") {
        var cb = comboBox(name);
        groups.push({
          kind: "combinado", category: "combinado", label: CATEGORIES.combinado.label,
          station: station, products: [{ name: name, quantity: qty }], count: qty,
          boxes: cb.status === FACT ? qty : null, box: cb.box, temp: tempOf(product),
          status: cb.status === FACT ? "PROVEN_OPERATIONAL_DOCUMENT" : UNKNOWN,
          source: "PACKAGING-V0", claim_ids: ["COMBO-001"],
          why: cb.status === FACT
            ? "Combinado é fechado: usa caixa " + cb.box + "; extras seguem a própria categoria."
            : "Combinado fechado, mas a fonte não declara a caixa deste combinado."
        });
        if (cb.status !== FACT) unknowns.push({ item: name, motivo: "caixa do combinado não declarada na fonte" });
        return;
      }

      if (cat.status === FACT && cat.box) {
        groups.push({
          kind: "documentada", category: cat.category, label: (CATEGORIES[cat.category] || {}).label || cat.category,
          station: station, products: [{ name: name, quantity: qty }], count: qty,
          boxes: cat.per_unit ? qty : 1, box: cat.box, temp: tempOf(product),
          status: "PROVEN_OPERATIONAL_DOCUMENT", source: "PACKAGING-V0", claim_ids: [], why: cat.why
        });
        return;
      }

      if (cat.status === UNKNOWN || !RULES[cat.category]) {
        groups.push({
          kind: "desconhecida", category: cat.category,
          label: cat.category ? (CATEGORIES[cat.category] || {}).label || cat.category : "Sem categoria",
          station: station, products: [{ name: name, quantity: qty }], count: qty,
          boxes: null, box: null, temp: tempOf(product), status: UNKNOWN,
          source: null, claim_ids: [], why: cat.why
        });
        unknowns.push({ item: name, motivo: cat.why });
        return;
      }

      // Itens de faixa compatíveis agrupam por PRAÇA + temperatura primeiro.
      // A categoria mede capacidade, mas não deve criar uma caixa separada.
      var key = "faixa|" + (station || "sem_praca") + "|" + tempOf(product);
      if (!byKey[key]) {
        byKey[key] = {
          kind: "faixa", category: cat.category, label: CATEGORIES[cat.category].label,
          categories: {}, station: station, products: [], count: 0, boxes: 1, box: null,
          temp: tempOf(product), status: RULES[cat.category].status,
          source: RULES[cat.category].source, claim_ids: RULES[cat.category].claim_ids.slice(),
          why: "", complement_status: null
        };
        groups.push(byKey[key]);
      }
      var rangeGroup = byKey[key];
      rangeGroup.products.push({ name: name, quantity: qty, category: cat.category });
      rangeGroup.count += qty;
      rangeGroup.categories[cat.category] = (rangeGroup.categories[cat.category] || 0) + qty;
      var categoryNames = Object.keys(rangeGroup.categories);
      if (categoryNames.length > 1) {
        rangeGroup.category = "mixed";
        rangeGroup.label = "Grupo misto da praça";
        rangeGroup.status = "PROVEN_CURRENT_HUMAN_RULE_WITH_DERIVED_CAPACITY";
        rangeGroup.source = "HUMAN-CURRENT 2026-09-27 + matrizes de capacidade vigentes";
        rangeGroup.claim_ids = Array.from(new Set(categoryNames.flatMap(function (k) { return RULES[k]?.claim_ids || []; })));
      }
    });

    groups.forEach(function (group) {
      if (group.kind !== "faixa") return;
      var categoryNames = Object.keys(group.categories || {});
      if (categoryNames.length <= 1) {
        var singleCategory = categoryNames[0] || group.category;
        var rule = RULES[singleCategory];
        group.category = singleCategory;
        group.label = CATEGORIES[singleCategory].label;
        group.box = bandBox(singleCategory, group.count);
        var sabores = group.products.length;
        group.why = group.count + " " + (group.count === 1 ? "item" : "itens") + " da categoria " + group.label
          + (sabores > 1 ? " (" + sabores + " sabores)" : "") + " → caixa " + group.box + ". O sabor não muda a caixa.";
        if ((rule.complement_after && group.count > rule.complement_after)
            || (rule.complement_from && group.count >= rule.complement_from)) {
          group.complement_status = UNKNOWN;
          group.complement_note = rule.complement_note;
        }
        return;
      }

      var mixed = mixedBandBox(group.categories);
      group.box = mixed.box;
      group.status = mixed.status;
      group.why = Object.keys(group.categories).map(function (k) {
        return group.categories[k] + " " + CATEGORIES[k].label;
      }).join(" + ") + " na mesma praça → " + (mixed.box ? "caixa " + mixed.box : "caixa UNKNOWN")
        + ". " + mixed.why;

      // Preserva qualquer fronteira de complemento já existente na família.
      var complementNotes = [];
      categoryNames.forEach(function (k) {
        var rule = RULES[k];
        var q = Number(group.categories[k] || 0);
        if (!rule) return;
        if ((rule.complement_after && q > rule.complement_after)
            || (rule.complement_from && q >= rule.complement_from)) {
          complementNotes.push(rule.complement_note);
        }
      });
      if (complementNotes.length) {
        group.complement_status = UNKNOWN;
        group.complement_note = Array.from(new Set(complementNotes)).join(" ");
      }
      if (!mixed.box) {
        group.boxes = null;
        unknowns.push({ item: group.products.map(function (p) { return p.name; }).join(" + "),
          motivo: mixed.why });
      }
    });

    var boxesKnown = groups.filter(function (g) { return g.boxes !== null; })
      .reduce(function (sum, g) { return sum + Number(g.boxes || 0); }, 0);
    var totalItems = (items || []).reduce(function (sum, e) {
      return sum + Math.max(1, Number(e.quantity || e.qty || 1));
    }, 0);

    return {
      groups: groups,
      total_items: totalItems,
      total_boxes: boxesKnown,
      has_unknown: unknowns.length > 0 || groups.some(function (g) { return g.complement_status === UNKNOWN; }),
      unknowns: unknowns,
      bags: bagVerdict(groups),
      divergencias: DIVERGENCIAS
    };
  }

  function patchQuestion(question, patch) {
    if (!question || !patch) return question;
    Object.keys(patch).forEach(function (key) { question[key] = patch[key]; });
    return question;
  }

  var QUESTION_PATCHES = {
    "KIT-Q012": {
      claim_ids: ["KIT-006"],
      prompt: "O Kit Sobremesa chegou com uma colher de sobremesa e um guardanapo. A montagem está completa?",
      options: ["Sim. São exatamente os dois componentes.", "Não. Falta um hashi.", "Não. Falta um sachê de shoyu.", "Não. Falta uma shoyuzara."],
      correct_index: 0,
      feedback_correct: "Certo. Kit Sobremesa é colher de sobremesa + guardanapo.",
      feedback_wrong: "O Kit Sobremesa fecha com dois componentes: 1 colher de sobremesa e 1 guardanapo.",
      difficulty: 1, mode: "kit_assembly", mode_label: "Montagem de kit", experience_tier: "observe"
    },
    "W4-4.1-02": {
      options: [
        "Sim, toda caixa 750 exige sacola M.",
        "Não. A caixa numérica organiza cada grupo; a sacola P/M/G transporta o conjunto.",
        "Sim, porque caixa e sacola medem o pedido inteiro do mesmo jeito.",
        "Não, porque caixa interna só existe para bebidas."
      ],
      correct_index: 1,
      feedback_correct: "São camadas diferentes: caixa é numérica; P/M/G é tamanho de sacola.",
      feedback_wrong: "São camadas diferentes. Caixa é numérica e P/M/G pertence à sacola. Resposta correta: a caixa organiza cada grupo; a sacola transporta o conjunto."
    },
    "W4-4.2-01": {
      prompt: "Para enrolados da mesma praça, qual é a matriz numérica vigente?",
      options: [
        "1=450; 2=750; 3 ou mais=1.500.",
        "1=240; 2–3=450; 4–5=750; 6+=1.500.",
        "Todo enrolado usa 750.",
        "1=450; 2=1.500; 3+=duas caixas obrigatoriamente."
      ],
      correct_index: 0,
      feedback_correct: "Enrolados da mesma praça: 1 usa 450, 2 usam 750 e 3 ou mais usam 1.500; falta de espaço físico pode exigir complemento.",
      feedback_wrong: "Enrolados da mesma praça usam caixas numéricas: 1=450; 2=750; 3+=1.500. P/M/G é sacola, não caixa."
    },
    "W4-4.2-02": {
      prompt: "Dois enrolados da mesma praça usam qual caixa?",
      options: ["450", "750", "1.500", "1.000"],
      correct_index: 1,
      feedback_correct: "Dois enrolados da mesma praça usam caixa 750.",
      feedback_wrong: "Dois enrolados da mesma praça usam caixa 750."
    },
    "W4-4.2-04": {
      prompt: "Há um enrolado em cada uma de duas praças. Como aplicar a regra de caixas?",
      options: [
        "Somar os dois e usar uma caixa 750.",
        "Usar uma caixa 1.500 para compensar as praças diferentes.",
        "Usar uma caixa 450 para cada praça.",
        "Escolher a caixa pela praça que terminar primeiro."
      ],
      correct_index: 2,
      feedback_correct: "As praças são calculadas separadamente: um enrolado em cada praça pede uma caixa 450 em cada grupo.",
      feedback_wrong: "Não some praças diferentes. Um enrolado em cada praça usa uma caixa 450 por grupo."
    },
    "W4-4.3-01": {
      prompt: "Qual é a matriz numérica vigente para duplas de sushi e Dyo?",
      options: [
        "1=240; 2–3=450; 4–5=750; 6 ou mais=1.500.",
        "1=450; 2=750; 3 ou mais=1.500.",
        "1–2=240; 3–4=450; 5+=750.",
        "Toda dupla usa 450."
      ],
      correct_index: 0,
      feedback_correct: "Duplas/Dyo: 1=240; 2–3=450; 4–5=750; 6+=1.500.",
      feedback_wrong: "A matriz correta é numérica: 1=240; 2–3=450; 4–5=750; 6+=1.500. P/M/G pertence às sacolas."
    },
    "W4-4.3-04": {
      prompt: "Duas duplas de niguiri da mesma praça usam qual caixa?",
      options: ["240", "450", "750", "1.500"],
      correct_index: 1,
      feedback_correct: "Duas duplas da mesma praça usam caixa 450.",
      feedback_wrong: "Duas duplas da mesma praça usam caixa 450."
    },
    "W4-4.3-08": {
      prompt: "Na mesma comanda há duas duplas de uma praça e dois enrolados de outra. Quais caixas usar?",
      options: [
        "450 para as duplas e 750 para os enrolados, em grupos separados.",
        "750 para as duplas e 750 para os enrolados, em grupos separados.",
        "Uma única 1.500 para juntar as duas praças.",
        "240 para as duplas e 450 para os enrolados."
      ],
      correct_index: 0,
      feedback_correct: "As contas ficam separadas: 2 duplas → 450; 2 enrolados → 750.",
      feedback_wrong: "As praças não se somam: 2 duplas usam 450 e 2 enrolados usam 750."
    },
    "W6-6.3-04": {
      prompt: "Uma praça entregou dois enrolados e outra entregou cinco duplas. Quais caixas correspondem aos grupos?",
      options: [
        "750 para os enrolados e 750 para as duplas, em caixas separadas.",
        "450 para os enrolados e 1.500 para as duplas.",
        "Uma única 1.500 para juntar tudo.",
        "750 para os enrolados e 450 para as duplas."
      ],
      correct_index: 0,
      feedback_correct: "Dois enrolados usam 750; cinco duplas também usam 750. O tamanho igual não autoriza misturar as praças.",
      feedback_wrong: "Dois enrolados → 750; cinco duplas → 750. São dois grupos separados, mesmo com o mesmo número de caixa."
    },
    "Q31-FORT-001": {
      prompt: "Uma praça entregou cinco duplas e outra entregou dois enrolados. Como organizar as caixas internas?",
      options: [
        "Uma caixa 750 para as duplas e uma caixa 750 para os enrolados, em grupos separados.",
        "Uma caixa 1.500 única para juntar todas as peças.",
        "Uma caixa 450 para as duplas e uma caixa 750 para os enrolados.",
        "Uma caixa 750 para as duplas e uma caixa 450 para os enrolados."
      ],
      correct_index: 0,
      feedback_correct: "Cinco duplas usam caixa 750; dois enrolados também usam caixa 750. As praças permanecem em grupos separados.",
      feedback_wrong: "Cinco duplas → 750 e dois enrolados → 750. O mesmo número de caixa não autoriza misturar praças diferentes."
    }
  };

  var LEGACY_TEXT_REPLACEMENTS = [
    ["Combinados e caixa M.", "Combinados e caixa 1.500."],
    ["Cozinha Quentes e caixa G.", "Cozinha Quentes e caixa 1.500."],
    ["Combinados e caixa G.", "Combinados e caixa 1.600."],
    ["Montagem e Outros e caixa M.", "Montagem e Outros e caixa 650."],
    ["Duas duplas definem caixa M, não sacola extra.", "Duas duplas definem caixa 450, não sacola extra."],
    ["Usar uma caixa M para duas duplas.", "Usar uma caixa 450 para duas duplas."],
    ["Toda caixa M exige sacola M", "Toda caixa 750 exige sacola M"],
    ["Trocar a caixa original por uma caixa G e reunir tudo no mesmo interno.", "Trocar a caixa original por uma caixa maior e reunir tudo no mesmo interno."],
    ["Quantidade, caixa G ou número de praças não decidem sozinhos.", "Quantidade, a simples presença de uma caixa 1.500/1.600 ou número de praças não decidem sozinhos."],
    ["Existe um número único de caixas G que sempre obriga abrir outra sacola?", "Existe um número único de caixas 1.500 que sempre obriga abrir outra sacola?"],
    ["Sim: a primeira caixa G já exige outra sacola.", "Sim: a primeira caixa 1.500 já exige outra sacola."],
    ["Sim: duas caixas G sempre exigem duas sacolas.", "Sim: duas caixas 1.500 sempre exigem duas sacolas."],
    ["Não existe gatilho geral G→duas sacolas.", "Não existe gatilho geral de uma caixa 1.500 para duas sacolas."],
    ["A quantidade total define uma caixa interna e a mesma letra define a sacola externa.", "A quantidade total define uma caixa única antes de considerar a sacola externa."]
  ];

  function sanitizeLegacyQuestionText(question) {
    if (!question) return question;
    ["prompt", "feedback_correct", "feedback_wrong"].forEach(function (key) {
      if (typeof question[key] !== "string") return;
      LEGACY_TEXT_REPLACEMENTS.forEach(function (pair) {
        question[key] = question[key].split(pair[0]).join(pair[1]);
      });
    });
    if (Array.isArray(question.options)) {
      question.options = question.options.map(function (option) {
        var value = String(option);
        LEGACY_TEXT_REPLACEMENTS.forEach(function (pair) { value = value.split(pair[0]).join(pair[1]); });
        return value;
      });
    }
    return question;
  }

  function patchAppData(input) {
    var data = input;
    if (!data || typeof data !== "object") return data;

    var claims = Object.fromEntries((data.claims || []).map(function (c) { return [c.id, c]; }));
    var currentRefs = ["HUMAN-CURRENT", "PACKAGING-V0"];
    var dessertKitClaim = {
      id: "KIT-006", world: 5, phase: "W5:kits", title: "Kit Sobremesa",
      teach: "Kit Sobremesa: 1 colher de sobremesa e 1 guardanapo.",
      detail: "Vai em cada sobremesa que precisa de colher. Mochi, Choux e cookies não recebem Kit Sobremesa.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: ["HUMAN-CURRENT"],
      phase_title: "Montagem e conferência de kits", kind: "lesson"
    };
    if (claims["KIT-006"]) Object.assign(claims["KIT-006"], dessertKitClaim);
    else {
      data.claims = Array.isArray(data.claims) ? data.claims : [];
      data.claims.push(dessertKitClaim);
      claims["KIT-006"] = dessertKitClaim;
    }
    if (claims["BOX-001"]) Object.assign(claims["BOX-001"], {
      title: "Uma dupla/Dyo usa 240",
      teach: "Uma dupla de sushi ou um Dyo usa caixa 240.",
      detail: "Caixas são numéricas. P/M/G é nomenclatura de sacola.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: currentRefs
    });
    if (claims["BOX-002"]) Object.assign(claims["BOX-002"], {
      title: "Duas a três duplas/Dyo usam 450",
      teach: "Duas ou três duplas/Dyo da mesma praça usam caixa 450.",
      detail: "Quatro ou cinco passam para 750. A categoria mede capacidade, mas itens compatíveis da mesma praça podem compartilhar a caixa; 2 duplas + 1 sashimi em Duplas usam juntos 450.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: currentRefs
    });
    if (claims["BOX-003"]) Object.assign(claims["BOX-003"], {
      title: "Quatro a cinco usam 750; seis ou mais usam 1.500",
      teach: "Quatro ou cinco duplas/Dyo usam caixa 750; seis ou mais usam 1.500.",
      detail: "A matriz é 1=240; 2–3=450; 4–5=750; 6+=1.500.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: currentRefs
    });
    if (claims["BOX-004"]) Object.assign(claims["BOX-004"], {
      title: "Matriz numérica dos enrolados",
      teach: "Enrolados da mesma praça: 1 usa 450, 2 usam 750 e 3 ou mais usam 1.500.",
      detail: "Se o volume físico não couber, a 1.500 recebe complemento; não existe caixa P/M/G.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: currentRefs
    });
    if (claims["BOX-005"]) Object.assign(claims["BOX-005"], {
      title: "Caixas fixas numéricas",
      teach: "Baterá usa caixa 750 fixa; Tirashi usa caixa 1.000 fixa.",
      detail: "P/M/G é sacola e nunca deve substituir a identificação numérica destas caixas.",
      truth_class: FACT, source_status: "PROVEN_CURRENT_HUMAN_RULE", source_refs: currentRefs
    });
    if (claims["BAG-002"]) Object.assign(claims["BAG-002"], {
      teach: "Quantidade total, presença de uma caixa 1.500/1.600 ou um corte fixo de oito itens não provam, sozinhos, a necessidade de outra sacola.",
      detail: "P/M/G identifica a sacola. Observe capacidade, temperatura e estabilidade e aplique apenas os gatilhos específicos comprovados.",
      truth_class: FACT, source_status: "PROVEN_OPERATIONAL_DOCUMENT", source_refs: ["PACKAGING-V0"]
    });

    if (data.boxes && Array.isArray(data.boxes.rules)) {
      var retained = data.boxes.rules.filter(function (rule) {
        return !/^BOX-(?:D|E)/.test(String(rule.id || ""));
      });
      data.boxes.rules = retained.concat([
        { id: "BOX-D1", family: "duplas", quantity: "1 dupla/Dyo", box: "240", zone: null, proven: true },
        { id: "BOX-D23", family: "duplas", quantity: "2–3 duplas/Dyo", box: "450", zone: null, proven: true },
        { id: "BOX-D45", family: "duplas", quantity: "4–5 duplas/Dyo", box: "750", zone: null, proven: true },
        { id: "BOX-D6", family: "duplas", quantity: "6 ou mais duplas/Dyo", box: "1500", zone: null, proven: true },
        { id: "BOX-E1", family: "enrolados", quantity: "1 enrolado", box: "450", zone: null, proven: true },
        { id: "BOX-E2", family: "enrolados", quantity: "2 enrolados", box: "750", zone: null, proven: true },
        { id: "BOX-E3", family: "enrolados", quantity: "3 ou mais enrolados", box: "1500", zone: null, proven: true }
      ]);
    }

    if (data.kits) {
      data.kits.updated_at = "2026-09-22";
      data.kits.source_refs = Array.from(new Set([...(data.kits.source_refs || []), "HUMAN-CURRENT"]));
      data.kits.components = data.kits.components || { items: [], claim_ids: [] };
      data.kits.components.claim_ids = Array.from(new Set([...(data.kits.components.claim_ids || []), "KIT-006"]));
      var componentItems = Array.isArray(data.kits.components.items) ? data.kits.components.items : [];
      var hashiComponent = componentItems.find(function (item) { return item.name === "hashi"; });
      if (hashiComponent) hashiComponent.teaches = "Presente nos cinco kits de sushi/quente/kids; não integra o Kit Sobremesa.";
      var napkinComponent = componentItems.find(function (item) { return item.name === "guardanapo"; });
      if (napkinComponent) napkinComponent.teaches = "Presente nos seis kits vigentes, inclusive no Kit Sobremesa.";
      if (!componentItems.some(function (item) { return item.name === "colher de sobremesa"; })) {
        componentItems.push({ name:"colher de sobremesa", glyph:"◒", teaches:"Somente no Kit Sobremesa.", status:"PROVEN_CURRENT_HUMAN_RULE", source_refs:["HUMAN-CURRENT"] });
      }
      data.kits.components.items = componentItems;
      data.kits.completeness = {
        status:"COMPLETE_CURRENT_HUMAN_SET", kit_count:6, is_complete_set:true,
        source_refs:["HUMAN-CURRENT"], assignment_only_count:0,
        note:"Os seis kits vigentes têm composição humana declarada. Kit Sobremesa = 1 colher de sobremesa + 1 guardanapo."
      };
      var dessertKit = {
        id:"sobremesa", name:"Kit Sobremesa",
        components:[{name:"colher de sobremesa",quantity:1},{name:"guardanapo",quantity:1}],
        why:"Vai em cada sobremesa que precisa de colher. Mochi, Choux e cookies não levam Kit Sobremesa.",
        why_source_refs:["HUMAN-CURRENT"]
      };
      data.kits.items = Array.isArray(data.kits.items) ? data.kits.items : [];
      var dessertKitIndex = data.kits.items.findIndex(function (item) { return item.id === "sobremesa"; });
      if (dessertKitIndex >= 0) data.kits.items[dessertKitIndex] = dessertKit; else data.kits.items.push(dessertKit);
      data.kits.assignment_only_kits = [];
      data.kits.assignment_rule = {
        status: "CERTIFIED_CURRENT_HUMAN_RULE_WITH_BOUNDED_INFERENCE",
        source_refs: ["HUMAN-CURRENT"],
        declared_at: "2026-09-22",
        declared_by: "César",
        principle: "Pensar em quantas pessoas vao comer e quanto shoyu o pedido precisa. Garrafinha = 50 ml; sache = 8 ml. Usar o menor conjunto de kits que cubra os dois.",
        direct_rules: [
          "Combinados seguem as pessoas declaradas.",
          "Itens frios avulsos seguem faixas proprias por familia; nao existe uma faixa universal de pecas.",
          "Quentes cobrem pratos principais e permitem compartilhar entradas: max(pratos, ceil(total quente/2)).",
          "Kit Sobremesa: 1 por sobremesa que precisa de colher; composição = 1 colher de sobremesa + 1 guardanapo; Mochi, Choux e cookies nao usam.",
          "Generalizacao fora dos casos julgados permanece INFERENCE ou UNKNOWN."
        ],
        judged_examples: [{"order":"2 enrolados","right":["1x Kit p/1"],"why":"Dois enrolados cobrem aproximadamente uma pessoa e pedem mais shoyu que um Kit Simples."},{"order":"1 Shimeji + 1 Uramaki","right":["1x Kit p/1"],"why":"A garrafinha de 50 ml cobre melhor esse pedido sem empilhar Kit Quente."},{"order":"Yakisoba + 2 sashimis","right":["1x Kit Quente","1x Kit Simples"],"why":"O quente mantém sua cobertura e dois sashimis ainda ficam na faixa Simples."},{"order":"Combinado 1p + 2 temakis","right":["1x Kit p/1","1x Kit Simples"],"why":"O combinado cobre uma pessoa; os dois temakis excedentes recebem cobertura simples adicional."},{"order":"Combinado Kids + Yakisoba + Dupla de Salmão","right":["1x Kit Kids","1x Kit Quente"],"why":"A dupla é complemento do pedido e não pede um terceiro kit."},{"order":"3 entradas quentes","right":["2x Kit Quente"],"why":"Entradas quentes podem compartilhar um kit a cada duas."},{"order":"4 temakis","right":["1x Kit p/2"],"why":"Quatro temakis já representam cobertura de duas pessoas."}],
        shoyu_capacity_ml: { garrafinha: 50, sache: 8 },
        source_document: "content-source/human-current/kits_2026-09-22_cesar.md",
        how_to_decide: "Primeiro pense em quantas pessoas vão comer. Depois veja quanto shoyu o pedido precisa. Use o menor conjunto de kits que cubra os dois.",
        how_to_decide_source: "César · correção humana 22/09/2026.",
        engine: "lib/packaging-current.js · kitVerdict()"
      };
    }

    [data.questions, data.mastery_questions].forEach(function (bank) {
      (bank || []).forEach(function (question) {
        patchQuestion(question, QUESTION_PATCHES[question.id]);
        sanitizeLegacyQuestionText(question);
      });
    });

    if (data.meta) {
      data.meta.packaging_truth_revision = "2026-09-27-station-first-packing-and-min-bag";
    }

    var stale = staleInternalBoxLanguage(data);
    if (stale.length) {
      throw new Error("PACKAGING_TRUTH_STALE_PMG_BOX:" + stale.slice(0, 8).join(","));
    }
    return data;
  }

  function hasStalePmgBoxLanguage(text) {
    var value = String(text || "")
      .replace(/\bnão existe caixa P\/M\/G\b/gi, "")
      .replace(/\bP\/M\/G é sacola, não caixa\b/gi, "");
    return /\bcaixas?(?:\s+internas?)?\s+[PMG]\b/i.test(value)
      || /\b(?:usa|usam)\s+[PMG]\b/i.test(value)
      || /\b\d(?:[^.;]{0,24})=[PMG]\b/i.test(value)
      || /\bG→duas\s+sacolas\b/i.test(value);
  }

  function staleInternalBoxLanguage(data) {
    var stale = [];
    (data.claims || []).forEach(function (claim) {
      var text = [claim.title, claim.teach, claim.detail].filter(Boolean).join(" ");
      if (hasStalePmgBoxLanguage(text)) stale.push("claim:" + claim.id);
    });
    [data.questions, data.mastery_questions].forEach(function (bank) {
      (bank || []).forEach(function (question) {
        var fields = [question.prompt].concat(question.options || [], [question.feedback_correct, question.feedback_wrong]);
        if (hasStalePmgBoxLanguage(fields.filter(Boolean).join(" "))) stale.push("question:" + question.id);
      });
    });
    return stale;
  }

  function installAppDataPatch() {
    if (typeof window === "undefined" || typeof window.fetch !== "function" || window.__tataPackagingTruthFetch) return;
    var nativeFetch = window.fetch.bind(window);
    window.__tataPackagingTruthFetch = true;
    window.fetch = async function (input, init) {
      var response = await nativeFetch(input, init);
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (!/(?:^|\/)data\/app-data\.json(?:$|[?#])/i.test(url) || !response.ok) return response;
      var nativeJson = response.json.bind(response);
      Object.defineProperty(response, "json", {
        configurable: true,
        value: async function () { return patchAppData(await nativeJson()); }
      });
      return response;
    };
  }

  var api = {
    SOURCE: SOURCE,
    CATEGORIES: CATEGORIES,
    RULES: RULES,
    FIXED_BOX: FIXED_BOX,
    BAG_RULES: BAG_RULES,
    SELADA_650: SELADA_650,
    QUENTE_1500: QUENTE_1500,
    DIVERGENCIAS: DIVERGENCIAS,
    categoryOf: categoryOf,
    tempOf: tempOf,
    bandBox: bandBox,
    mixedBandBox: mixedBandBox,
    MIXED_CAPACITY: MIXED_CAPACITY,
    comboBox: comboBox,
    bagVerdict: bagVerdict,
    bagSizeVerdict: bagSizeVerdict,
    kitVerdict: kitVerdict,
    packComanda: packComanda,
    patchAppData: patchAppData,
    staleInternalBoxLanguage: staleInternalBoxLanguage,
    normalize: normalize,
    FACT: FACT,
    UNKNOWN: UNKNOWN
  };

  root.TATAPackaging = api;
  installAppDataPatch();
})(typeof globalThis !== "undefined" ? globalThis : this);
