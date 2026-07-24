# Reconciliação incremental por campo — Sprint 2

`src/conference-brain/live/reconciliation.js`

## 1. A limitação do Sprint 1 que esta fase corrige

`normalize/dedupe.js` (Sprint 1) resolve duplicidade escolhendo uma observação
**inteira** como vencedora — suficiente para reconciliar dois LOTES
históricos, insuficiente para um observador que lê a mesma tela a cada poucos
segundos e precisa acumular verdade aos poucos. A correção: nada é substituído
em memória, tudo é agregado; o "pedido canônico" é uma **projeção** recalculável
sobre o histórico completo — nunca um estado mutável que perde a leitura
anterior.

## 2. Regras por tipo de campo

**Identidade** — `detectIdentityConflicts()` agrupa por ID curto e sinaliza
quando o mesmo ID curto aparece associado a mais de um ID completo (uuid).
Nunca resolvido por adivinhação de qual é o "certo" — vira anomalia
`conflito_de_identidade`.

**Datas e horários** — `reconcileField()` escolhe pela **maior confiança**
(nunca pela mais recente às cegas); empate desempata pela observação mais
antiga. Toda observação candidata fica em `history`; `conflict:true` quando os
valores discordam. Um horário com confiança `alta` (vindo direto da tela)
nunca é substituído por um `media`/`baixa` só porque chegou depois.

**Status** — `reconcileStatus()` preserva o histórico completo; o "atual" é o
mais recente. Regressões (status recuou na ordem natural de progressão) viram
anomalia `regressao_de_status_inesperada` — mas o status mais recente ainda é
aplicado como atual, porque a tela ao vivo é a fonte mais fresca; o que nunca
acontece é a regressão passar despercebida.

**Itens** — `reconcileItems()` deduplica leituras consecutivas idênticas
(mesmo fingerprint de nome+quantidade+observação), preserva TODAS as versões
quando o conteúdo muda, e nunca perde um item exclusivo de uma leitura: se a
leitura mais recente tem menos itens que a anterior, os itens que sumiram são
reincorporados ao "atual" (a leitura mais nova pode ter truncado por um modal
ainda carregando) e a divergência fica registrada — não presumida como remoção
silenciosa.

**Observações do cliente** — `reconcileObservationText()` versiona; nunca
concatena duas leituras diferentes numa string só, nunca apaga uma versão nova
por cima da antiga.

**Valores** — usa a mesma `reconcileField()` das datas: origem, horário e
conflito preservados; nunca "a média" nem "o maior".

## 3. Prova com dado real: os 36 IDs duplicados do Sprint 1

Não é fixture. `tests/conference-brain/live-observer.test.js` reexecuta a
reconciliação sobre os **mesmos dois relatórios HTML** usados na validação
histórica do Sprint 1, isola os 36 `order_id` que aparecem nos dois lotes, e
roda cada um por `reconcileOrder()`.

```
IDs duplicados encontrados: 36  (bate com o achado do Sprint 1)
erros:                       0
itens perdidos:              0
pedidos com divergencia:    36  (100%)
```

As 36 divergências são **todas** do mesmo tipo: `conflito_de_valor` no campo
`received_at`. Isso não é um problema da reconciliação — é ela expondo, com
precisão de campo, um problema já documentado da fonte: os dois relatórios
atribuem **dias diferentes** ao mesmo pedido na borda da janela coberta.
Exemplo real, `a0eb2c4d-4f77-497b-a731-545bd89e1747`:

```
relatorio_pedidos_com_itens_jun20-30.html  ->  30/06/2026 21:02
relatorio_pedidos_01-07.html               ->  01/07/2026 21:02
```

Mesma hora, dia diferente — confirma com um caso concreto o risco já
registrado em `docs/Checklist_Fonte_Continua_iFood.md:41` ("janela exata
coberta pelo relatório" como campo Obrigatório em qualquer fonte contínua
futura). A deduplicação do Sprint 1 já havia marcado esses 36 casos como
`duplicidade_com_divergencia`, mas sem apontar QUAL campo divergia — a
reconciliação por campo é estritamente mais precisa, sem contradizer o
achado anterior.

## 4. O que a reconciliação nunca faz

