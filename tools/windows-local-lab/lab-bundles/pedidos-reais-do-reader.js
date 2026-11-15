"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOQUEIOS_DE_TURNO = void 0;
exports.lerPolitica = lerPolitica;
exports.turnoDe = turnoDe;
exports.lerPedidosReaisDoReader = lerPedidosReaisDoReader;
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
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const TETO_DE_ARQUIVO = 1_048_576;
const TETO_TOTAL = 16 * 1024 * 1024;
const MAX_ENTRADAS = 250;
/** Bloqueios do produtor que dizem respeito SO ao arquivo de estado de turno (manual). */
exports.BLOQUEIOS_DE_TURNO = new Set([
    "SERVICE_STATE_EXPIRED_FOR_ORDER", "SERVICE_STATE_DATE_MISMATCH_ORDER_DATE", "SERVICE_STATE_MISSING",
    "SERVICE_STATE_SCHEMA_MISMATCH", "SERVICE_STATE_EVIDENCE_REQUIRED", "SERVICE_STATE_VALID_UNTIL_REQUIRED",
    "SERVICE_STATE_READ_FAILED", "BACKFILL_SERVICE_UNRESOLVED_PRE_18H",
]);
const CODIGO = /^[A-Z][A-Z0-9_]{2,80}$/;
const objeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const texto = (x, max = 64) => typeof x === "string" && x.length >= 1 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
function lerArquivo(caminho, teto) {
    try {
        const st = (0, node_fs_1.lstatSync)(caminho);
        if (!st.isFile() || st.isSymbolicLink() || st.size > teto)
            return null;
        return (0, node_fs_1.readFileSync)(caminho, "utf8").replace(/^﻿/, "");
    }
    catch {
        return null;
    }
}
const json = (s) => { if (s === null)
    return null; try {
    return JSON.parse(s);
}
catch {
    return null;
} };
const minutos = (hhmm) => {
    if (typeof hhmm !== "string")
        return null;
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** A politica semanal do Reader, validada. `null` = sem politica utilizavel (nunca adivinha turno). */
function lerPolitica(raiz) {
    const p = json(lerArquivo((0, node_path_1.join)(raiz, "bin", "production-service-weekly-policy.json"), 65_536));
    if (!objeto(p) || p["schema"] !== "deliveryos.production-service-weekly-policy.v1" || p["enabled"] !== true ||
        p["source_unit_id"] !== "0001" || p["source_store_id"] !== "01" || p["order_time_basis"] !== "NATIVE_DTHRABERMESA_LOCAL" ||
        p["boundary"] !== "START_INCLUSIVE_END_EXCLUSIVE" || !texto(p["policy_version"], 80) ||
        typeof p["effective_from"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p["effective_from"]) || !Array.isArray(p["week"]))
        return null;
    const semana = new Map();
    for (const d of p["week"]) {
        if (!objeto(d) || !Number.isInteger(d["day_of_week"]) || d["day_of_week"] < 0 || d["day_of_week"] > 6 || !Array.isArray(d["windows"]))
            return null;
        const js = [];
        for (const w of d["windows"]) {
            if (!objeto(w))
                return null;
            const ini = minutos(w["start"]), fim = minutos(w["end"]);
            const turno = w["service"] === "LUNCH" ? "ALMOCO" : w["service"] === "DINNER" ? "JANTAR" : null;
            if (ini === null || fim === null || fim <= ini || turno === null)
                return null;
            js.push({ turno, inicio: ini, fim });
        }
        semana.set(d["day_of_week"], js);
    }
    const ate = p["effective_until"];
    return { versao: p["policy_version"], desde: p["effective_from"],
        ate: typeof ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : null, semana };
}
/** Turno pela politica e pela hora NATIVA de abertura (relogio de parede da Teknisa, sem fuso). */
function turnoDe(politica, abertoLocal) {
    if (!politica)
        return "SEM_POLITICA";
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(abertoLocal);
    if (!m)
        return "SEM_POLITICA";
    const dia = `${m[1]}-${m[2]}-${m[3]}`;
    if (dia < politica.desde || (politica.ate !== null && dia > politica.ate))
        return "SEM_POLITICA";
    const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    const min = Number(m[4]) * 60 + Number(m[5]);
    const j = (politica.semana.get(dow) ?? []).find((x) => min >= x.inicio && min < x.fim);
    return j ? j.turno : "FORA_DO_HORARIO";
}
/** Nomes que o proprio Reader deu aos produtos desta revisao (decisao do consumidor sombra). */
function nomesDaDecisao(raiz, nomeDoEvento) {
    const d = json(lerArquivo((0, node_path_1.join)(raiz, "state", "reader-shadow-decisions-v1", nomeDoEvento.replace(/\.json$/i, ".decision.json")), TETO_DE_ARQUIVO));
    const nomes = new Map();
    if (objeto(d) && Array.isArray(d["items"]))
        for (const it of d["items"])
            if (objeto(it) && texto(it["CDPRODUTO"], 40) && texto(it["product_name"], 120))
                nomes.set(it["CDPRODUTO"], it["product_name"]);
    return nomes;
}
/**
 * Observacoes do evento. So valem quando o Reader declarou a varredura COMPLETA e cada linha tem a
 * ligacao provada; o resto e "parcial" (ha linha, mas nao da para dizer que e tudo) ou "nao lidas".
 */
function observacoes(o, nItens) {
    const linhas = Array.isArray(o["observation_rows"]) ? o["observation_rows"].filter(objeto) : null;
    if (linhas === null)
        return { estado: "nao_lidas_pela_fonte", pedido: null, porItem: null };
    const todasProvadas = linhas.every((l) => l["join_proven"] === true && texto(l["value"], 500));
    const completa = o["observation_scan_complete"] === true && todasProvadas;
    const pedido = [];
    const porItem = Array.from({ length: nItens }, () => []);
    for (const l of linhas) {
        if (!texto(l["value"], 500))
            continue;
        const idx = Number(l["item_index"]);
        if (Number.isInteger(idx) && idx >= 1 && idx <= nItens)
            porItem[idx - 1].push(l["value"]);
        else
            pedido.push(l["value"]);
    }
    return completa
        ? { estado: "observadas", pedido, porItem }
        : { estado: "parcial", pedido, porItem };
}
function lerPedidosReaisDoReader(raiz, agora = new Date()) {
    const t0 = Date.now();
    if (raiz === null || raiz.trim() === "")
        return { estado: "nao_configurado" };
    const estado = (0, node_path_1.join)(raiz, "state");
    const eventos = (0, node_path_1.join)(estado, "reader-events-v1");
    try {
        if (!(0, node_path_1.isAbsolute)(raiz))
            return { estado: "indisponivel", motivo: "caminho_invalido" };
        for (const p of [raiz, estado, eventos]) {
            const st = (0, node_fs_1.lstatSync)(p);
            if (!st.isDirectory() || st.isSymbolicLink() || (0, node_fs_1.realpathSync)(p) !== (0, node_path_1.resolve)(p))
                return { estado: "indisponivel", motivo: "caminho_invalido" };
        }
    }
    catch {
        return { estado: "indisponivel", motivo: "caminho_invalido" };
    }
    const cru = lerArquivo((0, node_path_1.join)(estado, "reader-watch-checkpoint-v1.json"), TETO_DE_ARQUIVO);
    if (cru === null)
        return { estado: "indisponivel", motivo: "checkpoint_ausente" };
    const ck = json(cru);
    if (!objeto(ck) || ck["schema"] !== "deliveryos.tata-reader-continuous-checkpoint.v1" ||
        ck["bootstrap_complete"] !== true || !Array.isArray(ck["entries"]) || ck["entries"].length > MAX_ENTRADAS)
        return { estado: "indisponivel", motivo: "checkpoint_invalido" };
    const politica = lerPolitica(raiz);
    const pedidos = [];
    const vistas = new Set();
    let fora = 0, invalidos = 0, bytes = cru.length;
    for (const e of ck["entries"]) {
        if (!objeto(e) || typeof e["order_key"] !== "string" || e["order_key"].length > 512) {
            invalidos++;
            continue;
        }
        const partes = e["order_key"].split("|");
        const hash = e["snapshot_hash"];
        if (partes.length !== 4 || partes.some((p) => p === "") || typeof hash !== "string" || !/^[A-Fa-f0-9]{64}$/.test(hash) ||
            e["emitted_hash"] !== hash || vistas.has(e["order_key"])) {
            invalidos++;
            continue;
        }
        vistas.add(e["order_key"]);
        if (partes[0] !== "0001" || partes[1] !== "01") {
            fora++;
            continue;
        }
        const nome = `${partes[3].replace(/[^0-9A-Za-z_-]/g, "_")}_${hash}.json`;
        const bruto = lerArquivo((0, node_path_1.join)(eventos, nome), TETO_DE_ARQUIVO);
        if (bruto === null) {
            invalidos++;
            continue;
        }
        bytes += bruto.length;
        if (bytes > TETO_TOTAL)
            return { estado: "indisponivel", motivo: "teto_excedido" };
        const ev = json(bruto);
        const o = objeto(ev) ? ev["order"] : null;
        if (!objeto(ev) || ev["schema"] !== "deliveryos.tata-reader-stable-order-event.v1" || !objeto(o) ||
            ev["order_key"] !== e["order_key"] || ev["snapshot_hash"] !== hash ||
            [o["CDFILIAL"], o["CDLOJA"], o["NRVENDAREST"], o["NRCOMANDA"]].some((v, i) => v !== partes[i])) {
            invalidos++;
            continue;
        }
        if (typeof o["IDORGCMDVENDA"] !== "string" || !/^DLV_[A-Z0-9]{1,10}$/.test(o["IDORGCMDVENDA"])) {
            fora++;
            continue;
        }
        const aberto = o["DTHRABERMESA"];
        const observado = typeof ev["observed_at"] === "string" ? Date.parse(ev["observed_at"]) : Number.NaN;
        const itens = o["items"];
        if (typeof aberto !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(aberto) || !Number.isFinite(observado) ||
            !texto(o["IDSTCOMANDA"], 20) || !Array.isArray(itens) || itens.length > 200) {
            invalidos++;
            continue;
        }
        const nomes = nomesDaDecisao(raiz, nome);
        const obs = observacoes(o, itens.length);
        const lista = [];
        let itemRuim = false;
        for (const [i, item] of itens.entries()) {
            if (!objeto(item) || !texto(item["CDPRODUTO"], 40) || !texto(item["IDSTPRCOMVEN"], 20) || !texto(item["QTPRODCOMVEN"], 24)) {
                itemRuim = true;
                break;
            }
            const q = item["QTPRODCOMVEN"];
            const inteiro = /^0*[1-9]\d*(?:\.0+)?$/.test(q) && Number.isSafeInteger(Number(q));
            lista.push({ indice: i + 1, codigo: item["CDPRODUTO"], nome: nomes.get(item["CDPRODUTO"]) ?? null,
                quantidade: inteiro ? Number(q) : null, quantidade_nativa: q, estado_nativo: item["IDSTPRCOMVEN"],
                observacoes: obs.porItem ? obs.porItem[i] : null });
        }
        if (itemRuim) {
            invalidos++;
            continue;
        }
        const turno = turnoDe(politica, aberto);
        const codigos = [
            ...(Array.isArray(ev["blockers"]) ? ev["blockers"] : []),
            ...(objeto(ev["service_resolution"]) && Array.isArray(ev["service_resolution"]["blockers"]) ? ev["service_resolution"]["blockers"] : []),
        ].map((c) => (typeof c === "string" && CODIGO.test(c) ? c : "OUTRO_BLOQUEIO"));
        const unicos = [...new Set(codigos)];
        const politicaResolve = turno === "ALMOCO" || turno === "JANTAR";
        const substituidos = politicaResolve ? unicos.filter((c) => exports.BLOQUEIOS_DE_TURNO.has(c)) : [];
        const restantes = unicos.filter((c) => !substituidos.includes(c));
        // ready=false sem codigo nenhum continua retendo: ausencia de motivo nao e liberacao.
        const retidoSemMotivo = ev["ready_for_downstream_shadow"] === false && unicos.length === 0;
        const motivos = retidoSemMotivo ? ["RETIDO_PELO_PRODUTOR_SEM_CODIGO"] : restantes;
        pedidos.push({
            chave: e["order_key"], codigo_curto: typeof o["NRCOMANDAEXT"] === "string" && /^[0-9A-Za-z]{1,12}$/.test(o["NRCOMANDAEXT"]) ? o["NRCOMANDAEXT"] : null,
            origem: o["IDORGCMDVENDA"], aberto_em_local: aberto.slice(0, 19), dia: aberto.slice(0, 10), turno,
            revisao: hash.toLowerCase(), observado_em: new Date(observado).toISOString(), estado_nativo: o["IDSTCOMANDA"],
            retido: motivos.length > 0, motivos_de_retencao: motivos, bloqueios_de_turno_substituidos: substituidos,
            itens: lista, observacoes_do_pedido: obs.pedido,
            completude: { itens: "observados", observacoes: obs.estado, componentes: "nao_lidos_pela_fonte", complementos: "nao_lidos_pela_fonte" },
        });
    }
    pedidos.sort((a, b) => (a.aberto_em_local < b.aberto_em_local ? 1 : a.aberto_em_local > b.aberto_em_local ? -1 : 0));
    return { estado: "lido", lido_em: agora.toISOString(), politica: { versao: politica?.versao ?? null, valida: politica !== null },
        pedidos, fora_do_escopo: fora, invalidos, bytes_lidos: bytes, duracao_ms: Date.now() - t0 };
}
