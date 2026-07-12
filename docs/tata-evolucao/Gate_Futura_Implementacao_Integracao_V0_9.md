# Gate de Futura Implementação da Integração — V0.9

> Pacote para **futuro Fable** (ou equivalente) e auditorias.  
> **Não** autoriza implementação nesta missão.  
> **Não** inicia auditoria adversarial da L8.

---

## 1. Domínio

Integração conceitual **DeliveryOS × TATÁ Evolução**:

- handoff de evidências operacionais anonimizadas (Canal A);  
- publicação de protocolos para consulta (Canal B);  
- evidências de desenvolvimento isoladas do runtime (Canal C);  
- resultados agregados institucionais (Canal D).

---

## 2. Objetos (implementar só depois do gate)

OperationalFact · EvidenceCandidate · ReviewedEvidence · OperationalCase · LearningProposal · ApprovedLearningCase · Protocol · ProtocolVersion · Competency · PracticeEvidence · Validation · LearningOutcomeObservation · ContentRevisionRequest · IntegrationAuditRecord · ContestationRecord  

Envelope de integração (schema_versioned).  
Estados e E0–E5 conforme `Modelo_Eventos_Evidencias_Compartilhadas_V0_9.md`.

---

## 3. Estados a respeitar

- EvidenceCandidate: capturada → … → arquivada  
- OperationalCase / LearningProposal / ProtocolVersion: máquinas V0.9  
- Conflito: incompatibilidade_detectada → … → resolvido/arquivado  

---

## 4. Invariantes (não negociáveis sem novo contrato)

1. TE **não escreve** fatos, live, freshness, confiança, Calmo, Ambiente, Foco, decisão, dedupe, histórico bruto, resultado do motor.  
2. DOS **não** conclui competência, não altera Passaporte, não promove, não pune, não publica conteúdo TE.  
3. Fato isolado ≠ regra ≠ treino obrigatório auto ≠ avaliação auto de pessoa.  
4. Publicar protocolo ≠ alterar motor.  
5. person_reference não é padrão no Canal A.  
6. Timestamps com America/Sao_Paulo; sem UTC silencioso.  
7. Idempotência e replay-safe.  
8. Evidência contestada não é consolidada em silêncio.  
9. Sem ranking individual nos canais.  
10. Disciplina fora do TE.  
11. IA sem decisão final em Val/A/punição/promoção/$.  
12. Canal C fora do runtime operacional.

---

## 5. Permissões

Implementar ACL conforme `Matriz_Permissoes_Privacidade_V0_9.md`.  
**DP:** acesso LE ao dossiê completo — não hardcodar “sim” sem César.

---

## 6. Contratos e eventos

- Contrato V0.9 + fluxos ida/volta.  
- event_types do modelo.  
- Classes de automação A–E.  
- IntegrationAuditRecord em handoff e publicação.

---

## 7. Não-objetivos da primeira implementação

- reescrever motor.js / decisao.js / live  
- criar Foco a partir do Evolução  
- banco único fundindo runtime e RH  
- mineração ampla de privados  
- stack “definitiva” sem ADR  
- app disciplinar  
- ranking  
- oficializar 45/55/65  
- inventar limites $  

---

## 8. Riscos (herdados)

| Risco | Mitigação contratual |
|---|---|
| Contaminação do Foco | write proibido |
| PII no handoff | scrub + privacy_class |
| Auto-regra | D/E |
| Stale protocol | versionamento Canal B |
| Dossiê como arma | separação disciplina; ACL |
| Double-count | event_id |
| Offline split-brain | soberanias + outbox |
| Viés IA | só classe C |

---

## 9. Decisões pendentes do César (bloqueiam partes, não o contrato V0.9)

| ID | Tema |
|---|---|
| DP-01 | Acesso LE ao dossiê completo |
| DP-02 | Limites financeiros por função |
| DP-03 | Prazos jurídicos de retenção / exclusão |
| DP-04 | Identidade técnica futura / stack / transporte |
| DP-05 | Sync online/offline detalhado |
| DP-06 | Responsável institucional por privacidade |
| DP-07 | Política de exclusão vs arquivamento |
| DP-08 | Integração futura com RH |
| DP-09 | Quais protocolos podem virar regra **executável** |
| DP-10 | SLA de contestação |
| DP-11 | publishable_as_pilot no Canal B |

---

## 10. Dependências antes da implementação

1. Contrato V0.9 **aprovado** (ou V1) por César.  
2. Auditoria adversarial do pacote L8 + deste contrato (missão futura).  
3. Sprint Visual / produto Academia (trilha paralela) — não bloqueia modelo de eventos, mas bloqueia UI de Passaporte.  
4. Política de privacidade operacional assinada (DP-03/06/07).  
5. Decisão DP-02 se P6 for executável em valores.  
6. Missão técnica **separada** se algum protocolo for virar regra de motor (DP-09).  
7. Ambiente de integração **fora** de `src/live/**` até recertificação.  
8. Testes de idempotência, scrub PII, e “não escreve Foco”.  
9. Runbook offline.  
10. Red team de implementação cobrindo os 20 cenários V0.9.

---

## 11. Critérios de aceitação (futura implementação)

| # | Critério |
|---|---|
| 1 | Nenhum write TE → live/Calmo/Foco/decisão |
| 2 | Canal A sem PII por padrão (testes) |
| 3 | Publicação Canal B só ProtocolVersion vigente (ou piloto autorizado) |
| 4 | Replay não duplica candidatos decididos |
| 5 | Contestação bloqueia uso consolidado |
| 6 | Audit trail completo nos handoffs |
| 7 | Passaporte só campos permitidos |
| 8 | IA não valida competência nem promove |
| 9 | Eventos após 23h com TZ e day_key corretos |
| 10 | Documentação de soberania anexada ao PR |

---

## 12. Áreas que **não podem** ser alteradas sem missão explícita

```
src/live/**
tools/live/**
tests/live/**
motor.js
decisao.js
app-v1/**
package.json / lockfiles
data/** (brutos)
main / feature/preloja-fable / audit/preloja-grok
```

Implementação de integração, quando autorizada, deve nascer em superfície **nova** e isolada, com recertificação se tocar qualidade/decisão.

---

## 13. Pacote Fable — checklist de handoff

- [ ] Ler Contrato + Modelo + Governança + Permissões + Retenção + Fluxos + RedTeam + este Gate  
- [ ] Não começar por UI  
- [ ] Não “só plugar webhook no Foco”  
- [ ] Propor ADR de transporte **depois** de invariantes  
- [ ] Listar DP-xx abertos no PR  
- [ ] Testes dos invariantes 1–12  
- [ ] Sem dados privados no Git  

---

## 14. Veredito deste gate (missão atual)

| Item | Status |
|---|---|
| Contrato documental V0.9 | **Criado** |
| Implementação | **Não iniciada** |
| Auditoria L8 | **Não iniciada** |
| Fable | **Não chamado** |

Próximos passos possíveis (outra missão):

1. Auditoria adversarial da L8 + contrato.  
2. Decisões César DP-xx prioritárias.  
3. Sprint Visual (produto), em paralelo.  
4. Só então: missão técnica de integração.

---

*Gate V0.9 · pronto para auditoria futura · proibido implementar agora.*
