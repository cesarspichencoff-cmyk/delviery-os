# Pacote Fable — Catálogo de Testes e Red Team V0.9

> Testes **futuros** de produto (não executar agora).  
> Fontes: RedTeam protótipo · pós-L8 · integração · invariantes I-01…I-25.

---

## 1. Testes de invariante (obrigatórios)

| Teste | Invariante | Tipo | Esperado |
|---|---|---|---|
| T-I01 | I-01 | unit/fluxo | Conteúdo done ≠ competency complete |
| T-I02 | I-02 I-18 | estado | Contestada ∉ Passport consolidado |
| T-I03 | I-03 | política | 1 EV falha não “define pessoa” |
| T-I04 | I-04 | ACL | IA blocked on Val/A/promo |
| T-I05 | I-05 I-06 | UI/papel | Sem ranking/compare |
| T-I07 | I-07 | data | Disciplina field rejected |
| T-I08 | I-08 I-09 | INT | No write motor/Foco |
| T-I10 | I-10 | ACL | LE dossiê full denied |
| T-I12 | I-12 | ACL | Same actor sensitive path denied |
| T-I14 | I-14 | version | Superseded not vigente |
| T-I17 | I-17 | validação | Personalidade text rejected |
| T-I19 | I-19 | conteúdo | No invented currency amounts |
| T-I20 | I-20 | conteúdo | No unconfirmed kit BOM |
| T-I21 | I-21 | deploy | V1 runs without INT |
| T-I22 | I-22 | modo | Paper mode complete path |

*(Cobertura completa I-01…I-25 no plano de QA futuro — 25 casos mínimos.)*

---

## 2. Testes de fluxo (F1–F18)

| ID | Fluxo | Critério sucesso |
|---|---|---|
| T-F01 | Próximo passo | &lt;10 s compreensão |
| T-F05 | EV | ≤45 s |
| T-F06 | Validar | escopo + resultado |
| T-F07 | Contestar | ≤60 s; suspensa |
| T-F08 | K/S/B/C | ordem sem pular com só conteúdo |
| T-F09 | Passport | só aprovada |
| T-F15 | Gate | GO/CORRIGIR/PAUSAR |
| T-F16 | Papel | kit A–J path |
| T-F17 | Offline | pending→confirmed; no silent loss |
| T-F18 | Canal A | humano antes regra |

---

## 3. Red team produto (amostra catalogada — 40+)

### Carga e burocracia
RT-01 LE centraliza → estoura 75 · RT-02 S3 sem rodízio · RT-03 metade do tempo · RT-04 formulário longo · RT-05 N&gt;12 sem redistribuir

### Anti-punição e cultura
RT-10 só falhas na semana · RT-11 zero positivo · RT-12 caso como castigo · RT-13 dossiê disciplina · RT-14 Passaporte=promoção

### Validação e abuso
RT-20 validar sem observar · RT-21 jogar validação · RT-22 DS≠AO conflito · RT-23 cria+valida+aprova sensível · RT-24 atribuição errada

### Contestação
RT-30 contestação acumulada · RT-31 consolidar durante suspensa · RT-32 apagar histórico v1

### Conteúdo e $ / kit
RT-40 $ sem A · RT-41 inventar valor · RT-42 kit inventado · RT-43 45/55/65 em conteúdo · RT-44 protocolo stale como vigente

### Integração / tempo
RT-50 double-count WA+DOS · RT-51 replay duplica · RT-52 evento ≥23h day_key · RT-53 INT offline · RT-54 PII no payload · RT-55 TE cria Foco

### Acessibilidade / operação
RT-60 dificuldade leitura · RT-61 ausente 1 sem · RT-62 novo na S3 · RT-63 César ausente · RT-64 pico atípico (proibir estudo)

**Total catalogado nesta versão: 25 invariantes + 10 fluxos âncora + 30 RT = ~65 itens de teste futuro.**

---

## 4. Prioridade de execução futura

P0: I-01 I-02 I-04 I-05 I-08 I-09 I-12 I-18 · F5 F7 F9 F16  
P1: carga RT-01..05 · anti-punição RT-10..14 · $ RT-40  
P2: INT RT-50..55 · offline F17  

---

*Catálogo testes V0.9 · ~65 · não executado agora.*
