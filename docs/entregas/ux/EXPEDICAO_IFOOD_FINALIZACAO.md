# Expedição iFood — finalização (aprovada + 2 ajustes)

| Campo | Valor |
|---|---|
| Status | **Ajustes aplicados · capturas finais geradas** |
| Superfície | `src/entregas/ui/ifood-handoff/` apenas |
| Capturas | `docs/entregas/ux/capturas-ifood-final/` |

## Ajustes obrigatórios

### 1. Aviso temporário + fila FIFO

- Novo pedido: banner “Acabou de ficar pronto” + pulso + som (opcional), **~4,5 s**
- Depois do aviso, a ação **Buscar pedido** e a fila priorizam o pedido **pronto há mais tempo** (`ready_at_ts`)
- Evita que pedidos antigos fiquem para trás

### 2. Conferência acessível + bloqueio real

- Checkboxes nativos com `id` + `label for=…` + `fieldset`/`legend` + `aria-describedby`
- **Entregar ao motoboy**: `disabled` + `aria-disabled` + `pointer-events: none` quando incompleto
- Revalidação em `canDeliverOrder` / `deliverOrder` (não depende só da aparência)

### Identificação

- `Entregador esperado: Lucas · nome informado pelo iFood`
- `Responsável pela entrega: Juliana`

## PARADA

Sem push · sem deploy.
