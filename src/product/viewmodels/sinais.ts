/**
 * DeliveryOS — Product System · sinais operacionais sustentados (R4)
 * ============================================================================
 * Implementa APENAS os sinais que a classificacao do checkpoint
 * (`docs/product/RECOVERY_MAP.md` §3) marcou como **dado real disponivel** ou
 * **derivavel por regra comprovada**. Sao 11. Os outros 8 dependem de fonte que
 * nao existe (KDS, impressora, pausa do iFood, ficha tecnica) e 1 esta bloqueado
 * por fonte externa (SAC). Eles NAO sao produzidos aqui — sao DECLARADOS como
 * indisponiveis, com o motivo, porque um sinal ausente em silencio e
 * indistinguivel de um sinal que nao disparou.
 *
 * A classificacao nao foi recriada. Este arquivo a le e a obedece.
 *
 * S14 (duas sacolas) e caso a parte: a classificacao o poe em "derivavel, mas com
 * regra ainda fraca" — a heuristica de 47-61% NAO e verdade operacional. Aqui ele
 * so nasce quando existe MOTIVO comprovado no pedido. Sem motivo, nenhum sinal e
 * produzido; a heuristica nunca preenche a lacuna.
 *
 * Este arquivo nao executa nada. Ele descreve. Nao existe verbo de acao, nao
 * existe pausa automatica, e nenhuma orientacao daqui e executavel.
 */

import {
  ambienteDaPraca,
  rotuloDaCategoria,
  rotuloDaPraca,
  rotuloDoAmbiente,
  type AmbienteId,
  type PracaId,
} from "./areas";
import type { Evidencia, Procedencia } from "./estados";

/* ================================================================== *
 * Entrada: a leitura operacional
 * ================================================================== */

/** Quem se beneficia do sinal. Vem das jornadas ja documentadas. */
export type Publico = "gerente" | "boqueta" | "caixa" | "atendimento";

/**
 * Por que este pedido leva duas sacolas. So estes motivos sao aceitos, e todos
 * sao verificaveis no pedido — nenhum e estatistico.
 */
export type MotivoDuasSacolas =
  | "quente_e_frio_no_mesmo_pedido"
  | "bebida_de_garrafa_grande"
  | "seis_ou_mais_latas";

export interface ItemDoPedido {
  readonly item_id: string;
  readonly nome: string;
  readonly praca: PracaId | null;
  readonly qtd: number;
  /** Categoria operacional para agrupar item saindo rapido (S18). */
  readonly categoria: string | null;
}

export interface PedidoLeitura {
  readonly id: string;
  readonly itens: readonly ItemDoPedido[];
  /** Minutos desde que ficou pronto e ainda nao saiu. `null` = nao observado. */
  readonly minutos_pronto_sem_sair: number | null;
  /** Minutos em producao sem ficar pronto. `null` = nao observado. */
  readonly minutos_sem_ficar_pronto: number | null;
  /** Minutos na rua sem entregar. `null` = nao observado. */
  readonly minutos_em_rua: number | null;
  /**
   * Motivo COMPROVADO de duas sacolas, ou `null`. Nunca inferido por heuristica
   * de tamanho: quem monta a leitura precisa dizer qual regra foi satisfeita.
   */
  readonly motivo_duas_sacolas: MotivoDuasSacolas | null;
  /** Se a conferencia deste pedido pede reforco, e por que. */
  readonly risco_de_conferencia: string | null;
}

export type EstadoDeFonte = "saudavel" | "parcial" | "stale" | "indisponivel";

export interface FonteLeitura {
  readonly id: string;
  readonly rotulo: string;
  readonly estado: EstadoDeFonte;
  readonly detalhe: string;
  /**
   * Quais ambientes esta fonte alimenta. Existe para que a home consiga dizer
   * QUAL fonte falta quando uma area fica sem leitura — e para que uma area
   * alimentada por fonte degradada nunca apareca verde.
   */
  readonly ambientes: readonly AmbienteId[];
}

