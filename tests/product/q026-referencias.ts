/**
 * Q-026 — carrega implementacoes de REFERENCIA de `projetar()` sem tocar no
 * repositorio de trabalho.
 *
 * A referencia sai de `git show <commit>:<arquivo>`, e o conteudo e conferido
 * por SHA-256 antes de rodar: se o commit sumir ou o arquivo nao for o
 * esperado, a prova PARA em vez de comparar contra outra coisa. Os arquivos
 * vao para um diretorio temporario FORA da arvore (`os.tmpdir()`), com a mesma
 * estrutura relativa (`projections/`, `contracts/`), e sao apagados no fim —
 * nada aparece no `git status`.
 *
 * Referencias pinadas:
 *  - ORIGINAL: `d0716fd`, a integracao validada (Q-025), onde a projecao e a
 *    que esta em uso hoje.
 *  - PR31: `b20a847`, o experimento do ChatGPT (append sem copia quadratica).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { EventEnvelope } from "../../src/platform/contracts/event-catalog";
import type { OpcoesProjecao, Projecao } from "../../src/platform/projections/operacao-viva";

export type Projetar = (eventos: readonly EventEnvelope[], opcoes: OpcoesProjecao) => Projecao;

export interface Referencia {
  nome: string;
  commit: string;
  projetar: Projetar;
}

export const REF_ORIGINAL = {
  nome: "original d0716fd",
  commit: "d0716fda380fc66cecfd791593cb6cc8c017b37a",
  sha256_projecao: "b4b6ee2373f8a9402d5939548b14c54c42a32ff4463f4c1bedef6574385d3815",
} as const;

export const REF_PR31 = {
  nome: "PR #31 b20a847",
  commit: "b20a847ef3e838dba69f1997e837c32faa66d24f",
  sha256_projecao: "7a26bf83263979d9042d72eca9e052742000b856cecac16f664c7474807289b4",
} as const;

/** `relogio.ts` e identico nos dois commits e na arvore atual. */
export const SHA256_RELOGIO = "e2945711cd60bb31f589802c7a1a9e885345729691b12b39bf5c0cdd9d24c54e";

const RAIZ = resolve(__dirname, "../..");
const temporarios: string[] = [];
let limpezaRegistrada = false;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function registrarLimpeza(): void {
  if (limpezaRegistrada) return;
  limpezaRegistrada = true;
  process.on("exit", () => {
    for (const d of temporarios) rmSync(d, { recursive: true, force: true });
  });
}

function gitShow(commit: string, caminho: string): string {
  return execFileSync("git", ["show", `${commit}:${caminho}`], {
    cwd: RAIZ,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

/**
 * Monta um diretorio temporario com `projections/operacao-viva.ts` (fonte
 * dada) e `contracts/relogio.ts` (da arvore atual, conferido por hash) e
 * carrega o modulo. Usado pelas referencias e pelos mutantes.
 */
export function carregarProjecaoDeFonte(nome: string, fonte: string): Projetar {
  registrarLimpeza();
  const relogio = readFileSync(join(RAIZ, "src/platform/contracts/relogio.ts"), "utf8");
  if (sha256(relogio) !== SHA256_RELOGIO) {
    throw new Error("contracts/relogio.ts mudou: as referencias deixam de ser comparaveis sem revisao");
  }
  const dir = mkdtempSync(join(tmpdir(), "q026-ref-"));
  temporarios.push(dir);
  mkdirSync(join(dir, "projections"));
  mkdirSync(join(dir, "contracts"));
  writeFileSync(join(dir, "contracts/relogio.ts"), relogio);
  const arquivo = join(dir, "projections/operacao-viva.ts");
  writeFileSync(arquivo, fonte);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(arquivo) as { projetar?: Projetar };
  if (typeof mod.projetar !== "function") throw new Error(`${nome}: projetar ausente`);
  return mod.projetar;
}

/** Carrega uma referencia pinada. `null` + motivo quando o commit nao esta disponivel. */
export function carregarReferencia(
  ref: { nome: string; commit: string; sha256_projecao: string },
): { referencia: Referencia } | { referencia: null; motivo: string } {
  let fonte: string;
  try {
    fonte = gitShow(ref.commit, "src/platform/projections/operacao-viva.ts");
  } catch (e) {
    return { referencia: null, motivo: `git show ${ref.commit.slice(0, 7)} falhou: ${(e as Error).message.split("\n")[0]}` };
  }
  const h = sha256(fonte);
  if (h !== ref.sha256_projecao) {
    throw new Error(`${ref.nome}: SHA-256 ${h} difere do pinado ${ref.sha256_projecao} — abortar`);
  }
  return { referencia: { nome: ref.nome, commit: ref.commit, projetar: carregarProjecaoDeFonte(ref.nome, fonte) } };
}

/** A fonte ATUAL da projecao (a candidata), para os mutantes. */
export function fonteAtualDaProjecao(): string {
  return readFileSync(join(RAIZ, "src/platform/projections/operacao-viva.ts"), "utf8");
}
