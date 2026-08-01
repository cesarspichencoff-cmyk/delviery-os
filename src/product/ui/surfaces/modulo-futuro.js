/**
 * Superficie de MODULO FUTURO.
 *
 * Um modulo planejado tem lugar na navegacao e nao tem tela funcional. Esta
 * superficie existe para que "planejado" seja uma afirmacao visivel em vez de um
 * link quebrado — e para que ninguem confunda visao com produto.
 *
 * Ela nao mostra numero, grafico, lista nem cartao de dado. Nao ha o que mostrar,
 * e desenhar a casca de uma tela vazia sugeriria que os dados vem depois.
 */

import { cabecalhoSuperficie, esc, estadoTela, selo } from "../components/ui.js";
import { icone } from "../components/icons.js";

export function telaModuloFuturo(m) {
  return `
    ${cabecalhoSuperficie(
      `Planejado · ${m.nome}`,
      m.nome,
      m.descricao,
      [{ estado: m.estado }],
    )}

    ${estadoTela(
      "futuro",
      [{ estado: "futuro" }],
      "Este modulo ainda nao existe",
      "Ele tem lugar reservado na navegacao porque a arquitetura ja o previu. Nao ha dado, nao ha tela e nao ha integracao — e nada nesta pagina deve ser lido como estado da operacao.",
    )}

    <section class="secao" style="margin-top:var(--space-4)">
      <h2 class="secao__titulo">${icone(m.icone, 22)} A visao</h2>
      <p class="superficie__humano">${esc(m.visao)}</p>
    </section>

    <section class="secao">
      <h2 class="secao__titulo">O que precisaria existir antes</h2>
      <p class="secao__sub">Um modulo so entra quando ha fonte real que o alimente. Ate la, ele fica aqui — declarado, e nao simulado.</p>
      <div class="bloco-limitacao">
        <p class="bloco-limitacao__titulo">Nenhum dado foi fabricado para esta pagina</p>
        <p class="bloco-limitacao__texto">Nao existe fixture, exemplo ou numero de amostra nesta tela. Preencher um modulo futuro com dado plausivel e a forma mais rapida de fazer uma equipe confiar em algo que nao existe.</p>
      </div>
    </section>

    <p class="secao__sub">${selo({ estado: "futuro" })}</p>
  `;
}
