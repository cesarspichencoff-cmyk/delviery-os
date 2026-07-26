# Baseline corretivo — Chatbot Nativo DeliveryOS V1.1 simulado

Data: 2026-07-26  
Branch de origem auditada: `feature/conversation-native-deliveryos-simulated-v1`  
HEAD de origem: `d3c49fe57c575f08c64ccd4326166a379d613fb2`  
Branch corretiva: `feature/conversation-native-deliveryos-simulated-v1-corrective`

## Estado de entrada

| Verificação | Resultado |
|---|---|
| `git status --short` | limpo antes da criação desta evidência |
| `git diff --check` | limpo |
| Commits do sprint auditado | dez lineares, sem reescrita de histórico |
| Fonte dos bloqueadores | pacote externo `conversation-native-deliveryos-simulated-v1-recheck` |

## Falhas reproduzidas antes da correção

| Achado | Comando ou prova | Resultado anterior | Arquivo ou causa envolvida |
|---|---|---|---|
| RCK-001 — PII persistida | Mensagem sintética com marcador exclusivo; leitura direta do runtime e `scanTree` | marcador presente no JSONL; `scanner_passed=true`, 2 arquivos e 0 achados; somente o SHA-256 `19b116c1…` foi retido | `gateway.js`, `privacy.js`, `privacy-scan.js` |
| RCK-010 — scanner falso-verde | `npm run conversation-native:privacy` sem runtime de referência | `{ files: 0, findings: [], passed: true }` | `native-privacy-scan.js`, `privacy-scan.js` |
| RCK-002 — hash dependente de EOL | hash do mesmo catálogo em LF e CRLF | LF `78b2e2fd…`, CRLF `b4db3052…`, hashes diferentes; 28.411 versus 29.131 bytes | `catalogs/index.js` |
| RCK-003 — bypass do catálogo | `analyze({ content: texto_irrelevante, context: { scenario_id: TATA-SC-186 } })` | retornou `waitlist.create`, a intenção do cenário, sem classificar o texto | `engine.js`, `runtime.js`, `simulator.js` |
| RCK-004 — contexto/casos/quarentena | Dois itens faltantes válidos na mesma conversa | mesmo `case_id`; segundo turno deixou 1 item em quarentena | `runtime.js`, `context.js` |
| RCK-005 — notificação ausente | `runScenario('TATA-SC-194')` | ação `notification.send` e status `confirmed`, mas `notification.sent=0` e snapshot `sent=0` | `runtime.js`, `notification.js` |
| RCK-006 — round-trip | `npm run conversation-native:test` no estado ativo após importação anterior | 190/193; as três falhas de portabilidade apontaram `FLOW_CONFIG_INVALIDA` e fluxo restaurado ausente | `config-cli.js`, `portability.test.js` |

## Limites preservados neste sprint

- Nenhum dado real, credencial, integração externa ou driver real foi usado.
- A limitação multiprocesso continua explicitamente fora de escopo e bloqueia produção.
- Conference Brain, Live, Capacidade Viva, Copiloto, cardápio e fonte histórica permanecem fora do escopo de alteração.
