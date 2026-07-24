# Inventário da Base CRM 2025

> Inventário agregado e sem dados pessoais. O arquivo-fonte permanece fora do repositório e não é necessário para executar os testes sintéticos.

## Escopo e método

- Fonte analisada: `CRM_TATA_2025.xlsx`, material recebido fora do Git.
- Leitura: todas as abas e todas as linhas não vazias.
- Linhas de cabeçalho não entram nas contagens.
- Nenhum nome, telefone, e-mail ou aniversário foi copiado para este documento.
- Telefone válido, para este inventário, significa número brasileiro normalizável para 10 ou 11 dígitos, com DDD plausível; o prefixo internacional `55` é removido quando presente.
- Duplicidade significa igualdade exata após normalização. Similaridade de nome nunca é usada como chave.
- “Possível recorrência” significa apenas `Frequencia` ou `Pedidos` maior que 1. Não prova que duas linhas representam a mesma pessoa.

## Abas encontradas

| Aba | Finalidade aparente | Registros | Campos |
|---|---|---:|---|
| `Salao` | Cadastro e frequência do atendimento presencial | 12.570 | Nome, sobrenome, aniversário, gênero, telefone, e-mail, frequência e canal |
| `APP` | Cadastro e total agregado de pedidos do aplicativo | 3.417 | Nome, telefone, e-mail, aniversário, pedidos e canal |
| `IFOOD` | Cadastro e frequência agregada do marketplace | 7.809 | Nome, sobrenome, telefone, e-mail, frequência e canal |
| `Todos Unificados` | Concatenação das três fontes | 23.796 | Nome, canal, telefone, e-mail e frequência |

`12.570 + 3.417 + 7.809 = 23.796`. Portanto, `Todos Unificados` preserva uma linha por registro de origem e não representa uma deduplicação de clientes.

## Qualidade de telefone

| Aba | Presente | Válido | Inválido | Vazio | Grupos duplicados exatos | Linhas excedentes duplicadas |
|---|---:|---:|---:|---:|---:|---:|
| `Salao` | 12.526 | 12.184 | 342 | 44 | 434 | 468 |
| `APP` | 3.417 | 3.404 | 13 | 0 | 112 | 120 |
| `IFOOD` | 7.809 | 7.759 | 50 | 0 | 456 | 456 |
| `Todos Unificados` | 23.752 | 23.347 | 405 | 44 | 1.948 | 2.276 |

Nas três fontes originais existem 21.071 telefones válidos distintos. Há 1.148 identificadores telefônicos exatos presentes em mais de uma fonte. Isso é evidência de sobreposição, não autorização para fusão automática.

## Qualidade de e-mail

| Aba | Presente | Válido | Inválido | Vazio | Grupos duplicados exatos | Linhas excedentes duplicadas |
|---|---:|---:|---:|---:|---:|---:|
| `Salao` | 8.622 | 8.622 | 0 | 3.948 | 6 | 6 |
| `APP` | 3.413 | 3.413 | 0 | 4 | 0 | 0 |
| `IFOOD` | 7.809 | 7.461 | 348 | 0 | 297 | 443 |
| `Todos Unificados` | 19.844 | 19.496 | 348 | 3.952 | 915 | 1.107 |

Nas três fontes originais existem 18.389 e-mails válidos distintos. Há 633 e-mails exatos presentes em mais de uma fonte.

## Cobertura e conflitos de identidade

| Situação agregada nas três fontes | Registros |
|---|---:|
| Telefone e e-mail válidos | 19.098 |
| Somente telefone válido | 4.249 |
| Somente e-mail válido | 398 |
| Nenhum dos dois válido | 51 |
| Mesmo telefone associado a mais de um e-mail válido | 842 |
| Mesmo e-mail associado a mais de um telefone válido | 159 |
| Grupos duplicados com telefone e e-mail exatamente iguais | 754 |
| Linhas excedentes nesses grupos exatos | 795 |

Os 842 e 159 casos conflitantes exigem preservação das linhas de origem e revisão. O importador não deve escolher silenciosamente uma identidade vencedora.

## Campos vazios e datas

### `Salao`

- Sobrenome: 1.780 vazios.
- Aniversário: 9.915 vazios; 2.654 valores interpretáveis, 1 não interpretável e 11 fora da faixa de plausibilidade adotada.
- Gênero: 8.412 vazios.
- Telefone: 44 vazios.
- E-mail: 3.948 vazios.

### `APP`

- Aniversário: 1.125 vazios; 2.292 valores interpretáveis e 14 fora da faixa de plausibilidade adotada.
- E-mail: 4 vazios.

### `IFOOD`

- Não há campo de aniversário.
- Os campos estruturais estão preenchidos, mas 50 telefones e 348 e-mails não passam pela validação conservadora.

Datas de aniversário são PII e não entram na saída anonimizada. O piloto também não importa gênero por padrão: não é necessário para triagem, ocorrência ou consentimento.

## Frequência e histórico disponível

| Aba | Linhas com frequência maior que 1 | Frequência igual a 1 | Frequência menor ou igual a 0 | Soma declarada |
|---|---:|---:|---:|---:|
| `Salao` | 2.202 | 10.315 | 53 | 16.553 |
| `APP` | 1.398 | 2.019 | 0 | 12.935 |
| `IFOOD` | 2.468 | 5.341 | 0 | 13.620 |
| `Todos Unificados` | 6.068 | 17.675 | 53 | 43.108 |

A base contém somente um contador agregado (`Frequencia` ou `Pedidos`). Não contém ID de pedido, data/hora de pedido, itens, valor, status ou desfecho. Logo:

- pode sinalizar possível recorrência na própria fonte;
- não pode gerar `CustomerOrderReference` individual;
- não pode reconstruir uma timeline de pedidos;
- não pode provar composição, gasto, preferência ou última visita;
- não pode ser somada a outra base como se cada linha fosse um cliente único.

## O que pode alimentar o CRM V0

| Dado | Uso permitido no piloto | Limite obrigatório |
|---|---|---|
| Canal de origem | Proveniência da identidade importada | Não implica consentimento de contato |
| Telefone normalizado | Identidade candidata, após validação | Valor real somente em runtime privado; saída de desenvolvimento recebe token irreversível |
| E-mail normalizado | Identidade candidata, após validação | Mesma política do telefone |
| Frequência agregada | Sinal histórico parcial da fonte | Não vira lista de pedidos nem score financeiro |
| Registro de origem | Auditoria e rastreabilidade | Sem caminho absoluto nem valor pessoal em logs |
| Colisão exata | Candidato a duplicidade ou conflito | Nunca mesclar por nome semelhante |

## O que não pode ser inferido

- Consentimento para WhatsApp, campanhas ou listas de transmissão.
- Identidade única entre canais quando as chaves divergem.
- Preferência de produto, valor de vida, relevância ou prioridade comercial.
- Ocorrência, promessa, crédito, benefício, reembolso ou obrigação financeira.
- Pedido individual ou relação segura entre uma linha e um pedido operacional.
- Ausência de PII apenas porque um campo está vazio em uma das fontes.

## Decisão para o piloto

1. O arquivo real continua fora do Git.
2. A análise salva apenas estatísticas agregadas.
3. A anonimização gera IDs internos e tokens com HMAC usando segredo fornecido no runtime.
4. Linhas sem identidade válida vão para quarentena sanitizada.
5. Colisões divergentes são marcadas para revisão e mantêm sua proveniência.
6. Fixtures e telas usam exclusivamente registros sintéticos declarados.
7. Nenhuma identidade importada recebe consentimento presumido.

