/**
 * DeliveryOS — HOME OPERACIONAL
 *
 * A primeira tela. Ela responde, de cima para baixo e sem scroll obrigatorio no
 * desktop: como esta a operacao, o que esta acontecendo, o que e mais urgente,
 * por que, o que a equipe pode fazer, o que mais segue ativo, e o que falta.
 *
 * A hierarquia visual e a hierarquia da decisao:
 *   estado geral -> pulso -> ambientes -> foco (UMA orientacao) -> demais sinais
 *   -> fontes ausentes -> aprofundamento
 *
 * Nao ha um unico controle que execute acao. A pilula de orientacao e uma DIV,
 * de proposito: nao existe o que clicar porque nao existe o que executar.
 */

import {
  blocoEvidencia,
  blocoLimitacoes,
  campo,
  esc,
  inspetor,
  secao,
  selos,
} from "../components/ui.js";

/* ------------------------------------------------------------------ *
 * Pulso e estado geral
 * ------------------------------------------------------------------ */

function pulso(vm) {
  if (!vm.pulso || vm.pulso.observado !== true) {
    return `<div class="home-pulso home-pulso--ausente">${campo(
      "Pulso",
      vm.pulso,
    )}</div>`;
  }
  const n = vm.pulso.valor;
  return `<div class="home-pulso" data-modo="${esc(vm.modo)}"><div class="home-pulso__anel"><span class="home-pulso__num">${esc(
    n,
  )}</span><span class="home-pulso__cap">${
    n === 1 ? "pedido em andamento" : "pedidos em andamento"
  }</span></div></div>`;
}

/**
 * Seletor de cena. Existe SOMENTE porque esta build e de demonstracao — numa
 * build com fonte real haveria uma leitura, nao um seletor. Ele fica dentro de
 * uma faixa que se anuncia como demonstracao para que ninguem o confunda com um
 * filtro operacional.
 */
function seletorDeCena(vm) {
  if (!vm.demonstracao || !vm.cenas_disponiveis) return "";
  return `<div class="home-demo" role="note">
    <p class="home-demo__aviso">Demonstracao. Os pedidos, tempos e cargas sao fixture; as regras e o cardapio sao reais.</p>
    <nav class="home-demo__cenas" aria-label="Cenas de demonstracao">${vm.cenas_disponiveis
      .map(
        (c) =>
          `<a class="home-demo__cena" href="?cena=${esc(c)}#/"${
            c === vm.cena ? ' aria-current="true"' : ""
          }>${esc(c)}</a>`,
      )
      .join("")}</nav>
  </div>`;
}

function cabecalho(vm) {
  return `<header class="home-topo">
    <p class="home-topo__eyebrow">Operacao Viva</p>
    <h1 class="home-topo__titulo display">${esc(vm.titulo)}</h1>
    <p class="home-topo__apoio">${esc(vm.apoio)}</p>
    <div class="home-topo__selos">${selos(vm.selos)}${
      vm.degradado
        ? `<span class="home-topo__degradado">Leitura degradada</span>`
        : ""
    }</div>
  </header>`;
}

/* ------------------------------------------------------------------ *
 * Ambientes e subareas
 * ------------------------------------------------------------------ */

function subarea(s) {
  return `<li class="home-sub" data-cor="${esc(s.cor)}"${
    s.causadora ? ' data-causadora="sim"' : ""
  }>
    <span class="home-sub__nome">${esc(s.rotulo)}</span>
    <span class="home-sub__estado">${esc(s.estado_texto)}</span>
    ${
      s.causadora
        ? '<span class="home-sub__causa">segurando o ambiente</span>'
        : ""
    }
    <span class="sr-only">${esc(s.motivo)}</span>
  </li>`;
}

