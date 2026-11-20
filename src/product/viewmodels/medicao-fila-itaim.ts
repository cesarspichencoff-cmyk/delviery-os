import cardapio from "../../../data/cardapio_knowledge_seed.json";
import { PRACAS, type PracaId } from "./areas";
import type { PedidoIfoodDaHome, PreviaPorPraca } from "./home-operacao-ifood-vm";

const PRACAS_FRIAS: ReadonlySet<PracaId> = new Set(["combinados", "duplas", "enrolados", "sobremesa"]);
const PRODUCAO = PRACAS.filter(p => p.ambiente === "sushi" || p.ambiente === "cozinha");
const QUENTES: ReadonlySet<PracaId> = new Set(["enrolados_quentes", "cozinha_quentes"]);
const JANELA_DE_PRAZO_MIN = 5;
const normalizar = (nome: string) => nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const bebidas = new Map(cardapio.itens.filter(i => i.categoria_operacional === "bebida").map(i => [normalizar(i.nome), i]));
type Grupo = PreviaPorPraca["grupos"][number];
type Referencia = Pick<PedidoIfoodDaHome, "chave_gestor" | "codigo" | "hora" | "etapa">;
type ItemComPraca = { praca: PracaId; item: Grupo["itens"][number] };
type SugestaoDeSacola = { rotulo: string; itens: { produto: string; quantidade: number; opcoes: readonly string[] }[] };

function separacaoDeSacolas(linhas: readonly ItemComPraca[]) {
  const quentes = linhas.filter(l => l.praca === "cozinha_quentes");
  const frios = linhas.filter(l => PRACAS_FRIAS.has(l.praca));
  const grandes: ItemComPraca[] = [];
  const latas: ItemComPraca[] = [];
  for (const linha of linhas) {
    if (linha.praca !== "bar_bebidas") continue;
    const bebida = bebidas.get(normalizar(linha.item.produto));
    if (!bebida) continue;
    const embalagem = `${bebida.nome} ${bebida.descricao ?? ""}`;
    if (bebida.subcategoria_operacional === "refrigerante" && /\blata\b/i.test(embalagem)) latas.push(linha);
    if (bebida.subcategoria_operacional === "vinho" || (bebida.subcategoria_operacional === "sake" && /\b720\s*ml\b/i.test(embalagem))) grandes.push(linha);
  }
  const totalDeLatas = latas.reduce((total, l) => total + l.item.quantidade, 0);
  const grupos: SugestaoDeSacola[] = [];
  const separados = new Set<ItemComPraca>();
  const motivos: string[] = [];
  const adicionar = (rotulo: string, itens: readonly ItemComPraca[]) => {
    for (const linha of itens) separados.add(linha);
    grupos.push({ rotulo, itens: itens.map(({ item }) => ({ produto: item.produto, quantidade: item.quantidade, opcoes: item.opcoes })) });
  };
  if (quentes.length > 0 && frios.length > 0) {
    motivos.push("Quente de cozinha e itens frios");
    adicionar("Quentes de cozinha", quentes);
    adicionar("Frios e sobremesas", frios);
  }
  if (grandes.length > 0) {
    motivos.push("Bebida grande em sacola separada");
    adicionar("Bebidas grandes", grandes);
  }
  if (totalDeLatas >= 6) {
    motivos.push(`${totalDeLatas} latas de refrigerante em sacola separada`);
    adicionar("Latas de refrigerante", latas);
  }
  if (motivos.length === 0) return null;
  const restantes = linhas.filter(l => !separados.has(l));
  // Hot roll pode acompanhar frios ou quentes. Volume e estabilidade dependem do balcão.
  const conferir = quentes.length > 0 && frios.length > 0 ? restantes : [];
  if (restantes.length > 0 && conferir.length === 0) adicionar("Demais itens", restantes);
  return { motivos, grupos,
    conferir: conferir.map(({ item }) => ({ produto: item.produto, quantidade: item.quantidade, opcoes: item.opcoes })) };
}

