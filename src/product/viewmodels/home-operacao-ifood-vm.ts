/**
 * Pedidos do iFood na Home do gerente, conciliados com a Teknisa. Funcao PURA sobre as leituras de
 * `pedidos-do-gestor-local.ts` e `pedidos-reais-do-reader.ts`.
 *
 * O que vem de cada fonte, sem misturar: a ETAPA vem dos eventos oficiais que o Gestor gravou (aceite,
 * pronto, entregador, saida, conclusao, cancelamento); os ITENS conferidos e o estado nativo vem da
 * Teknisa; o alerta de preparo compara a hora atual com o tempo de preparo que a loja informou ao iFood
 * (fato contra fato, sem previsao). Nada de cliente chega aqui.
 */
import { createHash } from "node:crypto";
import { pedidoReaderVM, type PedidoDaHome } from "./home-pedidos-reader-vm";
import type { PedidosDoGestorLocal, PedidoDoGestor } from "../../platform/leitura/pedidos-do-gestor-local";
import type { PedidoReal, PedidosReaisDoReader } from "../../platform/leitura/pedidos-reais-do-reader";
import { conciliarGestorTeknisa, placedDe, type ClasseDoPar, type ParDaConciliacao } from "../../platform/leitura/conciliacao-gestor-teknisa";
import { PRACAS, type AmbienteId, type PracaId } from "./areas";

export const LIMITE_DE_CONCLUIDOS = 15;
/** O Gestor grava a cada mudanca; sem escrita ha mais que isto, a leitura e dita velha. */
export const GESTOR_VELHO_MIN = 20;

const ETAPAS: readonly [string, string][] = [
  ["CANCELLED", "cancelado"], ["CONCLUDED", "concluido"], ["ARRIVED_AT_DESTINATION", "entregador no destino"],
  ["DISPATCHED", "saiu para entrega"], ["COLLECTED", "saiu para entrega"],
  ["READY_TO_PICKUP", "pronto"], ["CONFIRMED", "em preparo"], ["PLACED", "aguardando aceite"],
];
const TEKNISA: Record<ClasseDoPar, string> = {
  relacoes_nao_confirmadas: "Itens conferem; componentes e complementos a conferir",
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
  readonly revisao_gestor?: string;
  readonly horarios_gestor?: Readonly<Record<string, string>>;
  readonly leitor?: { readonly observado_em: string; readonly aberto_em_local: string; readonly revisao: string; readonly pedido: PedidoDaHome };
}
export interface AtencaoDaHome { readonly codigo: string; readonly hora: string; readonly motivo: string }
interface ObservacaoDaPrevia { readonly fonte: "iFood" | "Teknisa"; readonly texto: string }
interface LinhaDaPrevia {
  readonly codigo: string;
  readonly hora: string;
  readonly descricao: string;
  readonly produto: string;
  readonly codigo_produto: string | null;
  readonly quantidade: number;
  readonly etapa: "em preparo" | "pronto";
  readonly conferir_observacao: boolean;
  readonly observacoes: readonly ObservacaoDaPrevia[];
  readonly opcoes: readonly string[];
}
interface PreviaPorPraca {
  readonly grupos: readonly {
    readonly praca: PracaId; readonly ambiente: AmbienteId; readonly rotulo: string;
    readonly em_preparo: number; readonly prontos: number; readonly itens: readonly LinhaDaPrevia[];
  }[];
  readonly pendentes: readonly (AtencaoDaHome & Partial<Omit<LinhaDaPrevia, "codigo" | "hora">>)[];
  readonly notas_gerais: readonly { readonly codigo: string; readonly hora: string }[];
}
type LerPracas = (pedido: PedidoReal) => readonly (PracaId | null)[] | null;

const CLASSES_COM_ITENS_CONCILIADOS = new Set<ClasseDoPar>([
  "correspondencia_comprovada", "complemento_nao_lido_pela_teknisa", "relacoes_nao_confirmadas",
  "observacao_nao_lida_pela_teknisa", "observacao_divergente",
]);

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
      readonly previa_por_praca?: PreviaPorPraca;
    };

const horaLocal = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(11, 16);
function etapaDe(g: PedidoDoGestor): string {
  const etapa = ETAPAS.find(([evento]) => g.eventos[evento])?.[1];
  // A chegada do entregador pode ocorrer antes de a cozinha marcar o pedido pronto.
  if (etapa === "pronto") {
    if (g.eventos.ARRIVED_AT_ORIGIN) return "pronto · entregador na loja";
    if (g.eventos.GOING_TO_ORIGIN) return "pronto · entregador a caminho";
  }
  return etapa ?? g.categoria?.toLowerCase() ?? "sem evento";
}
const modalidade = (g: PedidoDoGestor) => (g.tipo === "TAKEOUT" ? "retirada" : g.entrega_por === "MERCHANT" ? "entrega propria" : g.entrega_por === "IFOOD" ? "entrega iFood" : g.tipo ? g.tipo.toLowerCase() : "modalidade nao informada");

