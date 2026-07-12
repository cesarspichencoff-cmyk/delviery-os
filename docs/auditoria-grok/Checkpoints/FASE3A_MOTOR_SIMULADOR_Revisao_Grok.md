# Revisão Adversarial — Fase 3A · Motor Determinístico do Simulador

| Campo | Valor |
|---|---|
| Revisor | Grok (Red Team) |
| Branch Fable | `feature/preloja-fable` |
| Base | `b4baf129e973b623d1a2c5ae58685b0621958884` |
| Commit Fable | `c0b165c83d9e8bbfe54af243591c84f7551d3e35` |
| Branch auditoria | `audit/preloja-grok` |
| Escopo | **Somente** motor do simulador (Fase 3A) |
| Data da revisão | 2026-07-12 |

**Fora de escopo (não reauditado):** núcleo live completo, visual, interface, Epson, iFood real, Windows, embalagens. **Sem correções de código. Sem início da Fase 3B.**

---

## 1. Veredito

### **APROVADO PARA FASE 3B COM RESSALVAS NÃO BLOQUEANTES**

O motor determinístico do simulador está **apto a sustentar a campanha sintética da Fase 3B**, desde que as ressalvas da §8 sejam medidas e interpretadas na campanha — **não** exigem correção de `src/live` nem do simulador antes de 3B.

---

## 2. Diff e isolamento

### 2.1 Arquivos tocados em `c0b165c` (único commit desde a base)

```
docs/preloja/Simulador_Operacao_Viva_V0.md
tests/live/simulator/{cenarios,config,determinismo,pii}.test.js
tools/live/simulator/{aleatorio,cenarios,eventos,executor,identificadores,relatorio,relogio}.js
```

**12 arquivos · +1142 linhas · apenas docs + tools/simulator + tests/simulator.**

### 2.2 Isolamento confirmado

| Alvo | Status |
|---|---|
| `src/live/**` | **intocado** no diff base→c0b165c |
| `src/perfil-delivery/motor.js` | **intocado** |
| `src/perfil-delivery/decisao.js` | **intocado** |
| `app-v1/**` | **intocado** |
| `package.json` / lock | **intocados** |
| `data/**` (histórico/seed) | **intocado** |
| `main` | **não** avança com este commit (Fable paralelo) |

O executor **consome** o núcleo pela API pública (`criarNucleo` / `receber` / `snapshot` / `reconstruirDoLog`) sem patch.

---

## 3. Determinismo

### 3.1 Contrato observado

Mesma combinação de **cenário + seed + configuração (`storeTimeZone`/freshness) + horário inicial do cenário** produz:

| Resultado | Evidência |
|---|---|
| Mesmos eventos (ordem, ids, timestamps, payloads) | `tests/live/simulator/determinismo.test.js` #1 |
| Mesmos timestamps simulados | relógio `criarRelogioSimulado`; #4 |
| Snapshot reconstruível comparável no reinício | `projecaoReconstruivel` + hash; cenário `reinicio_e_replay` #20 |
| Mesmo `snapshot_hash` e `hash_resultado` | #2, #21 |

### 3.2 Independências verificadas

| Dependência indesejada | Mitigação | Status |
|---|---|---|
| Relógio real | `agora` injetado; `Date.now()` só em `duracao_execucao_ms` (fora do hash) | OK |
| Caminho temporário | `runtime_root` volátil; fora do hash; #21 | OK |
| Duração real | excluída de `CAMPOS_VOLATEIS_RELATORIO` | OK |
| Ordenação acidental de objetos | `ordenarChaves` recursivo antes do SHA-256 | OK |
| Ambiente da máquina | PRNG mulberry32 + FNV-1a; IDs sequenciais `SIM-*`; sem `Math.random()` | OK |
| Fuso silencioso | `storeTimeZone` obrigatório e IANA-validado (`store_time_zone_obrigatorio` / `_invalido`) | OK |
| Seed implícita | `seed_obrigatoria` | OK |

### 3.3 Núcleo de hash

`tools/live/simulator/relatorio.js`: material canônico **exclui** `duracao_execucao_ms`, `runtime_root`, `hash_resultado`. Todo carimbo no material vem do mundo simulado.

---

## 4. Privacidade

| Controle | Evidência |
|---|---|
| IDs sintéticos `SIM-EVENT-` / `SIM-IFOOD-` / `SIM-INTERNO-` / `SIM-JOB-` | `identificadores.js` + teste 7b |
| Textos livres só da allowlist | `OBSERVACOES_SINTETICAS`, `NOMES_ITENS_SINTETICOS` |
| Campos proibidos de PII nos eventos | varredura `acharCampoProibido` em todos os cenários (teste 7) |
| PII no runtime em disco | varredura de chaves proibidas no temp de cada cenário (teste 8) |
| Dados históricos reais reutilizados | **não** — catálogo 100% sintético; `data/**` intocado |

