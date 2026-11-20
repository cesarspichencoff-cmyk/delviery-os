import { esc } from "../components/ui.js";

const lista = itens => '<ul class="turno-lista">' + itens.join("") + "</ul>";
const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
const quantidade = n => plural(n, "unidade", "unidades");
const pedidos = n => plural(n, "pedido", "pedidos");
const numero = n => Number(n).toLocaleString("pt-BR");
const hashValido = chave => /^[a-f0-9]{64}$/.test(chave ?? "");
const emPedidosAtrasados = n => "em " + n + " " + (n === 1 ? "pedido atrasado" : "pedidos atrasados");
/** Hora de São Paulo (sem horário de verão desde 2019), como o servidor. */
const horaSP = iso => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? new Date(t - 3 * 3600_000).toISOString().slice(11, 16) : null; };

/** Prazo que já vira ação agora; horizonte do "o que pode apertar". */
export const JANELA_ACAO_MIN = 5;
export const JANELA_APERTO_MIN = 15;
/** Pronto sem coleta por mais que isto vira ação da expedição. */
export const PRONTO_PARADO_MIN = 10;

export function sequenciaTeknisa(p) {
  return /^[0-9]{3}$/.test(p?.teknisa?.sequencia ?? "") ? p.teknisa.sequencia : null;
}

export function identidadeItaim(p) {
  const seq = sequenciaTeknisa(p) ?? "a conferir";
  return 'Teknisa ' + seq + ' · iFood #' + p.codigo + ' · ' + (p.nome_cliente || "Cliente a conferir");
}
const comandaCurta = p => "Teknisa " + (sequenciaTeknisa(p) ?? "a conferir") + " · iFood #" + p.codigo;

export function rotaItaim(rota, params) {
  const query = new URLSearchParams();
  for (const [campo, valor] of Object.entries(params)) if (valor) query.set(campo, valor);
  return "#" + rota + (query.size ? "&" + query.toString() : "");
}

const minutosAtraso = min => min === 0 ? "Prazo recém-vencido" : min + " min de atraso";
const quandoVence = c => c.minutos === 0 ? "vence agora" : c.prazo ? "vence às " + c.prazo + " (em " + c.minutos + " min)" : "vence em " + c.minutos + " min";

function detalhesDaLinha(i) {
  const opcoes = i.opcoes?.length ? '<span class="turno-nota">' + esc(i.opcoes.join(" · ")) + "</span>" : "";
  const notas = (i.observacoes ?? []).map(n => '<span class="turno-obs">' + esc(n.texto) + ' <small>(' + esc(n.fonte) + ')</small></span>').join("");
  return opcoes + notas + (i.conferir_observacao ? '<span class="turno-nota">Conferir observação na comanda</span>' : "");
}

/**
 * Trabalho de uma seleção de praças, por produto e por comanda, em dois recortes que NÃO se misturam:
 * itens em pedidos já vencidos e itens em pedidos que vencem nos próximos 15 min. O prazo é o de
 * preparo que a loja informou ao iFood, por pedido; nunca se afirma que a praça atrasou. Só entra
 * pedido em preparo com identidade única na leitura; pronto e cancelado ficam fora.
 */
export function trabalhoDasPracas(o, grupos, pedidoAtual) {
  if (!o?.disponivel || o.leitura_velha || !o.previa_por_praca || !o.medicao_itaim) return null;
  const atrasos = new Map(o.medicao_itaim.atrasos.map(a => [a.chave_gestor, a.minutos]));
  const recortes = { atrasados: new Map(), vencendo: new Map() };
  for (const grupo of grupos) for (const i of grupo.itens) {
    const chave = i.chave_gestor;
    if (i.etapa !== "em preparo" || !i.produto || !Number.isSafeInteger(i.quantidade) || i.quantidade <= 0) continue;
    const pedido = pedidoAtual(o, chave);
    if (pedido?.etapa !== "em preparo") continue;
    const faltam = pedido.preparo?.faltam_min;
    const recorte = atrasos.has(chave) ? "atrasados" : faltam != null && faltam >= 0 && faltam <= JANELA_APERTO_MIN ? "vencendo" : null;
    if (!recorte) continue;
    const minutos = recorte === "atrasados" ? atrasos.get(chave) : faltam;
    const id = JSON.stringify([grupo.praca, i.codigo_produto || null, i.produto]);
    const mapa = recortes[recorte];
    const produto = mapa.get(id) ?? { id, praca: grupo.praca, rotulo_praca: grupo.rotulo, nome: i.produto, unidades: 0, comandas: new Map() };
    const comanda = produto.comandas.get(chave) ?? { pedido, minutos, prazo: pedido.preparo?.prazo ?? null, unidades: 0, linhas: [] };
    comanda.unidades += i.quantidade;
    comanda.linhas.push(i);
    produto.unidades += i.quantidade;
    produto.comandas.set(chave, comanda);
    mapa.set(id, produto);
  }
  const resumo = (mapa, piorPrimeiro) => {
    const ordem = piorPrimeiro ? (a, b) => b.minutos - a.minutos || a.pedido.codigo.localeCompare(b.pedido.codigo)
      : (a, b) => a.minutos - b.minutos || a.pedido.codigo.localeCompare(b.pedido.codigo);
    const produtos = [...mapa.values()].map(p => ({ ...p, comandas: [...p.comandas.values()].sort(ordem) }))
      .sort((a, b) => b.unidades - a.unidades || a.nome.localeCompare(b.nome, "pt-BR"));
    const comandas = new Map();
    for (const p of produtos) for (const c of p.comandas) comandas.set(c.pedido.chave_gestor, c);
    const todas = [...comandas.values()].sort(ordem);
    return { produtos, comandas: todas, unidades: produtos.reduce((s, p) => s + p.unidades, 0), pedidos: todas.length,
      minutos: todas.length ? todas[0].minutos : null, prazo: todas[0]?.prazo ?? null };
  };
  return { atrasados: resumo(recortes.atrasados, true), vencendo: resumo(recortes.vencendo, false) };
}

