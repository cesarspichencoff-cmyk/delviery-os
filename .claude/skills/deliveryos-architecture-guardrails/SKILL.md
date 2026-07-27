---
name: deliveryos-architecture-guardrails
description: >
  Limites arquiteturais inegociáveis do DeliveryOS. Use ANTES de escrever ou
  revisar qualquer código que toque runtime crítico, runtime assíncrono,
  persistência, event log, outbox, Copiloto, Conference Brain, Operação Viva,
  Android ou ingestão de eventos. Também use quando alguém propuser fila nova,
  banco novo, microserviço, ou acesso direto do app ao banco.
---

# Guardrails de arquitetura do DeliveryOS

## Objetivo

Impedir que uma mudança localmente razoável quebre uma garantia global. Todos os
limites daqui já custaram uma investigação ou um defeito real — nenhum é
preferência de estilo.

## Quando usar

- antes de criar rota, tabela, fila, processo ou dependência;
- antes de importar um módulo novo dentro de `src/entregas/**` ou `src/platform/**`;
- ao revisar um diff que toque persistência ou o caminho crítico;
- quando alguém disser "só nesse caso" sobre um dos limites abaixo.

## Entradas

O diff proposto, ou a descrição da mudança. Os arquivos de estado:
`docs/execution/STATE.json`, `docs/execution/DECISIONS.md`.

## Saídas

Veredito `PASSA` ou `VIOLA`, com o limite específico citado e o caminho
alternativo. Nunca "parece ok".

## Os limites

### L1 — O crítico grava, o assíncrono consome

O runtime crítico NUNCA espera de forma síncrona por CRM, Copiloto, IA,
Conference Brain ou Operação Viva. A comunicação é pela outbox transacional.

Se o assíncrono sumir, a rua continua e o backlog espera. O contrário não vale.

**Viola:** `import` de módulo do Copiloto dentro de `src/entregas/**` ou de
`src/platform/bin/critical.ts`; `await` de HTTP para serviço de análise no
caminho de uma requisição de campo.

### L2 — Fato e mensagem confirmam na MESMA transação

Gravar o fato e enfileirar a mensagem são um ato só. Fato sem mensagem some da
ponte; mensagem sem fato inventa realidade.

**Viola:** `factSink.append()` seguido de `outbox.enqueue()` com clientes
diferentes, ou fora de `client.transaction()`.

### L3 — O event log é append-only por trigger no banco

`UPDATE` e `DELETE` em `platform.event_log` são recusados pelo PostgreSQL, não
pela disciplina de quem escreve o código. Correção legítima é evento novo.

**Viola:** qualquer `UPDATE`/`DELETE` na tabela; qualquer tentativa de remover a
trigger para "facilitar o teste".

### L4 — Lease vencido não consome tentativa

Processo que morreu não falhou o trabalho. `reclaimExpired` devolve o job sem
incrementar `attempts`.

**Viola:** incrementar tentativa na recuperação de lease.

### L5 — `/ready` só é 200 quando o processo consegue PERSISTIR

A sonda escreve, não apenas conecta. `SELECT 1` passa com disco cheio e com
réplica somente leitura.

**Viola:** trocar a sonda por leitura; fazer `/ready` responder 200 em estado
`blocked`.

### L6 — GPS só durante viagem ativa

Nenhuma coleta fora de viagem. Não é configuração, é limite.

**Viola:** serviço de localização iniciado no boot do app, ou que sobreviva ao
encerramento da viagem.

### L7 — O Android nunca fala com o PostgreSQL

O aparelho fala HTTPS com o runtime crítico. Sempre.

**Viola:** driver de banco no APK; credencial de banco em `BuildConfig`.

### L8 — Projeção é derivada, nunca segunda fonte de verdade

Operação Viva e Conference Brain produzem projeções reconstruíveis por replay.
Nenhuma delas grava fato de viagem.

**Viola:** projeção que guarda estado que não pode ser recomputado dos eventos;
Copiloto escrevendo em `entregas.*`.

### L9 — Simulado nunca aparece como real

`source_mode` é `real | simulated | control`, sempre explícito, sempre carimbado.

**Viola:** valor padrão que faça simulado virar real na ausência do campo.

### L10 — Ausência é estado, não silêncio

`unknown` nunca vira `healthy`. Sinal velho vira `stale`. Agrupamento removido
retira o sinal de verdade.

**Viola:** projeção que mantém o último valor conhecido indefinidamente.

## Tecnologias proibidas

Kubernetes · Kafka · RabbitMQ · Redis como verdade · dual-write · acesso direto
do Android ao banco · Copiloto no caminho síncrono · Figma como fonte de verdade
do domínio.

Se a solução parece exigir uma delas, o problema está mal formulado. Traga o
caso concreto antes de introduzir a dependência.

## Ações permitidas

Apontar a violação, propor o caminho que respeita o limite, escrever o teste que
trava a regressão.

## Ações proibidas

Aprovar exceção "temporária" sem registro em `DECISIONS.md`; relaxar um limite
para fazer um teste passar; remover uma garantia em vez de corrigir o código que
esbarra nela.

## Verificadores

```bash
npm run test:platform          # inclui testes estruturais de import
npm run test:platform:repos    # transacionalidade e lease (exige banco)
npm run test:entregas:android  # ciclo de vida do GPS
```

Os testes estruturais afirmam sobre os **imports reais**, e removem comentários
antes de medir — comentário que explica a proibição já casou com ela antes.

## Limite de iterações

Três. Se a mesma violação reaparecer três vezes, o desenho está errado — pare e
reavalie a hipótese em vez de continuar corrigindo o sintoma.

## Condição de sucesso

Nenhum limite violado, e existe teste que impede a regressão.

## Condição de parada

Violação que só se resolve mudando um limite. Não mude: registre a contradição
com evidência e escale para o César.

## Evidências produzidas

Linha em `docs/execution/EVIDENCE.jsonl` com o limite verificado e o comando que
o verificou. Quando um limite for relaxado, entrada nova em `DECISIONS.md` com a
alternativa recusada.
