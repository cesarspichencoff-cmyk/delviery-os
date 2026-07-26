# Chatbot Nativo do DeliveryOS V1 — implementação simulada

## Estado e limite desta versão

Esta versão implementa o primeiro fluxo funcional do Chatbot Nativo do DeliveryOS exclusivamente em simulação local. O chatbot conversa; o DeliveryOS classifica, roteia capacidades, executa somente efeitos sintéticos, registra e apresenta evidências.

Não há driver real, acesso a fornecedor, sessão externa, mensagem real, dado pessoal real ou ativação de produção. Os 46 placeholders ainda pendentes de aprovação mantêm a produção bloqueada. Cada integração real exige missão, contrato, segurança e gate próprios.

## Arquitetura implementada

```text
Conversation Gateway
  -> Conversation Engine + contexto multiturno append-only
  -> Capability Router
  -> Driver Contract / Driver simulado
  -> Action Executor
  -> State Hub + CRM + Evidence Store
  -> Human Queue / Notification Engine simulado
  -> Response Composer
  -> Observabilidade + checkpoint
```

Responsabilidades:

- `gateway.js`: valida o envelope, sanitiza, deduplica e ordena turnos. A mensagem original existe apenas em memória durante o processamento.
- `engine.js`: resolve os 51 intents canônicos, entidades, gravidade, capacidade, autoridade, política, escalonamento e projeção legada.
- `context.js`: mantém fatos de conversa multiturno com provenance, revisão e correção append-only.
- `crm.js`: registra conversa, mensagem sanitizada, caso, classificação, ocorrência, capacidade, ação e resposta como eventos imutáveis.
- `router.js`: valida capacidade, flags, modo, saúde e autoridade; seleciona deterministicamente um driver que declara a capacidade.
- `drivers/`: contém o contrato e 12 grupos de drivers exclusivamente simulados, cobrindo exatamente as 39 capacidades.
- `action-executor.js`: centraliza validações e idempotência da ação; A4 é proibido e A3 não executa decisão autônoma.
- `state-hub.js`: reconcilia fatos por entidade com source, tempo, confiança, freshness, evidência e conflito explícito.
- `evidence-store.js`: registra evidência sanitizada, hash, seed, cenário, capacidade, driver e resultado.
- `human-queue.js`: cria handoff confirmado e preserva o contexto do caso.
- `notification.js`: permite apenas canal sintético e deduplicado.
- `health.js`: registra saúde sintética e circuit breaker determinístico por driver.
- `observability.js`: registra o fluxo técnico sem PII.
- `event-store.js`: persiste JSONL append-only, deduplica antes do append, mantém quarentena e checkpoint e reconstrói índices no replay.
- `runtime.js`: orquestra as dez etapas do pipeline e a recuperação.
- `simulator.js`: executa cenários isolados em runtime temporário e produz relatório canônico.

## Contratos principais

O envelope do Gateway exige ambiente sintético, tipo de mensagem, conteúdo, canal, subject ID anonimizado, conversation ID, message ID, correlation ID, idempotency key, horário e ordem do turno. Unidade e contexto são opcionais e validados.

Toda solicitação de capacidade contém capability ID, versão, conversa, caso, unidade, subject ID anonimizado, payload sintético, autoridade, policy ID, requisitos de evidência, idempotency key, correlation ID e deadline sintético.

Todo driver declara ID, versão, tipo, capacidades, modos de leitura e escrita, disponibilidade, saúde, reversibilidade, confirmação, timeout, operações retryable, risco e schemas. O registro rejeita duplicidade e falha se qualquer capacidade ficar sem cobertura.

Os resultados técnicos possíveis são `confirmed`, `processing`, `unavailable`, `degraded`, `conflict`, `unknown`, `failed`, `requires_human` e `prohibited`. Uma chamada técnica não é tratada como confirmação operacional sem `confirmed` explícito.

## Configuração e feature flags

Arquivos portáteis versionados:

- `config/conversation-crm/native-flags.example.json`: padrão seguro, todos os módulos desligados.
- `config/conversation-crm/native-flags.simulator.json`: ativa somente módulos e drivers simulados no ambiente `test`.
- `config/conversation-crm/native-simulator.example.json`: seed, relógio, fuso, catálogo e diretórios relativos.

