/**
 * GATE DA EXPRESSAO CANONICA — O ORGANISMO OPERACIONAL
 * ============================================================================
 * AUTORIDADE: Sprint Visual DeliveryOS V2 (Nivel 1) e Organismo Operacional
 * V3.3 (Nivel 2). Ver docs/design/VISUAL_REFERENCE_HIERARCHY.md, PB9 e D52.
 *
 * Por que este gate existe SEPARADO do gate da home. O gate da home prova
 * COMPORTAMENTO: que os sinais certos nascem, que a ausencia nao vira zero, que
 * nada executa. Ele passou inteiro — 44 verdes — sobre uma expressao visual
 * errada. Um contrato de comportamento nao consegue reprovar uma grade de
 * cartoes, porque cartao e verdade estrutural correta com forma errada.
 *
 * O METODO. Estes testes renderizam a superficie de verdade (`telaHome`) e
 * olham o HTML e o CSS produzidos. Onde da, cada afirmacao vem com o seu par
 * simetrico: nao basta provar que a area em pressao cresce, e preciso provar que
 * a area sem medicao NAO cresce — senao um CSS que aumentasse tudo passaria.
 *
 * O QUE ELE NAO PROVA, e nao adianta fingir: ele nao prova beleza, nao prova
 * parentesco com o canone e nao substitui a inspecao no navegador. Duas
 * correcoes desta missao — o painel de Foco cobrindo a Conferencia e o
 * identificador cru na evidencia — so apareceram olhando a tela.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { homeVM, type HomeVM } from "../product/viewmodels/home-vm";
import { CENAS, cena, type CenaHome } from "../product/demo/seed-home-demonstracao";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");

/**
 * O CSS SEM COMENTARIOS. Necessario, e o motivo e um defeito que esta suite ja
 * cometeu: `bloco(".org-fio")` casava com a MENCAO ao seletor no comentario de
 * cabecalho e devolvia o bloco de outra regra. Um teste que le documentacao em
 * vez de codigo passa quando o codigo esta errado.
 */
const CSS = ler("src/product/ui/surfaces/home.css").replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = ler("src/product/ui/tokens/organismo-tokens.css");

const NOMES = Object.keys(CENAS) as CenaHome[];
const VMS: [CenaHome, HomeVM][] = NOMES.map((n) => [n, homeVM(cena(n))]);

let passed = 0;
const failures: string[] = [];
const pend: Promise<void>[] = [];

function teste(nome: string, fn: () => Promise<void> | void): void {
  pend.push(
    Promise.resolve()
      .then(fn)
      .then(
        () => {
          passed += 1;
        },
        (e: unknown) => {
          failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
        },
      ),
  );
}

/**
 * A superficie renderizada. `telaHome` e ESM puro: nada aqui toca o DOM.
 *
 * O caminho e montado em tempo de execucao porque a superficie e JavaScript sem
 * tipos — importa-la por literal faria `tsc` exigir um `.d.ts` que nao deve
 * existir: a home nao e biblioteca, e a fronteira certa dela e o view model,
 * que E tipado. O contrato de retorno fica declarado aqui.
 */
const CAMINHO_DA_SUPERFICIE = ["..", "product", "ui", "surfaces", "home.js"].join("/");

interface SuperficieHome {
  telaHome: (vm: HomeVM) => string;
}

async function superficie(): Promise<SuperficieHome> {
  return (await import(CAMINHO_DA_SUPERFICIE)) as SuperficieHome;
}

async function render(vm: HomeVM): Promise<string> {
  return (await superficie()).telaHome(vm);
}

/** Quantas vezes um seletor CSS aparece com um bloco proprio. */
function temRegra(seletor: string): boolean {
  return CSS.includes(seletor);
}

/** O bloco de declaracoes de um seletor, para comparar valores entre degraus. */
function bloco(seletor: string): string {
  const i = CSS.indexOf(seletor);
  if (i < 0) return "";
  const abre = CSS.indexOf("{", i);
  const fecha = CSS.indexOf("}", abre);
  return CSS.slice(abre + 1, fecha);
}

