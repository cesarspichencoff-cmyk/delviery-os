/**
 * Superficie ENTREGAS — visao operacional, viagens, dispositivo, ocorrencias.
 *
 * A regra mais importante desta tela: `viagem_id` aparece SEMPRE acompanhado do
 * rotulo "Viagem", e nunca dentro de uma celula ou campo de pedido. Viagem nao e
 * pedido, e a tela nao pode ser o lugar onde essa distincao se perde.
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
  secao,
  tabela,
} from "../components/ui.js";

function viagem(v) {
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

  return `<article class="cartao ds-reveal">
    <div class="cartao__topo">
      <div>
        <p class="campo__rotulo">Viagem</p>
        <h3 class="cartao__nome campo__valor--tecnico">${esc(v.viagem_id)}</h3>
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

export function telaEntregas(vm) {
  const corpoViagens =
    vm.viagens.length === 0
      ? estadoTela(
          "vazio",
          [{ estado: "indisponivel" }],
          "Nenhuma viagem nesta leitura",
          "O facade de demonstracao comeca sem viagem montada. Isto nao afirma que a rua esta parada — afirma que nao ha nada montado aqui.",
        )
      : `<div class="grade" data-colunas="2">${vm.viagens.map(viagem).join("")}</div>`;

  const corpoOcorrencias =
    vm.ocorrencias.length === 0
      ? estadoTela(
          "vazio",
          [{ estado: "indisponivel" }],
          "Nenhuma ocorrencia registrada",
          "Nao ha ocorrencia nesta sessao de demonstracao.",
        )
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
    ${cabecalhoSuperficie(
      "Agora · Entregas",
      "Quem esta na rua, com o que, e o que precisa de gente",
      "Esta e a visao de quem responde pela expedicao. Ela mostra o que esta montado e o que nao da para saber — e nao esconde a segunda parte.",
      vm.selos_de_cabecalho,
    )}

    <section class="secao">
      <div class="metric-strip">
        ${metric("Viagens montadas", { observado: true, valor: vm.viagens.length })}
        ${metric("Ocorrencias", { observado: true, valor: vm.ocorrencias.length })}
        ${metric("Fila desta sessao", vm.fila_da_sessao)}
      </div>
      <p class="secao__sub" style="margin-top:var(--space-2)">A fila desta sessao e do navegador. A fila do APARELHO em campo e outra coisa, e aparece abaixo como integracao pendente — porque nao ha rota que a devolva.</p>
    </section>

    <section class="secao">
      <h2 class="secao__titulo">Conexao</h2>
      <p class="secao__sub">Offline e sincronizacao pendente sao estados diferentes: no primeiro nao ha rede, no segundo ha rede e ha fila.</p>
      <div class="linha-selos">${selo(vm.conexao)}</div>
    </section>

    ${secao(
      "Viagens",
      "Cada cartao e uma VIAGEM. O pedido aparece dentro dela, nas paradas — nunca no lugar da identidade da viagem.",
      corpoViagens,
    )}

    ${secao(
      "O aparelho em campo",
      "Credencial, GPS, ultima sincronizacao e fila chegam do Android pela rota de ingestao. Nao existe rota de LEITURA que devolva esse estado.",
      `<div class="grade" data-colunas="2">
        ${campo("Integridade da credencial", d.credencial)}
        ${campo("GPS", d.gps)}
        ${campo("Ultima sincronizacao", d.ultima_sincronizacao)}
        ${campo("Dispositivo revogado", d.revogado)}
        ${campo("Fila offline do aparelho", d.fila_offline)}
      </div>`,
    )}

    ${secao("Ocorrencias", "Ocorrencia que bloqueia disponibilidade exige decisao humana.", corpoOcorrencias)}

    ${secao(
      "Ultima recusa do dominio",
      "Recusa de regra e negocio, nao falha de rede. Ela aparece escrita, nao como erro tecnico.",
      `<div class="grade" data-colunas="2">${campo("Ultima recusa", vm.ultimo_erro)}</div>`,
    )}

    ${blocoLimitacoes(vm.limitacoes)}
  `;
}
