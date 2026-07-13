# Auditoria Independente D4A — Simulador na Interface por Feature Flag

| Campo | Valor |
|---|---|
| Revisor | Grok (Red Team) |
| Branch implementação | `feature/d4a-simulador-interface` |
| Base | `e872f0161435651c2e067a684da8aaf451705a5d` (pós F2-08) |
| Hash final implementado | `7267c1019e169a93429b956ebe3b5c6376c64642` |
| Commit Fable | `Conecta simulador a interface por feature flag na D4A` |
| Auditoria F2-08 prévia | `f7d9e1b24ba4edc33f4a405b7acfc41fec18c08a` |
| Branch desta auditoria | `audit/preloja-grok` |
| Data | 2026-07-13 |
| Escopo | D4A apenas — **sem** correção de código, sem Sprint Visual, sem D4B, sem merge |

---

## 1. Veredito

### **APROVADO PARA SPRINT VISUAL V2 COM RESSALVAS NÃO BLOQUEANTES**

A D4A conecta a fonte simulada certificada (3A/3B) à interface V1 por `DELIVERYOS_LIVE_SOURCE`, com isolamento do núcleo, flag segura por padrão, F2-08 preservado na janela, campanha 30d com hash idêntico ao pós-F2-08, e suíte **173/173**.

Não inventa Calmo a partir de ausência: fora de `ready`+janela com pedidos, a UI mostra estado técnico da fonte. Motor e decisão permanecem a única autoridade cognitiva.

**Ressalvas não bloqueantes** (§28–29): (a) `quantidade \|\| 1` preenche quantidade ausente; (b) em `ready` com janela apta, `pedidos_excluidos`/unknowns **existem no payload mas não são renderizados** no `app-v1`; (c) `source_status` stale/disconnected deriva só da fonte de **status** (documentado; composição morta sozinha não rotula a fonte); (d) teste de soberania por substring de chaves é frágil, mas o código do adaptador é auditável.

**Riscos bloqueantes: nenhum.** Sprint Visual / D4B / merge **não** iniciados nesta missão.

---

## 2. Base, branch e diff

| Check | Resultado |
|---|---|
| HEAD implementado | `7267c1019e169a93429b956ebe3b5c6376c64642` |
| Merge-base com base | `e872f01` (ancestral direto) |
| Contém-se em `main`? | **não** (`main` @ `a441bc7`, sem `7267c10`) |
| Working tree Fable na auditoria | limpa no commit auditado |

### Arquivos alterados (`git diff --name-only e872f01 7267c10`)

```text
app-v1/app.js                              | +94 / −14  (boot dual + renderEstadoFonte)
docs/preloja/D4A_Simulador_Interface_V0.md | +190       (doc D4A)
src/live/interface/adaptador.js            | +245       (NOVO)
src/live/interface/fonte.js                | +46        (NOVO — flag)
tests/live/interface-adaptador.test.js     | +207       (NOVO)
tests/live/interface-fonte.test.js         | +92        (NOVO)
tools/live/interface/servir_d4a.js         | +124       (NOVO — irmão de servir_v1)
```

**7 arquivos, +984 / −14.** Nenhuma alteração não declarada.

---

## 3. GATE 1 — Isolamento

`git diff e872f01 7267c10 --name-only` cruzado com áreas protegidas:

| Área | Diff? |
|---|---|
| `src/perfil-delivery/motor.js` | **vazio** |
| `src/perfil-delivery/decisao.js` | **vazio** |
| `src/live/nucleo.js` | **vazio** |
| `src/live/qualidade.js` | **vazio** |
| `src/live/consolidar.js` | **vazio** |
| `src/live/dedup.js` | **vazio** |
| seed / cardápio / `data/**` | **vazio** |
| `package.json` / lockfiles | **vazio** |
| `tools/servir_v1.js` | **vazio** (servidor irmão novo) |
| TATÁ Evolução / Entregas / Suprimentos | **fora** deste repositório/branch |

**G1 VERDE.**

---

## 4. GATE 2 — Feature flag `DELIVERYOS_LIVE_SOURCE`

Implementação: `src/live/interface/fonte.js` (`selecionarFonte` / `selecionarFonteDoAmbiente`).

