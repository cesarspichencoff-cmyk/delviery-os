/**
 * Pedidos do iFood na Home do gerente, conciliados com a Teknisa. Funcao PURA sobre as leituras de
 * `pedidos-do-gestor-local.ts` e `pedidos-reais-do-reader.ts`.
 *
 * O que vem de cada fonte, sem misturar: a ETAPA vem dos eventos oficiais que o Gestor gravou (aceite,
 * pronto, entregador, saida, conclusao, cancelamento); os ITENS conferidos e o estado nativo vem da
 * Teknisa; o alerta de preparo compara a hora atual com o tempo de preparo que a loja informou ao iFood
 * (fato contra fato, sem previsao). Nada de cliente chega aqui.
 */
import type { PedidosDoGestorLocal, PedidoDoGestor } from "../../platform/leitura/pedidos-do-gestor-local";
import type { PedidosReaisDoReader } from "../../platform/leitura/pedidos-reais-do-reader";
import { conciliarGestorTeknisa, placedDe, type ClasseDoPar, type ParDaConciliacao } from "../../platform/leitura/conciliacao-gestor-teknisa";

export const LIMITE_DE_CONCLUIDOS = 15;
/** O Gestor grava a cada mudanca; sem escrita ha mais que isto, a leitura e dita velha. */
export const GESTOR_VELHO_MIN = 20;

const ETAPAS: readonly [string, string][] = [
  ["CANCELLED", "cancelado"], ["CONCLUDED", "concluido"], ["ARRIVED_AT_DESTINATION", "entregador no destino"],
  ["DISPATCHED", "saiu para entrega"], ["COLLECTED", "saiu para entrega"], ["ARRIVED_AT_ORIGIN", "pronto · entregador na loja"],
  ["GOING_TO_ORIGIN", "pronto · entregador a caminho"], ["READY_TO_PICKUP", "pronto"], ["CONFIRMED", "em preparo"], ["PLACED", "aguardando aceite"],
];
const TEKNISA: Record<ClasseDoPar, string> = {
  revisao_retida: "Reader retido; conferir pedido",
  correspondencia_comprovada: "Teknisa confere",
  complemento_nao_lido_pela_teknisa: "Teknisa confere os itens; complementos nao lidos",
  observacao_nao_lida_pela_teknisa: "Teknisa confere os itens; observacao nao lida",
  observacao_divergente: "observacao do iFood nao encontrada na Teknisa",
  item_ou_quantidade_divergente: "itens diferentes na Teknisa",
  identidade_ambigua: "Teknisa: comanda ambigua",
  aguardando_teknisa: "aguardando comanda na Teknisa",
  sem_comanda_na_teknisa: "sem comanda na Teknisa",
};

export interface ItemIfoodDaHome { readonly descricao: string; readonly opcoes: readonly string[]; readonly observacao: string | null }
export interface PedidoIfoodDaHome {
  readonly hora: string;
  readonly codigo: string;
  readonly etapa: string;
  readonly ativo: boolean;
  readonly minutos: number;
  readonly modalidade: string;
  readonly preparo: { readonly informado_min: number; readonly passou_min: number | null } | null;
  readonly teknisa: { readonly classe: ClasseDoPar; readonly texto: string; readonly estado: string | null; readonly comanda_em_min: number | null };
  readonly itens: readonly ItemIfoodDaHome[];
  readonly detalhes: readonly string[];
}
export interface AtencaoDaHome { readonly codigo: string; readonly hora: string; readonly motivo: string }
export type OperacaoDoIfoodVM =
  | { readonly disponivel: false; readonly titulo: string; readonly explicacao: string }
  | {
      readonly disponivel: true;
      readonly lido_em: string;
      readonly gravado_ha_min: number | null;
      readonly leitura_velha: boolean;
      readonly titulo: string;
      readonly contagens: Readonly<Record<string, number>>;
      readonly atencao: readonly AtencaoDaHome[];
      readonly pedidos: readonly PedidoIfoodDaHome[];
      readonly conciliacao: Readonly<Record<string, number>>;
      readonly janela: string | null;
      readonly limitacoes: readonly string[];
    };

const horaLocal = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(11, 16);
const etapaDe = (g: PedidoDoGestor) => (ETAPAS.find(([c]) => g.eventos[c]) ?? ["", g.categoria ? g.categoria.toLowerCase() : "sem evento"])[1];
const modalidade = (g: PedidoDoGestor) => (g.tipo === "TAKEOUT" ? "retirada" : g.entrega_por === "MERCHANT" ? "entrega propria" : g.entrega_por === "IFOOD" ? "entrega iFood" : g.tipo ? g.tipo.toLowerCase() : "modalidade nao informada");

function preparo(g: PedidoDoGestor, etapa: string, agora: number) {
  if (g.inicio_do_preparo === null || g.tempo_de_preparo_s === null || g.tempo_de_preparo_s <= 0) return null;
  const fim = Date.parse(g.inicio_do_preparo) + g.tempo_de_preparo_s * 1000;
  const passou = etapa === "em preparo" && agora > fim ? Math.round((agora - fim) / 60_000) : null;
  return { informado_min: Math.round(g.tempo_de_preparo_s / 60), passou_min: passou };
}

