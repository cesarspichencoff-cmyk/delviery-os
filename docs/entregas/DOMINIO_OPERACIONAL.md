# Domínio operacional Entregas — 3B.1

Autoridade de estados/eventos: **COR-ENTREGAS-V1 @ 1.0.3** (única máquina).

## Agregados

| Agregado | Responsabilidade |
|---|---|
| **Trip** | Viagem própria; `trip_id` pré-saída; rider interno; paradas; retorno; fechamento |
| **Delivery** | Pedido próprio; active; confirmação; G1–G5; remoção histórica |
| **Handoff** | Expedição iFood; sem Trip; courier externo verificado; volumes |
| **Occurrence** | Relato→fechamento; `blocks_availability` |
| **RiderOperationalState** | Só motoboy da casa; estados COR §9.3 |

## Commands vs Events

- **Commands** (`operational/commands.ts`): intenção autorizada.
- **Events** (`foundation` + catálogo público): fatos imutáveis.
- Evento **não** é comando.

## Regras preservadas

- trip_id antes da saída  
- active=false fora G1–G5  
- arrival ≠ confirm  
- trip_return_started sem require_all stops  
- G3 unconfirmed  
- unconfirmed não bloqueia retorno  
- retorno ≠ confirm entrega  
- Handoff não cria Trip  

Código: `src/entregas/operational/` + `src/entregas/foundation/`.
