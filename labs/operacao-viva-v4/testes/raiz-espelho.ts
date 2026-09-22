/**
 * RAIZ ESPELHO — onde se exercita o que pode destruir evidência.
 * ============================================================================
 * Uma cópia segura do repositório para os testes que precisam mexer no
 * diretório de evidências: tudo por symlink, menos `evidencias/`, que é CÓPIA.
 *
 * Mora num módulo só porque duas noções de "cópia segura" divergem, e a
 * permissiva é a que ninguém percebe. Quem exercita o refresh e quem exercita
 * as mutações usam exatamente a mesma.
 *
 * Espelhar o topo INTEIRO, em vez de escolher a dedo o que o gate precisa, é o
 * que sobrou de tentar escolher: a primeira tentativa ligou só `labs/`,
 * `node_modules` e `package.json`, e o gate morreu procurando
 * `data/cardapio_knowledge_seed.json`; ligado o `data/`, morreu de novo num
 * módulo que as fixtures resolvem por outro caminho. Lista que persegue
 * dependência vira falso vermelho no dia em que alguém acrescenta um import.
 *
 * `.git` fica DE FORA de propósito: raiz de teste não deve poder escrever no
 * repositório por acidente, nem falar por ele. O commit entra por
 * `DELIVERYOS_COMMIT`.
 */

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Espelho {
  /** `cwd` para rodar o gate ou o refresh. */
  readonly base: string;
  /** A CÓPIA do diretório de evidências — a que pode ser destruída. */
  readonly evidencias: string;
  /** `labs/operacao-viva-v4` dentro do espelho, onde o estágio aparece. */
  readonly lab: string;
}

export function raizEspelho(raiz: string): Espelho {
  const base = mkdtempSync(join(tmpdir(), "lab-v4-espelho-"));
  const LAB = join(raiz, "labs", "operacao-viva-v4");

  for (const n of readdirSync(raiz)) {
    if (n === ".git" || n === "labs") continue;
    symlinkSync(join(raiz, n), join(base, n));
  }
  mkdirSync(join(base, "labs", "operacao-viva-v4"), { recursive: true });
  for (const n of readdirSync(join(raiz, "labs"))) {
    if (n === "operacao-viva-v4") continue;
    symlinkSync(join(raiz, "labs", n), join(base, "labs", n));
  }
  const lab = join(base, "labs", "operacao-viva-v4");
  for (const n of readdirSync(LAB)) {
    if (n === "evidencias") continue;
    symlinkSync(join(LAB, n), join(lab, n));
  }
  const evidencias = join(lab, "evidencias");
  cpSync(join(LAB, "evidencias"), evidencias, { recursive: true });
  return { base, evidencias, lab };
}

/**
 * A impressão digital de um conjunto de evidências: nome + conteúdo de cada
 * arquivo, agregado num hash só.
 *
 * Nome junto de propósito. Só hashear conteúdo deixaria passar uma renomeação,
 * e arquivo de evidência com nome trocado é evidência perdida do mesmo jeito.
 */
export function impressao(dir: string): string {
  const h = createHash("sha256");
  for (const nome of readdirSync(dir).sort()) {
    h.update(nome);
    h.update("\0");
    h.update(readFileSync(join(dir, nome)));
    h.update("\0");
  }
  return h.digest("hex");
}