Nenhum bloqueio de privacidade.

---

## 5. Catálogo de 12 cenários

| # | ID | Condição distinta | Redundância? |
|---|---|---|---|
| 1 | `fluxo_normal` | Happy path até `pronto`, gate aberto | — |
| 2 | `status_antes_comanda` | Ordem invertida status→comanda | Distinta de 1 e 3 |
| 3 | `comanda_antes_status` | Ordem comanda→status (sem progresso a pronto) | Distinta de 1 (escopo menor, ordem) |
| 4 | `evento_duplicado` | Mesma observação 2×; log aceito = 1 linha | Dedup |
| 5 | `reimpressao` | Via extra, sem segundo pedido | Reimpressão |
| 6 | `cancelamento` | Histórico + cancelado | Cancel |
| 7 | `identificador_em_conflict` | Colisão de curto no dia | Conflict |
| 8 | `fonte_atrasada` | Freshness `atrasada` + gate fecha | Staleness L1 |
| 9 | `fonte_vencida` | Freshness `vencida` + motivo de gate | Staleness L2 |
| 10 | `desconexao_reconexao` | Evento de desconexão + vida posterior | Conectividade |
| 11 | `evento_invalido_quarentena` | Schema inválido; fluxo segue | Quarentena |
| 12 | `reinicio_e_replay` | Restart mid-flight + continuidade | Persistência/replay |

**Conclusão:** cada cenário exercita uma **condição arquitetural distinta**. `comanda_antes_status` e `fluxo_normal` se sobrepõem parcialmente no casamento, mas o segundo valida progressão de coluna e gate; o primeiro isola ordem. Aceitável para 3A. **Não** cobrem volume multi-dia nem F2-07/F2-08 — deliberado e documentado pelo Fable.

---

## 6. Replay, reinício e `last_trusted_at`

### 6.1 Comportamento observado

1. `reconstruirDoLog` cria núcleo novo e reprocessa o log com `persistir: false` (`src/live/reconstruir.js`).
2. `last_trusted_at` **não** é campo persistido: é derivado na chegada (`nucleo.atualizarFonte`) quando  
   `0 ≤ (agora − captured_at) ≤ freshness.atrasadaAposMs` (padrão 90s).
3. No cenário `reinicio_e_replay`, **imediatamente após o reinício** (relógio em T+120s):

| Fonte | `ultimo_evento_em` | `last_trusted_at` pós-replay | `freshness_state` |
|---|---|---|---|
| `sim_comanda` (evento T+0) | reconstruído | **`null`** (idade 120s > 90s) | `atrasada` (por idade de `ultimo_evento_em`) |
| `sim_status` (evento T+60) | reconstruído | **preenchido** (idade 60s ≤ 90s) | `atualizada` |

4. O executor compara snapshots via `projecaoReconstruivel`, que **zera** `last_trusted_at` / `ultima_atualizacao_confiavel` / `recepcao` / `reconstruido_em` — alinhado ao Contrato §17 (escopos de sessão vs projeção reconstruível), com a ressalva de que o Fable documenta o achado explicitamente em `Simulador_Operacao_Viva_V0.md` §7 e em comentário de `executor.js`.

### 6.2 Classificação adversarial

**Classificação: aceitável com ressalva para a Fase 3B**  
(mais próximo de *correto e conservador* do que de distorção bloqueante)

| Critério | Avaliação |
|---|---|
| Contrato existente | §17 e freshness: confiança temporal **não** inventada; fatos e `ultimo_evento_em` sobrevivem |
| Snapshot reconstruível | Pedidos/correlação/log iguais; `replay.snapshot_igual === true` no teste #20 |
| Impacto em freshness de **gate** | Gate usa `freshness_state` derivado de **idade de `ultimo_evento_em`**, não de `last_trusted_at` — continua coerente pós-replay |
| Impacto em métricas 3B | Se a campanha medir continuidade de `last_trusted_at` across reinícios programados, esperará **null ou parcial** até evidência ainda “fresca” no relógio simulado — **não** tratar como falha de campanha |
| Queda e recuperação | Cenário 10 + 12 cobrem o encanamento; conservadorismo evita “confiança fantasma” pós-queda longa |
| Risco de reconstruir confiança indevida | **Baixo** — o desenho prefere sub-confiar a super-confiar |

