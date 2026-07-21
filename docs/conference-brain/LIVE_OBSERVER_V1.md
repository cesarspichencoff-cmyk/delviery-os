# Observador ao vivo — Sprint 2

> Estado: implementado, testado com dublê de navegador (sem sessão real
> disponível neste ambiente — ver [LIVE_VALIDATION_V1](LIVE_VALIDATION_V1.md)).
> Branch: `feature/conference-live-observer-v1` · base `feature/conference-brain-foundation-v1@32ca889`.

## 1. Arquitetura

```
browser-adapter.js  (Playwright real, lazy-require — ou driver falso em teste)
        │  extractCycleObservation(driver, selectors)
        ▼
observer.js  createLiveObserver({store, fetchOrders})
        │  runCycle(): observa → normaliza status → reconcilia → diff → eventos → persiste → saúde
        ├─► status-map.js        (texto bruto → status canônico + evento com confiança correta)
        ├─► ready-departure.js   (PRONTO/SAÍDA — nunca infere saída de "completed")
        ├─► reconciliation.js    (pedido canônico por campo, histórico completo preservado)
        ├─► clock.js             (relógio da Conferência — grafo de transições)
        └─► health.js            (saúde da fonte, critérios explicáveis)
```

Todos os módulos em `src/conference-brain/live/` são **puros** (recebem dados,
devolvem dados) exceto `browser-adapter.js` (I/O de navegador) e `observer.js`
(orquestra I/O + módulos puros). Essa separação é o que permite testar 79 dos
79 cenários sem precisar de Chromium nem de sessão real.

## 2. Por que um driver falso em teste é uma validação legítima

`browser-adapter.js` usa 4 métodos de página: `hasElement`, `queryAll`,
`elementText`, `textContent`. Um driver de teste implementa exatamente essa
mesma interface com dados sintéticos. A lógica testada — extração de cards,
detecção de login/captcha, contagem de vazios, montagem do sinal de saúde — é
**idêntica** ao caminho de produção; só a fonte dos dados muda. O que não é
testável sem sessão real é se os SELETORES escolhidos existem na tela
verdadeira — e por isso nenhum seletor é hardcoded (ver `IFOOD_SCREEN_SOURCE_MAP_V1.md` §3).

## 3. Ciclo de observação (Fase 13)

1. `fetchOrders()` — observa a tela (ou falha honestamente);
2. `classifyCycleHealth()` decide a saúde antes de qualquer outra coisa;
3. saúde `login_required`/`captcha_present` → ciclo **suspende**, não lê pedidos;
4. para cada pedido observado: normaliza status, compara com a última
   observação conhecida (reconstruída do `store`, nunca de uma cópia em
   memória insubstituível), grava a observação bruta;
5. só em caso de MUDANÇA: emite `ready_observed` (se acabou de ficar pronto) e
   `departed_observed` (só quando comprovado — nunca a partir de `completed`);
6. pedidos que desaparecem da tela são marcados `missing_from_view` — nunca
   presumidos como tendo saído;
7. grava `live_cycle_runs` com a saúde e os erros do ciclo.

Nunca lança: uma exceção em `fetchOrders()` vira `source_health: unavailable`
registrado, não uma queda do processo.

## 4. Timing (Fase 3)

| Parâmetro | Valor | Regra |
|---|---|---|
| `intervalMs` | 30000 (meta) | configurável |
| `minIntervalMs` | 10000 | piso — nunca mais agressivo, mesmo se configurado |
| `staleAfterMs` | 300000 (5 min) | acima disso, saúde vira `stale` |
| backoff | exponencial, base 5s, teto 120s | após falhas consecutivas |

## 5. Configuração (nunca hardcoded)

```js
{
  profileDir,      // fora do repositório — sessão autorizada do lojista
  allowedUrl,      // única URL que o coletor navega
  intervalMs, timeoutMs, staleAfterMs,
  evidenceDir,     // fora do Git (ver PRIVACY_AND_SESSION_SAFETY_V1.md)
  retentionDays
}
```

## 6. O que este observador nunca faz

Herdado diretamente das restrições da missão e verificado por teste
(`tests/conference-brain/live-observer.test.js`, describe "navegador e layout"):
não faz login sozinho, não digita senha, não contorna 2FA nem CAPTCHA, não
clica em ações que mudam estado no portal, não reexecuta endpoint privado fora
do navegador, não continua coletando quando pede intervenção humana.
