/**
 * PEDIDOS REAIS DO READER — a leitura da Teknisa que a Home do gerente mostra (Reader V3, camada 1)
 * ============================================================================
 * Le, SO LEITURA, o que o Reader instalado ja grava no caixa: o checkpoint (a revisao mais recente de
 * cada pedido recente, ate 250 — a propria marca d'agua do Reader, sem varrer os milhares de eventos)
 * e o evento estavel de cada revisao. Nada de SQL, nada de escrita, nenhum processo do Reader tocado.
 *
 * O QUE MUDA EM RELACAO AO READER INSTALADO (ver docs/execution/READER_V3_DIAGNOSTICO_20261115.md):
 *  - TURNO pela POLITICA SEMANAL (bin\production-service-weekly-policy.json) + hora nativa de abertura,
 *    nao pelo arquivo de estado manual parado em 14/10. Um bloqueio do produtor que e SO de estado de
 *    turno fica SUBSTITUIDO quando a politica resolve o turno — e isso fica registrado no pedido.
 *    Qualquer outro bloqueio continua valendo e retem o pedido.
 *  - ESCOPO operacional do Itaim igual ao do watcher: 0001/01, origem DLV_* (iFood e as demais).
 *  - COMPLETUDE declarada por campo: itens e quantidades observados; observacoes so quando o Reader
 *    declarou a varredura completa e TODAS as ligacoes provadas; componentes de combinado e
 *    complementos "nao_lidos_pela_fonte" (o watcher instalado nao le essas tabelas). Ausente nunca
 *    vira vazio.
 *
 * O QUE ISTO NAO E: nao prova que a Teknisa concluiu semanticamente o pedido (revisao estavel do
 * Reader nao e conclusao do escritor), nao interpreta o estado nativo X como cancelamento, nao
 * exporta nada do caixa.
 */
import { isAbsolute, join, resolve } from "node:path";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";

const TETO_DE_ARQUIVO = 1_048_576;
const TETO_TOTAL = 16 * 1024 * 1024;
const MAX_ENTRADAS = 250;

/** Bloqueios do produtor que dizem respeito SO ao arquivo de estado de turno (manual). */
export const BLOQUEIOS_DE_TURNO = new Set([
  "SERVICE_STATE_EXPIRED_FOR_ORDER", "SERVICE_STATE_DATE_MISMATCH_ORDER_DATE", "SERVICE_STATE_MISSING",
  "SERVICE_STATE_SCHEMA_MISMATCH", "SERVICE_STATE_EVIDENCE_REQUIRED", "SERVICE_STATE_VALID_UNTIL_REQUIRED",
  "SERVICE_STATE_READ_FAILED", "BACKFILL_SERVICE_UNRESOLVED_PRE_18H",
]);
const CODIGO = /^[A-Z][A-Z0-9_]{2,80}$/;

export type Turno = "ALMOCO" | "JANTAR" | "FORA_DO_HORARIO" | "SEM_POLITICA";


export interface ItemReal {
  readonly indice: number;
  readonly codigo: string;
  /**
   * CDARVPROD da linha. Medido em 15/11 contra 22 pedidos reais: e o `externalCode` que o iFood
   * mostra no Gestor (o CDPRODUTO nao e). `null` quando a linha nao o traz.
   */
  readonly codigo_arvore: string | null;
  /** Nome que o proprio Reader atribuiu (decisao); `null` quando nao ha. */
  readonly nome: string | null;
  /** Inteiro positivo, ou `null` quando a quantidade nativa nao e inteira. */
  readonly quantidade: number | null;
  readonly quantidade_nativa: string;
  readonly estado_nativo: string;
  /** Observacoes PROVADAS deste item; `null` quando a fonte nao as leu. */
  readonly observacoes: readonly string[] | null;
}

