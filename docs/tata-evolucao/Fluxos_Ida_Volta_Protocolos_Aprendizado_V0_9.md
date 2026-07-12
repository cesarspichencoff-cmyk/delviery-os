# Fluxos de Ida e Volta, Protocolos e Aprendizado — V0.9

> Fluxos formais · publicação de protocolos · conflitos · antifragilidade.  
> Complementa o Contrato V0.9.

---

## 1. Fluxo de ida (DeliveryOS → TATÁ Evolução)

### 1.1 Diagrama lógico

```text
[Runtime DOS]
 OperationalFact (soberania DOS)
        │
        ▼
  dedupe / confidence / freshness (DOS)     ← classe A no DOS
        │
        ▼
 EvidenceCandidate (Canal A)                ← human_review_required = true
        │
        ├─► IA: agrupar / sugerir recorrência (C)
        │
        ▼
 Revisão humana + anonimização
        │
        ▼
 ReviewedEvidence
        │
        ▼
 OperationalCase (candidato → …)
        │
        ▼
 LearningProposal
        │
        ▼
 Aprovação humana (César / owner no escopo)
        │
        ├─► ApprovedLearningCase → formação / prática
        ├─► Protocol / ProtocolVersion (rascunho→…)
        ├─► comunicação interna
        └─► proposta de melhoria de sistema (não auto-implementa)
```

### 1.2 Invariantes de ida

1. Fato isolado **≠** regra.  
2. Fato isolado **≠** treino obrigatório automático.  
3. Fato isolado **≠** avaliação automática de pessoa.  
4. `person_reference` não é padrão.  
5. Replay não reabre candidato já decidido (idempotência).  
6. Evento ≥ 23:00 local: flag fora do fluxo normal; `operational_day_key` correto.

### 1.3 Saídas permitidas do aprendizado

| Saída | Condição |
|---|---|
| Formação / caso | caso aprovado_para_formacao |
| Procedimento / protocolo | aprovado + versionamento |
| Comunicação | texto aprovado, sem PII |
| Melhoria de sistema | proposta; implementação = missão separada |

---

## 2. Fluxo de volta (TATÁ Evolução → DeliveryOS)

### 2.1 Diagrama lógico

```text
[TATÁ Evolução]
 ProtocolVersion (rascunho → … → vigente)
        │
        ▼
 Revisão humana final + approved_by
        │
        ▼
 Publicação Canal B (envelope + IntegrationAuditRecord)
        │
        ▼
[DeliveryOS]
 Reconhece orientação vigente (consulta / contexto)
        │
        ├─► NÃO escreve motor
        ├─► NÃO cria Foco/Calmo/Ambiente automaticamente
        └─► Humanos podem aplicar no turno
        │
        ▼
 Novas OperationalFact / evidências
        │
        ▼
 Volta ao fluxo de ida (aprendizado sobre aderência)
        │
        ▼
 LearningOutcomeObservation (Canal D, agregado)
```

### 2.2 Invariantes de volta

1. Só versão **vigente** (ou piloto explicitamente publicável) no Canal B.  
2. Publicação **≠** regra executável.  
3. Tradução para motor: missão técnica + testes + autorização + recertificação.  
4. Protocolo substituído some da consulta vigente; permanece auditável.  
5. Aplicação prática pode gerar PracticeEvidence (Canal C) **sem** passar pelo Foco.

---

## 3. Ciclo protocolo × evidência (antifragilidade desejada)

```text
protocolo vigente
  → uso no turno
  → evidências de aderência / falha / lacuna
  → revisão (não auto-confirmação cega)
  → manter | revisar | substituir | suspender
```

Gate humano obrigatório em E4/E5 antes de “provar” que o conteúdo “funcionou”.

---

## 4. Conflitos entre sistemas — respostas esperadas

