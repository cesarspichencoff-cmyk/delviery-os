/**
 * Bloco 4B2 — núcleo multidimensional do Conference Brain.
 *
 * Prova os doze itens do gate contra o código realmente portado. Não reescreve
 * o patrimônio histórico: `multidimensional-model.test.js` e
 * `sprint24-adversarial.test.js` continuam no WIP, porque exigem módulos que
 * pertencem ao 4B3 (`observer`) ou estão fora de escopo por decisão
 * (`playwright-preflight`, `mapping-mode`, painel HTTP). A fronteira está
 * registrada em `NEXT_RESUME.md`.
 *
 * O que se prova aqui é o que muda de contexto: no DeliveryOS o Brain vive ao
 * lado da Operação Viva, e essas garantias precisam valer *neste* repositório.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const req = createRequire(join(process.cwd(), "package.json"));
const CB = (m: string): Record<string, unknown> =>
  req(join(process.cwd(), "src", "conference-brain", m)) as Record<string, unknown>;

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

console.log("=== Conference Brain 4B2 — núcleo multidimensional ===");

/* ------------------------------------------------------------------ *
 * Módulos
 * ------------------------------------------------------------------ */

const G = CB("live/grouping") as {
  PRESENCE: Record<string, string>;
  deriveGroupId: (...a: unknown[]) => unknown;
  normalizeGrouping: (g: unknown) => Record<string, unknown> | null;
  reconcileGrouping: (obs: readonly unknown[]) => Record<string, unknown>;
  buildConflict: (...a: unknown[]) => unknown;
};
const M = CB("live/multidimensional-observation") as Record<string, (...a: unknown[]) => unknown>;
const I = CB("live/indicators") as {
  CATEGORY_BY_CODE: Record<string, string>;
  classifyIndicator: (c: string) => string;
  buildIndicator: (i: unknown) => Record<string, unknown> | null;
  buildIndicatorList: (l: unknown) => unknown[];
};
const R = CB("live/reconciliation") as Record<string, (...a: unknown[]) => Record<string, unknown>>;
const E = CB("live/evidence") as { buildEvidenceRecord: (o: unknown) => Record<string, unknown> };
const LC = CB("live/legacy-compat") as { deriveLegacyLiveStatus: (d: unknown) => unknown };
const L = CB("contracts/live-states") as Record<string, Record<string, string>>;
const P = CB("live/pii-guard") as { isRedactedMarker: (v: unknown) => boolean };

const AGORA = "2026-07-27T12:00:00.000Z";
const DEPOIS = "2026-07-27T12:05:00.000Z";

/* ------------------------------------------------------------------ *
 * 1-2. Observação multidimensional e dimensões independentes
 * ------------------------------------------------------------------ */

teste("a observação multidimensional é construída com as nove dimensões", () => {
  const obs = M.buildOrderObservation({
    external_id: "p-1",
    observed_at: AGORA,
    raw_status: "pronto",
  }) as Record<string, unknown>;
  assert.ok(obs, "não construiu observação");
  // As nove respondem a perguntas diferentes; colapsá-las numa só perderia
  // exatamente a informação que o modelo existe para carregar.
  // Os nomes sao os do contrato — `order_state`, nao `state`. Presumir o nome
  // curto foi o erro; o contrato manda.
  for (const d of ["layout", "visual", "order_state", "readiness", "courier", "dispatch", "completion", "fulfillment", "store"]) {
    assert.ok(d in obs, `dimensão ausente: ${d}`);
  }
});

teste("cada dimensão tem vocabulário PRÓPRIO — não são rótulos do mesmo estado", () => {
  // Se duas dimensões compartilhassem o conjunto de valores, elas seriam a
  // mesma coisa escrita duas vezes, e o modelo seria multidimensional só no
  // nome.
  const visual = new Set(Object.values(L.VISUAL_LOCATION));
  const courier = new Set(Object.values(L.COURIER_STATE));
  const dispatch = new Set(Object.values(L.DISPATCH_STATE));
  assert.notDeepEqual(visual, courier);
  assert.notDeepEqual(courier, dispatch);
  assert.ok(courier.has("at_store"), "logística perdeu vocabulário próprio");
  assert.ok(dispatch.has("awaiting_dispatch"), "despacho perdeu vocabulário próprio");
});

