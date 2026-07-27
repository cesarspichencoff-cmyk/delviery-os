# Validação do observador ao vivo — Sprint 2

**Veredito desta fase: `COLETOR IMPLEMENTADO — VALIDAÇÃO AO VIVO PENDENTE`.**

Este documento separa, sem ambiguidade, o que foi validado com dados/lógica
reais do que foi validado só com dublê (fixture) — e explica exatamente por
que a validação ao vivo não aconteceu, em vez de simulá-la.

## 1. O que foi verificado sobre este ambiente, e o que isso significa

Antes de escrever qualquer linha de coletor, foi checado se uma validação ao
vivo era sequer possível aqui:

| Verificação | Resultado |
|---|---|
| `playwright` como dependência do projeto | **ausente** (`npm ls playwright` vazio neste worktree) |
| Binários do Chromium na máquina | **presentes** (`C:\Users\italo\AppData\Local\ms-playwright\chromium-1228`, de instalação anterior não relacionada a este projeto) |
| Perfil de navegador / sessão autorizada do iFood no projeto | **ausente** (nenhum `storageState.json`, cookie ou diretório de perfil) |
| Variáveis de ambiente de sessão/credencial | **ausentes** |
| Resolução de rede até o domínio do parceiro | **funciona** (DNS resolve; nunca usado para tentar autenticar) |

**Conclusão, sem meio-termo:** o motor de navegador poderia ser montado em
minutos — mas isso não é o que falta. O que falta é uma **sessão humana
autorizada**: alguém abrir o Chrome, fazer login na conta do parceiro TATÁ, e
deixar essa sessão disponível para observação passiva (perfil persistente ou
CDP). Essa etapa é, por instrução explícita da missão e por princípio deste
projeto, **intransponível por automação**: o coletor nunca loga sozinho, nunca
digita senha, nunca contorna 2FA. Logo, a ausência de sessão não é uma falta de
engenharia — é a fronteira certa ficando exatamente onde deveria.

## 2. O que FOI validado — com dados e lógica reais

### 2.1 Reconciliação por campo contra os 36 IDs duplicados reais do Sprint 1

Não é fixture: são os mesmos dois relatórios HTML do iFood usados na validação
histórica do Sprint 1 (`tools/conference-brain/validate-historical.js`). Os 36
pedidos que aparecem nos dois lotes foram passados pela reconciliação nova
(`live/reconciliation.js`) — não pela deduplicação simples do Sprint 1.

Resultado: **0 exceções, 0 itens perdidos, 36/36 com pelo menos uma anomalia
registrada** — todas do tipo `conflito_de_valor` no campo `received_at`.

Achado concreto (não hipotético): o pedido `a0eb2c4d-4f77-497b-a731-545bd89e1747`
aparece como `30/06/2026 21:02` no relatório de 20–30/06 e como
`01/07/2026 21:02` no relatório de 01/07 — mesma hora, dia diferente. Isso
confirma, com um caso real e não com suposição, o risco já registrado em
`docs/Checklist_Fonte_Continua_iFood.md:41`: *"um export dizia '01/07' mas
cobria 30/06 21h→01/07 21h — sem essa confirmação, qualquer replay corre risco
de erro silencioso de data."* A reconciliação por campo não só sobrevive a
esse caso — ela o **aponta com precisão** (campo exato, os dois valores, os
dois horários de observação), onde a deduplicação do Sprint 1 só dizia
"há divergência" sem dizer em quê.

### 2.2 Modo de Mapeamento contra HTML real

`live/mapping-mode.js` rodou sobre o relatório HTML real de 01/07 (a mesma
fonte usada no Sprint 1) e produziu uma assinatura estrutural estável — 40
nomes de classe, contagens por faixa, três textos de status (`CONCLUDED`,
`CANCELLED`, `DECLINED`) — **sem nenhum atributo sinalizado como PII** e sem
persistir um byte do HTML bruto. Isso prova que a extração estrutural funciona
de verdade contra HTML real do iFood; o que não foi provado é que a MESMA
lógica funciona contra a tela ao vivo de gestão de pedidos, que é uma
superfície diferente (ver `IFOOD_SCREEN_SOURCE_MAP_V1.md`).