export interface PedidoReal {
  readonly chave: string;
  readonly codigo_curto: string | null;
  readonly origem: string;
  /** Abertura no relogio de parede do caixa, como a Teknisa gravou. */
  readonly aberto_em_local: string;
  readonly dia: string;
  readonly turno: Turno;
  readonly revisao: string;
  readonly observado_em: string;
  readonly estado_nativo: string;
  readonly retido: boolean;
  /** Codigos que AINDA retem (nunca texto livre). */
  readonly motivos_de_retencao: readonly string[];
  /** Bloqueios de turno do produtor que a politica semanal resolveu. */
  readonly bloqueios_de_turno_substituidos: readonly string[];
  readonly itens: readonly ItemReal[];
  /** Observacoes PROVADAS do pedido inteiro; `null` quando a fonte nao as leu. */
  readonly observacoes_do_pedido: readonly string[] | null;
  readonly completude: {
    readonly itens: "observados";
    /** Nunca "completas": as tabelas filhas de observacao nao sao lidas pela fonte instalada. */
    readonly observacoes: "campos_de_texto_lidos" | "nao_lidas_pela_fonte" | "parcial";
    readonly observacoes_por_ocorrencia: "nao_lidas_pela_fonte";
    readonly componentes: "nao_lidos_pela_fonte";
    readonly complementos: "nao_lidos_pela_fonte";
  };
}

export type PedidosReaisDoReader =
  | { readonly estado: "nao_configurado" }
  | { readonly estado: "indisponivel"; readonly motivo: string }
  | {
      readonly estado: "lido";
      readonly lido_em: string;
      readonly politica: { readonly versao: string | null; readonly valida: boolean };
      readonly pedidos: readonly PedidoReal[];
      readonly fora_do_escopo: number;
      readonly invalidos: number;
      readonly bytes_lidos: number;
      readonly duracao_ms: number;
    };

const objeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown, max = 64): x is string =>
  typeof x === "string" && x.length >= 1 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);

function lerArquivo(caminho: string, teto: number): string | null {
  try {
    const st = lstatSync(caminho);
    if (!st.isFile() || st.isSymbolicLink() || st.size > teto) return null;
    return readFileSync(caminho, "utf8").replace(/^﻿/, "");
  } catch { return null; }
}
const json = (s: string | null): unknown => { if (s === null) return null; try { return JSON.parse(s); } catch { return null; } };

interface Janela { turno: "ALMOCO" | "JANTAR"; inicio: number; fim: number }
interface Politica { versao: string; desde: string; ate: string | null; semana: Map<number, Janela[]> }