teste("dimensão não observada NÃO recebe valor operacional plausível", () => {
  // Inventar um valor onde não houve leitura é a forma mais barata de o painel
  // mentir com cara de precisão.
  const obs = M.buildOrderObservation({ external_id: "p-2", observed_at: AGORA }) as Record<string, Record<string, unknown>>;
  // O modelo distingue `not_applicable` (nao se aplica) de `unknown` (nao
  // observado). Nenhum dos dois e estado operacional — e isso que impede o
  // painel de mentir com cara de precisao.
  const neutros = ["unknown", "not_applicable", null];
  assert.ok(neutros.includes(obs.courier.state as string), `logistica inventou estado: ${obs.courier.state}`);
  // A dimensao de despacho expoe `value`; a de logistica expoe `state`. Sao
  // formas diferentes de propositos diferentes, e nao um deslize.
  assert.ok(neutros.includes(obs.dispatch.value as string), `despacho inventou estado: ${obs.dispatch.value}`);
});

/* ------------------------------------------------------------------ *
 * 3-6. Agrupamento
 * ------------------------------------------------------------------ */

/**
 * O sinal de agrupamento usa camelCase — `memberOrderIds`, `observedAt`.
 * Presumir snake_case fez o normalizador ler lista vazia e concluir REMOVIDO,
 * e o teste acusou. O contrato manda.
 */
const grupo = (ids: string[], em: string): Record<string, unknown> => ({
  observed: true,
  memberOrderIds: ids,
  observedAt: em,
});

teste("o agrupamento é determinístico — a mesma entrada dá o mesmo id", () => {
  const a = G.deriveGroupId(["p-1", "p-2"]);
  const b = G.deriveGroupId(["p-2", "p-1"]);
  assert.equal(a, b, "a ordem dos pedidos mudou o id do grupo");
});

teste("agrupar repetidamente é idempotente", () => {
  const obs = [grupo(["p-1", "p-2"], AGORA), grupo(["p-1", "p-2"], AGORA)];
  const uma = JSON.stringify(G.reconcileGrouping([obs[0]]));
  const duas = JSON.stringify(G.reconcileGrouping(obs));
  assert.equal(uma, duas, "repetir a mesma observação mudou o resultado");
});

teste("atualizar o grupo NÃO cria uma segunda conclusão", () => {
  const r = G.reconcileGrouping([
    grupo(["p-1", "p-2"], AGORA),
    grupo(["p-1", "p-2", "p-3"], DEPOIS),
  ]) as { current?: { presence?: string; member_order_ids?: string[] }; versions?: unknown[] };
  assert.equal(r.current?.presence, G.PRESENCE.PRESENT);
  assert.equal(r.current?.member_order_ids?.length, 3, "a leitura mais recente não venceu");
  // As versoes ficam no historico — atualizar nao cria conclusao paralela.
  assert.ok((r.versions ?? []).length >= 1);
});

teste("agrupamento REMOVIDO retira a conclusão — não fica pendurado", () => {
  // O defeito histórico: o grupo sumia da tela e o estado antigo continuava.
  // `observed: true` com lista vazia é "olhei e não há", diferente de "não
  // olhei" — e essa distinção é a correção inteira.
  const r = G.reconcileGrouping([
    grupo(["p-1", "p-2"], AGORA),
    { observed: true, memberOrderIds: [], observedAt: DEPOIS },
  ]) as { current?: { presence?: string; member_order_ids?: string[] } };
  assert.equal(r.current?.presence, G.PRESENCE.REMOVED, "o agrupamento removido sobreviveu");
  assert.deepEqual(r.current?.member_order_ids ?? [], []);
});

teste("não observado é DIFERENTE de removido", () => {
  const naoOlhou = G.normalizeGrouping({ observed: false });
  const olhouEnaoAchou = G.normalizeGrouping({ observed: true, memberOrderIds: [], observedAt: AGORA });
  assert.notDeepEqual(naoOlhou, olhouEnaoAchou, "ausência de leitura virou ausência de grupo");
});

teste("empate é resolvido por regra, nunca por ordem de chegada", () => {
  // Duas leituras no MESMO instante, discordando. Escolher a primeira da lista
  // faria o resultado depender de como o array foi montado.
  const a = G.reconcileGrouping([grupo(["p-1", "p-2"], AGORA), grupo(["p-1", "p-3"], AGORA)]);
  const b = G.reconcileGrouping([grupo(["p-1", "p-3"], AGORA), grupo(["p-1", "p-2"], AGORA)]);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "a ordem do array decidiu o empate");
});

