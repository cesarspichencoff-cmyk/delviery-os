# Pacote Fable — Máquinas de Estado V0.9

> Transições autorizadas. **Proibidas** quando violam invariantes.  
> Auditoria: alterações sensíveis → AccessAuditRecord / IntegrationAudit (INT).

Legenda ator: **P** participante · **DS** · **AO** · **LE** · **Ç** César · **Own** owner · **Sys** sistema · **IA** (só sugere, não transiciona sozinha)

---

## 1. PracticeEvidence (obrigatório detalhado)

| Estado | Significado |
|---|---|
| capturada | Criada (1 linha factual) |
| aguardando_validacao | Na fila do escopo |
| em_revisao | Validador ou conflito DS/AO |
| aprovada | Pode alimentar Passaporte se não contestada |
| insuficiente | Sem fato; sem prejuízo à pessoa |
| rejeitada | Fora de escopo / inválida |
| contestada | Contestation aberta |
| suspensa | Uso consolidado bloqueado |
| corrigida | Nova versão factual |
| mantida | Contestação rejeitada com fundamento |
| arquivada | Fim de ciclo / retenção |

### Transições

| De | Para | Ator | Pré | Pós | Audit |
|---|---|---|---|---|---|
| — | capturada | DS/AO/LE | fato observado | — | opcional |
| capturada | aguardando_validacao | Sys/criador | — | human_review | — |
| aguardando_validacao | em_revisao | validador | escopo ok | — | — |
| em_revisao | aprovada \| insuficiente \| rejeitada \| devolvida* | validador | **I-12** se sensível | se aprovada: elegível Passport | sim se sensível |
| aprovada | contestada | P | própria | **I-02 I-18** suspende consolidação | sim |
| contestada | suspensa | Sys | — | não no Passport | sim |
| suspensa | corrigida \| mantida \| rejeitada (contestação) | LE/substituto/Ç | revisão | v1 rastreável | sim |
| * | arquivada | LE/Ç/retenção | — | — | sim |

\*devolvida pode voltar a capturada/aguardando após edição.

### Proibido
- aprovada → Passaporte se contestada/suspensa.  
- IA: aprovada final.  
- Mesma pessoa: capturada→aprovada sensível sozinha (**I-12**).  
- Rollback silencioso sem histórico.

### Eventos conceituais
`evidence.captured` · `evidence.validated` · `evidence.contested` · `evidence.corrected`

---

## 2. Contestation

`aberta` → `em_revisao` → `corrigida` | `mantida` | `rejeitada` → `arquivada`

| Ator | P abre · LE/substituto/Ç resolve |
| Pré abertura | ≤1 min; 1 linha objetiva |
| Pós | evidência suspensa até fim |
| Proibido | consolidar EV durante aberta/suspensa |

---

## 3. EvidenceValidation

`rascunho` → `registrada` (result: aprovada|devolvida|insuficiente|rejeitada)

Não confundir com PracticeEvidence. Uma EV pode ter N validações (histórico).

---

## 4. Competency (progresso da pessoa)

`nao_iniciada` → `k_ok` → `s_ok` → `b_ok` → `c_ok` (ou estados parciais set)

| Pré | prova correspondente aprovada e não contestada |
| Proibido | pular para c_ok só com conteúdo (**I-01**) |
| C | janela **parâmetro pendente** |
| Contestação | se EV base contestada, estágio fica `em_suspensao` |

---

## 5. Formation / Module / LearningActivity / ContentVersion

| Objeto | Estados principais |
|---|---|
| Formation | rascunho · em_validacao · aprovada · em_piloto · vigente · suspensa · arquivada |
| Activity | rascunho · aprovada · em_piloto · vigente · necessita_revisao · substituida · arquivada |
| ContentVersion | rascunho · em_validacao · aprovada · vigente · substituida · arquivada |

Transição a **vigente**: Own + Ç (se oficial) · **I-14** supersede.

Proibido: IA publica vigente.

---

## 6. Passport / PassportStep / DevelopmentFocus

| Objeto | Estados |
|---|---|
| Passport | ativo (sempre 1 por person_ref ativo) |
| PassportStep | pendente · em_curso · concluido · substituido |
| DevelopmentFocus | proposto · aprovado · ativo · concluido · arquivado |

Atualização Passaporte: só campos de EV **aprovada** não suspensa · **I-02 I-06**.

---

## 7. OperationalProtocol / ProtocolVersion / Canal B

ProtocolVersion:

`rascunho` → `em_validacao` → `provisorio_de_piloto` → `aprovado` → `vigente` → `suspenso` | `necessita_revisao` | `substituido` | `arquivado`

| Publicação Canal B | Só `vigente` ou `provisorio_de_piloto` com flag César + metadados completos |
| Proibido | P1/P6 plenos sem decisão; alterar motor (**I-08**) |
| Rollback | status suspenso + versão anterior auditável |

---

## 8. LearningProposal

`rascunho` → `em_revisao` → `necessita_evidencia` → `aprovado` | `rejeitado` → `em_producao` → `em_piloto` → `vigente` → …

---

## 9. PilotCycle / WeeklyPilotGate

| PilotCycle | planejado · ativo · pausado · concluido · abortado |
| WeeklyPilotGate | go · corrigir · pausar |

Transição **pausar**: critério PAUSAR (punição, privacidade, carga, disciplina, $ sem A, kit inventado…).

---

## 10. ContentRevisionRequest

`aberta` → `em_analise` → `resolvida` | `arquivada`  
(pode forçar conteúdo/protocolo → `necessita_revisao` / `suspenso`)

---

## 11. IntegrationReference (futuro)

`recebida` → `deduplicada` → `aguardando_revisao_humana` → `aceita` | `rejeitada` | `arquivada`

Proibido: auto `aceita` → regra / competência / Foco.

Replay: se já decidida → **noop** (idempotência).

---

## 12. Formação (progresso do participante na trilha)

`nao_inscrito` → `inscrito` → `em_andamento` → `nucleo_concluido_conteudo` → (competências separadas)

Conteúdo concluído **≠** formação “competente”.

---

## 13. Rollback e auditoria (regras gerais)

| Tipo | Rollback | Audit |
|---|---|---|
| Evidência | nova versão + link | sim se sensível |
| Conteúdo/protocolo | supersede | sim |
| Gate piloto | nova decisão semanal | sim |
| Competência | reabrir se EV base caindo | sim |

Transições que **ignoram** contestação ou I-01…I-25: **proibidas**.

---

*Máquinas de estado V0.9 · verificáveis em teste.*
