# REVISÃO ADVERSARIAL CLAUDE — Q-026 / REPLAY DA LEITURA DE ENTREGAS

**Datas:** 2026-10-09/10. **Situação:** SHADOW, experimento, PR DRAFT [#33](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/33), **sem merge**.
**Executor:** Claude, em sessão na nuvem com a assinatura existente do César. Sem API paga, sem serviço contratado, sem custo novo.
**Escopo real:** DeliveryOS só no Itaim. Todos os fatos usados aqui são **sintéticos**.
**Q-026:** continua **ABERTA**. Esta revisão não escolhe janela, não descarta histórico, não altera retenção e não responde à Q-026.

> **Handoff em uma frase.** APROVAR, para a branch de integração de teste, a projeção por escopo desta branch. Ela substitui o PR #31: devolve a mesma saída, byte a byte, e ganha 1,7–1,9× no clique inteiro (porta e HTTP) com 100 mil e 1,03 milhão de fatos, no CI e localmente, contra 1,03–1,08× do PR #31. REJEITAR o PR #31 isolado: está correto, mas é parcial e conflita com esta mudança. E NÃO construir cursor incremental antes da decisão Q-026. O custo que sobra é a releitura linear do log, e otimização sem estado não muda essa inclinação.

---

## 1. HEADs

| Ref | SHA | Papel |
|---|---|---|
| `research/deliveryos-q026-window-shadow-20261009` (PR #29) | `1cf1f5dc21b8c08012f7486de0c6df1055363827` | **base** desta branch e destino do PR #33 |
| `integration/deliveryos-product-ux-android-20261009` | `d0716fda380fc66cecfd791593cb6cc8c017b37a` | a projeção ORIGINAL (em uso), pinada nas provas |
| `experiment/deliveryos-q026-projection-cost-20261009` (PR #31) | `b20a847ef3e838dba69f1997e837c32faa66d24f` | revisado. No início desta revisão o head era `7583136`; o ChatGPT publicou `b4446c7` e `b20a847` durante o trabalho, e o revisado é o mais recente |
| `main` | `185b73d324b31bfd1e3381ee00bac7d00763168e` | intocada |
| **esta branch** `feat/claude-q026-replay-adversarial-20261009` | inicial `1cf1f5d` → final: o head do PR #33 (commits na §11) | só esta branch foi publicada |

A fonte canônica do método foi conferida no branch ativo antes de qualquer alteração. As branches do ChatGPT não foram alteradas.

## 2. O que foi realmente executado

| Onde | O quê |
|---|---|
| Container local (2 vCPU, 8 GB, Node 22.22.0, PostgreSQL 16 local, ICU 77.1) | perfis de custo por etapa; as provas novas; as suítes existentes (lista na §6); benchmark progressivo de 1k a 1,03 M com as três árvores |
| GitHub Actions, run `38021849258` (`be45af1`), runner padrão de repositório público, sem custo | job `equivalencia` ✅; job `postgres` ✅; job `benchmark` de 1k a 1,03 M ✅ (resultado na §7.4). O commit final roda de novo o mesmo workflow; o resultado está nos checks do PR #33 |
| GitHub Actions do ChatGPT, só leitura | `38015661218`: 79/79, S1–S8, Product 52. `38015732708` (`7583136`): cadeia 36/36 e mutações 15/15. **A bateria PostgreSQL passou.** `38016813240` (`b20a847`): HTTP 100k, 1,30× com uma amostra morna e 1,03× fria |

**Não executado:** produção, banco operacional, dados reais, Android, TATÁ Comanda, impressão, CAIXA, composição oficial (`compose.platform.yaml`), deploy.

## 3. Revisão crítica do PR #31

**A mudança está correta.** Contra a original `d0716fd`, a versão `b20a847` dá **0 divergências em 15.171 comparações** (E2): duplicatas, atrasos, empates por `localeCompare`, relógios, quarentena, cursor, entradas malformadas e fuzz.
- O `push` compartilha a lista só entre estados internos sucessivos da mesma chamada. A saída de cada chamada é nova.
- Não há aliasing observável (E4). A ordem das chaves não mudou.

**A conclusão é que não se sustenta.** Os 707→31 ms (22,9×) medem **uma viagem com 16 mil fatos**, o pior caso da cópia. Reproduzido aqui: 730→33 ms.
- O documento da missão diz que a cópia "pode explicar parte maior do tempo do que o SQL/replay". **Com distribuição de loja, isso é falso.** A 1,03 M (4.185 viagens, 3 escopos, ordem de chegada), a projeção do PR #31 fica em 1,16× (12,35→10,64 s). No clique inteiro: **1,03× na porta e 1,08× no HTTP**.
- O próprio A/B HTTP do ChatGPT já mostrava isso: 1,30× com **uma** amostra morna por lado e 1,03× na fria.

**Fraquezas dos testes do PR #31:**
1. O teste de volume é a viagem única.
2. `deepStrictEqual` sem comparar o JSON byte a byte. A resposta HTTP carrega a ordem das chaves, que `deepStrictEqual` não vê. O mutante M7 desta branch prova isso.
3. Não há empates em que `localeCompare` ≠ ordem por código, nem entradas malformadas, nem a dependência entre escopos (§8, A3).
4. A igualdade do A/B HTTP confere só `(viagem_id, fatos, estado)`.

## 4. Onde o tempo realmente vai (medido, 1,03 M, local)

| Etapa da porta `lerRealidadeDeEntregas` | Original | Observação |
|---|---|---|
| `SELECT` + parse do driver `pg` (14 colunas) | 6,0–7,6 s | ~45% é `timestamptz` → `Date`; a mesma consulta com `::text` leva 3,4–3,5 s. "SQL 420 ms" era só o lado do servidor |
| `lerFatosParaReplay` inteiro | 8,3–8,4 s | inclui 2 `toISOString()` e 1 envelope por linha; RSS +1,1 GB |
| projeção: 3 escopos × `projetar(log inteiro)` | 12,4–14,4 s | **o maior custo** |
| ↳ só a ordenação de 1 M com `Date.parse` no comparador | 2,5–3,0 s | com o instante pré-lido: 0,38–0,39 s |
| último lote por aparelho (`DISTINCT ON`) | 1,2 s | ordenação externa em disco (`work_mem` padrão) |
| **porta inteira** | **23,1 s** | benchmark (§7.2) |

O padrão: a porta chamava `projetar(leitura.aptos)` uma vez **por escopo** (unidade × modo). Cada chamada copiava e ordenava o log **inteiro**, de todas as unidades e modos, relendo `Date.parse` duas vezes por comparação, e só no laço descartava os outros escopos. Com S escopos, o custo é S × n log n × 2 `Date.parse`.

## 5. Correções implementadas (2 arquivos de runtime)

### 5.1 `src/platform/projections/operacao-viva.ts` — `projetar()`, mesma saída

- **Instante lido uma vez por evento.** `Date.parse` é pura, então o comparador pré-lido devolve, par a par, o mesmo número que o original.
- **Filtrar o escopo antes de ordenar.** Só quando o comparador é **consistente**: todo instante finito, toda sequência finita e todo id texto, verificado na **lista inteira**.
  - A ordenação do JS é estável. Com comparador consistente, o resultado é único: chave, depois ordem de entrada. Filtrar preserva a ordem de entrada, então as duas ordens comutam.
  - Fora disso, roda o **caminho antigo literal**: lista inteira, o mesmo comparador e filtro depois. O caminho rápido não pode ser usado aí; ver A3 na §8.
- **Acumulador mutável local.** Sem recriar objeto e lista a cada fato; esta parte contém a ideia do PR #31.
  - `maisRecente` usa um cache numérico do texto.
  - Quando o relógio é confiável, o instante da posição reaproveita o instante já lido.
  - O cursor é montado uma vez no fim.
  - A saída é montada campo a campo, **na mesma ordem de chaves**, inclusive as chaves com `undefined`.
- **Linha ancorada preservada.** A linha que a mutação M2 do relógio ancora (`const instante = ehPosicao ? instanteConfiavel(ev) : undefined;`) continua literal. `test:platform:relogio:mutacoes`: 13/13.

### 5.2 `src/platform/leitura/realidade-de-entregas.ts` — partição por escopo

- Uma passada separa os fatos por escopo, e cada `projetar` recebe só os seus.
- É exato porque `lerFatosParaReplay` só entrega instante reconstruído por `toISOString()`, id texto e sequência inteira segura. Essa premissa é testada contra PostgreSQL real (P1).
- As consultas SQL e a linha ancorada pela mutação M8 não mudaram.

**Sem schema, migration, tabela, cache, cursor, janela ou retenção. Nenhuma rota, contrato, tipo exportado ou SQL foi alterado.**

## 6. Provas — testes e resultados exatos

### 6.1 Provas novas (`tests/product/`)

| Suíte | Resultado | O que prova |
|---|---|---|
| `run-q026-replay-adversarial-tests.ts` | **12/12** local; 11/11 no run `38021849258`, anterior ao E12 informativo | E1: candidata = original em **15.171 comparações** (11 famílias, 2.544 cenários), com `deepStrictEqual` e JSON byte a byte, e exceção contando como saída. E2: PR #31 = original. E3–E5: entrada congelada intacta, saída sem estado compartilhado, ordem de entrada irrelevante. E6–E7: memória viva = replay = original, inclusive com fato atrasado depois do reinício. E8: partição = log inteiro. E9: filtrar antes **sem** a guarda diverge da original. E10–E11: os cenários exercitam o que dizem exercitar (fuzz: 2.228 pelo caminho rápido, 272 pelo antigo). E12: digest do ambiente |
| `run-q026-replay-adversarial-mutacoes.ts` | **18/18 mutantes mortos, 0 cegos**, com controle sem divergência (local e CI) | a prova enxerga a falta da guarda, o desempate por código, a sequência ignorada, a falta de dedup, a dedup entre modos, a chave omitida, a ordem de chaves, `>=` no lugar de `>`, o cursor na quarentena, o cache velho, o relógio sem autoridade, o ranque que retrocede, a perda do aparelho, a ordem das viagens, o caminho antigo inútil, o arredondamento ao segundo, a guarda sem id e a guarda sem sequência |
| `run-q026-replay-adversarial-pg-tests.ts` | **5/5** (local e CI) | P1: a porta só entrega fatos bem formados. P2: porta particionada = porta antiga, com e sem unidade. P3: reinício = memória viva = original, e dois reinícios dão os mesmos digests. P4: atrasados gravados depois do reinício. P5: histórico sem modo continua UNKNOWN |

Foi visto falhar antes de passar:
- O mutante M16 começou **cego**. Foi criado o cenário "mesmo segundo, milissegundos diferentes".
- O M18 também começou **cego**. Foi criado o cenário "sequência NaN em outro escopo, no mesmo instante".
- O E8 reprovou por cenário fraco (5 escopos).
- O passo do workflow que busca o `b20a847` quebrou o primeiro run (`38021686455`): o `#` de "PR #31" virou comentário do YAML. Corrigido em `be45af1`.

Controles antifalso-positivo, além dos mutantes. Entraram depois do run `38021849258` e rodam no CI do commit final, nos checks do PR #33:
- O P2 acusa quando **um** fato some da referência.
- O P4 exige que os digests **mudem** com os atrasados.
- No benchmark:
  - a soma das listas de eventos das viagens tem de ser o total semeado, e por isso uma saída vazia não passa;
  - o HTTP exige `leitura.disponivel = true`, porque três respostas "indisponível" dariam o mesmo SHA.

### 6.2 Suítes existentes nesta árvore (sem `FAIL_NOVO`)

| Suíte | Local | CI `38021849258` |
|---|---|---|
| platform 44 · bridge 45 · product 52 · conference (4b1–4b5, copiloto) · r5d1 31 | ✅ | ✅ |
| S1–S8 janela (PR #29) | 8/8 | 8/8 |
| q016 / mutações / processos | 27/27 · 14/14 · 14/14 | 27/27 · 14/14 · — |
| relógio / mutações | 13/13 · 13/13 | 13/13 · 13/13 |
| q017 / mutações | 18/18 · 17/17 | 18/18 · — |
| cadeia / mutações | 36/36 · 15/15 | 36/36 · 15/15 |
| backup · append-only · spine · queue-depth:pg | 19/19 · 20/20 · 29 · 12/12 | — |
| `tsc --noEmit` (projeto e testes Q-026) | ✅ | ✅ |

Todas as mutações rodaram com zero cegas.

## 7. Comparações de desempenho

Metodologia de todas as tabelas:
- Fatos sintéticos com distribuição de loja: 20 aparelhos, ~240 pontos por viagem, ciclo de vida, 3% de atrasados, 1% de relógio adiantado e 2% de empates.
- Modos por aparelho: 6× `simulated`, 1× `control`, 1× `real`; com 1 M, isso dá 3 escopos e 4.185 viagens.
- Um processo filho por medida, aquecimento fora, `gc()` antes de cada amostra, mediana de 5 amostras (3 com 1,03 M).
- **O SHA-256 da saída é igual nas três árvores em todas as medidas.** Isso também prova equivalência em escala, com 1,03 M.
- Valores em ms; 2 vCPU locais.

### 7.1 Projeção em memória (porta antiga = `projetar` com a lista inteira, por escopo)

| Fatos · ordem | Original | PR #31 | Esta | Original + só a partição | **Esta + partição** |
|---|---|---|---|---|---|
| 10k · chegada | 89 | 76 | 16 | 47 | **16** (5,7×) |
| 10k · embaralhada | 181 | 172 | 23 | 83 | **23** (7,9×) |
| 100k · chegada | 973 | 937 | 193 | 508 | **173** (5,6×) |
| 100k · embaralhada | 2.724 | 2.573 | 303 | 1.079 | **226** (12,1×) |
| 1,03 M · chegada | 12.350 | 10.642 | 2.434 | 7.061 | **2.231** (5,5×) |
| 16k · **viagem única** | 730 | 33 | 22 | — | — |

Atribuição do ganho:
- A partição sozinha dá 1,7–2,5×.
- O `projetar` novo, sozinho, dá 5–9×.
- A cópia quadrática (PR #31) dá 1,04–1,16× com distribuição de loja.

### 7.2 Porta `lerRealidadeDeEntregas` (PostgreSQL 16 local)

| Fatos | Original | PR #31 | **Esta** | RSS pico (orig → esta) |
|---|---|---|---|---|
| 1k | 29,3 | 26,8 | **16,0** | 109 → 97 MB |
| 10k | 207 | 190 | **119** (1,74×) | 135 → 132 MB |
| 100k | 2.082 | 1.936 | **1.159** (1,80×) | 267 → 270 MB |
| 1,03 M | 23.093 | 22.323 | **12.851** (1,80×) | 1.529 → 1.508 MB |

### 7.3 HTTP `GET /api/entregas` (Product System de cada árvore, rodadas intercaladas)

| Fatos | Original | PR #31 | **Esta** | Bytes (iguais nas três) |
|---|---|---|---|---|
| 1k | 26,8 | 31,3 | **25,3** | 29.097 |
| 10k | 208 | 198 | **109** (1,91×) | 101.354 |
| 100k | 1.990 | 1.912 | **1.126** (1,77×) | 277.899 |
| 1,03 M | 22.419 | 20.792 | **12.937** (1,73×) | 1.924.641 |

### 7.4 GitHub Actions (run `38021849258`, `be45af1`, runner padrão: 4 vCPU, Node 22.23.3, PostgreSQL 16)

| Medida | Fatos | Original | PR #31 | **Esta** | Esta ÷ original |
|---|---|---|---|---|---|
| projeção · chegada | 100k | 946 | 900 | **154** (partição) | 6,1× |
| projeção · embaralhada | 100k | 2.430 | 2.370 | **196** (partição) | 12,4× |
| projeção · chegada | 1,03 M | 10.788 | 9.959 | **1.817** (partição) | 5,9× |
| projeção · viagem única | 16k | 728 | 37 | **21** | 35× |
| porta | 10k | 201 | 195 | **127** | 1,58× |
| porta | 100k | 1.877 | 1.822 | **1.082** | 1,73× |
| porta | 1,03 M | 19.622 | 18.566 | **10.340** | 1,90× |
| HTTP | 10k | 200 | 187 | **113** | 1,77× |
| HTTP | 100k | 1.888 | 1.814 | **1.061** | 1,78× |
| HTTP | 1,03 M | 18.974 | 18.218 | **10.555** | 1,80× |

Medianas em ms; o mesmo SHA-256 de saída nas três árvores em todas as linhas.

Sobre os bytes do HTTP:
- Com 1,03 M, os bytes diferiram em até 14 B entre árvores (1.924.641 / 1.924.634 / 1.924.627). A diferença vem de texto que depende do instante de cada requisição (idade da leitura e campos `observado_em`). O conteúdo normalizado da realidade (viagens, aparelhos, sem modo) tem o mesmo SHA.
- Localmente, os bytes foram idênticos.

**Leitura dos números.** Depois desta correção, o clique com 1,03 M cai de ~19 s para ~10,5 s (4 vCPU). O que sobra é quase todo a leitura linear do log:
- ~10 µs por fato por clique;
- 65% disso é `SELECT` + parse do driver + envelope;
- a projeção caiu para ~18% do clique.

## 8. Problemas descobertos

- **A1. O PR #31 está contido nesta mudança e é pequeno no caso real.** Ver §3 e §7.
- **A2. O custo dominante era a ordenação do log inteiro por escopo, com `Date.parse` no comparador.** Corrigido (§5).
- **A3. Defeito latente da original.** Um `occurred_at` ilegível em **qualquer** fato, até de outra unidade ou modo, torna o comparador inconsistente e muda a ordem dos fatos dos **outros** escopos. Isso pode mudar a ordem de `eventos` (proveniência), o `device_id`, a grafia de `ultimo_fato_em` e o cursor de viagens que não têm nada com o fato ruim (E9).
  - **Não é alcançável pelos caminhos canônicos:** a ingestão recusa instante ilegível e o replay o reconstrói com `toISOString()`.
  - Foi **preservado** de propósito pelo caminho antigo, porque corrigi-lo seria mudar semântica, e essa decisão não cabe aqui.
- **A4. A leitura do log é o próximo gargalo.** Depois da correção, ela é ~65% do clique com 1 M.
  - Converter `timestamptz` em `Date` custa ~45% do `SELECT`. O laço ainda chama 2 `toISOString()` e cria um envelope por linha. O RSS fica em +1,1 GB.
  - **Não mexi**, por três motivos:
    - a consulta é texto ancorado pela mutação MQ7 da Q-016, e as linhas de `received_at`/`clock_trust` pelas mutações M3/M12 do relógio;
    - a porta é a da decisão Q-016;
    - a equivalência exige reproduzir o `postgres-date` (ms truncado), `DateStyle`, fuso e `infinity`.
  - Potencial medido: −3 s com 1 M. É o próximo experimento sem decisão (§12).
- **A5. Último lote por aparelho.** O `DISTINCT ON … ORDER BY device_id, recorded_at DESC, sequence_local DESC NULLS LAST` ordena em disco (1,2 s com 1 M).
  - Com `recorded_at` igual (lote numa transação) e `sequence_local` nulo, a linha escolhida é arbitrária e pode variar com o plano. Pré-existente.
- **A6. O desempate usa `localeCompare`.** "Mesma entrada, mesma saída" vale dentro do mesmo ICU/locale.
  - Trocar por ordem de código seria mais rápido, mas **muda a saída** (E10). Os mutantes M2 e M14 travam essa troca silenciosa.
  - O E12 imprime o digest do ambiente, para comparar máquinas.
- **A7. Boot.** `reconstruirNoBoot` calcula a projeção do primeiro escopo duas vezes e ordena 1 M de linhas canônicas para o digest. É custo único por reinício; ficou mais barato com o `projetar` novo e não foi reestruturado.
- **A8. O bloco legado `realidade.viagens` continua inteiro no HTTP.** Medidos 1,9 MB com 1 M nesta fixture. Tirá-lo é pergunta da Q-026.

## 9. Riscos que ainda existem

- **O(N) por clique.** Com 1,03 M, o clique ainda leva ~10,5 s (CI, 4 vCPU) a ~12,9 s (local, 2 vCPU), ou seja, ~10–12,5 µs por fato do log por clique. A inclinação continua linear: esta otimização reduz o custo, mas não muda a forma.
- **Dados sintéticos.** A distribuição é declarada e reprodutível, mas não é a do Itaim. Com mais escopos o ganho cresce; com viagens mais longas, a parte da cópia (PR #31) pesa mais.
- **Domínio da equivalência.** Ela está provada para dados JSON-planos: textos, números, `null`/`undefined` e objetos simples. Entradas exóticas, como getters, `Symbol` ou `BigInt`, ficam fora do contrato.
- **Conflito com o PR #31.** Os dois mudam a mesma função. Integrar um e fechar o outro.

## 10. O que permanece sem prova

- Volume real do Itaim e o tempo em hardware de produção.
- Composição oficial com estes binários.
- Cliques concorrentes, que podem somar memória.
- Android e aparelho físico.
- O caminho de leitura com `timestamp` em texto: só a variante crua do `SELECT` foi medida; nada foi implementado.
- Benefício para a Intelligence Spine: ela usa a mesma projeção, mas não foi medida aqui.

## 11. Arquivos modificados e commits

**Runtime (2):**
- `src/platform/projections/operacao-viva.ts`
- `src/platform/leitura/realidade-de-entregas.ts`

**Testes (novos):**
- `tests/product/q026-replay-fixture.ts`
- `tests/product/q026-referencias.ts`
- `tests/product/q026-cenarios.ts`
- `tests/product/q026-bench-filho.ts`
- `tests/product/run-q026-replay-adversarial-tests.ts`
- `tests/product/run-q026-replay-adversarial-mutacoes.ts`
- `tests/product/run-q026-replay-adversarial-pg-tests.ts`
- `tests/product/run-q026-replay-benchmark.ts`

**CI (novo):** `.github/workflows/deliveryos-q026-replay-adversarial.yml`

**Docs:** este arquivo.

**Registros:**
- `docs/execution/EVIDENCE.jsonl`: 5 linhas medidas, com `controle_antifalso_positivo`.
- `docs/execution/STATE.json`: seção `q026_replay_adversarial_20261009` e um item em `nao_comprovado`.
- `docs/execution/MISSION_LEDGER.jsonl`: linha `CLAUDE_Q026_ADVERSARIAL_20261009`.
- As datas de lifecycle desses três arquivos foram para 2026-10-10 (G6c).
- `PERGUNTAS.jsonl` não mudou: nenhuma pergunta nova; a Q-026 segue aberta.

Commits:
- `c515237`: a prova de equivalência, **antes** de qualquer otimização (passa por construção).
- `6710660`: a otimização, com os mutantes.
- `e86338e`: PostgreSQL, benchmark e workflow.
- `be45af1`: correção do YAML (um `#` virava comentário).
- O commit deste documento.

## 12. Alternativas avaliadas

| Alternativa | Veredito | Por quê |
|---|---|---|
| Só a cópia (PR #31) | contida e superada | 1,03–1,08× no clique |
| Projeção por escopo + partição (esta) | **integrar** | 1,7–1,9×, saída idêntica, sem estado novo |
| Desempate por ordem de código | rejeitada | muda a saída (E10; M2/M14) |
| `SET LOCAL work_mem` para o `DISTINCT ON` | não feita | em empate, a linha escolhida pode mudar (A5) |
| `timestamp` em texto na leitura | **próximo experimento** | −3 s com 1 M medido; exige reescrever as âncoras MQ7/M3/M12 e prova de equivalência com o `postgres-date` |
| Cache em memória no Product System | rejeitada agora | estado novo; ainda precisa de marca d'água segura, que o PR #29 mostrou não existir no schema atual |
| Cursor incremental / snapshot / janela | **decisão Q-026** | S1–S8 e o PR #29: janela perde informação, e não há cursor de ingestão seguro sem mudar schema |

## 13. Recomendação

1. **Integrar este experimento** na branch de integração de teste, depois da auditoria do ChatGPT e do aceite do César, com o CI do PR #33 como portão. **Rejeitar o merge do PR #31 isolado.**
   - Aceite binário: 12/12, 18/18 com 0 cegos, 5/5 no PostgreSQL, suítes da §6.2 verdes e o mesmo SHA de saída nas três árvores.
   - Rollback: `git revert` dos dois arquivos de runtime. Sem dado, sem migration.
2. **Não construir cursor incremental, snapshot nem janela antes da Q-026.** Depois desta correção, o que sobra é linear no tamanho do log. A pergunta certa para o César é **o que a leitura humana precisa reler**, não como otimizar a releitura.

**Custo desta revisão:** zero. Assinatura existente; runner padrão de repositório público (`private: false`); PostgreSQL descartável.
