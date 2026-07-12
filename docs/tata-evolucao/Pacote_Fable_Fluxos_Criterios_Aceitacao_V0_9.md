# Pacote Fable — Fluxos e Critérios de Aceitação V0.9

> 18 fluxos canônicos + superfícies + critérios mensuráveis.  
> **Sem** layout visual.

---

## A. Superfícies funcionais (comportamento)

| Superfície | Usuário | Pergunta | Ação dominante | Mínimo | Proibido | Vazio / erro / offline |
|---|---|---|---|---|---|---|
| **A. Hoje** | Part | Próximo passo? | Continuar passo | proximo_passo · evidencia · validador | Ranking, KPI loja | “Tudo em dia” / sem trilha / cache local |
| **B. Formação** | Part | O que estudar? | Abrir micro | módulo Onda 1 | 45/55/65 | Sem módulo / versão stale |
| **C. Prática** | Part | O que decidir/fazer? | Caso ou sim ou EV | 1 atividade/sem | Redação longa | Sem atividade na semana |
| **D. Passaporte** | Part | Onde estou? | Entender status | 7 campos | Score, comparação | Contestação aberta visível |
| **E. Líder/Validador** | DS AO LE | O que validar agora? | **1** evidência | fila curta | Dossiê full, ranking equipe | Fila vazia / fora de escopo |
| **F. Governança** | Own Ç | O que versionar? | Aprovar/suspender conteúdo | owner versão | Pub sem A | Conflito de versão |
| **G. Auditoria** | Ç | Quem acessou? | Auditar | AccessAudit | PII desnecessário | — |

**Casos:** embutidos em B/C — **sem aba obrigatória**.  
Princípio: menos áreas, mais inteligência.

---

## B. Fluxos 1–18 (resumo contratual)

### F1 — Próximo passo
| | |
|---|---|
| Gatilho | Login / abertura Hoje / papel |
| Atores | Part, Sys |
| Passos | Ler PassportStep ativo |
| Decisão | Uma ação |
| Inicial → final | passo pendente → em_curso |
| Sucesso | Compreende em &lt;10 s (**I-15**) |
| Exceção | Sem passo → LE atribui |

### F2 — Microlição
Gatilho: escolher micro · Part · ler/decidir 5–6 min · status atividade · Sucesso: duração respeitada · Exceção: abandonar sem K forçado.

### F3 — Caso interativo
Gatilho: caso da semana · Part · escolher A–D · feedback raciocínio · sem placar · Sucesso: decisão + princípio.

### F4 — Simulação
Gatilho: semana sim · papéis · 12–15 min total · observador · Sucesso: erros críticos evitados · Exceção: cortar se pico loja.

### F5 — Registrar evidência
Gatilho: observação · DS/AO/LE · 1 linha fato · capturada · **I-17** · 30–45 s · Proibido: personalidade.

### F6 — Validar evidência
Gatilho: fila · validador escopo · aprovada|insuficiente|devolvida · **I-12** se sensível · &lt;1 min se claro.

### F7 — Contestar
Gatilho: Part discorda · 1 linha · suspensa · **I-02 I-18** · substituto revisa · ≤1 min abrir.

### F8 — Avançar K/S/B/C
Gatilho: validação prova · atualiza CompetencyRequirement · **I-01** · C com parâmetro pendente.

### F9 — Atualizar Passaporte
Gatilho: EV aprovada não suspensa · campos permitidos só · **I-06**.

### F10 — Foco de desenvolvimento
Gatilho: LE · 1 foco · aprovado · no Passaporte.

### F11 — Boa prática → aprendizado
Gatilho: EV positiva / P12 · LearningProposal rascunho · humano aprova · **I-23**.

### F12 — Caso operacional → conteúdo
Gatilho: ocorrência · proposta · **não** regra auto · revisão humana.

### F13 — Versionar conteúdo
Gatilho: Own · ContentVersion · A César se oficial · **I-14 I-16**.

### F14 — Protocolo provisório / suspensão
Gatilho: César · metadados Canal B · Pub ou Sus · **I-08** sem motor.

### F15 — Gate semanal piloto
Gatilho: fim semana · GO|CORRIGIR|PAUSAR · critérios Plano V0.2 · **I-24 I-25**.

### F16 — Operar sem app
Gatilho: modo papel · kit A–J · mesmos invariantes · **I-22**.

### F17 — Offline futuro + sync
Gatilho: sem rede · fila local · pending · sync idempotente · sem perda silenciosa · conflito → humano.

### F18 — DOS → evidência anon (futuro)
Gatilho: Canal A · IntegrationReference · revisão humana · **nunca** auto-competência · **I-09 I-21**.

---

## C. Critérios de aceitação mensuráveis (produto V1)

| ID | Critério | Como medir |
|---|---|---|
| CA-01 | Próximo passo &lt;10 s | Teste usabilidade / inspeção Hoje |
| CA-02 | EV registro ≤45 s meta | Cronômetro fluxo F5 |
| CA-03 | Contestação ≤60 s abrir | Fluxo F7 |
| CA-04 | I-02: contestada ∉ consolidada | Teste estado |
| CA-05 | I-01: conteúdo ≠ competência | Teste só K sem B |
| CA-06 | I-05/06: sem ranking/comparação | Inspecção UI/papel |
| CA-07 | I-09: zero write Foco/Calmo | Teste integração negado |
| CA-08 | I-12: segregação sensível | Teste ACL |
| CA-09 | I-10: LE ≠ dossiê full | Teste ACL |
| CA-10 | Caps carga configuráveis | Config + relatório semana |
| CA-11 | Paper parity | Kit A–J mapeado |
| CA-12 | Offline: pending ≠ confirmed | Estados F17 |
| CA-13 | Idempotência replay INT | event_id noop |
| CA-14 | Sem $ inventado | Conteúdo/scan |
| CA-15 | Sem kit inventado | Conteúdo/scan |
| CA-16 | Independente DOS V1 | Build sem INT |

---

*Fluxos e aceitação V0.9.*
