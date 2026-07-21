# Auditoria independente — Conference Brain Foundation V1 (Sprint 1)

**Auditor:** Grok  
**Data:** 2026-07-21  
**Worktree:** `C:\Users\italo\Desktop\Claude\deliveryos-audit-conference-brain-v1`  
**Branch de auditoria:** `audit/conference-brain-foundation-v1`  
**HEAD auditado:** `32ca889de1a9fdc61dfcf25a1cd92c6bf44c7e22`  
**Base integrada:** `52611dd3c0db7335aa3b627b9b81aafaf56ad26d`  
**Working tree na auditoria:** limpo  
**Upstream:** nenhum  
**Remote:** `origin` → delviery-os (não usado; sem push)

**Não confiou no relatório da implementação.** Tudo reexecutado ou relido no worktree limpo.

---

## 1. Branch, HEAD, base, commits

### 1.1 Isolamento

| Item | Valor |
|------|--------|
| Branch original (intocada) | `feature/conference-brain-foundation-v1` @ `32ca889` |
| Branch auditoria | `audit/conference-brain-foundation-v1` @ `32ca889` (mesmo tree) |
| Merge / push / deploy | **não** |
| ENTREGAS no worktree de auditoria | **não alterado / não incluído** |

### 1.2 Quantidade real de commits (Sprint 1 sobre a base)

`git rev-list --count 52611dd..32ca889` = **7** (não “seis”).

Ordem (antiga → nova):

| # | SHA | Mensagem |
|---|-----|----------|
| 1 | `00b5728` | feat: contratos, modelo de dados e feature flags |
| 2 | `e701041` | feat: ingestão, normalização e deduplicação |
| 3 | `9c836a1` | feat: motor de snapshots e estado sombra |
| 4 | `db86879` | feat: sinais pontuais de composição |
| 5 | `ebe781c` | test: cobre fundação v1 |
| 6 | `6015ff4` | fix: observação com quebra de linha |
| 7 | `32ca889` | docs: especificação, modelo, validação, próximos sprints |

**Erro documental:** o relatório da implementação falou em “seis commits” mas listou **sete**.  
**Não** há squash/merge nos sete: histórico linear.  
**Classificação:** erro documental, não defeito funcional.

### 1.3 Equivalência da base (patch-id)

| Original | Integração declarada | `git patch-id --stable` |
|----------|---------------------|-------------------------|
| `4c74125` | `fb72bde` | **MATCH** |
| `653cdd5` | `d9a1725` | **MATCH** |
| `82d300c` | `1ff0ce0` | **MATCH** |
| `97fd799` | `52611dd` | **MATCH** |

`52611dd` é ancestral de `32ca889` (`merge-base --is-ancestor` exit 0).

### 1.4 ENTREGAS ausente

| Commit | Ancestral de HEAD? |
|--------|-------------------|
| `05b6efa` | **não** (exit 1) |
| `5a63175` | **não** (exit 1) |

---

## 2. Escopo do diff `52611dd..32ca889`

| Afirmação | Verdade |
|-----------|---------|
| 22 arquivos | **sim** |
| Todos novos (`A`) | **sim** (0 modificados/excluídos) |
| 3393 inserções | confere `git diff --stat` |

Arquivos: 6 docs + `validation-run.json` + 14 `src/conference-brain/*` + 1 test + 1 tool.

**Sem** binários grandes commitados.  
**Sem** HTML bruto histórico no Git (só lido de `delviery-os/data/raw/...` em runtime).

### Privacidade

Scan de padrões PII nos 22 arquivos: hits apenas em:

- listas `FORBIDDEN_FIELDS` (telefone, endereço, cpf… **rejeitados**);
- testes que tentam gravar `telefone` e esperam rejeição.

**Sem** telefone/endereço/token/sessão/mensagem pessoal real nos artefatos versionados.

---

## 3. Feature flags e isolamento

Arquivo: `src/conference-brain/flags.js`

| Flag | Env | Produção (`NODE_ENV=production`, env limpo) | Dev/test default |
|------|-----|-----------------------------------------------|------------------|
| `CONFERENCE_BRAIN_FOUNDATION_V1` | sim | **false** | **true** |
| `CONFERENCE_SHADOW_STATE_V1` | sim (+ exige foundation) | **false** | **true** |
| `CONFERENCE_COMPOSITION_HINTS_V1` | sim (+ foundation) | **false** | **true** |
| `automaticDecisionsEnabled()` | hardcoded | **sempre false** | sempre false |
| `shadowStateMayDriveProduct()` | hardcoded | **sempre false** | sempre false |

**Nuance documental:** o relatório “padrão desligado” é **verdade em produção**, mas em `development`/`test` o default **sem env var é ligado**. Isso é intencional para testes; em produção fica desligado.  
**Não** há wire no app-v1 / motor existente — fundação é **importação explícita** de módulos (`require('./src/conference-brain/...')`). Não existe `index.js` barrel; isolamento intencional.

