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
