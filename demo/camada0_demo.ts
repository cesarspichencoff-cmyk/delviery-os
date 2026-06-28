/**
 * Camada 0 · Demonstração ponta a ponta (dados sintéticos, ZERO entrada manual).
 * v2: replay-safe (idempotência), estado_fluxo × estado_desfecho separados, disponibilidade com impacto.
 */
import { LogMemoria } from "../src/core/logTransicoes";
import {
  comandaDoPedido, desfechoParaTransicao, ifoodParaTransicoes, pausaParaTransicao,
  type DesfechoCru, type PausaIfood, type PedidoIfoodCru,
} from "../src/core/adaptadores";
import { disponibilidade, estadoAtual, painelParados, registroDeErro } from "../src/core/projecoes";
import type { ItemRequerido } from "../src/core/dominio";

const log = new LogMemoria();
const comandas = new Map<string, ItemRequerido[]>();
const AGORA = new Date("2026-06-26T21:30:00Z");

const pedidos: PedidoIfoodCru[] = [
  { pedido_id: "330", recebido_em: "2026-06-26T20:01:00Z", aceito_em: "2026-06-26T20:02:00Z",
    pronto_em: "2026-06-26T20:40:00Z",
    itens: [{ nome: "Hot Roll", qtd: 2 }, { nome: "Kit p/2", qtd: 1 }] },
  { pedido_id: "412", recebido_em: "2026-06-26T20:05:00Z", aceito_em: "2026-06-26T20:06:00Z",
    itens: [{ nome: "Combinado Salmão", qtd: 1 }, { nome: "Kit p/1", qtd: 1 }] },
  { pedido_id: "415", recebido_em: "2026-06-26T20:10:00Z", aceito_em: "2026-06-26T20:11:00Z",
    pronto_em: "2026-06-26T20:35:00Z", saiu_em: "2026-06-26T20:38:00Z", entregue_em: "2026-06-26T21:05:00Z",
    itens: [{ nome: "Temaki Salmão", qtd: 1 }, { nome: "Kit p/1", qtd: 1 }, { nome: "Coca", qtd: 1 }] },
  { pedido_id: "420", recebido_em: "2026-06-26T20:20:00Z", aceito_em: "2026-06-26T20:21:00Z",
    cancelado_em: "2026-06-26T20:50:00Z", itens: [{ nome: "Combinado Salmão", qtd: 1 }] },
];
for (const p of pedidos) {
  comandas.set(p.pedido_id, comandaDoPedido(p));
  for (const t of ifoodParaTransicoes(p)) log.anexar(t);
}
log.anexar(pausaParaTransicao({ item: "Salmão", acao: "pausado", timestamp: "2026-06-26T20:30:00Z" } as PausaIfood));

const desfechos: DesfechoCru[] = [
  { pedido_id: "415", fonte: "review", texto: "Faltou o Kit p/1, veio sem hashi", nota: 3, timestamp: "2026-06-26T21:20:00Z" },
  { pedido_id: "330", fonte: "sac", texto: "Pedido demorou demais, chegou frio", timestamp: "2026-06-26T21:10:00Z" },
  { pedido_id: "415", fonte: "sac", texto: "Resolvido, demos crédito ao cliente", timestamp: "2026-06-26T21:40:00Z" },
];
for (const d of desfechos) log.anexar(desfechoParaTransicao(d));

const p = (s: string) => console.log(s);

p("\n=== MEMÓRIA ===");
p(`transições: ${log.todas().length} (append-only, dedup por event_id)`);

p("\n=== ESTADO (fluxo × desfecho separados) ===");
for (const pid of ["330", "412", "415", "420"]) {
  const e = estadoAtual(log.doPedido(pid), AGORA);
  p(`pedido ${pid}: fluxo=${e.estado_fluxo ?? "(n/observável)"} | desfecho=${e.estado_desfecho}` +
    (e.parado ? `  ⚠ PARADO: ${e.parado}` : ""));
}

p("\n=== ERRO AUTOMÁTICO (amarrado ao pedido) ===");
for (const d of desfechos) {
  const erro = registroDeErro(d, comandas.get(d.pedido_id) ?? []);
  if (erro) p(`pedido ${erro.pedido_id}: ${erro.tipo} | itens=[${erro.itens_suspeitos.join(", ")}] | ${erro.fonte} | conf=${erro.confianca}`);
}

p("\n=== DISPONIBILIDADE (risco + impacto; nunca 'restam N') ===");
for (const d of disponibilidade(log.todas(), comandas, 2, AGORA)) {
  if (d.risco === "ok") continue;
  p(`${d.item}: risco=${d.risco} | pausado=${d.pausado} | ritmo/h=${d.ritmo_por_hora} | pedidos_afetados=[${d.pedidos_afetados.join(", ")}]`);
}

p("\n=== WEDGE: PARADOS AGORA (+ motivo provável) ===");
for (const l of painelParados(log.todas(), comandas, AGORA)) {
  p(`pedido ${l.pedido_id} | ${l.estado} há ${l.tempo_parado_min}min | motivo: ${l.motivo_provavel} (${l.confianca}) | ação: ${l.acao_sugerida}`);
}

p("\n=== IDEMPOTÊNCIA (replay-safe) ===");
const antes = log.todas().length;
for (const pe of pedidos) for (const t of ifoodParaTransicoes(pe)) log.anexar(t); // reprocessa tudo
for (const d of desfechos) log.anexar(desfechoParaTransicao(d));
p(`reprocessei TODOS os eventos. antes=${antes} depois=${log.todas().length} → ${antes === log.todas().length ? "OK, nada duplicou" : "FALHOU"}`);
p("\nCamada 0 v2 rodou sem nenhuma entrada manual.\n");
