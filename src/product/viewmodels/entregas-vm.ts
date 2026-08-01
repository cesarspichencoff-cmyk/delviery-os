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
): EntregasVM {
  const procedencia: Procedencia = "simulado";

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
        "Esta superficie le o facade de demonstracao em memoria. Nenhuma viagem aqui aconteceu.",
      ),
      selo("simulado"),
    ],
    conexao: conexaoParaSelo(snap.connection, snap.pending_sync),
    fila_da_sessao: observado(snap.pending_sync, procedencia, agora),
    viagens,
    ocorrencias,
    dispositivo: dispositivoSemIntegracaoDeLeitura(),
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
