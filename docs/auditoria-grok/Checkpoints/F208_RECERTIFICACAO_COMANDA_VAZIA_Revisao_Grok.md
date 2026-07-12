# Recertificação Independente — F2-08 Comanda Vazia

| Campo | Valor |
|---|---|
| Revisor | Grok (Red Team) |
| Branch Fable (implementação) | `feature/preloja-fable` |
| Base anterior | `ced1892b7cdd277bcd25c6f32eef9b04365ad3fd` |
| Commit da correção | `e872f0161435651c2e067a684da8aaf451705a5d` |
| Auditoria anterior (bloqueio D4A) | `audit/preloja-grok` @ `b9dd80b` |
| Branch desta auditoria | `audit/preloja-grok` |
| Escopo | **Somente** recertificação F2-08 + F2-07 documental |
| Data | 2026-07-12 |

**Fora de escopo:** D4A, visual, Epson, iFood real, Windows, correção de código, alteração de `main` / `feature/preloja-fable`.

---

## 1. Veredito

### **APROVADO PARA D4A COM RESSALVAS NÃO BLOQUEANTES**

A correção em `src/live/qualidade.js` fecha o achado que bloqueava D4A: `itens: []` casado com status **não** vira mais `complete` nem `apto_para_decisao`. Invariante, recuperação, revogação, cancelamento soberano, replay e campanha de 30 dias foram reexecutados de forma independente e fecham.

Ressalvas **não bloqueantes** (R1–R3, §14): quantidade `null` com nome válido; lista mista sem warning de itens inválidos; `fields_missing: itens` também em array vazio (distinto por `comanda_sem_itens`).

**Riscos bloqueantes: nenhum.**

---

## 2. Entrada e isolamento

| Check | Resultado |
|---|---|
| HEAD Fable auditado | `e872f0161435651c2e067a684da8aaf451705a5d` |
| Mensagem | `Corrige aptidao de comanda vazia no nucleo live` |
| Ancestral imediato | `ced1892` (campanha 3B) |
| Diff `ced1892..e872f01` | **6 arquivos**, +305 / −43 |
| Árvore Fable no momento da auditoria | limpa (sem working-tree suja) |

### Arquivos no diff (escopo da correção)

```text
docs/preloja/Campanha_Sintetica_30_Dias_V0.md
docs/preloja/Contrato_Nucleo_Fonte_Viva_V0.md
src/live/qualidade.js
tests/live/comanda-vazia.test.js          (NOVO)
tests/live/simulator/campanha-unidades.test.js
tools/live/simulator/campanha/executor.js
```

### Isolamento (G11)

| Área protegida | Tocada? |
|---|---|
| `src/perfil-delivery/motor.js` | **não** |
| `src/perfil-delivery/decisao.js` | **não** |
| `app-v1/**` | **não** |
| `package.json` / lockfiles | **não** |
| `data/**` / cardápio | **não** |
| `src/live/consolidar.js` | **não** (fórmula de aptidão intocada) |
| `src/live/dedup.js` / idempotência | **não** |
| `main` | **não** tocada |

Única mudança de código de núcleo: `src/live/qualidade.js` (+ comentários de contrato nos docs e asserções de teste/relatório da campanha).

---

## 3. G1 — Causa raiz

### Comportamento anterior (`ced1892`, `qualidade.js`)

```js
const temComanda = !!(pedido.comanda && Array.isArray(pedido.comanda.itens));
```

- `Array.isArray([]) === true` ⇒ `temComanda === true` com **zero itens**.
- Sem outros motivos de suspeita e com status: `completeness = "complete"`.
- Derivação de aptidão (**intocada**, `consolidar.js` L599–600):

```js
registro.apto_para_decisao = matchState === "matched" && !registro.cancelado &&
  registro.qualidade.completeness === "complete";
```

