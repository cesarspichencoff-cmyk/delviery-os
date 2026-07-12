# Auditoria de Integração L8 × Contrato DeliveryOS V0.9

> Para cada família de artefato L8: precisa de DOS? canal? objeto? PII? humano? offline? replay? stale? Calmo/Foco?  
> Classificação: independente · opcional · futura necessária · proibido · missão técnica.

---

## 1. Mapa por família L8

| Elemento L8 | Precisa DOS? | Contrato permite? | Canal | Objeto | PII? | Anon? | Humano? | Offline? | Replay dup? | Stale? | Calmo/Foco? | Classe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1/F2 microlições | Não | N/A | — | — | Não | — | owner | Sim | N/A | conteúdo versionar | Não | **independente** |
| Casos biblioteca | Não (origem histórica doc) | Sim se handoff futuro | A futuro | OperationalCase | Não | Sim | aprovar | Sim | se event_id | caso versionar | Não | **independente** agora; A opcional depois |
| P4/P5 cards | Não | B se publicar | B | ProtocolVersion | Não | — | César pub | consulta offline possible | — | **sim risco** | Não write | **opcional B** |
| P1 pausa | Observação live opcional | fato DOS soberano | A de adesão | EvidenceCandidate | Não | Sim | sim | DOS offline ≠ TE | dedupe | P1 stale | Não | **opcional** |
| P6 compensação | Não para tipos | $ não no motor | — | LearningProposal | $ cliente **proibido** | — | César $ | Sim treino | — | — | Não | **independente** treino; **missão técnica** se regra $ |
| P8 atraso / 5 critérios | Dados atraso opcional | sim leitura | A/D | Outcome obs | Não | Sim | sim | Sim | day_key 23h | — | Não | **opcional** |
| P10 comunicação | Amostra WA/DOS | sim com priv | A | EvidenceCandidate | cuidado chat | Sim | sim | — | double WA+DOS | — | Não | **opcional** |
| Passaporte | Não | DOS não escreve | C interno | Validation | pseudo | — | Val humano | Sim papel | N/A | — | **proibido** Foco | **independente** |
| Dossiê | Não | fora runtime | C | PracticeEvidence | sensível | pseudo | César | Sim | N/A | — | Não | **independente** / proibido DOS |
| M1–M10 | Parcial M1/M6 | D agregado | D | LearningOutcomeObservation | **nunca** rank | agregado | revisão | parcial | dedupe | — | Não feed live | **opcional D** |
| Piloto 30d | Não | — | — | — | — | — | LE | Sim papel | — | — | Não | **independente** |
| Brief visual | Não | — | — | — | — | — | César | — | — | — | Não | **independente** |
| Estado do pedido em treino | Útil | TE não escreve estado | futuro A | Fact ref | Não | Sim | — | — | — | — | Não cria Foco | **opcional futuro** |
| Protocolo → motor | Sim impacto | **proibido auto** | — | — | — | — | César+missão | — | — | — | risco decisão | **missão técnica** |
| Criar Foco por microlição | Sim indevido | **proibido** | — | — | — | — | — | — | — | — | **proibido** | **proibido** |
| 45/55/65 alerta DOS | Sim indevido | proibido L8/contrato espírito | — | — | — | — | — | — | — | — | risco Foco | **proibido** |

---

## 2. Incompatibilidades e gaps L8 ↔ Contrato

| Gap | Detalhe | Severidade | Ação na correção (futura) |
|---|---|---|---|
| G1 | L8 dossiê: acesso LE pendente vs César **negado full** nesta missão | Alta doc | Atualizar L8 + matriz INT se preciso |
| G2 | Protocolos L6B/L8 sem metadados full Canal B provisório | Média | Template owner/versão/valid/rollback |
| G3 | Passaporte sem contestação explícita (contrato tem ContestationRecord) | Média | Alinhar |
| G4 | Métricas L8 podem ser lidas como feed live | Média | Explicitar: nunca decisão live sem revisão |
| G5 | Envelope INT completo vs L8 “simples” | Baixa | Não forçar INT no piloto papel |
| G6 | PracticeEvidence vs “amostra chats” C-T03 | Média | Política de amostra |
| G7 | Publicação B no piloto sem `publishable_as_pilot` no L8 | Média | Adicionar regra na correção |
| G8 | Nenhuma incompatibilidade que **proíba** Onda 1 em papel | — | OK |

**Não há violação que obrigue reestruturar L8 inteira** — há desalinhamentos documentais e riscos de implementação futura.

---

## 3. Calmo / Ambiente / Foco

| Check | Resultado |
|---|---|
| L8 cria Foco? | **Não** |
| Contrato proíbe write? | **Sim** |
| Risco futuro “microlição → Foco” | Alto se Fable ignorar gate | Red team + testes aceitação |
| Briefing autorizado | Só contrato futuro | Não na Fase 1 conteúdo |

---

## 4. Offline, replay, 23h

| Tema | Contrato | L8 piloto | Gap |
|---|---|---|---|
| Offline | Soberanias independentes | Papel OK | Nenhum para Onda 1 |
| Replay | noop se decidido | N/A papel | INT futuro |
| ≥23h | day_key + flag | F1-M14 | OK conceitual |

---

## 5. Regra executável (decisão César)

```text
proposta técnica → missão → contrato executável → testes → campanha → auditoria → César
```

Nenhum P1–P12 L8 está autorizado a virar motor nesta fase.  
**Classificação universal de tradução P→código:** depende_missao_tecnica.

---

## 6. Veredito integração

| Item | Resultado |
|---|---|
| Onda 1 conteúdo | **Independente do DeliveryOS** |
| Canal B no piloto | **Opcional** com checklist César |
| Integração profunda | **Fora** do caminho crítico L8 |
| Violações graves atuais nos docs | **Nenhuma bloqueante** de piloto papel |
| Preparação Fable | Gate V0.9 + esta auditoria |

---

*Auditoria integração L8×Contrato V0.9 · soberanias preservadas.*
