/**
 * DeliveryOS — Product System · view model de ENTREGAS
 *
 * Leitura apenas. Nao executa comando, nao move pedido, nao altera capacidade.
 * O que esta superficie sabe vem do `UiApplicationFacade`, que roda em memoria
 * com `seedDemo()` — por isso a procedencia declarada e `simulado` e o modulo
 * inteiro carrega `somente_demonstracao`. Nao ha nesta unidade uma API de campo
 * que devolva viagem real, e inventar uma seria exatamente o que o bloco proibe.
 */

import type { UiSnapshot } from "../../entregas/ui/adapters/UiApplicationFacade";
import type {
  AparelhoReal,
  RealidadeDeEntregas,
} from "../../platform/leitura/realidade-de-entregas";
import type { SourceMode } from "../../platform/contracts/event-catalog";
import {
  JANELAS,
  classificarFrescor,
  type EstadoViagem,
  type Frescor,
  type ViagemProjetada,
} from "../../platform/projections/operacao-viva";
import { instanteConfiavel } from "../../platform/contracts/relogio";
import {
  ausente,
  observado,
  selo,
  type Campo,
  type Limitacao,
  type MotivoAusencia,
  type Procedencia,
  type Selo,
} from "./estados";

export interface ParadaVM {
  readonly delivery_id: string;
  /** Referencia de PEDIDO. Vem do dominio de Entregas, que tem identidade de pedido. */
  readonly pedido_ref: string;
  readonly estado: string;
  readonly ativa: boolean;
  readonly ordem: number;
}

export interface ViagemVM {
  /**
   * Identidade de VIAGEM. Nunca e identidade de pedido, e nenhum campo desta
   * view model chamado `pedido_*` recebe este valor.
   */
  readonly viagem_id: string;
  readonly rotulo_identidade: "Viagem";
  readonly estado: string;
  readonly entregador: string;
  readonly paradas: readonly ParadaVM[];
  readonly paradas_ativas: number;
  readonly limite_paradas: Campo<number>;
}

export interface DispositivoVM {
  readonly credencial: Campo<string>;
  readonly gps: Campo<string>;
  readonly ultima_sincronizacao: Campo<string>;
  readonly fila_offline: Campo<number>;
  readonly revogado: Campo<boolean>;
}

export interface OcorrenciaVM {
  readonly ocorrencia_id: string;
  readonly estado: string;
  readonly relato: string;
  readonly bloqueia_disponibilidade: boolean;
  readonly selo: Selo;
}

/* ------------------------------------------------------------------ *
 * REALIDADE — o que a cadeia canonica sustenta
 * ------------------------------------------------------------------ */

/**
 * Um aparelho AUTORIZADO, lido de `identity.device` e de `platform.event_log`.
 *
 * Cada campo carrega a procedencia do FATO que o sustenta: um lote gravado
 * `simulated` aparece como simulado, nunca como real. O cadastro em si e um
 * ato administrativo e nao carrega modo — e isso fica declarado.
 */
export interface AparelhoRealVM {
  readonly device_id: string;
  readonly rotulo: string;
  readonly unidade: string;
  readonly entregador: Campo<string>;
  /** `aguardando_primeiro_contato` | `vinculada`. */
  readonly credencial: Campo<string>;
  readonly ultima_sessao: Campo<string>;
  readonly versao_do_app: Campo<string>;
  readonly revogado: Campo<boolean>;
  /** Do ULTIMO lote: quando aconteceu (relogio do aparelho). */
  readonly ultima_posicao_em: Campo<string>;
  /** Do ULTIMO lote: quando o servidor recebeu. */
  readonly ultima_sincronizacao: Campo<string>;
  /** Frescor da ultima posicao, com as janelas da Operacao Viva. */
  readonly gps: Campo<Frescor>;
  readonly modo_dos_fatos: Campo<SourceMode>;
  readonly fatos: Campo<number>;
  /** Total pending_points + pending_events, medido no telefone. */
  readonly fila_offline: Campo<number>;
  readonly fila_offline_pontos: Campo<number>;
  readonly fila_offline_eventos: Campo<number>;
  readonly fila_offline_frescor: Campo<Frescor>;
  readonly fila_offline_reportada_em: Campo<string>;
  readonly selos: readonly Selo[];
}

export interface ViagemRealVM {
  readonly viagem_id: string;
  readonly rotulo_identidade: "Viagem";
  readonly unidade: string;
  readonly estado: string;
  readonly frescor: Frescor;
  readonly device_id: Campo<string>;
  readonly ultima_posicao_em: Campo<string>;
  readonly fatos: number;
  readonly procedencia: Procedencia;
  readonly selos: readonly Selo[];
}

export interface RealidadeVM {
  /** `real`/`simulado`/... por bloco nao existe: cada item carrega o seu. */
  readonly fonte: Campo<string>;
  readonly lida_em: Campo<string>;
  readonly aparelhos: readonly AparelhoRealVM[];
  readonly viagens: readonly ViagemRealVM[];
  readonly historico_sem_modo: Campo<number>;
  readonly limitacoes: readonly Limitacao[];
}

export interface EntregasVM {
  readonly modulo: "entregas";
  readonly procedencia: Procedencia;
  readonly selos_de_cabecalho: readonly Selo[];
  readonly conexao: Selo;
  /**
   * Fila desta SESSAO de interface — medida, e diferente da fila do APARELHO em
   * campo, que nao tem rota de leitura. Fundir as duas faria a tela afirmar
   * sobre o aparelho uma coisa que ela sabe apenas sobre o navegador.
   */
  readonly fila_da_sessao: Campo<number>;
  readonly viagens: readonly ViagemVM[];
  readonly ocorrencias: readonly OcorrenciaVM[];
  readonly dispositivo: DispositivoVM;
  readonly ultimo_erro: Campo<string>;
  readonly limitacoes: readonly Limitacao[];
  /**
   * O bloco REAL, separado do demo por construcao: outra lista, outra
   * procedencia por item. Quando nao ha leitura, e ausencia declarada.
   */
  readonly realidade: RealidadeVM;
  /**
   * A LEITURA DA RUA: o mesmo bloco real, organizado pela pergunta de quem
   * responde pela expedicao — o que pede conferencia, quem esta na rua, com
   * que idade cada fato chegou. Funcao pura de `realidade`: nenhuma fonte
   * nova, nenhum estado inventado. Sem leitura, e o estado tecnico.
   */
  readonly leitura: LeituraDaRuaVM;
}

