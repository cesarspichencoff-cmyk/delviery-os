# Modelo de Eventos e Evidências Compartilhadas — V0.9

> Domínio conceitual compartilhado. **Sem** tecnologia de armazenamento.  
> Complementa `Contrato_Integracao_DeliveryOS_TATA_Evolucao_V0_9.md`.

---

## 1. Envelope conceitual de integração

Campos lógicos (quando aplicável):

| Campo | Função |
|---|---|
| `event_id` | Identidade estável (idempotência) |
| `event_type` | Tipo do objeto/evento |
| `schema_version` | Versão do envelope |
| `source_system` | `deliveryos` \| `tata_evolucao` \| `integration` \| `human` |
| `source_reference` | Ref opaca ao sistema de origem (não colar bruto) |
| `occurred_at` | Quando o fato/ocorreu (explícito, com TZ) |
| `recorded_at` | Quando entrou no sistema |
| `operational_day_key` | `local_date` America/Sao_Paulo |
| `store_time_zone` | `America/Sao_Paulo` (obrigatório) |
| `correlation_id` | Agrupa thread lógica |
| `causation_id` | Evento que causou este |
| `scope` | loja / delivery / tema |
| `operational_area` | praça, canal, SAC, etc. (sem PII) |
| `role_scope` | função (DJ, SAC…), não pessoa |
| `person_reference` | **Exceção**; pseudônimo; não padrão para processo |
| `confidence` | confiança da origem (DOS) ou revisão |
| `evidence_level` | E0–E5 |
| `privacy_class` | pública_interna · restrita · sensível · proibida |
| `human_review_required` | boolean |
| `retention_class` | efêmera · operacional_curta · aprendizado_ativo · competência_vigente · auditoria · arquivada |
| `payload` | corpo tipado mínimo |
| `provenance` | cadeia de origem resumida |
| `created_by` | sistema ou papel |
| `approved_by` | papel humano quando aplicável |
| `valid_from` / `valid_until` | vigência |
| `supersedes_id` | versão/objeto substituído |
| `status` | estado do objeto |

### Regras do envelope

1. **Não** exigir `person_reference` para evidência de processo.  
2. Identificação pessoal = **exceção** com finalidade e ACL.  
3. Timestamps com timezone explícito; **proibido** “UTC silencioso”.  
4. Mesmo `event_id` reprocessado = **noop** se já revisado/arquivado (idempotência + replay).  
5. Deduplicação por `event_id` e, quando possível, por `correlation_id` + hash de payload anonimizado.

---

## 2. Objetos do domínio compartilhado

### 2.1 OperationalFact
| Campo | Conteúdo |
|---|---|
| Finalidade | Representar fato observado na operação |
| Proprietário | **DeliveryOS** |
| Consumidor | Integração (Canal A) → candidatos |
| Campos mínimos | tipo, occurred_at, operational_day_key, área, resumo opaco, confidence, freshness |
| Proibidos | PII cliente; chat bruto; julgamento de pessoa |
| Estado | vivo no runtime DOS (não gerido pelo Evolução) |
| Owner | motor/fonte viva DOS |
| Versão | schema DOS |
| Origem | sensores, apps, operadores, imports |
| Confiança | nativa DOS |
| Privacidade | minimizada antes de sair |
| Retenção | soberania DOS |
| Revisão humana | não obrigatória no fato; obrigatória se vira aprendizado |
| Contestação | via correção de fato DOS + ContestationRecord se já saiu |
| Relações | → EvidenceCandidate |

### 2.2 EvidenceCandidate
| Campo | Conteúdo |
|---|---|
| Finalidade | Candidato a aprendizado a partir de fato(s) |
| Proprietário | Integração / fila de revisão (conceitual); não “vira verdade” sozinho |
| Consumidor | Revisores humanos · Evolução após aprovação |
| Campos mínimos | event_id, fact_refs[], theme, summary_anon, evidence_level, status, human_review_required=true |
| Proibidos | PII; disciplina; ranking |
| Estado | ver §3 |
| Owner | criador (DOS/IA/LE) até revisão |
| Confiança | herda + marca se agrupado |
| Privacidade | anonimizar **antes** de uso em caso |
| Retenção | operacional_curta até decisão |
| Revisão | **obrigatória** |
| Contestação | sim |
| Relações | ← OperationalFact · → ReviewedEvidence |

### 2.3 ReviewedEvidence
| Campo | Conteúdo |
|---|---|
| Finalidade | Evidência após revisão e (idealmente) anonimização |
| Proprietário | TATÁ Evolução (aprendizado) após handoff |
| Consumidor | casos, propostas, análise |
| Campos mínimos | candidate_id, reviewer, decision, theme, evidence_level, privacy_class, payload_anon |
| Proibidos | dados proibidos da política |
| Estado | aprovada · rejeitada · insuficiente · contestada · arquivada |
| Owner | revisor / César se crítico |
| Relações | → OperationalCase · LearningOutcomeObservation |

