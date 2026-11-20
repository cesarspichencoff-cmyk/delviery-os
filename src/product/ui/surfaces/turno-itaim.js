import { esc } from "../components/ui.js";

const lista = itens => '<ul class="turno-lista">' + itens.join("") + "</ul>";
const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
const quantidade = n => plural(n, "unidade", "unidades");
const pedidos = n => plural(n, "pedido", "pedidos");
const numero = n => Number(n).toLocaleString("pt-BR");
const hashValido = chave => /^[a-f0-9]{64}$/.test(chave ?? "");

export function identidadeItaim(p) {
  const seq = /^[0-9]{3}$/.test(p.teknisa?.sequencia ?? "") ? p.teknisa.sequencia : "a conferir";
  return 'Teknisa ' + seq + ' · iFood #' + p.codigo + ' · ' + (p.nome_cliente || "Cliente a conferir");
}

export function rotaItaim(rota, params) {
  const query = new URLSearchParams();
  for (const [campo, valor] of Object.entries(params)) if (valor) query.set(campo, valor);
  return "#" + rota + (query.size ? "&" + query.toString() : "");
}

const minutosAtraso = min => min === 0 ? "Prazo recém-vencido" : min + " min de atraso";

function detalhesDaLinha(i) {
  const opcoes = i.opcoes?.length ? '<span class="turno-nota">' + esc(i.opcoes.join(" · ")) + "</span>" : "";
  const notas = (i.observacoes ?? []).map(n => '<span class="turno-nota">' + esc(n.fonte) + " · " + esc(n.texto) + "</span>").join("");
  return opcoes + notas + (i.conferir_observacao ? '<span class="turno-nota">Conferir observação na comanda</span>' : "");
}

export function produtosAtrasados(o, grupos, rota, area, aberto, pedidoAtual) {
  if (!o?.disponivel || o.leitura_velha || !o.previa_por_praca || !o.medicao_itaim)
    return '<p role="status">Sem leitura atual de itens e prazos.</p>';
  const atrasos = new Map(o.medicao_itaim.atrasos.map(a => [a.chave_gestor, a.minutos]));
  const blocos = [];
  for (const grupo of grupos) {
    const produtos = new Map();
    for (const i of grupo.itens) {
      const chave = i.chave_gestor;
      if (i.etapa !== "em preparo" || !atrasos.has(chave) || !i.produto || !Number.isSafeInteger(i.quantidade) || i.quantidade <= 0) continue;
      const pedido = pedidoAtual(o, chave);
      if (pedido?.etapa !== "em preparo") continue;
      const id = JSON.stringify([grupo.praca, i.codigo_produto || null, i.produto]);
      const produto = produtos.get(id) ?? { id, nome: i.produto, unidades: 0, comandas: new Map() };
      const comanda = produto.comandas.get(chave) ?? { pedido, atraso: atrasos.get(chave), unidades: 0, linhas: [] };
      comanda.unidades += i.quantidade;
      comanda.linhas.push(i);
      produto.unidades += i.quantidade;
      produto.comandas.set(chave, comanda);
      produtos.set(id, produto);
    }
    const linhas = [...produtos.values()].sort((a, b) => b.unidades - a.unidades || a.nome.localeCompare(b.nome, "pt-BR")).map(produto => {
      const comandas = [...produto.comandas.values()].sort((a, b) => b.atraso - a.atraso || a.pedido.codigo.localeCompare(b.pedido.codigo));
      const detalhe = comandas.map(c => {
        const href = rotaItaim(rota, { menu: "mapa", area, produto: produto.id, ficha: c.pedido.chave_gestor });
        const variacoes = c.linhas.map(i => {
          const complemento = detalhesDaLinha(i);
          return complemento ? '<div class="turno-variacao">' + esc(quantidade(i.quantidade)) + complemento + "</div>" : "";
        }).join("");
        return '<li><a class="turno-link" href="' + esc(href) + '">' + esc(identidadeItaim(c.pedido)) +
          '</a><span class="turno-nota">' + esc(quantidade(c.unidades) + " · " + minutosAtraso(c.atraso)) + "</span>" + variacoes + "</li>";
      });
      return '<li><details class="turno-produto" id="turno-' + esc(encodeURIComponent(produto.id)) + '"' + (aberto === produto.id ? " open" : "") +
        '><summary><strong>' + esc(produto.unidades) + " × " + esc(produto.nome) + '</strong><span>' +
        esc(pedidos(comandas.length) + " · " + minutosAtraso(comandas[0].atraso)) + "</span></summary>" + lista(detalhe) + "</details></li>";
    });
    if (linhas.length) blocos.push("<section><h3>" + esc(grupo.rotulo) + "</h3>" + lista(linhas) + "</section>");
  }
  const pendente = o.medicao_itaim.atrasos_com_praca_pendente;
  const aviso = pendente ? "<p>Há itens em pedidos atrasados cuja praça ainda precisa ser conferida.</p>" : "";
  return '<p class="turno-legenda">Itens em pedidos atrasados · prazo de preparo do pedido no iFood.</p>' +
    (blocos.join("") || "<p>Nenhum item identificado em pedidos atrasados nesta seleção.</p>") + aviso;
}

