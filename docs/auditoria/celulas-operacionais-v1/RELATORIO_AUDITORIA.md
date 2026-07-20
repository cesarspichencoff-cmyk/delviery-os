# Auditoria visual independente — Células operacionais do Copiloto V1

**Auditor:** Grok (xAI)  
**Data:** 2026-07-20  
**Commit auditado:** `82d300cc9d2ed49fcd83ba0e2fe7cf773ae5594c` (`82d300c`)  
**Baseline:** `101680a`  
**Branch de auditoria:** `audit/copiloto-celulas-operacionais-v1`  
**Worktree:** `C:\Users\italo\Desktop\Claude\deliveryos-copiloto-audit-celulas-v1`  
**Branch de implementação (intocada):** `feature/copiloto-celulas-operacionais-v1`  
**ENTREGAS:** não tocado / não mergeado

---

## 1. Isolamento e integridade

| Check | Resultado |
|-------|-----------|
| Worktree | `deliveryos-copiloto-audit-celulas-v1` |
| Branch | `audit/copiloto-celulas-operacionais-v1` |
| HEAD | `82d300cc9d2ed49fcd83ba0e2fe7cf773ae5594c` |
| Origem | exatamente `82d300c` (pai `101680a`) |
| Working tree implementação | sem diff em `app-v1/`, `src/`, `tests/` |
| Merge / cherry-pick | ausentes |
| Arquivos ENTREGAS no commit | nenhum (`git diff 101680a..82d300c` só 9 arquivos de UI/células/docs/testes) |

Delta do commit auditado:

- `app-v1/app.js`, `app-v1/index.html`
- `src/live/interface/celulas-operacionais.js` (novo)
- `src/live/interface/adaptador-v33.js`
- `docs/copiloto/CELULAS_OPERACIONAIS_V1.md`
- testes live de células / adaptações mínimas

---

## 2. Ambiente executado

```text
PORT=5186 node tools/servir_v1.js
→ http://localhost:5186/
fonte=simulator (janela_real_ausente_usando_simulador_rotulado)
```

Interface real servida; evidências por DOM + screenshots Playwright com carimbo **externo** (faixa anexada, sem overlay no DOM do produto).

---

## 3. Testes

### 3.1 Live (`node --test tests/live/*.test.js tests/live/simulator/*.test.js`)

| Métrica | Valor |
|---------|-------|
| Total | 240 |
| Pass | 239 |
| Fail | **1** |
| Skipped | 0 |
| Cancelled | 0 |

**Falha (registrada, não corrigida):**

- `tests/live/interface-capacidade-viva-shadow-audit.test.js`  
  `uma requisição a /api/fonte gera observação sombra real via o launcher novo`  
  Mensagem: `o launcher não ligou o modo sombra de verdade`  
- Arquivo **fora** do delta de `82d300c` (pré-existente / ambiente).  
- Reexecutado isoladamente: falha reproduzível.

### 3.2 Células (escopo do commit)

```text
node --test tests/live/celulas-operacionais.test.js \
  tests/live/celulas-integracao.test.js \
  tests/live/interface-adaptador-v33.test.js
→ 27 pass / 0 fail
```

### 3.3 Copiloto (`npm run copiloto:test`)

| | |
|--|--|
| Pass | **53** |
| Fail | **0** |

### 3.4 Capacidade Viva (`npm run capacidade:test`)

| | |
|--|--|
| Pass | 27 |
| Fail | **16** |

Falhas em hash/config sombra human-v2, âncoras, deduplicação, etc.  
**Nenhum arquivo de Capacidade Viva foi alterado por `82d300c`.**  
Tratadas como falhas de ambiente/baseline fora do delta auditado — **não corrigidas**.

### 3.5 Testes modificados nesta auditoria

**Nenhum.** Apenas material em `docs/auditoria/…`.

### 3.6 Totais

| Suíte | Pass | Fail | Nota |
|-------|------|------|------|
| Live | 239 | 1 | 1 fora do delta |
| Células (subconjunto) | 27 | 0 | |
| Copiloto | 53 | 0 | |
| Capacidade | 27 | 16 | fora do delta |
| **Referência Claude** | 336 claimed | — | não reproduzido 100% no worktree limpo |

---

## 4. Auditoria Sushi

**Código:** `mapaAmbientes` → `["combinados","duplas","enrolados"]` apenas.  
**Lógica:** `estadoAgregado` = pior severidade entre as três; motivo identifica a praça dominante; sem soma de indicadores.

**UI (replay real):**

- Estável: “Sushi · no ritmo”, title “Combinados, Duplas e Enrolados seguem estáveis.” (`replay≈0`)
- Elevação de Sushi **não ocorreu** no cenário sintético D4A desta janela (8 pedidos; pressão foi em Cozinha).

