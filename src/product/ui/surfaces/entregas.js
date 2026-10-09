/**
 * Superficie ENTREGAS — a rua, lida agora.
 *
 * Ordem da tela = ordem da pergunta de quem responde pela expedicao:
 *   1. a LEITURA DO SERVIDOR: uma frase que conta o que foi visto, a linha de
 *      sinal (confianca e solidez), o que pede conferencia, quem esta na rua,
 *      os aparelhos — cada fato com a IDADE que tinha na hora da leitura;
 *   2. a DEMONSTRACAO, numa faixa propria e recolhida quando ha leitura: ela
 *      ajuda quem avalia a tela e nunca ocupa o lugar da rua;
 *   3. o que a tela nao prova.
 * Sem leitura do servidor, o lugar da rua e do ESTADO TECNICO (linha
 * interrompida), e a demonstracao aparece aberta, depois dele.
 *
 * Regras que nao mudaram: `viagem_id` aparece SEMPRE com o rotulo "Viagem" e
 * nunca no lugar de pedido; ausencia nunca vira zero; nada anima; nenhum
 * botao executa acao — "Atualizar leitura" so pergunta de novo (GET).
 */

import {
  blocoLimitacoes,
  cabecalhoSuperficie,
  campo,
  esc,
  estadoTela,
  inspetor,
  metric,
  selo,
  selos,
  tabela,
} from "../components/ui.js";

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

/* ------------------------------------------------------------------ *
 * Pecas pequenas
 * ------------------------------------------------------------------ */

/** Um instante lido: idade na hora da leitura, hora local, e o ISO como evidencia. */
function tempo(i) {
  if (!i || i.observado !== true) {
    return `<span class="rua__ausente">${selo({
      estado: i && i.motivo === "evidencia_insuficiente" ? "evidencia_insuficiente" : "indisponivel",
      detalhe: i ? i.explicacao : "",
    })}</span>`;
  }
  return `<time datetime="${esc(i.em)}" title="${esc(i.em)}">${esc(i.idade)}</time> <span class="rua__hora">· ${esc(i.hora)}</span>`;
}

/** Marca de evidencia do canon: cheia para o confirmado, vazada para o incompleto. */
function marca(solidez) {
  return `<span class="marca" data-solidez="${esc(solidez)}" aria-hidden="true"></span>`;
}

/**
 * Um campo como valor curto: valor quando observado, ausencia com o seu
 * motivo quando nao — o MESMO selo do resto da tela, nunca um traco.
 */
function celula(c, opcoes = {}) {
  if (!c || c.observado !== true) {
    return selo({ estado: c ? motivoParaEstadoLocal(c.motivo) : "indisponivel", detalhe: c ? c.explicacao : "" });
  }
  const tecnico = opcoes.tecnico ? "campo__valor--tecnico" : "campo__valor";
  return `<span class="${tecnico}">${esc(c.valor)}</span>`;
}

function motivoParaEstadoLocal(motivo) {
  return motivo === "evidencia_insuficiente" ? "evidencia_insuficiente" : "indisponivel";
}

const FRESCOR_LEGIVEL = {
  fresh: "posicao recente",
  aging: "posicao envelhecendo",
  stale: "sem posicao recente",
  unknown: "idade desconhecida",
};

/**
 * A fila offline do APARELHO, como o telefone a relatou (B5). O numero pode
 * ser real e estar velho: a idade do relato vem sempre junto, e o relato
 * antigo ganha selo — ele nao confirma a fila atual.
 */
