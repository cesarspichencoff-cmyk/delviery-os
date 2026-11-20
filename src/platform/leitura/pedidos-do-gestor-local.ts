/**
 * PEDIDOS DO GESTOR (local) — o que o proprio aplicativo "Gestor de Pedidos" do iFood ja gravou no
 * disco do caixa (Local Storage do Electron), lido SEM tocar no aplicativo: sem janela, sem clique,
 * sem DevTools, sem chamada de API, sem token.
 *
 * Medido em 15/11 no CAIXA_MOOCA (docs/execution/READER_V3_GESTOR_CONCILIACAO_20261115.md): o
 * aplicativo guarda `order/<uuid>` com o pedido inteiro (itens, opcoes, observacao por item, horarios
 * e a linha do tempo oficial de eventos) para os pedidos retidos na janela local, cuja cobertura
 * pode variar. `orderIds` armazena somente identificadores.
 *
 * PRIVACIDADE, por construcao:
 *  - so as chaves `order/<uuid>` e `orderIds` da origem do Gestor sao decodificadas; qualquer outra
 *    (inclusive a que guarda o token do usuario) nao e nem copiada para a memoria;
 *  - do pedido saem so campos operacionais. Cliente, endereco, documento, telefone, pagamento,
 *    valores, localizador, codigo de retirada, nome e identidade do entregador e nota de entrega
 *    (pode ter endereco) NUNCA saem deste modulo — a nota vira so um booleano.
 */
import { isAbsolute, join, resolve } from "node:path";
import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { estadoDaPasta } from "./leveldb-somente-leitura";

const ORIGEM = "_https://gestordepedidos.ifood.com.br\u0000\u0001";
const CHAVE_PEDIDO = /^order\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Z][A-Z0-9_]{1,60}$/;
const MAX_PEDIDOS = 400;

export interface OpcaoDoGestor { readonly codigo_externo: string | null; readonly nome: string; readonly grupo: string | null; readonly quantidade: number }
export interface ItemDoGestor {
  readonly codigo_externo: string | null;
  readonly nome: string;
  readonly quantidade: number;
  /** Texto que o cliente escreveu no item; `null` quando nao ha. */
  readonly observacao: string | null;
  readonly opcoes: readonly OpcaoDoGestor[];
}
export interface PedidoDoGestor {
  /** UUID do iFood: so para casar entre leituras deste processo; nunca vai para a tela. */
  readonly id_interno: string;
  readonly codigo_curto: string;
  readonly categoria: string | null;
  readonly ultimo_evento: string | null;
  readonly tipo: string | null;
  readonly entrega_por: string | null;
  readonly agendado: boolean;
  readonly teste: boolean;
  readonly criado_em: string;
  readonly inicio_do_preparo: string | null;
  readonly tempo_de_preparo_s: number | null;
  readonly entrega_prevista: string | null;
  /** Codigo do evento oficial -> instante. So o instante: metadados (entregador etc.) nunca saem. */
  readonly eventos: Readonly<Record<string, string>>;
  readonly itens: readonly ItemDoGestor[];
  readonly itens_cancelados: number;
  readonly itens_alterados: number;
  readonly tem_nota_de_entrega: boolean;
}
export type PedidosDoGestorLocal =
  | { readonly estado: "nao_configurado" }
  | { readonly estado: "indisponivel"; readonly motivo: string }
  | {
      readonly estado: "lido";
      readonly lido_em: string;
      /** Ultima escrita do aplicativo no armazenamento (mtime mais novo da pasta). */
      readonly gravado_em: string | null;
      readonly pedidos: readonly PedidoDoGestor[];
      readonly ids_na_lista: number;
      readonly descartados: number;
      readonly duracao_ms: number;
    };

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);
const cod = (v: unknown): string | null => (typeof v === "string" && CODIGO.test(v) ? v : null);
const externo = (v: unknown): string | null => (typeof v === "string" && /^[0-9A-Za-z|._-]{1,40}$/.test(v.trim()) ? v.trim() : null);

