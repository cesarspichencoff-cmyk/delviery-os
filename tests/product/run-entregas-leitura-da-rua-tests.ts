/**
 * Entregas — "a rua, lida agora". Gate do view model e da superficie.
 *
 * Cada teste nasceu de um atrito MEDIDO na tela de 2026-10-09 (servidor com
 * banco local e 7 aparelhos, capturas em 1440x900 e 390x844):
 *
 *  L1  a leitura do servidor aparecia DEPOIS da demonstracao — a primeira dobra
 *      (desktop e celular) era inteira de numeros que nao aconteceram;
 *  L2  a mesma tela dizia "nao existe rota de leitura" para o aparelho enquanto
 *      mostrava credencial, GPS e fila lidos do banco;
 *  L3  carimbo ISO em UTC no lugar da idade: quem gerencia fazia a conta de cabeca;
 *  L4  unidades misturadas, sem filtro;
 *  L5  viagem ENCERRADA marcada "stale" ao lado das viagens na rua;
 *  L6  o que pede gente ficava espalhado em celulas de tabela.
 *
 * Fixture: `entregas-fixture.ts` (todo fato `simulated`, projetado por `projetar()`).
 * Uso: npx tsx tests/product/run-entregas-leitura-da-rua-tests.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { JANELAS } from "../../src/platform/projections/operacao-viva";
import { montarEntregasDemo } from "../../src/product/demo/seed-demonstracao";
import { telaEntregas } from "../../src/product/ui/surfaces/entregas.js";
import { carregarEstados } from "../../src/product/ui/components/ui.js";
import { AGORA_FIXTURE, realidadeFixture } from "./entregas-fixture";

const raiz = process.cwd();
const tokens = JSON.parse(readFileSync(join(raiz, "docs/figma/DESIGN_TOKENS.json"), "utf8"));
carregarEstados(tokens.estados);

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* Acesso tolerante: o teste precisa REPROVAR (nao estourar) no codigo antigo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualquer = any;

async function vmCom(
  opcoes: { unidade?: string | null; soItaim?: boolean; semLeitura?: "integracao_pendente" | "indisponivel" } = {},
): Promise<Qualquer> {
  const f = await montarEntregasDemo();
  const snap = await f.snapshot();
  const leitura = opcoes.semLeitura
    ? { disponivel: false as const, motivo: opcoes.semLeitura, explicacao: "fixture: sem leitura" }
    : { disponivel: true as const, realidade: realidadeFixture({ soItaim: opcoes.soItaim }) };
  // O quinto argumento e o filtro de unidade. O codigo antigo o ignora.
  const chamar = entregasVM as unknown as (...a: unknown[]) => Qualquer;
  return chamar(snap, AGORA_FIXTURE, f.getPolicyMaxStops(), leitura, { unidade: opcoes.unidade ?? null });
}

function pos(html: string, agulha: string): number {
  const i = html.indexOf(agulha);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
}

void (async () => {
  console.log("\nENTREGAS — a rua, lida agora");

  /* ---------------------------------------------------------------- *
   * View model
   * ---------------------------------------------------------------- */

  await teste("L4a as unidades vem da LEITURA, com contagem, e a selecao filtra aparelhos e viagens", async () => {
    const todas = await vmCom();
    const l = todas.leitura;
    assert.equal(l?.disponivel, true, "sem leitura da rua no view model");
    assert.deepEqual(
      l.unidades.map((u: Qualquer) => [u.unit_id, u.aparelhos, u.viagens_na_rua, u.selecionada]),
      [["ITAIM", 7, 3, false], ["VILA-LAB", 1, 1, false]],
    );
    assert.equal(l.unidade_selecionada, null);
    const itaim = await vmCom({ unidade: "ITAIM" });
    assert.equal(itaim.leitura.unidade_selecionada, "ITAIM");
    assert.ok(itaim.leitura.unidades.find((u: Qualquer) => u.unit_id === "ITAIM").selecionada);
    assert.equal(itaim.realidade.aparelhos.some((a: Qualquer) => a.unidade !== "ITAIM"), false, "aparelho de outra unidade vazou");
    assert.equal(itaim.realidade.viagens.some((v: Qualquer) => v.unidade !== "ITAIM"), false, "viagem de outra unidade vazou");
    // As unidades continuam todas listadas: filtrar nao apaga a existencia da outra.
    assert.equal(itaim.leitura.unidades.length, 2);
  });

  await teste("L4b unidade pedida e inexistente vira ausencia DECLARADA, nunca 'todas' em silencio", async () => {
    const vm = await vmCom({ unidade: "NAO-EXISTE" });
    assert.equal(vm.leitura.unidade_encontrada, false);
    assert.equal(vm.realidade.aparelhos.length, 0);
    assert.match(vm.leitura.titulo, /NAO-EXISTE/);
  });

  await teste("L5 grupos pelo ciclo de vida: na rua, aguardando saida, ciclo desconhecido, encerradas", async () => {
    const v = (await vmCom({ unidade: "ITAIM" })).leitura.viagens;
    const ids = (lista: Qualquer[]) => lista.map((x) => x.viagem_id).sort();
    assert.deepEqual(ids(v.na_rua), ["T-101", "T-102", "T-103"]);
    assert.deepEqual(ids(v.aguardando_saida), ["T-104"]);
    assert.deepEqual(ids(v.ciclo_desconhecido_com_posicao), ["T-301"]);
    assert.deepEqual(ids(v.ciclo_desconhecido_sem_posicao), ["T-302"]);
    assert.deepEqual(ids(v.encerradas), ["T-099"]);
    // Pressao no espaco: quem tem MENOS solidez vem primeiro.
    assert.deepEqual(v.na_rua.map((x: Qualquer) => x.viagem_id), ["T-102", "T-103", "T-101"]);
    assert.deepEqual(v.na_rua.map((x: Qualquer) => x.solidez), ["pontilhada", "tracejada", "cheia"]);
  });

  await teste("L6a o que pede conferencia: tres tipos, nesta ordem, cada um com evidencia e restricao", async () => {
    const c = (await vmCom({ unidade: "ITAIM" })).leitura.conferir;
    assert.deepEqual(
      c.map((x: Qualquer) => [x.tipo, x.chave]),
      [
        ["viagem_sem_posicao_recente", "viagem:T-102"],
        ["fila_sem_relato_recente", "fila:dev-b"],
        ["cadastro_incompleto", "cadastro:dev-d"],
      ],
    );
    // Procedencia NUNCA inferida: o fato de GPS carrega o modo do lote; o
    // cadastro e ato administrativo; o relato de fila nao declara modo (null).
    const esperada: Record<string, string | null> = {
      viagem_sem_posicao_recente: "simulado",
      fila_sem_relato_recente: null,
      cadastro_incompleto: "real",
    };
    for (const x of c) {
      assert.ok(x.titulo && x.restricao && x.evidencia, `${x.chave} sem titulo/restricao/evidencia`);
      assert.equal(x.procedencia, esperada[x.tipo], `${x.chave} com procedencia errada`);
    }
    assert.match(c[0].titulo, /T-102/);
    assert.match(c[0].titulo, /ha 9 min/);
    assert.match(c[1].titulo, /39/);
    assert.match(c[1].titulo, /ha 52 min/);
  });

  await teste("L6b NAO pede conferencia: posicao recente, fila em dia, fila velha sem pendencia, revogado, ciclo desconhecido", async () => {
    const c = (await vmCom()).leitura.conferir;
    const chaves = c.map((x: Qualquer) => x.chave);
    for (const proibida of ["viagem:T-101", "viagem:T-103", "viagem:T-201", "fila:dev-a", "fila:dev-c", "fila:dev-g", "fila:dev-f", "viagem:T-302", "viagem:T-301", "viagem:T-099", "viagem:T-104"]) {
      assert.equal(chaves.includes(proibida), false, `${proibida} virou conferencia`);
    }
    // Lei 4: a conferencia fala do SINAL e do CADASTRO, nunca da pessoa.
    for (const x of c) assert.equal(/rider-/.test(x.titulo), false, `${x.chave} nomeia a pessoa no titulo`);
  });

  await teste("L3 idade legivel contra o instante da LEITURA, hora local de Sao Paulo, e ausencia nunca vira idade", async () => {
    const vm = await vmCom({ unidade: "ITAIM" });
    const porId = (id: string) => vm.leitura.aparelhos.find((a: Qualquer) => a.device_id === id);
    assert.equal(vm.leitura.lida_as, "09h43");
    const b = porId("dev-b");
    assert.equal(b.ultima_posicao.observado, true);
    assert.equal(b.ultima_posicao.idade, "ha 9 min");
    assert.equal(b.ultima_posicao.hora, "09h34");
    assert.equal(b.fila_relato.idade, "ha 52 min");
    assert.equal(porId("dev-a").ultima_posicao.idade, "ha 40 s");
    assert.equal(porId("dev-f").fila_relato.idade, "ha 1 dia");
    assert.equal(porId("dev-f").fila_relato.hora, "08/10 08h43");
    assert.equal(porId("dev-h").ultima_sessao.idade, "ha 1 min");
    const d = porId("dev-d");
    assert.equal(d.ultima_posicao.observado, false, "aparelho sem lote ganhou idade");
    assert.equal(JSON.stringify(d).includes('"idade"'), false, "ausencia virou idade");
  });

  await teste("L3b relogio adiantado: a idade usa a hora do SERVIDOR, e a ressalva aparece na qualidade da leitura", async () => {
    const vm = await vmCom({ unidade: "VILA-LAB" });
    const g = vm.leitura.aparelhos.find((a: Qualquer) => a.device_id === "dev-g");
    assert.equal(g.ultima_posicao.idade, "ha 1 min");
    assert.ok(vm.leitura.qualidade.some((q: string) => /relogio/i.test(q) && /Moto 07/.test(q)), "relogio suspeito sumiu da leitura");
  });

  await teste("L7 a frase de abertura conta o que foi visto e nunca afirma 'ao vivo' nem calma", async () => {
    const itaim = (await vmCom({ unidade: "ITAIM" })).leitura;
    assert.equal(itaim.titulo, "3 viagens na rua em ITAIM; 1 sem posicao recente.");
    assert.equal(itaim.solidez, "pontilhada");
    assert.ok(itaim.explicacao.includes(`${JANELAS.fresh_ate_s / 60} min`), "a janela de posicao recente nao veio da Operacao Viva");
    assert.ok(itaim.restricao, "sem restricao com viagem sem posicao recente");
    const todas = (await vmCom()).leitura;
    assert.equal(todas.titulo, "4 viagens na rua em 2 unidades; 1 sem posicao recente.");
    const vila = (await vmCom({ unidade: "VILA-LAB" })).leitura;
    assert.equal(vila.titulo, "1 viagem na rua em VILA-LAB, com posicao recente.");
    assert.equal(vila.solidez, "cheia");
    for (const l of [itaim, todas, vila]) {
      const texto = `${l.titulo} ${l.explicacao} ${l.restricao ?? ""}`;
      assert.equal(/ao vivo|tempo real|real-time|tudo certo|fluindo/i.test(texto), false, `afirmacao proibida: ${texto}`);
    }
  });

  await teste("L7b sem leitura do servidor: estado tecnico com linha interrompida, e nenhum numero de rua", async () => {
    for (const motivo of ["integracao_pendente", "indisponivel"] as const) {
      const vm = await vmCom({ semLeitura: motivo });
      assert.equal(vm.leitura.disponivel, false);
      assert.equal(vm.leitura.solidez, "interrompida");
      assert.ok(vm.leitura.titulo && vm.leitura.restricao);
      assert.equal(/"(contagens|conferir|unidades)"/.test(JSON.stringify(vm.leitura)), false, `${motivo}: ausencia ganhou contagem`);
    }
  });

  await teste("L2a o aparelho da demonstracao deixa de afirmar que nao existe rota de leitura", async () => {
    const vm = await vmCom();
    for (const c of Object.values(vm.dispositivo) as Qualquer[]) {
      assert.equal(c.observado, false);
      assert.equal(c.motivo, "integracao_pendente");
      assert.equal(/nao existe rota de leitura/i.test(c.explicacao), false, `explicacao falsa: ${c.explicacao}`);
    }
    for (const l of vm.limitacoes) {
      assert.equal(/Nao existe endpoint/i.test(l.texto), false, `limitacao falsa: ${l.titulo}`);
    }
  });

  /* ---------------------------------------------------------------- *
   * Superficie
   * ---------------------------------------------------------------- */

  await teste("L1 a leitura da rua vem ANTES da demonstracao, e a demonstracao mora numa faixa propria", async () => {
    const html = telaEntregas(await vmCom({ unidade: "ITAIM" }));
    const rua = pos(html, 'data-territorio="rua"');
    const demo = pos(html, 'data-territorio="demonstracao"');
    assert.ok(Number.isFinite(rua), "sem territorio da rua");
    assert.ok(Number.isFinite(demo), "sem faixa de demonstracao");
    assert.ok(rua < demo, "a demonstracao ainda vem antes da rua");
    assert.ok(pos(html, "Viagens montadas") > demo, "metrica da demonstracao fora da faixa de demonstracao");
    assert.ok(pos(html, "V-2081") > demo, "viagem da demonstracao fora da faixa de demonstracao");
  });

  await teste("L1b com leitura, a demonstracao fica recolhida; sem leitura, ela aparece aberta e o estado tecnico vem antes", async () => {
    const com = telaEntregas(await vmCom());
    const faixa = com.slice(pos(com, 'data-territorio="demonstracao"'));
    assert.match(faixa, /aria-expanded="false"/, "com leitura, a demonstracao nao esta recolhida");
    const sem = telaEntregas(await vmCom({ semLeitura: "integracao_pendente" }));
    assert.ok(pos(sem, 'data-solidez="interrompida"') < pos(sem, 'data-territorio="demonstracao"'), "estado tecnico depois da demonstracao");
    assert.ok(pos(sem, "Viagens montadas") < Number.POSITIVE_INFINITY, "sem leitura, a demonstracao sumiu");
  });

  await teste("L2b a tela nunca diz 'nao existe rota de leitura' do aparelho", async () => {
    for (const vm of [await vmCom(), await vmCom({ semLeitura: "integracao_pendente" })]) {
      const html = telaEntregas(vm);
      assert.equal(/nao existe rota de leitura|Nao existe endpoint/i.test(html), false);
    }
  });

  await teste("L3c a superficie mostra idade e hora local, e o ISO fica como evidencia (atributo datetime)", async () => {
    const html = telaEntregas(await vmCom({ unidade: "ITAIM" }));
    assert.ok(html.includes("ha 9 min"), "sem idade da posicao");
    assert.ok(html.includes("09h34"), "sem hora local");
    assert.ok(html.includes('datetime="2026-10-09T12:34:00.000Z"'), "o instante exato sumiu como evidencia");
    assert.ok(html.includes("Leitura do servidor as 09h43"), "sem hora da leitura");
  });

  await teste("L4c o filtro de unidade e navegacao por link, com contagem e estado atual declarado", async () => {
    const html = telaEntregas(await vmCom({ unidade: "ITAIM" }));
    assert.ok(html.includes('href="#/entregas?unidade=ITAIM"'), "sem link da unidade");
    assert.ok(html.includes('href="#/entregas?unidade=VILA-LAB"'), "sem link da outra unidade");
    assert.ok(html.includes('href="#/entregas"'), "sem link para todas");
    assert.match(html, /href="#\/entregas\?unidade=ITAIM"[^>]*aria-current="true"/, "a unidade atual nao se declara");
    const so = telaEntregas(await vmCom({ soItaim: true }));
    assert.equal(so.includes("?unidade="), false, "uma unidade so nao precisa de filtro");
  });

  await teste("L5b viagem encerrada sai da leitura principal e nao carrega selo de desatualizada", async () => {
    const html = telaEntregas(await vmCom({ unidade: "ITAIM" }));
    assert.ok(Number.isFinite(pos(html, 'data-grupo="na_rua"')), "sem grupo das viagens na rua");
    assert.ok(Number.isFinite(pos(html, 'data-grupo="encerradas"')), "sem grupo das encerradas");
    const ruaPrincipal = html.slice(pos(html, 'data-grupo="na_rua"'), pos(html, 'data-grupo="encerradas"'));
    assert.equal(ruaPrincipal.includes("T-099"), false, "encerrada na leitura principal");
    const encerradas = html.slice(pos(html, 'data-grupo="encerradas"'));
    const linha = encerradas.slice(pos(encerradas, "T-099"), pos(encerradas, "T-099") + 600);
    assert.equal(linha.includes('data-estado="stale"'), false, "encerrada ainda com selo desatualizado");
  });

  await teste("L6c a conferencia e uma lista, com titulo humano, idade, evidencia e restricao — sem botao de acao", async () => {
    const html = telaEntregas(await vmCom({ unidade: "ITAIM" }));
    const bloco = html.slice(pos(html, 'data-grupo="conferir"'), pos(html, 'data-grupo="na_rua"'));
    assert.ok(bloco.includes("<ol"), "conferencia nao e lista ordenada");
    assert.equal((bloco.match(/<li/g) || []).length, 3);
    assert.ok(bloco.includes("Viagem T-102 sem posicao recebida ha 9 min"));
    assert.equal(/<button(?![^>]*data-inspetor)/.test(bloco), false, "botao de acao na conferencia");
    assert.equal(/<form|method=|onclick/i.test(html), false, "formulario ou acao na tela");
  });

  await teste("L8 Lei 4: nenhuma palavra de ranking, velocidade ou desempenho de pessoa", async () => {
    const html = telaEntregas(await vmCom());
    assert.equal(/ranking|mais lento|velocidade|pontuacao|desempenho|score/i.test(html), false);
  });

  await teste("L9 nenhuma afirmacao de 'ao vivo' / 'tempo real' em nenhum estado da tela", async () => {
    for (const vm of [await vmCom(), await vmCom({ unidade: "VILA-LAB" }), await vmCom({ semLeitura: "indisponivel" })]) {
      assert.equal(/ao vivo|tempo real|real-time|realtime/i.test(telaEntregas(vm)), false);
    }
  });

  await teste("L10 a leitura se declara como leitura: hora, idade na tela e botao de reler (GET)", async () => {
    const html = telaEntregas(await vmCom());
    assert.ok(html.includes("data-idade-da-leitura"), "sem marcador de idade da leitura");
    assert.match(html, /<button[^>]*type="button"[^>]*data-reler/, "sem botao de reler");
    assert.ok(html.includes('aria-live="off"'), "a idade que muda sozinha precisa ficar fora da regiao viva");
  });

  /* ---------------------------------------------------------------- *
   * O caso REAL de hoje e as leituras vazias
   * ---------------------------------------------------------------- */

  async function vmDe(realidade: Qualquer, unidade: string | null = null): Promise<Qualquer> {
    const f = await montarEntregasDemo();
    const chamar = entregasVM as unknown as (...a: unknown[]) => Qualquer;
    return chamar(await f.snapshot(), AGORA_FIXTURE, f.getPolicyMaxStops(), { disponivel: true, realidade }, { unidade });
  }

  await teste("L11 so GPS, sem ciclo de vida (o caso real da cadeia canonica hoje): conta o que manda posicao e nao inventa 'na rua'", async () => {
    const base = realidadeFixture();
    const soGps = {
      ...base,
      projecoes: base.projecoes.map((p: Qualquer) => ({
        ...p,
        viagens: p.viagens.filter((v: Qualquer) => v.estado === "desconhecido"),
      })),
    };
    const l = (await vmDe(soGps, "ITAIM")).leitura;
    assert.equal(l.contagens.na_rua, 0);
    assert.equal(l.titulo, "1 viagem mandando posicao em ITAIM; o ciclo de vida nao chega a esta leitura.");
    assert.equal(l.conferir.some((c: Qualquer) => c.tipo === "viagem_sem_posicao_recente"), false, "viagem sem ciclo virou conferencia");
    assert.match(l.restricao, /ciclo de vida/);
    assert.ok(l.qualidade.some((q: string) => /pode ter terminado/.test(q)), "a viagem sem posicao e sem ciclo sumiu");
    const html = telaEntregas(await vmDe(soGps, "ITAIM"));
    assert.ok(html.includes('data-grupo="ciclo_desconhecido"'), "sem grupo de ciclo desconhecido");
    assert.equal(/viagens? na rua/.test(html.slice(html.indexOf("data-titulo-da-leitura"), html.indexOf("data-titulo-da-leitura") + 300)), false, "o titulo afirmou rua sem ciclo de vida");
  });

  await teste("L12 leituras vazias: sem aparelho, e com aparelho mas sem fato — ausencia escrita, nunca zero em lugar de rua", async () => {
    const base = realidadeFixture();
    const vazia = await vmDe({ ...base, aparelhos: [], projecoes: [], historico_sem_modo: 0 });
    assert.equal(vazia.leitura.titulo, "Nenhum aparelho autorizado.");
    assert.equal(vazia.leitura.solidez, "neutra");
    assert.equal(vazia.leitura.conferir.length, 0);
    const semFato = await vmDe({
      ...base,
      projecoes: [],
      aparelhos: base.aparelhos.filter((a: Qualquer) => a.unit_id === "ITAIM").map((a: Qualquer) => ({ ...a, ultimo_lote: null, fatos_por_modo: { real: 0, simulated: 0, control: 0 }, fila_offline: null })),
    });
    assert.equal(semFato.leitura.titulo, "Nenhuma viagem na rua por esta leitura em ITAIM.");
    assert.match(semFato.leitura.explicacao, /nada foi observado/);
    // Sem lote, nao ha modo: os selos da leitura nao afirmam simulado nem real.
    assert.deepEqual(semFato.leitura.selos.map((s: Qualquer) => s.estado), ["parcial"]);
    const html = telaEntregas(semFato);
    assert.ok(html.includes("Nada pede conferencia nesta leitura.") === false, "cadastro incompleto sumiu da conferencia");
    assert.ok(html.includes("Nenhuma viagem com saida registrada esta na rua por esta leitura."));
  });

  await teste("L13 ocorrencia registrada numa viagem na rua pede conferencia — sem inventar tipo, horario ou resolucao", async () => {
    const base = realidadeFixture({ ocorrencias: true });
    const l = (await vmDe(base, "ITAIM")).leitura;
    assert.deepEqual(
      l.conferir.map((c: Qualquer) => c.chave),
      ["ocorrencia:T-103", "viagem:T-102", "fila:dev-b", "cadastro:dev-d"],
    );
    const o = l.conferir[0];
    assert.equal(o.tipo, "ocorrencia_registrada");
    assert.equal(o.titulo, "Viagem T-103: 1 ocorrencia registrada");
    assert.match(o.restricao, /tipo/);
    assert.match(o.restricao, /resolvida/);
    assert.equal(o.desde.observado, false, "a leitura nao tem o horario da ocorrencia e inventou um");
    // A encerrada com ocorrencia NAO pede conferencia, mas a contagem nao some.
    assert.equal(l.conferir.some((c: Qualquer) => c.chave === "ocorrencia:T-099"), false);
    const t099 = l.viagens.encerradas.find((v: Qualquer) => v.viagem_id === "T-099");
    assert.equal(t099.ocorrencias, 1);
    const html = telaEntregas(await vmDe(base, "ITAIM"));
    assert.ok(html.includes("1 ocorrencia registrada"), "a celula nao mostra a ocorrencia");
    // Sem ocorrencia, nada aparece (zero medido nao vira linha de alarme).
    const sem = (await vmDe(realidadeFixture(), "ITAIM")).leitura;
    assert.equal(sem.conferir.some((c: Qualquer) => c.tipo === "ocorrencia_registrada"), false);
    assert.equal(telaEntregas(await vmDe(realidadeFixture(), "ITAIM")).includes("ocorrencia registrada"), false);
  });

  await teste("L14 texto que a pessoa le nunca carrega nome interno do catalogo (snake_case)", async () => {
    // As outras linhas de evidencia ja falam lingua de gente ("ultimo lote",
    // "relato recebido"); a da ocorrencia dizia `occurrence_created no log`.
    const l = (await vmDe(realidadeFixture({ ocorrencias: true }), null)).leitura;
    const textos: string[] = [l.titulo, l.explicacao, l.restricao ?? "", ...l.qualidade];
    for (const c of l.conferir) textos.push(c.titulo, c.detalhe, c.evidencia, c.restricao);
    for (const grupo of Object.values(l.viagens) as Qualquer[][]) {
      for (const v of grupo) textos.push(v.estado_legivel, v.aparelho ?? "");
    }
    const internos = textos.filter((t) => /\b[a-z]+_[a-z_]+\b/.test(t));
    assert.deepEqual(internos, [], "nome interno no texto humano");
  });

  await teste("L15 historico longo: encerradas e viagens antigas sem ciclo vem limitadas, mais recentes primeiro, e a contagem nao mente", async () => {
    // O log nunca apaga (append-only): sem limite, cada semana de operacao
    // engorda a resposta e a arvore da tela com viagens de dias atras.
    const vm = await vmDe(realidadeFixture({ historico: { encerradas: 60, semCiclo: 45 } }), "ITAIM");
    const l = vm.leitura;
    const limite = l.limite_da_lista;
    assert.equal(typeof limite, "number", "a view model nao declara o limite das listas");
    assert.ok(limite > 0 && limite < 45, `limite ${limite} nao exercita o corte desta fixture`);
    // Contagem exata: as 60 do historico + T-099.
    assert.equal(l.contagens.encerradas, 61);
    assert.equal(l.viagens.encerradas.length, limite);
    assert.equal(l.viagens.encerradas[0].viagem_id, "H-060", "a encerrada mais recente nao vem primeiro");
    // Sem ciclo e sem posicao recente: as 45 do historico + T-302 (ultima posicao ha 2 h).
    assert.equal(l.contagens.ciclo_desconhecido_sem_posicao, 46);
    assert.equal(l.viagens.ciclo_desconhecido_sem_posicao.length, limite);
    assert.equal(l.viagens.ciclo_desconhecido_sem_posicao[0].viagem_id, "T-302");
    assert.ok(
      l.qualidade.some((q: string) => q.startsWith("46 viagens sem posicao recente e sem ciclo")),
      "a ressalva de qualidade perdeu a contagem exata",
    );
    // A tela diz que a lista e parcial, e de quanto.
    const html = telaEntregas(vm);
    assert.ok(html.includes(`${limite} mais recentes de 61`), "a tela nao declara o corte das encerradas");
    assert.ok(html.includes(`${limite} mais recentes de 46`), "a tela nao declara o corte das viagens sem ciclo");
    // Controle: historico curto nao ganha frase de corte.
    assert.equal(telaEntregas(await vmDe(realidadeFixture(), "ITAIM")).includes("mais recentes de"), false);
  });

  if (falhas.length) {
    console.error(`\nENTREGAS_LEITURA_DA_RUA: ${passaram}/${passaram + falhas.length} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nENTREGAS_LEITURA_DA_RUA: ${passaram}/${passaram} PASS`);
})();