| Valor bruto | fonte | degraded_state | fallback |
|---|---|---|---|
| ausente / `null` / `""` | `current` | — | `flag_ausente_usando_fonte_atual` |
| `current` / `Current` | `current` | — | — |
| `simulator` / `SIMULATOR` / `  simulator  ` | `simulator` | — | — |
| inválido (`x`, `live`, `false`, `0`, espaço `" "`) | `current` | `flag_invalida` | `valor_desconhecido_usando_fonte_atual` |

Confirmações:

- Simulador **nunca** liga silenciosamente.
- Inválido / ausente → current + registro auditável.
- Case-insensitive após `trim().toLowerCase()`.
- Rollback = remover/trocar env (sem rebuild).
- `servir_d4a` com `current`: `/api/fonte` → **409** `fonte_simulada_desligada` (HTTP smoke).
- `app-v1`: falha de `/api/config` (ex.: `servir_v1` antigo) → `bootAtual` (caminho histórico).

**G2 VERDE.**

---

## 5. GATE 3 — Arquitetura real (código, não só docs)

### Fluxo reconstruído

```text
[flag DELIVERYOS_LIVE_SOURCE]
        │
        ├─ current ──► fetch data/generated/v1_janela_real*.json
        │                 + cardapio_knowledge_seed.json
        │                 ──► rodarJanela() ──► precomputar()
        │                       MOTOR.step / DECISAO.decidir
        │                       ──► UI Calmo | Ambiente | Foco
        │
        └─ simulator ──► GET /api/fonte
                           │
                           ▼
              tools/live/simulator (executarCenario 3A)
                           │  fatos sintéticos → núcleo live
                           ▼
              snapshot (match, qualidade, apto, freshness, gate)
                           │
                           ▼
              src/live/interface/adaptador.js
              montarJanela (filtra apto_para_decisao)
              + derivarEstadoFonte
              ──► payload { janela NIGHT/rows | null, excluidos, unknowns, … }
                           │
                           ▼
              app-v1 bootSimulador:
                ready && janela.NIGHT.length>0 → rodarJanela (MESMO cérebro)
                senão → renderEstadoFonte (estado técnico; NÃO Calmo)
```

### Respostas explícitas

| # | Pergunta | Resposta com evidência |
|---|---|---|
| A | Única autoridade de decisão cognitiva? | **Sim para Calmo/Ambiente/Foco:** só `MOTOR.step` + `DECISAO.decidir` em `app-v1/app.js` `precomputar` (L336–344). O núcleo live **não** decide esses estados. |
| B | Interface recalcula decisão? | **Recalcula o cérebro operacional** sobre a janela (histórico V1 e D4A iguais). **Não** recalcula match/qualidade/apto do núcleo. |
| C | Adaptador reinterpreta regras? | **Só transporte + shape:** filtra por `apto_para_decisao`, converte ISO→minutos locais, `s`/`e`=null, default `quantidade\|\|1` (ressalva). Não cria score/foco/praça. |
| D | Duplicação núcleo × cérebro? | **Dois papéis, não duas verdades cognitivas:** núcleo = projeção viva; motor = cérebro da V1. Sem segundo motor no adaptador. |
| E | Payload transporta projeção ou reexecuta? | **Transporta projeção filtrada em shape NIGHT/rows** que vira **entrada** de uma execução do motor na interface — igual à janela JSON histórica. **Não** transporta Calmo/Ambiente/Foco pré-calculados. |

**G3 VERDE** (arquitetura honesta; ver ressalvas de preenchimento de quantidade).

---

## 6. GATE 4 — Soberania do adaptador

Varredura de `adaptador.js`:

| Proibição | Observado |
|---|---|
| decidir Calmo/Ambiente/Foco | **ausente** no payload |
| score / prioridade / confianca | **ausente** |
| escolher pedido / inferir praça | **ausente** |
| criar aptidão | usa `p.apto_para_decisao` do núcleo |
| remover conflito / suspect→complete | conflitos/suspects vão a `pedidos_excluidos` |
| inventar s/e | `s: null`, `e: null` explícitos |
| completar campo ausente | **exceção:** `quantidade: it.quantidade \|\| 1` e `observacao \|\| null` |

