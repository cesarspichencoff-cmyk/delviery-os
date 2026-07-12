# Retenção, Contestação e Correção — V0.9

> Classes conceituais de retenção · fluxo de contestação · correção auditável.  
> **Não** é parecer jurídico. Prazos são **candidatos** até decisão jurídica / César.

---

## 1. Classes de retenção

| Classe | Finalidade | Prazo candidato | Critério de revisão | Exclusão | Anonimização | Decisão jurídica |
|---|---|---|---|---|---|---|
| **efêmera** | buffer de transporte / dedupe curto | horas–poucos dias | fim do processamento | sim, automática | se copiado | confirmar política local |
| **operacional_curta** | candidatos em fila; rejeitados recentes | semanas (ex. 30–90d candidato) | status rejeitado/insuficiente | após prazo se sem contestação | preferencial | sim |
| **aprendizado_ativo** | casos e propostas em uso no piloto/Fase 1 | enquanto `em_piloto` / `vigente` + janela | mudança de protocolo; T4 | se substituído e sem audit need | payload já anon | sim |
| **competencia_vigente** | provas e Passaporte campos ativos | enquanto vínculo + marcos ativos | mudança de função; pedido correção | campos sob política | pseudo | sim |
| **auditoria** | IntegrationAuditRecord; publicações; contestações | anos (candidato longo) | amostragem anual | só se permitido legalmente | minimizar payload | **obrigatória** |
| **arquivada** | histórico sem uso ativo | indefinido controlado | pedido de exclusão / limpeza | conforme política | reforçar anon | sim |

### Regras gerais

1. Nenhum prazo acima é **parecer legal**.  
2. Canal C (desenvolvimento) e Canal A (processo) têm retenções **separadas**.  
3. Runtime DOS mantém retenção soberana dos fatos; handoff não obriga copiar bruto.  
4. Ao expirar aprendizado_ativo → arquivar ou anonimizar residual · não deixar “semi-vigente”.

---

## 2. Contestação — fluxo

```text
Abertura (funcionário | líder | César)
  → ContestationRecord (status: aberta)
  → alvo (EvidenceCandidate | ReviewedEvidence | PracticeEvidence | classificação de caso)
  → status do alvo: contestada (e uso consolidado BLOQUEADO)
  → revisão (César ou designado; LE se escopo e política)
  → decisão:
       · corrigida
       · suspensa (permanece)
       · mantida (com justificativa)
       · rejeitada a contestação
  → histórico auditável (antes/depois)
  → se impactou caso/proposta/protocolo: ContentRevisionRequest
```

### Regras

| Regra | Conteúdo |
|---|---|
| Uso silencioso | **Proibido** usar evidência contestada como consolidada |
| Passaporte | Campos derivados de evidência contestada ficam **suspensos** até resolução |
| Dossiê | Marca hipótese/evidência em disputa; não promove a “consolidado” |
| DOS | Se o fato de origem for contestado, correção no DOS é soberana; eco no TE via INT |
| Prazo de resposta candidato | Definir no piloto (ex. 7–14 dias úteis) — **PENDENTE CÉSAR** operacional |

### Quem contesta o quê

| Ator | Pode contestar |
|---|---|
| Funcionário | Evidência prática sobre si; classificação que o identifica |
| Líder | Classificação de caso/recorrência do turno (tema) |
| César | Qualquer objeto do domínio TE / publicação |

---

## 3. Correção

| Tipo | Comportamento |
|---|---|
| Correção de payload | Novo registro ou versão; `supersedes` / link; audit |
| Correção de nível E0–E5 | Revisão humana; pode rebaixar caso |
| Correção de person_reference | Prioritária; ACL + notificação César |
| Apagamento | Só se classe e política permitirem; senão arquivar + anonimizar |
| Evidência já em caso aprovado | Suspender caso/conteúdo se dependência material; não “sumir” versão |

### Estados pós-contestação do alvo

`contestada` → `corrigida` (via nova versão) · `suspensa` · `mantida` · `arquivada` · volta a `aprovada` só com resolução explícita

---

## 4. Rastreabilidade da correção

Cada correção registra:

- target_id · version_before · version_after · reason · actor_role · at · impact_on_cases[] · impact_on_passport · notification_needed  

---

## 5. Relação com retenção

| Evento | Classe típica |
|---|---|
| ContestationRecord | auditoria |
| EvidenceCandidate rejeitada | operacional_curta |
| ReviewedEvidence em caso vigente | aprendizado_ativo |
| PracticeEvidence aprovada | competencia_vigente |
| Audit de publicação Canal B | auditoria |

---

## 6. Decisões ainda necessárias (não inventar)

- prazos jurídicos definitivos  
- política de exclusão vs arquivamento  
- responsável institucional por privacidade  
- prazo SLA de contestação  
- se LE pode resolver contestação sem César  

---

*Retenção e contestação V0.9 · auditável · sem consolidar o contestado.*
