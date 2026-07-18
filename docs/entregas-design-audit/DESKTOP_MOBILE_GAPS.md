# Desktop e Mobile — Gaps (sem propor layout)

---

## 1. Desktop da operação (LE / expedição)

| Necessidade | Existe no worktree? | Status |
|---|---|---|
| Visão das viagens | Só modelo Trip multi-status | **Incompleto** — sem tela |
| Expedição / formação de viagem | F6 + assignment | **Contratado**, sem UI |
| Ocorrências | Incident open/resolved | **Parcial** — lista/tipo ausentes |
| Retorno | ReturnEvent confirm | **Contratado**, sem UI |
| Fechamento | completed rules | **Contratado**, sem UI |
| Fila marketplace handoff | Modelo expedição + fatos OV | **Contratado**, sem UI |
| Correlação/comandas revisão | under_review | **Contratado**, sem UI |

### O que já existe (reaproveitar sem redesenhar domínio)
- Lista fechada de estados Trip/Delivery  
- Separação presença ≠ disponibilidade  
- Fatos que sobem para Operação Viva (não Foco direto)  
- Handoff por **posição**, não nome  

### Conflitos
- Nenhum layout desktop conflita — **porque não há layout**.  
- Risco futuro: desktop virar “painel de frota” genérico (red team).

### O que precisa ser finalizado (Missão 2+)
- Hierarquia de informação desktop: **viagens ativas → exceções → filas** (não mapa-first).  
- Filas: waiting_assignment, handoff_pending, under_review, offline conflicts.

**Veredito desktop:** **Contrato pronto · Design visual ausente.**

---

## 2. Mobile do entregador

| Necessidade | Existe? | Status |
|---|---|---|
| Próxima ação | Implícita nas transições (collect, depart, confirm stop) | **Parcial** |
| Rota ou ordem | TripStop sequence; RouteObservation opcional | **Parcial** — ordem sim; mapa não obrigatório |
| Volumes | PickupConfirmation | **Incompleto** |
| Confirmação | DeliveryConfirmation | **Parcial** |
| Exceções | Incident | **Incompleto** (sem tipos de rua) |
| Offline | SyncPending + GPS sem sinal | **Parcial** (regra, sem UX) |
| Uma mão / mínimo texto | **Não especificado** para Entregas | **Ausente** |
| Durante deslocamento | Proíbe inventar GPS; offline local | **Parcial** |

### Protótipos mobile no worktree
- `app-v1` = OV cognitivo — **não** reutilizar como app de motoboy sem contrato novo.  
- Pode herdar: um Foco de atenção, microcopy curta, sem dashboard — **padrão de produto**, não telas.

### Conflitos
- GPS tracking app genérico vs “GPS só sessão + sem ranking”.  
- Excesso de status na mão do rider vs lista V0.1 fechada (risco M no red team).

**Veredito mobile:** **Regras de segurança fortes · jornada de rua e UX one-hand ausentes.**

---

## 3. Síntese

| Superfície | Existe | Incompleto | Conflita | Finalizar |
|---|---|---|---|---|
| Desktop | modelo | 100% visual | n/a | visão viagens + exceções + handoff |
| Mobile rider | modelo | UX + exceções + offline UI | tracking genérico | próxima ação + confirm + offline |
| Mobile LE | — | tudo | — | opcional V1 |
