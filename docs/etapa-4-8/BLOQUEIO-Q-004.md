# Bloqueio Q-004 — pré-condição explícita do C2

## A pergunta

```
Q-004 · origem PB9/C7 · docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md#7
"CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS?"
o_que_trava: 5 placeholders de navegação sem origem documental
classe: criacao_de_modulo
opcoes: ["sao modulos", "nao sao modulos"]
estado: open
default_behavior: PAUSE
```

Fonte: `docs/execution/PERGUNTAS.jsonl`. Sem `autorizado_por`, sem `resposta`. Ausência de resposta
não é consentimento (CLAUDE.md §7).

## Por que isso é relevante ao C1/C2

`Q-004` pergunta exatamente se **CRM** é um módulo legítimo do DeliveryOS. O trabalho desta etapa
é, por nome, o porte de `conversation-crm`. A pergunta que decide se esse domínio pode existir como
módulo do produto está em aberto desde `2026-08-01` e nunca foi respondida.

## O que o C1 fez (e por que isso não decide Q-004)

O C1 trouxe o código para o repositório em 4 commits isolados:
`apps/deliveryos-ai-node/**`, `src/conversation-crm/`, `tools/conversation-crm/`,
`tests/conversation-crm/`, `config/conversation-crm/`. Nenhum desses commits:

- adiciona `conversation-crm` a qualquer rota, navegação ou superfície visual da Home;
- registra `conversation-crm` como módulo em `areas.ts` ou equivalente;
- liga o motor nativo (`src/conversation-crm/native/`) a qualquer entrypoint real do runtime
  crítico ou assíncrono (`src/platform/bin/critical.ts`, `src/platform/bin/async-runtime.ts`);
- altera `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md` ou qualquer documento de autoridade de
  produto.

O código existe no repositório, mas é código morto do ponto de vista do produto: nada importa
`conversation-crm` de fora dele mesmo, e as travas internas (`REAL_DATA_NOT_ALLOWED`,
`EXTERNAL_ACTION_ALLOWED: false`) impedem qualquer efeito fora do sandbox mesmo que algo tentasse
chamá-lo. Isso é consistente com "porte isolado, não merge cego": o C1 muda o que está no disco, não
o que o produto faz.

## O que trava o C2

Qualquer C2 que:

- adicione `conversation-crm` (ou qualquer parte dele) à navegação, Home, ou qualquer superfície
  visível ao usuário final;
- registre CRM/Evolução/Treinamento/RH/Gestão como módulos reconhecidos do produto;
- ligue o motor nativo a um runtime real (critical/async) ou ao Event Log canônico
  (`platform.event_log`);

colide de frente com `Q-004` em aberto. Isso não é uma opinião técnica — é a definição literal do
que a pergunta trava (`o_que_trava: "5 placeholders de navegação sem origem documental"`).

## Consequência prática

C2 não pode prosseguir com integração real sem que o César responda `Q-004` primeiro (ou
explicitamente autorize prosseguir sob risco registrado, como fez em outras perguntas com
`default_behavior: PROCEED_REVERSIBLY`, ex. `Q-006`). Até lá, o C1 fica como está: código portado,
testado isoladamente, não wired a nada do produto real.