### 2.4 OperationalCase
| Campo | Conteúdo |
|---|---|
| Finalidade | Caso didático/operacional estruturado (esqueleto) |
| Proprietário | TATÁ Evolução |
| Consumidor | formação, LE, piloto |
| Campos mínimos | case_id, theme, situation, principle, expected_reasoning, evidence_refs, status |
| Proibidos | diálogo real identificável; nomes |
| Estado | ver §4 |
| Relações | ← ReviewedEvidence · → LearningProposal · ApprovedLearningCase |

### 2.5 LearningProposal
| Campo | Conteúdo |
|---|---|
| Finalidade | Proposta de formação / procedimento / comunicação / sistema |
| Proprietário | TATÁ Evolução |
| Consumidor | César / owner de conteúdo |
| Campos mínimos | proposal_id, type, case_refs, impact, status, owner |
| Proibidos | auto-publicação |
| Estado | ver §5 |
| Relações | → Protocol · Content · ContentRevisionRequest |

### 2.6 ApprovedLearningCase
| Campo | Conteúdo |
|---|---|
| Finalidade | Caso **aprovado** para uso em formação/piloto |
| Proprietário | TATÁ Evolução |
| Consumidor | Academia, formadores |
| Campos mínimos | case_id, version, approved_by, valid_from, formation_ids |
| Estado | vigente · substituído · arquivado |
| Relações | ← OperationalCase aprovado |

### 2.7 Protocol / 2.8 ProtocolVersion
| Campo | Conteúdo |
|---|---|
| Finalidade | Orientação operacional aprovada (ex.: P1–P12) |
| Proprietário | TATÁ Evolução |
| Consumidor | Canal B → consulta DeliveryOS; humanos |
| Campos mínimos | protocol_id, version_id, scope, roles, steps_min, evidence_required, owner, valid_from/until, status |
| Proibidos | virar regra de motor sem missão técnica |
| Estado | ver §6 |
| Relações | supersedes_id · → LearningOutcomeObservation |

### 2.9 Competency
| Campo | Conteúdo |
|---|---|
| Finalidade | Competência com provas K/S/B/C |
| Proprietário | TATÁ Evolução |
| Consumidor | Passaporte, trilhas |
| Campos mínimos | competency_id, function, proofs, critical_error, autonomy_link |
| Proibidos | score público; ranking |
| Relações | ← Validation · PracticeEvidence |

### 2.10 PracticeEvidence
| Campo | Conteúdo |
|---|---|
| Finalidade | Evidência de simulação/comportamento/consistência |
| Proprietário | TATÁ Evolução (Canal C) |
| Consumidor | validador · Passaporte (se aprovada) · dossiê |
| Campos mínimos | person_ref_pseudo (quando necessário), competency_id, proof_type, note_factual, status |
| Proibidos | personalidade; disciplina; comparação |
| Canal | **C — não no runtime DOS** |

### 2.11 Validation
| Campo | Conteúdo |
|---|---|
| Finalidade | Ato humano de validar prova |
| Proprietário | TATÁ Evolução |
| Consumidor | Passaporte |
| Campos mínimos | validator_role, result, at, competency_id, practice_evidence_id |
| Proibidos | auto-validação IA como final |
| Relações | → Passaporte campos permitidos |

### 2.12 LearningOutcomeObservation
| Campo | Conteúdo |
|---|---|
| Finalidade | Observação agregada de resultado de aprendizado (Canal D) |
| Proprietário | TATÁ Evolução / análise institucional |
| Consumidor | César, owner, métricas Fase 1 |
| Campos mínimos | theme, period, metric_id, direction, sample_basis, no_person_rank |
| Proibidos | ranking individual; feed live sem revisão |
| Relações | ← protocolos, casos, M1–M10 L8 |

### 2.13 ContentRevisionRequest
| Campo | Conteúdo |
|---|---|
| Finalidade | Pedido de revisão quando conflito/protocolo antigo/contestação |
| Proprietário | TATÁ Evolução |
| Campos mínimos | target_type, target_id, reason, severity, status |
| Estados de conflito | incompatibilidade_detectada · revisão_necessária · conteúdo_suspenso · protocolo_suspenso · aguardando_decisão · resolvido · arquivado |

### 2.14 IntegrationAuditRecord
| Campo | Conteúdo |
|---|---|
| Finalidade | Trilha de auditoria da integração |
| Proprietário | serviço futuro de integração (conceitual) |
| Campos mínimos | event_id, action, actor_role, at, before_status, after_status |
| Proibidos | payload sensível completo se não necessário |
| Retenção | classe auditoria |