export interface LeituraOperacional {
  readonly procedencia: Procedencia;
  readonly observado_em: string;
  readonly pedidos: readonly PedidoLeitura[];
  /**
   * Carga por praca. Praca AUSENTE do mapa significa "nao medida" — nunca zero.
   * Por isso o tipo e parcial: nao ha como escrever `0` sem escolher escreve-lo.
   */
  readonly carga_por_praca: Partial<Record<PracaId, number>>;
  /** Baseline de carga por praca. Vem do motor calibrado, nao de palpite. */
  readonly baseline_por_praca: Partial<Record<PracaId, number>>;
  /** Pedidos que chegaram na ultima hora, se medido. */
  readonly chegadas_na_hora: number | null;
  /** Media de chegadas por hora ja observada, se houver. */
  readonly chegadas_normais: number | null;
  readonly fontes: readonly FonteLeitura[];
}

/* ================================================================== *
 * Saida: o sinal
 * ================================================================== */

export type EscopoSinal = "ambiente" | "pedido";

export interface Sinal {
  /** Codigo do catalogo original (`docs/Mapa_Sinais_Operacionais.md`). */
  readonly codigo: string;
  readonly nome: string;
  /** 1 = acompanhar · 2 = pressionando · 3 = virando foco. */
  readonly severidade: 1 | 2 | 3;
  readonly escopo: EscopoSinal;
  readonly ambiente: AmbienteId | null;
  /** A subarea que causa o congestionamento, quando identificavel (D46). */
  readonly subarea: PracaId | null;
  readonly pedido_id: string | null;
  /**
   * O alvo do sinal ja em linguagem humana. Existe porque um identificador
   * interno (`enrolados_quentes`, `cozinha_quentes`) nunca pode chegar a uma
   * pessoa — foi exatamente esse vazamento que R1 fechou no motor.
   */
  readonly alvo_rotulo: string;
  /** Uma frase: o que esta acontecendo. */
  readonly resumo: string;
  readonly evidencias: readonly Evidencia[];
  /** O que a equipe PODE fazer. Nunca imperativo de execucao automatica. */
  readonly orientacao: string | null;
  /** O que este sinal explicitamente nao prova. */
  readonly limitacao: string;
  readonly publico: readonly Publico[];
  readonly procedencia: Procedencia;
  /**
   * Se este sinal e PRESSAO — algo que muda a cor de uma area — ou informacao
   * que apenas acompanha. "So quentes" e roteamento: ele nunca pinta a Caixa de
   * amarelo. "Praca sobrecarregada" pinta. Sem esta distincao, uma operacao
   * calma com muitos pedidos simples apareceria inteira em atencao.
   */
  readonly pinta_ambiente: boolean;
}

/** Um sinal do catalogo que NAO pode ser produzido hoje, e por que. */
export interface SinalIndisponivel {
  readonly codigo: string;
  readonly nome: string;
  readonly motivo: string;
  readonly fonte_que_falta: string;
}

/**
 * Os 8 sinais sem fonte e o 1 bloqueado por fonte externa. Copiados da
 * classificacao do checkpoint — nao reclassificados aqui.
 */
export const SINAIS_INDISPONIVEIS: readonly SinalIndisponivel[] = [
  {
    codigo: "S9",
    nome: "Itens prontos indo para a bancada",
    motivo: "Nenhuma fonte registra 'pronto por praca'.",
    fonte_que_falta: "KDS ou impressora da praca",
  },
  {
    codigo: "S11",
    nome: "Quem fechou o pedido",
    motivo: "Nenhuma fonte registra autoria de fechamento.",
    fonte_que_falta: "KDS ou registro de bancada",
  },
  {
    codigo: "S13",
    nome: "Pedido fechavel agora",
    motivo: "Depende de saber o que ja esta pronto por praca.",
    fonte_que_falta: "KDS ou impressora da praca",
  },
  {
    codigo: "S15",
    nome: "Item pausado",
    motivo:
      "Nenhuma fonte informa pausa de item. O sistema nunca pausa praca sozinho.",
    fonte_que_falta: "estado de pausa do iFood",
  },
  {
    codigo: "S16",
    nome: "Item indisponivel",
    motivo: "Nenhuma fonte informa indisponibilidade em tempo real.",
    fonte_que_falta: "estado de disponibilidade do iFood",
  },
  {
    codigo: "S17",
    nome: "Risco de ruptura de insumo",
    motivo: "Exige ficha tecnica e consumo, que nao existem no repositorio.",
    fonte_que_falta: "ficha tecnica por item",
  },
  {
    codigo: "S20",
    nome: "Observacao ou alergia do cliente",
    motivo: "O texto completo so existe na comanda, que nao e capturada aqui.",
    fonte_que_falta: "comanda do Odhen/Teknisa",
  },
  {
    codigo: "S21",
    nome: "Bebida, sobremesa ou kit esquecido",
    motivo: "Exige ficha tecnica de composicao do kit.",
    fonte_que_falta: "ficha tecnica por item",
  },
  {
    codigo: "S19",
    nome: "Faltou item / cliente reclamando",
    motivo:
      "Bloqueado por fonte EXTERNA: exige SAC ou avaliacao. Nao e limitacao de arquitetura.",
    fonte_que_falta: "SAC / avaliacoes",
  },
];

