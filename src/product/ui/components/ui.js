/**
 * DeliveryOS — Product System · componentes de interface
 *
 * Regras que valem para o arquivo inteiro:
 *  - nenhum componente decide regra de negocio; todos recebem view model pronta;
 *  - nenhum componente inventa valor: `Campo` ausente vira bloco de ausencia,
 *    nunca zero, traco ou string vazia;
 *  - nenhum componente produz botao de acao operacional.
 */

/* ------------------------------------------------------------------ *
 * Base
 * ------------------------------------------------------------------ */

/** Escapa texto antes de qualquer interpolacao em HTML. */
export function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ *
 * Estado semantico
 * ------------------------------------------------------------------ */

/**
 * Dicionario de estados vindo de /api/estados, que serve
 * docs/figma/DESIGN_TOKENS.json. Rotulo, glifo, padrao e cor tem UM lugar de
 * nascimento, e nao e este arquivo.
 */
let DICIONARIO = {};

export function carregarEstados(dic) {
  DICIONARIO = dic || {};
}

export function definicaoDoEstado(nome) {
  return DICIONARIO[nome] || null;
}

/**
 * Badge semantico — o componente mais importante do sistema.
 *
 * Quatro canais: rotulo textual (unico canal do leitor de tela), glifo,
 * padrao de borda e cor. O glifo e `aria-hidden` porque ele REPETE o rotulo;
 * anuncia-lo faria o leitor de tela dizer "circulo REAL".
 */
export function selo(s) {
  if (!s) return "";
  const def = DICIONARIO[s.estado];
  if (!def) {
    // Estado desconhecido nunca vira silencio: aparecer errado e melhor que sumir.
    return `<span class="ds-state" data-padrao="dotted" data-ink="ink-faint" data-wash="wash-faint">${esc(
      s.estado,
    )}</span>`;
  }
  const detalhe = s.detalhe ? ` ${s.detalhe}` : "";
  const acessivel = `${def.texto_acessivel}.${detalhe}`;
  return `<span class="ds-state" data-estado="${esc(s.estado)}" data-padrao="${esc(
    def.padrao,
  )}" data-ink="${esc(def.ink)}" data-wash="${esc(def.wash)}" title="${esc(
    def.descricao_curta,
  )}"><span class="ds-state__glyph" aria-hidden="true">${esc(
    def.glifo,
  )}</span><span class="sr-only">${esc(acessivel)}</span><span aria-hidden="true">${esc(
    def.rotulo,
  )}</span></span>`;
}

export function selos(lista) {
  return (lista || []).map(selo).join("");
}

/* ------------------------------------------------------------------ *
 * Campo — valor observado ou ausencia declarada
 * ------------------------------------------------------------------ */

/**
 * A trava visual contra `null` virando zero.
 *
 * Quando o campo nao foi observado, o componente NAO renderiza numero, traco,
 * "0" nem "—". Ele renderiza uma caixa tracejada com o motivo escrito por
 * extenso, e a caixa nao se parece com um valor.
 */
export function campo(rotulo, c, opcoes = {}) {
  const tecnico = opcoes.tecnico ? " campo__valor--tecnico" : "";
  if (!c || c.observado !== true) {
    const motivo = c ? c.motivo : "indisponivel";
    const explicacao = c ? c.explicacao : "Este campo nao foi lido.";
    return `<div class="campo"><span class="campo__rotulo">${esc(
      rotulo,
    )}</span><div class="campo__ausencia">${selo({
      estado: motivoParaEstado(motivo),
    })}<p class="campo__ausencia-explicacao">${esc(explicacao)}</p></div></div>`;
  }
  const sufixo = opcoes.sufixo ? ` ${opcoes.sufixo}` : "";
  return `<div class="campo"><span class="campo__rotulo">${esc(
    rotulo,
  )}</span><span class="campo__valor${tecnico}">${esc(c.valor)}${esc(
    sufixo,
  )}</span></div>`;
}

/** Os quatro motivos de ausencia mapeiam para tres estados visuais distintos. */
export function motivoParaEstado(motivo) {
  switch (motivo) {
    case "evidencia_insuficiente":
      return "evidencia_insuficiente";
    case "integracao_pendente":
      return "indisponivel";
    case "nao_observado":
      return "indisponivel";
    default:
      return "indisponivel";
  }
}

/**
 * Metrica de destaque. Ausencia usa tipografia DIFERENTE do numero de proposito:
 * na mesma caixa e no mesmo tamanho, o olho leria a falta como um valor.
 */
export function metric(rotulo, c, opcoes = {}) {
  if (!c || c.observado !== true) {
    const explicacao = c ? c.explicacao : "Nao foi lido.";
    return `<div class="metric"><p class="metric__rotulo">${esc(
      rotulo,
    )}</p><p class="metric__ausente">${esc(explicacao)}</p></div>`;
  }
  const sufixo = opcoes.sufixo ? `<span class="campo__rotulo"> ${esc(opcoes.sufixo)}</span>` : "";
  return `<div class="metric"><p class="metric__rotulo">${esc(
    rotulo,
  )}</p><p class="metric__valor">${esc(c.valor)}${sufixo}</p></div>`;
}

