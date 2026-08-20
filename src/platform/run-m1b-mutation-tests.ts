/**
 * M1B — SUÍTE ADVERSARIAL.
 * ============================================================================
 * Uma garantia que nunca foi quebrada de propósito não é garantia: é esperança
 * com nome de teste. Aqui cada propriedade que M1B afirma proteger recebe uma
 * quebra desenhada para derrubá-la, e o que se mede é se alguma coisa acusa.
 *
 * AS TRÊS REGRAS DESTA SUÍTE
 *
 * 1. APLICAÇÃO É PROVADA, NUNCA ASSUMIDA. `MUTACAO_APLICADA` e `TESTE_REPROVOU`
 *    são duas afirmações independentes, e a segunda só vale se a primeira for
 *    verdadeira. Seis mutações do Lab passaram meses sem aplicar porque ninguém
 *    separava as duas (M1B-R2, A). Aqui a aplicação é conferida NO DISCO, por
 *    hash, depois da escrita.
 *
 * 2. RESTAURAÇÃO É BYTE A BYTE, inclusive quando a mutação falha no meio.
 *
 * 3. SÓ SE TESTA A PROPRIEDADE QUE O MÉTODO CONSEGUE MEDIR. Mutação perceptiva
 *    medida por regex não prova percepção — prova que o regex casou. As
 *    perceptivas vivem em `run-m1b-perceptual-tests.ts`, medidas no navegador,
 *    em geometria real.
 *
 * Fim de linha: tudo compara em LF. CRLF é artefato de checkout.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

import { inventarioDeCongelamento, arquivosComGate } from "./inventario-congelamento";
import {
  classificar,
  lerProtocolo,
  SemMarcadorLegal,
  ESTADO_TRABALHO_LEGITIMO_RESTANTE,
  CAMINHO_PROTOCOLO,
} from "./marcadores-m1b";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/**
 * As flags de carregamento que o `tsx` injetou NESTE processo.
 *
 * MEDIDO, e o motivo importa: a primeira versão desta suíte chamava
 * `npx tsx <arquivo>` por `execFileSync`. No Windows, `npx.cmd` devolve EINVAL e
 * `npx` devolve ENOENT — os dois com ZERO byte de saída. O guarda nunca rodava,
 * `r.ok` vinha `false` por causa do spawn, e a suíte lia isso como "o guarda
 * reprovou". Oito mutações apareceram como acusadas sem nenhuma delas ter
 * chegado a executar um guarda.
 *
 * É a mesma armadilha da §A com outra roupa: confundir "o comando falhou" com
 * "a propriedade foi defendida". Por isso o filho agora é o próprio `node`,
 * reaproveitando as flags do pai — que é como o Lab V4 já fazia.
 */
function flagsDeCarregamento(): string[] {
  const flags: string[] = [];
  const argv = process.execArgv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--require" || argv[i] === "--import") {
      flags.push(argv[i]!, argv[i + 1]!);
      i += 1;
    }
  }
  return flags;
}

function rodar(script: string): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(process.execPath, [...flagsDeCarregamento(), script], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    // Spawn quebrado NÃO é guarda acusando. Se o filho não produziu saída
    // nenhuma, isto é falha de ambiente e precisa gritar, não passar por prova.
    if (saida.trim() === "") {
      return { ok: false, saida: `__SPAWN_FALHOU__ code=${err.code ?? "?"} sem saida` };
    }
    return { ok: false, saida };
  }
}

interface Aplicacao {
  readonly aplicou: boolean;
  readonly motivo: string;
  readonly original: string;
  readonly hashAntes: string;
  readonly hashDepois: string;
}

/**
 * Aplica a troca e PROVA no disco que ela entrou. Guarda o original inteiro
 * para a restauração poder ser byte a byte.
 */
function aplicar(rel: string, de: string, para: string): Aplicacao {
  const caminho = join(raiz, rel);
  const original = readFileSync(caminho, "utf8");
  const hashAntes = sha(original);
  const usaCRLF = original.includes("\r\n");
  const emLF = original.replace(/\r\n/g, "\n");
  if (!emLF.includes(de)) {
    return {
      aplicou: false,
      motivo: `ancora nao encontrada em ${rel}`,
      original,
      hashAntes,
      hashDepois: "",
    };
  }
  const mutado = emLF.replace(de, () => para);
  if (mutado === emLF) {
    return { aplicou: false, motivo: "a troca nao mudou nada", original, hashAntes, hashDepois: "" };
  }
  writeFileSync(caminho, usaCRLF ? mutado.replace(/\n/g, "\r\n") : mutado);
  const noDisco = readFileSync(caminho, "utf8");
  const hashDepois = sha(noDisco);
  const entrou = hashDepois !== hashAntes && noDisco.replace(/\r\n/g, "\n").includes(para);
  if (!entrou) {
    writeFileSync(caminho, original);
    return {
      aplicou: false,
      motivo: "escrita feita, disco nao confirmou",
      original,
      hashAntes,
      hashDepois,
    };
  }
  return { aplicou: true, motivo: "", original, hashAntes, hashDepois };
}

