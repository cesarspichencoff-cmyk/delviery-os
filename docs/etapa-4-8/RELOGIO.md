---
lifecycle:
  artefato: docs/etapa-4-8/RELOGIO.md
  status: ACTIVE
  authority_scope: relogio_do_aparelho
  superseded_by: null
  atualizado_em: "2026-09-25"
  state_basis: 93a02a6
  question_refs: ["Q-003", "Q-004", "Q-015"]
---

# Relógio do aparelho — CAPTURADO ≠ HORÁRIO CONFIÁVEL

Decisão do César, 2026-09-25: **um ponto com relógio inconsistente não é descartado por isso.**
Ficam preservados a coordenada, o `occurred_at` enviado pelo aparelho, o `recorded_at` do servidor
e a evidência de que o ponto chegou. O que o relógio do aparelho perde, quando o desvio é
material, é a **autoridade temporal**. Nada é convertido em silêncio; `occurred_at` nunca é
reescrito.

**GPS RECEBIDO ≠ HORÁRIO DO APARELHO CONFIÁVEL.** São duas dimensões, e esta correção as separa.

## 1 — O defeito, reproduzido antes de corrigir

Em `93a02a6`, sem uma linha alterada: binários de `dist/` (crítico **e** assíncrono), PostgreSQL
real, banco isolado. Aparelho A com t−30 s, **t+24 h**, t−5 s; controles B (t−30 s, t−5 s) e
C (t−1 h, capturado offline, relógio certo).

| medida | resultado |
|---|---|
| ingestão | os 6 pontos 200 `aceito`, inclusive o de +86 400 s |
| event log | **todo** fato `clock_trust = 'trusted'` — o padrão da coluna (0001); o writer da plataforma nunca a preenchia |
| replay real (dois boots do assíncrono) | `unknown: 1` para A; digest idêntico nos dois boots — a distorção sobrevive a reinício |
| projeção de A | `ultima_posicao_em` = o +24 h; `unknown` agora, **`fresh` daqui a 24 h sem ponto novo** |
| Entregas, aparelho A | GPS `unknown` agora, **`fresh` em +24 h**; "última posição" = o +24 h |
| controles | B `fresh` → `stale` em 24 h; C `stale` |

## 2 — A regra

**Vocabulário e tolerância não são novos.** São os do contrato que já existia em Entregas:
`CLOCK_TRUST = ["trusted", "suspect", "unknown"]` (`src/entregas/foundation/enums.ts`) e
`clock_skew_tolerance_ms: 120000` (`src/entregas/gps/types.ts`). A plataforma não importa Entregas
(regra estrutural), então os repete em `src/platform/contracts/relogio.ts`, e o V1 reprova se
divergirem.

**O julgamento é assimétrico, e é do servidor:**

- `occurred_at` **adiantado** mais de 120 s em relação à hora em que o servidor recebeu →
  `suspect`. Um ponto não pode ter acontecido depois de chegar.
- **Atrasado** não é evidência de relógio errado: é o ponto capturado sem rede e sincronizado
  depois → `trusted`. A regra simétrica do piloto (`|desvio| > tolerância`) marcaria todo ponto
  offline como suspeito. É a mutação M6, e ela é acusada.

**O relógio efetivo nunca é só o carimbo** (`relogioEfetivo`). O `clock_trust` gravado só vale se
os instantes imutáveis (`occurred_at`, `recorded_at`) concordarem:
- o padrão `trusted` da 0001, que carimbou todo o histórico sem avaliação, é rebaixado quando o
  fato estava adiantado;
- `suspect` nunca volta a confiar;
- ausente é julgado pela mesma regra, nunca presumido.

**O instante que decide frescor** (`instanteConfiavel`):
- com relógio `trusted`, o `occurred_at` exato;
- sem autoridade, a hora em que o servidor recebeu. Um ponto de amanhã **não** fica fresco amanhã:
  fica fresco agora, quando chegou, e envelhece daí;
- com carimbo que não se pode conferir, nada — e sem instante o frescor é `unknown`, nunca fresco
  por ausência.

**A fronteira é a ingestão.** Todo fato de aparelho passa por ela e chega aos consumidores com os
dois carimbos do servidor: `received_at` e `clock_trust`, na mensagem da outbox e, no replay,
lidos do event log. O R9 prova isso, e as mutações M11 e M12 o atacam.

Um envelope **sem nenhum** carimbo não passou pela ingestão: fixture, demonstração, ou mensagem da
outbox gravada antes desta correção. Para ele vale o instante que declara, como sempre valeu, e o
relógio dele segue `unknown`, sem classificação.

## 3 — Onde mora

