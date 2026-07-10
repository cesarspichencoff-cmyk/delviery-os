# Cenários Extremos — Pré-Loja

> Stress tests conceituais e gates de promoção de fase **antes** e **durante** o primeiro contato com a loja real.
> Não substitui a inspeção (`docs/Inspecao_Fontes_Reais_Loja_V0.md`); define o que falhar antes de “subir”.
> HEAD: `a441bc7`.

---

## 1. Definição de fases (para este red team)

| Fase | O que é | Dado |
|---|---|---|
| **S0 — Sombra cognitiva** | Registrar o que o cérebro mostraria | Export / janela real (já existe no repo) |
| **S1 — Sombra de captura** | Capturador grava; ninguém olha UI de decisão | Spool e/ou DOM reais ou fixture de loja |
| **T — Teste na loja** | Inspeção + capturador controlado em dia fraco | PC do caixa |
| **P — Piloto visível** | Monitor mostra Calmo/Ambiente/Foco | Live casado |
| **O — Operação real** | Parte do dia a dia | Live estável + rollback |

**Regra:** opinião vaga não bloqueia. Falta de evidência **mensurável** quando a fase depende dela, bloqueia.

---

## 2. Tabela de cenários extremos

| ID | Cenário extremo | Como forçar / simular | Falha esperada se frágil | Gate que quebra | Fase mínima afetada |
|---|---|---|---|---|---|
| X-01 | 50 cartões no Gestor, 12 visíveis | Fixture DOM + virtualização | Status incompleto | Cobertura ≥95% status | S1 |
| X-02 | Job spool <200ms na fila | Print loop + reader lento | Perda de comanda | Captura ≥95% prints | S1 |
| X-03 | Spool `DataType=RAW` binário | Job real Epson | Parser 0% | Legibilidade de texto | T |
| X-04 | 3 reimpressões do mesmo pedido | Replay jobs idênticos | 3 pedidos no motor | Dedup 100% | S1 |
| X-05 | Cancel 5s após print | Eventos fora de ordem | Produz item cancelado | Cancel prevalece | S1 |
| X-06 | Dois pedidos, mesmo código curto | Fixture colisão | Foco no errado | Conflito detectado, não merge silencioso | S1 |
| X-07 | Pedido Animo sem campo IFOOD | Fixture origem | Órfão eterno | Canal não-iFood explicitado | T |
| X-08 | JSONL com linha pela metade | Kill -9 no writer | UI crash | Reader skip + health | S1 |
| X-09 | Relógio -15 min | Set clock (lab) | Falsos atrasos / STALE | Sanidade de clock | T |
| X-10 | Poll UI 30s parado | Throttle aba | Ação sobre morto | Age badge / freeze focus | P |
| X-11 | Capturador 100% CPU | Bug loop | Impressão lenta | CPU budget + kill | T |
| X-12 | Cookie Gestor expira no pico | Sessão timeout | Silêncio de status | Health + alerta de sessão | P |
| X-13 | Layout iFood muda classes | Fixture seletor quebrado | 0 cartões | Fail closed, não clique | S1 |
| X-14 | Seletor errado aponta “Pronto” | Code review adversarial | Muda pedido real | **Proibição de clique** | T |
| X-15 | Endereço cliente no JSON servido na LAN | Scan rede | Vazamento PII | Bind + campos mínimos | P |
| X-16 | Rasura em 10% das comandas | Amostra operacional | Falsa conferência | Copy “impresso ≠ final” | P |
| X-17 | Baseline errado em dia fraco | Segunda com BASELINE de sexta | Foco inútil | Não calibrar live ainda | P |
| X-18 | Mapa: “Quentes” = cozinha do motor | Demo para César | Confiança morta | Validação vocabulário | P |
| X-19 | Sacola: quente+frio 3 itens | Regra real vs motor | Foco conf errado | Não exibir sacola como fato | P |
| X-20 | Reinício no meio de 15 prints | Reboot lab | Perda de 15 | Persistência append-only | S1 |
| X-21 | Dois capturadores acidentais | Duas tasks | Dup eventos | Lock de instância | T |
| X-22 | Equipe fecha aba “errada” (a do capturador) | UX | Status morre | Processo separado / tray | P |
| X-23 | Export pós-turno diverge do live do dia | Diff fim do dia | Sombra inútil | Reconciliação diária | O |
| X-24 | Operador grita UUID | UI sem curto/sequência | Ignora tela | ID gritável com desambig | P |

---

## 3. Achados no formato padrão (amostra crítica)

### X-FIND-01 — RAW spool é o “assassino silencioso” da aposta Epson

| Campo | Conteúdo |
|---|---|
| **ID** | X-FIND-01 |
| **Gravidade** | Crítica |
| **Evidência** | Inspeção V0 não mediu `DataType`; drivers térmicos frequentemente emitem RAW/ESC-POS |
| **Arquivo** | `Inspecao_Fontes_Reais_Loja_V0.md` §4; `Auditoria_Fonte_Viva` opção 1/2 |
| **Cenário** | X-03 |
| **Impacto** | Toda a “aposta principal” de itens desaba; restam banco Odhen (incerto) ou abrir detalhe no Gestor (risco) |
| **Validar** | Um job real: `DataType` + se spool file é texto |
| **Recomendação** | Gate T obrigatório antes de qualquer parser de produção |
| **Bloqueia Sombra S1 itens?** | Sim se S1 depende de spool |
| **Bloqueia real?** | Sim para Motor B via spool |
| **Depende inspeção?** | Sim |
| **Confiança** | Média-alta (padrão de indústria + ausência de prova contrária) |

