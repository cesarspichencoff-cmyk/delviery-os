/**
 * INVENTÁRIO DE CONGELAMENTO — pela PROPRIEDADE, não pelo lugar.
 * ============================================================================
 * Este arquivo existe por causa de uma falha com nome:
 * `EXPECTED_DIRECTORY_INVENTORY_BLINDNESS`.
 *
 * M1A.1 afirmou "dez asserções de congelamento" e errou. Não errou de conta:
 * errou de MÉTODO. Ele procurou onde gates de congelamento *moram*
 * — `src/platform/` — em vez de procurar pelo COMPORTAMENTO que os define.
 * Existia um décimo primeiro no Lab V4, com o mesmo defeito de intervalo
 * aberto, e o inventário devolveu "dez, completo". Um número que parece
 * completo é pior do que nenhum, porque ninguém volta a conferir.
 *
 * A regra que nasceu disso, agora executável:
 *
 *     INVENTARIE A PROPRIEDADE, NÃO APENAS O LUGAR ONDE ESPERA ENCONTRÁ-LA.
 *
 * ---------------------------------------------------------------------------
 * A PROPRIEDADE, dita com precisão
 *
 * Um gate de congelamento é um arquivo que afirma que um conjunto de caminhos
 * protegidos NÃO MUDOU ao longo de um intervalo histórico que TERMINA no commit
 * certificado. Na prática ele invoca:
 *
 *     git diff --name-only <BASE> <FIM_CERTIFICADO> -- <caminhos protegidos>
 *
 * e exige saída vazia.
 *
 * O que distingue essa família de qualquer outro `git diff` do projeto é o
 * SEGUNDO ponto do intervalo ser o commit certificado. É por isso que a metade
 * do FUTURO (C6), que compara o baseline com a árvore ATUAL e por isso tem um
 * ponto só, não é confundida com gate quebrado: ela não termina no commit
 * certificado, ela termina em "agora", e isso é proposital.
 *
 * O DEFEITO desta família é o INTERVALO ABERTO: a mesma chamada com um ponto
 * só antes do `--`, que compara o passado com a árvore de trabalho e por isso
 * acusa qualquer trabalho futuro legítimo.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE MÓDULO NÃO FAZ
 *
 * Não é um scanner genérico de "qualidade". Ele conhece UMA família e paga
 * aluguel por ela: descobre onde ela está, mesmo que mude de diretório, e diz
 * se cada membro usa intervalo fechado.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** O fim do intervalo histórico certificado por M1A.1 (D-M1A1-10). */
export const FIM_CERTIFICADO = "f87a36dfd39c9989344f0fed6ebf8db5db1a8c35";

/** Diretórios que não são código do projeto. */
const IGNORAR = new Set([".git", "node_modules", "dist", "coverage", ".vscode"]);

export interface GateDeCongelamento {
  /** Caminho relativo à raiz, com barras normais. */
  readonly arquivo: string;
  /** Commit inicial do intervalo, como escrito na fonte. */
  readonly base: string;
  /** Verdadeiro quando há DOIS pontos antes do `--`. */
  readonly fechado: boolean;
  /** O texto da invocação, para a mensagem de erro poder ser específica. */
  readonly invocacao: string;
}

function arquivosDeCodigo(raiz: string, dir: string, saida: string[]): void {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    let st;
    try {
      st = statSync(caminho);
    } catch {
      continue;
    }
    if (st.isDirectory()) arquivosDeCodigo(raiz, caminho, saida);
    else if (/\.(ts|js|mts|cts|mjs|cjs)$/.test(nome)) saida.push(caminho);
  }
}

/**
 * Encontra as invocações de `git diff --name-only` que pertencem à família.
 *
 * A leitura normaliza CRLF: fim de linha é artefato de checkout, e comparar
 * bytes crus contra fonte em LF foi exatamente o que deixou seis mutações do
 * Lab cegas por meses (M1B-R2, A).
 */
