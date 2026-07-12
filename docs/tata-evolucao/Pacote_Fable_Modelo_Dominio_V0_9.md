# Pacote Fable — Modelo de Domínio V0.9

> Entidades conceituais. **Sem** SQL, TypeScript, JSON Schema ou código.  
> Proprietário default: **TATÁ Evolução (TE)**, salvo nota.  
> Detalhe de integração: Contrato INT V0.9.

---

## 1. Relações (visão)

```text
Role ──► Track ──► Formation ──► Module ──► LearningActivity
                      │              │            ├── MicroLesson
                      │              │            ├── InteractiveCase
                      │              │            └── Simulation
                      ▼              ▼
                 Competency ◄── CompetencyRequirement (K/S/B/C)
                      ▲
         PracticeEvidence ──► EvidenceValidation
                      │
                 Contestation (suspende consolidação)
                      │
                 Passport ◄── PassportStep / DevelopmentFocus

OperationalProtocol ──► ProtocolVersion (só vigente publicável)
ContentVersion ──► refs Protocol / Competency / Formation
LearningProposal ──► ContentVersion | ProtocolVersion

PilotCycle ──► WeeklyPilotGate
ValidatorAssignment ──► Role × CompetencyType
AccessAuditRecord ──► qualquer ato sensível
IntegrationReference ──► ref opaca a DOS (sem soberania)
AggregatedLearningObservation ──► métricas tema (sem ranking)
ContentRevisionRequest ──► conteúdo/protocolo em conflito
PersonReference ──► pseudo (exceção; não padrão em processo)
```

**Owner de relacionamento:** TE para objetos de formação; DOS para OperationalFact (fora do core V1 TE, só IntegrationReference futura).

---

## 2. Entidades (28)

Convenção de campos: **obrigatórios** · *opcionais* · **proibidos** em comum: PII cliente, disciplina auto, ranking, personalidade, valor $ inventado.

### 2.1 PersonReference
| | |
|---|---|
| Propósito | Referência **pseudônima** a participante |
| Owner | TE |
| Obrigatórios | person_ref_id · privacy_class · status |
| Opcionais | role_ids |
| Proibidos | CPF, telefone, endereço, nome se evitável em exports |
| Estados | ativo · arquivado |
| Contestação | N/A (pessoa contesta **evidências**) |
| Cria / encerra | Onboarding / desligamento operacional do TE |

### 2.2 Role
| | |
|---|---|
| Propósito | Função operacional (DJ, DP, DS, CX, SAC, AO, LE, PL…) |
| Obrigatórios | role_id · name · track_id |
| Relações | Track · ValidatorAssignment |

### 2.3 Track
| | |
|---|---|
| Propósito | Trilha por função (TR-DJ…) |
| Obrigatórios | track_id · role_id · onda (1\|2) · formation_ids[] |
| Relações | Formations · Competencies |
| Nota | **Não** promoção automática |

### 2.4 Formation
| | |
|---|---|
| Propósito | F1–F4 |
| Obrigatórios | formation_id · name · onda · status · owner · version |
| Estados | ver máquinas |
| V1 | F1+F2; F3/F4 bloqueadas |

### 2.5 Module
| | |
|---|---|
| Propósito | Agrupa atividades de uma formação |
| Obrigatórios | module_id · formation_id · order · title |

### 2.6 LearningActivity
| | |
|---|---|
| Propósito | Unidade de aprendizado |
| Obrigatórios | activity_id · type (micro\|case\|sim) · duration_min · competency_ids[] · status |
| Relações | MicroLesson \| InteractiveCase \| Simulation |

### 2.7 MicroLesson
| | |
|---|---|
| Propósito | Micro 5–6 min |
| Obrigatórios | activity_id · principle · decision_options · application_prompt |
| Fonte protótipo | MICRO-01..03 V0.2 |

### 2.8 InteractiveCase
| | |
|---|---|
| Propósito | Caso com opções plausíveis |
| Obrigatórios | activity_id · context · options[] · recommended · partial_ok · observable_behavior |

### 2.9 Simulation
| | |
|---|---|
| Propósito | Role-play com tempo cap |
| Obrigatórios | activity_id · roles[] · triggers[] · duration_total_min · debrief_min |

### 2.10 Competency
| | |
|---|---|
| Propósito | Competência observável |
| Obrigatórios | competency_id · situation · observable_behavior · critical_error · validator_scope |
| Proibidos | “maturidade”, “atitude” sem ato |
| Relações | CompetencyRequirement · PracticeEvidence |

### 2.11 CompetencyRequirement
| | |
|---|---|
| Propósito | Exige K/S/B/C |
| Obrigatórios | competency_id · proof_type · min_evidence · validator_role |
| Opcionais | consistency_window (**pendente César** se C) |

