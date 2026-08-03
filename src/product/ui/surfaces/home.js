/**
 * DeliveryOS — HOME · O ORGANISMO OPERACIONAL
 * ============================================================================
 * AUTORIDADE VISUAL: Sprint Visual DeliveryOS V2 (Nivel 1) e Organismo
 * Operacional V3.3 (Nivel 2), em
 * `docs/design/canonical/deliveryos-visual-v2/extracted/`. NAO o Design System
 * da Unidade 6, e NAO `app-v1` — os dois sao Nivel 4 e 5. Ver PB9, L33 e D52.
 *
 * A home nao e uma grade de cartoes. E UMA superficie unica onde a operacao
 * inteira aparece na forma do caminho do pedido:
 *
 *        Caixa
 *      /       \
 *   Sushi     Cozinha        (Sushi carrega suas 4 subareas — D46)
 *      \       /
 *     Conferencia
 *          |
 *       Motoboy
 *
 * As quatro leis desta superficie, todas do V3.3 prancha 13:
 *   1. A area CRESCE em degraus (normal, atencao, pressao), nunca continuamente.
 *      O degrau e `cor`, que vem do motor. A pressao em % nunca vira tamanho.
 *   2. A ligacao so aparece quando a dependencia esta ATIVA agora, e engrossa
 *      quando a pressao a atravessa. Quem decide isso e `vm.ligacoes` (D53).
 *   3. Cor nunca e o unico sinal: escala, texto e informacao mudam juntos.
 *   4. O resto RECUA, e recuar nunca e sumir.
 *
 * O QUE ESTA SUPERFICIE NAO FAZ: nao calcula estado, gravidade, ligacao,
 * orientacao, confianca nem acao. Tudo isso chega pronto na view model.
 *
 * NENHUM CONTROLE EXECUTA. Nao ha botao, formulario, campo de entrada nem
 * handler neste arquivo — H25 le o proprio codigo-fonte e reprova qualquer um
 * deles. Aproximar-se de uma area e NAVEGACAO: um link que troca a consulta da
 * URL. A pilula de orientacao continua sendo uma div, porque continua nao
 * existindo o que executar.
 */

import { blocoLimitacoes, campo, esc, inspetor, selos } from "../components/ui.js";

/* ------------------------------------------------------------------ *
 * Vocabulario visual — a traducao, e so ela
 * ------------------------------------------------------------------ */

/**
 * A forma de cada area na superficie. Nao sao seis retangulos iguais: o caminho
 * do pedido tem entrada, producao, fechamento e saida, e cada um tem corpo
 * proprio. `nucleo` e circulo (producao viva); `pilula` e travessia.
 */
const FORMA = {
  caixa: "pilula",
  sushi: "nucleo",
  cozinha: "nucleo",
  conferencia: "pilula",
  motoboy: "pilula",
};

/** As tres fileiras da superficie, na ordem do pedido. */
const FILEIRAS = [
  { id: "entrada", areas: ["caixa"] },
  { id: "producao", areas: ["sushi", "cozinha"] },
  { id: "fechamento", areas: ["conferencia"] },
  { id: "saida", areas: ["motoboy"] },
];

/**
 * Como a ausencia se apresenta. Sao motivos DIFERENTES e o contrato canonico
 * mantem as duas linguagens separadas: falta de integracao fala em neutro
 * tracejado ("informacao incompleta, forma nao so cor"), falha de leitura fala
 * em cinza-ardosia e "nunca se confunde com pressao ambar".
 *
 * A interface nao classifica nada aqui: `motivo` ja vem do `Campo<T>`, que
 * obriga quem produz o dado a dizer POR QUE ele nao existe.
 */
function especieDeAusencia(a) {
  if (a.pressao.observado === true) return null;
  if (a.medicao === "sem_medicao_automatica") return "sem_integracao";
  if (a.pressao.motivo === "nao_observado") return "sem_leitura";
  return "sem_integracao";
}

