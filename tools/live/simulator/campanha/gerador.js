/* ============================================================================
 * DeliveryOS · tools/live/simulator/campanha · GERADOR DE DIA SINTÉTICO
 * ----------------------------------------------------------------------------
 * Gera o fluxo de eventos de UM dia operacional a partir da seed diária:
 * mesmo (config, seed) => mesmos pedidos, mesmos eventos, mesmos timestamps.
 *
 * Janela operacional: eventos do fluxo normal só dentro de [abre, fecha).
 * Fronteira das 23:00: nos dias do boundary_plan, uma pequena quantidade de
 * eventos é gerada DELIBERADAMENTE em >= fecha_local, marcada fora_janela —
 * continuam no MESMO dia local (nunca carregados para o dia anterior) e não
 * contaminam as métricas do fluxo normal.
 *
 * Dia com desconexão (disconnect_plan): a fonte de status emite
 * fonte_desconectada e fica MUDA na janela; comandas seguem; o retorno dos
 * status após a janela é a evidência fresca que reconecta.
 * ==========================================================================*/
"use strict";

const ev = require("../eventos");
const { criarAleatorio } = require("../aleatorio");
const { PERFIS } = require("./contrato");
const { utcDeHorarioLocal, minutosDe } = require("./tempo");

const MIN = 60 * 1000;

function sortearCategoria(aleatorio, mix) {
  const alvo = aleatorio.proximo();
  let acumulado = 0;
  for (const [categoria, peso] of Object.entries(mix)) {
    acumulado += peso;
    if (alvo < acumulado) return categoria;
  }
  return "fluxo_normal";
}

/**
 * @returns {{ eventos: Array<{em_ms:number, evento:object, categoria:string,
 *             fora_janela:boolean}>, pedidos_gerados:number,
 *             por_categoria:object, invalidos:number, boundary:number }}
 */
