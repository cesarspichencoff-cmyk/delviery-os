# Sprint 2.3 — Reprodução das 10 falhas da rechecagem (Fase 0)

> Executado ANTES de qualquer alteração de código, a partir de `a010865`
> (branch `fix/conference-live-multidimensional-model-v3`). Suíte de origem:
> `docs/conference-brain/deliveryos-recheck-multidimensional-v2` (commit
> `1d6bc44`, worktree `audit/recheck-conference-live-multidimensional-v2`),
> copiada **sem alteração** para `tests/auditoria/conference-sprint22-recheck.test.js`
> nesta branch.

```
node --test tests/auditoria/conference-sprint22-recheck.test.js
ℹ tests 25
ℹ pass 15
ℹ fail 10
```

Confere exatamente com o relatório da rechecagem (`25 executados; 15 passaram; 10 falharam`).

## Tabela das 10 falhas

| # | Teste | Entrada | Esperado | Obtido | Arquivo/função | Causa-raiz provável |
|---|---|---|---|---|---|---|
| 1 | `PII-B` | `PiiGuard.sanitizeText("Avisar pedido pronto para Joao Silva", "action_label")` | marcador redigido (não deve liberar a frase inteira) | string literal devolvida (bypass) | `pii-guard.js#isKnownSafeText` usando `NOTIFY_LABEL_RE`/`CONFIRMED_NOTIFICATION_RE` (não ancoradas) via `.test()` (substring) | `KNOWN_PATTERNS.some((re) => re.test(s))` aceita QUALQUER string que **contenha** o padrão como substring — não que seja **igual** a ele. Duas regexes do vocabulário de detecção (`multidimensional-observation.js:119-120`), feitas para detectar uma frase DENTRO de texto maior, foram reaproveitadas para decidir se um valor INTEIRO é seguro — usos incompatíveis. |
| 2 | `PII-C` | `Evidence.buildEvidenceRecord({diagnosticExcerpt:"falha para joao silva"})` / `"falha para 李明"` | nomes minúsculos/CJK não aparecem; registro tem `text_hash`/`excerpt_hash`/`redacted` | nomes aparecem literalmente; sem estrutura de hash | `evidence.js#sanitizeExcerpt` | Blocklist por regex de "duas+ palavras capitalizadas" (`/\b[A-ZÀ-Ý][a-zà-ÿ]+.../`) não cobre minúsculas nem CJK (a regex é ancorada em maiúscula latina). Blocklist nunca cobre forma não prevista — exatamente o erro que o `pii-guard.js` já corrigiu para texto curto, mas nunca migrado para excertos de evidência. |
| 3 | `PII-D` | ciclo do observador com `raw_status`/`customerNote` contendo nomes/telefone/e-mail/CJK | nada bruto persistido em `live_observations` | tudo persistido bruto | `observer.js` (persistência de `liveObs.raw_status` e `dimensionObs.*.raw_text`/`customer_note`) | `buildOrderObservation()` grava `raw_text`/`confirmation_text`/`customer_note` como texto bruto, sem passar pelo `pii-guard`; `observer.js` grava `liveObs.raw_status = raw.raw_status` direto. A sanitização do Sprint 2.2 só cobria a CAPTURA (`mapping-mode.js`), nunca o caminho completo até a persistência do observador real. |
| 4 | `PII-E` | `fetchOrders` lança `Error("falha Joao Silva 11999999999 李明")` | mensagem nunca persistida bruta em `live_cycle_runs` | mensagem bruta persistida | `observer.js:93` (`errors: [String((e && e.message) || e)]`) | Mensagem de exceção gravada sem qualquer sanitização — mesmo problema estrutural do item 3, em outra rota (erro do coletor, não da observação). |
| 5 | `INTEGRACAO-B` | ciclo real com `raw.grouping`/`raw.schedule`/`raw.indicatorsObserved`/`raw.indicators` | reconciliação e painel real refletem os três sinais | `dim.grouping` é `null`; painel não mostra os sinais | `multidimensional-observation.js#buildOrderObservation` + `observer.js` (chamada) | `buildOrderObservation()` nunca aceita nem repassa `grouping`/`schedule`/`indicatorsObserved`/`indicators` para o objeto de saída, e `observer.js` nunca os encaminha de `raw` para a chamada — mesmo `reconciliation.js#reconcileMultidimensional` já estando pronto para consumi-los (`Grouping.reconcileGrouping`, `reconcileSchedule`, `reconcileIndicators` já são chamados lá). A reconciliação está pronta; a captura→observação nunca alimenta esses três campos. |
| 6 | `AGRUPAMENTO-B` | 3 leituras de agrupamento fora de ordem cronológica (a mais antiga chega por último no array) | a versão temporalmente mais nova (remoção) vence | a última do ARRAY vence (grupo antigo "ressuscita") | `grouping.js#reconcileGrouping` | A função nunca ordena as leituras por `observed_at` antes de dobrá-las em versões — `current = versions[versions.length-1]` é "a última do array de entrada", não "a última no tempo". Ordem de chegada ≠ ordem temporal. |
| 7 | `PREFLIGHT-B` | `checkAllowedUrl("https://parceiro.ifood.com.br.evil.example/gestor", ["https://parceiro.ifood.com.br"])` | recusado (`host_fora_da_allowlist`) | aceito | `playwright-preflight.js:73` (`parsed.href.startsWith(entry)`) | Comparação por **prefixo de string** do `href` inteiro contra a entrada da allowlist — `"https://parceiro.ifood.com.br.evil.example/gestor"` literalmente começa com `"https://parceiro.ifood.com.br"`. Bypass clássico de allowlist por domínio-prefixo (subdomínio malicioso que começa igual ao host legítimo). |
| 8 | `IDEMPOTENCIA-B` | dois eventos `ready_observed` com `event_time`/`origin`/`reason` diferentes (correção de horário) | tratado como fato NOVO (`idempotent:false`, `event_id` diferente) | colapsado como retry idêntico | `clock.js#recordEvent` (`if (fromType === o.event_type) return {...idempotent:true}`) | Identidade do evento reduzida a **apenas o tipo** igual ao estado atual — qualquer evento subsequente do mesmo tipo é tratado como "a mesma operação repetida", mesmo com conteúdo (horário, origem, motivo) completamente diferente. Idempotência virou deduplicação de fatos distintos. |
| 9 | `REPLAY-A` | linha JSONL corrompida contendo `"CORRUPTED-JOAO-SILVA"` | `health()` nunca expõe o conteúdo corrompido | conteúdo aparece dentro de `corrupted_lines[].error` | `storage/store.js#load` (`error: String((e && e.message) || e)`) | O Node/V8 atual embute um TRECHO da entrada inválida na própria mensagem de erro do `JSON.parse` (`SyntaxError` moderno cita o texto). Guardar `e.message` bruto reintroduz exatamente o vazamento que `corrupted_lines` foi desenhado para evitar (a estrutura hash/tamanho já existia, mas o campo `error` ao lado dela vazava o mesmo conteúdo por outra porta). |
| 10 | `REPLAY-B` | `live_observations` já persistida com `status:"ready"` mas SEM `conference_clock_events` (crash simulado entre os dois); próximo ciclo repete o mesmo `raw_status` | `ready_observed` é criado na retomada | nenhum evento é criado | `observer.js` (bloco de emissão de `READY_OBSERVED` dentro de `if (statusEvent.changed)`) | A emissão do evento está condicionada a "o texto mudou ESTE ciclo" (`statusEvent.changed`), não a "existe um evento pendente para um fato já conhecido". Como o `raw_status` da retomada é idêntico ao já persistido, `changed=false` para sempre — o fato "pronto" fica permanentemente sem `ready_observed`, mesmo com `clock.currentClockState(prevClock) == null` (nenhum evento existe). A checagem de idempotência (`currentClockState==null`) está correta; o que falta é reavaliar essa checagem TODO ciclo, independente de `changed`. |

## Relação com os bloqueadores materiais da rechecagem

| Falha | Bloqueador da missão |
|---|---|
| PII-B, PII-C, PII-D, PII-E | 1 — PII (caminho completo) |
| INTEGRACAO-B | 2 — integração multidimensional incompleta |
| AGRUPAMENTO-B | 3 — agrupamento fora de ordem |
| PREFLIGHT-B | 4 — bypass de URL no preflight |
| IDEMPOTENCIA-B | 5 — idempotência excessiva |
| REPLAY-A, REPLAY-B | 6 — perda de evento após crash / vazamento na recuperação |

Os 15 testes que já passavam (bind local, driver com fixture, ações/indicadores
com `observed`/`actions_observed`/`indicatorsObserved`, agendamento,
concorrência entre processos — classificada como limitação documentada, não
bloqueador) não foram tocados nesta fase e continuam servindo de placar de
não-regressão.