function linhaDaComanda(c, produto, rota, area, recorte) {
  const p = c.pedido;
  const href = rotaItaim(rota, { menu: "mapa", area, produto: produto.id, ficha: p.chave_gestor });
  const quando = recorte === "atrasados" ? minutosAtraso(c.minutos) : quandoVence(c);
  const variacoes = c.linhas.length === 1 ? detalhesDaLinha(c.linhas[0])
    : c.linhas.map(i => '<div class="turno-variacao">' + esc(quantidade(i.quantidade)) + (detalhesDaLinha(i) || '<span class="turno-nota">sem observação</span>') + "</div>").join("");
  return '<li class="turno-comanda"><a class="turno-link" href="' + esc(href) + '"><strong>' + esc(c.unidades) + "</strong> para " +
    esc(p.nome_cliente || "cliente a conferir") + "</a>" + variacoes + '<span class="turno-nota">' + esc(comandaCurta(p) + " · " + quando) +
    "</span></li>";
}

function listaDeProdutos(r, recorte, rota, area, aberto) {
  return lista(r.produtos.map(produto => {
    const n = produto.comandas.length;
    const cabeca = recorte === "atrasados" ? emPedidosAtrasados(n) + " · pior " + produto.comandas[0].minutos + " min"
      : "em " + pedidos(n) + " · " + quandoVence(produto.comandas[0]);
    return '<li><details class="turno-produto" id="turno-' + esc(encodeURIComponent(produto.id + (recorte === "vencendo" ? "|v" : ""))) + '"' +
      (aberto === produto.id ? " open" : "") + "><summary><strong>" + esc(produto.unidades) + " × " + esc(produto.nome) + "</strong><span>" +
      esc(cabeca) + "</span></summary>" + lista(produto.comandas.map(c => linhaDaComanda(c, produto, rota, area, recorte))) + "</details></li>";
  }));
}

