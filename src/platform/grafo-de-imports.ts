/**
 * Alcançabilidade por GRAFO DE IMPORTS — a medida que substitui varredura de texto.
 *
 * Existia uma família de guardas que perguntava "o arquivo X contém a palavra
 * `conference-brain`?". A pergunta parece a certa e não é: ela erra nos dois
 * sentidos, e as duas falhas foram MEDIDAS nesta base —
 *
 *  - **falso verde**: `bin/async-runtime.ts` passou a alcançar o Conference
 *    Brain, a ponte do Copiloto e o Shadow através de
 *    `runtime/intelligence-spine`. Nenhuma dessas palavras aparece no import.
 *    As três guardas continuaram verdes com a dependência real no lugar;
 *  - **falso vermelho**: acrescentar a string `"conference-brain"` a uma
 *    constante inerte, sem dependência nenhuma, deixou as três vermelhas.
 *
 * Uma guarda que muda de cor por nomenclatura não está defendendo arquitetura,
 * está defendendo vocabulário. Este módulo existe para que a pergunta passe a
 * ser "existe CAMINHO de import de X até Y?", que é a pergunta que a
 * arquitetura faz.
 *
 * Um módulo só, importado por todas as guardas e pela auditoria de topologia:
 * duas implementações do mesmo grafo divergem, e a que diverge para o lado
 * permissivo é a que ninguém percebe.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const RAIZ = process.cwd();

const ESPECIFICADORES = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/**
 * `createRequire` cria um require com OUTRO nome, e um grafo que só procura
 * `require(` fica cego justamente onde um módulo CommonJS é carregado de
 * dentro de TypeScript — que é como a espinha carrega o Brain. O identificador
 * é descoberto no próprio arquivo e vira padrão.
 */
function padroesDeRequireApelidado(codigo: string): RegExp[] {
  return [...codigo.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRequire\s*\(/g)]
    .map((m) => new RegExp(`\\b${m[1]}\\s*\\(\\s*["']([^"']+)["']`, "g"));
}

/** Resolve um especificador relativo para um arquivo real. Pacote não é nó. */
function resolver(deOndeVem: string, especificador: string): string | null {
  if (!especificador.startsWith(".")) return null;
  const base = resolve(dirname(deOndeVem), especificador);
  for (const t of [base, `${base}.ts`, `${base}.js`, join(base, "index.ts"), join(base, "index.js")]) {
    if (existsSync(t) && statSync(t).isFile()) return t;
  }
  return null;
}

export interface OpcoesDoGrafo {
  /**
   * Arquivos que o percurso NÃO atravessa.
   *
   * É o que permite perguntar "sem passar por esta porta, ainda dá para
   * chegar?" — a pergunta que prova que a porta é única.
   */
  cortar?: readonly string[];
}

/** Fecho transitivo de imports a partir de um entrypoint, em caminhos absolutos. */
export function alcancaveis(entrada: string, opcoes: OpcoesDoGrafo = {}): Set<string> {
  const cortes = new Set((opcoes.cortar ?? []).map((c) => resolve(RAIZ, c)));
  const vistos = new Set<string>();
  const fila = [resolve(RAIZ, entrada)];

  while (fila.length) {
    const atual = fila.pop();
    if (!atual || vistos.has(atual) || !existsSync(atual)) continue;
    vistos.add(atual);
    // Um nó cortado é alcançado e não é ATRAVESSADO: o que só existe depois
    // dele deixa de aparecer, que é exatamente o recorte procurado.
    if (cortes.has(atual)) continue;

    let fonte: string;
    try {
      fonte = readFileSync(atual, "utf8");
    } catch {
      continue;
    }
    // Comentário que cita a proibição já casou com ela antes de qualquer
    // medida: fora.
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const padrao of [ESPECIFICADORES, ...padroesDeRequireApelidado(codigo)]) {
      for (const m of codigo.matchAll(padrao)) {
        const alvo = resolver(atual, m[1]);
        if (alvo && !vistos.has(alvo)) fila.push(alvo);
      }
    }
  }
  return vistos;
}

/** Verdadeiro quando algum arquivo alcançado vive sob o prefixo dado. */
export function alcancaPrefixo(conjunto: Set<string>, prefixoRelativo: string): boolean {
  const prefixo = resolve(RAIZ, prefixoRelativo);
  for (const a of conjunto) if (a.startsWith(prefixo)) return true;
  return false;
}

/** Verdadeiro quando o arquivo exato foi alcançado. */
export function alcanca(conjunto: Set<string>, arquivoRelativo: string): boolean {
  return conjunto.has(resolve(RAIZ, arquivoRelativo));
}

/** Os arquivos alcançados sob um prefixo, em caminho relativo e ordenados. */
export function alcancadosSob(conjunto: Set<string>, prefixoRelativo: string): string[] {
  const prefixo = resolve(RAIZ, prefixoRelativo);
  return [...conjunto]
    .filter((a) => a.startsWith(prefixo))
    .map((a) => a.slice(RAIZ.length + 1))
    .sort();
}