### 2.3 Lógica de ciclo, relógio, painel e saúde — testada com dublê deliberado

`tests/conference-brain/live-observer.test.js` (79 testes) substitui o
navegador por um **driver falso** que implementa o mesmo subconjunto de API
que `browser-adapter.js` usa de verdade (`hasElement`, `queryAll`,
`elementText`). Isso não é fingir uma validação ao vivo — é testar a LÓGICA
(extração, health, diff entre ciclos, emissão de eventos, idempotência,
reconciliação, relógio, painel) de forma isolada da pergunta "o Chromium sabe
conversar com o iFood", que é exatamente a pergunta que só uma sessão real
responde.

Provado com o driver falso e com o observador completo:
- ciclos repetidos com o mesmo status não geram evento duplicado;
- `departed_observed` só é emitido quando comprovado — `completed` sozinho
  nunca gera saída inventada;
- pedido que some da tela vira `missing_from_view`, nunca uma saída presumida;
- reinício do processo, relendo só o que está persistido, reconstrói o mesmo
  estado do relógio sem duplicar `ready_observed`;
- captcha e tela de login suspendem o ciclo sem tentar ler pedidos;
- exceção na observação nunca derruba o processo — vira saúde `unavailable`.

### 2.4 Suítes completas — nenhuma regressão

| Suíte | Resultado |
|---|---|
| `tests/live` + simulador | 243 passando |
| Copiloto | 53 passando |
| Capacidade Viva | 43 passando |
| Conference-brain Sprint 1 (fundação) | 55 passando |
| Conference-brain Sprint 2 (observador ao vivo) | 79 passando |
| Validação histórica Sprint 1 (`validate-historical.js`) | consistente, sem alteração |

## 3. O que NÃO foi validado — e não deve ser lido como validado

- **Nenhum seletor CSS real do portal de gestão de pedidos do iFood.** Os
  seletores usados nos testes (`.card`, `.id`, `.status`) são placeholders de
  teste, não os seletores reais — que só existem depois da primeira sessão
  supervisionada com o Modo de Mapeamento (Fase 14).
- **Nenhum estado da tela ao vivo foi confirmado.** A tabela de status
  hipotéticos em `IFOOD_SCREEN_SOURCE_MAP_V1.md` §2 continua hipótese.
- **Nenhum ciclo de observação real de 30s rodou contra o portal.** O timing
  (intervalo, backoff, meta de atualização) foi validado por unidade
  (`nextBackoffMs`, `effectiveIntervalMs`), nunca em campo.
- **Nenhuma ação foi executada no portal** — nem teria como ter sido, já que
  nenhuma sessão foi aberta.

## 4. Caminho para a validação real (não implementado nesta missão)

1. Alguém autorizado abre o Chrome, loga na conta do parceiro TATÁ, e ou (a)
   deixa o processo do Chrome acessível por CDP, ou (b) exporta um
   `storageState` que fica **fora do Git**, em `data/conference-brain/browser-profile/`
   (já no `.gitignore` desta branch).
2. `npm install --save-dev playwright && npx playwright install chromium`
   (ou reaproveitar `ms-playwright` já presente na máquina, apontando
   `PLAYWRIGHT_BROWSERS_PATH`).
3. Ligar `CONFERENCE_IFOOD_MAPPING_MODE_V1=1` (nunca liga sozinha — Fase 15) e
   rodar o Modo de Mapeamento contra a tela real para descobrir os seletores
   verdadeiros e preencher a tabela hipotética do mapa de fontes.
4. Só então ligar `CONFERENCE_LIVE_OBSERVER_V1=1` para um ciclo supervisionado,
   curto, com um humano acompanhando — nunca em produção sem essa etapa.

## 5. Veredito (Sprint 2)

```
COLETOR IMPLEMENTADO — VALIDAÇÃO AO VIVO PENDENTE
```