function pedidoDaHome(par: ParDaConciliacao, agora: number): PedidoIfoodDaHome {
  const g = par.gestor; const etapa = etapaDe(g);
  return {
    hora: horaLocal(placedDe(g)), codigo: g.codigo_curto, etapa, ativo: etapa !== "concluido" && etapa !== "cancelado",
    minutos: par.minutos_desde_o_pedido, modalidade: modalidade(g), preparo: preparo(g, etapa, agora),
    teknisa: { classe: par.classe, texto: TEKNISA[par.classe], estado: par.teknisa ? par.teknisa.estado_nativo : null, comanda_em_min: par.minutos_ate_a_comanda },
    itens: g.itens.map((i) => ({ descricao: `${i.quantidade}× ${i.nome}`, opcoes: i.opcoes.map((o) => `${o.quantidade}× ${o.nome}`), observacao: i.observacao })),
    detalhes: par.detalhes,
  };
}

export function operacaoDoIfoodVM(gestor: PedidosDoGestorLocal, teknisa: PedidosReaisDoReader, agora: Date): OperacaoDoIfoodVM {
  if (gestor.estado === "nao_configurado")
    return { disponivel: false, titulo: "Gestor do iFood nao configurado nesta instancia",
      explicacao: "Isto nao significa Gestor fechado na loja: esta instancia nao foi apontada para ele." };
  if (gestor.estado === "indisponivel")
    return { disponivel: false, titulo: "Pedidos do iFood indisponiveis nesta leitura",
      explicacao: "O armazenamento do Gestor nao passou nas travas de leitura. Nenhum pedido foi mostrado para nao mostrar pedido errado." };
  const t = agora.getTime();
  const reais = teknisa.estado === "lido" ? teknisa.pedidos : [];
  const c = conciliarGestorTeknisa(gestor.pedidos, reais, agora);
  const todos = c.pares.map((p) => pedidoDaHome(p, t));
  const ativos = todos.filter((p) => p.ativo).sort((a, b) => b.minutos - a.minutos);
  const concluidos = todos.filter((p) => !p.ativo).sort((a, b) => a.minutos - b.minutos).slice(0, LIMITE_DE_CONCLUIDOS);
  const atencao: AtencaoDaHome[] = [];
  for (const p of ativos) {
    const m = (motivo: string) => atencao.push({ codigo: p.codigo, hora: p.hora, motivo });
    if (p.teknisa.classe === "revisao_retida") m("Reader reteve a revisao; conferir pedido no iFood");
    if (p.teknisa.classe === "sem_comanda_na_teknisa") m(`no iFood ha ${p.minutos} min e sem comanda vista na Teknisa`);
    if (p.teknisa.classe === "item_ou_quantidade_divergente") m("itens do iFood diferentes dos da Teknisa");
    if (p.teknisa.classe === "observacao_divergente") m("observacao do cliente nao encontrada na Teknisa");
    if (p.teknisa.classe === "observacao_nao_lida_pela_teknisa") m("tem observacao do cliente; conferir no iFood");
    if (p.teknisa.classe === "complemento_nao_lido_pela_teknisa") m("tem complemento; conferir no iFood");
    if (p.teknisa.classe === "identidade_ambigua") m("mais de uma comanda possivel na Teknisa");
    if (p.preparo && p.preparo.passou_min !== null && p.preparo.passou_min > 0) m(`passou ${p.preparo.passou_min} min do preparo informado ao iFood`);
  }
  for (const p of todos) if (p.etapa === "cancelado" && p.teknisa.estado !== null && p.minutos <= 180) atencao.push({ codigo: p.codigo, hora: p.hora, motivo: `cancelado no iFood; Teknisa mostra estado ${p.teknisa.estado}` });
  const conta = (f: (p: PedidoIfoodDaHome) => boolean) => todos.filter(f).length;
  const gravadoHa = gestor.gravado_em ? Math.max(0, Math.round((t - Date.parse(gestor.gravado_em)) / 60_000)) : null;
  const n = ativos.length;
  return {
    disponivel: true, lido_em: gestor.lido_em, gravado_ha_min: gravadoHa, leitura_velha: gravadoHa === null || gravadoHa > GESTOR_VELHO_MIN,
    titulo: n === 0 ? "Nenhum pedido em andamento no Gestor nesta leitura" : `${n} ${n === 1 ? "pedido" : "pedidos"} em andamento no iFood`,
    contagens: { no_gestor: todos.length, em_andamento: n, aguardando_aceite: conta((p) => p.etapa === "aguardando aceite"), em_preparo: conta((p) => p.etapa === "em preparo"),
      prontos: conta((p) => p.etapa.startsWith("pronto")), na_rua: conta((p) => p.etapa === "saiu para entrega" || p.etapa === "entregador no destino"),
      concluidos: conta((p) => p.etapa === "concluido"), cancelados: conta((p) => p.etapa === "cancelado") },
    atencao, pedidos: [...ativos, ...concluidos], conciliacao: c.contagens,
    janela: c.janela ? `${horaLocal(Date.parse(c.janela.de))}–${horaLocal(Date.parse(c.janela.ate))}` : null,
    limitacoes: [
      "O Gestor guarda so os pedidos recentes (cerca de 25), nao o total do dia; a conciliacao vale so para essa janela.",
      "Sem comanda vista na Teknisa nao prova falha da integracao: o Reader pode nao ter visto.",
      reais.some(p=>p.reader_v3) ? "Reader V3 le relacoes filhas; correspondencia vale para os campos comparaveis enviados pelo iFood, nao atesta fim da gravacao na Teknisa." : "Complementos e observacoes por ocorrencia da Teknisa ainda nao sao lidos pela fonte; quando faltam, o pedido diz isso.",
      "Etapa e tempo de preparo vem dos eventos que o proprio Gestor grava; preparo fisico na cozinha nao e observado.",
    ],
  };
}
