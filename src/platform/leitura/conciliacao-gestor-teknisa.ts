/**
 * CONCILIACAO GESTOR x TEKNISA — funcao PURA sobre duas leituras ja feitas (pedidos do Gestor local e
 * pedidos do Reader). Nao le disco, nao chama ninguem.
 *
 * Identidade: nunca so o codigo curto. O par exige MESMO codigo curto + abertura da comanda na Teknisa
 * a ate JANELA_DE_IDENTIDADE_MIN do PLACED do iFood + origem iFood; havendo mais de um candidato, so os
 * itens desempatam. Itens: o `externalCode` do iFood contra o CDARVPROD da Teknisa (medido em 15/11:
 * 41 de 41 codigos com um unico CDARVPROD; o CDPRODUTO NAO e o codigo do iFood).
 *
 * Limiares MEDIDOS em 22 pedidos reais de 14/11 (detalhe no documento da conciliacao): comanda aberta
 * 0,2-3,0 min depois do PLACED; primeira revisao estavel do Reader 1,1-4,5 min depois. Por isso o
 * pedido do iFood sem comanda so vira alerta depois de ESPERA_PELA_TEKNISA_MIN.
 *
 * O que NAO se conclui aqui: ausencia na Teknisa nao prova falha da integracao (pode ser o Reader que
 * nao viu); presenca so na Teknisa dentro da janela nao prova ausencia no iFood (o Gestor local guarda
 * so os pedidos recentes); estado nativo da Teknisa nao e comparado com o do iFood como se fossem a
 * mesma escala.
 */
import type { PedidoReal } from "./pedidos-reais-do-reader";
import type { PedidoDoGestor } from "./pedidos-do-gestor-local";

export const JANELA_DE_IDENTIDADE_MIN = 10;
export const ESPERA_PELA_TEKNISA_MIN = 6;

export type ClasseDoPar =
  | "relacoes_nao_confirmadas"
  | "revisao_retida"
  | "correspondencia_comprovada"
  | "complemento_nao_lido_pela_teknisa"
  | "observacao_nao_lida_pela_teknisa"
  | "observacao_divergente"
  | "item_ou_quantidade_divergente"
  | "identidade_ambigua"
  | "aguardando_teknisa"
  | "sem_comanda_na_teknisa";

