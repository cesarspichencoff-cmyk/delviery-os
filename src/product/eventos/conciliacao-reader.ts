/**
 * CONCILIACAO COM O READER — do "observado" ao "conciliado"
 * ============================================================================
 * Nivel 2 de evidencia. Um pedido observado na tela do Gestor passa a
 * CONCILIADO quando o Reader da Teknisa, fonte independente, tem o mesmo
 * numero curto no mesmo dia, sem ambiguidade, e com as mesmas quantidades por
 * linha.
 *
 * QUEM DECIDE O CASAMENTO NAO E ESTE ARQUIVO. E o reconciliador de janela que
 * ja existia (`tools/gestor-native-shadow-reconcile/reconcile.cjs`), injetado
 * aqui: ele valida escopo, frescor das duas capturas, colisao de numero curto e
 * revisao ambigua, e devolve referencias opacas. Este modulo so monta a entrada,
 * localiza cada pedido pelo mesmo HMAC que o reconciliador usa, e compara as
 * quantidades que ELE devolveu com as da tela.
 *
 * O QUE "CONCILIADO" AFIRMA: duas fontes independentes concordam sobre numero,
 * dia e quantidades por linha. O QUE NAO AFIRMA: identidade UUID <-> chave
 * nativa (N4 segue aberto), completude das tabelas filhas (N2-B), nomes de
 * produto, preparo, pronto ou saida. Conciliado nao e estado fisico.
 *
 * PURA: sem relogio, sem I/O. O reconciliador e o instante entram pela chamada.
 */
import { createHmac } from "node:crypto";

import type { JanelaObservada, ModoDaFonte, PedidoObservado } from "../../platform/leitura/demanda-do-gestor";
import type { PedidoNativo, PedidosDoReader } from "../../platform/leitura/pedidos-do-reader";

export const CONCILIACAO_READER_VERSAO = "conciliacao-reader@1";
const ESQUEMA_DO_RECONCILIADOR = "tata.deliveryos.ifood-native-correlation.shadow.v0";
/** Escopo que o reconciliador existente ja fixa para o Itaim. */
const LOJA_IFOOD = "53069";

export type ResultadoDoPedido = "conciliado" | "divergente" | "nao_encontrado" | "ambiguo";

export interface ConciliacaoDoPedido {
  readonly resultado: ResultadoDoPedido;
  readonly detalhe: string;
}

export type ConciliacaoComReader =
  | { readonly estado: "nao_cruzada"; readonly motivo: string }
  | {
      readonly estado: "feita";
      /** Por `ref` do pedido observado. */
      readonly por_pedido: ReadonlyMap<string, ConciliacaoDoPedido>;
      readonly conciliados: number;
      readonly divergentes: number;
      readonly nao_encontrados: number;
      readonly ambiguos: number;
    };

interface Casamento {
  readonly opaqueRef: string;
  readonly itemLines: number;
  readonly itemUnits: number;
  readonly itemRefs: readonly { readonly quantity: number }[];
}
/** O contrato do reconciliador existente, no que este modulo usa dele. */
export type Reconciliador = (entrada: unknown) => {
  readonly status: string;
  readonly reasons: readonly string[];
  readonly matches: readonly Casamento[];
};

/** O dia do pedido no relogio de parede de Sao Paulo — o mesmo do `DTHRABERMESA`. */
function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

const CHAVE = /^0001\|01\|[0-9]{1,12}\|[0-9]{1,12}$/;
const SKU = /^[A-Za-z0-9._-]{1,40}$/;
const CODIGO = /^[A-Z0-9_-]{1,20}$/;

/** O reconciliador recusa a janela inteira por um registro fora do formato. */
function cruzavel(n: PedidoNativo): boolean {
  return !n.retido_pelo_produtor && CHAVE.test(n.chave) && CODIGO.test(n.estado_nativo) &&
    n.linhas.length <= 100 &&
    n.linhas.every((l) => l.quantidade !== null && l.quantidade <= 100 && SKU.test(l.produto) && CODIGO.test(l.estado));
}

const multiconjunto = (qs: readonly number[]): string => [...qs].sort((a, b) => a - b).join(",");