function gerarDia({ config, indiceDia, diaLocal, ids, seedDia }) {
  const tz = config.store_time_zone;
  const aleatorio = criarAleatorio(seedDia);
  const perfilNome = config.daily_profile[indiceDia - 1];
  const perfil = PERFIS[perfilNome];
  const diaBaseMs = utcDeHorarioLocal(diaLocal, "00:00", tz);
  const abreMin = minutosDe(config.operational_window.abre_local);
  const fechaMin = minutosDe(config.operational_window.fecha_local);

  const desconexao = (config.disconnect_plan || []).find((d) => d.dia === indiceDia) || null;
  const janelaMuda = desconexao
    ? [minutosDe(desconexao.inicio_local), minutosDe(desconexao.inicio_local) + desconexao.duracao_min]
    : null;

  const saida = [];
  const porCategoria = {};
  const conta = (c) => { porCategoria[c] = (porCategoria[c] || 0) + 1; };

  const tsEm = (minuto, segundos) => diaBaseMs + minuto * MIN + (segundos || 0) * 1000;
  const iso = (ms) => new Date(ms).toISOString();
  const statusMudo = (minuto) => janelaMuda && minuto >= janelaMuda[0] && minuto < janelaMuda[1];

  const emitir = (minuto, evento, categoria, foraJanela) => {
    saida.push({
      em_ms: tsEm(minuto, aleatorio.inteiro(0, 59)),
      evento, categoria, fora_janela: !!foraJanela
    });
  };
  // status/cancelamento respeitam a janela de desconexão (fonte muda)
  const emitirStatusSePossivel = (minuto, evento, categoria) => {
    if (statusMudo(minuto)) { conta("status_suprimido_por_desconexao"); return; }
    emitir(minuto, evento, categoria);
  };

  const ctx = { aleatorio, ids, tz, inicioMs: diaBaseMs };
  const pedidoNovo = () => ({
    ifood: ids.proximoIfood(),
    interno: ids.proximoInterno(),
    job: ids.proximoJob(),
    itens: ev.itensSinteticos(aleatorio)
  });

  const volume = aleatorio.inteiro(perfil.pedidos[0], perfil.pedidos[1]);
  let pedidosGerados = 0;

  for (let i = 0; i < volume; i++) {
    const categoria = sortearCategoria(aleatorio, perfil.mix);
    const t0 = aleatorio.inteiro(abreMin, fechaMin - 45);
    const p = pedidoNovo();
    pedidosGerados += 1;
    conta(categoria);

    // regra do gerador: o carimbo captured_at usa SEMPRE o mesmo minuto da
    // emissão — nunca um carimbo à frente da injeção (senão a guarda de
    // clock skew do núcleo, corretamente, marcaria suspeito).
    if (categoria === "fluxo_normal") {
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      const mPreparo = t0 + aleatorio.inteiro(2, 8);
      emitirStatusSePossivel(mPreparo, ev.eventoStatus(ctx, iso(tsEm(mPreparo)), p, "em_preparo"), categoria);
      const mPronto = t0 + aleatorio.inteiro(12, 35);
      emitirStatusSePossivel(mPronto, ev.eventoStatus(ctx, iso(tsEm(mPronto)), p, "pronto"), categoria);
    } else if (categoria === "comanda_antes_status") {
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      const m = t0 + aleatorio.inteiro(3, 15);
      emitirStatusSePossivel(m, ev.eventoStatus(ctx, iso(tsEm(m)), p, "em_preparo"), categoria);
    } else if (categoria === "status_antes_comanda") {
      emitirStatusSePossivel(t0,
        ev.eventoStatus(ctx, iso(tsEm(t0)), p, "em_preparo"), categoria);
      const m = t0 + aleatorio.inteiro(2, 10);
      emitir(m, ev.eventoComanda(ctx, iso(tsEm(m)), p), categoria);
    } else if (categoria === "cancelamento") {
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      emitirStatusSePossivel(t0 + 4, ev.eventoStatus(ctx, iso(tsEm(t0 + 4)), p, "em_preparo"), categoria);
      const m = t0 + aleatorio.inteiro(10, 25);
      emitirStatusSePossivel(m, ev.eventoCancelamento(ctx, iso(tsEm(m)), p), categoria);
    } else if (categoria === "reimpressao") {
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      emitirStatusSePossivel(t0 + 4, ev.eventoStatus(ctx, iso(tsEm(t0 + 4)), p, "em_preparo"), categoria);
      const m = t0 + aleatorio.inteiro(15, 30);
      emitir(m, ev.eventoReimpressao(ctx, iso(tsEm(m)), p), categoria);
    } else if (categoria === "fora_de_ordem") {
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      // "pronto" chega primeiro (occurred mais novo); "em_preparo" chega
      // DEPOIS com occurred mais velho => última chegada não é a mais nova
      const pronto = ev.eventoStatus(ctx, iso(tsEm(t0 + 20)), p, "pronto");
      pronto.occurred_at = iso(tsEm(t0 + 10));
      emitirStatusSePossivel(t0 + 20, pronto, categoria);
      const preparo = ev.eventoStatus(ctx, iso(tsEm(t0 + 24)), p, "em_preparo");
      preparo.occurred_at = iso(tsEm(t0 + 5));
      emitirStatusSePossivel(t0 + 24, preparo, categoria);
    } else if (categoria === "comanda_vazia") {
      const vazio = { ...p, itens: [] }; // F2-08 no volume da campanha
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), vazio), categoria);
      if (aleatorio.proximo() < 0.5) {
        emitirStatusSePossivel(t0 + 5, ev.eventoStatus(ctx, iso(tsEm(t0 + 5)), vazio, "em_preparo"), categoria);
      }
    } else if (categoria === "duplicado") {
      const comanda = ev.eventoComanda(ctx, iso(tsEm(t0)), p);
      emitir(t0, comanda, categoria);
      emitirStatusSePossivel(t0 + 4, ev.eventoStatus(ctx, iso(tsEm(t0 + 4)), p, "em_preparo"), categoria);
      emitir(t0 + aleatorio.inteiro(6, 12), comanda, "duplicado_reenvio"); // mesma observação de novo
    } else if (categoria === "conflito_par") {
      const b = { ...pedidoNovo(), ifood: p.ifood }; // colisão de curto no dia
      pedidosGerados += 1;
      emitir(t0, ev.eventoComanda(ctx, iso(tsEm(t0)), p), categoria);
      emitir(t0 + 3, ev.eventoComanda(ctx, iso(tsEm(t0 + 3)), b), categoria);
      emitirStatusSePossivel(t0 + 8, ev.eventoStatus(ctx, iso(tsEm(t0 + 8)), p, "em_preparo"), categoria);
    }
  }

  // desconexão declarada da fonte de status (dias do disconnect_plan)
  if (janelaMuda) {
    emitir(janelaMuda[0], ev.eventoFonteDesconectada(ctx, iso(tsEm(janelaMuda[0])), "sim_status"),
      "fonte_desconectada");
    conta("fonte_desconectada");
  }

  // eventos inválidos (quarentena) — quantidade por plano de anomalias
  const invalidos = (config.anomaly_plan.dias_ampliados &&
    config.anomaly_plan.dias_ampliados[indiceDia]) || config.anomaly_plan.invalidos_por_dia || 0;
  for (let i = 0; i < invalidos; i++) {
    const minuto = aleatorio.inteiro(abreMin, fechaMin - 5);
    emitir(minuto, ev.eventoInvalido(ctx, iso(tsEm(minuto)), pedidoNovo()), "invalido");
    conta("invalido");
  }

  // fronteira das 23:00 — deliberada, marcada, mesmo dia local
  let boundary = 0;
  if ((config.boundary_plan.dias || []).includes(indiceDia)) {
    for (let i = 0; i < config.boundary_plan.eventos_por_dia; i++) {
      const minuto = fechaMin + i * 4; // 23:00, 23:04, 23:08…
      const p = pedidoNovo();
      pedidosGerados += 1;
      emitir(minuto, ev.eventoComanda(ctx, iso(tsEm(minuto)), p), "fronteira_23h", true);
      boundary += 1;
      conta("fronteira_23h");
    }
  }

  // ordem cronológica estável (desempate por event_id — determinístico)
  saida.sort((a, b) => a.em_ms - b.em_ms ||
    (a.evento.event_id < b.evento.event_id ? -1 : 1));

  return {
    eventos: saida,
    pedidos_gerados: pedidosGerados,
    por_categoria: porCategoria,
    invalidos,
    boundary
  };
}

module.exports = { gerarDia };