**Sem** dependência de ENTREGAS (testes de compatibilidade passam).  
**Sem** promoção automática para Capacidade Viva.

---

## 4. Ingestão — dois formatos

### 4.1 20–30/06 (`ALL_ROWS`)

- Estratégia: regex `const ALL_ROWS = [...]` + `JSON.parse` (não executa script).  
- Campos: dt, oid, status, tv, nitens, itens_html.  
- Observações em `<em>(...)</em>`; proteção de quebra de linha no normalizer.  
- **Sem** `ready_at` / saída → saúde **parcial**.

### 4.2 01/07 (`order-card`)

- Estratégia: split `order-card` + regex de id/hora/status/total/itens.  
- **Data** via `inferReportDate(path)` ou `reportDates`; sem data → `dt` nulo (rejeição explícita, não inventa dia).  
- Horário só no card.

### Fragilidade (risco real, não bloqueador do Sprint 1)

| Ponto de quebra | Formato |
|-----------------|---------|
| Nome da variável `ALL_ROWS` / estrutura JSON embutida | jun |
| Classes CSS `order-card`, `col-name`, `col-qty`, `badge` | jul |
| Inferência de data pelo path | jul |
| Encoding / HTML entities | ambos |

Parser histórico é **batch de arquivo local**, não live iFood.

---

## 5. Números históricos (reexecutados)

Comando: `node tools/conference-brain/validate-historical.js <jun.html> <jul.html>`

| Métrica | Declarado | Observado auditoria |
|---------|----------:|--------------------:|
| Observados (pré-dedup) | 3465 | **3465** |
| Duplicados | 36 | **36** |
| Únicos | 3429 | **3429** |
| Itens declarados bruto (dist.) | 11355 | **11355** |
| Itens após dedup | 11230 | **11230** |
| Δ bruto→persistido | 125 | **128** linhas HTML vs 125 conceitual* |
| Eventos de status | 3698 | **3698** |
| Janelas 5 min | 3287 | **3287** |
| Janelas com `active_orders` | 0 | **0** |
| `leitura_parcial` | 100% | **3287/3287** |
| Composição altera estado global | 0 | **0** |

\* `linhas_html_bruto` 11358 − 11230 = **128**; o relatório fala 125 itens das 36 ocorrências repetidas — diferença de **3** entre contagem de linhas HTML brutas e “itens de dups” (arredondamento/nitens vs linhas). **Não** invalida 11230 canônicos. Registrado como nuance de métrica, não falha de dedup.

### Match seed (validação histórica)

- Itens casados: **11230**  
- Sem correspondência: **0**  
- Nomes distintos observados no corpus de composição (análise prévia): **~154**  
- Itens do seed (199) que **aparecem** em algum pedido: da ordem de **~142–154** (não 199)  
- **Nunca afirmar** “todos os 199 vendidos” — apenas “todos os nomes **observados** casaram”.

---

## 6. Deduplicação dos 36

Código: `normalize/dedupe.js`

- Regra: `dedupe-v1:prefer-most-complete-then-earliest-observation`  
- Completude por campos preenchidos; empate → observação mais antiga  
- `merge`: preenche nulos do vencedor com perdedor; amplia first/last observed  
- Divergência → `confidence: media` + anomalia `duplicidade_com_divergencia`  
- Validação: **36 anomalias**, todas divergentes  

**Avaliação:**

| Critério | Status |
|----------|--------|
| Brutos preserváveis via raw store | sim (pipeline grava raw) |
| Não apaga em silêncio | sim (anomalia + evidence) |
| Determinístico | sim |
| Status mais recente / itens extras | **parcial** — vence “mais completo”, não “mais recente por campo”; merge só preenche **nulos**, não união de listas de itens se o vencedor já tem itens |

**Recomendação (sem implementar):** reconciliação por campo e união de `order_items` quando dups tiverem conjuntos diferentes de linhas.  
**Não bloqueia** Sprint 1 se anomalias ficam abertas e auditáveis (estão).

---

## 7. Observações com quebra de linha

Reprodução independente:

```
1x Ceviche <em>(nao gosto de tilapia ao inves
pode colocar salmao)</em>
1x Temaki de Salmao
```

Resultado do normalizer:

- 2 itens (Ceviche, Temaki)  
- observação completa no Ceviche, **sem** item fantasma “pode colocar salmao”  
- Temaki separado  

Cobertura em testes (`6015ff4` + foundation.test).  
Fragilidade residual: `<em>` malformado extremo / tags aninhadas raras.

---

## 8. Contratos e persistência

| Afirmação segura | |
|------------------|--|
| Contratos em `contracts/schemas.js` + `states.js` + `rule-version.js` | sim |
| Validação rejeita PII | sim |
| Store | **JSONL append-only** + memória (`storage/store.js`) |
| Banco SQL/Postgres | **não** implementado |