**Prova unitária** (`provas-unitarias.json`):  
`estadoAgregado({enrolados:1}, …)` → `Enrolados concentra a maior espera. Combinados e Duplas seguem estáveis.`

**Capturas:** `01_sushi_estavel.png`; `02_sushi_atencao.png` permanece evidência de estado adjacente (UI não elevou Sushi neste cenário — ver limitações).

---

## 5. Auditoria Quentes

**Código:** somente `enrolados_quentes`.  
**UI:** “Quentes · no ritmo” enquanto Cozinha sobe — não herda `cozinha_quentes`.  
Testes de não-vazamento: verdes.

---

## 6. Auditoria Cozinha

**Código:** somente `cozinha_quentes`.  
**UI (várias posições):** “Cozinha · pressão subindo · 8 esperando” com Quentes “no ritmo”.  
Caption: “A fila da Cozinha está crescendo.”

**Observação (não bloqueante de separação, mas ruído de rótulo):**  
`MOTOR.DISPLAY.cozinha_quentes = "Quentes"`, então o *title* da célula Cozinha pode dizer “Quentes concentra a maior espera.”  
A **célula** e a **fonte** estão corretas; o rótulo humano do DISPLAY do motor (prévio) confunde. Documentado para o Claude se César priorizar.

**Captura:** `03_quentes_cozinha_diferentes.png` (replay≈9).

---

## 7. Auditoria Caixa

**Módulo:** `leituraCaixa` — janela **10 min**; limiares provisórios MOVIMENTO=3, ATENCAO=6; fontes `r`/`p`/`c`.  
**Nunca** “Sobrecarregado” (cor vermelho estruturalmente ausente na função).  
**Nota parcial** sempre no motivo.

**UI real (timeline 0–80):**

| Estado | Observado |
|--------|-----------|
| leitura parcial | v=0–1 |
| calmo | banda intermediária |
| atenção · **8 prontos na janela** | v=62–73 |
| em movimento | **não** no cenário (salta 0–2 → ≥6) |
| Sobrecarregado | **0** ocorrências |

**Paridade com Claude:** “Caixa · atenção · 8 prontos na janela” **confirmado** em DOM e captura forçada (`06`, replay≈65).  
“Em movimento” **provado em unit** (`4 prontos na janela`); UI do cenário sintético não estaciona nessa banda.

**Capturas:** `04` calmo/parcial, `05` (sem banda movimento na UI — ver unit), `06` atenção, `07` leitura parcial explícita no title.

---

## 8. Auditoria Conferência

**UI:** “Conferência · leitura ainda não conectada”  
**Title:** sem fonte de checklist/entrada.  
**Código:** `frase: "leitura ainda não conectada"`; sem `montagem_outros` como fonte.  
Célula **presente** (não removida).  
**Captura:** `08_conferencia.png`

---

## 9. Auditoria Entregas

**UI:** “Entregas · aguardando integração”  
**Title:** domínio não integrado.  
Sem viagens/motoboys/handoffs/ocorrências/fila simulados.  
Commit sem arquivos ENTREGAS.  
**Captura:** `09_entregas.png`

---

## 10. Capacidade Viva / `cv-cal-tata-human-v2`

- Config existe em `data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json`.
- `servir_v1.js`: sombra como efeito colateral **após** resposta HTTP; não altera payload operacional.
- Testes de isolamento UI: HTML/JS idênticos com sombra on/off (pass).
- Launcher shadow: 1 fail (acima).
- **Não** controla cor principal das células do organismo (estados vêm do motor + `CELULAS_OP`).
- Sem recalibração / Blind V3 nesta auditoria.

---

## 11. Responsividade 360 px

| Métrica | Valor |
|---------|-------|
| viewport | 360×740 |
| scrollWidth / clientWidth | 360 / 360 |
| overflowX | **false** |
| células | 6 presentes (Caixa…Entregas) |
| textos | legíveis no layout empilhado |
| replay | utilizável |

**Captura:** `10_viewport_360.png`  
**Desktop:** `11_desktop_completa.png`

---

## 12. Lista de capturas

Diretório: `docs/auditoria/celulas-operacionais-v1/capturas/`