**Cadeia do bug:** array vazio ⇒ “tem comanda” ⇒ complete (se matched+status) ⇒ apto.  
**Causa raiz reportada: confirmada e completa** para o achado F2-08. Não há segundo caminho paralelo em `consolidar`/`snapshot` que reabra aptidão sem passar por `completeness`.

### Correção (`e872f01`, `qualidade.js` L59–91)

- `composicaoObservada = Array.isArray(itens)`
- `itensValidos` = contagem de objetos com `nome` string não vazia (trim)
- `temComanda = composicaoObservada && itensValidos > 0`
- Se array observado e `itensValidos === 0` ⇒ `suspeito` + motivo `comanda_sem_itens`
- Completude: `suspect` tem prioridade sobre complete/partial

---

## 4. G2/G3 — Contrato de composição e invariante

### Matriz A–F (função `calcularQualidadeConsolidado`, com status presente)

| Caso | Entrada | completeness | fields_missing | motivos | apto se matched |
|---|---|---|---|---|---|
| A | comanda null | partial | itens | — | false |
| B | itens null / não-array no consolidado | partial | itens | — | false |
| C | `itens: []` | **suspect** | itens | `comanda_sem_itens` | **false** |
| D | só elementos inválidos (nome null) | **suspect** | itens | `comanda_sem_itens` | **false** |
| E | ≥1 item válido | complete | — | — | true |
| F | misto (válido + inválido) | complete | — | — | true |

**Ingresso de evento** (camada contrato, não só qualidade):

| Caso | Destino |
|---|---|
| Campo `itens` ausente | quarentena `payload_incompativel` (campo `itens`) |
| `itens` não-array na comanda | quarentena `payload_incompativel` |

**Invariante central (G2/G3):**  
`itens: []` ⇒ `completeness !== "complete"` (é `suspect`) ⇒ `apto_para_decisao === false`  
sempre que a projeção consolida — com ou sem status, matched ou unmatched.

### Casos cobertos por testes (obrigatórios)

| # | Cenário | Arquivo / asserção | Resultado auditoria |
|---|---|---|---|
| 1 | vazia sem status | `comanda-vazia` #1 | suspect, não apta |
| 2 | vazia antes do status | #2 | matched + suspect + apto false |
| 3 | vazia depois do status | #3 | idem |
| 4 | duplicidade | #4 | dedup; nunca apta |
| 5 | reimpressão vazia | #5 | vias+1; nunca apta |
| 6 | cancelamento | #6 | cancelado; apto false; composição válida posterior **não** reabre |
| 7 | reinício/replay | #7/15 | projeção idêntica; regra sobrevive |
| 8 | recuperação | #8 | complete + apto true; sem `comanda_sem_itens` |
| 9 | revogação `items_replacement: []` | #9 | perde complete/apto |
| 10 | sem campo itens | #10 | quarentena |
| 11 | formato inválido | #11 | quarentena |
| 12 | só inválidos (+ misto documentado) | #12 | só inválidos = suspect; misto = complete (contrato atual) |
| 13 | status duplicado | #13 | carimbo avança; regra inalterada |
| 14 | status fora de ordem | #14 | coluna não regride; regra inalterada |
| + | 7 variações f208 no volume | `campanha-unidades` test 10 | asserções **corrigidas** (não apagadas): `suspect`/`false` no lugar de `complete`/`true` |

---

## 5. G4 — Recuperação

Teste #8 + caso f208 `f208_vazia_depois_recebe_composicao`:

1. comanda `itens: []` + status ⇒ suspect / apto false  
2. `pedido_alterado` com item válido ⇒ `complete` + `apto true`  
3. `motivos_suspeita` **não** retém `comanda_sem_itens`  
4. Replay do mesmo log produz o mesmo estado (sem cache stale de aptidão)

**Passa.**

---

## 6. G5 — Revogação

Teste #9:

1. comanda válida + status ⇒ complete + apto  
2. `items_replacement: []` ⇒ suspect + `comanda_sem_itens` + apto false  
3. Aptidão anterior **não** é preservada (projeção recalculada em `consolidarVisao` via `calcularQualidadeConsolidado`)

