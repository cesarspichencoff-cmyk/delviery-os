/**
 * DEMANDA OBSERVADA NO GESTOR -> contratos existentes -> leitura da Home
 * ============================================================================
 * O elo que faltava entre o sensor e a Home. Nao e outro motor: cada pedido
 * montado na tela de expedicao vira um `pedido_ciclo_observado@1` do catalogo
 * que ja existe, validado por `validarEvento`, e a leitura sai de
 * `projetarLeitura`. A saude da fonte sai do `observarSaude` que ja existe.
 *
 * TRES NIVEIS, e este modulo entrega SO o primeiro:
 *   1. demanda observada  — o pedido estava montado na tela do Gestor;   <- aqui
 *   2. pedido conciliado  — o Reader da Teknisa confirma o mesmo pedido;
 *   3. estado fisico      — preparo, pronto, saida observados na praca.
 *
 * POR QUE `aceito`, E SO `aceito`. O painel de expedicao lista pedidos que a
 * loja ja tem em maos; `aceito` e a entrada do ciclo e a afirmacao mais fraca
 * do catalogo. A alegacao de cabecalho do provedor segue OPACA: ela nao vira
 * `em_producao`, `pronto` nem `despachado`. A unica leitura que se faz dela e
 * na direcao segura — se ela fala em cancelamento, o pedido NAO e apresentado
 * como demanda, e a contagem do que foi retido aparece.
 *
 * FONTE DE FOTOGRAFIA, MOTOR DE EVENTOS. A tela do Gestor mostra o estado
 * atual, sem historico. A regra de ponte e explicita: e ATUAL o pedido que a
 * ultima janela fresca ainda afirma. Sair da tela nao emite cancelamento nem
 * despacho — o pedido simplesmente deixa de ser afirmado. Janela velha nao
 * afirma nada: a fonte vira `stale`, e a Home diz isso em vez de dizer zero.
 *
 * PURA: sem relogio, sem I/O, sem rede. O instante entra pela chamada.
 */
import { validarEvento, type EnvelopeOperacional } from "./catalogo-operacional";
import { observarSaude } from "./observador-saude";
import { projetarLeitura } from "./projetar-leitura";
import {
  LIMITE_JANELA_MS,
  type DemandaDoGestor,
  type PedidoObservado,
} from "../../platform/leitura/demanda-do-gestor";
import type { LinhagemDeEventos } from "../atencao/linhagem-eventos";
import type { Procedencia } from "../viewmodels/estados";
import type { EstadoDeFonte, FonteLeitura, PedidoLeitura } from "../viewmodels/sinais";

export const DEMANDA_GESTOR_VERSAO = "demanda-gestor@1";
/** Mesmo id de fonte que a ponte de saude do Gestor ja usa. */
export const FONTE_GESTOR = "gestor_ifood_mounted_view";
export const ORIGEM_GESTOR = "gestor-ifood-mounted";
const UNIDADE = "ITAIM";

type Observada = Extract<DemandaDoGestor, { estado: "observada" }>;

export interface EventosDaDemanda {
  readonly eventos: readonly EnvelopeOperacional[];
  /** Refs de pedidos montados cuja alegacao do provedor fala em cancelamento. */
  readonly com_cancelamento_alegado: readonly string[];
  readonly recusados: number;
}

/** Janela observada -> fatos do catalogo. Deterministico e idempotente. */
export function eventosDaDemanda(
  d: Observada,
  ctx: { readonly tenant: string; readonly agora_iso: string },
): EventosDaDemanda {
  // L9: simulado nunca aparece como real. O prefixo e o que o projetor le.
  const prefixo = d.modo === "real" ? "" : "fixture:";
  const eventos: EnvelopeOperacional[] = [];
  const cancelados: string[] = [];
  let recusados = 0;
  for (const p of d.janela.pedidos) {
    if (p.alegacao_do_provedor !== null && /cancel/i.test(p.alegacao_do_provedor)) {
      cancelados.push(p.ref);
      continue;
    }
    const v = validarEvento({
      event_id: `gestor-demanda-${p.ref}-${p.revisao.slice(0, 16)}`,
      event_type: "pedido_ciclo_observado",
      event_version: 1,
      tenant_id: ctx.tenant,
      unit_id: UNIDADE,
      source: prefixo + ORIGEM_GESTOR,
      // Pedido + revisao: a mesma revisao relida e o MESMO fato.
      source_event_id: `${p.ref}:${p.revisao}`,
      occurred_at: p.revisado_em,
      observed_at: d.janela.observado_em,
      ingested_at: ctx.agora_iso,
      correlation_id: `gestor-janela:${String(d.sequencia)}`,
      payload: { pedido_id: p.ref, estado: "aceito", source_revision: p.revisao_no },
    });
    if (!v.ok) { recusados += 1; continue; }
    eventos.push(v.evento);
  }
  const saude = observarSaude(
    {
      fonte_id: FONTE_GESTOR,
      respondeu: true,
      idade_min: d.idade_da_janela_ms / 60_000,
      // Cartoes montados nunca provam cobertura total: a fonte nasce `parcial`.
      completa: false,
      observado_em: d.janela.observado_em,
      revisao: d.sequencia,
    },
    { tenant: ctx.tenant, unidade: UNIDADE, limite_stale_min: LIMITE_JANELA_MS / 60_000 },
  );
  if (saude.ok) {
    const v = validarEvento({ ...saude.evento, source: prefixo + saude.evento.source });
    if (v.ok) eventos.push(v.evento); else recusados += 1;
  } else recusados += 1;
  return { eventos, com_cancelamento_alegado: cancelados, recusados };
}

