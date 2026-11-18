/**
 * PEDIDOS DO READER — leitura estreita para CONCILIACAO, e so para ela
 * ============================================================================
 * Le as revisoes estaveis que o Reader da Teknisa ja grava no disco do caixa
 * (`state/reader-watch-checkpoint-v1.json` + `state/reader-events-v1/`), com as
 * mesmas travas de arquivo do feed existente (`copiloto_tata_file_feed_v1.cjs`):
 * diretorio real, arquivo regular, sem link simbolico, com teto, e o evento
 * precisa bater com a chave e o hash do checkpoint.
 *
 * POR QUE NAO REUSAR O FEED EXISTENTE: a projecao dele descarta o numero curto
 * do iFood (`NRCOMANDAEXT`), que e exatamente a chave do cruzamento com a tela
 * do Gestor. Aqui sai so o que o cruzamento usa: identidade de quatro partes,
 * numero curto, dia, revisao e linhas (codigo + quantidade).
 *
 * O QUE ISTO NAO E: nao e fonte de pedido para a Home, nao e prova de
 * completude das tabelas filhas (N2-B continua aberto) e nao le observacao,
 * cliente, preco ou endereco. Um pedido que o proprio Reader declara retido
 * (`ready_for_downstream_shadow === false` ou `blockers`) sai marcado, e nunca
 * sustenta conciliacao.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const TETO_DE_ARQUIVO = 1_048_576;
const TETO_TOTAL = 8 * 1024 * 1024;
const MAX_ENTRADAS = 250;

export interface LinhaNativa {
  readonly indice: number;
  readonly produto: string;
  /** Inteiro positivo, ou `null` quando a quantidade nativa nao e inteira. */
  readonly quantidade: number | null;
  readonly estado: string;
}

export interface PedidoNativo {
  /** `filial|loja|venda|comanda` — a identidade nativa de quatro partes. */
  readonly chave: string;
  readonly codigo_curto: string;
  /** Dia de abertura, no relogio de parede do caixa (`AAAA-MM-DD`). */
  readonly dia: string;
  readonly observado_em: string;
  readonly revisao: string;
  readonly estado_nativo: string;
  /** O proprio Reader declarou esta revisao retida. */
  readonly retido_pelo_produtor: boolean;
  readonly linhas: readonly LinhaNativa[];
}

export type MotivoReaderIndisponivel =
  | "caminho_invalido"
  | "checkpoint_ausente"
  | "checkpoint_invalido"
  | "evento_invalido"
  | "teto_excedido";

export type PedidosDoReader =
  | { readonly estado: "nao_configurado" }
  | { readonly estado: "indisponivel"; readonly motivo: MotivoReaderIndisponivel }
  | {
      readonly estado: "lido";
      readonly pedidos: readonly PedidoNativo[];
      /** Entradas do checkpoint fora do escopo Itaim/iFood, ignoradas. */
      readonly fora_do_escopo: number;
    };

const objeto = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown, max = 64): x is string =>
  typeof x === "string" && x.length >= 1 && x.length <= max && x.trim() === x && !/[\u0000-\u001f\u007f]/.test(x);

function lerArquivo(caminho: string, teto: number): string | null {
  try {
    const st = lstatSync(caminho);
    if (!st.isFile() || st.isSymbolicLink() || st.size > teto) return null;
    return readFileSync(caminho, "utf8").replace(/^﻿/, "");
  } catch {
    return null;
  }
}

function dia(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}/.exec(x);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === mo && dt.getUTCDate() === d
    ? `${m[1]!}-${m[2]!}-${m[3]!}`
    : null;
}

