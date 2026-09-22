/**
 * AUDITORIA DE TOPOLOGIA — quais setas da espinha existem no RUNTIME.
 *
 * Existe porque "o módulo está no repositório e tem teste passando" não diz
 * nada sobre o processo que roda na rua. A cadeia
 *
 *   fato → persistência → outbox → Operação Viva → adapter Conference
 *        → observer → conclusões → bridge Copiloto → recomendação Shadow
 *
 * pode estar inteira em teste e ausente do worker. Foi exatamente esse o
 * estado medido em 4974cf5: da Operação Viva para a frente, nada era
 * alcançável a partir de um entrypoint real.
 *
 * O método é alcançabilidade estática: parte dos binários reais
 * (`bin/critical.ts`, `bin/async-runtime.ts`), segue `import`/`require`
 * relativos e pergunta de cada nó da cadeia se ele está no fecho.
 *
 * Por que estático e não "rodar e ver": um módulo que só é carregado quando
 * uma flag liga continua sendo parte do desenho do processo, e um teste que
 * dependesse do flag ligado mediria a configuração, não a topologia.
 *
 * A fronteira crítico × assíncrono é medida junto e é o ponto todo da
 * unidade: qualquer nó de inteligência alcançável a partir de `critical.ts`
 * reprova, porque inteligência no caminho crítico é a coisa que a espinha não
 * pode ser.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const RAIZ = process.cwd();

const CRITICO = "src/platform/bin/critical.ts";
const ASSINCRONO = "src/platform/bin/async-runtime.ts";

/** Os nós da cadeia, na ordem em que a mensagem os atravessa. */
const CADEIA: readonly { seta: string; arquivo: string }[] = [
  { seta: "1 fato/ingestão", arquivo: "src/platform/runtime/rota-ingestao.ts" },
  { seta: "2 persistência", arquivo: "src/platform/persistence/pg-repositories.ts" },
  { seta: "3 outbox", arquivo: "src/platform/runtime/async-worker.ts" },
  { seta: "4 Operação Viva", arquivo: "src/platform/runtime/handler-operacao-viva.ts" },
  { seta: "5 adapter Conference", arquivo: "src/conference-brain/ingestion/operacao-viva-adapter.js" },
  { seta: "6 observer", arquivo: "src/conference-brain/live/observer.js" },
  { seta: "7 conclusões", arquivo: "src/conference-brain/copiloto/conclusoes.js" },
  { seta: "8 bridge Copiloto", arquivo: "src/platform/copiloto/conference-bridge.ts" },
  { seta: "9 recomendação Shadow", arquivo: "src/platform/copiloto/shadow.ts" },
];

/** Da seta 5 em diante é inteligência: nada disso pode entrar no crítico. */
const PRIMEIRA_SETA_DE_INTELIGENCIA = 5;

const ESPECIFICADORES =
  /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** Resolve um especificador relativo para um caminho de arquivo real. */
function resolver(deOndeVem: string, especificador: string): string | null {
  if (!especificador.startsWith(".")) return null; // pacote: fora do grafo do repo
  const base = resolve(dirname(deOndeVem), especificador);
  const tentativas = [
    base,
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  for (const t of tentativas) {
    // `base` sem extensão pode ser um diretório; só arquivo conta como nó.
    if (existsSync(t) && statSync(t).isFile()) return t;
  }
  return null;
}

/** Fecho transitivo de imports a partir de um entrypoint. */
function alcancaveis(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const fila = [resolve(RAIZ, entrada)];
  while (fila.length) {
    const atual = fila.pop();
    if (!atual || vistos.has(atual) || !existsSync(atual)) continue;
    vistos.add(atual);
    let fonte: string;
    try {
      fonte = readFileSync(atual, "utf8");
    } catch {
      continue;
    }
    // Comentários fora: um `require` citado em comentário não é uma aresta.
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const m of codigo.matchAll(ESPECIFICADORES)) {
      const alvo = resolver(atual, m[1]);
      if (alvo && !vistos.has(alvo)) fila.push(alvo);
    }
  }
  return vistos;
}

function contem(conjunto: Set<string>, arquivo: string): boolean {
  return conjunto.has(resolve(RAIZ, arquivo));
}

let falhas = 0;
function checar(condicao: boolean, descricao: string): void {
  if (condicao) {
    console.log(`  OK   ${descricao}`);
  } else {
    console.log(`  FAIL ${descricao}`);
    falhas++;
  }
}

console.log("=== TOPOLOGIA — setas de runtime vs. cadeia só testável ===");

const doCritico = alcancaveis(CRITICO);
const doAssincrono = alcancaveis(ASSINCRONO);

console.log(
  `\ncrítico alcança ${doCritico.size} arquivos · assíncrono alcança ${doAssincrono.size}\n`,
);

console.log("MAPA");
const mapa: { seta: string; runtime: boolean; critico: boolean }[] = [];
for (const no of CADEIA) {
  const existe = existsSync(resolve(RAIZ, no.arquivo));
  const noAssincrono = contem(doAssincrono, no.arquivo);
  const noCritico = contem(doCritico, no.arquivo);
  const onde = !existe
    ? "ARQUIVO AUSENTE"
    : noAssincrono
      ? "RUNTIME (assíncrono)"
      : noCritico
        ? "RUNTIME (crítico)"
        : "SÓ TEST HARNESS";
  console.log(`  ${no.seta.padEnd(24)} ${onde}`);
  mapa.push({ seta: no.seta, runtime: noAssincrono || noCritico, critico: noCritico });
}

console.log("\nINVARIANTE — inteligência fora do caminho crítico");
for (let i = 0; i < CADEIA.length; i++) {
  if (i + 1 < PRIMEIRA_SETA_DE_INTELIGENCIA) continue;
  checar(
    !mapa[i].critico,
    `${CADEIA[i].seta} NÃO é alcançável a partir de ${CRITICO}`,
  );
}

console.log("\nCOBERTURA — a cadeia inteira existe no processo assíncrono");
for (const linha of mapa) {
  checar(linha.runtime, `${linha.seta} existe no runtime`);
}

console.log(
  `\n${falhas === 0 ? "TOPOLOGIA OK" : `TOPOLOGIA: ${falhas} seta(s) fora do runtime`}`,
);

// A cobertura só passa a ser exigência depois que a espinha existir. Antes
// disso o valor desta unidade é o MAPA, não o veredito — por isso o código de
// saída acompanha apenas a invariante do crítico, que vale desde sempre.
const invarianteQuebrada = mapa
  .slice(PRIMEIRA_SETA_DE_INTELIGENCIA - 1)
  .some((l) => l.critico);

if (invarianteQuebrada) {
  console.error("\nINTELIGÊNCIA NO CAMINHO CRÍTICO — reprovado");
  process.exit(1);
}
process.exit(0);
