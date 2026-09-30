# Comanda de Produção — Contrato Operacional V1

Data da verdade humana: 2026-09-30.

Este documento substitui qualquer inferência antiga que tratasse a produção como uma única comanda sem roteamento por bancada. O Relatório de Entrega continua sendo uma fonte distinta; a produção real tem destinos físicos por praça/serviço.

## 1. Objetivo

A comanda deve ser lida em 1–2 segundos em ambiente de alta produção.

Prioridade visual:

1. PRAÇA / DESTINO
2. SEQUÊNCIA TATÁ
3. CAIXA DE MONTAGEM
4. QUANTIDADE + ITEM
5. OBSERVAÇÃO
6. TEKNISA / IFOOD
7. CHECK FINAL

Contrato visual:
- fonte grande;
- impressão preta/forte;
- quantidade antes do item;
- observação imediatamente abaixo do item e impossível de confundir;
- nenhuma informação de cliente/endereço/pagamento;
- sem texto explicativo desnecessário.

A implementação física ESC/POS fica bloqueada até modelo/largura/capacidades das impressoras estarem provados. Este contrato define conteúdo e hierarquia, não bytes de impressora.

## 2. Identificadores obrigatórios

Toda via de produção do mesmo pedido deve repetir os mesmos identificadores:

- TATÁ: sequência operacional do DeliveryOS. Obrigatória para produção.
- TEKNISA: NRCOMANDA. Obrigatória quando a origem Odhen estiver provada.
- IFOOD: NRCOMANDAEXT quando houver pedido iFood; caso contrário deve aparecer como ausência explícita, nunca inventado.

Regra: 1 pedido = 1 sequência TATÁ. Todas as praças derivadas desse pedido carregam a mesma sequência TATÁ e as mesmas referências de origem.

A forma de gerar a sequência TATÁ ainda é um contrato separado; este módulo apenas a recebe.

## 3. Roteamento físico confirmado por César

### Serviço do almoço
A produção de sushi fica concentrada no salão.

| Praça lógica | Destino físico |
|---|---|
| Caixa | CAIXA |
| Cozinha | COZINHA |
| Enrolados | BALCÃO SUSHI 2 |
| Combinados | BALCÃO SUSHI 1 |
| Enrolados Quentes | BALCÃO SUSHI 2 |

### Serviço do jantar

| Praça lógica | Destino físico |
|---|---|
| Caixa | CAIXA |
| Cozinha | COZINHA |
| Enrolados | DELIVERY SUSHI 2 |
| Combinados | DELIVERY SUSHI 1 |
| Enrolados Quentes | BALCÃO SUSHI 2 |

Praças não listadas, inclusive Duplas, permanecem UNKNOWN neste contrato e devem bloquear roteamento automático em vez de serem inferidas.

## 4. Caixa de montagem

Tickets de sushi precisam dizer claramente em qual caixa montar.

A comanda não calcula a caixa. Ela recebe o resultado do motor canônico de embalagem e o exibe por grupo físico:

```
MONTAR NA CX 450

2x DUPLA SALMÃO
1x SASHIMI SALMÃO
```

Se houver mais de um grupo físico, cada grupo repete sua própria caixa.

Nunca inferir caixa no renderer.

## 5. Observações

Observação de item:
- fica imediatamente abaixo do item correspondente;
- não pode migrar para outro item;
- deve usar destaque visual forte;
- texto livre continua sendo dado sensível.

Observação de pedido:
- seção própria;
- nunca deve parecer observação de item.

## 6. Dependências da Cozinha — HOT / EBITEN / SHISO

Hoje essas necessidades são solicitadas manualmente pela equipe. O objetivo futuro é a Cozinha receber uma visão automática e simples.

O sistema precisa separar:
- incremento causado por um novo pedido;
- total solicitado em uma janela;
- total ainda pendente.

`VENDIDO != SOLICITADO != PRODUZIDO != PENDENTE`.

Enquanto o ciclo de baixa/produção não estiver provado, a interface não pode chamar um número de "faltando" ou "pendente". Pode mostrar, por exemplo:

```
SOLICITADO DESDE 19:30
HOT      12
EBITEN    5
SHISO     3
```

Só usar "PENDENTE" quando existir sinal confiável de baixa/produção.

A regra item -> quantidade de HOT/EBITEN/SHISO ainda precisa ser provada. Não inferir pelo nome do produto sem validação operacional.

## 7. Exemplo lógico — Sushi

```
================================
       DELIVERY SUSHI 2
================================
TATÁ 037                  19:42
TEKNISA 18452
IFOOD A1B2C3

      MONTAR NA CX 750

2x URAMAKI SALMÃO
!!! OBS: SEM CEBOLINHA !!!

1x FUTOMAKI

--------------------------------
      MONTAR NA CX 450

1x TEMAKI ATUM
!!! OBS: MOLHO SEPARADO !!!

□ FINALIZADO
```

## 8. Exemplo lógico — Cozinha

```
================================
            COZINHA
================================
TATÁ 037                  19:42
TEKNISA 18452
IFOOD A1B2C3

4x HOT
2x EBITEN
1x SHISO

2x GUIOZA
!!! OBS: SEM CEBOLINHA !!!

□ PRODUZIDO
```

Os números HOT/EBITEN/SHISO do exemplo são ilustrativos, não regra operacional.

## 9. Effect boundary

Esta especificação não autoriza:
- impressão física;
- alteração de Odhen/Periféricos;
- instalação de watcher/serviço;
- troca de rota de impressão;
- cutover;
- merge do PR #11.

Implementação de conteúdo/preview sintético é reversível e permitida dentro do branch de preparação.
