import { appendFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import politica from "../../../tools/windows-local-lab/production-service-weekly-policy.json";
import type { HomeVM } from "../viewmodels/home-vm";
import type { OperacaoDoIfoodVM } from "../viewmodels/home-operacao-ifood-vm";

const horarioItaim = new Intl.DateTimeFormat("en-CA", {
  timeZone: politica.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23",
});

/** Observa as respostas que o Copiloto já produz. O arquivo tem apenas medidas agregadas. */
export function criarMedicaoFocoItaim(arquivo: string, dia: string) {
  const diaDaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const janelas = politica.week.find(d => d.day_of_week === diaDaSemana)?.windows ?? [];
  let ultimaAmostra = 0;
  let ultimoTurno: string | null = null;
  let ultimoFoco: string | null = null;
  let gravando = Promise.resolve();
  return (agora: number, home: HomeVM, operacao: OperacaoDoIfoodVM | null, idadeGestor: number | null) => {
    if (!isAbsolute(arquivo) || !dia) return;
    const partes = Object.fromEntries(horarioItaim.formatToParts(agora).map(p => [p.type, p.value]));
    if (`${partes.year}-${partes.month}-${partes.day}` !== dia) return;
    const hora = `${partes.hour}:${partes.minute}`;
    const servico = janelas.find(j => j.start <= hora && hora < j.end)?.service;
    const turno = servico === "LUNCH" ? "almoco" : servico === "DINNER" ? "jantar" : null;
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
    const medicao = operacao?.disponivel ? operacao.medicao_itaim : undefined;
    const amostra = {
      em: new Date(agora).toISOString(), turno, modo: home.modo, transicao,
      gestor: home.fontes.find(f => f.id === "gestor_ifood_eventos")?.estado ?? null,
      idade_gestor_s: idadeGestor === null ? null : Math.round(idadeGestor * 60),
      motivo_foco: sinal?.codigo ?? null, praca_foco: sinal?.subarea ?? sinal?.ambiente ?? null,
      preparo_excedido_min: pedido?.preparo?.passou_min ?? null,
      sinais_graves_fora_do_foco: home.sinais_em_segundo_plano.filter(s => s.severidade === 3).length,
      carga_ifood_observada: operacao?.disponivel ? operacao.contagens.em_andamento ?? null : null,
      aguardando_aceite: operacao?.disponivel ? operacao.contagens.aguardando_aceite ?? null : null,
      em_preparo: operacao?.disponivel ? operacao.contagens.em_preparo ?? null : null,
      prontos_para_despacho: medicao?.prontos_para_entrega ?? null,
      em_entrega: operacao?.disponivel ? operacao.contagens.na_rua ?? null : null,
      composicao_a_conferir: medicao?.composicao_a_conferir.length ?? null,
      separacoes_identificadas: medicao?.duas_sacolas.length ?? null,
      atrasados: medicao?.atrasos.length ?? null,
      atrasados_com_praca_pendente: medicao?.atrasos_com_praca_pendente ?? null,
      resposta_ms: Math.max(0, Date.now() - agora),
    };
    gravando = gravando.then(() => appendFile(arquivo, JSON.stringify(amostra) + "\n", "utf8"))
      .catch(() => { console.error("MEDICAO_FOCO_ITAIM_GRAVACAO_INDISPONIVEL"); });
  };
}
