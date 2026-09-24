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
import { classificarFrescor, type Frescor } from "../../platform/projections/operacao-viva";
import {
  ausente,
  observado,
  selo,
  type Campo,
  type Limitacao,
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
  /** Sem fonte: a fila mora no telefone e nenhuma rota a devolve. */
  readonly fila_offline: Campo<number>;
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
  else if (!a.credencial_vinculada_em) selos.push(selo("acao_humana_necessaria", "Autorizado, mas o aparelho ainda nao fez o primeiro contato."));
  else if (modo) selos.push(selo(PROCEDENCIA_DO_MODO[modo]));
  else selos.push(selo("evidencia_insuficiente", "Credencial vinculada e nenhum lote recebido."));

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
      ? observado(classificarFrescor(a.ultimo_lote.occurred_at, agora), PROCEDENCIA_DO_MODO[modo], lidaEm)
      : (semLote as Campo<Frescor>),
    modo_dos_fatos: modo ? observado(modo, PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<SourceMode>),
    fatos: modo ? observado(a.fatos_por_modo[modo], PROCEDENCIA_DO_MODO[modo], lidaEm) : (semLote as Campo<number>),
    fila_offline: ausente<number>(
      "integracao_pendente",
      "A fila offline mora no telefone. Nenhuma rota a devolve; o que se sabe e o que chegou.",
    ),
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
        titulo: "O que o telefone guarda nao chega",
        texto:
          "Fila offline, permissao de localizacao e estado do servico de captura moram no aparelho e nao tem rota de leitura. Aparecem como integracao pendente, nunca como zero.",
      },
    ],
  };
}

/**
 * O aparelho em campo publica saude por `POST /api/gps/batch`; NAO existe rota
 * de LEITURA que devolva credencial, GPS ou fila do aparelho. Em vez de desenhar
 * uma caixa vazia que parece saudavel, cada campo declara por que esta vazio.
 */
function dispositivoSemIntegracaoDeLeitura(): DispositivoVM {
  const pendente = (o: string) =>
    ausente<never>(
      "integracao_pendente",
      `${o} chega do aparelho pela rota de ingestao, e nao existe rota de leitura que devolva este estado. Nada aqui representa o aparelho agora.`,
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
): EntregasVM {
  const procedencia: Procedencia = "simulado";
  const realidade = leitura.disponivel
    ? realidadeVM(leitura.realidade, new Date(agora))
    : realidadeAusente(leitura.motivo, leitura.explicacao);

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
    ultimo_erro:
      snap.last_error === null
        ? ausente<string>(
            "nao_observado",
            "Nenhuma recusa foi registrada nesta sessao.",
          )
        : observado(snap.last_error, procedencia, agora),
    limitacoes: [
      {
        titulo: "Nenhuma viagem desta tela e real",
        texto:
          "O facade roda em memoria e comeca com pedidos semeados. Fechar a aba apaga tudo. Nada aqui foi observado na rua.",
      },
      {
        titulo: "O aparelho nao tem rota de leitura",
        texto:
          "Credencial, GPS, ultima sincronizacao e fila offline chegam do Android pela ingestao. Nao existe endpoint que devolva esse estado, entao os cinco campos aparecem como integracao pendente em vez de zero.",
      },
      {
        titulo: "Esta tela nao opera",
        texto:
          "Nao ha botao que crie viagem, mova pedido, confirme entrega ou altere capacidade. A Unidade 6 e de apresentacao.",
      },
    ],
  };
}