### 2.12 PracticeEvidence
| | |
|---|---|
| Propósito | Fato observado de prática |
| Obrigatórios | evidence_id · person_ref · competency_id · situation · **observed_fact** · source · created_by · status · created_at |
| Proibidos | interpretação de personalidade |
| Contestação | **Sim** |
| Canal | C (não runtime DOS) |

### 2.13 EvidenceValidation
| | |
|---|---|
| Propósito | Ato de validar (≠ evidência) |
| Obrigatórios | validation_id · evidence_id · validator_role · result · at |
| Resultados | aprovada · devolvida · insuficiente · rejeitada |

### 2.14 Contestation
| | |
|---|---|
| Propósito | Suspender consolidação |
| Obrigatórios | contestation_id · evidence_id · raised_by · objective_point · status · at |
| Estados | aberta · em_revisao · corrigida · mantida · rejeitada · arquivada |

### 2.15 Passport
| | |
|---|---|
| Propósito | Visão do participante |
| Obrigatórios | person_ref · trilha_atual · proximo_passo · competencias_demonstradas · evidencia_necessaria · validador_possivel · foco · status_contestacao |
| Proibidos | ranking, score, prontidão promoção, disciplina |

### 2.16 PassportStep
| | |
|---|---|
| Propósito | Próximo passo com ação |
| Obrigatórios | step_id · action · competency_or_activity_ref · **I-15** |

### 2.17 DevelopmentFocus
| | |
|---|---|
| Propósito | Um foco aprovado |
| Obrigatórios | focus_id · person_ref · text · approved_by · status |

### 2.18 ValidatorAssignment
| | |
|---|---|
| Propósito | Quem valida o quê |
| Obrigatórios | role_validator · competency_scope · substitute_role · conflict_resolver |
| Fonte | Mapa_Validadores V0.2 |

### 2.19 OperationalProtocol
| | |
|---|---|
| Propósito | P1–P12 família |
| Obrigatórios | protocol_id · name · owner |

### 2.20 ProtocolVersion
| | |
|---|---|
| Propósito | Versão publicável |
| Obrigatórios | version_id · protocol_id · status · valid_from · valid_until · scope · approval · rollback_ref · feedback_channel |
| Canal B | só vigente / provisório autorizado César |

### 2.21 LearningProposal
| | |
|---|---|
| Propósito | Caso → formação/procedimento/comunicação |
| Obrigatórios | proposal_id · type · status · owner · evidence_refs[] |

### 2.22 ContentVersion
| | |
|---|---|
| Propósito | Versão de micro/caso/sim |
| Obrigatórios | content_id · version · owner · status · competency_ids · protocol_ids · **I-16** |

### 2.23 PilotCycle
| | |
|---|---|
| Propósito | Ciclo de 30 dias / coorte |
| Obrigatórios | pilot_id · start · end · n_participants · mode (papel\|digital\|híbrido) |

### 2.24 WeeklyPilotGate
| | |
|---|---|
| Propósito | GO / CORRIGIR / PAUSAR |
| Obrigatórios | week · decision · reasons[] · decided_by · load_notes |

### 2.25 AggregatedLearningObservation
| | |
|---|---|
| Propósito | M3/M4/M10 agregados |
| Obrigatórios | theme_or_metric · period · value · sample_basis |
| Proibidos | ranking individual |

### 2.26 AccessAuditRecord
| | |
|---|---|
| Propósito | Quem acessou o quê (dossiê, sensível) |
| Obrigatórios | actor_role · target · purpose · at |

### 2.27 ContentRevisionRequest
| | |
|---|---|
| Propósito | Conteúdo/protocolo em conflito ou stale |
| Obrigatórios | target · reason · status |

### 2.28 IntegrationReference
| | |
|---|---|
| Propósito | Ref opaca a evento DOS (futuro) |
| Owner | Integração / TE |
| Obrigatórios | event_id · source_system · privacy_class · status |
| **Não** transfere soberania de fato live |

---

## 3. Privacidade e retenção (conceitual)

| Classe | Exemplos |
|---|---|
| publica_interna | Protocolo vigente sem PII |
| restrita | Caso, conteúdo |
| sensivel | PracticeEvidence, Passaporte |
| proibida | Disciplina, PII cliente, chat bruto |

Retenção: efêmera · operacional_curta · aprendizado_ativo · competencia_vigente · auditoria · arquivada — **prazos jurídicos pendentes** (Contrato INT).

---

## 4. O que **não** modelar na V1

Dossiê amplo multi-campo · motor DOS · Calmo/Foco · alertas 45/55/65 · score · gamificação.

Dossiê mínimo César: pode ser **fora** do app V1 (planilha/pasta) — ver backlog.

---

*Modelo de domínio V0.9 · conceitual · 28 entidades.*
