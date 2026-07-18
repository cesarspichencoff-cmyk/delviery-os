# HANDOFF AO CLAUDE — Pacote de Inteligência do Copiloto Delivery

| Campo | Valor |
|---|---|
| Destinatário | Claude (design, UX, interface, integração final) |
| Remetente | Grok (inteligência operacional / cérebro) |
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-grok-copiloto-intelligence` |
| Branch | `grok/copiloto-intelligence-pack` |
| Base | `e299cbc` (linha D4A / live / testes) |
| Nome técnico atual | DeliveryOS (`deliveryos-core`) |
| Nome de produto atual | DeliveryOS |
| Módulo futuro | Copiloto Delivery |
| Ecossistema futuro | TATÁ OS |
| Renomeação | **NÃO executada** |

---

## 1. Visão final

O Copiloto observa automaticamente a operação de delivery, escolhe **uma** prioridade (Foco), explica com evidência, prevê 10/15/30 minutos, responde por voz/texto, recomenda ação possível, acompanha resultado e aprende num fechamento de até 2 minutos.

Princípio:

> O Copiloto não exige que a operação trabalhe para ele. Ele observa automaticamente e pergunta apenas o que os dados não conseguem explicar.

---

## 2. O que já foi decidido (não reinventar)

1. **Um Foco por vez** — não dashboard, não fila de alertas.
2. **Calmo / Ambiente / Foco** — herança do DeliveryOS (`Contrato_Estado_Cognitivo_V1.md`).
3. **Confiança ≠ gravidade** — confiança baixa não reduz severidade.
4. **Hipótese ≠ fato** — epistemic tags obrigatórias.
5. **Sem vigilância** — proibido ranking individual, emoção, sotaque, culpa automática.
6. **Playbook crítico** não auto-muta.
7. **Fechamento** 0–3 perguntas, ≤120s, com “não sei”/“pular”.
8. **Áudio** ≤20s no modo normal; conclusão primeiro.
9. **Modo sombra** antes de automatizar.
10. **Não editar** `motor.js`, `decisao.js`, `app-v1/*`, protótipos oficiais nesta integração sem contrato.

---

## 3. O que NÃO pode ser alterado sem autorização humana

- Regras de soberania do Foco (`sess.active.sit` no motor legado)
- Gramática visual aprovada do Copiloto / Campo Vivo
- Home do TATÁ OS
- TATÁ Seleção
- Banco/Supabase de produção
- Deploy
- Rename DeliveryOS → TATÁ OS no código

---

## 4. Arquitetura do pacote

```
src/copiloto/           # cérebro de referência (determinístico)
  config.js             # áreas, limiares, silêncio, foco
  canonical-model.js    # pedido + área canônicos
  baselines.js
  thresholds.js
  forecast.js
  anomalies.js
  focus-engine.js
  focus-stability.js
  response-contract.js
  voice-intents.js
  shift-briefing.js
  shift-closing.js
  shift-memory.js
  playbooks.js
  shadow-mode.js
  silence.js
  external-signals.js
  microcoaching.js
  metrics.js
  index.js

schemas/copiloto/       # JSON Schema
openapi/copiloto-openapi.yaml
mocks/copiloto/          # server + 30 fixtures
tests/copiloto/run.js
docs/copiloto/*         # este handoff + docs temáticos
reports/copiloto/       # backtest + qualidade
```

**Não substitui** `src/perfil-delivery/motor.js` nem `src/live/*`.  
É a camada de inteligência/contrato **acima** e **ao lado**, pronta para o Claude ligar na UI.

### Mapa de áreas (produto) ↔ praças (motor)

| Área produto | Praças motor |
|---|---|
| Sushi | combinados, duplas, enrolados |
| Quentes | enrolados_quentes, cozinha_quentes |
| Cozinha | cozinha_quentes |
| Conferência | sobremesa, bar_bebidas, montagem_outros + kind conferencia |
| Motoboy | kind saida / expedição |
| Caixa | ainda sem instrumentação confiável |

---

## 5. Estados técnicos

`healthy` | `degraded` | `failed`

- `failed` → encerra Foco operacional; não inventa prioridade
- `degraded` → reduz interrupção; marca needs_verification

---

## 6. APIs e payloads

- OpenAPI: `openapi/copiloto-openapi.yaml`
- Mock: `node mocks/copiloto/server.js` → `http://localhost:5188`
- Endpoints principais: `/v1/state`, `/v1/focus`, `/v1/areas`, `/v1/forecast`, `/v1/anomalies`, `/v1/briefing`, `/v1/closing`, `/v1/voice/intents`, `/v1/scenarios/:id`
- Schemas: `schemas/copiloto/*.json`

### Foco vivo (contrato)

Ver `schemas/copiloto/focus.schema.json`. Campos-chave:

`focus_id`, `status`, `area`, `title`, `summary`, `why_it_matters`, `evidence[]`, `affected_orders[]`, `severity`, `urgency`, `reach`, `confidence`, `dimensions`, `forecast`, `recommended_action`, `alternatives[]`, `responsible_role`, `follow_up`, `technical_state`, `needs_verification`.

### Resposta do Copiloto

`conclusion`, `evidence`, `impact`, `confidence`, `recommendation`, `limit_or_doubt`, `text_full`, `audio{spoken_text,max_seconds,screen_full_text}`.

Exemplo canônico Conferência: `GET /v1/response/example` ou cenário 04.

---

## 7. Textos — regras

- Conclusão direta primeiro
- Sem jargão abstrato, sem falsa precisão, sem alarmismo
- Números essenciais apenas
- Confiança alta é silenciosa; média/baixa pode sussurrar
- Nunca certeza inventada

---

## 8. Voz

Catálogo completo em `src/copiloto/voice-intents.js` e `docs/copiloto/VOICE.md`.
Match heurístico mock: `GET /v1/voice/match?q=...`

---

## 9. Fechamento e memória

- `docs/copiloto/SHIFT_CLOSING.md`
- `docs/copiloto/SHIFT_MEMORY.md`
- Cenários 25–27 e 30

---

## 10. Cenários (30)

`docs/copiloto/SCENARIOS.md` + `mocks/copiloto/fixtures/scenarios/*`

Use estes payloads como **fonte da verdade** de UI states — não invente estruturas paralelas.

---

## 11. Casos de erro

| Caso | Comportamento |
|---|---|
| Dado incompleto | `technical_failure` / degraded; sem Foco falso |
| Dado atrasado (stale) | idem |
| Conexão perdida | `technical_state=failed`; clear Foco |
| Fontes incompatíveis | anomalia técnica; não agir na operação |
| Confiança baixa + gravidade alta | mostra necessidade de verificação; silêncio pode ser discreto |
| Sem ação segura | Foco puro (só atenção, sem prescrição) |

---

## 12. Permissões

| Permissão | Uso |
|---|---|
| `operator_read` | estado, foco, previsão, voz de leitura |
| `operator_write_memory` | registrar apoio / equipamento |
| `leader_close_shift` | fechamento |

---

## 13. Critérios de aceitação (Claude)

1. UI consome contratos/schemas sem recalcular score de Foco.
2. Um Foco; não lista de alertas.
3. Confiança e gravidade renderizadas como dimensões separadas.
4. Áudio ≤20s no modo normal; texto completo na tela.
5. Fechamento ≤2 min; ≤3 perguntas; skip/não sei.
6. Estados técnicos cobertos (healthy/degraded/failed).
7. Todos os 30 cenários do mock renderizáveis.
8. Zero telemetria de emoção/voz biométrica.
9. Sem rename para TATÁ OS nesta integração.
10. Diff revisado por humano antes de merge.

---

## 14. Comandos

```bash
# a partir do worktree isolado
node mocks/copiloto/generate-fixtures.js
node tests/copiloto/run.js
node mocks/copiloto/server.js
# http://localhost:5188/v1/scenarios
# http://localhost:5188/v1/focus?scenario=4
```

Não requer `npm install` para o pacote copiloto (Node stdlib only).

---

## 15. Necessidades de UI (NÃO implementadas aqui)

Se a interface oficial precisar de mudanças:

| Necessidade | Contrato / payload | Ação Claude |
|---|---|---|
| Badge de confiança separada da severidade | `focus.dimensions` | exibir dimensões, não fundir cores |
| Foco puro sem ação | `recommended_action=null` + `summary` | layout foco puro já previsto no Contrato Cognitivo V1 |
| Áudio do Copiloto | `response.audio` | player/TTS; não ler UUID |
| Banner technical_state | `technical_state` | degraded/failed visual |
| Fechamento por voz | `closing.flow` + questions | wizard ≤2 min |

**Não editar** arquivos visuais do Claude a partir deste worktree de inteligência.

---

## 16. Limitações honestas

1. Brutos multi-mês **não** estão no worktree → baselines/backtest sintéticos calibrados.
2. Caixa sem instrumentação real.
3. Composição por praça em tempo real ainda parcial (motor B).
4. Previsão é de tendência de fila, não ETA de pedido individual de alta precisão.
5. NLU de voz no mock é heurística — produção precisará de ASR/NLU real.
6. Integração com `src/live` e `motor.step` é **contrato + adaptador futuro**, não plug-and-play UI.

---

## 17. Veredito para implementação

Claude **pode e deve** implementar a experiência usando este pacote **sem inventar regras de Foco, limiares, voz, fechamento ou memória**.

Qualquer lacuna: abrir pergunta humana; não preencher com criatividade de produto que viole as leis do DeliveryOS.
