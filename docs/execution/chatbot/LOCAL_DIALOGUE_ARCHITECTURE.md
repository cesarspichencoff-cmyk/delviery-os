# Arquitetura local de diálogo generativo

## Autoridade

`DeliveryOS decide -> bridge transporta -> AI Node propõe -> DeliveryOS valida -> fallback protege`.

O modelo não se torna fonte de fatos, política ou ação. O Engine, os playbooks, o conhecimento aprovado e os validadores continuam soberanos.

## Fluxo

1. O DeliveryOS sanitiza mensagem e contexto mínimo.
2. O Director classifica o movimento conversacional em JSON estrito.
3. O Journey Stack aplica saudação, continuidade, correção, interrupção, pergunta lateral, retomada, troca, cancelamento ou reabertura.
4. Ferramentas são apenas solicitadas entre oito nomes allowlisted; o DeliveryOS valida e executa.
5. O Response Writer recebe exatamente 14 campos autorizados e produz somente `{ "text": "..." }`.
6. O validador pós-composição recusa fatos, números, links, promessas, compensação, diagnóstico, reasoning, pergunta omitida ou ação não confirmada.
7. Saída inválida, atraso ou indisponibilidade mantém a resposta determinística.

## Director

O contrato versionado separa `dialogue_act`, `social_act`, jornada ativa, fatos adicionados/corrigidos, referências, necessidade, pergunta, conhecimento, ação solicitada e confiança. Campo ausente ou extra invalida a saída inteira. Texto livre não é reinterpretado como diretiva.

## Journey Stack

A projeção append-only mantém estado social, jornada ativa, etapa, fatos, pergunta pendente, jornadas suspensas, perguntas laterais, correções, referências não resolvidas e última ação confirmada. Replay tolera linha final parcial e recompõe a mesma projeção. Correção não apaga o fato anterior; cancelamento não apaga histórico.

## Writer

Campos aceitos: resposta direta, fatos autorizados, conhecimento selecionado, direção, ação verdadeira, pergunta necessária, tom, gravidade, contexto social, frases recentes, claims proibidos, links, números e limite de tamanho. `required_question` não nulo deve aparecer como pergunta. O bake-off usa seed derivada por modelo/caso; produção futura deve derivar seed de conversa/turno versionados.

O runtime inicia llama.cpp com Jinja, JSON Schema, `--reasoning off`, paralelismo 1 e bind `127.0.0.1`. Nenhuma porta pública, shell, browser, SQL, MCP externo ou filesystem livre é oferecido ao modelo.

## Modos e flags

Defaults seguros:

```text
CONVERSATION_LOCAL_AI_ENABLED=false
CONVERSATION_LOCAL_AI_SHADOW=true
CONVERSATION_AI_NODE_REQUIRED=false
CONVERSATION_AI_FALLBACK=deterministic
```

Flag desligada não cria job. Shadow cria candidato paralelo, mas entrega exatamente a resposta determinística. Modo ativo futuro só pode publicar candidato integralmente validado. Configuração desconhecida falha fechada.

## Degradação

Node offline, heartbeat stale, timeout, lease expirada, modelo ausente, runtime morto, JSON inválido, política violada ou circuito aberto geram fallback determinístico. O circuito abre após falhas consecutivas e retorna por half-open controlado. Job pendente nunca bloqueia o atendimento atual.