/**
 * O tipo de evidencia e um codigo de catalogo (`tempo_sem_ficar_pronto`), util
 * para auditoria e ilegivel numa sexta-feira de pico. Aqui ele vira frase.
 *
 * Isto e formatacao, nao traducao de dado: o codigo continua inteiro no view
 * model e na trilha de auditoria. O que a superficie nao faz e mostrar
 * `sublinhado_com_underscore` para quem esta operando.
 */
function legivel(codigo) {
  return String(codigo).replace(/_/g, " ");
}

/** O degrau da area, e nada mais. Nunca a porcentagem. */
function degrau(cor) {
  if (cor === "vermelho") return "3";
  if (cor === "amarelo") return "2";
  if (cor === "verde") return "1";
  return "0";
}

/* ------------------------------------------------------------------ *
 * Cabecalho vivo
 * ------------------------------------------------------------------ */

function hora(iso) {
  // A hora exata do ultimo dado confiavel, em mono. Contrato dos estados
  // tecnicos, secao 03: "a memoria, recuada, com hora exata em fonte mono".
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
}

function topo(vm) {
  const h = hora(vm.observado_em);
  const vivo = vm.degradado ? "falha" : "vivo";
  return `<header class="org-topo">
    <span class="org-topo__marca">DeliveryOS</span>
    <span class="org-topo__casa">Tata</span>
    <span class="org-topo__vida" data-estado="${vivo}">
      <span class="org-topo__ponto" aria-hidden="true"></span>
      <span class="org-topo__nota">${
        vm.degradado
          ? `leitura degradada${h ? ` · ultima leitura ${esc(h)}` : ""}`
          : `ao vivo${h ? ` · leitura ${esc(h)}` : ""}`
      }</span>
    </span>
  </header>`;
}

/**
 * A faixa de demonstracao. Ela e larga e explicita de proposito: o V3.3 tem
 * cenarios demonstrativos, e o contrato canonico proibe que um valor de
 * demonstracao seja confundido com leitura real.
 */
function faixaDemonstracao(vm) {
  if (!vm.demonstracao) return "";
  const cenas = vm.cenas_disponiveis
    ? `<nav class="org-demo__cenas" aria-label="Cenas de demonstracao">${vm.cenas_disponiveis
        .map(
          (c) =>
            `<a class="org-demo__cena" href="?cena=${esc(c)}#/"${
              c === vm.cena ? ' aria-current="true"' : ""
            }>${esc(c)}</a>`,
        )
        .join("")}</nav>`
    : "";
  return `<div class="org-demo" role="note">
    <span class="org-demo__ponto" aria-hidden="true"></span>
    <p class="org-demo__aviso">Demonstracao. Pedidos, tempos e cargas sao fixture; as regras, o cardapio e os limiares sao reais.</p>
    ${cenas}
  </div>`;
}

/**
 * Faixa de falha tecnica. Cinza-ardosia, no topo do palco, com a hora. Ela NAO
 * cresce, NAO fica ambar e NAO entra na contagem de pressao.
 */
