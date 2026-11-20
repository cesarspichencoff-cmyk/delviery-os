import planoV77 from "../../../data/previsoes/itaim-2026-11-20.json";
import type { PedidosDoGestorLocal } from "../../platform/leitura/pedidos-do-gestor-local";
import type { OperacaoDoIfoodVM } from "./home-operacao-ifood-vm";
import { placedDe } from "../../platform/leitura/conciliacao-gestor-teknisa";

const MIN = 60_000;
const localSP = (ms: number) => new Date(ms - 180 * MIN).toISOString();
const planos = [planoV77];
const faixas = [[11, 13], [13, 15], [18, 20], [20, 22], [22, 23]] as const;

export function previsaoDoTurnoItaim(ms: number, gestor?: PedidosDoGestorLocal, o?: OperacaoDoIfoodVM | null) {
  const local = localSP(ms);
  const dia = local.slice(0, 10);
  const minuto = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  const amanha = localSP(ms + 24 * 60 * MIN).slice(0, 10);
  const plano = planos.find(p => p.data === dia) ?? planos.find(p => p.data === amanha) ?? null;
  const faixa = plano?.data === dia ? faixas.findIndex(([inicio, fim]) => minuto >= inicio * 60 && minuto < fim * 60) : -1;
  const atual = o?.disponivel && !o.leitura_velha && gestor?.estado === "lido";
  const vistos = new Map<string, number>();
  if (atual) {
    for (const pedido of gestor.pedidos) {
      const t = placedDe(pedido);
      if (!pedido.teste && Number.isFinite(t) && t <= ms && localSP(t).slice(0, 10) === dia) vistos.set(pedido.id_interno, t);
    }
  }
  const chegadas = [...vistos.values()];
  const janela = 30 * MIN;
  const emTrinta = chegadas.filter(t => t > ms - janela).length;
  // Extrapolação do ritmo da janela do Gestor. Exige leitura recente, janela anterior visível e um único serviço.
  const sabDom = [0, 6].includes(new Date(local).getUTCDay());
  const dentroDoServico = (minuto >= 11 * 60 + 30 && minuto < (sabDom ? 16 * 60 + 30 : 15 * 60))
    || (minuto >= 18 * 60 + 30 && minuto < 23 * 60);
  const ritmoCoberto = atual && o.gravado_ha_min !== null && o.gravado_ha_min <= 5 && dentroDoServico
    && chegadas.some(t => t <= ms - janela) && emTrinta > 0;
  const perto = new Set(atual ? o.pedidos.filter(p => p.ativo && p.chave_gestor && p.etapa === "em preparo"
    && p.preparo?.faltam_min != null && p.preparo.faltam_min >= 0 && p.preparo.faltam_min <= 15).map(p => p.chave_gestor) : []);
  const grupos = atual ? o.previa_por_praca?.grupos ?? [] : [];
  const prazoPorPraca = grupos.flatMap(g => {
    const linhas = g.itens.filter(i => i.etapa === "em preparo" && perto.has(i.chave_gestor));
    return linhas.length ? [{ rotulo: g.rotulo, unidades: linhas.reduce((s, i) => s + i.quantidade, 0),
      pedidos: new Set(linhas.map(i => i.chave_gestor)).size }] : [];
  }).sort((a, b) => b.unidades - a.unidades);
  return { dia, hora: local.slice(11, 16), plano, faixa, janela_atual: Boolean(atual),
    recebidos_na_janela_do_dia: atual ? vistos.size : null,
    em_preparo: atual ? o.contagens.em_preparo : null, perto_do_prazo: atual ? perto.size : null,
    prazo_por_praca: prazoPorPraca,
    ritmo: ritmoCoberto ? { ultimos_30: emTrinta, proximos_15: Math.round(emTrinta / 2) } : null };
}