/* ------------------------------------------------------------------ *
 * Blocos
 * ------------------------------------------------------------------ */

export function blocoEvidencia(evidencias, titulo = "Evidencia") {
  if (!evidencias || evidencias.length === 0) {
    return `<div class="bloco-evidencia"><p class="bloco-evidencia__titulo">${esc(
      titulo,
    )}</p>${selo({
      estado: "evidencia_insuficiente",
      detalhe: "Nada aqui esta apoiado em evidencia rastreavel.",
    })}</div>`;
  }
  const itens = evidencias
    .map((e) => `<li>${esc(e.tipo)} · ${esc(e.referencia)}</li>`)
    .join("");
  return `<div class="bloco-evidencia"><p class="bloco-evidencia__titulo">${esc(
    titulo,
  )}</p><ul class="bloco-evidencia__lista">${itens}</ul></div>`;
}

export function blocoLimitacao(l) {
  return `<div class="bloco-limitacao"><p class="bloco-limitacao__titulo">${esc(
    l.titulo,
  )}</p><p class="bloco-limitacao__texto">${esc(l.texto)}</p></div>`;
}

export function blocoLimitacoes(lista) {
  if (!lista || lista.length === 0) return "";
  return `<section class="secao"><h2 class="secao__titulo">O que esta tela nao prova</h2><p class="secao__sub">Escrito aqui porque limitacao que so existe na documentacao nao protege ninguem no momento da leitura.</p><div class="pilha">${lista
    .map(blocoLimitacao)
    .join("")}</div></section>`;
}

/** Estado de tela inteira. Sempre nomeia o estado e diz o que fazer. */
export function estadoTela(tipo, selosLista, titulo, texto) {
  return `<div class="estado-tela" data-tipo="${esc(
    tipo,
  )}"><div class="linha-selos">${selos(selosLista)}</div><p class="estado-tela__titulo">${esc(
    titulo,
  )}</p><p class="estado-tela__texto">${esc(texto)}</p></div>`;
}

export function vazio(titulo, texto) {
  return estadoTela("vazio", [{ estado: "indisponivel" }], titulo, texto);
}

export function skeleton(linhas = 3) {
  const l = [];
  for (let i = 0; i < linhas; i += 1) {
    l.push(`<div class="skeleton" style="width:${90 - i * 15}%"></div>`);
  }
  return `<div class="pilha" aria-hidden="true">${l.join("")}</div>`;
}

export function secao(titulo, sub, corpo) {
  return `<section class="secao"><h2 class="secao__titulo">${esc(
    titulo,
  )}</h2>${sub ? `<p class="secao__sub">${esc(sub)}</p>` : ""}${corpo}</section>`;
}

export function cabecalhoSuperficie(eyebrow, titulo, humano, selosLista) {
  return `<header class="superficie__cabecalho"><p class="superficie__eyebrow">${esc(
    eyebrow,
  )}</p><h1 class="superficie__titulo">${esc(titulo)}</h1>${
    humano ? `<p class="superficie__humano">${esc(humano)}</p>` : ""
  }<div class="superficie__selos">${selos(selosLista)}</div></header>`;
}

/**
 * Inspetor expansivel. Um `<button aria-expanded>` — nao um controle operacional.
 * Nenhum inspetor desta aplicacao muda estado do dominio: ele so mostra mais.
 */
export function inspetor(id, rotulo, corpo) {
  return `<div class="inspetor"><button class="inspetor__botao" type="button" data-inspetor="${esc(
    id,
  )}" aria-expanded="false" aria-controls="ins-${esc(id)}"><span>${esc(
    rotulo,
  )}</span><span aria-hidden="true">+</span></button><div class="ds-expand inspetor__corpo" id="ins-${esc(
    id,
  )}" data-aberto="nao"><div>${corpo}</div></div></div>`;
}

/** Liga os inspetores de uma raiz. Puro toggle de apresentacao. */
export function ligarInspetores(raiz) {
  raiz.querySelectorAll("[data-inspetor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const alvo = raiz.querySelector(`#ins-${CSS.escape(btn.dataset.inspetor)}`);
      const aberto = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!aberto));
      if (alvo) alvo.dataset.aberto = aberto ? "nao" : "sim";
      const sinal = btn.lastElementChild;
      if (sinal) sinal.textContent = aberto ? "+" : "−";
    });
  });
}

/**
 * Tabela responsiva. Cada `td` carrega `data-rotulo` porque abaixo de 600px a
 * tabela vira lista e o cabecalho some — sem o rotulo, a celula ficaria orfa.
 */
export function tabela(colunas, linhas) {
  const thead = colunas.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const tbody = linhas
    .map(
      (l) =>
        `<tr>${l
          .map((celula, i) => `<td data-rotulo="${esc(colunas[i])}">${celula}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}
