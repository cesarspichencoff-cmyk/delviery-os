# Auditoria corretiva da homologação real — Mudanças 006 + 007+008

## Escopo e conclusão

Base auditada: `7faf93ee9bfc8d1f1fb170a43475abc046a6ee1f`, branch
`feature/customer-menu-intelligence-v1`. A correção foi feita na branch isolada
`fix/customer-menu-real-homologation-v1`.

A falha observada por César foi reproduzida no endpoint realmente usado pelo
painel: `POST /api/homologation/chat`. Na base, esse endpoint chamava o runtime
nativo anterior sem encaminhar a mensagem pelo Conversation Pattern Engine,
sem reduzir o Journey State e sem fornecer Customer Context ou Menu Context.
Por isso, os testes isolados da Mudança 006 podiam passar enquanto a tela
respondia com o fallback de intenção ambígua. A área de CRM/Cardápio também
usava um serviço separado: parte do código existia, mas a importação exibida era
uma demonstração estática e o chatbot não consumia os contextos selecionados.

A correção conectou essas camadas à rota real, manteve dados exclusivamente
sintéticos e tornou explícito que Gemma e Qwen **não** estão conectados ao
painel local. O compositor determinístico continua sendo a fonte do texto.

## Caminho real da mensagem

```text
tools/conversation-crm/simulator/app/index.html
  -> tools/conversation-crm/simulator/app/app.js
  -> POST /api/homologation/chat
  -> tools/conversation-crm/native-server.js
  -> tools/conversation-crm/homologation/service.js
  -> src/conversation-crm/native/gateway.js
  -> src/conversation-crm/native/runtime.js
  -> src/conversation-crm/native/engine-factory.js
  -> apps/deliveryos-ai-node/dialogue/conversation-pattern-engine.js
  -> src/conversation-crm/native/conversation-pattern-state.js
  -> src/conversation-crm/native/response-plan.js
  -> src/conversation-crm/native/controlled-response-composer.js
  -> src/conversation-crm/native/post-composition-validator.js
  -> resposta exibida por app.js
```

Contratos observáveis:

- decisão: `deliveryos-conversation-pattern-decision-v1`;
- estado: `deliveryos-pattern-journey-state-v1`;
- resposta: `conversation-response-v2`;
- envelope: `deliveryos-approved-response-envelope-v1`;
- diagnóstico: `deliveryos-runtime-diagnostic-v1`.

Feature flags:

- `conversationPatternEngineV1`: ativa somente no perfil de homologação da tela;
- `customerMenuContextV1`: ativa somente no perfil de homologação da tela;
- o perfil histórico do simulador mantém ambas desativadas para não alterar o
  catálogo certificado nem os contratos anteriores;
- o arquivo de exemplo mantém ambas desativadas;
- drivers reais, leitura real e escrita real permanecem desativados.

O diagnóstico sanitizado do painel expõe apenas padrão, jornada, movimento,
capacidade, razão da rota, caminho da resposta, uso de fallback, origem dos
contextos, estado do Writer e versões dos contratos. A mensagem bruta não entra
no diagnóstico.

## Matriz declarado × real

Legenda de dados: todo dado apresentado nesta homologação é sintético. Fontes
reais foram somente inventariadas e não são consultadas pelo painel.

