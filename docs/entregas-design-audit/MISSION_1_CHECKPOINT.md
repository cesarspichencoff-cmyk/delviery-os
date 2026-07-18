# Checkpoint Missão 1 → Missão 2 (Entregas Design)

| Campo | Valor |
|---|---|
| Missão | 1 de 2 — Auditoria de produto e prontidão de design |
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-tata-evolucao` |
| Branch | `research/tata-evolucao-grok` |
| HEAD base auditoria | `a03508c` |
| Pasta desta auditoria | `docs/entregas-design-audit/` |

---

## 1. Materiais encontrados

- **10** documentos canônicos Entregas V0.1 em `docs/deliveryos/`  
- Fronteiras de domínio + mapa mestre  
- **0** wireframes Entregas neste worktree  
- **0** protótipos UI de viagem/motoboy  
- Protótipos `app-v1` / `parados-agora` = **Operação Viva**, não Entregas  
- Material TATÁ Evolução/Fable = formação (offline conceitual reutilizável, produto distinto)

### Versão mais avançada

**Pacote Entregas V0.1** (`Fundacao` + `Fluxos` + `Modelo_Viagens` + `Marketplace` + `Comandas` + `Riscos`).

---

## 2. Decisões preservadas (não redesenhar)

1. Calmo/Ambiente/**Foco** só **Operação Viva**  
2. Entregas emite **fatos**, não escreve Foco  
3. **1 Delivery por pedido lógico**; reimpressão não cria Delivery  
4. Nome+endereço **não bastam** para fundir  
5. **Presença ≠ disponibilidade**; apoio expedição ≠ livre  
6. Retorno **confirmado** antes de disponível  
7. GPS **só sessão de viagem** + consent; sem ranking/punição  
8. Handoff marketplace por **position_role** (sem nome obrigatório)  
9. Desconhecido **visível**; não inventar canal/posição  
10. Offline: pending/conflict; **sem perda silenciosa**  
11. Completed sem coleta/saída quando modo exige = **proibido**

---

## 3. Jornadas

| Classe | IDs |
|---|---|
| **Completas** (domínio) | 1 preparar, 2 adicionar, 4 atribuir, 6 saída, 8 confirmar entrega, 15 retorno, 18 fechamento, 20 multi-entrega |
| **Parciais** | 3 ordenar, 5 volumes, 7 acompanhar, 10 endereço, 16 offline, 17 reconciliação, 19 ocorrência aberta |
| **Ausentes** | 9 não atende, 11 avariado, 12 pagamento (fora domínio), 13 recusada, 14 reenvio |

Marketplace F14–F17: **completas** no domínio (paralelas).

---

## 4. Estados

| Classe | Lista |
|---|---|
| **Completos** | preparação, pronta sair, aguardando entregador, em rota, parada concluída, retorno, parcial, concluída, loc indisponível, dado desatualizado (+ fechamento provisional/confirm no modelo) |
| **Parciais** | ocorrência aberta, offline, conflito, falha técnica, fechamento pendente (expressão UI) |
| **Ausentes** | tentativa sem sucesso (attempt), sincronizando (explícito) |

---

## 5. Desktop / Mobile

| | Status |
|---|---|
| **Desktop** | Contrato de filas/viagens/ocorrências/retorno/fechamento **sem UI** |
| **Mobile** | Regras de segurança GPS/offline **sem UX one-hand nem exceções de rua** |

---

## 6. Ocorrências / Offline / Privacidade

| Tema | Status |
|---|---|
| Ocorrências | Objeto Incident; **sem taxonomia de rua** |
| Offline | SyncPending + fluxo 18; **sem protótipo** |
| Privacidade | GPS sessão, anti-ranking, minimização; retenção **pendente** |

---

## 7. Conexão futura com Copiloto

Documentada em `COPILOT_BOUNDARY.md`:  
Entregas emite filas/capacidade/stale/handoff/incident/offline → Copiloto/OV consome → execução fica em Entregas.  
**Sem integração técnica na Missão 2.**

---

## 8. Lacunas bloqueantes para “protótipo visual final”

1. Ausência total de **design visual** Entregas neste worktree  
2. Jornadas de **exceção de rua** (9,11,13,14)  
3. UX **mobile** (próxima ação, offline, uma mão)  
4. Decisões D1–D7 em `FINAL_DESIGN_READINESS` (taxonomia, volumes, tentativas, escopo mobile, mapa, notificações)  

**Não bloqueante:** domínio Trip/Delivery/Handoff/correlação — já suficiente como esqueleto.

---

## 9. Escopo exato da Missão 2

### Missão 2 **deve**

- Consolidar **especificação de design** (hierarquia, estados de interface, jornadas de exceção propostas, desktop vs mobile, microcopy de chão, red team visual)  
- Partir do contrato V0.1 **sem reinventar** objetos/estados canônicos  
- Produzir docs em pasta dedicada de design Entregas (a definir na Missão 2)  
- Manter fronteira OV / Copiloto / Evolução  

### Missão 2 **não deve**

- Redesenhar regras listadas na §2  
- Implementar código runtime Entregas  
- Alterar `app-v1`, motor, live, outros worktrees  
- Deploy, push, merge  
- Integrar Copiloto de fato  
- Introduzir ranking, GPS punitivo, mapa-first no pico  
- Absorver pagamento/Caixa  
- Inventar layouts a partir de arquivos reais sem gate  

### Arquivos que a Missão 2 **poderá** criar (sugestão)

```
docs/entregas-design/   # ou nome autorizado na Missão 2
  INFORMATION_HIERARCHY.md
  DESIGN_STATE_MATRIX.md
  FLAGSHIP_JOURNEYS.md
  EXCEPTION_TAXONOMY.md
  DESKTOP_SPEC.md
  MOBILE_RIDER_SPEC.md
  MICROCOPY.md
  DESIGN_RED_TEAM.md
  DESIGN_HANDOFF.md
  MISSION_2_CHECKPOINT.md
```

Sem HTML de produção obrigatório na 2, salvo se a Missão 2 autorizar protótipo estático **novo** (não editar OV).

### Itens que **não** devem ser redesenhados

- trip_id / delivery_id / stops / assignment  
- Transições Trip e return confirm  
- Modelo correlação e níveis de confiança  
- Marketplace position_role  
- Fronteiras Foco  
- GPSConsentSession e anti-ranking  
- Lista de desconhecidos (pode **estender**, não apagar)

---

## 10. Prontidão

| Pergunta | Resposta |
|---|---|
| Missão 1 concluída? | Sim (auditoria) |
| Pronto para Missão 2? | **SIM** |
| Pronto para pixels finais sem decisão? | **NÃO** — faltam D1–D7 e jornadas de rua |

---

## 11. Índice dos docs da Missão 1

1. `ASSET_INVENTORY.md`  
2. `OPERATIONAL_CONTRACT_AUDIT.md`  
3. `JOURNEY_COVERAGE.md`  
4. `DESIGN_STATE_COVERAGE.md`  
5. `DESKTOP_MOBILE_GAPS.md`  
6. `COPILOT_BOUNDARY.md`  
7. `DESIGN_RED_TEAM.md`  
8. `FINAL_DESIGN_READINESS.md`  
9. `MISSION_1_CHECKPOINT.md` (este)
