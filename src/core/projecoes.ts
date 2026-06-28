/**
 * Camada 0 · Projeções (derivados — nunca inputs). Tudo é leitura do log de transições.
 * v2: estado_fluxo separado de estado_desfecho; disponibilidade aponta IMPACTO (pedidos afetados).
 */
import type { Confianca, EstadoDesfecho, EstadoFluxo, ItemRequerido, Transicao } from "./dominio";
import { ehReclamacao, type DesfechoCru } from "./adaptadores";
import { componentesCriticos } from "./normalizador";

/** Estado do pedido em DUAS dimensões — desfecho não apaga fluxo. */
export interface EstadoPedido {
  pedido_id: string;
  estado_fluxo: EstadoFluxo | null;       // null = ainda não observável
  estado_desfecho: EstadoDesfecho;        // default sem_desfecho
  ultimo_evento: string | null;
  ultimo_timestamp: string | null;
  parado: "produção?" | "expedição?" | null;
}

export function estadoAtual(transicoes: Transicao[], agora = new Date()): EstadoPedido {
  const ord = [...transicoes].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const pedido_id = ord[0]?.pedido_id ?? "";
  let estado_fluxo: EstadoFluxo | null = null;
  let estado_desfecho: EstadoDesfecho = "sem_desfecho";
  let ultimo_evento: string | null = null;
  let ultimo_timestamp: string | null = null;
  for (const t of ord) {
    ultimo_evento = t.tipo_evento;
    ultimo_timestamp = t.timestamp;
    if (t.dimensao === "fluxo" && t.estado_novo !== null) estado_fluxo = t.estado_novo as EstadoFluxo;
    if (t.dimensao === "desfecho" && t.estado_novo !== null) estado_desfecho = t.estado_novo as EstadoDesfecho;
  }
  // "parado" usa só o tempo no estado de FLUXO observável (sem inventar interior).
  let parado: EstadoPedido["parado"] = null;
  const ultimoFluxoTs = [...ord].reverse().find((t) => t.dimensao === "fluxo")?.timestamp ?? null;
  const min = ultimoFluxoTs ? (agora.getTime() - new Date(ultimoFluxoTs).getTime()) / 60000 : 0;
  if (estado_fluxo === "aceito" && min > 20) parado = "produção?";
  if (estado_fluxo === "pronto_expedicao" && min > 15) parado = "expedição?";
  return { pedido_id, estado_fluxo, estado_desfecho, ultimo_evento, ultimo_timestamp, parado };
}

/** Registro automático de erro, amarrado ao pedido (desfecho × comanda). */
export interface RegistroErro {
  pedido_id: string;
  tipo: "faltou_item" | "item_trocado" | "qualidade" | "atraso" | "outro";
  itens_suspeitos: string[];
  fonte: "sac" | "review";
  timestamp: string;
  confianca: Confianca;
  procedencia: "inferido";
  texto: string;
}

export function registroDeErro(d: DesfechoCru, comanda: ItemRequerido[]): RegistroErro | null {
  if (!ehReclamacao(d)) return null;
  const txt = d.texto.toLowerCase();
  let tipo: RegistroErro["tipo"] = "outro";
  if (/faltou|veio sem|incompleto|n[ãa]o veio|sem o /.test(txt)) tipo = "faltou_item";
  else if (/errad|trocad|no lugar/.test(txt)) tipo = "item_trocado";
  else if (/frio|cru|azedo|qualidade|nojo|cabelo|mal passad/.test(txt)) tipo = "qualidade";
  else if (/demor|atras|muito tempo/.test(txt)) tipo = "atraso";
  const itens_suspeitos = comanda.map((i) => i.nome).filter((n) => txt.includes(n.toLowerCase()));
  return {
    pedido_id: d.pedido_id, tipo, itens_suspeitos, fonte: d.fonte, timestamp: d.timestamp,
    confianca: itens_suspeitos.length > 0 ? "media" : "baixa", procedencia: "inferido", texto: d.texto,
  };
}

/**
 * Disponibilidade operacional (risco, NÃO estoque). Agora no nível de ITEM-BASE crítico
 * (normalizado) e apontando IMPACTO: quais pedidos dependem do item.
 */
export interface Disponibilidade {
  item: string;                 // item-base crítico (ex.: "salmão", "hot", "shoyu")
  pausado: boolean;
  consumo_teorico: number;      // soma derivada dos pedidos aceitos (NÃO é estoque)
  ritmo_por_hora: number;
  risco: "ok" | "atencao" | "alto";
  pedidos_afetados: string[];   // pedidos vivos que dependem deste item
}

