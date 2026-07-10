# Parser de Comanda (Tecnisa/Odhen) — V1

> Estratégia de parsing. **Nenhum código foi implementado nesta missão.** Depende da
> `docs/Auditoria_Fonte_Viva_Loja_V1.md` (fonte real ainda não confirmada) e da
> `docs/Arquitetura_Sincronizacao_Local_V1.md` (onde este parser se encaixa). Os campos e o exemplo
> de JSON abaixo são baseados na estrutura real observada em 3 comprovantes impressos fotografados
> ("Relatório de Entrega"), **com todos os dados pessoais substituídos por valores fictícios** — só
> a forma dos campos é fiel ao que foi fotografado, nenhum dado real de cliente está reproduzido aqui.

---

## 1. Campos detectáveis no documento observado ("Relatório de Entrega")

| Campo no papel | O que é | Confiável? |
|---|---|---|
| `Operador` | Código do operador de caixa | Sim, sempre presente |
| `Entregador` | Código + nome/zona da equipe de entrega (ex.: "3004 - DELIVERY ITAIM") | Sim |
| `Emissão` | Data e hora de emissão do documento | Sim |
| `Pedido` | Número sequencial interno do Odhen/Teknisa (10 dígitos, `0000NNNNNN`) | Sim — aparece 2× no documento (topo e rodapé) |
| `Agendamento` | Data/hora se o pedido for agendado | Presente mas vazio nos exemplos vistos |
| `IFOOD......` | Código curto do iFood (o mesmo "ID CURTO DO PEDIDO" que já usamos nos dados históricos) | Sim — aparece 2× |
| `Consumidor` | Nome do cliente | Sim |
| `Tel. Consumidor` | Telefone — nos exemplos vistos, é um número institucional/proxy do iFood (ex.: 0800), não o celular real | Presente, mas provavelmente não é o telefone real do cliente |
| `Origem` | Ex.: "iFood" | Sim |
| Bloco de endereço (`Quadrante`, rua/número/complemento, bairro, CEP, cidade) | Endereço de entrega | Sim, mas **desnecessário para a operação interna** (praça/sacola/foco não dependem de endereço) |
| `Referência` | Ponto de referência do endereço | Presente, às vezes vazio |
| `OBS.` | Nos exemplos vistos: dado de pagamento (valor, ID de transação, código de cancelamento) | **Atenção:** não confirmado se observações do prato (ex.: "sem cebola", alergia) aparecem neste mesmo campo ou em outro lugar — ver Pendências |
| `Formas de Pagamento` + valor | Forma e valor pago | Sim, mas só necessário se for usado puramente como conferência, nunca para decisão operacional |
| `Produtos Vendidos` | Lista: nome do item, quantidade, preço unitário, subtotal | Sim |
| `TOTAL` | Valor total do pedido | Sim, uso só de conferência |

## 2. Estrutura da comanda (confirmado pelo César)

**A comanda é única.** Cozinha, sushi, quentes, sobremesa e demais itens do pedido saem todos
juntos no mesmo "Relatório de Entrega" — **não existe comanda de produção separada por praça** nesta
operação. Isso simplifica o parser: só existe um formato a interpretar, e o agrupamento por praça
(quando precisar) é feito depois, pelo motor (`MOTOR.resolver`), casando cada item do texto com o
seed — não pela estrutura do papel.

**Cancelamento não deve ser lido da comanda.** Confirmado pelo César: o status de cancelado aparece
no Gestor de Pedidos do iFood, não na comanda impressa. O parser da comanda **nunca deve inferir
cancelamento** — esse dado vem da outra fonte (ver `docs/Arquitetura_Sincronizacao_Local_V1.md`).

