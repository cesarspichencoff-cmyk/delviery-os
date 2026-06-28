/**
 * Camada 0 · Adaptadores de escuta. Funções puras: o que a operação já emite → transições.
 * iFood = observado; erro derivado de texto = inferido. event_id torna tudo replay-safe.
 */
import type { Dimensao, EstadoFluxo, EstadoQualquer, Fonte, ItemRequerido, Transicao } from "./dominio";
import { eventId } from "./dominio";
import { ehCritico } from "./normalizador";

function tx(args: {
  fonte: Fonte;
  pedido_id: string;
  tipo_evento: string;
  timestamp: string;
  dimensao: Dimensao;
  estado_anterior: EstadoQualquer | null;
  estado_novo: EstadoQualquer | null;
  confianca: Transicao["confianca"];
  procedencia: Transicao["procedencia"];
  payload: unknown;
}): Transicao {
  return {
    event_id: eventId(args.fonte, args.pedido_id, args.tipo_evento, args.timestamp),
    pedido_id: args.pedido_id,
    tipo_evento: args.tipo_evento,
    fonte: args.fonte,
    timestamp: args.timestamp,
    dimensao: args.dimensao,
    payload_original: args.payload,
    estado_anterior: args.estado_anterior,
    estado_novo: args.estado_novo,
    confianca: args.confianca,
    procedencia: args.procedencia,
  };
}

export interface PedidoIfoodCru {
  pedido_id: string;
  recebido_em?: string;
  aceito_em?: string;
  pronto_em?: string;
  saiu_em?: string;
  entregue_em?: string;
  cancelado_em?: string;
  itens?: { nome: string; qtd: number }[];
  raw?: unknown;
}

export function comandaDoPedido(p: PedidoIfoodCru): ItemRequerido[] {
  return (p.itens ?? []).map((i) => ({ nome: i.nome, qtd: i.qtd, critico: ehCritico(i.nome) }));
}

/** Ciclo de vida iFood → transições de FLUXO (na ordem em que os carimbos existem). */
export function ifoodParaTransicoes(p: PedidoIfoodCru): Transicao[] {
  const ts: Transicao[] = [];
  let anterior: EstadoFluxo | null = null;
  const add = (estado: EstadoFluxo, quando: string | undefined, tipo: string) => {
    if (!quando) return; // sem carimbo => não observado; nunca falsear
    ts.push(tx({
      fonte: "ifood", pedido_id: p.pedido_id, tipo_evento: tipo, timestamp: quando,
      dimensao: "fluxo", estado_anterior: anterior, estado_novo: estado,
      confianca: "alta", procedencia: "observado", payload: p.raw ?? p,
    }));
    anterior = estado;
  };
  add("recebido", p.recebido_em, "ifood.recebido");
  add("aceito", p.aceito_em, "ifood.aceito");
  // producao_opaca / conferido_lacrado NÃO entram (interior não emitido; C1 congelada).
  add("pronto_expedicao", p.pronto_em, "ifood.pronto");
  add("saiu_entrega", p.saiu_em, "ifood.saiu");
  add("entregue", p.entregue_em, "ifood.entregue");
  // cancelado = estado de fluxo FINAL separado (não é "evento solto").
  add("cancelado", p.cancelado_em, "ifood.cancelado");
  return ts;
}

export interface PausaIfood {
  item: string;
  acao: "pausado" | "despausado";
  timestamp: string;
  raw?: unknown;
}
export function pausaParaTransicao(p: PausaIfood): Transicao {
  return tx({
    fonte: "ifood", pedido_id: `item:${p.item.toLowerCase()}`,
    tipo_evento: `ifood.item_${p.acao}`, timestamp: p.timestamp,
    dimensao: "fluxo", estado_anterior: null, estado_novo: null,
    confianca: "alta", procedencia: "observado", payload: p.raw ?? p,
  });
}

export interface DesfechoCru {
  pedido_id: string;
  fonte: "sac" | "review";
  texto: string;
  nota?: number;
  timestamp: string;
  raw?: unknown;
}
/** Desfecho → transição de DESFECHO (não apaga o fluxo). */
export function desfechoParaTransicao(d: DesfechoCru): Transicao {
  let estado_novo: EstadoQualquer | null = null;
  if (ehResolvido(d)) estado_novo = "resolvido";
  else if (ehReclamacao(d)) estado_novo = "reclamou";
  return tx({
    fonte: d.fonte, pedido_id: d.pedido_id,
    tipo_evento: d.fonte === "sac" ? "sac.mensagem" : "review.nota",
    timestamp: d.timestamp, dimensao: "desfecho",
    estado_anterior: null, estado_novo,
    confianca: "media", procedencia: "observado", payload: d.raw ?? d,
  });
}

/** Detecção de reclamação — termos de atraso/falta/troca/qualidade (inferência). */
const RE_RECLAMACAO =
  /demor|demorou|atras|atrasou|muito tempo|frio|faltou|veio sem|n[ãa]o veio|incompleto|errad|trocad|sem o |cru|azedo|nojo|cabelo/i;
const RE_RESOLVIDO = /resolvid|reembols|crédito|credito|estorn|devolv|combinad[oa] com o cliente/i;

export function ehReclamacao(d: DesfechoCru): boolean {
  if (typeof d.nota === "number" && d.nota <= 3) return true;
  return RE_RECLAMACAO.test(d.texto);
}
export function ehResolvido(d: DesfechoCru): boolean {
  return RE_RESOLVIDO.test(d.texto);
}
