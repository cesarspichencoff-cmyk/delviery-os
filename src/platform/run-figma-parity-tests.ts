/**
 * GATE DE PARIDADE — organismo operacional · Figma ↔ codigo ↔ movimento
 * ============================================================================
 * Ele protege a MATRIZ (`docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md`), nao o
 * pixel. Posicao absoluta e fragil: um frame movido 8px derrubaria o gate sem
 * que nada de verdade tivesse mudado. O que ele protege e:
 *
 *   presenca      — todo cenario obrigatorio tem linha
 *   semantica     — Cozinha e Sushi Quentes nao se confundem; fluxo != espera
 *   rastreabilidade — arquivo citado existe no disco; node ID e real ou declarado pendente
 *   classificacao — demonstracao, futuro e contrato preparado nunca viram producao
 *
 * A COLUNA NODE ID, E POR QUE ELA NAO E SO "PREENCHIDA OU NAO". A cota do plano
 * Figma cortou leitura e escrita no meio da missao (PB13). Inventar ID faria a
 * matriz mentir sobre qual e a expressao vigente. Entao o gate aceita DOIS
 * valores e so dois: um ID real no formato `123:456`, ou o token exato
 * `PENDENTE-PB13`. Qualquer outra coisa — vazio, tracinho, "TBD", ID malformado
 * — reprova. E uma linha pendente nao pode se declarar sincronizada.
 *
 * Quando os frames existirem, trocar o token pelo ID real deixa o gate verde
 * sozinho, sem afrouxar nenhuma asercao.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");

const MATRIZ = "docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md";
const MOTION = "docs/figma/MOTION_SYSTEM.md";
const PENDENTE = "PENDENTE-PB13";
const NODE_ID_REAL = /^`?\d+:\d+`?$/;

let passed = 0;
const failures: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Leitura da matriz como TABELA, nao como texto corrido.              */
/* Procurar por substring passaria com a palavra citada em qualquer    */
/* paragrafo — e a matriz precisa ter a LINHA, com as colunas.         */
/* ------------------------------------------------------------------ */

interface Linha {
  readonly celulas: readonly string[];
  readonly bruta: string;
}

/** Primeira celula de cada cabecalho de tabela desta matriz. */
const CABECALHOS = new Set(["Cenário", "Nome exibido"]);

function tabela(md: string, tituloDaSecao: string): readonly Linha[] {
  const partes = md.split(tituloDaSecao);
  assert.ok(partes.length > 1, `secao ausente na matriz: ${tituloDaSecao}`);
  const corpo = partes[1]!.split(/\n## /)[0]!;
  return corpo
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => ({
      bruta: l,
      celulas: l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    }))
    .filter((l) => !/^-+$/.test(l.celulas[0]!.replace(/[-: ]/g, "-")))
    // O cabecalho e a linha separadora saem; o resto e dado.
    .filter((l) => !CABECALHOS.has(l.celulas[0]!) && l.celulas[0] !== "");
}

const COLUNAS = [
  "Cenário",
  "Página",
  "Node ID",
  "Rota/estado",
  "Arquivo/componente",
  "Origem",
  "Real/demonstração",
  "Movimento",
  "Token",
  "Reduced motion",
  "Teste",
  "Divergência",
] as const;

const DESKTOP = [
  "Calmo",
  "Ambiente",
  "Ambiente com duas pressões",
  "Foco",
  "Aproximação de Sushi",
  "Aproximação de Cozinha",
  "Informação parcial",
  "Sem integração",
  "Falha persistente",
  "Recuperação",
] as const;

const MOBILE = [
  "Visão geral",
  "Calmo",
  "Ambiente",
  "Foco",
  "Aproximação",
  "Retorno",
  "Sem medição",
  "Falha técnica",
] as const;

const md = ler(MATRIZ);
const desktop = tabela(md, "## 2. Cenários obrigatórios — desktop");
const mobile = tabela(md, "## 3. Cenários obrigatórios — mobile");
const estrutura = tabela(md, "## 4. Estrutura das áreas");
const todas = [...desktop, ...mobile];

/* ================================================================== */
/* P1-P4 · PRESENCA                                                    */
/* ================================================================== */

teste("P1 os dez cenarios obrigatorios de desktop tem linha propria", () => {
  const nomes = desktop.map((l) => l.celulas[0]);
  for (const c of DESKTOP) {
    assert.ok(nomes.includes(c), `cenario desktop ausente da matriz: ${c}`);
  }
  assert.equal(desktop.length, DESKTOP.length, "a tabela desktop mudou de tamanho");
});

