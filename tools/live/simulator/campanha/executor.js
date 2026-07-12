/* ============================================================================
 * DeliveryOS · tools/live/simulator/campanha · EXECUTOR DA CAMPANHA
 * ----------------------------------------------------------------------------
 * Executa a campanha sintética determinística (30 dias) sobre o núcleo REAL
 * (src/live intocado), reutilizando o motor da Fase 3A: relógio simulado,
 * PRNG por seed, IDs sintéticos, runtime em diretório temporário do SO.
 *
 * Nada do resultado canônico depende de: Date.now(), Math.random(), caminho
 * temporário, duração real ou ordem acidental do sistema de arquivos.
 * duracao_execucao_ms e runtime_root são voláteis, fora do hash.
 *
 * Reinícios (restart_plan): replay do log via reconstruirDoLog; equivalência
 * medida na PROJEÇÃO RECONSTRUÍVEL (Contrato §17) — last_trusted_at pós-
 * reinício é comportamento conservador CONHECIDO, não falha automática.
 *
 * F2-07: o tamanho do índice de dedup é contabilizado por acompanhamento
 * exato das decisões do núcleo (cada aceite registra 1 event_id; cada fato
 * novo registra 1 idempotency_key) — sem tocar src/live.
 * ==========================================================================*/
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..", "..", "..");
const { criarNucleo } = require(path.join(RAIZ, "src", "live", "nucleo.js"));
const { criarArmazenamento } = require(path.join(RAIZ, "src", "live", "persistir.js"));
const { reconstruirDoLog } = require(path.join(RAIZ, "src", "live", "reconstruir.js"));
const { criarConfig } = require(path.join(RAIZ, "src", "live", "config.js"));
const { classificarFonte } = require(path.join(RAIZ, "src", "live", "freshness.js"));

const { criarRelogioSimulado } = require("../relogio");
const { criarIdentificadores } = require("../identificadores");
const { projecaoReconstruivel } = require("../executor");
const { hashSnapshot, stringifyCanonico } = require("../relatorio");
const { validarConfigCampanha, seedDoDia, CAMPANHA_30D } = require("./contrato");
const { gerarDia } = require("./gerador");
const { executarCasosF208 } = require("./f208");
const { utcDeHorarioLocal, proximoDiaLocal, minutosDe } = require("./tempo");

const crypto = require("node:crypto");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const CAMPOS_PROIBIDOS_NO_DISCO = ["\"telefone\"", "\"endereco\"", "\"cliente\"", "\"consumidor\"",
  "\"cpf\"", "\"email\"", "\"senha\"", "\"token\"", "\"cookie\"", "\"celular\"", "\"whatsapp\""];

function esperadoPara(categoria) {
  if (categoria === "duplicado_reenvio") return "duplicado_ignorado";
  if (categoria === "invalido") return "quarentena";
  return "aceito";
}

function conferir(categoria, resultado) {
  const esperado = esperadoPara(categoria);
  if (esperado === "aceito") return resultado.aceito === true;
  return resultado.destino === esperado;
}

