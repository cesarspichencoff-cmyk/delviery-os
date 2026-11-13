/**
 * DEMANDA OBSERVADA NO GESTOR — porta de leitura do feed local
 * ============================================================================
 * Le, a cada chamada, o arquivo que o executor do sensor escreve
 * (`runtime/reporting/gestor_mounted_demand_feed_v1.cjs`). Mesmo padrao da
 * saude do leitor TATA: arquivo local, mesma maquina, mesmo relogio.
 *
 * O QUE ESTA PORTA GARANTE:
 *   - leitura limitada e estrita: arquivo regular, sem link simbolico, com teto
 *     de tamanho, e cada campo validado e limitado antes de sair daqui;
 *   - ausencia nunca vira zero: sem arquivo, com arquivo velho ou com varredura
 *     retida, o resultado e um ESTADO nomeado, e nunca uma janela vazia;
 *   - o modo (`real` | `simulated`) atravessa intacto. Nada aqui o promove.
 *
 * O QUE ELA NAO AFIRMA: cobertura total, preparo, pronto, saida ou cancelamento.
 * O feed so diz quais pedidos estavam MONTADOS na tela de expedicao.
 */
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FEED_SCHEMA = "deliveryos.gestor-mounted-demand-feed.v1";
export const ARQUIVO_DO_FEED = "gestor-demand-feed-v1.json";
/** O executor escreve a cada 10 s. Mais de quatro ciclos sem escrita = parou. */
export const LIMITE_FEED_PARADO_MS = 45_000;
/** Por quanto tempo uma janela qualificada ainda vale como leitura atual. */
export const LIMITE_JANELA_MS = 90_000;
const TOLERANCIA_DE_RELOGIO_MS = 5_000;
const TETO_DE_BYTES = 4 * 1024 * 1024;

export type ModoDaFonte = "real" | "simulated";

export interface ItemObservado {
  readonly nome: string;
  readonly quantidade: number;
  readonly observacao: string | null;
  readonly opcoes: readonly { readonly nome: string; readonly quantidade: number }[];
  readonly codigo_externo: string | null;
}

export interface PedidoObservado {
  /** Referencia opaca e estavel. Nunca o identificador do provedor. */
  readonly ref: string;
  /** O numero curto que a equipe ja usa para falar do pedido. */
  readonly codigo: string;
  readonly colocado_em: string | null;
  readonly visto_desde: string;
  readonly revisao: string;
  readonly revisao_no: number;
  readonly revisado_em: string;
  /** Alegacao de cabecalho do provedor, OPACA. Nao e estado fisico. */
  readonly alegacao_do_provedor: string | null;
  readonly itens: readonly ItemObservado[];
}

export interface JanelaObservada {
  readonly observado_em: string;
  readonly conteudo_mudou_em: string;
  readonly cartoes: number;
  readonly linhas: number;
  readonly unidades: number;
  readonly pedidos: readonly PedidoObservado[];
}

export type MotivoIndisponivel =
  | "arquivo_ausente"
  | "arquivo_invalido"
  | "contrato_violado"
  | "relogio_adiantado"
  | "janela_inconsistente";

export type DemandaDoGestor =
  | { readonly estado: "nao_configurada" }
  | { readonly estado: "indisponivel"; readonly motivo: MotivoIndisponivel }
  | { readonly estado: "parada"; readonly modo: ModoDaFonte; readonly escrito_em: string; readonly idade_ms: number }
  | {
      readonly estado: "retida";
      readonly modo: ModoDaFonte;
      readonly motivo: string;
      readonly escrito_em: string;
      readonly ultima_janela_em: string | null;
    }
  | {
      readonly estado: "observada";
      readonly modo: ModoDaFonte;
      readonly escrito_em: string;
      readonly sequencia: number;
      readonly idade_da_janela_ms: number;
      /** Motivo da retencao em curso, quando a janela mostrada e a ultima boa. */
      readonly em_retencao: string | null;
      readonly pagina_oculta: boolean | null;
      readonly janela: JanelaObservada;
    };