/* ------------------------------------------------------------------ *
 * Leitura da rua — tipos
 * ------------------------------------------------------------------ */

/**
 * Confianca e SOLIDEZ (Contrato Visual de Estados Tecnicos, Nivel 1): o que
 * chegou dentro da janela aparece cheio; o que envelheceu, tracejado; o que
 * passou da janela, pontilhado; sem base nenhuma, interrompido. `neutra` e
 * onde nao se espera sinal (viagem encerrada, aguardando saida).
 */
export type Solidez = "cheia" | "tracejada" | "pontilhada" | "interrompida" | "neutra";

export type GrupoDaViagem = "na_rua" | "aguardando_saida" | "ciclo_desconhecido" | "encerrada";

/** Um instante com a idade que ele tinha NO MOMENTO DA LEITURA. Ausente nunca ganha idade. */
export type InstanteVM =
  | {
      readonly observado: true;
      /** O instante exato, como evidencia. */
      readonly em: string;
      /** Hora local no fuso de exibicao ("09h34", ou "08/10 08h43" se nao for o dia da leitura). */
      readonly hora: string;
      /** "ha 9 min" — contra o instante da leitura, nao contra o relogio de quem olha. */
      readonly idade: string;
      readonly segundos: number;
    }
  | { readonly observado: false; readonly motivo: MotivoAusencia; readonly explicacao: string };

export interface ViagemLidaVM {
  readonly viagem_id: string;
  readonly rotulo_identidade: "Viagem";
  readonly unidade: string;
  readonly estado: EstadoViagem;
  readonly estado_legivel: string;
  readonly grupo: GrupoDaViagem;
  readonly frescor: Frescor;
  /** Ultima posicao com horario CONFIAVEL (a mesma base do frescor). */
  readonly posicao: InstanteVM;
  readonly device_id: string | null;
  /** Rotulo do cadastro do aparelho, quando o aparelho esta no cadastro lido. */
  readonly aparelho: string | null;
  readonly procedencia: Procedencia;
  readonly solidez: Solidez;
  /**
   * `occurrence_created` desta viagem, contados pela projecao. O catalogo nao
   * tem fato de RESOLUCAO: o numero diz quantas foram registradas, nunca
   * quantas continuam abertas.
   */
  readonly ocorrencias: number;
  readonly selos: readonly Selo[];
}

export type TipoConferir =
  | "ocorrencia_registrada"
  | "viagem_sem_posicao_recente"
  | "fila_sem_relato_recente"
  | "cadastro_incompleto";

/**
 * Algo que uma PESSOA pode conferir. Nao e alerta, nao e Foco (a Operacao Viva
 * e a unica dona do Foco) e nao executa nada: diz o que foi visto, desde
 * quando, a evidencia, e o que a leitura NAO permite concluir. Fala do sinal
 * e do cadastro — nunca de quem esta na moto (Lei 4).
 */
export interface ConferirVM {
  readonly chave: string;
  readonly tipo: TipoConferir;
  readonly unidade: string;
  readonly titulo: string;
  readonly detalhe: string;
  readonly restricao: string;
  readonly desde: InstanteVM;
  readonly evidencia: string;
  /** `null` = o fato nao declara modo (o relato de fila do aparelho nao carrega `source_mode`). */
  readonly procedencia: Procedencia | null;
  readonly selo: Selo;
}

export interface AparelhoLidoVM {
  readonly device_id: string;
  readonly situacao: "com_lote" | "sem_lote" | "revogado";
  /** Ultima posicao com horario confiavel — a do frescor, nao a que o aparelho declarou. */
  readonly ultima_posicao: InstanteVM;
  readonly ultima_sessao: InstanteVM;
  /** Quando o servidor recebeu o ultimo relato de fila. */
  readonly fila_relato: InstanteVM;
  readonly solidez: Solidez;
}

export interface UnidadeLidaVM {
  readonly unit_id: string;
  readonly aparelhos: number;
  readonly viagens_na_rua: number;
  readonly selecionada: boolean;
}

export type LeituraDaRuaVM =
  | {
      readonly disponivel: false;
      readonly motivo: "integracao_pendente" | "indisponivel";
      readonly eyebrow: string;
      readonly titulo: string;
      readonly explicacao: string;
      readonly restricao: string;
      readonly solidez: "interrompida";
    }
  | {
      readonly disponivel: true;
      readonly lida_em: string;
      readonly lida_as: string;
      readonly fuso: string;
      /** As janelas que a superficie usa para envelhecer a propria leitura na tela. */
      readonly janelas: { readonly fresca_ate_s: number; readonly envelhecendo_ate_s: number };
      readonly unidades: readonly UnidadeLidaVM[];
      readonly unidade_selecionada: string | null;
      readonly unidade_encontrada: boolean;
      readonly titulo: string;
      readonly explicacao: string;
      readonly restricao: string | null;
      readonly solidez: Solidez;
      readonly selos: readonly Selo[];
      readonly contagens: {
        readonly na_rua: number;
        readonly na_rua_sem_posicao_recente: number;
        readonly ciclo_desconhecido_com_posicao: number;
        readonly aguardando_saida: number;
        readonly encerradas: number;
        readonly aparelhos: number;
        readonly conferir: number;
      };
      readonly conferir: readonly ConferirVM[];
      readonly viagens: {
        readonly na_rua: readonly ViagemLidaVM[];
        readonly aguardando_saida: readonly ViagemLidaVM[];
        readonly ciclo_desconhecido_com_posicao: readonly ViagemLidaVM[];
        readonly ciclo_desconhecido_sem_posicao: readonly ViagemLidaVM[];
        readonly encerradas: readonly ViagemLidaVM[];
      };
      readonly aparelhos: readonly AparelhoLidoVM[];
      /** Ressalvas sobre a QUALIDADE da informacao: nao entram na conferencia, nao somem. */
      readonly qualidade: readonly string[];
    };

export interface OpcoesEntregasVM {
  /** Unidade do filtro. `null`/vazio = todas as unidades da leitura. */
  readonly unidade?: string | null;
}

/* ------------------------------------------------------------------ *
 * Realidade → VM
 * ------------------------------------------------------------------ */