| Funcionalidade | Declarada no relatório | Código existente | Rota real | Interface real | Dados reais/sintéticos | Estado |
|---|---|---|---|---|---|---|
| Pattern Engine | sim | `conversation-pattern-engine.js` | `/api/homologation/chat` → runtime | diagnóstico do chat | sintéticos | IMPLEMENTADO E INTEGRADO — antes não integrado |
| ordem de resolução | sim | prioridade determinística no Pattern Engine | runtime | visível por `pattern` e `journey_action` | sintéticos | IMPLEMENTADO E INTEGRADO |
| saudação | sim | padrão `greeting` + compositor | chat | resposta natural e diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO — defeito corrigido |
| saudação com tarefa | sim | prioridade `greeting_with_need` | chat | tarefa preservada | sintéticos | IMPLEMENTADO E INTEGRADO |
| resposta curta | sim | `resolveShortReply` + pergunta pendente | runtime | chat | sintéticos | IMPLEMENTADO E INTEGRADO |
| correção | sim | `facts_corrected` + histórico | runtime | chat/diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO |
| referência | sim | resolução conservadora | runtime | chat | sintéticos | IMPLEMENTADO E INTEGRADO |
| pergunta lateral | sim | `side_question` + Journey State | runtime | chat/diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO — texto genérico corrigido |
| suspensão | sim | Journey Stack | runtime | diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO |
| retomada | sim | `resume` + Journey State | runtime | chat/diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO — rota sem ação corrigida |
| repetição | sim | padrão `repeat` | runtime | chat | sintéticos | IMPLEMENTADO E INTEGRADO |
| reformulação | sim | modo `reformulate` | runtime | chat | sintéticos | IMPLEMENTADO E INTEGRADO |
| mudança de assunto | sim | `switch_topic` + pilha | runtime | diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO |
| Journey Stack | sim | `NativePatternStateStore` | runtime/event store | diagnóstico resumido | sintéticos | IMPLEMENTADO E INTEGRADO |
| Response Plan V2 | sim | `response-plan.js` | runtime | não expõe detalhes internos | sintéticos | IMPLEMENTADO E INTEGRADO |
| ApprovedResponseEnvelope | sim | `approved-response-plan.js` | runtime | versão no diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO |
| Gemma Writer | candidato avaliado | adaptadores e resultados de avaliação | não participa do painel | aviso explícito de indisponibilidade | artefatos sintéticos de avaliação | SOMENTE MOCK |
| Qwen Writer | candidato avaliado | adaptadores e resultados de avaliação | não participa do painel | aviso explícito de indisponibilidade | artefatos sintéticos de avaliação | SOMENTE MOCK |
| fallback determinístico | sim | compositor + validador | runtime | resposta segura + diagnóstico | sintéticos | IMPLEMENTADO E INTEGRADO |
| lista de clientes | sim | `CustomerIntelligenceStore.list` | `/api/customer-menu/bootstrap` | aba Clientes | sintéticos | IMPLEMENTADO E INTEGRADO |
| ficha do cliente | sim | ferramenta `get_customer_summary` | `/api/customer-menu/customers/:id` | detalhe com fatos e relações | sintéticos | IMPLEMENTADO E INTEGRADO |
| identidades | sim | identidades tokenizadas | serviço de Customer Intelligence | somente contagem e fontes | sintéticos | IMPLEMENTADO, MAS NÃO INTEGRADO — resolução interativa não é exposta |
| preferências confirmadas | sim | fatos com estado explícito | ficha/contexto | ficha do cliente | sintéticos | IMPLEMENTADO E INTEGRADO |
| preferências inferidas | sim | estado `inferred` separado | ficha/contexto | ficha do cliente | sintéticos | IMPLEMENTADO E INTEGRADO |
| restrições | sim | registro com fonte e status | ficha/contexto/recomendação | ficha e segurança | sintéticos | IMPLEMENTADO E INTEGRADO |
| pedidos | sim | relações append-only | ficha do cliente | seção de pedidos | sintéticos | IMPLEMENTADO E INTEGRADO |
| reservas | sim | relações append-only | ficha do cliente | seção de reservas | sintéticos | IMPLEMENTADO E INTEGRADO |
| incidentes | sim | relações append-only | ficha do cliente | seção de incidentes | sintéticos | IMPLEMENTADO E INTEGRADO |
| consentimentos | sim | eventos e projeção de consentimento | bootstrap/ficha | aba Consentimentos | sintéticos | IMPLEMENTADO E INTEGRADO — somente leitura |
| importações | sim | `CustomerImportPipeline` | `/api/customer-menu/imports/action` | aba Importações | arquivo sintético temporário | IMPLEMENTADO E INTEGRADO — antes interface estática |
| staging | sim | lote `previewed` | ação de importação | lote e linhas | sintéticos | IMPLEMENTADO E INTEGRADO |
| mapeamento de colunas | sim | adaptador `generic` versionado | pipeline | adaptador e versão | sintéticos | IMPLEMENTADO E INTEGRADO |
| prévia | sim | linhas válidas/inválidas | pipeline | contagens e estados | sintéticos | IMPLEMENTADO E INTEGRADO |
| deduplicação | sim | impressão digital do lote | `duplicate_probe` | indicador de duplicidade | sintéticos | IMPLEMENTADO E INTEGRADO |
| rollback | sim | eventos compensatórios | ação `rollback` | resultado e preservação | sintéticos | IMPLEMENTADO E INTEGRADO |
| auditoria | sim | log append-only sanitizado | bootstrap | aba Auditoria | sintéticos | IMPLEMENTADO E INTEGRADO |
| catálogo | sim | `MenuCatalog` | `/api/customer-menu/bootstrap` | aba Cardápios | catálogo sintético | IMPLEMENTADO E INTEGRADO |
| canais | sim | salão, iFood e delivery próprio separados | catálogo/recomendação/chat | seletor e cartões | sintéticos | IMPLEMENTADO E INTEGRADO |
| unidades | sim | chave de unidade no catálogo | recomendação/contexto | unidade declarada | sintéticos | IMPLEMENTADO E INTEGRADO |
| ingredientes | sim | campo por item | catálogo | item do cardápio | sintéticos | IMPLEMENTADO E INTEGRADO |
| preços | sim | preço por canal no catálogo sintético | catálogo | item do cardápio | sintéticos | IMPLEMENTADO E INTEGRADO |
| alergênicos | sim | política conservadora | recomendação/contexto | item e resultado seguro | sintéticos | IMPLEMENTADO E INTEGRADO |
| disponibilidade | sim | estado por canal/unidade | catálogo/recomendação | resultado | sintéticos | IMPLEMENTADO E INTEGRADO |
| conflitos | sim | divergências preservadas | catálogo | lista de conflitos | sintéticos | IMPLEMENTADO E INTEGRADO |
| recomendações | sim | motor limitado por canal e segurança | `/api/customer-menu/recommend` | aba Recomendações | sintéticos | IMPLEMENTADO E INTEGRADO |
| bebidas | sim | itens do catálogo sintético | catálogo/recomendação | item do cardápio | sintéticos | DADO SINTÉTICO |
| harmonizações | sim | pares aprovados | catálogo/recomendação | item do cardápio | sintéticos | IMPLEMENTADO E INTEGRADO |
| ferramentas allowlisted | sim | `CustomerMenuToolRouter` | serviço e contexto do chat | resultado indireto | sintéticos | IMPLEMENTADO E INTEGRADO |
| fontes reais de cardápio | inventariadas | documentos e seeds do projeto | nenhuma rota de execução | não exibidas como catálogo real | reais, somente inventário | SOMENTE CONTRATO |
| dados reais de clientes | proibidos nesta fase | nenhum conector | nenhuma rota | aviso de simulação | ausentes | BLOQUEADO |