function faixaTecnica(vm) {
  if (!vm.degradado) return "";
  const nomes = vm.fontes_degradadas.map((f) => f.rotulo).join(", ");
  const h = hora(vm.observado_em);
  return `<div class="org-tecnico" role="status">
    <span class="org-tecnico__ponto" aria-hidden="true"></span>
    <span class="org-tecnico__texto">${esc(nomes)} sem leitura confiavel${
      h ? ` · ultima leitura as ${esc(h)}` : ""
    }. O resto da operacao segue normal.</span>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * A legenda editorial — o que a operacao esta dizendo agora
 * ------------------------------------------------------------------ */

function legenda(vm) {
  const p = vm.pulso;
  const pulso =
    p.observado === true
      ? `<p class="org-legenda__pulso"><span class="org-legenda__num">${esc(
          p.valor,
        )}</span> ${p.valor === 1 ? "pedido em andamento" : "pedidos em andamento"}</p>`
      : `<p class="org-legenda__pulso org-legenda__pulso--ausente">${esc(
          p.explicacao,
        )}</p>`;
  return `<div class="org-legenda">
    <span class="org-legenda__kicker">${esc(vm.modo)}</span>
    <p class="org-legenda__frase">${esc(vm.titulo)}</p>
    <p class="org-legenda__apoio">${esc(vm.apoio)}</p>
    ${pulso}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * As areas — corpos numa superficie, nao cartoes numa grade
 * ------------------------------------------------------------------ */

/**
 * A marca de solidez. "Confianca e solidez": o que foi observado aparece cheio,
 * o que nao foi aparece vazado. Nunca inventamos quantidade — a marca conta se
 * ha leitura, nao quantos pedidos existem.
 */
function marca(a) {
  const cheia = a.pressao.observado === true;
  return `<span class="org-marca" aria-hidden="true"><span class="org-marca__ponto" data-solida="${
    cheia ? "sim" : "nao"
  }"></span></span>`;
}

function subarea(s) {
  return `<li class="org-sub" data-cor="${esc(s.cor)}" data-degrau="${degrau(
    s.cor,
  )}"${s.causadora ? ' data-causadora="sim"' : ""}>
    <span class="org-sub__nome">${esc(s.rotulo)}</span>
    <span class="org-sub__estado">${esc(s.estado_texto)}</span>
    ${s.causadora ? '<span class="org-sub__causa">segurando o ambiente</span>' : ""}
    <span class="sr-only">${esc(s.motivo)}</span>
  </li>`;
}

/**
 * Uma area na superficie geral.
 *
 * `data-degrau` e o unico eixo de tamanho. `data-ausencia` separa "ainda sem
 * dados" de "leitura indisponivel" — as duas linguagens que o contrato dos
 * estados tecnicos manda nunca cruzar.
 */
function area(a, vm) {
  const ausencia = especieDeAusencia(a);
  const forma = FORMA[a.id] || "pilula";
  const href = `?${new URLSearchParams({
    ...(vm.cena ? { cena: vm.cena } : {}),
    area: a.id,
  }).toString()}#/`;

  const subs = a.subareas.length
    ? `<ul class="org-subs">${a.subareas.map(subarea).join("")}</ul>`
    : "";

  return `<div class="org-area" data-area="${esc(a.id)}" data-forma="${forma}" data-cor="${esc(
    a.cor,
  )}" data-degrau="${degrau(a.cor)}"${
    ausencia ? ` data-ausencia="${ausencia}"` : ""
  }>
    <a class="org-area__corpo" href="${esc(href)}" aria-label="Aproximar de ${esc(
      a.rotulo,
    )}">
      ${marca(a)}
      <span class="org-area__nome">${esc(a.rotulo)}</span>
      <span class="org-area__estado">${esc(a.estado_texto)}</span>
    </a>
    <p class="org-area__info">${esc(a.motivo)}</p>
    ${subs}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * As ligacoes — so aparecem quando a dependencia esta ativa
 * ------------------------------------------------------------------ */

function achar(ligacoes, de, para) {
  return ligacoes.find((l) => l.de === de && l.para === para) || null;
}

/** Um segmento. A intensidade decide espessura, cor, tracejado e movimento. */
function segmento(l, d) {
  const i = l ? l.intensidade : "inerte";
  const titulo = l && l.texto ? `<title>${esc(l.texto)}</title>` : "";
  return `<line class="org-fio" data-intensidade="${i}" x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}">${titulo}</line>`;
}

function ligacoesEntrada(vm) {
  const a = achar(vm.ligacoes, "caixa", "sushi");
  const b = achar(vm.ligacoes, "caixa", "cozinha");
  // O tronco herda a maior das duas intensidades: ele carrega as duas.
  const tronco =
    a && a.intensidade === "carregada"
      ? a
      : b && b.intensidade === "carregada"
        ? b
        : a && a.ativa
          ? a
          : b;
  return `<svg class="org-lig" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
    ${segmento(tronco, { x1: 50, y1: 0, x2: 50, y2: 6 })}
    ${segmento(a, { x1: 50, y1: 6, x2: 25, y2: 20 })}
    ${segmento(b, { x1: 50, y1: 6, x2: 75, y2: 20 })}
  </svg>`;
}

