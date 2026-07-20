# Checkpoint visual — experiência aprovada (pré-piloto)

| Campo | Valor |
|---|---|
| Registrado em | 2026-07-20 |
| Commit | `bb567a6` (exp. iFood final) + commits de gate piloto no HEAD atual |
| Worktree | `deliveryos-entregas-v1` / `feature/entregas-v1` |
| Copiloto V3.3 | **não alterado** |

## Telas aprovadas

| Superfície | Caminho UI | Capturas |
|---|---|---|
| Console | `src/entregas/ui/console/` | `docs/entregas/ux/capturas-redesign/` |
| Mobile motoboy | `src/entregas/ui/rider-mobile/` | idem |
| Expedição iFood | `src/entregas/ui/ifood-handoff/` | `docs/entregas/ux/capturas-ifood-final/` |

## Tokens canônicos

- `src/entregas/ui/shared/tokens.css`  
- Cânone: Sprint Visual DeliveryOS V2  
- Fontes: Spectral · Hanken Grotesk · IBM Plex Mono  
- Verde ação `#22563C` · creme · âmbar tensão  

## Fluxos aprovados

1. Montar viagem (pedidos próprios) → confirmar saída  
2. Mobile: a caminho → Abrir rota; Cheguei; Confirmar entrega; problema secundário  
3. Offline UI: indicação + sync automática (ver limitações)  
4. iFood: contador → aviso temporário → FIFO antigo → buscar → conferir 3 itens → entregar ao motoboy  

## Comportamento iFood (checkpoint)

- Aviso único e temporário (~4,5 s)  
- Prioridade ao pedido pronto há mais tempo  
- Checkboxes nativos acessíveis  
- `disabled` real em “Entregar ao motoboy”  
- Nome do motoboy opcional  

## Limitações assumidas (não redesenhar)

- Sem GPS de produção  
- Sem mapa obrigatório (MapLibre experimental)  
- Demo UI usa memória; piloto usa FileUnitOfWork  
- Offline real de dispositivo = parcialmente coberto (ver auditoria)  

## Explicitamente fora do piloto

- Redesign visual amplo  
- Shell global  
- Copiloto live  
- Multi-unidade  
- Atribuição automática  
- Roteamento automático  
- Ranking / vigilância  