function celulaFilaOffline(a, x) {
  if (!a.fila_offline || a.fila_offline.observado !== true) {
    return celula(a.fila_offline);
  }
  const pontos = a.fila_offline_pontos?.observado === true ? a.fila_offline_pontos.valor : "?";
  const eventos = a.fila_offline_eventos?.observado === true ? a.fila_offline_eventos.valor : "?";
  const em =
    x && x.fila_relato && x.fila_relato.observado === true
      ? `<time datetime="${esc(x.fila_relato.em)}">${esc(x.fila_relato.hora)}</time> (${esc(x.fila_relato.idade)})`
      : esc(a.fila_offline_reportada_em?.observado === true ? a.fila_offline_reportada_em.valor : "instante nao observado");
  const frescor = a.fila_offline_frescor?.observado === true ? a.fila_offline_frescor.valor : "unknown";
  const aviso =
    frescor === "stale"
      ? selo({ estado: "stale", detalhe: "Relato com mais de 45 minutos. A fila pode ter mudado." })
      : frescor === "aging"
        ? selo({ estado: "parcial", detalhe: "Relato com 30 a 45 minutos. Nao confirma a fila atual." })
        : frescor === "unknown"
          ? selo({ estado: "evidencia_insuficiente", detalhe: "Instante do relato invalido; idade desconhecida." })
          : "";
  return `<span class="campo__valor"><strong>${esc(a.fila_offline.valor)}</strong> pendente(s) no ultimo relato</span>
    <br><span class="campo__valor--tecnico">${esc(pontos)} pontos · ${esc(eventos)} eventos</span>
    <br><span class="campo__rotulo">Ultimo relato do aparelho: ${em}</span>
    ${aviso}`;
}

function fato(rotulo, valor, classe = "") {
  return `<div class="aparelho__fato${classe ? ` ${classe}` : ""}"><dt>${esc(rotulo)}</dt><dd>${valor}</dd></div>`;
}

/* ------------------------------------------------------------------ *
 * Aparelhos
 * ------------------------------------------------------------------ */

function linhaAparelho(a, x) {
  const posicao = x
    ? tempo(x.ultima_posicao)
    : `${celula(a.ultima_posicao_em, { tecnico: true })}`;
  const gps = a.gps && a.gps.observado === true ? `<span class="rua__nota-curta">${esc(FRESCOR_LEGIVEL[a.gps.valor] || a.gps.valor)}</span>` : "";
  return `<li class="aparelho" data-solidez="${esc(x ? x.solidez : "neutra")}">
    <div class="aparelho__nome">
      <p class="aparelho__rotulo">${esc(a.rotulo)}</p>
      <p class="aparelho__id">${esc(a.device_id)} · ${esc(a.unidade)}</p>
      <span class="linha-selos">${selos(a.selos)}</span>
    </div>
    <dl class="aparelho__fatos">
      ${fato("Ultima posicao", `${posicao}${gps ? `<br>${gps}` : ""}`)}
      ${fato("Credencial", celula(a.credencial))}
      ${fato("Ultima sessao", x ? tempo(x.ultima_sessao) : celula(a.ultima_sessao, { tecnico: true }))}
      ${fato("App", celula(a.versao_do_app, { tecnico: true }))}
      ${fato("Fila offline", celulaFilaOffline(a, x), "aparelho__fato--fila")}
    </dl>
  </li>`;
}

/**
 * Quem tem fato vem primeiro, o mais recente no topo. Quem foi autorizado e
 * nunca falou nao some — fica contado num inspetor; revogado tambem.
 */