export type LeituraDeRealidade =
  | { disponivel: true; realidade: RealidadeDeEntregas }
  | { disponivel: false; motivo: "integracao_pendente" | "indisponivel"; explicacao: string };

const PROCEDENCIA_DO_MODO: Record<SourceMode, Procedencia> = {
  real: "real",
  simulated: "simulado",
  control: "controle",
};

function realidadeAusente(motivo: "integracao_pendente" | "indisponivel", explicacao: string): RealidadeVM {
  const aus = <T,>() => ausente<T>(motivo, explicacao);
  return {
    fonte: aus<string>(),
    lida_em: aus<string>(),
    aparelhos: [],
    viagens: [],
    historico_sem_modo: aus<number>(),
    limitacoes: [
      {
        titulo: "Nenhuma realidade foi lida",
        texto: explicacao,
      },
    ],
  };
}

/**
 * O modo que sustenta os campos de um aparelho: o do ULTIMO lote. Sem lote
 * nao ha modo — e os campos que dependem de lote ficam ausentes.
 */
function modoDoAparelho(a: AparelhoReal): SourceMode | null {
  return a.ultimo_lote?.source_mode ?? null;
}

/**
 * GPS RECEBIDO != HORARIO DO APARELHO CONFIAVEL. Quando o relogio do lote nao
 * tem autoridade, a hora que o aparelho mandou continua na tela como
 * evidencia, e o selo diz por que ela nao decide o frescor.
 */
function seloDoRelogio(lote: NonNullable<AparelhoReal["ultimo_lote"]>): Selo | null {
  if (lote.relogio === "trusted") return null;
  const adiantado = Math.round((Date.parse(lote.occurred_at) - Date.parse(lote.recorded_at)) / 1000);
  return selo(
    "evidencia_insuficiente",
    lote.relogio === "suspect"
      ? `Relogio do aparelho ${adiantado}s a frente do servidor: a hora enviada fica como evidencia, sem autoridade. O frescor usa a hora em que o servidor recebeu.`
      : "Relogio do aparelho nao avaliado: o frescor usa a hora em que o servidor recebeu.",
  );
}

// O sync Android e periodico a cada 15 min, sujeito ao scheduler.
// Janelas de APRESENTACAO: nao provam conectividade atual do telefone.
const JANELAS_FILA_OFFLINE = { fresh_ate_s: 1800, aging_ate_s: 2700 } as const;

function aparelhoVM(a: AparelhoReal, agora: Date): AparelhoRealVM {
  const lidaEm = agora.toISOString();
  // O cadastro e administrativo: a procedencia declarada e a do ultimo lote
  // quando ha lote; sem lote, o cadastro existe (o humano autorizou) mas nada
  // aqui veio da rua — e por isso a nota abaixo.
  const modo = modoDoAparelho(a);
  const cadastro: Procedencia = modo ? PROCEDENCIA_DO_MODO[modo] : "real";
  const semLote = ausente<never>(
    "nao_observado",
    "Nenhum lote chegou deste aparelho. Isto nao diz que o GPS esta parado — diz que nada foi observado.",
  );
  const selos: Selo[] = [];
  if (a.revogado_em) selos.push(selo("retirado", "Revogado pelo responsavel. Um token vigente e recusado."));
  else if (!a.credencial_vinculada_em) selos.push(selo("acao_humana_necessaria", "Cadastro incompleto: falta pre-vincular o codigo do aparelho."));
  else if (modo) selos.push(selo(PROCEDENCIA_DO_MODO[modo]));
  else selos.push(selo("evidencia_insuficiente", "Credencial vinculada e nenhum lote recebido."));
  const relogio = a.ultimo_lote ? seloDoRelogio(a.ultimo_lote) : null;
  if (relogio) selos.push(relogio);
  // O frescor so nasce de tempo com autoridade: o `occurred_at` quando o
  // relogio e confiavel; senao, a hora em que o servidor recebeu.
  const instanteDoGps = a.ultimo_lote
    ? instanteConfiavel({ occurred_at: a.ultimo_lote.occurred_at, received_at: a.ultimo_lote.recorded_at, clock_trust: a.ultimo_lote.relogio })
    : undefined;

  return {
    device_id: a.device_id,
    rotulo: a.label,
    unidade: a.unit_id,
    entregador: a.actor_id === null
      ? ausente<string>("nao_observado", "O cadastro nao associa este aparelho a um entregador.")
      : observado(a.actor_id, cadastro, lidaEm),
    credencial: observado(a.credencial_vinculada_em ? "vinculada" : "aguardando_primeiro_contato", cadastro, lidaEm),
    ultima_sessao: a.ultima_sessao_em === null
      ? ausente<string>("nao_observado", "Este aparelho nunca obteve credencial.")
      : observado(a.ultima_sessao_em, cadastro, lidaEm),
    versao_do_app: a.app_version === null
      ? ausente<string>("nao_observado", "O aparelho ainda nao declarou versao.")
      : observado(a.app_version, cadastro, lidaEm),
    revogado: observado(a.revogado_em !== null, cadastro, lidaEm),
    ultima_posicao_em: a.ultimo_lote && modo ? observado(a.ultimo_lote.occurred_at, PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<string>),
    ultima_sincronizacao: a.ultimo_lote && modo ? observado(a.ultimo_lote.recorded_at, PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<string>),
    gps: a.ultimo_lote && modo
      ? observado(classificarFrescor(instanteDoGps, agora), PROCEDENCIA_DO_MODO[modo], lidaEm)
      : (semLote as Campo<Frescor>),
    modo_dos_fatos: modo ? observado(modo, PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<SourceMode>),
    fatos: modo ? observado(a.fatos_por_modo[modo], PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<number>),
    fila_offline: a.fila_offline
      ? observado(
          a.fila_offline.pending_points + a.fila_offline.pending_events,
          "real",
          a.fila_offline.reportada_em,
        )
      : ausente<number>("nao_observado", "O telefone ainda nao reportou a profundidade da fila offline."),
    fila_offline_pontos: a.fila_offline
      ? observado(a.fila_offline.pending_points, "real", a.fila_offline.reportada_em)
      : ausente<number>("nao_observado", "O telefone ainda nao reportou pending_points."),
    fila_offline_eventos: a.fila_offline
      ? observado(a.fila_offline.pending_events, "real", a.fila_offline.reportada_em)
      : ausente<number>("nao_observado", "O telefone ainda nao reportou pending_events."),
    fila_offline_frescor: a.fila_offline
      ? observado(classificarFrescor(a.fila_offline.reportada_em, agora, JANELAS_FILA_OFFLINE), "real", lidaEm)
      : ausente<Frescor>("nao_observado", "Ainda nao existe relato de fila do aparelho."),
    fila_offline_reportada_em: a.fila_offline
      ? observado(a.fila_offline.reportada_em, "real", a.fila_offline.reportada_em)
      : ausente<string>("nao_observado", "O telefone ainda nao reportou a profundidade da fila offline."),
    selos,
  };
}