function decodificar(v: Buffer): unknown {
  const t = v[0] === 0 ? v.subarray(1).toString("utf16le") : v[0] === 1 ? v.subarray(1).toString("latin1") : null;
  if (t === null) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

/** Projeta o pedido bruto do aplicativo SO nos campos operacionais. Pedido sem o minimo -> null. */
export function pedidoOperacional(o: unknown): PedidoDoGestor | null {
  if (!obj(o) || typeof o["id"] !== "string" || !/^[0-9a-f-]{36}$/i.test(o["id"])) return null;
  const d = obj(o["details"]) ? o["details"] : {};
  const curto = typeof d["shortReference"] === "string" && /^[0-9A-Za-z]{1,12}$/.test(d["shortReference"]) ? d["shortReference"] : null;
  const criado = iso(d["createdAt"]);
  if (curto === null || criado === null || !Array.isArray(o["items"])) return null;
  const hist = obj(o["history"]) ? o["history"] : {};
  const evs = obj(hist["events"]) ? hist["events"] : {};
  const eventos: Record<string, string> = {};
  for (const [k, e] of Object.entries(evs)) { const quando = obj(e) ? iso(e["createdAt"]) : null; if (CODIGO.test(k) && quando) eventos[k] = quando; }
  const itens: ItemDoGestor[] = [];
  for (const it of o["items"] as unknown[]) {
    if (!obj(it)) return null;
    const nome = txt(it["name"], 160); const q = num(it["quantity"]);
    if (nome === null || q === null || q <= 0) return null;
    const opcoes: OpcaoDoGestor[] = [];
    for (const op of Array.isArray(it["options"]) ? it["options"] : []) {
      if (!obj(op)) continue;
      const on = txt(op["name"], 160); const oq = num(op["quantity"]);
      if (on === null || oq === null) continue;
      opcoes.push({ codigo_externo: externo(op["externalCode"]), nome: on, grupo: txt(op["groupName"], 120), quantidade: oq });
    }
    itens.push({ codigo_externo: externo(it["externalCode"]), nome, quantidade: q, observacao: txt(it["observations"], 300), opcoes });
  }
  return {
    id_interno: o["id"].toLowerCase(), codigo_curto: curto, categoria: cod(o["category"]), ultimo_evento: cod(hist["lastStatusEventCode"]),
    tipo: cod(d["type"]), entrega_por: cod(d["deliveryBy"]), agendado: d["scheduled"] === true, teste: d["isTest"] === true,
    criado_em: criado, inicio_do_preparo: iso(d["preparationStartDateTime"]), tempo_de_preparo_s: num(d["preparationTimeInSeconds"]),
    entrega_prevista: iso(d["deliveryDateTime"]), eventos, itens,
    itens_cancelados: Array.isArray(o["cancelledItemsIds"]) ? o["cancelledItemsIds"].length : 0,
    itens_alterados: Array.isArray(o["changedItems"]) ? o["changedItems"].length : 0,
    tem_nota_de_entrega: typeof d["deliveryNotes"] === "string" && d["deliveryNotes"].trim() !== "",
  };
}

/** `raiz`: pasta de dados do aplicativo (ex.: C:\Users\<conta>\AppData\Roaming\Gestor de Pedidos). */
export function lerPedidosDoGestorLocal(raiz: string | null, agora: Date = new Date()): PedidosDoGestorLocal {
  const t0 = Date.now();
  if (raiz === null || raiz.trim() === "") return { estado: "nao_configurado" };
  if (!isAbsolute(raiz)) return { estado: "indisponivel", motivo: "caminho_invalido" };
  const dir = join(raiz, "Local Storage", "leveldb");
  try {
    for (const p of [raiz, join(raiz, "Local Storage"), dir]) {
      const st = lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(p) !== resolve(p)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    }
  } catch { return { estado: "indisponivel", motivo: "caminho_invalido" }; }
  let registros;
  try {
    registros = estadoDaPasta(dir, (k) => {
      const s = k.toString("latin1");
      if (!s.startsWith(ORIGEM)) return false;
      const resto = s.slice(ORIGEM.length);
      return resto === "orderIds" || CHAVE_PEDIDO.test(resto);
    });
  } catch { return { estado: "indisponivel", motivo: "armazenamento_ilegivel" }; }
  let gravado = 0;
  try { for (const f of readdirSync(dir)) { const m = statSync(join(dir, f)).mtimeMs; if (m > gravado) gravado = m; } } catch { /* sem data */ }
  const pedidos: PedidoDoGestor[] = []; let ids = 0, descartados = 0;
  for (const [k, r] of registros) {
    if (r.tipo !== 1 || r.valor === null) continue;
    const v = decodificar(r.valor);
    if (k.endsWith("orderIds")) { ids = Array.isArray(v) ? v.length : 0; continue; }
    const p = pedidoOperacional(v);
    if (p === null || p.teste) { descartados++; continue; }
    if (pedidos.length < MAX_PEDIDOS) pedidos.push(p);
  }
  pedidos.sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0));
  return { estado: "lido", lido_em: agora.toISOString(), gravado_em: gravado ? new Date(gravado).toISOString() : null,
    pedidos, ids_na_lista: ids, descartados, duracao_ms: Date.now() - t0 };
}