Teste `soberania` (`interface-adaptador.test.js`): varre JSON da janela por substrings. **Suficiente para chaves óbvias; contornável** se alguém renomear campos. O código em si não esconde decisões sob outros nomes — auditoria manual do arquivo confirma.

**G4 VERDE com ressalva** (default de quantidade; teste frágil).

---

## 7. GATE 5 — Freshness e stale

### Decisão auditada

> “Somente a fonte de **status** pode tornar a janela/`source_status` stale; comanda é estável por natureza.”

Código: `derivarEstadoFonte` filtra `snapshot.fontes` com `papeis.includes("status")` e usa `desconectada` / `vencida` / `atrasada` **só** dessas.

| Compatibilidade | Avaliação |
|---|---|
| `gate_staleness` do núcleo (Addendum §4) | **transportado sem recálculo** (`base.gate_staleness = snapshot.gate_staleness`) |
| Timestamps por fonte | preservados em `freshness` |
| Matriz núcleo: composição morta | núcleo **bloqueia decisão de composição**; adaptador **ainda pode** marcar `ready` se status vivo |
| UI usa `gate_staleness`? | **não** em `app-v1` — janela roda se `ready` + NIGHT |

### Matriz mínima pedida

| # | Caso | source_status | janela | Nota |
|---|---|---|---|---|
| 1 | Comanda antiga + status recente (cenário vencida invertido no demo) | depende | | Demo stale: status antigo + comanda recente → **stale**, janela null |
| 2 | Status antigo + comanda recente | **stale** | null | `fonte_vencida` / `fonte_atrasada` |
| 3 | Ambas antigas | stale se status morto | null | |
| 4 | Só comanda | ready se status ausente sem “vencida” | sem status apto costuma null | `evento_duplicado`: só comanda → ready, janela null, excluído |
| 5 | Só status | ready possível | parcial | |
| 6 | Comanda para de emitir | freshness comanda envelhece; **não** força stale sozinho | | **lacuna de rótulo** (ver ressalva) |
| 7 | Status para de emitir | **stale** / disconnected | null | |
| 8–10 | reimpressão / substituição / reconexão parcial | cobertos em testes 5, 16–17, 10/11 | | |

**Classificação da decisão de stale por papel:**  
**interpretação nova documentada e coerente com o papel temporal do status**, mas **precisa permanecer formalizada** no contrato de interface (já está em `D4A_Simulador_Interface_V0.md` §5).  
**Não bloqueante** para D4A: `freshness` por fonte e `gate_staleness` seguem no payload; risco residual se o Visual ignorar o gate.

**G5 VERDE com ressalva de formalização / uso do gate na UI.**

---

## 8. GATE 6 — Oito estados da fonte

| Estado | Entrada (código) | Janela | Último confiável | UI (`renderEstadoFonte` / motor) |
|---|---|---|---|---|
| initializing | `!snapshot` ou `inicializando` | não | não | texto “iniciando” |
| ready | default sem falha/replay e status ok | **sim** (se aptos) | n/a | motor se NIGHT>0; senão texto “pronta sem aptos” |
| replaying | `replayStatus.em_andamento` | não | sim (se snapshot) | aviso replay |
| stale | status `atrasada`/`vencida` | não | sim + aviso “dado antigo” | stale |
| disconnected | status `desconectada` | não | sim | desconectada |
| degraded | `degradedState` | não | sim | degradado + motivo |
| failed | `erro` (prioridade máxima) | não | não | erro |
| stopped | `parada` | não | não | parada |

**Demonstração HTTP** (`servir_d4a` + `?estado=`):

| estado query | status obtido | janela | ultimo_confiavel |
|---|---|---|---|
| initializing | initializing | false | false |
| replaying | replaying | false | true |
| stale | stale | false | true |
| disconnected | disconnected | false | true |
| degraded | degraded | false | true |
| failed | failed | false | false |
| stopped | stopped | false | false |

Nota: `?estado=` **força** flags no servidor de demo para initializing/failed/stopped/degraded/replaying; stale/disconnected também rodam cenários reais `CEN_DEMO`. A derivação honesta a partir do snapshot é coberta por testes unitários (`fonte_atrasada`, `fonte_vencida`, etc.). Não há estado “preso” no adaptador puro — cada payload é stateless.

