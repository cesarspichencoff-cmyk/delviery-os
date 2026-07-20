# Erros de browser e rede — 3C.1A

## Antes da correção de API

| Tipo | Qtd | Causa |
|---|---|---|
| console error 400 | 5 | Rejeição de domínio via HTTP 400 |
| console 404 | 1 | favicon ou asset pontual (não crítico de fluxo) |
| network_fails 400 | 5 | Mesmas rejeições de domínio (limite 6, handoff sem verify, etc.) |

## Depois da correção

- `/api/command` retorna **200** com `result.ok=false`  
- UI humaniza mensagem  
- 400 de negócio deixa de poluir console como “falha de rede”

## Deep links

| Rota | Status após fix de static root |
|---|---|
| `/console/` | 200 |
| `/rider-mobile/` | 200 |
| `/ifood-handoff/` | 200 |
| `/map-poc/` | 200 |

## Refresh

Snapshot re-hidrata da facade em memória — **sessão se perde no restart do servidor** (limitação demo). Refresh de página mantém enquanto processo node vivo.

## Botões mortos

Antes: “Confirmar saída” ativo em retornando.  
Depois: desabilitado por estado.
