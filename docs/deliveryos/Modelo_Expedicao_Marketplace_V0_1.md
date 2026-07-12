# Modelo de Expedição Marketplace (iFood e similares) — V0.1

> Handoff para entregador **externo**. Responsabilidade da loja encerra no handoff confirmado.  
> Priorizar **posição do turno**, não nome individual em todo handoff.

---

## 1. Fluxo canônico

```text
pedido pronto (Operação Viva)
  → entregador externo chega (MarketplaceCourierArrival)
  → sacola aguarda handoff
  → responsável da posição entrega
  → MarketplaceHandoff confirmado
  → responsabilidade da loja encerrada
```

---

## 2. Objetos

### MarketplaceCourierArrival
| Campo | Conteúdo |
|---|---|
| at | Chegada |
| channel | ex. iFood |
| order_ref | se já vinculado |
| wait_started | início espera |
| status | waiting · linked · left |

### MarketplaceHandoff
| Campo | Conteúdo |
|---|---|
| order_ref / delivery_id | vínculo |
| position_role | quem no turno (ex. expedição, AO) — **não exige nome** sempre |
| confirmed_at | horário transferência |
| confirmed_by_role | papel |
| exception | se houve |
| status | pending · done · exception |

---

## 3. Estados do pedido no domínio Entregas (marketplace)

| Estado | Significado |
|---|---|
| ready_awaiting_courier | Pronto, sem externo |
| courier_waiting | Externo na loja |
| handoff_pending | Sacola pronta para passar |
| handed_off | Loja encerrou responsabilidade |
| handoff_exception | Falha / dúvida |

---

## 4. Apoio do motoboy da casa

RiderAvailability = `na_loja_apoio_expedicao` quando ajuda handoff.  
**Não** conta como `na_loja_disponivel` para nova viagem própria até sair do apoio.

Ausência de motoboy da casa: posição de expedição/LE assume handoff.

---

## 5. Dados mínimos

- order_ref  
- horário handoff  
- canal  
- position_role  
- status  

**Não** exigir foto do entregador externo nem dados pessoais além do necessário operacional (política futura).

---

## 6. Exceções

| Exceção | Resposta |
|---|---|
| Externo vai embora | courier left; pedido volta a awaiting |
| Pedido errado no handoff | exception; não marcar handed_off |
| Sem registro de handoff | desconhecido; não inventar done |
| Dois pedidos no mesmo externo | dois handoffs ou um batch com 2 refs — explícito |

---

## 7. Fatos para Operação Viva

- qtde aguardando handoff  
- externos waiting  
- tempo de espera médio (futuro)  
- handoff exceptions  

Sem criar Foco diretamente.

---

*Expedição marketplace V0.1 · handoff por posição · encerra loja.*