export function rankingAtrasados(o, rota, pedidoAtual) {
  function linha(ref, perto) {
    const p = pedidoAtual(o, ref.chave_gestor);
    const quando = perto ? (ref.minutos === 0 ? "Vence agora" : "Vence em " + ref.minutos + " min") : minutosAtraso(ref.minutos);
    const texto = p ? identidadeItaim(p) : "iFood #" + ref.codigo + " · vínculo a conferir";
    const rotulo = p && hashValido(ref.chave_gestor) ? '<a class="turno-link" href="' +
      esc(rotaItaim(rota, {menu:"atrasos", ficha:ref.chave_gestor})) + '">' + esc(texto) + "</a>" : esc(texto);
    return "<li><strong>" + esc(quando) + "</strong> " + rotulo + "</li>";
  }
  const m = o.medicao_itaim;
  const atrasados = [...m.atrasos].sort((a, b) => b.minutos - a.minutos || a.codigo.localeCompare(b.codigo));
  const perto = m.perto_do_prazo ?? [];
  return (atrasados.length ? '<ol class="turno-lista">' + atrasados.map(a => linha(a,false)).join("") + "</ol>" : "<p>Nenhum pedido atrasado nesta leitura.</p>") +
    (perto.length ? '<details class="turno-produto" id="perto-do-prazo"><summary>Perto do prazo · ' + esc(pedidos(perto.length)) + "</summary>" +
      lista(perto.map(a => linha(a,true))) + "</details>" : "");
}

