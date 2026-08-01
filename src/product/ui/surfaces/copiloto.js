/**
 * Superficie COPILOTO SHADOW — propostas que nao executam nada.
 *
 * Esta tela NAO tem botao de acao. Nao ha "aplicar", "executar", "aceitar",
 * "mover", "despachar" nem "retirar". Os unicos controles sao os inspetores, que
 * mostram mais texto. A ausencia de acao e o produto, e o teste
 * "copiloto: a superficie nao oferece execucao" existe para impedir que alguem
 * acrescente um botao por gentileza.
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
} from "../components/ui.js";

function recomendacao(r) {
  const confianca = r.confianca.observado
    ? `<div class="campo"><span class="campo__rotulo">Confianca</span>
        <div class="ds-meter" role="img" aria-label="Confianca de ${Math.round(
          r.confianca.valor * 100,
        )} por cento, sustentada por ${r.evidencias.length} evidencia(s)">
          <div class="ds-meter__fill" style="width:${Math.round(
            r.confianca.valor * 100,
          )}%"></div>
        </div>
        <span class="campo__valor--tecnico">${Math.round(r.confianca.valor * 100)}%</span>
      </div>`
    : campo("Confianca", r.confianca);

  return `<article class="rec-card ds-reveal" data-ativa="${r.ativa ? "sim" : "nao"}">
    <div class="linha-selos">
      ${selo(r.selo_ciclo_de_vida)}
      ${selo(r.selo_evidencia)}
      ${selo(r.selo_procedencia)}
      ${selo(r.selo_decisao_humana)}
    </div>
    <h3 class="rec-card__titulo">${esc(r.titulo)}</h3>
    <p class="rec-card__descricao">${esc(r.descricao)}</p>
    <div class="grade" data-colunas="2">
      ${campo("Sobre o que fala", { observado: true, valor: r.rotulo_escopo })}
      ${campo("Pedido", r.pedido_ref, { tecnico: true })}
      ${confianca}
      ${campo("Risco", { observado: true, valor: r.risco })}
      ${campo("Valida ate", { observado: true, valor: r.validade_ate }, { tecnico: true })}
      ${campo("Motivo de saida", r.motivo_de_saida)}
    </div>
    <div class="campo"><span class="campo__rotulo">Motivo</span><span class="campo__valor">${esc(
      r.motivo,
    )}</span></div>
    ${blocoEvidencia(r.evidencias, "Evidencia que a sustenta")}
    ${inspetor(
      `rec-${esc(r.id)}`,
      "Ver limitacoes, sinais indisponiveis e a volta ate a origem",
      `<div class="pilha">
        <div class="campo"><span class="campo__rotulo">Limitacoes declaradas</span>${
          r.limitacoes.length
            ? `<ul class="bloco-evidencia__lista">${r.limitacoes
                .map((l) => `<li>${esc(l)}</li>`)
                .join("")}</ul>`
            : `<span class="campo__valor">Nenhuma limitacao declarada.</span>`
        }</div>
        <div class="campo"><span class="campo__rotulo">Sinais que nao foi possivel apurar</span>${
          r.indisponivel.length
            ? `<ul class="bloco-evidencia__lista">${r.indisponivel
                .map((l) => `<li>${esc(l)}</li>`)
                .join("")}</ul>`
            : `<span class="campo__valor">Todos os sinais desta politica foram apurados.</span>`
        }</div>
        <div class="campo"><span class="campo__rotulo">Volta ate a origem</span><span class="campo__valor campo__valor--tecnico">${esc(
          r.volta_ate_a_origem,
        )}</span></div>
      </div>`,
    )}
    <p class="rec-card__sombra">${esc(r.porque_nao_executada)}</p>
  </article>`;
}

export function telaCopiloto(vm) {
  const corpoAtivas = vm.sem_recomendacao_sustentada
    ? estadoTela(
        "vazio",
        [{ estado: "shadow" }, { estado: "evidencia_insuficiente" }],
        "Nenhuma proposta sustentada agora",
        "Nao ha, nesta leitura, conclusao com evidencia suficiente para sustentar uma proposta. Ausencia de proposta e um bom estado: significa que nada foi inventado para preencher a tela.",
      )
    : `<div class="grade" data-colunas="2">${vm.ativas.map(recomendacao).join("")}</div>`;

  const corpoFora =
    vm.fora_de_atividade.length === 0
      ? `<p class="secao__sub">Nenhuma proposta saiu de atividade nesta leitura.</p>`
      : `<div class="grade" data-colunas="2">${vm.fora_de_atividade
          .map(recomendacao)
          .join("")}</div>`;

  const corpoRecusas =
    vm.recusas.length === 0
      ? `<p class="secao__sub">Nenhuma conclusao foi recusada nesta leitura.</p>`
      : `<ul class="lista-operacional">${vm.recusas
          .map(
            (r) =>
              `<li class="fonte-linha">${selo(r.selo)}<span class="fonte-linha__id">${
                r.ref.observado ? esc(r.ref.valor) : "sem referencia"
              }</span><span class="campo__valor">${esc(r.motivo)}</span></li>`,
          )
          .join("")}</ul>`;

  return `
    ${cabecalhoSuperficie(
      "Entendimento · Copiloto",
      "Propostas em sombra. Nenhuma acao e executada",
      "O Copiloto observa e propoe. Ele nao move pedido, nao altera capacidade, nao dispara integracao e nao publica comando. Quem decide e uma pessoa — e esta tela nao tem por onde decidir.",
      vm.selos_de_cabecalho,
    )}

    <section class="secao">
      <div class="metric-strip">
        ${metric("Propostas ativas", { observado: true, valor: vm.ativas.length })}
        ${metric("Fora de atividade", { observado: true, valor: vm.fora_de_atividade.length })}
        ${metric("Conclusoes recusadas", { observado: true, valor: vm.recusas.length })}
      </div>
    </section>

    <section class="secao">
      <h2 class="secao__titulo">Modo sombra</h2>
      <p class="secao__sub">Isto nao e uma configuracao que alguem pode desligar nesta tela: e o que o subsistema e.</p>
      <div class="linha-selos">${selos(vm.selos_de_cabecalho)}</div>
      <p class="rec-card__sombra" style="border:none;padding-left:0">Nenhuma acao foi executada. Nenhuma acao sera executada a partir desta superficie.</p>
    </section>

    ${secao(
      "Propostas ativas",
      "Cada proposta carrega evidencia, validade, limitacao e o caminho de volta ate o fato que a produziu.",
      corpoAtivas,
    )}

    ${secao(
      "Fora de atividade",
      "Expirada, retirada e invalidada sao coisas diferentes, e nenhuma delas some da tela: sumir esconderia que existiu.",
      corpoFora,
    )}

    ${secao(
      "Conclusoes recusadas",
      "Evidencia insuficiente nao e um atributo de proposta que existe — e o motivo de ela nao existir, e viaja aqui.",
      corpoRecusas,
    )}

    ${secao(
      "Procedencia desta leitura",
      "",
      `<div class="grade" data-colunas="2">
        ${campo("Unidade avaliada", vm.unidade, { tecnico: true })}
        ${campo("Versao da ponte", { observado: true, valor: vm.versao_da_ponte }, { tecnico: true })}
        ${campo("Avaliado em", { observado: true, valor: vm.avaliado_em }, { tecnico: true })}
        ${campo("Historico de mudancas", vm.historico_de_mudancas)}
      </div>`,
    )}

    ${blocoLimitacoes(vm.limitacoes)}
  `;
}