export function disponibilidade(
  transicoes: Transicao[],
  comandasPorPedido: Map<string, ItemRequerido[]>,
  janelaHoras = 1,
  agora = new Date(),
): Disponibilidade[] {
  // pausas por item-base
  const pausado = new Map<string, boolean>();
  for (const t of transicoes) {
    if (t.tipo_evento === "ifood.item_pausado") pausado.set(itemChave(t.pedido_id), true);
    if (t.tipo_evento === "ifood.item_despausado") pausado.set(itemChave(t.pedido_id), false);
  }
  // pedidos aceitos e não-finalizados (vivos), por dimensão de fluxo
  const fluxoPorPedido = new Map<string, { aceito?: string; final: boolean }>();
  for (const t of transicoes) {
    if (t.dimensao !== "fluxo") continue;
    const f = fluxoPorPedido.get(t.pedido_id) ?? { final: false };
    if (t.estado_novo === "aceito") f.aceito = t.timestamp;
    if (t.estado_novo === "entregue" || t.estado_novo === "cancelado") f.final = true;
    fluxoPorPedido.set(t.pedido_id, f);
  }

  const consumo = new Map<string, number>();
  const consumoRecente = new Map<string, number>();
  const afetados = new Map<string, Set<string>>();
  const corte = new Date(agora.getTime() - janelaHoras * 3600000);

  for (const [pid, itens] of comandasPorPedido) {
    const f = fluxoPorPedido.get(pid);
    if (!f?.aceito) continue; // só conta pedido observadamente ACEITO
    for (const it of itens) {
      for (const base of componentesCriticos(it.nome)) {
        consumo.set(base, (consumo.get(base) ?? 0) + it.qtd);
        if (new Date(f.aceito) >= corte) consumoRecente.set(base, (consumoRecente.get(base) ?? 0) + it.qtd);
        if (!f.final) {
          if (!afetados.has(base)) afetados.set(base, new Set());
          afetados.get(base)!.add(pid);
        }
      }
    }
  }

  const itens = new Set<string>([...consumo.keys(), ...pausado.keys()]);
  const out: Disponibilidade[] = [];
  for (const item of itens) {
    const p = pausado.get(item) ?? false;
    const ritmo = (consumoRecente.get(item) ?? 0) / janelaHoras;
    const afeta = [...(afetados.get(item) ?? [])];
    let risco: Disponibilidade["risco"] = "ok";
    if (p && afeta.length > 0) risco = "alto";        // pausado E há pedidos vivos dependendo
    else if (p) risco = "atencao";                    // pausado sem pedido vivo afetado ainda
    else if (ritmo >= 10) risco = "alto";
    else if (ritmo >= 5) risco = "atencao";
    out.push({ item, pausado: p, consumo_teorico: consumo.get(item) ?? 0, ritmo_por_hora: ritmo, risco, pedidos_afetados: afeta });
  }
  return out.sort((a, b) => (b.risco === "alto" ? 1 : 0) - (a.risco === "alto" ? 1 : 0) || b.ritmo_por_hora - a.ritmo_por_hora);
}

function itemChave(k: string): string {
  return k.startsWith("item:") ? k.slice(5) : k;
}

/**
 * WEDGE — "Parados agora" com motivo provável (projeção DETERMINÍSTICA, sem IA).
 * Regra dura: motivo só nasce de sinal existente; inferência = no máx. confiança "media";
 * desfecho observado = "alta"; sem sinal suficiente = motivo "desconhecido" (nunca inventar).
 */
export interface LinhaParado {
  pedido_id: string;
  estado: string;               // estado de fluxo atual
  tempo_parado_min: number;
  motivo_provavel: string;
  confianca: Confianca;
  acao_sugerida: string;
}

export function painelParados(
  transicoes: Transicao[],
  comandasPorPedido: Map<string, ItemRequerido[]>,
  agora = new Date(),
  limites = { producao: 20, expedicao: 15, entrega: 60 }, // minutos
): LinhaParado[] {
  // itens-base pausados (disponibilidade)
  const pausados = new Set(
    disponibilidade(transicoes, comandasPorPedido, 2, agora).filter((d) => d.pausado).map((d) => d.item),
  );
  const porPedido = new Map<string, Transicao[]>();
  for (const t of transicoes) {
    if (t.pedido_id.startsWith("item:")) continue;
    (porPedido.get(t.pedido_id) ?? porPedido.set(t.pedido_id, []).get(t.pedido_id)!).push(t);
  }

  const linhas: LinhaParado[] = [];
  for (const [pid, ts] of porPedido) {
    const e = estadoAtual(ts, agora);
    if (e.estado_fluxo === "entregue" || e.estado_fluxo === "cancelado") continue; // finalizados saem
    const ultimoFluxoTs = [...ts].filter((t) => t.dimensao === "fluxo").sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1)?.timestamp;
    const min = ultimoFluxoTs ? Math.round((agora.getTime() - new Date(ultimoFluxoTs).getTime()) / 60000) : 0;

    const exigePausado = (comandasPorPedido.get(pid) ?? []).some((it) =>
      componentesCriticos(it.nome).some((c) => pausados.has(c)),
    );

    let motivo = "", acao = "", conf: Confianca = "media", parado = false;
    if (exigePausado) {
      motivo = "indisponibilidade"; acao = "confirmar substituição/cancelamento"; conf = "media"; parado = true;
    } else if (e.estado_fluxo === "aceito" && min > limites.producao) {
      motivo = "produção parada"; acao = "verificar praça responsável"; parado = true;
    } else if (e.estado_fluxo === "pronto_expedicao" && min > limites.expedicao) {
      motivo = "expedição parada"; acao = "verificar saída/motoboy"; parado = true;
    } else if (e.estado_fluxo === "saiu_entrega" && min > limites.entrega) {
      motivo = "atraso de entrega"; acao = "acompanhar entrega"; parado = true;
    } else if (e.estado_desfecho === "reclamou") {
      motivo = "desfecho/problema"; acao = "tratar reclamação"; conf = "alta"; parado = true;
    } else if (min > limites.producao && e.estado_fluxo !== null) {
      // está há muito tempo sem avançar, mas sem sinal que explique → não inventar
      motivo = "motivo desconhecido"; acao = "verificar manualmente"; conf = "baixa"; parado = true;
    }
    if (parado) {
      linhas.push({
        pedido_id: pid, estado: e.estado_fluxo ?? "(n/observável)",
        tempo_parado_min: min, motivo_provavel: motivo, confianca: conf, acao_sugerida: acao,
      });
    }
  }
  // mais críticos primeiro: desfecho > tempo parado
  return linhas.sort((a, b) => (b.confianca === "alta" ? 1 : 0) - (a.confianca === "alta" ? 1 : 0) || b.tempo_parado_min - a.tempo_parado_min);
}