**Não** classificado como “corrigir antes da campanha”: alterar o núcleo para re-hidratar `last_trusted_at` do histórico exigiria mudança autorizada em `src/live` e poderia **aumentar** risco de confiança indevida se mal calibrada. Preferência arquitetural ≠ bloqueio.

---

## 7. Preparação para Fase 3B

O motor **suporta arquiteturalmente** (API + determinismo + reinício + cenários unitários) o futuro exercício de:

| Capacidade 3B | Suporte 3A |
|---|---|
| Milhares de eventos | Estrutura OK; **volume não medido** (F2-07) |
| Múltiplos dias | Relógio + `localDayKey` OK; **sem cenário multi-dia no catálogo** |
| Reinícios programados | `passo.reiniciar` + `reconstruirDoLog` |
| Queda e reconexão | `desconexao_reconexao` |
| Fora de ordem | status↔comanda |
| Duplicação | `evento_duplicado` |
| Conflitos | `identificador_em_conflict` |
| Cancelamentos / reimpressões | cenários dedicados |
| Eventos inválidos | quarentena |
| Comparação por seed | `hash_resultado` / `snapshot_hash` |

Não se exige que campanha de 30 dias já exista na 3A — **não existe**, e isso está correto.

---

## 8. Riscos F2-07 e F2-08

| Risco | Descrição | Exercitado na 3A? | Medível na 3B sem correção prévia? |
|---|---|---|---|
| **F2-07** | Crescimento do índice de dedup (`Map` em memória por sessão) | **Não** | **Sim** — cenário de volume + métrica de tamanho/memória/tempo; teto é decisão de produto posterior |
| **F2-08** | Comanda com `itens: []` aceita como parcial não-apta | **Não** | **Sim** — um evento sintético com `itens: []` via API pública; medir `completeness` / `apto_para_decisao` |

Ambos podem (e devem) ser **medidos** na 3B **sem** correção de código prévia. Corrigir só se a campanha provar impacto inaceitável.

---

## 9. Testes executados

```text
node --test tests/live/*.test.js tests/live/simulator/*.test.js
```

| Campo | Valor |
|---|---|
| Hash sob teste | `c0b165c83d9e8bbfe54af243591c84f7551d3e35` |
| Total | **117** |
| Passes | **117** |
| Falhas | **0** |
| Duração | **~581 ms** |
| Dependências instaladas | **nenhuma** (`node:test` nativo) |

Cobertura: ~92 testes do núcleo (Fases 2/2.1, regressão) + **25** do simulador (3A).

---

## 10. Ressalvas não bloqueantes (para a 3B)

1. **`last_trusted_at` pós-reinício** — conservador/parcial; interpretar métricas de confiança temporal com esse contrato (§6).  
2. **F2-07** — incluir volume na campanha e registrar crescimento do índice de dedup.  
3. **F2-08** — incluir comanda `itens: []` na campanha.  
4. **Catálogo 3A é mínimo** — multi-dia, pico e “milhares de eventos” são trabalho da 3B, não gap de motor.  
5. **Dual-coder / campanha** — o simulador prova **encanamento**, não qualidade operacional do motor de decisão (regra da Fase 1 reafirmada pelo Fable).

Nenhuma ressalva exige `CORRIGIR ANTES DA FASE 3B`.

---

## 11. O que esta revisão **não** autoriza

- Iniciar a Fase 3B automaticamente (só a **prontidão do motor**).  
- Alterar `src/live` para re-hidratar `last_trusted_at`.  
- Tratar sintético como prova de operação real.  
- Expandir escopo (UI, Epson, iFood real, embalagens).

---

## 12. Evidências-chave (arquivo / trecho)

| Tema | Local |
|---|---|
| Executor + projeção reconstruível | `tools/live/simulator/executor.js` L36–56, L102–116 |
| Hash canônico / voláteis | `tools/live/simulator/relatorio.js` L13–39, L89–94 |
| Relógio simulado | `tools/live/simulator/relogio.js` |
| PRNG seed | `tools/live/simulator/aleatorio.js` |
| Catálogo 12 cenários | `tools/live/simulator/cenarios.js` |
| PII / allowlist | `tools/live/simulator/identificadores.js`, `eventos.js` |
| `last_trusted_at` no núcleo | `src/live/nucleo.js` L98–105 |
| Replay sem re-persistir | `src/live/reconstruir.js` |
| Doc Fable do achado | `docs/preloja/Simulador_Operacao_Viva_V0.md` §7–8 |
| Contrato §17 | `docs/preloja/Contrato_Nucleo_Fonte_Viva_V0.md` |

---

*Revisão adversarial Fase 3A · documentação apenas em `audit/preloja-grok` · código Fable intocado pelo revisor.*