export interface ParDaConciliacao {
  readonly gestor: PedidoDoGestor;
  readonly teknisa: PedidoReal | null;
  readonly classe: ClasseDoPar;
  /** Frases curtas, sem dado de cliente, que explicam a classe. */
  readonly detalhes: readonly string[];
  readonly minutos_desde_o_pedido: number;
  readonly minutos_ate_a_comanda: number | null;
}
export interface ConciliacaoGestorTeknisa {
  readonly pares: readonly ParDaConciliacao[];
  readonly somente_na_teknisa_na_janela: readonly PedidoReal[];
  readonly janela: { readonly de: string; readonly ate: string } | null;
  readonly contagens: Readonly<Record<ClasseDoPar | "somente_na_teknisa_na_janela", number>>;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** Hora local da Teknisa (sem fuso) -> instante. Sao Paulo, sem horario de verao desde 2019. */
export const instanteDaTeknisa = (local: string) => Date.parse(local.slice(0, 19) + "-03:00");
export const placedDe = (g: PedidoDoGestor) => Date.parse(g.eventos["PLACED"] ?? g.criado_em);

type Multi = Map<string, number>;
function soma(m: Multi, k: string, q: number) { m.set(k, (m.get(k) ?? 0) + q); }
function iguais(a: Multi, b: Multi) {
  const ka = [...a].filter(([, v]) => v !== 0), kb = [...b].filter(([, v]) => v !== 0);
  return ka.length === kb.length && ka.every(([k, v]) => Math.abs((b.get(k) ?? 0) - v) < 1e-6);
}
function daTeknisa(t: PedidoReal): Multi | null {
  const m: Multi = new Map();
  for (const i of t.itens) {
    const q = i.quantidade ?? Number(i.quantidade_nativa);
    if (i.codigo_arvore === null || !Number.isFinite(q)) return null;
    soma(m, i.codigo_arvore, q);
  }
  return m;
}
function doGestor(g: PedidoDoGestor, opcoes: "sem" | "por_unidade" | "total"): Multi | null {
  const m: Multi = new Map();
  for (const i of g.itens) {
    if (i.codigo_externo === null) return null;
    soma(m, i.codigo_externo, i.quantidade);
    if (opcoes !== "sem") for (const o of i.opcoes) {
      if (o.codigo_externo === null) return null;
      soma(m, o.codigo_externo, opcoes === "por_unidade" ? o.quantidade * i.quantidade : o.quantidade);
    }
  }
  return m;
}

function compararItens(g: PedidoDoGestor, t: PedidoReal): "iguais" | "iguais_sem_opcoes" | "divergentes" | "nao_comparavel" {
  const mt = daTeknisa(t), gs = doGestor(g, "sem");
  if (mt === null || gs === null) return "nao_comparavel";
  const temOpcoes = g.itens.some((i) => i.opcoes.length > 0);
  if (temOpcoes) {
    const gu = doGestor(g, "por_unidade"), gt = doGestor(g, "total");
    if ((gu && iguais(gu, mt)) || (gt && iguais(gt, mt))) return "iguais";
    if (iguais(gs, mt)) return "iguais_sem_opcoes";
    return "divergentes";
  }
  return iguais(gs, mt) ? "iguais" : "divergentes";
}

function compararObservacoes(g: PedidoDoGestor, t: PedidoReal): "sem_observacao" | "conferem" | "nao_lidas" | "divergem" {
  const comTexto = g.itens.filter((i) => i.observacao !== null);
  if (!comTexto.length) return "sem_observacao";
  if (t.completude.observacoes !== "campos_de_texto_lidos") return "nao_lidas";
  if (t.reader_v3) {
    // A shared SKU or order note cannot attest a specific native item line.
    for (const i of comTexto) {
      const linhas = t.itens.filter(x => x.codigo_arvore === i.codigo_externo);
      const nota = norm(i.observacao!);
      const codigoUnicoNoGestor = g.itens.filter(x => x.codigo_externo === i.codigo_externo).length === 1;
      if (!nota || !codigoUnicoNoGestor || linhas.length !== 1 ||
          !(linhas[0]!.observacoes ?? []).some(texto => norm(texto) === nota)) return "divergem";
    }
    return "conferem";
  }
  const doPedido = (t.observacoes_do_pedido ?? []).map(norm).join(" | ");
  for (const i of comTexto) {
    const alvo = norm(i.observacao!);
    const daLinha = t.itens.filter((x) => x.codigo_arvore === i.codigo_externo).flatMap((x) => x.observacoes ?? []).map(norm).join(" | ");
    if (!daLinha.includes(alvo) && !doPedido.includes(alvo)) return "divergem";
  }
  return "conferem";
}

export function conciliarGestorTeknisa(gestor: readonly PedidoDoGestor[], teknisa: readonly PedidoReal[], agora: Date): ConciliacaoGestorTeknisa {
  const ifood = teknisa.filter((t) => t.origem === "DLV_IFO" && t.codigo_curto !== null);
  const usados = new Set<string>();
  const pares: ParDaConciliacao[] = [];
  const contagens: Record<string, number> = { relacoes_nao_confirmadas: 0, revisao_retida: 0, correspondencia_comprovada: 0, complemento_nao_lido_pela_teknisa: 0, observacao_nao_lida_pela_teknisa: 0,
    observacao_divergente: 0, item_ou_quantidade_divergente: 0, identidade_ambigua: 0, aguardando_teknisa: 0, sem_comanda_na_teknisa: 0, somente_na_teknisa_na_janela: 0 };
  // Mais antigos primeiro: um candidato ja usado nao casa de novo.
  for (const g of [...gestor].sort((a, b) => placedDe(a) - placedDe(b))) {
    const placed = placedDe(g);
    const minutos = Math.max(0, Math.round((agora.getTime() - placed) / 60_000));
    const cand = ifood.filter((t) => !usados.has(t.chave) && t.codigo_curto === g.codigo_curto &&
      Math.abs(instanteDaTeknisa(t.aberto_em_local) - placed) <= JANELA_DE_IDENTIDADE_MIN * 60_000);
    let alvo: PedidoReal | null = null;
    if (cand.length === 1) alvo = cand[0]!;
    else if (cand.length > 1) {
      const batem = cand.filter((t) => { const c = compararItens(g, t); return c === "iguais" || c === "iguais_sem_opcoes"; });
      if (batem.length === 1) alvo = batem[0]!;
      else {
        pares.push({ gestor: g, teknisa: null, classe: "identidade_ambigua", minutos_desde_o_pedido: minutos, minutos_ate_a_comanda: null,
          detalhes: [`${cand.length} comandas da Teknisa com o mesmo codigo e horario; os itens nao desempatam`] });
        contagens["identidade_ambigua"]!++; continue;
      }
    }
    if (alvo === null) {
      const espera = minutos < ESPERA_PELA_TEKNISA_MIN && !g.eventos["CANCELLED"];
      const classe: ClasseDoPar = espera ? "aguardando_teknisa" : "sem_comanda_na_teknisa";
      pares.push({ gestor: g, teknisa: null, classe, minutos_desde_o_pedido: minutos, minutos_ate_a_comanda: null,
        detalhes: espera ? [`pedido de ${minutos} min; a comanda costuma aparecer em ate ${ESPERA_PELA_TEKNISA_MIN} min`]
          : [`no iFood ha ${minutos} min e nenhuma comanda da Teknisa vista pelo Reader com o mesmo codigo e horario`,
             "nao prova falha da integracao: o Reader pode nao ter visto"] });
      contagens[classe]!++; continue;
    }
    usados.add(alvo.chave);
    const itens = compararItens(g, alvo), obs = compararObservacoes(g, alvo);
    const detalhes: string[] = [];
    let classe: ClasseDoPar;
    if (alvo.retido) { classe = "revisao_retida"; detalhes.push("revisao do Reader retida; nao confirma o pedido do iFood"); }
    else if (itens === "divergentes" || itens === "nao_comparavel") {
      classe = "item_ou_quantidade_divergente";
      detalhes.push(itens === "nao_comparavel" ? "item sem codigo comparavel em uma das fontes" : "itens ou quantidades diferentes entre iFood e Teknisa");
    } else if (obs === "divergem") { classe = "observacao_divergente"; detalhes.push("observacao do cliente no iFood nao encontrada no texto lido da Teknisa"); }
    else if (obs === "nao_lidas") { classe = "observacao_nao_lida_pela_teknisa"; detalhes.push("ha observacao no iFood; a leitura da Teknisa nao provou as observacoes deste pedido"); }
    else if (alvo.reader_v3 && alvo.itens.some(i => (i.componentes?.length ?? 0) > 0 || (i.complementos?.length ?? 0) > 0 || i.combinado)) {
      classe = "relacoes_nao_confirmadas";
      detalhes.push("itens conferem; as ligacoes de componentes e complementos foram lidas, mas ainda exigem conferencia individual com o iFood");
    } else if (itens === "iguais_sem_opcoes") {
      classe = "complemento_nao_lido_pela_teknisa";
      detalhes.push("itens conferem; os complementos do iFood nao aparecem como linha na leitura atual da Teknisa");
    } else classe = "correspondencia_comprovada";
    if (g.eventos["CANCELLED"]) detalhes.push(`cancelado no iFood; Teknisa mostra estado ${alvo.estado_nativo}`);
    if (g.itens_cancelados + g.itens_alterados > 0) detalhes.push("o iFood registra item cancelado ou alterado neste pedido");
    contagens[classe]!++;
    pares.push({ gestor: g, teknisa: alvo, classe, detalhes, minutos_desde_o_pedido: minutos,
      minutos_ate_a_comanda: Math.round((instanteDaTeknisa(alvo.aberto_em_local) - placed) / 6_000) / 10 });
  }
  let janela: ConciliacaoGestorTeknisa["janela"] = null;
  let somente: PedidoReal[] = [];
  if (gestor.length) {
    const ts = gestor.map(placedDe); const de = Math.min(...ts), ate = Math.max(...ts) + JANELA_DE_IDENTIDADE_MIN * 60_000;
    janela = { de: new Date(de).toISOString(), ate: new Date(ate).toISOString() };
    somente = ifood.filter((t) => !usados.has(t.chave) && instanteDaTeknisa(t.aberto_em_local) >= de && instanteDaTeknisa(t.aberto_em_local) <= ate);
    contagens["somente_na_teknisa_na_janela"] = somente.length;
  }
  return { pares, somente_na_teknisa_na_janela: somente, janela, contagens: contagens as ConciliacaoGestorTeknisa["contagens"] };
}
