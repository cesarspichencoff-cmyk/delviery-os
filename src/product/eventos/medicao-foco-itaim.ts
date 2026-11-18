import { appendFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { HomeVM } from "../viewmodels/home-vm";
import type { OperacaoDoIfoodVM } from "../viewmodels/home-operacao-ifood-vm";

const horarioItaim = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

/** Observa as respostas que o Copiloto já produz. O arquivo tem apenas medidas agregadas. */
export function criarMedicaoFocoItaim(arquivo: string, dia: string) {
  let ultimaAmostra = 0;
  let ultimoTurno: string | null = null;
  let ultimoFoco: string | null = null;
  let gravando = Promise.resolve();
  return (agora: number, home: HomeVM, operacao: OperacaoDoIfoodVM | null, idadeGestor: number | null) => {
    if (!isAbsolute(arquivo) || !dia) return;
    const partes = Object.fromEntries(horarioItaim.formatToParts(agora).map(p => [p.type, p.value]));
    if (`${partes.year}-${partes.month}-${partes.day}` !== dia) return;
    const hora = Number(partes.hour);
    const turno = hora >= 11 && hora < 15 ? "almoco" : hora >= 18 && hora < 23 ? "jantar" : null;
    if (!turno) return;
    if (turno !== ultimoTurno) {
      ultimaAmostra = 0;
      ultimoFoco = null;
      ultimoTurno = turno;
    }
    const sinal = home.foco?.sinal;
    const foco = sinal ? JSON.stringify([sinal.codigo, sinal.ambiente, sinal.subarea, sinal.pedido_id]) : null;
    const transicao = foco === ultimoFoco ? null : foco === null ? "saiu" : ultimoFoco === null ? "entrou" : "trocou";
    if (!transicao && agora - ultimaAmostra < 60_000) return;
    ultimaAmostra = agora;
    ultimoFoco = foco;
    const pedido = sinal?.pedido_id && operacao?.disponivel
      ? operacao.pedidos.find(p => p.chave_gestor === sinal.pedido_id) : undefined;
    const amostra = {
      em: new Date(agora).toISOString(), turno, modo: home.modo, transicao,
      gestor: home.fontes.find(f => f.id === "gestor_ifood_eventos")?.estado ?? null,
      idade_gestor_s: idadeGestor === null ? null : Math.round(idadeGestor * 60),
      motivo_foco: sinal?.codigo ?? null, praca_foco: sinal?.subarea ?? sinal?.ambiente ?? null,
      preparo_excedido_min: pedido?.preparo?.passou_min ?? null,
      sinais_graves_fora_do_foco: home.sinais_em_segundo_plano.filter(s => s.severidade === 3).length,
      carga_ifood_observada: operacao?.disponivel ? operacao.contagens.em_andamento ?? null : null,
      resposta_ms: Math.max(0, Date.now() - agora),
    };
    gravando = gravando.then(() => appendFile(arquivo, JSON.stringify(amostra) + "\n", "utf8"))
      .catch(() => { console.error("MEDICAO_FOCO_ITAIM_GRAVACAO_INDISPONIVEL"); });
  };
}