function restaurar(rel: string, a: Aplicacao): void {
  writeFileSync(join(raiz, rel), a.original);
  const volta = sha(readFileSync(join(raiz, rel), "utf8"));
  assert.equal(volta, a.hashAntes, `RESTAURACAO FALHOU em ${rel}`);
}

/**
 * O contrato de uma mutação de arquivo: aplica (provado no disco), roda o
 * guarda, exige reprovação COM ASSINATURA, restaura (provado). Sempre.
 */
function mutacao(opts: {
  id: string;
  propriedade: string;
  arquivo: string;
  de: string;
  para: string;
  guarda: string;
  assinatura: RegExp;
}): void {
  teste(`${opts.id} — ${opts.propriedade}`, () => {
    const a = aplicar(opts.arquivo, opts.de, opts.para);
    assert.ok(a.aplicou, `MUTACAO NAO APLICADA: ${a.motivo}`);
    console.log(
      `        aplicada · ${opts.arquivo} · ${a.hashAntes.slice(0, 10)} -> ${a.hashDepois.slice(0, 10)}`,
    );
    try {
      const r = rodar(opts.guarda);
      assert.doesNotMatch(
        r.saida,
        /__SPAWN_FALHOU__/,
        "o guarda nem chegou a rodar — isso e falha de ambiente, nao propriedade defendida",
      );
      assert.ok(!r.ok, "o guarda ficou VERDE com a mutacao aplicada — MUTACAO CEGA");
      assert.match(r.saida, opts.assinatura, "reprovou, mas NAO pela assinatura esperada");
    } finally {
      restaurar(opts.arquivo, a);
      console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
    }
  });
}

console.log("\n=== M1B — SUITE ADVERSARIAL ===\n");

/* ================================================================== *
 * A. INVENTÁRIO — EXPECTED_DIRECTORY_INVENTORY_BLINDNESS
 * ================================================================== */
console.log("A. INVENTARIO");

teste("MI1 EXPECTED_DIRECTORY_INVENTORY_BLINDNESS — o gate muda de pasta e o inventario continua achando", () => {
  // A MUTAÇÃO: um gate de congelamento SAI do diretório esperado e vai para um
  // lugar onde ninguém procura. O comportamento protegido NÃO é apagado — o
  // arquivo continua existindo, byte a byte igual, com a mesma asserção.
  //
  // Quem inventaria por PROPRIEDADE tem que continuar achando.
  // Quem inventaria por LUGAR tem que morrer. As duas metades são medidas,
  // porque sem a segunda daria para "passar" sem que a suposição de diretório
  // tivesse virado falsa — e aí o teste não testaria nada.
  const origem = "src/platform/run-r5a-temporal-tests.ts";
  const destinoDir = "tools/_realocado_mutacao";
  const destino = `${destinoDir}/run-r5a-temporal-tests.ts`;
  const hashAntes = sha(readFileSync(join(raiz, origem), "utf8"));

  const propriedadeAntes = inventarioDeCongelamento(raiz).length;
  const porDiretorioAntes = arquivosComGate(raiz).filter((f) =>
    f.startsWith("src/platform/"),
  ).length;

  mkdirSync(join(raiz, destinoDir), { recursive: true });
  renameSync(join(raiz, origem), join(raiz, destino));
  try {
    assert.ok(!existsSync(join(raiz, origem)), "MUTACAO NAO APLICADA: o arquivo nao saiu do lugar");
    assert.ok(existsSync(join(raiz, destino)), "MUTACAO NAO APLICADA: o arquivo nao chegou");
    assert.equal(
      sha(readFileSync(join(raiz, destino), "utf8")),
      hashAntes,
      "o comportamento protegido foi ALTERADO — a mutacao tinha que so mudar de lugar",
    );
    console.log(
      `        aplicada · ${origem} -> ${destino} · conteudo intacto ${hashAntes.slice(0, 10)}`,
    );

    const arquivosDepois = arquivosComGate(raiz);
    const propriedadeDepois = inventarioDeCongelamento(raiz).length;
    const porDiretorioDepois = arquivosDepois.filter((f) =>
      f.startsWith("src/platform/"),
    ).length;

    // (1) POR PROPRIEDADE sobrevive: acha o mesmo tanto de comportamento.
    assert.equal(
      propriedadeDepois,
      propriedadeAntes,
      `o inventario por propriedade PERDEU o gate realocado: ${propriedadeAntes} -> ${propriedadeDepois}`,
    );
    assert.ok(
      arquivosDepois.includes(destino),
      `o inventario por propriedade nao achou o gate em ${destino} — so olhou onde esperava`,
    );

    // (2) POR DIRETORIO morre.
    assert.equal(
      porDiretorioDepois,
      porDiretorioAntes - 1,
      "o metodo por diretorio NAO perdeu o gate — a mutacao nao tornou a suposicao falsa",
    );
    console.log(
      `        propriedade ${propriedadeAntes}->${propriedadeDepois} SOBREVIVEU · diretorio ${porDiretorioAntes}->${porDiretorioDepois} MORREU`,
    );
  } finally {
    renameSync(join(raiz, destino), join(raiz, origem));
    rmSync(join(raiz, destinoDir), { recursive: true, force: true });
    const volta = sha(readFileSync(join(raiz, origem), "utf8"));
    assert.equal(volta, hashAntes, "RESTAURACAO FALHOU: o gate nao voltou byte a byte");
    console.log(`        restaurado · ${volta.slice(0, 10)} == origem`);
  }
});