function px(decl: string, prop: string): number | null {
  const m = new RegExp(`${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(decl);
  return m ? Number(m[1]) : null;
}

/* ================================================================== *
 * 1. A superficie e um organismo, nao uma grade
 * ================================================================== */

teste("O1 a superficie tem UMA superficie e o caminho do pedido dentro dela", async () => {
  for (const [nome, vm] of VMS) {
    const html = await render(vm);
    assert.match(html, /class="org-superficie"/, `${nome}: sem superficie unica`);
    for (const fila of ["entrada", "producao", "fechamento", "saida"]) {
      assert.ok(
        html.includes(`data-fila="${fila}"`),
        `${nome}: a fileira ${fila} do caminho do pedido sumiu`,
      );
    }
    // As cinco areas estao TODAS na mesma superficie, sempre.
    for (const a of vm.ambientes) {
      assert.ok(html.includes(`data-area="${a.id}"`), `${nome}: ${a.id} sumiu da superficie`);
    }
  }
});

teste("O2 as areas NAO sao retangulos identicos", async () => {
  const html = await render(VMS[0]![1]);
  // Duas formas distintas, e ambas em uso.
  assert.match(html, /data-forma="nucleo"/);
  assert.match(html, /data-forma="pilula"/);
  // Nucleo e circulo; pilula e pilula. Se as duas virarem o mesmo raio, voltou a
  // ser cartao com outro nome.
  assert.match(bloco('.org-area[data-forma="nucleo"] .org-area__corpo'), /border-radius:\s*50%/);
  assert.match(
    bloco('.org-area[data-forma="pilula"] .org-area__corpo'),
    /border-radius:\s*var\(--org-raio-pilula\)/,
  );
});

teste("O3 controle negativo: a linguagem de cartao generico nao voltou", () => {
  // Barra de pressao percentual, medidor e grade de cartoes iguais foram os tres
  // anti-padroes nomeados no cabecalho do Pacote Visual V2. Nenhum pode existir.
  assert.ok(!/\.org-amb__barra|\.org-.*barra-fill/.test(CSS), "a barra de pressao voltou");
  assert.ok(
    !/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(\d+px,\s*1fr\)\)/.test(
      bloco(".org-superficie"),
    ),
    "a superficie virou grade de cartoes",
  );
  const js = ler("src/product/ui/surfaces/home.js");
  assert.ok(!/width:\$\{|style="width/.test(js), "a superficie voltou a desenhar largura por dado");
});

/* ================================================================== *
 * 2. Pressao muda a expressao — e a ausencia nao
 * ================================================================== */

teste("O4 a pressao altera a expressao da area, em degraus", () => {
  const n1 = px(bloco('.org-area[data-forma="nucleo"] .org-area__corpo'), "width");
  const n2 = px(bloco('.org-area[data-degrau="2"][data-forma="nucleo"] .org-area__corpo'), "width");
  const n3 = px(bloco('.org-area[data-degrau="3"][data-forma="nucleo"] .org-area__corpo'), "width");
  const n0 = px(bloco('.org-area[data-degrau="0"][data-forma="nucleo"] .org-area__corpo'), "width");
  assert.ok(n1 && n2 && n3 && n0, "os quatro degraus precisam de tamanho declarado");
  assert.ok(n2! > n1!, "o degrau de atencao nao cresce");
  assert.ok(n3! > n2!, "o degrau de pressao nao cresce");
  // PAR SIMETRICO: sem medicao NAO cresce. Sem isto, um CSS que aumentasse tudo
  // passaria nas duas asercoes acima.
  assert.ok(n0! < n1!, "area sem medicao cresceu como se tivesse leitura");
  // Cor nunca e o unico sinal: o degrau tambem muda cor de estado E de nome.
  assert.match(bloco('.org-area[data-degrau="3"] .org-area__nome'), /font-size/);
  assert.match(bloco('.org-area[data-degrau="3"] .org-area__estado'), /color/);
});

/**
 * ESTE TESTE NASCEU DE UMA MUTACAO CEGA. A rodada adversarial converteu
 * `sem_medicao` no degrau saudavel — uma linha em `degrau()` — e a suite inteira
 * continuou verde. O4 media o CSS dos degraus e nunca perguntava QUAL degrau
 * cada area recebe no HTML. Medir a regua nao e medir o que foi medido com ela.
 */
teste("O4b o degrau que a area recebe e o degrau que o motor deu", async () => {
  const esperado: Record<string, string> = {
    vermelho: "3",
    amarelo: "2",
    verde: "1",
    sem_medicao: "0",
  };
  let semMedicaoVistas = 0;
  for (const [nome, vm] of VMS) {
    const html = await render(vm);
    for (const a of vm.ambientes) {
      const m = new RegExp(
        `data-area="${a.id}"[^>]*data-cor="([^"]+)" data-degrau="([^"]+)"`,
      ).exec(html);
      assert.ok(m, `${nome}/${a.rotulo}: a area perdeu cor ou degrau no HTML`);
      assert.equal(m![1], a.cor, `${nome}/${a.rotulo}: a tela mudou a cor do motor`);
      assert.equal(
        m![2],
        esperado[a.cor],
        `${nome}/${a.rotulo}: cor ${a.cor} recebeu o degrau ${m![2]}`,
      );
      if (a.cor === "sem_medicao") {
        semMedicaoVistas += 1;
        assert.equal(
          m![2],
          "0",
          `${nome}/${a.rotulo}: area SEM FONTE recebeu degrau de area medida`,
        );
      }
      // O mesmo vale para a subarea: D46 nao vale so para o ambiente.
      for (const s of a.subareas) {
        const ms = new RegExp(`data-cor="${s.cor}" data-degrau="([^"]+)"[^>]*>\\s*<span class="org-sub__nome">${s.rotulo}`).exec(
          html.replace(/\n\s*/g, "\n"),
        );
        if (ms) {
          assert.equal(
            ms[1],
            esperado[s.cor],
            `${nome}/${s.rotulo}: subarea ${s.cor} recebeu degrau ${ms[1]}`,
          );
        }
      }
    }
  }
  // PAR: sem isto, um `esperado` vazio ou uma leitura sem areas sem fonte
  // passaria sem exercitar a garantia que importa.
  assert.ok(semMedicaoVistas >= 4, "nenhuma area sem fonte foi exercitada");
});