export function conciliarComReader(
  janela: JanelaObservada,
  modo: ModoDaFonte,
  reader: PedidosDoReader,
  dep: { readonly agora_iso: string; readonly reconciliar: Reconciliador; readonly chave_privada_hex: string },
): ConciliacaoComReader {
  if (reader.estado === "nao_configurado")
    return { estado: "nao_cruzada", motivo: "o Reader nao esta configurado nesta maquina" };
  if (reader.estado === "indisponivel")
    return { estado: "nao_cruzada", motivo: `os arquivos do Reader nao puderam ser lidos (${reader.motivo.replace(/_/g, " ")})` };
  if (!/^[a-f0-9]{64}$/i.test(dep.chave_privada_hex))
    return { estado: "nao_cruzada", motivo: "chave local do cruzamento ausente" };

  const por_pedido = new Map<string, ConciliacaoDoPedido>();
  const porDia = new Map<string, PedidoObservado[]>();
  for (const p of janela.pedidos) {
    const d = diaLocal(p.colocado_em ?? p.visto_desde);
    porDia.set(d, [...(porDia.get(d) ?? []), p]);
  }
  const token = (dia: string, curto: string, chave: string): string =>
    createHmac("sha256", Buffer.from(dep.chave_privada_hex, "hex"))
      .update(["ITAIM", dia, curto, chave].join("|")).digest("hex").slice(0, 24);

  for (const [dia, observados] of porDia) {
    const doDia = reader.pedidos.filter((n) => n.dia === dia);
    const usaveis = doDia.filter(cruzavel);
    const ilegiveis = new Set(doDia.filter((n) => !cruzavel(n)).map((n) => n.codigo_curto));
    let casamentos = new Map<string, Casamento>();
    if (usaveis.length > 0) {
      const r = dep.reconciliar({
        schema: ESQUEMA_DO_RECONCILIADOR,
        scope: {
          unit: "ITAIM", day: dia, ifoodStore: LOJA_IFOOD, nativeFilial: "0001", nativeLoja: "01",
          mappingRef: "escopo Itaim confirmado pela gestao", mappingIndependentlyVerified: false,
        },
        ifood: {
          source: "GESTOR_WEB", mode: modo === "real" ? "LIVE_SHADOW" : "SIMULATED", store: LOJA_IFOOD,
          capturedAt: janela.observado_em, sourceAttested: false,
          orders: observados.map((p) => ({ shortId: p.codigo, day: dia, seenAt: p.revisado_em, status: "OBSERVADO" })),
        },
        native: {
          source: "TEKNISA_READER_V2", mode: modo === "real" ? "LIVE_SHADOW" : "SIMULATED",
          filial: "0001", loja: "01", capturedAt: dep.agora_iso, sourceAttested: false,
          orders: usaveis.map((n) => ({
            shortId: n.codigo_curto, day: dia, seenAt: n.observado_em, nativeKey: n.chave,
            revisionHash: n.revisao, origin: "DLV_IFO", nativeStatus: n.estado_nativo,
            items: n.linhas.map((l) => ({
              index: l.indice, productCode: l.produto, quantity: l.quantidade as number, nativeItemStatus: l.estado,
            })),
          })),
        },
        now: dep.agora_iso,
        privateKey: dep.chave_privada_hex,
      });
      // Janela velha, relogio torto ou escopo recusado: nada e cruzado, e o
      // motivo do reconciliador sobe. Nenhum pedido vira "conciliado" por omissao.
      if (r.status !== "CANDIDATES_SHADOW_ONLY" && r.status !== "SIMULATION_ONLY")
        return { estado: "nao_cruzada", motivo: `o reconciliador reteve a janela (${String(r.reasons[0] ?? "sem motivo").toLowerCase().replace(/_/g, " ")})` };
      casamentos = new Map(r.matches.map((m) => [m.opaqueRef, m]));
    }
    for (const p of observados) {
      const candidatos = usaveis.filter((n) => n.codigo_curto === p.codigo);
      const casado = candidatos.length === 1 ? casamentos.get(token(dia, p.codigo, candidatos[0]!.chave)) : undefined;
      if (casado !== undefined) {
        const linhas = p.itens.length;
        const unidades = p.itens.reduce((n, i) => n + i.quantidade, 0);
        const iguais = casado.itemLines === linhas && casado.itemUnits === unidades &&
          multiconjunto(casado.itemRefs.map((x) => x.quantity)) === multiconjunto(p.itens.map((i) => i.quantidade));
        por_pedido.set(p.ref, iguais
          ? { resultado: "conciliado", detalhe: "O Reader tem o mesmo numero no mesmo dia, com as mesmas quantidades por linha." }
          : { resultado: "divergente", detalhe: `O Reader mostra ${String(casado.itemLines)} linha(s) e ${String(casado.itemUnits)} unidade(s); a tela do Gestor mostra ${String(linhas)} e ${String(unidades)}.` });
      } else if (candidatos.length > 1) {
        por_pedido.set(p.ref, { resultado: "ambiguo", detalhe: "O Reader tem mais de um registro com este numero no dia." });
      } else if (ilegiveis.has(p.codigo) || candidatos.length === 1) {
        por_pedido.set(p.ref, { resultado: "ambiguo", detalhe: "O registro do Reader para este numero esta retido ou nao pode ser cruzado." });
      } else {
        por_pedido.set(p.ref, { resultado: "nao_encontrado", detalhe: "O Reader ainda nao tem este numero no dia." });
      }
    }
  }
  const conta = (r: ResultadoDoPedido): number => [...por_pedido.values()].filter((x) => x.resultado === r).length;
  return {
    estado: "feita", por_pedido,
    conciliados: conta("conciliado"), divergentes: conta("divergente"),
    nao_encontrados: conta("nao_encontrado"), ambiguos: conta("ambiguo"),
  };
}
