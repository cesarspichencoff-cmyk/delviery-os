import type { PedidosDoGestorLocal } from "../../platform/leitura/pedidos-do-gestor-local";
import { elegerModo, ESTADO_INICIAL, POLITICA_CANONICA, type EstadoTemporal } from "../atencao/politica-temporal";
import { sinaisDe, type FonteLeitura, type LeituraOperacional, type PedidoLeitura } from "../viewmodels/sinais";
import { chaveDoPedidoGestor, GESTOR_VELHO_MIN } from "../viewmodels/home-operacao-ifood-vm";

const FONTE = "gestor_ifood_eventos";
const JANELA_ENTRE_LEITURAS_MS = 90_000;

/** Registros de status do aplicativo. Saúde aqui vale para o evento individual, não para a cobertura da fila. */
export function fatosDoGestorLocal(gestor: PedidosDoGestorLocal, agoraMs: number) {
  const gravadoMs = gestor.estado === "lido" && gestor.gravado_em ? Date.parse(gestor.gravado_em) : NaN;
  const idadeMs = agoraMs - gravadoMs;
  const recente = idadeMs >= 0 && idadeMs <= GESTOR_VELHO_MIN * 60_000;
  const fonte: FonteLeitura = {
    id: FONTE, rotulo: "Gestor iFood · eventos de status",
    estado: gestor.estado !== "lido" ? "indisponivel" : recente ? "saudavel" : "stale",
    detalhe: recente ? "Status oficiais dos pedidos observados. A janela do Gestor é parcial."
      : "Os eventos do Gestor deixaram de sustentar uma leitura atual.",
    ambientes: [],
  };
  const pedidos: PedidoLeitura[] = [];
  if (gestor.estado === "lido" && recente) {
    const janela = gestor.pedidos.filter(p => !p.teste);
    const repetidos = new Map<string, number>();
    for (const p of janela) repetidos.set(p.codigo_curto, (repetidos.get(p.codigo_curto) ?? 0) + 1);
    for (const p of janela) {
      if (repetidos.get(p.codigo_curto) !== 1) continue;
      const e = p.eventos;
      if (e.CANCELLED || e.CONCLUDED || p.ultimo_evento === "CANCELLED" || p.ultimo_evento === "CONCLUDED") continue;
      const desde = (iso?: string | null) => {
        const ms = iso ? Date.parse(iso) : NaN;
        return ms >= Date.parse(p.criado_em) && ms <= agoraMs ? Math.floor((agoraMs - ms) / 60_000) : null;
      };
      const saiu = e.DISPATCHED || e.COLLECTED || e.ARRIVED_AT_DESTINATION;
      const pronto = e.READY_TO_PICKUP;
      const espera = !saiu && p.tipo === "DELIVERY" ? desde(pronto) : null;
      const rua = p.tipo === "DELIVERY" ? desde(e.DISPATCHED || e.COLLECTED) : null;
      const preparo = !saiu && !pronto && desde(e.CONFIRMED) !== null ? desde(p.inicio_do_preparo) : null;
      if (espera === null && rua === null && preparo === null) continue;
      pedidos.push({
        id: chaveDoPedidoGestor(p.id_interno), codigo_publico: p.codigo_curto,
        itens: [], minutos_pronto_sem_sair: espera, minutos_sem_ficar_pronto: preparo,
        minutos_em_rua: rua, motivo_duas_sacolas: null, risco_de_conferencia: null,
      });
    }
  }
  return { fonte, pedidos, idade_min: idadeMs >= 0 ? idadeMs / 60_000 : null };
}

/** Uma eleição por Itaim. Reaproveita a política canônica e retira a causa se a fonte deixa de sustentá-la. */
export function criarAtencaoDoGestor() {
  let estado: EstadoTemporal = ESTADO_INICIAL;
  let ultimoMs: number | null = null;
  return (leitura: LeituraOperacional, fatos: ReturnType<typeof fatosDoGestorLocal>, agoraMs: number) => {
    const agora_min = Math.floor(agoraMs / 60_000);
    if (ultimoMs !== null && agoraMs < ultimoMs) {
      return elegerModo({ estado: ESTADO_INICIAL, agora_min, candidatas: [],
        fontes: [fatos.fonte], idade_da_leitura_min: fatos.idade_min });
    }
    const semContinuidade = ultimoMs !== null && agoraMs - ultimoMs > JANELA_ENTRE_LEITURAS_MS;
    estado = {
      ...(semContinuidade ? ESTADO_INICIAL : estado),
      marcada_em_min: Object.fromEntries(Object.entries(estado.marcada_em_min)
        .filter(([, min]) => agora_min >= min && agora_min - min <= POLITICA_CANONICA.cooldown_min)),
    };
    const candidatas = fatos.fonte.estado === "saudavel"
      ? sinaisDe(leitura).filter(s => s.codigo === "S1" || s.codigo === "S2" || s.codigo === "S3" || s.codigo === "S4").map(s => ({
          codigo: s.codigo, severidade: s.severidade, ambiente: s.ambiente, subarea: s.subarea,
          pedido_id: s.pedido_id, fonte_id: FONTE, evidencias: s.evidencias.length,
        }))
      : [];
    const temporal = elegerModo({ estado, agora_min, candidatas, fontes: [fatos.fonte], idade_da_leitura_min: fatos.idade_min });
    estado = temporal.estado;
    ultimoMs = agoraMs;
    return temporal;
  };
}
