# Design Handoff — Copiloto Delivery (para Claude / implementação visual)

| Campo | Valor |
|---|---|
| Pacote design | `docs/copiloto-design/*` |
| Pacote inteligência | `docs/copiloto/*` + `src/copiloto/*` |
| Worktree | `deliveryos-grok-copiloto-intelligence` |
| Branch | `grok/copiloto-intelligence-pack` |
| Nome produto atual | DeliveryOS |
| Módulo futuro | Copiloto Delivery (TATÁ OS) — **sem rename na UI agora** |

---

## 1. Divisão de responsabilidade

| Camada | Dono | Não fazer |
|---|---|---|
| Regras, Foco, previsão, voz intents, fechamento | Inteligência (Grok pack) | UI recalcular |
| Hierarquia, jornadas, microcopy, mobile, voz UX | Este pacote design | inventar regra de Foco |
| Pixels, componentes, motion, integração final | Claude | violar contratos |

---

## 2. Ordem de leitura (Claude)

1. `docs/copiloto/HANDOFF_TO_CLAUDE.md`  
2. `DESIGN_STATE_MATRIX.md`  
3. `INFORMATION_HIERARCHY.md`  
4. `FLAGSHIP_JOURNEYS.md`  
5. `MICROCOPY_SYSTEM.md`  
6. `MOBILE_BEHAVIOR.md`  
7. `VOICE_AND_AUDIO_UX.md`  
8. `FAILURE_AND_UNCERTAINTY.md`  
9. `DESIGN_RED_TEAM.md`  
10. `USABILITY_TEST_PLAN.md`  
11. Schemas + mock scenarios  

---

## 3. O que já está decidido (não reabrir sem humano)

- Um Foco; Calmo / Ambiente / Foco  
- Confiança ≠ gravidade  
- Áudio normal ≤20s; briefing ≤45s; fechamento ≤120s / ≤3 perguntas  
- technical_state failed → sem prioridade inventada  
- Sem vigilância / ranking / emoção de voz  
- Payloads dos 30 cenários como verdade de estados  

---

## 4. O que o design **não** define

- Limiares numéricos e scores (`src/copiloto`)  
- Calibração com dados reais (`DATA_REQUEST_MANIFEST`)  
- Home genérica do TATÁ OS  
- Visual do TATÁ Seleção  

---

## 5. Comandos para o Claude

```bash
# no worktree isolado
npm run copiloto:mock          # http://localhost:5188
npm run copiloto:test          # regressão inteligência
# exemplos
# GET /v1/focus?scenario=4
# GET /v1/scenarios
# GET /v1/response/example
```

---

## 6. Mapa documento design → implementação

| Doc | Entrega de UI |
|---|---|
| STATE_MATRIX | estados e badges |
| HIERARCHY | layout L0–L5 |
| JOURNEYS | fluxos e QA |
| MICROCOPY | strings e tom |
| MOBILE | breakpoints e gestos |
| VOICE | mic, TTS, fechamento áudio |
| FAILURE | banners e empty |
| RED_TEAM | checklist pré-PR |
| USABILITY | validação com operação |

---

## 7. Necessidades de UI já listadas na inteligência (repetidas)

| Necessidade | Payload |
|---|---|
| Separar confiança e severidade | `focus.dimensions` |
| Foco puro | `recommended_action == null` |
| Áudio | `response.audio` |
| Técnico | `technical_state` |
| Fechamento | `closing.flow` + questions |

**Não editar** `app-v1/`, `prototipos/`, `motor.js`, `decisao.js` a partir de “atalhos” sem contrato.

---

## 8. Critérios de aceite de design (antes de merge visual)

- [ ] Consome mock/schemas sem campos inventados  
- [ ] Passa red team §3  
- [ ] Mobile J2 + J15 + J14  
- [ ] Failed honesto  
- [ ] Zero smell de dashboard no pico  
- [ ] Revisão humana do diff  

---

## 9. Riscos residuais

| Risco | Mitigação |
|---|---|
| Design “bonito” reintroduz cards | hierarchy + red team |
| Copy reescreve causa raiz | só apresentação; motor manda |
| Voz vira feature de gravação | privacy § voz |
| Calibração sintética na cara do operador | rótulo só em sombra/dev se preciso |

---

## 10. Veredito

Este pacote fecha a **frente de design de experiência** em forma de especificação consumível.  
Não substitui pixels do Claude; **impede** que pixels inventem cérebro.

**Próximo passo autorizado (quando humano mandar):** Claude implementa superfície contra mock + estes docs; Grok não altera interface oficial neste fluxo.