/** Praça (ou ambiente) → produtos → comandas. Primeiro o que já venceu, depois o que vence em 15 min. */
export function produtosAtrasados(o, grupos, rota, area, aberto, pedidoAtual) {
  if (!o?.disponivel || o.leitura_velha || !o.previa_por_praca || !o.medicao_itaim)
    return '<p role="status">Sem leitura atual de itens e prazos.</p>';
  const blocos = [];
  for (const grupo of grupos) {
    const t = trabalhoDasPracas(o, [grupo], pedidoAtual);
    if (!t || (!t.atrasados.unidades && !t.vencendo.unidades)) continue;
    const partes = [];
    if (t.atrasados.unidades) partes.push('<h4 class="turno-recorte">Em pedidos atrasados · ' + esc(plural(t.atrasados.unidades, "item", "itens") + " " +
      emPedidosAtrasados(t.atrasados.pedidos)) + "</h4>" + listaDeProdutos(t.atrasados, "atrasados", rota, area, aberto));
    if (t.vencendo.unidades) partes.push('<h4 class="turno-recorte">Vencem nos próximos 15 min · ' + esc(plural(t.vencendo.unidades, "item", "itens") +
      " em " + pedidos(t.vencendo.pedidos)) + "</h4>" + listaDeProdutos(t.vencendo, "vencendo", rota, area, aberto));
    // Uma praça só (Enrolados, Sushi Quentes...): o título da página já diz qual é.
    blocos.push("<section>" + (grupos.length > 1 ? "<h3>" + esc(grupo.rotulo) + "</h3>" : "") + partes.join("") + "</section>");
  }
  const pendente = o.medicao_itaim.atrasos_com_praca_pendente;
  const aviso = pendente ? "<p>Há itens em pedidos atrasados cuja praça ainda precisa ser conferida na comanda.</p>" : "";
  return '<p class="turno-legenda">Itens em pedidos atrasados · prazo de preparo do pedido no iFood. Prontos e cancelados ficam fora.</p>' +
    (blocos.join("") || "<p>Nenhum item em pedido atrasado nem vencendo nos próximos 15 min nesta seleção.</p>") + aviso;
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

/* ------------------------------------------------------------------ *
 * Agora: onde agir, quem age, o que pode apertar em 15 min.
 * ------------------------------------------------------------------ */

/** Estado da leitura. Velha ou indisponível suspende as ações operacionais: dado parado não vira gargalo. */
export function estadoDosDados(o) {
  if (!o) return { codigo: "indisponivel", rotulo: "Sem leitura", texto: "Leitura do Gestor indisponível nesta resposta.", bloqueia: true, faltas: [] };
  if (!o.disponivel) return { codigo: "indisponivel", rotulo: "Sem leitura", texto: [o.titulo, o.explicacao].filter(Boolean).join(". "), bloqueia: true, faltas: [] };
  const desde = horaSP(o.gravado_em);
  if (o.leitura_velha) return { codigo: "velha", rotulo: "Leitura parada", bloqueia: true, faltas: [],
    texto: "O Gestor não grava" + (o.gravado_ha_min != null ? " há " + o.gravado_ha_min + " min" : "") +
      (desde ? " · últimos dados válidos às " + desde : "") + ". Números do turno suspensos até a leitura voltar." };
  const faltas = [];
  const emProducao = o.pedidos.filter(p => p.ativo && p.chave_gestor && (p.etapa === "em preparo" || p.etapa.startsWith("pronto")));
  if (!o.previa_por_praca || !o.medicao_itaim) faltas.push("Praças e produtos indisponíveis nesta leitura: só a fila do iFood.");
  else {
    const pend = o.previa_por_praca.pendentes.length;
    if (pend) faltas.push(plural(pend, "item", "itens") + " com praça a conferir na comanda");
    const semSeq = emProducao.filter(p => !sequenciaTeknisa(p)).length;
    if (semSeq) faltas.push(pedidos(semSeq) + " sem sequência Teknisa confirmada");
    const semNome = emProducao.filter(p => !p.nome_cliente).length;
    if (semNome) faltas.push(pedidos(semNome) + " sem nome do cliente");
    const obs = o.previa_por_praca.grupos.flatMap(g => g.itens).filter(i => i.conferir_observacao).length;
    if (obs) faltas.push(plural(obs, "observação", "observações") + " a conferir na comanda");
    if (o.medicao_itaim.preparo_sem_prazo) faltas.push(pedidos(o.medicao_itaim.preparo_sem_prazo) + " em preparo sem prazo informado ao iFood");
  }
  const texto = "Gestor gravou há " + (o.gravado_ha_min ?? "?") + " min" + (desde ? " (" + desde + ")" : "") +
    " · cobre os " + pedidos(o.pedidos.length) + " da janela recente do Gestor, não o dia inteiro";
  return { codigo: faltas.length ? "parcial" : "completa", rotulo: faltas.length ? "Dados parciais" : "Dados atuais", texto, bloqueia: false, faltas };
}

/** O que mais o pedido espera fora desta praça: é o que diz se cobrar uma praça destrava o pedido inteiro. */
function outrasPracasDoPedido(o, chave, praca) {
  const outras = [];
  for (const g of o.previa_por_praca.grupos) {
    if (g.praca === praca) continue;
    const linhas = g.itens.filter(i => i.chave_gestor === chave && i.etapa === "em preparo");
    if (linhas.length) outras.push(g.rotulo + " (" + linhas.map(i => i.quantidade + " × " + i.produto).join(", ") + ")");
  }
  if (o.previa_por_praca.pendentes.some(i => i.chave_gestor === chave)) outras.push("itens com praça a conferir");
  return outras;
}

const PRACAS_DO_PLANO = { "ENROLADOS (ALMOÇO TODOS)": "enrolados", "DUPLAS": "duplas", "COMBINADOS": "combinados",
  "COZINHA · SEMPRE JUNTO": "cozinha_quentes", "QUENTES · JANTAR JUNTO": "enrolados_quentes", "MONTAGEM": "montagem_outros",
  "BAR": "bar_bebidas", "SOBREMESA": "sobremesa" };
const DURACAO_DAS_FAIXAS_MIN = [120, 120, 120, 120, 60];

/** Plano V77 da faixa atual, por praça, convertido para "a cada 15 min". Dois canais: nunca vira desvio contra a fila do iFood. */
export function planoDaFaixa(previsao) {
  const p = previsao?.plano;
  const f = previsao?.faixa;
  if (!p || p.data !== previsao.dia || !(f >= 0)) return null;
  const blocos = DURACAO_DAS_FAIXAS_MIN[f] / 15;
  const porPraca = new Map();
  for (const g of p.pracas_por_faixa) {
    const id = PRACAS_DO_PLANO[g.praca_no_plano];
    const v = g.unidades_por_faixa[f];
    if (id && Number.isFinite(v)) porPraca.set(id, { faixa: v, por_15: Math.round(v / blocos) });
  }
  return { faixa: p.faixas_locais_pagina_3[f], itens: p.itens_ambos_canais_por_faixa[f], por_15: Math.round(p.itens_ambos_canais_por_faixa[f] / blocos), porPraca };
}

const ORDEM_DAS_ACOES = "Ordem: pedidos já vencidos (maior atraso, depois mais unidades); entregador esperando na loja; aceite pendente; prazo nos próximos 5 min; pronto parado; montagem; dados a conferir.";

/**
 * As decisões do turno, sobre a mesma leitura que a tela mostra. Puro: recebe a operação, a previsão e
 * o resolvedor de identidade; devolve ações (seis perguntas cada), equipe e aperto de 15 min.
 */
export function decidirTurno(o, previsao, pedidoAtual) {
  const dados = estadoDosDados(o);
  if (dados.bloqueia) {
    return { dados, ordem: ORDEM_DAS_ACOES, equipe: [], aperto: null, acoes: [{
      tipo: "fonte", titulo: dados.codigo === "velha" ? "Leitura do Gestor parada" : "Leitura do Gestor indisponível",
      porque: dados.texto, quem: "Caixa · confirmar que o Gestor de Pedidos está aberto e gravando",
      ate: "Antes de cobrar qualquer praça", encerra: "Sai quando o Gestor voltar a gravar (menos de 20 min).", destino: { menu: "fontes" } }] };
  }
  const grupos = o.previa_por_praca?.grupos ?? [];
  const porPraca = o.medicao_itaim ? grupos.map(g => ({ g, t: trabalhoDasPracas(o, [g], pedidoAtual) })).filter(x => x.t) : [];
  const plano = planoDaFaixa(previsao);
  const acoes = [];
  const ativos = o.pedidos.filter(p => p.ativo && p.chave_gestor);

  for (const { g, t } of porPraca) {
    const a = t.atrasados;
    if (!a.unidades) continue;
    const top = a.produtos[0];
    const outros = a.unidades - top.unidades;
    const destrava = a.comandas.map(c => {
      const fora = outrasPracasDoPedido(o, c.pedido.chave_gestor, g.praca);
      return comandaCurta(c.pedido) + (fora.length ? " também espera " + fora.join(" e ") : " só depende de " + g.rotulo);
    });
    acoes.push({ tipo: "atraso", prioridade: 1, minutos: a.minutos, unidades: a.unidades,
      titulo: g.rotulo + " · " + top.unidades + " × " + top.nome + " " + emPedidosAtrasados(top.comandas.length) +
        (outros ? " + " + plural(outros, "outro item", "outros itens") : ""),
      porque: "Prazo de preparo informado ao iFood vencido: " + a.comandas.slice(0, 3).map(c => comandaCurta(c.pedido) + " há " + c.minutos + " min").join("; ") +
        (a.comandas.length > 3 ? "; e mais " + pedidos(a.comandas.length - 3) : "") + ".",
      quem: "Responsável por " + g.rotulo, ate: "Já vencido · pior " + a.minutos + " min",
      encerra: "Sai quando esses pedidos ficarem prontos ou forem cancelados no iFood.",
      destrava: a.comandas.length > 1 || destrava.some(d => d.includes("também espera")) ? destrava : [],
      destino: { menu: "mapa", area: g.praca, produto: top.id } });
  }
  const prontos = ativos.filter(p => p.etapa.startsWith("pronto"));
  const naLoja = prontos.filter(p => p.etapa === "pronto · entregador na loja");
  if (naLoja.length) acoes.push({ tipo: "expedicao", prioridade: 2, unidades: naLoja.length,
    titulo: "Expedição · entregar " + pedidos(naLoja.length) + " com entregador na loja",
    porque: "O iFood registrou o pedido pronto e o entregador na loja: " + naLoja.map(p => comandaCurta(p) + (p.pronto_ha_min != null ? " pronto há " + p.pronto_ha_min + " min" : "")).join("; ") + ".",
    quem: "Expedição", ate: "Agora", encerra: "Sai quando o iFood registrar a coleta.", destino: { menu: "rua" } });
  const aguardando = ativos.filter(p => p.etapa === "aguardando aceite");
  if (aguardando.length) acoes.push({ tipo: "aceite", prioridade: 3, unidades: aguardando.length,
    titulo: "Caixa · " + pedidos(aguardando.length) + " aguardando aceite",
    porque: "Pedido recebido sem aceite no Gestor há até " + Math.max(...aguardando.map(p => p.minutos)) + " min.",
    quem: "Caixa", ate: "Agora", encerra: "Sai quando o pedido for aceito ou cancelado.", destino: { menu: "fila" } });
  for (const { g, t } of porPraca) {
    const urgentes = t.vencendo.comandas.filter(c => c.minutos <= JANELA_ACAO_MIN);
    if (!urgentes.length) continue;
    const chaves = new Set(urgentes.map(c => c.pedido.chave_gestor));
    const produtos = t.vencendo.produtos.map(p => ({ ...p, comandas: p.comandas.filter(c => chaves.has(c.pedido.chave_gestor)) }))
      .map(p => ({ ...p, unidades: p.comandas.reduce((s, c) => s + c.unidades, 0) })).filter(p => p.unidades).sort((a, b) => b.unidades - a.unidades);
    const top = produtos[0];
    const primeiro = urgentes[0];
    acoes.push({ tipo: "prazo", prioridade: 4, minutos: -primeiro.minutos, unidades: produtos.reduce((s, p) => s + p.unidades, 0),
      titulo: g.rotulo + " · " + top.unidades + " × " + top.nome + " " + (primeiro.minutos === 0 ? "vencem agora" : "vencem em " + primeiro.minutos + " min"),
      porque: "Prazo de preparo informado ao iFood: " + urgentes.map(c => comandaCurta(c.pedido) + " " + quandoVence(c)).join("; ") + ".",
      quem: "Responsável por " + g.rotulo, ate: primeiro.prazo ?? "próximos 5 min",
      encerra: "Sai quando o pedido ficar pronto; se vencer, vira atraso.", destrava: [],
      destino: { menu: "mapa", area: g.praca, produto: top.id } });
  }
  const parados = prontos.filter(p => !naLoja.includes(p) && p.pronto_ha_min != null && p.pronto_ha_min >= PRONTO_PARADO_MIN);
  if (parados.length) acoes.push({ tipo: "expedicao", prioridade: 5, unidades: parados.length,
    titulo: "Expedição · " + pedidos(parados.length) + " pronto" + (parados.length === 1 ? "" : "s") + " há " + Math.max(...parados.map(p => p.pronto_ha_min)) + " min sem coleta",
    porque: "Pronto no iFood sem coleta registrada: " + parados.map(p => comandaCurta(p) + " há " + p.pronto_ha_min + " min · " + p.etapa).join("; ") + ".",
    quem: "Expedição", ate: "Agora", encerra: "Sai quando o iFood registrar a coleta.", destino: { menu: "rua" } });
  const sacolas = (o.medicao_itaim?.duas_sacolas ?? []).filter(s => s.etapa.startsWith("pronto") && pedidoAtual(o, s.chave_gestor));
  if (sacolas.length) acoes.push({ tipo: "montagem", prioridade: 6, unidades: sacolas.length,
    titulo: "Conferência · separar sacolas em " + pedidos(sacolas.length) + " pronto" + (sacolas.length === 1 ? "" : "s"),
    porque: sacolas.map(s => comandaCurta(pedidoAtual(o, s.chave_gestor)) + ": " + s.motivos.join(", ")).join("; ") + ".",
    quem: "Conferência", ate: "Antes da coleta", encerra: "Sai quando o iFood registrar a coleta.", destino: { menu: "sacolas" } });
  const pendentes = o.medicao_itaim?.atrasos_com_praca_pendente ?? 0;
  if (pendentes) acoes.push({ tipo: "dados", prioridade: 7, unidades: pendentes,
    titulo: "Caixa · conferir a composição de " + pedidos(pendentes) + " atrasado" + (pendentes === 1 ? "" : "s"),
    porque: "Itens sem praça confirmada na revisão da comanda: não dá para dizer qual praça cobrar.",
    quem: "Caixa", ate: "Agora", encerra: "Sai quando a comanda tiver praça confirmada ou o pedido ficar pronto.", destino: { menu: "composicao" } });
  acoes.sort((a, b) => a.prioridade - b.prioridade || (b.minutos ?? 0) - (a.minutos ?? 0) || b.unidades - a.unidades);

  // Quem precisa agir: só quem tem trabalho nesta leitura; o resto fica dito em uma linha.
  const equipe = [];
  for (const { g, t } of porPraca) {
    const linhas = [];
    if (t.atrasados.unidades) linhas.push(plural(t.atrasados.unidades, "item", "itens") + " " + emPedidosAtrasados(t.atrasados.pedidos) + " · pior " + t.atrasados.minutos + " min");
    if (t.vencendo.unidades) linhas.push(plural(t.vencendo.unidades, "item", "itens") + " vencem até " + (t.vencendo.comandas.at(-1).prazo ?? "15 min") + " · " + pedidos(t.vencendo.pedidos));
    if (linhas.length) equipe.push({ id: g.praca, rotulo: g.rotulo, linhas, gravidade: t.atrasados.unidades ? 2 : 1, minutos: t.atrasados.minutos ?? -1, destino: { menu: "mapa", area: g.praca } });
  }
  if (aguardando.length || pendentes) equipe.push({ id: "caixa", rotulo: "Caixa", gravidade: aguardando.length ? 2 : 1, minutos: -1, destino: { menu: "fila" },
    linhas: [aguardando.length ? pedidos(aguardando.length) + " aguardando aceite" : "", pendentes ? pedidos(pendentes) + " com composição a conferir" : ""].filter(Boolean) });
  const sacolasTodas = o.medicao_itaim?.duas_sacolas ?? [];
  if (sacolasTodas.length) equipe.push({ id: "conferencia", rotulo: "Conferência", gravidade: sacolas.length ? 2 : 1, minutos: -1, destino: { menu: "sacolas" },
    linhas: [pedidos(sacolasTodas.length) + " com 2 ou mais sacolas" + (sacolas.length ? " · " + sacolas.length + " já pronto" + (sacolas.length === 1 ? "" : "s") : "")] });
  if (prontos.length) equipe.push({ id: "expedicao", rotulo: "Expedição", gravidade: naLoja.length || parados.length ? 2 : 1, minutos: -1, destino: { menu: "rua" },
    linhas: [pedidos(prontos.length) + " pronto" + (prontos.length === 1 ? "" : "s") + " aguardando saída" + (naLoja.length ? " · " + naLoja.length + " com entregador na loja" : "")] });
  equipe.sort((a, b) => b.gravidade - a.gravidade || b.minutos - a.minutos);

  // O que pode apertar: vencimentos dos próximos 15 min por praça + plano da faixa + ritmo do iFood.
  const vencendo = porPraca.filter(x => x.t.vencendo.unidades).map(({ g, t }) => {
    const top = t.vencendo.produtos[0];
    return { id: g.praca, rotulo: g.rotulo, unidades: t.vencendo.unidades, pedidos: t.vencendo.pedidos, primeiro: t.vencendo.minutos,
      texto: g.rotulo + " · " + top.unidades + " × " + top.nome + (t.vencendo.unidades > top.unidades ? " + " + plural(t.vencendo.unidades - top.unidades, "outro item", "outros itens") : "") +
        " em " + pedidos(t.vencendo.pedidos) + " · primeiro " + quandoVence(t.vencendo.comandas[0]),
      destino: { menu: "mapa", area: g.praca } };
  }).sort((a, b) => a.primeiro - b.primeiro);
  const apertos = porPraca.filter(x => x.t.atrasados.unidades).map(({ g, t }) => {
    const p = plano?.porPraca.get(g.praca);
    return g.rotulo + " pode apertar: " + plural(t.atrasados.unidades, "item já vencido", "itens já vencidos") +
      (t.vencendo.unidades ? " e " + plural(t.vencendo.unidades, "vencendo", "vencendo") + " em 15 min" : "") +
      (p ? "; o plano desta faixa prevê cerca de " + p.por_15 + " itens a cada 15 min nos dois canais" : "") + ".";
  });
  const aperto = { vencendo, apertos, plano, ritmo: previsao?.ritmo ?? null, hora: previsao?.hora ?? null };
  return { dados, ordem: ORDEM_DAS_ACOES, acoes, equipe, aperto };
}

function cartaoDaAcao(a, rota) {
  const destrava = a.destrava?.length ? '<p class="turno-nota"><strong>Destrava:</strong> ' + esc(a.destrava.join("; ")) + "</p>" : "";
  return '<li class="turno-acao" data-tipo="' + esc(a.tipo) + '"><a class="turno-link turno-acao__titulo" href="' + esc(rotaItaim(rota, a.destino)) + '">' +
    esc(a.titulo) + "</a><dl class=\"turno-acao__fatos\"><div><dt>Por quê</dt><dd>" + esc(a.porque) + "</dd></div><div><dt>Quem age</dt><dd>" + esc(a.quem) +
    "</dd></div><div><dt>Até</dt><dd>" + esc(a.ate) + "</dd></div><div><dt>Encerra</dt><dd>" + esc(a.encerra) + "</dd></div></dl>" + destrava + "</li>";
}

/** Tela Agora: três perguntas, nesta ordem, acima do mapa. */
export function quadroAgora(d, rota) {
  const faltas = d.dados.faltas.length ? '<details class="turno-produto turno-faltas"><summary>Dados incompletos · ' + esc(d.dados.faltas.length) +
    "</summary>" + lista(d.dados.faltas.map(f => "<li>" + esc(f) + "</li>")) + "</details>" : "";
  const dados = '<div class="turno-dados" data-estado="' + esc(d.dados.codigo) + '" role="status"><strong>' + esc(d.dados.rotulo) + "</strong> · " +
    esc(d.dados.texto) + faltas + "</div>";
  const visiveis = d.acoes.slice(0, 3);
  const demais = d.acoes.slice(3);
  const onde = '<section class="turno-pergunta" aria-labelledby="q-onde"><h3 id="q-onde">Onde agir agora</h3>' +
    (d.acoes.length ? '<ol class="turno-acoes">' + visiveis.map(a => cartaoDaAcao(a, rota)).join("") + "</ol>" +
      (demais.length ? '<details class="turno-produto" id="mais-acoes"><summary>Mais ' + esc(demais.length) + " " + (demais.length === 1 ? "ação" : "ações") +
        '</summary><ol class="turno-acoes">' + demais.map(a => cartaoDaAcao(a, rota)).join("") + "</ol></details>" : "") +
      '<p class="turno-legenda">' + esc(d.ordem) + "</p>"
      : "<p>Nenhum pedido vencido, aceite pendente ou pronto parado nesta leitura.</p>") + "</section>";
  const quem = d.dados.bloqueia ? "" : '<section class="turno-pergunta" aria-labelledby="q-quem"><h3 id="q-quem">Quem precisa agir</h3>' +
    (d.equipe.length ? '<ul class="turno-lista turno-equipe">' + d.equipe.map(e => '<li data-gravidade="' + esc(e.gravidade) + '"><a class="turno-link" href="' +
      esc(rotaItaim(rota, e.destino)) + '"><strong>' + esc(e.rotulo) + "</strong></a>" + e.linhas.map(l => '<span class="turno-nota">' + esc(l) + "</span>").join("") +
      "</li>").join("") + "</ul><p class=\"turno-legenda\">Praças fora da lista não têm item vencido nem vencendo em 15 min nesta leitura.</p>"
      : "<p>Nenhuma praça com item vencido ou vencendo nos próximos 15 min.</p>") + "</section>";
  let aperto = "";
  if (d.aperto) {
    const a = d.aperto;
    const venc = a.vencendo.length ? lista(a.vencendo.map(v => '<li><a class="turno-link" href="' + esc(rotaItaim(rota, v.destino)) + '">' + esc(v.texto) + "</a></li>"))
      : "<p>Nenhum item vence nos próximos 15 min nesta leitura.</p>";
    const plano = a.plano ? "<p>Plano V77 · faixa " + esc(a.plano.faixa) + "h: " + esc(numero(a.plano.itens)) + " itens nos dois canais (cerca de " +
      esc(a.plano.por_15) + " a cada 15 min). O plano soma salão e delivery; a fila vista é só iFood, por isso não há desvio calculado.</p>"
      : "<p>Sem plano para esta faixa (fora das faixas do plano ou sem edição para hoje).</p>";
    const ritmo = a.ritmo ? "<p>iFood: " + esc(pedidos(a.ritmo.ultimos_30)) + " nos últimos 30 min · cerca de <strong>" + esc(pedidos(a.ritmo.proximos_15)) +
      "</strong> nos próximos 15 min se o ritmo continuar.</p>" : "<p>Ritmo dos próximos 15 min não projetado: falta janela recente do Gestor no mesmo serviço.</p>";
    const apertos = a.apertos.length ? lista(a.apertos.map(t => "<li>" + esc(t) + "</li>")) : "";
    aperto = '<section class="turno-pergunta" aria-labelledby="q-aperto"><h3 id="q-aperto">O que pode apertar nos próximos 15 min</h3>' + venc + apertos + plano + ritmo +
      '<p class="turno-legenda">Capacidade das praças não é medida: sem evento de produção, o Copiloto não afirma que uma praça vai atrasar.</p></section>';
  }
  return '<div class="turno-agora">' + dados + onde + quem + aperto + "</div>";
}

/** Expedição: prontos aguardando saída, entregador na loja primeiro, depois o mais antigo. */
export function expedicaoAgora(o, rota, pedidoAtual) {
  if (!o?.disponivel || o.leitura_velha) return '<p role="status">Sem leitura atual da expedição.</p>';
  const sacolas = new Map((o.medicao_itaim?.duas_sacolas ?? []).map(s => [s.chave_gestor, s]));
  const prontos = o.pedidos.filter(p => p.ativo && p.chave_gestor && p.etapa.startsWith("pronto") && pedidoAtual(o, p.chave_gestor))
    .sort((a, b) => Number(b.etapa === "pronto · entregador na loja") - Number(a.etapa === "pronto · entregador na loja") || (b.pronto_ha_min ?? -1) - (a.pronto_ha_min ?? -1));
  if (!prontos.length) return "<p>Nenhum pedido pronto aguardando saída nesta leitura.</p>";
  return '<p class="turno-legenda">Prontos no iFood e ainda sem coleta · entregador na loja primeiro.</p>' + lista(prontos.map(p => {
    const s = sacolas.get(p.chave_gestor);
    const espera = p.pronto_ha_min != null ? "pronto há " + p.pronto_ha_min + " min" : "hora do pronto a conferir";
    const entregador = p.etapa === "pronto · entregador na loja" ? "entregador na loja" : p.etapa === "pronto · entregador a caminho" ? "entregador a caminho"
      : p.modalidade === "retirada" ? "retirada no balcão" : "entregador não registrado no Gestor";
    return '<li><a class="turno-link" href="' + esc(rotaItaim(rota, { menu: "rua", ficha: p.chave_gestor })) + '">' + esc(identidadeItaim(p)) + "</a>" +
      '<span class="turno-nota"><strong>' + esc(espera) + "</strong> · " + esc(entregador) + " · " + esc(p.modalidade) + "</span>" +
      (s ? '<span class="turno-nota">' + esc(s.grupos.length + " sacolas · " + s.motivos.join(", ")) + "</span>" : "") + "</li>";
  }));
}

/** Sacolas: quem separa o quê e por quê, com a identidade completa e os prontos primeiro. */
export function sacolasAgora(o, rota, pedidoAtual) {
  const m = o?.disponivel && !o.leitura_velha ? o.medicao_itaim : null;
  if (!m) return '<p role="status">Sem leitura atual das sacolas.</p>';
  const casos = m.duas_sacolas.map(s => ({ s, p: pedidoAtual(o, s.chave_gestor) })).filter(x => x.p)
    .sort((a, b) => Number(b.p.etapa.startsWith("pronto")) - Number(a.p.etapa.startsWith("pronto")) || (b.p.preparo?.passou_min ?? -1) - (a.p.preparo?.passou_min ?? -1));
  if (!casos.length) return "<p>Nenhuma separação sugerida nesta leitura.</p>";
  const prontos = casos.filter(x => x.p.etapa.startsWith("pronto")).length;
  return "<p><strong>" + esc(pedidos(casos.length)) + " com 2 ou mais sacolas</strong>" + (prontos ? " · " + esc(prontos) + " pronto" + (prontos === 1 ? "" : "s") + " para montar agora" : "") +
    '</p><p class="turno-legenda">Sugestão pelas regras da casa (quente de cozinha separado de frios, bebida grande, 6 latas ou mais). A montagem final é conferida no balcão.</p>' +
    lista(casos.map(({ s, p }) => {
      const etapa = p.etapa === "em preparo" && p.preparo?.passou_min != null ? "em preparo · " + minutosAtraso(p.preparo.passou_min) : p.etapa;
      const grupos = s.grupos.map((g, n) => '<span class="turno-nota"><strong>Sacola ' + (n + 1) + " · " + esc(g.rotulo) + "</strong> · " +
        esc(g.itens.map(i => i.quantidade + " × " + i.produto + (i.opcoes?.length ? " (" + i.opcoes.join(", ") + ")" : "")).join(" · ")) + "</span>").join("");
      const conferir = s.conferir?.length ? '<span class="turno-nota">Encaixe a conferir · ' + esc(s.conferir.map(i => i.quantidade + " × " + i.produto).join(" · ")) + "</span>" : "";
      const parcial = s.composicao_completa === false ? '<span class="turno-nota">Composição parcial: confira os demais itens na comanda.</span>' : "";
      return '<li><a class="turno-link" href="' + esc(rotaItaim(rota, { menu: "sacolas", ficha: p.chave_gestor })) + '">' + esc(identidadeItaim(p)) + "</a>" +
        '<span class="turno-nota">' + esc(etapa + " · motivo: " + s.motivos.join(", ")) + "</span>" + grupos + conferir + parcial + "</li>";
    }));
}

/** Praças: todas as praças do mapa com o trabalho desta leitura; praça sem item é dita, não escondida. */
export function listaDePracas(o, ambientes, rota, pedidoAtual, gruposDaArea) {
  if (!o?.disponivel || o.leitura_velha || !o.previa_por_praca || !o.medicao_itaim) return '<p role="status">Sem leitura atual das praças.</p>';
  const pracas = ambientes.flatMap(a => a.subareas.length ? a.subareas.map(s => ({ ...s, pai: a })) : (["caixa", "conferencia", "motoboy"].includes(a.id) ? [] : [a]));
  return lista(pracas.map(pr => {
    const t = trabalhoDasPracas(o, gruposDaArea(pr), pedidoAtual);
    const linhas = [];
    if (t?.atrasados.unidades) linhas.push(plural(t.atrasados.unidades, "item", "itens") + " " + emPedidosAtrasados(t.atrasados.pedidos) + " · pior " + t.atrasados.minutos + " min");
    if (t?.vencendo.unidades) linhas.push(plural(t.vencendo.unidades, "item", "itens") + " vencem nos próximos 15 min");
    return '<li><a class="turno-link" href="' + esc(rotaItaim(rota, { menu: "mapa", area: pr.id })) + '"><strong>' + esc(pr.rotulo) + "</strong></a>" +
      '<span class="turno-nota">' + esc(linhas.join(" · ") || "Sem item vencido nem vencendo nesta leitura") + "</span></li>";
  }));
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