/* ================================================================== *
 * Utilitarios
 * ================================================================== */

function ev(
  tipo: string,
  referencia: string,
  observado_em: string,
): Evidencia {
  return { tipo, referencia, observado_em };
}

/**
 * O alvo do sinal em linguagem humana. Nunca devolve identificador: para pedido
 * usa "Pedido X", para praca o rotulo canonico, para ambiente o rotulo do
 * ambiente, e para a casa inteira a palavra "A casa".
 */
function alvo(
  pedido_id: string | null,
  subarea: PracaId | null,
  ambiente: AmbienteId | null,
): string {
  if (pedido_id !== null) return `Pedido ${pedido_id}`;
  if (subarea !== null) return rotuloDaPraca(subarea);
  if (ambiente !== null) return rotuloDoAmbiente(ambiente);
  return "A casa";
}

function sev(n: number): 1 | 2 | 3 {
  if (n >= 3) return 3;
  if (n === 2) return 2;
  return 1;
}

/** Pisos herdados do motor calibrado (`FLOORS`). Nao sao palpite. */
export const PISOS = {
  EXPED: 30,
  PROD: 45,
  SURGE: 3,
  /** Teto de plausibilidade: acima disso o dado e suspeito e nao vira sinal. */
  STALE: 120,
} as const;

/* ================================================================== *
 * Os 11 sinais sustentados
 * ================================================================== */

/** S1 — pedido pronto sem sair. Fonte: tempos reais do iFood. */
function s1(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter(
      (p) =>
        p.minutos_pronto_sem_sair !== null &&
        p.minutos_pronto_sem_sair > PISOS.EXPED &&
        p.minutos_pronto_sem_sair <= PISOS.STALE,
    )
    .map((p) => ({
      codigo: "S1",
      nome: "Pronto sem sair",
      severidade: sev(p.minutos_pronto_sem_sair! > PISOS.EXPED * 2 ? 3 : 2),
      escopo: "pedido" as const,
      ambiente: "motoboy" as AmbienteId,
      subarea: null,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, "motoboy"),
      resumo: `Pedido ${p.id} pronto ha ${p.minutos_pronto_sem_sair} minutos e ainda nao saiu.`,
      evidencias: [
        ev("tempo_pronto_sem_sair", `${p.id}=${p.minutos_pronto_sem_sair}min`, l.observado_em),
      ],
      orientacao: "Verificar com o despacho quem leva este pedido.",
      limitacao:
        "O tempo vem do iFood. O sistema nao sabe se ha motoboy disponivel.",
      publico: ["gerente", "atendimento"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    }));
}