function preparo(g: PedidoDoGestor, etapa: string, agora: number) {
  if (g.inicio_do_preparo === null || g.tempo_de_preparo_s === null || g.tempo_de_preparo_s <= 0) return null;
  const fim = Date.parse(g.inicio_do_preparo) + g.tempo_de_preparo_s * 1000;
  const passou = etapa === "em preparo" && agora > fim ? Math.round((agora - fim) / 60_000) : null;
  return { informado_min: Math.round(g.tempo_de_preparo_s / 60), passou_min: passou };
}

function pedidoDaHome(par: ParDaConciliacao, agora: number, incluirRevisoes: boolean): PedidoIfoodDaHome {
  const g = par.gestor; const etapa = etapaDe(g);
  return {
    hora: horaLocal(placedDe(g)), codigo: g.codigo_curto, etapa, ativo: etapa !== "concluido" && etapa !== "cancelado",
    minutos: par.minutos_desde_o_pedido, modalidade: modalidade(g), preparo: preparo(g, etapa, agora),
    teknisa: { classe: par.classe, texto: TEKNISA[par.classe], estado: par.teknisa ? par.teknisa.estado_nativo : null, comanda_em_min: par.minutos_ate_a_comanda },
    itens: g.itens.map((i) => ({ descricao: `${i.quantidade}× ${i.nome}`, opcoes: i.opcoes.map((o) => `${o.quantidade}× ${o.nome}`), observacao: i.observacao })),
    detalhes: par.detalhes,
    ...(incluirRevisoes ? {
      revisao_gestor: createHash("sha256").update(JSON.stringify([g.eventos, g.itens, g.itens_alterados, g.itens_cancelados])).digest("hex"),
      horarios_gestor: g.eventos,
      ...(par.teknisa?.reader_v3 ? {
        leitor: { observado_em: par.teknisa.observado_em, aberto_em_local: par.teknisa.aberto_em_local,
          revisao: par.teknisa.revisao, pedido: pedidoReaderVM(par.teknisa) },
      } : {}),
    } : {}),
  };
}

function previaPorPraca(pares: readonly ParDaConciliacao[], lerPracas: LerPracas): PreviaPorPraca {
  const grupos = new Map<PracaId, LinhaDaPrevia[]>();
  const pendentes: PreviaPorPraca["pendentes"][number][] = [];
  const notasGerais: { codigo: string; hora: string }[] = [];
  for (const { gestor, teknisa, classe } of pares) {
    const status = etapaDe(gestor);
    const etapa = status.startsWith("pronto") ? "pronto" : status === "em preparo" ? status : null;
    if (gestor.teste || !etapa) continue;
    const referencia: Pick<LinhaDaPrevia, "codigo" | "hora" | "etapa"> = {
      codigo: gestor.codigo_curto, hora: horaLocal(placedDe(gestor)), etapa,
    };
    const conciliado = teknisa && !teknisa.retido && CLASSES_COM_ITENS_CONCILIADOS.has(classe)
      && gestor.itens_alterados === 0 && gestor.itens_cancelados === 0 ? teknisa : null;
    const pracas = conciliado ? lerPracas(conciliado) : null;
    const linhas = conciliado?.itens.map((item, posicao) => ({ item, praca: pracas?.[posicao] ?? null })) ?? [];
    const codigosDeOpcao = new Set(gestor.itens.flatMap(item => item.opcoes.map(opcao => opcao.codigo_externo)));
    if (conciliado?.observacoes_do_pedido?.length) notasGerais.push(referencia);
    if (!gestor.itens.length) pendentes.push({ ...referencia, motivo: "A leitura do iFood não trouxe os itens." });
    for (const item of gestor.itens) {
      const descricao = `${item.quantidade}× ${item.nome}`;
      const opcoes = item.opcoes.map(opcao => `${opcao.quantidade}× ${opcao.nome}`);
      const codigo = item.codigo_externo;
      const nativas = codigo === null ? [] : linhas.filter(linha => linha.item.codigo_arvore === codigo);
      const praca = nativas[0]?.praca;
      const linhasGestor = gestor.itens.filter(outra => outra.codigo_externo === codigo);
      const quantidadeGestor = linhasGestor.reduce((soma, outra) => soma + outra.quantidade, 0);
      const quantidadeNativa = nativas.reduce((soma, linha) => soma + (linha.item.quantidade ?? 0), 0);
      const notasNativas = nativas.flatMap(linha => linha.item.observacoes ?? []);
      const notasLigadas = conciliado?.completude.observacoes === "campos_de_texto_lidos"
        && linhasGestor.length === 1 && nativas.length === 1 && quantidadeNativa === quantidadeGestor && !codigosDeOpcao.has(codigo);
      const observacoes: ObservacaoDaPrevia[] = item.observacao ? [{ fonte: "iFood", texto: item.observacao }] : [];
      if (notasLigadas) for (const texto of new Set(notasNativas)) {
        if (texto !== item.observacao) observacoes.push({ fonte: "Teknisa", texto });
      }
      const conferir_observacao = (notasNativas.length > 0 && !notasLigadas)
        || (item.observacao !== null && (classe === "observacao_nao_lida_pela_teknisa" || classe === "observacao_divergente"));
      const linha = { ...referencia, descricao, produto: item.nome, codigo_produto: codigo, quantidade: item.quantidade,
        observacoes, opcoes, conferir_observacao };
      if (!conciliado || !praca || codigosDeOpcao.has(codigo) ||
          quantidadeNativa !== quantidadeGestor || nativas.some(linha => linha.praca !== praca)) {
        const motivo = !conciliado ? "Conferir a comanda no caixa."
          : "Praça sem confirmação na revisão desta comanda.";
        pendentes.push({ ...linha, motivo });
        continue;
      }
      const grupo = grupos.get(praca) ?? [];
      grupo.push(linha);
      grupos.set(praca, grupo);
    }
  }
  return {
    grupos: PRACAS.flatMap(p => {
      const itens = grupos.get(p.id);
      if (!itens) return [];
      let em_preparo = 0;
      let prontos = 0;
      for (const item of itens) {
        if (item.etapa === "em preparo") em_preparo += item.quantidade;
        else prontos += item.quantidade;
      }
      return [{ praca: p.id, ambiente: p.ambiente, rotulo: p.rotulo, itens, em_preparo, prontos }];
    }),
    pendentes,
    notas_gerais: notasGerais,
  };
}

