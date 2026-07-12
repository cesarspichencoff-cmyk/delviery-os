/* Fase 3B — unidades da campanha: configuração inválida, seeds diárias,
 * tempo local/fronteira 23:00, PII, F2-08, gate vermelho, seed diferente. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CAMPANHA_30D, validarConfigCampanha, seedDoDia } =
  require("../../../tools/live/simulator/campanha/contrato");
const { utcDeHorarioLocal, proximoDiaLocal } =
  require("../../../tools/live/simulator/campanha/tempo");
const { gerarDia } = require("../../../tools/live/simulator/campanha/gerador");
const { executarCampanha } = require("../../../tools/live/simulator/campanha/executor");
const { executarCasosF208 } = require("../../../tools/live/simulator/campanha/f208");
const { criarIdentificadores } = require("../../../tools/live/simulator/identificadores");
const { acharCampoProibido } = require("../../../src/live/sanitizar");
const { localDayKey } = require("../../../src/live/normalizar");

const TZ = "America/Sao_Paulo";
const miniConfig = (extra) => ({
  ...CAMPANHA_30D,
  total_days: 2,
  daily_profile: ["calmo", "pressao"],
  restart_plan: [{ dia: 2, hora_local: "15:00", contexto: "teste" }],
  disconnect_plan: [],
  boundary_plan: { dias: [1], eventos_por_dia: 2 },
  anomaly_plan: { invalidos_por_dia: 1, dias_ampliados: {} },
  order_volume_target: { total_min: 1, total_max: 99999 },
  ...(extra || {})
});

test("3. configuração inválida falha explicitamente", () => {
  assert.throws(() => executarCampanha({ config: { ...CAMPANHA_30D, campaign_seed: "" } }),
    /config_campanha_invalida: campaign_seed/);
  assert.throws(() => validarConfigCampanha({ ...CAMPANHA_30D, store_time_zone: "Fuso/Errado" }),
    /IANA invalido/);
  assert.throws(() => validarConfigCampanha({ ...CAMPANHA_30D, total_days: 5 }),
    /daily_profile/); // calendário de 30 não serve para 5 dias
  assert.throws(() => validarConfigCampanha(miniConfig({ daily_profile: ["calmo", "perfil_x"] })),
    /perfil desconhecido/);
  assert.throws(() => validarConfigCampanha(miniConfig({
    operational_window: { abre_local: "23:00", fecha_local: "11:00" }
  })), /operational_window/);
});

test("2. seeds diárias derivam da seed principal de forma determinística", () => {
  assert.equal(seedDoDia(CAMPANHA_30D, 1), "deliveryos-3b-sintetico:dia:1");
  assert.equal(seedDoDia(CAMPANHA_30D, 30), "deliveryos-3b-sintetico:dia:30");
  assert.notEqual(seedDoDia(CAMPANHA_30D, 1), seedDoDia(CAMPANHA_30D, 2));
});

test("tempo local: conversão explícita por fuso IANA, sem offset escondido", () => {
  // 11:00 em São Paulo (UTC-3) = 14:00Z
  assert.equal(new Date(utcDeHorarioLocal("2026-08-01", "11:00", TZ)).toISOString(),
    "2026-08-01T14:00:00.000Z");
  // 11:00 em Tóquio (UTC+9) = 02:00Z
  assert.equal(new Date(utcDeHorarioLocal("2026-08-01", "11:00", "Asia/Tokyo")).toISOString(),
    "2026-08-01T02:00:00.000Z");
  assert.equal(proximoDiaLocal("2026-08-31"), "2026-09-01");
  assert.throws(() => utcDeHorarioLocal("2026-08-01", "xx:00", TZ), /tempo_local_invalido/);
});

test("8a. eventos de fronteira ficam em >=23:00 do MESMO dia local (nunca no dia anterior)", () => {
  const cfg = miniConfig();
  const ger = gerarDia({
    config: cfg, indiceDia: 1, diaLocal: "2026-08-01",
    ids: criarIdentificadores(), seedDia: "seed-fronteira"
  });
  const fronteira = ger.eventos.filter((e) => e.fora_janela);
  assert.equal(fronteira.length, 2);
  for (const e of fronteira) {
    assert.equal(localDayKey(e.evento.captured_at, TZ), "2026-08-01"); // mesmo dia local
    const fechaMs = utcDeHorarioLocal("2026-08-01", "23:00", TZ);
    assert.ok(e.em_ms >= fechaMs, "fronteira deve estar em >= 23:00 local");
  }
  // e o fluxo normal fica todo ANTES das 23:00
  for (const e of ger.eventos.filter((x) => !x.fora_janela)) {
    assert.ok(e.em_ms < utcDeHorarioLocal("2026-08-01", "23:00", TZ) + 60000);
  }
});

test("11a. nenhum evento gerado contém campo proibido de PII (varredura recursiva)", () => {
  const cfg = miniConfig();
  let dia = "2026-08-01";
  const ids = criarIdentificadores();
  for (let i = 1; i <= cfg.total_days; i++) {
    const ger = gerarDia({ config: cfg, indiceDia: i, diaLocal: dia, ids, seedDia: seedDoDia(cfg, i) });
    for (const e of ger.eventos) {
      assert.equal(acharCampoProibido(e.evento, "", 0), null);
      assert.match(e.evento.event_id, /^SIM-EVENT-\d{4,}$/);
    }
    dia = proximoDiaLocal(dia);
  }
});

test("11b. runtime da mini-campanha não contém nomes de campos proibidos", () => {
  const r = executarCampanha({ config: miniConfig(), manterRuntime: true });
  try {
    let disco = "";
    for (const arq of fs.readdirSync(r.runtime_root)) {
      disco += fs.readFileSync(path.join(r.runtime_root, arq), "utf8").toLowerCase();
    }
    for (const nome of ["\"telefone\"", "\"endereco\"", "\"cliente\"", "\"cpf\"", "\"email\"", "\"senha\""]) {
      assert.ok(!disco.includes(nome), `campo proibido ${nome} no runtime`);
    }
    assert.deepEqual(r.pii_achados, []);
  } finally {
    fs.rmSync(r.runtime_root, { recursive: true, force: true });
  }
});

test("14. seed diferente produz campanha diferente e ainda válida", () => {
  const a = executarCampanha({ config: miniConfig() });
  const b = executarCampanha({ config: miniConfig({ campaign_seed: "outra-seed-sintetica" }) });
  assert.notEqual(a.hash_campanha, b.hash_campanha);
  assert.notEqual(a.totais.pedidos, 0);
  assert.equal(b.totais.falhas_inesperadas, 0);
  assert.equal(b.gates.G3_replay, "verde"); // válida: replays continuam equivalentes
});

test("15. falha inesperada torna o gate G5 vermelho — nunca silenciosa", () => {
  let disparou = false;
  const r = executarCampanha({
    config: miniConfig(),
    hooks: {
      antesDoEvento(item) {
        if (!disparou && item.categoria === "fluxo_normal") {
          disparou = true;
          throw new Error("falha-injetada-para-teste");
        }
      }
    }
  });
  assert.equal(r.totais.falhas_inesperadas, 1);
  assert.equal(r.falhas_inesperadas[0].erro, "falha-injetada-para-teste");
  assert.equal(r.gates.G5_volume, "vermelho");
});

test("10. F2-08 — as sete variações de comanda vazia, comportamento documentado", () => {
  const casos = executarCasosF208({ seed: "seed-f208-teste", storeTimeZone: TZ });
  assert.equal(casos.length, 7);
  const por = Object.fromEntries(casos.map((c) => [c.caso, c]));

  // vazia que depois recebe composição via pedido_alterado
  assert.equal(por.f208_vazia_depois_recebe_composicao.itens_atuais, 1);

  // vazia que permanece vazia: aceita, parcial/unmatched, nunca apta
  assert.equal(por.f208_vazia_permanece_vazia.aceito, true);
  assert.equal(por.f208_vazia_permanece_vazia.apto_para_decisao, false);
  assert.equal(por.f208_vazia_permanece_vazia.itens_atuais, 0);

  // vazia duplicada: dedup segura o segundo envio
  assert.equal(por.f208_vazia_duplicada.duplicados, 1);

  // ACHADO F2-08 (registrado, não corrigido): vazia casada com status vira
  // matched/complete e APTA para decisão com 0 itens — risco operacional real.
  for (const caso of ["f208_vazia_apos_status", "f208_vazia_antes_de_status"]) {
    assert.equal(por[caso].match_state, "matched");
    assert.equal(por[caso].completeness, "complete");
    assert.equal(por[caso].apto_para_decisao, true); // <- o achado
    assert.equal(por[caso].itens_atuais, 0);
  }

  // vazia cancelada: histórico preservado, cancelado true
  assert.equal(por.f208_vazia_seguida_de_cancelamento.cancelado, true);

  // vazia atravessa reinício: replay equivalente e casamento pós-reinício
  assert.equal(por.f208_vazia_atravessando_reinicio.replay.executado, true);
  assert.equal(por.f208_vazia_atravessando_reinicio.replay.snapshot_igual, true);
  assert.equal(por.f208_vazia_atravessando_reinicio.match_state, "matched");

  // determinismo dos casos
  const casos2 = executarCasosF208({ seed: "seed-f208-teste", storeTimeZone: TZ });
  assert.deepEqual(casos2.map((c) => c.hash_resultado), casos.map((c) => c.hash_resultado));
});