function realidadeVM(r: RealidadeDeEntregas, agora: Date): RealidadeVM {
  const lidaEm = agora.toISOString();
  const viagens: ViagemRealVM[] = r.projecoes.flatMap((p) =>
    p.viagens.map((v) => {
      const proc = PROCEDENCIA_DO_MODO[p.source_mode];
      return {
        viagem_id: v.trip_id,
        rotulo_identidade: "Viagem" as const,
        unidade: p.unit_id,
        estado: v.estado,
        frescor: v.frescor,
        device_id: v.device_id ? observado(v.device_id, proc, lidaEm) : ausente<string>("nao_observado", "Nenhum fato desta viagem nomeia o aparelho."),
        ultima_posicao_em: v.ultima_posicao_em
          ? observado(v.ultima_posicao_em, proc, lidaEm)
          : ausente<string>("nao_observado", "Nenhum lote de GPS desta viagem."),
        fatos: v.eventos.length,
        procedencia: proc,
        selos: [
          selo(proc),
          ...(v.estado === "desconhecido"
            ? [selo("evidencia_insuficiente", "A viagem existe pelo GPS; o ciclo de vida dela ainda nao entra pela cadeia canonica.")]
            : []),
        ],
      };
    }),
  );
  return {
    fonte: observado("platform.event_log + identity.device", "real", lidaEm),
    lida_em: observado(r.lida_em, "real", lidaEm),
    aparelhos: r.aparelhos.map((a) => aparelhoVM(a, agora)),
    viagens,
    historico_sem_modo: observado(r.historico_sem_modo, "real", lidaEm),
    limitacoes: [
      {
        titulo: "O cadastro do aparelho nao carrega modo",
        texto:
          "Autorizacao, vinculo e revogacao sao atos administrativos em identity.device. A procedencia mostrada em cada aparelho e a do ULTIMO lote que ele mandou; sem lote, so o cadastro existe.",
      },
      {
        titulo: "Viagem sem ciclo de vida",
        texto:
          "A cadeia canonica traz o GPS. Criar, iniciar e encerrar viagem ainda passam pelo servidor do piloto, entao toda viagem daqui aparece com estado desconhecido ate esse caminho migrar.",
      },
      {
        titulo: "Telemetria do telefone e deliberadamente minima",
        texto:
          "A fila offline chega apenas como pending_points e pending_events agregados. Permissao de localizacao e estado do servico de captura continuam sem rota e nao sao inferidos.",
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Leitura da rua — a mesma realidade, na ordem da pergunta de quem opera
 * ------------------------------------------------------------------ */

/**
 * Fuso de EXIBICAO. `identity.unit.timezone` existe, mas a porta de realidade
 * nao o devolve; toda unidade cadastrada hoje usa o padrao da coluna
 * (0001: 'America/Sao_Paulo'). A tela declara o fuso — nao o esconde.
 */
const FUSO_DE_EXIBICAO = "America/Sao_Paulo";
const FORMATO_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DE_EXIBICAO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const FORMATO_DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_DE_EXIBICAO, day: "2-digit", month: "2-digit" });

function horaLocal(instante: number, referencia: number): string {
  const partes = FORMATO_HORA.formatToParts(new Date(instante));
  const parte = (t: string) => partes.find((p) => p.type === t)?.value ?? "??";
  const hora = `${parte("hour")}h${parte("minute")}`;
  const dia = FORMATO_DIA.format(new Date(instante));
  return dia === FORMATO_DIA.format(new Date(referencia)) ? hora : `${dia} ${hora}`;
}

/** Idade em portugues de balcao. Negativa pequena e desencontro de relogio entre servidores. */
export function idadeLegivel(segundos: number): string {
  if (segundos < -60) return "a frente desta leitura";
  if (segundos < 10) return "agora";
  if (segundos < 60) return `ha ${Math.floor(segundos)} s`;
  if (segundos < 3600) return `ha ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    return m === 0 ? `ha ${h} h` : `ha ${h} h ${String(m).padStart(2, "0")} min`;
  }
  const d = Math.floor(segundos / 86400);
  return `ha ${d} ${d === 1 ? "dia" : "dias"}`;
}

function instanteVM(
  iso: string | null | undefined,
  agora: Date,
  ausencia: { motivo: MotivoAusencia; explicacao: string },
): InstanteVM {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (!iso || !Number.isFinite(t)) return { observado: false, ...ausencia };
  const segundos = Math.round((agora.getTime() - t) / 1000);
  return {
    observado: true,
    em: new Date(t).toISOString(),
    hora: horaLocal(t, agora.getTime()),
    idade: idadeLegivel(segundos),
    segundos,
  };
}

const ESTADO_LEGIVEL: Record<EstadoViagem, string> = {
  criada: "criada, aguardando saida",
  em_rota: "em rota",
  chegou: "chegou ao cliente",
  entregue: "entrega confirmada",
  retornando: "retornando",
  retornou: "retornou",
  encerrada: "encerrada",
  desconhecido: "ciclo de vida desconhecido",
};

/**
 * Onde se ESPERA posicao. A captura liga com a viagem em `em_rota` ou
 * `retornando` (`src/entregas/ui/rider-mobile/capture-rule.js`); `chegou` e
 * `entregue` sao marcos de parada DENTRO da rota. Antes da saida e depois do
 * retorno, silencio de GPS e o esperado — e nao vira conferencia.
 */
function grupoDe(estado: string): GrupoDaViagem {
  switch (estado) {
    case "em_rota":
    case "chegou":
    case "entregue":
    case "retornando":
      return "na_rua";
    case "criada":
      return "aguardando_saida";
    case "retornou":
    case "encerrada":
      return "encerrada";
    default:
      return "ciclo_desconhecido";
  }
}

const SOLIDEZ_DO_FRESCOR: Record<Frescor, Solidez> = {
  fresh: "cheia",
  aging: "tracejada",
  stale: "pontilhada",
  unknown: "interrompida",
};
const ORDEM_DA_SOLIDEZ: Record<Solidez, number> = { interrompida: 0, pontilhada: 1, tracejada: 2, cheia: 3, neutra: 4 };

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function viagemLida(
  v: ViagemProjetada,
  procedencia: Procedencia,
  rotuloPor: ReadonlyMap<string, string>,
  agora: Date,
): ViagemLidaVM {
  const grupo = grupoDe(v.estado);
  const esperaPosicao = grupo === "na_rua" || grupo === "ciclo_desconhecido";
  const selos: Selo[] = [selo(procedencia)];
  if (grupo === "na_rua" && v.frescor === "stale") {
    selos.push(selo("stale", `Ultimo lote de GPS mais velho que ${JANELAS.aging_ate_s / 60} min.`));
  }
  if (grupo === "na_rua" && v.frescor === "unknown") {
    selos.push(selo("evidencia_insuficiente", "Nenhuma posicao com horario confiavel nesta viagem."));
  }
  if (grupo === "ciclo_desconhecido") {
    selos.push(selo("evidencia_insuficiente", "A viagem existe pelo GPS; saida e fim ainda nao entram pela cadeia canonica."));
  }
  return {
    viagem_id: v.trip_id,
    rotulo_identidade: "Viagem",
    unidade: v.unit_id,
    estado: v.estado,
    estado_legivel: ESTADO_LEGIVEL[v.estado] ?? v.estado,
    grupo,
    frescor: v.frescor,
    posicao: instanteVM(v.ultima_posicao_em, agora, {
      motivo: "nao_observado",
      explicacao: "Nenhum lote de GPS com horario confiavel nesta viagem.",
    }),
    device_id: v.device_id ?? null,
    aparelho: v.device_id ? rotuloPor.get(v.device_id) ?? null : null,
    procedencia,
    solidez: esperaPosicao ? SOLIDEZ_DO_FRESCOR[v.frescor] : "neutra",
    ocorrencias: v.ocorrencias_abertas,
    selos,
  };
}

/** Menos solidez primeiro; empate, a posicao mais velha primeiro. A pressao tem lugar no espaco. */
function porAtencao(a: ViagemLidaVM, b: ViagemLidaVM): number {
  const s = ORDEM_DA_SOLIDEZ[a.solidez] - ORDEM_DA_SOLIDEZ[b.solidez];
  if (s !== 0) return s;
  const ia = a.posicao.observado ? a.posicao.segundos : Number.POSITIVE_INFINITY;
  const ib = b.posicao.observado ? b.posicao.segundos : Number.POSITIVE_INFINITY;
  if (ia !== ib) return ib - ia;
  return a.viagem_id.localeCompare(b.viagem_id);
}

function filtrarPorUnidade(r: RealidadeDeEntregas, unidade: string | null): RealidadeDeEntregas {
  if (!unidade) return r;
  return {
    ...r,
    aparelhos: r.aparelhos.filter((a) => a.unit_id === unidade),
    projecoes: r.projecoes.filter((p) => p.unit_id === unidade),
  };
}

/** A pessoa na rua levantou a mao (ocorrencia) vem antes do sinal que sumiu. */
const ORDEM_DO_TIPO: Record<TipoConferir, number> = {
  ocorrencia_registrada: 0,
  viagem_sem_posicao_recente: 1,
  fila_sem_relato_recente: 2,
  cadastro_incompleto: 3,
};

function conferencias(r: RealidadeDeEntregas, naRua: readonly ViagemLidaVM[], agora: Date): ConferirVM[] {
  const itens: ConferirVM[] = [];
  for (const v of naRua) {
    if (v.ocorrencias <= 0) continue;
    itens.push({
      chave: `ocorrencia:${v.viagem_id}`,
      tipo: "ocorrencia_registrada",
      unidade: v.unidade,
      titulo: `Viagem ${v.viagem_id}: ${plural(v.ocorrencias, "ocorrencia registrada", "ocorrencias registradas")}`,
      detalhe: `${v.estado_legivel} pelo ultimo fato · ${v.aparelho ?? v.device_id ?? "nenhum aparelho nomeado"}`,
      restricao:
        "Esta leitura nao sabe o tipo, o horario nem se ela ja foi resolvida: o catalogo de eventos nao tem fato de resolucao.",
      desde: {
        observado: false,
        motivo: "nao_observado",
        explicacao: "A projecao conta a ocorrencia; o horario dela nao chega a esta leitura.",
      },
      evidencia: `registrada, sem horario nesta leitura · ${v.device_id ?? "sem aparelho"} · ${v.unidade}`,
      procedencia: v.procedencia,
      selo: selo("acao_humana_necessaria", "Ocorrencia registrada na rua: so uma pessoa sabe o que aconteceu."),
    });
  }
  for (const v of naRua) {
    if (v.frescor !== "stale" && v.frescor !== "unknown") continue;
    itens.push({
      chave: `viagem:${v.viagem_id}`,
      tipo: "viagem_sem_posicao_recente",
      unidade: v.unidade,
      titulo: v.posicao.observado
        ? `Viagem ${v.viagem_id} sem posicao recebida ${v.posicao.idade}`
        : `Viagem ${v.viagem_id} sem nenhuma posicao recebida`,
      detalhe: `${v.estado_legivel} pelo ultimo fato · ${v.aparelho ?? v.device_id ?? "nenhum aparelho nomeado"}`,
      restricao: "Sem lote recente nao da para saber onde a moto esta. Isto nao diz que ela parou.",
      desde: v.posicao,
      evidencia: `ultimo lote ${v.posicao.observado ? v.posicao.hora : "nenhum"} · ${v.device_id ?? "sem aparelho"} · ${v.unidade}`,
      procedencia: v.procedencia,
      selo:
        v.frescor === "stale"
          ? selo("stale", `Ultimo lote de GPS mais velho que ${JANELAS.aging_ate_s / 60} min.`)
          : selo("evidencia_insuficiente", "Nenhuma posicao com horario confiavel nesta viagem."),
    });
  }
  for (const a of r.aparelhos) {
    if (a.revogado_em || !a.fila_offline) continue;
    const total = a.fila_offline.pending_points + a.fila_offline.pending_events;
    if (total <= 0) continue;
    if (classificarFrescor(a.fila_offline.reportada_em, agora, JANELAS_FILA_OFFLINE) !== "stale") continue;
    const relato = instanteVM(a.fila_offline.reportada_em, agora, {
      motivo: "evidencia_insuficiente",
      explicacao: "Instante do relato ilegivel.",
    });
    itens.push({
      chave: `fila:${a.device_id}`,
      tipo: "fila_sem_relato_recente",
      unidade: a.unit_id,
      titulo: `${a.label}: ${total} ${total === 1 ? "item esperando" : "itens esperando"} envio no ultimo relato, ${relato.observado ? relato.idade : "em instante ilegivel"}`,
      detalhe: `${a.fila_offline.pending_points} pontos · ${a.fila_offline.pending_events} eventos. Nenhum relato mais novo chegou.`,
      restricao: "O relato antigo nao diz se esses itens ja foram enviados, nem se o telefone esta sem rede agora.",
      desde: relato,
      evidencia: `relato recebido ${relato.observado ? relato.hora : "?"} · ${a.device_id} · ${a.unit_id}`,
      procedencia: null,
      selo: selo("stale", `Relato com mais de ${JANELAS_FILA_OFFLINE.aging_ate_s / 60} minutos. A fila pode ter mudado.`),
    });
  }
  for (const a of r.aparelhos) {
    if (a.revogado_em || a.credencial_vinculada_em) continue;
    const autorizado = instanteVM(a.autorizado_em, agora, { motivo: "nao_observado", explicacao: "Sem data de autorizacao." });
    itens.push({
      chave: `cadastro:${a.device_id}`,
      tipo: "cadastro_incompleto",
      unidade: a.unit_id,
      titulo: `${a.label}: cadastro incompleto`,
      detalhe: "Falta pre-vincular o codigo do aparelho. Sem isso ele nao consegue falar com a plataforma.",
      restricao: "Esta tela nao altera cadastro: autorizar aparelho e ato do responsavel, fora daqui.",
      desde: autorizado,
      evidencia: `autorizado ${autorizado.observado ? autorizado.hora : "?"} · ${a.device_id} · ${a.unit_id}`,
      procedencia: "real",
      selo: selo("acao_humana_necessaria", "Cadastro incompleto: falta pre-vincular o codigo do aparelho."),
    });
  }
  const idade = (c: ConferirVM) => (c.desde.observado ? c.desde.segundos : Number.POSITIVE_INFINITY);
  return itens.sort(
    (x, y) => ORDEM_DO_TIPO[x.tipo] - ORDEM_DO_TIPO[y.tipo] || idade(y) - idade(x) || x.chave.localeCompare(y.chave),
  );
}

function aparelhoLido(a: AparelhoReal, agora: Date): AparelhoLidoVM {
  const confiavel = a.ultimo_lote
    ? instanteConfiavel({ occurred_at: a.ultimo_lote.occurred_at, received_at: a.ultimo_lote.recorded_at, clock_trust: a.ultimo_lote.relogio })
    : undefined;
  const ultima_posicao = instanteVM(confiavel, agora, {
    motivo: "nao_observado",
    explicacao: "Nenhum lote chegou deste aparelho. Isto nao diz que o GPS esta parado — diz que nada foi observado.",
  });
  return {
    device_id: a.device_id,
    situacao: a.revogado_em ? "revogado" : a.ultimo_lote ? "com_lote" : "sem_lote",
    ultima_posicao,
    ultima_sessao: instanteVM(a.ultima_sessao_em, agora, {
      motivo: "nao_observado",
      explicacao: "Este aparelho nunca obteve credencial.",
    }),
    fila_relato: instanteVM(a.fila_offline?.reportada_em, agora, {
      motivo: "nao_observado",
      explicacao: "O telefone ainda nao reportou a profundidade da fila offline.",
    }),
    solidez: a.revogado_em
      ? "neutra"
      : ultima_posicao.observado
        ? SOLIDEZ_DO_FRESCOR[classificarFrescor(ultima_posicao.em, agora)]
        : "interrompida",
  };
}

function leituraAusente(motivo: "integracao_pendente" | "indisponivel", explicacao: string): LeituraDaRuaVM {
  return {
    disponivel: false,
    motivo,
    eyebrow: motivo === "integracao_pendente" ? "Sem leitura do servidor" : "Leitura indisponivel",
    titulo:
      motivo === "integracao_pendente"
        ? "Esta build nao le o banco da plataforma."
        : "A plataforma nao respondeu a esta leitura.",
    explicacao,
    restricao: "Nada nesta tela representa a rua agora. O que aparece abaixo e demonstracao.",
    solidez: "interrompida",
  };
}

function leituraDaRua(
  todas: RealidadeDeEntregas,
  r: RealidadeDeEntregas,
  selecionada: string | null,
  agora: Date,
): LeituraDaRuaVM {
  const rotuloPor = new Map(todas.aparelhos.map((a) => [a.device_id, a.label] as const));
  const lidas = r.projecoes.flatMap((p) =>
    p.viagens.map((v) => viagemLida(v, PROCEDENCIA_DO_MODO[p.source_mode], rotuloPor, agora)),
  );
  const doGrupo = (g: GrupoDaViagem) => lidas.filter((v) => v.grupo === g).sort(porAtencao);
  const naRua = doGrupo("na_rua");
  const desconhecidas = doGrupo("ciclo_desconhecido");
  const comPosicao = desconhecidas.filter((v) => v.frescor === "fresh" || v.frescor === "aging");
  const semPosicao = desconhecidas.filter((v) => v.frescor !== "fresh" && v.frescor !== "aging");
  const semPosicaoRecente = naRua.filter((v) => v.frescor === "stale" || v.frescor === "unknown").length;
  const conferir = conferencias(r, naRua, agora);

  const unidadesIds = [...new Set([...todas.aparelhos.map((a) => a.unit_id), ...todas.projecoes.map((p) => p.unit_id)])].sort();
  const unidades: UnidadeLidaVM[] = unidadesIds.map((u) => ({
    unit_id: u,
    aparelhos: todas.aparelhos.filter((a) => a.unit_id === u).length,
    viagens_na_rua: todas.projecoes
      .filter((p) => p.unit_id === u)
      .flatMap((p) => p.viagens)
      .filter((v) => grupoDe(v.estado) === "na_rua").length,
    selecionada: u === selecionada,
  }));
  const encontrada = selecionada === null || unidadesIds.includes(selecionada);
  const unidadesNaLeitura = [...new Set([...r.aparelhos.map((a) => a.unit_id), ...r.projecoes.map((p) => p.unit_id)])];
  const onde = selecionada
    ? ` em ${selecionada}`
    : unidadesNaLeitura.length === 1
      ? ` em ${unidadesNaLeitura[0]}`
      : unidadesNaLeitura.length > 1
        ? ` em ${unidadesNaLeitura.length} unidades`
        : "";

  const janelaRecente = `${JANELAS.fresh_ate_s / 60} min`;
  let titulo: string;
  let explicacao = `Posicao recente e lote recebido ha ate ${janelaRecente}. Ela diz que o sinal chegou, nao onde a moto esta agora.`;
  if (!encontrada) {
    titulo = `Nenhum aparelho de ${selecionada} nesta leitura.`;
    explicacao = "A unidade pedida nao aparece no cadastro nem nos fatos lidos. Escolha outra unidade ou veja todas.";
  } else if (naRua.length > 0) {
    titulo =
      `${plural(naRua.length, "viagem", "viagens")} na rua${onde}` +
      (semPosicaoRecente > 0
        ? `; ${semPosicaoRecente} sem posicao recente.`
        : naRua.length === 1
          ? ", com posicao recente."
          : ", todas com posicao recente.");
    if (comPosicao.length > 0) {
      explicacao += ` Mais ${plural(comPosicao.length, "viagem manda", "viagens mandam")} posicao sem ciclo de vida conhecido.`;
    }
  } else if (comPosicao.length > 0) {
    titulo = `${plural(comPosicao.length, "viagem mandando", "viagens mandando")} posicao${onde}; o ciclo de vida nao chega a esta leitura.`;
  } else if (r.aparelhos.length === 0) {
    titulo = `Nenhum aparelho autorizado${onde}.`;
    explicacao = "Sem aparelho autorizado, nenhuma posicao chega a plataforma. Isto nao diz que nao ha motoboy na rua.";
  } else {
    titulo = `Nenhuma viagem na rua por esta leitura${onde}.`;
    explicacao = "Isto nao afirma que a rua esta parada: afirma que nada foi observado por este caminho.";
  }

  const restricao =
    semPosicaoRecente > 0
      ? `${plural(semPosicaoRecente, "viagem", "viagens")} sem posicao recente: esta leitura nao sabe onde ${semPosicaoRecente === 1 ? "ela esta" : "elas estao"}.`
      : comPosicao.length + semPosicao.length > 0
        ? "O ciclo de vida das viagens ainda nao chega pela cadeia canonica: saida e fim nao aparecem aqui."
        : null;

  const comSinal = [...naRua, ...comPosicao];
  const solidez: Solidez =
    comSinal.length === 0
      ? "neutra"
      : comSinal.reduce<Solidez>((pior, v) => (ORDEM_DA_SOLIDEZ[v.solidez] < ORDEM_DA_SOLIDEZ[pior] ? v.solidez : pior), "cheia");

  // Os selos descrevem os FATOS lidos (o modo de cada lote), nao o cadastro.
  const modos = new Set<SourceMode>([
    ...r.projecoes.map((p) => p.source_mode),
    ...r.aparelhos.flatMap((a) => (a.ultimo_lote?.source_mode ? [a.ultimo_lote.source_mode] : [])),
  ]);
  const selos: Selo[] = (["real", "simulated", "control"] as const)
    .filter((m) => modos.has(m))
    .map((m) => selo(PROCEDENCIA_DO_MODO[m]));
  selos.push(
    selo("parcial", "A leitura traz cadastro, GPS e fila agregada; o ciclo de vida da viagem ainda nao chega por esta cadeia."),
  );

  const qualidade: string[] = [];
  for (const a of r.aparelhos) {
    if (!a.ultimo_lote || a.ultimo_lote.relogio === "trusted") continue;
    const adiantado = Math.round((Date.parse(a.ultimo_lote.occurred_at) - Date.parse(a.ultimo_lote.recorded_at)) / 60000);
    qualidade.push(
      a.ultimo_lote.relogio === "suspect"
        ? `${a.label}: relogio do aparelho ${adiantado} min a frente do servidor. A hora enviada fica como evidencia; a idade usa a hora em que o servidor recebeu.`
        : `${a.label}: relogio do aparelho nao avaliado. A idade usa a hora em que o servidor recebeu.`,
    );
  }
  if (semPosicao.length > 0) {
    qualidade.push(
      `${plural(semPosicao.length, "viagem", "viagens")} sem posicao recente e sem ciclo de vida conhecido: ${semPosicao.length === 1 ? "pode ter terminado" : "podem ter terminado"}; esta leitura nao sabe.`,
    );
  }
  qualidade.push(
    `Fatos antigos sem modo (UNKNOWN), anteriores a migration 0003, fora desta leitura: ${todas.historico_sem_modo}.`,
  );

  return {
    disponivel: true,
    lida_em: agora.toISOString(),
    lida_as: horaLocal(agora.getTime(), agora.getTime()),
    fuso: FUSO_DE_EXIBICAO,
    janelas: { fresca_ate_s: JANELAS.fresh_ate_s, envelhecendo_ate_s: JANELAS.aging_ate_s },
    unidades,
    unidade_selecionada: selecionada,
    unidade_encontrada: encontrada,
    titulo,
    explicacao,
    restricao,
    solidez,
    selos,
    contagens: {
      na_rua: naRua.length,
      na_rua_sem_posicao_recente: semPosicaoRecente,
      ciclo_desconhecido_com_posicao: comPosicao.length,
      aguardando_saida: doGrupo("aguardando_saida").length,
      encerradas: doGrupo("encerrada").length,
      aparelhos: r.aparelhos.length,
      conferir: conferir.length,
    },
    conferir,
    viagens: {
      na_rua: naRua,
      aguardando_saida: doGrupo("aguardando_saida"),
      ciclo_desconhecido_com_posicao: comPosicao,
      ciclo_desconhecido_sem_posicao: semPosicao,
      encerradas: doGrupo("encerrada"),
    },
    aparelhos: r.aparelhos.map((a) => aparelhoLido(a, agora)),
    qualidade,
  };
}

/**
 * O aparelho da DEMONSTRACAO. O facade em memoria nao tem aparelho; o aparelho
 * real — credencial, GPS, fila — e lido do banco da plataforma pela porta de
 * realidade, quando a build tem banco. Cada campo declara por que esta vazio,
 * em vez de desenhar uma caixa vazia que parece saudavel.
 */
function dispositivoSemIntegracaoDeLeitura(): DispositivoVM {
  const pendente = (o: string) =>
    ausente<never>(
      "integracao_pendente",
      `${o}: esta demonstracao nao tem aparelho. O aparelho real aparece na leitura do servidor, quando a build le o banco da plataforma.`,
    );
  return {
    credencial: pendente("A integridade da credencial") as Campo<string>,
    gps: pendente("O estado do GPS") as Campo<string>,
    ultima_sincronizacao: pendente("A ultima sincronizacao") as Campo<string>,
    fila_offline: pendente("A fila offline do aparelho") as Campo<number>,
    revogado: pendente("A revogacao do dispositivo") as Campo<boolean>,
  };
}

function conexaoParaSelo(
  conexao: UiSnapshot["connection"],
  pendentes: number,
): Selo {
  if (conexao === "offline") {
    return selo("offline", "Sem rede. O trabalho local continua e sera enviado depois.");
  }
  if (conexao === "syncing" || pendentes > 0) {
    const fila =
      pendentes > 0
        ? `ha ${pendentes} item(ns) na fila desta sessao`
        : "a fila desta sessao ja esvaziou";
    return selo(
      "sincronizando",
      `Ha rede e ${fila}. Isto nao e o mesmo que estar offline.`,
    );
  }
  return selo("saudavel", "Ha rede e nao ha fila pendente.");
}

export function entregasVM(
  snap: UiSnapshot,
  agora: string,
  limiteParadas: number | null,
  leitura: LeituraDeRealidade = {
    disponivel: false,
    motivo: "integracao_pendente",
    explicacao: "Esta leitura nao recebeu a porta de realidade: nenhum banco foi consultado.",
  },
  opcoes: OpcoesEntregasVM = {},
): EntregasVM {
  const procedencia: Procedencia = "simulado";
  // O filtro de unidade vale para a REALIDADE inteira; a lista de unidades
  // continua vindo da leitura sem filtro — filtrar nao apaga a outra unidade.
  const unidade = (opcoes.unidade ?? "").trim() || null;
  let realidade: RealidadeVM;
  let daRua: LeituraDaRuaVM;
  if (leitura.disponivel) {
    const lida = filtrarPorUnidade(leitura.realidade, unidade);
    realidade = realidadeVM(lida, new Date(agora));
    daRua = leituraDaRua(leitura.realidade, lida, unidade, new Date(agora));
  } else {
    realidade = realidadeAusente(leitura.motivo, leitura.explicacao);
    daRua = leituraAusente(leitura.motivo, leitura.explicacao);
  }

  const viagens: ViagemVM[] = snap.trips.map((t) => ({
    viagem_id: t.trip_id,
    rotulo_identidade: "Viagem" as const,
    estado: t.state,
    entregador: t.courier_actor_id,
    paradas: t.deliveries.map((d) => ({
      delivery_id: d.delivery_id,
      pedido_ref: d.order_ref,
      estado: d.state,
      ativa: d.active,
      ordem: d.planned_stop_order,
    })),
    paradas_ativas: t.deliveries.filter((d) => d.active).length,
    limite_paradas:
      typeof limiteParadas === "number"
        ? observado(limiteParadas, procedencia, agora)
        : ausente<number>(
            "nao_observado",
            "A politica em vigor nao foi lida nesta leitura.",
          ),
  }));

  const ocorrencias: OcorrenciaVM[] = snap.occurrences.map((o) => ({
    ocorrencia_id: o.occurrence_id,
    estado: o.state,
    relato: o.report,
    bloqueia_disponibilidade: o.blocks_availability,
    selo: o.blocks_availability
      ? selo("acao_humana_necessaria", "Bloqueia a disponibilidade do entregador.")
      : selo("erro_recuperavel", "Registrada, sem bloquear disponibilidade."),
  }));

  return {
    modulo: "entregas",
    procedencia,
    selos_de_cabecalho: [
      selo(
        "somente_demonstracao",
        "As viagens e ocorrencias abaixo vem do facade de demonstracao em memoria. Nenhuma delas aconteceu.",
      ),
      selo("simulado"),
      ...(leitura.disponivel
        ? [selo("parcial", "Ha um bloco de REALIDADE lido do banco, separado da demonstracao e marcado item a item.")]
        : []),
    ],
    conexao: conexaoParaSelo(snap.connection, snap.pending_sync),
    fila_da_sessao: observado(snap.pending_sync, procedencia, agora),
    viagens,
    ocorrencias,
    dispositivo: dispositivoSemIntegracaoDeLeitura(),
    realidade,
    leitura: daRua,
    ultimo_erro:
      snap.last_error === null
        ? ausente<string>(
            "nao_observado",
            "Nenhuma recusa foi registrada nesta sessao.",
          )
        : observado(snap.last_error, procedencia, agora),
    limitacoes: [
      {
        titulo: "Nenhuma viagem da demonstracao e real",
        texto:
          "O facade roda em memoria e comeca com pedidos semeados. Fechar a aba apaga tudo. Nada na faixa de demonstracao foi observado na rua.",
      },
      {
        titulo: "A demonstracao nao tem aparelho",
        texto: leitura.disponivel
          ? "Os cinco campos do aparelho da demonstracao ficam como integracao pendente em vez de zero. Credencial, GPS, ultima sessao e fila do aparelho REAL estao na leitura do servidor."
          : "Credencial, GPS, ultima sessao e fila do aparelho existem na plataforma, mas esta build nao le o banco dela. Os cinco campos da demonstracao ficam como integracao pendente em vez de zero.",
      },
      {
        titulo: "Esta tela nao opera",
        texto:
          "Nao ha botao que crie viagem, mova pedido, confirme entrega ou altere capacidade. Atualizar a leitura so pergunta de novo ao servidor (GET).",
      },
    ],
  };
}
