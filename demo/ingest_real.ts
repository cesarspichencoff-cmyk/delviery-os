/**
 * INGESTÃO REAL — Relatório de Pedidos do iFood (lote, pedido-a-pedido).
 *
 * Lê o export real, reconstrói a HISTÓRIA (transições append-only) e roda as
 * projeções sobre dados verdadeiros da TATÁ. Zero entrada manual.
 *
 * Uso: npm run ingest -- "<caminho do .xlsx>"   (sem arg: usa o do Downloads)
 */
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LogMemoria } from "../src/core/logTransicoes";
import { ifoodParaTransicoes } from "../src/core/adaptadores";
import { estadoAtual } from "../src/core/projecoes";
import type { Transicao } from "../src/core/dominio";
import {
  atrasoMin, classificaErro, linhaParaDesfechoTransicao, linhaParaPedido,
  type ErroReal, type Linha,
} from "../src/ingest/ifoodRelatorio";

const ARQ = process.argv[2] ??
  "C:/Users/italo/Downloads/relatorio-pedidos_38100c39ad1cfa7a9446d4bb2dfaeb0b4821ee0f6e47c46f24290e6bf16c35ac_2026-05-27-2026-06-25.xlsx.zip";

const p = (s: string) => console.log(s);

p(`\n=== INGESTÃO REAL — ${ARQ.split(/[\\/]/).pop()} ===`);
const wb = XLSX.readFile(ARQ, { cellDates: true });
const ws = wb.Sheets["Página 1"] ?? wb.Sheets[wb.SheetNames[0]];
const linhas = XLSX.utils.sheet_to_json<Linha>(ws, { defval: null });
p(`linhas lidas: ${linhas.length}`);

const log = new LogMemoria();
let pedidosValidos = 0;
const erros: ErroReal[] = [];
let comAtraso = 0, entreguesComTempo = 0;

for (const l of linhas) {
  const pedido = linhaParaPedido(l);
  if (!pedido) continue;
  pedidosValidos++;
  for (const t of ifoodParaTransicoes(pedido)) log.anexar(t);
  const desf = linhaParaDesfechoTransicao(l);
  if (desf) log.anexar(desf);

  const erro = classificaErro(l);
  if (erro) erros.push(erro);
  const at = atrasoMin(l);
  if (at != null) { entreguesComTempo++; if (at > 0) comAtraso++; }
}

const todas = log.todas();
p(`pedidos válidos: ${pedidosValidos}`);
p(`transições no log: ${todas.length} (append-only, dedup por event_id)`);

// --- ESTADO (fluxo) sobre dados reais ---
const porPedido = new Map<string, Transicao[]>();
for (const t of todas) {
  const arr = porPedido.get(t.pedido_id) ?? porPedido.set(t.pedido_id, []).get(t.pedido_id)!;
  arr.push(t);
}
const dist = new Map<string, number>();
for (const [, ts] of porPedido) {
  const e = estadoAtual(ts);
  const k = e.estado_fluxo ?? "(n/observável)";
  dist.set(k, (dist.get(k) ?? 0) + 1);
}
p("\n=== ESTADO FINAL (fluxo) — reconstruído da história ===");
for (const [k, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) p(`  ${k}: ${n}`);

// --- "FECHAMENTO RESSUSCITADO": erros derivados automaticamente ---
const porTipo = new Map<string, number>();
const motivos = new Map<string, number>();
for (const e of erros) {
  porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
  if (e.tipo === "cancelamento") motivos.set(e.motivo, (motivos.get(e.motivo) ?? 0) + 1);
}
p('\n=== "FECHAMENTO RESSUSCITADO" — erros/atritos derivados sozinhos (zero digitação) ===');
p(`  total de pedidos com erro/atrito: ${erros.length} de ${pedidosValidos} (${pct(erros.length, pedidosValidos)})`);
for (const [k, n] of [...porTipo.entries()].sort((a, b) => b[1] - a[1])) p(`  ${k}: ${n}`);
p("  top motivos de cancelamento:");
for (const [m, n] of [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) p(`    - ${m}: ${n}`);
p("  exemplos:");
for (const e of erros.slice(0, 6)) p(`    pedido ${e.pedido_id} [${e.turno}] ${e.tipo}: ${e.motivo}`);

// --- ATRASO (sinal de capacidade/logística, fora da cunha) ---
p("\n=== ATRASO DE ENTREGA (contexto) ===");
p(`  pedidos com atraso > 0: ${comAtraso} de ${entreguesComTempo} com tempo (${pct(comAtraso, entreguesComTempo)})`);

// --- REPLAY-SAFE sobre dados reais ---
const antes = log.todas().length;
for (const l of linhas) {
  const pedido = linhaParaPedido(l);
  if (!pedido) continue;
  for (const t of ifoodParaTransicoes(pedido)) log.anexar(t);
  const desf = linhaParaDesfechoTransicao(l);
  if (desf) log.anexar(desf);
}
p("\n=== REPLAY-SAFE (idempotência sobre dado real) ===");
p(`  reprocessei TODAS as ${linhas.length} linhas. antes=${antes} depois=${log.todas().length} → ${antes === log.todas().length ? "OK, nada duplicou" : "FALHOU"}`);

// --- persiste o event store (artefato append-only, fora do git) ---
const out = join(process.cwd(), "data", "ifood_real.jsonl");
mkdirSync(join(process.cwd(), "data"), { recursive: true });
writeFileSync(out, todas.map((t) => JSON.stringify(t)).join("\n") + "\n", "utf8");
p(`\nevent store persistido: data/ifood_real.jsonl (${todas.length} transições)\n`);

function pct(a: number, b: number): string {
  return b === 0 ? "0%" : `${((a / b) * 100).toFixed(1)}%`;
}
