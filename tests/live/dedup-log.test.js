/* F2-04 — DEDUPLICAÇÃO ANTES DO APPEND: duplicata nunca gera segunda linha no
 * JSONL; conteúdo divergente sob a mesma identidade vira quarentena sanitizada
 * sem substituir o aceito; índices sobrevivem ao reinício via replay.
 * Verifica a CONTAGEM REAL de linhas no arquivo, não só o snapshot. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarArmazenamento } = require("../../src/live/persistir");
const { reconstruirDoLog } = require("../../src/live/reconstruir");
const { hashCanonicoItens } = require("../../src/live/normalizar");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-live-deduplog-"));
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const linhasDe = (caminho) => !fs.existsSync(caminho) ? 0 :
  fs.readFileSync(caminho, "utf8").split("\n").filter((l) => l.trim() !== "").length;

const ITENS = [{ nome: "Uramaki Ficticio Especial", quantidade: 1, observacao: null }];
const OUTROS = [{ nome: "Temaki Trocado", quantidade: 2, observacao: null }];

test("F2-04: mesmo event_id + mesmo conteúdo => UMA linha no log, snapshot intacto", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    const ev = eventoComanda({ event_id: "com-repetido", itens: ITENS, hash: hashCanonicoItens(ITENS) });
    nucleo.receber(ev);
    const antes = nucleo.snapshot();
    assert.equal(linhasDe(arm.caminhoEventos), 1);

    const r = nucleo.receber(ev); // exatamente a mesma observação
    assert.equal(r.destino, "duplicado_ignorado");
    assert.equal(linhasDe(arm.caminhoEventos), 1); // NENHUM segundo append
    // snapshot inalterado (mesmo relógio fixo => comparação direta)
    assert.deepEqual(nucleo.snapshot().pedidos, antes.pedidos);
  } finally { limpar(dir); }
});

test("F2-04: mesmo event_id com conteúdo DIVERGENTE => quarentena, log aceito intacto", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    nucleo.receber(eventoComanda({ event_id: "com-x", itens: ITENS, hash: hashCanonicoItens(ITENS) }));

    const adulterado = eventoComanda({ event_id: "com-x", itens: OUTROS, hash: hashCanonicoItens(ITENS) });
    const r = nucleo.receber(adulterado);
    assert.equal(r.destino, "quarentena");
    assert.equal(r.motivo, "event_id_reutilizado_com_conteudo_divergente");

    assert.equal(linhasDe(arm.caminhoEventos), 1);    // aceito intacto
    assert.equal(linhasDe(arm.caminhoQuarentena), 1); // anomalia registrada
    // o evento anterior NÃO foi substituído em silêncio
    const p = nucleo.snapshot().pedidos.parciais[0];
    assert.equal(p.comanda.itens[0].nome, "Uramaki Ficticio Especial");
    assert.equal(nucleo.snapshot().quarentena.por_motivo.event_id_reutilizado_com_conteudo_divergente, 1);
  } finally { limpar(dir); }
});

test("F2-04: mesma idempotency_key + mesmo fato => sem segundo append (vias em memória)", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    nucleo.receber(eventoComanda({ event_id: "com-a", itens: ITENS, hash: hashCanonicoItens(ITENS) }));
    const r = nucleo.receber(eventoComanda({
      event_id: "com-b", itens: ITENS, hash: hashCanonicoItens(ITENS),
      captured_at: "2026-07-11T19:06:00.000Z"
    }));
    assert.equal(r.destino, "observacao_repetida");
    assert.equal(linhasDe(arm.caminhoEventos), 1); // o fato só existe uma vez no log
    const p = nucleo.snapshot().pedidos.parciais[0];
    assert.equal(p.comanda.vias, 2); // carimbo/via avançam em memória
  } finally { limpar(dir); }
});

test("F2-04: mesma idempotency_key com conteúdo INCOMPATÍVEL => conflito em quarentena, original preservado", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    const hashFixo = "hash-forjado-igual";
    nucleo.receber(eventoComanda({ event_id: "com-a", itens: ITENS, hash: hashFixo }));
    const r = nucleo.receber(eventoComanda({ event_id: "com-b", itens: OUTROS, hash: hashFixo }));
    assert.equal(r.destino, "quarentena");
    assert.equal(r.motivo, "idempotency_key_reutilizada_com_conteudo_divergente");
    assert.equal(linhasDe(arm.caminhoEventos), 1);
    const p = nucleo.snapshot().pedidos.parciais[0];
    assert.equal(p.comanda.itens[0].nome, "Uramaki Ficticio Especial"); // original vive
    assert.equal(p.comanda.vias, 1); // nada foi tratado como via comum
  } finally { limpar(dir); }
});

test("F2-04: reobservação de status com medição nova (tempo decorrido) NÃO é conteúdo divergente", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    nucleo.receber(eventoStatus({ event_id: "sta-a", tempo_decorrido_min: 5, atraso_min: 0 }));
    const r = nucleo.receber(eventoStatus({
      event_id: "sta-b", tempo_decorrido_min: 9, atraso_min: 2,
      captured_at: "2026-07-11T19:05:00.000Z"
    }));
    assert.equal(r.destino, "observacao_repetida"); // medição muda, o fato não
    assert.equal(linhasDe(arm.caminhoEventos), 1);
    assert.equal(nucleo.snapshot().quarentena.total, 0);
  } finally { limpar(dir); }
});

test("F2-04: após reinício e replay, duplicata recebida de novo continua sem append", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    const ev = eventoComanda({ event_id: "com-sobrevive", itens: ITENS, hash: hashCanonicoItens(ITENS) });
    nucleo.receber(ev);
    nucleo.receber(eventoStatus({ event_id: "sta-1" }));
    assert.equal(linhasDe(arm.caminhoEventos), 2);

    // reinício: índices de event_id e idempotency_key reconstruídos do log
    const { nucleo: renascido } = reconstruirDoLog({
      runtimeRoot: dir, agora, config: CONFIG_TESTE
    });
    const rDup = renascido.receber(ev); // a mesma observação chega DE NOVO
    assert.equal(rDup.destino, "duplicado_ignorado");
    assert.equal(linhasDe(arm.caminhoEventos), 2); // nada foi re-anexado

    // mesmo fato com event_id novo também não anexa
    const rFato = renascido.receber(eventoComanda({
      event_id: "com-novo-id", itens: ITENS, hash: hashCanonicoItens(ITENS)
    }));
    assert.equal(rFato.destino, "observacao_repetida");
    assert.equal(linhasDe(arm.caminhoEventos), 2);
  } finally { limpar(dir); }
});