/** Le as revisoes estaveis do Reader para o escopo Itaim (0001/01) e origem iFood. */
export function lerPedidosDoReader(raiz: string | null): PedidosDoReader {
  if (raiz === null || raiz.trim() === "") return { estado: "nao_configurado" };
  const estado = join(raiz, "state");
  const eventos = join(estado, "reader-events-v1");
  try {
    if (!isAbsolute(raiz)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    for (const p of [raiz, estado, eventos]) {
      const st = lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(p) !== resolve(p))
        return { estado: "indisponivel", motivo: "caminho_invalido" };
    }
  } catch {
    return { estado: "indisponivel", motivo: "caminho_invalido" };
  }
  const cru = lerArquivo(join(estado, "reader-watch-checkpoint-v1.json"), TETO_DE_ARQUIVO);
  if (cru === null) return { estado: "indisponivel", motivo: "checkpoint_ausente" };
  let ck: unknown;
  try { ck = JSON.parse(cru); } catch { return { estado: "indisponivel", motivo: "checkpoint_invalido" }; }
  if (!objeto(ck) || ck["schema"] !== "deliveryos.tata-reader-continuous-checkpoint.v1" ||
      ck["bootstrap_complete"] !== true || !Array.isArray(ck["entries"]) || ck["entries"].length > MAX_ENTRADAS)
    return { estado: "indisponivel", motivo: "checkpoint_invalido" };

  const pedidos: PedidoNativo[] = [];
  const vistas = new Set<string>();
  let fora = 0, bytes = cru.length;
  for (const e of ck["entries"] as unknown[]) {
    if (!objeto(e) || typeof e["order_key"] !== "string" || e["order_key"].length > 512)
      return { estado: "indisponivel", motivo: "checkpoint_invalido" };
    const partes = e["order_key"].split("|");
    if (partes.length !== 4 || partes.some((p) => p === ""))
      return { estado: "indisponivel", motivo: "checkpoint_invalido" };
    if (partes[0] !== "0001" || partes[1] !== "01") { fora += 1; continue; }
    const hash = e["snapshot_hash"];
    // O Reader instalado ja gravou o hash em maiusculas; o arquivo usa a mesma grafia.
    if (typeof hash !== "string" || !/^[A-Fa-f0-9]{64}$/.test(hash) || e["emitted_hash"] !== hash ||
        vistas.has(e["order_key"]))
      return { estado: "indisponivel", motivo: "checkpoint_invalido" };
    vistas.add(e["order_key"]);
    const arquivo = join(eventos, `${partes[3]!.replace(/[^0-9A-Za-z_-]/g, "_")}_${hash}.json`);
    const bruto = lerArquivo(arquivo, TETO_DE_ARQUIVO);
    if (bruto === null) return { estado: "indisponivel", motivo: "evento_invalido" };
    bytes += bruto.length;
    if (bytes > TETO_TOTAL) return { estado: "indisponivel", motivo: "teto_excedido" };
    let ev: unknown;
    try { ev = JSON.parse(bruto); } catch { return { estado: "indisponivel", motivo: "evento_invalido" }; }
    const o = objeto(ev) ? ev["order"] : null;
    if (!objeto(ev) || ev["schema"] !== "deliveryos.tata-reader-stable-order-event.v1" || !objeto(o) ||
        ev["order_key"] !== e["order_key"] || ev["snapshot_hash"] !== hash ||
        [o["CDFILIAL"], o["CDLOJA"], o["NRVENDAREST"], o["NRCOMANDA"]].some((v, i) => v !== partes[i]))
      return { estado: "indisponivel", motivo: "evento_invalido" };
    if (o["IDORGCMDVENDA"] !== "DLV_IFO") { fora += 1; continue; }
    const aberto = dia(o["DTHRABERMESA"]);
    const observado = typeof ev["observed_at"] === "string" ? Date.parse(ev["observed_at"]) : Number.NaN;
    const itens = o["items"];
    if (aberto === null || !Number.isFinite(observado) || typeof o["NRCOMANDAEXT"] !== "string" ||
        !/^\d{4}$/.test(o["NRCOMANDAEXT"]) || !texto(o["IDSTCOMANDA"], 20) ||
        !Array.isArray(itens) || itens.length < 1 || itens.length > 200)
      return { estado: "indisponivel", motivo: "evento_invalido" };
    const linhas: LinhaNativa[] = [];
    for (const [i, item] of (itens as unknown[]).entries()) {
      if (!objeto(item) || !texto(item["CDPRODUTO"], 40) || !texto(item["IDSTPRCOMVEN"], 20))
        return { estado: "indisponivel", motivo: "evento_invalido" };
      const q = item["QTPRODCOMVEN"];
      const inteiro = typeof q === "string" && /^0*[1-9]\d*(?:\.0+)?$/.test(q) && Number.isSafeInteger(Number(q));
      linhas.push({
        indice: i + 1, produto: item["CDPRODUTO"],
        quantidade: inteiro ? Number(q) : null, estado: item["IDSTPRCOMVEN"],
      });
    }
    pedidos.push({
      chave: e["order_key"], codigo_curto: o["NRCOMANDAEXT"], dia: aberto,
      observado_em: new Date(observado).toISOString(), revisao: hash.toLowerCase(),
      estado_nativo: o["IDSTCOMANDA"] as string,
      retido_pelo_produtor: ev["ready_for_downstream_shadow"] === false ||
        (Array.isArray(ev["blockers"]) && ev["blockers"].length > 0),
      linhas,
    });
  }
  return { estado: "lido", pedidos, fora_do_escopo: fora };
}
