# Auditoria de prontidão — ENTREGAS piloto controlado

| Campo | Valor |
|---|---|
| Data | 2026-07-20 |
| Escopo | 1 unidade · 1 instância · poucos usuários |

## Inicialização

| Item | Situação | Evidência |
|---|---|---|
| Instalação limpa | `npm install` + `npx tsc` | package.json |
| Config piloto | `config/entregas-pilot.example.json` → copiar para `entregas-pilot.json` | obrigatório tokens |
| Demo | `npm run ui:entregas` · porta **5193** · bind 127.0.0.1 | `tools/entregas_ui_server.ts` |
| Piloto | `npm run ui:entregas:pilot` · bind configurável (0.0.0.0) | `tools/entregas_pilot_server.ts` |
| Interfaces | /console/ · /rider-mobile/ · /ifood-handoff/ | health API |
| Celular | Wi-Fi LAN + IP da máquina + porta; HTTPS não incluso | runbook |
| Falta config | servidor piloto falha com mensagem clara | loadPilotConfig |

## Persistência

| Item | Situação |
|---|---|
| Onde grava | `data/entregas-pilot/store.json` (+ ready_orders.json, ops.log.jsonl) |
| Atomicidade | write tmp + rename; `.bak` local |
| Reinício | FileUnitOfWork recarrega arquivo (teste gate + P02 aceite) |
| Backup | automático + manual versionado com SHA-256 |
| Restore | validação JSON antes de substituir; cópia pre-restore |
| Multi-instância | **NÃO suportado** — uma instância de backend apenas |
| Limite | não é SQL cluster; corrupção exige restore; sem HA |

## Rede

| Item | Demo | Piloto |
|---|---|---|
| Celular → servidor | localhost only no demo | bind 0.0.0.0 + token |
| Perda Wi-Fi | UI pode marcar offline (demo) | comandos falham se servidor offline; **fila offline no browser ainda limitada** |
| Idempotência | command_id no domínio/outbox | + bloqueio de command_id na facade piloto |
| Servidor indisponível | erro de rede no fetch | mensagem humana + log |

## Sessões e acesso

| Papel | Role domínio | Como identifica no piloto |
|---|---|---|
| Operador console | operador_expedicao | token em config |
| Motoboy interno | motoboy_interno | token |
| Expedição iFood | operador_expedicao | token dedicado |
| Admin piloto | gerente | token admin (backup/restore) |

**Não** confiar em nome digitado livremente: piloto exige `Authorization: Bearer <token>` / login por token.

Demo ainda permite select de papel (ambiente de demonstração apenas).

## Segurança operacional

| Controle | Status |
|---|---|
| assertCan por papel | domínio |
| command_id repetido | bloqueado na facade piloto |
| Handoff/entrega duplicada | domínio terminal + log |
| Ator + horário | commands com actor + occurred_at |
| Trilha | events + ops.log.jsonl |
| PII | política de não armazenar perfil de motoboy iFood |

## Tempo e ordenação

| Item | Status |
|---|---|
| Timezone config | America/Sao_Paulo (config) |
| occurred_at | preservado (integração offline outbox) |
| FIFO iFood | ready_at_ts na UI iFood |
| Aviso único | flag alerted |

## Offline

| Capacidade | Evidência / limite |
|---|---|
| Demo offline toggle | UI facade connection + pending_sync visual |
| Offline real mobile com fila local persistente após fechar browser | **não completo** — risco aceitável documentado; não declarar “offline total” |
| Sync automática ao voltar | parcial (demo); piloto assume rede da unidade estável |

Ver PILOT_LIMITATIONS.md.