export function inventarioDeCongelamento(raiz: string): GateDeCongelamento[] {
  const arquivos: string[] = [];
  arquivosDeCodigo(raiz, raiz, arquivos);

  const achados: GateDeCongelamento[] = [];
  for (const caminho of arquivos) {
    let fonte: string;
    try {
      fonte = readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
    } catch {
      continue;
    }
    // O arquivo precisa conhecer o commit certificado — por literal ou por
    // constante que o receba. Sem isso ele não pertence a esta família.
    const declara =
      fonte.includes(FIM_CERTIFICADO) ||
      fonte.includes(FIM_CERTIFICADO.slice(0, 7));
    if (!declara) continue;

    // A DETECÇÃO NÃO PODE DEPENDER DE FORMATAÇÃO.
    //
    // A primeira versão casava `[ "diff", "--name-only", ...]` com regex, e
    // perdeu DOIS dos onze gates — `run-r5c-translation-tests.ts` e
    // `run-r5d2-producer-qualification-tests.ts` — porque nos dois há
    // comentário entre o `[` e o `"diff"`. Um inventário que devolve nove
    // quando existem onze é a MESMA falha que este arquivo existe para matar,
    // com pintura nova. Então a leitura passou a ser por varredura a partir do
    // próprio `--name-only`, sem depender de onde a lista começa nem de como
    // ela está quebrada em linhas.
    const semComentario = fonte
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const MARCA = '"--name-only"';
    let de = 0;
    for (;;) {
      const i = semComentario.indexOf(MARCA, de);
      if (i < 0) break;
      de = i + MARCA.length;
      // PADRÃO QUE DESCREVE ≠ INVOCAÇÃO QUE EXECUTA.
      //
      // `run-m1-bridge-tests.ts` carrega uma asserção cujo REGEX contém o texto
      // `"--name-only", PF4_BASE, "--"` — ela existe justamente para reprovar o
      // intervalo aberto. Sem esta distinção o inventário acusava essa asserção
      // como se fosse um gate aberto: acusaria a guarda por citar o defeito que
      // ela impede. Uma invocação de verdade tem `"diff"` como argumento logo
      // antes; um padrão que fala sobre ela, não.
      const antes = semComentario.slice(Math.max(0, i - 200), i);
      if (!antes.includes('"diff"')) continue;

      const janela = semComentario.slice(de, de + 700);
      const fim = janela.indexOf('"--"');
      if (fim < 0) continue;
      const pontos = janela
        .slice(0, fim)
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && x !== "[" && x !== "]");
      if (pontos.length === 0) continue;

      const ultimo = pontos[pontos.length - 1] ?? "";
      const terminaNoCertificado =
        ultimo.includes(FIM_CERTIFICADO) ||
        /FIM_HISTORICO|FIM_CERTIFICADO|M1_BASELINE/.test(ultimo);
      const invocacao = semComentario
        .slice(i, de + fim + 4)
        .replace(/\s+/g, " ")
        .slice(0, 120);

      if (pontos.length >= 2 && terminaNoCertificado) {
        achados.push({
          arquivo: relative(raiz, caminho).split(sep).join("/"),
          base: pontos[0] ?? "?",
          fechado: true,
          invocacao,
        });
      } else if (pontos.length === 1 && !terminaNoCertificado) {
        // Um ponto só, num arquivo que conhece o commit certificado: intervalo
        // ABERTO — compara o passado com a árvore de trabalho e acusa qualquer
        // trabalho futuro legítimo. É o defeito desta família.
        achados.push({
          arquivo: relative(raiz, caminho).split(sep).join("/"),
          base: pontos[0] ?? "?",
          fechado: false,
          invocacao,
        });
      }
    }
  }
  return achados;
}

/** Os arquivos distintos que carregam pelo menos um gate da família. */
export function arquivosComGate(raiz: string): string[] {
  return [...new Set(inventarioDeCongelamento(raiz).map((g) => g.arquivo))].sort();
}
