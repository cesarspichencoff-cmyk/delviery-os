# Reader V3 × Gestor iFood — conciliação real e a fonte local do Gestor (15/11/2026)

Medido no CAIXA_MOOCA, com o caixa ocioso e o Gestor de Pedidos aberto, **sem tocar no aplicativo**:
sem janela, sem clique, sem DevTools, sem API, sem token. Tudo rodou no caixa; só agregados e
identificadores opacos (HMAC com sal que fica no caixa) saíram. O detalhe por pedido está em
`C:\Users\Tata\DeliveryOS-Ensaio\conciliacao\detalhe-*.json` no próprio caixa.

## 1. Onde o Gestor guarda os pedidos

O Gestor de Pedidos (Electron, `C:\Program Files (x86)\Gestor de Pedidos`) roda sem depuração
remota, e a acessibilidade do Windows não expõe os pedidos. Mas ele grava em
`%APPDATA%\Gestor de Pedidos\Local Storage\leveldb`:

- `order/<uuid>`: o pedido inteiro. Inclui itens com `externalCode`, opções com `groupName`, a
  observação por item, `shortReference`, os horários (`createdAt`, `preparationStartDateTime`,
  `preparationTimeInSeconds`, `deliveryDateTime`) e a **linha do tempo oficial**. Os eventos são
  PLACED, CONFIRMED, CHANGE_PREPARATION_TIME, READY_TO_PICKUP, ASSIGN_DRIVER, GOING_TO_ORIGIN,
  ARRIVED_AT_ORIGIN, COLLECTED, DISPATCHED, ARRIVED_AT_DESTINATION,
  DELIVERY_DROP_CODE_VALIDATION_SUCCESS e CONCLUDED.
- `orderIds`: 267 UUIDs, sem detalhe e sem data.
- **É uma janela móvel**: 25 pedidos na primeira leitura e 23 na seguinte, todos de 14/11 entre 21h e
  23h. Não é o histórico do dia.
- A mesma pasta guarda o token do usuário (`user/singleton`). O leitor nunca decodifica essa chave.

Também não servem como fonte de pedido: o Session Storage, que tem só feature flags, e o cache HTTP,
que guarda chat, entregador e imagens, sem nenhuma resposta de pedido. A documentação oficial do iFood
para desenvolvedores recusou a leitura automatizada (HTTP 403). A semântica dos estados abaixo vem dos
eventos que o próprio Gestor grava; o manual **não foi lido**.

## 2. Conciliação dos 23 pedidos (janela de 68 min, fim de 14/11)

A identidade nunca é só o código curto. O par exige o mesmo `shortReference`, a comanda aberta na
Teknisa perto do PLACED, origem `DLV_IFO`, e os itens para desempatar.

| Classe | n |
|---|---|
| Correspondência comprovada (itens e quantidades idênticos) | **22** (17 com 2–3 revisões no Reader) |
| Presente só no Gestor | **1** (delivery, 22h; nenhum evento do Reader com o código ou com o mesmo conjunto de itens a ±20 min) |
| Presente só no Reader, dentro da janela | 4: não verificável pelo Gestor local, que guarda só os recentes |
| Identidade ambígua | 0 (22 de 22 com candidato único) |
| Item ou quantidade divergente | 0 |
| Observação divergente | 0 (5 de 5 observações de item do iFood achadas no texto lido da Teknisa) |
| Complemento não observado na Teknisa | 2 pedidos: opção com código `99\|99` sem linha no Reader (camada 2) |
| Estado | 21 com Gestor `CONCLUDED` e Teknisa `P`; 1 retirada com Teknisa `X`. X não é cancelamento aqui |

**Achado que muda o código:** o `externalCode` do iFood é o **`CDARVPROD`** da Teknisa, não o
`CDPRODUTO`. Foram 41 códigos do iFood, cada um com um único `CDARVPROD`; o casamento por nome bateu
em 64 de 67 itens com a mesma quantidade. Por isso `ItemReal` ganhou `codigo_arvore`.

**Tempos** (mediana · p90 · máximo, em minutos):

| Medida | Mediana | p90 | Máximo |
|---|---|---|---|
| Comanda na Teknisa depois do PLACED | 0,74 | 1,07 | 3,01 |
| Primeira revisão estável do Reader depois do PLACED | 1,79 | 2,52 | 4,50 |
| Pronto depois do aceite | 15,2 | 17,0 | 30,8 |
| Coleta depois do pronto | 1,0 | 3,9 | 48,7 |

Daí os limiares: identidade a até 10 min, e "sem comanda na Teknisa" só depois de 6 min.

**Cobertura:** nem a Teknisa nem o Gestor local dão o denominador do dia. Contra os 313 pedidos de
14/11 do Reader, só a janela de 68 min foi conciliada. A conciliação do dia inteiro exige a observação
ao vivo, com o leitor rodando durante o serviço, ou o histórico do Gestor pela interface, que não é
lido de forma passiva.

## 3. O que foi para o produto

- `src/platform/leitura/leveldb-somente-leitura.ts`: lê tabela e diário do LevelDB sem abrir o banco.
  Remoção respeitada; lote truncado é descartado inteiro.
- `src/platform/leitura/pedidos-do-gestor-local.ts`: só `order/<uuid>` e `orderIds` da origem do
  Gestor. Projeta só campos operacionais: cliente, pagamento, valores, localizador, código de retirada,
  entregador e nota de entrega nunca saem (a nota vira booleano).
- `src/platform/leitura/conciliacao-gestor-teknisa.ts`: função pura com as classes da tabela acima,
  mais `aguardando_teknisa`.
- `src/product/viewmodels/home-operacao-ifood-vm.ts` e o bloco **"pedidos no ifood"** da Home:
  - a etapa oficial;
  - o preparo comparado ao tempo **informado ao iFood** (fato contra fato);
  - a situação na Teknisa;
  - atenção só para pedido em andamento: sem comanda depois de 6 min, item divergente, observação ou
    complemento a conferir, preparo acima do informado, cancelado no iFood com comanda.
- Ligação: `DELIVERYOS_GESTOR_LOCAL_DIR`. O lançador do laboratório aponta para `%APPDATA%\Gestor de
  Pedidos`.
- Prova: `run-gestor-local-tests.ts` **12/12** (LevelDB real de fixture, canários de dado pessoal,
  HTTP pelo servidor de `dist/`) e `tools/mutantes-gestor-local.cjs` **5/5 mortos**.

## 4. O que não está provado

- A leitura com o Gestor **em serviço**: pedidos em andamento, categorias que não sejam `CONCLUDED`,
  cancelamento e revisão de item. Nada disso foi observado hoje: a loja estava fechada.
- Se `preparationTimeInSeconds` já inclui o `CHANGE_PREPARATION_TIME`.
- A causa do pedido presente só no Gestor: integração ou Reader.
- Componentes e complementos na Teknisa (camada 2), cobertura do dia inteiro e aceite do César.