As 13 flags são validadas como conjunto fechado. Configuração inválida, ativação fora de `test`, ausência de `simulatedDriversV1` ou qualquer flag de driver real falha fechada.

Configuração canônica do simulador:

- seed: `TATA-SIM-V1`;
- fuso: `America/Sao_Paulo`;
- relógio inicial: `2026-07-01T12:00:00-03:00`;
- catálogo: 200 cenários;
- cenários isolados reiniciam o estado;
- sequências controladas podem preservar estado;
- ordem de eventos é determinística;
- leitura e escrita reais permanecem desligadas.

## Políticas e compatibilidade

- Os 35 blocos legados possuem migração funcional para o modelo nativo; R05 e O02 foram preservados.
- As 12 regras canônicas continuam carregadas.
- Grupo acima de oito é tratado como grupo grande quando a quantidade e o contexto são suficientes; somente os dados realmente ausentes são solicitados.
- Item faltando prevalece sobre termos genéricos de pedido/delivery, cria ocorrência e exige handoff comercial-operacional, sem oferta automática.
- Segurança dos alimentos cria incidente e filas funcionais, bloqueia fechamento automático e não diagnostica nem afirma causalidade.
- Sinais de abuso são silenciosos, sintéticos e destinados à revisão humana; nenhum score ou acusação é mostrado ao cliente.
- Placeholders não aprovados nunca viram fato institucional. A função usa fixture marcada como sintética, fica indisponível ou encaminha para humano.

## Idempotência, recuperação e replay

As chaves são derivadas de identidades operacionais estáveis, não apenas de timestamps. Mensagem, caso, ocorrência, capacidade, ação, evidência, handoff, notificação, resposta e checkpoint têm identidades determinísticas.

O processamento registra dez estágios:

1. mensagem recebida;
2. mensagem persistida;
3. classificação concluída;
4. CRM atualizado;
5. capacidade solicitada;
6. ação iniciada;
7. resultado persistido;
8. resposta composta;
9. resposta registrada;
10. checkpoint avançado.

Os testes simulam crash depois de cada estágio. O reinício reconstrói índices, CRM, State Hub, fila e evidências, completa o checkpoint e mantém um único efeito lógico. Linha JSONL inválida vai para quarentena sanitizada sem interromper eventos seguintes.

## Privacidade

O runtime sanitiza recursivamente objetos, arrays, URLs e erros antes de qualquer append. Nomes de campos e valores associados a telefone, CPF, e-mail, endereço, token, cookie, senha, query string e texto livre inseguro são removidos ou reduzidos a marcadores auditáveis sem ecoar o conteúdo.

A mensagem original não entra no CRM, evidência, observabilidade, painel, export ou backup. O Gateway a mantém temporariamente em memória e a esquece ao concluir ou falhar. Identificadores são sintéticos e claramente marcados. O scanner automático verifica runtime e backup e falha ao encontrar marcador proibido.

## Painel local

O painel existente foi estendido sem criar produto paralelo. Ele permite selecionar os 200 cenários, digitar mensagem sintética, avançar o relógio, reproduzir o estado e reiniciar o runtime. Apresenta intenção, dados conhecidos/ausentes, capacidade, driver, evidência, autoridade, política, ação, CRM, handoff e o aviso de ausência de integração real.

O servidor escuta por padrão somente em `127.0.0.1`. `::1` exige autorização explícita; curingas e endereços externos são recusados. CSP, `no-store`, limite de payload e erros sanitizados são aplicados.

## Comandos

Requisitos: Node.js 20 ou superior e npm compatível com o lockfile.

```powershell
# instalação reproduzível
npm ci

# suíte integral do módulo
npm run conversation-native:test

# catálogo completo de 200 cenários
npm run conversation-native:catalog

# iniciar simulador e painel local
npm run conversation-native:start

# abrir manualmente, depois de iniciar
# http://127.0.0.1:4179

# reproduzir um cenário
npm run conversation-native:scenario -- TATA-SC-186

# simular crash e recuperação com a seed canônica
npm run conversation-native:reproduce -- TATA-SC-193 action_started

# varrer o runtime configurado contra PII
npm run conversation-native:privacy

# exportar e restaurar a configuração portátil do piloto
npm run conversation-crm:config:export
npm run conversation-crm:config:import
```

