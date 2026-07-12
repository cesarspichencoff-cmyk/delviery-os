# Red Team — Integração DeliveryOS × TATÁ Evolução V0.9

> Vinte cenários adversariais. Comportamento **esperado** do contrato (não implementação).  
> Nenhum cenário autoriza vigilância, ranking ou punição automática.

---

## Matriz de cenários

### 1. Erro isolado gera proposta de curso
| Campo | Conteúdo |
|---|---|
| Esperado | Candidato possível; **não** vira treino obrigatório nem regra |
| Soberano | TE para proposta; humano aprova |
| Auto | C no máximo (sugerir) |
| Aprovação | D humana antes de produção |
| Persistido | EvidenceCandidate + audit |
| Risco | Histeria de conteúdo |
| Resultado | Proposta rascunho ou rejeitada por “isolado” |

### 2. Mesma ocorrência no WhatsApp e no DeliveryOS
| Campo | Conteúdo |
|---|---|
| Esperado | Dedupe / correlation_id; uma contagem; possível E3 se cruzamento intencional |
| Soberano | DOS fatos; INT dedupe handoff |
| Auto | A dedupe |
| Aprovação | Humana se vira caso |
| Persistido | um candidato canônico |
| Risco | double-count |
| Resultado | um aprendizado, não dois |

### 3. Evidência atribuída à pessoa errada
| Campo | Conteúdo |
|---|---|
| Esperado | Contestação prioritária; correção de person_ref; suspender Passaporte derivado |
| Soberano | TE (prática); DOS se fato |
| Auto | P atribuição final IA |
| Aprovação | César/validador |
| Persistido | ContestationRecord + versão corrigida |
| Risco | injustiça |
| Resultado | corrigida; audit mantém histórico |

### 4. Funcionário contesta a evidência
| Campo | Conteúdo |
|---|---|
| Esperado | status contestada; uso consolidado bloqueado |
| Soberano | TE |
| Auto | A abrir record |
| Aprovação | resolução humana |
| Persistido | ContestationRecord |
| Risco | retaliação — proibida no TE |
| Resultado | corrigida / mantida / suspensa com justificativa |

### 5. Protocolo substituído durante o piloto
| Campo | Conteúdo |
|---|---|
| Esperado | nova versão vigente; antiga substituido auditável; Canal B atualiza; conteúdo antigo suspenso se conflita |
| Soberano | TE |
| Auto | A flag stale |
| Aprovação | D publicar nova |
| Persistido | ProtocolVersion chain |
| Risco | treino misto |
| Resultado | uma vigente visível |

### 6. Conteúdo ensina versão antiga
| Campo | Conteúdo |
|---|---|
| Esperado | ContentRevisionRequest; conteúdo_suspenso |
| Soberano | TE |
| Auto | C detectar mismatch versão |
| Aprovação | owner/César |
| Persistido | revision request |
| Risco | erro operacional ensinado |
| Resultado | conteúdo atualizado ou arquivado |

### 7. IA sugere promoção
| Campo | Conteúdo |
|---|---|
| Esperado | **Proibido** como decisão; no máximo texto C no dossiê se política permitir — preferível **não sugerir promoção** |
| Soberano | César |
| Auto | **E** decisão |
| Aprovação | só humano externo ao auto |
| Persistido | nada no Passaporte |
| Risco | viés |
| Resultado | ignorar / bloquear ação |

### 8. Líder tenta usar dossiê como disciplina
| Campo | Conteúdo |
|---|---|
| Esperado | Contrato bloqueia disciplina no TE; LE sem acesso integral default (**DP**); César recusa uso punitivo |
| Soberano | César / processo disciplinar externo |
| Auto | E export disciplinar |
| Aprovação | n/a no TE |
| Persistido | audit de tentativa de acesso se houver |
| Risco | cultura de medo |
| Resultado | redirecionar para processo externo humano |

### 9. Passaporte expõe informação privada
| Campo | Conteúdo |
|---|---|
| Esperado | Campos proibidos filtrados; privacy_class; correção imediata |
| Soberano | TE |
| Auto | A bloquear campos proibidos |
| Aprovação | — |
| Persistido | incident audit |
| Risco | LGPD / confiança |
| Resultado | remover campo; notificar César |

### 10. DeliveryOS está offline
| Campo | Conteúdo |
|---|---|
| Esperado | DOS local/runtime conforme próprio design; Canal A enfileira ou pausa; TE formações continuam offline de conteúdo; sem inventar fatos |
| Soberano | cada um |
| Auto | A fila |
| Aprovação | — |
| Persistido | outbox |
| Risco | backfill duplicado |
| Resultado | sync idempotente depois |