**Passa.**

---

## 7. G6 — Cancelamento soberano

Teste #6 + f208 cancelamento:

- vazio + cancelado ⇒ apto false  
- cancelado + composição válida posterior ⇒ **permanece** apto false  
- fórmula: `!registro.cancelado` é condição hard em `consolidar.js` L599  

**Passa.** Cancelamento continua soberano.

---

## 8. G7 — Replay e idempotência

| Check | Evidência |
|---|---|
| Replay não recria aptidão indevida | teste #7/15 + f208 reinício |
| Reimpressão não promove vazio a válido | teste #5 (`reimpressao_identica`, vias=2, ainda suspect) |
| Duplicidade não abre aptidão | teste #4 + #13 |
| Projeção reconstruída equivalente | `deepEqual` normalizado no #7; campanha 6/6 `snapshot_igual` |
| Dedup estável | **sem** diff em `dedup.js`; 448 duplicados reconhecidos na campanha; 0 não reconhecidos (F2-07) |

**Passa.**

---

## 9. G8 — Suíte integral

Comando (worktree Fable @ `e872f01`):

```text
node --test tests/live/*.test.js tests/live/simulator/*.test.js
```

| Campo | Valor |
|---|---|
| Total | **151** |
| Pass | **151** |
| Fail | **0** |
| Skipped / todo / cancelled | **0** |
| Duração | ~22,9 s |
| Declaração da correção | 151/151 ✓ |

**Testes removidos/enfraquecidos?** Não.  
- Arquivo novo: `comanda-vazia.test.js` (15 cenários de asserção).  
- Teste 10 de `campanha-unidades`: asserções do achado **invertidas para o comportamento correto** (não removidas).  
- Contagem de arquivos de teste em `tests/live`: 23 → 24.

**Passa.**

---

## 10. G9 — Campanha 30 dias (reexecução independente)

Config canônica: `campanha-sintetica-30d-v0` / seed `deliveryos-3b-sintetico` / `America/Sao_Paulo` / 2026-08-01 / 30 dias.

| Métrica | Declarado | Reproduzido | OK |
|---|---:|---:|---|
| Dias | 30 | 30 | ✓ |
| Pedidos | 9.298 | **9.298** | ✓ |
| Eventos | 24.595 | **24.595** | ✓ |
| Aceitos / log | 24.093 | **24.093** | ✓ |
| Reinícios / replays eq. | 6/6 | **6/6** | ✓ |
| Fronteira 23:00 | 9 | **9** | ✓ |
| PII | [] | **[]** | ✓ |
| Falhas inesperadas | 0 | **0** | ✓ |
| Divergências | 0 | **0** | ✓ |
| Comandas vazias (cenário) | 93 | **93** | ✓ |
| Matched | 8.602 | **8.602** | ✓ |
| Aptos | 8.567 | **8.567** | ✓ |

### Determinismo (duas execuções, runtimes temp distintos)

| | Run A | Run B |
|---|---|---|
| `hash_campanha` | `f5c27b872c3fe80079945c3512cfd0de4e520613f3001ebae53d4a27043bbf0d` | **idêntico** |
| `snapshot_final_hash` | `03edcffee374d2a4de2dcb64c4df6064d3c89435803b2a32d0951ee84b3b4e63` | **idêntico** |
| runtimes distintos | sim | sim |

Prefixo declarado `f5c27b872c3fe80079945c3512cfd0de4e520613` — **confirmado**.

Hash anterior (`ced1892`): `12fed2d018fac2548d2ba3aa402eb2b26ec860ec8f259876c5c443adf8a87133`  
Delta de hash **esperado**: mudança de estados F2-08 + textos F2-07 no relatório canônico.

**Passa.**

---

## 11. G10 — Prova diferencial dos 35

