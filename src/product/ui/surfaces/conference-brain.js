/**
 * Superficie CONFERENCE BRAIN — saude das fontes, ciclos, conclusoes, armazenamento.
 *
 * O centro desta tela e um par: a cadeia REAL, que devolve zero observacoes de
 * pedido, e o CONTROLE POSITIVO SINTETICO, que devolve uma pelo mesmo cano. Sem
 * o par, o zero da esquerda seria indistinguivel de defeito — cano entupido
 * devolve o mesmo zero que a recusa deliberada.
 */

import {
  blocoEvidencia,
  blocoLimitacoes,
  cabecalhoSuperficie,
  campo,
  esc,
  estadoTela,
  inspetor,
  metric,
  selo,
  selos,
  secao,
  tabela,
} from "../components/ui.js";

function fonte(f, prefixo) {
  return `<li class="fonte-linha ds-reveal">
    ${selo(f.selo_saude)}
    ${selo(f.selo_procedencia)}
    <span class="fonte-linha__id">${esc(f.run_id)} · ${esc(f.cycle_id)}</span>
    <span class="campo__valor">Pedidos observados: ${
      f.pedidos_observados.observado
        ? `<strong>${esc(f.pedidos_observados.valor)}</strong>`
        : selo({ estado: "indisponivel", detalhe: f.pedidos_observados.explicacao })
    }</span>
    ${
      f.campos_ausentes.length > 0
        ? `<div style="flex-basis:100%">${inspetor(
            `${prefixo}-campos-${esc(f.cycle_id)}`,
            `${f.campos_ausentes.length} campos que a fonte declarou nao ter`,
            `<ul class="bloco-evidencia__lista">${f.campos_ausentes
              .map((c) => `<li>${esc(c)}</li>`)
              .join("")}</ul>`,
          )}</div>`
        : ""
    }
  </li>`;
}

function conclusao(c, prefixo) {
  return `<article class="cartao">
    <div class="cartao__topo">
      <div>
        <p class="campo__rotulo">${esc(c.rotulo_especie)}</p>
        <h3 class="cartao__nome campo__valor--tecnico">${esc(c.ref)}</h3>
      </div>
      <div class="cartao__selos">${selo(c.selo)}</div>
    </div>
    <div class="grade" data-colunas="2">
      ${campo("Versao do contrato", { observado: true, valor: c.versao }, { tecnico: true })}
      ${campo("Observado em", c.observado_em, { tecnico: true })}
    </div>
    <p class="campo__valor">Pode afirmar carga operacional: <strong>${
      c.pode_afirmar_carga ? "sim" : "nao"
    }</strong></p>
    ${blocoEvidencia(c.evidencias)}
    ${
      c.limitacoes.length > 0
        ? inspetor(
            `${prefixo}-lim-${esc(c.ref)}`,
            `${c.limitacoes.length} limitacoes declaradas`,
            `<ul class="bloco-evidencia__lista">${c.limitacoes
              .map((l) => `<li>${esc(l)}</li>`)
              .join("")}</ul>`,
          )
        : ""
    }
  </article>`;
}

