/**
 * Validação de payload por tipo de evento.
 *
 * `checkEvent()` valida o ENVELOPE: tipo conhecido, carimbos, `source_mode`,
 * tamanho, PII. O que ele não faz — e ninguém fazia — é olhar o CONTEÚDO. Hoje
 * um `gps_batch_received` com `latitude: "norte"` passa: o envelope está
 * perfeito e o payload é lixo.
 *
 * Este módulo fecha essa lacuna lendo `docs/contracts/eventos.schema.json`, que
 * é o contrato documentado. Ler o mesmo arquivo que a documentação usa é o que
 * impede os dois divergirem — schema num lugar e regra noutro é como a
 * documentação envelhece sem ninguém notar.
 *
 * O validador cobre EXATAMENTE o subconjunto de JSON Schema usado no arquivo:
 * `type`, `required`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`,
 * `pattern`. Não é um validador de JSON Schema completo, e não finge ser —
 * um validador incompleto que se anuncia completo aceita em silêncio o que não
 * sabe verificar. Se o schema passar a usar palavra-chave nova, `verificarCobertura()`
 * acusa.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventType } from "./event-catalog";

/* ------------------------------------------------------------------ *
 * Carga
 * ------------------------------------------------------------------ */

export const CAMINHO_SCHEMA = join("docs", "contracts", "eventos.schema.json");

interface RegraSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, RegraSchema>;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  _contrato?: Record<string, unknown>;
}

interface Catalogo {
  version: string;
  properties: Record<string, RegraSchema>;
  required: string[];
  $defs: Record<string, RegraSchema>;
  _declarados_sem_contrato: { tipos: string[] };
}

let cache: Catalogo | null = null;

export function carregarCatalogo(raiz = process.cwd()): Catalogo {
  if (cache) return cache;
  cache = JSON.parse(readFileSync(join(raiz, CAMINHO_SCHEMA), "utf8")) as Catalogo;
  return cache;
}

/** Só para teste conseguir recarregar depois de alterar o arquivo. */
export function limparCache(): void {
  cache = null;
}

/* ------------------------------------------------------------------ *
 * Palavras-chave suportadas
 * ------------------------------------------------------------------ */

const SUPORTADAS = new Set([
  "type", "required", "properties", "enum",
  "minimum", "maximum", "minLength", "maxLength", "pattern",
  // Metadados, ignorados na validação por serem prosa do contrato.
  "_contrato", "format", "$ref", "title", "version", "$schema", "$id",
]);

/**
 * Confere que o schema não usa palavra-chave que este validador ignora.
 *
 * Sem isto, alguém acrescentaria `oneOf` ao arquivo, acharia que está validando,
 * e o validador passaria por cima em silêncio. Uma garantia que ninguém aplica
 * é pior que garantia nenhuma, porque encerra a pergunta.
 */
export function verificarCobertura(raiz = process.cwd()): string[] {
  const naoCobertas = new Set<string>();
  const andar = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(andar);
      return;
    }
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k.startsWith("_") || SUPORTADAS.has(k)) {
        andar(v);
        continue;
      }
      // Chaves dentro de `properties` e `$defs` são NOMES, não palavras-chave.
      andar(v);
    }
  };
  const c = carregarCatalogo(raiz);
  for (const [nome, def] of Object.entries(c.$defs)) {
    if (nome === "tipos") continue;
    for (const k of Object.keys(def)) {
      if (!SUPORTADAS.has(k)) naoCobertas.add(k);
    }
    for (const p of Object.values(def.properties ?? {})) {
      for (const k of Object.keys(p)) if (!SUPORTADAS.has(k)) naoCobertas.add(k);
    }
  }
  andar(null);
  return [...naoCobertas].sort();
}

/* ------------------------------------------------------------------ *
 * Validação
 * ------------------------------------------------------------------ */