A lógica está construída e testada com o rigor possível sem uma sessão real.
A validação ao vivo não é uma formalidade pendente — é uma dependência real,
de responsabilidade humana (autorização de sessão), que este projeto está
certo em não contornar.

## 6. Sprint 2.1 — o que mudou e o que continua igual

Esta missão **não iniciou** o mapeamento ao vivo (proibido explicitamente) e
**não instalou** Playwright nem baixou navegador. A verificação de ambiente
de `LIVE_VALIDATION_V1` §1 continua válida — nada mudou na disponibilidade de
sessão. `playwright-preflight.js` formaliza essa verificação em código
(`verifyMappingPreconditions`), mas o resultado é o mesmo: sem dependência
instalada, sem perfil configurado, `session_validated` sempre `false`.

O que mudou é a PROFUNDIDADE do que é validável sem sessão: o modelo
multidimensional (`MULTIDIMENSIONAL_ORDER_STATE_V1.md`) foi testado contra
11 cenários combinados (pronto+procurando, pronto+na loja, coluna+botão
disponível, concluído sem saída, despacho próprio, coletado pelo iFood,
agrupado, agendado→produção, operação vazia com loja aberta, loja fechada,
layout alterado) e 8 cenários de reconciliação (alternância de modo, cartão↔
detalhe, logística alterada, agrupamento alterado, ação removida, e os
mesmos 36 IDs duplicados reais do Sprint 1) — todos com fixtures sintéticas
fundamentadas em `IFOOD_FUNCTIONAL_MODEL_V1.md`, nunca em DOM observado.

**Continua não confirmado nesta missão:** se a conta TATÁ usa Expedição,
Quadros, ou os dois; se QR Code de chegada está habilitado; qualquer seletor
real; os textos exatos da tela.

## 7. Veredito (Sprint 2.1)

```
CORREÇÕES DO SPRINT 2 IMPLEMENTADAS — PRONTO PARA RECHECAGEM
```

## 8. Sprint 2.2 — rechecagem bloqueada, 12 bloqueadores corrigidos

A rechecagem independente do Sprint 2.1 (branch de auditoria separada,
commit `f7529fa`, não incorporado a este histórico) reproduziu falhas
materiais e devolveu **RECHECAGEM BLOQUEADA**, progresso mantido em 63%.
Todos os 15 bloqueadores foram reproduzidos antes de qualquer correção
(Fase 0 desta missão) e corrigidos nesta branch (`fix/conference-live-multidimensional-model-v2`):

| # | Bloqueador | Corrigido em |
|---|---|---|
| 1 | Mapping mode podia persistir PII (nome real passava por blocklist) | `live/pii-guard.js` (allowlist) |
| 2 | Painel escutava em `::` (curinga), não só local | `operator-panel-server.js#resolvePanelHost` |
| 3 | Painel não renderizava sinais multidimensionais | `operator-panel-server.js#reconciledDimensionFor`/`renderSignals` |
| 4 | Modelo multidimensional não integrado ao observador real | `observer.js` (fonte de verdade agora) |
| 5 | Saída de agrupamento mantinha estado antigo | `grouping.js` (`PRESENCE`) |
| 6 | Ativação de agendamento mantinha `is_scheduled` antigo | `reconciliation.js#reconcileSchedule` |
| 7 | Desaparecimento de ação mantinha ação antiga | `reconciliation.js#reconcileAvailableActions` |
| 8 | Desaparecimento de indicador mantinha indicador antigo | `reconciliation.js#reconcileIndicators` |
| 9 | Preflight não validava flag nem URL | `playwright-preflight.js` |
| 10 | Preflight incompatível com o driver real | `browser-adapter.js` (fonte única com o preflight) |
| 11 | Idempotência do relógio não reconhecia retry | `clock.js#recordEvent` |
| 12 | Store descartava linha corrompida em silêncio | `storage/store.js#load` |
| 13-14 | Documentação divergia do código/diff | este arquivo + `LIVE_OBSERVER_V1.md` |
| 15 | Datas de fontes oficiais inconsistentes | `IFOOD_FUNCTIONAL_MODEL_V1.md` §1 (reverificado 2026-07-22) |