teste("P2 os oito cenarios obrigatorios de mobile tem linha propria", () => {
  const nomes = mobile.map((l) => l.celulas[0]);
  for (const c of MOBILE) {
    assert.ok(nomes.includes(c), `cenario mobile ausente da matriz: ${c}`);
  }
  assert.equal(mobile.length, MOBILE.length, "a tabela mobile mudou de tamanho");
});

teste("P3 Calmo, Ambiente e Foco existem nas DUAS superficies", () => {
  for (const estado of ["Calmo", "Ambiente", "Foco"]) {
    assert.ok(
      desktop.some((l) => l.celulas[0] === estado),
      `${estado} sumiu do desktop`,
    );
    assert.ok(
      mobile.some((l) => l.celulas[0] === estado),
      `${estado} sumiu do mobile`,
    );
  }
});

teste("P4 toda linha tem as doze colunas da matriz canonica", () => {
  const cabecalho = md
    .split("## 2. Cenários obrigatórios — desktop")[1]!
    .split("\n")
    .find((l) => l.includes("| Cenário |"));
  assert.ok(cabecalho, "a tabela desktop perdeu o cabecalho");
  const cols = cabecalho.split("|").slice(1, -1).map((c) => c.trim());
  assert.deepEqual(cols, [...COLUNAS], "as colunas da matriz mudaram");
  for (const l of todas) {
    assert.equal(
      l.celulas.length,
      COLUNAS.length,
      `linha com numero de colunas errado: ${l.celulas[0]}`,
    );
  }
});

/* ================================================================== */
/* T1-T3 · TAXONOMIA                                                   */
/* ================================================================== */

teste("T1 Cozinha e Sushi Quentes sao areas DIFERENTES, com ids diferentes", () => {
  const linha = (nome: string) => estrutura.find((l) => l.celulas[0] === nome);
  const cozinha = linha("Cozinha");
  const quentes = linha("Sushi Quentes");
  assert.ok(cozinha, "a estrutura perdeu a Cozinha");
  assert.ok(quentes, "a estrutura perdeu Sushi Quentes");
  assert.equal(cozinha.celulas[1], "`cozinha_quentes`");
  assert.equal(quentes.celulas[1], "`enrolados_quentes`");
  assert.equal(cozinha.celulas[2], "Cozinha");
  assert.equal(quentes.celulas[2], "Sushi");
  assert.notEqual(
    cozinha.celulas[1],
    quentes.celulas[1],
    "Cozinha e Sushi Quentes colidiram de identificador",
  );
});