teste("O5 a porcentagem de pressao NUNCA vira tamanho", async () => {
  for (const [nome, vm] of VMS) {
    const html = await render(vm);
    for (const a of vm.ambientes) {
      if (a.pressao.observado === true) {
        const v = String(a.pressao.valor);
        assert.ok(
          !new RegExp(`width:\\s*${v}%|--[a-z-]+:\\s*${v}`).test(html),
          `${nome}/${a.rotulo}: a pressao ${v}% virou dimensao`,
        );
      }
    }
  }
});

/* ================================================================== *
 * 3. Ligacoes
 * ================================================================== */

teste("O6 a ligacao so fica ativa quando a dependencia esta ativa", async () => {
  const calmo = VMS.find(([n]) => n === "calmo")![1];
  const foco = VMS.find(([n]) => n === "foco")![1];

  assert.ok(
    calmo.ligacoes.every((l) => !l.ativa),
    "no Calmo alguma ligacao apareceu ativa",
  );
  assert.ok(
    foco.ligacoes.some((l) => l.intensidade === "carregada"),
    "no Foco nenhuma ligacao carregou",
  );

  const htmlCalmo = await render(calmo);
  const htmlFoco = await render(foco);
  assert.ok(
    !/data-intensidade="(ativa|carregada)"/.test(htmlCalmo),
    "o Calmo desenhou fio ativo",
  );
  assert.match(htmlFoco, /data-intensidade="carregada"/);
  // A relacao inerte nao ganha frase: nada a dizer, nada dito.
  assert.ok(
    calmo.ligacoes.every((l) => l.texto === null),
    "relacao inerte ganhou texto",
  );
  // E o fio inerte precisa ser quase invisivel — cor de caminho, nao de pressao.
  assert.match(bloco(".org-fio"), /stroke:\s*var\(--org-linha-caminho\)/);
});

