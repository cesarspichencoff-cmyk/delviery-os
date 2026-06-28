/**
 * Ingestão do "Relatório de Pedidos" do iFood (export em LOTE, pedido-a-pedido).
 *
 * Funções PURAS: linha já parseada (objeto por coluna) → modelo canônico.
 * O relatório NÃO traz carimbos absolutos por etapa — traz DURAÇÕES (min) a partir
 * de "DATA E HORA DO PEDIDO". Reconstruímos os instantes a partir dela.
 * Regra (fiel à tese): nunca falsear etapa sem dado — duração ausente => sem carimbo.
 */
import type { PedidoIfoodCru } from "../core/adaptadores";
import { eventId, type Transicao } from "../core/dominio";

export type Linha = Record<string, unknown>;

/** Nomes EXATOS das colunas do relatório (perfil iFood — fácil de ajustar aqui). */
export const COL = {
  idCurto: "ID CURTO DO PEDIDO",
  idCompleto: "ID COMPLETO DO PEDIDO",
  dataHora: "DATA E HORA DO PEDIDO",
  turno: "TURNO",
  status: "STATUS FINAL DO PEDIDO",
  aceito: "PEDIDO ACEITO PELA LOJA",
  tPronto: "TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)",
  tEntrega: "TEMPO DA ENTREGA REALIZADA (MIN)",
  tCaminhoCliente: "TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)",
  tEsperandoCliente: "TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)",
  tAtraso: "TEMPO DE ATRASO EM RELAÇÃO AO TEMPO PROMETIDO DE ENTREGA (MIN)",
  dataCancel: "DATA DO CANCELAMENTO",
  motivoCancel: "MOTIVO DO CANCELAMENTO",
  problemaPos: "CLIENTE INFORMOU PROBLEMA EM PEDIDO APÓS A ENTREGA",
  respLojaPos: "RESPOSTA DA LOJA SOBRE PROBLEMA EM PEDIDO APÓS ENTREGA",
} as const;

export function txtCol(l: Linha, c: string): string {
  const v = l[c];
  return v == null ? "" : String(v).trim();
}
/** Chave canônica do pedido = ID COMPLETO (uuid, único no mês). O curto se repete. */
export function idCanonico(l: Linha): string {
  return txtCol(l, COL.idCompleto) || txtCol(l, COL.idCurto);
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "31/05/2026 22:59:38" (ou Date vindo do Excel) → ISO; null se vazio/inválido. */
export function parseDataHora(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const m = String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, ss ? +ss : 0));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function addMin(iso: string, min: number | null): string | undefined {
  if (min == null) return undefined;
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}
const ehCancelado = (status: string) => /cancel/i.test(status);

/** Linha do relatório → PedidoIfoodCru (dimensão de FLUXO), com instantes reconstruídos. */
export function linhaParaPedido(l: Linha): PedidoIfoodCru | null {
  const recebido = parseDataHora(l[COL.dataHora]);
  const id = idCanonico(l);
  if (!recebido || !id) return null;

  const status = txtCol(l, COL.status);
  const aceitou = /sim/i.test(txtCol(l, COL.aceito));
  const pedido: PedidoIfoodCru = {
    pedido_id: id,
    recebido_em: recebido,
    // sem horário próprio de aceite no relatório → aproxima ao recebido (só se aceito = SIM)
    aceito_em: aceitou ? recebido : undefined,
    raw: l,
  };

  if (ehCancelado(status)) {
    pedido.cancelado_em = parseDataHora(l[COL.dataCancel]) ?? recebido;
    return pedido;
  }

  pedido.pronto_em = addMin(recebido, num(l[COL.tPronto]));
  pedido.entregue_em = addMin(recebido, num(l[COL.tEntrega]));
  // "saiu para entrega" ≈ entregue − (à caminho do cliente) − (esperando no cliente)
  const tEnt = num(l[COL.tEntrega]);
  const tCam = num(l[COL.tCaminhoCliente]);
  const tEsp = num(l[COL.tEsperandoCliente]) ?? 0;
  if (tEnt != null && tCam != null) pedido.saiu_em = addMin(recebido, tEnt - tCam - tEsp);
  return pedido;
}

/**
 * Desfecho derivado de SINAL ESTRUTURADO do iFood (flag, não texto livre):
 * "cliente informou problema após entrega" = SIM → transição de DESFECHO "reclamou".
 * Procedência = observado (o flag é fato do iFood); confiança = alta.
 */
export function linhaParaDesfechoTransicao(l: Linha): Transicao | null {
  const id = idCanonico(l);
  const recebido = parseDataHora(l[COL.dataHora]);
  if (!id || !recebido) return null;
  if (!/sim/i.test(txtCol(l, COL.problemaPos))) return null;
  return {
    event_id: eventId("ifood", id, "ifood.problema_pos_entrega", recebido),
    pedido_id: id,
    tipo_evento: "ifood.problema_pos_entrega",
    fonte: "ifood",
    timestamp: recebido, // relatório não traz o horário do problema → usa o do pedido
    dimensao: "desfecho",
    payload_original: l,
    estado_anterior: null,
    estado_novo: "reclamou",
    confianca: "alta",
    procedencia: "observado",
  };
}

/** Erro/atrito derivado automaticamente (o "fechamento ressuscitado"). */
export interface ErroReal {
  pedido_id: string;
  tipo: "problema_pos_entrega" | "cancelamento";
  motivo: string;
  turno: string;
  data: string | null;
}
export function classificaErro(l: Linha): ErroReal | null {
  const id = txtCol(l, COL.idCurto) || txtCol(l, COL.idCompleto);
  if (!id) return null;
  const turno = txtCol(l, COL.turno);
  if (/sim/i.test(txtCol(l, COL.problemaPos))) {
    return {
      pedido_id: id, tipo: "problema_pos_entrega",
      motivo: txtCol(l, COL.respLojaPos) || "informado pelo cliente",
      turno, data: parseDataHora(l[COL.dataHora]),
    };
  }
  const mot = txtCol(l, COL.motivoCancel);
  if (mot) {
    return {
      pedido_id: id, tipo: "cancelamento", motivo: mot,
      turno, data: parseDataHora(l[COL.dataCancel]) ?? parseDataHora(l[COL.dataHora]),
    };
  }
  return null;
}

/** Atraso real informado pelo iFood (min). null se não houver. */
export function atrasoMin(l: Linha): number | null {
  return num(l[COL.tAtraso]);
}