### 11. Replay recria candidato já revisado
| Campo | Conteúdo |
|---|---|
| Esperado | noop; mantém decisão anterior |
| Soberano | INT |
| Auto | A |
| Aprovação | — |
| Persistido | audit replay |
| Risco | spam de fila |
| Resultado | sem duplicata |

### 12. Fonte perde confiança
| Campo | Conteúdo |
|---|---|
| Esperado | confidence↓; novos candidatos com human_review forçado; não apagar histórico |
| Soberano | DOS |
| Auto | A marcar fonte |
| Aprovação | humana para uso em caso |
| Persistido | flag fonte |
| Risco | lixo em formação |
| Resultado | pausar handoff dessa fonte se grave |

### 13. Caso crítico exige ação imediata
| Campo | Conteúdo |
|---|---|
| Esperado | Ação operacional no **DOS/turno** (segurança); aprendizado TE é **paralelo e posterior**; não esperar curso para interromper risco |
| Soberano | DOS + LE no crítico |
| Auto | E bloquear ação de segurança |
| Aprovação | hierarquia operacional |
| Persistido | fato + depois candidato |
| Risco | burocracia perigosa |
| Resultado | segurança primeiro; caso depois |

### 14. Boa prática precisa virar conteúdo
| Campo | Conteúdo |
|---|---|
| Esperado | candidato positivo; ApprovedLearningCase; biblioteca não só de falhas |
| Soberano | TE |
| Auto | C sugerir |
| Aprovação | D |
| Persistido | caso positivo |
| Risco | só treinar erro |
| Resultado | conteúdo de preservação |

### 15. Recorrência desaparece após normalização
| Campo | Conteúdo |
|---|---|
| Esperado | métrica agregada (Canal D) registra queda; não apagar casos históricos; E5 se intervenção acompanhada |
| Soberano | TE análise |
| Auto | C insight |
| Aprovação | humana para “vitória” oficial |
| Persistido | LearningOutcomeObservation |
| Risco | declarar sucesso cedo |
| Resultado | revisão de protocolo/formação |

### 16. Protocolo TE contradiz estado live
| Campo | Conteúdo |
|---|---|
| Esperado | fato live prevalece na operação; incompatibilidade_detectada; humanos decidem se protocolo ou processo muda |
| Soberano | DOS (estado); TE (texto) |
| Auto | C alertar conflito |
| Aprovação | César se mudar protocolo oficial |
| Persistido | conflict state |
| Risco | equipe paralisada |
| Resultado | operação segue DOS; revisão TE |

### 17. Integração recebe evento após 23h
| Campo | Conteúdo |
|---|---|
| Esperado | store_time_zone America/Sao_Paulo; operational_day_key=local_date; marcar fora do fluxo normal; não misturar baseline diurno sem flag |
| Soberano | DOS tempo |
| Auto | A carimbar |
| Aprovação | — |
| Persistido | flags temporais |
| Risco | KPI errado |
| Resultado | contagem correta de dia operacional |

### 18. Dado pessoal aparece em payload
| Campo | Conteúdo |
|---|---|
| Esperado | bloqueio INT; privacy_class=proibida; anonimizar ou dropar; audit incidente |
| Soberano | INT/TE política |
| Auto | A scrub lista; B/D se ambíguo |
| Aprovação | se liberar exceção |
| Persistido | incidente sem reter PII |
| Risco | vazamento Git/UI |
| Resultado | payload limpo ou rejeitado |

### 19. Evidência precisa ser apagada ou corrigida
| Campo | Conteúdo |
|---|---|
| Esperado | correção versionada ou exclusão se política; senão arquivar+anon; impact on cases |
| Soberano | TE (+ jurídico pendente) |
| Auto | E apagar audit essencial |
| Aprovação | César / política |
| Persistido | audit da ação |
| Risco | sumiço de prova |
| Resultado | estado coerente e auditável |

### 20. César rejeita proposta da IA
| Campo | Conteúdo |
|---|---|
| Esperado | status rejeitado; IA não republica; aprendizado sobre falsos positivos opcional |
| Soberano | César |
| Auto | E contornar rejeição |
| Aprovação | já decidida |
| Persistido | proposal rejected + audit |
| Risco | IA insistente |
| Resultado | arquivada; sem efeito Passaporte |

---

## Síntese do red team

| Classe de falha | Proteção V0.9 |
|---|---|
| Auto-regra / auto-punição | E + revisão humana |
| Duplicação / replay | event_id + noop |
| PII | scrub + classes |
| Ranking / promoção IA | proibido |
| Foco/Calmo contaminados | write proibido |
| Conteúdo stale | versionamento + suspensão |
| Disciplina via dossiê | separação explícita |
| Offline | soberanias independentes |

**Nenhum cenário exige implementação nesta missão.**

---

*Red Team V0.9 · 20 cenários · contrato resiste conceitualmente.*