function ambiente(a) {
  const barra =
    a.pressao && a.pressao.observado === true
      ? `<div class="home-amb__barra"><div class="home-amb__barra-fill" style="width:${esc(
          a.pressao.valor,
        )}%"></div></div><p class="home-amb__pressao">Pressao ${esc(
          a.pressao.valor,
        )}%</p>`
      : `<div class="home-amb__barra home-amb__barra--vazia"></div><p class="home-amb__pressao home-amb__pressao--ausente">${esc(
          a.pressao && a.pressao.explicacao ? a.pressao.explicacao : "Sem medicao.",
        )}</p>`;

  return `<article class="home-amb" data-cor="${esc(a.cor)}" data-ambiente="${esc(
    a.id,
  )}">
    <div class="home-amb__cab">
      <h3 class="home-amb__nome">${esc(a.rotulo)}</h3>
      <span class="home-amb__ponto" aria-hidden="true"></span>
    </div>
    <p class="home-amb__estado">${esc(a.estado_texto)}</p>
    <p class="home-amb__motivo">${esc(a.motivo)}</p>
    ${a.selos.length ? `<div class="home-amb__selos">${selos(a.selos)}</div>` : ""}
    ${barra}
    ${
      a.subareas.length
        ? `<ul class="home-amb__subs">${a.subareas.map(subarea).join("")}</ul>`
        : ""
    }
  </article>`;
}

/* ------------------------------------------------------------------ *
 * Foco
 * ------------------------------------------------------------------ */

function orientacao(o) {
  if (!o) {
    return `<div class="home-acao home-acao--pura">
      <p class="home-acao__hint">Sem orientacao prescrita</p>
      <div class="home-acao__pilula home-acao__pilula--pura">O foco mostra onde olhar</div>
    </div>`;
  }
  return `<div class="home-acao">
    <p class="home-acao__hint">Uma orientacao</p>
    <!-- DIV, nao botao: nao existe acao a executar. -->
    <div class="home-acao__pilula">${esc(o.acao)}</div>
    <dl class="home-acao__detalhe">
      <dt>Por que</dt><dd>${esc(o.porque)}</dd>
      <dt>Primeiro olhar</dt><dd>${esc(o.primeiro_olhar)}</dd>
      <dt>Limite</dt><dd>${esc(o.impacto)}</dd>
    </dl>
    <div class="home-acao__rodape">
      ${selos(o.selos)}
      ${campo("Confianca", o.confianca)}
      <p class="home-acao__nada">Nada foi executado. Uma pessoa decide.</p>
    </div>
  </div>`;
}

