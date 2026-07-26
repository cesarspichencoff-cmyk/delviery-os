# Chatbot TATÁ — conteúdo público confirmado V1

## Escopo

Esta camada libera o painel local para teste humano com informações públicas operacionais confirmadas. Ela não ativa WhatsApp, iFood, Get In, Neemo ou qualquer driver real.

- Fonte: Mensagens oficiais TATÁ Sushi de 25/07/2026, confirmadas por César em 26/07/2026.
- Classificação: `CONFIRMADO_POR_CESAR`
- Unidade: `unidade-tata-53069`
- Catálogo: `TATA_OPERATIONAL_PUBLIC_INFO_V1`
- Drivers reais: desativados

## Organização

O catálogo complementar concentra:

- endereço e horários regulares;
- regras públicas de reserva e fila;
- três cardápios com finalidade distinta;
- Almoço Executivo e Sugestão Tatá;
- pagamentos confirmados;
- rolha e valet;
- delivery próprio e disponibilidade do iFood;
- fluxo de Oke para retirada;
- orientação de solicitações formais no iFood.

Os 47 placeholders continuam no registro canônico. Quatorze receberam referências para o catálogo público: oito confirmados e seis confirmados com ressalvas. O sexto item com ressalva é `TATA_UNITS`, limitado à única unidade comprovada pela fonte atual. Uma política parcial continua parcial.

## Regras de resposta

A composição segue:

`reconhecimento → informação ou ação verificável → próximo passo`

- um único link é enviado conforme a intenção;
- reserva só existe com retorno observável do sistema;
- fila não inventa posição nem espera;
- tolerância de reserva é 15 minutos;
- prazo depois da chamada da fila é 5 minutos;
- feriado sem horário próprio permanece desconhecido;
- pagamento não validado permanece não validado;
- Almoço Executivo e Sugestão Tatá não são rodízio;
- reembolso nunca é prometido;
- problemas do iFood são acolhidos, registrados no CRM e orientados sem atribuição automática de culpa.

## Oke para retirada

O alias executivo `evento_oke_retirada` é representado pela intenção operacional `event.oke_pickup`.

O fluxo coleta somente:

- quantidade exata de pessoas;
- horário planejado para retirada;
- itens desejados.

A disponibilidade depende da equipe. O retorno informado é até o dia seguinte. A modalidade atual é retirada na loja, e as tábuas devem voltar em até dois dias. Preço, caução e quantidade por pessoa permanecem desconhecidos.

## Painel de teste humano

Executar:

```powershell
npm ci
npm run conversation-native:start
```

Abrir:

`http://127.0.0.1:4179`

A seção `Teste Humano — Informações Reais Confirmadas` oferece doze atalhos e mantém a conversa manual livre. A tela declara:

- `AMBIENTE DE SIMULAÇÃO`;
- `NENHUMA MENSAGEM SERÁ ENVIADA`;
- `DRIVERS REAIS DESATIVADOS`.

Os atalhos preenchem perguntas; não exibem intenção esperada, resposta esperada ou conteúdo do oráculo.

## Limitações

- nenhum horário de feriado foi configurado;
- detalhes da repetição do Almoço Executivo não foram formalizados;
- dinheiro, Pix, aproximação e parcelamento não foram confirmados;
- unidade de cobrança da rolha não foi informada;
- preço, caução e quantidade por pessoa dos okes não foram informados;
- dados e políticas públicas não removem os bloqueios de produção;
- todos os efeitos continuam exclusivamente simulados.