| # | Situação | Comportamento esperado | Soberano |
|---|---|---|---|
| 1 | DOS mostra fato que contradiz protocolo | Manter fato DOS; abrir `incompatibilidade_detectada`; não apagar fato; revisar protocolo ou treino | DOS (fato); TE (protocolo) |
| 2 | Protocolo mudou; DOS consulta versão antiga | Cache/consulta deve preferir vigente; se offline, marcar `stale_protocol`; não decidir motor | TE (versão); INT (sync) |
| 3 | Caso aprovado com evidência depois corrigida | Suspender dependências; ContentRevisionRequest; não usar caso até revisão | TE |
| 4 | Competência validada com regra desatualizada | Marcar revalidação; não revogar em silêncio sem humano | TE / César |
| 5 | Conteúdo ensina procedimento substituído | Suspender conteúdo; unpublish se necessário | TE |
| 6 | Evidência duplicada | Dedupe por event_id/correlation; uma contagem | INT/DOS |
| 7 | Fonte perde confiança | Baixar confidence; candidatos E↓; não apagar audit | DOS |
| 8 | Integração offline | DOS opera sozinho; TE opera com fila local; sem inventar fatos | ambos |
| 9 | Replay reencontra evento antigo | Noop se já revisado | INT |
| 10 | Funcionário contesta evidência já usada | ContestationRecord; suspender uso consolidado | TE (+ DOS se fato) |

Estados de conflito: `incompatibilidade_detectada` · `revisao_necessaria` · `conteudo_suspenso` · `protocolo_suspenso` · `aguardando_decisao` · `resolvido` · `arquivado`.

**Não** resolver automaticamente conflitos críticos.

---

## 5. Calmo, Ambiente e Foco

| Entrada do Evolução | Efeito no DOS |
|---|---|
| Protocolo vigente | Consulta / contexto formativo opcional |
| Orientação / briefing autorizado | Só se contrato futuro de briefing |
| Necessidade de revisão de procedimento | Sinal para humanos / Canal D |
| Conteúdo de formação | **Não** cria Foco |
| “Há microlição sobre omissão” | **Não** cria Foco nem Ambiente |

Estado cognitivo permanece **100% DeliveryOS**.

---

## 6. Antifragilidade e feedback loop — riscos

| Risco | Prevenção | Detecção | Resposta | Responsável | Gate humano |
|---|---|---|---|---|---|
| Aprender com classificação errada | Revisão; E-levels | Amostra de rejeições | Corrigir + suspender casos | Validador/César | Sim |
| Hipótese repetida vira “verdade” | Hipótese ≠ E4 | Contagem de C sem Val | Exigir validação E4 | LE/César | Sim |
| Conteúdo valida a si mesmo | Separar treino de métrica de resultado | E5 só com desenho | Revisão cega amostral | César | Sim |
| Líder registra só falhas | Casos positivos obrigatórios na biblioteca | Auditoria de mix | Meta de captura positiva | LE/César | Sim |
| Funcionários escondem ocorrências | Cultura F1; segurança para relatar | Queda artificial de casos | Reforço cultural; não punir relato | César/LE | Sim |
| Excesso de alertas/candidatos | Rate limit de candidatos; priorização | Fila longa | Threshold humano | INT/César | Sim |
| Formação vira punição | Separação disciplina | Tom de comunicação | Intervir; reescrever | César | Sim |
| Passaporte como ranking disfarçado | Campos proibidos; UI | Design review | Remover comparação | César/design | Sim |
| Protocolo antigo circula | versionamento; Canal B só vigente | stale flag | unpublish | TE/INT | Sim |
| IA amplifica viés | IA só C; proibir Val final | Red team | Desligar sugestão temática | César | Sim |
| Evidências duplicadas | event_id | Dedupe metrics | Merge | INT | Sim se dúvida |
| Canal dominante distorce (só WA) | Multi-fonte E3; baseline L2C | Viés de fonte | Balancear temas | César | Sim |

---

## 7. Mapa protocolo P1–P12 no fluxo de volta (exemplo)

| Protocolo | Publicável Canal B quando | Evidência de volta típica |
|---|---|---|
| P1 pausa/86 | vigente / piloto marcado | registro 5 campos; revisão 15 min |
| P2–P3 omissão/troca | vigente | ciclos SAC; casos O/T |
| P4–P5 kit/sacola | provisório piloto → vigente pós-T4 | observação B |
| P6 compensação | vigente com $ pendente explícito | tipo de recuperação; sem inventar valor |
| P7–P9 | vigente | cancel/atraso/falha |
| P10–P12 | vigente | qualidade de escala; debrief |

R-L6B-05…11: publicáveis como **provisorio_de_piloto** se César autorizar consulta no DOS durante piloto.

---

## 8. Rastreabilidade ponta a ponta (checklist)

Todo objeto em trânsito deve permitir responder:

origem · revisor · aprovador · versão · evidência · confiança · finalidade · ACL · expiração · contestação · sistema proprietário  

---

*Fluxos V0.9 · ida e volta · conflitos humanos · Foco protegido.*