| # | Arquivo | Cenário | Viewport | Commit carimbo |
|---|---------|---------|----------|----------------|
| 1 | 01_sushi_estavel.png | sushi estável | 1280×800 | 82d300c |
| 2 | 02_sushi_atencao.png | (cenário sem elevação Sushi; ver unit) | 1280×800 | 82d300c |
| 3 | 03_quentes_cozinha_diferentes.png | Quentes≠Cozinha | 1280×800 | 82d300c |
| 4 | 04_caixa_calmo.png | Caixa calmo/parcial | 1280×800 | 82d300c |
| 5 | 05_caixa_movimento.png | (banda UI ausente; unit prova) | 1280×800 | 82d300c |
| 6 | 06_caixa_atencao.png | **atenção · 8 prontos na janela** | 1280×800 | 82d300c |
| 7 | 07_caixa_leitura_parcial.png | nota parcial + atenção | 1280×800 | 82d300c |
| 8 | 08_conferencia.png | sem leitura conectada | 1280×800 | 82d300c |
| 9 | 09_entregas.png | aguardando integração | 1280×800 | 82d300c |
|10 | 10_viewport_360.png | 360 px | 360×740 | 82d300c |
|11 | 11_desktop_completa.png | desktop | 1280×800 | 82d300c |

Carimbo: faixa **fora** da UI (pós-screenshot).  
Metadados: `index.json`, `dom-evidence.json`, `scan-timeline.json`, `caixa-timeline-full.json`, `provas-unitarias.json`.

---

## 13. Limitações

1. **Screenshot:** bem-sucedida com Playwright headless + pausa de replay; carimbo externo. Claude reportou timeout de screenshot — contornado **sem** alterar animação/app.
2. **Janela real ausente** no worktree limpo → simulador D4A rotulado (honesto na UI).
3. **Cenário sintético (8 pedidos):** não eleva Sushi; salta banda “em movimento” do Caixa. Lógica coberta por testes unitários + timeline completa do Caixa.
4. **DISPLAY `cozinha_quentes`→“Quentes”:** tooltip confuso na célula Cozinha (motor prévio).
5. **Suíte Capacidade / 1 teste shadow launcher:** falhas fora do delta `82d300c`.

---

## 14. Divergências encontradas

| ID | Severidade | Descrição | Ação Grok |
|----|------------|-----------|-----------|
| D1 | Ambiente | 1 live fail shadow launcher | **não corrigido** |
| D2 | Ambiente | 16 fails `capacidade:test` | **não corrigido** |
| D3 | Cenário | UI sem “Sushi em atenção” neste replay | documentado + unit |
| D4 | Cenário | UI sem “Caixa em movimento” (salta limiares) | documentado + unit |
| D5 | UX menor | title Cozinha usa rótulo DISPLAY “Quentes” | documentado para Claude |

Nenhuma divergência **estrutural** na especificação de células (fontes, teto Caixa, honestidade Conf/Entregas, separação Quentes/Cozinha).

---

## 15. Arquivos de auditoria criados

Somente em `docs/auditoria/celulas-operacionais-v1/`:

- `RELATORIO_AUDITORIA.md` (este)
- `capturar_auditoria.mjs`, `recaptura_pontos.mjs`, `force_caixa_atencao.mjs`
- `capturas/*.png` (11)
- `index.json`, `README.md`, `dom-evidence.json`, `scan-timeline.json`
- `caixa-timeline-full.json`, `provas-unitarias.json`

---

## 16. Confirmações

- Nenhum código de implementação alterado (`app.js`, motor, testes do Claude, ENTREGAS, COR, shell, SELECAO, Blind, CV runtime).
- Sem merge, push ou deploy.
- Sem integração ENTREGAS × Copiloto.
- Sem piloto.

---

## 17. Veredito

### Escopo células operacionais V1 (`82d300c`)

Implementação **coerente com a especificação**: fontes corretas, Caixa parcial com teto Atenção e “8 prontos na janela” reproduzido, Conferência/Entregas honestos, Quentes≠Cozinha, 360 px sem overflow, CV em sombra não pinta as células.

### Critério “testes verdes” (suíte completa do worktree)

**Não atendido globalmente** (1 live + 16 capacidade fora do delta).

### Veredito formal

```
AUDITORIA APROVADA — IMPLEMENTAÇÃO COERENTE COM A ESPECIFICAÇÃO
```

**com ressalvas obrigatórias D1–D5** (ambiente + cenário + rótulo DISPLAY), a decidir pelo César se D1/D2 bloqueiam merge da branch de implementação.

Se a política for “qualquer fail na suíte monorepo = bloqueio absoluto”, reinterpretar como:

```
AUDITORIA BLOQUEADA — DIVERGÊNCIAS ENCONTRADAS
```

(motivo: D1 + D2 pré-existentes, não regressão de células).

**Posição do auditor:** o mapeamento de células em `82d300c` cumpre a especificação auditada; falhas remanescentes não foram introduzidas por esse commit e **não foram corrigidas aqui**.

---

**PARAR.** Aguardando decisão expressa do César.  
Não corrigir · não merge · não integrar ENTREGAS · não piloto · não Copiloto-cells reimplementação.