function grupoAparelhos(lista, extras) {
  const titulo = `<h3 class="rua__grupo-titulo">Aparelhos <span class="rua__conta">${esc(lista.length)}</span></h3>`;
  if (lista.length === 0) {
    return `<div class="rua__grupo" data-grupo="aparelhos">${titulo}${estadoTela(
      "vazio",
      [{ estado: "indisponivel" }],
      "Nenhum aparelho autorizado",
      "O cadastro de aparelhos esta vazio aqui. Isto nao diz que nao ha motoboy na rua — diz que nenhum aparelho foi autorizado a falar com a plataforma.",
    )}</div>`;
  }
  const situacao = (a) => {
    const x = extras.get(a.device_id);
    if (x) return x.situacao;
    if (a.revogado && a.revogado.observado === true && a.revogado.valor === true) return "revogado";
    return a.ultima_posicao_em && a.ultima_posicao_em.observado === true ? "com_lote" : "sem_lote";
  };
  // A mesma ordem das celulas: menos solidez primeiro, e no empate a posicao
  // mais velha. Sem a leitura (view model antigo), a mais recente no topo.
  const ORDEM = { interrompida: 0, pontilhada: 1, tracejada: 2, cheia: 3, neutra: 4 };
  const chave = (a) => {
    const x = extras.get(a.device_id);
    if (x && x.ultima_posicao.observado) return [ORDEM[x.solidez] ?? 4, -x.ultima_posicao.segundos];
    return [4, a.ultima_posicao_em && a.ultima_posicao_em.observado ? -Date.parse(a.ultima_posicao_em.valor) : 0];
  };
  const linhas = (l) => `<ul class="aparelhos">${l.map((a) => linhaAparelho(a, extras.get(a.device_id))).join("")}</ul>`;
  const com = lista
    .filter((a) => situacao(a) === "com_lote")
    .sort((x, y) => {
      const [sx, ix] = chave(x);
      const [sy, iy] = chave(y);
      return sx - sy || ix - iy;
    });
  const sem = lista.filter((a) => situacao(a) === "sem_lote");
  const rev = lista.filter((a) => situacao(a) === "revogado");
  return `<div class="rua__grupo" data-grupo="aparelhos">
    ${titulo}
    ${
      com.length
        ? linhas(com)
        : `<p class="rua__nada">${esc(
            `Ha ${plural(lista.length, "aparelho autorizado", "aparelhos autorizados")} e nenhum lote chegou. Nao afirma que a rua esta parada — afirma que nada foi observado por este caminho.`,
          )}</p>`
    }
    ${sem.length ? inspetor("aparelhos-sem-lote", `${plural(sem.length, "aparelho autorizado", "aparelhos autorizados")} sem nenhum lote`, linhas(sem)) : ""}
    ${rev.length ? inspetor("aparelhos-revogados", plural(rev.length, "aparelho revogado", "aparelhos revogados"), linhas(rev)) : ""}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Viagens
 * ------------------------------------------------------------------ */

function celulaViagem(v) {
  const posicao = v.posicao && v.posicao.observado === true
    ? `posicao ${tempo(v.posicao)}`
    : "nenhuma posicao recebida";
  return `<li class="celula" data-solidez="${esc(v.solidez)}" data-grupo-viagem="${esc(v.grupo)}">
    <p class="celula__viagem"><span class="celula__rotulo">Viagem</span> ${esc(v.viagem_id)}</p>
    <p class="celula__estado">${esc(v.estado_legivel)}</p>
    <p class="celula__posicao">${posicao}</p>
    <p class="celula__aparelho">${esc(v.aparelho || v.device_id || "nenhum aparelho nomeado")} · ${esc(v.unidade)}</p>
    ${v.ocorrencias > 0 ? `<p class="celula__ocorrencia">${esc(plural(v.ocorrencias, "ocorrencia registrada", "ocorrencias registradas"))}</p>` : ""}
    <span class="linha-selos">${selos(v.selos)}</span>
  </li>`;
}

function celulas(lista, classe = "") {
  return `<ul class="celulas${classe ? ` ${classe}` : ""}">${lista.map(celulaViagem).join("")}</ul>`;
}

function grupoNaRua(l) {
  const v = l.viagens;
  let html = `<div class="rua__grupo" data-grupo="na_rua">
    <h3 class="rua__grupo-titulo">Na rua <span class="rua__conta">${esc(v.na_rua.length)}</span></h3>
    ${
      v.na_rua.length
        ? celulas(v.na_rua)
        : `<p class="rua__nada">Nenhuma viagem com saida registrada esta na rua por esta leitura.</p>`
    }
  </div>`;
  if (v.ciclo_desconhecido_com_posicao.length) {
    html += `<div class="rua__grupo" data-grupo="ciclo_desconhecido">
      <h3 class="rua__grupo-titulo">Mandando posicao, sem ciclo de vida conhecido <span class="rua__conta">${esc(v.ciclo_desconhecido_com_posicao.length)}</span></h3>
      <p class="rua__nota">A cadeia canonica traz o GPS; saida e fim da viagem ainda passam pelo piloto. A posicao chega, o estado nao.</p>
      ${celulas(v.ciclo_desconhecido_com_posicao, "celulas--vazadas")}
    </div>`;
  }
  if (v.aguardando_saida.length) {
    html += `<div class="rua__grupo" data-grupo="aguardando_saida">
      <h3 class="rua__grupo-titulo">Aguardando saida <span class="rua__conta">${esc(v.aguardando_saida.length)}</span></h3>
      ${celulas(v.aguardando_saida, "celulas--neutras")}
    </div>`;
  }
  return html;
}

/** Encerradas e sem ciclo conhecido saem da leitura principal: contadas, recolhidas, nunca apagadas. */
function grupoForaDaRua(l) {
  const v = l.viagens;
  const partes = [];
  if (v.encerradas.length) {
    partes.push(inspetor("encerradas", plural(v.encerradas.length, "viagem encerrada", "viagens encerradas"), celulas(v.encerradas, "celulas--neutras")));
  }
  if (v.ciclo_desconhecido_sem_posicao.length) {
    partes.push(
      inspetor(
        "sem-ciclo-sem-posicao",
        `${plural(v.ciclo_desconhecido_sem_posicao.length, "viagem", "viagens")} sem posicao recente e sem ciclo conhecido`,
        `<p class="rua__nota">Podem ter terminado: sem o ciclo de vida, esta leitura nao sabe.</p>${celulas(v.ciclo_desconhecido_sem_posicao, "celulas--vazadas")}`,
      ),
    );
  }
  return `<div class="rua__grupo rua__grupo--recolhido" data-grupo="encerradas">${partes.join("")}</div>`;
}

/* ------------------------------------------------------------------ *
 * Conferencia
 * ------------------------------------------------------------------ */

function itemConferir(c) {
  const evidencia = c.desde && c.desde.observado === true
    ? `<time datetime="${esc(c.desde.em)}">${esc(c.evidencia)}</time>`
    : esc(c.evidencia);
  const modo = c.procedencia
    ? selo({ estado: c.procedencia })
    : `<span class="conferir__modo">modo nao declarado</span>`;
  return `<li class="conferir__item" data-tipo="${esc(c.tipo)}">
    ${marca(c.tipo === "cadastro_incompleto" || c.tipo === "ocorrencia_registrada" ? "cheia" : "pontilhada")}
    <div class="conferir__texto">
      <p class="conferir__titulo">${esc(c.titulo)}</p>
      <p class="conferir__detalhe">${esc(c.detalhe)}</p>
      <p class="conferir__evidencia">${evidencia}</p>
      <p class="conferir__restricao">${esc(c.restricao)}</p>
      <span class="linha-selos">${selo(c.selo)}${modo}</span>
    </div>
  </li>`;
}

function grupoConferir(l) {
  return `<div class="rua__grupo" data-grupo="conferir">
    <h3 class="rua__grupo-titulo">Pede conferencia <span class="rua__conta">${esc(l.conferir.length)}</span></h3>
    ${
      l.conferir.length
        ? `<ol class="conferir">${l.conferir.map(itemConferir).join("")}</ol>`
        : `<p class="rua__nada">Nada pede conferencia nesta leitura.</p>`
    }
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Filtro de unidade — navegacao, nao estado escondido
 * ------------------------------------------------------------------ */

function filtroDeUnidades(l) {
  if (l.unidades.length <= 1 && l.unidade_selecionada === null) return "";
  const total = l.unidades.reduce((n, u) => n + u.aparelhos, 0);
  const item = (href, nome, conta, atual) =>
    `<li><a class="rua__unidade" href="${esc(href)}"${atual ? ' aria-current="true"' : ""}><span class="rua__unidade-nome">${esc(
      nome,
    )}</span><span class="rua__unidade-conta">${esc(conta)}</span></a></li>`;
  return `<nav class="rua__unidades" aria-label="Unidade desta leitura"><ul>${[
    item("#/entregas", "Todas", plural(total, "aparelho", "aparelhos"), l.unidade_selecionada === null),
    ...l.unidades.map((u) =>
      item(
        `#/entregas?unidade=${encodeURIComponent(u.unit_id)}`,
        u.unit_id,
        `${u.viagens_na_rua} na rua · ${plural(u.aparelhos, "aparelho", "aparelhos")}`,
        u.selecionada,
      ),
    ),
  ].join("")}</ul></nav>`;
}

/* ------------------------------------------------------------------ *
 * O territorio da rua
 * ------------------------------------------------------------------ */

function estadoTecnico(l) {
  return `<section class="rua" data-territorio="rua" data-solidez="interrompida" data-envelhecida="nao" aria-labelledby="rua-titulo">
    <p class="rua__eyebrow rua__eyebrow--tecnico"><span class="rua__ponto" aria-hidden="true"></span>${esc(l.eyebrow)}</p>
    <div class="rua__sinal" aria-hidden="true"></div>
    <h2 class="rua__titulo" id="rua-titulo" data-titulo-da-leitura>${esc(l.titulo)}</h2>
    ${l.explicacao ? `<p class="rua__explicacao">${esc(l.explicacao)}</p>` : ""}
    <p class="rua__restricao">${esc(l.restricao)}</p>
    ${l.motivo === "indisponivel" ? `<div class="rua__topo"><button type="button" class="rua__reler" data-reler>Tentar ler de novo</button></div>` : ""}
  </section>`;
}

function grupoQualidade(l) {
  if (!l.qualidade || l.qualidade.length === 0) return "";
  return `<div class="rua__grupo" data-grupo="qualidade">
    <h3 class="rua__grupo-titulo">Qualidade desta leitura</h3>
    <ul class="qualidade">${l.qualidade.map((q) => `<li>${marca("tracejada")}<span>${esc(q)}</span></li>`).join("")}</ul>
  </div>`;
}

function territorioLido(vm, l) {
  const extras = new Map((l.aparelhos || []).map((x) => [x.device_id, x]));
  // Anatomia do canon: camada tecnica, linha de sinal, titulo humano,
  // explicacao, restricao. Os controles (reler, unidade) vem DEPOIS da frase:
  // no celular, a frase chega primeiro.
  return `<section class="rua" data-territorio="rua" data-solidez="${esc(l.solidez)}" data-envelhecida="nao"
      data-fresca-ate-s="${esc(l.janelas.fresca_ate_s)}" data-envelhecendo-ate-s="${esc(l.janelas.envelhecendo_ate_s)}"
      aria-labelledby="rua-titulo">
    <p class="rua__eyebrow"><span class="rua__ponto" aria-hidden="true"></span>Leitura do servidor as ${esc(l.lida_as)} · <span data-idade-da-leitura aria-live="off">lida agora</span></p>
    <div class="rua__sinal" aria-hidden="true"></div>
    <p class="rua__restricao rua__restricao--leitura" data-so-envelhecida>Esta leitura nao e a mais recente. Atualize para ver a rua agora.</p>
    <h2 class="rua__titulo" id="rua-titulo" data-titulo-da-leitura>${esc(l.titulo)}</h2>
    <p class="rua__explicacao">${esc(l.explicacao)}</p>
    ${l.restricao ? `<p class="rua__restricao">${esc(l.restricao)}</p>` : ""}
    <div class="rua__controles">
      <button type="button" class="rua__reler" data-reler>Atualizar leitura</button>
      ${filtroDeUnidades(l)}
    </div>
    ${grupoConferir(l)}
    ${grupoNaRua(l)}
    ${grupoForaDaRua(l)}
    ${grupoAparelhos((vm.realidade && vm.realidade.aparelhos) || [], extras)}
    ${grupoQualidade(l)}
  </section>`;
}

/**
 * View model sem `leitura` (formato anterior a 2026-10-09). A tela continua
 * honesta com o que recebeu: aparelhos e viagens da realidade, sem frase,
 * sem conferencia — nada e calculado aqui.
 */
function territorioLegado(r) {
  if (!r.fonte || r.fonte.observado !== true) {
    const motivo = r.fonte ? r.fonte.motivo : "indisponivel";
    return estadoTecnico({
      eyebrow: motivo === "integracao_pendente" ? "Sem leitura do servidor" : "Leitura indisponivel",
      titulo: motivo === "integracao_pendente" ? "Esta build nao le o banco da plataforma." : "A plataforma nao respondeu a esta leitura.",
      explicacao: r.fonte ? r.fonte.explicacao : "",
      restricao: "Nada nesta tela representa a rua agora.",
      motivo,
    });
  }
  const viagens = (r.viagens || []).map((v) => [
    `<span class="campo__rotulo">Viagem</span> <span class="campo__valor--tecnico">${esc(v.viagem_id)}</span>`,
    esc(v.unidade),
    celula(v.ultima_posicao_em, { tecnico: true }),
    esc(FRESCOR_LEGIVEL[v.frescor] || v.frescor),
    esc(v.estado),
    selo({ estado: v.procedencia }),
  ]);
  return `<section class="rua" data-territorio="rua" data-solidez="neutra" data-envelhecida="nao" aria-labelledby="rua-titulo">
    <p class="rua__eyebrow"><span class="rua__ponto" aria-hidden="true"></span>Leitura do servidor · ${celula(r.lida_em, { tecnico: true })}</p>
    <div class="rua__sinal" aria-hidden="true"></div>
    <h2 class="rua__titulo" id="rua-titulo" data-titulo-da-leitura>O que o servidor da plataforma sustenta</h2>
    ${grupoAparelhos(r.aparelhos || [], new Map())}
    ${
      viagens.length
        ? `<div class="rua__grupo" data-grupo="viagens"><h3 class="rua__grupo-titulo">Viagens com fato no log</h3>${tabela(
            ["Viagem", "Unidade", "Ultima posicao", "Frescor", "Estado", "Procedencia"],
            viagens,
          )}</div>`
        : ""
    }
  </section>`;
}

function territorioDaRua(vm) {
  const l = vm.leitura;
  if (l && l.disponivel === false) return estadoTecnico(l);
  if (!l) return territorioLegado(vm.realidade || {});
  return territorioLido(vm, l);
}

/* ------------------------------------------------------------------ *
 * A demonstracao — faixa propria
 * ------------------------------------------------------------------ */

function subsecao(titulo, sub, corpo) {
  return `<section class="secao"><h3 class="secao__titulo">${esc(titulo)}</h3>${sub ? `<p class="secao__sub">${esc(sub)}</p>` : ""}${corpo}</section>`;
}

function viagemDemo(v) {
  const paradas = v.paradas.filter((p) => p.ativa);
  const linhas = v.paradas.map((p) => [
    `<span class="campo__valor--tecnico">${esc(p.pedido_ref)}</span>`,
    esc(String(p.ordem)),
    esc(p.estado),
    p.ativa
      ? selo({ estado: "real", detalhe: "Parada ativa nesta viagem." })
      : selo({
          estado: "retirado",
          detalhe: "Removida da viagem e preservada no historico.",
        }),
  ]);

  return `<article class="cartao">
    <div class="cartao__topo">
      <div>
        <p class="campo__rotulo">Viagem</p>
        <h4 class="cartao__nome campo__valor--tecnico">${esc(v.viagem_id)}</h4>
      </div>
      <div class="cartao__selos">${selo({ estado: "simulado" })}</div>
    </div>
    <div class="linha-selos">
      <span class="campo__valor">Estado: <strong>${esc(v.estado)}</strong></span>
    </div>
    <div class="grade" data-colunas="2">
      ${campo("Entregador", { observado: true, valor: v.entregador }, { tecnico: true })}
      ${campo("Paradas ativas", { observado: true, valor: paradas.length })}
    </div>
    ${campo("Limite de paradas pela politica", v.limite_paradas)}
    ${inspetor(
      `viagem-${esc(v.viagem_id)}`,
      `Ver as ${v.paradas.length} paradas desta viagem`,
      tabela(["Pedido", "Ordem", "Estado", "Situacao"], linhas),
    )}
  </article>`;
}

function corpoDemonstracao(vm) {
  const corpoViagens =
    vm.viagens.length === 0
      ? estadoTela(
          "vazio",
          [{ estado: "indisponivel" }],
          "Nenhuma viagem nesta leitura",
          "O facade de demonstracao comeca sem viagem montada. Isto nao afirma que a rua esta parada — afirma que nao ha nada montado aqui.",
        )
      : `<div class="grade" data-colunas="2">${vm.viagens.map(viagemDemo).join("")}</div>`;

  const corpoOcorrencias =
    vm.ocorrencias.length === 0
      ? estadoTela("vazio", [{ estado: "indisponivel" }], "Nenhuma ocorrencia registrada", "Nao ha ocorrencia nesta sessao de demonstracao.")
      : `<ul class="lista-operacional">${vm.ocorrencias
          .map(
            (o) =>
              `<li class="fonte-linha">${selo(o.selo)}<span class="fonte-linha__id">${esc(
                o.ocorrencia_id,
              )}</span><span class="campo__valor">${esc(o.relato)}</span></li>`,
          )
          .join("")}</ul>`;

  const d = vm.dispositivo;

  return `
    <div class="metric-strip">
      ${metric("Viagens montadas", { observado: true, valor: vm.viagens.length })}
      ${metric("Ocorrencias", { observado: true, valor: vm.ocorrencias.length })}
      ${metric("Fila desta sessao", vm.fila_da_sessao)}
    </div>
    <p class="secao__sub faixa-demo__nota">A fila desta sessao e do navegador. A fila do APARELHO, quando reportada, aparece na leitura do servidor com horario e idade; o ultimo relato nao confirma o estado atual.</p>

    ${subsecao(
      "Conexao",
      "Offline e sincronizacao pendente sao estados diferentes: no primeiro nao ha rede, no segundo ha rede e ha fila.",
      `<div class="linha-selos">${selo(vm.conexao)}</div>`,
    )}

    ${subsecao(
      "Viagens montadas",
      "Cada cartao e uma VIAGEM. O pedido aparece dentro dela, nas paradas — nunca no lugar da identidade da viagem.",
      corpoViagens,
    )}

    ${subsecao(
      "O aparelho em campo (demonstracao)",
      "A demonstracao nao tem aparelho. A fila REAL do telefone, quando reportada, aparece na leitura do servidor; aqui nada e promovido por inferencia.",
      `<div class="grade" data-colunas="2">
        ${campo("Integridade da credencial", d.credencial)}
        ${campo("GPS", d.gps)}
        ${campo("Ultima sincronizacao", d.ultima_sincronizacao)}
        ${campo("Dispositivo revogado", d.revogado)}
        ${campo("Fila offline do aparelho", d.fila_offline)}
      </div>`,
    )}

    ${subsecao("Ocorrencias", "Ocorrencia que bloqueia disponibilidade exige decisao humana.", corpoOcorrencias)}

    ${subsecao(
      "Ultima recusa do dominio",
      "Recusa de regra e negocio, nao falha de rede. Ela aparece escrita, nao como erro tecnico.",
      `<div class="grade" data-colunas="2">${campo("Ultima recusa", vm.ultimo_erro)}</div>`,
    )}
  `;
}

function faixaDemonstracao(vm, recolhida) {
  const selosDemo = (vm.selos_de_cabecalho || []).filter((s) => s.estado !== "parcial");
  const corpo = corpoDemonstracao(vm);
  return `<section class="faixa-demo" data-territorio="demonstracao" aria-labelledby="demo-titulo">
    <div class="faixa-demo__topo">
      <h2 class="faixa-demo__titulo" id="demo-titulo">Demonstracao em memoria · nada aqui aconteceu</h2>
      <div class="linha-selos">${selos(selosDemo)}</div>
    </div>
    <p class="faixa-demo__texto">O facade de demonstracao fica para quem avalia a tela. Ele nao le o banco da plataforma e nao fala com nenhum aparelho.</p>
    ${recolhida ? inspetor("demonstracao", "Ver a demonstracao", corpo) : `<div class="faixa-demo__corpo">${corpo}</div>`}
  </section>`;
}

/* ------------------------------------------------------------------ *
 * A tela
 * ------------------------------------------------------------------ */

export function telaEntregas(vm) {
  const l = vm.leitura;
  const comLeitura = Boolean(l && l.disponivel === true) || Boolean(!l && vm.realidade && vm.realidade.fonte && vm.realidade.fonte.observado);
  const limitacoes = [
    ...((vm.realidade && vm.realidade.limitacoes) || []),
    ...(l && l.disponivel === true
      ? [
          {
            titulo: "Hora local e idade",
            texto: `Horas no fuso ${l.fuso}. A idade de cada fato e a que ele tinha na hora da leitura; o instante exato fica como evidencia (atributo datetime). A tela nao se atualiza sozinha: ela mostra ha quanto tempo foi lida.`,
          },
        ]
      : []),
    ...(vm.limitacoes || []),
  ];

  return `
    ${cabecalhoSuperficie(
      "Agora · Entregas",
      "Quem esta na rua, com o que, e o que precisa de gente",
      "O que o servidor sabe da rua, a idade de cada fato e o que pede conferencia. O que nao da para saber aparece escrito.",
      l && l.disponivel === true ? l.selos : vm.selos_de_cabecalho,
    )}

    ${territorioDaRua(vm)}

    ${faixaDemonstracao(vm, comLeitura)}

    ${blocoLimitacoes(limitacoes)}
  `;
}
