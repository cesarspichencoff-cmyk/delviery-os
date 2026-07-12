# Métricas e Governança de Aprendizado — L8 (pós-correção)

> Piloto: poucas métricas. Sem ranking. Sem nota única.  
> Governança alinhada ao contrato INT (sem alterar o contrato).

---

## 0. Anti-punição e proibições

**Proibido:** ranking · comparação pública · nota única de funcionário · índice de cultura individual · score de liderança · média que esconda contexto · conclusão automática de promoção · 45/55/65 como KPI.

Métrica **não** alimenta decisão live do DeliveryOS sem revisão humana (contrato).

---

## 1. Métricas do **piloto** (prioridade)

| ID | Nome | Objetivo | Unidade candidata | Fonte | Uso permitido | Uso proibido |
|---|---|---|---|---|---|---|
| **M3** | Qualidade do escalonamento | ESTADO+IMPACTO+AÇÃO | % amostra com 3 elementos | Amostra msg / casos E01 | Treino P10 | Score por pessoa público |
| **M4** | Aplicação prática | Provas B no período | Nº B aprovadas (âncoras) | Fila validação / Passaporte | Marcos | Ranking de B |
| **M10** | Casos → aprendizado | Governança viva | Nº casos capturados revisados | P12 papel | Melhorar conteúdo | Volume vazio |

### Uso com cuidado

| ID | Nota |
|---|---|
| **M1** | Repetição **agregada** de temas (omissão/kit…) — só tema; células pequenas; não nominal |

### Adiadas como KPI principal do piloto

| ID | Motivo |
|---|---|
| **M2** | Qualitativa; opcional observação LE |
| **M5** | Tempo até autonomia — pressão; adiar |
| **M6** | Fecha ciclo — depende registro SAC maduro |
| **M7** | Uso protocolo — teatro se excessivo |
| **M8** | Consistência ampla — adiar KPI; janelas candidatas |
| **M9** | Comunicação — coberto em parte por M3 |

Definições longas M1–M10 da versão anterior permanecem no **histórico Git**; piloto **não** opera as 10.

---

## 2. Governança de conteúdo (piloto)

```text
caso → registro 4 perguntas → revisão humana → classificação → proposta → aprovação César/delegado
→ formação | procedimento | comunicação | (sistema = missão separada)
```

Nenhuma ocorrência isolada vira regra.  
R-L6B-05…11: `em_piloto` até T4.

### Canal B (se César publicar provisório)

Metadados: protocol_id · version_id · owner · provisorio_de_piloto · scope · valid_from/until · suspensão · feedback · rollback · aprovação César.  
Candidatos: P2 P3 P4(kit ok) P5 P8 P10 P12.  
**Não plenos:** P1 P6.

---

## 3. Owner e status de conteúdo

owner · versão · fonte · aprovação · validade · próxima revisão · competências · protocolos · status  
(rascunho…arquivado — L8 governança original).

---

*Métricas L8 pós-correção · M3 M4 M10 · anti-ranking.*
