import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { telaEntregas } from "../../src/product/ui/surfaces/entregas.js";
import { carregarEstados } from "../../src/product/ui/components/ui.js";

// Usa os estados REAIS do produto, como a aplicacao faz no navegador.
const tokens = JSON.parse(readFileSync(join(process.cwd(), "docs/figma/DESIGN_TOKENS.json"), "utf8"));
carregarEstados(tokens.estados);

const observado = (valor: unknown) => ({
  observado: true, valor, procedencia: "real", observado_em: "2026-10-09T10:00:00Z",
});
const ausente = () => ({
  observado: false, motivo: "nao_observado", explicacao: "Sem leitura",
});
function tela(frescor: string): string {
  const a = {
    rotulo: "Aparelho de teste", device_id: "fixture-b5",
    credencial: observado("vinculada"),
    ultima_posicao_em: observado("2026-10-09T09:59:00Z"),
    gps: observado("fresh"),
    ultima_sincronizacao: observado("2026-10-09T09:59:00Z"),
    modo_dos_fatos: observado("real"),
    fila_offline: observado(10),
    fila_offline_pontos: observado(7),
    fila_offline_eventos: observado(3),
    fila_offline_reportada_em: observado("2026-10-09T07:00:00Z"),
    fila_offline_frescor: observado(frescor),
    selos: [],
  };
  const vm = {
    selos_de_cabecalho: [], conexao: { estado: "simulado" },
    fila_da_sessao: observado(0), viagens: [], ocorrencias: [],
    dispositivo: {
      credencial: ausente(), gps: ausente(), ultima_sincronizacao: ausente(),
      revogado: ausente(), fila_offline: ausente(),
    },
    realidade: {
      fonte: observado("postgresql"), lida_em: observado("2026-10-09T10:00:00Z"),
      aparelhos: [a], viagens: [], historico_sem_modo: observado(0), limitacoes: [],
    },
    ultimo_erro: ausente(), limitacoes: [],
  };
  return telaEntregas(vm);
}
const stale = tela("stale");
const fresh = tela("fresh");
assert.ok(stale.includes("Ultimo relato do aparelho:"), "O horario do relato sumiu");
assert.ok(stale.includes("10</strong> pendente(s) no ultimo relato"), "Contagem historica sumiu");
assert.ok(stale.includes("data-estado=\"stale\""), "Selo semantico stale nao foi renderizado");
assert.ok(stale.includes("Relato com mais de 45 minutos"), "Aviso acessivel nao existe");
assert.ok(!fresh.includes("Relato com mais de 45 minutos"), "Relato recente exibiu aviso antigo");
assert.ok(!fresh.includes("data-estado=\"stale\""), "Relato recente foi marcado stale");
assert.ok(!stale.includes("aparece abaixo como integracao pendente"), "Texto obsoleto voltou");
assert.ok(stale.includes("O aparelho em campo (demonstracao)"), "Separacao demo/real sumiu");
console.log("B5_FRESHNESS_HTML_RENDER: PASS");