| arquivo | o que mudou |
|---|---|
| `src/platform/contracts/relogio.ts` | **novo**: vocabulário, tolerância, `classificarRelogio`, `relogioEfetivo`, `instanteConfiavel` |
| `src/platform/contracts/event-catalog.ts` | envelope ganha `received_at?` e `clock_trust?`, ambos do servidor e nunca do produtor |
| `src/platform/ingest/ingest-service.ts` | julga o relógio contra a hora do servidor; grava `clock_trust` no fato; leva `received_at` e `clock_trust` na mensagem |
| `src/platform/persistence/pg-repositories.ts` | `clock_trust` obrigatório no tipo e explícito no INSERT, sem `?? "trusted"` |
| `src/platform/projections/consumidor.ts` | reconstrói o envelope ao vivo com os dois carimbos; fora do vocabulário vira ausente |
| `src/platform/projections/replay-do-event-log.ts` | lê `recorded_at` e `clock_trust` do log |
| `src/platform/projections/operacao-viva.ts` | `ultima_posicao_em` passa a ser o **instante confiável** da posição — a base do frescor que a Operação Viva e o Conference Brain já usavam, sem tocar neles |
| `src/platform/leitura/realidade-de-entregas.ts` | "último lote" pelo relógio do **servidor** (`recorded_at`), com o relógio efetivo do lote |
| `src/product/viewmodels/entregas-vm.ts` | GPS pelo instante confiável; selo `evidencia_insuficiente` quando o relógio do último lote não tem autoridade. É a classe confirmada pelo César (estados real/parcial/unknown do bloco Realidade) |

Sem migration. O schema não mudou (§6).

## 4 — Depois

Mesma reprodução, código corrigido:

| medida | resultado |
|---|---|
| event log | o +86 400 s é **`suspect`**; o resto `trusted`, inclusive o ponto offline de 1 h atrás |
| replay real, dois boots | `fresh: 2, stale: 1, unknown: 0`, digest idêntico |
| projeção de A | `ultima_posicao_em` = hora do servidor; `fresh` agora, **`stale` em +24 h** |
| Entregas, aparelho A | último lote = o ponto de t−5 s, o mais recente pelo relógio do **servidor**; GPS `fresh` agora, `stale` em +24 h |

## 5 — Provas

`test:platform:relogio` (**13/13**, binários de `dist/` e PostgreSQL real):

| prova | o que afirma |
|---|---|
| V1 | vocabulário e tolerância = os do contrato de Entregas |
| U1–U3 | a regra pura: julgamento, relógio efetivo, instante confiável e a fronteira da ingestão |
| R1 | todo ponto é aceito — o suspeito não é descartado |
| R2 | o event log guarda o julgamento: +24 h `suspect`; relógio certo e ponto offline antigo `trusted` |
| R3 | `occurred_at` exatamente como enviado, coordenada intacta, `recorded_at` do servidor |
| R4 | o aparelho não declara o próprio relógio nem a hora do servidor |
| R5 | o ponto de amanhã não fica fresco amanhã; relógio ruim continua sendo GPS |
| R6 | ao vivo (outbox, pelo binário) e replay (event log, processo novo) chegam ao mesmo frescor |
| R7 | Entregas: último lote pelo relógio do servidor, GPS pelo instante confiável, selo; nada fresco em +24 h |
| R8 | histórico com o padrão `trusted` não fabrica frescor |
| R9 | todo fato ingerido leva os dois carimbos do servidor, na outbox e no replay |

`test:platform:relogio:mutacoes`: **13/13 — 1 controle positivo e 12 mutações, zero cegas**. Cada arquivo
mutado volta com o SHA-256 de origem, e `dist/` é reconstruído antes e depois de toda mutação em
código que vai para os binários (M8 e M9 tocam só a leitura e a superfície). A mutação só conta como
acusada se a prova da assinatura estiver entre as que reprovaram.

| ID | defeito devolvido | assinatura exigida | acusaram |
|---|---|---|---|
| M1 | +24 h continua `trusted` (a tolerância engole o dia) | R2 | V1 U1 U2 R2 R4 R5 R6 R7 R8 |
| M2 | ponto futuro fabrica frescor (a projeção volta ao `occurred_at`) | R5 | R5 R6 R8 |
| M3 | o replay volta a confiar num relógio já classificado | R6 | R5 R6 R8 |
| M4 | ponto suspeito descartado | R1 | R1 R2 R3 R4 R5 R6 R7 R9 |
| M5 | `occurred_at` reescrito com a hora do servidor | R3 | R3 R7 |
| M6 | relógio correto marcado não confiável (regra simétrica do piloto) | R2 | U1 R2 R5 R6 |
| M7 | ausência de classificação cai para `trusted` (o escritor omite a coluna) | R2 | R2 R4 |
| M8 | último lote escolhido pelo relógio do aparelho | R7 | R7 |
| M9 | Entregas mede o frescor pelo relógio do aparelho | R7 | R7 |
| M10 | o carimbo padrão do histórico volta a dar autoridade | R8 | U2 R8 |
| M11 | a mensagem da outbox perde os carimbos do servidor | R9 | R6 R9 |
| M12 | o replay perde os carimbos do servidor | R9 | R5 R6 R8 R9 |

## 6 — Limites declarados

