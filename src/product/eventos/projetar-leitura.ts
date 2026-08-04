/**
 * PROJETOR — eventos operacionais -> LeituraOperacional
 * ============================================================================
 * R5-D1. Funcao PURA e DETERMINISTICA: a mesma sequencia logica de eventos
 * produz a mesma leitura, sempre. Sem relogio, sem random, sem I/O, sem estado
 * global. Rodar duas vezes devolve o mesmo objeto.
 *
 * A LEITURA E PROJECAO, NAO FATO. Ela nao e persistida como verdade primaria, e
 * nao existe evento que a declare criada — reconstrui-la e sempre reprocessar o
 * ledger (D76).
 *
 * TRES REGRAS QUE DECIDEM O DESENHO:
 *
 *   1. **Carga nasce de trabalho aberto, contado.** Nunca chega como numero.
 *      Um numero sem linhagem foi exatamente o que R5-D0 encontrou na leitura
 *      antiga, e a projecao existe para que ele nao volte por outra porta.
 *
 *   2. **Evento fora de ordem nao regride em silencio.** O estado so avanca; um
 *      atrasado que tentaria voltar vira `conflito` auditavel. Nada e corrigido
 *      por fabricacao — o conflito FICA na leitura.
 *
 *   3. **Ausencia nunca vira numero.** Capacidade nao fornecida, expirada ou
 *      indisponivel sao TRES coisas distintas, e nenhuma delas e zero. Sem
 *      evidencia suficiente, a confianca e `nao_estimada` — o contrato duravel
 *      aprovado em R5-D0-S, sem alteracao.
 */

import type { ConfiancaDaRecomendacao } from "../../platform/copiloto/shadow";
import {
  AVANCO_PEDIDO,
  AVANCO_TRABALHO,
  CATALOGO_OPERACIONAL_VERSAO,
  chaveIdempotente,
  impressaoDoFato,
  validarEvento,
  type EnvelopeOperacional,
  type EstadoPedido,
  type EstadoTrabalho,
  type ModoCapacidade,
  type PayloadCapacidadePraca,
  type PayloadPedidoCiclo,
  type PayloadSourceHealth,
  type PayloadTrabalhoPraca,
} from "./catalogo-operacional";
import type { LinhagemDeEventos } from "../atencao/linhagem-eventos";
import type { PracaId } from "../viewmodels/areas";
import type { EstadoDeFonte } from "../viewmodels/sinais";

export const PROJETOR_VERSAO = "projetor-leitura@1";

/* ------------------------------------------------------------------ *
 * Conflitos e lacunas — visiveis, nunca corrigidos                    *
 * ------------------------------------------------------------------ */

export type MotivoConflito =
  | "duplicata_divergente"
  | "regressao_de_estado_recusada"
  | "conclusao_antes_de_inicio"
  | "cancelamento_apos_conclusao"
  | "pedido_cancelado_com_trabalho_aberto"
  | "fontes_divergentes";

export type MotivoLacuna =
  | "trabalho_sem_praca"
  | "evento_invalido"
  | "capacidade_expirada"
  | "capacidade_ausente";

export interface Conflito {
  readonly motivo: MotivoConflito;
  readonly referencia: string;
  readonly detalhe: string;
}

export interface Lacuna {
  readonly motivo: MotivoLacuna;
  readonly referencia: string;
  readonly detalhe: string;
}

/* ------------------------------------------------------------------ *
 * Saida                                                               *
 * ------------------------------------------------------------------ */

export interface CapacidadeProjetada {
  readonly praca_id: PracaId;
  readonly modo: ModoCapacidade;
  /** SOMENTE quando `modo === "observada"`. Ausencia nunca e zero. */
  readonly capacidade: number | null;
}

export interface CargaDaPraca {
  readonly praca_id: PracaId;
  readonly abertos: number;
  readonly aguardando: number;
  readonly iniciados: number;
  /** Minutos do trabalho aberto mais antigo. `null` = nao observado. */
  readonly idade_do_mais_antigo_min: number | null;
}

