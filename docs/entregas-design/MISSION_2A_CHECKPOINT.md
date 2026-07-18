# Checkpoint Missão 2A → 2B (Entregas)

| Campo | Valor |
|---|---|
| Missão | 2A — Decisões de produto e arquitetura da experiência |
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-tata-evolucao` |
| Branch | `research/tata-evolucao-grok` |
| HEAD base | `6a78726` |
| Docs | `docs/entregas-design/*` |

---

## 1. Decisões fechadas

- Tese + o que Entregas **não** é  
- Fronteira Foco = Copiloto/OV; Entregas = consciência de **viagem**  
- Taxonomia E01–E10 (`EXCEPTION_TAXONOMY.md`)  
- Modelo de volumes V-01…V-07  
- Tentativas como evento `DeliveryAttempt` (T-01…T-06); sem sucesso ≠ fim  
- Mobile V0.1 escopo include/exclude  
- Mapa = apoio sob demanda; UX sem mapa  
- Notificações enxutas e anti-spam  
- Reenvio: novo delivery_id + vínculo; $ no Caixa; decisão LE/OV/Copiloto  
- Desktop = Mesa de Expedição com **Trip** como objeto principal  
- Linha visual conceitual da viagem (não brand novo)  
- 20 jornadas de protótipo  
- Princípios de microcopy  

## 2. Decisões provisórias

| ID | Tema |
|---|---|
| P1 | Máx. 2 tentativas por entrega na mesma viagem |
| P2 | Faixas de retenção (não prazo jurídico final) |
| P3 | “Cheguei” opcional se GPS fraco |
| P4 | Foto E06 opcional |

---

## 3. Desktop V0.1

**Mesa de Expedição:** filas de ação na loja + viagens ativas + detalhe com linha do tempo, paradas, volumes, exceções, sync.  
Sem grade genérica de cards; sem mapa central.

## 4. Mobile V0.1

**Próximo passo:** viagem atual, parada, ordem, ref, volumes, confirmar, exceção, retorno, offline/sync.  
Uma mão; uma CTA dominante.

## 5. Mapa

Apoio opcional; oculto no default; funciona 100% textual.

## 6. Exceções / volumes / tentativas / offline / privacidade

| Tema | Doc |
|---|---|
| Exceções | `EXCEPTION_TAXONOMY.md` |
| Volumes / tentativas / notif / reenvio / retenção | `PRODUCT_DECISIONS.md` |
| Offline UX | Mobile badge + SyncPending; conflito no desktop |
| Privacidade | Mínimo; GPS sessão; anti-ranking; retenção provisória |

## 7. Jornadas do protótipo

J1–J20 em `JOURNEY_AND_STATE_MATRIX.md`.

---

## 8. Missão 2B — o que poderá criar

Especificações de protótipo / handoff visual (sem código runtime obrigatório):

```
docs/entregas-design/
  DESKTOP_SCREENS.md          # ou equivalente
  MOBILE_SCREENS.md
  PROTOTYPE_SCENARIOS.md      # 20 jornadas → telas
  COMPONENT_NOTES.md          # linha da viagem, badges epistemológicos
  DESIGN_HANDOFF.md
  MISSION_2B_CHECKPOINT.md
```

Opcional se autorizado: protótipo **estático** HTML **novo** só de Entregas (não editar `app-v1` / `parados-agora`).

## 9. Itens proibidos na 2B e além (V0.1)

- Redesenhar trip_id/delivery_id/transições canônicas / anti-dup impressão  
- Ranking, GPS punitivo, mapa-hero, chat, $ em Entregas  
- Write em Calmo/Ambiente/Foco  
- Integração live Copiloto  
- Push/deploy/merge  
- Alterar outros worktrees  
- Inventar dezenas de novas categorias de exceção  
- Tratar reenvio como fluxo financeiro  

## 10. Pronto para 2B?

**SIM** — decisões e arquitetura bastam para especificar telas/protótipo fiel ao contrato.