/* ================================================================== *
 * B. MARCADOR — PROTOCOL_STATE_GAP
 * ================================================================== */
console.log("\nB. MARCADOR");

teste("MM1 o estado real da rodada anterior tem marcador legal", () => {
  const m = classificar(ESTADO_TRABALHO_LEGITIMO_RESTANTE, lerProtocolo(raiz));
  assert.equal(m, "M1B_CONTINUATION_REQUIRED");
});

teste("MM2 MARKER_GAP — sem o marcador, o classificador RECUSA em vez de escolher o parecido", () => {
  const a = aplicar(
    CAMINHO_PROTOCOLO,
    // A REGRA INTEIRA SAI, e não só o nome dela.
    //
    // A primeira tentativa renomeava o marcador para `__REMOVIDO__`. Isso
    // deixava a condição `implementacao: incompleta` no lugar, o classificador
    // casava com ela e devolvia o nome novo — e o teste passou a medir troca de
    // nome, não buraco de estado. Medido: devolveu
    // `__REMOVIDO_PELA_MUTACAO__` em vez de recusar.
    //
    // Removendo a regra, o estado fica REALMENTE sem marcador, que é a
    // condição que o buraco de protocolo produzia.
    [
      "    {",
      '      "marcador": "M1B_CONTINUATION_REQUIRED",',
      '      "quando": { "implementacao": "incompleta" },',
      '      "afirma": "Trabalho legitimo restante, sem blocker estrutural, ambiente sadio, sem contaminacao. ESTE E O MARCADOR QUE FALTAVA."',
      "    },",
      "",
    ].join("\n"),
    "",
  );
  assert.ok(a.aplicou, `MUTACAO NAO APLICADA: ${a.motivo}`);
  console.log(
    `        aplicada · ${CAMINHO_PROTOCOLO} · ${a.hashAntes.slice(0, 10)} -> ${a.hashDepois.slice(0, 10)}`,
  );
  try {
    let lancou = false;
    let devolvido = "";
    try {
      devolvido = classificar(ESTADO_TRABALHO_LEGITIMO_RESTANTE, lerProtocolo(raiz));
    } catch (e) {
      lancou = e instanceof SemMarcadorLegal;
    }
    // A propriedade NAO e "existe a constante". E: quando o estado nao tem
    // marcador, o sistema RECUSA. Devolver READY ou BLOCKED aqui e o buraco de
    // estado voltando com outra roupa.
    assert.ok(lancou, `o classificador devolveu "${devolvido}" — preferiu mentir a recusar`);
    assert.notEqual(devolvido, "BUILDER_READY_FOR_CESAR_VISUAL_REVIEW");
    assert.notEqual(devolvido, "M1B_ENVIRONMENT_BLOCKED");
  } finally {
    restaurar(CAMINHO_PROTOCOLO, a);
    console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
  }
});