/** S2 — expedicao carregada / saida lenta. */
function s2(l: LeituraOperacional): Sinal[] {
  const esperando = l.pedidos.filter(
    (p) =>
      p.minutos_pronto_sem_sair !== null &&
      p.minutos_pronto_sem_sair > PISOS.EXPED &&
      p.minutos_pronto_sem_sair <= PISOS.STALE,
  );
  if (esperando.length < 3) return [];
  return [
    {
      codigo: "S2",
      nome: "Saida lenta",
      severidade: sev(esperando.length >= 6 ? 3 : 2),
      escopo: "ambiente",
      ambiente: "motoboy",
      subarea: null,
      pedido_id: null,
      alvo_rotulo: alvo(null, null, "motoboy"),
      resumo: `${esperando.length} pedidos prontos esperando para sair.`,
      evidencias: [
        ev("pedidos_prontos_parados", esperando.map((p) => p.id).join(","), l.observado_em),
      ],
      orientacao: "Olhar o despacho antes de olhar a producao.",
      limitacao: "Mede acumulo, nao capacidade de entrega.",
      publico: ["gerente"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    },
  ];
}

/** S3 — saiu e nao entregou ha muito tempo. */
function s3(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter(
      (p) =>
        p.minutos_em_rua !== null &&
        p.minutos_em_rua > PISOS.PROD &&
        p.minutos_em_rua <= PISOS.STALE,
    )
    .map((p) => ({
      codigo: "S3",
      nome: "Na rua ha muito tempo",
      severidade: sev(2),
      escopo: "pedido" as const,
      ambiente: "motoboy" as AmbienteId,
      subarea: null,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, "motoboy"),
      resumo: `Pedido ${p.id} saiu ha ${p.minutos_em_rua} minutos e nao consta entregue.`,
      evidencias: [ev("tempo_em_rua", `${p.id}=${p.minutos_em_rua}min`, l.observado_em)],
      orientacao: "Atendimento pode se antecipar ao cliente.",
      limitacao:
        "Sem GPS confirmado nesta leitura: 'nao consta entregue' nao e o mesmo que 'nao foi entregue'.",
      publico: ["atendimento", "gerente"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    }));
}

/** S4 — pedido X min sem ficar pronto (producao travada). */
function s4(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter(
      (p) =>
        p.minutos_sem_ficar_pronto !== null &&
        p.minutos_sem_ficar_pronto > PISOS.PROD &&
        p.minutos_sem_ficar_pronto <= PISOS.STALE,
    )
    .map((p) => {
      const pracas = pracasDoPedido(p);
      const pior = pracas[0] ?? null;
      return {
        codigo: "S4",
        nome: "Producao travada",
        severidade: sev(p.minutos_sem_ficar_pronto! > PISOS.PROD * 1.5 ? 3 : 2),
        escopo: "pedido" as const,
        ambiente: pior ? ambienteDaPraca(pior) : null,
        subarea: pior,
        pedido_id: p.id,
        alvo_rotulo: alvo(p.id, null, null),
        resumo: `Pedido ${p.id} ha ${p.minutos_sem_ficar_pronto} minutos sem ficar pronto${
          pior ? `, passando por ${rotuloDaPraca(pior)}` : ""
        }.`,
        evidencias: [
          ev("tempo_sem_ficar_pronto", `${p.id}=${p.minutos_sem_ficar_pronto}min`, l.observado_em),
          ...(pior ? [ev("praca_do_pedido", `${p.id} -> ${rotuloDaPraca(pior)}`, l.observado_em)] : []),
        ],
        orientacao: pior
          ? `Olhar ${rotuloDaPraca(pior)} primeiro.`
          : "Olhar a producao deste pedido.",
        limitacao:
          "O sistema sabe por quais pracas o pedido passa, nao o que ja saiu de cada uma.",
        publico: ["gerente", "boqueta"],
        procedencia: l.procedencia,
      pinta_ambiente: true,
      };
    });
}

/** S5 — praca ou subarea sobrecarregada. Derivado de carga/baseline. */
function s5(l: LeituraOperacional): Sinal[] {
  const out: Sinal[] = [];
  for (const [praca, carga] of Object.entries(l.carga_por_praca) as [
    PracaId,
    number,
  ][]) {
    const base = l.baseline_por_praca[praca];
    if (base === undefined || base <= 0) continue;
    const razao = carga / base;
    if (razao < 1.34) continue;
    const s = sev(razao >= 2 ? 3 : razao >= 1.67 ? 2 : 1);
    const amb = ambienteDaPraca(praca);
    out.push({
      codigo: "S5",
      nome: "Praca sobrecarregada",
      severidade: s,
      escopo: "ambiente",
      ambiente: amb,
      subarea: praca,
      pedido_id: null,
      alvo_rotulo: alvo(null, praca, amb),
      resumo: `${rotuloDaPraca(praca)} com ${carga} pedidos, ${Math.round(
        razao * 100,
      )}% do normal.`,
      evidencias: [
        ev("carga_por_praca", `${rotuloDaPraca(praca)}=${carga}`, l.observado_em),
        ev("baseline_calibrado", `${rotuloDaPraca(praca)}=${base}`, l.observado_em),
      ],
      orientacao:
        s < 3
          ? `Acompanhar ${rotuloDaPraca(praca)}.`
          : rotuloDaPraca(praca) === rotuloDoAmbiente(amb)
            ? `Reforcar ${rotuloDaPraca(praca)}.`
            : `Reforcar ${rotuloDaPraca(praca)} — e a subarea que segura ${rotuloDoAmbiente(amb)}.`,
      limitacao:
        "Baseline provisorio, calibrado em 30 dias reais e ainda nao validado no piloto.",
      publico: ["gerente", "boqueta"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    });
  }
  return out;
}

/** S6 — surto de zona: chegada acima do normal. */
function s6(l: LeituraOperacional): Sinal[] {
  if (l.chegadas_na_hora === null || l.chegadas_normais === null) return [];
  if (l.chegadas_normais <= 0) return [];
  const razao = l.chegadas_na_hora / l.chegadas_normais;
  if (razao < 1.5) return [];
  return [
    {
      codigo: "S6",
      nome: "Demanda acima do normal",
      severidade: sev(razao >= 2 ? 2 : 1),
      escopo: "ambiente",
      ambiente: "caixa",
      subarea: null,
      pedido_id: null,
      alvo_rotulo: alvo(null, null, "caixa"),
      resumo: `${l.chegadas_na_hora} pedidos na ultima hora, contra ${l.chegadas_normais} de costume.`,
      evidencias: [
        ev("chegadas_na_hora", String(l.chegadas_na_hora), l.observado_em),
        ev("chegadas_normais", String(l.chegadas_normais), l.observado_em),
      ],
      orientacao: "Antecipar reforco antes da praca travar.",
      limitacao: "Preve pressao; nao afirma que ela ja chegou na producao.",
      publico: ["gerente"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    },
  ];
}

function pracasDoPedido(p: PedidoLeitura): PracaId[] {
  const vistas: PracaId[] = [];
  for (const i of p.itens) {
    if (i.praca !== null && !vistas.includes(i.praca)) vistas.push(i.praca);
  }
  return vistas;
}

/** S7 — pedido que trava a fila: depende de uma unica praca, e ela esta pressionada. */
function s7(l: LeituraOperacional): Sinal[] {
  const out: Sinal[] = [];
  for (const p of l.pedidos) {
    const pracas = pracasDoPedido(p);
    if (pracas.length !== 1) continue;
    const praca = pracas[0]!;
    const carga = l.carga_por_praca[praca];
    const base = l.baseline_por_praca[praca];
    if (carga === undefined || base === undefined || base <= 0) continue;
    if (carga / base < 1.34) continue;
    out.push({
      codigo: "S7",
      nome: "Pedido preso em uma praca",
      severidade: sev(1),
      escopo: "pedido",
      ambiente: ambienteDaPraca(praca),
      subarea: praca,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, null),
      resumo: `Pedido ${p.id} depende so de ${rotuloDaPraca(praca)}, que esta pressionada.`,
      evidencias: [
        ev("praca_unica_do_pedido", `${p.id} -> ${rotuloDaPraca(praca)}`, l.observado_em),
        ev("carga_por_praca", `${rotuloDaPraca(praca)}=${carga}`, l.observado_em),
      ],
      orientacao: `Destravar ${rotuloDaPraca(praca)} libera este pedido inteiro.`,
      limitacao: "Composicao do pedido; nao o estado de producao de cada item.",
      publico: ["boqueta", "gerente"],
      procedencia: l.procedencia,
      pinta_ambiente: false,
    });
  }
  return out;
}

/** S8 — pedido simples que pode ser adiantado (poucas pracas, sem trava). */
function s8(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter((p) => p.itens.length > 0 && pracasDoPedido(p).length === 1)
    .filter((p) => p.itens.reduce((n, i) => n + i.qtd, 0) <= 2)
    .map((p) => {
      const praca = pracasDoPedido(p)[0]!;
      return {
        codigo: "S8",
        nome: "Pedido simples",
        severidade: sev(1),
        escopo: "pedido" as const,
        ambiente: ambienteDaPraca(praca),
        subarea: praca,
        pedido_id: p.id,
        alvo_rotulo: alvo(p.id, null, null),
        resumo: `Pedido ${p.id} e simples: so ${rotuloDaPraca(praca)}.`,
        evidencias: [
          ev("composicao_do_pedido", `${p.id}: ${p.itens.length} item(ns), 1 praca`, l.observado_em),
        ],
        orientacao: "Pode ser adiantado sem atrapalhar os demais.",
        limitacao: "Simplicidade de composicao nao garante praca livre.",
        publico: ["boqueta", "caixa"],
        procedencia: l.procedencia,
      pinta_ambiente: false,
      };
    });
}

/**
 * S12 — "so quentes". ROTEAMENTO, nao temperatura (D47): o pedido nao depende da
 * praca Sushi, entao pode ser montado na bancada do caixa. Nao implica prioridade.
 */
function s12(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter((p) => p.itens.length > 0)
    .filter((p) => {
      const pracas = pracasDoPedido(p);
      if (pracas.length === 0) return false;
      // A regra e de DEPENDENCIA DE PRACA: nenhuma praca do pedido pertence ao
      // ambiente Sushi. Nunca se olha o campo `temperatura`.
      return pracas.every((pr) => ambienteDaPraca(pr) !== "sushi");
    })
    .map((p) => ({
      codigo: "S12",
      nome: "So quentes",
      severidade: sev(1),
      escopo: "pedido" as const,
      ambiente: "caixa" as AmbienteId,
      subarea: null,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, null),
      resumo: `Pedido ${p.id} nao passa pelo Sushi: pode ser montado na bancada do caixa.`,
      evidencias: [
        ev(
          "pracas_do_pedido",
          `${p.id}: ${pracasDoPedido(p).map(rotuloDaPraca).join(", ")} — nenhuma no ambiente Sushi`,
          l.observado_em,
        ),
      ],
      orientacao: "Montar na bancada do caixa. Nao e prioridade — e roteamento.",
      limitacao:
        "Roteamento por composicao. Nao afirma que o pedido esta pronto nem que deve passar na frente.",
      publico: ["caixa", "boqueta"],
      procedencia: l.procedencia,
      pinta_ambiente: false,
    }));
}

const ROTULO_MOTIVO: Record<MotivoDuasSacolas, string> = {
  quente_e_frio_no_mesmo_pedido: "tem item quente e item frio no mesmo pedido",
  bebida_de_garrafa_grande: "leva bebida em garrafa grande",
  seis_ou_mais_latas: "leva seis latas ou mais",
};

/**
 * S14 — duas sacolas. So nasce com MOTIVO comprovado no pedido. A heuristica de
 * tamanho cobre 47-61% e NAO e verdade operacional (PB3): quando nao ha motivo,
 * este sinal simplesmente nao e produzido.
 */
function s14(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter((p) => p.motivo_duas_sacolas !== null)
    .map((p) => ({
      codigo: "S14",
      nome: "Duas sacolas",
      severidade: sev(1),
      escopo: "pedido" as const,
      ambiente: "conferencia" as AmbienteId,
      subarea: null,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, null),
      resumo: `Pedido ${p.id} vai em duas sacolas: ${ROTULO_MOTIVO[p.motivo_duas_sacolas!]}.`,
      evidencias: [
        ev("motivo_duas_sacolas", `${p.id}=${p.motivo_duas_sacolas}`, l.observado_em),
      ],
      orientacao: "Separar as duas sacolas antes de fechar.",
      limitacao:
        "So aparece com motivo verificavel no pedido. Pedidos sem motivo registrado nao produzem este sinal — ausencia aqui nao significa uma sacola.",
      publico: ["boqueta", "caixa"],
      procedencia: l.procedencia,
      pinta_ambiente: false,
    }));
}