| Agregado | Antes (`ced1892` / auditoria 3B) | Depois (`e872f01`) |
|---|---:|---:|
| matched | 8.602 | **8.602** |
| aptos | 8.602 | **8.567** |
| Δ aptos | — | **−35** |

### Inspeção do conjunto completo (não só contagem)

Reconstrução do runtime da campanha canônica + varredura de todos os pedidos do snapshot:

| Conjunto | n |
|---|---:|
| matched ∧ ¬cancelado ∧ ¬apto | **35** |
| motivo único desse conjunto | **100%** `suspect\|comanda_sem_itens` |
| matched ∧ suspect ∧ `comanda_sem_itens` ∧ 0 itens válidos | **35** |
| aptos com 0 itens válidos | **0** |
| complete com `itens: []` | **0** |
| vazias observadas totais | **93** (= 35 matched + 58 unmatched, todas apto=false) |

**Conclusão:** os 35 que perderam aptidão são **exclusivamente** comandas vazias casadas com status. Nenhum pedido com item válido perdeu aptidão por esta correção. Nenhum vazio permanece apto. Demais agregados operacionais (matched, cancelados, conflitos, volume) inalterados ou justificados.

### IDs sintéticos dos 35 (completos)

```text
SIM-INTERNO-0092  SIM-INTERNO-0384  SIM-INTERNO-0304  SIM-INTERNO-0352
SIM-INTERNO-1329  SIM-INTERNO-1842  SIM-INTERNO-1815  SIM-INTERNO-1516
SIM-INTERNO-1784  SIM-INTERNO-2292  SIM-INTERNO-3356  SIM-INTERNO-3791
SIM-INTERNO-3553  SIM-INTERNO-3539  SIM-INTERNO-3981  SIM-INTERNO-4087
SIM-INTERNO-5150  SIM-INTERNO-5091  SIM-INTERNO-5438  SIM-INTERNO-5950
SIM-INTERNO-5966  SIM-INTERNO-5617  SIM-INTERNO-6028  SIM-INTERNO-6151
SIM-INTERNO-6288  SIM-INTERNO-7071  SIM-INTERNO-7518  SIM-INTERNO-7828
SIM-INTERNO-8533  SIM-INTERNO-8636  SIM-INTERNO-8244  SIM-INTERNO-8881
SIM-INTERNO-9333  SIM-INTERNO-9128  SIM-INTERNO-9253
```

Todos com prefixo `SIM-` (sintéticos). short correspondente `SIM-IFOOD-####`.

**Passa.**

---

## 12. G11 — Isolamento

Confirmado por `git diff --name-only ced1892 e872f01` e ausência de matches em áreas protegidas (§2).  
Código de deduplicação **não** alterado (F2-07 só documentação/relatório).

**Passa.**

---

## 13. G12 — Privacidade

| Check | Resultado |
|---|---|
| Dados da campanha | 100% sintéticos (`SIM-*`) |
| Varredura PII runtime campanha | `[]` (gate G4 verde) |
| Diff da correção | sem amostras reais, sem PII |
| Testes F2-08 | helpers fictícios (`Item Valido`, etc.) |

**Passa.**

---

## 14. G13 — F2-07 documental

| Alegação | Status pós-correção |
|---|---|
| “Reinício diário mitiga crescimento” | **retratada** em Campanha §6 e `executor.js` (`comportamento_apos_replay` / `justificativa`) |
| Replay completo reconstrói chaves do log | **documentado e alinhado ao código** |
| Crescimento linear com fatos aceitos | **confirmado** (classificação `crescimento_linear_esperado`, razão 1,0) |
| Retenção/rotação/compactação/janela necessárias multiperíodo | **mantido** |
| Código de dedup alterado silenciosamente | **não** (diff vazio em `dedup.js`) |
| Bloqueia D4A? | **não** (escala 30d estável) |
| Bloqueia operação contínua multiperíodo? | **ainda sim**, até política de retenção (F7+) |

**Passa** (documentação corrigida; achado técnico de retenção permanece não-bloqueante para D4A).