teste("MM3 o protocolo diz, nele mesmo, o que o marcador de pronto NAO afirma", () => {
  const p = lerProtocolo(raiz);
  const pronto = p.marcadores.find(
    (m) => m.marcador === "BUILDER_READY_FOR_CESAR_VISUAL_REVIEW",
  );
  assert.ok(pronto, "o marcador de pronto sumiu do protocolo");
  assert.match(pronto.afirma, /NAO afirma aprovacao/);
  assert.ok(p._proibido.length >= 5, "a lista de frases proibidas encolheu");
});

/* ================================================================== *
 * C. SEMÂNTICAS / EXECUTÁVEIS
 * ================================================================== */
console.log("\nC. SEMANTICAS");

mutacao({
  id: "MS1",
  propriedade: "o gate de congelamento nao volta ao INTERVALO ABERTO",
  arquivo: "src/platform/run-r5b-invariant-tests.ts",
  de: '"--name-only", BASE, FIM_HISTORICO, "--"',
  para: '"--name-only", BASE, "--"',
  guarda: "src/platform/run-m1-bridge-tests.ts",
  // A assinatura é a acusação REAL, medida, e não a que eu previ. Eu esperava
  // "voltou a forma aberta" (a mensagem de C1) e a guarda acusa antes disso:
  // `lerGate` reprova no carregamento do módulo, dizendo que não achou a chamada
  // em forma FECHADA naquele arquivo. Ajustar a expectativa à acusação medida
  // não afrouxa nada — pelo contrário, aqui ela exige o NOME DO ARQUIVO junto
  // da propriedade, então outra quebra qualquer não passa por esta.
  assinatura: /run-r5b-invariant-tests\.ts:.*forma FECHADA/,
});

mutacao({
  id: "MS2",
  propriedade: "a home nao declara token proprio — a marca nasce no canone",
  arquivo: "src/product/ui/surfaces/home.css",
  de: ".org-sub__nome {",
  para: ".org-sub__nome {\n  --org-inventado-pela-mutacao: 1px;",
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /token proprio|O16/,
});

mutacao({
  id: "MS3",
  propriedade: "reduced motion nao esconde elemento",
  arquivo: "src/product/ui/surfaces/home.css",
  de: '  .org-area[data-degrau="3"] .org-area__corpo::after {\n    opacity: 0.55;\n  }',
  para: '  .org-area[data-degrau="3"] .org-area__corpo::after {\n    display: none;\n  }',
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /escondeu elemento|O14|O24/,
});

mutacao({
  id: "MS4",
  propriedade: "a evidencia nunca anima",
  arquivo: "src/product/ui/surfaces/home.css",
  de: ".org-foco__evidencias {",
  para: ".org-foco__evidencias {\n  animation: orgChegada 400ms both;",
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /ganhou animacao|O25/,
});

/* ================================================================== *
 * D. TEMPORAIS
 * ================================================================== */
console.log("\nD. TEMPORAIS");

mutacao({
  id: "MT1",
  propriedade: "fonte degradada NAO pulsa — falha tecnica nao vira vida",
  arquivo: "src/product/ui/surfaces/home.css",
  de: '.org-topo__vida[data-estado="falha"] .org-topo__ponto {\n  background: var(--org-falha-clara);\n  animation: none;\n}',
  para: '.org-topo__vida[data-estado="falha"] .org-topo__ponto {\n  background: var(--org-falha-clara);\n}',
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /O2[0-9]|animation|falha/,
});

mutacao({
  id: "MT2",
  propriedade: "nenhuma animacao move layout",
  arquivo: "src/product/ui/surfaces/home.css",
  de: "@keyframes orgChegada {",
  para: "@keyframes orgChegada {\n  from { height: 0; }",
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /move layout|O23/,
});

mutacao({
  id: "MT3",
  propriedade: "no Foco o pulso de vida PARA — estado critico vence movimento",
  arquivo: "src/product/ui/surfaces/home.css",
  de: '.org[data-modo="foco"] .org-topo__vida[data-estado="vivo"] .org-topo__ponto {\n  animation: none;\n}',
  para: '.org[data-modo="foco"] .org-topo__vida[data-estado="vivo"] .org-topo__ponto {\n  animation: orgPulso 4s infinite;\n}',
  guarda: "src/platform/run-organismo-visual-tests.ts",
  assinatura: /O22|pulso de vida|anel de pressao/,
});

/* ================================================================== *
 * Fecho
 * ================================================================== */
console.log(`\nadversarial: ${passaram} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.error(`  XX ${f}`);
if (falhas.length > 0) {
  console.error("\nM1B_MUTATION_GATE_RED");
  process.exit(1);
}
console.log("M1B_MUTATION_GATE_GREEN");
