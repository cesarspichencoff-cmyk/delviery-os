# Red Team Pós-L8 — V0.9

> Trinta cenários sobre a arquitetura L8 + contrato.  
> Impacto/probabilidade: **A** alta · **M** média · **B** baixa (julgamento de auditoria, não medição de loja).

---

| # | Cenário | Impacto | Prob. | Prevenção | Detecção | Resposta | Owner | Gate |
|---|---|---|---|---|---|---|---|---|
| 1 | Conclui conteúdo, não aplica | A | A | K≠competência; exigir B | M4 vs observação | Não avançar marco | LE | sem B não passa |
| 2 | LE valida sem observar | A | M | 1 B âncora; rubrica mínima | Auditoria César amostra | Invalidar B; retreinar LE | César | amostragem |
| 3 | LE só registra falhas | A | M | Casos positivos obrigatórios | Mix +/− no dossiê | Meta ≥1 positivo/sem | LE/César | revisão mix |
| 4 | Evidência positiva nunca registrada | M | M | S03 E03 R01 no piloto | Contagem | Forçar captura + | LE | checklist |
| 5 | Funcionário contesta competência | M | B-M | ContestationRecord | Status contestada | Suspender uso Passaporte | César | sem consolidar |
| 6 | Regra muda no meio do piloto | M | M | Versionar cards; freeze semanal | Comunicado | Revalidar S se crítico | César | freeze |
| 7 | Protocolo provisório expira | M | M | valid_until + alerta humano | Revisão D0+15 | Suspender consulta B | owner | valid_until |
| 8 | App não fica pronto | M | A | Papel first | Go/no-go D0 | Piloto papel | César | B-13 não bloqueia |
| 9 | Piloto em papel | B | A | Templates | — | OK | LE | — |
| 10 | César ausente 1 semana | M | M | Freeze oficiais; $ scale always | Fila | LE executa só autonomia doc | LE | sem inventar $ |
| 11 | LE gargalo | A | A | Cap 1 B/pessoa/sem | Tempo LE | Reduzir N provas; co-validador | César | hard cap |
| 12 | Compensação sem limite $ | A | A | Tipos + sempre A se dúvida | Ciclos sem A | Escalar; não inventar | SAC/LE | PEND-01 |
| 13 | Passaporte = desempenho | A | M | Cortar campos; anti-ranking UI | Feedback equipe | Reescrever campos | César/design | brief |
| 14 | Dossiê como disciplina | A | M | ACL LE; separação | Acesso indevido | Bloquear; processo externo | César | ACL |
| 15 | IA sugere promoção | A | B-M | E proibido | Log | Bloquear ação | INT/César | red team INT |
| 16 | Caso com classificação errada | M | M | Revisão humana; E-levels | Contestação | Suspender caso | owner | E≥2 |
| 17 | Caso histórico perdeu validade | M | M | valid_until conteúdo | Revisão T4 | Arquivar | owner | vigência |
| 18 | Conteúdo = ler procedimento | M | A | Casos com opções | Review microlição | Reescrever com decisão | owner | blueprint |
| 19 | Métrica incentiva esconder erro | A | M | Segurança relatar; M1 agregado | Queda artificial casos | Pausar M1 nominal | César | cultura F1 |
| 20 | “Jogar” a validação | A | M | Variar âncoras; C amostral | Padrão teatro | Invalidar; mudar prova | LE/César | C |
| 21 | Duplicata WA + DOS | M | M | event_id | Double count | Merge | INT | dedupe |
| 22 | Protocolo TE ≠ live | A | M | Fato DOS prevalece | Conflict state | Revisar protocolo | César | não auto |
| 23 | Canal B stale | M | M | só vigente; valid_until | Flag stale | Unpublish | INT/owner | B rules |
| 24 | Integração offline | B-M | M | Soberanias | Outbox | Sync idempotente | INT | offline runbook |
| 25 | Evento ≥23h fluxo errado | M | M | TZ + day_key | KPI estranho | Corrigir flag | DOS | F1-M14 |
| 26 | LE acessa dado indevido | A | M | ACL dossiê (decisão César) | Audit access | Revogar; treinar | César | ACL |
| 27 | F3/F4 diluem Onda 1 | A | A se não cortar | Onda 1 só F1+F2 | Backlog creep | Adiar B-15/16 | César | onda |
| 28 | Piloto tempo excessivo | A | A se 36 casos | Corte 10–12 / 30–50 min | Pulse carga | Cortar módulos | César | pulse |
| 29 | Equipe vê como punição | A | M | Positivos; sem ranking; tom | Clima / pulse | Comunicar propósito; parar se toxic | César | go/no-go |
| 30 | 1ª entrega com conteúdo demais | A | A | Onda 1 enxuta | Escopo B-05/17 | Freeze escopo | César | escopo |

---

## Síntese: top 5 riscos (desta lista)

1. **Excesso de conteúdo + tempo** (#28, #30, #27).  
2. **Gargalo / validação fraca do LE** (#11, #2, #20).  
3. **Percepção de punição / só falhas** (#29, #3, #19).  
4. **$ sem limite** (#12).  
5. **Passaporte/dossiê como RH ou disciplina** (#13, #14, #26).

---

*Red Team pós-L8 V0.9 · 30 cenários · gates humanos.*