teste("O7 area sem medicao nunca ORIGINA ligacao ativa", () => {
  for (const [nome, vm] of VMS) {
    const porId = new Map(vm.ambientes.map((a) => [a.id, a]));
    for (const l of vm.ligacoes) {
      if (!l.ativa) continue;
      const origem = porId.get(l.de)!;
      assert.notEqual(
        origem.cor,
        "sem_medicao",
        `${nome}: ${l.de} sem medicao empurrando pressao para ${l.para}`,
      );
    }
  }
  // Controle positivo: na cena degradada TODAS ficam inertes, e isso e o efeito
  // da regra, nao a ausencia dela.
  const deg = VMS.find(([n]) => n === "degradado")![1];
  assert.equal(deg.ligacoes.length, 5, "o caminho do pedido encolheu");
  assert.ok(deg.ligacoes.every((l) => !l.ativa));
});

/* ================================================================== *
 * 4. Falha tecnica fala em cinza, e nunca vira pressao
 * ================================================================== */

teste("O8 falha tecnica usa ardosia e NAO usa a linguagem de pressao", async () => {
  const deg = VMS.find(([n]) => n === "degradado")![1];
  const html = await render(deg);

  assert.match(html, /class="org-tecnico"/, "a faixa de falha tecnica sumiu");
  assert.match(html, /data-ausencia="sem_leitura"/, "nenhuma area declarou falha de leitura");
  // A hora da ultima leitura precisa aparecer: e a memoria do contrato tecnico.
  assert.match(html, /ultima leitura as \d{2}h\d{2}/);

  // NENHUMA area em degrau de pressao numa leitura degradada.
  assert.ok(!/data-degrau="[23]"/.test(html), "a falha tecnica pintou pressao");

  // A regra visual da falha e ardosia, nunca ambar.
  const b = bloco('.org-area[data-ausencia="sem_leitura"] .org-area__corpo');
  assert.match(b, /--org-falha/, "falha de leitura nao usa ardosia");
  assert.ok(!/--org-ambar/.test(b), "falha de leitura usa ambar");
  const faixa = bloco(".org-tecnico");
  assert.match(faixa, /--org-falha/);
  assert.ok(!/--org-ambar/.test(faixa), "a faixa tecnica usa ambar");
});

teste("O9 as duas ausencias sao DISTINGUIVEIS: sem integracao nao e falha", async () => {
  const deg = VMS.find(([n]) => n === "degradado")![1];
  const html = await render(deg);
  assert.match(html, /data-ausencia="sem_integracao"/);
  assert.match(html, /data-ausencia="sem_leitura"/);
  // Formas diferentes: tracejado neutro para o que nao existe, linha cheia
  // ardosia para o que existia e parou.
  assert.match(bloco('.org-area[data-degrau="0"] .org-area__corpo'), /border:\s*1px dashed/);
  assert.match(
    bloco('.org-area[data-ausencia="sem_leitura"] .org-area__corpo'),
    /border:\s*1px solid/,
  );
});

/* ================================================================== *
 * 5. Nada some
 * ================================================================== */

teste("O10 os ambientes em pressao continuam TODOS visiveis", async () => {
  const foco = VMS.find(([n]) => n === "foco")![1];
  const vermelhos = foco.ambientes.filter((a) => a.cor === "vermelho");
  assert.ok(vermelhos.length >= 2, "a cena de Foco perdeu os dois vermelhos");
  const html = await render(foco);
  for (const a of vermelhos) {
    assert.ok(
      html.includes(`data-area="${a.id}" data-forma`),
      `${a.rotulo} sumiu da superficie com o Foco aberto`,
    );
    assert.ok(html.includes(`>${a.rotulo}<`), `${a.rotulo} perdeu o nome na tela`);
  }
});