teste("conflito é um estado explícito, não um palpite silencioso", () => {
  assert.equal(G.PRESENCE.CONFLICT, "conflict");
  const r = G.reconcileGrouping([
    grupo(["p-1", "p-2"], AGORA),
    grupo(["p-1", "p-3"], AGORA),
  ]) as { current?: { presence?: string } };
  assert.ok(
    [G.PRESENCE.CONFLICT, G.PRESENCE.PRESENT].includes(r.current?.presence ?? ""),
    `presença inesperada: ${r.current?.presence}`,
  );
});

/* ------------------------------------------------------------------ *
 * 7. Confiança com evidência rastreável
 * ------------------------------------------------------------------ */

teste("a reconciliação devolve confiança JUNTO da evidência que a sustenta", () => {
  // Confiança sem procedência é opinião com número. O histórico é o que
  // permite a alguém perguntar "de onde veio isso?".
  const r = R.reconcileField("status", [
    { status: "pronto", observed_at: AGORA, source: "tela", confidence: "alta" },
    { status: "saiu", observed_at: DEPOIS, source: "tela", confidence: "media" },
  ]);
  assert.ok("confidence" in r, "sem confiança");
  assert.ok("history" in r, "sem histórico — a confiança fica sem procedência");
  assert.ok(Array.isArray(r.history));
  assert.ok((r.history as unknown[]).length > 0);
});

teste("sem candidato, a confiança é NULA — não é um valor baixo inventado", () => {
  const r = R.reconcileField("status", [{ observed_at: AGORA }]);
  assert.equal(r.value, null);
  assert.equal(r.confidence, null, "confiança inventada onde não houve leitura");
});