export interface LeituraProjetada {
  readonly projetor_versao: string;
  readonly catalogo_versao: string;
  readonly pedidos_ativos: readonly string[];
  readonly pedidos_aguardando_producao: readonly string[];
  readonly pedidos_em_producao: readonly string[];
  readonly pedidos_prontos: readonly string[];
  readonly carga_por_praca: readonly CargaDaPraca[];
  readonly capacidade_por_praca: readonly CapacidadeProjetada[];
  /** Instante da evidencia mais recente. `null` = nenhuma evidencia. */
  readonly evidencia_mais_recente: string | null;
  readonly fontes: readonly { readonly id: string; readonly estado: EstadoDeFonte }[];
  readonly conflitos: readonly Conflito[];
  readonly lacunas: readonly Lacuna[];
  readonly linhagem: LinhagemDeEventos;
  /** Contrato duravel de R5-D0-S, sem alteracao. */
  readonly confianca: ConfiancaDaRecomendacao;
  readonly eventos_aplicados: number;
  readonly eventos_ignorados: number;
}

/* ------------------------------------------------------------------ *
 * Estado interno                                                      *
 * ------------------------------------------------------------------ */

interface Pedido {
  estado: EstadoPedido;
  avanco: number;
  revisao: number;
  ocorrido: number;
}
interface Trabalho {
  praca: PracaId;
  pedido: string;
  estado: EstadoTrabalho;
  avanco: number;
  revisao: number;
  ocorrido: number;
  /** Instante em que o trabalho abriu. Base da idade. */
  aberto_em: number;
  passou_por_inicio: boolean;
}

const ABERTOS: readonly EstadoTrabalho[] = ["criado", "aguardando", "iniciado"];

/**
 * Ordem canonica de aplicacao. **Nao e a ordem de chegada.** Duas ingestoes com
 * ordens diferentes que representam a mesma ordem causal precisam produzir a
 * mesma leitura — por isso a chave e `occurred_at`, depois `source_revision`,
 * depois a chave idempotente como desempate estavel.
 *
 * `ingested_at` fica de fora de proposito: ele descreve quando o sistema soube,
 * nao quando o fato aconteceu, e usa-lo faria a leitura depender de quem chegou
 * primeiro no cano.
 */
function ordenar(eventos: readonly EnvelopeOperacional[]): EnvelopeOperacional[] {
  return [...eventos].sort((a, b) => {
    const oa = Date.parse(a.occurred_at);
    const ob = Date.parse(b.occurred_at);
    if (oa !== ob) return oa - ob;
    const ra = (a.payload as { source_revision: number }).source_revision;
    const rb = (b.payload as { source_revision: number }).source_revision;
    if (ra !== rb) return ra - rb;
    return chaveIdempotente(a).localeCompare(chaveIdempotente(b));
  });
}

/* ------------------------------------------------------------------ *
 * A projecao                                                          *
 * ------------------------------------------------------------------ */

export interface OpcoesProjecao {
  /** Instante de referencia, INJETADO. O projetor nao le relogio. */
  readonly agora_iso: string;
  readonly tenant_id: string;
  readonly unit_id: string;
}