export interface FalhaDePayload {
  campo: string;
  motivo: string;
}

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function validarCampo(nome: string, valor: unknown, r: RegraSchema): FalhaDePayload[] {
  const f: FalhaDePayload[] = [];
  const t = tipoDe(valor);

  if (r.type) {
    // `integer` satisfaz `number`; o contrário não.
    const compativel = r.type === "number" ? t === "number" || t === "integer" : t === r.type;
    if (!compativel) {
      f.push({ campo: nome, motivo: `esperava ${r.type}, veio ${t}` });
      return f; // sem o tipo certo, as demais regras não fazem sentido
    }
  }
  if (r.enum && !r.enum.includes(valor as never)) {
    f.push({ campo: nome, motivo: `valor fora do conjunto permitido` });
  }
  if (typeof valor === "number") {
    if (r.minimum !== undefined && valor < r.minimum) {
      f.push({ campo: nome, motivo: `${valor} abaixo do mínimo ${r.minimum}` });
    }
    if (r.maximum !== undefined && valor > r.maximum) {
      f.push({ campo: nome, motivo: `${valor} acima do máximo ${r.maximum}` });
    }
  }
  if (typeof valor === "string") {
    if (r.minLength !== undefined && valor.length < r.minLength) {
      f.push({ campo: nome, motivo: `texto curto demais` });
    }
    if (r.maxLength !== undefined && valor.length > r.maxLength) {
      f.push({ campo: nome, motivo: `texto longo demais (${valor.length} > ${r.maxLength})` });
    }
    if (r.pattern && !new RegExp(r.pattern).test(valor)) {
      f.push({ campo: nome, motivo: `não casa com o formato exigido` });
    }
  }
  return f;
}

export type ResultadoPayload =
  | { ok: true }
  | { ok: false; falhas: FalhaDePayload[] };

/**
 * Valida o payload de um evento contra o contrato do seu tipo.
 *
 * Tipo sem `$defs` no catálogo é RECUSADO, não ignorado. Ignorar deixaria os
 * dois tipos declarados-sem-contrato entrarem sem qualquer verificação de
 * conteúdo — que é exatamente a porta que este módulo existe para fechar.
 */
export function validarPayload(
  tipo: EventType | string,
  payload: unknown,
  raiz = process.cwd(),
): ResultadoPayload {
  const c = carregarCatalogo(raiz);
  const def = c.$defs[tipo];

  if (!def) {
    return {
      ok: false,
      falhas: [{ campo: "event_type", motivo: `sem contrato de payload para "${tipo}"` }],
    };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, falhas: [{ campo: "payload", motivo: "payload não é objeto" }] };
  }

  const p = payload as Record<string, unknown>;
  const falhas: FalhaDePayload[] = [];

  for (const obrigatorio of def.required ?? []) {
    if (p[obrigatorio] === undefined || p[obrigatorio] === null) {
      falhas.push({ campo: obrigatorio, motivo: "campo obrigatório ausente" });
    }
  }
  for (const [nome, regra] of Object.entries(def.properties ?? {})) {
    if (p[nome] === undefined) continue; // opcional ausente é válido
    falhas.push(...validarCampo(nome, p[nome], regra));
  }

  // Campo desconhecido NÃO é erro: é como a evolução aditiva funciona. Um
  // produtor novo acrescenta campo, e o consumidor antigo o ignora.

  return falhas.length ? { ok: false, falhas } : { ok: true };
}

/* ------------------------------------------------------------------ *
 * Contrato consultável
 * ------------------------------------------------------------------ */

export interface ContratoDeEvento {
  nome: string;
  versao: string;
  produtor: string;
  consumidores: string[];
  classificacao: string;
  retencao_meses: number;
  replay: string;
  obrigatorios_extra?: string[];
}

export function contratoDe(tipo: string, raiz = process.cwd()): ContratoDeEvento | null {
  const def = carregarCatalogo(raiz).$defs[tipo];
  return (def?._contrato as unknown as ContratoDeEvento) ?? null;
}

/** Tipos com contrato de payload — os que têm produtor ou consumidor real. */
export function tiposComContrato(raiz = process.cwd()): string[] {
  return Object.keys(carregarCatalogo(raiz).$defs).filter((k) => k !== "tipos").sort();
}

/** Tipos aceitos pelo runtime mas sem contrato. Ver o campo no schema. */
export function tiposSemContrato(raiz = process.cwd()): string[] {
  return [...carregarCatalogo(raiz)._declarados_sem_contrato.tipos].sort();
}

/**
 * Campos que o envelope precisa trazer além dos obrigatórios gerais.
 *
 * `trip_id` é opcional no envelope porque nem todo evento pertence a uma
 * viagem — mas para os nove que pertencem, ele é o que liga o fato à operação.
 * Sem esta checagem, um `trip_started` sem `trip_id` passaria e a projeção
 * simplesmente o ignoraria, em silêncio.
 */
export function obrigatoriosExtraDe(tipo: string, raiz = process.cwd()): string[] {
  return (contratoDe(tipo, raiz)?.obrigatorios_extra ?? []) as string[];
}