function foco(vm) {
  if (!vm.foco) return "";
  const f = vm.foco;
  const local = [f.ambiente_rotulo, f.subarea_rotulo]
    .filter(Boolean)
    .join(" · ");
  return `<section class="home-foco" aria-labelledby="focoTitulo">
    <div class="home-foco__cartao">
      <div class="home-foco__cab">
        <span class="home-foco__eyebrow">Foco</span>
        ${local ? `<span class="home-foco__local">${esc(local)}</span>` : ""}
      </div>
      <h2 class="home-foco__titulo" id="focoTitulo">${esc(f.situacao)}</h2>
      <p class="home-foco__tempo">${esc(f.tempo)}</p>
      ${blocoEvidencia(f.evidencias, "Evidencias")}
      <p class="home-foco__impacto">${esc(f.impacto)}</p>
    </div>
    ${orientacao(f.orientacao)}
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Demais sinais — nunca escondidos
 * ------------------------------------------------------------------ */

function linhaSinal(s) {
  // `alvo_rotulo` ja vem humano da view model. A tela nunca compoe alvo a partir
  // de `subarea`/`ambiente` crus — foi assim que `enrolados_quentes` vazou.
  const alvo = s.alvo_rotulo;
  return `<li class="home-sinal" data-sev="${esc(s.severidade)}" data-codigo="${esc(
    s.codigo,
  )}">
    <span class="home-sinal__nome">${esc(s.nome)}</span>
    <span class="home-sinal__resumo">${esc(s.resumo)}</span>
    <span class="home-sinal__alvo">${esc(alvo)}</span>
    ${s.orientacao ? `<span class="home-sinal__orient">${esc(s.orientacao)}</span>` : ""}
  </li>`;
}

function segundoPlano(vm) {
  if (!vm.sinais_em_segundo_plano.length) {
    return secao(
      "Outros sinais ativos",
      "Nenhum outro sinal ativo nesta leitura.",
      `<p class="home-vazio">A ausencia de sinal aqui significa que nenhuma regra sustentada disparou — nao que o sistema deixou de olhar.</p>`,
    );
  }
  return secao(
    vm.foco ? "Outros problemas continuam ativos" : "O que segue acontecendo",
    `${vm.sinais_em_segundo_plano.length} sinais, do mais severo ao menos.`,
    `<ul class="home-sinais">${vm.sinais_em_segundo_plano
      .map(linhaSinal)
      .join("")}</ul>`,
  );
}

/* ------------------------------------------------------------------ *
 * Fontes e o que ainda nao existe
 * ------------------------------------------------------------------ */

function fontes(vm) {
  const linhas = vm.fontes
    .map(
      (f) => `<li class="home-fonte" data-estado="${esc(f.estado)}">
        <span class="home-fonte__nome">${esc(f.rotulo)}</span>
        <span class="home-fonte__selo">${selos(f.selos)}</span>
        <span class="home-fonte__detalhe">${esc(f.detalhe)}</span>
      </li>`,
    )
    .join("");
  const indisponiveis = vm.sinais_indisponiveis
    .map(
      (s) => `<li class="home-bloqueado">
        <span class="home-bloqueado__cod">${esc(s.codigo)}</span>
        <span class="home-bloqueado__nome">${esc(s.nome)}</span>
        <span class="home-bloqueado__motivo">${esc(s.motivo)}</span>
        <span class="home-bloqueado__fonte">Falta: ${esc(s.fonte_que_falta)}</span>
      </li>`,
    )
    .join("");
  return secao(
    "O que ainda nao esta disponivel",
    "Ausencia declarada. Nenhuma delas foi convertida em zero nem em verde.",
    `<ul class="home-fontes">${linhas}</ul>` +
      inspetor(
        "sinais-bloqueados",
        `${vm.sinais_indisponiveis.length} sinais do catalogo sem fonte`,
        `<ul class="home-bloqueados">${indisponiveis}</ul>`,
      ),
  );
}

/* ------------------------------------------------------------------ *
 * Contextos por funcao e aprofundamento
 * ------------------------------------------------------------------ */

function contextos(vm) {
  const corpo = vm.contextos
    .map(
      (c) => `<article class="home-ctx" data-funcao="${esc(c.funcao)}">
        <h3 class="home-ctx__nome">${esc(c.rotulo)}</h3>
        <p class="home-ctx__pergunta">${esc(c.pergunta)}</p>
        ${
          c.sinais.length
            ? `<ul class="home-ctx__sinais">${c.sinais
                .slice(0, 4)
                .map(
                  (s) =>
                    `<li>${esc(s.nome)}: ${esc(s.resumo)}</li>`,
                )
                .join("")}${
                c.sinais.length > 4
                  ? `<li class="home-ctx__resto">Mais ${c.sinais.length - 4}.</li>`
                  : ""
              }</ul>`
            : `<p class="home-ctx__vazio">Nenhum sinal para esta funcao nesta leitura.</p>`
        }
        ${c.ausencia ? `<p class="home-ctx__ausencia">${esc(c.ausencia)}</p>` : ""}
      </article>`,
    )
    .join("");
  return secao(
    "O que cada funcao ve",
    "A mesma leitura, lida pela pergunta de quem esta operando.",
    `<div class="home-ctxs">${corpo}</div>`,
  );
}

function aprofundamento(vm) {
  return secao(
    "Aprofundar",
    "As telas tecnicas continuam existindo. Elas sao detalhe e auditoria, nao a jornada principal.",
    `<ul class="home-aprof">${vm.aprofundamentos
      .map(
        (a) =>
          `<li><a class="home-aprof__link" href="#${esc(a.rota)}"><span class="home-aprof__nome">${esc(
            a.nome,
          )}</span><span class="home-aprof__papel">${esc(a.papel)}</span></a></li>`,
      )
      .join("")}</ul>`,
  );
}

/* ------------------------------------------------------------------ */

export function telaHome(vm) {
  return `<div class="home" data-modo="${esc(vm.modo)}" data-degradado="${
    vm.degradado ? "sim" : "nao"
  }" data-demonstracao="${vm.demonstracao ? "sim" : "nao"}">
    ${seletorDeCena(vm)}
    ${cabecalho(vm)}
    ${pulso(vm)}
    ${secao(
      "Ambientes",
      "Todos, sempre. Nenhum some por estar bem — e nenhum fica verde por falta de fonte.",
      `<div class="home-ambs">${vm.ambientes.map(ambiente).join("")}</div>`,
    )}
    ${foco(vm)}
    ${segundoPlano(vm)}
    ${contextos(vm)}
    ${fontes(vm)}
    ${aprofundamento(vm)}
    ${blocoLimitacoes(vm.limitacoes)}
  </div>`;
}
