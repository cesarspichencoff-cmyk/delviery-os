# Relatório da estratégia de resposta humanizada

## Resultado

A Mudança 002 foi implementada sobre
`feature/conversation-baseline-foundation-v1 @ 14a4f792eb3fbea225b427496eec6cdb11099eb2`,
na branch `feature/conversation-humanized-response-strategy-v1`.

O fluxo final é:

`entendimento existente → Response Plan → estratégia → compositor controlado → validador independente → resposta segura`

O Engine, os catálogos operacionais, as políticas, as intenções e as capacidades
não foram alterados. Não há provider generativo, API externa ou integração real.

## Contratos implementados

- `Response Plan` versionado em `1.0.0`, com fatos, ações, perguntas, limites,
  gravidade, etapa, voz, estratégia e razão de fallback separados do texto.
- perfil versionado `tata_warm`, com linguagem próxima e limites reforçados para
  casos sensíveis;
- catálogo com mais de 30 estratégias estruturais;
- variação determinística por seed, conversa, turno, intenção, estratégia e
  estado do cliente;
- continuidade append-only, sem reiniciar saudação e sem repetir perguntas;
- validador que não importa o compositor nem consulta o oráculo;
- fallback final independente, com códigos sanitizados;
- recomposição idempotente após reinício sem persistir mensagem ou resposta
  bruta.

## Comparação do corpus

| Medida | Baseline | Humanizado |
|---|---:|---:|
| Conversas | 50 | 50 |
| Turnos | 56 | 56 |
| Abertura literal dominante | 19/56 | 4/56 |
| Fallback genérico | 14/56 | 0/56 |
| Verificações aprovadas | 595/600 | 616/616 |
| Lacunas contratuais silenciosas | 5 | 0 |
| Perguntas repetidas | não bloqueante no baseline | 0 |
| Saudação reiniciada em continuação | não bloqueante no baseline | 0 |

Os fallbacks operacionais continuam registrados por razão. Um handoff ou fato
público desconhecido não foi transformado em resposta inventada apenas para
reduzir a métrica.

## Cinco lacunas

1. `HREV-003` — fato público não confirmado. O horário de feriado agora declara
   que não está configurado e pergunta somente o dia.
2. `HREV-026` — falha de composição. A resposta agora cita `refrigerante`.
3. `HREV-027` — falha de composição junto à orientação iFood. A resposta cita
   `bebida` e preserva o procedimento público, sem prometer compensação.
4. `HREV-041` — contexto multiturno invisível na superfície. A continuação cita
   `bebida` e não repete pergunta já resolvida.
5. `HREV-044` — fato complementar novo omitido. A continuação prioriza `shoyu`
   sem apagar o item anterior do estado.

## Exemplos

Melhora clara, `HREV-026`:

- antes: fallback abstrato com 285 caracteres;
- depois: reconhecimento da falta de refrigerante, limite financeiro explícito
  e somente as duas perguntas obrigatórias, em 197 caracteres.

Fallback legítimo, `HREV-003`:

- o sistema não conhece o horário de feriado;
- a resposta não inventa o horário, expõe o limite e pede o dia.

Caso sensível:

- segurança alimentar usa zero emoji, não diagnostica, não atribui causa e
  mantém acompanhamento humano.

Continuidade:

- respostas curtas como `Quatro.` preservam a intenção de reserva, reconhecem
  quatro pessoas e avançam para a próxima pergunta.

Risco preservado:

- fatos desconhecidos, ações não confirmadas e conflitos continuam bloqueados;
  humanização não promove autoridade.

## Determinismo e segurança

- respostas: `cfe462fe00147c6b0642fbd9e9fe15f19c8120781d5829d62f3dda663814dc04`;
- métricas: `cef16c378c8a4b41942338805e86cbec9a5fdc16e705ae03e4789aaa602c5935`;
- comparação: `c275942e98a63228d18af5a3dc3cada204ace4840f16ce62ce69ff6021f5c6c2`;
- catálogo: 200/200, hash de execução
  `d68e17ce7c4b17f33a9f4577c1e57039d588cb3bffedd8709e0044ecbb9b6c43`;
- 12/12 mutações ficaram vermelhas em processos isolados;
- zero link ou valor desconhecido, promessa indevida, compensação automática,
  exposição do oráculo ou falha final do validador.

O hash do catálogo mudou porque o relatório inclui a nova superfície textual.
Contagens, intenções, capacidades, fatos, drivers e isolamento permaneceram
equivalentes.

## Regressão final

| Suíte | Resultado |
|---|---:|
| Conversation Native | 284/284 |
| Catálogo | 200/200 |
| Privacidade | aprovada; controle positivo detectado |
| Conference Brain | 350/350 |
| `PRESENCE.CONFLICT` | 1/1 |
| Live | 243/243 |
| Capacidade Viva | 43/43 |
| Copiloto | 53/53 |
| Cardápio | 199 itens |
| Fonte histórica | 16/16 |

## Limitações e próximo gate

- naturalidade, acolhimento e preferência entre versões continuam dependendo da
  avaliação humana de César;
- a concorrência multiprocesso do simulador continua não homologada;
- não foi criado painel de avaliação, provider generativo ou integração;
- a Mudança 003 não foi iniciada.
