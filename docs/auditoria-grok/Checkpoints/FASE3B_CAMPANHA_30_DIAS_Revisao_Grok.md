# Revisão Adversarial — Fase 3B · Campanha Sintética de 30 Dias

| Campo | Valor |
|---|---|
| Revisor | Grok (Red Team) |
| Branch Fable | `feature/preloja-fable` |
| Base | `c0b165c83d9e8bbfe54af243591c84f7551d3e35` (Fase 3A) |
| Commit Fable | `ced1892b7cdd277bcd25c6f32eef9b04365ad3fd` |
| Revisão 3A | `audit/preloja-grok` @ `ba4dcaf` |
| Branch auditoria | `audit/preloja-grok` |
| Escopo | **Somente** campanha 3B + F2-07/F2-08 |
| Data | 2026-07-12 |

**Fora de escopo:** D4A, visual, Epson, iFood real, Windows, reauditoria total do núcleo. **Sem correção de código nesta revisão.**

---

## 1. Veredito

### **CORRIGIR F2-08 ANTES DA D4A**

A campanha sintética **certifica o encanamento** na escala testada (determinismo, volume, replay, fronteira, privacidade, F2-07 linear).  

O achado **F2-08** — comanda `itens: []` casada com status → `matched` + `complete` + **`apto_para_decisao: true`** — **viola o sentido de F3-07** e pode alimentar decisão/UI incorreta. **Bloqueia D4A** até correção estreita em `src/live` + recertificação pontual.

**F2-07** não bloqueia D4A na escala de 30 dias, mas a alegação de que “reinício diário mitiga” **sem rotação do log** é **tecnicamente fraca** e deve ser corrigida na **documentação** (não no código desta missão).

---

## 2. Entrada e isolamento

| Check | Resultado |
|---|---|
| Branch / HEAD Fable | `feature/preloja-fable` @ `ced1892` |
| Base | `c0b165c` (ancestral imediato) |
| Árvore Fable | limpa, sincronizada com origin |
| `main` | **não** contém `ced1892` (fora da linha main) |
| Diff base→3B | 10 arquivos, **+1345** linhas (tools/simulator/campanha, testes, docs/preloja) |
| `src/live/**` | **diff vazio** |
| `motor.js` / `decisao.js` | **intocados** |
| `app-v1/**` | **intocado** |
| `package.json` / lock | **intocados** |
| `data/**` | **intocado** |

Únicas alterações auxiliares no motor 3A: export de `projecaoReconstruivel`; `eventoAlteracao` sintético em `eventos.js` (para caso F2-08 de composição posterior).

---

## 3. Testes executados

```text
node --test tests/live/*.test.js tests/live/simulator/*.test.js
```

| Campo | Valor |
|---|---|
| Hash sob teste | `ced1892b7cdd277bcd25c6f32eef9b04365ad3fd` |
| Total | **137** |
| Passes | **137** |
| Falhas | **0** |
| Duração | **~21,9 s** |
| Novas dependências npm | **nenhuma** |

Inclui: núcleo F2/F3 + simulador 3A + **campanha completa 2×** + unidades 3B + F2-08.

---

## 4. G1 — Campanha (reprodução)

Execução canônica refeita pelo revisor (`executarCampanha({})`):

| Métrica | Doc Fable | Reproduzido | OK |
|---|---:|---:|---|
| Dias | 30 | 30 | ✓ |
| Pedidos | 9.298 | **9.298** | ✓ |
| Alvo 8k–10k | sim | sim | ✓ |
| Eventos gerados | 24.595 | **24.595** | ✓ |
| Aceitos / log | 24.093 | **24.093** | ✓ |
| Duplicados | 448 | 448 | ✓ |
| Quarentena | 54 | 54 | ✓ |
| Fora janela 23h | 9 | 9 | ✓ |
| Reinícios / replay eq. | 6/6 | 6/6 | ✓ |
| Desconexões / reconexões | 2/2 | 2/2 | ✓ |
| Comandas vazias | 93 | 93 | ✓ |
| Divergências / falhas inesp. | 0/0 | 0/0 | ✓ |
| Matched / aptos | 8.602 / 8.602 | 8.602 / 8.602 | ✓ |

Perfis diários não uniformes: calmo/normal/alto/pico/pressao/fonte_instavel/recuperacao/invalidos_ampliado — **todos** presentes (testes).

**Conclusão G1:** totais documentados são **reproduzíveis** pelo código.

---

## 5. G2 — Determinismo

| Check | Evidência |
|---|---|
| Duas execuções → mesmo `hash_campanha` | teste `campanha-completa` 1/12 + 13 |
| Runtimes temp distintos, mesmo hash | teste 13 |
| Seed diferente → hash diferente e campanha válida | teste 14 (mini) |
| Sem `Math.random` / `Date.now` no canônico | PRNG mulberry32; `Date.now` só em `duracao_execucao_ms` (fora do hash) |
| Hash com chaves ordenadas | `stringifyCanonico` / `relatorio.js` |