**Camada de correção manual — limitação permanente, não um "ainda incerto":** uma das comandas
fotografadas tinha 2 itens riscados à caneta com a anotação "não foi". **Confirmado pelo César: essa
correção não aparece no iFood, fica só no papel.** Isso não é uma lacuna a fechar com uma fonte
melhor — é uma **limitação declarada da V1**: o parser nunca deve presumir que o texto impresso é o
estado final do pedido, e o DeliveryOS deve comunicar essa limitação (ex.: "correção manual pode não
estar refletida") em vez de fingir certeza sobre o conteúdo exato da sacola.

**Reimpressão existe, mas é rara** (confirmado pelo César) — o parser ainda precisa de
deduplicação (mesmo `pedido_interno` impresso de novo não deve virar um segundo pedido), mas não é
o cenário mais comum a otimizar primeiro.

## 3. Exemplo de pedido estruturado (JSON conceitual — dados fictícios)

```json
{
  "fonte": "odhen_teknisa_relatorio_entrega",
  "origem": "ifood",
  "sequencia": "0724",
  "ifood": "0724",
  "pedido_interno": "0000170512",
  "emissao": "2026-07-07T13:05:00",
  "operador": "000000003004",
  "entregador": "3004 - DELIVERY ITAIM",
  "cliente": "Nome do Cliente",
  "itens": [
    { "nome": "Combinado Executivo Sushi Salmão", "quantidade": 1, "observacao": null },
    { "nome": "Uramaki Ebiten Especial", "quantidade": 1, "observacao": null }
  ],
  "observacoes_pedido": [],
  "operacional": {
    "pracas": [],
    "duas_sacolas": null,
    "so_quente": null,
    "so_sobremesa": null
  },
  "incerto": {
    "observacao_do_prato_capturada": false,
    "pode_ter_sido_corrigido_a_mao": null
  }
}
```

Notas sobre este exemplo:
- `sequencia` e `ifood` estão iguais no exemplo porque, nos comprovantes fotografados, os dois
  números observados coincidiam nos casos vistos — **não está confirmado que são sempre iguais**;
  segue como incerto (ver §6).
- Os campos `operacional.*` ficam `null` de propósito — são o resultado que **o motor real**
  (`motor.js`/`decisao.js`, via `MOTOR.resolver`) calcularia depois de casar os itens com o seed;
  o parser não decide nada, só entrega itens e metadados brutos.
- `incerto.observacao_do_prato_capturada` existe para deixar explícito quando o parser não tem
  certeza se captou uma observação real do cliente sobre o prato (ex.: alergia) — nunca fingir que
  "sem observação" significa "não há risco".

## 4. Estratégia de parsing

- **Baseado em linha/campo fixo**, no mesmo espírito de `src/ingest/parserRelatorioIfood.js` (já
  existente no repo) — não é NLP, é reconhecimento de rótulos fixos (`Pedido:`, `IFOOD......:`,
  `Consumidor:`, etc.) seguidos do valor.
- Cada item de `Produtos Vendidos` é uma linha com padrão `NOME \n QTD UN X PRECO_UNITARIO
  VALOR_SUBTOTAL` — parsing por regex de 2 linhas por item.
- **Casamento com o seed** usa a mesma função já existente (`MOTOR.matchSeed`,
  `MOTOR.makeFonteItensFromRows`) — nenhuma lógica nova de casamento de nome, reaproveita o que já
  existe e já foi validado (100% de casamento nas janelas reais de 01/07 e 23/06).

## 5. O que é confiável

- Sequência, IFOOD, pedido interno, emissão, itens (nome + quantidade) — todos observados
  diretamente na estrutura real do documento.
- Casamento de nome de item com o seed — já provado confiável (100% nas janelas reais existentes).

## 6. O que é incerto

- Se `OBS.` sempre carrega dado de pagamento, ou se às vezes carrega observação do prato também.
- Se a sequência interna e o código do iFood são sempre visualmente idênticos ou só coincidem às
  vezes.
- Se existe algum campo na comanda que diferencie a via original de uma reimpressão (número de via,
  marca de "cópia") — reimpressão existe (confirmado), mas o parser ainda não sabe como reconhecê-la
  no papel.

**Resolvido nesta rodada (não é mais incerto):** não existe comanda de produção separada por praça
(§2); pedidos cancelados **não** devem ser lidos pela comanda — o status vem do Gestor de Pedidos do
iFood.

## 7. Como tratar variações de impressão

- **Layout pode variar** por tipo de pedido (agendado, retirada) — o parser deve ser tolerante a
  campos ausentes (nunca falhar o pedido inteiro por um campo faltando; registrar "campo ausente",
  nunca inventar).
- **Correção manual à caneta não é detectável** por parsing de texto puro (é tinta sobre papel, não
  texto digital) — **e confirmado que também não aparece no iFood**. Não há hoje nenhuma fonte
  digital que capture essa correção; é uma limitação permanente da V1 (ver §2), não algo que uma
  fonte melhor resolveria automaticamente.
- **Reimpressões** — confirmado que acontecem, mas são raras. O parser precisa de uma forma de
  identificar duplicata (mesmo `pedido_interno` + mesma `emissao` é o critério mais simples e
  disponível hoje, já que não está confirmado se existe número de via/cópia no documento).

## 8. Como evitar OCR se houver fonte melhor

OCR só entra em cena se as opções 1, 2 e 6 da Auditoria forem todas inviáveis — é o último recurso
porque (a) exige um passo físico extra (fotografar cada comanda), (b) não consegue ler correções
manuais à caneta com confiança, e (c) tem taxa de erro inerente a caracteres de impressora térmica.
Se qualquer captura digital (banco, spool, ou mesmo o Gestor iFood no navegador) estiver disponível,
ela sempre vence o OCR em confiabilidade e velocidade.