teste("T2 a taxonomia da matriz e IGUAL a de areas.ts, area a area", () => {
  // O codigo escreve rotulo sem acento ("Conferencia"); o documento escreve em
  // portugues correto ("Conferência"). A comparacao e do NOME, nao da grafia —
  // normalizar aqui evita exigir que um dos dois lados fique errado.
  const semAcento = (s: string): string =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ts = semAcento(ler("src/product/viewmodels/areas.ts"));
  for (const l of estrutura) {
    const rotulo = semAcento(l.celulas[0]!);
    const id = l.celulas[1]!.replace(/`/g, "");
    if (["caixa", "sushi", "cozinha", "conferencia", "motoboy"].includes(id)) {
      assert.match(
        ts,
        new RegExp(`id:\\s*"${id}"[\\s\\S]{0,120}rotulo:\\s*"${rotulo}"`),
        `ambiente divergente entre matriz e areas.ts: ${rotulo}`,
      );
    } else {
      assert.match(
        ts,
        new RegExp(`id:\\s*"${id}",?[\\s\\S]{0,60}rotulo:\\s*"${rotulo}"`),
        `praca divergente entre matriz e areas.ts: ${rotulo} (${id})`,
      );
    }
  }
  assert.equal(estrutura.length, 9, "a estrutura deixou de ter as 9 areas");
});

teste("T3 as nove areas da estrutura estao todas presentes", () => {
  const nomes = estrutura.map((l) => l.celulas[0]);
  for (const a of [
    "Caixa",
    "Sushi",
    "Combinados",
    "Duplas",
    "Enrolados",
    "Sushi Quentes",
    "Cozinha",
    "Conferência",
    "Motoboy",
  ]) {
    assert.ok(nomes.includes(a), `area ausente da estrutura: ${a}`);
  }
});

/* ================================================================== */
/* A1-A3 · AUSENCIA DECLARADA                                          */
/* ================================================================== */

teste("A1 sem medicao existe e NUNCA aparece como saudavel", () => {
  const parcial = desktop.find((l) => l.celulas[0] === "Informação parcial");
  const semMedicao = mobile.find((l) => l.celulas[0] === "Sem medição");
  assert.ok(parcial, "informacao parcial sumiu do desktop");
  assert.ok(semMedicao, "sem medicao sumiu do mobile");
  assert.equal(parcial.celulas[6], "sem fonte");
  assert.equal(semMedicao.celulas[6], "sem fonte");
  const caixa = estrutura.find((l) => l.celulas[0] === "Caixa");
  assert.match(caixa!.celulas[4]!, /nunca verde/i, "a Caixa perdeu a declaracao de ausencia");
});

teste("A2 falha tecnica existe nas duas superficies e NAO anima", () => {
  const d = desktop.find((l) => l.celulas[0] === "Falha persistente");
  const m = mobile.find((l) => l.celulas[0] === "Falha técnica");
  assert.ok(d && m, "falha tecnica sumiu de uma das superficies");
  for (const l of [d!, m!]) {
    assert.match(l.celulas[7]!, /nenhum, por regra/i, `falha tecnica ganhou movimento: ${l.celulas[0]}`);
    assert.equal(l.celulas[8], "—", "falha tecnica ganhou token de movimento");
  }
});

teste("A3 sem integracao e uma linha propria, distinta de sem fonte", () => {
  const si = desktop.find((l) => l.celulas[0] === "Sem integração");
  assert.ok(si, "sem integracao sumiu da matriz");
  assert.equal(si.celulas[6], "sem integração");
  const parcial = desktop.find((l) => l.celulas[0] === "Informação parcial");
  assert.notEqual(
    si.celulas[6],
    parcial!.celulas[6],
    "sem integracao e sem fonte viraram a mesma coisa",
  );
});

teste("A4 recuperacao existe, e existe como contrato preparado", () => {
  const r = desktop.find((l) => l.celulas[0] === "Recuperação");
  assert.ok(r, "recuperacao sumiu da matriz");
  assert.match(r.celulas[6]!, /contrato preparado/i);
  assert.match(r.celulas[7]!, /não implementado/i, "recuperacao passou a alegar implementacao");
});

/* ================================================================== */
/* M1-M3 · MOVIMENTO                                                   */
/* ================================================================== */

teste("M1 fluxo e espera sao linguagens DIFERENTES, nos dois lados", () => {
  const secao = md.split("## 6. Movimento")[1]!.split("\n## ")[0]!;
  assert.match(secao, /ligação `ativa` = tracejado \*\*parado\*\*/i, "D55 perdeu a espera");
  assert.match(
    secao,
    /ligação `carregada` = tracejado \*\*em movimento\*\*/i,
    "D55 perdeu o fluxo",
  );
  // Controle: as duas descricoes nao podem ser a mesma frase.
  const ativa = /ligação `ativa` = tracejado \*\*(\w+)\*\*/.exec(secao)![1];
  const carregada = /ligação `carregada` = tracejado \*\*(em movimento|parado)\*\*/.exec(secao)![1];
  assert.notEqual(ativa, carregada, "fluxo e espera viraram a mesma linguagem");
  // E o codigo precisa concordar: so `carregada` anima.
  const css = ler("src/product/ui/surfaces/home.css");
  const ativaCss = /\.org-fio\[data-intensidade="ativa"\][^}]*}/s.exec(css)![0];
  const carregadaCss = /\.org-fio\[data-intensidade="carregada"\][^}]*}/s.exec(css)![0];
  assert.doesNotMatch(ativaCss, /animation:\s*orgFluxo/, "a espera voltou a animar no CSS");
  assert.match(carregadaCss, /animation:\s*orgFluxo/, "o fluxo parou de animar no CSS");
});

teste("M2 as cinco regras do organismo estao registradas na matriz", () => {
  const secao = md.split("## 6. Movimento")[1]!.split("\n## ")[0]!;
  for (const regra of [
    /pulso de vida \*\*ativo em Calmo\*\*/i,
    /pulso de vida \*\*interrompido em Foco\*\*/i,
    /estado crítico vence movimento/i,
    /falha técnica não\s*\**\s*pulsa/i,
    /movimento não existe sem significado/i,
  ]) {
    assert.match(secao, regra, `regra de movimento ausente: ${regra}`);
  }
});

teste("M3 nenhum token de movimento foi inventado na matriz", () => {
  const canon = JSON.parse(ler("docs/figma/MOTION_TOKENS.json")) as {
    duracao: Record<string, string>;
    easing: Record<string, string>;
    distancia: Record<string, string>;
  };
  const organismo = ler("src/product/ui/tokens/organismo-tokens.css");
  const citados = new Set<string>();
  for (const l of todas) {
    for (const t of l.celulas[8]!.matchAll(/--org-[a-z-]+/g)) citados.add(t[0]);
  }
  assert.ok(citados.size >= 3, "a matriz deixou de citar tokens de movimento");
  for (const t of citados) {
    assert.ok(organismo.includes(`${t}:`), `token citado nao existe no organismo: ${t}`);
    const decl = new RegExp(`${t}:\\s*([^;]+);`).exec(organismo)![1]!;
    const derivaDoCanon =
      /var\(--motion-[a-z-]+\)/.test(decl) || /calc\(var\(--motion-[a-z-]+\)/.test(decl);
    assert.ok(derivaDoCanon, `token do organismo nao deriva do canone: ${t} = ${decl}`);
    const usados = decl.match(/--motion-[a-z-]+/g) ?? [];
    for (const u of usados) {
      const chave = u.replace("--", "");
      assert.ok(
        chave in canon.duracao || chave in canon.easing || chave in canon.distancia,
        `token canonico inexistente: ${u}`,
      );
    }
  }
});

/* ================================================================== */
/* RM1-RM2 · REDUCED MOTION                                            */
/* ================================================================== */

teste("RM1 reduced motion esta documentado com medicao real, nas seis cenas", () => {
  const secao = md.split("## 7. Reduced motion")[1]!.split("\n## ")[0]!;
  assert.match(secao, /Emulation\.setEmulatedMedia/, "a matriz perdeu a prova de emulacao real");
  assert.match(secao, /prefers-reduced-motion: reduce/, "a matriz perdeu a preferencia exercitada");
  const linhas = secao.split("\n").filter((l) => l.trim().startsWith("|") && l.includes("**0 / 0**"));
  assert.equal(linhas.length, 6, "as seis cenas de reduced motion nao estao todas medidas");
  for (const l of linhas) {
    const cels = l.split("|").slice(1, -1).map((c) => c.trim());
    const [antes, depois] = [cels[3], cels[4]];
    assert.match(antes!, /^\d+ = \d+$/, `contagem de caracteres ausente: ${cels[0]}`);
    const [a, b] = antes!.split(" = ");
    assert.equal(a, b, `a informacao mudou com reduced motion em ${cels[0]}`);
    const [va, vb] = depois!.split(" = ");
    assert.equal(va, vb, `area desapareceu com reduced motion em ${cels[0]}`);
  }
});

teste("RM2 o sistema de movimento declara o comportamento de reduced motion", () => {
  const tokens = JSON.parse(ler("docs/figma/MOTION_TOKENS.json")) as {
    reduced_motion: { media_query: string; comportamento: string };
  };
  assert.equal(tokens.reduced_motion.media_query, "@media (prefers-reduced-motion: reduce)");
  assert.match(tokens.reduced_motion.comportamento, /nenhuma informacao vive so no movimento/i);
  assert.match(ler(MOTION), /movimento comunica mudança de estado/i);
});

/* ================================================================== */
/* R1-R3 · RASTREABILIDADE                                             */
/* ================================================================== */

teste("R1 todo cenario obrigatorio tem celula de Node ID, real ou declarada pendente", () => {
  for (const l of todas) {
    const id = l.celulas[2]!.replace(/`/g, "");
    const ok = id === PENDENTE || NODE_ID_REAL.test(l.celulas[2]!);
    assert.ok(
      ok,
      `Node ID nem real nem declarado pendente em "${l.celulas[0]}": ${JSON.stringify(id)}`,
    );
  }
});