Para executar em outro computador, copie o repositório sem `node_modules`, runtimes, imports privados, backups privados, uploads ou bancos locais. Depois execute `npm ci` e os comandos acima. Código e configuração usam apenas caminhos relativos à raiz do projeto; mover ou renomear a pasta não altera o resultado canônico.

## Evidências de validação

- Conversation + CRM nativo: 193/193, executado duas vezes em processos independentes.
- Catálogo: 200/200, 51 intents, zero driver real, zero acesso externo.
- Hash canônico do catálogo: `c4d7ebbc71d7e9fa3bdef7bdf9cffed082e4c1eb89331f22dcdeb7c75d3363a3`.
- Conference Brain e auditorias: 350/350.
- Live e simuladores: 243/243.
- Capacidade Viva: 43/43.
- Copiloto: 53/53.
- Cardápio: 199 itens e 8 praças, sem drift.
- Fonte histórica de teste: 16/16 linhas casadas, sem alteração de regra.
- Portabilidade: instalação limpa, 193/193 e 200/200 em cópia temporária renomeada.
- Painel: fluxo, relógio, replay e reset verificados em navegador local; nenhum erro de console ou recurso externo.

## Limitações e produção bloqueada

- O Engine V1 é determinístico e orientado pelos contratos/cenários aprovados; não é um modelo generativo livre.
- O catálogo canônico exercita 20 capacidades diretamente; as 39 estão registradas, roteadas e testadas por cobertura, mas nem todas possuem cenário conversacional exclusivo.
- Saúde, timeout e circuit breaker usam parâmetros sintéticos de desenvolvimento, não limiares de produção.
- Persistência é local JSONL. Concorrência multiprocesso, retenção, rotação e operação contínua exigem desenho posterior.
- Nenhum driver real, API, browser de fornecedor, impressão ou mensageria foi implementado.
- Os 46 placeholders reais pendentes bloqueiam produção.
- `xlsx@0.18.5` mantém vulnerabilidade alta preexistente. O importador deve permanecer local, privado e restrito a arquivo conhecido; não pode virar endpoint público.

Roadmap condicionado a novas autorizações: contrato e homologação individual de cada driver real, gestão de segredos fora do Git, observabilidade de produção, retenção/rotação, testes de carga e concorrência multiprocesso, segurança independente e preenchimento aprovado dos dados reais.

## Estado após o sprint corretivo V1.1

A primeira implementação, no commit `d3c49fe57c575f08c64ccd4326166a379d613fb2`, foi bloqueada pela rechecagem independente. O sprint V1.1 corrigiu somente os bloqueadores reproduzidos, sem habilitar produção nem integração externa:

- a mensagem bruta deixou de ser persistida; somente metadados sanitizados e hash operacional permanecem;
- o scanner de privacidade passou a ser independente do sanitizador e falha com raiz ausente, zero arquivos, erro de leitura ou controle positivo não detectado;
- hashes de catálogos e configurações passaram a ser semânticos e independentes de BOM, LF/CRLF e newline final;
- `scenario_id` deixou de participar da classificação; o oráculo do catálogo ficou restrito ao executor de testes;
- contexto multiturno passou a separar conversa, caso, pedido, turno, revisão, correção e fatos substituídos;
- mensagens conversacionais válidas não são mais enviadas à quarentena por divergência de conteúdo;
- a notificação sintética do cenário `TATA-SC-194` agora percorre o caminho real do runtime, com idempotência;
- exportação e importação de configuração foram estabilizadas para dois ciclos consecutivos.

O catálogo continua com 200 cenários, 51 intents, 39 capacidades e os 35 blocos legados. R05 e O02 permanecem cobertos. A suíte do módulo possui 210 testes após a adição das regressões corretivas.

O hash canônico atual do catálogo é `865df8e2f247e1824eb01f9eeba4683219ff3cf4c8cbd9861508dfd108c93556`. Ele foi reproduzido em duas cópias limpas, com caminhos diferentes e políticas LF/CRLF distintas.

### Limites mantidos

- nenhum driver real, mensagem real, endpoint externo ou dado real foi ativado;
- concorrência multiprocesso permanece não homologada;
- a vulnerabilidade alta preexistente em `xlsx@0.18.5` permanece registrada e o importador continua restrito ao uso local;
- dados institucionais ainda não aprovados continuam bloqueando produção;
- esta correção não constitui autorização de produção.