teste("O11 o Foco nao elimina os demais sinais", async () => {
  const foco = VMS.find(([n]) => n === "foco")![1];
  assert.ok(foco.foco !== null, "a cena de Foco nao produziu Foco");
  assert.ok(foco.sinais_em_segundo_plano.length > 5, "os demais sinais sumiram da view model");
  const html = await render(foco);
  assert.match(html, /class="org-foco"/);
  const linhas = html.match(/class="org-sinal"/g) || [];
  assert.equal(
    linhas.length,
    foco.sinais_em_segundo_plano.length,
    "a superficie escondeu sinais de segundo plano",
  );
  // E UMA orientacao principal, nao duas.
  const pilulas = html.match(/class="org-acao__pilula"/g) || [];
  assert.ok(pilulas.length <= 1, "apareceu mais de uma orientacao principal");
});

teste("O12 a aproximacao preserva o resto da operacao", async () => {
  const foco = VMS.find(([n]) => n === "foco")![1];
  // A aproximacao e navegacao por URL; aqui exercitamos a funcao que a monta.
  const mod = await superficie();
  assert.ok(typeof mod.telaHome === "function");
  const js = ler("src/product/ui/surfaces/home.js");
  assert.match(js, /function minimapa/, "a aproximacao perdeu o resto da operacao");
  assert.match(js, /org-aprox__voltar/, "a aproximacao perdeu o caminho de volta");
  assert.match(js, /Causa e efeito/, "a aproximacao perdeu causa e efeito");
  // O minimapa lista TODAS as outras areas, sem excecao.
  assert.match(js, /vm\.ambientes\s*\n?\s*\.filter\(\(a\) => a\.id !== focada\)/);
  assert.equal(foco.ambientes.length, 5);
});

/* ================================================================== *
 * 6. Mobile, movimento e demonstracao
 * ================================================================== */

