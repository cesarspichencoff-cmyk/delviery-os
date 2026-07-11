/* ============================================================================
 * DeliveryOS · src/live · SANITIZAÇÃO (F2-01)
 * ----------------------------------------------------------------------------
 * Três defesas, em camadas, ANTES de qualquer append:
 *
 *  1. Varredura RECURSIVA de campos proibidos (objetos, arrays, objetos dentro
 *     de arrays, profundidade limitada) — case-insensitive. Achou => o evento
 *     não é aceito; só o CAMINHO do campo é registrado, nunca o valor.
 *  2. Redação recursiva (para o que vai à quarentena): remove os campos
 *     proibidos do clone, listando apenas os nomes removidos.
 *  3. Normalização por ALLOWLIST: evento aceito só persiste campos
 *     operacionais conhecidos do contrato — nunca o payload cego da fonte.
 *
 * Identificadores operacionais (ifood_short, pedido_interno, sequencia,
 * print_job_id) NÃO são PII e nunca entram na lista proibida.
 *
 * Limitação declarada: a detecção é por NOME de campo; valor livre em campo
 * legítimo (ex.: observação do prato ditada pelo cliente) não é vasculhado —
 * essa é uma limitação permanente registrada no Contrato do Núcleo.
 * ==========================================================================*/
"use strict";

const crypto = require("node:crypto");

const PROFUNDIDADE_MAXIMA = 8;

// nomes proibidos (comparação em minúsculas) — dados pessoais e segredos
const CAMPOS_PROIBIDOS = Object.freeze([
  "telefone", "tel", "tel_consumidor", "celular", "whatsapp", "fone",
  "endereco", "cep", "cpf", "rg", "documento", "passaporte",
  "email", "e_mail", "e-mail",
  "cliente", "consumidor", "nome_cliente",
  "senha", "senhas", "password", "passwd",
  "cookie", "cookies", "token", "tokens"
]);

const ehObjeto = (v) => v !== null && typeof v === "object";

/**
 * Varre recursivamente procurando o primeiro campo proibido.
 * @returns {{campo:string}|{profundidade_excedida:true}|null}
 *          campo = caminho completo (ex.: "payload.itens[0].meta.telefone")
 */
function acharCampoProibido(obj, prefixo, profundidade) {
  const prof = profundidade || 0;
  if (!ehObjeto(obj)) return null;
  if (prof > PROFUNDIDADE_MAXIMA) return { profundidade_excedida: true };

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = acharCampoProibido(obj[i], `${prefixo}[${i}]`, prof + 1);
      if (r) return r;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    if (CAMPOS_PROIBIDOS.includes(k.toLowerCase())) {
      return { campo: prefixo ? `${prefixo}.${k}` : k };
    }
    const r = acharCampoProibido(obj[k], prefixo ? `${prefixo}.${k}` : k, prof + 1);
    if (r) return r;
  }
  return null;
}

/**
 * Clona removendo TODO campo proibido em qualquer profundidade.
 * @returns {{objeto:any, removidos:string[]}} removidos = caminhos, sem valores
 */
function redigirCamposProibidos(obj, prefixo, profundidade, removidos) {
  const rem = removidos || [];
  const prof = profundidade || 0;
  if (!ehObjeto(obj)) return { objeto: obj, removidos: rem };
  if (prof > PROFUNDIDADE_MAXIMA) {
    rem.push(`${prefixo || "(raiz)"}.[profundidade_excedida]`);
    return { objeto: null, removidos: rem };
  }
  if (Array.isArray(obj)) {
    const saida = obj.map((v, i) =>
      redigirCamposProibidos(v, `${prefixo}[${i}]`, prof + 1, rem).objeto);
    return { objeto: saida, removidos: rem };
  }
  const saida = {};
  for (const k of Object.keys(obj)) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (CAMPOS_PROIBIDOS.includes(k.toLowerCase())) {
      rem.push(caminho); // só o nome; o valor morre aqui
      continue;
    }
    saida[k] = redigirCamposProibidos(obj[k], caminho, prof + 1, rem).objeto;
  }
  return { objeto: saida, removidos: rem };
}

/* ---------- allowlist por tipo de evento (contrato Addendum §5) ---------- */

const ALLOWLIST_ENVELOPE = Object.freeze([
  "schema_version", "event_id", "event_type", "source", "source_event_id",
  "idempotency_key", "occurred_at", "captured_at", "received_at",
  "correlation", "payload", "quality"
]);
const ALLOWLIST_CORRELATION = Object.freeze(["ifood_short", "pedido_interno", "print_job_id"]);
const ALLOWLIST_ITEM = Object.freeze(["nome", "quantidade", "observacao"]);
const ALLOWLIST_PAYLOAD = Object.freeze({
  comanda_impressa: ["pedido_interno", "ifood_short", "sequencia", "emissao", "itens", "origem"],
  status_ifood: ["ifood_short", "coluna", "tempo_decorrido_min", "atraso_min", "visto_em", "revision"],
  pedido_vivo: ["ifood_short", "coluna", "tempo_decorrido_min", "atraso_min", "visto_em", "revision"],
  pedido_cancelado: ["ifood_short", "visto_em", "motivo"],
  pedido_reimpresso: ["pedido_interno", "ifood_short", "emissao_nova", "itens", "conteudo_identico"],
  pedido_alterado: ["pedido_interno", "ifood_short", "change_mode", "revision", "previous_revision",
    "supersedes_event_id", "changed_fields", "itens", "itens_removidos"],
  fonte_conectada: ["source", "motivo", "ultimo_evento_em"],
  fonte_desconectada: ["source", "motivo", "ultimo_evento_em"]
});

