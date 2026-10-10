# Q-026 — o leitor incremental vira módulo reutilizável (pesquisa, DRAFT/HOLD)

**Data:** 2026-10-10. **Estado:** pesquisa. Um módulo novo em `src/`, ainda **não ligado a nenhuma
rota**, mais provas e CI isolado.
**Base:** `research/deliveryos-q026-full-model-memory-isolation-shadow-20261010` (PR #52), HEAD
**verificado** `032bd8dc4ea30b8c86521e9899512b58861356b8`.
**Q-026 e Q-024 continuam ABERTAS.** Este trabalho relê o mesmo histórico que a porta canônica
relê: não decide janela, retenção nem o bloco legado.

**Fora do diff, conferido com `git diff --stat 032bd8d`:** o diff só tem arquivos novos. Nenhum
arquivo existente foi alterado, inclusive:

- `tools/product_system_server.ts`;
- a porta canônica `src/platform/leitura/realidade-de-entregas.ts`;
- a replay da Q-016 (`src/platform/projections/**`);
- migrations e Android.

Não houve push para `main` (`dbf71d8` no remoto ao abrir o PR), para a integração (`99b0c72`) nem
para o PR #55 e sua branch.

Nada foi publicado nem implantado; não houve merge nem gasto além dos minutos de CI desta branch.

**Registro.** Como os relatórios Q-026 anteriores (PR #51/#52), este vive em
`docs/execution/Q026_*.md`. `MISSION_LEDGER.jsonl`, `EVIDENCE.jsonl` e `STATE.json` não foram
tocados nesta branch de pesquisa. Os links das execuções de CI ficam no corpo do PR, porque um commit
não pode citar a execução que ele mesmo dispara.

---

## 1. Veredito

1. **O módulo existe e é igual à porta canônica onde a tela olha.** O módulo é
   `src/platform/leitura/realidade-de-entregas-incremental.ts`, função
   `lerRealidadeDeEntregasIncremental(cliente, { agora, unit_id?, lote?, medir? })`, com a mesma
   assinatura da canônica. A igualdade cobre aparelhos, último lote, contagens por modo, escopos
   (inclusive o que só tem fato sem viagem), UNKNOWN global, filtro de unidade, cada campo de cada
   viagem e a **view model inteira em cinco filtros**. Foi provada:
   - por propriedade, contra a porta canônica real, em 387 logs adversariais;
   - em PostgreSQL 16 real, a 132 mil e a **1.096.004** fatos.
2. **Transação, cursor e falha.** É uma transação `REPEATABLE READ, READ ONLY` só, com cursor em
   lotes validados (padrão 1024, máximo 20 mil) e pré-busca do lote seguinte. Em falha há ROLLBACK
   e a conexão volta limpa. Provado:
   - erro do PostgreSQL (34000), erro de JavaScript, `statement_timeout` (57014);
   - escrita recusada pelo servidor (25006);
   - escritor concorrente confirmando entre lotes e entre as consultas de aparelho.
3. **Memória e laço, onde há uma viagem longa.** A 1.036.004 fatos:
   - **pico de 168 MiB contra 1.314 MiB da canônica (−87%)**;
   - laço do Node bloqueado por **33 ms (mediana do máximo; pior repetição 35 ms) contra 7,0 s**
     da canônica, que projeta tudo de uma vez depois do COMMIT. O medidor é calibrado (§5).

   A leitura total também ficou mais curta: −12% a −31% (§6).
4. **O que piorou, sem esconder.**
   - O instante MVCC fica **aberto por mais tempo** que na porta canônica **nos quatro cenários**:
     +17% a 126k, +13% a 306k, +11% a 1,036M e +21% com 200 mil viagens curtas. Isso acontece
     porque o incremental reduz DENTRO da transação, enquanto a canônica projeta depois do COMMIT.
   - A memória **não é O(1)**: cresce com o número de viagens. Com 200 mil viagens o pico é de
     444 MiB, contra 893 MiB da canônica.
   - Nesse cenário, a montagem das viagens depois do COMMIT ainda **bloqueia o laço por ~310 ms**
     (a canônica, ~2,9 s).
5. **O contrato muda em um ponto, declarado.** `eventos` de cada viagem é um contador: só `length`
   responde, e ler um id lança `IDS_FORENSES_NAO_CARREGADOS`. `versao` passa a ser
   `realidade-de-entregas-incremental@1.0.0`. Os ids continuam na replay da Q-016, intacta.
6. **Não está pronto para uso real.** Faltam a ligação na rota (proibida nesta missão), o prazo
   total e o cancelamento sob a proteção do PR #55, o efeito do instante longo sob escrita real, o
   orçamento de pool, a Preview e o aparelho físico (§8).

---

## 2. Auditoria do que já existia

**PR #52 / PR #51.** Os scripts `run-q026-rr-full-model-shadow.ts` e
`run-q026-full-rr-memory-isolated-shadow.ts` montam o leitor dentro do teste.

| # | O que encontrei | Consequência | O que o módulo faz |
|---|---|---|---|
| A1 | `ORDER BY unit_id,source_mode,object_type,object_id` sem `COLLATE "C"`, agrupando por viagem com `flush` | Depende da colação da coluna. Com colação não determinística, duplica viagens (auditoria anterior, C14). O banco ainda ordena tudo | **Sem `ORDER BY`**: o acumulador não depende da ordem; não há ordenação no banco nem dependência de colação |
| A2 | Cópia à mão de `RANK`/`NEXT`/comparador, com desempate `cmp > 0` | `projetar` fica com o **último** fato no empate (ordenação estável). O script fica com o primeiro: diverge quando `localeCompare` empata ids distintos | Desempate `>=`, igual a `projetar`, travado pelo caso P4b e pelo mutante MI1 |
| A3 | Decodificador copiado (`fromRow`), com `assert` em instante ilegível | Uma linha com `occurred_at` infinito derruba a leitura inteira, onde a canônica põe em quarentena | Usa o **decodificador da Q-016**, sem cópia (`lerFatosParaReplayNaTransacao` aplicado a cada lote), e falha fechado se a forma dele mudar |
| A4 | `eventos` como proxy de tamanho e `versao` igual à canônica | A saída se passa pela canônica embora não carregue ids | `versao` própria; o proxy falha alto em qualquer acesso que não seja `length` (P5) |
| A5 | Sem `unit_id` | A canônica filtra aparelhos e projeções, mas conta UNKNOWN global | Mesmo filtro, provado (P1b, G1) |
| A6 | Medição: `maxRSS` inclui a fase de fixture; uma repetição; bancos separados | O pico do incremental parecia **menor** com mais dados (154 MiB a 126k contra 128 MiB a 1,036M no PR #52) | Banco semeado à parte; processo por medida que só lê; processo controle; 3 repetições em ordem rotativa; digest igual exigido |
| A7 | Porta canônica (PR #45) | Instante único RR ✓, projeção depois do COMMIT ✓, mas materializa todos os fatos (O(L)) e bloqueia o laço do Node na projeção | (referência; não muda) |

---

## 3. O módulo

### 3.1 Garantias e mecanismos

- **Instante único.** O primeiro comando é `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ
  ONLY`. Fatos (cursor), cadastro, último lote e contagens saem do mesmo instante. A montagem dos
  aparelhos e dos escopos roda depois do COMMIT, sem SQL.
- **Cursor em lotes.** `DECLARE … NO SCROLL CURSOR FOR SELECT … WHERE event_type = ANY($1)`, com as
  mesmas colunas da Q-016, e `FETCH FORWARD n`, com `n` inteiro de 1 a 20.000 (inválido falha antes
  de qualquer SQL, P6). O próximo `FETCH` sai antes de processar o lote atual, o que ataca os 27%
  de espera medidos no perfil de CPU; a promessa em voo nunca fica sem dono.
- **Decodificador canônico.** Cada lote passa por `lerFatosParaReplayNaTransacao` através de um
  cliente que responde ao seu único SELECT com o lote. Uma consulta a mais ou uma contagem diferente
  faz o módulo falhar fechado (`DECODIFICADOR_Q016_MUDOU`).
- **Acumulador por viagem**, tamanho fixo, espelho de `projetar`:
  - estado: maior posto de transição;
  - último fato: maior instante;
  - última posição: `instanteConfiavel`, a mesma função da projeção;
  - aparelho: o do último fato na ordem de aplicação, com empate para o que chegou depois;
  - ocorrências, contagem e frescor;
  - ordem entre viagens de `trip_id` empatado: a do primeiro fato aplicado.

  `TRANSICAO`/`RANK` são espelhos, porque `operacao-viva.ts` não os exporta.
  `Record<EstadoViagem,…>` faz o compilador acusar estado novo, e a transição nova é acusada pela
  equivalência com `projetar` (mutantes MI2/MI3).
- **Falha.** Qualquer erro dentro da transação leva o cliente ao ROLLBACK, e o cursor fecha junto.
  Nada parcial é devolvido e `medir` não é chamado (G3–G6).
- **Medidas** (`medir`): lotes, maior lote, linhas, aptos, UNKNOWN, quarentena (só contagem: a porta
  canônica não expõe quarentena, ver §8), escopos, viagens, aparelhos, `instantaneo_ms`,
  `transacao_ms` e `montagem_ms`.

### 3.2 O que muda no contrato, declarado

| Campo | Porta canônica | Leitor incremental |
|---|---|---|
| `versao` | `realidade-de-entregas@1.0.0` | `realidade-de-entregas-incremental@1.0.0` |
| `viagens[].eventos` | ids dos fatos | **contador**: `length` = nº de fatos. Índice, iteração, `Object.keys`, `JSON.stringify` e `structuredClone` falham com `IDS_FORENSES_NAO_CARREGADOS`; `util.inspect` mostra `{ length: n }` |
| todo o resto | — | igual (provado) |

A rota de produto usa só a view model (`entregasVM`), que lê `eventos.length`. A view model é
igual nas cinco variações de filtro.

---

## 4. Provas

| Prova | Resultado | O que trava |
|---|---|---|
| `run-q026-leitor-incremental-propriedades.ts` (sem banco: as **duas portas reais** sobre as mesmas linhas, na mesma ordem física) | **9/9** | P1: 387 logs adversariais comparados, 15.952 viagens, 3.189 linhas em quarentena, 3.614 UNKNOWN; em 13 logs as duas falharam **igual**, porque um instante infinito no último lote de um aparelho derruba a canônica. P1b filtro de unidade. P2 o lote não muda nada (1, 2, 3, 7, 64, 1024). P3 sem empate de texto, a ordem física não muda nada. P4/P4b empates de `localeCompare` (aparelho, ordem de viagens, ordem de escopos) acompanham a canônica nas duas ordens. P5 contador falha alto. P6 entradas inválidas. P7 sequência de comandos |
| `run-q026-leitor-incremental-pg.ts`, PostgreSQL 16, migrations reais, 132.004 fatos | **10/10** | G1 paridade e VM em cinco filtros e quatro unidades. G2 quatro escritas concorrentes (entre lotes, antes do último lote, antes das contagens): a leitura fica no seu instante, e a seguinte vê as quatro. G3 34000, G4 erro JS, G5 57014: ROLLBACK, conexão `idle`, sem cursor, `backend_xmin` NULL. G6 25006, nada gravado. G7 falha depois do COMMIT igual nas duas. G8 lotes exatos (257/1024/5000 e lote 1). G9 `backend_xmin` preso durante e solto depois. G10 contagens iguais às da Q-016 |
| a mesma suíte com **1.096.004** fatos (1,03M na viagem longa + 20 mil viagens curtas + 6 mil mistos), 20.072 viagens | **10/10** | idem, em escala |
| `run-q026-leitor-incremental-mutacoes.ts` | **14/14 mortos, 0 cegos** | cada regra (desempate do aparelho, posto, transição, último fato, relógio confiável, ocorrências, filtro de unidade, escopo sem viagem, UNKNOWN, REPEATABLE READ, READ ONLY, ordem de viagens, frescor, validação do lote) derruba o caso nomeado |
| `npm run test:platform:q016` / `:q016:mutacoes` | **27/27** · **14/14, 0 cegas** | replay forense da Q-016 intacta |
| `test:platform` / `topology` / `governanca` / `tsc --noEmit` | 44 OK · TOPOLOGIA OK · 14 guardas verdes · ok | sem regressão; imports dentro da topologia |
| calibração do medidor do laço (dentro de `run-q026-leitor-incremental-medicao.ts`) | 250 ms vistos como 251–255,5 ms nas quatro rodadas | controle positivo do instrumento: um processo faz uma consulta e bloqueia o laço por 250 ms; abaixo de 200 ms a medição reprova. Removendo o aquecimento **ou** a devolução ao laço, o mesmo bloqueio aparece como ~11 ms (§5) |

---

## 5. Medição — método

- **Ambiente:** PostgreSQL 16.15 descartável, colação `C.UTF-8`, Node 22, 4 vCPU / 16 GB; o CI
  repete em outro ambiente.
- **Fixture:** a mesma loja do PR #52 (determinística, 17 aparelhos, três modos, UNKNOWN,
  quarentena, escopo só com fato sem viagem). Semeada **uma vez** e seguida de `VACUUM ANALYZE`.
- **Medidas:** cada uma é um processo Node novo que só conecta e lê; o processo `controle` dá o
  piso. São 3 repetições por variante, em ordem rotativa.
- **Campos:**
  - `pico RSS` é o `maxRSS` do processo **ao fim da leitura**, antes do digest;
  - `instante` é o tempo entre o início e o fim do corpo da transação;
  - `fora da transação` é a leitura menos o instante: BEGIN, COMMIT e tudo o que roda depois do
    COMMIT (na canônica, a projeção inteira);
  - `laço máx` é o maior intervalo entre dois disparos do medidor do event loop (resolução de
    10 ms), da leitura até o fim da montagem.
- **O medidor do laço foi corrigido nesta rodada, e é calibrado.**
  - Defeito: a primeira versão desligava o histograma logo depois da leitura. O último trecho
    síncrono, a montagem depois do COMMIT, só entra no histograma quando o temporizador dispara de
    novo, e por isso **não era registrado**. Esse trecho é justamente o maior bloqueio da canônica.
  - Segundo ponto cego: o medidor só registra a partir do seu segundo disparo, então um bloqueio
    antes dele também sumia.
  - Correção: o medidor é aquecido antes de ler e só é desligado depois de devolver o controle ao
    laço.
  - Antes de cada cenário, um processo de **calibração** faz uma consulta e bloqueia o laço por
    250 ms de propósito. Se o medidor vir menos de 200 ms, a medição reprova.
  - Controle feito à mão: removendo o aquecimento **ou** a devolução ao laço, a calibração vê ~11 ms
    e reprova; com os dois, vê ~253 ms.
  - Os números de laço de rodadas anteriores estavam subestimados e foram descartados.
- **Validade:** canônico e incremental têm de produzir o **mesmo digest** (leitura + VM em cinco
  filtros). Toda tabela abaixo passou nisso.
- **Rodada:** as quatro tabelas são do código final deste commit, módulo e medidor, numa rodada
  única e sequencial. Rodadas anteriores, de versões intermediárias do módulo ou do medidor, ficaram
  fora das tabelas. O job `medicao` do CI repete os quatro cenários em outra máquina e publica o
  JSON de cada um como artefato.

## 6. Medição — resultados (mediana, [mín–máx], 3 repetições)

**viagem longa 126k** — 126.004 fatos dos tipos lidos, 72 viagens; digest único nas 9 leituras (3 variantes × 3 repetições); calibração do medidor do laço: 250 ms vistos como 251,0 ms

| variante | leitura (ms) | instante MVCC (ms) | fora da transação (ms) | pico RSS (MiB) | pico − início (MiB) | heap retido (MiB) | laço máx (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| controle | – | – | – | 92,2 [91,3–95,3] | 0,3 [0,2–0,4] | – | 10 [10–10] |
| canonico | 2.134 [2.077–2.350] | 1.493 [1.472–1.642] | 663 [584–708] | 268,7 [264,9–273,7] | 178,3 [172,1–179,2] | 5,8 [5,7–5,8] | 666 [588–706] |
| incremental/1024 | 1.753 [1.634–1.776] | 1.748 [1.630–1.770] | 5 [4–5] | 164,9 [163,0–166,6] | 71,5 [71,2–72,1] | 0,4 [0,4–0,4] | 31 [26–31] |
| incremental/4096 | 1.744 [1.664–1.783] | 1.739 [1.660–1.778] | 4 [4–5] | 177,8 [174,6–178,0] | 83,6 [80,7–85,0] | 0,4 [0,4–0,4] | 81 [75–128] |
| **Δ incremental/1024 × canônico** | **-18%** | **+17%** | **-99%** | **-39%** | **-60%** | **≈0 (era 5,8)** | **-95%** |

**viagem longa 306k** — 306.004 fatos dos tipos lidos, 72 viagens; digest único nas 9 leituras (3 variantes × 3 repetições); calibração do medidor do laço: 250 ms vistos como 251,0 ms

| variante | leitura (ms) | instante MVCC (ms) | fora da transação (ms) | pico RSS (MiB) | pico − início (MiB) | heap retido (MiB) | laço máx (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| controle | – | – | – | 95,1 [91,9–95,9] | 0,1 [0,0–0,3] | – | 10 [10–10] |
| canonico | 5.261 [4.838–5.518] | 3.602 [3.379–3.799] | 1.658 [1.460–1.719] | 471,2 [470,6–474,7] | 379,4 [378,4–382,3] | 12,9 [12,9–12,9] | 1.658 [1.463–1.721] |
| incremental/1024 | 4.085 [3.855–4.630] | 4.081 [3.850–4.624] | 6 [4–6] | 164,7 [164,6–164,7] | 72,8 [72,8–72,8] | -0,9 [-0,9–-0,9] | 30 [28–34] |
| incremental/4096 | 3.912 [3.894–3.968] | 3.907 [3.889–3.964] | 4 [4–5] | 186,9 [175,7–208,5] | 95,3 [84,0–114,0] | 0,4 [0,4–0,4] | 78 [77–84] |
| **Δ incremental/1024 × canônico** | **-22%** | **+13%** | **-100%** | **-65%** | **-81%** | **≈0 (era 12,9)** | **-98%** |

**viagem longa 1,036M** — 1.036.004 fatos dos tipos lidos, 72 viagens; digest único nas 9 leituras (3 variantes × 3 repetições); calibração do medidor do laço: 250 ms vistos como 255,5 ms

| variante | leitura (ms) | instante MVCC (ms) | fora da transação (ms) | pico RSS (MiB) | pico − início (MiB) | heap retido (MiB) | laço máx (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| controle | – | – | – | 92,2 [91,8–97,8] | 0,2 [0,1–0,2] | – | 10 [10–10] |
| canonico | 18.142 [18.002–19.250] | 11.280 [10.977–11.839] | 7.025 [6.862–7.411] | 1.313,5 [1.310,4–1.313,8] | 1.221,6 [1.219,3–1.222,6] | 42,2 [42,2–42,2] | 7.030 [6.866–7.411] |
| incremental/1024 | 12.501 [12.256–13.460] | 12.497 [12.250–13.454] | 6 [4–6] | 167,9 [163,6–171,4] | 73,2 [72,1–74,2] | -0,8 [-0,8–-0,8] | 33 [29–35] |
| incremental/4096 | 12.965 [12.735–13.361] | 12.960 [12.730–13.356] | 5 [5–5] | 201,7 [200,6–206,4] | 110,2 [106,1–111,3] | -0,8 [-0,8–-0,8] | 90 [75–130] |
| **Δ incremental/1024 × canônico** | **-31%** | **+11%** | **-100%** | **-87%** | **-94%** | **≈0 (era 42,2)** | **-100%** |

**200 mil viagens curtas** — 606.004 fatos dos tipos lidos, 200.071 viagens; digest único nas 9 leituras (3 variantes × 3 repetições); calibração do medidor do laço: 250 ms vistos como 251,4 ms

| variante | leitura (ms) | instante MVCC (ms) | fora da transação (ms) | pico RSS (MiB) | pico − início (MiB) | heap retido (MiB) | laço máx (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| controle | – | – | – | 91,8 [91,7–93,9] | 0,3 [0,2–0,4] | – | 10 [10–10] |
| canonico | 9.583 [9.514–10.347] | 6.730 [6.715–7.076] | 2.852 [2.798–3.272] | 893,3 [877,3–903,8] | 798,1 [783,0–810,3] | 103,5 [103,5–103,5] | 2.854 [2.806–3.272] |
| incremental/1024 | 8.420 [8.263–8.947] | 8.114 [7.983–8.609] | 306 [279–338] | 443,6 [443,4–460,6] | 348,7 [348,5–365,6] | 62,0 [62,0–62,0] | 310 [276–340] |
| incremental/4096 | 8.146 [8.029–8.342] | 7.875 [7.731–7.974] | 298 [272–368] | 398,9 [398,0–405,1] | 306,8 [304,6–307,0] | 62,0 [62,0–62,0] | 301 [278–366] |
| **Δ incremental/1024 × canônico** | **-12%** | **+21%** | **-89%** | **-50%** | **-56%** | **-40%** | **-89%** |

**O que os números dizem, sem esconder:**

- **Memória.** Com uma viagem longa, o pico do incremental fica estável: 164,7–167,9 MiB (medianas)
  de 126k a 1,036M fatos, com lote 1024. A canônica cresce com o log: 269 → 1.314 MiB. Com **200
  mil viagens curtas** o incremental sobe para 444 MiB, porque guarda um acumulador por viagem e a
  saída tem uma viagem por viagem. **Não é O(1).**
- **Laço do Node.** O piso do medidor é a resolução, 10 ms (processo controle).
  - A canônica bloqueia o event loop na projeção síncrona depois do COMMIT: medianas de 0,67 s
    (126k), 1,66 s (306k), 7,0 s (1,036M) e 2,85 s (200 mil viagens). O laço máx coincide com a
    coluna "fora da transação".
  - O incremental devolve o controle a cada lote: medianas de 30–33 ms com uma viagem longa, e pior
    repetição de 35 ms.
  - Com 200 mil viagens, o incremental ainda bloqueia **~310 ms** (pior repetição 340 ms). É a
    montagem das viagens depois do COMMIT, ordenação e objetos, que é síncrona.
  - Numa rota HTTP, isso é o que as outras requisições sentem.
- **Tempo total.** A leitura inteira ficou mais curta nos quatro cenários: −18% (126k), −22%
  (306k), −31% (1,036M) e −12% (200 mil viagens). Foi medido em processo isolado, sem leitor
  concorrente.
- **Instante MVCC.** O incremental faz a redução DENTRO da transação, e por isso o instante fica
  **mais longo nos quatro cenários**: +17%, +13%, +11% e +21%. As faixas [mín–máx] não se cruzam,
  salvo a 126k, onde se sobrepõem de leve (1.630–1.642 ms).
  - O instante da canônica varia entre rodadas. A 1,036M foi de 13,2 s numa rodada anterior e de
    11,3 s nesta; numa rodada a 306k o incremental chegou a ficar abaixo dela.
  - Só esta rodada entra na tabela. A conclusão honesta é que **não há ganho de instante**: ele
    piora de 11% a 21%, e só a memória, o laço e o tempo total melhoram.

  Durante o instante, `backend_xmin` segura o horizonte do VACUUM. O efeito em tabelas com UPDATE
  (outbox) sob escrita real **não foi medido**.
- **Lote.** Com uma viagem longa, 4096 não ganha tempo de forma consistente e piora o pico (178–202
  contra 165–168 MiB) e o laço (78–90 contra 30–33 ms). Com 200 mil viagens, baixa o pico (399
  contra 444 MiB) sem mudar o laço. O padrão fica **1024**.
- **Perfil de CPU** (126k, antes da pré-busca):
  - 27% era espera pelo `FETCH`, o que motivou a pré-busca;
  - o resto é decodificação da Q-016 e parse de datas do driver, que a canônica também paga;
  - o acumulador custa ~7%.

---

## 7. Riscos

1. **Instante 11% a 21% mais longo em todos os cenários** (§6). Uma leitura longa segura o
   VACUUM. Mitigação possível, não feita: buffer colunar compacto dentro da transação e redução
   depois do COMMIT. Ela troca instante curto por memória O(L) pequena.
2. **Montagem síncrona depois do COMMIT.** Com 200 mil viagens, bloqueia o laço por ~310 ms (§6).
   Mitigação possível, não feita: montar as viagens em fatias e devolver o laço entre elas; a
   ordenação continua num passo só.
3. **Mapeamento de aparelho duplicado**: o mesmo SQL e o mesmo mapeamento da canônica, copiados
   para não mexer na porta canônica. A paridade trava (G1, P1), mas uma mudança futura na canônica
   exige a mesma mudança aqui.
4. **`TRANSICAO`/`RANK` espelhados.** Estado novo é pego pelo compilador; transição nova, pelo teste
   de equivalência, se ele rodar.
5. **Empate de `localeCompare`** (ids distintos em bytes): o incremental acompanha a canônica **na
   mesma ordem física**, mas a canônica muda com a ordem física (P4b). A classe é latente: os
   produtores do repositório geram ids ASCII.
6. **Herdado da canônica (G7):** um `occurred_at` ilegível no **último lote** de um aparelho derruba
   a leitura inteira, nas duas portas. A classe é latente, porque a ingestão recusa esse valor.
7. **Contrato de `eventos`.** Quem precisar de ids e receber esta leitura falha alto (de propósito).
   Ninguém no repositório lê ids desta porta hoje (`entregasVM` usa `length`).
8. **Precondição:** `idempotency_key` UNIQUE no event log (migration 0001). O acumulador não
   deduplica, e a projeção deduplica.

## 8. O que impede o uso real — PENDENTE

| Item | Estado |
|---|---|
| Ligar na rota `GET /api/entregas` | **PENDENTE**: exige mudar `tools/product_system_server.ts`, proibido nesta missão. É uma troca de função atrás de flag, mas tem de conviver com o adaptador de prazo do PR #55, que intercepta os SELECTs da porta canônica; um `FETCH` por lote muda esse desenho |
| Prazo total, cancelamento e orçamento de pool | **PENDENTE**: `statement_timeout` vale por `FETCH`, não pela leitura inteira (ver PR #55) |
| Efeito do instante longo no VACUUM sob escrita real | **NÃO MEDIDO** |
| Leitores concorrentes, p95/p99, CPU sob carga | **NÃO MEDIDO** |
| Quarentena declarada na leitura | **PENDENTE** (a canônica também não declara; decisão de produto) |
| Dados reais, Preview, aparelho físico | **NÃO EXECUTADO** |
| Q-026 (janela) e Q-024 (turno) | **ABERTAS**: este trabalho não as responde |

A pesquisa da rota real segue em paralelo nos PRs Q-026 #53–#57, #59, #60 e #62–#64. Pelos
títulos, eles cobrem prazo total, cancelamento, pool, 503, laço com `/api/health` e atribuição por
fase. Nenhum deles importa este módulo, que nasce neste PR. Ligar o módulo àquela pesquisa é um
passo próprio, com auditoria de integração.

### 8.1 O gate do handoff no PR #52

O comentário de handoff no PR #52 (10/10, 22:46 UTC) lista o que uma candidata incremental tem de
mostrar. Ele chegou depois do início desta missão; o mapa abaixo diz o que este PR cobre e o que
não cobre.

| Exigência | Estado | Evidência ou motivo |
|---|---|---|
| Mesma fixture, paridade integral de dados e view models | **PROVADO** | A loja do PR #52, com casos adversariais a mais. G1 a 132k e 1,096M; P1–P4b; digest único em toda medida (§6) |
| RR READ ONLY | **PROVADO** | P7 (sequência de comandos), G6 (25006), mutantes MI10/MI11 |
| `backend_xmin` liberado | **PROVADO** na conexão do leitor | G9 (preso durante, NULL depois); G3–G5 (NULL depois de falha) |
| Tempo SQL | **PARCIAL** | O instante inclui SQL, decodificação e redução intercalados (pré-busca). A espera pelo banco não foi separada |
| Duração da transação | **PROVADO** | Coluna "instante MVCC" (§6) |
| Pós-projeção | **PROVADO** | Coluna "fora da transação" (§6) |
| RSS em processo isolado | **PROVADO** | §5 e §6, com processo controle |
| Responsividade de `/api/health` | **PENDENTE** | Exige ligar o módulo na rota, proibido aqui. Medido só o atraso do laço no processo que lê, com medidor calibrado (§5): é o mecanismo, não a rota |
| Concorrência | **PARCIAL** | Escritores concorrentes provados (G2). Leitores simultâneos e disputa de pool não medidos |
| Abort de cliente no meio do FETCH | **PENDENTE** | O módulo não aceita sinal de cancelamento. Erro no meio da leitura leva a ROLLBACK provado (G3–G5), mas um cliente HTTP que desiste não interrompe a leitura, como na canônica. Proposta: `sinal?: AbortSignal` conferido a cada lote, com latência de cancelamento de um `FETCH` |
| Replay forense Q-016 separado | **PROVADO** | `src/platform/projections/**` fora do diff; `test:platform:q016` 27/27 e mutações 14/14 |
| Não inferir latência menor pelo RSS | **RESPEITADO** | O tempo total foi medido diretamente, em processo isolado e sem concorrência. O instante MVCC não melhora (§6). Latência HTTP não foi medida |

## 9. Forma de decisão (CLAUDE.md §8)

**(1) Sabemos:**

- o módulo dá a mesma leitura e a mesma tela da canônica nas provas acima;
- falha fechado com ROLLBACK;
- usa uma transação RR só;
- a memória deixa de crescer com o tamanho de uma viagem;
- com uma viagem longa, o laço do Node deixa de travar: 30–33 ms contra 0,67–7,0 s;
- com 200 mil viagens, o laço ainda trava ~310 ms (a canônica, 2,85 s);
- o instante MVCC piora de 11% a 21%.

**(2) Hipótese:**

- com dados reais, que têm mais viagens curtas e menos viagens gigantes, o ganho fica perto do
  cenário de 200 mil viagens, o menor dos quatro;
- a pré-busca segura o instante sob carga.

**(3) Falta validar:** tudo da §8.

**(4) Risco:** §7. O mais concreto é o instante mais longo, sobretudo com muitas viagens curtas
(+21%).

**(5) Próxima ação mais segura:**

- revisão humana do contrato de `eventos`;
- decidir se a rota deve ganhar uma flag para este leitor, junto com o prazo do PR #55;
- medir o instante sob escrita real numa composição descartável.

**(6) Não fazer agora:**

- ligar na rota sem flag;
- trocar a porta canônica;
- substituir a replay da Q-016;
- decidir a janela da Q-026 por conveniência técnica.

## 10. Reproduzir

```bash
npx tsx tests/product/run-q026-leitor-incremental-propriedades.ts   # 9/9, sem banco
export DELIVERYOS_PG_URL=postgres://<admin>@<host-descartavel>/postgres   # nunca o operacional
npx tsx tests/product/run-q026-leitor-incremental-pg.ts             # 10/10 (Q026_INC_LONGA, Q026_INC_CURTAS)
npx tsx tests/product/run-q026-leitor-incremental-mutacoes.ts       # 14/14, 0 cegos
Q026_MEDIDA_LONGA=1030000 Q026_MEDIDA_LOTES=1024,4096 Q026_MEDIDA_SAIDA=m.json \
  npx tsx tests/product/run-q026-leitor-incremental-medicao.ts
```

Sem `DELIVERYOS_PG_URL`, as suítes de banco saem **78** (PULADAS), nunca verdes.