Cada bloqueador tem reprodução ANTES da correção e teste adversarial
verificando a correção em `tests/conference-brain/sprint22-adversarial.test.js`
(66 testes). Nenhuma sessão real foi aberta, nenhum Gestor acessado, nenhum
seletor real mapeado — as restrições desta missão continuam integralmente
respeitadas.

**Limitação honesta registrada nesta correção:** a segurança contra
concorrência real (dois processos, ou I/O com latência genuína) não foi
implementada nem testada — só a ausência de duplicação dentro do mesmo
processo Node.js com store em memória foi provada.

## 9. Veredito (Sprint 2.2)

```
SPRINT 2.2 CORRIGIDO — PRONTO PARA RECHECAGEM INDEPENDENTE
```

> **Correção (Sprint 2.3):** a rechecagem independente focada do Sprint 2.2
> (worktree `audit/recheck-conference-live-multidimensional-v2`, commit
> `1d6bc44`) provou que este veredito era prematuro em 6 dos 12 pontos
> acima: a suíte oficial (66 testes) passava, mas tinha lacunas de
> asserção — o veredito real era `RECHECAGEM BLOQUEADA`, com 10 de 25
> testes independentes falhando. Ver §10 para a correção cirúrgica desses
> 10 casos e o novo veredito.

## 10. Sprint 2.3 — correção cirúrgica dos bloqueadores da rechecagem do 2.2

A rechecagem independente focada do Sprint 2.2 rodou 25 testes adversariais
próprios (`tests/auditoria/conference-sprint22-recheck.test.js`, cópia
somente-leitura do commit `1d6bc44`) e encontrou 10 falhas materiais,
apesar de todas as suítes oficiais (263 testes) passarem. A causa comum:
os testes oficiais do Sprint 2.2 provavam que CADA MÓDULO ISOLADO se
comportava corretamente, mas não cobriam o caminho de PONTA A PONTA (ex.:
`reconcileMultidimensional` já sabia reconciliar agrupamento, mas
`observer.js` nunca alimentava esse campo) nem alguns vetores de ataque
específicos (subdomínio-prefixo na allowlist de URL, forma de nome como
único critério de PII, ordem de chegada assumida como ordem temporal).

| Bloqueador | Sintoma provado pela rechecagem | Correção | Commit |
|---|---|---|---|
| 1 — PII | `pii-guard.js` liberava frase inteira por conter fragmento de vocabulário (substring, não igualdade); `evidence.js` era blocklist (não cobria nome minúsculo/CJK); `observer.js` persistia texto bruto em `live_observations`/`live_cycle_runs` | allowlist por correspondência de STRING COMPLETA (`pii-guard.js#fullMatch`); excerto por allowlist de TOKEN (`sanitizeFreeText`); sanitização cirúrgica do caminho de persistência (`sanitizeOrderObservation`) | `1d430d9` |
| 2 — integração | `buildOrderObservation()` nunca aceitava/repassava `grouping`/`schedule`/`indicators` — a reconciliação já sabia consumi-los, mas nunca era alimentada | `multidimensional-observation.js`/`observer.js` encaminham os três sinais de ponta a ponta | `02c5d9b` |
| 3 — agrupamento | `reconcileGrouping` dobrava por ORDEM DE CHEGADA do array, não por tempo — leitura antiga entregue por último "ressuscitava" grupo encerrado | ordena por `observed_at` antes de dobrar em versões | `7df6df9` |
| 4 — preflight | `checkAllowedUrl` comparava `href.startsWith(entry)` — subdomínio-prefixo malicioso passava | comparação por hostname canônico (mesmo parser `URL` nos dois lados), igualdade exata | `546016c` |
| 5 — idempotência | `recordEvent` tratava "mesmo tipo que o estado atual" como retry, mesmo com origem/motivo/horário diferentes | identidade do fato (`isSameFact`): origem/motivo/raw_status sempre comparados; `event_time` explícito desempata; `observed_at` sozinho nunca torna dois retries fatos distintos | `3050913` |
| 6 — recuperação | `store.js` vazava conteúdo corrompido via `e.message` (V8 embute trecho da entrada no erro); `observer.js` só emitia evento do relógio quando o texto "mudava" no ciclo — uma queda entre persistir observação e evento deixava o fato sem `ready_observed` para sempre | `e.name` (literal fixo) em vez de `e.message`; emissão de evento reavaliada TODO ciclo contra o histórico persistido, não só quando algo mudou | `573810c` |
| 7 — documentação | Datas de "Atualizado" de 2 das 4 fontes oficiais divergiam entre a rechecagem e o documento | reverificação independente em 2026-07-24 (3ª consulta): reproduziu os números do documento original nas 4 fontes; divergência da rechecagem não reproduzida, registrada com honestidade | este commit |

