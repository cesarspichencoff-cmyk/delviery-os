# Separação de canais e unidades

Regras invariantes:

- `dining_room`, `ifood` e `own_delivery` são catálogos distintos;
- unidade, período e tamanho participam da identidade da variante;
- preço, composição e disponibilidade nunca atravessam canal silenciosamente;
- diferença material na mesma variante abre conflito;
- comparação retorna todas as fontes e não escolhe vencedor automaticamente.

O painel demonstra a mesma identidade sintética com preço de salão e iFood
separados. Filtros exigem canal e unidade para recomendação. Disponibilidade
`unknown`, `stale` ou `unavailable` não entra no conjunto recomendável.