function ligacoesFechamento(vm) {
  const a = achar(vm.ligacoes, "sushi", "conferencia");
  const b = achar(vm.ligacoes, "cozinha", "conferencia");
  const tronco =
    a && a.intensidade === "carregada"
      ? a
      : b && b.intensidade === "carregada"
        ? b
        : a && a.ativa
          ? a
          : b;
  return `<svg class="org-lig" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
    ${segmento(a, { x1: 25, y1: 0, x2: 50, y2: 13 })}
    ${segmento(b, { x1: 75, y1: 0, x2: 50, y2: 13 })}
    ${segmento(tronco, { x1: 50, y1: 13, x2: 50, y2: 20 })}
  </svg>`;
}

function ligacaoSaida(vm) {
  const l = achar(vm.ligacoes, "conferencia", "motoboy");
  return `<svg class="org-lig org-lig--curta" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
    ${segmento(l, { x1: 50, y1: 0, x2: 50, y2: 14 })}
  </svg>`;
}

/**
 * As relacoes ativas em texto. A linha SVG comunica intensidade; esta lista
 * comunica CAUSA, e ela existe para quem le por leitor de tela e para quem
 * precisa da frase. Relacao inerte nao aparece — nem aqui, nem la.
 */
function relacoesAtivas(vm) {
  const ativas = vm.ligacoes.filter((l) => l.ativa);
  if (ativas.length === 0) return "";
  return `<ul class="org-relacoes">${ativas
    .map(
      (l) =>
        `<li class="org-relacao" data-intensidade="${esc(l.intensidade)}">${esc(
          l.texto,
        )}</li>`,
    )
    .join("")}</ul>`;
}

/* ------------------------------------------------------------------ *
 * A superficie
 * ------------------------------------------------------------------ */