Sem peso, sem score, sem "a maioria vence" para dado numérico (datas/valores
usam confiança declarada, não votação), sem inferir dado ausente, sem
descartar uma observação em silêncio. Toda decisão de qual valor prevalece é
rastreável em `field_provenance` — auditável campo a campo, exatamente como o
Sprint 1 exige para qualquer regra deste projeto.

## 5. Sprint 2.1 — reconciliação MULTIDIMENSIONAL

`reconcileMultidimensional(externalId, observations)` reconcilia as 9
dimensões de `MULTIDIMENSIONAL_ORDER_STATE_V1.md` de forma **independente** —
nenhuma vence as outras. `reconcileOrder` (§1-4 acima) continua existindo,
intocado, para quem consome o modelo antigo.

**Regra central — valor vazio nunca apaga valor real:**
`EMPTY_DIMENSION_VALUES` define, por dimensão, o que conta como "esta leitura
não mostrou essa informação" (`unknown`, `not_applicable`). Uma leitura vazia
entra no histórico bruto (auditável), mas NUNCA concorre como candidata a
"valor atual" — por isso um cartão compacto (Expedição) lido depois de um
detalhe completo não apaga o `courier_state` que o detalhe mostrou. Provado
em teste: `"detalhes -> cartao compacto: informacao antiga mais completa nao
e apagada"`.

**Regressão só é avaliada para `order_state`** (progressão de produção
conhecida) — as demais dimensões (courier, dispatch, completion, fulfillment)
não têm ordem estrita o bastante para acusar regressão sem risco de falso
positivo; mudam de valor livremente, todas registradas no histórico.

**Ações disponíveis (`available_actions[]`) são versionadas como itens** —
nunca convertidas em evento do relógio por esta reconciliação; isso continua
sendo papel exclusivo de `clock.js`/`observer.js`.

**Agrupamento e agendamento** delegam para `live/grouping.js` e
`live/schedule.js` respectivamente — alteração de membros do grupo gera nova
versão, nunca sobrescreve a anterior.

Prova com dado real, de novo: os mesmos 36 IDs duplicados do Sprint 1,
envolvidos agora em observações multidimensionais sintéticas (o relatório
histórico não carrega sinal multidimensional real), passam por
`reconcileMultidimensional` sem exceção nenhuma.

## 6. Correção (Sprint 2.2) — remoção era invisível quando a leitura vinha vazia

A rechecagem independente do Sprint 2.1 provou que a afirmação da §5 acima
("gera nova versão, nunca sobrescreve") era **verdadeira só para leituras não
vazias**. Uma saída de agrupamento, uma ação que sumiu ou um indicador que
terminou — todos representados por uma leitura com lista **vazia** — eram
descartados pelos mesmos filtros que ignoram "leitura que não checou essa
dimensão". O valor antigo ficava "atual" para sempre.

Corrigido: `grouping.js`/`reconciliation.js` agora distinguem
`unobserved` (não afeta nada) de `present`/`removed` (leitura EXPLÍCITA,
sinalizada por `observed:true`/`actions_observed:true`/`indicatorsObserved:true`)
— só a segunda pode encerrar um valor anterior. Ver
`LIVE_VALIDATION_V1.md` §8 (bloqueadores 5, 6, 7, 8) para a reprodução e a
correção completas.

## 7. Correção (Sprint 2.3) — agrupamento por ordem de CHEGADA, não por ordem TEMPORAL

A rechecagem independente do Sprint 2.2 provou que a distinção `unobserved`/
`present`/`removed` da §6 acima, sozinha, não bastava: `grouping.js#reconcileGrouping`
dobrava as leituras na ordem em que apareciam no ARRAY de entrada — "a versão
atual" era "a última do array", não "a última no tempo". Uma leitura antiga
entregue por último (rede fora de ordem, retry, replay) ressuscitava um grupo
já encerrado por uma leitura mais nova.

Corrigido: `reconcileGrouping()` ordena por `observed_at` **antes** de dobrar
em versões. Isso também garante, sem código adicional, a exigência de replay
determinístico — qualquer ordem de chegada da MESMA sequência de leituras
converge para o mesmo resultado final. Ver `LIVE_VALIDATION_V1.md` §10
(bloqueador 3) para a reprodução e a correção completas. `reconcileSchedule`
e `reconcileIndicators` já ordenavam por `observed_at`/`indicatorsObserved`
desde o Sprint 2.2 — só `reconcileGrouping` tinha a lacuna.
