# Contrato de experiência — ENTREGAS 3C.1

| Campo | Valor |
|---|---|
| Módulo | **ENTREGAS** |
| Marca provisória do ecossistema | TATA |
| DeliveryOS | reservado ao **COPILOTO** |
| Domínio | COR-ENTREGAS-V1 @ 1.0.3 + ApplicationService |
| Status | Aguarda `EXPERIENCIA ENTREGAS CONFIRMADA` |

## Princípio

A UI **não cria verdade**. Apresenta estado, envia **commands**, mostra eventos e falhas.  
Toda mutação → `UiApplicationFacade` → `EntregasApplicationService`.

## Superfícies

| Superfície | Path demo |
|---|---|
| Console operacional | `/console/` |
| App motoboy interno | `/rider-mobile/` |
| Expedição iFood | `/ifood-handoff/` |

## Proibições

Escrita em FileUnitOfWork · máquina de estados no front · GPS fictício · ranking · conta iFood courier · shell · Copiloto live.

## Como rodar

```bash
npm run ui:entregas
# http://127.0.0.1:5193/console/
```

## Parada

Não ligar UI definitiva ao FileUnitOfWork até confirmação do César.