---

## 15. G14 — Riscos residuais

### R1 — Item com nome válido e `quantidade: null`

- **Contrato atual:** item válido = objeto com `nome` texto não vazio (`Contrato` §13 / F2-08). Quantidade **não** entra no critério de existência de composição.
- **Efeito:** `complete` + apto possível com `quantidade: null`.
- **D4A:** adaptador/UI devem tratar quantidade ausente como incerteza semântica se precisarem de contagem; **não** reabre o bug de comanda vazia.
- **Classificação:** **comportamento correto pelo contrato atual** · backlog se produto quiser “quantidade obrigatória para complete”.

### R2 — Lista mista (válidos + inválidos) → `complete` sem aviso

- Itens inválidos **permanecem** no array (sanitizar zera nome para lixo de shape, mas não remove da lista).
- Qualidade **não** emite warning específico de “itens descartados/ inválidos no consolidado”.
- **Não** viola o contrato F2-08 (há ≥1 nome válido ⇒ composição presente).
- **Classificação:** **backlog pós-D4A** (melhoria de honestidade: warning ou partial se houver inválidos misturados). **Não bloqueante.**

### R3 — `fields_missing: itens` para array vazio

- Array vazio e comanda ausente ambos empurram `"itens"` em `fields_missing`.
- Distinção preservada por **`motivos_suspeita: comanda_sem_itens`** + `completeness: suspect` vs `partial`.
- Risco de UI futura que leia só `fields_missing` e ignore motivos: baixo se D4A consumir o contrato completo.
- **Classificação:** **não bloqueante** · melhoria cosmético-semântica opcional (ex.: `fields_invalid` vs `fields_missing`).

### Resumo de classificação

| ID | Classificação |
|---|---|
| R1 | comportamento correto pelo contrato |
| R2 | backlog pós-D4A |
| R3 | não bloqueante / cosmético |
| Bloqueantes para D4A | **nenhum** |
| Correção recomendada antes de D4A | **nenhuma** |

---

## 16. Gates G1–G14

| Gate | Resultado |
|---|---|
| G1 Causa raiz correta | **VERDE** |
| G2 Vazio nunca complete | **VERDE** |
| G3 Vazio nunca apto | **VERDE** |
| G4 Recuperação válida | **VERDE** |
| G5 Revogação válida | **VERDE** |
| G6 Cancelamento soberano | **VERDE** |
| G7 Replay equivalente | **VERDE** |
| G8 Suíte 151/151 | **VERDE** |
| G9 Campanha determinística | **VERDE** |
| G10 Diferencial 35 explicado | **VERDE** |
| G11 Isolamento | **VERDE** |
| G12 Privacidade | **VERDE** |
| G13 F2-07 documentado | **VERDE** |
| G14 Riscos classificados | **VERDE** |

---

## 17. Comandos de auditoria (reprodutíveis)

```text
# worktree feature/preloja-fable @ e872f01
git rev-parse HEAD
git diff --name-only ced1892b7cdd277bcd25c6f32eef9b04365ad3fd e872f0161435651c2e067a684da8aaf451705a5d
node --test tests/live/*.test.js tests/live/simulator/*.test.js
node -e "const {executarCampanha}=require('./tools/live/simulator/campanha/executor'); const a=executarCampanha({}); const b=executarCampanha({}); console.log(a.hash_campanha, a.hash_campanha===b.hash_campanha, a.totais.estados_finais)"
```

---

## 18. Conclusão

O bloqueio D4A da auditoria 3B (`b9dd80b`) por F2-08 está **resolvido e recertificado**. A correção é **mínima, localizada e testada**. A campanha canônica permanece determinística com hash `f5c27b87…` e Δ de aptidão **exatamente 35 vazias casadas**.

**Veredito final: APROVADO PARA D4A COM RESSALVAS NÃO BLOQUEANTES.**

D4A **não** foi iniciada nesta missão.