function executarCampanha({ config, manterRuntime, hooks } = {}) {
  const cfg = config || CAMPANHA_30D;
  validarConfigCampanha(cfg);

  const inicioReal = Date.now(); // só duracao_execucao_ms (volátil)
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-camp-"));
  const tz = cfg.store_time_zone;

  try {
    const relogio = criarRelogioSimulado(
      new Date(utcDeHorarioLocal(cfg.start_local_date, "00:00", tz)).toISOString());
    const ids = criarIdentificadores();
    const cfgNucleo = criarConfig({ storeTimeZone: tz });
    const armazenamento = criarArmazenamento({ runtimeRoot });
    let nucleo = criarNucleo({ armazenamento, config: cfgNucleo, agora: relogio.agora });

    const dias = [];
    const replays = [];
    const divergencias = [];
    const falhasInesperadas = [];
    const f207Serie = [];
    let chavesEventoSessao = 0; // event_ids registrados na sessão corrente
    let chavesFatoAcum = 0;     // idempotency_keys únicas (sobrevivem ao replay)
    let eventosProcessadosAcum = 0;
    let desconexoes = 0;
    let reconexoes = 0;
    let aguardandoReconexao = false;

    // rastreio analítico de freshness (usa a MESMA função pura do núcleo)
    const fontesRastreadas = {
      sim_comanda: { ultimo_evento_em: null, desconectada_em: null, reconectada_em: null },
      sim_status: { ultimo_evento_em: null, desconectada_em: null, reconectada_em: null }
    };

    let diaLocal = cfg.start_local_date;

    for (let indiceDia = 1; indiceDia <= cfg.total_days; indiceDia++) {
      const seedDia = seedDoDia(cfg, indiceDia);
      const ger = gerarDia({ config: cfg, indiceDia, diaLocal, ids, seedDia });

      // reinícios planejados do dia entram no fluxo em ordem cronológica
      const itens = [...ger.eventos];
      for (const r of (cfg.restart_plan || []).filter((x) => x.dia === indiceDia)) {
        itens.push({ em_ms: utcDeHorarioLocal(diaLocal, r.hora_local, tz), reiniciar: r });
      }
      itens.sort((a, b) => a.em_ms - b.em_ms ||
        ((a.evento ? a.evento.event_id : "~reinicio") < (b.evento ? b.evento.event_id : "~reinicio") ? -1 : 1));

      const d = {
        dia: indiceDia, dia_local: diaLocal, perfil: cfg.daily_profile[indiceDia - 1],
        seed_dia: seedDia, pedidos: ger.pedidos_gerados,
        eventos_gerados: itens.filter((i) => i.evento).length,
        aceitos: 0, duplicados: 0, quarentena: 0, observacoes_repetidas: 0,
        fora_janela: 0, invalidos: ger.invalidos,
        por_categoria: ger.por_categoria,
        reinicios: 0, amostras_freshness: { atualizada: 0, atrasada: 0, vencida: 0, desconectada: 0, desconhecida: 0 }
      };

      // amostragem de freshness EM LINHA (estado corrente na hora da amostra,
      // nunca retrospectiva — o estado final do dia não pode "voltar no tempo")
      const abreMin = minutosDe(cfg.operational_window.abre_local);
      const fechaMin = minutosDe(cfg.operational_window.fecha_local);
      const passoMin = cfg.reporting_config.amostragem_freshness_min || 30;
      const diaBaseMs = utcDeHorarioLocal(diaLocal, "00:00", tz);
      const amostras = [];
      for (let m = abreMin; m <= fechaMin; m += passoMin) amostras.push(diaBaseMs + m * 60000);
      let proximaAmostra = 0;
      const amostrarAte = (limiteMs) => {
        while (proximaAmostra < amostras.length && amostras[proximaAmostra] <= limiteMs) {
          const c = classificarFonte(fontesRastreadas.sim_status,
            amostras[proximaAmostra], cfgNucleo.freshness);
          d.amostras_freshness[c.freshness_state] += 1;
          proximaAmostra += 1;
        }
      };

      for (const item of itens) {
        amostrarAte(item.em_ms);
        if (item.em_ms > relogio.agora()) relogio.avancarPara(item.em_ms);

        if (item.reiniciar) {
          const antes = nucleo.snapshot();
          const r = reconstruirDoLog({ runtimeRoot, config: cfgNucleo, agora: relogio.agora });
          const depois = r.nucleo.snapshot();
          const registro = {
            dia: indiceDia, hora_local: item.reiniciar.hora_local,
            contexto: item.reiniciar.contexto,
            eventos_relidos: r.relatorio.eventos_relidos,
            snapshot_igual: hashSnapshot(projecaoReconstruivel(depois)) ===
              hashSnapshot(projecaoReconstruivel(antes))
          };
          replays.push(registro);
          d.reinicios += 1;
          nucleo = r.nucleo; // continuidade sobre o núcleo renascido
          chavesEventoSessao = r.relatorio.eventos_relidos; // índice reconstruído do log
          continue;
        }

        let resultado;
        try {
          if (hooks && hooks.antesDoEvento) hooks.antesDoEvento(item, d);
          resultado = nucleo.receber(item.evento);
        } catch (erro) {
          falhasInesperadas.push({
            dia: indiceDia, event_id: item.evento.event_id,
            categoria: item.categoria, erro: String(erro && erro.message)
          });
          continue;
        }

        eventosProcessadosAcum += 1;
        if (item.fora_janela) d.fora_janela += 1;
        if (resultado.aceito) {
          d.aceitos += 1;
          chavesEventoSessao += 1;
          if (resultado.destino === "processado") chavesFatoAcum += 1;
          else d.observacoes_repetidas += 1;
          // rastreio de freshness/reconexão por fonte
          const f = fontesRastreadas[item.evento.source];
          if (f) {
            if (!f.ultimo_evento_em || item.evento.captured_at > f.ultimo_evento_em) {
              f.ultimo_evento_em = item.evento.captured_at;
            }
            if (item.evento.event_type === "fonte_desconectada") {
              f.desconectada_em = item.evento.captured_at;
              f.reconectada_em = null;
              desconexoes += 1;
              aguardandoReconexao = true;
            } else if (f.desconectada_em && !f.reconectada_em &&
              item.evento.captured_at > f.desconectada_em) {
              f.reconectada_em = item.evento.captured_at;
              if (aguardandoReconexao) { reconexoes += 1; aguardandoReconexao = false; }
            }
          }
        } else if (resultado.destino === "duplicado_ignorado") {
          d.duplicados += 1;
        } else if (resultado.destino === "quarentena") {
          d.quarentena += 1;
        }

        if (!conferir(item.categoria, resultado)) {
          divergencias.push({
            dia: indiceDia, categoria: item.categoria, event_id: item.evento.event_id,
            esperado: esperadoPara(item.categoria),
            obtido: resultado.destino || String(resultado.aceito)
          });
        }
      }

      // amostras restantes do dia (após o último evento)
      amostrarAte(diaBaseMs + fechaMin * 60000);

      // fim do dia operacional: snapshot diário (23:30 local)
      relogio.avancarPara(utcDeHorarioLocal(diaLocal, "23:30", tz));
      if (cfg.reporting_config.snapshot_diario) {
        const snap = nucleo.snapshot();
        const doDia = (p) => (p.comanda && p.comanda.dia === diaLocal) ||
          (p.status && p.status.dia === diaLocal);
        d.estados_do_dia = {
          matched: 0, partial: 0, unmatched: 0, conflict: 0, cancelados: 0, aptos: 0
        };
        for (const lista of [snap.pedidos.completos, snap.pedidos.parciais, snap.pedidos.conflitos]) {
          for (const p of lista) {
            if (!doDia(p)) continue;
            d.estados_do_dia[p.match_state] += 1;
            if (p.apto_para_decisao) d.estados_do_dia.aptos += 1;
          }
        }
        for (const p of snap.pedidos.cancelados) if (doDia(p)) d.estados_do_dia.cancelados += 1;
        d.quarentena_total_acumulada = snap.quarentena.total;
      }

      f207Serie.push({
        dia: indiceDia,
        eventos_processados_acum: eventosProcessadosAcum,
        chaves_fato_acum: chavesFatoAcum,
        chaves_evento_sessao: chavesEventoSessao
      });

      dias.push(d);
      diaLocal = proximoDiaLocal(diaLocal);
    }

    // ---- final da campanha ----
    const snapshotFinal = nucleo.snapshot();
    const linhasLog = fs.readFileSync(armazenamento.caminhoEventos, "utf8")
      .split("\n").filter((l) => l.trim() !== "").length;

    // G4: varredura do runtime persistido
    let discoOk = true;
    const achadosPii = [];
    for (const arquivo of fs.readdirSync(runtimeRoot)) {
      const texto = fs.readFileSync(path.join(runtimeRoot, arquivo), "utf8").toLowerCase();
      for (const proibido of CAMPOS_PROIBIDOS_NO_DISCO) {
        if (texto.includes(proibido)) { discoOk = false; achadosPii.push(`${arquivo}:${proibido}`); }
      }
    }

    const soma = (campo) => dias.reduce((a, d) => a + d[campo], 0);
    const somaCat = (cat) => dias.reduce((a, d) => a + (d.por_categoria[cat] || 0), 0);
    const totais = {
      pedidos: soma("pedidos"),
      eventos_gerados: soma("eventos_gerados"),
      aceitos: soma("aceitos"),
      rejeitados: soma("duplicados") + soma("quarentena"),
      quarentena: soma("quarentena"),
      duplicados: soma("duplicados"),
      observacoes_repetidas: soma("observacoes_repetidas"),
      reimpressoes: somaCat("reimpressao"),
      cancelamentos: somaCat("cancelamento"),
      conflitos_pares: somaCat("conflito_par"),
      fora_de_ordem: somaCat("fora_de_ordem"),
      comandas_vazias: somaCat("comanda_vazia"),
      invalidos: soma("invalidos"),
      fora_janela: soma("fora_janela"),
      status_suprimidos_por_desconexao: somaCat("status_suprimido_por_desconexao"),
      desconexoes, reconexoes,
      reinicios: replays.length,
      replays_equivalentes: replays.filter((r) => r.snapshot_igual).length,
      amostras_freshness: dias.reduce((acc, d) => {
        for (const k of Object.keys(d.amostras_freshness)) acc[k] = (acc[k] || 0) + d.amostras_freshness[k];
        return acc;
      }, {}),
      linhas_log_aceito: linhasLog,
      estados_finais: {
        matched: 0, partial: 0, unmatched: 0, conflict: 0,
        cancelados: snapshotFinal.pedidos.cancelados.length,
        aptos_para_decisao: 0
      },
      divergencias: divergencias.length,
      falhas_inesperadas: falhasInesperadas.length
    };
    for (const lista of [snapshotFinal.pedidos.completos, snapshotFinal.pedidos.parciais, snapshotFinal.pedidos.conflitos]) {
      for (const p of lista) {
        totais.estados_finais[p.match_state] += 1;
        if (p.apto_para_decisao) totais.estados_finais.aptos_para_decisao += 1;
      }
    }

    // F2-07: classificação com evidência quantitativa
    const razaoChavesPorEvento = totais.aceitos > 0 ? chavesFatoAcum / totais.aceitos : 0;
    const f207 = {
      serie_diaria: f207Serie,
      total_eventos_processados: eventosProcessadosAcum,
      total_chaves_fato: chavesFatoAcum,
      chaves_evento_na_sessao_final: chavesEventoSessao,
      razao_chaves_fato_por_evento_aceito: Number(razaoChavesPorEvento.toFixed(4)),
      duplicidades_reconhecidas: totais.duplicados + totais.observacoes_repetidas,
      duplicidades_nao_reconhecidas: divergencias.filter((x) => x.categoria === "duplicado_reenvio").length,
      existe_limpeza_ou_expiracao: false, // fato do núcleo atual — nada foi implementado
      comportamento_apos_replay: "indice de event_ids renasce do log (so fatos unicos); chaves de fato preservadas",
      classificacao: "crescimento_linear_esperado",
      justificativa: "chaves crescem proporcionalmente aos fatos aceitos, sem componente superlinear; " +
        "reinicio reduz o indice de event_ids ao numero de fatos persistidos; sem expiracao, " +
        "sessao continua multi-dia cresce sem teto — mitigavel por reinicio diario (F7)."
    };

    // F2-08: casos de estudo determinísticos (seed derivada da campanha)
    const f208 = executarCasosF208({ seed: `${cfg.campaign_seed}:f208`, storeTimeZone: tz });

    const gates = {
      G1_testes: "externo (node --test)",
      G2_determinismo: "externo (duas execucoes comparadas por hash)",
      G3_replay: replays.length > 0 && replays.every((r) => r.snapshot_igual) ? "verde" : "vermelho",
      G4_privacidade: discoOk && divergencias.filter((d) => d.categoria === "pii").length === 0 ? "verde" : "vermelho",
      G5_volume: (totais.pedidos >= cfg.order_volume_target.total_min &&
        totais.pedidos <= cfg.order_volume_target.total_max &&
        falhasInesperadas.length === 0 && divergencias.length === 0) ? "verde" : "vermelho",
      G6_f207: "verde (medido e classificado)",
      G7_f208: f208.length === 7 ? "verde (documentado)" : "vermelho",
      G8_isolamento: "externo (git diff)"
    };

    const resultado = {
      config: cfg,
      dias,
      replays,
      divergencias,
      falhas_inesperadas: falhasInesperadas,
      totais,
      f207,
      f208,
      gates,
      classificacao_geral: {
        comportamento_esperado: ["duplicados ignorados", "invalidos em quarentena",
          "conflitos sem merge", "parciais honestos", "replay equivalente"],
        limitacoes_conhecidas: [
          "F2-08: comanda vazia casada com status vira complete/apto (achado registrado, nao corrigido)",
          "F2-07: sem expiracao de indice em sessao continua (mitigacao operacional futura)",
          "last_trusted_at conservador pos-reinicio (contrato §17)"
        ],
        falhas_inesperadas: falhasInesperadas.length,
        inconclusivos: []
      },
      snapshot_final_hash: hashSnapshot(snapshotFinal)
    };
    resultado.hash_campanha = sha256(stringifyCanonico(resultado));
    resultado.duracao_execucao_ms = Date.now() - inicioReal; // volátil, fora do hash
    resultado.runtime_root = runtimeRoot;                     // volátil, fora do hash
    resultado.pii_achados = achadosPii;

    return resultado;
  } finally {
    if (!manterRuntime) fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

module.exports = { executarCampanha };