**G6 VERDE** (demo vs. derivação real documentada).

---

## 9. GATE 7 — Ausência de dados

| Caso | source_status | Calmo inventado? |
|---|---|---|
| núcleo vazio (zero eventos) | ready, janela null | **não** — UI `renderEstadoFonte` (“pronta, sem aptos”) |
| initializing / failed / stopped | conforme | **não** |
| stale / disconnected | sem janela corrente | **não** — último confiável datado + aviso |
| payload inválido / fetch fail | failed | **não** |

`bootSimulador` exige `ready && janela && NIGHT.length > 0` para `rodarJanela` (motor). Caso contrário nunca entra em “Em fluxo”.

**G7 VERDE.**

---

## 10. GATE 8 — Pedidos excluídos e unknowns

Critério de janela (`montarJanela`): só `apto_para_decisao === true` **ou** cancelado com tempo histórico (`c`). Fora: `resumoExcluido` com match_state, completeness, motivos, fields_missing, apto.

| Tipo | Entra na janela? | Declarado? |
|---|---|---|
| conflict | não | excluidos + `unknowns.conflitos` |
| partial / unmatched | não | excluidos + `unknowns.parciais` |
| suspect / `comanda_sem_itens` | não | excluidos + `unknowns.suspeitos` |
| quarentena | n/a (não é pedido) | `unknowns.quarentena` |

**Lacuna de superfície UI:** com `ready` + NIGHT≥1, `app-v1` **não** renderiza faixa de excluidos/unknowns (só o motor). Payload **preserva** os dados. Mistura apto+vazia (prova independente): `night:1`, `excl` com `comanda_sem_itens`, UI path = `rodarJanela` → excluído **não** aparece na tela V1.

**G8 VERDE no contrato de payload; ressalva de perceptibilidade na UI ready.**

---

## 11. GATE 9 — F2-08 na D4A

| # | Caso | Resultado |
|---|---|---|
| 1–2 | vazia antes/depois status | suspect, apto false, **fora da janela** (teste 15) |
| 3–4 | duplicata / reimpressão | sem abrir aptidão indevida |
| 5–6 | replay / reinício | f208 núcleo + testes 13/14 |
| 7 | composição válida posterior | **entra** na janela (teste 16) |
| 8 | revogação → vazia | **sai** da janela (teste 17) |
| 9 | cancelamento | soberano (c no NIGHT; sem rows de cancelado) |
| 10 | vazias matched campanha | aptos 8567 (não 8602); núcleo intocado |

Nunca complete/apta na janela; `comanda_sem_itens` preservado em excluidos. **R2/R3 não corrigidos** (conforme pedido).

**G9 VERDE.**

---

## 12. GATE 10 — Vinte cenários (reexecução independente)

| # | Cenário | status | janela | decisão | notes |
|---|---|---|---|---|---|
| 1 | Operação normal | ready | 1 | motor sobre NIGHT | s/e null |
| 2 | Status antes comanda | ready | 1 | ok | |
| 3 | Comanda antes status | ready | 1 | ok | |
| 4 | Duplicidade | ready | null | — | 1 excluído parcial |
| 5 | Reimpressão | ready | 1 | ok | um pedido |
| 6 | Cancelamento | ready | 1 (c≠null) | motor vê cancelado | rows 0 |
| 7 | Conflito | ready | null | — | 3 excluidos conflict |
| 8 | Evento atrasado / stale | stale | null | bloqueada | freshness do núcleo |
| 9 | Fonte stale (vencida) | stale | null | bloqueada | |
| 10 | Desconexão (cenário fim reconectado) | ready | null* | *2 parciais no catálogo pós-reconexão | freshness status atualizada |
| 11 | Reconexão | ready | * | ver 10 | |
| 12 | Inválido quarentena | ready | 1 | ok | quarentena.total=1 |
| 13 | Reinício | ready | 1 | ok | snapshot_igual |
| 14 | Replay | ready / replaying | final 1 / mid null | | |
| 15 | Comanda vazia | ready | null | — | suspect visível |
| 16 | Composição posterior | ready | 1 | ok | |
| 17 | Revogação vazia | ready | null | — | suspect |
| 18 | Ausência total | ready | null | sem Calmo | |
| 19 | Flag desligada | current | n/a | bootAtual | fallback registrado |
| 20 | Flag inválida | current + flag_invalida | n/a | bootAtual + aviso | |

