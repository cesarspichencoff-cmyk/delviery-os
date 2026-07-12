# Pacote Fable — Backlog Fatiado V0.9

> Fatias implementáveis **futuras**. Sem stack.  
> Fontes: Backlog L8 · Protótipo V0.2 · este pacote.

Esforço relativo: **P** · **M** · **G**  
Faixa: **P0** papel/V0 · **P1** digital mínimo · **P2** piloto digital · **P3** INT · **PX** bloqueado

---

## Faixa P0 — Paper / fundação (sem app)

| ID | Item | Dep | Esforço | Pronto quando |
|---|---|---|---|---|
| FB-01 | Congelar pacote Fable V0.9 | — | P | este commit |
| FB-02 | Imprimir kit A–J V0.2 | FB-01 | P | pasta pronta |
| FB-03 | Mapa validadores na loja (N real) | César/LE | P | nomes de **função** preenchidos |
| FB-04 | Go/no-go semanal em uso | FB-02 | P | 1 ciclo simulado real-opcional |
| FB-05 | Decisão $ provisória comunicada | César | P | equipe ciente |

---

## Faixa P1 — Digital mínimo (após visual se app)

| ID | Item | Dep | Esforço | Nota |
|---|---|---|---|---|
| FB-10 | Auth + PersonReference + Role | visual/César | M | |
| FB-11 | Superfície Hoje + Passport 7 campos | FB-10 | M | CA-01 |
| FB-12 | Formação Onda 1 (conteúdo import) | FB-11 | G | F1/F2 only |
| FB-13 | Prática: caso + registrar EV 1 linha | FB-11 | M | CA-02 |
| FB-14 | Fila validador + Validation | FB-13 | M | I-12 |
| FB-15 | Contestation | FB-14 | M | CA-03 I-02 |
| FB-16 | K/S/B progress (C parâmetro) | FB-14 | M | I-01 |
| FB-17 | AccessAudit básico | FB-10 | P | I-13 |
| FB-18 | ContentVersion admin Own | FB-12 | M | I-16 |

**Paridade:** digital ≤ burocracia do papel.

---

## Faixa P2 — Piloto digital / governança

| ID | Item | Dep |
|---|---|---|
| FB-20 | PilotCycle + WeeklyPilotGate | P1 |
| FB-21 | Métricas M3 M4 M10 agregadas | P1 |
| FB-22 | LearningProposal workflow | P1 |
| FB-23 | Offline pending/confirmed | P1 + R-OFF |
| FB-24 | F3/F4 conteúdo (Onda 2) | Onda 1 estável |

---

## Faixa P3 — Integração (missão própria)

| ID | Item | Dep |
|---|---|---|
| FB-30 | Canal A IntegrationReference + dedupe | Contrato INT + César |
| FB-31 | Canal B ProtocolVersion consulta | Metadados + César |
| FB-32 | Canal D agregado | FB-21 |
| FB-33 | Testes I-08 I-09 I-21 replay | FB-30 |

**Fora:** write Foco/Calmo · regra executável auto · Canal C no runtime DOS.

---

## Faixa PX — Bloqueado explicitamente

Ranking · gamificação · promoção auto · dossiê amplo multi-gestor · disciplina · 45/55/65 alertas · multi-loja · IA decide RH · stack nesta missão.

---

## Sequência futura recomendada (Fable — quando autorizado)

```text
1. Ler Pacote Fable V0.9 completo + Gate congelamento
2. Confirmar parâmetros abertos com César (não inventar)
3. ADR transporte/stack (fora deste pacote) — só após visual se app
4. Implementar P1 com testes P0 invariantes
5. Paper parity QA
6. P2 piloto digital
7. P3 INT só com missão + recert live
```

**Não** começar por UI dashboard · **não** plugar no Foco.

---

## Dependências visuais (separadas)

| Visual | Relação |
|---|---|
| Sprint Visual TATÁ | **Bloqueia** app bonito; **não** bloqueia P0 papel |
| Sistema visual DeliveryOS | Família compartilhada; identidade “evoluir” |
| Wireframes | Fora deste pacote; pós-autorização César |

Brief L8 permanece inativo até autorização.

---

*Backlog fatiado V0.9 · P0–P3 · PX bloqueado.*