## Defeitos comprovados e correções

1. `oii` não era reconhecido: a expressão aceitava somente `oi`. Foi ampliada
   para variações de `i`, sem criar um classificador paralelo.
2. O chat real não chamava Pattern Engine nem Journey State. O runtime agora
   resolve e persiste o padrão antes do Response Plan.
3. Saudação social podia solicitar capacidade operacional. Movimentos sociais e
   retomadas sem ação agora usam `conversation.no_action`.
4. Pergunta lateral e retomada preservavam estado, mas terminavam no fallback
   genérico. O compositor agora verbaliza o movimento decidido e mantém a
   pergunta ou conhecimento autorizado da jornada.
5. Customer/Menu Context existia sem chegar ao chat. Seletores sintéticos do
   painel agora transportam esses contextos até o envelope aprovado.
6. A aba de importação era uma prévia estática. Ela agora executa o pipeline
   sintético real para prévia, deduplicação, aprovação/aplicação e rollback.
7. O CRM escondia pedidos, reservas e incidentes já suportados pelo store. A
   ficha passou a exibir somente as relações sintéticas sanitizadas.
8. O catálogo ocultava ingredientes, alergênicos, risco de contaminação e
   harmonizações. A interface agora os mostra sem completar lacunas.
9. A rota manual `/api/triage` reiniciava seu contador após replay e podia
   reutilizar uma chave idempotente antiga. O contador agora é reconstruído do
   event store.
10. Ao recarregar o painel, a tela mostrava uma conversa vazia, mas o runtime
    podia conservar a jornada anterior. A inicialização agora abre uma nova
    sessão sintética, alinhando o estado exibido ao estado processado e evitando
    contexto oculto entre homologações.

## Evidências de validação

- suíte Conversation: 670 testes, 670 aprovados, zero falha;
- catálogo nativo: 200 de 200 cenários, 51 intenções, hash
  `ddabec0dbf3c47adfb886b28556b96a47fcfcf90d709ec101b14fefee5f1a798`;
- scanner de privacidade: aprovado, zero achado e controle positivo detectado;
- Conference Brain: 314 de 314 testes;
- Live: 243 de 243 testes;
- Capacidade Viva: 43 de 43 testes;
- Copiloto: 53 de 53 testes;
- integridade do cardápio: 199 itens e oito praças oficiais;
- fonte histórica: verificação concluída com código de saída zero;
- painel real: `oii` e `Boa noite, tudo bem?` seguiram o padrão de saudação
  sem fallback; recomendação com restrição sintética pediu confirmação de
  segurança; recarregamento iniciou sessão limpa; diagnóstico declarou
  compositor determinístico e Writer não conectado;
- CRM, importação, auditoria e cardápio foram inspecionados na interface real:
  relações sintéticas, pipeline de importação, eventos sanitizados, canais,
  ingredientes, alergênicos, contaminação cruzada e harmonizações apareceram
  sem mistura entre fontes;
- `git diff --check` aprovado e áreas protegidas sem diff.

## Limites preservados

- nenhum cliente, pedido, consentimento ou cardápio real foi importado;
- nenhum Writer local está conectado ao painel;
- nenhum modelo foi promovido;
- nenhum preço, ingrediente ou alergênico foi inferido;
- nenhum canal ou unidade foi unido silenciosamente;
- nenhuma migration PostgreSQL foi executada;
- nenhuma integração externa, WhatsApp, iFood, Neemo ou Odhen foi acessada;
- o painel continua sendo uma homologação local, não uma superfície de produção.