### X-FIND-02 — Clique acidental é falha de categoria, não de bug

| Campo | Conteúdo |
|---|---|
| **ID** | X-FIND-02 |
| **Gravidade** | Crítica |
| **Evidência** | Arquitetura proíbe clique em ações; automação de browser é superfície clássica de seletor errado |
| **Arquivo** | `Arquitetura_Sincronizacao_Local_V1.md` §3.5; `Auditoria_Fonte_Viva` §6.3 |
| **Cenário** | X-14 |
| **Impacto** | Cancelar/pronto indevido = dano operacional real, possivelmente financeiro e de cliente |
| **Validar** | Code review: zero APIs de click em produção; testes que falham se click existir |
| **Recomendação** | Feature flag `ALLOW_CLICK=false` hardcoded; PR com click = rejeição automática do checklist |
| **Bloqueia Sombra?** | Não se só DOM read |
| **Bloqueia real?** | Sim se houver click path |
| **Depende inspeção?** | Não |
| **Confiança** | Alta |

### X-FIND-03 — Half-match em volume é o estado normal, não a exceção

| Campo | Conteúdo |
|---|---|
| **ID** | X-FIND-03 |
| **Gravidade** | Alta |
| **Evidência** | Fluxo assíncrono print vs Gestor documentado; pico de 20 em preparo |
| **Arquivo** | `Arquitetura_Sincronizacao` §4 “nó de risco” |
| **Cenário** | X-01, R-09, R-10 |
| **Impacto** | Se o consolidator espera casamento perfeito, atraso artificial de atenção |
| **Validar** | Métricas % tempo em `parcial_*` em fixture de pico |
| **Recomendação** | Motor só consome `casado` ou regras explícitas por tipo de sinal |
| **Bloqueia Sombra?** | Não se registrar parciais |
| **Bloqueia real?** | Sim se inventar o resto |
| **Depende inspeção?** | Latências reais sim |
| **Confiança** | Alta |

---

## 4. Checklists de promoção de fase

### Entrar em S0 (sombra cognitiva) — pode agora

- [x] Motor + Decisão com `active` no caminho V1
- [x] Contrato cognitivo documentado
- [x] Janelas reais / export path documentados
- [ ] `data/raw` presente na máquina que for rodar (local)
- [ ] Log de sombra: modo, sit.kind, ação ou foco puro, confiança, fonte, timestamp
- [ ] Banner/modo `replay|sombra` inequívoco

### Entrar em S1 (sombra de captura)

- [ ] Inspeção DOM classificada A/B/C/D
- [ ] Inspeção spool: DataType, tempo na fila, impacto impressão = zero
- [ ] Contrato de eventos implementado + testes de dedup/cancel/partial
- [ ] Zero click path
- [ ] Persistência append-only + recover
- [ ] Health de capturador logado
- [ ] Pause/kill documentado
- [ ] Sem PII no log além do mínimo (preferir IDs operacionais)

### Entrar em T (teste loja dia fraco)

- [ ] Todos S1
- [ ] Critério de parada afixado (impressão / CPU / reclamação)
- [ ] Nível de isolamento adequado ao modelo DOM
- [ ] Observador humano (não o capturador) no primeiro turno
- [ ] Diff amostra papel × capturado ≥ N pedidos

### Entrar em P (piloto visível)

- [ ] T sem incidente de impressão
- [ ] Cobertura e latência dentro de limiares escritos **antes** do teste
- [ ] UI: age, health fonte, sem embalagem-fato, ID gritável
- [ ] Vocabulário Quentes/Cozinha validado se mapa/copy de praça expostos
- [ ] Rollback: desligar captura e UI em <1 min

### Entrar em O (operação real)

- [ ] Sexta e domingo sem interferência
- [ ] Reconciliação com export pós-turno
- [ ] Equipe não reporta atrapalhar
- [ ] Política de dados e backup do raw local resolvidos
- [ ] Aprovação explícita César

---

## 5. Limiares sugeridos (propostas — não calibrados)

> Propostas de red team para o Fable **escrever como constantes de teste**, não como verdade de loja.

| Métrica | S1 lab | T segunda | P sexta |
|---|---|---|---|
| Captura de prints | ≥99% fixture | ≥95% real | ≥98% |
| Impacto impressão | 0 ms perceptível | 0 reclamação | 0 reclamação |
| Status coverage (se Modelo A) | ≥99% | ≥95% | ≥97% |
| Dedup reimpressão | 100% | 100% | 100% |
| False merge colisão ID | 0 | 0 | 0 |
| CPU capturador | <5% idle média lab | <10% pico | <10% |
| Age snapshot UI | — | — | <15s ou freeze |

Qualquer limiar só vira “oficial” com aprovação César após medição real.

---

## 6. Priorização extrema

### Bloqueadores S1

- X-FIND-01 (se itens via spool), classificação DOM, dedup, no-click, persistência

### Bloqueadores T

- Impacto zero na impressão, isolamento, amostra papel×digital

### Bloqueadores P/O

- Age/health, PII/rede, copy honesta, cancel, ID gritável, não-poluição UI, picos reais

### Não são bloqueadores (dívida)

- Embalagens V0 completas
- Mapa 6 ambientes
- Memória operacional
- API iFood oficial (desejável, não pré-requisito se live bridge provar)

---

*Este documento é o “que pode explodir”. O checklist de PR está em `Checklist_Adversarial_Revisao_Fable.md`.*