function superficie(vm) {
  const porId = new Map(vm.ambientes.map((a) => [a.id, a]));
  const fileira = (f) =>
    `<div class="org-fila" data-fila="${f.id}">${f.areas
      .map((id) => (porId.has(id) ? area(porId.get(id), vm) : ""))
      .join("")}</div>`;

  return `<div class="org-superficie">
    ${fileira(FILEIRAS[0])}
    ${ligacoesEntrada(vm)}
    ${fileira(FILEIRAS[1])}
    ${ligacoesFechamento(vm)}
    ${fileira(FILEIRAS[2])}
    ${ligacaoSaida(vm)}
    ${fileira(FILEIRAS[3])}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * O Foco — emerge da superficie, nunca e outra pagina
 * ------------------------------------------------------------------ */

function orientacao(o) {
  if (!o) {
    return `<div class="org-acao org-acao--pura">
      <p class="org-acao__hint">Sem orientacao prescrita</p>
      <div class="org-acao__pilula org-acao__pilula--pura">O foco mostra onde olhar</div>
    </div>`;
  }
  return `<div class="org-acao">
    <p class="org-acao__hint">Uma orientacao</p>
    <!-- DIV, nao botao: nao existe acao a executar. -->
    <div class="org-acao__pilula">${esc(o.acao)}</div>
    <dl class="org-acao__detalhe">
      <dt>Por que</dt><dd>${esc(o.porque)}</dd>
      <dt>Primeiro olhar</dt><dd>${esc(o.primeiro_olhar)}</dd>
      <dt>Limite</dt><dd>${esc(o.impacto)}</dd>
    </dl>
    <div class="org-acao__rodape">
      ${selos(o.selos)}
      ${campo("Confianca", o.confianca)}
      <p class="org-acao__nada">Nada foi executado. Uma pessoa decide.</p>
    </div>
  </div>`;
}

function foco(vm) {
  if (!vm.foco) return "";
  const f = vm.foco;
  const local = [f.ambiente_rotulo, f.subarea_rotulo].filter(Boolean).join(" · ");
  const evid = f.evidencias.length
    ? `<ul class="org-foco__evidencias">${f.evidencias
        .map(
          (e) =>
            `<li><span class="org-foco__ev-tipo">${esc(legivel(e.tipo))}</span> ${esc(
              e.referencia,
            )}</li>`,
        )
        .join("")}</ul>`
    : "";
  return `<aside class="org-foco" aria-labelledby="focoTitulo">
    <span class="org-foco__entalhe" aria-hidden="true"></span>
    <span class="org-foco__eyebrow">Precisa de atencao${local ? ` · ${esc(local)}` : ""}</span>
    <h2 class="org-foco__titulo" id="focoTitulo">${esc(f.situacao)}</h2>
    <p class="org-foco__consequencia">${esc(f.impacto)}</p>
    ${evid}
    <p class="org-foco__tempo">${esc(f.tempo)}</p>
    ${orientacao(f.orientacao)}
  </aside>`;
}

/* ------------------------------------------------------------------ *
 * Aproximacao de uma area
 * ------------------------------------------------------------------ */

/**
 * Aproximar-se e NAVEGACAO, e por isso o "resto da operacao" nunca sai da tela:
 * o rodape carrega todas as outras areas com o degrau delas. O V3.3 chama isso
 * de minimapa, e a regra e a mesma da prancha 13 — recuar nunca e sumir.
 */
function minimapa(vm, focada) {
  return `<div class="org-minimapa">
    <span class="org-minimapa__rotulo">resto da operacao</span>
    ${vm.ambientes
      .filter((a) => a.id !== focada)
      .map(
        (a) =>
          `<span class="org-minimapa__item" data-cor="${esc(a.cor)}" data-degrau="${degrau(
            a.cor,
          )}"><span class="org-minimapa__ponto" aria-hidden="true"></span>${esc(
            a.rotulo,
          )} <span class="org-minimapa__estado">${esc(a.estado_texto)}</span></span>`,
      )
      .join("")}
  </div>`;
}

function aproximacao(vm, id) {
  const a = vm.ambientes.find((x) => x.id === id);
  if (!a) return "";
  const ausencia = especieDeAusencia(a);
  const volta = `?${new URLSearchParams(vm.cena ? { cena: vm.cena } : {}).toString()}#/`;

  const entram = vm.ligacoes.filter((l) => l.para === id);
  const saem = vm.ligacoes.filter((l) => l.de === id);
  const caminho = [...entram.map((l) => l.de_rotulo), a.rotulo, ...saem.map((l) => l.para_rotulo)]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" → ");

  const daArea = vm.sinais_em_segundo_plano.filter((s) => s.ambiente === id);
  const acontecendo = daArea.length
    ? `<ul class="org-aprox__linhas">${daArea
        .slice(0, 6)
        .map(
          (s) =>
            `<li data-sev="${esc(s.severidade)}"><span class="org-aprox__alvo">${esc(
              s.alvo_rotulo,
            )}</span> ${esc(s.resumo)}</li>`,
        )
        .join("")}${
        daArea.length > 6
          ? `<li class="org-aprox__resto">Mais ${daArea.length - 6} nesta area.</li>`
          : ""
      }</ul>`
    : `<p class="org-aprox__vazio">Nenhum sinal sustentado aponta para esta area nesta leitura.</p>`;

  const relacoes = [...entram, ...saem].filter((l) => l.ativa);

  return `<div class="org-aprox">
    <div class="org-aprox__topo">
      <a class="org-aprox__voltar" href="${esc(volta)}">← Visao geral</a>
      <span class="org-aprox__caminho">${esc(caminho)}</span>
    </div>
    <div class="org-aprox__corpo">
      <div class="org-area org-area--focada" data-area="${esc(a.id)}" data-forma="${
        FORMA[a.id] || "pilula"
      }" data-cor="${esc(a.cor)}" data-degrau="${degrau(a.cor)}"${
        ausencia ? ` data-ausencia="${ausencia}"` : ""
      }>
        <span class="org-area__corpo">
          ${marca(a)}
          <span class="org-area__nome">${esc(a.rotulo)}</span>
          <span class="org-area__estado">${esc(a.estado_texto)}</span>
        </span>
      </div>
      <div class="org-aprox__coluna">
        <h2 class="org-aprox__rotulo">O que esta acontecendo</h2>
        <p class="org-aprox__descricao">${esc(a.descricao)}</p>
        <p class="org-aprox__motivo">${esc(a.motivo)}</p>
        ${acontecendo}
        ${
          a.subareas.length
            ? `<h3 class="org-aprox__rotulo">Subareas</h3><ul class="org-subs org-subs--aberta">${a.subareas
                .map(subarea)
                .join("")}</ul>`
            : ""
        }
        ${
          a.pressao.observado === true
            ? `<p class="org-aprox__medida">Carga observada: ${esc(
                a.pressao.valor,
              )}% do ritmo normal desta area.</p>`
            : `<p class="org-aprox__medida org-aprox__medida--ausente">${esc(
                a.pressao.explicacao,
              )}</p>`
        }
      </div>
      <div class="org-aprox__coluna org-aprox__coluna--causa">
        <h2 class="org-aprox__rotulo">Causa e efeito</h2>
        ${
          relacoes.length
            ? relacoes
                .map(
                  (l) =>
                    `<p class="org-relacao" data-intensidade="${esc(
                      l.intensidade,
                    )}" data-direcao="${l.para === id ? "entra" : "sai"}">${esc(
                      l.texto,
                    )}</p>`,
                )
                .join("")
            : `<p class="org-aprox__vazio">Nenhuma dependencia ativa entra ou sai desta area agora.</p>`
        }
      </div>
    </div>
    ${minimapa(vm, id)}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * O que segue acontecendo — nada some
 * ------------------------------------------------------------------ */

function linhaSinal(s) {
  // `alvo_rotulo` ja vem humano da view model. A tela nunca compoe alvo a partir
  // de `subarea`/`ambiente` crus — foi assim que `enrolados_quentes` vazou.
  return `<li class="org-sinal" data-sev="${esc(s.severidade)}" data-codigo="${esc(
    s.codigo,
  )}">
    <span class="org-sinal__nome">${esc(s.nome)}</span>
    <span class="org-sinal__resumo">${esc(s.resumo)}</span>
    <span class="org-sinal__alvo">${esc(s.alvo_rotulo)}</span>
    ${s.orientacao ? `<span class="org-sinal__orient">${esc(s.orientacao)}</span>` : ""}
  </li>`;
}

function bloco(titulo, sub, corpo) {
  return `<section class="org-bloco">
    <h2 class="org-bloco__titulo">${esc(titulo)}</h2>
    <p class="org-bloco__sub">${esc(sub)}</p>
    ${corpo}
  </section>`;
}

function segundoPlano(vm) {
  if (!vm.sinais_em_segundo_plano.length) {
    return bloco(
      "O que segue acontecendo",
      "Nenhum outro sinal sustentado nesta leitura.",
      `<p class="org-vazio">A ausencia de sinal aqui significa que nenhuma regra sustentada disparou — nao que o sistema deixou de olhar.</p>`,
    );
  }
  return bloco(
    vm.foco ? "Os outros problemas continuam ativos" : "O que segue acontecendo",
    `${vm.sinais_em_segundo_plano.length} sinais, do mais severo ao menos.`,
    `<ul class="org-sinais">${vm.sinais_em_segundo_plano.map(linhaSinal).join("")}</ul>`,
  );
}

function contextos(vm) {
  const corpo = vm.contextos
    .map(
      (c) => `<article class="org-ctx" data-funcao="${esc(c.funcao)}">
        <h3 class="org-ctx__nome">${esc(c.rotulo)}</h3>
        <p class="org-ctx__pergunta">${esc(c.pergunta)}</p>
        ${
          c.sinais.length
            ? `<ul class="org-ctx__sinais">${c.sinais
                .slice(0, 4)
                .map((s) => `<li>${esc(s.nome)}: ${esc(s.resumo)}</li>`)
                .join("")}${
                c.sinais.length > 4
                  ? `<li class="org-ctx__resto">Mais ${c.sinais.length - 4}.</li>`
                  : ""
              }</ul>`
            : `<p class="org-ctx__vazio">Nenhum sinal para esta funcao nesta leitura.</p>`
        }
        ${c.ausencia ? `<p class="org-ctx__ausencia">${esc(c.ausencia)}</p>` : ""}
      </article>`,
    )
    .join("");
  return bloco(
    "O que cada funcao ve",
    "A mesma leitura, lida pela pergunta de quem esta operando.",
    `<div class="org-ctxs">${corpo}</div>`,
  );
}

function fontes(vm) {
  const linhas = vm.fontes
    .map(
      (f) => `<li class="org-fonte" data-estado="${esc(f.estado)}">
        <span class="org-fonte__nome">${esc(f.rotulo)}</span>
        <span class="org-fonte__selo">${selos(f.selos)}</span>
        <span class="org-fonte__detalhe">${esc(f.detalhe)}</span>
      </li>`,
    )
    .join("");
  const indisponiveis = vm.sinais_indisponiveis
    .map(
      (s) => `<li class="org-bloqueado">
        <span class="org-bloqueado__cod">${esc(s.codigo)}</span>
        <span class="org-bloqueado__nome">${esc(s.nome)}</span>
        <span class="org-bloqueado__motivo">${esc(s.motivo)}</span>
        <span class="org-bloqueado__fonte">Falta: ${esc(s.fonte_que_falta)}</span>
      </li>`,
    )
    .join("");
  return bloco(
    "O que ainda nao esta disponivel",
    "Ausencia declarada. Nenhuma delas foi convertida em zero nem em verde.",
    `<ul class="org-fontes">${linhas}</ul>` +
      inspetor(
        "sinais-bloqueados",
        `${vm.sinais_indisponiveis.length} sinais do catalogo sem fonte`,
        `<ul class="org-bloqueados">${indisponiveis}</ul>`,
      ),
  );
}

function aprofundamento(vm) {
  return bloco(
    "Aprofundar",
    "As telas tecnicas continuam existindo. Elas sao detalhe e auditoria, nao a jornada principal.",
    `<ul class="org-aprof">${vm.aprofundamentos
      .map(
        (a) =>
          `<li><a class="org-aprof__link" href="#${esc(a.rota)}"><span class="org-aprof__nome">${esc(
            a.nome,
          )}</span><span class="org-aprof__papel">${esc(a.papel)}</span></a></li>`,
      )
      .join("")}</ul>`,
  );
}

/* ------------------------------------------------------------------ */

/**
 * Qual area esta ampliada. Vem da URL porque aproximar-se e navegacao — nao ha
 * estado de componente, nao ha handler, e recarregar a pagina nao perde nada.
 */
function areaAmpliada(vm) {
  if (typeof window === "undefined" || !window.location) return null;
  const id = new URLSearchParams(window.location.search).get("area");
  return id && vm.ambientes.some((a) => a.id === id) ? id : null;
}

export function telaHome(vm) {
  const ampliada = areaAmpliada(vm);
  return `<div class="org" data-modo="${esc(vm.modo)}" data-degradado="${
    vm.degradado ? "sim" : "nao"
  }" data-demonstracao="${vm.demonstracao ? "sim" : "nao"}" data-vista="${
    ampliada ? "area" : "geral"
  }">
    ${faixaDemonstracao(vm)}
    ${topo(vm)}
    <div class="org-palco">
      ${faixaTecnica(vm)}
      ${
        ampliada
          ? aproximacao(vm, ampliada)
          : `${legenda(vm)}${superficie(vm)}${relacoesAtivas(vm)}${foco(vm)}`
      }
    </div>
    ${segundoPlano(vm)}
    ${contextos(vm)}
    ${fontes(vm)}
    ${aprofundamento(vm)}
    ${blocoLimitacoes(vm.limitacoes)}
  </div>`;
}