---

## 6. G3 — Replay e `last_trusted_at`

| Check | Resultado |
|---|---|
| 6 reinícios, contextos distintos | ✓ (incl. durante desconexão) |
| `snapshot_igual` (projeção reconstruível) em todos | ✓ |
| Sem duplicação de fatos no log (linhas = fatos únicos) | ✓ |
| Quarentena re-semeada | contrato + testes 3A/3B |
| `last_trusted_at` conservador | **não** tratado como falha; não quebrou equivalência contratual nem impede recuperação |

---

## 7. G4 — Fronteira operacional

| Regra | Implementação | OK |
|---|---|---|
| Janela [11:00, 23:00) | `abre_local: 11:00`, `fecha_local: 23:00`; fluxo normal &lt; 23:00; fronteira `>= 23:00` | ✓ |
| `operational_day_key = local_date` | `localDayKey` + dia local no gerador | ✓ |
| America/Sao_Paulo | obrigatório na config; conversão `utcDeHorarioLocal` via IANA | ✓ |
| ≥23:00 não vai ao dia anterior | teste 8a: `localDayKey` = mesmo dia | ✓ |
| 9 eventos fronteira separados | 3 dias × 3; métricas `fora_janela` | ✓ |

---

## 8. G5 — Privacidade

| Check | Resultado |
|---|---|
| IDs `SIM-*` | ✓ |
| Allowlist de textos sintéticos | ✓ |
| Varredura `acharCampoProibido` nos gerados | ✓ |
| Runtime sem chaves proibidas | ✓ |
| Zero dado histórico real | ✓ (só sintético) |

---

## 9. F2-08 — Comanda com `itens: []` (bloqueante para D4A)

### 9.1 Reprodução (7 casos)

Seed `seed-f208-probe`, `America/Sao_Paulo`:

| Caso | match | completeness | apto | itens |
|---|---|---|---|---:|
| vazia → alteração com composição | unmatched* | partial | false | 1 |
| vazia permanece | unmatched | partial | **false** | 0 |
| vazia duplicada | unmatched | partial | false | 0 |
| **vazia após status** | **matched** | **complete** | **true** | **0** |
| **vazia antes de status** | **matched** | **complete** | **true** | **0** |
| vazia + cancelamento | matched | partial | false | 0 |
| **vazia + reinício + status** | **matched** | **complete** | **true** | **0** |

\*Após alteração com itens, o caso documentado espera composição aplicada; estado de match depende de status ausente no cenário — composição com 1 item confirmada.

### 9.2 Causa no contrato de qualidade

`src/live/qualidade.js` — `calcularQualidadeConsolidado`:

```text
temComanda = !!(pedido.comanda && Array.isArray(pedido.comanda.itens))
// [] é Array ⇒ temComanda === true mesmo com length 0
else if (temComanda && temStatus) completeness = "complete"
```

`src/live/consolidar.js`:

```text
apto_para_decisao = match_state === "matched"
  && !cancelado
  && completeness === "complete"
```

### 9.3 Respostas obrigatórias

| # | Resposta |
|---|---|
| 1. Viola contrato? | **Sim em espírito de F3-07** (“matched sem itens não completa” está nos testes para *status sem comanda*; aqui comanda **vazia** é tratada como composição presente). Completeness `complete` com 0 itens é **incorreto**. |
| 2. Distingue desconhecida / vazia / não recebida? | **Não.** `itens: []` e “ainda não chegou” colapsam: presença de array basta. |
| 3. Comanda vazia pode ser pedido real? | Em operação real, comanda impressa **sem linhas** é anomalia ou placeholder — **não** deve autorizar decisão de preparo/embalagem. |
| 4. Que decisões quando apta? | Qualquer consumidor de `apto_para_decisao` (futuro motor/UI) trata como pedido **completo e casado**. Campanha **não** chama `motor.js`, mas o **gate já está errado**. |
| 5. Foco/Ambiente/alerta? | Motor não executado na 3B; risco **latente** para D4A e fonte real. |
| 6. Esconde desconhecidos? | **Sim** — `fields_missing` não lista itens quando array vazio; parece “sei a composição e está vazia e completa”. |
| 7. Replay preserva? | **Sim** — caso com reinício permanece complete/apto. |
| 8. Cancelamento? | Cancela corretamente; `apto` false. |
| 9. Correção só em qualidade.js? | **Sim, se** `itens.length === 0` impedir `complete` (partial/suspect + warning). Casos legítimos de “ainda sem comanda” já usam ausência de comanda, não array vazio. |
| 10. Menor correção segura | Em `calcularQualidadeConsolidado`: exigir `pedido.comanda.itens.length > 0` para `temComanda` efetivo **ou** ramo explícito `length===0 ⇒ partial` + `fields_missing: ["itens"]` + warning `comanda_sem_itens`. Recertificar testes F2-08 e campanha. |