const INSTANTE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const HEX32 = /^[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const CODIGO_EXTERNO = /^(?:\d{10}|\d\.\d{2}\.\d{2}\.\d{3}\.\d{2})$/;

const objeto = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const instante = (x: unknown): number | null => {
  if (typeof x !== "string" || !INSTANTE.test(x)) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
};
const inteiro = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max;
const texto = (x: unknown, max: number): x is string =>
  typeof x === "string" && x.length >= 1 && x.length <= max && x.trim() === x &&
  !/[\u0000-\u001f\u007f]/.test(x);

function validarJanela(bruto: unknown, escritoMs: number): JanelaObservada | null {
  if (!objeto(bruto)) return null;
  const observado = instante(bruto["observed_at"]);
  const mudou = instante(bruto["content_changed_at"]);
  if (observado === null || mudou === null || mudou > observado ||
      observado > escritoMs + TOLERANCIA_DE_RELOGIO_MS) return null;
  const ordens = bruto["orders"];
  if (!Array.isArray(ordens) || !inteiro(bruto["visible_cards"], 1, 200) ||
      ordens.length !== bruto["visible_cards"] ||
      !inteiro(bruto["lines"], 1, 20_000) || !inteiro(bruto["units"], 1, 4_000_000)) return null;
  const refs = new Set<string>(), codigos = new Set<string>();
  const pedidos: PedidoObservado[] = [];
  let linhas = 0, unidades = 0;
  for (const o of ordens) {
    if (!objeto(o)) return null;
    const ref = o["ref"], codigo = o["short_code"], revisao = o["revision"];
    const visto = instante(o["first_seen_at"]), revisado = instante(o["revised_at"]);
    const colocado = o["placed_at"] === null ? null : instante(o["placed_at"]);
    const alegacao = o["status_claim"];
    if (typeof ref !== "string" || !HEX32.test(ref) || refs.has(ref) ||
        typeof codigo !== "string" || !/^\d{4}$/.test(codigo) || codigos.has(codigo) ||
        typeof revisao !== "string" || !HEX64.test(revisao) ||
        !inteiro(o["revision_no"], 1, 100_000) ||
        visto === null || revisado === null || visto > revisado || revisado > observado ||
        (o["placed_at"] !== null && colocado === null) ||
        !(alegacao === null || (typeof alegacao === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(alegacao))))
      return null;
    refs.add(ref); codigos.add(codigo);
    const brutos = o["items"];
    if (!Array.isArray(brutos) || brutos.length < 1 || brutos.length > 100) return null;
    const itens: ItemObservado[] = [];
    for (const i of brutos) {
      if (!objeto(i) || !texto(i["name"], 100) || !inteiro(i["quantity"], 1, 200) ||
          !(i["note"] === null || texto(i["note"], 1200)) ||
          !(i["external_code"] === null ||
            (typeof i["external_code"] === "string" && CODIGO_EXTERNO.test(i["external_code"]))) ||
          !Array.isArray(i["options"]) || i["options"].length > 30) return null;
      const opcoes: { nome: string; quantidade: number }[] = [];
      for (const op of i["options"] as unknown[]) {
        if (!objeto(op) || !texto(op["name"], 100) || !inteiro(op["quantity"], 1, 200)) return null;
        opcoes.push({ nome: op["name"], quantidade: op["quantity"] });
      }
      itens.push({
        nome: i["name"], quantidade: i["quantity"],
        observacao: i["note"] as string | null, opcoes,
        codigo_externo: i["external_code"] as string | null,
      });
      linhas += 1; unidades += i["quantity"];
    }
    pedidos.push({
      ref, codigo, colocado_em: colocado === null ? null : (o["placed_at"] as string),
      visto_desde: o["first_seen_at"] as string, revisao, revisao_no: o["revision_no"] as number,
      revisado_em: o["revised_at"] as string, alegacao_do_provedor: alegacao as string | null, itens,
    });
  }
  // Os agregados do executor precisam fechar com o que ele entregou.
  if (linhas !== bruto["lines"] || unidades !== bruto["units"]) return null;
  return {
    observado_em: bruto["observed_at"] as string,
    conteudo_mudou_em: bruto["content_changed_at"] as string,
    cartoes: ordens.length, linhas, unidades, pedidos,
  };
}

/** Valida um feed ja lido. PURA: o relogio entra pela chamada. */
export function validarFeedDoGestor(bruto: unknown, agoraMs: number): DemandaDoGestor {
  const invalido: DemandaDoGestor = { estado: "indisponivel", motivo: "arquivo_invalido" };
  if (!objeto(bruto) || bruto["schema"] !== FEED_SCHEMA) return invalido;
  const modo = bruto["source_mode"];
  if (modo !== "real" && modo !== "simulated") return invalido;
  const escrito = instante(bruto["written_at"]);
  const varredura = bruto["scan"];
  if (escrito === null || !inteiro(bruto["sequence"], 1, Number.MAX_SAFE_INTEGER) || !objeto(varredura))
    return invalido;
  // O contrato do executor, conferido e nao presumido.
  if (bruto["coverage"] !== "MOUNTED_CARDS_ONLY" || bruto["physical_state_claimed"] !== false ||
      bruto["disappearance_means_cancellation"] !== false || bruto["customer_data_exported"] !== false ||
      bruto["actions_executed"] !== 0)
    return { estado: "indisponivel", motivo: "contrato_violado" };
  const idade = agoraMs - escrito;
  if (idade < -TOLERANCIA_DE_RELOGIO_MS) return { estado: "indisponivel", motivo: "relogio_adiantado" };
  const escrito_em = bruto["written_at"] as string;
  if (idade > LIMITE_FEED_PARADO_MS) return { estado: "parada", modo, escrito_em, idade_ms: idade };

  const estado = varredura["state"], motivo = varredura["reason"];
  const retido = estado === "HOLD";
  if (!(estado === "OBSERVED" && motivo === null) &&
      !(retido && typeof motivo === "string" && /^[A-Z0-9_]{1,80}$/.test(motivo))) return invalido;
  let janela: JanelaObservada | null = null;
  if (bruto["window"] !== null) {
    janela = validarJanela(bruto["window"], escrito);
    if (janela === null) return { estado: "indisponivel", motivo: "janela_inconsistente" };
  }
  if (janela === null) {
    if (!retido) return { estado: "indisponivel", motivo: "janela_inconsistente" };
    return { estado: "retida", modo, motivo: motivo as string, escrito_em, ultima_janela_em: null };
  }
  const idadeDaJanela = agoraMs - Date.parse(janela.observado_em);
  if (idadeDaJanela > LIMITE_JANELA_MS)
    return {
      estado: "retida", modo, motivo: retido ? (motivo as string) : "JANELA_VELHA",
      escrito_em, ultima_janela_em: janela.observado_em,
    };
  const borda = objeto(bruto["edge"]) ? bruto["edge"]["page_visibility"] : null;
  return {
    estado: "observada", modo, escrito_em, sequencia: bruto["sequence"] as number,
    idade_da_janela_ms: Math.max(0, idadeDaJanela),
    em_retencao: retido ? (motivo as string) : null,
    pagina_oculta: borda === "hidden" ? true : borda === "visible" ? false : null,
    janela,
  };
}

/** Le o feed do diretorio configurado. `null` = fonte nao configurada. */
export function lerDemandaDoGestor(dir: string | null, agoraMs: number): DemandaDoGestor {
  if (dir === null || dir.trim() === "") return { estado: "nao_configurada" };
  const arquivo = join(dir, ARQUIVO_DO_FEED);
  let cru: string;
  try {
    const st = lstatSync(arquivo);
    if (!st.isFile() || st.isSymbolicLink() || st.size > TETO_DE_BYTES)
      return { estado: "indisponivel", motivo: "arquivo_invalido" };
    cru = readFileSync(arquivo, "utf8");
  } catch {
    return { estado: "indisponivel", motivo: "arquivo_ausente" };
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(cru.replace(/^\uFEFF/, ""));
  } catch {
    // Escrita atomica: um JSON partido nao e esperado, e nao e adivinhado.
    return { estado: "indisponivel", motivo: "arquivo_invalido" };
  }
  return validarFeedDoGestor(bruto, agoraMs);
}