/** Risco de conferencia por pedido. Existe mesmo sem medicao da area. */
function conferenciaPorPedido(l: LeituraOperacional): Sinal[] {
  return l.pedidos
    .filter((p) => p.risco_de_conferencia !== null)
    .map((p) => ({
      codigo: "S14c",
      nome: "Conferencia reforcada",
      severidade: sev(1),
      escopo: "pedido" as const,
      ambiente: "conferencia" as AmbienteId,
      subarea: null,
      pedido_id: p.id,
      alvo_rotulo: alvo(p.id, null, null),
      resumo: `Pedido ${p.id} pede conferencia reforcada: ${p.risco_de_conferencia}.`,
      evidencias: [
        ev("risco_de_conferencia", `${p.id}: ${p.risco_de_conferencia}`, l.observado_em),
      ],
      orientacao: "Conferir este pedido com atencao antes de fechar.",
      limitacao:
        "Risco POR PEDIDO. Nao existe medicao da carga da area de Conferencia, e este sinal nao a substitui.",
      publico: ["boqueta", "caixa"],
      procedencia: l.procedencia,
      pinta_ambiente: true,
    }));
}

/** S18 — item ou grupo saindo rapido agora. */
function s18(l: LeituraOperacional): Sinal[] {
  const contagem = new Map<string, { qtd: number; praca: PracaId | null }>();
  for (const p of l.pedidos) {
    for (const i of p.itens) {
      if (i.categoria === null) continue;
      const atual = contagem.get(i.categoria) ?? { qtd: 0, praca: i.praca };
      contagem.set(i.categoria, { qtd: atual.qtd + i.qtd, praca: atual.praca });
    }
  }
  const ordenado = [...contagem.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
  // Categoria sem rotulo humano NAO vira sinal: exibir `enrolado_quente` para
  // uma pessoa e o mesmo defeito que R1 corrigiu no motor.
  const topo = ordenado
    .filter(([c, v]) => v.qtd >= PISOS.SURGE && rotuloDaCategoria(c) !== null)
    .slice(0, 3);
  return topo.map(([categoria, v]) => ({
    codigo: "S18",
    nome: "Item saindo rapido",
    severidade: sev(1),
    escopo: "ambiente" as const,
    ambiente: v.praca ? ambienteDaPraca(v.praca) : null,
    subarea: v.praca,
    pedido_id: null,
    alvo_rotulo: alvo(null, v.praca, v.praca ? ambienteDaPraca(v.praca) : null),
    resumo: `${rotuloDaCategoria(categoria)}: ${v.qtd} em producao agora.`,
    evidencias: [
      ev("itens_em_producao", `${rotuloDaCategoria(categoria)}=${v.qtd}`, l.observado_em),
    ],
    orientacao: null,
    limitacao:
      "Conta o que esta em producao nesta leitura. Nao e previsao de venda nem de ruptura.",
    publico: ["gerente", "boqueta"],
    procedencia: l.procedencia,
      pinta_ambiente: false,
  }));
}

/** S22 — ritmo acima do normal (volume total em andamento). */
function s22(l: LeituraOperacional): Sinal[] {
  if (l.chegadas_na_hora === null || l.chegadas_normais === null) return [];
  if (l.chegadas_normais <= 0) return [];
  if (l.chegadas_na_hora / l.chegadas_normais < 1.25) return [];
  return [
    {
      codigo: "S22",
      nome: "Ritmo acima do normal",
      severidade: sev(1),
      escopo: "ambiente",
      ambiente: null,
      subarea: null,
      pedido_id: null,
      alvo_rotulo: alvo(null, null, null),
      resumo: `A casa esta em ritmo acima do normal (${l.chegadas_na_hora} contra ${l.chegadas_normais}).`,
      evidencias: [
        ev("ritmo", `${l.chegadas_na_hora}/${l.chegadas_normais}`, l.observado_em),
      ],
      orientacao: null,
      limitacao: "Descreve o ritmo. Nao afirma que algo esta errado.",
      publico: ["gerente"],
      procedencia: l.procedencia,
      pinta_ambiente: false,
    },
  ];
}

/* ================================================================== *
 * O motor de sinais
 * ================================================================== */

/**
 * Produz todos os sinais sustentados de uma leitura. Ordem estavel: por
 * severidade decrescente, depois por codigo — para que a mesma leitura produza
 * sempre a mesma tela.
 */
export function sinaisDe(l: LeituraOperacional): readonly Sinal[] {
  const todos = [
    ...s1(l),
    ...s2(l),
    ...s3(l),
    ...s4(l),
    ...s5(l),
    ...s6(l),
    ...s7(l),
    ...s8(l),
    ...s12(l),
    ...s14(l),
    ...conferenciaPorPedido(l),
    ...s18(l),
    ...s22(l),
  ];
  return todos.sort(
    (a, b) =>
      b.severidade - a.severidade ||
      a.codigo.localeCompare(b.codigo) ||
      (a.pedido_id ?? "").localeCompare(b.pedido_id ?? ""),
  );
}

/** Os codigos que este motor sabe produzir. Usado pelo gate e pela documentacao. */
export const CODIGOS_IMPLEMENTADOS: readonly string[] = [
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S12",
  "S18",
  "S22",
];

/** S14 e o risco de conferencia por pedido: condicionais, fora dos 11. */
export const CODIGOS_CONDICIONAIS: readonly string[] = ["S14", "S14c"];