export function mostrarPrevisao(v) {
  if (!v) return "<p>Previsão do turno indisponível nesta leitura.</p>";
  const p = v.plano;
  const hoje = p && p.data === v.dia;
  let plano = "<p>Sem plano publicado para esta data.</p>";
  if (p) {
    const turno = p.turnos_pagina_4;
    const f = v.faixa;
    const totais = p.itens_no_plano;
    const tit = p.data.slice(8,10) + "/" + p.data.slice(5,7);
    const linha = (nome, valor) => "<li><span>" + esc(nome) + "</span><strong>" + esc(valor) + "</strong></li>";
    const faixas = p.faixas_locais_pagina_3.map((nome,i) => linha(nome + "h" + (i === f ? " · agora" : ""), numero(p.itens_ambos_canais_por_faixa[i])));
    const linhasPracas = p.pracas_por_faixa.map(g => {
      const nomes = { "COZINHA · SEMPRE JUNTO":"Cozinha", "QUENTES · JANTAR JUNTO":"Sushi Quentes", "ENROLADOS (ALMOÇO TODOS)":"Enrolados" };
      const nome = nomes[g.praca_no_plano] || g.praca_no_plano;
      const valores = f >= 0 ? numero(g.unidades_por_faixa[f]) : g.unidades_por_faixa.map(numero).join(" · ");
      return linha(nome, valores);
    });
    const grupos = new Map();
    for (const item of p.produtos) {
      const linhas = grupos.get(item.praca_no_plano) ?? [];
      linhas.push(item); grupos.set(item.praca_no_plano, linhas);
    }
    const tabelaItens = [...grupos].map(([grupo, itens]) => {
      const linhas = itens.map(i => linha(i.produto, numero(i.almoco_junto) + " / " + numero(i.jantar_junto ?? ((i.jantar_delivery ?? 0) + (i.jantar_salao ?? 0))) + " / " + numero(i.dia)));
      return '<details class="turno-produto" id="plano-' + esc(encodeURIComponent(grupo)) + '"><summary>' + esc(grupo) + "</summary>" + lista(linhas) + "</details>";
    }).join("");
    plano = "<section><h3>" + (hoje ? "Plano de " : "Próximo plano · ") + esc(tit) + "</h3><p><strong>" +
      esc(numero(p.pedidos_ifood_pagina_2.recebido)) + " pedidos iFood</strong> · " + esc(p.pedidos_ifood_pagina_2.almoco) + " no almoço e " + esc(p.pedidos_ifood_pagina_2.jantar) +
      " no jantar. Cenário alternativo do feriado · " + esc(p.pedidos_ifood_pagina_2.alternativo_feriado) + " pedidos.</p><p>" + esc(numero(totais.delivery)) +
      " itens de delivery + " + esc(numero(totais.salao_cenario_estimado)) + " do cenário de salão = <strong>" + esc(numero(totais.ambos)) +
      " itens comerciais</strong>.</p><details class=\"turno-produto\" id=\"plano-faixas\"><summary>Volume por faixa e praça" +
      (f >= 0 ? " · " + esc(p.faixas_locais_pagina_3[f]) + "h" : "") + "</summary><p>Delivery e salão · " + esc(numero(turno.almoco.total)) + " itens no almoço e " +
      esc(numero(turno.jantar.total)) + " no jantar.</p>" + lista(faixas) + "<h4>" + (f >= 0 ? "Praças nesta faixa" : "Praças nas cinco faixas, na ordem acima") +
      "</h4>" + lista(linhasPracas) + "<p>No almoço, os quentes do Sushi estão incluídos em Enrolados.</p></details>" +
      '<details class="turno-produto" id="plano-itens"><summary>Produtos por turno · ' + esc(p.produtos.length) + '</summary><p>Unidades de almoço / jantar / dia dos dois canais.</p>' +
      tabelaItens + "</details></section>";
  }
  const ritmo = v.ritmo ? "<p>Se o ritmo dos últimos 30 min continuar (" + esc(pedidos(v.ritmo.ultimos_30)) +
    "), a projeção é de cerca de <strong>" + esc(pedidos(v.ritmo.proximos_15)) + " iFood nos próximos 15 min</strong>.</p>" :
    "<p>O ritmo dos próximos 15 min precisa de uma janela recente de chegadas no mesmo serviço.</p>";
  const prazo = v.janela_atual ? "<p>" + esc(pedidos(v.recebidos_na_janela_do_dia)) + " do dia visíveis no Gestor · " +
    esc(v.em_preparo) + " em preparo · " + esc(v.perto_do_prazo) + " com prazo nos próximos 15 min.</p>" +
    (v.prazo_por_praca.length ? "<h4>Conferir antes de vencer</h4>" + lista(v.prazo_por_praca.map(g => "<li>" + esc(g.rotulo) + " · " +
      esc(quantidade(g.unidades) + " em " + pedidos(g.pedidos)) + "</li>")) : "") : "<p>Sem leitura atual da fila.</p>";
  return '<div class="turno-previsao">' + plano + "<section><h3>Ritmo do iFood · " + esc(v.dia.slice(8) + "/" + v.dia.slice(5,7) + " às " + v.hora) +
    "</h3>" + prazo + ritmo + "<p class=\"turno-legenda\">A janela recente do Gestor cobre parte do delivery. Os prazos são dos pedidos.</p></section></div>";
}