### 2.15 ContestationRecord
| Campo | Conteúdo |
|---|---|
| Finalidade | Contestação e correção de evidência/classificação |
| Proprietário | TATÁ Evolução (com eco se afeta fato DOS) |
| Campos mínimos | target_id, raised_by_role, reason, status, resolution, resolved_by |
| Regra | evidência **contestada** não pode ser usada como consolidada em silêncio |
| Relações | suspende uso em caso/proposta até resolução |

---

## 3. Níveis de evidência (E0–E5)

| Nível | Significa | Permite | Não permite | Revisão | Riscos | Formação | Protocolo | Agregado |
|---|---|---|---|---|---|---|---|---|
| **E0** | Relato sem comprovação | Hipótese de exploração | Regra, punição, Passaporte | Alta | Rumor | Só com disclaimer / não priorizar | Não | Não como “prova” |
| **E1** | Documental (doc, card, OP) | Candidato a caso | Disciplina auto | Média | Doc desatualizado | Sim com validação | Base parcial | Sim com data |
| **E2** | Operacional observada (turno/LE) | PracticeEvidence candidata | Competência final sozinha | Humana | Viés do observador | Sim | Apoio | Sim |
| **E3** | Cruzada entre fontes | Caso forte | Regra auto | Humana | Correlação falsa | Sim | Sim se aprovado | Sim |
| **E4** | Recorrência validada | Priorizar conteúdo/processo | Ranking pessoa | Humana + amostra | Contar duplicata | Sim | Sim | Sim (M1) |
| **E5** | Resultado de intervenção acompanhado | Avaliar protocolo/formação | Punição auto | Humana | Auto-validação do conteúdo | Sim | Revisar vigência | Sim (M10) |

**Em nenhum nível** a evidência autoriza **decisão disciplinar automática**.

---

## 4. Máquina de estados — EvidenceCandidate

| Estado | Significado |
|---|---|
| capturada | Entrou no canal A |
| aguardando_revisao | Fila humana |
| em_revisao | Revisor ativo |
| anonimizada | PII removida/pseudonimizada |
| aprovada | Vira ReviewedEvidence utilizável |
| rejeitada | Não segue |
| insuficiente | Falta dado; pode reabrir |
| contestada | ContestationRecord aberto |
| suspensa | Uso bloqueado temporariamente |
| arquivada | Fim de ciclo |

### Transições (resumo)

| De | Para | Autoridade |
|---|---|---|
| capturada | aguardando_revisao | sistema / criador |
| aguardando_revisao | em_revisao | validador / LE / César |
| em_revisao | anonimizada | revisor (pode ser passo interno) |
| em_revisao / anonimizada | aprovada \| rejeitada \| insuficiente | revisor; César se crítico |
| * | contestada | funcionário / líder / César |
| contestada | suspensa \| aprovada \| rejeitada \| arquivada | César ou revisor designado |
| aprovada | arquivada | owner / retenção |
| * | suspensa | César / LE (escopo) se risco |

IA **não** aprova nem rejeita com efeito final.

---

## 5. Estados — OperationalCase

candidato · agrupado · em_validacao · aprovado_para_formacao · aprovado_para_procedimento · aprovado_para_comunicacao · aprovado_para_investigacao · rejeitado · substituido · arquivado

---

## 6. Estados — LearningProposal

rascunho · em_revisao · necessita_evidencia · aprovado · rejeitado · em_producao · em_piloto · vigente · necessita_revisao · substituido · arquivado

---

## 7. Estados — ProtocolVersion

rascunho · em_validacao · provisorio_de_piloto · aprovado · vigente · suspenso · necessita_revisao · substituido · arquivado

| Regra | Conteúdo |
|---|---|
| Publicação Canal B | Somente **vigente** (e aprovada/provisória de piloto **explicitamente** marcada se política permitir consulta “piloto”) |
| Default seguro | Só **vigente** + **aprovado** para consulta DOS |
| Substituído | Permanece **auditável**; não aparece como vigente |

---

## 8. Tipos de evento sugeridos (event_type)

`fact.observed` · `evidence.candidate.created` · `evidence.reviewed` · `case.proposed` · `case.approved` · `proposal.created` · `proposal.approved` · `protocol.published` · `protocol.superseded` · `practice.validated` · `passport.field.updated` · `contestation.opened` · `contestation.resolved` · `integration.conflict` · `audit.recorded`

---

## 9. Idempotência e contagem única

| Situação | Comportamento |
|---|---|
| Replay do mesmo event_id | Não recria candidato se já existe decisão |
| Mesmo fato em WA + DOS | Um correlation_id / dedupe hash; E3 se cruzado de propósito |
| Evento após 23:00 local | operational_day_key = local_date; marcar fora do fluxo normal; não misturar baseline de dia sem flag |

---

*Modelo de eventos V0.9 · conceitual · sem storage.*
