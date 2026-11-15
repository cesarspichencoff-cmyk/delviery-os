/**
 * Pedidos da Teknisa na Home do gerente (Reader V3, camada 1). Funcao PURA sobre a leitura de
 * `pedidos-reais-do-reader.ts`: nao le arquivo, nao interpreta estado nativo, nao inventa completude.
 *
 * O que a Home mostra: os pedidos do dia (ou do ultimo dia com pedidos, dito como tal), do mais novo
 * para o mais antigo, com itens, quantidades e observacoes de texto; os retidos com o codigo; e, sempre,
 * o que a fonte NAO le (observacoes por ocorrencia, componentes de combinado, complementos).
 */
import type { PedidosReaisDoReader, PedidoReal } from "../../platform/leitura/pedidos-reais-do-reader";

export const LIMITE_DA_LISTA = 60;
const ORIGEM: Record<string, string> = { DLV_IFO: "iFood" };
const TURNO: Record<string, string> = { ALMOCO: "almoco", JANTAR: "jantar", FORA_DO_HORARIO: "fora do horario", SEM_POLITICA: "turno sem politica" };

export interface ItemDaHome { readonly descricao: string; readonly quantidade: string; readonly observacoes: readonly string[] | null }
export interface PedidoDaHome {
  readonly hora: string;
  readonly codigo: string | null;
  readonly origem: string;
  readonly turno: string;
  /** O codigo nativo da Teknisa, sem interpretacao (X nao e necessariamente cancelamento). */
  readonly estado_teknisa: string;
  readonly retido: boolean;
  readonly motivos: readonly string[];
  readonly turno_resolvido_pela_politica: boolean;
  readonly itens: readonly ItemDaHome[];
  readonly observacoes_do_pedido: readonly string[] | null;
  readonly observacoes: string;
}
export type PedidosDaTeknisaVM =
  | { readonly disponivel: false; readonly motivo: string; readonly titulo: string; readonly explicacao: string }
  | {
      readonly disponivel: true;
      readonly lido_em: string;
      readonly dia: string;
      readonly dia_e_hoje: boolean;
      readonly titulo: string;
      readonly contagens: { readonly pedidos: number; readonly retidos: number; readonly estado_x: number; readonly almoco: number; readonly jantar: number; readonly fora_do_horario: number };
      readonly pedidos: readonly PedidoDaHome[];
      readonly limite_da_lista: number;
      readonly completude: string;
      readonly politica: string | null;
      readonly limitacoes: readonly string[];
    };

const hojeLocal = (agora: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);

function pedidoDaHome(p: PedidoReal): PedidoDaHome {
  const obs = p.completude.observacoes === "nao_lidas_pela_fonte" ? "observacoes nao lidas pela fonte"
    : p.completude.observacoes === "parcial" ? "observacoes parciais (ligacao nao provada)" : "observacoes de texto lidas";
  return {
    hora: p.aberto_em_local.slice(11, 16), codigo: p.codigo_curto, origem: ORIGEM[p.origem] ?? p.origem,
    turno: TURNO[p.turno] ?? p.turno, estado_teknisa: p.estado_nativo, retido: p.retido, motivos: p.motivos_de_retencao,
    turno_resolvido_pela_politica: p.bloqueios_de_turno_substituidos.length > 0,
    itens: p.itens.map((i) => ({ descricao: i.nome ?? `produto ${i.codigo}`, quantidade: i.quantidade !== null ? String(i.quantidade) : i.quantidade_nativa, observacoes: i.observacoes })),
    observacoes_do_pedido: p.observacoes_do_pedido, observacoes: obs,
  };
}

export function pedidosDaTeknisaVM(leitura: PedidosReaisDoReader, agora: Date): PedidosDaTeknisaVM {
  if (leitura.estado === "nao_configurado")
    return { disponivel: false, motivo: "nao_configurado", titulo: "Reader da Teknisa nao configurado nesta instancia",
      explicacao: "Isto nao significa que o Reader esteja desligado na loja: esta instancia nao foi apontada para ele." };
  if (leitura.estado === "indisponivel")
    return { disponivel: false, motivo: leitura.motivo, titulo: "Pedidos da Teknisa indisponiveis nesta leitura",
      explicacao: "O arquivo do Reader nao passou nas travas de leitura. Nenhum pedido foi mostrado para nao mostrar pedido errado." };
  const hoje = hojeLocal(agora);
  const dias = [...new Set(leitura.pedidos.map((p) => p.dia))].sort();
  const dia = dias.includes(hoje) ? hoje : dias[dias.length - 1] ?? hoje;
  const doDia = leitura.pedidos.filter((p) => p.dia === dia);
  const conta = (f: (p: PedidoReal) => boolean) => doDia.filter(f).length;
  const n = doDia.length;
  return {
    disponivel: true, lido_em: leitura.lido_em, dia, dia_e_hoje: dia === hoje,
    titulo: n === 0 ? "Nenhum pedido de delivery visto pelo Reader nesta leitura"
      : dia === hoje ? `${n} ${n === 1 ? "pedido" : "pedidos"} de delivery hoje na Teknisa`
      : `${n} ${n === 1 ? "pedido" : "pedidos"} do ultimo dia com pedidos (${dia.slice(8, 10)}/${dia.slice(5, 7)}); nenhum hoje ainda`,
    contagens: { pedidos: n, retidos: conta((p) => p.retido), estado_x: conta((p) => p.estado_nativo === "X"),
      almoco: conta((p) => p.turno === "ALMOCO"), jantar: conta((p) => p.turno === "JANTAR"), fora_do_horario: conta((p) => p.turno === "FORA_DO_HORARIO") },
    pedidos: doDia.slice(0, LIMITE_DA_LISTA).map(pedidoDaHome), limite_da_lista: LIMITE_DA_LISTA,
    completude: "Itens, quantidades e observacoes de texto lidos. Observacoes por ocorrencia, componentes de combinados e complementos ainda nao sao lidos pela fonte.",
    politica: leitura.politica.valida ? leitura.politica.versao : null,
    limitacoes: [
      "Janela do proprio Reader: os 250 pedidos mais recentes; um dia com mais pedidos do que isso aparece cortado.",
      "Revisao estavel do Reader nao prova que a Teknisa terminou de gravar o pedido.",
      "Estado da Teknisa mostrado como codigo; X nao e necessariamente cancelamento.",
    ],
  };
}