/* ------------------------------------------------------------------ *
 * Apresentacao — o conteudo do pedido, com a procedencia declarada    *
 * ------------------------------------------------------------------ */

export interface PedidoObservadoVM {
  readonly codigo: string;
  readonly colocado_em: string | null;
  readonly visto_desde: string;
  readonly revisado_em: string;
  readonly revisoes: number;
  readonly linhas: number;
  readonly unidades: number;
  readonly itens: readonly {
    readonly quantidade: number;
    readonly nome: string;
    readonly observacao: string | null;
    readonly opcoes: readonly { readonly nome: string; readonly quantidade: number }[];
  }[];
}

export interface DemandaObservadaVM {
  /** O nivel de evidencia. Nunca `conciliado`, nunca `fisico`, nesta entrega. */
  readonly nivel: "demanda_observada";
  readonly procedencia: Procedencia;
  readonly titulo: string;
  readonly origem: string;
  readonly lido_em: string;
  readonly idade_s: number;
  readonly total: number;
  readonly linhas: number;
  readonly unidades: number;
  readonly cobertura: string;
  readonly estado_fisico: string;
  readonly conciliacao: string;
  /** Preenchido quando a janela exibida e a ultima boa e a leitura esta retida. */
  readonly retencao: string | null;
  readonly ocultos_por_cancelamento_alegado: number;
  readonly pedidos: readonly PedidoObservadoVM[];
}

export interface LeituraDaDemanda {
  readonly origem: "DEMANDA_OBSERVADA_NO_GESTOR" | "SAUDE_DAS_FONTES_SEM_PEDIDOS";
  readonly procedencia: Procedencia;
  readonly observado_em: string | null;
  /** A fonte de pedidos da Home (`ifood_tempos`), com o estado desta leitura. */
  readonly fonte: FonteLeitura;
  readonly pedidos: readonly PedidoLeitura[];
  readonly linhagem: LinhagemDeEventos | null;
  readonly demanda: DemandaObservadaVM | null;
  readonly eventos_aplicados: number;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
}

/** O motivo tecnico do executor, dito para quem opera. Nunca o codigo cru. */
export function motivoLegivel(m: string): string {
  if (m.startsWith("EDGE_") || m === "DEVTOOLS_ENDPOINT_NOT_LOOPBACK") return "o Edge dedicado nao respondeu";
  if (m === "EXPEDITION_PAGE_NOT_FOUND" || m === "MULTIPLE_EXPEDITION_PAGES")
    return "a tela de expedicao nao esta aberta de forma unica";
  if (m.startsWith("CDP_EVALUATE_")) return "a pagina nao respondeu a leitura";
  if (m === "SENSOR_MOUNTED_CARD_COVERAGE_UNKNOWN") return "nenhum cartao montado na tela";
  if (m === "SENSOR_NOTE_CONTENT_UNSAFE") return "uma observacao com dado pessoal foi retida";
  if (m.includes("MERCHANT")) return "a loja exibida na tela mudou";
  if (m === "JANELA_VELHA") return "a ultima janela envelheceu";
  if (m.startsWith("SENSOR_") || m.startsWith("DIFFERENTIAL_")) return "a estrutura da tela nao foi reconhecida";
  return "a leitura nao foi qualificada";
}

const ROTULO = "Gestor iFood · pedidos";
const AMBIENTES: FonteLeitura["ambientes"] = ["motoboy", "conferencia"];
const fonte = (estado: EstadoDeFonte, detalhe: string): FonteLeitura => ({
  id: "ifood_tempos", rotulo: ROTULO, estado, detalhe, ambientes: AMBIENTES,
});
const semPedidos = (f: FonteLeitura): LeituraDaDemanda => ({
  origem: "SAUDE_DAS_FONTES_SEM_PEDIDOS", procedencia: "real", observado_em: null, fonte: f,
  pedidos: [], linhagem: null, demanda: null, eventos_aplicados: 0,
});

function pedidoVM(p: PedidoObservado): PedidoObservadoVM {
  return {
    codigo: p.codigo, colocado_em: p.colocado_em, visto_desde: p.visto_desde,
    revisado_em: p.revisado_em, revisoes: p.revisao_no,
    linhas: p.itens.length, unidades: p.itens.reduce((n, i) => n + i.quantidade, 0),
    itens: p.itens.map((i) => ({
      quantidade: i.quantidade, nome: i.nome, observacao: i.observacao,
      opcoes: i.opcoes.map((o) => ({ nome: o.nome, quantidade: o.quantidade })),
    })),
  };
}

