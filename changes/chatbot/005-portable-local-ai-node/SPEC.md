# Mudança 005 — bridge generativo local e AI Node portátil

## Resultado pretendido

O DeliveryOS hospedado continua sendo a autoridade de fatos, políticas e ações.
Um AI Node do restaurante pode interpretar diálogo e redigir uma resposta em
shadow mode, usando somente conexão HTTPS iniciada pelo próprio node. A resposta
determinística continua disponível e é a única resposta pública por padrão.

## Fronteiras

- nenhum cliente alcança o computador do restaurante;
- nenhum modelo acessa banco, shell, navegador, filesystem livre ou internet;
- nenhum texto bruto, PII, chain of thought ou segredo entra em evidência;
- nenhum job local bloqueia o fluxo determinístico;
- nenhum binário ou peso de modelo entra no Git;
- nenhuma infraestrutura paga, push, merge ou deploy faz parte desta mudança.

## Componentes

1. `src/conversation-crm/ai-bridge/`: fila, lease, registro de node, validação,
   heartbeat, circuit breaker, métricas e contrato PostgreSQL injetável.
2. `apps/deliveryos-ai-node/`: doctor, conector outbound, runtime local,
   providers, Director, Journey Stack, Writer e diagnósticos.
3. `evals/local-ai/`: corpus sintético e comparação cega.
4. pacote externo `DeliveryOS-AINode-Windows`: instalador, atualização,
   reparo, diagnóstico e desinstalação.

## Flags seguras

```text
CONVERSATION_LOCAL_AI_ENABLED=false
CONVERSATION_LOCAL_AI_SHADOW=true
CONVERSATION_AI_NODE_REQUIRED=false
CONVERSATION_AI_FALLBACK=deterministic
```

Flag ausente ou inválida falha fechada. A Mudança 005 não ativa clientes reais.