**G10 VERDE.**

---

## 13. GATE 11 — Testes

```text
node --test tests/live/*.test.js tests/live/simulator/*.test.js
```

| Métrica | Valor |
|---|---|
| Total | **173** |
| Pass | **173** |
| Fail / skip / todo | **0** |
| Duração | ~25,9 s |
| Anteriores (F2-08) | **151** ainda presentes |
| Novos | **22** = 7 (`interface-fonte`) + 15 (`interface-adaptador`) |
| Arquivos novos de teste | **2** (não 22) — a doc fala em **22 testes**, não 22 arquivos |

Diferença “22 novos” vs “2 arquivos”: **explicada** — contagem de casos `test()`, não de files.

Qualidade: cenários exercitam catálogo 3A + F2-08 + flag; soberania é fraca (substring) mas complementada por asserções de shape e exclusão. Não há testes de servidor HTTP automatizados nem browser E2E (smoke manual/API feito pelo revisor).

**G11 VERDE.**

---

## 14. GATE 12 — Campanha 30 dias

Reexecução independente (2×) em `7267c10`:

| Métrica | Valor |
|---|---|
| Pedidos | **9.298** |
| Eventos | **24.595** |
| Aceitos | **24.093** |
| Replays | **6/6** |
| Fronteira 23:00 | **9** |
| PII | **[]** |
| matched / aptos | **8602 / 8567** |
| `hash_campanha` | **`f5c27b872c3fe80079945c3512cfd0de4e520613f3001ebae53d4a27043bbf0d`** |
| Determinismo A=B | **sim** |

D4A **não** alterou fatos, aptidão, projeções, contagens, determinismo, replay nem F2-08 no núcleo (diff vazio em `src/live` exceto `interface/`).

**G12 VERDE.**

---

## 15. GATE 13 — Interface real (smoke limpo)

Servidor: `DELIVERYOS_LIVE_SOURCE=simulator node tools/live/interface/servir_d4a.js` → `:5180` (processo novo).

| Probe | Resultado |
|---|---|
| `GET /api/config` | `fonte=simulator` |
| `GET /api/fonte?cenario=fluxo_normal` | ready, NIGHT=1, rows=3, `meta.fonte=simulada`, s/e null |
| `?estado=*` (8 estados) | ver tabela G6 |
| `GET /app-v1/index.html` | 200 |
| `app.js` | contém `sintéticos`, `renderEstadoFonte`, `bootSimulador` |
| Flag `current` | config current; `/api/fonte` **409** |

Browser pixel-a-pixel completo **não** automatizado; caminho de boot e strings anti-Calmo inspecionados no código + API. Rótulo sintético no header quando `meta.fonte === "simulada"`.

**G13 VERDE** (smoke API + código; sem E2E browser full).

---

## 16. GATE 14 — Visual

Diff `app-v1/app.js`: apenas boot dual + `renderEstadoFonte` reutilizando `.estado.carregando` e `.sussurro`. Sem redesign tipográfico, navegação, layout ou identidade. Aceitável para estados técnicos e rótulo sintético.

**G14 VERDE.**

---

## 17. GATE 15 — Fonte current

- Código `bootAtual` preserva fetch de `v1_janela_real*.json` + seed.
- Sem dependência do simulador quando flag ≠ simulator.
- XLSX/janela ausente → mensagem de erro amigável (inalterada em espírito).
- `servir_v1.js` intocado; rollback natural.

**G15 VERDE** (equivalência lógica; janela real depende de artefato local pré-existente, limitação já documentada).

---

## 18. GATE 16 — Rollback

| Ação | Efeito verificado |
|---|---|
| Remover / `current` | fonte current (unit + HTTP 409 em `/api/fonte`) |
| `servir_v1` | `/api/config` falha → bootAtual |
| Reverter commit D4A | `git revert 7267c10` na branch D4A (não executado para não alterar Fable) — **viável** |
| `main` | **sem** `7267c10` |

**G16 VERDE.**

---

## 19. GATE 17 — Privacidade

