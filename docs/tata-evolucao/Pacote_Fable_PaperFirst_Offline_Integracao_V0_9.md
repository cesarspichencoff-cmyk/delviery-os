# Pacote Fable — Paper-First, Offline e Integração V0.9

> Paridade papel×digital · offline conceitual · Canais A–D mapeados.  
> Fontes: Kit Papel V0.2 · Contrato INT V0.9 · Gate Integração.

---

## 1. Paridade paper-first (kit A–J → digital)

| Peça | Função papel | Entidade digital | Quem preenche | Valida | Destino | Retenção | Risco perda | Risco dup | Migração |
|---|---|---|---|---|---|---|---|---|---|
| **A** Micro | Estudar | MicroLesson / ContentVersion | Part | — | Formação | aprendizado_ativo | folha | — | import conteúdo |
| **B** Caso | Decidir | InteractiveCase | Part | — | Prática | idem | — | — | idem |
| **C** Sim | Role-play | Simulation | Facil. | Obs | Prática | idem | envelope | — | idem |
| **D** EV 1 linha | Registrar | PracticeEvidence | DS/AO/LE | Val | Fila val | competencia / audit | clip | ID manual | OCR/entry + event_id |
| **E** Contestação | Suspender | Contestation | Part | LE/sub | Grampado EV | audit | — | — | form 1 linha |
| **F** Passaporte | Próximo passo | Passport | LE/Sys | — | Part | competencia | extravio | — | conta usuário |
| **G** Mapa val | Escopo | ValidatorAssignment | Ç/LE | — | Pasta | vigente | desatualiza | — | config |
| **H** Folha semanal | Plano +/− | (Pilot plan + gate prep) | Facil. | — | Arquivo | operacional_curta | — | — | admin fraco V1 |
| **I** Aprendizado | P12/M10 | AggregatedLearning / LearningProposal | LE | Ç se pub | Pasta | aprendizado | — | tema | form tema |
| **J** Go/no-go | Gate | WeeklyPilotGate | LE/Ç | Ç | Arquivo | audit | — | — | form gate |

### Critérios de paridade digital (**não pior que papel**)

| Critério | Meta |
|---|---|
| Registro EV | ≤45 s |
| Abrir contestação | ≤1 min |
| Próximo passo | &lt;10 s |
| Redação longa | **proibida** obrigatória |
| Carga semanal | metas 32/60 preservadas |
| Campos extra vs papel | só se valor claro; senão não |

---

## 2. Offline e recuperação (requisitos futuros — sem tech)

| Requisito | Descrição |
|---|---|
| R-OFF-01 | Ler atividades já carregadas |
| R-OFF-02 | Registrar EV local |
| R-OFF-03 | Registrar contestação local |
| R-OFF-04 | Marcar operação **pending** vs **confirmed** |
| R-OFF-05 | Sync posterior idempotente |
| R-OFF-06 | Prevenir duplicidade (client_id / event_id) |
| R-OFF-07 | Conflito de sync → humano, não auto-merge sensível |
| R-OFF-08 | Auditoria preservada |
| R-OFF-09 | **Nenhum** dado perdido silenciosamente |
| R-OFF-10 | UI/papel mostra estado de sync |

Não implementar nesta missão.

---

## 3. Integração DOS × TE (mapa Canal A–D)

| Canal | Direção | Objetos TE | Owner | Permitido | Proibido | Humano | Idempotência | Offline | V1 |
|---|---|---|---|---|---|---|---|---|---|
| **A** | DOS→TE | IntegrationReference → EvidenceCandidate futuro | DOS fato; TE aprendizado | fato anon, tema, recorrência | PII, disciplina, ranking | sim antes caso/regra | event_id | outbox DOS | **opcional** |
| **B** | TE→DOS | ProtocolVersion consulta | TE | vigente/provisório meta | motor, decisão auto | sim pub | version_id | cache stale flag | **opcional** |
| **C** | TE interno | PracticeEvidence, Passport | TE | desenvolvimento | runtime DOS | validação | evidence_id | local pending | **core V1** |
| **D** | TE→análise | AggregatedLearningObservation | TE | agregado tema | ranking, feed live | revisão | period+metric | — | opcional |

### Reafirmações (**I-08 I-09 I-21**)

- Integração **opcional** na V1; **não** bloqueia Onda 1.  
- TE **não** escreve live / Calmo / Ambiente / Foco.  
- DOS **não** valida competência nem altera Passaporte.  
- Publicar protocolo ≠ regra executável.  
- Regra executável: missão técnica + testes + campanha + auditoria + César.

### Replay / dedupe
Mesmo `event_id` já decidido → noop.  
WA + DOS mesmo fato → correlation; não double-count.

---

## 4. Independência V1

| Capacidade | Requer DOS? |
|---|---|
| Formação, casos, sim, EV, val, contestação, Passaporte, gate piloto | **Não** |
| Consulta protocolo no runtime | Não (papel/PDF) |
| Canal A/B técnico | Não na V1 |

---

*Paper-first · offline · INT V0.9 mapeada.*
