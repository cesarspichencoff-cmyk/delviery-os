# Relatório corretivo — Chatbot Nativo DeliveryOS V1.1 simulado

Data: 2026-07-26  
Base: `d3c49fe57c575f08c64ccd4326166a379d613fb2`  
Branch: `feature/conversation-native-deliveryos-simulated-v1-corrective`

## Resultado

Os seis bloqueadores reproduzidos no baseline foram corrigidos sem alterar Conference Brain, Live, Capacidade Viva, Copiloto, cardápio ou fonte histórica. Nenhum driver real, rede externa, mensagem real ou dado pessoal real foi usado.

| Achado | Causa raiz confirmada | Correção | Evidência |
|---|---|---|---|
| RCK-001 — PII persistida | sanitização incompleta e persistência da mensagem bruta | allowlist recursiva para objetos, arrays e erros; conteúdo bruto somente em memória | regressões de marcadores aninhados e varredura direta do runtime |
| RCK-010 — scanner falso-verde | scanner compartilhava premissas com o sanitizador e aceitava zero arquivos | scanner independente, falha fechada e controle positivo descartável | raiz ausente, diretório vazio, nome sensível e conteúdo sensível falham |
| RCK-002 — hash por EOL | hash aplicado aos bytes de apresentação | canonicalização semântica de JSON e texto | mesmo hash com LF, CRLF, BOM e newline final |
| RCK-003 — bypass por `scenario_id` | Engine consultava o oráculo do cenário | catálogo de execução sem cenários; oráculo isolado no simulador | 200 textos em ordem inversa e mutação adversarial classificados pelo Engine |
| RCK-004 — mistura de contexto | conversa, caso e pedido não possuíam identidade e revisão suficientes | modelo append-only por conversa/caso/pedido/turno, com correção e supersessão | dois pedidos, dois casos, correção, item adicional, unidade, retomada e reabertura |
| RCK-005 — notificação simulada falsa | resultado confirmado sem passar pelo Notification Engine | execução real da capacidade sintética e deduplicação por identidade operacional | `TATA-SC-194` registra uma notificação antes e depois de replay/reinício |
| RCK-006 — round-trip de configuração | importação ativava referência restaurada ausente ou obsoleta | preservação da configuração ativa semanticamente válida e fallback seguro | dois ciclos export/import com testes, catálogo e privacidade verdes |

## Commits corretivos

1. `89ef356` — baseline dos bloqueadores;
2. `109e923` — privacidade e scanner independente;
3. `0ea248e` — hashes canônicos e configuração;
4. `ce69b77` — isolamento do oráculo e classificação real;
5. `9eb40a6` — contexto, casos, pedidos e notificações;
6. `70759d1` — regressões corretivas.

## Validação executada

| Gate | Resultado |
|---|---|
| Conversation Native | 210/210, sem skip |
| Catálogo | 200/200; 51 intents; hash `865df8e2f247e1824eb01f9eeba4683219ff3cf4c8cbd9861508dfd108c93556` |
| Privacidade | 2 arquivos inspecionados; zero achado; controle positivo detectado |
| Configuração | dois ciclos completos de exportação/importação, ambos verdes |
| Portabilidade | duas cópias limpas em caminhos diferentes; LF e CRLF; 210/210 e 200/200 |
| Conference Brain | 350/350, mais smoke `PRESENCE.CONFLICT` 1/1 |
| Live | 243/243 |
| Capacidade Viva | 43/43 |
| Copiloto | 53/53 |
| Cardápio | 199 itens, verificação aprovada |
| Fonte histórica | 16/16 linhas, 5 pedidos, verificação aprovada |

## Limitações e riscos restantes

- produção permanece bloqueada;
- concorrência multiprocesso ainda não foi homologada;
- persistência local precisa de retenção, rotação e testes de carga antes de operação contínua;
- dados institucionais pendentes não podem ser inferidos;
- `xlsx@0.18.5` mantém vulnerabilidade alta preexistente; nenhuma dependência foi alterada neste sprint;
- drivers reais, gestão de segredos e integrações externas exigem gates próprios.

## Isolamento

O sprint não modifica código ou testes de Conference Brain, Live, Capacidade Viva, Copiloto, motor operacional, cardápio, fonte histórica ou interface externa. Não houve merge, push ou deploy.