export function projetarLeitura(
  brutos: readonly unknown[],
  opcoes: OpcoesProjecao,
): LeituraProjetada {
  const agora = Date.parse(opcoes.agora_iso);
  const conflitos: Conflito[] = [];
  const lacunas: Lacuna[] = [];

  /* -- 1. Validacao. Invalido vira LACUNA, nunca desaparece. ---------- */
  const validos: EnvelopeOperacional[] = [];
  for (const bruto of brutos) {
    const r = validarEvento(bruto);
    if (!r.ok) {
      lacunas.push({ motivo: "evento_invalido", referencia: r.motivo, detalhe: r.detalhe });
      continue;
    }
    if (r.evento.tenant_id !== opcoes.tenant_id || r.evento.unit_id !== opcoes.unit_id) {
      lacunas.push({
        motivo: "evento_invalido",
        referencia: "escopo",
        detalhe: `${r.evento.tenant_id}/${r.evento.unit_id}`,
      });
      continue;
    }
    validos.push(r.evento);
  }

  /* -- 2. Idempotencia. Mesma chave + mesmo conteudo = um fato so.
     Mesma chave + conteudo divergente = CONFLITO, nunca sobrescrita. -- */
  const porChave = new Map<string, EnvelopeOperacional>();
  let ignorados = 0;
  for (const e of validos) {
    const k = chaveIdempotente(e);
    const anterior = porChave.get(k);
    if (anterior === undefined) {
      porChave.set(k, e);
      continue;
    }
    if (impressaoDoFato(anterior) === impressaoDoFato(e)) {
      ignorados += 1; // duplicata identica: idempotente
      continue;
    }
    conflitos.push({
      motivo: "duplicata_divergente",
      referencia: k,
      detalhe: "mesma chave idempotente com conteudo diferente",
    });
    ignorados += 1; // o primeiro permanece; o divergente NAO sobrescreve
  }

  /* -- 3. Aplicacao, em ordem canonica. ------------------------------- */
  const ordenados = ordenar([...porChave.values()]);
  const pedidos = new Map<string, Pedido>();
  const trabalhos = new Map<string, Trabalho>();
  const fontes = new Map<string, { estado: EstadoDeFonte; revisao: number }>();
  const capacidades = new Map<PracaId, CapacidadeProjetada>();
  let maisRecente = Number.NEGATIVE_INFINITY;
  const idsAplicados: string[] = [];
  let naturezaReal = true;

  for (const e of ordenados) {
    const ocorrido = Date.parse(e.occurred_at);
    const observado = Date.parse(e.observed_at);
    if (observado > maisRecente) maisRecente = observado;
    idsAplicados.push(e.event_id);
    if (e.source.startsWith("fixture") || e.source.startsWith("demo")) naturezaReal = false;

    if (e.event_type === "pedido_ciclo_observado") {
      const p = e.payload as PayloadPedidoCiclo;
      const atual = pedidos.get(p.pedido_id);
      const avanco = AVANCO_PEDIDO[p.estado];
      if (atual === undefined) {
        pedidos.set(p.pedido_id, { estado: p.estado, avanco, revisao: p.source_revision, ocorrido });
        continue;
      }
      // Cancelamento vale sempre — ele nao esta na escala de avanco.
      if (p.estado === "cancelado") {
        if (atual.estado === "despachado") {
          conflitos.push({
            motivo: "cancelamento_apos_conclusao",
            referencia: p.pedido_id,
            detalhe: "cancelamento observado depois do despacho",
          });
        }
        pedidos.set(p.pedido_id, { estado: "cancelado", avanco: 0, revisao: p.source_revision, ocorrido });
        continue;
      }
      if (atual.estado === "cancelado") {
        conflitos.push({
          motivo: "regressao_de_estado_recusada",
          referencia: p.pedido_id,
          detalhe: `pedido cancelado nao volta para ${p.estado}`,
        });
        continue;
      }
      if (avanco < atual.avanco) {
        // Evento ATRASADO. Ele nao regride o estado — e o fato de ter chegado
        // fica registrado, porque uma fonte que emite fora de ordem e uma coisa
        // que quem opera precisa saber.
        conflitos.push({
          motivo: "regressao_de_estado_recusada",
          referencia: p.pedido_id,
          detalhe: `${atual.estado} -> ${p.estado} recusado`,
        });
        continue;
      }
      pedidos.set(p.pedido_id, { estado: p.estado, avanco, revisao: p.source_revision, ocorrido });
      continue;
    }

    if (e.event_type === "trabalho_praca_observado") {
      const w = e.payload as PayloadTrabalhoPraca;
      if (w.praca_id === null) {
        // Fato observado sem praca: nao vira carga de lugar nenhum, e a lacuna
        // fica declarada. Escolher uma praca aqui seria inventar operacao.
        lacunas.push({
          motivo: "trabalho_sem_praca",
          referencia: w.trabalho_id,
          detalhe: `pedido ${w.pedido_id}`,
        });
        continue;
      }
      const atual = trabalhos.get(w.trabalho_id);
      const avanco = AVANCO_TRABALHO[w.estado];
      if (atual === undefined) {
        if (w.estado === "concluido") {
          conflitos.push({
            motivo: "conclusao_antes_de_inicio",
            referencia: w.trabalho_id,
            detalhe: "conclusao observada sem inicio",
          });
        }
        trabalhos.set(w.trabalho_id, {
          praca: w.praca_id,
          pedido: w.pedido_id,
          estado: w.estado,
          avanco,
          revisao: w.source_revision,
          ocorrido,
          aberto_em: ocorrido,
          passou_por_inicio: w.estado === "iniciado",
        });
        continue;
      }
      if (w.estado === "cancelado") {
        if (atual.estado === "concluido") {
          conflitos.push({
            motivo: "cancelamento_apos_conclusao",
            referencia: w.trabalho_id,
            detalhe: "cancelamento observado depois da conclusao",
          });
        }
        trabalhos.set(w.trabalho_id, { ...atual, estado: "cancelado", avanco: 0, revisao: w.source_revision });
        continue;
      }
      if (atual.estado === "cancelado" || avanco < atual.avanco) {
        conflitos.push({
          motivo: "regressao_de_estado_recusada",
          referencia: w.trabalho_id,
          detalhe: `${atual.estado} -> ${w.estado} recusado`,
        });
        continue;
      }
      if (w.estado === "concluido" && !atual.passou_por_inicio) {
        conflitos.push({
          motivo: "conclusao_antes_de_inicio",
          referencia: w.trabalho_id,
          detalhe: `concluido a partir de ${atual.estado}`,
        });
      }
      trabalhos.set(w.trabalho_id, {
        ...atual,
        estado: w.estado,
        avanco,
        revisao: w.source_revision,
        ocorrido,
        passou_por_inicio: atual.passou_por_inicio || w.estado === "iniciado",
      });
      continue;
    }

    if (e.event_type === "capacidade_praca_observada") {
      const c = e.payload as PayloadCapacidadePraca;
      if (c.praca_id === null) {
        lacunas.push({ motivo: "capacidade_ausente", referencia: "sem_praca", detalhe: c.modo });
        continue;
      }
      let modo: ModoCapacidade = c.modo;
      let capacidade: number | null = c.modo === "observada" ? c.capacidade : null;
      // Validade vencida NAO vira capacidade zero e NAO vira ausencia muda: ela
      // vira o modo `observacao_expirada`, que e um quarto estado proprio.
      if (c.valido_ate !== null && Date.parse(c.valido_ate) < agora) {
        modo = "observacao_expirada";
        capacidade = null;
        lacunas.push({
          motivo: "capacidade_expirada",
          referencia: c.praca_id,
          detalhe: `valida ate ${c.valido_ate}`,
        });
      }
      if (modo !== "observada") {
        lacunas.push({ motivo: "capacidade_ausente", referencia: c.praca_id, detalhe: modo });
      }
      capacidades.set(c.praca_id, { praca_id: c.praca_id, modo, capacidade });
      continue;
    }

    const s = e.payload as PayloadSourceHealth;
    const anterior = fontes.get(s.source_id);
    if (anterior !== undefined && anterior.revisao === s.source_revision && anterior.estado !== s.estado) {
      conflitos.push({
        motivo: "fontes_divergentes",
        referencia: s.source_id,
        detalhe: `${anterior.estado} vs ${s.estado} na mesma revisao`,
      });
      continue;
    }
    if (anterior === undefined || s.source_revision >= anterior.revisao) {
      fontes.set(s.source_id, { estado: s.estado, revisao: s.source_revision });
    }
  }

  /* -- 4. Derivacoes. Carga nasce de trabalho aberto, CONTADO. -------- */
  const ativos = [...pedidos.entries()].filter(([, p]) => p.estado !== "cancelado");
  const porPraca = new Map<PracaId, Trabalho[]>();
  for (const t of trabalhos.values()) {
    if (!ABERTOS.includes(t.estado)) continue;
    const lista = porPraca.get(t.praca) ?? [];
    lista.push(t);
    porPraca.set(t.praca, lista);
  }

  // Pedido cancelado com trabalho ainda aberto: conflito, e o trabalho continua
  // contado. Some-lo daria uma carga menor do que a bancada realmente tem.
  for (const t of trabalhos.values()) {
    if (!ABERTOS.includes(t.estado)) continue;
    const p = pedidos.get(t.pedido);
    if (p !== undefined && p.estado === "cancelado") {
      conflitos.push({
        motivo: "pedido_cancelado_com_trabalho_aberto",
        referencia: t.pedido,
        detalhe: `trabalho ${t.estado} continua contado`,
      });
    }
  }

  const carga: CargaDaPraca[] = [...porPraca.entries()]
    .map(([praca_id, lista]) => ({
      praca_id,
      abertos: lista.length,
      aguardando: lista.filter((t) => t.estado === "aguardando").length,
      iniciados: lista.filter((t) => t.estado === "iniciado").length,
      idade_do_mais_antigo_min: Number.isFinite(agora)
        ? Math.max(0, Math.round((agora - Math.min(...lista.map((t) => t.aberto_em))) / 60000))
        : null,
    }))
    .sort((a, b) => a.praca_id.localeCompare(b.praca_id));

  /* -- 5. Linhagem e confianca. ---------------------------------------
     A confianca so e apurada quando ha politica declarada E evidencia. Nao
     existe politica canonica de confianca operacional (D69) — entao aqui ela e
     SEMPRE `nao_estimada`. O projetor nao inventa a regra que falta. */
  const linhagem: LinhagemDeEventos = {
    input_event_ids: idsAplicados,
    natureza: idsAplicados.length === 0 ? "fixture" : naturezaReal ? "real" : "demonstracao",
    observado_em: Number.isFinite(maisRecente) ? new Date(maisRecente).toISOString() : opcoes.agora_iso,
    transformacoes: [PROJETOR_VERSAO],
    produtor: "operacao-viva",
    event_catalog_version: "event-catalog@1.0.0",
  };

  const confianca: ConfiancaDaRecomendacao = { estado: "nao_estimada" };

  const emEstado = (...es: EstadoPedido[]): string[] =>
    ativos.filter(([, p]) => es.includes(p.estado)).map(([id]) => id).sort();

  return {
    projetor_versao: PROJETOR_VERSAO,
    catalogo_versao: CATALOGO_OPERACIONAL_VERSAO,
    pedidos_ativos: ativos.map(([id]) => id).sort(),
    pedidos_aguardando_producao: emEstado("aceito"),
    pedidos_em_producao: emEstado("em_producao"),
    pedidos_prontos: emEstado("pronto"),
    carga_por_praca: carga,
    capacidade_por_praca: [...capacidades.values()].sort((a, b) =>
      a.praca_id.localeCompare(b.praca_id),
    ),
    evidencia_mais_recente: Number.isFinite(maisRecente)
      ? new Date(maisRecente).toISOString()
      : null,
    fontes: [...fontes.entries()]
      .map(([id, f]) => ({ id, estado: f.estado }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    conflitos,
    lacunas,
    linhagem,
    confianca,
    eventos_aplicados: ordenados.length,
    eventos_ignorados: ignorados,
  };
}
