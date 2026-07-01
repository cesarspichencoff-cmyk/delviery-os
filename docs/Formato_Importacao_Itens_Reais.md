# Formato de Importação — Itens Reais de Uma Noite (modo ponte)

> Enquanto a integração definitiva não existe, **uma noite real exportada à mão já valida o motor**.
> Qualquer origem serve (portal iFood, comandas, planilha do caixa) — desde que caia num destes dois formatos.

## Formato CSV (recomendado — dá pra montar até no Excel/Notas)

Cabeçalho obrigatório + uma linha por item do pedido:

```csv
pedido_id,item_nome,quantidade,observacao,horario
A1,Combinado Especial Sushi 2 pessoas,1,,20:12
A1,Coca-Cola Lata 350ml,2,,20:12
A5,Combinado Tradicional Sushi 2 pessoas,1,"sem cebolinha, caprichar no wasabi",22:05
```

Regras:
- **pedido_id** = o ID CURTO do iFood (o mesmo do relatório de pedidos — é o que casa com o timing real);
- **item_nome** = nome como está no cardápio/comanda (não precisa ser exato: o motor casa por aproximação contra o seed de 199 itens e **reporta o que não casou** — nunca inventa);
- **quantidade** = inteiro (vazio → 1);
- **observacao** = texto livre do cliente (com vírgula? põe entre aspas);
- **horario** = HH:MM (opcional; útil para conferir contra o relatório).

## Formato JSON (equivalente)

```json
{
  "A1": [
    { "item_nome": "Combinado Especial Sushi 2 pessoas", "quantidade": 1 },
    { "item_nome": "Coca-Cola Lata 350ml", "quantidade": 2 }
  ],
  "A5": [
    { "item_nome": "Combinado Tradicional Sushi 2 pessoas", "quantidade": 1,
      "observacao": "sem cebolinha, caprichar no wasabi", "horario": "22:05" }
  ]
}
```
(Também aceita array plano de linhas com `pedido_id` em cada uma.)

## Como o motor consome (já implementado)

```js
const FONTE = MOTOR.makeFonteItensFromCsv(csvTexto, SEED);   // ou makeFonteItensFromJson(objeto, SEED)
FONTE.stats      // { linhas, casados, naoCasados, pedidos }
FONTE.unmatched  // nomes que não casaram com o seed (para corrigir grafia OU cadastrar item novo)
FONTE("A5")      // → itens adaptados do pedido A5 (mesmo contrato da fonte sintética)
```

- Item que não casa com o seed vira `?desconhecido` em `montagem_outros` e **aparece no relatório de não-casados** — honestidade em vez de invenção.
- Prova executável: `node tools/teste_fonte_real.js` (5 pedidos reais de exemplo em `data/exemplo_noite_real.csv` — 16/16 casados).

## O que uma noite real destrava para teste

praça real por pedido · item dominante · pedido fechável (praça única) · 2 sacolas · bebida · sobremesa · kit · **observação especial** (sobe no foco de conferência) · combinado segurando fluxo · enrolados_quentes carregando · duplas saturando · quentes real · conferência reforçada.

O que **não** destrava (precisa de mais noites ou KDS): baseline calibrado, pico de saída por item, pronto-por-praça.