teste("O13 o mobile mantem a verdade: nada essencial e escondido", () => {
  const i = CSS.indexOf("@media (max-width: 720px)");
  assert.ok(i > 0, "o bloco mobile sumiu");
  const mobile = CSS.slice(i);
  // Nenhuma regra do mobile pode APAGAR area, subarea, sinal ou relacao.
  const proibido =
    /(\.org-area|\.org-sub|\.org-subs|\.org-sinal|\.org-relacao|\.org-fio)[^{]*\{[^}]*display:\s*none/;
  assert.ok(!proibido.test(mobile), "o mobile escondeu parte da verdade");
  // O degrau continua existindo no celular: os tres tamanhos seguem distintos.
  const m1 = px(mobile.slice(mobile.indexOf('.org-area[data-forma="nucleo"]')), "width");
  const m2 = px(mobile.slice(mobile.indexOf('.org-area[data-degrau="2"][data-forma="nucleo"]')), "width");
  const m3 = px(mobile.slice(mobile.indexOf('.org-area[data-degrau="3"][data-forma="nucleo"]')), "width");
  assert.ok(m1 && m2 && m3, "o mobile perdeu os degraus");
  assert.ok(m3! > m2! && m2! > m1!, "no mobile a pressao parou de crescer");
  // Alvo de toque: a volta da aproximacao tem 44px.
  assert.match(bloco(".org-aprox__voltar"), /min-height:\s*44px/);
});

teste("O14 reduced motion desliga o que e animacao, e so isso", () => {
  const i = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(i > 0, "a preferencia por menos movimento sumiu");
  const rm = CSS.slice(i);
  assert.match(rm, /animation: none/);
  assert.match(rm, /transition: none/);
  // O PAR: desligar animacao nao pode apagar informacao. O anel de pressao
  // continua na tela, so parado.
  assert.match(rm, /opacity:\s*0\.\d+/, "o anel de pressao sumiu junto com a animacao");
  assert.ok(!/display:\s*none/.test(rm), "reduced motion escondeu elemento");
  // E a intensidade da ligacao continua legivel sem movimento: espessura e cor.
  assert.match(bloco('.org-fio[data-intensidade="carregada"]'), /stroke-width:\s*3/);
  assert.match(bloco('.org-fio[data-intensidade="ativa"]'), /stroke-width:\s*2/);
});

teste("O15 a demonstracao continua marcada na superficie", async () => {
  for (const [nome, vm] of VMS) {
    assert.equal(vm.demonstracao, true, `${nome}: a fixture parou de se declarar`);
    const html = await render(vm);
    assert.match(html, /data-demonstracao="sim"/, `${nome}: a marca sumiu do container`);
    assert.match(html, /class="org-demo"/, `${nome}: a faixa de demonstracao sumiu`);
    assert.match(html, /Demonstracao\./, `${nome}: a palavra demonstracao sumiu do texto`);
  }
});

/* ================================================================== *
 * 7. A folha obedece a hierarquia
 * ================================================================== */

teste("O16 a home nao inventa token, e os tokens vem do canone", () => {
  assert.equal(
    CSS.match(/^\s*--[a-z0-9-]+\s*:/gm),
    null,
    "a home voltou a declarar token proprio",
  );
  // Os valores literais do V3.3 precisam existir no arquivo de tokens.
  for (const valor of ["#08130d", "#8cc63f", "#e0a25a", "#6e7b84", "#f2ebd9"]) {
    assert.ok(TOKENS.toLowerCase().includes(valor), `o token canonico ${valor} sumiu`);
  }
  // E o arquivo precisa dizer de onde veio.
  assert.match(TOKENS, /VISUAL_REFERENCE_HIERARCHY|Organismo Operacional/);
});

teste("O17 nenhum identificador interno chega a uma pessoa pela evidencia", () => {
  const crus = /enrolados_quentes|cozinha_quentes|bar_bebidas|montagem_outros/;
  for (const [nome, vm] of VMS) {
    const todas = [
      ...(vm.foco ? vm.foco.evidencias : []),
      ...vm.sinais_em_segundo_plano.flatMap((s) => s.evidencias),
    ];
    assert.ok(todas.length > 0, `${nome}: nenhuma evidencia produzida`);
    for (const e of todas) {
      assert.ok(
        !crus.test(e.referencia),
        `${nome}: identificador interno na evidencia — ${e.referencia}`,
      );
    }
  }
});

/* ================================================================== *
 * 8. MOVIMENTO — comunica mudanca, ou nao entra
 * ================================================================== *
 * Autoridade: Organismo V3.3 prancha 13 e `docs/figma/MOTION_SYSTEM.md`.
 * O OriginKit NAO foi inspecionado nesta sessao (PB12) — nada aqui deriva dele.
 */

/** As declaracoes de um @keyframes, para inspecionar o que ele anima. */
function keyframes(nome: string): string {
  const i = CSS.indexOf(`@keyframes ${nome}`);
  if (i < 0) return "";
  const abre = CSS.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < CSS.length; j += 1) {
    if (CSS[j] === "{") nivel += 1;
    else if (CSS[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return CSS.slice(abre + 1, j);
    }
  }
  return "";
}

teste("O18 nenhuma biblioteca de motion foi instalada", () => {
  const pkg = JSON.parse(ler("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const proibida of ["originkit", "framer-motion", "gsap", "animejs", "lottie"]) {
    assert.equal(
      todas.some((d) => d.toLowerCase().includes(proibida)),
      false,
      `dependencia de motion adicionada: ${proibida}`,
    );
  }
  // E nem por MCP nem por import direto na superficie.
  const js = ler("src/product/ui/surfaces/home.js");
  assert.ok(!/originkit/i.test(js), "a superficie importou OriginKit");
  assert.ok(!/from ["']https?:/.test(js), "a superficie importou de origem externa");
});

teste("O19 o movimento do organismo DERIVA do sistema canonico", () => {
  const motion = JSON.parse(ler("docs/figma/MOTION_TOKENS.json")) as {
    duracao: Record<string, string>;
  };
  // Nenhuma duracao literal no CSS da home: tudo por token.
  const literais = CSS.match(/animation:[^;]*?(\d+(?:\.\d+)?)(s|ms)/g) || [];
  assert.deepEqual(
    literais,
    [],
    `duracao literal na home em vez de token: ${literais.join(" | ")}`,
  );
  const transicoesLiterais = CSS.match(/transition:[^;]*?\b\d+(?:\.\d+)?(s|ms)\b/g) || [];
  assert.deepEqual(
    transicoesLiterais,
    [],
    `transicao com duracao literal: ${transicoesLiterais.join(" | ")}`,
  );
  // E os tokens do organismo apontam para os canonicos, nao para valores proprios.
  assert.match(TOKENS, /--org-pulso:\s*var\(--motion-ambient\)/);
  assert.match(TOKENS, /--org-troca:\s*var\(--motion-base\)/);
  assert.match(TOKENS, /--org-chegada:\s*var\(--motion-base\)/);
  // O unico valor derivado precisa DECLARAR de onde deriva.
  assert.match(TOKENS, /--org-fluxo:\s*calc\(var\(--motion-ambient\)/);
  assert.ok(Object.keys(motion.duracao).includes("motion-ambient"));
});

teste("O20 fluxo e espera sao linguagens DIFERENTES na mesma linha", () => {
  const inerte = bloco('.org-fio[data-intensidade="inerte"]');
  const ativa = bloco('.org-fio[data-intensidade="ativa"]');
  const carregada = bloco('.org-fio[data-intensidade="carregada"]');
  // Espera: tracejada e PARADA. Fluxo: tracejada e EM MOVIMENTO. V3.3 prancha 13.
  assert.ok(!/animation:/.test(ativa), "a linha de espera esta correndo como fluxo");
  assert.match(carregada, /animation:\s*orgFluxo/);
  // PAR SIMETRICO: sem isto, remover a animacao das DUAS passaria.
  assert.match(ativa, /stroke-dasharray/);
  assert.match(carregada, /stroke-dasharray/);
  // E a inerte nao pode nem tracejar nem animar — ela e caminho, nao relacao ativa.
  assert.equal(inerte, "", "a linha inerte ganhou tratamento proprio de pressao");
  assert.ok(!/animation:/.test(bloco(".org-fio")), "a linha base ganhou animacao");
});

teste("O21 falha tecnica nao recebe NENHUMA animacao de pressao", () => {
  for (const seletor of [
    ".org-tecnico",
    '.org-area[data-ausencia="sem_leitura"] .org-area__corpo',
    '.org-topo__vida[data-estado="falha"] .org-topo__ponto',
  ]) {
    const b = bloco(seletor);
    assert.ok(
      !/animation:\s*org(Pulso|Fluxo)/.test(b),
      `${seletor}: falha tecnica ganhou animacao de pressao`,
    );
    assert.ok(!/--org-ambar/.test(b), `${seletor}: falha tecnica usa ambar`);
  }
  // O ponto de vida em falha precisa PARAR — nao basta nao ganhar animacao nova,
  // porque ele herda a regra do estado vivo.
  assert.match(
    bloco('.org-topo__vida[data-estado="falha"] .org-topo__ponto'),
    /animation:\s*none/,
  );
});

teste("O22 o pulso ambiente nao se acumula: estado critico vence movimento", () => {
  // No Foco as areas em pressao ja respiram; o pulso de vida do cabecalho para.
  assert.match(
    bloco('.org[data-modo="foco"] .org-topo__vida[data-estado="vivo"] .org-topo__ponto'),
    /animation:\s*none/,
    "no Foco o pulso de vida continua somando com o anel de pressao",
  );
  // PAR: fora do Foco ele PRECISA pulsar, senao 'parar sempre' passaria neste teste.
  assert.match(
    bloco('.org-topo__vida[data-estado="vivo"] .org-topo__ponto'),
    /animation:\s*orgPulso/,
    "o pulso de vida sumiu tambem fora do Foco",
  );
});

teste("O23 nenhuma animacao move layout", () => {
  const nomes = (CSS.match(/@keyframes\s+([A-Za-z0-9_-]+)/g) || []).map((k) =>
    k.replace(/@keyframes\s+/, ""),
  );
  assert.ok(nomes.length > 0, "sem keyframes para inspecionar");
  for (const nome of nomes) {
    const corpo = keyframes(nome);
    for (const prop of ["height:", "margin", "padding", "font-size", "top:", "left:", "width:"]) {
      assert.ok(
        !corpo.includes(prop),
        `@keyframes ${nome} anima propriedade que move layout: ${prop}`,
      );
    }
  }
});

teste("O24 reduced motion alcanca TUDO que anima, e nao esconde nada", () => {
  const i = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(i > 0, "a preferencia por menos movimento sumiu");
  const rm = CSS.slice(i);
  // Todo seletor que recebe `animation:` fora do bloco precisa estar coberto.
  const animados = new Set<string>();
  for (const m of CSS.slice(0, i).matchAll(/([^{}]+)\{[^}]*animation:\s*org[^}]*\}/g)) {
    for (const s of m[1]!.split(",")) animados.add(s.trim());
  }
  assert.ok(animados.size >= 3, "o inventario de animacoes ficou vazio demais para valer");
  for (const s of animados) {
    const base = s.replace(/::(after|before)$/, "").trim();
    assert.ok(
      rm.includes(base) || rm.includes(".org *"),
      `reduced motion nao alcanca ${s}`,
    );
  }
  assert.ok(!/display:\s*none/.test(rm), "reduced motion escondeu elemento");
  assert.ok(!/opacity:\s*0[;\s}]/.test(rm), "reduced motion zerou opacidade de algo");
});

teste("O25 a evidencia nunca anima", () => {
  // MOTION_SYSTEM §4 e MOTION_COMPONENT_MAPPING: evidencia, sinal, ocorrencia e
  // erro aparecem inteiros. Um `reveal` aqui atrasaria a leitura do que importa.
  for (const seletor of [
    ".org-foco__evidencias",
    ".org-sinal",
    ".org-sinais",
    ".org-aprox__linhas",
    ".org-fontes",
  ]) {
    assert.ok(
      !/animation:/.test(bloco(seletor)),
      `${seletor}: evidencia ou sinal ganhou animacao`,
    );
  }
});

teste("O26 movimento nao carrega informacao sozinho", () => {
  // Toda intensidade de ligacao precisa ser legivel SEM animacao: espessura e
  // cor bastam. E o degrau precisa ser legivel sem o anel que pulsa.
  const larguras = ["inerte", "ativa", "carregada"].map((i) => {
    const b = i === "inerte" ? bloco(".org-fio") : bloco(`.org-fio[data-intensidade="${i}"]`);
    const m = /stroke-width:\s*(\d+)/.exec(b);
    return m ? Number(m[1]) : null;
  });
  assert.deepEqual(larguras, [1, 2, 3], `as tres intensidades precisam de espessura propria: ${larguras.join(",")}`);
  // O degrau 3 tem escala e cor proprias alem do anel.
  assert.match(
    bloco('.org-area[data-degrau="3"][data-forma="nucleo"] .org-area__corpo'),
    /width:\s*\d+px/,
  );
  assert.match(bloco('.org-area[data-degrau="3"] .org-area__estado'), /color/);
});

/* ================================================================== */

void Promise.all(pend).then(() => {
  console.log(`\nExpressao canonica — organismo operacional: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("ORGANISMO_VISUAL_GATE_GREEN");
});

// Referenciado para manter a intencao explicita mesmo se um teste for removido.
void temRegra;