const minutos = (hhmm: unknown): number | null => {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** A politica semanal do Reader, validada. `null` = sem politica utilizavel (nunca adivinha turno). */
export function lerPolitica(raiz: string): Politica | null {
  const p = json(lerArquivo(join(raiz, "bin", "production-service-weekly-policy.json"), 65_536));
  if (!objeto(p) || p["schema"] !== "deliveryos.production-service-weekly-policy.v1" || p["enabled"] !== true ||
      p["source_unit_id"] !== "0001" || p["source_store_id"] !== "01" || p["order_time_basis"] !== "NATIVE_DTHRABERMESA_LOCAL" ||
      p["boundary"] !== "START_INCLUSIVE_END_EXCLUSIVE" || !texto(p["policy_version"], 80) ||
      typeof p["effective_from"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p["effective_from"]) || !Array.isArray(p["week"]))
    return null;
  const semana = new Map<number, Janela[]>();
  for (const d of p["week"] as unknown[]) {
    if (!objeto(d) || !Number.isInteger(d["day_of_week"]) || (d["day_of_week"] as number) < 0 || (d["day_of_week"] as number) > 6 || !Array.isArray(d["windows"])) return null;
    const js: Janela[] = [];
    for (const w of d["windows"] as unknown[]) {
      if (!objeto(w)) return null;
      const ini = minutos(w["start"]), fim = minutos(w["end"]);
      const turno = w["service"] === "LUNCH" ? "ALMOCO" : w["service"] === "DINNER" ? "JANTAR" : null;
      if (ini === null || fim === null || fim <= ini || turno === null) return null;
      js.push({ turno, inicio: ini, fim });
    }
    semana.set(d["day_of_week"] as number, js);
  }
  const ate = p["effective_until"];
  return { versao: p["policy_version"] as string, desde: p["effective_from"] as string,
    ate: typeof ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : null, semana };
}

/** Turno pela politica e pela hora NATIVA de abertura (relogio de parede da Teknisa, sem fuso). */
export function turnoDe(politica: Politica | null, abertoLocal: string): Turno {
  if (!politica) return "SEM_POLITICA";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(abertoLocal);
  if (!m) return "SEM_POLITICA";
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  if (dia < politica.desde || (politica.ate !== null && dia > politica.ate)) return "SEM_POLITICA";
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  const min = Number(m[4]) * 60 + Number(m[5]);
  const j = (politica.semana.get(dow) ?? []).find((x) => min >= x.inicio && min < x.fim);
  return j ? j.turno : "FORA_DO_HORARIO";
}

/** Nomes que o proprio Reader deu aos produtos desta revisao (decisao do consumidor sombra). */
function nomesDaDecisao(raiz: string, nomeDoEvento: string): Map<string, string> {
  const d = json(lerArquivo(join(raiz, "state", "reader-shadow-decisions-v1", nomeDoEvento.replace(/\.json$/i, ".decision.json")), TETO_DE_ARQUIVO));
  const nomes = new Map<string, string>();
  if (objeto(d) && Array.isArray(d["items"]))
    for (const it of d["items"] as unknown[])
      if (objeto(it) && texto(it["CDPRODUTO"], 40) && texto(it["product_name"], 120)) nomes.set(it["CDPRODUTO"], it["product_name"]);
  return nomes;
}

/**
 * Observacoes do evento. So valem quando o Reader declarou a varredura COMPLETA e cada linha tem a
 * ligacao provada; o resto e "parcial" (ha linha, mas nao da para dizer que e tudo) ou "nao lidas".
 */
function observacoes(o: Record<string, unknown>, nItens: number) {
  const linhas = Array.isArray(o["observation_rows"]) ? (o["observation_rows"] as unknown[]).filter(objeto) : null;
  if (linhas === null) return { estado: "nao_lidas_pela_fonte" as const, pedido: null, porItem: null };
  const todasProvadas = linhas.every((l) => l["join_proven"] === true && texto(l["value"], 500));
  const completa = o["observation_scan_complete"] === true && todasProvadas;
  const pedido: string[] = [];
  const porItem: string[][] = Array.from({ length: nItens }, () => []);
  for (const l of linhas) {
    if (!texto(l["value"], 500)) continue;
    const idx = Number(l["item_index"]);
    if (Number.isInteger(idx) && idx >= 1 && idx <= nItens) porItem[idx - 1]!.push(l["value"] as string);
    else pedido.push(l["value"] as string);
  }
  // `observation_scan_complete=true` e AUTODECLARADO pelo Reader, e a consulta instalada so le as
  // colunas de texto de ITCOMANDAVEN, nunca OBSITCOMANDAVEN/OBSITCOMANDAEST/OCORRENCIA (medido no
  // codigo instalado em 15/11). Logo, nem "completa" vira "observadas": vira "campos_de_texto_lidos".
  return completa
    ? { estado: "campos_de_texto_lidos" as const, pedido, porItem }
    : { estado: "parcial" as const, pedido, porItem };
}

export function lerPedidosReaisDoReader(raiz: string | null, agora: Date = new Date()): PedidosReaisDoReader {
  const t0 = Date.now();
  if (raiz === null || raiz.trim() === "") return { estado: "nao_configurado" };
  const estado = join(raiz, "state");
  const eventos = join(estado, "reader-events-v1");
  try {
    if (!isAbsolute(raiz)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    for (const p of [raiz, estado, eventos]) {
      const st = lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(p) !== resolve(p)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    }
  } catch { return { estado: "indisponivel", motivo: "caminho_invalido" }; }
  const cru = lerArquivo(join(estado, "reader-watch-checkpoint-v1.json"), TETO_DE_ARQUIVO);
  if (cru === null) return { estado: "indisponivel", motivo: "checkpoint_ausente" };
  const ck = json(cru);
  if (!objeto(ck) || ck["schema"] !== "deliveryos.tata-reader-continuous-checkpoint.v1" ||
      ck["bootstrap_complete"] !== true || !Array.isArray(ck["entries"]) || ck["entries"].length > MAX_ENTRADAS)
    return { estado: "indisponivel", motivo: "checkpoint_invalido" };
  const politica = lerPolitica(raiz);
  const pedidos: PedidoReal[] = [];
  const vistas = new Set<string>();
  let fora = 0, invalidos = 0, bytes = cru.length;
  for (const e of ck["entries"] as unknown[]) {
    if (!objeto(e) || typeof e["order_key"] !== "string" || e["order_key"].length > 512) { invalidos++; continue; }
    const partes = e["order_key"].split("|");
    const hash = e["snapshot_hash"];
    if (partes.length !== 4 || partes.some((p) => p === "") || typeof hash !== "string" || !/^[A-Fa-f0-9]{64}$/.test(hash) ||
        e["emitted_hash"] !== hash || vistas.has(e["order_key"])) { invalidos++; continue; }
    vistas.add(e["order_key"]);
    if (partes[0] !== "0001" || partes[1] !== "01") { fora++; continue; }
    const nome = `${partes[3]!.replace(/[^0-9A-Za-z_-]/g, "_")}_${hash}.json`;
    const bruto = lerArquivo(join(eventos, nome), TETO_DE_ARQUIVO);
    if (bruto === null) { invalidos++; continue; }
    bytes += bruto.length;
    if (bytes > TETO_TOTAL) return { estado: "indisponivel", motivo: "teto_excedido" };
    const r = pedidoDoEvento(raiz, nome, json(bruto), e["order_key"], hash, politica);
    if (r.tipo === "fora") fora++; else if (r.tipo === "invalido") invalidos++; else pedidos.push(r.pedido);
  }
  pedidos.sort(maisNovoPrimeiro);
  return { estado: "lido", lido_em: agora.toISOString(), politica: { versao: politica?.versao ?? null, valida: politica !== null },
    pedidos, fora_do_escopo: fora, invalidos, bytes_lidos: bytes, duracao_ms: Date.now() - t0 };
}

const maisNovoPrimeiro = (a: PedidoReal, b: PedidoReal) => (a.aberto_em_local < b.aberto_em_local ? 1 : a.aberto_em_local > b.aberto_em_local ? -1 : 0);

type ResultadoDoEvento = { tipo: "ok"; pedido: PedidoReal } | { tipo: "fora" } | { tipo: "invalido" };

/**
 * Um evento estavel do Reader -> pedido da Home, com TODAS as travas. `chave`/`hash` esperados: o
 * caminho pelo checkpoint confere contra ele; o caminho incremental confere contra o NOME do arquivo.
 */
function pedidoDoEvento(raiz: string, nome: string, ev: unknown, chave: string | null, hashEsperado: string, politica: Politica | null): ResultadoDoEvento {
  const o = objeto(ev) ? ev["order"] : null;
  if (!objeto(ev) || ev["schema"] !== "deliveryos.tata-reader-stable-order-event.v1" || !objeto(o) ||
      typeof ev["order_key"] !== "string" || (chave !== null && ev["order_key"] !== chave) ||
      typeof ev["snapshot_hash"] !== "string" || ev["snapshot_hash"].toUpperCase() !== hashEsperado.toUpperCase()) return { tipo: "invalido" };
  const partes = (ev["order_key"] as string).split("|");
  if (partes.length !== 4 || [o["CDFILIAL"], o["CDLOJA"], o["NRVENDAREST"], o["NRCOMANDA"]].some((v, i) => v !== partes[i])) return { tipo: "invalido" };
  if (partes[0] !== "0001" || partes[1] !== "01") return { tipo: "fora" };
  if (typeof o["IDORGCMDVENDA"] !== "string" || !/^DLV_[A-Z0-9]{1,10}$/.test(o["IDORGCMDVENDA"])) return { tipo: "fora" };
  const aberto = o["DTHRABERMESA"];
  const observado = typeof ev["observed_at"] === "string" ? Date.parse(ev["observed_at"]) : Number.NaN;
  const itens = o["items"];
  if (typeof aberto !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(aberto) || !Number.isFinite(observado) ||
      !texto(o["IDSTCOMANDA"], 20) || !Array.isArray(itens) || itens.length > 200) return { tipo: "invalido" };
  const nomes = nomesDaDecisao(raiz, nome);
  const obs = observacoes(o, itens.length);
  const lista: ItemReal[] = [];
  for (const [i, item] of (itens as unknown[]).entries()) {
    if (!objeto(item) || !texto(item["CDPRODUTO"], 40) || !texto(item["IDSTPRCOMVEN"], 20) || !texto(item["QTPRODCOMVEN"], 24)) return { tipo: "invalido" };
    const q = item["QTPRODCOMVEN"] as string;
    const inteiro = /^0*[1-9]\d*(?:\.0+)?$/.test(q) && Number.isSafeInteger(Number(q));
    lista.push({ indice: i + 1, codigo: item["CDPRODUTO"], codigo_arvore: texto(item["CDARVPROD"], 40) ? item["CDARVPROD"] : null,
      nome: nomes.get(item["CDPRODUTO"]) ?? null,
      quantidade: inteiro ? Number(q) : null, quantidade_nativa: q, estado_nativo: item["IDSTPRCOMVEN"],
      observacoes: obs.porItem ? obs.porItem[i]! : null });
  }
  const turno = turnoDe(politica, aberto);
  const codigos = [
    ...(Array.isArray(ev["blockers"]) ? ev["blockers"] : []),
    ...(objeto(ev["service_resolution"]) && Array.isArray(ev["service_resolution"]["blockers"]) ? ev["service_resolution"]["blockers"] : []),
  ].map((c) => (typeof c === "string" && CODIGO.test(c) ? c : "OUTRO_BLOQUEIO"));
  const unicos = [...new Set(codigos)];
  const politicaResolve = turno === "ALMOCO" || turno === "JANTAR";
  const substituidos = politicaResolve ? unicos.filter((c) => BLOQUEIOS_DE_TURNO.has(c)) : [];
  const restantes = unicos.filter((c) => !substituidos.includes(c));
  // ready=false sem codigo nenhum continua retendo: ausencia de motivo nao e liberacao.
  const retidoSemMotivo = ev["ready_for_downstream_shadow"] === false && unicos.length === 0;
  const motivos = retidoSemMotivo ? ["RETIDO_PELO_PRODUTOR_SEM_CODIGO"] : restantes;
  return { tipo: "ok", pedido: {
    chave: ev["order_key"] as string, codigo_curto: typeof o["NRCOMANDAEXT"] === "string" && /^[0-9A-Za-z]{1,12}$/.test(o["NRCOMANDAEXT"]) ? o["NRCOMANDAEXT"] : null,
    origem: o["IDORGCMDVENDA"], aberto_em_local: aberto.slice(0, 19), dia: aberto.slice(0, 10), turno,
    revisao: hashEsperado.toLowerCase(), observado_em: new Date(observado).toISOString(), estado_nativo: o["IDSTCOMANDA"] as string,
    retido: motivos.length > 0, motivos_de_retencao: motivos, bloqueios_de_turno_substituidos: substituidos,
    itens: lista, observacoes_do_pedido: obs.pedido,
    completude: { itens: "observados", observacoes: obs.estado, observacoes_por_ocorrencia: "nao_lidas_pela_fonte", componentes: "nao_lidos_pela_fonte", complementos: "nao_lidos_pela_fonte" },
  } };
}

/** Estado do leitor incremental: guardado pelo CHAMADOR (memoria do servidor da Home), nunca no disco do Reader. */
export interface CacheIncremental {
  /** Arquivos ja vistos (lidos ou descartados por idade): nunca de novo. */
  readonly vistos: Set<string>;
  /** Revisao mais recente por pedido. */
  readonly porPedido: Map<string, PedidoReal>;
}
export const novoCacheIncremental = (): CacheIncremental => ({ vistos: new Set(), porPedido: new Map() });

/**
 * Leitura INCREMENTAL: lista a pasta de eventos, le SO os arquivos novos desta instancia (e, na
 * primeira vez, so os modificados nas ultimas `horas`), e guarda a revisao mais recente de cada
 * pedido. Sem o teto de 250 do checkpoint do Reader: medido em 15/11, o dia 14/11 teve 313 pedidos
 * distintos e o checkpoint mostrava 250. O nome do arquivo e `<comanda>_<hash>.json`: o hash do nome
 * tem de bater com o do conteudo.
 */
export function lerPedidosReaisDoReaderIncremental(raiz: string | null, cache: CacheIncremental, agora: Date = new Date(), horas = 36): PedidosReaisDoReader {
  const t0 = Date.now();
  if (raiz === null || raiz.trim() === "") return { estado: "nao_configurado" };
  const eventos = join(raiz, "state", "reader-events-v1");
  let nomes: string[];
  try {
    if (!isAbsolute(raiz)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    for (const p of [raiz, join(raiz, "state"), eventos]) {
      const st = lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(p) !== resolve(p)) return { estado: "indisponivel", motivo: "caminho_invalido" };
    }
    nomes = readdirSync(eventos);
  } catch { return { estado: "indisponivel", motivo: "caminho_invalido" }; }
  const politica = lerPolitica(raiz);
  const limite = agora.getTime() - horas * 3600_000;
  let fora = 0, invalidos = 0, bytes = 0, lidos = 0;
  for (const nome of nomes) {
    if (cache.vistos.has(nome)) continue;
    cache.vistos.add(nome);
    const m = /^[0-9A-Za-z_-]{1,40}_([A-Fa-f0-9]{64})\.json$/.exec(nome);
    if (!m) continue;
    let mtime = 0;
    try { const st = lstatSync(join(eventos, nome)); if (!st.isFile() || st.isSymbolicLink()) continue; mtime = st.mtimeMs; } catch { continue; }
    if (mtime < limite) continue;
    const bruto = lerArquivo(join(eventos, nome), TETO_DE_ARQUIVO);
    if (bruto === null) { invalidos++; continue; }
    bytes += bruto.length; lidos++;
    const r = pedidoDoEvento(raiz, nome, json(bruto), null, m[1]!, politica);
    if (r.tipo === "fora") { fora++; continue; }
    if (r.tipo === "invalido") { invalidos++; continue; }
    const atual = cache.porPedido.get(r.pedido.chave);
    if (!atual || r.pedido.observado_em > atual.observado_em) cache.porPedido.set(r.pedido.chave, r.pedido);
  }
  const corte = new Date(limite).toISOString().slice(0, 10);
  for (const [k, p] of cache.porPedido) if (p.dia < corte) cache.porPedido.delete(k);
  const pedidos = [...cache.porPedido.values()].sort(maisNovoPrimeiro);
  return { estado: "lido", lido_em: agora.toISOString(), politica: { versao: politica?.versao ?? null, valida: politica !== null },
    pedidos, fora_do_escopo: fora, invalidos, bytes_lidos: bytes, duracao_ms: Date.now() - t0, ...{ arquivos_lidos_nesta_leitura: lidos } };
}