Todos os 25 testes da suíte de auditoria passam agora (verificado duas
vezes, sem alterar o arquivo — ver relatório final da missão). Testes
oficiais equivalentes em `tests/conference-brain/sprint23-adversarial.test.js`.

## 11. Veredito (Sprint 2.3)

```
SPRINT 2.3 CORRIGIDO — PRONTO PARA RECHECAGEM FOCADA
```

> **Correção (Sprint 2.4):** o gate independente relâmpago do Sprint 2.3
> (worktree `audit/recheck-conference-live-multidimensional-v2`, commit
> `c42fbda`) provou que 2 dos 11 casos de um teste MAIS AGRESSIVO ainda
> falhavam — ambos sobreviventes disfarçados dos próprios bloqueadores 3 e
> 6 do Sprint 2.3, expostos só sob condição de EMPATE exato de `observed_at`
> e sob prontidão que só existe na dimensão `readiness` (nunca em
> `order_state`). Ver §12.

## 12. Sprint 2.4 — correção final dos dois bloqueadores do gate relâmpago

O gate relâmpago rodou 11 testes adversariais próprios
(`tests/auditoria/conference-sprint23-lightning.test.js`, cópia
somente-leitura do commit `c42fbda`) e encontrou 2 falhas, apesar de todas
as suítes oficiais (297 testes) passarem.

| Bloqueador | Sintoma provado pelo gate relâmpago | Correção | Commit |
|---|---|---|---|
| 1 — empate temporal no agrupamento | `reconcileGrouping` ordenava por `observed_at`, mas duas leituras com o MESMO `observed_at` e fatos contraditórios (PRESENT vs. REMOVED) eram desempatadas pelo `sort` estável — que preserva a ordem de ENTRADA entre iguais. "Ordenar por tempo" degenerava em "ordenar por posição no array" exatamente no empate | candidatos agrupados por `observed_at` (`Map`, sem dependência de ordem de inserção) e resolvidos por `resolveTie()`: metadado causal (`sequence`/`version`, novo, opcional) desempata quando disponível; sem ele, resultado explícito `PRESENCE.CONFLICT` — nunca escolha arbitrária | `4d67006` |
| 2 — `ready_observed` perdido quando a prontidão é só multidimensional | A recuperação decidia emitir o evento via `isReadyMilestone(status)` — `status` é a projeção LEGADA (`deriveLegacyLiveStatus`), que só reconhece prontidão através de `order_state`. Um pedido pronto só pela dimensão `readiness` (texto de confirmação, sem `order_state` reconhecido) nunca fazia a projeção legada virar `ready`, mesmo com `Clock.isReadyFromMultidimensional()` já confirmando prontidão no contrato multidimensional (fonte de verdade) | condição de emissão trocada para `clock.isReadyFromMultidimensional(reconciled)` — estritamente mais abrangente que a projeção legada (nenhum caso anterior perde cobertura) | `2abbbff` |

Todos os 11 testes do gate relâmpago passam agora (verificado duas vezes,
sem alterar o arquivo). Testes oficiais equivalentes em
`tests/conference-brain/sprint24-adversarial.test.js`.

## 13. Veredito (Sprint 2.4)

```
SPRINT 2.4 CORRIGIDO — PRONTO PARA GATE FINAL
```
