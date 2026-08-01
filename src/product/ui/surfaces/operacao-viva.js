/**
 * Superficie OPERACAO VIVA — dimensoes da unidade e integridade de cada sinal.
 *
 * A tela separa visualmente OBSERVADO, INFERIDO, CONTEXTO e EVIDENCIA. A
 * separacao nao e decorativa: uma inferencia apresentada como observacao e uma
 * mentira com aparencia de dado.
 */

import {
  blocoLimitacoes,
  cabecalhoSuperficie,
  campo,
  esc,
  estadoTela,
  metric,
  selo,
  secao,
  tabela,
} from "../components/ui.js";

const ROTULO = {
  observacao_direta: "Observado",
  inferencia: "Inferido",
  contexto_operacional: "Contexto",
  evidencia_auxiliar: "Evidencia",
};

const EXPLICACAO = {
  observacao_direta: "Chegou assim da fonte. Ninguem calculou.",
  inferencia: "Foi calculado a partir dos fatos e de um relogio.",
  contexto_operacional: "Descreve o entorno da operacao, nao uma conclusao sobre ela.",
  evidencia_auxiliar: "Serve para auditar de onde veio o resto.",
};

function dimensao(d) {
  return `<article class="cartao ds-reveal">
    <div class="cartao__topo">
      <div>
        <p class="campo__rotulo">${esc(ROTULO[d.classificacao])}</p>
        <h3 class="cartao__nome">${esc(d.nome)}</h3>
      </div>
      <div class="cartao__selos">${selo(d.selo)}</div>
    </div>
    <p class="cartao__pergunta">${esc(d.pergunta)}</p>
    ${campo("Leitura", d.valor)}
    <p class="bloco-limitacao__texto">${esc(EXPLICACAO[d.classificacao])}</p>
  </article>`;
}

export function telaOperacaoViva(vm) {
  const porClasse = (c) => vm.dimensoes.filter((d) => d.classificacao === c);

  const grupo = (c) => {
    const ds = porClasse(c);
    // Um grupo vazio nao pode simplesmente sumir: "nenhuma dimensao e observacao
    // direta" e uma das afirmacoes mais importantes desta tela, e ela so existe
    // se estiver escrita.
    if (ds.length === 0) {
      return secao(
        ROTULO[c],
        EXPLICACAO[c],
        estadoTela(
          "vazio",
          [{ estado: "indisponivel" }],
          `Nenhuma das nove dimensoes e ${ROTULO[c].toLowerCase()}`,
          "Isto nao e uma lacuna da tela: e o que a fonte permite. Apresentar qualquer uma destas dimensoes nesta categoria seria promover calculo a observacao.",
        ),
      );
    }
    return secao(
      ROTULO[c],
      EXPLICACAO[c],
      `<div class="grade" data-colunas="3">${ds.map(dimensao).join("")}</div>`,
    );
  };

  const linhasViagens = vm.viagens.map((v) => [
    `<span class="campo__valor--tecnico">${esc(v.viagem_id)}</span><br><span class="campo__rotulo">${esc(
      v.rotulo_identidade,
    )}</span>`,
    esc(v.estado),
    selo(v.selo_frescor),
    `<span class="campo__valor--tecnico">${esc(v.ultimo_fato_em)}</span>`,
    v.ultima_posicao_em.observado
      ? `<span class="campo__valor--tecnico">${esc(v.ultima_posicao_em.valor)}</span>`
      : selo({ estado: "indisponivel", detalhe: v.ultima_posicao_em.explicacao }),
    esc(String(v.eventos_que_a_compuseram)),
  ]);

  const corpoViagens = vm.sem_dados_suficientes
    ? estadoTela(
        "vazio",
        [{ estado: "indisponivel" }],
        "Sem dados suficientes nesta janela",
        "Nenhum evento entrou na janela projetada. Isto nao afirma que a operacao esta parada — afirma que nao houve o que observar.",
      )
    : tabela(
        ["Viagem", "Estado", "Frescor do sinal", "Ultimo fato", "Ultima posicao", "Eventos"],
        linhasViagens,
      );

  const corpoQuarentena =
    vm.quarentena.length === 0
      ? `<p class="secao__sub">Nenhum evento foi recusado nesta projecao.</p>`
      : tabela(
          ["Evento", "Motivo"],
          vm.quarentena.map((q) => [
            `<span class="campo__valor--tecnico">${esc(q.event_id)}</span>`,
            esc(q.motivo),
          ]),
        );

  return `
    ${cabecalhoSuperficie(
      "Agora · Operacao Viva",
      "As dimensoes da unidade, e o quanto da para confiar em cada uma",
      "Nove perguntas sobre a operacao. Cada resposta diz se foi observada, inferida ou se e apenas contexto — porque as tres nao valem o mesmo numa decisao.",
      vm.selos_de_cabecalho,
    )}

    <section class="secao">
      <div class="metric-strip">
        ${metric("Unidade", { observado: true, valor: vm.unidade })}
        ${metric("Viagens na janela", { observado: true, valor: vm.viagens.length })}
        ${metric("Eventos em quarentena", { observado: true, valor: vm.quarentena.length })}
      </div>
    </section>

    <section class="secao">
      <h2 class="secao__titulo">Integridade do sinal</h2>
      <p class="secao__sub">Isto e sobre a INFORMACAO, nao sobre a operacao. Um sinal desatualizado nao diz que a rua parou; diz que nao sabemos.</p>
      <div class="linha-selos">${selo(vm.integridade_do_sinal)}</div>
      <div class="ds-pulse" data-vivo="${
        vm.integridade_do_sinal.estado === "saudavel" ? "sim" : "nao"
      }" role="presentation" style="margin-top:var(--space-2);max-width:220px"></div>
    </section>

    ${grupo("observacao_direta")}
    ${grupo("inferencia")}
    ${grupo("contexto_operacional")}

    ${secao(
      "Viagens projetadas",
      "Cada linha e uma VIAGEM. Esta projecao nao carrega identidade de pedido, entao nenhuma coluna aqui e um pedido.",
      corpoViagens,
    )}

    ${secao("Eventos recusados", "Evento incompativel e recusado com motivo, nunca descartado em silencio.", corpoQuarentena)}

    ${secao(
      "Procedencia desta leitura",
      "De onde veio, quando foi calculada, e ate onde ela sabe.",
      `<div class="grade" data-colunas="2">
        ${campo("Versao da projecao", { observado: true, valor: vm.versao_da_projecao }, { tecnico: true })}
        ${campo("Calculada em", { observado: true, valor: vm.calculada_em }, { tecnico: true })}
        ${campo("Ultimo evento aplicado", vm.cursor, { tecnico: true })}
        ${campo("Historico de mudanca", vm.historico_de_mudanca)}
      </div>`,
    )}

    ${blocoLimitacoes(vm.limitacoes)}
  `;
}