- **O padrão `trusted` da coluna continua** (0001). Um escritor que omitir `clock_trust` ainda
  grava `trusted`.
  - Os escritores da plataforma passam o valor explicitamente: o tipo é obrigatório e o M7 prova.
  - Os consumidores conferem o carimbo contra `recorded_at` (R8).
  - A coluna é `NOT NULL DEFAULT 'trusted'`: retirar o padrão quebraria 19 `INSERT`s em 7 suítes e
    2 scripts de composição (`tools/`) que gravam no event log sem a coluna — contado por `grep`, fora o
    R8 desta suíte, que omite a coluna de propósito. É mudança de schema numa tabela do Preservation
    Set, e fica para decisão do César.
- **O histórico não foi corrigido.** Fatos anteriores carregam `trusted` sem avaliação. Não há
  backfill: o log é append-only. O consumidor os julga pelos instantes.
- **Relógio atrasado passa como `trusted`.** É indistinguível de ponto capturado sem rede, e só faz
  o dado parecer mais velho — nunca fabrica frescor.
- **Ponto offline com relógio adiantado** tem o frescor medido pela hora em que chegou. Pode parecer
  mais recente que a captura; é o custo da regra "relógio do servidor", e o selo aparece em Entregas.
- **Relógio 60–120 s adiantado** é `trusted` (dentro da tolerância do contrato). A guarda de 60 s
  que já existia em `classificarFrescor` o lê como `unknown`: conservador, não fabrica frescor.
- **`ultimo_fato_em` continua sendo o `occurred_at`**, como evidência. Ele alimenta o atraso de
  viagens com ciclo de vida, que ainda nasce no piloto, fora desta missão.
- **Operação Viva e Conference Brain não foram tocados.** Recebem `ultima_posicao_em` já como
  instante confiável, mas não mostram o selo do relógio: a mudança nessas superfícies fica fora da
  classe confirmada.
- **Mensagens da outbox gravadas antes desta correção** não trazem os carimbos. Consumidas ao
  vivo, valem pelo instante declarado até o próximo replay, que as julga a partir do event log.
- **O digest da Q-016 cobre a identidade dos fatos, não os carimbos.** A igualdade ao vivo × replay
  do frescor é provada pelo R6.
- **`PgFactSink`** não passa `clock_trust`. Ele não é usado por nenhum caminho de produção
  (`CriticalRuntime` o recebe e não o usa).

## 7 — Decisões

- **Tomada pelo César em 2026-09-25**: a política temporal — CAPTURADO ≠ HORÁRIO CONFIÁVEL — e a
  preferência pelo relógio do servidor para o frescor quando o do aparelho não tem autoridade.
- **Seguida do registro de abertura** (`docs/execution/BLOCKERS.md`): das duas perguntas que ele
  deixava, o ponto é **aceito marcado**, nunca recusado; e o padrão da coluna **fica** (§6).
- **Da direção do piloto** vieram o vocabulário e a tolerância, **não a regra**: a do piloto
  (`src/entregas/gps/validate.ts`) é simétrica e marcaria todo ponto offline como suspeito — é a M6.
- **Fora desta missão**, e só por decisão do César se um dia for proposto: retirar o padrão
  `trusted` da coluna (DDL numa tabela do Preservation Set); o atraso das viagens com ciclo de vida,
  que nasce no piloto.
- Nenhuma pergunta nova. Q-003, Q-004 e Q-015 intocadas.

## 8 — Regressão curta

Cada gate isolado, sobre o código final e PostgreSQL real. Primeira passada, 52 gates:

| classe | gates |
|---|---|
| PASS | 49 |
| `FAIL_NOVO` — achado e fechado | `test:platform:q016:mutacoes`, 11/14: MQ1, MQ2 e MQ7 **não aplicadas** — as âncoras eram as duas linhas que esta correção mudou (o `INSERT` do escritor e o `SELECT` da porta). Reancoradas no texto novo, com o mesmo defeito: **14/14, zero cegas**, cada uma acusada pela assinatura de antes (C1, C5, P11) |
| `FAIL_PREEXISTENTE` | `test:platform:governanca` (G6b de `STATE.json`, G9 de Q-014) e `test:platform:governanca:mutacoes`, que aborta pelo mesmo motivo — linhas idênticas às da regressão final da certificação |

Depois, fora da primeira lista: `test:platform:pb19:mutacoes` **14/14** e
`test:platform:append-only:mutacoes` **14/14**, ambas zero cegas, e `test:platform:backup` **19/19**.
As linhas que o diff removeu foram cruzadas com as âncoras de todas as suítes de mutação: das
suítes de outras missões, só a da Q-016 ancorava nelas.

Destaques da primeira passada: `relogio:mutacoes` 13/13, `cadeia` 35/35, `cadeia:mutacoes` 14/14,
`q016` 27/27, `q016:processos` 14/14, `q017` 18/18, `q017:mutacoes` 17/17, `spine:mutacoes` 31/31,
`m1-bridge` 35, `m1b-mutations` 11, `entregas:android` 35, `entregas:device-api` 29, `test:lab` verde.

**Zero `FAIL_NOVO`.** Os gates que leem documento rodam de novo depois do commit da documentação.