teste("R2 linha com node ID pendente nao pode se declarar sincronizada", () => {
  for (const l of todas) {
    const pendente = l.celulas[2]!.replace(/`/g, "") === PENDENTE;
    if (!pendente) continue;
    assert.match(
      l.celulas[11]!,
      /Figma ausente|Divergência D-O\d/,
      `linha pendente sem divergencia declarada: ${l.celulas[0]}`,
    );
    assert.doesNotMatch(
      l.celulas[11]!,
      /sincronizad|paridade (ok|verificada)/i,
      `linha pendente se declarando sincronizada: ${l.celulas[0]}`,
    );
  }
});

teste("R3 todo arquivo citado pela matriz existe no disco", () => {
  const alvos = new Set<string>();
  for (const bloco of [md]) {
    for (const m of bloco.matchAll(/`((?:docs|src|tools)\/[A-Za-z0-9_\-./]+\.[a-z]{2,4})`/g)) {
      alvos.add(m[1]!);
    }
    for (const m of bloco.matchAll(/`(surfaces|viewmodels)\/([a-z-]+\.(?:js|ts|css))`/g)) {
      alvos.add(`src/product/${m[1] === "surfaces" ? "ui/surfaces" : "viewmodels"}/${m[2]}`);
    }
    for (const m of bloco.matchAll(/`(home-vm|sinais|areas|seed-home-demonstracao)\.ts`/g)) {
      const base = m[1] === "seed-home-demonstracao" ? "src/product/demo" : "src/product/viewmodels";
      alvos.add(`${base}/${m[1]}.ts`);
    }
  }
  assert.ok(alvos.size >= 8, `a matriz deixou de citar arquivos rastreaveis (${alvos.size})`);
  for (const a of alvos) {
    assert.ok(existsSync(join(raiz, a)), `a matriz aponta para arquivo inexistente: ${a}`);
  }
});

/* ================================================================== */
/* C1-C3 · CLASSIFICACAO                                               */
/* ================================================================== */

const CLASSES = [
  "real",
  "derivado",
  "demonstração",
  "futuro",
  "contrato preparado",
  "sem integração",
  "sem fonte",
];

teste("C1 toda linha declara uma classe do vocabulario, e so dele", () => {
  for (const l of todas) {
    const c = l.celulas[6]!;
    assert.ok(
      CLASSES.some((k) => c.includes(k)),
      `classificacao fora do vocabulario em "${l.celulas[0]}": ${c}`,
    );
  }
});

teste("C2 demonstracao, futuro e contrato preparado NUNCA aparecem como producao", () => {
  const naoProducao = todas.filter((l) =>
    /demonstração|futuro|contrato preparado/i.test(l.celulas[6]!),
  );
  assert.ok(naoProducao.length >= 2, "a matriz perdeu as linhas nao-produtivas");
  for (const l of naoProducao) {
    assert.doesNotMatch(
      l.celulas[6]!,
      /^real$/i,
      `linha nao-produtiva marcada como real: ${l.celulas[0]}`,
    );
    assert.match(
      `${l.celulas[7]} ${l.celulas[11]}`,
      /não implementado|não animado|futuro|Divergência D-O\d/i,
      `linha nao-produtiva sem a ressalva visivel: ${l.celulas[0]}`,
    );
  }
  const secao = md.split("## 6. Movimento")[1]!.split("\n## ")[0]!;
  for (const proibido of [
    "Text Morph",
    "Confirmação de ação",
    "Progresso de ação",
    "Fechamento de turno",
    "Previsão",
    "Voz",
    "Resolução automatizada",
  ]) {
    const linha = secao.split("\n").find((l) => l.includes(proibido) && l.startsWith("|"));
    assert.ok(linha, `movimento proibido sumiu da lista: ${proibido}`);
    assert.match(linha, /\*\*não\*\*/, `movimento proibido deixou de ser proibido: ${proibido}`);
  }
});

teste("C3 a matriz declara em letra propria o que nao pode afirmar", () => {
  const secao = md.split("## 9. O que esta matriz proíbe afirmar")[1];
  assert.ok(secao, "a matriz perdeu a secao das proibicoes");
  assert.match(secao, /Não representa/i, "a matriz parou de declarar que o Figma nao representa");
  assert.match(secao, /não existem/i, "a matriz parou de declarar que os node ID pendentes nao existem");
  assert.match(secao, /PB12/, "a matriz parou de declarar que o OriginKit nao foi analisado");
});

teste("C4 controle positivo: o gate reprova classificacao fabricada", () => {
  // Sem este caso, C1 passaria por acidente se `some` fosse trocado por algo
  // sempre verdadeiro. Aqui a asercao e a mesma, sobre um valor que sabidamente
  // NAO pertence ao vocabulario.
  assert.equal(
    CLASSES.some((k) => "producao verificada".includes(k)),
    false,
  );
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nParidade Figma ↔ codigo ↔ movimento: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("FIGMA_PARITY_GATE_GREEN");
});