/** Do estado do feed a leitura que a Home consome. Nunca lanca por dado. */
export function leituraDaDemanda(
  d: DemandaDoGestor,
  ctx: { readonly tenant: string; readonly agora_iso: string },
): LeituraDaDemanda {
  if (d.estado === "nao_configurada")
    return semPedidos(fonte("indisponivel",
      "Unidade Itaim confirmada pela gestao. Falta observacao continua e reconciliacao segura por pedido; ausencia nao significa zero."));
  if (d.estado === "indisponivel")
    return semPedidos(fonte("indisponivel",
      `Observador do Gestor sem arquivo de leitura valido (${d.motivo.replace(/_/g, " ")}). Ausencia nao significa zero.`));
  if (d.estado === "parada")
    return semPedidos(fonte("stale",
      `O observador do Gestor parou de escrever as ${hora(d.escrito_em)}. Nenhum pedido e exibido como atual; ausencia nao significa zero.`));
  if (d.estado === "retida")
    return semPedidos(fonte(d.ultima_janela_em === null ? "indisponivel" : "stale",
      `Leitura do Gestor retida: ${motivoLegivel(d.motivo)}. ${
        d.ultima_janela_em === null
          ? "Nenhuma janela valida ainda."
          : `Ultima janela valida as ${hora(d.ultima_janela_em)}.`
      } Ausencia nao significa zero.`));

  const { eventos, com_cancelamento_alegado } = eventosDaDemanda(d, ctx);
  const projecao = projetarLeitura(eventos, {
    agora_iso: ctx.agora_iso, tenant_id: ctx.tenant, unit_id: UNIDADE,
  });
  const retidos = new Set(com_cancelamento_alegado);
  const afirmados = d.janela.pedidos.filter((p) => !retidos.has(p.ref));
  const ativos = new Set(projecao.pedidos_ativos);
  const saude = projecao.fontes.find((f) => f.id === FONTE_GESTOR);
  // Fecha fechado: o que a Home mostra e exatamente o que o projetor devolveu.
  if (saude === undefined || projecao.conflitos.length > 0 || projecao.lacunas.length > 0 ||
      ativos.size !== afirmados.length || afirmados.some((p) => !ativos.has(p.ref)))
    return semPedidos(fonte("indisponivel",
      "A projecao dos pedidos observados ficou inconsistente. Nada e exibido; ausencia nao significa zero."));

  const procedencia: Procedencia = d.modo === "real" ? "real" : "simulado";
  const ordenados = [...afirmados].sort((a, b) =>
    (a.colocado_em ?? a.visto_desde).localeCompare(b.colocado_em ?? b.visto_desde) ||
    a.codigo.localeCompare(b.codigo));
  const lido = hora(d.janela.observado_em);
  return {
    origem: "DEMANDA_OBSERVADA_NO_GESTOR",
    procedencia,
    observado_em: d.janela.observado_em,
    fonte: fonte(saude.estado,
      `Pedidos montados na tela de expedicao do Gestor, lidos as ${lido}. Cobertura total nao comprovada; preparo, pronto e saida nao sao afirmados.`),
    pedidos: ordenados.map((p) => ({
      id: p.codigo,
      // Praca e categoria ficam AUSENTES: nenhuma classificacao por nome.
      itens: p.itens.map((i, n) => ({
        item_id: `${p.ref}:${String(n + 1)}`, nome: i.nome, praca: null, qtd: i.quantidade, categoria: null,
      })),
      minutos_pronto_sem_sair: null,
      minutos_sem_ficar_pronto: null,
      minutos_em_rua: null,
      motivo_duas_sacolas: null,
      risco_de_conferencia: null,
    })),
    linhagem: {
      ...projecao.linhagem,
      transformacoes: [...projecao.linhagem.transformacoes, DEMANDA_GESTOR_VERSAO],
    },
    demanda: {
      nivel: "demanda_observada",
      procedencia,
      titulo: "Pedidos observados no Gestor",
      origem: "Gestor iFood · tela de expedicao",
      lido_em: d.janela.observado_em,
      idade_s: Math.round(d.idade_da_janela_ms / 1000),
      total: ordenados.length,
      linhas: ordenados.reduce((n, p) => n + p.itens.length, 0),
      unidades: ordenados.reduce((n, p) => n + p.itens.reduce((m, i) => m + i.quantidade, 0), 0),
      cobertura: "So os cartoes montados na tela de expedicao. O total da casa nao esta comprovado.",
      estado_fisico: "Preparo, pronto, saida e cancelamento nao sao afirmados por esta leitura.",
      conciliacao: "Ainda nao conciliado com o Reader da Teknisa: cada pedido aqui e demanda observada.",
      retencao: d.em_retencao === null
        ? null
        : `Leitura retida agora: ${motivoLegivel(d.em_retencao)}. Esta e a ultima janela valida, das ${lido}.`,
      ocultos_por_cancelamento_alegado: retidos.size,
      pedidos: ordenados.map(pedidoVM),
    },
    eventos_aplicados: projecao.eventos_aplicados,
  };
}