function filtrar(obj, permitidos, prefixo, descartados) {
  if (!ehObjeto(obj) || Array.isArray(obj)) return obj;
  const saida = {};
  for (const k of Object.keys(obj)) {
    if (permitidos.includes(k)) saida[k] = obj[k];
    else descartados.push(prefixo ? `${prefixo}.${k}` : k);
  }
  return saida;
}

/**
 * Normaliza um evento VÁLIDO (já sem PII por nome) para conter somente os
 * campos operacionais do contrato. O que a fonte mandou a mais é descartado e
 * registrado por NOME — nunca persistido cegamente.
 * @returns {{evento:object, descartados:string[]}}
 */
function normalizarPorAllowlist(bruto) {
  const descartados = [];
  const ev = filtrar(bruto, ALLOWLIST_ENVELOPE, "", descartados);
  ev.correlation = filtrar(bruto.correlation || {}, ALLOWLIST_CORRELATION, "correlation", descartados);
  const permitidosPayload = ALLOWLIST_PAYLOAD[bruto.event_type] || [];
  ev.payload = filtrar(bruto.payload || {}, permitidosPayload, "payload", descartados);

  if (Array.isArray(ev.payload.itens)) {
    ev.payload.itens = ev.payload.itens.map((item, i) => {
      if (!ehObjeto(item) || Array.isArray(item)) {
        descartados.push(`payload.itens[${i}]`);
        return { nome: null, quantidade: null, observacao: null };
      }
      const limpo = filtrar(item, ALLOWLIST_ITEM, `payload.itens[${i}]`, descartados);
      return {
        nome: limpo.nome !== undefined ? limpo.nome : null,
        quantidade: limpo.quantidade !== undefined ? limpo.quantidade : null,
        observacao: limpo.observacao !== undefined ? limpo.observacao : null
      };
    });
  }
  if (Array.isArray(ev.payload.changed_fields)) {
    ev.payload.changed_fields = ev.payload.changed_fields.filter((c) => typeof c === "string");
  }
  if (Array.isArray(ev.payload.itens_removidos)) {
    ev.payload.itens_removidos = ev.payload.itens_removidos.filter((c) => typeof c === "string");
  }
  return { evento: ev, descartados };
}

/* ---------- identidade canônica de conteúdo (F2-04) ---------- */

function ordenarChaves(v) {
  if (!ehObjeto(v)) return v;
  if (Array.isArray(v)) return v.map(ordenarChaves);
  const saida = {};
  for (const k of Object.keys(v).sort()) saida[k] = ordenarChaves(v[k]);
  return saida;
}

// Campos de MEDIÇÃO da observação — variam a cada releitura legítima do mesmo
// fato e por isso NÃO participam da identidade de conteúdo (senão todo poll
// do Gestor viraria falso "conteúdo divergente"). O que muda de verdade o
// fato (coluna, itens, change_mode, revision) SEMPRE participa.
const CAMPOS_VOLATEIS_POR_TIPO = Object.freeze({
  status_ifood: ["tempo_decorrido_min", "atraso_min", "visto_em"],
  pedido_vivo: ["tempo_decorrido_min", "atraso_min", "visto_em"],
  pedido_cancelado: ["visto_em"],
  comanda_impressa: ["emissao"], // reimpressão idêntica traz emissão nova — mesma comanda
  fonte_conectada: ["ultimo_evento_em"],
  fonte_desconectada: ["ultimo_evento_em"]
});
// occurred_at é medição nas famílias de status (cada releitura reobserva)
const TIPOS_SEM_OCCURRED_NA_IDENTIDADE = Object.freeze([
  "status_ifood", "pedido_vivo", "pedido_cancelado"
]);

/**
 * Hash do CONTEÚDO operacional do evento (não da observação): exclui
 * captured_at/received_at/quality e os campos voláteis de medição do tipo —
 * reobservar o mesmo fato produz o mesmo hash; conteúdo operacional
 * INCOMPATÍVEL sob a mesma identidade produz hash diferente.
 */
function hashConteudoEvento(ev) {
  const volateis = CAMPOS_VOLATEIS_POR_TIPO[ev.event_type] || [];
  const payload = {};
  for (const k of Object.keys(ev.payload || {})) {
    if (!volateis.includes(k)) payload[k] = ev.payload[k];
  }
  const conteudo = ordenarChaves({
    event_type: ev.event_type,
    source: ev.source,
    occurred_at: TIPOS_SEM_OCCURRED_NA_IDENTIDADE.includes(ev.event_type)
      ? null : (ev.occurred_at || null),
    correlation: ev.correlation || {},
    payload
  });
  return crypto.createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
}

module.exports = {
  CAMPOS_PROIBIDOS,
  PROFUNDIDADE_MAXIMA,
  acharCampoProibido,
  redigirCamposProibidos,
  normalizarPorAllowlist,
  hashConteudoEvento
};