export function medirFilaItaim(ativos: readonly PedidoIfoodDaHome[], previa: PreviaPorPraca) {
  const itensPorPedido = new Map<string, ItemComPraca[]>();
  for (const grupo of previa.grupos) for (const item of grupo.itens) {
    const linhas = itensPorPedido.get(item.chave_gestor) ?? [];
    linhas.push({ praca: grupo.praca, item });
    itensPorPedido.set(item.chave_gestor, linhas);
  }
  const pendentes = new Set(previa.pendentes.map(p => p.chave_gestor));
  const composicoes = new Map<string, { id: string; rotulo: string; pedidos: Referencia[] }>();
  const aConferir: Referencia[] = [];
  const soQuentes: Referencia[] = [];
  const sacolas: (Referencia & NonNullable<ReturnType<typeof separacaoDeSacolas>> & { composicao_completa: boolean })[] = [];
  const atrasos: (Referencia & { minutos: number; prazo?: string })[] = [];
  const pertoDoPrazo: typeof atrasos = [];
  const atrasoPorPraca = new Map<PracaId, typeof atrasos>();
  const preparoPorPraca = new Map<PracaId, number>();
  let emPreparo = 0;
  let atrasosComPracaPendente = 0;
  let preparoSemPrazo = 0;
  let prontosEntrega = 0;
  let prontosRetirada = 0;
  let prontosSemModalidade = 0;

  for (const p of ativos) {
    if (p.etapa.startsWith("pronto")) {
      if (p.modalidade === "retirada") prontosRetirada++;
      else if (p.modalidade === "entrega propria" || p.modalidade === "entrega iFood" || p.modalidade === "delivery") prontosEntrega++;
      else prontosSemModalidade++;
    } else if (p.etapa !== "em preparo") continue;

    const referencia = { chave_gestor: p.chave_gestor, codigo: p.codigo, hora: p.hora, etapa: p.etapa };
    const linhas = itensPorPedido.get(p.chave_gestor ?? "") ?? [];
    const pracas = new Set(linhas.map(l => l.praca));
    const completa = linhas.length > 0 && !pendentes.has(p.chave_gestor);
    if (completa) {
      const producao = PRODUCAO.filter(praca => pracas.has(praca.id));
      const chave = producao.map(praca => praca.id).join("-") || "apoio";
      const rotulo = producao.length === 1 ? `Só ${producao[0]!.rotulo}`
        : producao.map(praca => praca.rotulo).join(" + ") || "Só itens de apoio";
      const grupo = composicoes.get(chave) ?? { id: chave, rotulo, pedidos: [] };
      grupo.pedidos.push(referencia);
      composicoes.set(chave, grupo);
      if (producao.length > 0 && producao.every(p => QUENTES.has(p.id))) soQuentes.push(referencia);
    } else aConferir.push(referencia);

    const separacao = separacaoDeSacolas(linhas);
    if (separacao && separacao.grupos.length >= 2) sacolas.push({ ...referencia, ...separacao, composicao_completa: completa });

    if (p.etapa !== "em preparo") continue;
    emPreparo++;
    for (const praca of pracas) preparoPorPraca.set(praca, (preparoPorPraca.get(praca) ?? 0) + 1);
    if (p.preparo === null) preparoSemPrazo++;
    if (p.preparo?.faltam_min != null && p.preparo.faltam_min <= JANELA_DE_PRAZO_MIN) {
      pertoDoPrazo.push({ ...referencia, minutos: p.preparo.faltam_min, prazo: p.preparo.prazo });
    }
    if (p.preparo?.passou_min == null) continue;
    const atraso = { ...referencia, minutos: p.preparo.passou_min, prazo: p.preparo.prazo };
    atrasos.push(atraso);
    if (!completa) atrasosComPracaPendente++;
    for (const praca of pracas) {
      const pedidos = atrasoPorPraca.get(praca) ?? [];
      pedidos.push(atraso);
      atrasoPorPraca.set(praca, pedidos);
    }
  }

  const porAtraso = (a: typeof atrasos[number], b: typeof atrasos[number]) => b.minutos - a.minutos || a.hora.localeCompare(b.hora);
  return {
    pedidos_abertos: ativos.length,
    prontos_para_entrega: prontosEntrega,
    prontos_para_retirada: prontosRetirada,
    prontos_sem_modalidade: prontosSemModalidade,
    composicoes: [...composicoes.values()].sort((a, b) => b.pedidos.length - a.pedidos.length || a.rotulo.localeCompare(b.rotulo, "pt-BR")),
    composicao_a_conferir: aConferir,
    so_quentes: soQuentes,
    concentracao_no_preparo: PRODUCAO.flatMap(({ id }) => {
      const total = preparoPorPraca.get(id) ?? 0;
      return total >= 5 && total * 5 >= emPreparo * 3 ? [{ praca: id, total, em_preparo: emPreparo }] : [];
    }),
    duas_sacolas: sacolas,
    perto_do_prazo: pertoDoPrazo.sort((a, b) => a.minutos - b.minutos || a.hora.localeCompare(b.hora)),
    atrasos: atrasos.sort(porAtraso),
    atrasos_por_praca: PRACAS.flatMap(praca => {
      const pedidos = atrasoPorPraca.get(praca.id);
      return pedidos ? [{ praca: praca.id, rotulo: praca.rotulo, pedidos: pedidos.sort(porAtraso) }] : [];
    }).sort((a, b) => b.pedidos.length - a.pedidos.length),
    atrasos_com_praca_pendente: atrasosComPracaPendente,
    preparo_sem_prazo: preparoSemPrazo,
  };
}

export type MedicaoFilaItaim = ReturnType<typeof medirFilaItaim>;
