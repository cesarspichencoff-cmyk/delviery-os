# Certificação de structured output — Mudança 005B

## Contrato certificado

O Director utiliza três camadas independentes:

1. GBNF fixada e versionada, gerada dos schemas canônicos;
2. parsing de um único objeto JSON completo, sem tolerância a texto periférico;
3. validação de schema, allowlist e compatibilidade com o estado da jornada.

Qualquer falha rejeita toda a saída, não executa ferramenta e usa fallback
determinístico sanitizado.

## Controles negativos

| Controle | Resultado |
|---|---|
| JSON truncado | rejeitado |
| `{` isolado | rejeitado |
| campo ausente | rejeitado |
| campo adicional | rejeitado |
| enum inválido | rejeitado |
| número como string | rejeitado |
| texto antes do JSON | rejeitado |
| texto depois do JSON | rejeitado |
| bloco Markdown | rejeitado |
| reasoning junto do JSON | rejeitado |
| argumentos de ferramenta incompatíveis | rejeitado |
| objeto quando o adapter espera string | rejeitado |
| resposta vazia | rejeitado |
| dois objetos | rejeitado |
| jornada semanticamente impossível | rejeitado |

Resultado: `15/15` classes negativas recusadas. Saída inválida nunca é tratada
como parcialmente útil.

## Integridade

- grammar normalizada: `0efa8e7996bd0c822d65b4d49c0491db01180628b3d8b41d340e58c545dc8ee7`;
- adapters de superfície não contêm fatos, políticas, gabaritos ou ações novas;
- mapas de fatos aceitam somente valores escalares seguros;
- sentinelas `none`, `null`, `unknown` e `n/a` não substituem `null` real;
- atos passivos não podem criar ou apagar jornada;
- pergunta já respondida não pode ser solicitada de novo;
- ferramenta fora da allowlist não pode alcançar execução.

## Limite da certificação

Structured output válido prova segurança estrutural, não decisão correta. Gemma
e Qwen produziram JSON válido em vários probes que escolheram movimento, fato ou
jornada errados. Por isso o gate do Director é independente e reprovou ambos.