export function operacaoDoIfoodVM(gestor: PedidosDoGestorLocal, teknisa: PedidosReaisDoReader, agora: Date, incluirRevisoes = false, lerPracas?: LerPracas): OperacaoDoIfoodVM {
  if (gestor.estado === "nao_configurado")
    return { disponivel: false, titulo: "Gestor do iFood nao configurado nesta instancia",
      explicacao: "Isto nao significa Gestor fechado na loja: esta instancia nao foi apontada para ele." };
  if (gestor.estado === "indisponivel")
    return { disponivel: false, titulo: "Pedidos do iFood indisponiveis nesta leitura",
      explicacao: "O armazenamento do Gestor nao passou nas travas de leitura. Nenhum pedido foi mostrado para nao mostrar pedido errado." };
  const t = agora.getTime();
  const reais = teknisa.estado === "lido" ? teknisa.pedidos : [];
  const c = conciliarGestorTeknisa(gestor.pedidos, reais, agora);
  const todos = c.pares.map((p) => pedidoDaHome(p, t, incluirRevisoes));
  const ativos = todos.filter((p) => p.ativo).sort((a, b) => b.minutos - a.minutos);
  const concluidos = todos.filter((p) => !p.ativo).sort((a, b) => a.minutos - b.minutos).slice(0, LIMITE_DE_CONCLUIDOS);
  const atencao: AtencaoDaHome[] = [];
  for (const p of ativos) {
    const m = (motivo: string) => atencao.push({ codigo: p.codigo, hora: p.hora, motivo });
    if (p.teknisa.classe === "relacoes_nao_confirmadas") m("componentes e complementos lidos; conferir ligacoes no iFood");
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
  const leituraVelha = gravadoHa === null || gravadoHa > GESTOR_VELHO_MIN;
  const n = ativos.length;
  return {
    disponivel: true, lido_em: gestor.lido_em, gravado_ha_min: gravadoHa, leitura_velha: leituraVelha,
    titulo: n === 0 ? "Nenhum pedido em andamento no Gestor nesta leitura" : `${n} ${n === 1 ? "pedido" : "pedidos"} em andamento no iFood`,
    contagens: { no_gestor: todos.length, em_andamento: n, aguardando_aceite: conta((p) => p.etapa === "aguardando aceite"), em_preparo: conta((p) => p.etapa === "em preparo"),
      prontos: conta((p) => p.etapa.startsWith("pronto")), na_rua: conta((p) => p.etapa === "saiu para entrega" || p.etapa === "entregador no destino"),
      concluidos: conta((p) => p.etapa === "concluido"), cancelados: conta((p) => p.etapa === "cancelado") },
    atencao, pedidos: [...ativos, ...concluidos], conciliacao: c.contagens,
    ...(!leituraVelha && lerPracas ? { previa_por_praca: previaPorPraca(c.pares, lerPracas) } : {}),
    janela: c.janela ? `${horaLocal(Date.parse(c.janela.de))}–${horaLocal(Date.parse(c.janela.ate))}` : null,
    limitacoes: [
      "O Gestor guarda so os pedidos recentes (cerca de 25), nao o total do dia; a conciliacao vale so para essa janela.",
      "Sem comanda vista na Teknisa nao prova falha da integracao: o Reader pode nao ter visto.",
      reais.some(p=>p.reader_v3) ? "Reader V3 le relacoes filhas; correspondencia vale para os campos comparaveis enviados pelo iFood, nao atesta fim da gravacao na Teknisa." : "Complementos e observacoes por ocorrencia da Teknisa ainda nao sao lidos pela fonte; quando faltam, o pedido diz isso.",
      "Etapa e tempo de preparo vem dos eventos que o proprio Gestor grava; preparo fisico na cozinha nao e observado.",
    ],
  };
}