- Cenários e IDs `SIM-*`.
- Campanha PII `[]`.
- Fixtures de teste sintéticas (`Item Sintetico …`).
- Sem telefone/endereço/nome real no diff D4A.

**G17 VERDE.**

---

## 20. GATE 18 — Documentação vs código

| Tópico | Avaliação |
|---|---|
| Arquitetura / flag / payload | **fiel** |
| Freshness status-only | **fiel** + interpretação formalizada |
| Estados + janela só em ready | **fiel** |
| “Unknowns na interface” | **incompleta** — payload sim; UI ready **não** lista excluidos |
| Rollback / F2-07 / R2 / R3 | **fiel** |
| 173 testes / hash campanha | **fiel** |

---

## 21. Pontos de atenção obrigatórios

1. **Adaptador:** transporta projeção filtrada em shape de **entrada** do motor — não decisão cognitiva pronta.  
2. **Execuções do motor:** **uma** por minuto de UI em `precomputar` (igual V1); núcleo live **não** é o motor.  
3. **Interface contradiz núcleo?** Pode **ignorar visualmente** excluidos em ready, mas **não** reabre aptidão nem muda match.  
4. **Stale por papel status:** seguro para não stale-ar toda comanda antiga; composição morta exige leitura de `freshness`/`gate` (Visual).  
5. **Ausência de composição invisível?** Parcialmente — se status vivo e há aptos, `source_status=ready`; composição degradada só em `freshness`.  
6. **Excluídos perceptíveis?** No **payload** sim; na **UI ready+janela** **não**.  
7. **Último confiável tempo demais?** Fora de ready, só referência datada; UI não o promove a corrente. Sem TTL de UI (ok D4A).  
8. **Regressão current?** Não no código; depende de JSON gerado local.  
9. **Testes:** majoritariamente **comportamento** de contrato; soberania fraca; sem HTTP suite.  
10. **Pronta para preceder Sprint Visual V2?** **Sim**, com ressalvas não bloqueantes acima.

---

## 22. Riscos

### Bloqueantes

**Nenhum.**

### Não bloqueantes

| ID | Risco | Classe |
|---|---|---|
| D4A-R1 | `quantidade \|\| 1` inventa default | backlog / correção pequena |
| D4A-R2 | Unknowns/excluidos não renderizados em ready+janela | **Sprint Visual** deve expor faixa de desconhecidos |
| D4A-R3 | `source_status` ignora composição-só morta | formalizado; UI deve ler `gate_staleness`/`freshness` |
| D4A-R4 | Teste de soberania por substring | endurecer se quiser |
| D4A-R5 | Demo `?estado=` força rótulos | ok se não usado como prova de produção |
| R2/R3 F2-08 | herdados | backlog (não corrigir na D4A) |
| F2-07 | índice dedup | fora do escopo D4A |

### Pendências (não bloqueiam veredito)

- Superfície Visual: unknowns + gate_staleness.  
- Opcional: remover default de quantidade.  
- Opcional: testes HTTP do `servir_d4a`.

---

## 23. Checklist de seções do entregável

1. Base: `e872f01`  
2. Hash final: `7267c10`  
3–4. Diff / arquivos: §2  
5. Isolamento: G1 VERDE  
6. Feature flag: G2 VERDE  
7–8. Arquitetura / autoridade: G3  
9. Freshness: G5  
10. Estados: G6  
11–13. Calmo / Ambiente / Foco: só motor; ausência ≠ Calmo  
14–15. Unknowns / excluídos: payload OK; UI ready parcial  
16–17. Replay / disconnect: G6/G10  
18. F2-08: G9  
19. 20 cenários: G10  
20. Suíte 173/173: G11  
21. Campanha hash idêntico: G12  
22–25. Interface / current / visual / rollback: G13–16  
26. Privacidade: G17  
27. Documentação: G18  
28–30. Riscos / pendências: §22  
31. Veredito: abaixo  

---

## 24. Veredito final

# **APROVADO PARA SPRINT VISUAL V2 COM RESSALVAS NÃO BLOQUEANTES**

Sprint Visual **não** iniciado. D4B **não** iniciado. Merge **não** feito. Implementação Fable **não** alterada por esta auditoria.
