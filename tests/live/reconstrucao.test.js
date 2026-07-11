/* Testes 27-28 da Fase 2: reconstrução após reinício (replay do log, sem
 * duplicar pedidos) e snapshot reconstruído IGUAL ao anterior (idempotência
 * por construção — mesmas linhas => mesmo snapshot). Tudo em temp do SO. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarArmazenamento } = require("../../src/live/persistir");
const { reconstruirDoLog } = require("../../src/live/reconstruir");
const {
  relogioFixo, eventoComanda, eventoStatus, eventoCancelamento, eventoReimpresso,
  CONFIG_TESTE
} = require("./helpers");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-live-replay-"));
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const AGORA = "2026-07-11T19:10:00.000Z";

function popularNucleo(nucleo) {
  nucleo.receber(eventoComanda({ event_id: "com-1" }));
  nucleo.receber(eventoStatus({ event_id: "sta-1" }));
  nucleo.receber(eventoStatus({
    event_id: "sta-2", ifood_short: "0801",
    idempotency_key: "status:sim_status:0801:2026-07-11:em_preparo"
  }));
  nucleo.receber(eventoCancelamento({ event_id: "can-1", ifood_short: "0801" }));
  nucleo.receber(eventoReimpresso({ event_id: "rei-1" }));
  nucleo.receber(eventoComanda({ event_id: "com-1" })); // duplicado de event_id
  nucleo.receber(eventoComanda({ event_id: "quarentena-1", schema_version: "9.9" })); // vai p/ quarentena
}

test("27. reconstrução após reinício: mesmo estado, nenhum pedido duplicado", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    popularNucleo(nucleo);
    const antes = nucleo.snapshot();

    // "reinício": novo processo, novo núcleo, mesmo disco
    const { nucleo: renascido, relatorio } = reconstruirDoLog({
      runtimeRoot: dir, agora: relogioFixo(AGORA), config: CONFIG_TESTE
    });
    const depois = renascido.snapshot();

    // F2-04: o log contém SÓ fatos únicos aceitos — a duplicata de event_id e
    // o evento de quarentena nunca foram anexados (5 linhas, não 7)
    assert.equal(relatorio.eventos_relidos, 5);
    assert.equal(depois.pedidos.completos.length, antes.pedidos.completos.length);
    assert.equal(depois.pedidos.parciais.length, antes.pedidos.parciais.length);
    assert.equal(depois.pedidos.cancelados.length, antes.pedidos.cancelados.length);
    // vias de reimpressão não dobram no replay
    const pedido = depois.pedidos.completos.concat(depois.pedidos.parciais)
      .find((p) => p.comanda && p.comanda.pedido_interno === "0000170512");
    assert.equal(pedido.comanda.vias, 2);
    assert.ok(depois.reconstruido_em !== null);
  } finally { limpar(dir); }
});

test("28. snapshot reconstruído é IGUAL ao anterior (relógio fixo, campo de reconstrução normalizado)", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    popularNucleo(nucleo);
    const antes = nucleo.snapshot();

    const { nucleo: renascido } = reconstruirDoLog({ runtimeRoot: dir, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    const depois = renascido.snapshot();

    // diferenças legítimas: o carimbo de reconstrução e os contadores de
    // RECEPÇÃO (escopo de sessão — duplicatas/quarentenas não são re-anexadas
    // por desenho, F2-04). Todo o resto é idêntico byte a byte.
    const normalizar = (s) => ({ ...s, reconstruido_em: null, recepcao: null });
    assert.deepEqual(normalizar(depois), normalizar(antes));
    // o que é derivado do log continua idêntico mesmo nos contadores
    assert.deepEqual(depois.qualidade, antes.qualidade);
  } finally { limpar(dir); }
});

test("27b. replay não re-persiste: o log não cresce ao reconstruir duas vezes", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    popularNucleo(nucleo);
    const tamanho1 = fs.statSync(arm.caminhoEventos).size;
    const tamanhoQ1 = fs.statSync(arm.caminhoQuarentena).size;

    reconstruirDoLog({ runtimeRoot: dir, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    reconstruirDoLog({ runtimeRoot: dir, agora: relogioFixo(AGORA), config: CONFIG_TESTE });

    assert.equal(fs.statSync(arm.caminhoEventos).size, tamanho1);
    assert.equal(fs.statSync(arm.caminhoQuarentena).size, tamanhoQ1);
  } finally { limpar(dir); }
});

test("27c. reconstrução com linha corrompida no log: tolera, conta e segue", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora: relogioFixo(AGORA), config: CONFIG_TESTE });
    nucleo.receber(eventoComanda({ event_id: "com-1" }));
    fs.appendFileSync(arm.caminhoEventos, "linha quebrada sem json\n", "utf8");
    nucleo.receber(eventoStatus({ event_id: "sta-1" }));

    const { nucleo: renascido, relatorio } = reconstruirDoLog({
      runtimeRoot: dir, agora: relogioFixo(AGORA), config: CONFIG_TESTE
    });
    assert.equal(relatorio.linhas_invalidas, 1);
    const snap = renascido.snapshot();
    assert.equal(snap.recepcao.linhas_invalidas, 1);
    assert.equal(snap.quarentena.por_motivo.linha_invalida, 1);
    assert.equal(snap.pedidos.completos.length, 1); // os dois válidos casaram
  } finally { limpar(dir); }
});