### 9.4 Classificação F2-08

**bloqueia D4A** (e bloqueia confiança em fonte real de comanda até corrigir).

Não é “limitação aceitável” se a interface for consumir `apto_para_decisao`.

---

## 10. F2-07 — Índice de deduplicação

### 10.1 Quantitativo (campanha canônica)

| Ponto | Valor |
|---|---:|
| Início (fim dia 1) | 530 chaves de fato |
| Meio (dia 15) | 12.067 |
| Fim (dia 30) | **24.093** |
| Eventos processados | 24.595 |
| Razão fato/aceite | **1,0** |
| Event_ids sessão final | 24.093 (= log completo) |
| Limpeza/expiração no núcleo | **false** |
| Crescimento | monotônico linear ∝ fatos aceitos |

### 10.2 Respostas obrigatórias

| # | Resposta |
|---|---|
| 1. Proporcional a fatos aceitos? | **Sim** (1:1) |
| 2. Reiniciar reduz índice? | **Só a sessão de event_ids até o replay**; após `reconstruirDoLog`, o índice **renasce com todos os fatos do log**. Chaves de fato acumuladas **não encolhem**. |
| 3. Replay reconstrói chaves históricas? | **Sim** |
| 4. “Reinício diário” é mitigação? | **Não, se o log diário acumula sem rotação.** Reinício + replay de log de 30 dias reconstrói ~24k chaves. Mitigação real exige **rotação/truncamento de log** ou expiração de índice — **não implementada**. |
| 5. Depende de rotação do log? | **Sim**, para limitar memória de longo prazo |
| 6. Retenção implementada? | **Não** |
| 7. Risco em 30 dias? | **Baixo** (~24k chaves, linear, estável no processo de teste) |
| 8. Risco em 6 meses? | **Moderado** se log único contínuo (ordem de centenas de milhares de chaves) |
| 9. Anos contínuos? | **Alto** sem política de retenção |
| 10. Bloqueia? | **Não bloqueia D4A** na evidência de 30 dias; **política futura obrigatória** antes de persistência prolongada / fonte real multi-mês sem rotação |

### 10.3 Classificação F2-07

**aceitável com política futura obrigatória**

### 10.4 Correção documental (sem código)

A frase em `executor.js` / doc 3B:

> “mitigável por reinício diário (F7)”

deve ser lida como **insuficiente**. Substituição correta:

> Crescimento linear aceitável na escala de 30 dias; reinício **sem** rotação do log **não** limita o índice reconstruído. Política de retenção/rotação é **obrigatória** antes de operação prolongada.

---

## 11. Bug de clock skew no gerador

| Check | Resultado |
|---|---|
| Guarda F2-03 no núcleo | Intacta (testes F2-03 verdes) |
| Correção no gerador | Comentário e regra: `captured_at` = minuto de emissão, nunca à frente da injeção (`gerador.js`) |
| Evidência removida para “verde”? | **Não** — campanha reexecutada; métricas batem com código atual |
| Hashes da versão corrigida | Totais canônicos reproduzíveis acima |

---

## 12. Certificação da campanha vs D4A

| Dimensão | Status |
|---|---|
| Escala / determinismo / replay / fronteira / PII | **Certifica encanamento** |
| Motor de decisão / qualidade operacional | **Não** (sintético, motor não chamado) — correto e declarado |
| Pronto para D4A (UI consumindo snapshot)? | **Não**, enquanto F2-08 marcar vazios como aptos |

---

## 13. Correção mínima exigida (escopo futuro autorizado)

1. **Código (src/live/qualidade.js, possivelmente consolidar):** `itens.length === 0` ⇒ não `complete`; não `apto_para_decisao`.  
2. **Testes:** F2-08 deve **falhar** o estado atual apto e passar após correção.  
3. **Recertificação:** reexecutar suite live + campanha 3B (ou mini-campanha + F2-08).  
4. **Docs Fable:** ajustar mitigação F2-07 (reinício ≠ retenção).

Não expandir escopo para expiração de dedup nesta correção.

---

## 14. Evidências-chave

| Tema | Local |
|---|---|
| Completeness vazia | `src/live/qualidade.js` L59–79 |
| apto_para_decisao | `src/live/consolidar.js` L599–600 |
| Casos F2-08 | `tools/live/simulator/campanha/f208.js` |
| Contagem F2-07 | `tools/live/simulator/campanha/executor.js` L81–83, L154, L299–314 |
| Doc campanha | `docs/preloja/Campanha_Sintetica_30_Dias_V0.md` |
| Testes | `tests/live/simulator/campanha-*.test.js` |

---

*Revisão adversarial Fase 3B · documentação apenas · Fable intocado pelo revisor.*