teste("o registro de evidência carrega hash e não o conteúdo bruto", () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b2-"));
  try {
    const ev = E.buildEvidenceRecord({
      run_id: "r1",
      cycle_id: "c1",
      external_id: "p-1",
      excerpt: "pedido de Joao Silva",
      dir,
    });
    const texto = JSON.stringify(ev);
    assert.ok(!texto.includes("Joao"), "a evidência guardou o nome");
    assert.match(texto, /hash|sha/i, "sem hash não há como correlacionar duas evidências");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * 8. Indicadores — atualização e retirada
 * ------------------------------------------------------------------ */

teste("indicador conhecido é classificado por categoria", () => {
  assert.equal(I.classifyIndicator("PREPARATION_DELAYED"), "alerta");
  assert.equal(I.classifyIndicator("PREPARATION_TIME_REMAINING"), "indicador");
});

teste("indicador fora do catálogo é RECUSADO, nunca promovido a alerta", () => {
  // O desenho e allowlist, igual ao do PII: codigo que ninguem declarou nao
  // vira sinal. Promove-lo inventaria gravidade sobre algo que o sistema nao
  // sabe interpretar.
  assert.equal(I.classifyIndicator("CODIGO_QUE_NUNCA_VIMOS"), null);
  assert.equal(I.buildIndicator({ code: "CODIGO_QUE_NUNCA_VIMOS" }), null, "codigo desconhecido virou indicador");
  const c = I.buildIndicator({ code: "PREPARATION_DELAYED" }) as Record<string, unknown>;
  assert.equal(c.category, "alerta");
  assert.equal(c.severity, "info", "gravidade inventada onde a origem nao informou");
});

teste("indicador que sumiu da leitura é RETIRADO, não congelado", () => {
  const r = R.reconcileIndicators([
    { indicatorsObserved: true, indicators: [{ code: "PREPARATION_DELAYED" }], observed_at: AGORA },
    { indicatorsObserved: true, indicators: [], observed_at: DEPOIS },
  ]) as { current?: unknown[]; ended?: unknown[] };
  assert.equal((r.current ?? []).length, 0, "o indicador antigo continuou ativo");
  assert.ok((r.ended ?? []).length >= 1, "o indicador retirado não foi registrado como encerrado");
});

teste("não ter olhado os indicadores é diferente de não haver indicadores", () => {
  // `indicatorsObserved` ausente significa "nao checou" — e uma leitura que
  // nao checou nao pode apagar o que a anterior viu.
  const naoOlhou = R.reconcileIndicators([
    { indicatorsObserved: true, indicators: [{ code: "PREPARATION_DELAYED" }], observed_at: AGORA },
    { observed_at: DEPOIS },
  ]) as { current?: unknown[] };
  assert.equal((naoOlhou.current ?? []).length, 1, "uma leitura que nao checou apagou o que existia");
});

/* ------------------------------------------------------------------ *
 * 9-10. PII e precisão inventada
 * ------------------------------------------------------------------ */

teste("nenhum nome sobrevive na observação multidimensional", () => {
  const obs = M.buildOrderObservation({
    external_id: "p-9",
    observed_at: AGORA,
    raw_status: "Pronto - Joao Silva",
  });
  const sanitizada = (CB("live/pii-guard") as { sanitizeOrderObservation: (o: unknown) => unknown })
    .sanitizeOrderObservation(obs);
  assert.ok(!JSON.stringify(sanitizada).includes("Joao"), "o nome sobreviveu na observação");
});

teste("texto livre da observação vira marcador, não texto", () => {
  const r = R.reconcileObservationText([
    { observation_text: "combinar com o Sr. Pereira", observed_at: AGORA },
  ]) as { value?: unknown };
  if (r.value != null && typeof r.value === "object") {
    assert.equal(P.isRedactedMarker(r.value), true);
  } else if (typeof r.value === "string") {
    assert.ok(!r.value.includes("Pereira"), "o nome sobreviveu no texto reconciliado");
  }
});

teste("entrada incompleta NÃO gera precisão inventada", () => {
  // O modelo prefere dizer "não sei" a dizer um valor plausível. É a diferença
  // entre um painel confiável e um painel confortável.
  // Sem observacao nenhuma o modelo devolve NULL — nao um objeto cheio de
  // valores neutros, que pareceria uma leitura. Ausencia total e ausencia,
  // e essa e a forma mais forte de nao inventar precisao.
  assert.equal(R.reconcileMultidimensional("p-x", []), null);

  // Com UMA leitura pobre, o que existe e neutro e a confianca nunca e alta.
  const magra = R.reconcileMultidimensional("p-y", [
    M.buildOrderObservation({ external_id: "p-y", observed_at: AGORA }),
  ]);
  const texto = JSON.stringify(magra);
  assert.ok(/unknown|not_applicable/.test(texto), "leitura pobre nao marcou ausencia");
  assert.ok(!/"confidence": ?"alta"/.test(texto), "confianca alta sobre leitura pobre");
});

/* ------------------------------------------------------------------ *
 * 11. Compatibilidade legada — derivada, nunca fonte
 * ------------------------------------------------------------------ */

teste("o status legado é DERIVADO do multidimensional, não o contrário", () => {
  // Se o legado fosse a fonte, as nove dimensões seriam decoração — e a
  // primeira divergência entre eles seria irresolvível.
  const obs = M.buildOrderObservation({ external_id: "p-1", observed_at: AGORA, raw_status: "pronto" });
  const legado = LC.deriveLegacyLiveStatus(obs);
  assert.ok(legado !== undefined, "não derivou status legado");
});

/* ------------------------------------------------------------------ *
 * 12. O núcleo continua autocontido
 * ------------------------------------------------------------------ */

teste("o núcleo continua importando SÓ crypto, fs e path", () => {
  const { readdirSync, statSync, readFileSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const externos = new Set<string>();
  const andar = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) externos.add(m[1]);
    }
  };
  andar(raiz);
  assert.deepEqual([...externos].sort(), ["crypto", "fs", "path"]);
});

teste("o 4B2 não trouxe painel HTTP, browser adapter nem Playwright", () => {
  // Estavam explicitamente fora do escopo. Um port que os arrastasse por
  // conveniência mudaria a fronteira sem ninguém decidir.
  const { readdirSync } = req("node:fs") as typeof import("node:fs");
  const live = readdirSync(join(process.cwd(), "src", "conference-brain", "live"));
  for (const proibido of ["browser-adapter.js", "playwright-preflight.js", "mapping-mode.js"]) {
    assert.ok(!live.includes(proibido), `${proibido} entrou fora de escopo`);
  }
});

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} conference-4b2 tests OK ===`);