function painelDeLeitura(vm, prefixo, titulo, sub) {
  const corpoFontes =
    vm.fontes.length === 0
      ? estadoTela(
          "vazio",
          [{ estado: "indisponivel" }],
          "Nenhum ciclo nesta leitura",
          "O observador nao registrou ciclo. Sem ciclo nao ha leitura, e sem leitura nada pode ser afirmado.",
        )
      : `<ul class="lista-operacional">${vm.fontes
          .map((f) => fonte(f, prefixo))
          .join("")}</ul>`;

  const corpoConclusoes =
    vm.conclusoes.length === 0
      ? estadoTela(
          "vazio",
          [{ estado: "evidencia_insuficiente" }],
          "Nenhuma conclusao nesta leitura",
          "Conclusao sem evidencia rastreavel nao e produzida — nem como conclusao vazia.",
        )
      : `<div class="grade" data-colunas="2">${vm.conclusoes
          .map((c) => conclusao(c, prefixo))
          .join("")}</div>`;

  return `<section class="secao">
    <h2 class="secao__titulo">${esc(titulo)}</h2>
    <p class="secao__sub">${esc(sub)}</p>
    <div class="linha-selos" style="margin-bottom:var(--space-3)">${selos(
      vm.selos_de_cabecalho,
    )}</div>
    <div class="metric-strip" style="margin-bottom:var(--space-3)">
      ${metric("Ciclos", { observado: true, valor: vm.fontes.length })}
      ${metric("Observacoes de PEDIDO", vm.observacoes_de_pedido)}
      ${metric("Conclusoes", { observado: true, valor: vm.conclusoes.length })}
    </div>
    ${corpoFontes}
    <div style="height:var(--space-3)"></div>
    ${corpoConclusoes}
  </section>`;
}

export function telaConferenceBrain(dados) {
  const vm = dados.real;
  const ctrl = dados.controle_positivo;
  const a = vm.armazenamento;

  const corpoInvalidas =
    a.linhas_invalidas.length === 0
      ? `<p class="secao__sub">Nenhum registro foi recusado pelo contrato na carga.</p>`
      : tabela(
          ["Entidade", "Linha", "Codigos", "Tamanho", "Hash"],
          a.linhas_invalidas.map((l) => [
            esc(l.entity),
            esc(String(l.line_number)),
            esc(l.codigos.join(", ")),
            esc(String(l.tamanho)),
            `<span class="campo__valor--tecnico">${esc(l.hash)}</span>`,
          ]),
        );

  return `
    ${cabecalhoSuperficie(
      "Entendimento · Conference Brain",
      "O que foi observado, o que foi concluido, e o que falta observar",
      "A Conferencia le fontes e conclui sobre elas. Hoje ela consegue concluir sobre a SAUDE da fonte, e nao consegue concluir sobre PEDIDO — e o painel ao lado prova que a incapacidade e da fonte, nao do cano.",
      vm.selos_de_cabecalho,
    )}

    ${painelDeLeitura(
      vm,
      "real",
      "A cadeia real",
      "Operacao Viva, adapter semantico, observador e nucleo multidimensional. Ela devolve ZERO observacoes de pedido, e esse zero e uma recusa deliberada: a projecao nao carrega identidade de pedido, e emitir observacao exigiria inventar identidade.",
    )}

    ${painelDeLeitura(
      ctrl,
      "ctrl",
      "Controle positivo sintetico — o par que da sentido ao zero",
      "O MESMO cano, alimentado por uma fonte sintetica legitima de pedido. Ele devolve UMA observacao. Se este painel tambem devolvesse zero, o zero do painel anterior significaria defeito. Nada aqui e operacao real.",
    )}

    ${secao(
      "Armazenamento",
      "Linha ilegivel e dano fisico. Linha invalida e um registro que alguem colocou no disco por fora do contrato. Somar as duas esconderia a segunda.",
      `<div class="linha-selos" style="margin-bottom:var(--space-3)">${selo(a.selo)}</div>
      <div class="metric-strip" style="margin-bottom:var(--space-3)">
        ${metric("Falhas de escrita", { observado: true, valor: a.falhas_de_io })}
        ${metric("Linhas ilegiveis", { observado: true, valor: a.linhas_corrompidas })}
        ${metric("Linhas recusadas", { observado: true, valor: a.linhas_invalidas.length })}
      </div>
      <p class="secao__sub">Uma linha recusada pode carregar dado de pessoa. O diagnostico guarda codigo, tamanho e hash — o conteudo nao chega a esta tela porque o contrato de leitura nao tem campo para ele.</p>
      ${corpoInvalidas}`,
    )}

    ${blocoLimitacoes(vm.limitacoes)}
  `;
}