Documentação deve dizer “persistência JSONL / adaptador Store”, **não** “banco de dados completo”.  
Troca futura por SQLite/Postgres prevista no comentário do store — abstração ok.

---

## 9. Snapshots

`snapshots/engine.js`:

- Janela 5 min (floor);  
- **Sem `ready_at` em nenhum pedido** → `hasReady=false` → `active_orders=null`, `convergence=null`, nota explícita;  
- Ativo só quando ready observado: recebido antes do fim da janela e ainda sem ready/concluído/cancelado;  
- Convergência = contagem de ready na janela (não score).  

Validação real: 3287 janelas, **0 com ativos** — correto para histórico sem PRONTO.

---

## 10. Saúde da fonte e estado sombra

Histórico real → **100% `leitura_parcial`**, modo **`shadow`**, **0** calmo/fluindo/atenção/urgência inventados.

Faixas 30/50/70 e atenção abaixo de 50 (convergência+ritmo) **reproduzidas em cenários sintéticos** pelo `validate-historical` (não sobre active real do histórico).

`automaticDecisionsEnabled` e promoção a produto: **false** hardcoded.

---

## 11. Composição

`composition/hints.js`:

- Só contexto do pedido  
- Proíbe score, `risco_de_erro` cru, alergia sem texto  
- Validação: **0** pedidos em que composição altera estado global  

---

## 12. Testes (worktree limpo, 2× foundation)

| Suíte | Esperado | Observado |
|-------|----------|-----------|
| Live | 243/0 | **243/0** |
| Copiloto | 53/0 | **53/0** |
| Capacidade Viva | 43/0 | **43/0** |
| Conference Brain | 55/0 | **55/0** (2 execuções idênticas) |
| validate-historical | consistente | **VALIDACAO CONSISTENTE** |

---

## 13. Documentação vs código

| Doc | Coerência |
|-----|-----------|
| IMPLEMENTATION_SPEC / DATA_MODEL / INGESTION / SHADOW / VALIDATION / NEXT | alinhados ao código |
| “Seis commits” | **erro** → são **7** |
| “Padrão desligado” | **impreciso** → desligado em production; ligado por default em development/test |
| “Banco” | deve ler-se **JSONL/Store**, não RDBMS |
| Limitação sem PRONTO | **bem** refletida no código e na validação |
| 199 itens vs observados | docs devem distinguir match de nomes observados vs cobertura do catálogo |

---

## 14. Riscos e bloqueadores

### Riscos (não bloqueiam Sprint 1 se documentados)

1. Parsers HTML frágeis a mudança de layout/CSS/ALL_ROWS.  
2. Dedup não faz união de itens quando ambos os lados têm linhas.  
3. Flags default on em development (ok se produção off).  
4. Sem barrel `index.js` — integração futura exige paths explícitos.  
5. Métrica “125 itens de dups” vs 128 linhas HTML brutas (nuance de contagem).

### Bloqueadores para leitura **ao vivo** (próximo sprint, não deste)

- Sem coletor de sessão iFood.  
- Sem carimbo PRONTO na fonte histórica → **impossível** testar 30/50/70 em dados reais de carga.  
- UI Copiloto ainda não consome o shadow state.

### Não são bloqueadores do Sprint 1

- Fundação isolada e flagada.  
- Testes e validação histórica verdes.  
- Sem ENTREGAS.  
- Sem decisão automática.

---

## 15. Recomendação e veredito

Funcionalmente o Sprint 1 cumpre a fundação: ingestão dual, dedup auditável, snapshots honestos, sombra sem fingir calmo, composição sem controle de estado, testes e validação histórica consistentes, base integrada correta, sem ENTREGAS.

Falhas encontradas são **documentais** (contagem de commits, “padrão desligado”, vocabulário “banco”) e **melhorias de dedup** recomendadas, não falhas que invalidem o entregável.

```
AUDITORIA APROVADA COM CORREÇÕES DOCUMENTAIS
```

### Correções documentais esperadas (para o Claude/implementação — **não feitas aqui**)

1. Passar a dizer **7 commits**, não 6.  
2. Esclarecer defaults de flag: off em **production**; on em development/test se env ausente.  
3. Chamar persistência de **JSONL append-only / Store**, não “banco implementado”.  
4. Deixar explícito: match = nomes **observados**; não cobertura total dos 199.  
5. Opcional: nota sobre união de itens em dups e a diferença 125/128.

---

## Entregáveis desta auditoria

- Este arquivo: `docs/auditoria/CONFERENCE_BRAIN_SPRINT1_AUDIT.md`  
- Código de produto: **não modificado**  
- Branch de implementação: **não alterada**  

**PARAR.** Não iniciar próximo sprint.
